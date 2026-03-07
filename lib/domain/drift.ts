import YAML from 'yaml';
import { normalizeAriaSnapshot, sha256, stableStringify } from './hash';

export type DriftClass = 'role-change' | 'accessible-name-change' | 'structural-move-order-change' | 'addition-removal';

interface SnapshotNode {
  role?: string;
  name?: string;
  children?: SnapshotNode[];
}

interface FlattenedNode {
  path: string;
  role: string;
  name: string | null;
  signature: string;
}

export interface DriftDeltaRoleChange {
  kind: 'role-change';
  path: string;
  beforeRole: string;
  afterRole: string;
  name: string | null;
}

export interface DriftDeltaAccessibleNameChange {
  kind: 'accessible-name-change';
  path: string;
  role: string;
  beforeName: string | null;
  afterName: string | null;
}

export interface DriftDeltaStructuralMoveOrderChange {
  kind: 'structural-move-order-change';
  signature: string;
  beforePath: string;
  afterPath: string;
}

export interface DriftDeltaAdditionRemoval {
  kind: 'addition-removal';
  change: 'added' | 'removed';
  path: string;
  role: string;
  name: string | null;
}

export type DriftDelta =
  | DriftDeltaRoleChange
  | DriftDeltaAccessibleNameChange
  | DriftDeltaStructuralMoveOrderChange
  | DriftDeltaAdditionRemoval;

export interface DriftClassification {
  baselineFingerprint: string;
  currentFingerprint: string;
  driftFingerprint: string;
  hasDrift: boolean;
  classes: DriftClass[];
  deltas: DriftDelta[];
}

function parseSnapshot(snapshot: string): SnapshotNode {
  const parsed = YAML.parse(normalizeAriaSnapshot(snapshot)) as SnapshotNode | null;
  return parsed ?? {};
}

function flattenNodes(node: SnapshotNode, path = '0'): FlattenedNode[] {
  const role = node.role ?? 'unknown';
  const name = node.name ?? null;
  const current: FlattenedNode = {
    path,
    role,
    name,
    signature: `${role}::${name ?? ''}`,
  };

  const children = (node.children ?? []).flatMap((child, index) => flattenNodes(child, `${path}.${index}`));
  return [current, ...children];
}

function uniqueSortedClasses(deltas: DriftDelta[]): DriftClass[] {
  return [...new Set(deltas.map((delta) => delta.kind as DriftClass))].sort((left, right) => left.localeCompare(right));
}

export function classifySnapshotDrift(baselineSnapshot: string, currentSnapshot: string): DriftClassification {
  const baselineNormalized = normalizeAriaSnapshot(baselineSnapshot);
  const currentNormalized = normalizeAriaSnapshot(currentSnapshot);
  const baselineNodes = flattenNodes(parseSnapshot(baselineNormalized));
  const currentNodes = flattenNodes(parseSnapshot(currentNormalized));
  const baselineByPath = new Map(baselineNodes.map((node) => [node.path, node] as const));
  const currentByPath = new Map(currentNodes.map((node) => [node.path, node] as const));

  const deltas: DriftDelta[] = [];
  const visitedCurrentPaths = new Set<string>();

  for (const baselineNode of baselineNodes) {
    const currentAtPath = currentByPath.get(baselineNode.path);
    if (currentAtPath) {
      const sameSignatureElsewhere = currentNodes.find(
        (candidate) => candidate.signature === baselineNode.signature && candidate.path !== baselineNode.path && !visitedCurrentPaths.has(candidate.path),
      );
      if (currentAtPath.signature !== baselineNode.signature && sameSignatureElsewhere) {
        visitedCurrentPaths.add(sameSignatureElsewhere.path);
        deltas.push({
          kind: 'structural-move-order-change',
          signature: baselineNode.signature,
          beforePath: baselineNode.path,
          afterPath: sameSignatureElsewhere.path,
        });
      } else {
        visitedCurrentPaths.add(currentAtPath.path);
      }

      if (baselineNode.role !== currentAtPath.role) {
        deltas.push({
          kind: 'role-change',
          path: baselineNode.path,
          beforeRole: baselineNode.role,
          afterRole: currentAtPath.role,
          name: currentAtPath.name,
        });
      }
      if (baselineNode.name !== currentAtPath.name) {
        deltas.push({
          kind: 'accessible-name-change',
          path: baselineNode.path,
          role: currentAtPath.role,
          beforeName: baselineNode.name,
          afterName: currentAtPath.name,
        });
      }
      continue;
    }

    const sameSignatureNodes = currentNodes.filter((candidate) => candidate.signature === baselineNode.signature && !visitedCurrentPaths.has(candidate.path));
    if (sameSignatureNodes.length > 0) {
      const moved = sameSignatureNodes[0];
      visitedCurrentPaths.add(moved.path);
      deltas.push({
        kind: 'structural-move-order-change',
        signature: baselineNode.signature,
        beforePath: baselineNode.path,
        afterPath: moved.path,
      });
      continue;
    }

    deltas.push({
      kind: 'addition-removal',
      change: 'removed',
      path: baselineNode.path,
      role: baselineNode.role,
      name: baselineNode.name,
    });
  }

  for (const currentNode of currentNodes) {
    if (!baselineByPath.has(currentNode.path) && !visitedCurrentPaths.has(currentNode.path)) {
      deltas.push({
        kind: 'addition-removal',
        change: 'added',
        path: currentNode.path,
        role: currentNode.role,
        name: currentNode.name,
      });
    }
  }

  const sortedDeltas = [...deltas].sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
  const classes = uniqueSortedClasses(sortedDeltas);
  const baselineFingerprint = `sha256:${sha256(baselineNormalized)}`;
  const currentFingerprint = `sha256:${sha256(currentNormalized)}`;

  return {
    baselineFingerprint,
    currentFingerprint,
    driftFingerprint: `sha256:${sha256(stableStringify({ baselineFingerprint, currentFingerprint, deltas: sortedDeltas }))}`,
    hasDrift: sortedDeltas.length > 0,
    classes,
    deltas: sortedDeltas,
  };
}
