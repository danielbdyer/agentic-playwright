/**
 * Offline resolution replay laws (Cycle 11 / G3).
 *
 * Pins that a captured ResolutionTrace replays to the SAME verdict
 * the live run recorded — the property that makes a frozen held-out
 * contact re-analyzable offline. The replay mirrors the live
 * ladder, re-deriving the inventory rung through the same pure
 * kernel.
 *
 *   ZC50     strict-match trace → matched, strict.
 *   ZC50.b   phrase-reduction trace → matched, phrase-reduction.
 *   ZC50.c   inventory-scored trace → matched, inventory-scored, name.
 *   ZC50.d   hidden-best handoff trace → not-found (hidden never
 *            auto-accepts on replay).
 *   ZC50.e   zero-overlap handoff trace → not-found.
 *   ZC50.f   ambiguous (strict > 1, no dominant) → ambiguous.
 *   ZC50.g   replayMatchesLive holds for every shape above.
 *   ZC50.h   structured-pattern (G7) trace replays to matched.
 */

import { describe, test, expect } from 'vitest';
import {
  replayResolutionTrace,
  replayMatchesLive,
} from '../../workshop/customer-backlog/application/resolution-replay';
import type { ResolutionTrace } from '../../workshop/customer-backlog/application/public-aut-runner';

function trace(over: Partial<ResolutionTrace>): ResolutionTrace {
  return {
    verb: 'click',
    role: 'link',
    phrase: 'English language',
    structured: { matched: false, patternId: null, matcherId: null },
    strictCount: 0,
    reductions: [],
    inventory: [],
    confirmation: null,
    liveResolution: 'not-found',
    liveRung: null,
    ...over,
  };
}

describe('Cycle 11 / G3 — offline resolution replay', () => {
  test('ZC50: strict-match trace replays to matched/strict', () => {
    const t = trace({ strictCount: 1, liveResolution: 'matched', liveRung: 'strict' });
    expect(replayResolutionTrace(t)).toEqual({ resolution: 'matched', rung: 'strict', acceptedName: null });
    expect(replayMatchesLive(t)).toBe(true);
  });

  test('ZC50.b: phrase-reduction trace replays to matched/phrase-reduction', () => {
    const t = trace({
      strictCount: 0,
      reductions: [{ reduction: 'English', count: 1 }],
      liveResolution: 'matched',
      liveRung: 'phrase-reduction',
    });
    expect(replayResolutionTrace(t).rung).toBe('phrase-reduction');
    expect(replayMatchesLive(t)).toBe(true);
  });

  test('ZC50.c: inventory-scored trace replays to matched/inventory-scored with the name', () => {
    const t = trace({
      strictCount: 0,
      reductions: [{ reduction: 'English', count: 0 }],
      inventory: [
        { name: 'English', visible: true },
        { name: 'Contact Sales', visible: true },
      ],
      confirmation: { name: 'English', exactCount: 1, looseCount: 0 },
      liveResolution: 'matched',
      liveRung: 'inventory-scored',
    });
    const r = replayResolutionTrace(t);
    expect(r.rung).toBe('inventory-scored');
    expect(r.acceptedName).toBe('English');
    expect(replayMatchesLive(t)).toBe(true);
  });

  test('ZC50.d: hidden-best handoff trace replays to not-found', () => {
    // The cycle-9 shape: best candidate present but hidden → kernel
    // refuses → handoff. Replay must reproduce the refusal.
    const t = trace({
      strictCount: 0,
      reductions: [{ reduction: 'English', count: 0 }],
      inventory: [
        { name: 'English', visible: false },
        { name: 'Contact Sales', visible: true },
      ],
      confirmation: null,
      liveResolution: 'not-found',
      liveRung: null,
    });
    expect(replayResolutionTrace(t).resolution).toBe('not-found');
    expect(replayMatchesLive(t)).toBe(true);
  });

  test('ZC50.e: zero-overlap handoff trace replays to not-found', () => {
    const t = trace({
      phrase: 'Japanese language',
      strictCount: 0,
      reductions: [{ reduction: 'Japanese', count: 0 }, { reduction: 'language', count: 0 }],
      inventory: [{ name: '日本語', visible: true }],
      confirmation: null,
      liveResolution: 'not-found',
      liveRung: null,
    });
    expect(replayResolutionTrace(t).resolution).toBe('not-found');
    expect(replayMatchesLive(t)).toBe(true);
  });

  test('ZC50.h: structured-pattern (G7) trace replays to matched/structured-pattern', () => {
    const t = trace({
      structured: { matched: true, patternId: 'locator-by-role-and-name', matcherId: 'role-and-name-exact' },
      liveResolution: 'matched',
      liveRung: 'structured-pattern',
    });
    expect(replayResolutionTrace(t).rung).toBe('structured-pattern');
    expect(replayMatchesLive(t)).toBe(true);
  });

  test('ZC50.f: strict>1 with no dominant replays to ambiguous', () => {
    const t = trace({
      strictCount: 3,
      inventory: [
        { name: 'English', visible: true },
        { name: 'English', visible: true },
      ],
      confirmation: null,
      liveResolution: 'ambiguous',
      liveRung: null,
    });
    expect(replayResolutionTrace(t).resolution).toBe('ambiguous');
    expect(replayMatchesLive(t)).toBe(true);
  });
});
