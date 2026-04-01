import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Effect } from 'effect';
import type { FileSystemPort } from '../../application/ports';
import { FileSystemError, toFileSystemError, toFileSystemOperationError } from '../../domain/kernel/errors';

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
}

function attemptFs<A>(operation: string, filePath: string, thunk: () => Promise<A>): Effect.Effect<A, FileSystemError> {
  return Effect.tryPromise({
    try: thunk,
    catch: (cause) => cause,
  }).pipe(
    Effect.mapError((cause) => toFileSystemOperationError(cause, operation, filePath)),
  );
}

/** Atomic write: write to a temp file in the same directory, then rename.
 *  Prevents concurrent readers from seeing partially-written content.
 *  Retries mkdir+write once if the directory is removed between mkdir and write
 *  (can happen when cleanup runs concurrently with the next iteration's writes). */
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
  try {
    await attempt();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await attempt();
    } else {
      throw error;
    }
  }
}

export const LocalFileSystem: FileSystemPort = {
  readText(filePath) {
    return attemptFs('read', filePath, async () => stripBom(await fs.readFile(filePath, 'utf8')));
  },

  writeText(filePath, contents) {
    return attemptFs('write', filePath, () => atomicWriteFile(filePath, contents));
  },

  readJson(filePath) {
    return attemptFs('read-json', filePath, async () => JSON.parse(stripBom(await fs.readFile(filePath, 'utf8'))));
  },

  writeJson(filePath, value) {
    return attemptFs('write-json', filePath, () => atomicWriteFile(filePath, JSON.stringify(value, null, 2)));
  },

  stat(filePath) {
    return attemptFs('stat', filePath, async () => {
      const info = await fs.stat(filePath);
      return { mtimeMs: info.mtimeMs };
    });
  },

  exists(filePath) {
    return attemptFs('access', filePath, () => fs.access(filePath)).pipe(
      Effect.as(true),
      Effect.catchTag('FileSystemError', (error: FileSystemError) => {
        if ((error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
          return Effect.succeed(false);
        }
        return Effect.fail(error);
      }),
    );
  },

  removeFile(filePath) {
    return attemptFs('unlink', filePath, () => fs.unlink(filePath)).pipe(
      Effect.catchTag('FileSystemError', (error: FileSystemError) =>
        (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
          ? Effect.void
          : Effect.fail(error)),
    );
  },

  listDir(dirPath) {
    return attemptFs('list', dirPath, () => fs.readdir(dirPath));
  },

  ensureDir(dirPath) {
    return attemptFs('mkdir', dirPath, () => fs.mkdir(dirPath, { recursive: true }));
  },

  removeDir(dirPath) {
    return attemptFs('rmdir', dirPath, () => fs.rm(dirPath, { recursive: true, force: true })).pipe(
      Effect.catchTag('FileSystemError', (error: FileSystemError) =>
        (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
          ? Effect.void
          : Effect.fail(error)),
    );
  },
};
