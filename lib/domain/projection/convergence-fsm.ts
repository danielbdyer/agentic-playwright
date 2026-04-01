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
  | { readonly kind: 'iteration-limit'; readonly current: number; readonly max: number };

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
