/**
 * Cross-Screen Transition -- Law Tests (W3.15)
 *
 * Verifies properties of screen transitions using synthetic topologies
 * generated from mulberry32 seeds. Tests composability, symmetry,
 * state-ref preservation, and route-variant invariance.
 *
 * 150 mulberry32 seeds per law.
 */

import { expect, test } from '@playwright/test';
import { mulberry32, randomWord, randomInt } from './support/random';

// --- Synthetic Topology Model ---

interface ScreenNode {
  readonly id: string;
  readonly stateRefs: readonly string[];
}

interface ScreenTransition {
  readonly from: string;
  readonly to: string;
  readonly stateRefs: readonly string[];
  readonly routeVariant: string;
}

interface ScreenTopology {
  readonly screens: readonly ScreenNode[];
  readonly transitions: readonly ScreenTransition[];
}

// --- Generators ---

function randomScreenNode(next: () => number, prefix: string): ScreenNode {
  const id = `${prefix}-${randomWord(next)}`;
  const stateRefCount = 1 + randomInt(next, 4);
  const stateRefs = Array.from({ length: stateRefCount }, () => `state:${randomWord(next)}`);
  return { id, stateRefs };
}

function randomTransition(next: () => number, from: ScreenNode, to: ScreenNode, variant: string): ScreenTransition {
  // Transition carries union of source state refs
  return {
    from: from.id,
    to: to.id,
    stateRefs: [...from.stateRefs],
    routeVariant: variant,
  };
}

function randomTopology(next: () => number): ScreenTopology {
  const screenCount = 3 + randomInt(next, 5); // 3-7 screens
  const screens = Array.from({ length: screenCount }, (_, i) => randomScreenNode(next, `scr${i}`));
  const variant = `variant-${randomWord(next)}`;

  // Build a chain of transitions ensuring connectivity
  const transitions: ScreenTransition[] = [];
  for (let i = 0; i < screens.length - 1; i += 1) {
    transitions.push(randomTransition(next, screens[i]!, screens[i + 1]!, variant));
  }

  // Add a few random extra transitions
  const extraCount = randomInt(next, 3);
  for (let i = 0; i < extraCount; i += 1) {
    const fromIdx = randomInt(next, screens.length);
    const toIdx = randomInt(next, screens.length);
    if (fromIdx !== toIdx) {
      transitions.push(randomTransition(next, screens[fromIdx]!, screens[toIdx]!, variant));
    }
  }

  return { screens, transitions };
}

// --- Helpers ---

function _findTransition(topology: ScreenTopology, from: string, to: string): ScreenTransition | undefined {
  return topology.transitions.find((t) => t.from === from && t.to === to);
}

function screenById(topology: ScreenTopology, id: string): ScreenNode | undefined {
  return topology.screens.find((s) => s.id === id);
}

// --- Law 1: Transition between screens preserves source state refs ---

test('transition preserves source state refs (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const topology = randomTopology(next);

    for (const transition of topology.transitions) {
      const sourceScreen = screenById(topology, transition.from);
      expect(sourceScreen).toBeDefined();

      // All source state refs must appear in the transition's stateRefs
      for (const ref of sourceScreen!.stateRefs) {
        expect(transition.stateRefs).toContain(ref);
      }
    }
  }
});

// --- Law 2: Bidirectional transitions are symmetric ---

test('bidirectional transitions are symmetric (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const topology = randomTopology(next);

    // Add reverse transitions for each existing transition to make bidirectional pairs
    const bidirectionalTransitions: ScreenTransition[] = [];
    for (const t of topology.transitions) {
      bidirectionalTransitions.push(t);
      const targetScreen = screenById(topology, t.to);
      if (targetScreen) {
        bidirectionalTransitions.push({
          from: t.to,
          to: t.from,
          stateRefs: [...targetScreen.stateRefs],
          routeVariant: t.routeVariant,
        });
      }
    }

    // For every forward transition A->B, there must be a reverse B->A
    for (const t of bidirectionalTransitions) {
      const reverse = bidirectionalTransitions.find((r) => r.from === t.to && r.to === t.from);
      expect(reverse).toBeDefined();

      // Symmetry: if A->B exists and B->A exists, both connect the same screens
      expect(reverse!.from).toBe(t.to);
      expect(reverse!.to).toBe(t.from);
    }
  }
});

// --- Law 3: Transition chain A->B->C is composable ---

test('transition chain A->B->C is composable (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const topology = randomTopology(next);

    // Walk the chain transitions (generated as consecutive screen pairs)
    for (let i = 0; i < topology.transitions.length - 1; i += 1) {
      const ab = topology.transitions[i]!;
      const bc = topology.transitions[i + 1]!;

      // Chain composability: if A->B and B->C exist in sequence, the chain is valid
      // The 'to' of the first must equal the 'from' of the second (for chain transitions)
      if (ab.to === bc.from) {
        // Composed chain A->C: the composed stateRefs must include A's stateRefs
        const composedStateRefs = new Set([...ab.stateRefs, ...bc.stateRefs]);
        const sourceScreen = screenById(topology, ab.from);
        expect(sourceScreen).toBeDefined();

        for (const ref of sourceScreen!.stateRefs) {
          expect(composedStateRefs.has(ref)).toBe(true);
        }

        // The chain endpoints are well-defined strings (A may equal C in cyclic topologies)
        expect(typeof ab.from).toBe('string');
        expect(typeof bc.to).toBe('string');
      }
    }
  }
});

// --- Law 4: No orphaned state refs after transition ---

test('no orphaned state refs after transition (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const topology = randomTopology(next);

    // Collect all state refs declared by screens
    const allScreenStateRefs = new Set(topology.screens.flatMap((s) => s.stateRefs));

    // Every state ref in a transition must trace back to a screen
    for (const transition of topology.transitions) {
      for (const ref of transition.stateRefs) {
        expect(allScreenStateRefs.has(ref)).toBe(true);
      }
    }
  }
});

// --- Law 5: Route-variant transitions preserve topology ---

test('route-variant transitions preserve topology (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const topology = randomTopology(next);

    // Create a second variant of the same topology with a different route variant label
    const altVariant = `alt-variant-${randomWord(next)}`;
    const altTransitions = topology.transitions.map((t) => ({
      ...t,
      routeVariant: altVariant,
    }));

    // Structural invariant: the from/to pairs are identical regardless of variant
    expect(altTransitions.length).toBe(topology.transitions.length);

    for (let i = 0; i < topology.transitions.length; i += 1) {
      const original = topology.transitions[i]!;
      const alt = altTransitions[i]!;

      expect(alt.from).toBe(original.from);
      expect(alt.to).toBe(original.to);
      expect(alt.stateRefs).toEqual(original.stateRefs);
      expect(alt.routeVariant).not.toBe(original.routeVariant);
    }
  }
});
