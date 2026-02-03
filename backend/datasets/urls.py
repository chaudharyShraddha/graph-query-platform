"""
URL routing for Dataset API endpoints.
"""
from django.urls import path
from datasets import views

app_name = 'datasets'

urlpatterns = [
    # Dataset endpoints
    path('', views.DatasetListView.as_view(), name='dataset-list'),
    path('upload/', views.DatasetUploadView.as_view(), name='dataset-upload'),
    path('<int:pk>/', views.DatasetDetailView.as_view(), name='dataset-detail'),
    path('<int:pk>/metadata/', views.DatasetMetadataView.as_view(), name='dataset-metadata'),
    path('<int:pk>/download/', views.DatasetDownloadView.as_view(), name='dataset-download'),
    path('<int:pk>/delete/', views.DatasetDeleteView.as_view(), name='dataset-delete'),
    
    # Task endpoints
    path('tasks/<int:pk>/', views.TaskStatusView.as_view(), name='task-status'),
]

