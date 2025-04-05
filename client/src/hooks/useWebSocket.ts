import { useState, useEffect, useRef, useCallback } from 'react';

interface WebSocketOptions {
  onOpen?: (event: WebSocketEventMap['open']) => void;
  onMessage?: (event: WebSocketEventMap['message']) => void;
  onClose?: (event: WebSocketEventMap['close']) => void;
  onError?: (event: WebSocketEventMap['error']) => void;
  reconnectInterval?: number;
  reconnectAttempts?: number;
  autoReconnect?: boolean;
}

type WebSocketStatus = 'connecting' | 'open' | 'closing' | 'closed' | 'error';

/**
 * A hook for using WebSocket in React components
 * 
 * @param url The WebSocket URL to connect to
 * @param options Configuration options
 * @returns WebSocket instance and status
 */
export const useWebSocket = (
  url: string | null,
  {
    onOpen,
    onMessage,
    onClose,
    onError,
    reconnectInterval = 3000,
    reconnectAttempts = 5,
    autoReconnect = true,
  }: WebSocketOptions = {}
) => {
  const [status, setStatus] = useState<WebSocketStatus>('closed');
  const [lastMessage, setLastMessage] = useState<any>(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const attemptRef = useRef(0);

  // The send function that allows sending messages through the WebSocket
  const sendMessage = useCallback((data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
    const ws = webSocketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
      return true;
    }
    return false;
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!url) return;

    // Close existing connection
    if (webSocketRef.current) {
      webSocketRef.current.close();
    }

    setStatus('connecting');
    const ws = new WebSocket(url);
    webSocketRef.current = ws;

    ws.onopen = (event) => {
      console.log('WebSocket connected');
      setStatus('open');
      attemptRef.current = 0;
      if (onOpen) onOpen(event);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
        if (onMessage) onMessage(event);
      } catch (e) {
        console.error('Error parsing WebSocket message', e);
        setLastMessage(event.data);
        if (onMessage) onMessage(event);
      }
    };

    ws.onclose = (event) => {
      console.log('WebSocket connection closed', event.code, event.reason);
      setStatus('closed');
      webSocketRef.current = null;

      // Attempt to reconnect if enabled
      if (autoReconnect && attemptRef.current < reconnectAttempts) {
        attemptRef.current += 1;
        console.log(`Reconnecting... Attempt ${attemptRef.current}/${reconnectAttempts}`);
        
        if (reconnectTimeoutRef.current) {
          window.clearTimeout(reconnectTimeoutRef.current);
        }
        
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, reconnectInterval);
      }

      if (onClose) onClose(event);
    };

    ws.onerror = (event) => {
      console.error('WebSocket connection error', event);
      setStatus('error');
      if (onError) onError(event);
    };

    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws) {
        ws.close();
      }
    };
  }, [url, onOpen, onMessage, onClose, onError, reconnectInterval, reconnectAttempts, autoReconnect]);

  // Connect when the component mounts or URL changes
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (webSocketRef.current) {
        webSocketRef.current.close();
      }
    };
  }, [connect]);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    attemptRef.current = 0;
    connect();
  }, [connect]);

  // Close WebSocket connection
  const disconnect = useCallback(() => {
    if (webSocketRef.current) {
      webSocketRef.current.close();
      webSocketRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  return {
    sendMessage,
    status,
    lastMessage,
    reconnect,
    disconnect,
    webSocket: webSocketRef.current
  };
};