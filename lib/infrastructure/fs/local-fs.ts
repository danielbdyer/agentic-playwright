import { Effect } from 'effect';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { FileSystemPort } from '../../application/ports';
import { retryWithBackoff, tryFileSystem } from '../../application/effect';
import type { FileSystemError } from '../../domain/errors';

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
}


function isErrno(code: string, error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const maybeErrno = error as NodeJS.ErrnoException;
  return maybeErrno.code === code;
}

function isRetriableFileSystemRace(error: FileSystemError): boolean {
  return isErrno('ENOENT', error.cause) || isErrno('EEXIST', error.cause);
}

function withFileSystemRaceRetry<A>(
  effect: Effect.Effect<A, FileSystemError>,
): Effect.Effect<A, FileSystemError> {
  return effect.pipe(retryWithBackoff<FileSystemError>({
    baseDelayMs: 40,
    maxRecurs: 2,
    shouldRetry: isRetriableFileSystemRace,
  }));
}

/** Atomic write: write to a temp file in the same directory, then rename.
 *  Prevents concurrent readers from seeing partially-written content. */
async function atomicWriteFile(filePath: string, contents: string): Promise<void> {
  const dir = path.dirname(filePath);
  const attempt = async (): Promise<void> => {
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = path.join(dir, `.tmp-${crypto.randomBytes(8).toString('hex')}-${path.basename(filePath)}`);
    try {
      await fs.writeFile(tmpPath, contents, 'utf8');
      await fs.rename(tmpPath, filePath);
    } catch (error) {
      await fs.unlink(tmpPath).catch(() => {});
      throw error;
    }
  };
  await attempt();
}

export const LocalFileSystem: FileSystemPort = {
  readText(filePath) {
    return withFileSystemRaceRetry(tryFileSystem(async () => stripBom(await fs.readFile(filePath, 'utf8')), 'fs-read-failed', `Unable to read ${filePath}`, filePath));
  },

  writeText(filePath, contents) {
    return withFileSystemRaceRetry(tryFileSystem(
      () => atomicWriteFile(filePath, contents),
      'fs-write-failed', `Unable to write ${filePath}`, filePath,
    ));
  },

  readJson(filePath) {
    return withFileSystemRaceRetry(tryFileSystem(
      async () => JSON.parse(stripBom(await fs.readFile(filePath, 'utf8'))),
      'json-read-failed',
      `Unable to read JSON from ${filePath}`,
      filePath,
    ));
  },

  writeJson(filePath, value) {
    return withFileSystemRaceRetry(tryFileSystem(
      () => atomicWriteFile(filePath, JSON.stringify(value, null, 2)),
      'json-write-failed', `Unable to write JSON to ${filePath}`, filePath,
    ));
  },

  stat(filePath) {
    return withFileSystemRaceRetry(tryFileSystem(
      async () => {
        const info = await fs.stat(filePath);
        return { mtimeMs: info.mtimeMs };
      },
      'fs-stat-failed',
      `Unable to stat ${filePath}`,
      filePath,
    ));
  },

  exists(filePath) {
    return tryFileSystem(async () => {
      try {
        await fs.access(filePath);
        return true;
      } catch (error) {
        const maybe = error as NodeJS.ErrnoException;
        if (maybe.code === 'ENOENT') {
          return false;
        }
        throw error;
      }
    }, 'fs-access-failed', `Unable to inspect ${filePath}`, filePath);
  },

  removeFile(filePath) {
    return tryFileSystem(async () => {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        const maybe = error as NodeJS.ErrnoException;
        if (maybe.code !== 'ENOENT') {
          throw error;
        }
      }
    }, 'fs-unlink-failed', `Unable to remove file ${filePath}`, filePath);
  },

  listDir(dirPath) {
    return withFileSystemRaceRetry(tryFileSystem(() => fs.readdir(dirPath), 'fs-list-failed', `Unable to list ${dirPath}`, dirPath));
  },

  ensureDir(dirPath) {
    return withFileSystemRaceRetry(tryFileSystem(() => fs.mkdir(dirPath, { recursive: true }), 'fs-mkdir-failed', `Unable to create ${dirPath}`, dirPath));
  },

  removeDir(dirPath) {
    return tryFileSystem(async () => {
      try {
        await fs.rm(dirPath, { recursive: true, force: true });
      } catch (error) {
        const maybe = error as NodeJS.ErrnoException;
        if (maybe.code !== 'ENOENT') {
          throw error;
        }
      }
    }, 'fs-rmdir-failed', `Unable to remove ${dirPath}`, dirPath);
  },
};
