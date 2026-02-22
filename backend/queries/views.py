"""Query API: execute, save, list, detail, history, schema."""
import time
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from asgiref.sync import async_to_sync

from queries.models import SavedQuery, QueryExecution
from queries.serializers import (
    SavedQuerySerializer,
    SavedQueryListSerializer,
    QueryExecutionSerializer,
    QueryExecuteSerializer,
    QuerySaveSerializer,
)
from core.neo4j_client import neo4j_client


class QueryExecuteView(APIView):
    """POST execute Cypher (query or query_id, parameters, optional save_query)."""

    def post(self, request):
        serializer = QueryExecuteSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        data = serializer.validated_data
        cypher_query = data.get('query')
        query_id = data.get('query_id')
        parameters = data.get('parameters', {})
        save_query = data.get('save_query', False)
        saved_query_obj = None
        if query_id:
            try:
                saved_query_obj = SavedQuery.objects.get(id=query_id)
                cypher_query = saved_query_obj.cypher_query
            except SavedQuery.DoesNotExist:
                return Response(
                    {'error': 'Saved query not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
        
        if not cypher_query:
            return Response(
                {'error': 'Query is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        start_time = time.time()
        execution_status = 'success'
        error_message = None
        rows_returned = 0
        results = []
        try:
            async def execute():
                return await neo4j_client.execute_query(cypher_query, parameters)
            
            results = async_to_sync(execute)()
            rows_returned = len(results)
            execution_status = 'success'
        
        except Exception as e:
            execution_status = 'error'
            error_message = str(e)
            results = []
        
        execution_time = time.time() - start_time
        execution = QueryExecution.objects.create(
            query=saved_query_obj,
            cypher_query=cypher_query,
            executed_by=request.user if request.user.is_authenticated else None,
            status=execution_status,
            execution_time=execution_time,
            rows_returned=rows_returned if execution_status == 'success' else None,
            error_message=error_message,
        )
        if saved_query_obj:
            saved_query_obj.increment_execution_count(execution_time)
            # Update execution record with query reference
            execution.query = saved_query_obj
            execution.save(update_fields=['query'])
        if save_query and execution_status == 'success':
            query_name = data.get('query_name', f'Query {timezone.now().strftime("%Y-%m-%d %H:%M:%S")}')
            SavedQuery.objects.create(
                name=query_name,
                cypher_query=cypher_query,
                created_by=request.user if request.user.is_authenticated else None,
            )
        return Response({
            'status': execution_status,
            'execution_time': execution_time,
            'rows_returned': rows_returned,
            'results': results,
            'error_message': error_message,
            'execution_id': execution.id,
        })


class QuerySaveView(APIView):
    """POST save a query (name, description, cypher_query, tags, is_favorite)."""

    def post(self, request):
        serializer = QuerySaveSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        saved_query = SavedQuery.objects.create(
            name=serializer.validated_data['name'],
            description=serializer.validated_data.get('description', ''),
            cypher_query=serializer.validated_data['cypher_query'],
            tags=serializer.validated_data.get('tags', []),
            is_favorite=serializer.validated_data.get('is_favorite', False),
            created_by=request.user if request.user.is_authenticated else None,
        )
        
        response_serializer = SavedQuerySerializer(saved_query)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class QueryListView(APIView):
    """GET saved queries; ?favorite=true to filter."""

    def get(self, request):
        queryset = SavedQuery.objects.select_related('created_by').order_by('-updated_at')
        favorite_only = request.query_params.get('favorite', '').lower() == 'true'
        if favorite_only:
            queryset = queryset.filter(is_favorite=True)
        
        serializer = SavedQueryListSerializer(queryset, many=True)
        return Response(serializer.data)


class QueryHistoryView(APIView):
    """GET last 100 query executions."""

    def get(self, request):
        queryset = QueryExecution.objects.select_related(
            'query',
            'executed_by'
        ).order_by('-executed_at')[:100]  # Limit to last 100 executions
        
        serializer = QueryExecutionSerializer(queryset, many=True)
        return Response(serializer.data)


class QueryDetailView(APIView):
    """GET or DELETE a saved query by ID."""

    def get(self, request, pk):
        try:
            query = SavedQuery.objects.get(pk=pk)
            serializer = SavedQuerySerializer(query)
            return Response(serializer.data)
        except SavedQuery.DoesNotExist:
            return Response(
                {'error': 'Query not found'},
                status=status.HTTP_404_NOT_FOUND
            )

    def delete(self, request, pk):
        try:
            query = SavedQuery.objects.get(pk=pk)
            query.delete()
            return Response(
                {'message': 'Query deleted successfully'},
                status=status.HTTP_204_NO_CONTENT
            )
        except SavedQuery.DoesNotExist:
            return Response(
                {'error': 'Query not found'},
                status=status.HTTP_404_NOT_FOUND
            )


class SchemaView(APIView):
    """GET Neo4j schema (node labels, relationship types, counts)."""

    def get(self, request):
        try:
            async def get_schema():
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
                
                return {
                    'node_labels': [
                        {
                            'label': label,
                            'count': node_counts.get(label, 0),
                            'properties': schema['properties'].get(label, [])
                        }
                        for label in schema['node_labels']
                    ],
                    'relationship_types': [
                        {
                            'type': rel_type,
                            'count': rel_counts.get(rel_type, 0)
                        }
                        for rel_type in schema['relationship_types']
                    ],
                    'total_nodes': sum(node_counts.values()),
                    'total_relationships': sum(rel_counts.values()),
                }
            
            schema_data = async_to_sync(get_schema)()
            return Response(schema_data)
        
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
