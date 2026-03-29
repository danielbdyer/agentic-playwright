import { expect, test } from '@playwright/test';
import {
  ACT_METADATA,
  INITIAL_BADGE_STATE,
  beginActTransition,
  advanceBadgeTransition,
  completeBadgeTransition,
  updateProgress,
  advanceIteration,
  badgeLabel,
  shortBadgeLabel,
  outgoingOpacity,
  incomingOpacity,
  iterationLabel,
  allActMetadata,
} from '../lib/domain/act-indicator';

test.describe('ActIndicator laws', () => {

  test('Law 1: all 7 acts have metadata', () => {
    ([1, 2, 3, 4, 5, 6, 7] as const).forEach((act) => {
      const meta = ACT_METADATA[act];
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.shortName.length).toBeGreaterThan(0);
      expect(meta.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(meta.icon.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
    });
  });

  test('Law 2: INITIAL_BADGE_STATE starts at act 1, idle', () => {
    expect(INITIAL_BADGE_STATE.currentAct).toBe(1);
    expect(INITIAL_BADGE_STATE.phase).toBe('idle');
    expect(INITIAL_BADGE_STATE.iteration).toBe(1);
    expect(INITIAL_BADGE_STATE.previousAct).toBeNull();
  });

  test('Law 3: beginActTransition to same act is no-op', () => {
    const state = beginActTransition(INITIAL_BADGE_STATE, 1);
    expect(state).toBe(INITIAL_BADGE_STATE);
  });

  test('Law 4: beginActTransition to different act sets exiting phase', () => {
    const state = beginActTransition(INITIAL_BADGE_STATE, 2);
    expect(state.phase).toBe('exiting');
    expect(state.previousAct).toBe(1);
    expect(state.transitionProgress).toBe(0);
  });

  test('Law 5: advanceBadgeTransition first half is exiting', () => {
    const state = beginActTransition(INITIAL_BADGE_STATE, 2);
    const mid = advanceBadgeTransition(state, 0.3, 2);
    expect(mid.phase).toBe('exiting');
    expect(mid.transitionProgress).toBeCloseTo(0.6, 3);
  });

  test('Law 6: advanceBadgeTransition second half is entering', () => {
    const state = beginActTransition(INITIAL_BADGE_STATE, 2);
    const late = advanceBadgeTransition(state, 0.7, 2);
    expect(late.phase).toBe('entering');
    expect(late.currentAct).toBe(2);
  });

  test('Law 7: completeBadgeTransition settles to active', () => {
    const state = completeBadgeTransition(INITIAL_BADGE_STATE, 3);
    expect(state.currentAct).toBe(3);
    expect(state.phase).toBe('active');
    expect(state.transitionProgress).toBe(0);
    expect(state.previousAct).toBeNull();
  });

  test('Law 8: completeBadgeTransition can set new iteration', () => {
    const state = completeBadgeTransition(INITIAL_BADGE_STATE, 4, 3);
    expect(state.iteration).toBe(3);
  });

  test('Law 9: updateProgress sets progress value', () => {
    const state = updateProgress(INITIAL_BADGE_STATE, 0.5);
    expect(state.progress).toBe(0.5);
    const cleared = updateProgress(state, null);
    expect(cleared.progress).toBeNull();
  });

  test('Law 10: advanceIteration increments iteration', () => {
    const state = advanceIteration(INITIAL_BADGE_STATE);
    expect(state.iteration).toBe(2);
    const again = advanceIteration(state);
    expect(again.iteration).toBe(3);
  });

  test('Law 11: badgeLabel includes act number and name', () => {
    const label = badgeLabel(3);
    expect(label).toContain('3');
    expect(label).toContain('Suite Slicing');
  });

  test('Law 12: shortBadgeLabel is compact', () => {
    const label = shortBadgeLabel(5);
    expect(label).toContain('5');
    expect(label).toContain('Execute');
    expect(label.length).toBeLessThan(15);
  });

  test('Law 13: outgoingOpacity is 1 when active, fades when exiting', () => {
    const active = { ...INITIAL_BADGE_STATE, phase: 'active' as const };
    expect(outgoingOpacity(active)).toBe(1);
    const exiting = { ...active, phase: 'exiting' as const, transitionProgress: 0.5 };
    expect(outgoingOpacity(exiting)).toBe(0.5);
  });

  test('Law 14: incomingOpacity is 0 unless entering', () => {
    expect(incomingOpacity(INITIAL_BADGE_STATE)).toBe(0);
    const entering = { ...INITIAL_BADGE_STATE, phase: 'entering' as const, transitionProgress: 0.7 };
    expect(incomingOpacity(entering)).toBe(0.7);
  });

  test('Law 15: iterationLabel formats correctly', () => {
    expect(iterationLabel(1)).toBe('Iteration 1');
    expect(iterationLabel(42)).toBe('Iteration 42');
  });

  test('Law 16: allActMetadata returns 7 entries in order', () => {
    const all = allActMetadata();
    expect(all).toHaveLength(7);
    all.forEach((meta, i) => {
      expect(meta.act).toBe(i + 1);
    });
  });
});
