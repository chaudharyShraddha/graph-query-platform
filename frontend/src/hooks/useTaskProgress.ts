/** Poll task status API for upload progress (used when WebSocket not needed). */
import { useEffect, useRef } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { setTaskStatus } from '@/store/slices/datasetsSlice';
import { datasetsApi } from '@/services/datasets';

const POLL_INTERVAL_MS = 2000;

interface UseTaskProgressOptions {
  taskId: number | null;
  enabled?: boolean;
}

export const useTaskProgress = ({ taskId, enabled = true }: UseTaskProgressOptions) => {
  const dispatch = useAppDispatch();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled || !taskId) return;

    const poll = async () => {
      try {
        const task = await datasetsApi.getTaskStatus(taskId);
        const progress = task.progress_percentage ?? 0;
        dispatch(setTaskStatus({
          taskId,
          status: task.status,
          progress,
          message: task.error_message,
          error: task.error_message,
        }));
        if (task.status === 'completed' || task.status === 'failed') {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch {
        // Task may not exist yet
      }
    };

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [taskId, enabled, dispatch]);

  return {
    status: 'open' as const,
    isConnected: true,
    isConnecting: false,
  };
};

