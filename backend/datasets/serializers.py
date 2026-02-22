"""Dataset and UploadTask serializers for API request/response."""
from rest_framework import serializers
from datasets.models import Dataset, UploadTask


class UploadTaskSerializer(serializers.ModelSerializer):
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
            'source_label',
            'target_label',
            'validation_warnings',
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
            'source_label',
            'target_label',
            'validation_warnings',
            'started_at',
            'completed_at',
            'created_at',
            'updated_at',
        ]


class DatasetSerializer(serializers.ModelSerializer):
    upload_tasks = UploadTaskSerializer(many=True, read_only=True)

    class Meta:
        model = Dataset
        fields = [
            'id',
            'name',
            'description',
            'status',
            'created_at',
            'updated_at',
            'total_files',
            'processed_files',
            'total_nodes',
            'total_relationships',
            'cascade_delete',
            'upload_tasks',
        ]


class DatasetListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dataset
        fields = [
            'id',
            'name',
            'description',
            'status',
            'created_at',
            'updated_at',
            'total_files',
            'processed_files',
            'total_nodes',
            'total_relationships',
            'cascade_delete',
        ]


class DatasetCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=True)
    description = serializers.CharField(required=False, allow_blank=True)
    cascade_delete = serializers.BooleanField(default=False, required=False)


class NodeUploadSerializer(serializers.Serializer):
    files = serializers.ListField(
        child=serializers.FileField(),
        allow_empty=False,
        min_length=1
    )


class RelationshipUploadSerializer(serializers.Serializer):
    files = serializers.ListField(
        child=serializers.FileField(),
        allow_empty=False,
        min_length=1
    )

