"""
API views for Dataset management.
"""
import os
import zipfile
import tempfile
import logging
from pathlib import Path
from typing import Dict, Any
from django.http import FileResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from asgiref.sync import async_to_sync

logger = logging.getLogger(__name__)

from datasets.models import Dataset, UploadTask
from datasets.serializers import (
    DatasetSerializer,
    DatasetListSerializer,
    UploadTaskSerializer,
    FileUploadSerializer,
)
from datasets.tasks import start_upload_task
from core.neo4j_client import neo4j_client
from core.csv_processor import parse_csv


class DatasetUploadView(APIView):
    """Handle dataset file uploads."""
    
    parser_classes = [MultiPartParser, FormParser]
    
    def post(self, request):
        """
        Upload CSV files and create upload tasks.
        
        Expected format:
        - files: List of CSV files
        - dataset_name: Optional dataset name
        - dataset_description: Optional description
        """
        serializer = FileUploadSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        files = serializer.validated_data['files']
        dataset_name = serializer.validated_data.get('dataset_name', f'Dataset {timezone.now().strftime("%Y-%m-%d %H:%M:%S")}')
        dataset_description = serializer.validated_data.get('dataset_description', '')
        
        try:
            # Create dataset
            dataset = Dataset.objects.create(
                name=dataset_name,
                description=dataset_description,
                status='pending',
                total_files=len(files),
                created_by=request.user if request.user.is_authenticated else None
            )
            
            # Create upload directory
            upload_dir = Path('uploads') / str(dataset.id)
            upload_dir.mkdir(parents=True, exist_ok=True)
            
            # Process each file
            created_tasks = []
            for file in files:
                file_name = file.name
                
                # Save file first
                file_path = upload_dir / file_name
                with open(file_path, 'wb+') as destination:
                    for chunk in file.chunks():
                        destination.write(chunk)
                
                # Detect file type by examining CSV header
                from core.csv_processor import detect_file_type
                file_type = detect_file_type(str(file_path))
                
                # Determine label/relationship type from filename
                label_or_type = Path(file_name).stem  # Remove .csv extension
                
                # Create upload task
                task = UploadTask.objects.create(
                    dataset=dataset,
                    file_name=file_name,
                    file_type=file_type,
                    file_path=str(file_path.absolute()),
                    node_label=label_or_type if file_type == 'node' else None,
                    relationship_type=label_or_type if file_type == 'relationship' else None,
                    status='pending'
                )
                
                created_tasks.append(task)
                
                # Start background task
                start_upload_task(task.id)
            
            # Return dataset with tasks
            dataset_serializer = DatasetSerializer(dataset)
            return Response(dataset_serializer.data, status=status.HTTP_201_CREATED)
        
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class DatasetListView(APIView):
    """List all datasets."""
    
    def get(self, request):
        """Get list of all datasets."""
        datasets = Dataset.objects.all().order_by('-created_at')
        
        # For completed datasets, refresh counts from Neo4j to ensure accuracy
        def refresh_counts_sync():
            from datasets.models import UploadTask
            
            completed_datasets = [d for d in datasets if d.status == 'completed']
            if not completed_datasets:
                return
            
            async def refresh_counts_async():
                for dataset in completed_datasets:
                    # Get relationship types from tasks
                    tasks = list(UploadTask.objects.filter(dataset_id=dataset.id, file_type='relationship'))
                    rel_types = [t.relationship_type for t in tasks if t.relationship_type]
                    
                    if rel_types:
                        total_rel_count = 0
                        for rel_type in rel_types:
                            try:
                                rel_type_escaped = f"`{rel_type}`" if not rel_type.replace('_', '').isalnum() else rel_type
                                query = f"MATCH ()-[r:{rel_type_escaped}]->() WHERE r.dataset_id = $dataset_id RETURN count(r) as count"
                                result = await neo4j_client.execute_query(query, {'dataset_id': dataset.id})
                                count = result[0]['count'] if result and len(result) > 0 else 0
                                total_rel_count += count
                            except Exception as e:
                                logger.warning(f"Error counting '{rel_type}': {e}")
                        
                        # Update if different
                        if dataset.total_relationships != total_rel_count:
                            dataset.total_relationships = total_rel_count
                            await dataset.asave(update_fields=['total_relationships', 'updated_at'])
            
            # Run async function in sync context
            try:
                async_to_sync(refresh_counts_async)()
            except Exception as e:
                logger.warning(f"Error refreshing counts: {e}")
        
        # Refresh counts for completed datasets (run in background to avoid blocking)
        try:
            import threading
            thread = threading.Thread(target=refresh_counts_sync, daemon=True)
            thread.start()
        except Exception as e:
            logger.warning(f"Error starting count refresh thread: {e}")
        
        serializer = DatasetListSerializer(datasets, many=True)
        return Response(serializer.data)


