/**
 * Customer-backlog corpus loader — Z11a.5 laws.
 *
 *   ZC40     loader reads all resolvable + needs-human fixtures.
 *   ZC40.b   filter by corpus works.
 *   ZC40.c   non-existent corpus dir yields empty result.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadCustomerBacklogCorpus } from '../../workshop/customer-backlog/application/load-corpus';

describe('Z11a.5 — customer-backlog corpus loader', () => {
  test('ZC40: loader reads all fixtures from both corpuses', () => {
    const cases = loadCustomerBacklogCorpus(process.cwd());
    // Should find 8 resolvable + 14 needs-human = 22.
    expect(cases.length).toBeGreaterThanOrEqual(22);
    const resolvable = cases.filter((c) => c.corpus === 'resolvable');
    const needsHuman = cases.filter((c) => c.corpus === 'needs-human');
    expect(resolvable.length).toBeGreaterThanOrEqual(8);
    expect(needsHuman.length).toBeGreaterThanOrEqual(14);
  });

  test('ZC40.b: every loaded case has an AdoSnapshot with steps', () => {
    const cases = loadCustomerBacklogCorpus(process.cwd());
    for (const c of cases) {
      expect(c.snapshot.id).toBeDefined();
      expect(c.snapshot.steps.length).toBeGreaterThan(0);
      expect(c.snapshot.contentHash).toBeDefined();
    }
  });

  test('ZC40.c: non-existent corpus dir → empty result without throwing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'customer-backlog-empty-'));
    try {
      const cases = loadCustomerBacklogCorpus(tmp);
      expect(cases).toEqual([]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('ZC40.d: loader skips non-.ado.json files in corpus dirs', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'customer-backlog-mixed-'));
    try {
      const resolvableDir = path.join(tmp, 'workshop', 'customer-backlog', 'fixtures', 'resolvable');
      fs.mkdirSync(resolvableDir, { recursive: true });
      fs.writeFileSync(
        path.join(resolvableDir, '99001-test.ado.json'),
        JSON.stringify({
          id: '99001', revision: 1, title: 'x', suitePath: 'x', areaPath: 'x',
          iterationPath: 'x', tags: [], priority: 1, steps: [{ index: 1, action: 'a', expected: 'b' }],
          parameters: [], dataRows: [], contentHash: 'x', syncedAt: '2026-04-23T00:00:00.000Z',
        }),
      );
      fs.writeFileSync(path.join(resolvableDir, 'README.md'), '# docs');
      fs.writeFileSync(path.join(resolvableDir, '99001-test.yaml'), 'not: json');

      const cases = loadCustomerBacklogCorpus(tmp);
      expect(cases.length).toBe(1);
      expect(cases[0]!.snapshot.id).toBe('99001');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
