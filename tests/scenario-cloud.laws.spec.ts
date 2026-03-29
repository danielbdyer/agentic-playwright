import { expect, test } from '@playwright/test';
import {
  scenarioAffinity,
  computeCloudPositions,
  computeListPositions,
  createCloudState,
  transitionToList,
  applySelection,
  applyDissolution,
  cloudStateForAct,
  MAX_CLOUD_CARDS,
  type ScenarioCard,
} from '../dashboard/src/spatial/scenario-cloud';

const CARDS: readonly ScenarioCard[] = [
  { id: 'tc-1', adoId: 'TC-1', title: 'Login flow', screenRefs: ['login', 'dashboard'], priority: 1, selected: false },
  { id: 'tc-2', adoId: 'TC-2', title: 'Search policy', screenRefs: ['dashboard', 'search'], priority: 2, selected: false },
  { id: 'tc-3', adoId: 'TC-3', title: 'File claim', screenRefs: ['claims'], priority: 3, selected: false },
  { id: 'tc-4', adoId: 'TC-4', title: 'Login validation', screenRefs: ['login'], priority: 4, selected: false },
];

test.describe('ScenarioCloud laws', () => {

  test('Law 1: scenarioAffinity is symmetric', () => {
    const a = scenarioAffinity(CARDS[0]!, CARDS[1]!);
    const b = scenarioAffinity(CARDS[1]!, CARDS[0]!);
    expect(a).toBeCloseTo(b, 10);
  });

  test('Law 2: scenarioAffinity is 0 for no shared refs', () => {
    expect(scenarioAffinity(CARDS[0]!, CARDS[2]!)).toBe(0); // login/dashboard vs claims
  });

  test('Law 3: scenarioAffinity is > 0 for shared refs', () => {
    expect(scenarioAffinity(CARDS[0]!, CARDS[1]!)).toBeGreaterThan(0); // shared: dashboard
  });

  test('Law 4: scenarioAffinity is 0 for empty refs', () => {
    const empty: ScenarioCard = { id: 'e', adoId: 'E', title: '', screenRefs: [], priority: 0, selected: false };
    expect(scenarioAffinity(empty, CARDS[0]!)).toBe(0);
  });

  test('Law 5: computeCloudPositions returns one position per card', () => {
    const positions = computeCloudPositions(CARDS);
    expect(positions).toHaveLength(CARDS.length);
  });

  test('Law 6: computeCloudPositions caps at MAX_CLOUD_CARDS', () => {
    const manyCards = Array.from({ length: 300 }, (_, i) => ({
      id: `tc-${i}`, adoId: `TC-${i}`, title: `Card ${i}`, screenRefs: [], priority: i, selected: false,
    }));
    const positions = computeCloudPositions(manyCards);
    expect(positions).toHaveLength(MAX_CLOUD_CARDS);
  });

  test('Law 7: computeListPositions returns sorted vertical layout', () => {
    const positions = computeListPositions(CARDS);
    expect(positions).toHaveLength(CARDS.length);
    // Each subsequent card should have a lower Y position
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]![1]).toBeLessThan(positions[i - 1]![1]);
    }
  });

  test('Law 8: createCloudState produces cloud layout', () => {
    const state = createCloudState(CARDS);
    expect(state.layout).toBe('cloud');
    expect(state.cards).toHaveLength(CARDS.length);
    expect(state.visuals).toHaveLength(CARDS.length);
    expect(state.selectionBoundaryY).toBeNull();
  });

  test('Law 9: transitionToList produces list layout', () => {
    const cloud = createCloudState(CARDS);
    const list = transitionToList(cloud);
    expect(list.layout).toBe('list');
    expect(list.selectionBoundaryY).not.toBeNull();
  });

  test('Law 10: applySelection colors selected cards green', () => {
    const list = transitionToList(createCloudState(CARDS));
    const selected = new Set(['TC-1', 'TC-2']);
    const applied = applySelection(list, selected);

    // TC-1 and TC-2 should be green
    const greenCards = applied.visuals.filter((v) => v.tint === 'green');
    const grayCards = applied.visuals.filter((v) => v.tint === 'gray');
    expect(greenCards).toHaveLength(2);
    expect(grayCards).toHaveLength(2);
  });

  test('Law 11: applyDissolution fades gray cards at progress=1', () => {
    const list = transitionToList(createCloudState(CARDS));
    const selected = new Set(['TC-1']);
    const applied = applySelection(list, selected);
    const dissolved = applyDissolution(applied, 1.0);

    expect(dissolved.layout).toBe('dissolving');
    const grayVisuals = dissolved.visuals.filter((v) => v.tint === 'gray');
    grayVisuals.forEach((v) => {
      expect(v.opacity).toBeCloseTo(0, 1);
    });
  });

  test('Law 12: cloudStateForAct returns cloud for act 1', () => {
    const state = cloudStateForAct(CARDS, 1);
    expect(state.layout).toBe('cloud');
  });

  test('Law 13: cloudStateForAct returns list for act 3', () => {
    const state = cloudStateForAct(CARDS, 3);
    expect(state.layout).toBe('list');
  });

  test('Law 14: cloudStateForAct returns dissolved for act 5', () => {
    const state = cloudStateForAct(CARDS, 5);
    expect(state.layout).toBe('dissolving');
  });
});
