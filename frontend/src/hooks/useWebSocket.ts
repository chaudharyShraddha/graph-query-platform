/**
 * React hook for WebSocket connections
 */
import { useEffect, useRef, useCallback } from 'react';
import { websocketManager } from '@/services/websocket';
import type { WebSocketMessage } from '@/types';

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

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = { onMessage, onConnect, onDisconnect, onError };
  }, [onMessage, onConnect, onDisconnect, onError]);

  // Wrapped callbacks that use the ref
  const handleMessage = useCallback((message: WebSocketMessage) => {
    callbacksRef.current.onMessage?.(message);
  }, []);

  const handleConnect = useCallback(() => {
    callbacksRef.current.onConnect?.();
  }, []);

  const handleDisconnect = useCallback(() => {
    callbacksRef.current.onDisconnect?.();
  }, []);

  const handleError = useCallback((error: Event) => {
    callbacksRef.current.onError?.(error);
  }, []);

  // Connect/disconnect effect
  useEffect(() => {
    if (!enabled || !taskId) {
      websocketManager.disconnect();
      return;
    }

    websocketManager.connect({
      taskId,
      onMessage: handleMessage,
      onConnect: handleConnect,
      onDisconnect: handleDisconnect,
      onError: handleError,
    });

    // Cleanup on unmount or when taskId changes
    return () => {
      websocketManager.disconnect();
    };
  }, [taskId, enabled, handleMessage, handleConnect, handleDisconnect, handleError]);

  // Request status when connected
  useEffect(() => {
    if (enabled && taskId && websocketManager.getStatus() === 'open') {
      websocketManager.requestStatus();
    }
  }, [taskId, enabled]);

  return {
    status: websocketManager.getStatus(),
    send: (message: Record<string, any>) => websocketManager.send(message),
    requestStatus: () => websocketManager.requestStatus(),
    disconnect: () => websocketManager.disconnect(),
  };
};

