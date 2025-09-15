import { useEffect, useState, useRef } from 'react';

interface UseWebSocketOptions {
    onMessage?: (data: any) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
    reconnectInterval?: number;
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}) {
    const [isConnected, setIsConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState<any>(null);
    const ws = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

    const connect = () => {
        try {
        ws.current = new WebSocket(url);

        ws.current.onopen = () => {
            setIsConnected(true);
            options.onConnect?.();
        };

        ws.current.onmessage = (event) => {
            const data = JSON.parse(event.data);
            setLastMessage(data);
            options.onMessage?.(data);
        };

        ws.current.onclose = () => {
            setIsConnected(false);
            options.onDisconnect?.();
            
            // Reconnect
            if (options.reconnectInterval) {
            reconnectTimeoutRef.current = setTimeout(connect, options.reconnectInterval);
            }
        };

        ws.current.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        } catch (error) {
        console.error('WebSocket connection failed:', error);
        }
    };
    
    const sendMessage = (message: any) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(message));
        }
    };

    const disconnect = () => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        ws.current?.close();
    };

    useEffect(() => {
        connect();
        return disconnect;
    }, [url]);

    return { isConnected, lastMessage, sendMessage, disconnect };
}

export default useWebSocket;