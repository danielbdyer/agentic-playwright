import { cpSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { createProjectPaths, type ProjectPaths } from '../../lib/application/paths';

/** Seeds that live under dogfood/ in the repo but are copied into the workspace's dogfood/ subtree. */
const suiteSeeds = [
  'fixtures',
  'benchmarks',
  'controls',
  'knowledge',
  'scenarios',
  '.ado-sync',
] as const;

/** Seeds that live at the repo root and are copied to the workspace root. */
const engineSeeds = [
  '.tesseract/evidence',
  '.tesseract/policy',
] as const;

function copySeed(srcRoot: string, dstRoot: string, relativePath: string): void {
  cpSync(path.join(srcRoot, relativePath), path.join(dstRoot, relativePath), {
    recursive: true,
    force: true,
  });
}

export interface TestWorkspace {
  readonly rootDir: string;
  readonly suiteRoot: string;
  readonly paths: ProjectPaths;
  /** Resolve a path relative to the engine root (repo root). */
  readonly resolve: (...segments: string[]) => string;
  /** Resolve a path relative to the suite root (dogfood/). */
  readonly suiteResolve: (...segments: string[]) => string;
  readonly readText: (...segments: string[]) => string;
  readonly readJson: <T>(...segments: string[]) => T;
  /** Read text from the suite root (dogfood/). */
  readonly suiteReadText: (...segments: string[]) => string;
  /** Read JSON from the suite root (dogfood/). */
  readonly suiteReadJson: <T>(...segments: string[]) => T;
  readonly cleanup: () => void;
}

export function createTestWorkspace(name: string): TestWorkspace {
  const repoRoot = process.cwd();
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), `tesseract-${name}-`));
  const suiteRoot = path.join(workspaceRoot, 'dogfood');
  const repoSuiteRoot = path.join(repoRoot, 'dogfood');

  for (const seed of suiteSeeds) {
    copySeed(repoSuiteRoot, suiteRoot, seed);
    // Keep legacy root-level test expectations working while the repo migrates
    // toward suite-rooted canon under dogfood/.
    copySeed(repoSuiteRoot, workspaceRoot, seed);
  }
  for (const seed of engineSeeds) {
    copySeed(repoRoot, workspaceRoot, seed);
  }

  const readUtf8 = (base: string, segments: string[]) =>
    readFileSync(path.join(base, ...segments), 'utf8').replace(/^\uFEFF/, '');

  return {
    rootDir: workspaceRoot,
    suiteRoot,
    paths: createProjectPaths(workspaceRoot, suiteRoot),
    resolve: (...segments: string[]) => path.join(workspaceRoot, ...segments),
    suiteResolve: (...segments: string[]) => path.join(suiteRoot, ...segments),
    readText: (...segments: string[]) => readUtf8(workspaceRoot, segments),
    readJson: <T>(...segments: string[]) => JSON.parse(readUtf8(workspaceRoot, segments)) as T,
    suiteReadText: (...segments: string[]) => readUtf8(suiteRoot, segments),
    suiteReadJson: <T>(...segments: string[]) => JSON.parse(readUtf8(suiteRoot, segments)) as T,
    cleanup: () => {
      rmSync(workspaceRoot, { recursive: true, force: true });
    },
  };
}
