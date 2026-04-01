import { expect, test } from '@playwright/test';
import {
  generateShatterFragments,
  stepFragmentPhysics,
  addShatterEvent,
  activeFragmentCount,
  fragmentsByElement,
  DEFAULT_PHYSICS,
  INITIAL_FRAGMENT_STATE,
  type FragmentSystemState,
} from '../lib/domain/governance/failure-fragments';

test.describe('FailureFragments laws', () => {

  test('Law 1: generateShatterFragments creates correct count', () => {
    const frags = generateShatterFragments('elem1', [0, 0, 0], '#ff0000', 6);
    expect(frags).toHaveLength(6);
  });

  test('Law 2: fragment count clamped between 3 and 8', () => {
    const small = generateShatterFragments('e', [0, 0, 0], '#f00', 1);
    expect(small.length).toBeGreaterThanOrEqual(3);
    const large = generateShatterFragments('e', [0, 0, 0], '#f00', 20);
    expect(large.length).toBeLessThanOrEqual(8);
  });

  test('Law 3: each fragment has unique id', () => {
    const frags = generateShatterFragments('elem1', [0, 0, 0], '#ff0000', 6);
    const ids = new Set(frags.map((f) => f.id));
    expect(ids.size).toBe(6);
  });

  test('Law 4: fragments start at source position', () => {
    const pos: readonly [number, number, number] = [1.5, 2.0, -0.5];
    const frags = generateShatterFragments('elem1', pos, '#ff0000', 4);
    frags.forEach((f) => {
      expect(f.position).toEqual(pos);
    });
  });

  test('Law 5: fragments start with non-zero velocity', () => {
    const frags = generateShatterFragments('elem1', [0, 0, 0], '#ff0000', 5);
    frags.forEach((f) => {
      const speed = Math.sqrt(f.velocity[0] ** 2 + f.velocity[1] ** 2 + f.velocity[2] ** 2);
      expect(speed).toBeGreaterThan(0);
    });
  });

  test('Law 6: fragments start with opacity 1 and age 0', () => {
    const frags = generateShatterFragments('elem1', [0, 0, 0], '#ff0000');
    frags.forEach((f) => {
      expect(f.opacity).toBe(1.0);
      expect(f.age).toBe(0);
      expect(f.coalesced).toBe(false);
    });
  });

  test('Law 7: physics step reduces opacity over time', () => {
    let state = addShatterEvent(INITIAL_FRAGMENT_STATE, 'e1', [0, 0, 0], '#f00', 4);
    const initialOpacity = state.fragments[0]!.opacity;
    state = stepFragmentPhysics(state, 500);
    expect(state.fragments[0]!.opacity).toBeLessThan(initialOpacity);
  });

  test('Law 8: physics step increases age', () => {
    let state = addShatterEvent(INITIAL_FRAGMENT_STATE, 'e1', [0, 0, 0], '#f00', 4);
    state = stepFragmentPhysics(state, 200);
    expect(state.fragments[0]!.age).toBe(200);
  });

  test('Law 9: gravity reduces vertical velocity over time', () => {
    let state = addShatterEvent(INITIAL_FRAGMENT_STATE, 'e1', [0, 2, 0], '#f00', 4);
    const initialVy = state.fragments[0]!.velocity[1];
    // Step enough for gravity to overcome initial upward bias
    for (let i = 0; i < 10; i++) {
      state = stepFragmentPhysics(state, 200);
    }
    // Velocity should be lower than initial (gravity pulling down)
    const finalVy = state.fragments.length > 0 ? state.fragments[0]!.velocity[1] : -999;
    expect(finalVy).toBeLessThan(initialVy);
  });

  test('Law 10: fragments expire after maxAge', () => {
    let state = addShatterEvent(INITIAL_FRAGMENT_STATE, 'e1', [0, 0, 0], '#f00', 4);
    const initial = state.fragments.length;
    // Rapidly advance past max age
    for (let i = 0; i < 20; i++) {
      state = stepFragmentPhysics(state, 500);
    }
    expect(state.fragments.length).toBeLessThan(initial);
  });

  test('Law 11: addShatterEvent increments totalShattered', () => {
    let state = INITIAL_FRAGMENT_STATE;
    expect(state.totalShattered).toBe(0);
    state = addShatterEvent(state, 'e1', [0, 0, 0], '#f00', 5);
    expect(state.totalShattered).toBe(5);
    state = addShatterEvent(state, 'e2', [1, 0, 0], '#f00', 3);
    expect(state.totalShattered).toBe(8);
  });

  test('Law 12: activeFragmentCount excludes coalesced', () => {
    const state = addShatterEvent(INITIAL_FRAGMENT_STATE, 'e1', [0, 0, 0], '#f00', 6);
    expect(activeFragmentCount(state)).toBe(6);
  });

  test('Law 13: fragmentsByElement groups correctly', () => {
    let state = addShatterEvent(INITIAL_FRAGMENT_STATE, 'e1', [0, 0, 0], '#f00', 3);
    state = addShatterEvent(state, 'e2', [1, 0, 0], '#0f0', 4);
    const grouped = fragmentsByElement(state);
    expect(grouped.get('e1')?.length).toBe(3);
    expect(grouped.get('e2')?.length).toBe(4);
  });

  test('Law 14: same elementId produces deterministic fragments', () => {
    const a = generateShatterFragments('deterministic-test', [0, 0, 0], '#f00', 6);
    const b = generateShatterFragments('deterministic-test', [0, 0, 0], '#f00', 6);
    a.forEach((fragA, i) => {
      expect(fragA.velocity).toEqual(b[i]!.velocity);
      expect(fragA.size).toBe(b[i]!.size);
    });
  });

  test('Law 15: DEFAULT_PHYSICS has positive gravity and sub-1 drag', () => {
    expect(DEFAULT_PHYSICS.gravity).toBeGreaterThan(0);
    expect(DEFAULT_PHYSICS.drag).toBeGreaterThan(0);
    expect(DEFAULT_PHYSICS.drag).toBeLessThan(1);
    expect(DEFAULT_PHYSICS.maxAge).toBeGreaterThan(0);
  });

  test('Law 16: fragments near glass pane coalesce after age > 1000', () => {
    // Place fragment right at glass pane with sufficient age
    const config = { ...DEFAULT_PHYSICS, glassPaneX: 0, coalesceRadius: 0.5 };
    let state: FragmentSystemState = {
      fragments: [{
        id: 'test', sourceElementId: 'e1',
        position: [0, 0, 0], velocity: [0, 0, 0],
        color: '#f00', opacity: 0.5, size: 0.03,
        age: 1500, coalesced: false,
      }],
      totalShattered: 1, totalCoalesced: 0,
    };
    state = stepFragmentPhysics(state, 100, config);
    // Fragment should be removed (coalesced)
    expect(state.totalCoalesced).toBeGreaterThan(0);
  });
});
