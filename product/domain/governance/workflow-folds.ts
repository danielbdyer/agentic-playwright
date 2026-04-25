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

import { closedUnion } from '../algebra/closed-union';
import type {
  ResolutionMode,
  WorkflowLane,
  WorkflowScope,
  WorkflowStage,
} from './workflow-types';

// ─── WorkflowStage ───────────────────────────────────────────

const WORKFLOW_STAGE_UNION = closedUnion<WorkflowStage>([
  'preparation',
  'resolution',
  'execution',
  'evidence',
  'proposal',
  'projection',
]);

export const WORKFLOW_STAGE_VALUES = WORKFLOW_STAGE_UNION.values;

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

const WORKFLOW_SCOPE_UNION = closedUnion<WorkflowScope>([
  'scenario',
  'step',
  'run',
  'suite',
  'workspace',
  'control',
  'hypothesis',
  'compilation',
]);

export const WORKFLOW_SCOPE_VALUES = WORKFLOW_SCOPE_UNION.values;

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

const WORKFLOW_LANE_UNION = closedUnion<WorkflowLane>([
  'intent',
  'knowledge',
  'control',
  'resolution',
  'execution',
  'governance',
  'projection',
]);

export const WORKFLOW_LANE_VALUES = WORKFLOW_LANE_UNION.values;

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

const RESOLUTION_MODE_UNION = closedUnion<ResolutionMode>([
  'deterministic',
  'translation',
  'agentic',
]);

export const RESOLUTION_MODE_VALUES = RESOLUTION_MODE_UNION.values;

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
