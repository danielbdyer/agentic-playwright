/**
 * Scenario Lifecycle FSM — formalizes the scenario status progression
 * as a finite state machine with typed transition events.
 *
 * States (from ScenarioStatus):
 *   stub → draft → active → needs-repair → blocked → deprecated
 *
 * This is one of the four FSMs unified by Collapse 1 in the design
 * calculus. All four share the same FSMDefinition<S, E> interface.
 *
 * All functions are pure: immutable inputs, immutable outputs, no side effects.
 *
 * @see docs/design-calculus.md § Collapse 1: The Four State Machines Are One
 */

import type { ScenarioStatus } from '../types/workflow';
import type { FSMDefinition } from '../kernel/finite-state-machine';

// ─── FSM-compatible state wrapper ───

interface ScenarioStatusState {
  readonly kind: ScenarioStatus;
}

// ─── Transition events ───

export type ScenarioStatusEvent =
  | { readonly kind: 'ado-synced' }
  | { readonly kind: 'steps-authored' }
  | { readonly kind: 'compilation-succeeded' }
  | { readonly kind: 'compilation-failed' }
  | { readonly kind: 'execution-failed' }
  | { readonly kind: 'repair-completed' }
  | { readonly kind: 'operator-blocked' }
  | { readonly kind: 'operator-deprecated' }
  | { readonly kind: 'operator-reactivated' };

// ─── Transition function ───

function transitionScenarioStatus(
  state: ScenarioStatusState,
  event: ScenarioStatusEvent,
): ScenarioStatusState {
  // Terminal states: deprecated is absorbing
  if (state.kind === 'deprecated') return state;

  switch (event.kind) {
    case 'ado-synced':
      return state.kind === 'stub' ? { kind: 'draft' } : state;

    case 'steps-authored':
      return state.kind === 'draft' ? { kind: 'active' } : state;

    case 'compilation-succeeded':
      return state.kind === 'draft' ? { kind: 'active' }
        : state.kind === 'needs-repair' ? { kind: 'active' }
        : state;

    case 'compilation-failed':
      return state.kind === 'active' ? { kind: 'needs-repair' } : state;

    case 'execution-failed':
      return state.kind === 'active' ? { kind: 'needs-repair' } : state;

    case 'repair-completed':
      return state.kind === 'needs-repair' ? { kind: 'active' } : state;

    case 'operator-blocked':
      return { kind: 'blocked' };

    case 'operator-deprecated':
      return { kind: 'deprecated' };

    case 'operator-reactivated':
      return state.kind === 'blocked' ? { kind: 'active' }
        : state.kind === 'needs-repair' ? { kind: 'active' }
        : state;
  }
}

// ─── Ordinal mapping ───

function scenarioStatusOrdinal(state: ScenarioStatusState): number {
  const ordinals: Record<ScenarioStatus, number> = {
    'stub': 0,
    'draft': 1,
    'active': 2,
    'needs-repair': 2,   // same level as active (lateral transition)
    'blocked': 3,
    'deprecated': 4,
  };
  return ordinals[state.kind];
}

// ─── FSMDefinition instance ───

/**
 * The scenario lifecycle expressed as a generic FSMDefinition.
 * Enables traceFSM, isMonotoneTrace, verifyAbsorption from the
 * generic finite-state-machine module.
 *
 * @see docs/design-calculus.md § Collapse 1: The Four State Machines Are One
 */
export const scenarioLifecycleFSM: FSMDefinition<ScenarioStatusState, ScenarioStatusEvent> = {
  transition: transitionScenarioStatus,
  initial: () => ({ kind: 'stub' }),
  terminalKinds: new Set(['deprecated']),
  ordinal: scenarioStatusOrdinal,
};

// ─── Predicates ───

export const isStub = (status: ScenarioStatus): boolean => status === 'stub';
export const isDraft = (status: ScenarioStatus): boolean => status === 'draft';
export const isActive = (status: ScenarioStatus): boolean => status === 'active';
export const isNeedsRepair = (status: ScenarioStatus): boolean => status === 'needs-repair';
export const isScenarioBlocked = (status: ScenarioStatus): boolean => status === 'blocked';
export const isDeprecated = (status: ScenarioStatus): boolean => status === 'deprecated';
export const isExecutable = (status: ScenarioStatus): boolean =>
  status === 'active' || status === 'needs-repair';
