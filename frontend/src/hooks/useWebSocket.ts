/**
 * React hook for WebSocket connections
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { websocketManager } from '@/services/websocket';
import type { WebSocketMessage } from '@/types';

type ConnectionStatus = 'connecting' | 'open' | 'closing' | 'closed';

interface UseWebSocketOptions {
  taskId: number | null;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  enabled?: boolean;
}

/**
 * Hook to manage WebSocket connection for a task
 */
export const useWebSocket = ({
  taskId,
  onMessage,
  onConnect,
  onDisconnect,
  onError,
  enabled = true,
}: UseWebSocketOptions) => {
  const callbacksRef = useRef({ onMessage, onConnect, onDisconnect, onError });
  const [status, setStatus] = useState<ConnectionStatus>('closed');

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = { onMessage, onConnect, onDisconnect, onError };
  }, [onMessage, onConnect, onDisconnect, onError]);

  const handleMessage = useCallback((message: WebSocketMessage) => {
    callbacksRef.current.onMessage?.(message);
  }, []);

  const handleConnect = useCallback(() => {
    setStatus('open');
    callbacksRef.current.onConnect?.();
  }, []);

  const handleDisconnect = useCallback(() => {
    setStatus('closed');
    callbacksRef.current.onDisconnect?.();
  }, []);

  const handleError = useCallback((error: Event) => {
    callbacksRef.current.onError?.(error);
  }, []);

  useEffect(() => {
    if (!enabled || !taskId) {
      websocketManager.disconnect();
      setStatus('closed');
      return;
    }

    setStatus('connecting');
    websocketManager.connect({
      taskId,
      onMessage: handleMessage,
      onConnect: handleConnect,
      onDisconnect: handleDisconnect,
      onError: handleError,
    });

    return () => {
      websocketManager.disconnect();
      setStatus('closed');
    };
  }, [taskId, enabled, handleMessage, handleConnect, handleDisconnect, handleError]);

  // Request status when connected
  useEffect(() => {
    if (status === 'open' && taskId) {
      websocketManager.requestStatus();
    }
  }, [status, taskId]);

  return {
    status,
    send: (message: Record<string, any>) => websocketManager.send(message),
    requestStatus: () => websocketManager.requestStatus(),
    disconnect: () => websocketManager.disconnect(),
  };
};

