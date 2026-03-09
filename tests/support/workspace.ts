import { cpSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { createProjectPaths, type ProjectPaths } from '../../lib/application/paths';

const workspaceSeeds = [
  'fixtures',
  'benchmarks',
  'controls',
  'knowledge',
  'scenarios',
  '.tesseract/evidence',
  '.tesseract/policy',
] as const;

function copySeed(rootDir: string, workspaceRoot: string, relativePath: string): void {
  cpSync(path.join(rootDir, relativePath), path.join(workspaceRoot, relativePath), {
    recursive: true,
    force: true,
  });
}

export interface TestWorkspace {
  rootDir: string;
  paths: ProjectPaths;
  resolve: (...segments: string[]) => string;
  readText: (...segments: string[]) => string;
  readJson: <T>(...segments: string[]) => T;
  cleanup: () => void;
}

export function createTestWorkspace(name: string): TestWorkspace {
  const repoRoot = process.cwd();
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), `tesseract-${name}-`));

  for (const seed of workspaceSeeds) {
    copySeed(repoRoot, workspaceRoot, seed);
  }

  return {
    rootDir: workspaceRoot,
    paths: createProjectPaths(workspaceRoot),
    resolve: (...segments: string[]) => path.join(workspaceRoot, ...segments),
    readText: (...segments: string[]) => readFileSync(path.join(workspaceRoot, ...segments), 'utf8').replace(/^\uFEFF/, ''),
    readJson: <T>(...segments: string[]) =>
      JSON.parse(readFileSync(path.join(workspaceRoot, ...segments), 'utf8').replace(/^\uFEFF/, '')) as T,
    cleanup: () => {
      rmSync(workspaceRoot, { recursive: true, force: true });
    },
  };
}
