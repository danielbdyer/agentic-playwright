import { promises as fs } from 'fs';
import path from 'path';
import type { FileSystemPort } from '../../application/ports';
import { tryFileSystem } from '../../application/effect';

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
}

export const LocalFileSystem: FileSystemPort = {
  readText(filePath) {
    return tryFileSystem(async () => stripBom(await fs.readFile(filePath, 'utf8')), 'fs-read-failed', `Unable to read ${filePath}`, filePath);
  },

  writeText(filePath, contents) {
    return tryFileSystem(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, contents, 'utf8');
    }, 'fs-write-failed', `Unable to write ${filePath}`, filePath);
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
    return tryFileSystem(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
    }, 'json-write-failed', `Unable to write JSON to ${filePath}`, filePath);
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
