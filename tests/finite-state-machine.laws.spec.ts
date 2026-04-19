/**
 * Law-style tests for the generic FSM infrastructure.
 *
 * Uses the convergence FSM as the specimen to verify that the generic
 * operations (runFSM, traceFSM, isMonotoneTrace, verifyAbsorption) work
 * correctly with a real FSMDefinition instance.
 *
 * These tests verify algebraic properties, not specific business logic:
 *   - Absorption: terminal states are fixed points
 *   - Monotonicity: ordinals never decrease along any trace
 *   - Determinism: same initial state + same events = same final state
 *   - Convergence: the identity trace (no events) starts at initial
 *
 * @see product/domain/kernel/finite-state-machine.ts
 * @see docs/design-calculus.md § Collapse 1
 */

import { expect, test } from '@playwright/test';
import {
  isTerminalState,
  runFSM,
  traceFSM,
  isMonotoneTrace,
  verifyAbsorption,
} from '../product/domain/kernel/finite-state-machine';
import {
  convergenceFSMDefinition,
} from '../product/domain/projection/convergence-fsm';
import type { ConvergenceState, ConvergenceEvent } from '../product/domain/projection/convergence-fsm';

const def = convergenceFSMDefinition;

// ─── Law: Initial state is not terminal ───

test('initial state is not terminal', () => {
  const initial = def.initial();
  expect(isTerminalState(def, initial)).toBe(false);
});

// ─── Law: Absorption — terminal states are fixed points ───

test('absorption: converged states absorb all events', () => {
  const terminalStates: readonly ConvergenceState[] = [
    { kind: 'converged', reason: 'no-proposals' },
    { kind: 'converged', reason: 'threshold-met' },
    { kind: 'converged', reason: 'budget-exhausted' },
    { kind: 'converged', reason: 'max-iterations' },
  ];

  const events: readonly ConvergenceEvent[] = [
    { kind: 'iteration-complete', proposalsGenerated: 5, proposalsActivated: 3, hitRateDelta: 0.1 },
    { kind: 'budget-check', instructionsUsed: 10, maxInstructions: 100 },
    { kind: 'iteration-limit', current: 1, max: 10 },
    { kind: 'learning-signal', degradingCount: 5, maturity: 1 },
    { kind: 'browser-health', overflowRate: 0.8, reuseRate: 0.2 },
  ];

  expect(verifyAbsorption(def, terminalStates, events)).toBe(true);
});

// ─── Law: Monotonicity — ordinals never decrease ───

test('monotonicity: happy-path trace has non-decreasing ordinals', () => {
  const events: readonly ConvergenceEvent[] = [
    { kind: 'iteration-complete', proposalsGenerated: 3, proposalsActivated: 3, hitRateDelta: 0.2 },
    { kind: 'iteration-complete', proposalsGenerated: 1, proposalsActivated: 1, hitRateDelta: -0.01 },
    { kind: 'iteration-complete', proposalsGenerated: 0, proposalsActivated: 0, hitRateDelta: 0 },
  ];

  const trace = traceFSM(def, events);
  expect(isMonotoneTrace(def, trace)).toBe(true);
  expect(trace[trace.length - 1]!.kind).toBe('converged');
});

test('monotonicity: budget exhaustion from any non-terminal state', () => {
  const preStates: readonly ConvergenceState[] = [
    { kind: 'exploring', proposalsGenerated: 0 },
    { kind: 'narrowing', hitRateImproving: true, delta: 0.1 },
    { kind: 'plateau', stalledIterations: 1 },
  ];

  const budgetExhausted: ConvergenceEvent = {
    kind: 'budget-check',
    instructionsUsed: 100,
    maxInstructions: 50,
  };

  for (const pre of preStates) {
    const next = def.transition(pre, budgetExhausted);
    expect(def.ordinal(next)).toBeGreaterThanOrEqual(def.ordinal(pre));
    expect(next.kind).toBe('converged');
  }
});

// ─── Law: Determinism — same inputs produce same outputs ───

test('determinism: runFSM with same events produces same state', () => {
  const events: readonly ConvergenceEvent[] = [
    { kind: 'iteration-complete', proposalsGenerated: 5, proposalsActivated: 4, hitRateDelta: 0.15 },
    { kind: 'learning-signal', degradingCount: 2, maturity: 0.5 },
    { kind: 'iteration-complete', proposalsGenerated: 2, proposalsActivated: 2, hitRateDelta: 0.05 },
  ];

  const result1 = runFSM(def, events);
  const result2 = runFSM(def, events);
  expect(result1).toEqual(result2);
});

// ─── Law: Identity — empty event sequence yields initial state ───

test('identity: no events yields initial state', () => {
  const result = runFSM(def, []);
  expect(result).toEqual(def.initial());
});

// ─── Law: Terminal short-circuit — events after convergence are ignored ───

test('short-circuit: events after convergence do not change state', () => {
  const convergingEvents: readonly ConvergenceEvent[] = [
    { kind: 'iteration-limit', current: 10, max: 5 },
  ];

  const extraEvents: readonly ConvergenceEvent[] = [
    ...convergingEvents,
    { kind: 'iteration-complete', proposalsGenerated: 100, proposalsActivated: 100, hitRateDelta: 1.0 },
    { kind: 'iteration-complete', proposalsGenerated: 100, proposalsActivated: 100, hitRateDelta: 1.0 },
  ];

  const withoutExtra = runFSM(def, convergingEvents);
  const withExtra = runFSM(def, extraEvents);
  expect(withExtra).toEqual(withoutExtra);
});

// ─── Law: Trace length bounded by events + 1 ───

test('trace length is at most events.length + 1 (includes initial)', () => {
  const events: readonly ConvergenceEvent[] = [
    { kind: 'iteration-complete', proposalsGenerated: 3, proposalsActivated: 3, hitRateDelta: 0.2 },
    { kind: 'iteration-complete', proposalsGenerated: 1, proposalsActivated: 1, hitRateDelta: -0.01 },
    { kind: 'iteration-complete', proposalsGenerated: 0, proposalsActivated: 0, hitRateDelta: 0 },
    { kind: 'iteration-complete', proposalsGenerated: 99, proposalsActivated: 99, hitRateDelta: 0.5 },
  ];

  const trace = traceFSM(def, events);
  expect(trace.length).toBeLessThanOrEqual(events.length + 1);
  expect(trace.length).toBeGreaterThanOrEqual(1);
});
