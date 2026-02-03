"""
API views for Query execution and management.
"""
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
    """Execute a Cypher query."""
    
    def post(self, request):
        """
        Execute a Cypher query.
        
        Body:
        - query: Cypher query string (or query_id)
        - query_id: ID of saved query (or query)
        - parameters: Optional query parameters
        - save_query: Whether to save this query
        - query_name: Name if saving query
        """
        serializer = QueryExecuteSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        data = serializer.validated_data
        cypher_query = data.get('query')
        query_id = data.get('query_id')
        parameters = data.get('parameters', {})
        save_query = data.get('save_query', False)
        
        # Get query from saved query if query_id provided
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
        
        # Execute query
        start_time = time.time()
        execution_status = 'success'
        error_message = None
        rows_returned = 0
        results = []
        
        try:
            # Execute async query
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
        
        # Create execution record
        execution = QueryExecution.objects.create(
            query=saved_query_obj,
            cypher_query=cypher_query,
            executed_by=request.user if request.user.is_authenticated else None,
            status=execution_status,
            execution_time=execution_time,
            rows_returned=rows_returned if execution_status == 'success' else None,
            error_message=error_message,
        )
        
        # Update saved query statistics if applicable
        if saved_query_obj:
            saved_query_obj.increment_execution_count(execution_time)
            # Update execution record with query reference
            execution.query = saved_query_obj
            execution.save(update_fields=['query'])
        
        # Save query if requested
        if save_query and execution_status == 'success':
            query_name = data.get('query_name', f'Query {timezone.now().strftime("%Y-%m-%d %H:%M:%S")}')
            SavedQuery.objects.create(
                name=query_name,
                cypher_query=cypher_query,
                created_by=request.user if request.user.is_authenticated else None,
            )
        
        # Return results
        return Response({
            'status': execution_status,
            'execution_time': execution_time,
            'rows_returned': rows_returned,
            'results': results,
            'error_message': error_message,
            'execution_id': execution.id,
        })


class QuerySaveView(APIView):
    """Save a query."""
    
    def post(self, request):
        """Save a Cypher query."""
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
    """List all saved queries."""
    
    def get(self, request):
        """Get list of saved queries."""
        queries = SavedQuery.objects.all().order_by('-updated_at')
        
        # Filter by favorite if requested
        favorite_only = request.query_params.get('favorite', '').lower() == 'true'
        if favorite_only:
            queries = queries.filter(is_favorite=True)
        
        serializer = SavedQueryListSerializer(queries, many=True)
        return Response(serializer.data)


class QueryHistoryView(APIView):
    """Get query execution history."""
    
    def get(self, request):
        """Get query execution history."""
        executions = QueryExecution.objects.select_related('query', 'executed_by').order_by('-executed_at')
        
        # Limit to last 100 executions
        executions = executions[:100]
        
        serializer = QueryExecutionSerializer(executions, many=True)
        return Response(serializer.data)


class QueryDetailView(APIView):
    """Get query details."""
    
    def get(self, request, pk):
        """Get query by ID."""
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
        """Delete a saved query."""
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
    """Get Neo4j schema information."""
    
    def get(self, request):
        """Get schema information from Neo4j."""
        try:
            # Get schema from Neo4j
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
