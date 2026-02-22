from django.db import models
from django.utils import timezone


class Dataset(models.Model):
    """Model to track uploaded datasets."""
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='datasets'
    )
    
    # Metadata
    total_files = models.IntegerField(default=0)
    processed_files = models.IntegerField(default=0)
    total_nodes = models.IntegerField(default=0)
    total_relationships = models.IntegerField(default=0)
    
    # Cascade delete: when True, (1) deleting relationships cascades to related relationships;
    # (2) re-uploading a node file syncs to file: nodes not in the file are removed with their relationships.
    cascade_delete = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Dataset'
        verbose_name_plural = 'Datasets'
    
    def __str__(self):
        return f"{self.name} ({self.status})"
    
    @property
    def progress_percentage(self):
        """Calculate upload progress percentage."""
        if self.total_files == 0:
            return 0
        return int((self.processed_files / self.total_files) * 100)


class UploadTask(models.Model):
    """Model to track individual file upload tasks."""
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    
    FILE_TYPE_CHOICES = [
        ('node', 'Node'),
        ('relationship', 'Relationship'),
    ]
    
    dataset = models.ForeignKey(
        Dataset,
        on_delete=models.CASCADE,
        related_name='upload_tasks'
    )
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=20, choices=FILE_TYPE_CHOICES)
    file_path = models.CharField(max_length=500)  # Path to uploaded file
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Progress tracking
    total_rows = models.IntegerField(default=0)
    processed_rows = models.IntegerField(default=0)
    progress_percentage = models.FloatField(default=0.0)
    
    # Error tracking
    error_message = models.TextField(blank=True, null=True)
    error_details = models.JSONField(default=dict, blank=True)
    
    # Timestamps
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Neo4j metadata
    node_label = models.CharField(max_length=100, blank=True, null=True)  # For node files
    relationship_type = models.CharField(max_length=100, blank=True, null=True)  # For relationship files
    
    # Relationship-specific fields
    source_label = models.CharField(max_length=100, blank=True, null=True)  # Source node label for relationships
    target_label = models.CharField(max_length=100, blank=True, null=True)  # Target node label for relationships
    
    # Validation warnings (for skipped rows, etc.)
    validation_warnings = models.JSONField(default=list, blank=True)  # List of warning messages
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Upload Task'
        verbose_name_plural = 'Upload Tasks'
        indexes = [
            models.Index(fields=['dataset', 'status']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.file_name} ({self.status})"
    
    def update_progress(self, processed: int, total: int):
        """Update progress for this task."""
        self.processed_rows = processed
        self.total_rows = total
        if total > 0:
            self.progress_percentage = (processed / total) * 100
        self.save(update_fields=['processed_rows', 'total_rows', 'progress_percentage', 'updated_at'])
    
    def mark_started(self):
        """Mark task as started."""
        self.status = 'processing'
        self.started_at = timezone.now()
        self.save(update_fields=['status', 'started_at', 'updated_at'])
    
    def mark_completed(self):
        """Mark task as completed."""
        self.status = 'completed'
        self.completed_at = timezone.now()
        if self.total_rows > 0:
            self.progress_percentage = 100.0
        self.save(update_fields=['status', 'completed_at', 'progress_percentage', 'updated_at'])
    
    def mark_failed(self, error_message: str, error_details: dict = None):
        """Mark task as failed."""
        self.status = 'failed'
        self.error_message = error_message
        if error_details:
            self.error_details = error_details
        self.completed_at = timezone.now()
        self.save(update_fields=['status', 'error_message', 'error_details', 'completed_at', 'updated_at'])
