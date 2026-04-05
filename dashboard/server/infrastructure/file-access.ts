import fs from 'fs';
import path from 'path';

export interface FileAccess {
  readonly readJsonFile: (relativePath: string) => unknown | null;
  readonly readTextFile: (relativePath: string) => string | null;
}

export const createFileAccess = (rootDir: string): FileAccess => {
  const resolve = (relativePath: string): string => path.join(rootDir, relativePath);

  const readTextFile = (relativePath: string): string | null => {
    try {
      return fs.readFileSync(resolve(relativePath), 'utf8');
    } catch {
      return null;
    }
  };

  const readJsonFile = (relativePath: string): unknown | null => {
    const text = readTextFile(relativePath);
    if (text === null) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  return {
    readJsonFile,
    readTextFile,
  };
};
