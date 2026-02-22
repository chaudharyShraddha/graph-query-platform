# Single initial migration — matches current Dataset and UploadTask models

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Dataset',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True, null=True)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('processing', 'Processing'), ('completed', 'Completed'), ('failed', 'Failed')], default='pending', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('total_files', models.IntegerField(default=0)),
                ('processed_files', models.IntegerField(default=0)),
                ('total_nodes', models.IntegerField(default=0)),
                ('total_relationships', models.IntegerField(default=0)),
                ('cascade_delete', models.BooleanField(default=False)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='datasets', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Dataset',
                'verbose_name_plural': 'Datasets',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='UploadTask',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file_name', models.CharField(max_length=255)),
                ('file_type', models.CharField(choices=[('node', 'Node'), ('relationship', 'Relationship')], max_length=20)),
                ('file_path', models.CharField(max_length=500)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('processing', 'Processing'), ('completed', 'Completed'), ('failed', 'Failed')], default='pending', max_length=20)),
                ('total_rows', models.IntegerField(default=0)),
                ('processed_rows', models.IntegerField(default=0)),
                ('progress_percentage', models.FloatField(default=0.0)),
                ('error_message', models.TextField(blank=True, null=True)),
                ('error_details', models.JSONField(blank=True, default=dict)),
                ('started_at', models.DateTimeField(blank=True, null=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('node_label', models.CharField(blank=True, max_length=100, null=True)),
                ('relationship_type', models.CharField(blank=True, max_length=100, null=True)),
                ('source_label', models.CharField(blank=True, max_length=100, null=True)),
                ('target_label', models.CharField(blank=True, max_length=100, null=True)),
                ('validation_warnings', models.JSONField(blank=True, default=list)),
                ('dataset', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='upload_tasks', to='datasets.dataset')),
            ],
            options={
                'verbose_name': 'Upload Task',
                'verbose_name_plural': 'Upload Tasks',
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['dataset', 'status'], name='datasets_up_dataset_feec5c_idx'),
                    models.Index(fields=['status'], name='datasets_up_status_10903a_idx'),
                ],
            },
        ),
    ]
