import { expect, test } from '@playwright/test';
import {
  initialConvergenceState,
  transitionConvergence,
  foldConvergenceState,
  isTerminal,
  stateOrdinal,
} from '../lib/domain/projection/convergence-fsm';
import type { ConvergenceState, ConvergenceEvent } from '../lib/domain/projection/convergence-fsm';

// ─── Law: Terminal states are absorbing ───

test('converged state is absorbing — any event keeps it converged', () => {
  const terminal: ConvergenceState = { kind: 'converged', reason: 'no-proposals' };

  const events: readonly ConvergenceEvent[] = [
    { kind: 'iteration-complete', proposalsGenerated: 5, proposalsActivated: 5, hitRateDelta: 0.1 },
    { kind: 'budget-check', instructionsUsed: 10, maxInstructions: 100 },
    { kind: 'iteration-limit', current: 1, max: 10 },
  ];

  for (const event of events) {
    const next = transitionConvergence(terminal, event);
    expect(next.kind).toBe('converged');
    expect(next).toEqual(terminal);
  }
});

test('converged with every reason is absorbing', () => {
  const reasons = ['no-proposals', 'threshold-met', 'budget-exhausted', 'max-iterations'] as const;
  const event: ConvergenceEvent = { kind: 'iteration-complete', proposalsGenerated: 10, proposalsActivated: 10, hitRateDelta: 0.5 };

  for (const reason of reasons) {
    const terminal: ConvergenceState = { kind: 'converged', reason };
    const next = transitionConvergence(terminal, event);
    expect(next).toEqual(terminal);
  }
});

// ─── Law: Happy-path sequence exploring → narrowing → plateau → converged ───

test('happy-path sequence: exploring → narrowing → plateau → converged', () => {
  const s0 = initialConvergenceState();
  expect(s0.kind).toBe('exploring');

  // Improving hit rate → narrowing
  const s1 = transitionConvergence(s0, {
    kind: 'iteration-complete',
    proposalsGenerated: 3,
    proposalsActivated: 3,
    hitRateDelta: 0.15,
  });
  expect(s1.kind).toBe('narrowing');

  // Hit rate stalls → plateau
  const s2 = transitionConvergence(s1, {
    kind: 'iteration-complete',
    proposalsGenerated: 2,
    proposalsActivated: 2,
    hitRateDelta: 0,
  });
  expect(s2.kind).toBe('plateau');

  // Stalled again → converged with threshold-met
  const s3 = transitionConvergence(s2, {
    kind: 'iteration-complete',
    proposalsGenerated: 1,
    proposalsActivated: 1,
    hitRateDelta: -0.01,
  });
  expect(s3.kind).toBe('converged');
  expect(isTerminal(s3)).toBe(true);
  if (s3.kind === 'converged') {
    expect(s3.reason).toBe('threshold-met');
  }
});

// ─── Law: Budget exhaustion overrides all non-terminal states ───

test('budget exhaustion overrides exploring state', () => {
  const state = initialConvergenceState();
  const next = transitionConvergence(state, {
    kind: 'budget-check',
    instructionsUsed: 100,
    maxInstructions: 50,
  });
  expect(next.kind).toBe('converged');
  if (next.kind === 'converged') {
    expect(next.reason).toBe('budget-exhausted');
  }
});

test('budget exhaustion overrides narrowing state', () => {
  const state: ConvergenceState = { kind: 'narrowing', hitRateImproving: true, delta: 0.1 };
  const next = transitionConvergence(state, {
    kind: 'budget-check',
    instructionsUsed: 200,
    maxInstructions: 100,
  });
  expect(next.kind).toBe('converged');
  if (next.kind === 'converged') {
    expect(next.reason).toBe('budget-exhausted');
  }
});

test('budget exhaustion overrides plateau state', () => {
  const state: ConvergenceState = { kind: 'plateau', stalledIterations: 1 };
  const next = transitionConvergence(state, {
    kind: 'budget-check',
    instructionsUsed: 500,
    maxInstructions: 100,
  });
  expect(next.kind).toBe('converged');
  if (next.kind === 'converged') {
    expect(next.reason).toBe('budget-exhausted');
  }
});

// ─── Law: Monotonicity — state progression never goes backward ───

