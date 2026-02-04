/**
 * Task progress component that uses WebSocket for real-time updates
 */
import { useEffect, useRef } from 'react';
import { useAppSelector } from '@/store/hooks';
import { useTaskProgress } from '@/hooks/useTaskProgress';
import './TaskProgress.css';

interface TaskProgressProps {
  taskId: number;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

const TaskProgress = ({ taskId, onComplete, onError }: TaskProgressProps) => {
  const taskStatus = useAppSelector((state) => state.datasets.taskStatuses[taskId]);
  const progress = useAppSelector((state) => state.datasets.uploadProgress[taskId] || 0);
  const callbacksRef = useRef({ onComplete, onError });
  const completedRef = useRef(false);
  const erroredRef = useRef(false);

  // Update callbacks ref
  useEffect(() => {
    callbacksRef.current = { onComplete, onError };
  }, [onComplete, onError]);

  const { isConnected } = useTaskProgress({
    taskId,
    enabled: true,
  });

  // Handle callbacks when status changes
  useEffect(() => {
    if (taskStatus?.status === 'completed' && !completedRef.current) {
      completedRef.current = true;
      callbacksRef.current.onComplete?.();
    } else if (taskStatus?.status === 'failed' && !erroredRef.current) {
      erroredRef.current = true;
      callbacksRef.current.onError?.(taskStatus.error || 'Task failed');
    }
  }, [taskStatus?.status, taskStatus?.error]);

  const currentStatus = taskStatus?.status || 'pending';
  const currentProgress = taskStatus?.progress ?? progress;
  const errorMessage = taskStatus?.error || taskStatus?.message;

  return (
    <div className="task-progress">
      <div className="task-progress-header">
        <span className="task-progress-title">Task #{taskId}</span>
        <span className={`task-progress-status status-${currentStatus}`}>
          {currentStatus}
        </span>
        {!isConnected && (
          <span className="task-progress-connection">Connecting...</span>
        )}
      </div>

      {currentStatus === 'processing' && (
        <div className="task-progress-bar">
          <div
            className="task-progress-bar-fill"
            style={{ width: `${currentProgress}%` }}
          />
        </div>
      )}

      <div className="task-progress-info">
        {currentStatus === 'processing' && (
          <span className="task-progress-percentage">{Math.round(currentProgress)}%</span>
        )}
        {errorMessage && (
          <div className="task-progress-error">{errorMessage}</div>
        )}
        {taskStatus?.message && currentStatus !== 'failed' && (
          <span className="task-progress-message">{taskStatus.message}</span>
        )}
      </div>
    </div>
  );
};

export default TaskProgress;

