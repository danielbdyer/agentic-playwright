/**
 * Fluency dispatch harness — structural laws linking
 * `product/manifest/manifest.json` to the canonical-task fixture at
 * `product/tests/fluency/canonical-tasks.ts`.
 *
 *   - Every manifest verb has a canonical task.
 *   - Every canonical task names a verb present in the manifest.
 *   - The naive dispatcher routes each task to its declared verb.
 *
 * See `docs/v2-direction.md §6 Step 2` for the harness's role in
 * the fluency contract.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Manifest } from '../../domain/manifest/manifest';
import { CANONICAL_TASKS, type CanonicalTask } from './canonical-tasks';

const REPO_ROOT = path.resolve(__dirname, '../../..');

function loadManifest(): Manifest {
  const manifestPath = path.join(REPO_ROOT, 'product', 'manifest', 'manifest.json');
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as Manifest;
}

/** The naive dispatcher. It consults each task's declared `verb`
 *  field, which is the contract the fluency harness enforces. When
 *  a richer NLU dispatcher lands at a later step, this function
 *  grows a phrase-matcher that reads `prompt` — but the harness
 *  contract (prompt → expected verb) stays the same. */
function dispatchCanonicalTask(task: CanonicalTask): string {
  return task.verb;
}

describe('fluency dispatch harness', () => {
  test('every manifest verb has exactly one canonical task', () => {
    const manifest = loadManifest();
    const manifestVerbs = new Set(manifest.verbs.map((v) => v.name));
    const taskVerbs = new Set(CANONICAL_TASKS.map((t) => t.verb));

    const missing = [...manifestVerbs].filter((name) => !taskVerbs.has(name)).sort();
    expect(missing).toEqual([]);
  });

  test('every canonical task names a verb present in the manifest', () => {
    const manifest = loadManifest();
    const manifestVerbs = new Set(manifest.verbs.map((v) => v.name));

    const extra = CANONICAL_TASKS.map((t) => t.verb).filter((name) => !manifestVerbs.has(name));
    expect(extra).toEqual([]);
  });

  test('canonical tasks are unique by verb', () => {
    const byVerb = new Map<string, number>();
    for (const task of CANONICAL_TASKS) {
      byVerb.set(task.verb, (byVerb.get(task.verb) ?? 0) + 1);
    }
    const duplicates = [...byVerb.entries()].filter(([, count]) => count > 1).map(([name]) => name);
    expect(duplicates).toEqual([]);
  });

  test('the naive dispatcher routes each canonical task to its declared verb', () => {
    for (const task of CANONICAL_TASKS) {
      expect(dispatchCanonicalTask(task)).toBe(task.verb);
    }
  });
});
