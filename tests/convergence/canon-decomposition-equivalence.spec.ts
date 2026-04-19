/**
 * Canon Decomposition Equivalence Laws (Phase A item 3)
 *
 * Verifies that the decomposed canonical artifacts under
 * dogfood/.canonical-artifacts/ are loadable by the workspace
 * catalog and produce a non-empty tier1Atoms array.
 *
 * This is the migration tripwire: if the decomposition script
 * produces files that the catalog can't load, this test fails.
 * If the catalog loads zero atoms when there should be 46, this
 * test fails. When this test passes, the decomposed tree is a
 * valid alternative to the hybrid compound files.
 *
 * @see docs/cold-start-convergence-plan.md § 4.A item 3
 */
import { describe, test, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Effect } from 'effect';
import { createProjectPaths, type ProjectPaths } from '../../product/application/paths';
import { loadWorkspaceCatalog } from '../../product/application/catalog/workspace-catalog';
import type { WorkspaceCatalog } from '../../product/application/catalog/types';
import { runWithLocalServices } from '../../product/composition/local-services';

const SUITE_ROOT = path.resolve('dogfood');
const CANONICAL_ARTIFACTS_DIR = path.join(SUITE_ROOT, '.canonical-artifacts');

// Skip entirely if the decomposed tree doesn't exist (CI without
// dogfood content, or before the decomposition script has been run).
const hasDecomposedTree = fs.existsSync(CANONICAL_ARTIFACTS_DIR);

describe.skipIf(!hasDecomposedTree)('Canon decomposition equivalence (Phase A)', () => {
  let paths: ProjectPaths;
  let catalog: WorkspaceCatalog;

  beforeAll(async () => {
    paths = createProjectPaths('.', SUITE_ROOT);
    const program = loadWorkspaceCatalog({
      paths,
      knowledgePosture: 'warm-start',
      scope: 'compile',
    });
    catalog = await runWithLocalServices(program, '.', { suiteRoot: SUITE_ROOT });
  }, 30000);

  // ─── Law 1: tier1Atoms is non-empty ─────────────────────────

  test('Law 1: catalog loads non-zero tier1Atoms from .canonical-artifacts/', () => {
    expect(catalog.tier1Atoms.length).toBeGreaterThan(0);
  });

  // ─── Law 2: tier2Compositions is non-empty ──────────────────

  test('Law 2: catalog loads non-zero tier2Compositions from .canonical-artifacts/', () => {
    expect(catalog.tier2Compositions.length).toBeGreaterThan(0);
  });

  // ─── Law 3: atom count matches file count on disk ───────────

  test('Law 3: tier1Atoms count matches atom file count on disk', () => {
    const atomDir = path.join(CANONICAL_ARTIFACTS_DIR, 'atoms', 'agentic');
    const fileCount = countJsonFiles(atomDir);
    expect(catalog.tier1Atoms.length).toBe(fileCount);
  });

  // ─── Law 4: composition count matches file count on disk ────

  test('Law 4: tier2Compositions count matches composition file count on disk', () => {
    const compDir = path.join(CANONICAL_ARTIFACTS_DIR, 'compositions', 'agentic');
    const fileCount = countJsonFiles(compDir);
    expect(catalog.tier2Compositions.length).toBe(fileCount);
  });

  // ─── Law 5: every atom has a valid source field ─────────────

  test('Law 5: every loaded atom has source === "agentic-override"', () => {
    for (const entry of catalog.tier1Atoms) {
      expect(entry.artifact.source).toBe('agentic-override');
    }
  });

  // ─── Law 6: every atom has a non-empty inputFingerprint ─────

  test('Law 6: every loaded atom has a non-empty inputFingerprint', () => {
    for (const entry of catalog.tier1Atoms) {
      expect(entry.artifact.inputFingerprint.length).toBeGreaterThan(0);
    }
  });

  // ─── Law 7: atom classes present in the decomposed tree ─────

  test('Law 7: decomposed tree contains at least element, pattern, route, surface atom classes', () => {
    const classes = new Set(catalog.tier1Atoms.map((e) => e.artifact.class));
    expect(classes.has('element')).toBe(true);
    expect(classes.has('pattern')).toBe(true);
    expect(classes.has('route')).toBe(true);
    expect(classes.has('surface')).toBe(true);
  });

  // ─── Law 8: hybrid catalog still loads correctly ────────────

  test('Law 8: hybrid knowledge files (elements, hints, surfaces) still load', () => {
    // The decomposition script does NOT delete the hybrid files.
    // The catalog should still load them in the knowledge tier.
    expect(catalog.screenElements.length).toBeGreaterThan(0);
    expect(catalog.screenHints.length).toBeGreaterThan(0);
    expect(catalog.surfaces.length).toBeGreaterThan(0);
  });
});

// ─── Helpers ───

function countJsonFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countJsonFiles(full);
    } else if (entry.name.endsWith('.json')) {
      count++;
    }
  }
  return count;
}
