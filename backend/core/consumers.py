"""
WebSocket consumers for real-time task progress updates.
"""
import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

from datasets.models import UploadTask

logger = logging.getLogger(__name__)


class TaskProgressConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer for task progress updates."""
    
    async def connect(self):
        """Handle WebSocket connection."""
        # Get task_id from URL route
        self.task_id = self.scope['url_route']['kwargs']['task_id']
        self.room_group_name = f"task_{self.task_id}"
        
        # Verify task exists
        task_exists = await self.task_exists(self.task_id)
        if not task_exists:
            await self.close()
            return
        
        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        # Accept connection
        await self.accept()
        
        # Send initial task status
        task_data = await self.get_task_data(self.task_id)
        await self.send(text_data=json.dumps({
            'type': 'connection',
            'task_id': self.task_id,
            'message': 'Connected to task updates',
            'task': task_data
        }))
        
        logger.info(f"WebSocket connected for task {self.task_id}")
    
    async def disconnect(self, close_code):
        """Handle WebSocket disconnection."""
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        logger.info(f"WebSocket disconnected for task {self.task_id}")
    
    async def receive(self, text_data):
        """Handle messages received from WebSocket."""
        try:
            data = json.loads(text_data)
            message_type = data.get('type', 'unknown')
            
            if message_type == 'ping':
                # Respond to ping with pong
                await self.send(text_data=json.dumps({
                    'type': 'pong',
                    'task_id': self.task_id
                }))
            elif message_type == 'get_status':
                # Send current task status in shape frontend expects (data.status, data.percentage, etc.)
                task_data = await self.get_task_data(self.task_id)
                if task_data is not None:
                    await self.send(text_data=json.dumps({
                        'type': 'status',
                        'task_id': self.task_id,
                        'task': task_data,
                        'data': {
                            'status': task_data.get('status', 'pending'),
                            'percentage': task_data.get('progress_percentage') or 0,
                            'progress_percentage': task_data.get('progress_percentage') or 0,
                            'message': task_data.get('error_message') or None,
                            'error': task_data.get('error_message'),
                            'error_message': task_data.get('error_message'),
                        }
                    }))
                else:
                    await self.send(text_data=json.dumps({
                        'type': 'status',
                        'task_id': self.task_id,
                        'data': {'status': 'pending', 'percentage': 0}
                    }))
            else:
                logger.warning(f"Unknown message type: {message_type}")
        
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON received: {text_data}")
        except Exception as e:
            logger.error(f"Error handling WebSocket message: {e}")
    
    async def task_update(self, event):
        """
        Handle task update messages from channel layer.
        This method receives messages sent via channel_layer.group_send()
        """
        update_type = event.get('update_type', 'unknown')
        data = event.get('data', {})
        
        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            'type': update_type,
            'task_id': self.task_id,
            'data': data,
            'timestamp': event.get('timestamp')
        }))
    
    @database_sync_to_async
    def task_exists(self, task_id):
        """Check if task exists in database."""
        try:
            return UploadTask.objects.filter(id=task_id).exists()
        except Exception:
            return False
    
    @database_sync_to_async
    def get_task_data(self, task_id):
        """Get current task data from database."""
        try:
            task = UploadTask.objects.get(id=task_id)
            return {
                'id': task.id,
                'file_name': task.file_name,
                'file_type': task.file_type,
                'status': task.status,
                'progress_percentage': task.progress_percentage,
                'processed_rows': task.processed_rows,
                'total_rows': task.total_rows,
                'error_message': task.error_message,
                'started_at': task.started_at.isoformat() if task.started_at else None,
                'completed_at': task.completed_at.isoformat() if task.completed_at else None,
            }
        except UploadTask.DoesNotExist:
            return None
        except Exception as e:
            logger.error(f"Error getting task data: {e}")
            return None

