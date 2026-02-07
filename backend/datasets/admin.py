"""
Django admin configuration for Dataset models.
"""
from django.contrib import admin
from datasets.models import Dataset, UploadTask


@admin.register(Dataset)
class DatasetAdmin(admin.ModelAdmin):
    """Admin interface for Dataset model."""
    list_display = ('id', 'name', 'status', 'total_files', 'processed_files', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('name', 'description')
    readonly_fields = ('created_at', 'updated_at', 'total_nodes', 'total_relationships')
    date_hierarchy = 'created_at'


@admin.register(UploadTask)
class UploadTaskAdmin(admin.ModelAdmin):
    """Admin interface for UploadTask model."""
    list_display = ('id', 'file_name', 'file_type', 'status', 'progress_percentage', 'dataset', 'created_at')
    list_filter = ('status', 'file_type', 'created_at')
    search_fields = ('file_name', 'node_label', 'relationship_type')
    readonly_fields = ('created_at', 'updated_at', 'started_at', 'completed_at', 'progress_percentage')
    date_hierarchy = 'created_at'
