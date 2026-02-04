"""
Async background tasks for processing CSV file uploads.
"""
import asyncio
import logging
from typing import Dict, Any, Optional
from pathlib import Path
from datetime import datetime
from django.db import transaction
from django.utils import timezone
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from datasets.models import Dataset, UploadTask
from core.csv_processor import (
    parse_csv,
    validate_node_csv,
    validate_relationship_csv,
    CSVProcessingError
)
from core.neo4j_client import neo4j_client

logger = logging.getLogger(__name__)


def get_task_channel_name(task_id: int) -> str:
    """Get WebSocket channel name for a task."""
    return f"task_{task_id}"


async def send_task_update(task_id: int, update_type: str, data: Dict[str, Any]) -> None:
    """
    Send task update via WebSocket.
    
    Args:
        task_id: Task ID
        update_type: Type of update (progress, status, error)
        data: Update data
    """
    try:
        channel_layer = get_channel_layer()
        if channel_layer:
            channel_name = get_task_channel_name(task_id)
            await channel_layer.group_send(
                channel_name,
                {
                    'type': 'task_update',
                    'task_id': task_id,
                    'update_type': update_type,
                    'data': data,
                    'timestamp': datetime.now().isoformat(),
                }
            )
    except Exception as e:
        logger.error(f"Failed to send task update for task {task_id}: {e}")


async def update_dataset_status(dataset_id: int) -> None:
    """
    Update dataset status based on all its tasks.
    
    Args:
        dataset_id: Dataset ID
    """
    try:
        dataset = await Dataset.objects.aget(id=dataset_id)
        # Use async queryset to get tasks
        tasks = []
        async for task in UploadTask.objects.filter(dataset_id=dataset_id):
            tasks.append(task)
        
        # Count completed and failed tasks
        completed_count = sum(1 for task in tasks if task.status == 'completed')
        failed_count = sum(1 for task in tasks if task.status == 'failed')
        processing_count = sum(1 for task in tasks if task.status == 'processing')
        pending_count = sum(1 for task in tasks if task.status == 'pending')
        
        # Update processed_files
        dataset.processed_files = completed_count + failed_count
        
        # Update dataset status based on task statuses
        if failed_count > 0:
            dataset.status = 'failed'
        elif processing_count > 0 or pending_count > 0:
            dataset.status = 'processing'
        elif completed_count == len(tasks) and len(tasks) > 0:
            dataset.status = 'completed'
        else:
            dataset.status = 'pending'
        
        await dataset.asave(update_fields=['status', 'processed_files', 'updated_at'])
        logger.info(f"Dataset {dataset_id} status updated: {dataset.status}, processed_files: {dataset.processed_files}/{dataset.total_files}")
        
    except Exception as e:
        logger.error(f"Failed to update dataset status for dataset {dataset_id}: {e}")


