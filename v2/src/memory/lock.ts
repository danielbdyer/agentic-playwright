/**
 * Per-file in-process async lock. The MCP server is one process that handles
 * calls concurrently (an agent may drive app.act while flow.record mints), so
 * every read-modify-write of a screen's catalog and evidence runs inside
 * `withFileLock(<catalog file>)`. It is a promise chain per absolute path:
 * callers queue in arrival order, and a failing holder still releases.
 * It does not protect against a second process writing the same workspace.
 */
import path from 'node:path';

const tails = new Map<string, Promise<void>>();

export const withFileLock = async <T>(file: string, fn: () => Promise<T>): Promise<T> => {
  const key = path.resolve(file);
  const previous = tails.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  tails.set(key, tail);
  try {
    await previous;
    return await fn();
  } finally {
    release();
    // Drop the entry once nobody is queued behind us, so the map does not grow per file forever.
    if (tails.get(key) === tail) tails.delete(key);
  }
};

/** Number of files with a queued or running holder (for tests and diagnostics). */
export const lockedFileCount = (): number => tails.size;
