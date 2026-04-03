/**
 * useWebSocket — WebSocket lifecycle management with exponential backoff reconnection.
 *
 * Supports two message paths:
 *   1. JSON text messages → onMessage(parsed) — routed through React dispatch
 *   2. Binary messages → onBinaryFrame(ArrayBuffer) — bypasses React entirely
 *
 * Binary frames are used for CDP screencast: raw JPEG bytes with a 5-byte
 * header [type:u8, width:u16be, height:u16be]. This avoids JSON+base64
 * overhead and lets the client decode off-thread via createImageBitmap.
 *
 * Complexity:
 *   connect:    O(1) — single WebSocket construction
 *   reconnect:  O(1) — exponential backoff: 1s → 2s → 4s → 8s (capped)
 *   send:       O(1) — JSON.stringify + socket.send
 *   onMessage:  O(1) — delegates to provided handler
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type MessageHandler = (msg: { readonly type: string; readonly data: unknown }) => void;
export type BinaryFrameHandler = (data: ArrayBuffer) => void;

export function useWebSocket(
  url: string,
  onMessage: MessageHandler,
  onBinaryFrame?: BinaryFrameHandler,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  // Stable refs — prevents WS reconnection on handler identity change
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;
  const binaryRef = useRef(onBinaryFrame);
  binaryRef.current = onBinaryFrame;

  /** O(1). Send a JSON message if the socket is open. Stable callback. */
  const send = useCallback((msg: unknown) => {
    wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let reconnectDelay = 1000;

    function connect() {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => { setConnected(true); reconnectDelay = 1000; };
      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 8000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (event) => {
        // Binary frame — route directly, bypass React
        if (event.data instanceof ArrayBuffer) {
          binaryRef.current?.(event.data);
          return;
        }
        // JSON text message — parse and dispatch through React
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
