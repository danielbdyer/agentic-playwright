import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cached: string | null = null;

/**
 * The tesseract-qa package directory, found by walking up from this module.
 * Works from src/ (tests) and dist/src/ (built), wherever the package is installed.
 */
export const packageRoot = (): string => {
  if (cached !== null) return cached;
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as { name?: string };
      if (pkg.name === 'tesseract-qa') {
        cached = dir;
        return dir;
      }
    } catch {
      // keep walking
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('tesseract-qa package root not found');
};

export const packageVersion = (): string => {
  const pkg = JSON.parse(readFileSync(path.join(packageRoot(), 'package.json'), 'utf8')) as { version?: string };
  return pkg.version ?? '0.0.0';
};
