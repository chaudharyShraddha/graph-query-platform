from django.db import models
from django.utils import timezone


class SavedQuery(models.Model):
    """Model to store saved Cypher queries."""
    
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    cypher_query = models.TextField()
    
    # Metadata
    created_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='saved_queries'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Query metadata
    last_executed_at = models.DateTimeField(null=True, blank=True)
    execution_count = models.IntegerField(default=0)
    average_execution_time = models.FloatField(null=True, blank=True)  # in seconds
    
    # Tags for organization
    tags = models.JSONField(default=list, blank=True)
    
    # Favorite flag
    is_favorite = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'Saved Query'
        verbose_name_plural = 'Saved Queries'
        indexes = [
            models.Index(fields=['created_by']),
            models.Index(fields=['is_favorite']),
        ]
    
    def __str__(self):
        return self.name
    
    def increment_execution_count(self, execution_time: float = None):
        """Increment execution count and update average execution time."""
        self.execution_count += 1
        self.last_executed_at = timezone.now()
        
        if execution_time is not None:
            if self.average_execution_time is None:
                self.average_execution_time = execution_time
            else:
                # Calculate running average
                self.average_execution_time = (
                    (self.average_execution_time * (self.execution_count - 1) + execution_time) 
                    / self.execution_count
                )
        
        self.save(update_fields=[
            'execution_count',
            'last_executed_at',
            'average_execution_time',
            'updated_at'
        ])


class QueryExecution(models.Model):
    """Model to track query execution history."""
    
    STATUS_CHOICES = [
        ('success', 'Success'),
        ('error', 'Error'),
        ('timeout', 'Timeout'),
    ]
    
    query = models.ForeignKey(
        SavedQuery,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='executions'
    )
    cypher_query = models.TextField()  # Store the actual query executed
    executed_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='query_executions'
    )
    
    # Execution results
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    execution_time = models.FloatField(null=True, blank=True)  # in seconds
    rows_returned = models.IntegerField(null=True, blank=True)
    
    # Error information
    error_message = models.TextField(blank=True, null=True)
    error_details = models.JSONField(default=dict, blank=True)
    
    # Timestamps
    executed_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-executed_at']
        verbose_name = 'Query Execution'
        verbose_name_plural = 'Query Executions'
        indexes = [
            models.Index(fields=['executed_by', 'executed_at']),
            models.Index(fields=['status']),
            models.Index(fields=['executed_at']),
        ]
    
    def __str__(self):
        return f"Query execution at {self.executed_at} ({self.status})"
