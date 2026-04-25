/**
 * Workflow-union folds + value-level companions (W2.1 / Agent C #2, #10).
 *
 * CLAUDE.md discipline: "Use the typed fold functions for all
 * major discriminated unions ... Prefer these over raw switch
 * statements — the fold guarantees compile-time exhaustiveness
 * when a new variant is added." The workflow-types module
 * declares ~20 closed unions; this module lifts the most
 * central ones into exhaustive folds + `*_VALUES` runtime
 * companions per Agent C's audit (2026-04-24).
 *
 * Why a sibling module rather than inline: `workflow-types.ts`
 * already mixes type declarations + envelope machinery +
 * helpers; keeping the folds separate avoids further bloat
 * and lets `grep foldWorkflow` land here directly.
 *
 * Pure domain — no Effect, no IO.
 */

import type {
  ResolutionMode,
  WorkflowLane,
  WorkflowScope,
  WorkflowStage,
} from './workflow-types';

// ─── WorkflowStage ───────────────────────────────────────────

export const WORKFLOW_STAGE_VALUES: readonly WorkflowStage[] = [
  'preparation',
  'resolution',
  'execution',
  'evidence',
  'proposal',
  'projection',
] as const;

const _WORKFLOW_STAGE_EXHAUSTIVE: Record<WorkflowStage, true> = Object.freeze(
  WORKFLOW_STAGE_VALUES.reduce<Record<WorkflowStage, true>>(
    (acc, v) => ({ ...acc, [v]: true }),
    {} as Record<WorkflowStage, true>,
  ),
);
void _WORKFLOW_STAGE_EXHAUSTIVE;

export function foldWorkflowStage<R>(
  stage: WorkflowStage,
  cases: {
    readonly preparation: () => R;
    readonly resolution: () => R;
    readonly execution: () => R;
    readonly evidence: () => R;
    readonly proposal: () => R;
    readonly projection: () => R;
  },
): R {
  switch (stage) {
    case 'preparation':
      return cases.preparation();
    case 'resolution':
      return cases.resolution();
    case 'execution':
      return cases.execution();
    case 'evidence':
      return cases.evidence();
    case 'proposal':
      return cases.proposal();
    case 'projection':
      return cases.projection();
  }
}

// ─── WorkflowScope ───────────────────────────────────────────

export const WORKFLOW_SCOPE_VALUES: readonly WorkflowScope[] = [
  'scenario',
  'step',
  'run',
  'suite',
  'workspace',
  'control',
  'hypothesis',
  'compilation',
] as const;

const _WORKFLOW_SCOPE_EXHAUSTIVE: Record<WorkflowScope, true> = Object.freeze(
  WORKFLOW_SCOPE_VALUES.reduce<Record<WorkflowScope, true>>(
    (acc, v) => ({ ...acc, [v]: true }),
    {} as Record<WorkflowScope, true>,
  ),
);
void _WORKFLOW_SCOPE_EXHAUSTIVE;

export function foldWorkflowScope<R>(
  scope: WorkflowScope,
  cases: {
    readonly scenario: () => R;
    readonly step: () => R;
    readonly run: () => R;
    readonly suite: () => R;
    readonly workspace: () => R;
    readonly control: () => R;
    readonly hypothesis: () => R;
    readonly compilation: () => R;
  },
): R {
  switch (scope) {
    case 'scenario':
      return cases.scenario();
    case 'step':
      return cases.step();
    case 'run':
      return cases.run();
    case 'suite':
      return cases.suite();
    case 'workspace':
      return cases.workspace();
    case 'control':
      return cases.control();
    case 'hypothesis':
      return cases.hypothesis();
    case 'compilation':
      return cases.compilation();
  }
}

// ─── WorkflowLane ────────────────────────────────────────────

export const WORKFLOW_LANE_VALUES: readonly WorkflowLane[] = [
  'intent',
  'knowledge',
  'control',
  'resolution',
  'execution',
  'governance',
  'projection',
] as const;

const _WORKFLOW_LANE_EXHAUSTIVE: Record<WorkflowLane, true> = Object.freeze(
  WORKFLOW_LANE_VALUES.reduce<Record<WorkflowLane, true>>(
    (acc, v) => ({ ...acc, [v]: true }),
    {} as Record<WorkflowLane, true>,
  ),
);
void _WORKFLOW_LANE_EXHAUSTIVE;

export function foldWorkflowLane<R>(
  lane: WorkflowLane,
  cases: {
    readonly intent: () => R;
    readonly knowledge: () => R;
    readonly control: () => R;
    readonly resolution: () => R;
    readonly execution: () => R;
    readonly governance: () => R;
    readonly projection: () => R;
  },
): R {
  switch (lane) {
    case 'intent':
      return cases.intent();
    case 'knowledge':
      return cases.knowledge();
    case 'control':
      return cases.control();
    case 'resolution':
      return cases.resolution();
    case 'execution':
      return cases.execution();
    case 'governance':
      return cases.governance();
    case 'projection':
      return cases.projection();
  }
}

// ─── ResolutionMode ──────────────────────────────────────────

export const RESOLUTION_MODE_VALUES: readonly ResolutionMode[] = [
  'deterministic',
  'translation',
  'agentic',
] as const;

const _RESOLUTION_MODE_EXHAUSTIVE: Record<ResolutionMode, true> = Object.freeze(
  RESOLUTION_MODE_VALUES.reduce<Record<ResolutionMode, true>>(
    (acc, v) => ({ ...acc, [v]: true }),
    {} as Record<ResolutionMode, true>,
  ),
);
void _RESOLUTION_MODE_EXHAUSTIVE;

export function foldResolutionMode<R>(
  mode: ResolutionMode,
  cases: {
    readonly deterministic: () => R;
    readonly translation: () => R;
    readonly agentic: () => R;
  },
): R {
  switch (mode) {
    case 'deterministic':
      return cases.deterministic();
    case 'translation':
      return cases.translation();
    case 'agentic':
      return cases.agentic();
  }
}
