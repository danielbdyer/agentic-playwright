import { sha256, stableStringify } from '../../domain/kernel/hash';

export interface ProjectionInputFingerprint {
  kind: string;
  path: string;
  fingerprint: string;
}

export interface ProjectionBuildManifest {
  version: 1;
  projection: string;
  inputSetFingerprint: string;
  outputFingerprint: string;
  inputs: ProjectionInputFingerprint[];
}

export type ProjectionCacheInvalidationReason = 'missing-output' | 'invalid-output';

export function fingerprintProjectionArtifact(kind: string, artifactPath: string, artifact: unknown): ProjectionInputFingerprint {
  return {
    kind,
    path: artifactPath,
    fingerprint: `sha256:${sha256(stableStringify(artifact))}`,
  };
}

export function sortProjectionInputs(values: ProjectionInputFingerprint[]): ProjectionInputFingerprint[] {
  return [...values].sort((left, right) => {
    const kindOrder = left.kind.localeCompare(right.kind);
    if (kindOrder !== 0) {
      return kindOrder;
    }
    return left.path.localeCompare(right.path);
  });
}

export function computeProjectionInputSetFingerprint(inputs: ProjectionInputFingerprint[]): string {
  return `sha256:${sha256(stableStringify(sortProjectionInputs(inputs)))}`;
}

function normalizeProjectionValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => (entry === undefined ? null : normalizeProjectionValue(entry)));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .flatMap(([key, entry]) => entry !== undefined ? [[key, normalizeProjectionValue(entry)]] : []),
    );
  }

  return value;
}

export function fingerprintProjectionOutput(value: unknown): string {
  return `sha256:${sha256(stableStringify(normalizeProjectionValue(value)))}`;
}

export function diffProjectionInputs(inputs: ProjectionInputFingerprint[], previousManifest: ProjectionBuildManifest | null) {
  const sorted = sortProjectionInputs(inputs);
  return {
    sortedInputs: sorted,
    changedInputs: sorted
      .flatMap((entry) => previousManifest?.inputs.find((candidate) => candidate.kind === entry.kind && candidate.path === entry.path)?.fingerprint !== entry.fingerprint ? [`${entry.kind}:${entry.path}`] : []),
    removedInputs: (previousManifest?.inputs ?? [])
      .flatMap((entry) => !sorted.some((candidate) => candidate.kind === entry.kind && candidate.path === entry.path) ? [`${entry.kind}:${entry.path}`] : []),
  };
}
