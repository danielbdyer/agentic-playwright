/**
 * Screen Plane — renders the live application DOM as a textured plane
 * in the Three.js scene.
 *
 * Performance: texture decode happens in an effect (not useFrame).
 * useFrame only swaps the texture reference — zero decode per frame.
 * Base64 → Image decode is async and fires only when capture changes.
 */

import { useRef, useMemo, useEffect, memo } from 'react';
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

export const ScreenPlane = memo(function ScreenPlane({
  width,
  height,
  position,
  capture,
}: ScreenPlaneProps) {
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const pendingTextureRef = useRef<THREE.Texture | null>(null);
  const currentTextureRef = useRef<THREE.Texture | null>(null);
  const lastBase64Ref = useRef<string | null>(null);

  const placeholder = useMemo(() => createPlaceholder(256, 256), []);

  // Decode base64 in a useEffect — NOT in useFrame.
  // This fires only when capture changes (not 60x/sec).
  // The decoded texture is stored in pendingTextureRef for useFrame to swap.
  useEffect(() => {
    if (!capture || capture.imageBase64 === lastBase64Ref.current) return;
    lastBase64Ref.current = capture.imageBase64;

    const img = new Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      tex.colorSpace = THREE.SRGBColorSpace;
      // Store in pending ref — useFrame will swap it in
      pendingTextureRef.current = tex;
    };
    img.src = `data:image/png;base64,${capture.imageBase64}`;

    // Cleanup on unmount or capture change
    return () => { img.onload = null; };
  }, [capture]);

  // useFrame only swaps texture refs — zero decode, zero allocation
  useFrame(() => {
    const mat = materialRef.current;
    if (!mat) return;

    // Swap in pending texture if available
    const pending = pendingTextureRef.current;
    if (pending) {
      pendingTextureRef.current = null;
      if (currentTextureRef.current) currentTextureRef.current.dispose();
      currentTextureRef.current = pending;
      mat.map = pending;
      mat.needsUpdate = true;
      return;
    }

    // Fallback to placeholder if no capture
    if (!capture && mat.map !== placeholder) {
      mat.map = placeholder;
      mat.needsUpdate = true;
    }
  });

  return (
    <mesh position={position}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial ref={materialRef} map={placeholder} toneMapped={false} />
    </mesh>
  );
});
