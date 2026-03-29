import { expect, test } from '@playwright/test';
import {
  RUNG_COLORS,
  RUNG_QUALITY,
  INITIAL_RING_STATE,
  addRingAttempt,
  collapseToSuccess,
  shatterToFailure,
  pruneCompleted,
  lerpColor,
  type ResolutionRung,
} from '../dashboard/src/spatial/resolution-rings';

test.describe('ResolutionRings laws', () => {

  test('Law 1: all 8 rungs have colors defined', () => {
    const rungs: readonly ResolutionRung[] = [
      'getByRole', 'getByLabel', 'getByPlaceholder', 'getByText',
      'getByTestId', 'css', 'xpath', 'needs-human',
    ];
    rungs.forEach((r) => {
      expect(RUNG_COLORS[r]).toBeTruthy();
      expect(typeof RUNG_QUALITY[r]).toBe('number');
    });
  });

  test('Law 2: rung quality decreases from getByRole to needs-human', () => {
    expect(RUNG_QUALITY['getByRole']).toBeGreaterThan(RUNG_QUALITY['getByText']);
    expect(RUNG_QUALITY['getByText']).toBeGreaterThan(RUNG_QUALITY['css']);
    expect(RUNG_QUALITY['css']).toBeGreaterThan(RUNG_QUALITY['needs-human']);
  });

  test('Law 3: INITIAL_RING_STATE is empty', () => {
    expect(INITIAL_RING_STATE.elements.size).toBe(0);
    expect(INITIAL_RING_STATE.totalAttempts).toBe(0);
    expect(INITIAL_RING_STATE.totalResolved).toBe(0);
    expect(INITIAL_RING_STATE.totalFailed).toBe(0);
  });

  test('Law 4: addRingAttempt creates element with one ring', () => {
    const state = addRingAttempt(INITIAL_RING_STATE, 'elem-1', 'login', 'getByRole', [0, 0, 0]);
    expect(state.elements.size).toBe(1);
    const elem = state.elements.get('elem-1')!;
    expect(elem.rings).toHaveLength(1);
    expect(elem.rings[0]!.rung).toBe('getByRole');
    expect(elem.outcome).toBe('pending');
    expect(state.totalAttempts).toBe(1);
  });

  test('Law 5: subsequent attempts add concentric rings with increasing radius', () => {
    let state = addRingAttempt(INITIAL_RING_STATE, 'elem-1', 'login', 'getByRole', [0, 0, 0]);
    state = addRingAttempt(state, 'elem-1', 'login', 'getByLabel', [0, 0, 0]);
    state = addRingAttempt(state, 'elem-1', 'login', 'getByText', [0, 0, 0]);

    const elem = state.elements.get('elem-1')!;
    expect(elem.rings).toHaveLength(3);
    // Each ring should have a larger radius
    expect(elem.rings[1]!.radius).toBeGreaterThan(elem.rings[0]!.radius);
    expect(elem.rings[2]!.radius).toBeGreaterThan(elem.rings[1]!.radius);
  });

  test('Law 6: max 8 rings per element', () => {
    let state = INITIAL_RING_STATE;
    for (let i = 0; i < 10; i++) {
      state = addRingAttempt(state, 'elem-1', 'login', 'getByRole', [0, 0, 0]);
    }
    const elem = state.elements.get('elem-1')!;
    expect(elem.rings.length).toBeLessThanOrEqual(8);
  });

  test('Law 7: collapseToSuccess sets outcome to resolved', () => {
    let state = addRingAttempt(INITIAL_RING_STATE, 'elem-1', 'login', 'getByRole', [0, 0, 0]);
    state = addRingAttempt(state, 'elem-1', 'login', 'getByLabel', [0, 0, 0]);
    const collapsed = collapseToSuccess(state, 'elem-1', 'getByRole', 1.0);

    const elem = collapsed.elements.get('elem-1')!;
    expect(elem.outcome).toBe('resolved');
    expect(elem.resolvedRung).toBe('getByRole');
    expect(elem.animationProgress).toBe(1.0);
    expect(collapsed.totalResolved).toBe(1);
  });

  test('Law 8: collapseToSuccess brightens winning rung', () => {
    let state = addRingAttempt(INITIAL_RING_STATE, 'elem-1', 'login', 'getByRole', [0, 0, 0]);
    state = addRingAttempt(state, 'elem-1', 'login', 'getByText', [0, 0, 0]);

    const collapsed = collapseToSuccess(state, 'elem-1', 'getByRole', 0.5);
    const elem = collapsed.elements.get('elem-1')!;

    const winnerOpacity = elem.rings.find((r) => r.rung === 'getByRole')!.opacity;
    const loserOpacity = elem.rings.find((r) => r.rung === 'getByText')!.opacity;
    expect(winnerOpacity).toBeGreaterThan(loserOpacity);
  });

  test('Law 9: shatterToFailure sets outcome to failed', () => {
    const state = addRingAttempt(INITIAL_RING_STATE, 'elem-1', 'login', 'getByRole', [0, 0, 0]);
    const shattered = shatterToFailure(state, 'elem-1', 1.0);

    const elem = shattered.elements.get('elem-1')!;
    expect(elem.outcome).toBe('failed');
    expect(shattered.totalFailed).toBe(1);
  });

  test('Law 10: shatterToFailure expands ring radii', () => {
    const state = addRingAttempt(INITIAL_RING_STATE, 'elem-1', 'login', 'getByRole', [0, 0, 0]);
    const before = state.elements.get('elem-1')!.rings[0]!.radius;
    const shattered = shatterToFailure(state, 'elem-1', 0.5);
    const after = shattered.elements.get('elem-1')!.rings[0]!.radius;
    expect(after).toBeGreaterThan(before);
  });

  test('Law 11: pruneCompleted removes fully animated elements', () => {
    let state = addRingAttempt(INITIAL_RING_STATE, 'elem-1', 'login', 'getByRole', [0, 0, 0]);
    state = addRingAttempt(state, 'elem-2', 'search', 'getByText', [1, 0, 0]);

    // Collapse elem-1 fully, leave elem-2 pending
    state = collapseToSuccess(state, 'elem-1', 'getByRole', 1.0);
    const pruned = pruneCompleted(state);

    expect(pruned.elements.has('elem-1')).toBe(false); // Pruned
    expect(pruned.elements.has('elem-2')).toBe(true);  // Still pending
  });

  test('Law 12: lerpColor interpolates correctly', () => {
    expect(lerpColor('#000000', '#ffffff', 0)).toBe('#000000');
    expect(lerpColor('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  test('Law 13: different elements maintain independent ring state', () => {
    let state = addRingAttempt(INITIAL_RING_STATE, 'elem-1', 'login', 'getByRole', [0, 0, 0]);
    state = addRingAttempt(state, 'elem-2', 'search', 'css', [1, 0, 0]);
    state = addRingAttempt(state, 'elem-1', 'login', 'getByLabel', [0, 0, 0]);

    expect(state.elements.get('elem-1')!.rings).toHaveLength(2);
    expect(state.elements.get('elem-2')!.rings).toHaveLength(1);
    expect(state.totalAttempts).toBe(3);
  });
});
