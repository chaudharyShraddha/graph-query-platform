/**
 * WebSocket manager for real-time task progress updates.
 * 
 * Provides automatic reconnection, ping/pong keepalive, and
 * robust error handling for real-time task progress tracking.
 */
import type { WebSocketMessage } from '@/types';
import {
  WS_PING_INTERVAL,
  WS_MAX_RECONNECT_ATTEMPTS,
  WS_RECONNECT_DELAY,
  WS_MAX_RECONNECT_DELAY,
} from '@/constants';

type MessageHandler = (message: WebSocketMessage) => void;
type ConnectionHandler = () => void;
type ErrorHandler = (error: Event) => void;

interface WebSocketConfig {
  taskId: number;
  onMessage?: MessageHandler;
  onConnect?: ConnectionHandler;
  onDisconnect?: ConnectionHandler;
  onError?: ErrorHandler;
}

class WebSocketManager {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = WS_MAX_RECONNECT_ATTEMPTS;
  private reconnectDelay = WS_RECONNECT_DELAY;
  private readonly maxReconnectDelay = WS_MAX_RECONNECT_DELAY;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private readonly pingIntervalMs = WS_PING_INTERVAL;
  private isManualClose = false;

  /**
   * Connect to WebSocket for a specific task
   */
  connect(config: WebSocketConfig): void {
    this.config = config;
    this.isManualClose = false;
    this.reconnectAttempts = 0;
    this.connectInternal();
  }

  /**
   * Internal connection logic
   */
  private connectInternal(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = this.getWebSocketUrl(this.config!.taskId);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.reconnectDelay = WS_RECONNECT_DELAY;
        this.config?.onConnect?.();
        this.startPingInterval();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          // Silently handle parse errors - invalid messages are ignored
        }
      };

      this.ws.onerror = (error) => {
        this.config?.onError?.(error);
      };

      this.ws.onclose = () => {
        this.stopPingInterval();
        this.config?.onDisconnect?.();

        // Attempt to reconnect if not manually closed
        if (!this.isManualClose && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      if (!this.isManualClose && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    this.reconnectTimer = setTimeout(() => {
      if (!this.isManualClose) {
        this.connectInternal();
      }
    }, delay);
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: WebSocketMessage): void {
    // Handle ping/pong
    if (message.type === 'pong') {
      return; // Pong received, connection is alive
    }

    // Call message handler
    this.config?.onMessage?.(message);
  }

  /**
   * Send message to WebSocket
   */
  send(message: Record<string, any>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send ping to keep connection alive
   */
  private sendPing(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'ping' });
    }
  }

  /**
   * Start ping interval
   */
  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, this.pingIntervalMs);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Request current task status
   */
  requestStatus(): void {
    this.send({ type: 'get_status' });
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    this.isManualClose = true;
    this.stopPingInterval();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Get WebSocket connection status
   */
  getStatus(): 'connecting' | 'open' | 'closing' | 'closed' {
    if (!this.ws) return 'closed';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'open';
      case WebSocket.CLOSING:
        return 'closing';
      default:
        return 'closed';
    }
  }

  /**
   * Get WebSocket URL for a task
   */
  private getWebSocketUrl(taskId: number): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_WS_HOST || window.location.host;
    return `${protocol}//${host}/ws/tasks/${taskId}/`;
  }
}

// Singleton instance
export const websocketManager = new WebSocketManager();

