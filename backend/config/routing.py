"""
WebSocket URL routing for the application.
"""

from django.urls import re_path

from core.consumers import TaskProgressConsumer

websocket_urlpatterns = [
    re_path(r'ws/tasks/(?P<task_id>\d+)/$', TaskProgressConsumer.as_asgi()),
]
