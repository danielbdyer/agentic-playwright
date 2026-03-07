import { promises as fs } from 'fs';
import path from 'path';
import type { FileSystemPort } from '../../application/ports';
import { tryAsync } from '../../application/effect';

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
}

export const LocalFileSystem: FileSystemPort = {
  readText(filePath) {
    return tryAsync(async () => stripBom(await fs.readFile(filePath, 'utf8')), 'fs-read-failed', `Unable to read ${filePath}`);
  },

  writeText(filePath, contents) {
    return tryAsync(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, contents, 'utf8');
    }, 'fs-write-failed', `Unable to write ${filePath}`);
  },

  readJson(filePath) {
    return tryAsync(
      async () => JSON.parse(stripBom(await fs.readFile(filePath, 'utf8'))),
      'json-read-failed',
      `Unable to read JSON from ${filePath}`,
    );
  },

  writeJson(filePath, value) {
    return tryAsync(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
    }, 'json-write-failed', `Unable to write JSON to ${filePath}`);
  },

  exists(filePath) {
    return tryAsync(async () => {
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
    }, 'fs-access-failed', `Unable to inspect ${filePath}`);
  },

  listDir(dirPath) {
    return tryAsync(() => fs.readdir(dirPath), 'fs-list-failed', `Unable to list ${dirPath}`);
  },

  ensureDir(dirPath) {
    return tryAsync(() => fs.mkdir(dirPath, { recursive: true }), 'fs-mkdir-failed', `Unable to create ${dirPath}`);
  },
};

