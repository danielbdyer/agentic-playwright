/**
 * Generic finite state machine — the indexed monad collapse.
 *
 * Every FSM in the codebase (convergence, governance, proposal lifecycle,
 * scenario lifecycle, cluster phase) is an instance of this generic.
 * The generic provides:
 *
 *   - A transition function type with typed states and events
 *   - An exhaustive fold (catamorphism) over the state union
 *   - Terminal state detection
 *   - Monotonicity-checkable ordinal mapping
 *   - Run-to-completion (feeding a sequence of events)
 *
 * runFSM is implemented as a hylomorphism: the event list is unfolded
 * one event at a time, each event is folded into the state via transition,
 * with short-circuit on terminal states. No intermediate structure is
 * allocated (deforestation). This makes explicit that an FSM run is
 * the composition of an unfold (event stream) and a fold (state accumulation).
 *
 * Consumers define their specific state/event types and transition logic;
 * the generic provides the structural operations for free.
 *
 * @see docs/design-calculus.md § Collapse 1: The Four State Machines Are One
 */

// ─── Core types ───

/**
 * A finite state machine definition.
 *
 * @typeParam S - Discriminated union of states (must have `readonly kind: string`)
 * @typeParam E - Discriminated union of events (must have `readonly kind: string`)
 */
export interface FSMDefinition<S extends { readonly kind: string }, E extends { readonly kind: string }> {
  /** Pure transition function. Given current state and event, returns next state. */
  readonly transition: (state: S, event: E) => S;
  /** Initial state constructor. */
  readonly initial: () => S;
  /** Set of terminal state kinds. Terminal states are absorbing — transition returns them unchanged. */
  readonly terminalKinds: ReadonlySet<string>;
  /** Monotone ordinal mapping for states. Lower ordinals precede higher ones. */
  readonly ordinal: (state: S) => number;
}

// ─── Operations ───

/**
 * Check whether a state is terminal (absorbing).
 */
export function isTerminalState<S extends { readonly kind: string }>(
  def: Pick<FSMDefinition<S, never>, 'terminalKinds'>,
  state: S,
): boolean {
  return def.terminalKinds.has(state.kind);
}

/**
 * An FSM run as a Fold over events: `foldl transition initial events`.
 *
 * This makes explicit that an FSM is a catamorphism — the same
 * fold structure used by product-fold.ts and timing/cost/translation folds.
 * The fold short-circuits on terminal states for efficiency.
 */
export function fsmFold<S extends { readonly kind: string }, E extends { readonly kind: string }>(
  def: FSMDefinition<S, E>,
): { readonly initial: S; readonly step: (state: S, event: E) => S } {
  return {
    initial: def.initial(),
    step: (state, event) => isTerminalState(def, state) ? state : def.transition(state, event),
  };
}

/**
 * Feed a sequence of events through the FSM, returning the final state.
 * Short-circuits on terminal states — remaining events are not processed.
 *
 * Implemented as `runFold(fsmFold(def), events)` — an FSM run is a
 * catamorphism over the event list with the transition function as the
 * algebra. This is the same fold structure underlying product-fold.ts,
 * runStateMachine, and runHylo.
 */
export function runFSM<S extends { readonly kind: string }, E extends { readonly kind: string }>(
  def: FSMDefinition<S, E>,
  events: ReadonlyArray<E>,
): S {
  const fold = fsmFold(def);
  return events.reduce(fold.step, fold.initial);
}

/**
 * Feed a sequence of events, collecting each intermediate state.
 * This is a scan (fold with trace) — useful for testing monotonicity
 * and visualizing state trajectories.
 */
export function traceFSM<S extends { readonly kind: string }, E extends { readonly kind: string }>(
  def: FSMDefinition<S, E>,
  events: ReadonlyArray<E>,
): ReadonlyArray<S> {
  const fold = fsmFold(def);
  const scan = (acc: readonly S[], remaining: ReadonlyArray<E>): ReadonlyArray<S> => {
    if (remaining.length === 0) return acc;
    const current = acc[acc.length - 1]!;
    if (isTerminalState(def, current)) return acc;
    const next = fold.step(current, remaining[0]!);
    return scan([...acc, next], remaining.slice(1));
  };
  return scan([fold.initial], events);
}

/**
 * Check that a state trace is monotone — ordinals never decrease.
 * This is the law-style property test for FSM well-formedness.
 */
export function isMonotoneTrace<S extends { readonly kind: string }>(
  def: Pick<FSMDefinition<S, never>, 'ordinal'>,
  trace: ReadonlyArray<S>,
): boolean {
  return trace.every((state, i) =>
    i === 0 || def.ordinal(trace[i - 1]!) <= def.ordinal(state),
  );
}

/**
 * Verify the absorption law: terminal states are fixed points of transition.
 * For every terminal state and every event, transition(terminal, event) === terminal.
 */
export function verifyAbsorption<S extends { readonly kind: string }, E extends { readonly kind: string }>(
  def: FSMDefinition<S, E>,
  terminalStates: ReadonlyArray<S>,
  events: ReadonlyArray<E>,
): boolean {
  return terminalStates.every((state) =>
    events.every((event) => {
      const next = def.transition(state, event);
      return next.kind === state.kind;
    }),
  );
}
