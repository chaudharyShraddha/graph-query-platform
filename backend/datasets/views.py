"""
API views for Dataset management.
"""
import os
import zipfile
import tempfile
from pathlib import Path
from typing import Dict, Any
from django.http import HttpResponse, FileResponse, Http404
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from asgiref.sync import sync_to_async, async_to_sync

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
                # Determine file type from filename
                file_name = file.name
                file_type = 'node' if 'relationship' not in file_name.lower() else 'relationship'
                
                # Save file
                file_path = upload_dir / file_name
                with open(file_path, 'wb+') as destination:
                    for chunk in file.chunks():
                        destination.write(chunk)
                
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
                # Get schema from Neo4j
                schema = await neo4j_client.get_schema()
                
                # Get counts for each label
                node_counts = {}
                for label in schema['node_labels']:
                    count = await neo4j_client.get_node_count(label)
                    node_counts[label] = count
                
                # Get counts for each relationship type
                rel_counts = {}
                for rel_type in schema['relationship_types']:
                    count = await neo4j_client.get_relationship_count(rel_type)
                    rel_counts[rel_type] = count
                
                # Get sample data (first 10 nodes of each label)
                sample_data = {}
                for label in schema['node_labels'][:5]:  # Limit to first 5 labels
                    query = f"MATCH (n:{label}) RETURN n LIMIT 10"
                    results = await neo4j_client.execute_query(query)
                    sample_data[label] = results[:10]
                
                return {
                    'dataset_id': dataset.id,
                    'dataset_name': dataset.name,
                    'node_labels': {
                        label: {
                            'count': node_counts.get(label, 0),
                            'properties': schema['properties'].get(label, [])
                        }
                        for label in schema['node_labels']
                    },
                    'relationship_types': {
                        rel_type: {
                            'count': rel_counts.get(rel_type, 0)
                        }
                        for rel_type in schema['relationship_types']
                    },
                    'total_nodes': sum(node_counts.values()),
                    'total_relationships': sum(rel_counts.values()),
                    'sample_data': sample_data,
                }
            
            # Run async function using async_to_sync
            metadata = async_to_sync(get_metadata)()
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
    
    def get(self, request, pk, file_type=None):
        """
        Download dataset files.
        
        Args:
            pk: Dataset ID
            file_type: Optional - 'node', 'relationship', or None for all files
        """
        try:
            dataset = Dataset.objects.prefetch_related('upload_tasks').get(pk=pk)
            
            # Filter tasks by type if specified
            tasks = dataset.upload_tasks.all()
            if file_type:
                tasks = tasks.filter(file_type=file_type)
            
            if not tasks.exists():
                return Response(
                    {'error': 'No files found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # If single file, return it directly
            if tasks.count() == 1:
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
            
            # Multiple files - create ZIP
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
            with zipfile.ZipFile(temp_file.name, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for task in tasks:
                    file_path = Path(task.file_path)
                    if file_path.exists():
                        zip_file.write(file_path, task.file_name)
            
            # Return ZIP file
            zip_path = Path(temp_file.name)
            response = FileResponse(
                open(zip_path, 'rb'),
                as_attachment=True,
                filename=f'{dataset.name}_dataset.zip'
            )
            
            # Clean up temp file after response
            def cleanup():
                try:
                    zip_path.unlink()
                except:
                    pass
            
            response['Content-Disposition'] = f'attachment; filename="{dataset.name}_dataset.zip"'
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
