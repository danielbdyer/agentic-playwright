import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const ensureDir = async (dir: string): Promise<void> => {
  await fs.mkdir(dir, { recursive: true });
};

export const exists = async (file: string): Promise<boolean> => {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
};

/** Write via temp file + rename so a reader never sees a half-written file. */
export const writeFileAtomic = async (file: string, content: string | Buffer): Promise<void> => {
  await ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(temp, content);
  await fs.rename(temp, file);
};

export const readText = async (file: string): Promise<string | null> => {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
};

export const readJson = async <T>(file: string): Promise<T | null> => {
  const text = await readText(file);
  return text === null ? null : (JSON.parse(text) as T);
};

export const writeJson = async (file: string, value: unknown): Promise<void> => {
  await writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
};

/**
 * Append one JSON line. Append-only by construction: there is no API in this
 * package that rewrites a .jsonl file in place.
 */
export const appendJsonl = async (file: string, value: unknown): Promise<void> => {
  await ensureDir(path.dirname(file));
  await fs.appendFile(file, `${JSON.stringify(value)}\n`, 'utf8');
};

export const readJsonl = async <T>(file: string): Promise<readonly T[]> => {
  const text = await readText(file);
  if (text === null) return [];
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
};

export const listFiles = async (dir: string, suffix?: string): Promise<readonly string[]> => {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && (suffix === undefined || entry.name.endsWith(suffix)))
      .map((entry) => path.join(dir, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
};

/** POSIX-style relative path, for anything written into a file or a receipt. */
export const relativePosix = (from: string, to: string): string =>
  path.relative(from, to).split(path.sep).join('/');
