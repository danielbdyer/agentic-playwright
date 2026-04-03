import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Duration, Effect, Schedule } from 'effect';
import type { FileSystemPort } from '../../application/ports';
import { FileSystemError, toFileSystemOperationError } from '../../domain/kernel/errors';

const stripBom = (value: string): string => value.replace(/^\uFEFF/, '');

const fsErrorCode = (error: unknown): string =>
  (error as { code?: string } | undefined)?.code ?? '';

const TRANSIENT_FS_CODES: ReadonlySet<string> = new Set(['EPERM', 'EBUSY']);

const isTransientFsError = (error: unknown): boolean =>
  TRANSIENT_FS_CODES.has(fsErrorCode(error));

/** Schedule: 3 retries with 100ms spacing for transient fs locks (OneDrive, sync tools). */
const transientRetrySchedule = Schedule.recurs(3).pipe(
  Schedule.intersect(Schedule.spaced(Duration.millis(100))),
);

/** Lift a promise-returning thunk into an Effect, tagging failures as FileSystemError. */
const attemptFs = <A>(operation: string, filePath: string, thunk: () => Promise<A>): Effect.Effect<A, FileSystemError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause: unknown) => cause,
  }).pipe(
    Effect.mapError((cause: unknown) => toFileSystemOperationError(cause, operation, filePath)),
  );

/** Atomic write as an Effect: write to temp file, rename into place.
 *  Retries on ENOENT (directory removed concurrently) and on transient
 *  lock errors (EPERM/EBUSY from OneDrive and similar sync tools). */
const atomicWrite = (filePath: string, contents: string): Effect.Effect<void, unknown> => {
  const dir = path.dirname(filePath);
  const writeAndRename = Effect.tryPromise({
    try: async () => {
      await fs.mkdir(dir, { recursive: true });
      const tmpPath = path.join(dir, `.tmp-${crypto.randomBytes(8).toString('hex')}-${path.basename(filePath)}`);
      try {
        await fs.writeFile(tmpPath, contents, 'utf8');
        await fs.rename(tmpPath, filePath);
      } catch (error) {
        await fs.unlink(tmpPath).catch(() => {});
        throw error;
      }
    },
    catch: (cause: unknown) => cause,
  });

  return writeAndRename.pipe(
    Effect.retry(Schedule.recurWhile<unknown>(isTransientFsError).pipe(
      Schedule.intersect(transientRetrySchedule),
    )),
    Effect.catchIf(
      (e: unknown) => fsErrorCode(e) === 'ENOENT',
      () => writeAndRename,
    ),
  );
};

export const LocalFileSystem: FileSystemPort = {
  readText(filePath) {
    return attemptFs('read', filePath, async () => stripBom(await fs.readFile(filePath, 'utf8')));
  },

  writeText(filePath, contents) {
    return atomicWrite(filePath, contents).pipe(
      Effect.mapError((cause: unknown) => toFileSystemOperationError(cause, 'write', filePath)),
    );
  },

  readJson(filePath) {
    return attemptFs('read-json', filePath, async () => JSON.parse(stripBom(await fs.readFile(filePath, 'utf8'))));
  },

  writeJson(filePath, value) {
    return atomicWrite(filePath, JSON.stringify(value, null, 2)).pipe(
      Effect.mapError((cause: unknown) => toFileSystemOperationError(cause, 'write-json', filePath)),
    );
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
      Effect.catchTag('FileSystemError', (error: FileSystemError) =>
        fsErrorCode(error.cause as unknown) === 'ENOENT'
          ? Effect.succeed(false)
          : Effect.fail(error),
      ),
    );
  },

  removeFile(filePath) {
    return attemptFs('unlink', filePath, () => fs.unlink(filePath)).pipe(
      Effect.catchTag('FileSystemError', (error: FileSystemError) =>
        fsErrorCode(error.cause as unknown) === 'ENOENT'
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
        fsErrorCode(error.cause as unknown) === 'ENOENT'
          ? Effect.void
          : Effect.fail(error)),
    );
  },
};
