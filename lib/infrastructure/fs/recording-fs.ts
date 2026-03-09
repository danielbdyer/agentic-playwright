import path from 'path';
import { Effect } from 'effect';
import type { FileSystemPort } from '../../application/ports';
import { createProjectPaths } from '../../application/paths';
import type { ExecutionPosture, WriteJournalEntry } from '../../domain/types';

function normalizePath(filePath: string): string {
  return path.resolve(filePath);
}

function isSameOrNested(targetPath: string, rootPath: string): boolean {
  const normalizedTarget = normalizePath(targetPath);
  const normalizedRoot = normalizePath(rootPath);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function serializedJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function createRecordingWorkspaceFileSystem(input: {
  rootDir: string;
  posture: ExecutionPosture;
  delegate: FileSystemPort;
  journal: WriteJournalEntry[];
}): FileSystemPort {
  const rootDir = normalizePath(input.rootDir);
  const projectPaths = createProjectPaths(rootDir);
  const protectedRoots = [
    projectPaths.adoSyncDir,
    projectPaths.controlsDir,
    projectPaths.scenariosDir,
    projectPaths.knowledgeDir,
    projectPaths.tesseractDir,
    projectPaths.generatedDir,
    projectPaths.generatedTypesDir,
    projectPaths.benchmarksDir,
  ].map(normalizePath);
  const shadowFiles = new Map<string, string>();
  const shadowDirs = new Set<string>();

  function rememberDir(dirPath: string): void {
    let current = normalizePath(dirPath);
    while (isSameOrNested(current, rootDir)) {
      shadowDirs.add(current);
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  function recordWrite(operation: WriteJournalEntry['operation'], filePath: string, serialized: string): void {
    input.journal.push({
      path: normalizePath(filePath),
      operation,
      serialized,
    });
  }

  function isProtected(filePath: string): boolean {
    return protectedRoots.some((rootPath) => isSameOrNested(filePath, rootPath));
  }

  function shouldShadowWrite(filePath: string): boolean {
    return input.posture.writeMode === 'no-write' && isProtected(filePath);
  }

  function writeShadow(filePath: string, serialized: string): void {
    const normalizedPath = normalizePath(filePath);
    shadowFiles.set(normalizedPath, serialized);
    rememberDir(path.dirname(normalizedPath));
  }

  function listShadowEntries(dirPath: string): string[] {
    const normalizedDir = normalizePath(dirPath);
    const matches = new Set<string>();

    for (const candidate of shadowDirs) {
      if (!isSameOrNested(candidate, normalizedDir) || candidate === normalizedDir) {
        continue;
      }
      const relative = path.relative(normalizedDir, candidate);
      const next = relative.split(path.sep)[0];
      if (next) {
        matches.add(next);
      }
    }

    for (const candidate of shadowFiles.keys()) {
      if (!isSameOrNested(candidate, normalizedDir)) {
        continue;
      }
      const relative = path.relative(normalizedDir, candidate);
      const next = relative.split(path.sep)[0];
      if (next) {
        matches.add(next);
      }
    }

    return uniqueSorted(matches);
  }

  return {
    readText(filePath) {
      const normalizedPath = normalizePath(filePath);
      const shadow = shadowFiles.get(normalizedPath);
      if (shadow !== undefined) {
        return Effect.succeed(shadow);
      }
      return input.delegate.readText(filePath);
    },

    writeText(filePath, contents) {
      recordWrite('write-text', filePath, contents);
      if (shouldShadowWrite(filePath)) {
        writeShadow(filePath, contents);
        return Effect.void;
      }
      return input.delegate.writeText(filePath, contents);
    },

    readJson(filePath) {
      const normalizedPath = normalizePath(filePath);
      const shadow = shadowFiles.get(normalizedPath);
      if (shadow !== undefined) {
        return Effect.sync(() => JSON.parse(shadow));
      }
      return input.delegate.readJson(filePath);
    },

    writeJson(filePath, value) {
      const serialized = serializedJson(value);
      recordWrite('write-json', filePath, serialized);
      if (shouldShadowWrite(filePath)) {
        writeShadow(filePath, serialized);
        return Effect.void;
      }
      return input.delegate.writeJson(filePath, value);
    },

    exists(filePath) {
      const normalizedPath = normalizePath(filePath);
      if (shadowFiles.has(normalizedPath) || shadowDirs.has(normalizedPath)) {
        return Effect.succeed(true);
      }
      if (listShadowEntries(normalizedPath).length > 0) {
        return Effect.succeed(true);
      }
      return input.delegate.exists(filePath);
    },

    listDir(dirPath) {
      return Effect.gen(function* () {
        const shadowEntries = listShadowEntries(dirPath);
        const persistedExists = yield* input.delegate.exists(dirPath);
        const persistedEntries = persistedExists ? yield* input.delegate.listDir(dirPath) : [];
        return uniqueSorted([...persistedEntries, ...shadowEntries]);
      });
    },

    ensureDir(dirPath) {
      recordWrite('ensure-dir', dirPath, '');
      if (shouldShadowWrite(dirPath)) {
        rememberDir(dirPath);
        return Effect.void;
      }
      return input.delegate.ensureDir(dirPath);
    },
  };
}
