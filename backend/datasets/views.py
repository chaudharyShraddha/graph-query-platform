"""Dataset API: create, list, detail, upload nodes/relationships, node sample, download, delete, task status."""
import zipfile
import tempfile
import logging
import csv
import io
from pathlib import Path
from typing import Dict, Any, Optional
from django.http import FileResponse, StreamingHttpResponse
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from asgiref.sync import async_to_sync

from datasets.models import Dataset, UploadTask
from datasets.serializers import (
    DatasetSerializer,
    DatasetListSerializer,
    UploadTaskSerializer,
    DatasetCreateSerializer,
    NodeUploadSerializer,
    RelationshipUploadSerializer,
)
from datasets.tasks import start_upload_task
from core.neo4j_client import neo4j_client
from core.csv_processor import detect_file_type, parse_relationship_header

logger = logging.getLogger(__name__)


def _escape_node_label(lbl: str) -> str:
    if not lbl:
        return lbl
    safe = lbl.replace('_', '').replace('-', '').replace(' ', '')
    return f"`{lbl}`" if not safe.isalnum() else lbl


async def fetch_dataset_summary(dataset: Dataset) -> Dict[str, Any]:
    """Neo4j counts per node label and relationship type, plus file success/failed."""
    node_labels = []
    rel_types = []
    async for task in UploadTask.objects.filter(dataset_id=dataset.id):
        if task.file_type == 'node' and task.node_label and task.node_label not in node_labels:
            node_labels.append(task.node_label)
        elif task.file_type == 'relationship' and task.relationship_type and task.relationship_type not in rel_types:
            rel_types.append(task.relationship_type)

    node_counts = {}
    for label in node_labels:
        label_escaped = _escape_node_label(label)
        try:
            query = f"MATCH (n:{label_escaped}) WHERE n.dataset_id = $dataset_id RETURN count(n) as count"
            result = await neo4j_client.execute_query(query, {'dataset_id': dataset.id})
            count = result[0]['count'] if result else 0
            if count == 0:
                # Fallback for data without dataset_id
                fallback = await neo4j_client.execute_query(f"MATCH (n:{label_escaped}) RETURN count(n) as count")
                count = fallback[0]['count'] or 0 if fallback else 0
            node_counts[label] = count
        except Exception as e:
            logger.warning("Error counting nodes for label '%s': %s", label, e)
            node_counts[label] = 0

    rel_counts = {}
    for rel_type in rel_types:
        try:
            rel_escaped = f"`{rel_type}`" if not rel_type.replace('_', '').isalnum() else rel_type
            query = f"MATCH ()-[r:{rel_escaped}]->() WHERE r.dataset_id = $dataset_id RETURN count(r) as count"
            result = await neo4j_client.execute_query(query, {'dataset_id': dataset.id})
            count = result[0]['count'] if result and len(result) > 0 else 0
            if count == 0:
                fallback = await neo4j_client.execute_query(f"MATCH ()-[r:{rel_escaped}]->() RETURN count(r) as count")
                count = fallback[0]['count'] or 0 if fallback and len(fallback) > 0 else 0
            rel_counts[rel_type] = count
        except Exception as e:
            logger.warning("Error counting relationships for type '%s': %s", rel_type, e)
            rel_counts[rel_type] = 0

    total_nodes = sum(node_counts.values())
    total_relationships = sum(rel_counts.values())
    tasks = list(dataset.upload_tasks.all()) if hasattr(dataset, 'upload_tasks') else []
    success_files = sum(1 for t in tasks if t.status == 'completed')
    failed_files = sum(1 for t in tasks if t.status == 'failed')

    return {
        'summary': {
            'total_nodes': total_nodes,
            'total_relationships': total_relationships,
            'total_files': len(tasks),
            'success_files': success_files,
            'failed_files': failed_files,
        },
        'node_summary': [{'name': label, 'total_rows': node_counts.get(label, 0)} for label in node_labels],
        'relationship_summary': [{'name': rt, 'total_rows': rel_counts.get(rt, 0)} for rt in rel_types],
    }


