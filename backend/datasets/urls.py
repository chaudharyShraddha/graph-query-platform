"""
URL routing for Dataset API endpoints.
"""
from django.urls import path
from datasets import views

app_name = 'datasets'

urlpatterns = [
    # Dataset endpoints
    path('', views.DatasetListView.as_view(), name='dataset-list'),
    path('create/', views.DatasetCreateView.as_view(), name='dataset-create'),
    path('<int:pk>/', views.DatasetDetailView.as_view(), name='dataset-detail'),
    path('<int:pk>/upload-nodes/', views.NodeUploadView.as_view(), name='dataset-upload-nodes'),
    path('<int:pk>/upload-relationships/', views.RelationshipUploadView.as_view(), name='dataset-upload-relationships'),
    path('<int:pk>/nodes/<str:node_label>/sample/', views.DatasetNodeSampleView.as_view(), name='dataset-node-sample'),
    path('<int:pk>/download/', views.DatasetDownloadView.as_view(), name='dataset-download'),
    path('<int:pk>/delete/', views.DatasetDeleteView.as_view(), name='dataset-delete'),
    
    # Task endpoints
    path('tasks/<int:pk>/', views.TaskStatusView.as_view(), name='task-status'),
]

