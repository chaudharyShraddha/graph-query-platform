"""
Async background tasks for processing CSV file uploads.

This module handles asynchronous processing of CSV files for both node and relationship
data, including validation, parsing, type conversion, and Neo4j database operations.
"""
import asyncio
import logging
import threading
from pathlib import Path
from typing import Dict, Any, Optional, List, Set, Tuple
from datetime import datetime
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
        
        # Use async queryset aggregation for better performance
        tasks = []
        status_counts = {'completed': 0, 'failed': 0, 'processing': 0, 'pending': 0}
        
        async for task in UploadTask.objects.filter(dataset_id=dataset_id):
            tasks.append(task)
            status_counts[task.status] = status_counts.get(task.status, 0) + 1
        
        completed_count = status_counts['completed']
        failed_count = status_counts['failed']
        processing_count = status_counts['processing']
        pending_count = status_counts['pending']
        
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
            # Clean up temp file
            if task.file_path and Path(task.file_path).exists():
                Path(task.file_path).unlink(missing_ok=True)
            
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
            # Clean up temp file
            if task.file_path and Path(task.file_path).exists():
                Path(task.file_path).unlink(missing_ok=True)
            
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
        total_batches = (len(data) + BATCH_SIZE - 1) // BATCH_SIZE
        nodes_created = 0
        
        for batch_num in range(total_batches):
            start_idx = batch_num * BATCH_SIZE
            end_idx = min(start_idx + BATCH_SIZE, len(data))
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
                    batch_size=BATCH_SIZE
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
        
        # If dataset cascade_delete: sync to file — remove nodes of this label not in the file (and their relationships)
        nodes_deleted = 0
        if task.node_label and id_column:
            dataset = await Dataset.objects.aget(id=task.dataset_id)
            if dataset.cascade_delete:
                try:
                    ids_in_file = []
                    for row in data:
                        val = row.get(id_column)
                        if val is not None:
                            try:
                                ids_in_file.append(int(val))
                            except (ValueError, TypeError):
                                ids_in_file.append(val)
                    nodes_deleted = await neo4j_client.delete_nodes_not_in_set(
                        label=task.node_label or 'Node',
                        dataset_id=task.dataset_id,
                        id_property=id_column,
                        ids_in_file=ids_in_file,
                    )
                    logger.info(f"Cascade delete: removed {nodes_deleted} nodes not in file for label {task.node_label}")
                except Exception as e:
                    logger.warning(f"Cascade delete (sync nodes) failed: {e}", exc_info=True)

        # Mark task as completed
        task.status = 'completed'
        task.completed_at = timezone.now()
        if task.total_rows > 0:
            task.progress_percentage = 100.0
        await task.asave(update_fields=['status', 'completed_at', 'progress_percentage', 'updated_at'])
        
        # Clean up temporary file
        if task.file_path and Path(task.file_path).exists():
            try:
                Path(task.file_path).unlink()
                logger.info(f"Cleaned up temporary file: {task.file_path}")
            except Exception as e:
                logger.warning(f"Error cleaning up temp file {task.file_path}: {e}")
        
        # Update dataset node count (created - deleted for sync)
        dataset = await Dataset.objects.aget(id=task.dataset_id)
        dataset.total_nodes += nodes_created - nodes_deleted
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
            # Clean up temp file
            if task.file_path and Path(task.file_path).exists():
                Path(task.file_path).unlink(missing_ok=True)
            
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
        
        # Get source and target labels from task (already set in view)
        source_label = task.source_label
        target_label = task.target_label
        
        # Build list of node labels available in this dataset (from completed node uploads)
        node_labels = []
        async for t in UploadTask.objects.filter(dataset_id=task.dataset_id, file_type='node', status='completed'):
            if t.node_label and t.node_label not in node_labels:
                node_labels.append(t.node_label)
        
        # If we have source/target from header, check they exist in the dataset
        if source_label or target_label:
            missing = []
            if source_label and source_label not in node_labels:
                missing.append(source_label)
            if target_label and target_label not in node_labels:
                if target_label not in missing:
                    missing.append(target_label)
            if missing:
                if task.file_path and Path(task.file_path).exists():
                    Path(task.file_path).unlink(missing_ok=True)
                labels_str = ', '.join(missing)
                error_msg = (
                    f"{labels_str} node(s) not available in dataset. "
                    f"Please upload the corresponding node file(s) first."
                )
                task.status = 'failed'
                task.error_message = error_msg
                task.completed_at = timezone.now()
                await task.asave(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
                await update_dataset_status(task.dataset_id)
                await send_task_update(task_id, 'error', {'message': error_msg})
                return
        
        if not source_label or not target_label:
            # Clean up temp file
            if task.file_path and Path(task.file_path).exists():
                Path(task.file_path).unlink(missing_ok=True)
            
            task.status = 'failed'
            task.error_message = f'Missing source or target labels. Source: {source_label}, Target: {target_label}'
            task.completed_at = timezone.now()
            await task.asave(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
            
            # Update dataset status
            await update_dataset_status(task.dataset_id)
            
            await send_task_update(task_id, 'error', {'message': task.error_message})
            return
        
        # Infer or resolve labels only when missing (e.g. old CSV format without Label:source_id)
        if not source_label or not target_label:
            inferred_source, inferred_target = infer_labels_from_relationship_type(
                task.relationship_type,
                node_labels
            )
            if inferred_source and inferred_target:
                source_label = inferred_source
                target_label = inferred_target
                logger.info(
                    f"Inferred labels from relationship type '{task.relationship_type}': "
                    f"{source_label} -> {target_label}"
                )
        
        # If inference didn't work, fall back to ID matching
        if not source_label or not target_label:
            if len(node_labels) == 1:
                # Only one label, use it for both
                source_label = node_labels[0]
                target_label = node_labels[0]
            else:
                # Multiple labels - try to determine which label each ID belongs to
                # Sample first few rows to check
                sample_size = min(DEFAULT_SAMPLE_SIZE, len(data))
                sample_source_ids = set()
                sample_target_ids = set()
                
                for row in data[:sample_size]:
                    source_id = row.get('source_id') or row.get('SOURCE_ID') or row.get('Source_ID')
                    target_id = row.get('target_id') or row.get('TARGET_ID') or row.get('Target_ID')
                    
                    # Find case-insensitive matches
                    for key, value in row.items():
                        if key.lower().strip() == 'source_id' and value:
                            sample_source_ids.add(value)
                        elif key.lower().strip() == 'target_id' and value:
                            sample_target_ids.add(value)
                
                # Query Neo4j to find which labels these IDs belong to
                # Strategy: For each sample ID, check which label it belongs to, then use the most common label
                # This handles cases where IDs overlap across labels (e.g., Customer id=1 and Product id=1)
                try:
                    if sample_source_ids:
                        # Convert IDs to integers if possible, but keep track of original values
                        test_ids = []
                        for sid in list(sample_source_ids)[:MAX_SAMPLE_IDS]:
                            try:
                                test_ids.append(int(sid))
                            except (ValueError, TypeError):
                                test_ids.append(sid)
                        
                        if test_ids:
                            # For each ID, find which label(s) it belongs to
                            label_counts = {label: 0 for label in node_labels}
                            for test_id in test_ids:
                                for label in node_labels:
                                    # Check if this specific ID exists in this label with this dataset_id
                                    query = f"MATCH (n:{label} {{id: $id, dataset_id: $dataset_id}}) RETURN count(n) as count"
                                    result = await neo4j_client.execute_query(query, {'id': test_id, 'dataset_id': task.dataset_id})
                                    if result and result[0].get('count', 0) > 0:
                                        label_counts[label] += 1
                            
                            # Find the label with the most matches
                            best_label = max(label_counts.items(), key=lambda x: x[1])[0] if label_counts else None
                            best_count = max(label_counts.values()) if label_counts else 0
                            
                            if best_label and best_count > 0:
                                # Only use this if we haven't already inferred from relationship type
                                if not source_label:
                                    source_label = best_label
                                    logger.info(f"Determined source label from ID matching: {source_label} (matched {best_count}/{len(test_ids)} sample IDs)")
                                    logger.info(f"Label match counts: {label_counts}")
                                else:
                                    logger.info(f"Source label already inferred as {source_label}, skipping ID matching")
                            else:
                                logger.warning(f"Could not determine source label from sample IDs: {test_ids}")
                    
                    if sample_target_ids:
                        # Convert IDs to integers if possible
                        test_ids = []
                        for tid in list(sample_target_ids)[:MAX_SAMPLE_IDS]:
                            try:
                                test_ids.append(int(tid))
                            except (ValueError, TypeError):
                                test_ids.append(tid)
                        
                        if test_ids:
                            # For each ID, find which label(s) it belongs to
                            label_counts = {label: 0 for label in node_labels}
                            for test_id in test_ids:
                                for label in node_labels:
                                    # Check if this specific ID exists in this label with this dataset_id
                                    query = f"MATCH (n:{label} {{id: $id, dataset_id: $dataset_id}}) RETURN count(n) as count"
                                    result = await neo4j_client.execute_query(query, {'id': test_id, 'dataset_id': task.dataset_id})
                                    if result and result[0].get('count', 0) > 0:
                                        label_counts[label] += 1
                            
                            # Find the label with the most matches
                            best_label = max(label_counts.items(), key=lambda x: x[1])[0] if label_counts else None
                            best_count = max(label_counts.values()) if label_counts else 0
                            
                            if best_label and best_count > 0:
                                # Only use this if we haven't already inferred from relationship type
                                if not target_label:
                                    target_label = best_label
                                    logger.info(f"Determined target label from ID matching: {target_label} (matched {best_count}/{len(test_ids)} sample IDs)")
                                    logger.info(f"Label match counts: {label_counts}")
                                else:
                                    logger.info(f"Target label already inferred as {target_label}, skipping ID matching")
                            else:
                                logger.warning(f"Could not determine target label from sample IDs: {test_ids}")
                except Exception as e:
                    logger.warning(f"Error determining labels from Neo4j: {e}", exc_info=True)
            
            # Fallback: if we couldn't determine, use intelligent defaults
            if not source_label:
                source_label = node_labels[0]
                logger.warning(f"Could not determine source label, using fallback: {source_label}")
            if not target_label:
                # Use different label if available, otherwise same as source
                if len(node_labels) > 1:
                    # Try to use a different label than source
                    target_label = node_labels[1] if node_labels[1] != source_label else (node_labels[2] if len(node_labels) > 2 else node_labels[0])
                else:
                    target_label = node_labels[0]
                logger.warning(f"Could not determine target label, using fallback: {target_label}")
            
            # Final validation: warn if source and target are the same when we have multiple labels
            if source_label == target_label and len(node_labels) > 1:
                logger.warning(
                    f"WARNING: Source and target labels are the same ({source_label}) but multiple labels exist: {node_labels}. "
                    f"This might indicate incorrect label detection. Please verify your relationship CSV data."
                )
        
        logger.info(f"Processing relationship file '{task.file_name}' with type '{task.relationship_type}'")
        logger.info(f"Using node labels: source={source_label}, target={target_label}")
        logger.info(f"Found {len(data)} relationship rows to process")

        # If cascade_delete: re-upload replaces — remove existing relationships of this type so file is source of truth. Otherwise leave existing in Neo4j (orphans).
        dataset = await Dataset.objects.aget(id=task.dataset_id)
        if dataset.cascade_delete:
            await send_task_update(task_id, 'progress', {'message': 'Syncing to file (removing previous relationships)...', 'percentage': 12})
            await neo4j_client.delete_relationships_of_type_for_dataset(
                task.relationship_type or 'RELATED_TO', task.dataset_id
            )

        # Process relationships in batches
        total_batches = (len(data) + BATCH_SIZE - 1) // BATCH_SIZE
        relationships_created = 0
        
        for batch_num in range(total_batches):
            start_idx = batch_num * BATCH_SIZE
            end_idx = min(start_idx + BATCH_SIZE, len(data))
            batch = data[start_idx:end_idx]
            
            # Prepare relationships for Neo4j
            neo4j_rels = []
            validation_warnings = []
            skipped_count = 0
            
            for row_idx, row in enumerate(batch, start=start_idx + 1):
                # Find source_id and target_id columns (new format: Label:source_id)
                source_id = None
                target_id = None
                source_col = None
                target_col = None
                
                for key, value in row.items():
                    # Check for new format: Label:source_id or Label:target_id
                    if ':' in key:
                        parts = key.split(':', 1)
                        if len(parts) == 2:
                            label_part = parts[0].strip()
                            id_part = parts[1].strip().lower()
                            
                            if id_part == 'source_id' and label_part == source_label:
                                source_id = value
                                source_col = key
                            elif id_part == 'target_id' and label_part == target_label:
                                target_id = value
                                target_col = key
                    # Fallback to old format (for backward compatibility)
                    elif key.lower().strip() == 'source_id':
                        source_id = value
                        source_col = key
                    elif key.lower().strip() == 'target_id':
                        target_id = value
                        target_col = key
                
                if not source_id or not target_id:
                    skipped_count += 1
                    validation_warnings.append(f"Row {row_idx}: Missing source_id or target_id")
                    continue
                
                # Convert IDs to integers if they're numeric (to match node IDs)
                # This ensures type consistency with how node IDs are stored
                try:
                    # Try to convert to int, handling strings and already-int values
                    if isinstance(source_id, str):
                        source_id = source_id.strip()
                        if source_id.isdigit() or (source_id.startswith('-') and source_id[1:].isdigit()):
                            source_id = int(source_id)
                    elif isinstance(source_id, (int, float)):
                        source_id = int(source_id)
                    
                    if isinstance(target_id, str):
                        target_id = target_id.strip()
                        if target_id.isdigit() or (target_id.startswith('-') and target_id[1:].isdigit()):
                            target_id = int(target_id)
                    elif isinstance(target_id, (int, float)):
                        target_id = int(target_id)
                except (ValueError, TypeError, AttributeError):
                    # Keep as original value if conversion fails
                    logger.debug(f"Could not convert IDs to int: source_id={source_id}, target_id={target_id}")
                    pass
                
                rel_data = {
                    'source_id': source_id,
                    'target_id': target_id,
                    'properties': {}
                }
                
                # Add other properties (excluding source_id and target_id in any case)
                # Convert values to appropriate types based on detected metadata
                for key, value in row.items():
                    key_lower = key.lower().strip()
                    if key_lower not in ['source_id', 'target_id']:
                        # Convert value based on detected type from metadata
                        data_type = metadata.get('data_types', {}).get(key, 'string')
                        converted_value = value
                        
                        if value is not None and value != '':
                            try:
                                if data_type == 'integer':
                                    converted_value = int(value)
                                elif data_type == 'float':
                                    converted_value = float(value)
                                elif data_type == 'boolean':
                                    converted_value = str(value).lower() in ['true', '1', 'yes']
                                # Keep dates and strings as-is for now
                            except (ValueError, TypeError):
                                # If conversion fails, keep original value
                                logger.debug(f"Could not convert relationship property {key}={value} to {data_type}, keeping as string")
                                converted_value = value
                        else:
                            converted_value = None
                        
                        rel_data['properties'][key] = converted_value
                
                # Validate that source and target nodes exist before adding to batch
                try:
                    # Check source node exists
                    source_query = f"MATCH (n:{source_label} {{id: $id, dataset_id: $dataset_id}}) RETURN count(n) as count"
                    source_result = await neo4j_client.execute_query(
                        source_query,
                        {'id': source_id, 'dataset_id': task.dataset_id}
                    )
                    source_exists = source_result and source_result[0].get('count', 0) > 0
                    
                    # Check target node exists
                    target_query = f"MATCH (n:{target_label} {{id: $id, dataset_id: $dataset_id}}) RETURN count(n) as count"
                    target_result = await neo4j_client.execute_query(
                        target_query,
                        {'id': target_id, 'dataset_id': task.dataset_id}
                    )
                    target_exists = target_result and target_result[0].get('count', 0) > 0
                    
                    if not source_exists:
                        skipped_count += 1
                        validation_warnings.append(f"Row {row_idx}: Source node {source_label}:{source_id} does not exist")
                        continue
                    
                    if not target_exists:
                        skipped_count += 1
                        validation_warnings.append(f"Row {row_idx}: Target node {target_label}:{target_id} does not exist")
                        continue
                    
                except Exception as e:
                    logger.warning(f"Error validating nodes for row {row_idx}: {e}")
                    skipped_count += 1
                    validation_warnings.append(f"Row {row_idx}: Error validating nodes: {str(e)}")
                    continue
                
                # Add dataset_id to relationship properties to track which dataset it belongs to
                rel_data['properties']['dataset_id'] = task.dataset_id
                
                neo4j_rels.append(rel_data)
            
            # Create relationships in Neo4j
            try:
                if neo4j_rels:
                    created_count = await neo4j_client.create_relationships_batch(
                        source_label=source_label,
                        source_id_key='id',
                        target_label=target_label,
                        target_id_key='id',
                        relationship_type=task.relationship_type or 'RELATED_TO',
                        relationships=neo4j_rels,
                        batch_size=BATCH_SIZE
                    )
                    
                    logger.info(f"Batch {batch_num + 1}: Created {created_count} relationships (expected {len(neo4j_rels)})")
                    relationships_created += created_count
                else:
                    logger.warning(f"Batch {batch_num + 1}: No valid relationships to create (all skipped)")
                
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
        
        # Save validation warnings
        if validation_warnings:
            task.validation_warnings = validation_warnings[:100]  # Limit to first 100 warnings
            if skipped_count > 0:
                warning_summary = f"Skipped {skipped_count} rows due to validation errors. See validation_warnings for details."
                logger.warning(warning_summary)
        
        # Mark task as completed
        task.status = 'completed'
        task.completed_at = timezone.now()
        if task.total_rows > 0:
            task.progress_percentage = 100.0
        await task.asave(update_fields=['status', 'completed_at', 'progress_percentage', 'validation_warnings', 'updated_at'])
        
        # Clean up temporary file
        if task.file_path and Path(task.file_path).exists():
            try:
                Path(task.file_path).unlink()
                logger.info(f"Cleaned up temporary file: {task.file_path}")
            except Exception as e:
                logger.warning(f"Error cleaning up temp file {task.file_path}: {e}")
        
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


# Constants
BATCH_SIZE = 100
DEFAULT_SAMPLE_SIZE = 5
MAX_SAMPLE_IDS = 10
MAX_LABELS_TO_CHECK = 5

# Relationship type to label mapping patterns
RELATIONSHIP_PATTERNS = {
    'PURCHASED': ('Customer', 'Product'),
    'BUY': ('Customer', 'Product'),
    'ORDER': ('Customer', 'Product'),
    'FOLLOWS': ('User', 'User'),
    'FOLLOW': ('User', 'User'),
    'IN_CATEGORY': ('Product', 'Category'),
    'CATEGORY': ('Product', 'Category'),
    'VIEWED': ('Customer', 'Product'),
    'VIEW': ('Customer', 'Product'),
    'AUTHORED': ('User', 'Post'),
    'AUTHOR': ('User', 'Post'),
    'COMMENTED': ('User', 'Comment'),
    'COMMENT': ('User', 'Comment'),
}


def infer_labels_from_relationship_type(
    relationship_type: str,
    available_labels: List[str]
) -> Tuple[Optional[str], Optional[str]]:
    """
    Infer source and target labels from relationship type name.
    
    Args:
        relationship_type: Relationship type name (e.g., 'PURCHASED')
        available_labels: List of available node labels in the dataset
        
    Returns:
        Tuple of (source_label, target_label) or (None, None) if inference fails
    """
    if not relationship_type:
        return None, None
    
    rel_type_upper = relationship_type.upper()
    
    # Check against known patterns
    for pattern, (default_source, default_target) in RELATIONSHIP_PATTERNS.items():
        if pattern in rel_type_upper:
            # Try exact match first
            if default_source in available_labels and default_target in available_labels:
                return default_source, default_target
            
            # Try Customer as fallback for User
            if default_source == 'User' and 'Customer' in available_labels:
                if default_target == 'User' and 'Customer' in available_labels:
                    return 'Customer', 'Customer'
                elif default_target in available_labels:
                    return 'Customer', default_target
            
            # Try Post/Comment fallbacks
            if default_source == 'User' and 'Customer' in available_labels:
                if default_target == 'Post' and 'Post' in available_labels:
                    return 'Customer', 'Post'
                elif default_target == 'Comment' and 'Comment' in available_labels:
                    return 'Customer', 'Comment'
    
    return None, None


def start_upload_task(task_id: int) -> None:
    """
    Start an upload task asynchronously.
    This is a sync wrapper that can be called from Django views.
    
    Args:
        task_id: UploadTask ID
    """
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
    
    thread = threading.Thread(target=run_task, daemon=True, name=f"UploadTask-{task_id}")
    thread.start()