class DatasetCreateView(APIView):
    """POST create dataset (name, description, cascade_delete)."""

    def post(self, request):
        serializer = DatasetCreateSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            dataset = Dataset.objects.create(
                name=serializer.validated_data['name'],
                description=serializer.validated_data.get('description', ''),
                cascade_delete=serializer.validated_data.get('cascade_delete', False),
                status='pending',
                created_by=request.user if request.user.is_authenticated else None
            )
            
            dataset_serializer = DatasetSerializer(dataset)
            return Response(dataset_serializer.data, status=status.HTTP_201_CREATED)
        
        except Exception as e:
            logger.error(f"Error creating dataset: {e}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class NodeUploadView(APIView):
    """POST node CSV files; label from filename (e.g. Actor.csv -> Actor)."""

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        try:
            dataset = Dataset.objects.get(pk=pk)
        except Dataset.DoesNotExist:
            return Response(
                {'error': 'Dataset not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = NodeUploadSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        files = serializer.validated_data['files']
        created_tasks = []
        file_results = []
        
        try:
            for file in files:
                file_name = file.name
                file_result = {'file_name': file_name, 'status': 'pending'}
                
                try:
                    with tempfile.NamedTemporaryFile(mode='wb+', delete=False, suffix='.csv') as temp_file:
                        for chunk in file.chunks():
                            temp_file.write(chunk)
                        temp_file_path = temp_file.name

                    file_type = detect_file_type(temp_file_path)
                    if file_type != 'node':
                        Path(temp_file_path).unlink(missing_ok=True)
                        file_results.append({'file_name': file_name, 'status': 'failed', 'error': 'File is not a node file. Expected node file with "id" column.'})
                        continue

                    node_label = Path(file_name).stem
                    task = UploadTask.objects.create(
                        dataset=dataset,
                        file_name=file_name,
                        file_type='node',
                        file_path=temp_file_path,
                        node_label=node_label,
                        status='pending'
                    )
                    created_tasks.append(task)
                    file_results.append({'file_name': file_name, 'status': 'accepted', 'task_id': task.id})
                    dataset.total_files += 1
                    dataset.save(update_fields=['total_files', 'updated_at'])
                    start_upload_task(task.id)
                    
                except Exception as e:
                    logger.error(f"Error processing file {file_name}: {e}", exc_info=True)
                    file_results.append({'file_name': file_name, 'status': 'failed', 'error': str(e)})
            
            dataset.refresh_from_db()
            response_data = {
                'dataset': DatasetSerializer(dataset).data,
                'file_results': file_results,
                'summary': {
                    'total': len(files),
                    'accepted': sum(1 for r in file_results if r['status'] == 'accepted'),
                    'failed': sum(1 for r in file_results if r['status'] == 'failed'),
                }
            }
            
            # Return 201 if at least one file was accepted, 400 if all failed
            if any(r['status'] == 'accepted' for r in file_results):
                return Response(response_data, status=status.HTTP_201_CREATED)
            else:
                return Response(response_data, status=status.HTTP_400_BAD_REQUEST)
        
        except Exception as e:
            logger.error(f"Error uploading node files: {e}", exc_info=True)
            for task in created_tasks:
                if task.file_path and Path(task.file_path).exists():
                    Path(task.file_path).unlink(missing_ok=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class RelationshipUploadView(APIView):
    """POST relationship CSVs; header Label:source_id, Label:target_id."""

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        try:
            dataset = Dataset.objects.get(pk=pk)
        except Dataset.DoesNotExist:
            return Response(
                {'error': 'Dataset not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = RelationshipUploadSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        files = serializer.validated_data['files']
        created_tasks = []
        file_results = []
        
        try:
            for file in files:
                file_name = file.name
                
                try:
                    with tempfile.NamedTemporaryFile(mode='wb+', delete=False, suffix='.csv') as temp_file:
                        for chunk in file.chunks():
                            temp_file.write(chunk)
                        temp_file_path = temp_file.name

                    with open(temp_file_path, 'r', encoding='utf-8') as f:
                        reader = csv.reader(f)
                        header = next(reader, None)
                        if not header:
                            Path(temp_file_path).unlink(missing_ok=True)
                            file_results.append({'file_name': file_name, 'status': 'failed', 'error': 'File is empty or missing header row.'})
                            continue

                    source_label, target_label, source_col, target_col, errors = parse_relationship_header(header)
                    if errors:
                        Path(temp_file_path).unlink(missing_ok=True)
                        file_results.append({'file_name': file_name, 'status': 'failed', 'error': 'Invalid relationship file format. Header: Label:source_id, Label:target_id, ...'})
                        continue

                    relationship_type = Path(file_name).stem
                    task = UploadTask.objects.create(
                        dataset=dataset,
                        file_name=file_name,
                        file_type='relationship',
                        file_path=temp_file_path,  # Temporary file path
                        relationship_type=relationship_type,
                        source_label=source_label,
                        target_label=target_label,
                        status='pending'
                    )
                    created_tasks.append(task)
                    file_results.append({'file_name': file_name, 'status': 'accepted', 'task_id': task.id})
                    dataset.total_files += 1
                    dataset.save(update_fields=['total_files', 'updated_at'])
                    start_upload_task(task.id)
                    
                except Exception as e:
                    logger.error(f"Error processing file {file_name}: {e}", exc_info=True)
                    file_results.append({'file_name': file_name, 'status': 'failed', 'error': str(e)})
            
            dataset.refresh_from_db()
            response_data = {
                'dataset': DatasetSerializer(dataset).data,
                'file_results': file_results,
                'summary': {
                    'total': len(files),
                    'accepted': sum(1 for r in file_results if r['status'] == 'accepted'),
                    'failed': sum(1 for r in file_results if r['status'] == 'failed'),
                }
            }
            
            # Return 201 if at least one file was accepted, 400 if all failed
            if any(r['status'] == 'accepted' for r in file_results):
                return Response(response_data, status=status.HTTP_201_CREATED)
            else:
                return Response(response_data, status=status.HTTP_400_BAD_REQUEST)
        
        except Exception as e:
            logger.error(f"Error uploading relationship files: {e}", exc_info=True)
            for task in created_tasks:
                if task.file_path and Path(task.file_path).exists():
                    Path(task.file_path).unlink(missing_ok=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class DatasetListView(APIView):
    """GET list of datasets (counts updated on detail fetch)."""

    def get(self, request):
        datasets = Dataset.objects.all().order_by('-created_at')
        serializer = DatasetListSerializer(datasets, many=True)
        return Response(serializer.data)


class DatasetDetailView(APIView):
    """GET/PUT dataset; GET ?include_metadata=true adds summary and node/relationship counts."""

    def get(self, request, pk):
        try:
            dataset = Dataset.objects.prefetch_related('upload_tasks').get(pk=pk)
            serializer = DatasetSerializer(dataset)
            data = dict(serializer.data)
            include_metadata = request.query_params.get('include_metadata', 'false').strip().lower() == 'true'
            if include_metadata:
                summary_data = async_to_sync(fetch_dataset_summary)(dataset)
                data['summary'] = summary_data['summary']
                data['node_summary'] = summary_data['node_summary']
                data['relationship_summary'] = summary_data['relationship_summary']
                s = summary_data['summary']
                if s['total_nodes'] != dataset.total_nodes or s['total_relationships'] != dataset.total_relationships:
                    dataset.total_nodes = s['total_nodes']
                    dataset.total_relationships = s['total_relationships']
                    dataset.save(update_fields=['total_nodes', 'total_relationships', 'updated_at'])
            return Response(data)
        except Dataset.DoesNotExist:
            return Response(
                {'error': 'Dataset not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error retrieving dataset {pk}: {e}", exc_info=True)
            return Response(
                {'error': 'Internal server error'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def put(self, request, pk):
        try:
            dataset = Dataset.objects.get(pk=pk)
        except Dataset.DoesNotExist:
            return Response(
                {'error': 'Dataset not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        if 'name' in request.data:
            dataset.name = request.data['name']
        if 'description' in request.data:
            dataset.description = request.data.get('description', '')
        if 'cascade_delete' in request.data:
            dataset.cascade_delete = request.data.get('cascade_delete', False)
        
        try:
            dataset.save()
            serializer = DatasetSerializer(dataset)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Error updating dataset {pk}: {e}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


def _node_record_to_row(record_n):
    """Flatten Neo4j node to dict; drop dataset_id."""
    if record_n is None:
        return None
    if isinstance(record_n, dict):
        row = dict(record_n)
    else:
        props = getattr(record_n, 'properties', None)
        if props is not None:
            row = dict(props)
        else:
            try:
                row = dict(record_n)
            except (TypeError, ValueError):
                row = {}
    row.pop('dataset_id', None)
    return row


class DatasetNodeSampleView(APIView):
    """GET sample rows for a node label (?limit=5)."""

    def get(self, request, pk, node_label: str):
        try:
            dataset = Dataset.objects.get(pk=pk)
        except Dataset.DoesNotExist:
            return Response(
                {'error': 'Dataset not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        limit = min(int(request.query_params.get('limit', 5)), 20)
        label_escaped = _escape_node_label(node_label)

        async def run():
            query = f"MATCH (n:{label_escaped}) WHERE n.dataset_id = $dataset_id RETURN n LIMIT {limit}"
            results = await neo4j_client.execute_query(query, {'dataset_id': dataset.id})
            if not results:
                query_fallback = f"MATCH (n:{label_escaped}) RETURN n LIMIT {limit}"
                results = await neo4j_client.execute_query(query_fallback)
            rows = []
            columns_set = set()
            for record in (results or [])[:limit]:
                n = record.get('n')
                row = _node_record_to_row(n)
                if row is None:
                    continue
                rows.append(row)
                columns_set.update(row.keys())
            return {'columns': sorted(columns_set), 'rows': rows}

        try:
            out = async_to_sync(run)()
            return Response(out)
        except Exception as e:
            logger.exception("Node sample failed for label %s: %s", node_label, e)
            return Response(
                {'error': str(e), 'columns': [], 'rows': []},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class DatasetDownloadView(APIView):
    """GET CSV/ZIP; query params: file_type, node_label, relationship_type, as_zip."""

    def get(self, request, pk):
        try:
            dataset = Dataset.objects.prefetch_related('upload_tasks').get(pk=pk)
        except Dataset.DoesNotExist:
            return Response(
                {'error': 'Dataset not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get query parameters
        file_type = request.query_params.get('file_type', None)
        node_label = request.query_params.get('node_label', None)
        relationship_type = request.query_params.get('relationship_type', None)
        as_zip = request.query_params.get('as_zip', 'false').lower() == 'true'
        
        # Async function to generate CSV from Neo4j
        async def generate_csv_from_neo4j():
            files_to_download = []
            
            # Get tasks to determine what to download
            tasks = list(dataset.upload_tasks.all())
            
            if node_label:
                # Download specific node label
                tasks = [t for t in tasks if t.file_type == 'node' and t.node_label == node_label]
                if not tasks:
                    return None, {'error': f'No node file found for label: {node_label}'}
                
                task = tasks[0]
                # Query nodes from Neo4j
                query = f"MATCH (n:{node_label}) WHERE n.dataset_id = $dataset_id RETURN n"
                results = await neo4j_client.execute_query(query, {'dataset_id': dataset.id})
                
                if not results:
                    return None, {'error': f'No nodes found for label: {node_label}'}
                
                # Generate CSV
                csv_data = self._generate_node_csv(results, node_label)
                files_to_download.append((f'{node_label}.csv', csv_data))
                
            elif relationship_type:
                # Download specific relationship type
                tasks = [t for t in tasks if t.file_type == 'relationship' and t.relationship_type == relationship_type]
                if not tasks:
                    return None, {'error': f'No relationship file found for type: {relationship_type}'}
                
                task = tasks[0]
                # Query relationships from Neo4j
                rel_type_escaped = f"`{relationship_type}`" if not relationship_type.replace('_', '').isalnum() else relationship_type
                query = f"MATCH (a)-[r:{rel_type_escaped}]->(b) WHERE r.dataset_id = $dataset_id RETURN a, r, b, labels(a) as source_labels, labels(b) as target_labels"
                results = await neo4j_client.execute_query(query, {'dataset_id': dataset.id})
                
                if not results:
                    return None, {'error': f'No relationships found for type: {relationship_type}'}
                
                # Generate CSV with Label:source_id format
                csv_data = self._generate_relationship_csv(results, task.source_label, task.target_label, relationship_type)
                files_to_download.append((f'{relationship_type}.csv', csv_data))
                
            elif file_type == 'node':
                # Download all node files
                node_tasks = [t for t in tasks if t.file_type == 'node']
                for task in node_tasks:
                    if not task.node_label:
                        continue
                    query = f"MATCH (n:{task.node_label}) WHERE n.dataset_id = $dataset_id RETURN n"
                    results = await neo4j_client.execute_query(query, {'dataset_id': dataset.id})
                    if results:
                        csv_data = self._generate_node_csv(results, task.node_label)
                        files_to_download.append((f'{task.node_label}.csv', csv_data))
                        
            elif file_type == 'relationship':
                # Download all relationship files
                rel_tasks = [t for t in tasks if t.file_type == 'relationship']
                for task in rel_tasks:
                    if not task.relationship_type:
                        continue
                    rel_type_escaped = f"`{task.relationship_type}`" if not task.relationship_type.replace('_', '').isalnum() else task.relationship_type
                    query = f"MATCH (a)-[r:{rel_type_escaped}]->(b) WHERE r.dataset_id = $dataset_id RETURN a, r, b, labels(a) as source_labels, labels(b) as target_labels"
                    results = await neo4j_client.execute_query(query, {'dataset_id': dataset.id})
                    if results:
                        csv_data = self._generate_relationship_csv(results, task.source_label, task.target_label, task.relationship_type)
                        files_to_download.append((f'{task.relationship_type}.csv', csv_data))
            else:
                node_tasks = [t for t in tasks if t.file_type == 'node']
                for task in node_tasks:
                    if not task.node_label:
                        continue
                    query = f"MATCH (n:{task.node_label}) WHERE n.dataset_id = $dataset_id RETURN n"
                    results = await neo4j_client.execute_query(query, {'dataset_id': dataset.id})
                    if results:
                        csv_data = self._generate_node_csv(results, task.node_label)
                        files_to_download.append((f'{task.node_label}.csv', csv_data))
                rel_tasks = [t for t in tasks if t.file_type == 'relationship']
                for task in rel_tasks:
                    if not task.relationship_type:
                        continue
                    rel_type_escaped = f"`{task.relationship_type}`" if not task.relationship_type.replace('_', '').isalnum() else task.relationship_type
                    query = f"MATCH (a)-[r:{rel_type_escaped}]->(b) WHERE r.dataset_id = $dataset_id RETURN a, r, b, labels(a) as source_labels, labels(b) as target_labels"
                    results = await neo4j_client.execute_query(query, {'dataset_id': dataset.id})
                    if results:
                        csv_data = self._generate_relationship_csv(results, task.source_label, task.target_label, task.relationship_type)
                        files_to_download.append((f'{task.relationship_type}.csv', csv_data))
            
            if not files_to_download:
                return None, {'error': 'No data found to download'}
            
            return files_to_download, None

        try:
            files_to_download, error = async_to_sync(generate_csv_from_neo4j)()
            if error:
                return Response(error, status=status.HTTP_404_NOT_FOUND)
            if len(files_to_download) == 1 and not as_zip:
                filename, csv_data = files_to_download[0]
                response = StreamingHttpResponse(csv_data, content_type='text/csv')
                response['Content-Disposition'] = f'attachment; filename="{filename}"'
                return response
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
            with zipfile.ZipFile(temp_file.name, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for filename, csv_data in files_to_download:
                    zip_file.writestr(filename, csv_data.getvalue() if hasattr(csv_data, 'getvalue') else csv_data)
            if node_label:
                zip_filename = f'{dataset.name}_{node_label}.zip'
            elif relationship_type:
                zip_filename = f'{dataset.name}_{relationship_type}.zip'
            elif file_type:
                zip_filename = f'{dataset.name}_{file_type}s.zip'
            else:
                zip_filename = f'{dataset.name}_dataset.zip'
            
            zip_path = Path(temp_file.name)
            response = FileResponse(
                open(zip_path, 'rb'),
                as_attachment=True,
                filename=zip_filename
            )
            response['Content-Disposition'] = f'attachment; filename="{zip_filename}"'
            return response
        
        except Exception as e:
            logger.error(f"Error downloading dataset {pk}: {e}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def _generate_node_csv(self, results, label):
        """Stream CSV from node results."""
        if not results:
            return io.StringIO()
        
        # Get all property keys from first node
        first_node = results[0].get('n', {})
        if isinstance(first_node, dict):
            # Extract properties from node dict
            properties = {k: v for k, v in first_node.items() if k != 'dataset_id'}
        else:
            properties = {}
        
        # Create CSV
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=['id'] + list(properties.keys()))
        writer.writeheader()
        
        for record in results:
            node = record.get('n', {})
            if isinstance(node, dict):
                row = {k: v for k, v in node.items() if k != 'dataset_id'}
                writer.writerow(row)
        
        output.seek(0)
        return output
    
    def _generate_relationship_csv(self, results, source_label, target_label, relationship_type):
        """Stream CSV with Label:source_id, Label:target_id header."""
        if not results:
            return io.StringIO()
        
        # Get property keys from first relationship
        first_rel = results[0].get('r', {})
        rel_properties = {}
        if isinstance(first_rel, dict):
            rel_properties = {k: v for k, v in first_rel.items() if k not in ['dataset_id']}
        
        # Create CSV with Label:source_id format
        output = io.StringIO()
        fieldnames = [f'{source_label}:source_id', f'{target_label}:target_id'] + list(rel_properties.keys())
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        
        for record in results:
            source_node = record.get('a', {})
            target_node = record.get('b', {})
            rel = record.get('r', {})
            
            row = {}
            if isinstance(source_node, dict):
                row[f'{source_label}:source_id'] = source_node.get('id', '')
            if isinstance(target_node, dict):
                row[f'{target_label}:target_id'] = target_node.get('id', '')
            if isinstance(rel, dict):
                for key, value in rel.items():
                    if key not in ['dataset_id']:
                        row[key] = value
            
            writer.writerow(row)
        
        output.seek(0)
        return output


class DatasetDeleteView(APIView):
    """DELETE dataset (cascade deletes tasks)."""

    def delete(self, request, pk):
        try:
            dataset = Dataset.objects.get(pk=pk)
            
            # Delete dataset (cascade will delete tasks)
            # Note: No need to delete uploads folder as we're using temp files now
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
    """GET upload task status by ID."""

    def get(self, request, pk):
        try:
            task = UploadTask.objects.get(pk=pk)
            serializer = UploadTaskSerializer(task)
            return Response(serializer.data)
        except UploadTask.DoesNotExist:
            return Response(
                {'error': 'Task not found'},
                status=status.HTTP_404_NOT_FOUND
            )
