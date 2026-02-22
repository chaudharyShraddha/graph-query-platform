/** WebSocket for task progress: reconnect, ping/pong, message handler. */
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

  connect(config: WebSocketConfig): void {
    this.config = config;
    this.isManualClose = false;
    this.reconnectAttempts = 0;
    this.connectInternal();
  }

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
        } catch {
          // Ignore parse errors
        }
      };

      this.ws.onerror = (error) => {
        this.config?.onError?.(error);
      };

      this.ws.onclose = () => {
        this.stopPingInterval();
        this.config?.onDisconnect?.();
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

  private handleMessage(message: WebSocketMessage): void {
    if (message.type === 'pong') return;
    this.config?.onMessage?.(message);
  }

  send(message: Record<string, any>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private sendPing(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'ping' });
    }
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, this.pingIntervalMs);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  requestStatus(): void {
    this.send({ type: 'get_status' });
  }

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

  /** WS URL from VITE_WS_HOST or API host (so backend receives connection). */
  private getWebSocketUrl(taskId: number): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let host: string;
    if (import.meta.env.VITE_WS_HOST) {
      host = import.meta.env.VITE_WS_HOST;
    } else {
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
      try {
        host = new URL(apiUrl).host;
      } catch {
        host = window.location.host;
      }
    }
    return `${protocol}//${host}/ws/tasks/${taskId}/`;
  }
}

export const websocketManager = new WebSocketManager();

