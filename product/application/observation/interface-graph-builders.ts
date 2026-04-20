/**
 * Interface graph node + edge builders — carved out of
 * `interface-intelligence.ts` at Step 4a (round 2) per
 * `docs/v2-direction.md §6 Step 4a` and §3.7's named split.
 *
 * Pure constructors for `InterfaceGraphNode` / `InterfaceGraphEdge`
 * plus their upsert helpers and fingerprint formatters. Each
 * builder normalizes its inputs (sorts artifact paths, merges
 * payloads on upsert) and produces a fingerprint via
 * `fingerprintProjectionOutput`.
 *
 * Pure domain — no Effect, no IO.
 */

import type {
  CanonicalTargetRef,
  ElementId,
  RouteId,
  RouteVariantId,
  ScreenId,
  SnapshotTemplateId,
  SurfaceId,
} from '../../domain/kernel/identity';
import type { InterfaceGraphEdge, InterfaceGraphNode } from '../../domain/target/interface-graph';
import { fingerprintProjectionOutput } from '../projections/cache';
import { sortStrings } from './interface-helpers';

export function nodeFingerprint(
  kind: InterfaceGraphNode['kind'],
  id: string,
  payload?: Record<string, unknown>,
) {
  return fingerprintProjectionOutput({ kind, id, payload: payload ?? null });
}

export function edgeFingerprint(
  kind: InterfaceGraphEdge['kind'],
  from: string,
  to: string,
  payload?: Record<string, unknown>,
) {
  return fingerprintProjectionOutput({ kind, from, to, payload: payload ?? null });
}

export function createNode(input: {
  id: string;
  kind: InterfaceGraphNode['kind'];
  label: string;
  artifactPaths: readonly string[];
  source: InterfaceGraphNode['source'];
  route?: RouteId | null | undefined;
  variant?: RouteVariantId | null | undefined;
  screen?: ScreenId | null | undefined;
  surface?: SurfaceId | null | undefined;
  element?: ElementId | null | undefined;
  snapshotTemplate?: SnapshotTemplateId | null | undefined;
  targetRef?: CanonicalTargetRef | null | undefined;
  payload?: Record<string, unknown> | undefined;
}): InterfaceGraphNode {
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    fingerprint: nodeFingerprint(input.kind, input.id, input.payload),
    route: input.route ?? null,
    variant: input.variant ?? null,
    screen: input.screen ?? null,
    section: null,
    surface: input.surface ?? null,
    element: input.element ?? null,
    snapshotTemplate: input.snapshotTemplate ?? null,
    targetRef: input.targetRef ?? null,
    artifactPaths: sortStrings(input.artifactPaths),
    source: input.source,
    payload: input.payload,
  };
}

export function createEdge(input: {
  kind: InterfaceGraphEdge['kind'];
  from: string;
  to: string;
  lineage: readonly string[];
  payload?: Record<string, unknown> | undefined;
}): InterfaceGraphEdge {
  return {
    id: `${input.kind}:${input.from}->${input.to}`,
    kind: input.kind,
    from: input.from,
    to: input.to,
    fingerprint: edgeFingerprint(input.kind, input.from, input.to, input.payload),
    lineage: sortStrings(input.lineage),
    payload: input.payload,
  };
}

export function upsertNode(map: Map<string, InterfaceGraphNode>, node: InterfaceGraphNode) {
  const existing = map.get(node.id);
  if (!existing) {
    map.set(node.id, node);
    return;
  }
  map.set(node.id, createNode({
    ...existing,
    artifactPaths: [...existing.artifactPaths, ...node.artifactPaths],
    payload: { ...(existing.payload ?? {}), ...(node.payload ?? {}) },
  }));
}

export function upsertEdge(map: Map<string, InterfaceGraphEdge>, edge: InterfaceGraphEdge) {
  const existing = map.get(edge.id);
  if (!existing) {
    map.set(edge.id, edge);
    return;
  }
  map.set(edge.id, createEdge({
    kind: edge.kind,
    from: edge.from,
    to: edge.to,
    lineage: [...existing.lineage, ...edge.lineage],
    payload: { ...(existing.payload ?? {}), ...(edge.payload ?? {}) },
  }));
}
