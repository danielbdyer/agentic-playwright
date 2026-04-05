/**
 * Proposal Lifecycle FSM — formalizes the three-state lifecycle of proposals
 * as an explicit state machine with typed transition events.
 *
 * States:
 *   pending → activated   (trust policy allow + validation pass)
 *   pending → blocked     (validation failure, toxic alias, deny, etc.)
 *   pending → pending     (auto-approval declined, retained for review)
 *
 * Terminal states: activated, blocked (no outgoing transitions).
 *
 * Previously these transitions were scattered across activate-proposals.ts
 * as ad-hoc `activatedProposal()` and `blockedProposal()` functions with
 * implicit state checks. This FSM centralizes the lifecycle logic.
 *
 * All functions are pure: immutable inputs, immutable outputs, no side effects.
 *
 * @see docs/design-calculus.md § Assessed Opportunities: Proposal lifecycle FSM
 */

import type {
  CertificationStatus,
  Governance,
  ProposalActivation,
  TrustPolicyDecision,
} from '../governance/workflow-types';
import type { FSMDefinition } from '../kernel/finite-state-machine';

// ─── Transition Events ───

export type ProposalTransitionEvent =
  | { readonly kind: 'trust-policy-allow'; readonly activatedAt: string }
  | { readonly kind: 'trust-policy-review'; readonly activatedAt: string }
  | { readonly kind: 'validation-failure'; readonly reason: string }
  | { readonly kind: 'toxic-alias'; readonly reason: string }
  | { readonly kind: 'auto-approval-declined'; readonly reason: string }
  | { readonly kind: 'file-system-error'; readonly reason: string };

// ─── Transition Function ───

export interface ProposalTransitionResult {
  readonly activation: ProposalActivation;
  readonly certification: CertificationStatus;
}

/**
 * The proposal lifecycle transition function.
 *
 * Given the current activation state and a transition event,
 * returns the next activation state and certification status.
 *
 * Rejects transitions from terminal states (activated, blocked).
 * Pure function: no side effects.
 */
export function transitionProposal(
  current: ProposalActivation,
  event: ProposalTransitionEvent,
): ProposalTransitionResult {
  // Terminal states — no outgoing transitions
  if (current.status === 'activated' || current.status === 'blocked') {
    return { activation: current, certification: current.certifiedAt ? 'certified' : 'uncertified' };
  }

  switch (event.kind) {
    case 'trust-policy-allow':
      return {
        activation: {
          status: 'activated',
          activatedAt: event.activatedAt,
          certifiedAt: event.activatedAt,
          reason: 'active canon certified immediately by trust policy',
        },
        certification: 'certified',
      };

    case 'trust-policy-review':
      return {
        activation: {
          status: 'activated',
          activatedAt: event.activatedAt,
          certifiedAt: null,
          reason: 'active canon activated without certification (review)',
        },
        certification: 'uncertified',
      };

    case 'validation-failure':
    case 'toxic-alias':
    case 'file-system-error':
      return {
        activation: {
          status: 'blocked',
          activatedAt: null,
          certifiedAt: null,
          reason: event.reason,
        },
        certification: 'uncertified',
      };

    case 'auto-approval-declined':
      return {
        activation: {
          ...current,
          reason: `Auto-approval declined: ${event.reason}`,
        },
        certification: 'uncertified',
      };
  }
}

/**
 * Map a trust policy decision to the appropriate transition event.
 * Pure projection: decision string → typed event.
 */
export function trustPolicyToEvent(
  decision: TrustPolicyDecision,
  activatedAt: string,
): ProposalTransitionEvent {
  switch (decision) {
    case 'allow': return { kind: 'trust-policy-allow', activatedAt };
    case 'review': return { kind: 'trust-policy-review', activatedAt };
    case 'deny': return { kind: 'validation-failure', reason: 'trust policy denied' };
  }
}

// ─── Predicate helpers ───

/** Check if a proposal is in the pending (initial) state. */
export const isPending = (activation: ProposalActivation): boolean =>
  activation.status === 'pending';

/** Check if a proposal has been activated (terminal state). */
export const isActivated = (activation: ProposalActivation): boolean =>
  activation.status === 'activated';

/** Check if a proposal has been blocked (terminal state). */
export const isBlocked = (activation: ProposalActivation): boolean =>
  activation.status === 'blocked';

/** Check if a proposal is in a terminal state (activated or blocked). */
export const isTerminalProposal = (activation: ProposalActivation): boolean =>
  activation.status === 'activated' || activation.status === 'blocked';

/**
 * Project ProposalActivation to its Governance value.
 *
 * This is the three-valued projection required by coherence law C1.1:
 *   blocked  → blocked
 *   activated + certified → approved
 *   activated + uncertified → review-required
 *   pending → review-required (not yet decided)
 *
 * The projection is a lattice homomorphism: it preserves meet.
 */
export function activationToGovernance(activation: ProposalActivation): Governance {
  if (activation.status === 'blocked') return 'blocked';
  if (activation.status === 'activated' && activation.certifiedAt != null) return 'approved';
  return 'review-required';
}

// ─── FSMDefinition instance ───
//
// The generic FSMDefinition requires { readonly kind: string }, but
// ProposalActivation uses `status` instead. We bridge with a thin
// wrapper type that adds `kind` for the generic infrastructure while
// keeping the domain type unchanged.
//
// This enables traceFSM, isMonotoneTrace, and verifyAbsorption to
// work with the proposal lifecycle FSM.

/** FSM-compatible state wrapper (adds `kind` from `status`). */
interface ProposalFSMState { readonly kind: 'pending' | 'activated' | 'blocked' }

/** FSM-compatible event wrapper. */
interface ProposalFSMEvent { readonly kind: ProposalTransitionEvent['kind'] }

/** Ordinal mapping: pending(0) < activated(1) = blocked(1). */
function proposalOrdinal(state: ProposalFSMState): number {
  return state.kind === 'pending' ? 0 : 1;
}

/**
 * The proposal lifecycle expressed as a generic FSMDefinition.
 * Enables law-checking: monotonicity, absorption, trace analysis.
 *
 * Note: This operates on the activation `status` field (mapped to `kind`).
 * The full `transitionProposal` function provides the richer domain result
 * (activation + certification). This definition is for structural verification.
 */
export const proposalLifecycleFSM: FSMDefinition<ProposalFSMState, ProposalFSMEvent> = {
  transition: (state, event) => {
    if (state.kind === 'activated' || state.kind === 'blocked') return state;
    const activation: ProposalActivation = { status: state.kind };
    const result = transitionProposal(activation, event as ProposalTransitionEvent);
    return { kind: result.activation.status };
  },
  initial: () => ({ kind: 'pending' }),
  terminalKinds: new Set(['activated', 'blocked']),
  ordinal: proposalOrdinal,
};
