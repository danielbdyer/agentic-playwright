import path from 'path';
import { SchemaError } from '../../domain/kernel/errors';
import type { ProjectPaths } from './types';

export function resolvePathWithinRoot(rootDir: string, pathLike: string, valuePath: string): string {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedCandidate = path.resolve(resolvedRoot, pathLike);
  const relativeToRoot = path.relative(resolvedRoot, resolvedCandidate);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new SchemaError('resolved path escapes expected root', valuePath);
  }

  return resolvedCandidate;
}

export function relativeProjectPath(paths: ProjectPaths, absolutePath: string): string {
  const resolved = path.resolve(absolutePath);
  const resolvedSuite = path.resolve(paths.engine.suiteRoot);
  const resolvedRoot = path.resolve(paths.engine.rootDir);
  const base = resolved.startsWith(`${resolvedSuite}${path.sep}`) || resolved === resolvedSuite
    ? resolvedSuite
    : resolvedRoot;
  return path.relative(base, resolved).replace(/\\/g, '/');
}

export function translationCachePath(paths: ProjectPaths, key: string): string {
  return resolvePathWithinRoot(paths.engine.translationCacheDir, `${key}.translation.json`, 'key');
}

export function agentInterpretationCachePath(paths: ProjectPaths, key: string): string {
  return resolvePathWithinRoot(paths.engine.agentInterpretationCacheDir, `${key}.agent-interpretation.json`, 'key');
}
