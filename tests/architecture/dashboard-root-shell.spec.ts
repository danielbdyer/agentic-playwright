import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';

const rootDir = process.cwd();
const dashboardSrcDir = path.join(rootDir, 'dashboard', 'src');
const canonicalBootstrap = path.join('dashboard', 'src', 'app', 'bootstrap.tsx');

const toPosix = (filePath: string): string => filePath.replace(/\\/g, '/');

const listTsAndTsxFiles = (dir: string): readonly string[] => {
  const pending = [dir];
  const files: string[] = [];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(nextPath);
        continue;
      }

      if (entry.isFile() && (nextPath.endsWith('.ts') || nextPath.endsWith('.tsx'))) {
        files.push(nextPath);
      }
    }
  }

  return files
    .sort((left, right) => left.localeCompare(right))
    .map((filePath) => toPosix(path.relative(rootDir, filePath)));
};

test('dashboard has a single canonical root shell and bootstrap entrypoint', () => {
  const bootstrapPath = path.join(rootDir, canonicalBootstrap);
  expect(existsSync(bootstrapPath)).toBeTruthy();

  const legacyShellPath = path.join(rootDir, 'dashboard', 'src', 'app.tsx');
  expect(existsSync(legacyShellPath)).toBeFalsy();

  const rootCreators = listTsAndTsxFiles(dashboardSrcDir).flatMap((relativePath) => {
    const absolutePath = path.join(rootDir, relativePath);
    const source = readFileSync(absolutePath, 'utf8').replace(/^\uFEFF/, '');
    return source.includes('createRoot(') ? [relativePath] : [];
  });

  expect(rootCreators).toEqual([canonicalBootstrap]);
});
