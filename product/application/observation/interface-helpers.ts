/**
 * Interface-intelligence shared helpers — carved out of the
 * interface-intelligence.ts monolith at Step 4a (round 2).
 *
 * Pure string utilities and canonical-ref formatters used across
 * the projection. Kept as a focused module so the larger
 * monolith can import them once and the extracted sub-modules
 * (catalog-screen-index, target-descriptor, state-graph builder)
 * can share them without circular imports.
 *
 * Pure domain — no Effect, no IO.
 */

import type {
  ElementId,
  EventSignatureRef,
  RouteId,
  RouteVariantId,
  ScreenId,
  SnapshotTemplateId,
  StateNodeRef,
  SurfaceId,
  TransitionRef,
} from '../../domain/kernel/identity';
import type { CanonicalTargetRef } from '../../domain/kernel/identity';
import { createCanonicalTargetRef, createSelectorRef } from '../../domain/kernel/identity';
import type { LocatorStrategy } from '../../domain/governance/workflow-types';

/** Stable sort over an iterable of strings with de-duplication. */
export function sortStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

/** Extract the comparable string value from a locator strategy. */
export function selectorValue(strategy: LocatorStrategy): string {
  return 'value' in strategy ? strategy.value : `${strategy.role}:${strategy.name ?? ''}`;
}

// ─── Canonical-ref formatters ────────────────────────────────────

export function stateNodeGraphId(ref: StateNodeRef): string {
  return `state:${ref}`;
}

export function eventSignatureGraphId(ref: EventSignatureRef): string {
  return `event-signature:${ref}`;
}

export function transitionGraphId(ref: TransitionRef): string {
  return `transition:${ref}`;
}

export function routeRef(app: string, routeId: RouteId): string {
  return `route:${app}:${routeId}`;
}

export function routeVariantRef(app: string, routeId: RouteId, variantId: RouteVariantId): string {
  return `route-variant:${app}:${routeId}:${variantId}`;
}

export function surfaceTargetRef(screen: ScreenId, surfaceId: SurfaceId): CanonicalTargetRef {
  return createCanonicalTargetRef(`target:surface:${screen}:${surfaceId}`);
}

export function elementTargetRef(screen: ScreenId, elementId: ElementId): CanonicalTargetRef {
  return createCanonicalTargetRef(`target:element:${screen}:${elementId}`);
}

export function snapshotTargetRef(screen: ScreenId, snapshotTemplate: SnapshotTemplateId): CanonicalTargetRef {
  return createCanonicalTargetRef(`target:snapshot:${screen}:${snapshotTemplate}`);
}

export function discoveredTargetRef(screen: ScreenId, kind: string, stableDiscoveryId: string): CanonicalTargetRef {
  return createCanonicalTargetRef(`target:discovered:${screen}:${kind}:${stableDiscoveryId}`);
}

export function selectorProbeId(targetRef: CanonicalTargetRef, strategy: LocatorStrategy, rung: number): string {
  return `${targetRef}:probe:${strategy.kind}:${rung}:${selectorValue(strategy)}`;
}

export function selectorRefForProbe(targetRef: CanonicalTargetRef, strategy: LocatorStrategy, rung: number) {
  return createSelectorRef(`selector:${targetRef}:${strategy.kind}:${rung}:${selectorValue(strategy)}`);
}
