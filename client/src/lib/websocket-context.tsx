import React, { createContext, useContext, ReactNode } from 'react';
import useWebSocket, { WebSocketStatus } from '../hooks/useWebSocket';

// Define the shape of the WebSocket context data
interface WebSocketContextData {
  status: WebSocketStatus;
  lastMessage: any;
  sendMessage: (data: string | ArrayBufferView | ArrayBufferLike | Blob) => boolean;
  subscribe: (eventType: string, handler: (data: any) => void) => () => void;
  unsubscribe: (eventType: string, handler?: (data: any) => void) => void;
  reconnect: () => void;
  disconnect: () => void;
}

// Create context with default values
const WebSocketContext = createContext<WebSocketContextData | null>(null);

// Context provider component
interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const websocket = useWebSocket();
  
  return (
    <WebSocketContext.Provider value={websocket}>
      {children}
    </WebSocketContext.Provider>
  );
};

// Custom hook to access WebSocket context
export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  
  return context;
};

export default WebSocketContext;