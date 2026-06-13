/**
 * Held-out contact ledger laws (Cycle 11 / G5).
 *
 *   ZC47     append → load round-trips entries in order.
 *   ZC47.b   findDuplicateContacts flags a prior contact sharing a
 *            resolver fingerprint for the same AUT (clean-room C3:
 *            single evaluation per resolver state).
 *   ZC47.c   a different AUT, or a different resolver fingerprint,
 *            is not a duplicate.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  appendHeldOutContact,
  loadContactLedger,
  findDuplicateContacts,
  type HeldOutContactEntry,
} from '../../workshop/customer-backlog/application/contact-ledger';

function entry(over: Partial<HeldOutContactEntry>): HeldOutContactEntry {
  return {
    aut: 'saucedemo',
    url: 'https://www.saucedemo.com/',
    partition: 'held-out',
    cohortRole: 'held-out',
    mode: 'evaluation-handoff',
    evaluationHandoffAck: true,
    contactedAt: '2026-06-13T00:00:00.000Z',
    casesContacted: 3,
    resolverFingerprints: ['sha256:resolverA'],
    note: 'test',
    ...over,
  };
}

describe('Cycle 11 / G5 — held-out contact ledger', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'contact-ledger-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('ZC47: append then load round-trips in order', () => {
    expect(loadContactLedger(root)).toEqual([]);
    const a = entry({ contactedAt: '2026-06-13T01:00:00.000Z' });
    const b = entry({ contactedAt: '2026-06-13T02:00:00.000Z', resolverFingerprints: ['sha256:resolverB'] });
    appendHeldOutContact(root, a);
    appendHeldOutContact(root, b);
    const loaded = loadContactLedger(root);
    expect(loaded.length).toBe(2);
    expect(loaded[0]!.contactedAt).toBe('2026-06-13T01:00:00.000Z');
    expect(loaded[1]!.resolverFingerprints).toEqual(['sha256:resolverB']);
  });

  test('ZC47.b: a prior contact with the same AUT + resolver fp is a duplicate', () => {
    const prior = [entry({ resolverFingerprints: ['sha256:resolverA'] })];
    const dups = findDuplicateContacts(prior, {
      aut: 'saucedemo',
      resolverFingerprints: ['sha256:resolverA'],
    });
    expect(dups.length).toBe(1);
  });

  test('ZC47.c: different AUT or different resolver fp is not a duplicate', () => {
    const prior = [entry({ aut: 'saucedemo', resolverFingerprints: ['sha256:resolverA'] })];
    expect(
      findDuplicateContacts(prior, { aut: 'other-site', resolverFingerprints: ['sha256:resolverA'] }),
    ).toEqual([]);
    expect(
      findDuplicateContacts(prior, { aut: 'saucedemo', resolverFingerprints: ['sha256:resolverB'] }),
    ).toEqual([]);
  });
});
