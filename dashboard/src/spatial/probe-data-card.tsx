/**
 * ProbeDataCard — floating element metadata card near probed elements.
 *
 * During Act 2 (ARIA Discovery), when an element is probed, a floating
 * card appears nearby showing:
 *   - Element role and accessible name
 *   - Locator ladder rung used
 *   - Confidence score
 *   - Screen context
 *
 * The card hovers near the probed position in 3D space, faces the camera,
 * and fades after a configurable duration. Uses Billboard behavior.
 *
 * @see docs/first-day-flywheel-visualization.md Part I (Act 2), Part VIII
 */

import { useRef, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─── Types ───

export interface ProbeCardData {
  readonly id: string;
  readonly role: string;
  readonly name: string;
  readonly rung: string;
  readonly confidence: number;
  readonly screen: string;
  readonly position: readonly [number, number, number];
  readonly spawnTime: number;
}

export interface ProbeDataCardProps {
  readonly cards: readonly ProbeCardData[];
  readonly fadeDuration?: number;
  readonly displayDuration?: number;
}

// ─── Pure Helpers ───

/** Rung-to-color mapping for card accent. */
export const RUNG_CARD_COLORS: Readonly<Record<string, string>> = {
  'getByRole': '#22c55e',
  'getByLabel': '#34d399',
  'getByPlaceholder': '#6ee7b7',
  'getByText': '#fbbf24',
  'getByTestId': '#06b6d4',
  'css': '#f97316',
  'xpath': '#ef4444',
  'needs-human': '#a855f7',
} as const;

/** Get color for a rung, defaulting to white. */
export function rungColor(rung: string): string {
  return RUNG_CARD_COLORS[rung] ?? '#ffffff';
}

/** Compute card opacity based on age. */
export function cardOpacity(
  age: number,
  displayDuration: number,
  fadeDuration: number,
): number {
  if (age < 0) return 0;
  if (age < displayDuration) return 1;
  if (age < displayDuration + fadeDuration) {
    return 1 - (age - displayDuration) / fadeDuration;
  }
  return 0;
}

/** Check if card is still visible. */
export function isCardVisible(
  age: number,
  displayDuration: number,
  fadeDuration: number,
): boolean {
  return age < displayDuration + fadeDuration;
}

// ─── Constants ───

const MAX_CARDS = 20;
const CARD_GEOMETRY = new THREE.PlaneGeometry(0.5, 0.25);
const CARD_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x1a1a2e,
  transparent: true,
  opacity: 0.9,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const _obj = new THREE.Object3D();

// ─── Component ───

export const ProbeDataCard = memo(function ProbeDataCard({
  cards,
  fadeDuration = 0.5,
  displayDuration = 3.0,
}: ProbeDataCardProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const clockRef = useRef(0);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    clockRef.current += delta;
    const now = clockRef.current;
    const camera = state.camera;

    let count = 0;
    for (const card of cards) {
      if (count >= MAX_CARDS) break;
      const age = now - card.spawnTime;
      const opacity = cardOpacity(age, displayDuration, fadeDuration);
      if (opacity <= 0) continue;

      // Position card slightly above and to the right of probe position
      _obj.position.set(
        card.position[0] + 0.3,
        card.position[1] + 0.15,
        card.position[2],
      );
      // Billboard: face camera
      _obj.quaternion.copy(camera.quaternion);
      _obj.scale.setScalar(opacity);
      _obj.updateMatrix();
      mesh.setMatrixAt(count, _obj.matrix);
      count++;
    }

    mesh.count = count;
    if (count > 0) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[CARD_GEOMETRY, CARD_MATERIAL, MAX_CARDS]}
      frustumCulled={false}
    />
  );
});
