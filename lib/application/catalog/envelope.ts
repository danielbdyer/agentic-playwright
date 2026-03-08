import { sha256, stableStringify } from '../../domain/hash';
import type { ProjectPaths } from '../paths';
import { relativeProjectPath } from '../paths';
import type { ArtifactEnvelope } from './types';

export function fingerprintArtifact(artifact: unknown): string {
  return `sha256:${sha256(stableStringify(artifact))}`;
}

export function createArtifactEnvelope<T>(paths: ProjectPaths, absolutePath: string, artifact: T): ArtifactEnvelope<T> {
  return {
    artifact,
    absolutePath,
    artifactPath: relativeProjectPath(paths, absolutePath),
    fingerprint: fingerprintArtifact(artifact),
  };
}

export function upsertArtifactEnvelope<T>(
  entries: ArtifactEnvelope<T>[],
  entry: ArtifactEnvelope<T>,
  matches: (candidate: ArtifactEnvelope<T>) => boolean,
): ArtifactEnvelope<T>[] {
  return [...entries.filter((candidate) => !matches(candidate)), entry]
    .sort((left, right) => left.artifactPath.localeCompare(right.artifactPath));
}
