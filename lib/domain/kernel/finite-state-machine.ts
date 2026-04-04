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
 * Feed a sequence of events through the FSM, returning the final state.
 * Short-circuits on terminal states — remaining events are not processed.
 *
 * This is the catamorphism over the event list: `foldl transition initial events`.
 */
export function runFSM<S extends { readonly kind: string }, E extends { readonly kind: string }>(
  def: FSMDefinition<S, E>,
  events: ReadonlyArray<E>,
): S {
  const step = (
    state: S,
    remaining: ReadonlyArray<E>,
  ): S => {
    if (remaining.length === 0 || isTerminalState(def, state)) {
      return state;
    }
    const [event, ...rest] = remaining;
    return step(def.transition(state, event!), rest);
  };
  return step(def.initial(), events);
}

/**
 * Feed a sequence of events, collecting each intermediate state.
 * Useful for testing monotonicity and visualizing state trajectories.
 */
export function traceFSM<S extends { readonly kind: string }, E extends { readonly kind: string }>(
  def: FSMDefinition<S, E>,
  events: ReadonlyArray<E>,
): ReadonlyArray<S> {
  const step = (
    state: S,
    remaining: ReadonlyArray<E>,
    acc: ReadonlyArray<S>,
  ): ReadonlyArray<S> => {
    if (remaining.length === 0 || isTerminalState(def, state)) {
      return acc;
    }
    const [event, ...rest] = remaining;
    const next = def.transition(state, event!);
    return step(next, rest, [...acc, next]);
  };
  return step(def.initial(), events, [def.initial()]);
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
