import { sha256, stableStringify } from '../domain/hash';

export interface ProjectionInputFingerprint<TKind extends string> {
  kind: TKind;
  path: string;
  fingerprint: string;
}

export interface ProjectionBuildManifest<TProjection extends string, TKind extends string> {
  version: 1;
  projection: TProjection;
  inputSetFingerprint: string;
  outputFingerprint: string;
  inputs: ProjectionInputFingerprint<TKind>[];
}

export function fingerprintProjectionInput<TKind extends string>(
  kind: TKind,
  artifactPath: string,
  artifact: unknown,
): ProjectionInputFingerprint<TKind> {
  return {
    kind,
    path: artifactPath,
    fingerprint: `sha256:${sha256(stableStringify(artifact))}`,
  };
}

export function sortProjectionInputs<TKind extends string>(
  values: ReadonlyArray<ProjectionInputFingerprint<TKind>>,
): ProjectionInputFingerprint<TKind>[] {
  return [...values].sort((left, right) => {
    const kindOrder = left.kind.localeCompare(right.kind);
    if (kindOrder !== 0) {
      return kindOrder;
    }
    return left.path.localeCompare(right.path);
  });
}

export function computeProjectionInputSetFingerprint<TKind extends string>(
  inputs: ReadonlyArray<ProjectionInputFingerprint<TKind>>,
): string {
  return `sha256:${sha256(stableStringify(sortProjectionInputs(inputs)))}`;
}

export function parseProjectionManifest<TProjection extends string, TKind extends string>(
  value: unknown,
  options: {
    projection: TProjection;
    isKind: (value: unknown) => value is TKind;
  },
): ProjectionBuildManifest<TProjection, TKind> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const maybe = value as Partial<ProjectionBuildManifest<TProjection, TKind>>;
  if (
    maybe.version !== 1
    || maybe.projection !== options.projection
    || typeof maybe.inputSetFingerprint !== 'string'
    || typeof maybe.outputFingerprint !== 'string'
    || !Array.isArray(maybe.inputs)
  ) {
    return null;
  }

  for (const input of maybe.inputs) {
    if (!input || typeof input !== 'object') {
      return null;
    }
    const entry = input as Partial<ProjectionInputFingerprint<TKind>>;
    if (!options.isKind(entry.kind) || typeof entry.path !== 'string' || typeof entry.fingerprint !== 'string') {
      return null;
    }
  }

  return {
    version: 1,
    projection: options.projection,
    inputSetFingerprint: maybe.inputSetFingerprint,
    outputFingerprint: maybe.outputFingerprint,
    inputs: sortProjectionInputs(maybe.inputs as ProjectionInputFingerprint<TKind>[]),
  };
}

export function diffProjectionInputs<TKind extends string>(
  currentInputs: ReadonlyArray<ProjectionInputFingerprint<TKind>>,
  previousInputs: ReadonlyArray<ProjectionInputFingerprint<TKind>> | null | undefined,
): { changedInputs: string[]; removedInputs: boolean } {
  const changedInputs = currentInputs
    .filter((entry) => previousInputs?.find((candidate) => candidate.kind === entry.kind && candidate.path === entry.path)?.fingerprint !== entry.fingerprint)
    .map((entry) => `${entry.kind}:${entry.path}`);
  const removedInputs = (previousInputs ?? []).some(
    (entry) => !currentInputs.some((candidate) => candidate.kind === entry.kind && candidate.path === entry.path),
  );

  return {
    changedInputs,
    removedInputs,
  };
}