async def process_node_csv_task(task_id: int) -> None:
    """
    Process a node CSV file upload task.
    
    Args:
        task_id: UploadTask ID
    """
    try:
        # Get task from database
        task = await UploadTask.objects.aget(id=task_id)
        
        # Mark task as started
        task.status = 'processing'
        task.started_at = timezone.now()
        await task.asave(update_fields=['status', 'started_at', 'updated_at'])
        
        # Update dataset status to processing
        await update_dataset_status(task.dataset_id)
        
        await send_task_update(task_id, 'status', {
            'status': 'processing',
            'message': 'Task started',
            'percentage': task.progress_percentage or 0
        })
        
        # Validate CSV file
        await send_task_update(task_id, 'progress', {'message': 'Validating CSV file...', 'percentage': 5})
        is_valid, errors, warnings = validate_node_csv(task.file_path, task.node_label)
        
        if not is_valid:
            # Format errors for better readability
            if len(errors) == 1:
                error_msg = errors[0]
            else:
                error_msg = f"Found {len(errors)} issues:\n" + "\n".join(f"• {error}" for error in errors)
            task.status = 'failed'
            task.error_message = error_msg
            task.error_details = {'errors': errors, 'warnings': warnings}
            task.completed_at = timezone.now()
            await task.asave(update_fields=['status', 'error_message', 'error_details', 'completed_at', 'updated_at'])
            
            # Update dataset status
            await update_dataset_status(task.dataset_id)
            
            await send_task_update(task_id, 'error', {'message': error_msg, 'errors': errors})
            return
        
        # Parse CSV file
        await send_task_update(task_id, 'progress', {'message': 'Parsing CSV file...', 'percentage': 10})
        data, metadata = parse_csv(task.file_path)
        
        if not data:
            task.status = 'failed'
            task.error_message = 'CSV file contains no data'
            task.completed_at = timezone.now()
            await task.asave(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
            
            # Update dataset status
            await update_dataset_status(task.dataset_id)
            
            await send_task_update(task_id, 'error', {'message': 'CSV file contains no data'})
            return
        
        # Update task with total rows
        task.total_rows = len(data)
        await task.asave(update_fields=['total_rows'])
        
        # Determine ID column - must be exactly 'id' (case-insensitive)
        id_column = None
        for col in ['id', 'ID', 'Id']:
            if col in metadata['columns']:
                id_column = col
                break
        
        if not id_column:
            task.status = 'failed'
            task.error_message = "Missing required column: 'id'"
            task.completed_at = timezone.now()
            await task.asave(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
            
            # Update dataset status
            await update_dataset_status(task.dataset_id)
            
            await send_task_update(task_id, 'error', {'message': "Missing required 'id' column in CSV file"})
            return
        
        # Process nodes in batches
        batch_size = 100
        total_batches = (len(data) + batch_size - 1) // batch_size
        nodes_created = 0
        
        for batch_num in range(total_batches):
            start_idx = batch_num * batch_size
            end_idx = min(start_idx + batch_size, len(data))
            batch = data[start_idx:end_idx]
            
            # Prepare nodes for Neo4j
            neo4j_nodes = []
            for row in batch:
                node_props = {}
                for key, value in row.items():
                    # Convert value based on detected type
                    data_type = metadata['data_types'].get(key, 'string')
                    if value is not None:
                        # Always convert ID column to integer
                        if key == id_column:
                            try:
                                node_props[key] = int(value)
                            except (ValueError, TypeError):
                                node_props[key] = value
                        # Basic type conversion for other fields
                        elif data_type == 'integer' and value:
                            try:
                                node_props[key] = int(value)
                            except (ValueError, TypeError):
                                node_props[key] = value
                        elif data_type == 'float' and value:
                            try:
                                node_props[key] = float(value)
                            except (ValueError, TypeError):
                                node_props[key] = value
                        elif data_type == 'boolean' and value:
                            node_props[key] = str(value).lower() in ['true', '1', 'yes']
                        else:
                            node_props[key] = value
                    else:
                        node_props[key] = None
                
                # Add dataset_id to track which dataset this node belongs to
                node_props['dataset_id'] = task.dataset_id
                
                neo4j_nodes.append(node_props)
            
            # Create nodes in Neo4j
            try:
                created_count = await neo4j_client.create_nodes_batch(
                    label=task.node_label or 'Node',
                    nodes=neo4j_nodes,
                    unique_id=id_column,
                    batch_size=batch_size
                )
                nodes_created += created_count
                
                # Update progress
                processed = end_idx
                percentage = int(10 + (processed / len(data)) * 80)  # 10-90%
                task.processed_rows = processed
                task.total_rows = len(data)
                if len(data) > 0:
                    task.progress_percentage = (processed / len(data)) * 100
                await task.asave(update_fields=['processed_rows', 'total_rows', 'progress_percentage', 'updated_at'])
                await send_task_update(
                    task_id,
                    'progress',
                    {
                        'message': f'Processing batch {batch_num + 1}/{total_batches}',
                        'percentage': percentage,
                        'processed': processed,
                        'total': len(data)
                    }
                )
                
            except Exception as e:
                logger.error(f"Error creating nodes in batch {batch_num + 1}: {e}")
                task.status = 'failed'
                task.error_message = f"Error processing batch {batch_num + 1}: {str(e)}"
                task.completed_at = timezone.now()
                await task.asave(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
                
                # Update dataset status
                await update_dataset_status(task.dataset_id)
                
                await send_task_update(task_id, 'error', {'message': str(e)})
                return
        
        # Mark task as completed
        task.status = 'completed'
        task.completed_at = timezone.now()
        if task.total_rows > 0:
            task.progress_percentage = 100.0
        await task.asave(update_fields=['status', 'completed_at', 'progress_percentage', 'updated_at'])
        
        # Update dataset node count
        dataset = await Dataset.objects.aget(id=task.dataset_id)
        dataset.total_nodes += nodes_created
        await dataset.asave(update_fields=['total_nodes', 'updated_at'])
        
        # Update dataset status
        await update_dataset_status(task.dataset_id)
        
        await send_task_update(
            task_id,
            'status',
            {
                'status': 'completed',
                'message': f'Successfully created {nodes_created} nodes',
                'nodes_created': nodes_created,
                'percentage': 100
            }
        )
        
        logger.info(f"Task {task_id} completed: {nodes_created} nodes created")
        
    except Exception as e:
        logger.error(f"Task {task_id} failed: {e}", exc_info=True)
        try:
            task = await UploadTask.objects.aget(id=task_id)
            task.status = 'failed'
            task.error_message = str(e)
            task.error_details = {'exception': str(e)}
            task.completed_at = timezone.now()
            await task.asave(update_fields=['status', 'error_message', 'error_details', 'completed_at', 'updated_at'])
            
            # Update dataset status
            await update_dataset_status(task.dataset_id)
            
            await send_task_update(task_id, 'error', {'message': str(e)})
        except Exception as db_error:
            logger.error(f"Failed to update task status: {db_error}")


async def process_relationship_csv_task(task_id: int) -> None:
    """
    Process a relationship CSV file upload task.
    
    Args:
        task_id: UploadTask ID
    """
    try:
        # Get task from database
        task = await UploadTask.objects.aget(id=task_id)
        
        # Mark task as started
        task.status = 'processing'
        task.started_at = timezone.now()
        await task.asave(update_fields=['status', 'started_at', 'updated_at'])
        
        # Update dataset status to processing
        await update_dataset_status(task.dataset_id)
        
        await send_task_update(task_id, 'status', {
            'status': 'processing',
            'message': 'Task started',
            'percentage': task.progress_percentage or 0
        })
        
        # Validate CSV file
        await send_task_update(task_id, 'progress', {'message': 'Validating CSV file...', 'percentage': 5})
        is_valid, errors, warnings = validate_relationship_csv(
            task.file_path,
            task.relationship_type
        )
        
        if not is_valid:
            # Format errors for better readability - keep it short
            if len(errors) == 1:
                error_msg = errors[0]
            else:
                error_msg = f"{len(errors)} issues: " + "; ".join(errors[:3]) + ("..." if len(errors) > 3 else "")
            task.status = 'failed'
            task.error_message = error_msg
            task.error_details = {'errors': errors, 'warnings': warnings}
            task.completed_at = timezone.now()
            await task.asave(update_fields=['status', 'error_message', 'error_details', 'completed_at', 'updated_at'])
            
            # Update dataset status
            await update_dataset_status(task.dataset_id)
            
            await send_task_update(task_id, 'error', {'message': error_msg, 'errors': errors})
            return
        
        # Parse CSV file
        await send_task_update(task_id, 'progress', {'message': 'Parsing CSV file...', 'percentage': 10})
        data, metadata = parse_csv(task.file_path)
        
        if not data:
            task.status = 'failed'
            task.error_message = 'Empty file'
            task.completed_at = timezone.now()
            await task.asave(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
            
            # Update dataset status
            await update_dataset_status(task.dataset_id)
            
            await send_task_update(task_id, 'error', {'message': 'CSV file contains no data'})
            return
        
        # Update task with total rows
        task.total_rows = len(data)
        await task.asave(update_fields=['total_rows'])
        
        # Get source and target labels from dataset's node tasks
        dataset = await Dataset.objects.aget(id=task.dataset_id)
        
        # Get all node labels from node tasks in this dataset (including processing ones)
        # This ensures we can find labels even if tasks are still processing
        # Use async queryset to filter node tasks
        node_labels = []
        async for node_task in UploadTask.objects.filter(dataset_id=task.dataset_id, file_type='node'):
            if node_task.node_label:
                node_labels.append(node_task.node_label)
        
        # If no node labels found from tasks, try to find any node labels in Neo4j
        if not node_labels:
            try:
                schema = await neo4j_client.get_schema()
                node_labels = schema.get('node_labels', [])
                logger.info(f"Found {len(node_labels)} node labels from Neo4j schema")
            except Exception as e:
                logger.warning(f"Could not get schema from Neo4j: {e}")
        
        # Default to 'Node' if still no labels found
        if not node_labels:
            node_labels = ['Node']
            logger.warning("No node labels found, defaulting to 'Node'")
        
        # For relationships, try to match source_id and target_id to nodes
        # We'll try all node labels and use the first one that works
        # In a more sophisticated implementation, we'd determine this from the data
        source_label = node_labels[0]  # Use first available label
        target_label = node_labels[0]  # Use first available label
        
        # If we have multiple labels, we could be smarter, but for now use the first one
        logger.info(f"Processing relationship file '{task.file_name}' with type '{task.relationship_type}'")
        logger.info(f"Using node labels: source={source_label}, target={target_label}")
        logger.info(f"Found {len(data)} relationship rows to process")
        
        
        # Process relationships in batches
        batch_size = 100
        total_batches = (len(data) + batch_size - 1) // batch_size
        relationships_created = 0
        
        for batch_num in range(total_batches):
            start_idx = batch_num * batch_size
            end_idx = min(start_idx + batch_size, len(data))
            batch = data[start_idx:end_idx]
            
            # Prepare relationships for Neo4j
            neo4j_rels = []
            for row in batch:
                # Find source_id and target_id columns (case-insensitive)
                source_id = None
                target_id = None
                for key, value in row.items():
                    key_lower = key.lower().strip()
                    if key_lower == 'source_id':
                        source_id = value
                    elif key_lower == 'target_id':
                        target_id = value
                
                if not source_id or not target_id:
                    logger.warning(f"Row missing source_id or target_id: {row}")
                    continue
                
                # Convert IDs to integers if they're numeric (to match node IDs)
                try:
                    source_id = int(source_id) if str(source_id).isdigit() else source_id
                    target_id = int(target_id) if str(target_id).isdigit() else target_id
                except (ValueError, TypeError):
                    # Keep as string if conversion fails
                    pass
                
                rel_data = {
                    'source_id': source_id,
                    'target_id': target_id,
                    'properties': {}
                }
                
                # Add other properties (excluding source_id and target_id in any case)
                for key, value in row.items():
                    key_lower = key.lower().strip()
                    if key_lower not in ['source_id', 'target_id']:
                        rel_data['properties'][key] = value
                
                # Add dataset_id to relationship properties to track which dataset it belongs to
                rel_data['properties']['dataset_id'] = task.dataset_id
                
                neo4j_rels.append(rel_data)
            
            # Create relationships in Neo4j
            try:
                created_count = await neo4j_client.create_relationships_batch(
                    source_label=source_label,
                    source_id_key='id',
                    target_label=target_label,
                    target_id_key='id',
                    relationship_type=task.relationship_type or 'RELATED_TO',
                    relationships=neo4j_rels,
                    batch_size=batch_size
                )
                
                logger.info(f"Batch {batch_num + 1}: Created {created_count} relationships (expected {len(batch)})")
                relationships_created += created_count
                
                # If fewer relationships created than expected, log detailed warning
                if created_count < len(batch):
                    logger.warning(
                        f"Batch {batch_num + 1}: Only {created_count}/{len(batch)} relationships created. "
                        f"This might indicate missing source or target nodes with label '{source_label}' or '{target_label}'. "
                        f"Relationship type: '{task.relationship_type}'"
                    )
                    # Log sample source/target IDs for debugging
                    sample_ids = [(r.get('source_id'), r.get('target_id')) for r in neo4j_rels[:3]]
                    logger.warning(f"Sample source_id/target_id pairs: {sample_ids}")
                
                # Update progress
                processed = end_idx
                percentage = int(10 + (processed / len(data)) * 80)  # 10-90%
                task.processed_rows = processed
                task.total_rows = len(data)
                if len(data) > 0:
                    task.progress_percentage = (processed / len(data)) * 100
                await task.asave(update_fields=['processed_rows', 'total_rows', 'progress_percentage', 'updated_at'])
                await send_task_update(
                    task_id,
                    'progress',
                    {
                        'message': f'Processing batch {batch_num + 1}/{total_batches}',
                        'percentage': percentage,
                        'processed': processed,
                        'total': len(data)
                    }
                )
                
            except Exception as e:
                logger.error(f"Error creating relationships in batch {batch_num + 1}: {e}")
                task.status = 'failed'
                task.error_message = f"Error processing batch {batch_num + 1}: {str(e)}"
                task.completed_at = timezone.now()
                await task.asave(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
                
                # Update dataset status
                await update_dataset_status(task.dataset_id)
                
                await send_task_update(task_id, 'error', {'message': str(e)})
                return
        
        # Mark task as completed
        task.status = 'completed'
        task.completed_at = timezone.now()
        if task.total_rows > 0:
            task.progress_percentage = 100.0
        await task.asave(update_fields=['status', 'completed_at', 'progress_percentage', 'updated_at'])
        
        # Update dataset relationship count - verify from Neo4j for accuracy
        dataset = await Dataset.objects.aget(id=task.dataset_id)
        
        # Verify actual count from Neo4j
        try:
            if task.relationship_type:
                rel_type_escaped = f"`{task.relationship_type}`" if not task.relationship_type.replace('_', '').isalnum() else task.relationship_type
                verify_query = f"MATCH ()-[r:{rel_type_escaped}]->() WHERE r.dataset_id = $dataset_id RETURN count(r) as count"
                verify_result = await neo4j_client.execute_query(verify_query, {'dataset_id': task.dataset_id})
                actual_count = verify_result[0]['count'] if verify_result and len(verify_result) > 0 else 0
                
                logger.info(f"Task {task_id}: Created {relationships_created} relationships, Neo4j count for '{task.relationship_type}': {actual_count}")
                
                # Update to actual count from Neo4j (more accurate)
                dataset.total_relationships = actual_count
            else:
                # Fallback: increment by created count
                dataset.total_relationships += relationships_created
        except Exception as verify_error:
            logger.warning(f"Could not verify relationship count from Neo4j: {verify_error}")
            # Fallback: increment by created count
            dataset.total_relationships += relationships_created
        
        await dataset.asave(update_fields=['total_relationships', 'updated_at'])
        logger.info(f"Dataset {task.dataset_id}: Total relationships updated to: {dataset.total_relationships}")
        
        # Update dataset status
        await update_dataset_status(task.dataset_id)
        
        await send_task_update(
            task_id,
            'status',
            {
                'status': 'completed',
                'message': f'Successfully created {relationships_created} relationships',
                'relationships_created': relationships_created,
                'percentage': 100
            }
        )
        
        logger.info(f"Task {task_id} completed: {relationships_created} relationships created")
        
    except Exception as e:
        logger.error(f"Task {task_id} failed: {e}", exc_info=True)
        try:
            task = await UploadTask.objects.aget(id=task_id)
            task.status = 'failed'
            task.error_message = str(e)
            task.error_details = {'exception': str(e)}
            task.completed_at = timezone.now()
            await task.asave(update_fields=['status', 'error_message', 'error_details', 'completed_at', 'updated_at'])
            
            # Update dataset status
            await update_dataset_status(task.dataset_id)
            
            await send_task_update(task_id, 'error', {'message': str(e)})
        except Exception as db_error:
            logger.error(f"Failed to update task status: {db_error}")


async def process_upload_task(task_id: int) -> None:
    """
    Main function to process an upload task.
    Determines if it's a node or relationship file and processes accordingly.
    
    Args:
        task_id: UploadTask ID
    """
    try:
        task = await UploadTask.objects.select_related('dataset').aget(id=task_id)
        
        if task.file_type == 'node':
            await process_node_csv_task(task_id)
        elif task.file_type == 'relationship':
            await process_relationship_csv_task(task_id)
        else:
            task.status = 'failed'
            task.error_message = f"Unknown file type: {task.file_type}"
            task.completed_at = timezone.now()
            await task.asave(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
            
            # Update dataset status
            await update_dataset_status(task.dataset_id)
            
            await send_task_update(task_id, 'error', {'message': f"Unknown file type: {task.file_type}"})
    
    except Exception as e:
        logger.error(f"Failed to process task {task_id}: {e}", exc_info=True)
        try:
            task = await UploadTask.objects.aget(id=task_id)
            task.status = 'failed'
            task.error_message = str(e)
            task.completed_at = timezone.now()
            await task.asave(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
            
            # Update dataset status
            await update_dataset_status(task.dataset_id)
            
            await send_task_update(task_id, 'error', {'message': str(e)})
        except Exception:
            pass


def start_upload_task(task_id: int) -> None:
    """
    Start an upload task asynchronously.
    This is a sync wrapper that can be called from Django views.
    
    Args:
        task_id: UploadTask ID
    """
    # Always run in a separate thread with its own event loop
    # This prevents event loop conflicts with Django Channels or other async contexts
    import threading
    
    def run_task():
        # Create a new event loop for this thread
        new_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(new_loop)
        try:
            new_loop.run_until_complete(process_upload_task(task_id))
        except Exception as e:
            logger.error(f"Error in background task for task {task_id}: {e}", exc_info=True)
        finally:
            new_loop.close()
    
    thread = threading.Thread(target=run_task, daemon=True)
    thread.start()

