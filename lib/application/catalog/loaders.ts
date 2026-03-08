import YAML from 'yaml';
import { Effect } from 'effect';
import { trySync } from '../effect';
import { FileSystem } from '../ports';
import type { ProjectPaths } from '../paths';
import { createArtifactEnvelope } from './envelope';

export function readYamlArtifact<T>(
  paths: ProjectPaths,
  absolutePath: string,
  validate: (value: unknown) => T,
  errorCode: string,
  errorMessage: string,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const raw = yield* fs.readText(absolutePath);
    const artifact = yield* trySync(() => validate(YAML.parse(raw)), errorCode, errorMessage);
    return createArtifactEnvelope(paths, absolutePath, artifact);
  });
}

export function readJsonArtifact<T>(
  paths: ProjectPaths,
  absolutePath: string,
  validate: (value: unknown) => T,
  errorCode: string,
  errorMessage: string,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const raw = yield* fs.readJson(absolutePath);
    const artifact = yield* trySync(() => validate(raw), errorCode, errorMessage);
    return createArtifactEnvelope(paths, absolutePath, artifact);
  });
}

export function loadOptionalYamlArtifact<T>(
  paths: ProjectPaths,
  absolutePath: string,
  validate: (value: unknown) => T,
  errorCode: string,
  errorMessage: string,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    if (!(yield* fs.exists(absolutePath))) {
      return null;
    }
    return yield* readYamlArtifact(paths, absolutePath, validate, errorCode, errorMessage);
  });
}
