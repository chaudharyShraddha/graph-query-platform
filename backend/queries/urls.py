"""
URL routing for Query API endpoints.
"""
from django.urls import path
from queries import views

app_name = 'queries'

urlpatterns = [
    # Query execution
    path('execute/', views.QueryExecuteView.as_view(), name='query-execute'),
    
    # Query management
    path('', views.QueryListView.as_view(), name='query-list'),
    path('save/', views.QuerySaveView.as_view(), name='query-save'),
    path('<int:pk>/', views.QueryDetailView.as_view(), name='query-detail'),
    path('history/', views.QueryHistoryView.as_view(), name='query-history'),
    
    # Schema
    path('schema/', views.SchemaView.as_view(), name='schema'),
]

