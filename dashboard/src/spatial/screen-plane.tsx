/**
 * Screen Plane — renders the live application DOM as a textured plane
 * in the Three.js scene.
 *
 * The texture updates from screenshots streamed via WebSocket
 * ('screen-captured' events). When no screenshot is available,
 * renders a subtle gradient placeholder.
 *
 * Pure: screenshot data in, textured plane out.
 * Texture updates happen in useFrame to avoid React re-renders.
 */

import { useRef, useMemo, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ScreenCapture } from './types';

interface ScreenPlaneProps {
  readonly width: number;
  readonly height: number;
  readonly position: [number, number, number];
  readonly capture: ScreenCapture | null;
}

/** Create a placeholder gradient texture. Pure. */
const createPlaceholder = (w: number, h: number): THREE.DataTexture => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const t = y / h;
      data[i] = Math.floor(13 + t * 8);     // R: dark gradient
      data[i + 1] = Math.floor(17 + t * 10); // G
      data[i + 2] = Math.floor(23 + t * 12); // B
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
};

export const ScreenPlane = memo(function ScreenPlane({
  width,
  height,
  position,
  capture,
}: ScreenPlaneProps) {
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const lastCaptureRef = useRef<string | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);

  // Placeholder texture when no capture available
  const placeholder = useMemo(() => createPlaceholder(256, 256), []);

  // Update texture from capture data (in useFrame to avoid React re-renders)
  useFrame(() => {
    const mat = materialRef.current;
    if (!mat) return;

    if (!capture) {
      if (mat.map !== placeholder) {
        mat.map = placeholder;
        mat.needsUpdate = true;
      }
      return;
    }

    // Only update if the capture changed
    if (capture.imageBase64 === lastCaptureRef.current) return;
    lastCaptureRef.current = capture.imageBase64;

    // Decode base64 to image, then to texture
    const img = new Image();
    img.onload = () => {
      if (textureRef.current) textureRef.current.dispose();
      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      tex.colorSpace = THREE.SRGBColorSpace;
      textureRef.current = tex;
      mat.map = tex;
      mat.needsUpdate = true;
    };
    img.src = `data:image/png;base64,${capture.imageBase64}`;
  });

  return (
    <mesh position={position}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial ref={materialRef} map={placeholder} toneMapped={false} />
    </mesh>
  );
});
