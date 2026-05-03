/**
 * Public-AUT cohort loader.
 *
 * Reads the cohort manifest at workshop/customer-backlog/public-aut/cohort.json
 * and the per-AUT ADO snapshots, returning a structured cohort
 * shape that surfaces the clean-room partition (training vs held-out)
 * to downstream consumers.
 *
 * Distinct from `load-corpus.ts` (which loads the resolvable +
 * needs-human Z11a corpora). Public-AUT cohorts have different
 * measurement semantics — most notably, held-out entries must NEVER
 * feed canon graduation per spike §4.4 C2. Keeping the loader
 * separate makes the partition concern visible at the import seam.
 *
 * Pure — no Effect imports. The trust-policy gate's runtime check
 * for held-out contexts consumes this loader's output and refuses
 * canon writes when partition === 'held-out'.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AdoSnapshot } from '../../../product/domain/intent/types';

export type CohortPartition = 'training' | 'held-out';

export interface PublicAutManifestEntry {
  readonly name: string;
  readonly url: string;
  readonly partition: CohortPartition;
  readonly fixturesDir: string;
  readonly snapshotFingerprint: string | null;
  readonly authoringOperator: string;
  readonly addedAt: string;
  readonly notes?: string;
}

export interface PublicAutManifest {
  readonly $schemaVersion: number;
  readonly auts: readonly PublicAutManifestEntry[];
}

export interface LoadedPublicAutCase {
  readonly aut: PublicAutManifestEntry;
  readonly snapshot: AdoSnapshot;
  readonly fixturePath: string;
}

const MANIFEST_FILENAME = 'cohort.json';
const COHORT_DIR_RELATIVE = 'workshop/customer-backlog/public-aut';

export function loadPublicAutManifest(rootDir: string): PublicAutManifest {
  const manifestPath = path.join(rootDir, COHORT_DIR_RELATIVE, MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) {
    return { $schemaVersion: 1, auts: [] };
  }
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const parsed = JSON.parse(raw) as PublicAutManifest;
  return parsed;
}

export function loadPublicAutCohort(rootDir: string): readonly LoadedPublicAutCase[] {
  const manifest = loadPublicAutManifest(rootDir);
  const cohortRoot = path.join(rootDir, COHORT_DIR_RELATIVE);
  const cases: LoadedPublicAutCase[] = [];

  for (const aut of manifest.auts) {
    const autDir = path.join(cohortRoot, aut.fixturesDir);
    if (!fs.existsSync(autDir)) continue;
    for (const file of fs.readdirSync(autDir).sort()) {
      if (!file.endsWith('.ado.json')) continue;
      const fullPath = path.join(autDir, file);
      const raw = fs.readFileSync(fullPath, 'utf8');
      const snapshot = JSON.parse(raw) as AdoSnapshot;
      cases.push({ aut, snapshot, fixturePath: fullPath });
    }
  }

  return cases;
}

export function partitionedAuts(manifest: PublicAutManifest): {
  readonly training: readonly PublicAutManifestEntry[];
  readonly heldOut: readonly PublicAutManifestEntry[];
} {
  const training: PublicAutManifestEntry[] = [];
  const heldOut: PublicAutManifestEntry[] = [];
  for (const aut of manifest.auts) {
    if (aut.partition === 'training') training.push(aut);
    else heldOut.push(aut);
  }
  return { training, heldOut };
}
