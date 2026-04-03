/**
 * useScreencastStream — binary WS → createImageBitmap → Canvas pipeline.
 *
 * This hook completely bypasses React state for frame data. The pipeline:
 *   Binary WS message → parse 5-byte header → Blob(JPEG) → createImageBitmap
 *   (off main thread) → drawImage on dedicated canvas → CanvasTexture.needsUpdate
 *
 * No React re-renders, no base64, no Image element churn.
 * The canvas is the single source of truth for the current frame.
 *
 * Three.js integration: the returned canvasRef is used with THREE.CanvasTexture.
 * In useFrame, read `hasFrame` and set `texture.needsUpdate = true` to upload
 * the canvas to the GPU.
 */

import { useRef, useCallback } from 'react';
import type { BinaryFrameHandler } from './use-web-socket';

/** Binary frame header: [0x01] [u16be width] [u16be height] [JPEG bytes] */
const FRAME_TYPE_SCREENCAST = 0x01;
const HEADER_SIZE = 5;

export interface ScreencastStream {
  /** The canvas element that receives decoded frames. Use with THREE.CanvasTexture. */
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** True after at least one frame has been decoded. Ref-based — no re-render. */
  readonly hasFrame: React.RefObject<boolean>;
  /** Increments on each new frame. Read in useFrame to detect changes. */
  readonly frameSeq: React.RefObject<number>;
  /** Current frame dimensions. */
  readonly dimensions: React.RefObject<{ width: number; height: number }>;
  /** Binary WS handler — pass to useWebSocket's onBinaryFrame. */
  readonly onBinaryFrame: BinaryFrameHandler;
}

export function useScreencastStream(): ScreencastStream {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hasFrame = useRef(false);
  const frameSeq = useRef(0);
  const dimensions = useRef({ width: 1280, height: 720 });
  // Guard against stale decode: only the latest decode writes to canvas
  const decodeGeneration = useRef(0);

  // Lazily create the offscreen canvas
  if (canvasRef.current === null && typeof document !== 'undefined') {
    canvasRef.current = document.createElement('canvas');
    canvasRef.current.width = 1280;
    canvasRef.current.height = 720;
  }

  const onBinaryFrame: BinaryFrameHandler = useCallback((buffer: ArrayBuffer) => {
    if (buffer.byteLength < HEADER_SIZE) return;

    const view = new DataView(buffer);
    const type = view.getUint8(0);
    if (type !== FRAME_TYPE_SCREENCAST) return;

    const width = view.getUint16(1, false); // big-endian
    const height = view.getUint16(3, false);
    const jpegBytes = buffer.slice(HEADER_SIZE);

    // Bump generation — any in-flight decode from a previous frame is stale
    const gen = ++decodeGeneration.current;

    const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
    createImageBitmap(blob).then((bitmap) => {
      // Stale frame — a newer one arrived while we were decoding
      if (gen !== decodeGeneration.current) {
        bitmap.close();
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) { bitmap.close(); return; }

      // Resize canvas if frame dimensions changed
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      dimensions.current = { width, height };

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, width, height);
        hasFrame.current = true;
        frameSeq.current++;
      }
      bitmap.close();
    }).catch(() => {
      // Decode failed — skip frame silently
    });
  }, []);

  return { canvasRef, hasFrame, frameSeq, dimensions, onBinaryFrame };
}
