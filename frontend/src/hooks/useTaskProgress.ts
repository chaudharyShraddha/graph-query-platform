/**
 * Hook to manage task progress via WebSocket
 */
import { useEffect } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { setUploadProgress, setTaskStatus } from '@/store/slices/datasetsSlice';
import { useWebSocket } from './useWebSocket';
import type { WebSocketMessage } from '@/types';

interface UseTaskProgressOptions {
  taskId: number | null;
  enabled?: boolean;
}

/**
 * Hook to track task progress via WebSocket
 */
export const useTaskProgress = ({ taskId, enabled = true }: UseTaskProgressOptions) => {
  const dispatch = useAppDispatch();

  const handleMessage = (message: WebSocketMessage) => {
    if (!taskId) return;

    // Handle progress updates
    if (message.type === 'progress' && message.data) {
      const progress = message.data.percentage || message.data.progress_percentage || 0;
      dispatch(setUploadProgress({ taskId, progress }));
      // Also update task status with progress
      dispatch(setTaskStatus({
        taskId,
        status: 'processing',
        progress,
        message: message.data.message,
      }));
    }
    // Handle status updates
    else if (message.type === 'status' && message.data) {
      const status = message.data.status || 'pending';
      const progress = message.data.percentage || message.data.progress_percentage || 0;
      dispatch(setTaskStatus({
        taskId,
        status,
        progress,
        message: message.data.message,
        error: message.data.error || message.data.error_message,
      }));
      if (progress > 0) {
        dispatch(setUploadProgress({ taskId, progress }));
      }
    }
    // Handle connection message with initial task data
    else if (message.type === 'connection' && message.task) {
      const task = message.task;
      const progress = task.progress_percentage || 0;
      dispatch(setTaskStatus({
        taskId,
        status: task.status,
        progress,
        message: message.message,
        error: task.error_message,
      }));
      if (progress > 0) {
        dispatch(setUploadProgress({ taskId, progress }));
      }
    }
    // Handle error messages
    else if (message.type === 'error') {
      dispatch(setTaskStatus({
        taskId,
        status: 'failed',
        error: message.data?.message || message.message || 'An error occurred',
      }));
    }
  };

  const { status, requestStatus } = useWebSocket({
    taskId,
    onMessage: handleMessage,
    enabled,
  });

  // Request status when connected
  useEffect(() => {
    if (status === 'open' && taskId) {
      requestStatus();
    }
  }, [status, taskId, requestStatus]);

  return {
    status,
    isConnected: status === 'open',
    isConnecting: status === 'connecting',
  };
};

