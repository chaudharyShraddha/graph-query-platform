"""
Async background tasks for processing CSV file uploads.
"""
import asyncio
import logging
from typing import Dict, Any, Optional
from pathlib import Path
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
            from datetime import datetime
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
        await send_task_update(task_id, 'status', {'status': 'processing', 'message': 'Task started'})
        
        # Validate CSV file
        await send_task_update(task_id, 'progress', {'message': 'Validating CSV file...', 'percentage': 5})
        is_valid, errors, warnings = validate_node_csv(task.file_path, task.node_label)
        
        if not is_valid:
            error_msg = '; '.join(errors)
            task.status = 'failed'
            task.error_message = error_msg
            task.error_details = {'errors': errors, 'warnings': warnings}
            task.completed_at = timezone.now()
            await task.asave(update_fields=['status', 'error_message', 'error_details', 'completed_at', 'updated_at'])
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
            await send_task_update(task_id, 'error', {'message': 'CSV file contains no data'})
            return
        
        # Update task with total rows
        task.total_rows = len(data)
        await task.asave(update_fields=['total_rows'])
        
        # Determine ID column
        id_column = None
        for col in ['id', 'ID', 'Id', 'uuid', 'UUID', 'uuid_id']:
            if col in metadata['columns']:
                id_column = col
                break
        
        if not id_column:
            # Try to find any column with 'id' in name
            for col in metadata['columns']:
                if 'id' in col.lower():
                    id_column = col
                    break
        
        if not id_column:
            task.status = 'failed'
            task.error_message = 'No ID column found in CSV file'
            task.completed_at = timezone.now()
            await task.asave(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
            await send_task_update(task_id, 'error', {'message': 'No ID column found'})
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
                        # Basic type conversion
                        if data_type == 'integer' and value:
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
                send_task_update(
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
                await send_task_update(task_id, 'error', {'message': str(e)})
                return
        
        # Mark task as completed
        task.status = 'completed'
        task.completed_at = timezone.now()
        if task.total_rows > 0:
            task.progress_percentage = 100.0
        await task.asave(update_fields=['status', 'completed_at', 'progress_percentage', 'updated_at'])
        send_task_update(
            task_id,
            'status',
            {
                'status': 'completed',
                'message': f'Successfully created {nodes_created} nodes',
                'nodes_created': nodes_created
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
        await send_task_update(task_id, 'status', {'status': 'processing', 'message': 'Task started'})
        
        # Validate CSV file
        await send_task_update(task_id, 'progress', {'message': 'Validating CSV file...', 'percentage': 5})
        is_valid, errors, warnings = validate_relationship_csv(
            task.file_path,
            task.relationship_type
        )
        
        if not is_valid:
            error_msg = '; '.join(errors)
            task.status = 'failed'
            task.error_message = error_msg
            task.error_details = {'errors': errors, 'warnings': warnings}
            task.completed_at = timezone.now()
            await task.asave(update_fields=['status', 'error_message', 'error_details', 'completed_at', 'updated_at'])
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
            await send_task_update(task_id, 'error', {'message': 'CSV file contains no data'})
            return
        
        # Update task with total rows
        task.total_rows = len(data)
        await task.asave(update_fields=['total_rows'])
        
        # Get source and target labels from dataset
        dataset = await Dataset.objects.aget(id=task.dataset_id)
        # For now, assume we need to determine labels from context
        # In a real implementation, this would come from dataset metadata
        
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
                rel_data = {
                    'source_id': row.get('source_id'),
                    'target_id': row.get('target_id'),
                    'properties': {}
                }
                
                # Add other properties
                for key, value in row.items():
                    if key not in ['source_id', 'target_id']:
                        rel_data['properties'][key] = value
                
                neo4j_rels.append(rel_data)
            
            # Create relationships in Neo4j
            try:
                # Note: This is simplified - in reality, we'd need to know source/target labels
                # For now, we'll use a generic approach
                created_count = await neo4j_client.create_relationships_batch(
                    source_label='Node',  # Would come from dataset metadata
                    source_id_key='id',
                    target_label='Node',  # Would come from dataset metadata
                    target_id_key='id',
                    relationship_type=task.relationship_type or 'RELATED_TO',
                    relationships=neo4j_rels,
                    batch_size=batch_size
                )
                relationships_created += created_count
                
                # Update progress
                processed = end_idx
                percentage = int(10 + (processed / len(data)) * 80)  # 10-90%
                task.processed_rows = processed
                task.total_rows = len(data)
                if len(data) > 0:
                    task.progress_percentage = (processed / len(data)) * 100
                await task.asave(update_fields=['processed_rows', 'total_rows', 'progress_percentage', 'updated_at'])
                send_task_update(
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
                await send_task_update(task_id, 'error', {'message': str(e)})
                return
        
        # Mark task as completed
        task.status = 'completed'
        task.completed_at = timezone.now()
        if task.total_rows > 0:
            task.progress_percentage = 100.0
        await task.asave(update_fields=['status', 'completed_at', 'progress_percentage', 'updated_at'])
        send_task_update(
            task_id,
            'status',
            {
                'status': 'completed',
                'message': f'Successfully created {relationships_created} relationships',
                'relationships_created': relationships_created
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
            await send_task_update(task_id, 'error', {'message': f"Unknown file type: {task.file_type}"})
    
    except Exception as e:
        logger.error(f"Failed to process task {task_id}: {e}", exc_info=True)
        try:
            task = await UploadTask.objects.aget(id=task_id)
            task.status = 'failed'
            task.error_message = str(e)
            task.completed_at = timezone.now()
            await task.asave(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
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
    # Run async task in background
    # Note: In production, use a proper task queue like Celery
    # For now, we'll use asyncio to run the task
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    if loop.is_running():
        # If loop is already running, create a task
        asyncio.create_task(process_upload_task(task_id))
    else:
        # If no loop is running, run in background thread
        import threading
        def run_task():
            new_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(new_loop)
            new_loop.run_until_complete(process_upload_task(task_id))
            new_loop.close()
        
        thread = threading.Thread(target=run_task, daemon=True)
        thread.start()

