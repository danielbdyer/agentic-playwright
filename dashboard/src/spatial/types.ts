/**
 * Spatial domain types — the contract between the WebSocket event stream
 * and the Three.js visualization layer.
 *
 * These are re-exports of the backend domain types (single source of truth)
 * plus spatial-only projection helpers for the render loop.
 */

import type {
  ActorKind,
  BoundingBox,
  ElementProbedEvent,
  ElementEscalatedEvent,
  ScreenCapturedEvent,
  KnowledgeNodeProjection,
  KnowledgeNodeStatus,
  InboxUrgency,
  InboxItemEvent,
  FiberPauseEvent,
  FiberResumeEvent,
  RungShiftEvent,
  CalibrationUpdateEvent,
  ProposalActivatedEvent,
  ConfidenceCrossedEvent,
  ArtifactWrittenEvent,
  StageLifecycleEvent,
} from '../../../product/domain/observation/dashboard';
import type { Governance } from '../../../product/domain/governance/workflow-types';

// Re-export domain types as the spatial contract.
// Aliased names preserve backward compatibility with existing components.
export type ProbeEvent = ElementProbedEvent;
export type ScreenCapture = ScreenCapturedEvent;
export type KnowledgeNode = KnowledgeNodeProjection;
export type { BoundingBox, ActorKind, Governance, KnowledgeNodeStatus };
export type { ElementEscalatedEvent, InboxUrgency, InboxItemEvent, FiberPauseEvent, FiberResumeEvent };
export type { RungShiftEvent, CalibrationUpdateEvent, ProposalActivatedEvent, ConfidenceCrossedEvent, ArtifactWrittenEvent, StageLifecycleEvent };

/** Viewport dimensions for coordinate mapping between DOM and Three.js space. */
export interface ViewportDimensions {
  readonly width: number;
  readonly height: number;
}

/** Map a DOM bounding box to normalized Three.js coordinates [-1, 1]. */
export const domToNdc = (
  box: BoundingBox,
  viewport: ViewportDimensions,
): { x: number; y: number } => ({
  x: ((box.x + box.width / 2) / viewport.width) * 2 - 1,
  y: -(((box.y + box.height / 2) / viewport.height) * 2 - 1),
});

/** Map a DOM bounding box to Three.js world coordinates on a plane. */
export const domToWorld = (
  box: BoundingBox,
  viewport: ViewportDimensions,
  planeWidth: number,
  planeHeight: number,
): { x: number; y: number; z: number } => {
  const ndc = domToNdc(box, viewport);
  return {
    x: ndc.x * (planeWidth / 2),
    y: ndc.y * (planeHeight / 2),
    z: 0.01, // Slightly in front of the screen plane
  };
};

/** Confidence to color: learning (blue) → approved (green). Pure. */
export const confidenceToColor = (confidence: number): [number, number, number] => {
  const g = Math.min(1, confidence * 1.2);
  const b = Math.max(0, 1 - confidence * 1.5);
  return [0.2, g, b];
};

/** Rung to glow intensity: higher rung = dimmer (more degraded). Pure. */
export const rungToIntensity = (rung: number): number =>
  Math.max(0.3, 1.0 - rung * 0.2);

// ─── Actor / Governance Visual Mappings ───

/** Actor to particle color channel: system=cyan, agent=magenta, operator=gold. */
export const actorToColor = (actor: ActorKind): [number, number, number] => {
  switch (actor) {
    case 'system':   return [0.2, 0.8, 1.0];
    case 'agent':    return [0.8, 0.2, 1.0];
    case 'operator': return [1.0, 0.85, 0.2];
  }
};

/** Governance to glow style: approved=solid, review-required=pulse, blocked=flicker. */
export type GlowStyle = 'solid' | 'pulse' | 'flicker';
export const governanceToGlowStyle = (g: Governance): GlowStyle => {
  switch (g) {
    case 'approved':        return 'solid';
    case 'review-required': return 'pulse';
    case 'blocked':         return 'flicker';
  }
};

/** Governance to color tint overlay. */
export const governanceToTint = (g: Governance): [number, number, number] => {
  switch (g) {
    case 'approved':        return [0.2, 1.0, 0.3];
    case 'review-required': return [1.0, 0.8, 0.2];
    case 'blocked':         return [1.0, 0.2, 0.2];
  }
};

// ─── Shared Color Constants ───
// Extracted from the app/App.tsx shell for reuse across atoms/molecules.

export const RUNG_COLORS: Readonly<Record<string, string>> = {
  'explicit': '#3fb950', 'control': '#2ea043', 'approved-screen-knowledge': '#56d364',
  'shared-patterns': '#79c0ff', 'prior-evidence': '#a5d6ff',
  'approved-equivalent-overlay': '#58a6ff', 'structured-translation': '#d29922',
  'live-dom': '#e3b341', 'agent-interpreted': '#bc8cff', 'needs-human': '#f85149',
};