class DatasetDetailView(APIView):
    """Get dataset details."""
    
    def get(self, request, pk):
        """Get dataset by ID."""
        try:
            dataset = Dataset.objects.prefetch_related('upload_tasks').get(pk=pk)
            serializer = DatasetSerializer(dataset)
            return Response(serializer.data)
        except Dataset.DoesNotExist:
            return Response(
                {'error': 'Dataset not found'},
                status=status.HTTP_404_NOT_FOUND
            )


class DatasetMetadataView(APIView):
    """Get dataset metadata from Neo4j."""
    
    def get(self, request, pk):
        """Get dataset metadata (node labels, relationship types, counts)."""
        try:
            dataset = Dataset.objects.get(pk=pk)
            
            # Async function to get metadata from Neo4j
            async def get_metadata():
                from datasets.models import UploadTask
                
                # Get node labels and relationship types from this dataset's upload tasks
                node_labels = []
                rel_types = []
                
                async for task in UploadTask.objects.filter(dataset_id=dataset.id):
                    if task.file_type == 'node' and task.node_label:
                        if task.node_label not in node_labels:
                            node_labels.append(task.node_label)
                    elif task.file_type == 'relationship' and task.relationship_type:
                        if task.relationship_type not in rel_types:
                            rel_types.append(task.relationship_type)
                
                # Get counts for each label (filtered by dataset_id)
                node_counts = {}
                node_properties = {}
                for label in node_labels:
                    # Count nodes with this label and dataset_id
                    query = f"MATCH (n:{label}) WHERE n.dataset_id = $dataset_id RETURN count(n) as count"
                    result = await neo4j_client.execute_query(query, {'dataset_id': dataset.id})
                    count = result[0]['count'] if result else 0
                    node_counts[label] = count
                    
                    # Get properties for this label (from nodes with this dataset_id)
                    if count > 0:
                        prop_query = f"MATCH (n:{label}) WHERE n.dataset_id = $dataset_id RETURN keys(n) as keys LIMIT 100"
                        prop_results = await neo4j_client.execute_query(prop_query, {'dataset_id': dataset.id})
                        if prop_results:
                            all_keys = set()
                            for record in prop_results:
                                all_keys.update(record.get('keys', []))
                            node_properties[label] = list(all_keys)
                        else:
                            node_properties[label] = []
                    else:
                        node_properties[label] = []
                
                # Get counts for each relationship type (filtered by dataset_id)
                rel_counts = {}
                for rel_type in rel_types:
                    try:
                        # Escape relationship type if needed (for special characters)
                        rel_type_escaped = f"`{rel_type}`" if not rel_type.replace('_', '').isalnum() else rel_type
                        
                        # Count relationships with this type and dataset_id
                        query = f"MATCH ()-[r:{rel_type_escaped}]->() WHERE r.dataset_id = $dataset_id RETURN count(r) as count"
                        result = await neo4j_client.execute_query(query, {'dataset_id': dataset.id})
                        count = result[0]['count'] if result and len(result) > 0 else 0
                        
                        # If count is 0, try without dataset_id filter (for relationships created before dataset_id was added)
                        if count == 0:
                            fallback_query = f"MATCH ()-[r:{rel_type_escaped}]->() RETURN count(r) as count"
                            fallback_result = await neo4j_client.execute_query(fallback_query)
                            fallback_count = fallback_result[0]['count'] if fallback_result and len(fallback_result) > 0 else 0
                            if fallback_count > 0:
                                count = fallback_count
                        
                        rel_counts[rel_type] = count
                    except Exception as e:
                        logger.error(f"Error counting relationships for type '{rel_type}': {e}", exc_info=True)
                        rel_counts[rel_type] = 0
                
                # Get sample data (first 10 nodes of each label for this dataset)
                sample_data = {}
                for label in node_labels[:5]:  # Limit to first 5 labels
                    query = f"MATCH (n:{label}) WHERE n.dataset_id = $dataset_id RETURN n LIMIT 10"
                    results = await neo4j_client.execute_query(query, {'dataset_id': dataset.id})
                    sample_data[label] = results[:10]
                
                # Get sample data for relationship types (first 10 relationships of each type)
                sample_relationships = {}
                for rel_type in rel_types[:5]:  # Limit to first 5 relationship types
                    try:
                        rel_type_escaped = f"`{rel_type}`" if not rel_type.replace('_', '').isalnum() else rel_type
                        query = f"MATCH (a)-[r:{rel_type_escaped}]->(b) WHERE r.dataset_id = $dataset_id RETURN r, a, b LIMIT 10"
                        results = await neo4j_client.execute_query(query, {'dataset_id': dataset.id})
                        sample_relationships[rel_type] = results[:10]
                    except Exception as e:
                        logger.error(f"Error getting sample relationships for type '{rel_type}': {e}", exc_info=True)
                        sample_relationships[rel_type] = []
                
                return {
                    'dataset_id': dataset.id,
                    'dataset_name': dataset.name,
                    'node_labels': {
                        label: {
                            'count': node_counts.get(label, 0),
                            'properties': node_properties.get(label, [])
                        }
                        for label in node_labels
                    },
                    'relationship_types': {
                        rel_type: {
                            'count': rel_counts.get(rel_type, 0)
                        }
                        for rel_type in rel_types
                    },
                    'total_nodes': sum(node_counts.values()),
                    'total_relationships': sum(rel_counts.values()),
                    'sample_data': sample_data,
                    'sample_relationships': sample_relationships,
                    # Include dataset model counts as fallback
                    'dataset_total_nodes': dataset.total_nodes,
                    'dataset_total_relationships': dataset.total_relationships,
                }
            
            # Run async function using async_to_sync
            metadata = async_to_sync(get_metadata)()
            
            # Update dataset counts from Neo4j to ensure accuracy
            if metadata.get('total_relationships', 0) != dataset.total_relationships:
                dataset.total_relationships = metadata.get('total_relationships', 0)
                dataset.save(update_fields=['total_relationships', 'updated_at'])
            
            if metadata.get('total_nodes', 0) != dataset.total_nodes:
                dataset.total_nodes = metadata.get('total_nodes', 0)
                dataset.save(update_fields=['total_nodes', 'updated_at'])
            
            return Response(metadata)
        
        except Dataset.DoesNotExist:
            return Response(
                {'error': 'Dataset not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class DatasetDownloadView(APIView):
    """Download dataset files."""
    
    def get(self, request, pk):
        """
        Download dataset files.
        
        Args:
            pk: Dataset ID
            file_type: Optional query parameter - 'node', 'relationship', or None for all files
            node_label: Optional query parameter - specific node label to download (e.g., 'User')
            relationship_type: Optional query parameter - specific relationship type to download (e.g., 'FOLLOWS')
            as_zip: Optional query parameter - 'true' to force ZIP download even for single file
        """
        try:
            dataset = Dataset.objects.prefetch_related('upload_tasks').get(pk=pk)
            
            # Get query parameters
            file_type = request.query_params.get('file_type', None)
            node_label = request.query_params.get('node_label', None)
            relationship_type = request.query_params.get('relationship_type', None)
            as_zip = request.query_params.get('as_zip', 'false').lower() == 'true'
            
            # Filter tasks
            tasks = dataset.upload_tasks.all()
            
            if node_label:
                # Filter by specific node label
                tasks = tasks.filter(file_type='node', node_label=node_label)
            elif relationship_type:
                # Filter by specific relationship type
                tasks = tasks.filter(file_type='relationship', relationship_type=relationship_type)
            elif file_type:
                # Filter by file type (node or relationship)
                tasks = tasks.filter(file_type=file_type)
            
            if not tasks.exists():
                return Response(
                    {'error': 'No files found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Determine if we should force ZIP:
            # - If as_zip is explicitly true (Download All buttons)
            # - If downloading all files without filters (no file_type, node_label, or relationship_type)
            # - NOT if downloading specific node_label or relationship_type (always return CSV directly)
            is_specific_download = node_label is not None or relationship_type is not None
            
            # For specific downloads (node_label or relationship_type), always return CSV directly
            # For "Download All" (no filters) or when as_zip is true, create ZIP
            if is_specific_download and not as_zip:
                # Specific file download - always return CSV directly (even if multiple files match)
                task = tasks.first()
                file_path = Path(task.file_path)
                if file_path.exists():
                    return FileResponse(
                        open(file_path, 'rb'),
                        as_attachment=True,
                        filename=task.file_name
                    )
                else:
                    return Response(
                        {'error': 'File not found'},
                        status=status.HTTP_404_NOT_FOUND
                    )
            
            # For all other cases (Download All, as_zip=true, or file_type filter), create ZIP
            force_zip = as_zip or (not is_specific_download and not file_type) or (file_type and tasks.count() > 1)
            
            if not force_zip and tasks.count() == 1:
                # Single file without specific download - return it directly
                task = tasks.first()
                file_path = Path(task.file_path)
                if file_path.exists():
                    return FileResponse(
                        open(file_path, 'rb'),
                        as_attachment=True,
                        filename=task.file_name
                    )
                else:
                    return Response(
                        {'error': 'File not found'},
                        status=status.HTTP_404_NOT_FOUND
                    )
            
            # Create ZIP file
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
            with zipfile.ZipFile(temp_file.name, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for task in tasks:
                    file_path = Path(task.file_path)
                    if file_path.exists():
                        zip_file.write(file_path, task.file_name)
            
            # Determine ZIP filename
            if node_label:
                zip_filename = f'{dataset.name}_{node_label}.zip'
            elif relationship_type:
                zip_filename = f'{dataset.name}_{relationship_type}.zip'
            elif file_type:
                zip_filename = f'{dataset.name}_{file_type}s.zip'
            else:
                zip_filename = f'{dataset.name}_dataset.zip'
            
            # Return ZIP file
            zip_path = Path(temp_file.name)
            response = FileResponse(
                open(zip_path, 'rb'),
                as_attachment=True,
                filename=zip_filename
            )
            
            # Clean up temp file after response
            def cleanup():
                try:
                    zip_path.unlink()
                except:
                    pass
            
            response['Content-Disposition'] = f'attachment; filename="{zip_filename}"'
            return response
        
        except Dataset.DoesNotExist:
            return Response(
                {'error': 'Dataset not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class DatasetDeleteView(APIView):
    """Delete a dataset."""
    
    def delete(self, request, pk):
        """Delete dataset and associated files."""
        try:
            dataset = Dataset.objects.get(pk=pk)
            
            # Delete associated files
            upload_dir = Path('uploads') / str(dataset.id)
            if upload_dir.exists():
                import shutil
                shutil.rmtree(upload_dir)
            
            # Delete dataset (cascade will delete tasks)
            dataset.delete()
            
            return Response(
                {'message': 'Dataset deleted successfully'},
                status=status.HTTP_204_NO_CONTENT
            )
        
        except Dataset.DoesNotExist:
            return Response(
                {'error': 'Dataset not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class TaskStatusView(APIView):
    """Get upload task status."""
    
    def get(self, request, pk):
        """Get task status by ID."""
        try:
            task = UploadTask.objects.get(pk=pk)
            serializer = UploadTaskSerializer(task)
            return Response(serializer.data)
        except UploadTask.DoesNotExist:
            return Response(
                {'error': 'Task not found'},
                status=status.HTTP_404_NOT_FOUND
            )
