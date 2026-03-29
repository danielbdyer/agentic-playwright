import { expect, test } from '@playwright/test';
import {
  AUTO_BOOKMARK_TRIGGERS,
  INITIAL_DETECTION_STATE,
  detectAutoBookmarks,
  finalizeBookmarks,
  createManualBookmark,
  findBookmarkBySlot,
  assignBookmarkSlots,
} from '../dashboard/src/bookmark-system';
import type { DashboardEventKind } from '../lib/domain/types/dashboard';
import type { FlywheelAct } from '../lib/domain/scene-state-accumulator';

// ─── Helpers ───

function makeEvent(type: DashboardEventKind, data: Record<string, unknown>, seq: number, iteration = 0, act: FlywheelAct = 1) {
  return { type, timestamp: `2026-01-01T00:00:${String(seq).padStart(2, '0')}.000Z`, sequenceNumber: seq, iteration, act, data };
}

test.describe('Bookmark system laws', () => {

  test('Law 1: exactly 7 auto-bookmark triggers are registered', () => {
    expect(AUTO_BOOKMARK_TRIGGERS).toHaveLength(7);
  });

  test('Law 2: INITIAL_DETECTION_STATE starts empty', () => {
    expect(INITIAL_DETECTION_STATE.firedTriggerIds.size).toBe(0);
    expect(INITIAL_DETECTION_STATE.bookmarks).toHaveLength(0);
    expect(INITIAL_DETECTION_STATE.nextId).toBe(1);
    expect(INITIAL_DETECTION_STATE.maxHitRateDelta).toBe(0);
    expect(INITIAL_DETECTION_STATE.maxDeltaSequence).toBeNull();
  });

  test('Law 3: first element-probed triggers "First discovery" bookmark', () => {
    const event = makeEvent('element-probed', { screen: 'home', element: 'btn' }, 1, 0, 2);
    const state = detectAutoBookmarks(INITIAL_DETECTION_STATE, event);
    expect(state.bookmarks).toHaveLength(1);
    expect(state.bookmarks[0]!.label).toBe('First discovery');
    expect(state.bookmarks[0]!.kind).toBe('auto');
    expect(state.bookmarks[0]!.sequenceNumber).toBe(1);
  });

  test('Law 4: once-only triggers fire at most once', () => {
    const e1 = makeEvent('element-probed', { screen: 'home', element: 'a' }, 1, 0, 2);
    const e2 = makeEvent('element-probed', { screen: 'home', element: 'b' }, 2, 0, 2);
    const s1 = detectAutoBookmarks(INITIAL_DETECTION_STATE, e1);
    const s2 = detectAutoBookmarks(s1, e2);
    // Only one "First discovery" bookmark should exist
    const discoveries = s2.bookmarks.filter((b) => b.label === 'First discovery');
    expect(discoveries).toHaveLength(1);
  });

  test('Law 5: iteration-boundary trigger fires for each iteration-start', () => {
    const e1 = makeEvent('iteration-start', { iteration: 1 }, 1, 1, 4);
    const e2 = makeEvent('iteration-start', { iteration: 2 }, 100, 2, 4);
    const e3 = makeEvent('iteration-start', { iteration: 3 }, 200, 3, 4);
    const s1 = detectAutoBookmarks(INITIAL_DETECTION_STATE, e1);
    const s2 = detectAutoBookmarks(s1, e2);
    const s3 = detectAutoBookmarks(s2, e3);
    const iterBookmarks = s3.bookmarks.filter((b) => b.label.startsWith('Iteration'));
    expect(iterBookmarks).toHaveLength(3);
    expect(iterBookmarks[0]!.label).toBe('Iteration 1 start');
    expect(iterBookmarks[1]!.label).toBe('Iteration 2 start');
    expect(iterBookmarks[2]!.label).toBe('Iteration 3 start');
  });

  test('Law 6: first green test triggers "First green test" bookmark', () => {
    const event = makeEvent('scenario-executed', { adoId: 'TC-1', passed: true }, 50, 1, 5);
    const state = detectAutoBookmarks(INITIAL_DETECTION_STATE, event);
    expect(state.bookmarks.some((b) => b.label === 'First green test')).toBe(true);
  });

  test('Law 7: failed scenario does not trigger "First green test"', () => {
    const event = makeEvent('scenario-executed', { adoId: 'TC-1', passed: false }, 50, 1, 5);
    const state = detectAutoBookmarks(INITIAL_DETECTION_STATE, event);
    expect(state.bookmarks.some((b) => b.label === 'First green test')).toBe(false);
  });

  test('Law 8: convergence-evaluated with converged=true triggers "Convergence"', () => {
    const event = makeEvent('convergence-evaluated', { converged: true, knowledgeHitRate: 0.89 }, 500, 5, 7);
    const state = detectAutoBookmarks(INITIAL_DETECTION_STATE, event);
    expect(state.bookmarks.some((b) => b.label === 'Convergence')).toBe(true);
  });

  test('Law 9: largest hit-rate delta is tracked across events', () => {
    const e1 = makeEvent('convergence-evaluated', { converged: false, delta: 0.15 }, 100, 1, 7);
    const e2 = makeEvent('convergence-evaluated', { converged: false, delta: 0.08 }, 200, 2, 7);
    const e3 = makeEvent('convergence-evaluated', { converged: false, delta: 0.22 }, 300, 3, 7);
    const s3 = [e1, e2, e3].reduce(detectAutoBookmarks, INITIAL_DETECTION_STATE);
    expect(s3.maxHitRateDelta).toBe(0.22);
    expect(s3.maxDeltaSequence).toBe(300);
    expect(s3.maxDeltaIteration).toBe(3);
  });

  test('Law 10: finalizeBookmarks adds "Biggest improvement" bookmark', () => {
    const e1 = makeEvent('convergence-evaluated', { converged: false, delta: 0.15 }, 100, 1, 7);
    const s1 = detectAutoBookmarks(INITIAL_DETECTION_STATE, e1);
    const finalized = finalizeBookmarks(s1);
    expect(finalized.bookmarks.some((b) => b.label.startsWith('Biggest improvement'))).toBe(true);
    expect(finalized.bookmarks.find((b) => b.label.startsWith('Biggest improvement'))!.label).toContain('+15%');
  });

  test('Law 11: finalizeBookmarks is idempotent', () => {
    const e1 = makeEvent('convergence-evaluated', { converged: false, delta: 0.10 }, 100, 1, 7);
    const s1 = detectAutoBookmarks(INITIAL_DETECTION_STATE, e1);
    const f1 = finalizeBookmarks(s1);
    const f2 = finalizeBookmarks(f1);
    const bigImprovements = f2.bookmarks.filter((b) => b.label.startsWith('Biggest improvement'));
    expect(bigImprovements).toHaveLength(1);
  });

  test('Law 12: manual bookmarks are created with correct kind and label', () => {
    const event = makeEvent('progress', {}, 42, 2, 5);
    const state = createManualBookmark(INITIAL_DETECTION_STATE, 'Interesting moment', event, 3);
    expect(state.bookmarks).toHaveLength(1);
    expect(state.bookmarks[0]!.kind).toBe('manual');
    expect(state.bookmarks[0]!.label).toBe('Interesting moment');
    expect(state.bookmarks[0]!.slotIndex).toBe(3);
  });

  test('Law 13: findBookmarkBySlot returns correct bookmark', () => {
    const event = makeEvent('progress', {}, 42, 2, 5);
    const state = createManualBookmark(INITIAL_DETECTION_STATE, 'Test', event, 5);
    expect(findBookmarkBySlot(state, 5)!.label).toBe('Test');
    expect(findBookmarkBySlot(state, 3)).toBeNull();
  });

  test('Law 14: assignBookmarkSlots assigns 1-9 in priority order', () => {
    // Create several auto-bookmarks
    const events = [
      makeEvent('element-probed', { screen: 'home', element: 'btn' }, 1, 0, 2),
      makeEvent('scenario-compiled', { adoId: 'TC-1' }, 10, 0, 4),
      makeEvent('scenario-executed', { adoId: 'TC-1', passed: true }, 20, 1, 5),
      makeEvent('knowledge-activated', { proposalId: 'P-1' }, 30, 1, 6),
      makeEvent('convergence-evaluated', { converged: true, knowledgeHitRate: 0.89, delta: 0.15 }, 50, 3, 7),
    ];
    const detected = events.reduce(detectAutoBookmarks, INITIAL_DETECTION_STATE);
    const finalized = finalizeBookmarks(detected);
    const slotted = assignBookmarkSlots(finalized);

    // All bookmarks should have slots assigned
    const withSlots = slotted.bookmarks.filter((b) => b.slotIndex !== null);
    expect(withSlots.length).toBeGreaterThan(0);
    expect(withSlots.length).toBeLessThanOrEqual(9);

    // Convergence should have slot 1 (highest priority)
    const convergence = slotted.bookmarks.find((b) => b.label === 'Convergence');
    expect(convergence?.slotIndex).toBe(1);
  });

  test('Law 15: detectAutoBookmarks is pure — same events produce same state', () => {
    const event = makeEvent('element-probed', { screen: 'home', element: 'btn' }, 1, 0, 2);
    const s1 = detectAutoBookmarks(INITIAL_DETECTION_STATE, event);
    const s2 = detectAutoBookmarks(INITIAL_DETECTION_STATE, event);
    expect(s1.bookmarks.length).toBe(s2.bookmarks.length);
    expect(s1.firedTriggerIds.size).toBe(s2.firedTriggerIds.size);
  });

  test('Law 16: events without matching triggers do not produce bookmarks', () => {
    const event = makeEvent('progress', { phase: 'capture' }, 1, 0, 2);
    const state = detectAutoBookmarks(INITIAL_DETECTION_STATE, event);
    expect(state.bookmarks).toHaveLength(0);
  });
});
