/**
 * Pipeline Staging FSM — formalizes the six-stage workflow pipeline
 * as a finite state machine with typed transition events.
 *
 * Stages (from WorkflowStage):
 *   preparation → resolution → execution → evidence → proposal → projection
 *
 * This is a linear progression: each stage completes before the next begins.
 * The pipeline stages are branded at the type level via StagedEnvelope<T, Stage>
 * to prevent mixing artifacts from different stages.
 *
 * This is one of the four FSMs unified by Collapse 1 in the design
 * calculus. All four share the same FSMDefinition<S, E> interface.
 *
 * All functions are pure: immutable inputs, immutable outputs, no side effects.
 *
 * @see docs/design-calculus.md § Collapse 1: The Four State Machines Are One
 */

import type { WorkflowStage } from '../types/workflow';
import type { FSMDefinition } from '../kernel/finite-state-machine';

// ─── FSM-compatible state wrapper ───

interface PipelineStageState {
  readonly kind: WorkflowStage;
}

// ─── Transition events ───

export type PipelineStageEvent =
  | { readonly kind: 'preparation-complete' }
  | { readonly kind: 'resolution-complete' }
  | { readonly kind: 'execution-complete' }
  | { readonly kind: 'evidence-collected' }
  | { readonly kind: 'proposals-generated' }
  | { readonly kind: 'projection-complete' };

// ─── Stage ordering ───

const STAGE_ORDER: readonly WorkflowStage[] = [
  'preparation', 'resolution', 'execution', 'evidence', 'proposal', 'projection',
];

function stageOrdinal(state: PipelineStageState): number {
  return STAGE_ORDER.indexOf(state.kind);
}

// ─── Transition function ───

function transitionPipelineStage(
  state: PipelineStageState,
  event: PipelineStageEvent,
): PipelineStageState {
  // Terminal state: projection is the final stage
  if (state.kind === 'projection') return state;

  const currentIdx = STAGE_ORDER.indexOf(state.kind);
  const nextStage = STAGE_ORDER[currentIdx + 1];

  // Linear progression: each event advances to the next stage
  // Only the matching event for the current stage triggers a transition
  const expectedEvent: Record<WorkflowStage, PipelineStageEvent['kind']> = {
    'preparation': 'preparation-complete',
    'resolution': 'resolution-complete',
    'execution': 'execution-complete',
    'evidence': 'evidence-collected',
    'proposal': 'proposals-generated',
    'projection': 'projection-complete',
  };

  if (event.kind === expectedEvent[state.kind] && nextStage) {
    return { kind: nextStage };
  }

  return state;
}

// ─── FSMDefinition instance ───

/**
 * The pipeline staging progression expressed as a generic FSMDefinition.
 * Enables traceFSM, isMonotoneTrace, verifyAbsorption from the
 * generic finite-state-machine module.
 *
 * @see docs/design-calculus.md § Collapse 1: The Four State Machines Are One
 */
export const pipelineStagingFSM: FSMDefinition<PipelineStageState, PipelineStageEvent> = {
  transition: transitionPipelineStage,
  initial: () => ({ kind: 'preparation' }),
  terminalKinds: new Set(['projection']),
  ordinal: stageOrdinal,
};

// ─── Predicates ───

export const isPreparation = (stage: WorkflowStage): boolean => stage === 'preparation';
export const isResolution = (stage: WorkflowStage): boolean => stage === 'resolution';
export const isExecution = (stage: WorkflowStage): boolean => stage === 'execution';
export const isEvidence = (stage: WorkflowStage): boolean => stage === 'evidence';
export const isProposal = (stage: WorkflowStage): boolean => stage === 'proposal';
export const isProjection = (stage: WorkflowStage): boolean => stage === 'projection';

/** Check if a stage has completed execution (evidence, proposal, or projection). */
export const isPostExecution = (stage: WorkflowStage): boolean => {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx >= STAGE_ORDER.indexOf('evidence');
};

/** Get the next stage in the pipeline, or null if at the end. */
export function nextStage(current: WorkflowStage): WorkflowStage | null {
  const idx = STAGE_ORDER.indexOf(current);
  return STAGE_ORDER[idx + 1] ?? null;
}

/** Get the stage ordering for monotonicity checks. */
export { STAGE_ORDER as pipelineStageOrder };
