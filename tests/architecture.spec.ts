import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';

const rootDir = process.cwd();

function listTsFiles(relativeDir: string): string[] {
  const target = path.join(rootDir, relativeDir);
  if (!existsSync(target)) {
    return [];
  }

  const pending = [target];
  const files: string[] = [];

  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(nextPath);
        continue;
      }
      if (entry.isFile() && nextPath.endsWith('.ts')) {
        files.push(nextPath);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function importsFor(filePath: string): string[] {
  const text = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function relativeFile(filePath: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

test('domain layer does not depend on application, infrastructure, runtime, or tooling layers', () => {
  const forbidden = ['../application', '../infrastructure', '../runtime'];
  const offenders = listTsFiles('lib/domain').flatMap((filePath) =>
    importsFor(filePath)
      .filter((specifier) => forbidden.some((prefix) => specifier.startsWith(prefix)))
      .map((specifier) => `${relativeFile(filePath)} -> ${specifier}`),
  );

  expect(offenders).toEqual([]);
});

test('application layer depends on domain and application-local modules, not infrastructure or runtime', () => {
  const forbidden = ['../infrastructure', '../runtime'];
  const offenders = listTsFiles('lib/application').flatMap((filePath) =>
    importsFor(filePath)
      .filter((specifier) => forbidden.some((prefix) => specifier.startsWith(prefix)))
      .map((specifier) => `${relativeFile(filePath)} -> ${specifier}`),
  );

  expect(offenders).toEqual([]);
});

test('runtime layer remains isolated from application and infrastructure orchestration', () => {
  const forbidden = ['../application', '../infrastructure'];
  const offenders = listTsFiles('lib/runtime').flatMap((filePath) =>
    importsFor(filePath)
      .filter((specifier) => forbidden.some((prefix) => specifier.startsWith(prefix)))
      .map((specifier) => `${relativeFile(filePath)} -> ${specifier}`),
  );

  expect(offenders).toEqual([]);
});

test('infrastructure layer depends on application ports/domain, not runtime internals', () => {
  const forbidden = ['../runtime', '../../runtime'];
  const offenders = listTsFiles('lib/infrastructure').flatMap((filePath) =>
    importsFor(filePath)
      .filter((specifier) => forbidden.some((prefix) => specifier.startsWith(prefix)))
      .map((specifier) => `${relativeFile(filePath)} -> ${specifier}`),
  );

  expect(offenders).toEqual([]);
});

test('legacy compiler/adapters/tools/reporter directories no longer carry TypeScript sources', () => {
  const legacyFiles = [
    ...listTsFiles('lib/compiler'),
    ...listTsFiles('lib/adapters'),
    ...listTsFiles('lib/tools'),
    ...listTsFiles('lib/reporter'),
  ].map(relativeFile);

  expect(legacyFiles).toEqual([]);
});
