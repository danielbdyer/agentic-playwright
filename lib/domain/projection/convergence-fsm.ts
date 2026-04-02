/**
 * Typed finite state machine for dogfood convergence detection.
 *
 * The FSM models the progression of the improvement loop through four states:
 * exploring → narrowing → plateau → converged. State transitions are pure
 * functions driven by typed events. The converged state is absorbing — once
 * reached, no event can leave it.
 *
 * This replaces the implicit state logic in determineConvergenceReason with
 * an explicit, testable state machine.
 */

// ─── States ───

export type ConvergenceState =
  | { readonly kind: 'exploring'; readonly proposalsGenerated: number }
  | { readonly kind: 'narrowing'; readonly hitRateImproving: boolean; readonly delta: number }
  | { readonly kind: 'plateau'; readonly stalledIterations: number }
  | { readonly kind: 'converged'; readonly reason: ConvergenceReason };

export type ConvergenceReason = 'no-proposals' | 'threshold-met' | 'budget-exhausted' | 'max-iterations';

// ─── Events ───

export type ConvergenceEvent =
  | { readonly kind: 'iteration-complete'; readonly proposalsGenerated: number; readonly proposalsActivated: number; readonly hitRateDelta: number; readonly convergenceThreshold?: number }
  | { readonly kind: 'budget-check'; readonly instructionsUsed: number; readonly maxInstructions: number }
  | { readonly kind: 'iteration-limit'; readonly current: number; readonly max: number }
  | { readonly kind: 'learning-signal'; readonly degradingCount: number; readonly maturity: number }
  | { readonly kind: 'browser-health'; readonly overflowRate: number; readonly reuseRate: number };

// ─── Constructors ───

export function initialConvergenceState(): ConvergenceState {
  return { kind: 'exploring', proposalsGenerated: 0 };
}

// ─── Transition ───

/**
 * Pure state transition function. Given the current state and an event,
 * returns the next state. Budget exhaustion and iteration limits override
 * any non-terminal state. The converged state is absorbing.
 */
export function transitionConvergence(
  state: ConvergenceState,
  event: ConvergenceEvent,
): ConvergenceState {
  // Terminal states are absorbing
  if (state.kind === 'converged') {
    return state;
  }

  // Budget exhaustion overrides all non-terminal states
  if (event.kind === 'budget-check' && event.instructionsUsed >= event.maxInstructions) {
    return { kind: 'converged', reason: 'budget-exhausted' };
  }

  // Iteration limit overrides all non-terminal states
  if (event.kind === 'iteration-limit' && event.current >= event.max) {
    return { kind: 'converged', reason: 'max-iterations' };
  }

  // Learning-signal: multiple degrading dimensions backs FSM out of plateau
  // to prevent premature convergence when hit rate improves but quality worsens.
  if (event.kind === 'learning-signal') {
    const threshold = Math.max(1, Math.ceil(3 * event.maturity));
    if (event.degradingCount >= threshold && state.kind === 'plateau') {
      return { kind: 'narrowing', hitRateImproving: false, delta: 0 };
    }
    return state;
  }

  // Browser-health: high overflow rate signals pool exhaustion — the system is
  // creating more pages than the pool can hold, indicating the pool is too small
  // for the current scenario load. Back out of plateau to keep exploring.
  if (event.kind === 'browser-health') {
    if (event.overflowRate > 0.5 && state.kind === 'plateau') {
      return { kind: 'narrowing', hitRateImproving: false, delta: 0 };
    }
    return state;
  }

  // Non-terminal transitions for iteration-complete events
  if (event.kind === 'iteration-complete') {
    // No proposals generated after exploration → converged.
    // In exploring state (first iteration), no-proposals just means nothing to learn yet.
    // We check proposalsGenerated (not proposalsActivated) because proposals from a
    // prior iteration may already be activated — the run still produced proposals,
    // meaning there are still knowledge gaps to close in future iterations.
    if (event.proposalsGenerated === 0 && state.kind !== 'exploring') {
      return { kind: 'converged', reason: 'no-proposals' };
    }

    // Hit rate improving above threshold → narrowing
    const threshold = event.convergenceThreshold ?? 0;
    if (event.hitRateDelta >= threshold && event.hitRateDelta > 0) {
      return { kind: 'narrowing', hitRateImproving: true, delta: event.hitRateDelta };
    }

    // Proposals were generated but hit rate didn't improve — the loop has
    // new knowledge to activate but hasn't seen the effect yet. Stay in
    // exploring/narrowing to give the activated proposals a chance to take
    // effect in the next iteration before declaring plateau.
    if (event.proposalsGenerated > 0 && state.kind === 'exploring') {
      return { kind: 'exploring', proposalsGenerated: state.proposalsGenerated + event.proposalsGenerated };
    }

    // Hit rate stalled, declining, or improving below threshold
    return foldConvergenceState<ConvergenceState>(state, {
      exploring: (): ConvergenceState =>
        ({ kind: 'plateau', stalledIterations: 1 }),
      narrowing: (): ConvergenceState =>
        ({ kind: 'plateau', stalledIterations: 1 }),
      plateau: (): ConvergenceState =>
        ({ kind: 'converged', reason: 'threshold-met' }),
      converged: (s) => s,
    });
  }

  // budget-check within budget or iteration-limit not yet reached — no state change
  return state;
}

// ─── Fold ───

export interface ConvergenceStateCases<R> {
  readonly exploring: (state: Extract<ConvergenceState, { kind: 'exploring' }>) => R;
  readonly narrowing: (state: Extract<ConvergenceState, { kind: 'narrowing' }>) => R;
  readonly plateau: (state: Extract<ConvergenceState, { kind: 'plateau' }>) => R;
  readonly converged: (state: Extract<ConvergenceState, { kind: 'converged' }>) => R;
}

export function foldConvergenceState<R>(
  state: ConvergenceState,
  cases: ConvergenceStateCases<R>,
): R {
  switch (state.kind) {
    case 'exploring': return cases.exploring(state);
    case 'narrowing': return cases.narrowing(state);
    case 'plateau': return cases.plateau(state);
    case 'converged': return cases.converged(state);
  }
}

// ─── Predicates ───

export function isTerminal(state: ConvergenceState): state is Extract<ConvergenceState, { kind: 'converged' }> {
  return state.kind === 'converged';
}

/**
 * Numeric ordering for monotonicity checks.
 * exploring(0) < narrowing(1) < plateau(2) < converged(3)
 */
export function stateOrdinal(state: ConvergenceState): number {
  return foldConvergenceState(state, {
    exploring: () => 0,
    narrowing: () => 1,
    plateau: () => 2,
    converged: () => 3,
  });
}
