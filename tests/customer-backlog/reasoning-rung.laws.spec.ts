/**
 * Cohort reasoning rung laws (Cycle 11 / Z11d — ZD2).
 *
 * The record/fill/replay triad exercised against a temp pool with a
 * stubbed confirm (no browser):
 *
 *   ZD2     record mode parks a pending request + defers (no match).
 *   ZD2.b   replay before any fill is a miss (deferred, no match).
 *   ZD2.c   replay after a fill of a menu candidate resolves at the
 *           reasoning rung (the 日本語 bridge), confirm permitting.
 *   ZD2.d   a fill of NONE refuses (no match, not deferred).
 *   ZD2.e   a fill naming a candidate NOT in the offered menu is
 *           rejected (no hallucinated targets).
 *   ZD2.f   a confirmed-but-non-unique chosen name does not resolve.
 *   ZD2.g   off mode + empty-menu are inert.
 *   ZD2.h   the fingerprint is stable across record→replay (cache).
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  attemptReasoningRung,
  type ReasoningRungInput,
} from '../../workshop/customer-backlog/application/reasoning-rung';
import {
  recordPending,
  readFilled,
  poolPaths,
} from '../../workshop/customer-backlog/application/reasoning-pool-fs';
import {
  PoolError,
  type FilledResponse,
} from '../../product/domain/reasoning-pool/pool';

const MENU = [
  { name: 'English', visible: true, score: 0 },
  { name: '日本語', visible: true, score: 0 },
  { name: 'Deutsch', visible: true, score: 0 },
];

function input(root: string, over: Partial<ReasoningRungInput>): ReasoningRungInput {
  return {
    rootDir: root,
    mode: 'record',
    verb: 'observe',
    role: 'link',
    phrase: 'Japanese language',
    candidates: MENU,
    confirm: async (name) => (name === '日本語' ? ({} as never) : null),
    ...over,
  };
}

describe('Cycle 11 / Z11d — cohort reasoning rung (ZD2)', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'reasoning-rung-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('ZD2: record mode parks a pending request and defers', async () => {
    const out = await attemptReasoningRung(input(root, { mode: 'record' }));
    expect(out.deferred).toBe(true);
    expect(out.matchedLocator).toBeNull();
    expect(out.pendingFingerprint).not.toBeNull();
    const { pendingDir } = poolPaths(root);
    expect(fs.existsSync(path.join(pendingDir, `${out.pendingFingerprint}.json`))).toBe(true);
  });

  test('ZD2.b: replay before any fill is a miss', async () => {
    const out = await attemptReasoningRung(input(root, { mode: 'replay' }));
    expect(out.matchedLocator).toBeNull();
    expect(out.deferred).toBe(true);
    expect(out.rationale).toMatch(/replay miss/);
  });

  test('ZD2.c: replay after a fill resolves the bridge at the reasoning rung', async () => {
    // Record to learn the fingerprint, then fill it with 日本語.
    const recorded = await attemptReasoningRung(input(root, { mode: 'record' }));
    const fp = recorded.pendingFingerprint!;
    const { filledDir } = poolPaths(root);
    fs.mkdirSync(filledDir, { recursive: true });
    const fill: FilledResponse = {
      fingerprint: fp as FilledResponse['fingerprint'],
      op: 'synthesize',
      text: '日本語',
      model: 'claude-code-session',
      filledBy: 'test',
      filledAt: '2026-06-13T00:00:00.000Z',
    };
    fs.writeFileSync(path.join(filledDir, `${fp}.json`), JSON.stringify(fill));

    const out = await attemptReasoningRung(input(root, { mode: 'replay' }));
    expect(out.matchedLocator).not.toBeNull();
    expect(out.resolvedName).toBe('日本語');
    expect(out.deferred).toBe(false);
    expect(out.rationale).toMatch(/bridged/);
  });

  test('ZD2.d: a fill of NONE refuses (no match, not deferred)', async () => {
    const recorded = await attemptReasoningRung(input(root, { mode: 'record' }));
    const fp = recorded.pendingFingerprint!;
    const { filledDir } = poolPaths(root);
    fs.mkdirSync(filledDir, { recursive: true });
    fs.writeFileSync(
      path.join(filledDir, `${fp}.json`),
      JSON.stringify({ fingerprint: fp, op: 'synthesize', text: 'NONE', model: 'm', filledBy: 't', filledAt: 'x' }),
    );
    const out = await attemptReasoningRung(input(root, { mode: 'replay' }));
    expect(out.matchedLocator).toBeNull();
    expect(out.deferred).toBe(false);
    expect(out.rationale).toMatch(/NONE/);
  });

  test('ZD2.e: a fill naming a candidate not in the menu is rejected', async () => {
    const recorded = await attemptReasoningRung(input(root, { mode: 'record' }));
    const fp = recorded.pendingFingerprint!;
    const { filledDir } = poolPaths(root);
    fs.mkdirSync(filledDir, { recursive: true });
    fs.writeFileSync(
      path.join(filledDir, `${fp}.json`),
      JSON.stringify({ fingerprint: fp, op: 'synthesize', text: 'Hallucinated Link', model: 'm', filledBy: 't', filledAt: 'x' }),
    );
    const out = await attemptReasoningRung(input(root, { mode: 'replay' }));
    expect(out.matchedLocator).toBeNull();
    expect(out.rationale).toMatch(/not in the offered menu/);
  });

  test('ZD2.f: a chosen name that does not confirm uniquely does not resolve', async () => {
    const recorded = await attemptReasoningRung(input(root, { mode: 'record' }));
    const fp = recorded.pendingFingerprint!;
    const { filledDir } = poolPaths(root);
    fs.mkdirSync(filledDir, { recursive: true });
    // Fill 'English' (in menu) but the confirm stub only confirms 日本語.
    fs.writeFileSync(
      path.join(filledDir, `${fp}.json`),
      JSON.stringify({ fingerprint: fp, op: 'synthesize', text: 'English', model: 'm', filledBy: 't', filledAt: 'x' }),
    );
    const out = await attemptReasoningRung(input(root, { mode: 'replay' }));
    expect(out.matchedLocator).toBeNull();
    expect(out.rationale).toMatch(/did not confirm/);
  });

  test('ZD2.g: off mode and empty menu are inert', async () => {
    expect((await attemptReasoningRung(input(root, { mode: 'off' }))).rationale).toMatch(/off/);
    const empty = await attemptReasoningRung(input(root, { mode: 'record', candidates: [] }));
    expect(empty.deferred).toBe(false);
    expect(empty.pendingFingerprint).toBeNull();
  });

  test('ZD2.h: fingerprint is stable across record and replay (cache key)', async () => {
    const a = await attemptReasoningRung(input(root, { mode: 'record' }));
    const b = await attemptReasoningRung(input(root, { mode: 'record' }));
    expect(a.pendingFingerprint).toBe(b.pendingFingerprint);
    // And the parked request is reloadable.
    const filled = readFilled(root, a.pendingFingerprint!);
    expect(filled).toBeInstanceOf(PoolError); // not filled yet
  });
});
