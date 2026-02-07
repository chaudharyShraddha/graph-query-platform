"""
Django admin configuration for Query models.
"""
from django.contrib import admin
from queries.models import SavedQuery, QueryExecution


@admin.register(SavedQuery)
class SavedQueryAdmin(admin.ModelAdmin):
    """Admin interface for SavedQuery model."""
    list_display = ('id', 'name', 'is_favorite', 'execution_count', 'created_by', 'created_at')
    list_filter = ('is_favorite', 'created_at')
    search_fields = ('name', 'description', 'cypher_query')
    readonly_fields = ('created_at', 'updated_at', 'last_executed_at', 'execution_count', 'average_execution_time')
    date_hierarchy = 'created_at'


@admin.register(QueryExecution)
class QueryExecutionAdmin(admin.ModelAdmin):
    """Admin interface for QueryExecution model."""
    list_display = ('id', 'query', 'status', 'execution_time', 'rows_returned', 'executed_by', 'executed_at')
    list_filter = ('status', 'executed_at')
    search_fields = ('cypher_query', 'error_message')
    readonly_fields = ('executed_at',)
    date_hierarchy = 'executed_at'
