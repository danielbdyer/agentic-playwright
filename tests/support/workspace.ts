import { cpSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { createProjectPaths, type ProjectPaths } from '../../product/application/paths';

/** Seeds that live under dogfood/ in the repo but are copied into the workspace's dogfood/ subtree.
 *  Step 1 (2026-04-19) retired `benchmarks/` and `knowledge/` from the runtime
 *  load path — their reference-canon lineage is gone. The same content
 *  survives as TEST FIXTURES under `tests/fixtures/` so behaviors that
 *  depended on this data for coverage continue to verify what they used to. */
const suiteSeeds = [
  'fixtures',
  'controls',
  'scenarios',
  '.ado-sync',
] as const;

/** Test-fixture seeds that live at `tests/fixtures/` in the repo and are
 *  copied into the workspace as if they were part of the suite tree. The
 *  workspace still exposes them at their expected paths (`knowledge/`,
 *  `benchmarks/`, `controls/...`) so the catalog loader finds the
 *  artifacts during load. The production suite root does NOT ship
 *  these; they are test-only content.
 *
 *  NOTE: `knowledge/patterns/form-entry.behavior.yaml` is a STANDALONE
 *  ad-hoc fixture, not a seeded pattern — individual integration tests
 *  copy it into their workspace explicitly. The seed enumeration below
 *  deliberately skips `knowledge/patterns/` to avoid that ad-hoc fixture
 *  conflicting with tests that inject their own pattern files. */
const testFixtureSeeds: ReadonlyArray<readonly [string, string]> = [
  ['knowledge/components', 'knowledge/components'],
  ['knowledge/patterns/core.patterns.yaml', 'knowledge/patterns/core.patterns.yaml'],
  ['knowledge/routes', 'knowledge/routes'],
  ['knowledge/screens', 'knowledge/screens'],
  ['knowledge/snapshots', 'knowledge/snapshots'],
  ['knowledge/surfaces', 'knowledge/surfaces'],
  ['benchmarks', 'benchmarks'],
  ['controls/datasets', 'controls/datasets'],
  ['controls/resolution', 'controls/resolution'],
  ['controls/variance', 'controls/variance'],
];

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
  // Test-only fixture seeds — copy from tests/fixtures/ and land at
  // their expected suite-relative and workspace-root paths.
  const testFixturesRoot = path.join(repoRoot, 'tests', 'fixtures');
  for (const [src, dst] of testFixtureSeeds) {
    copySeed(testFixturesRoot, suiteRoot, src);
    if (src !== dst) continue;
    copySeed(testFixturesRoot, workspaceRoot, src);
  }

  // Remove ephemeral synthetic scenarios — they balloon the workspace and cause
  // dogfood loop tests to timeout by running 150+ scenarios instead of the 4
  // seeded demo scenarios.
  for (const root of [suiteRoot, workspaceRoot]) {
    const syntheticDir = path.join(root, 'scenarios', 'synthetic');
    rmSync(syntheticDir, { recursive: true, force: true });
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
