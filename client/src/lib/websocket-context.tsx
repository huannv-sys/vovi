import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

// Define the WebSocket context type
interface WebSocketContextType {
  connected: boolean;
  lastMessage: any;
  sendMessage: (data: any) => boolean;
  reconnect: () => void;
  subscribeToTopic: (topic: string) => void;
  unsubscribeFromTopic: (topic: string) => void;
}

// Create context with a default value
const WebSocketContext = createContext<WebSocketContextType>({
  connected: false,
  lastMessage: null,
  sendMessage: () => false,
  reconnect: () => {},
  subscribeToTopic: () => {},
  unsubscribeFromTopic: () => {},
});

// Props for the WebSocket provider
interface WebSocketProviderProps {
  children: React.ReactNode;
}

// WebSocket provider component
export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  // State
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  
  // Refs
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const topicsRef = useRef<Set<string>>(new Set());
  
  // Function to create WebSocket connection
  const createWebSocketConnection = useCallback(() => {
    // Close existing connection if any
    if (socketRef.current) {
      socketRef.current.close();
    }
    
    // Determine protocol based on current connection security
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    try {
      // Create new WebSocket
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      
      // Event handlers
      socket.onopen = () => {
        console.log('WebSocket connection established');
        setConnected(true);
        
        // Re-subscribe to all previous topics
        topicsRef.current.forEach(topic => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              action: 'subscribe',
              topic
            }));
          }
        });
      };
      
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      socket.onclose = (event) => {
        console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
        setConnected(false);
        
        // Attempt to reconnect after a delay
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        reconnectTimeoutRef.current = setTimeout(() => {
          createWebSocketConnection();
        }, 3000);
      };
      
      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
    }
  }, []);
  
  // Function to send a message
  const sendMessage = useCallback((data: any): boolean => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);
  
  // Function to manually reconnect
  const reconnect = useCallback(() => {
    createWebSocketConnection();
  }, [createWebSocketConnection]);
  
  // Function to subscribe to a topic
  const subscribeToTopic = useCallback((topic: string) => {
    topicsRef.current.add(topic);
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        action: 'subscribe',
        topic
      }));
    }
  }, []);
  
  // Function to unsubscribe from a topic
  const unsubscribeFromTopic = useCallback((topic: string) => {
    topicsRef.current.delete(topic);
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        action: 'unsubscribe',
        topic
      }));
    }
  }, []);
  
  // Initialize WebSocket connection on mount
  useEffect(() => {
    createWebSocketConnection();
    
    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [createWebSocketConnection]);
  
  // The context value to provide
  const contextValue: WebSocketContextType = {
    connected,
    lastMessage,
    sendMessage,
    reconnect,
    subscribeToTopic,
    unsubscribeFromTopic,
  };
  
  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

// Hook to use the WebSocket context
export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  
  if (context === undefined) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  
  return context;
};

// Higher-order component to wrap components with WebSocket context
export const withWebSocket = <P extends object>(
  Component: React.ComponentType<P & { ws: WebSocketContextType }>
) => {
  return (props: P) => {
    const wsContext = useWebSocketContext();
    
    return <Component {...props} ws={wsContext} />;
  };
};