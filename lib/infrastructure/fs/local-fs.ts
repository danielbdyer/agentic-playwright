import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { FileSystemPort } from '../../application/ports';
import { tryFileSystem } from '../../application/effect';

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
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
    return tryFileSystem(async () => stripBom(await fs.readFile(filePath, 'utf8')), 'fs-read-failed', `Unable to read ${filePath}`, filePath);
  },

  writeText(filePath, contents) {
    return tryFileSystem(
      () => atomicWriteFile(filePath, contents),
      'fs-write-failed', `Unable to write ${filePath}`, filePath,
    );
  },

  readJson(filePath) {
    return tryFileSystem(
      async () => JSON.parse(stripBom(await fs.readFile(filePath, 'utf8'))),
      'json-read-failed',
      `Unable to read JSON from ${filePath}`,
      filePath,
    );
  },

  writeJson(filePath, value) {
    return tryFileSystem(
      () => atomicWriteFile(filePath, JSON.stringify(value, null, 2)),
      'json-write-failed', `Unable to write JSON to ${filePath}`, filePath,
    );
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

  listDir(dirPath) {
    return tryFileSystem(() => fs.readdir(dirPath), 'fs-list-failed', `Unable to list ${dirPath}`, dirPath);
  },

  ensureDir(dirPath) {
    return tryFileSystem(() => fs.mkdir(dirPath, { recursive: true }), 'fs-mkdir-failed', `Unable to create ${dirPath}`, dirPath);
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