test('state ordinal never decreases through a typical sequence', () => {
  const events: readonly ConvergenceEvent[] = [
    { kind: 'iteration-complete', proposalsGenerated: 5, proposalsActivated: 5, hitRateDelta: 0.2 },
    { kind: 'iteration-complete', proposalsGenerated: 3, proposalsActivated: 3, hitRateDelta: 0.1 },
    { kind: 'iteration-complete', proposalsGenerated: 2, proposalsActivated: 2, hitRateDelta: 0 },
    { kind: 'iteration-complete', proposalsGenerated: 1, proposalsActivated: 1, hitRateDelta: -0.05 },
    { kind: 'iteration-complete', proposalsGenerated: 1, proposalsActivated: 1, hitRateDelta: 0.01 },
  ];

  let state = initialConvergenceState();
  let prevOrdinal = stateOrdinal(state);

  for (const event of events) {
    state = transitionConvergence(state, event);
    const currentOrdinal = stateOrdinal(state);
    expect(currentOrdinal).toBeGreaterThanOrEqual(prevOrdinal);
    prevOrdinal = currentOrdinal;
  }
});

// ─── Law: isTerminal is true only for converged ───

test('isTerminal returns false for non-converged states', () => {
  const states: readonly ConvergenceState[] = [
    { kind: 'exploring', proposalsGenerated: 0 },
    { kind: 'narrowing', hitRateImproving: true, delta: 0.1 },
    { kind: 'plateau', stalledIterations: 2 },
  ];

  for (const state of states) {
    expect(isTerminal(state)).toBe(false);
  }
});

test('isTerminal returns true for converged states', () => {
  const state: ConvergenceState = { kind: 'converged', reason: 'threshold-met' };
  expect(isTerminal(state)).toBe(true);
});

// ─── Law: No proposals generated → converged immediately ───

test('no proposals generated converges with no-proposals reason', () => {
  const state: ConvergenceState = { kind: 'narrowing', hitRateImproving: true, delta: 0.1 };
  const next = transitionConvergence(state, {
    kind: 'iteration-complete',
    proposalsGenerated: 0,
    proposalsActivated: 0,
    hitRateDelta: 0,
  });
  expect(next.kind).toBe('converged');
  if (next.kind === 'converged') {
    expect(next.reason).toBe('no-proposals');
  }
});

// ─── Law: Proposals generated but already processed → NOT converged ───

test('proposals generated but zero activated does not trigger no-proposals convergence', () => {
  const state: ConvergenceState = { kind: 'narrowing', hitRateImproving: true, delta: 0.1 };
  const next = transitionConvergence(state, {
    kind: 'iteration-complete',
    proposalsGenerated: 5,
    proposalsActivated: 0,
    hitRateDelta: 0,
  });
  // Should NOT converge — proposals exist, they're just already processed
  expect(next.kind).not.toBe('converged');
});

// ─── Law: Iteration limit converges with max-iterations ───

test('iteration limit converges with max-iterations reason', () => {
  const state: ConvergenceState = { kind: 'narrowing', hitRateImproving: true, delta: 0.1 };
  const next = transitionConvergence(state, {
    kind: 'iteration-limit',
    current: 10,
    max: 10,
  });
  expect(next.kind).toBe('converged');
  if (next.kind === 'converged') {
    expect(next.reason).toBe('max-iterations');
  }
});

// ─── Law: Fold is total ───

test('foldConvergenceState dispatches each variant to exactly one case', () => {
  const states: readonly ConvergenceState[] = [
    { kind: 'exploring', proposalsGenerated: 0 },
    { kind: 'narrowing', hitRateImproving: true, delta: 0.1 },
    { kind: 'plateau', stalledIterations: 1 },
    { kind: 'converged', reason: 'threshold-met' },
  ];

  const results = states.map((s) =>
    foldConvergenceState(s, {
      exploring: () => 'exploring',
      narrowing: () => 'narrowing',
      plateau: () => 'plateau',
      converged: () => 'converged',
    }),
  );

  expect(results).toEqual(['exploring', 'narrowing', 'plateau', 'converged']);
});

// ─── Law: Budget within limits does not change state ───

test('budget check within limits preserves current state', () => {
  const state: ConvergenceState = { kind: 'exploring', proposalsGenerated: 0 };
  const next = transitionConvergence(state, {
    kind: 'budget-check',
    instructionsUsed: 10,
    maxInstructions: 100,
  });
  expect(next).toEqual(state);
});

test('iteration limit not yet reached preserves current state', () => {
  const state: ConvergenceState = { kind: 'narrowing', hitRateImproving: true, delta: 0.05 };
  const next = transitionConvergence(state, {
    kind: 'iteration-limit',
    current: 3,
    max: 10,
  });
  expect(next).toEqual(state);
});
