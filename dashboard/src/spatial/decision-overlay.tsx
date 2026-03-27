/**
 * DecisionOverlay — floating approve/skip buttons in 3D space near the paused element.
 *
 * When the Effect fiber pauses for a human decision, this component renders
 * an HTML overlay positioned in Three.js world space near the element being decided.
 * Uses drei `Html` for DOM-in-3D rendering.
 *
 * Semantic: amber border = review-required. Buttons float below the glowing element.
 * The overlay is the bridge between the spatial visualization and human agency.
 *
 * Phase 6: Human-in-the-Loop Integration.
 */

import { memo } from 'react';
import { Html } from '@react-three/drei';
import type { PauseContext } from '../types';
import type { ProbeEvent, ViewportDimensions } from './types';
import { domToWorld } from './types';

interface DecisionOverlayProps {
  readonly pauseContext: PauseContext;
  readonly probes: readonly ProbeEvent[];
  readonly viewport: ViewportDimensions;
  readonly planeWidth: number;
  readonly planeHeight: number;
  readonly onApprove: (workItemId: string) => void;
  readonly onSkip: (workItemId: string) => void;
}

/** Find the probe matching the paused element, or fall back to center. Pure. */
const findPausePosition = (
  pauseContext: PauseContext,
  probes: readonly ProbeEvent[],
  viewport: ViewportDimensions,
  planeWidth: number,
  planeHeight: number,
): { x: number; y: number; z: number } => {
  const matchingProbe = probes.find(
    (p) => p.element === pauseContext.element && p.boundingBox !== null,
  );
  if (matchingProbe?.boundingBox) {
    const world = domToWorld(matchingProbe.boundingBox, viewport, planeWidth, planeHeight);
    return { x: world.x, y: world.y - 0.25, z: 0.15 }; // Offset below element
  }
  return { x: -1.8, y: -0.5, z: 0.15 }; // Fallback: center of screen plane
};

export const DecisionOverlay = memo(function DecisionOverlay({
  pauseContext,
  probes,
  viewport,
  planeWidth,
  planeHeight,
  onApprove,
  onSkip,
}: DecisionOverlayProps) {
  const pos = findPausePosition(pauseContext, probes, viewport, planeWidth, planeHeight);

  return (
    <group position={[pos.x, pos.y, pos.z]}>
      <Html
        center
        distanceFactor={4}
        style={{ pointerEvents: 'auto' }}
      >
        <div className="decision-overlay" role="dialog" aria-label="Decision required">
          <div className="decision-reason">{pauseContext.reason}</div>
          <div className="decision-meta">
            {pauseContext.screen}{pauseContext.element ? ` / ${pauseContext.element}` : ''}
          </div>
          <div className="decision-actions">
            <button
              className="btn btn-approve"
              onClick={() => onApprove(pauseContext.workItemId)}
              aria-label={`Approve: ${pauseContext.reason}`}
              autoFocus
            >
              Approve
            </button>
            <button
              className="btn"
              onClick={() => onSkip(pauseContext.workItemId)}
              aria-label={`Skip: ${pauseContext.reason}`}
            >
              Skip
            </button>
          </div>
        </div>
      </Html>
    </group>
  );
});
