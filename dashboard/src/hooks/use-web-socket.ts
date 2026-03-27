/**
 * useWebSocket — WebSocket lifecycle management with exponential backoff reconnection.
 *
 * Extracts the connection lifecycle from useEffectStream so the WebSocket
 * concerns (connect, reconnect, close, send) are isolated from the
 * event dispatch and visualization state concerns.
 *
 * Complexity:
 *   connect:    O(1) — single WebSocket construction
 *   reconnect:  O(1) — exponential backoff: 1s → 2s → 4s → 8s (capped)
 *   send:       O(1) — JSON.stringify + socket.send
 *   onMessage:  O(1) — delegates to provided handler
 *
 * The onMessage handler is accessed via ref to avoid re-establishing the
 * WebSocket connection when the handler identity changes.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type MessageHandler = (msg: { readonly type: string; readonly data: unknown }) => void;

export function useWebSocket(url: string, onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  // Stable ref for message handler — prevents WS reconnection on handler change
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  /** O(1). Send a JSON message if the socket is open. Stable callback. */
  const send = useCallback((msg: unknown) => {
    wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let reconnectDelay = 1000;

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => { setConnected(true); reconnectDelay = 1000; };
      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 8000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (typeof msg?.type === 'string') {
            handlerRef.current(msg);
          }
        } catch { /* ignore malformed */ }
      };
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [url]);

  return { connected, send } as const;
}
