import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatEvent, ChatMessage, ChatSnapshot } from '../shared/types';

export type ChatStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

type ServerChatMessage = ChatSnapshot | ChatEvent;

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [online, setOnline] = useState(0);
  const [status, setStatus] = useState<ChatStatus>('connecting');
  const [error, setError] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    let retryTimer: number | undefined;

    const connect = () => {
      if (disposed) return;
      setStatus((current) => (current === 'live' ? 'reconnecting' : 'connecting'));
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws?chat=1`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        retryRef.current = 0;
        setStatus('live');
        setError('');
      };
      socket.onmessage = (event) => {
        if (disposed) return;
        let message: ServerChatMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerChatMessage;
        } catch {
          return;
        }
        if (message.type === 'chat_snapshot') {
          setMessages(message.messages.slice(-100));
          setOnline(message.online);
          return;
        }
        if (message.type === 'chat_message' && message.message) {
          setMessages((current) => {
            if (current.some((item) => item.id === message.message!.id)) return current;
            return [...current, message.message!].slice(-100);
          });
          if (typeof message.online === 'number') setOnline(message.online);
          return;
        }
        if (message.type === 'chat_presence' && typeof message.online === 'number') {
          setOnline(message.online);
          return;
        }
        if (message.type === 'chat_error' && message.error) {
          setError(message.error);
        }
      };
      socket.onclose = () => {
        if (disposed) return;
        setStatus('reconnecting');
        const attempt = retryRef.current++;
        retryTimer = window.setTimeout(connect, Math.min(8000, 600 * 2 ** attempt));
      };
      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      socketRef.current?.close();
      setStatus('offline');
    };
  }, []);

  const send = useCallback((body: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError('Chat is reconnecting. Try again in a moment.');
      return false;
    }
    setError('');
    socket.send(JSON.stringify({ type: 'chat', body }));
    return true;
  }, []);

  return { messages, online, status, error, send };
}
