/**
 * Customer-backlog corpus loader — Z11a.5.
 *
 * Reads ADO snapshots from workshop/customer-backlog/fixtures/{resolvable,needs-human}/
 * as pure AdoSnapshot values. No Effect needed — this is a plain
 * filesystem walk invoked from CLI composition; tests use the
 * same function over a tempdir.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AdoSnapshot } from '../../../product/domain/intent/types';
import type { CustomerCompilationCorpus } from '../../compounding/domain/compilation-receipt';

export interface LoadedCorpusCase {
  readonly corpus: CustomerCompilationCorpus;
  readonly snapshot: AdoSnapshot;
  readonly fixturePath: string;
}

const CORPUS_DIRS: readonly CustomerCompilationCorpus[] = ['resolvable', 'needs-human'];

export function loadCustomerBacklogCorpus(rootDir: string): readonly LoadedCorpusCase[] {
  const fixturesRoot = path.join(rootDir, 'workshop', 'customer-backlog', 'fixtures');
  const cases: LoadedCorpusCase[] = [];
  for (const corpus of CORPUS_DIRS) {
    const dir = path.join(fixturesRoot, corpus);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith('.ado.json')) continue;
      const fullPath = path.join(dir, file);
      const raw = fs.readFileSync(fullPath, 'utf8');
      const snapshot = JSON.parse(raw) as AdoSnapshot;
      cases.push({ corpus, snapshot, fixturePath: fullPath });
    }
  }
  return cases;
}
