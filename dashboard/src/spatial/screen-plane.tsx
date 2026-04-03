/**
 * Screen Plane — renders the live AUT as a textured plane in the Three.js scene.
 *
 * Two rendering paths:
 *   1. Binary screencast stream (preferred): reads directly from a canvas fed
 *      by useScreencastStream's off-thread decode pipeline. Uses CanvasTexture.
 *      Zero React state, zero Image elements, zero base64.
 *   2. Legacy capture prop (fallback): decodes base64 ScreenCapture via Image
 *      element. Used when binary stream is unavailable.
 *
 * useFrame checks the stream's frameSeq ref to detect new frames and flips
 * texture.needsUpdate — no per-frame allocation or decode.
 */

import { useRef, useEffect, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ScreenCapture } from './types';
import type { ScreencastStream } from '../hooks/use-screencast-stream';

interface ScreenPlaneProps {
  readonly width: number;
  readonly height: number;
  readonly position: [number, number, number];
  /** Legacy base64 capture — used only when screencast stream is unavailable. */
  readonly capture: ScreenCapture | null;
  /** Binary screencast stream — preferred path. Bypasses React entirely. */
  readonly stream: ScreencastStream | null;
}

/** Create a placeholder gradient texture. Pure. */
const createPlaceholder = (w: number, h: number): THREE.DataTexture => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const t = y / h;
      data[i] = Math.floor(13 + t * 8);
      data[i + 1] = Math.floor(17 + t * 10);
      data[i + 2] = Math.floor(23 + t * 12);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
};

const PLACEHOLDER = createPlaceholder(256, 256);

export const ScreenPlane = memo(function ScreenPlane({
  width,
  height,
  position,
  capture,
  stream,
}: ScreenPlaneProps) {
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const canvasTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const lastSeqRef = useRef(0);

  // Legacy path refs (used only when stream is null)
  const pendingTextureRef = useRef<THREE.Texture | null>(null);
  const currentTextureRef = useRef<THREE.Texture | null>(null);
  const lastBase64Ref = useRef<string | null>(null);

  // Create CanvasTexture from the stream's canvas (once)
  useEffect(() => {
    if (!stream?.canvasRef.current) return;
    const tex = new THREE.CanvasTexture(stream.canvasRef.current);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    canvasTextureRef.current = tex;
    return () => { tex.dispose(); canvasTextureRef.current = null; };
  }, [stream]);

  // Legacy fallback: decode base64 capture when no binary stream
  useEffect(() => {
    if (stream) return; // Binary stream active — skip legacy path
    if (!capture || capture.imageBase64 === lastBase64Ref.current) return;
    lastBase64Ref.current = capture.imageBase64;

    const img = new Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      tex.colorSpace = THREE.SRGBColorSpace;
      pendingTextureRef.current = tex;
    };
    const mime = capture.imageBase64.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
    img.src = `data:${mime};base64,${capture.imageBase64}`;
    return () => { img.onload = null; };
  }, [capture, stream]);

  useFrame(() => {
    const mat = materialRef.current;
    if (!mat) return;

    // Path 1: Binary screencast stream — check if a new frame was painted
    if (stream && canvasTextureRef.current) {
      const seq = stream.frameSeq.current;
      if (seq > lastSeqRef.current) {
        lastSeqRef.current = seq;
        if (mat.map !== canvasTextureRef.current) {
          mat.map = canvasTextureRef.current;
        }
        canvasTextureRef.current.needsUpdate = true;
        mat.needsUpdate = true;
      }
      return;
    }

    // Path 2: Legacy base64 capture
    const pending = pendingTextureRef.current;
    if (pending) {
      pendingTextureRef.current = null;
      if (currentTextureRef.current) currentTextureRef.current.dispose();
      currentTextureRef.current = pending;
      mat.map = pending;
      mat.needsUpdate = true;
      return;
    }

    // No content — show placeholder
    if (!capture && !stream?.hasFrame.current && mat.map !== PLACEHOLDER) {
      mat.map = PLACEHOLDER;
      mat.needsUpdate = true;
    }
  });

  return (
    <mesh position={position}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial ref={materialRef} map={PLACEHOLDER} toneMapped={false} />
    </mesh>
  );
});
