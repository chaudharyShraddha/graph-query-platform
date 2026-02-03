"""
Serializers for Query API endpoints.
"""
from rest_framework import serializers
from queries.models import SavedQuery, QueryExecution


class SavedQuerySerializer(serializers.ModelSerializer):
    """Serializer for SavedQuery model."""
    
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    
    class Meta:
        model = SavedQuery
        fields = [
            'id',
            'name',
            'description',
            'cypher_query',
            'created_by',
            'created_by_username',
            'created_at',
            'updated_at',
            'last_executed_at',
            'execution_count',
            'average_execution_time',
            'tags',
            'is_favorite',
        ]
        read_only_fields = [
            'id',
            'created_by',
            'created_at',
            'updated_at',
            'last_executed_at',
            'execution_count',
            'average_execution_time',
        ]


class SavedQueryListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for query list view."""
    
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    
    class Meta:
        model = SavedQuery
        fields = [
            'id',
            'name',
            'description',
            'created_by_username',
            'created_at',
            'updated_at',
            'last_executed_at',
            'execution_count',
            'is_favorite',
            'tags',
        ]


class QueryExecutionSerializer(serializers.ModelSerializer):
    """Serializer for QueryExecution model."""
    
    executed_by_username = serializers.CharField(source='executed_by.username', read_only=True)
    query_name = serializers.CharField(source='query.name', read_only=True)
    
    class Meta:
        model = QueryExecution
        fields = [
            'id',
            'query',
            'query_name',
            'cypher_query',
            'executed_by',
            'executed_by_username',
            'status',
            'execution_time',
            'rows_returned',
            'error_message',
            'executed_at',
        ]
        read_only_fields = [
            'id',
            'executed_by',
            'executed_at',
        ]


class QueryExecuteSerializer(serializers.Serializer):
    """Serializer for query execution request."""
    query = serializers.CharField(required=False, allow_blank=True)
    query_id = serializers.IntegerField(required=False)
    parameters = serializers.DictField(required=False, default=dict)
    save_query = serializers.BooleanField(required=False, default=False)
    query_name = serializers.CharField(required=False, max_length=255)
    
    def validate(self, data):
        """Validate that either query or query_id is provided."""
        if not data.get('query') and not data.get('query_id'):
            raise serializers.ValidationError("Either 'query' or 'query_id' must be provided")
        return data


class QuerySaveSerializer(serializers.Serializer):
    """Serializer for saving a query."""
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)
    cypher_query = serializers.CharField()
    tags = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list
    )
    is_favorite = serializers.BooleanField(required=False, default=False)

