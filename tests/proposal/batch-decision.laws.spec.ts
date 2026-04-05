import { expect, test } from '@playwright/test';
import {
  INITIAL_BATCH_STATE,
  AUTO_APPROVAL_THRESHOLD,
  STATUS_COLORS,
  addItem,
  toggleSelection,
  toggleSelectAll,
  approveSelected,
  skipSelected,
  approveItem,
  skipItem,
  advanceTimer,
  computeSummary,
  hasPendingDecisions,
  timeoutProgress,
  selectedCount,
  formatTimeRemaining,
  type DecisionStatus,
} from '../../lib/domain/proposal/batch-decision';

const ALL_STATUSES: readonly DecisionStatus[] = [
  'pending', 'approved', 'skipped', 'auto-approved', 'blocked',
];

test.describe('BatchDecision laws', () => {

  test('Law 1: exactly 5 decision statuses with colors', () => {
    ALL_STATUSES.forEach((status) => {
      expect(STATUS_COLORS[status]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  test('Law 2: INITIAL_BATCH_STATE is empty', () => {
    expect(INITIAL_BATCH_STATE.items).toHaveLength(0);
    expect(INITIAL_BATCH_STATE.selectAll).toBe(false);
    expect(INITIAL_BATCH_STATE.elapsedMs).toBe(0);
  });

  test('Law 3: addItem creates pending item for normal confidence', () => {
    const state = addItem(INITIAL_BATCH_STATE, 'p1', 'knowledge', 'test', 0.7, 'standard', 100);
    expect(state.items).toHaveLength(1);
    expect(state.items[0]!.status).toBe('pending');
    expect(state.items[0]!.decidedAt).toBeNull();
  });

  test('Law 4: addItem auto-approves high confidence items', () => {
    const state = addItem(INITIAL_BATCH_STATE, 'p1', 'knowledge', 'test', AUTO_APPROVAL_THRESHOLD, 'standard', 100);
    expect(state.items[0]!.status).toBe('auto-approved');
    expect(state.items[0]!.decidedAt).toBe(100);
  });

  test('Law 5: addItem blocks items with blocked rule', () => {
    const state = addItem(INITIAL_BATCH_STATE, 'p1', 'knowledge', 'test', 0.9, 'blocked', 100);
    expect(state.items[0]!.status).toBe('blocked');
  });

  test('Law 6: toggleSelection toggles pending item', () => {
    let state = addItem(INITIAL_BATCH_STATE, 'p1', 'knowledge', 'test', 0.7, 'standard', 100);
    expect(state.items[0]!.selected).toBe(false);
    state = toggleSelection(state, 'p1');
    expect(state.items[0]!.selected).toBe(true);
    state = toggleSelection(state, 'p1');
    expect(state.items[0]!.selected).toBe(false);
  });

  test('Law 7: toggleSelectAll selects all pending items', () => {
    let state = addItem(INITIAL_BATCH_STATE, 'p1', 'knowledge', 'a', 0.5, 'standard', 100);
    state = addItem(state, 'p2', 'element', 'b', 0.6, 'standard', 200);
    state = addItem(state, 'p3', 'pattern', 'c', 0.99, 'standard', 300); // auto-approved
    state = toggleSelectAll(state);
    expect(state.selectAll).toBe(true);
    // Only pending items are selected
    const pendingSelected = state.items.filter((i) => i.status === 'pending' && i.selected);
    const nonPendingSelected = state.items.filter((i) => i.status !== 'pending' && i.selected);
    expect(pendingSelected).toHaveLength(2);
    expect(nonPendingSelected).toHaveLength(0);
  });

  test('Law 8: approveSelected approves only selected items', () => {
    let state = addItem(INITIAL_BATCH_STATE, 'p1', 'knowledge', 'a', 0.5, 'standard', 100);
    state = addItem(state, 'p2', 'element', 'b', 0.6, 'standard', 200);
    state = toggleSelection(state, 'p1');
    state = approveSelected(state, 300);
    expect(state.items.find((i) => i.proposalId === 'p1')!.status).toBe('approved');
    expect(state.items.find((i) => i.proposalId === 'p2')!.status).toBe('pending');
  });

  test('Law 9: approveSelected approves all pending when none selected', () => {
    let state = addItem(INITIAL_BATCH_STATE, 'p1', 'knowledge', 'a', 0.5, 'standard', 100);
    state = addItem(state, 'p2', 'element', 'b', 0.6, 'standard', 200);
    state = approveSelected(state, 300);
    expect(state.items.every((i) => i.status === 'approved')).toBe(true);
  });

  test('Law 10: skipSelected skips selected items', () => {
    let state = addItem(INITIAL_BATCH_STATE, 'p1', 'knowledge', 'a', 0.5, 'standard', 100);
    state = toggleSelection(state, 'p1');
    state = skipSelected(state, 200);
    expect(state.items[0]!.status).toBe('skipped');
  });

  test('Law 11: approveItem approves specific item', () => {
    let state = addItem(INITIAL_BATCH_STATE, 'p1', 'knowledge', 'a', 0.5, 'standard', 100);
    state = addItem(state, 'p2', 'element', 'b', 0.6, 'standard', 200);
    state = approveItem(state, 'p2', 300);
    expect(state.items[0]!.status).toBe('pending');
    expect(state.items[1]!.status).toBe('approved');
  });

  test('Law 12: skipItem skips specific item', () => {
    let state = addItem(INITIAL_BATCH_STATE, 'p1', 'knowledge', 'a', 0.5, 'standard', 100);
    state = skipItem(state, 'p1', 200);
    expect(state.items[0]!.status).toBe('skipped');
  });

  test('Law 13: advanceTimer auto-skips on timeout', () => {
    let state = addItem(INITIAL_BATCH_STATE, 'p1', 'knowledge', 'a', 0.5, 'standard', 100);
    state = advanceTimer(state, state.timeoutMs + 1, 999);
    expect(state.items[0]!.status).toBe('skipped');
  });

  test('Law 14: advanceTimer does not skip before timeout', () => {
    let state = addItem(INITIAL_BATCH_STATE, 'p1', 'knowledge', 'a', 0.5, 'standard', 100);
    state = advanceTimer(state, 1000, 200);
    expect(state.items[0]!.status).toBe('pending');
  });

  test('Law 15: computeSummary counts correctly', () => {
    let state = addItem(INITIAL_BATCH_STATE, 'p1', 'knowledge', 'a', 0.5, 'standard', 100);
    state = addItem(state, 'p2', 'element', 'b', 0.99, 'standard', 200); // auto-approved
    state = addItem(state, 'p3', 'pattern', 'c', 0.8, 'blocked', 300); // blocked
    state = approveItem(state, 'p1', 400);
    const summary = computeSummary(state);
    expect(summary.total).toBe(3);
    expect(summary.approved).toBe(1);
    expect(summary.autoApproved).toBe(1);
    expect(summary.blocked).toBe(1);
    expect(summary.pending).toBe(0);
  });

  test('Law 16: hasPendingDecisions detects pending items', () => {
    expect(hasPendingDecisions(INITIAL_BATCH_STATE)).toBe(false);
    const state = addItem(INITIAL_BATCH_STATE, 'p1', 'knowledge', 'a', 0.5, 'standard', 100);
    expect(hasPendingDecisions(state)).toBe(true);
  });

  test('Law 17: timeoutProgress computes correctly', () => {
    const state = { ...INITIAL_BATCH_STATE, elapsedMs: 60000 };
    const progress = timeoutProgress(state);
    expect(progress).toBeCloseTo(60000 / state.timeoutMs, 3);
  });

  test('Law 18: timeoutProgress returns 0 for infinite timeout', () => {
    const state = { ...INITIAL_BATCH_STATE, timeoutMs: 0 };
    expect(timeoutProgress(state)).toBe(0);
  });

  test('Law 19: selectedCount counts selected pending items', () => {
    let state = addItem(INITIAL_BATCH_STATE, 'p1', 'knowledge', 'a', 0.5, 'standard', 100);
    state = addItem(state, 'p2', 'element', 'b', 0.6, 'standard', 200);
    state = toggleSelection(state, 'p1');
    expect(selectedCount(state)).toBe(1);
  });

  test('Law 20: formatTimeRemaining formats correctly', () => {
    const state120 = { ...INITIAL_BATCH_STATE, elapsedMs: 0 };
    const remaining = formatTimeRemaining(state120);
    expect(remaining).toContain(':');

    const infinite = { ...INITIAL_BATCH_STATE, timeoutMs: 0 };
    expect(formatTimeRemaining(infinite)).toBe('\u221E'); // ∞
  });
});
