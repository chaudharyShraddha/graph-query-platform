"""
Serializers for Dataset API endpoints.
"""
from rest_framework import serializers
from datasets.models import Dataset, UploadTask


class UploadTaskSerializer(serializers.ModelSerializer):
    """Serializer for UploadTask model."""
    
    class Meta:
        model = UploadTask
        fields = [
            'id',
            'file_name',
            'file_type',
            'status',
            'total_rows',
            'processed_rows',
            'progress_percentage',
            'error_message',
            'node_label',
            'relationship_type',
            'started_at',
            'completed_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'status',
            'total_rows',
            'processed_rows',
            'progress_percentage',
            'error_message',
            'started_at',
            'completed_at',
            'created_at',
            'updated_at',
        ]


class DatasetSerializer(serializers.ModelSerializer):
    """Serializer for Dataset model."""
    
    upload_tasks = UploadTaskSerializer(many=True, read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    
    class Meta:
        model = Dataset
        fields = [
            'id',
            'name',
            'description',
            'status',
            'created_at',
            'updated_at',
            'created_by',
            'created_by_username',
            'total_files',
            'processed_files',
            'total_nodes',
            'total_relationships',
            'upload_tasks',
        ]
        read_only_fields = [
            'id',
            'created_at',
            'updated_at',
            'created_by',
            'total_files',
            'processed_files',
            'total_nodes',
            'total_relationships',
        ]


class DatasetListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for dataset list view."""
    
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    
    class Meta:
        model = Dataset
        fields = [
            'id',
            'name',
            'description',
            'status',
            'created_at',
            'updated_at',
            'created_by_username',
            'total_files',
            'processed_files',
            'total_nodes',
            'total_relationships',
        ]


class FileUploadSerializer(serializers.Serializer):
    """Serializer for file upload."""
    files = serializers.ListField(
        child=serializers.FileField(),
        allow_empty=False,
        min_length=1
    )
    dataset_name = serializers.CharField(max_length=255, required=False)
    dataset_description = serializers.CharField(required=False, allow_blank=True)


class DatasetMetadataSerializer(serializers.Serializer):
    """Serializer for dataset metadata."""
    node_labels = serializers.DictField()
    relationship_types = serializers.DictField()
    total_nodes = serializers.IntegerField()
    total_relationships = serializers.IntegerField()

