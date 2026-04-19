/**
 * Agent Workbench — first-class domain types for structured, actionable work items.
 *
 * The workbench is a projection (derived, disposable) that transforms iteration
 * results into prioritized work items consumable by Claude Code, VSCode Copilot,
 * MCP tools, or a future dashboard. Each item carries typed actions, full context,
 * evidence, and links to related diagnostics.
 *
 * The design follows the intervention spine model: each work item completion
 * produces an InterventionReceipt that feeds back into the next iteration.
 */

import type { AdoId } from '../kernel/identity';
import type { InterventionTarget } from './intervention';
import type { StepTaskScreenCandidate } from '../knowledge/types';
import type { ResolutionTarget } from '../governance/workflow-types';

export type WorkItemKind =
  | 'interpret-step'
  | 'approve-proposal'
  | 'author-knowledge'
  | 'investigate-hotspot'
  | 'validate-calibration'
  | 'request-rerun';

export type WorkItemActionKind = 'approve' | 'reject' | 'inspect' | 'author' | 'rerun' | 'skip';

export interface WorkItemAction {
  readonly kind: WorkItemActionKind;
  readonly target: InterventionTarget;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface AgentWorkItem {
  readonly id: string;
  readonly kind: WorkItemKind;
  readonly priority: number;
  readonly title: string;
  readonly rationale: string;
  readonly adoId: AdoId | null;
  readonly iteration: number;
  readonly actions: readonly WorkItemAction[];
  readonly context: {
    readonly proposalId?: string | undefined;
    readonly stepIndex?: number | undefined;
    readonly screen?: string | undefined;
    readonly element?: string | undefined;
    readonly exhaustionTrail?: ReadonlyArray<{
      readonly stage: string;
      readonly outcome: string;
      readonly reason: string;
    }> | undefined;
    readonly artifactRefs: readonly string[];
  };
  readonly evidence: {
    readonly confidence: number;
    readonly sources: readonly string[];
  };
  readonly linkedProposals: readonly string[];
  readonly linkedHotspots: readonly string[];
  readonly linkedBottlenecks: readonly string[];
}

export type WorkItemCompletionStatus = 'completed' | 'skipped' | 'blocked';

export interface WorkItemCompletion {
  readonly workItemId: string;
  readonly status: WorkItemCompletionStatus;
  readonly completedAt: string;
  readonly rationale: string;
  readonly artifactsWritten: readonly string[];
}

/** A group of work items sharing the same screen context.
 *  Convergence point: the deterministic pipeline's StepTaskScreenCandidate
 *  IS the screen model — the workbench extends it with work items.
 *  The agent observes the screen once (via Playwright MCP / Chrome MCP),
 *  receives full element/alias/selector context, and decides on all items. */
export interface ScreenGroupContext {
  readonly screen: StepTaskScreenCandidate;
  readonly workItems: readonly AgentWorkItem[];
  readonly totalOccurrences: number;
}

/** Agent observation persisted as evidence for future runs and confidence scoring. */
export interface AgentObservationRecord {
  readonly kind: 'agent-observation';
  readonly version: 1;
  readonly adoId: string;
  readonly runId: string;
  readonly stepIndex: number;
  readonly provider: string;
  readonly target: ResolutionTarget;
  readonly rationale: string;
  readonly confidence: number;
  readonly observedAt: string;
}

/** Cross-iteration intervention lineage — tracks the feedback arc from
 *  proposal → activation → completion → rerun → resolution. */
export interface InterventionLineageEntry {
  readonly kind: 'intervention-lineage-entry';
  readonly iteration: number;
  readonly proposalId: string | null;
  readonly workItemId: string | null;
  readonly completionStatus: WorkItemCompletionStatus | null;
  readonly rerunPlanId: string | null;
  readonly artifactsWritten: readonly string[];
  readonly timestamp: string;
}

export interface InterventionLineageEnvelope {
  readonly kind: 'intervention-lineage';
  readonly version: 1;
  readonly entries: readonly InterventionLineageEntry[];
}

/** Envelope for persisted completions (not JSONL — uses standard envelope pattern). */
export interface WorkbenchCompletionsEnvelope {
  readonly kind: 'workbench-completions';
  readonly version: 1;
  readonly entries: readonly WorkItemCompletion[];
}

export interface AgentWorkbenchProjection {
  readonly kind: 'agent-workbench';
  readonly version: 1;
  readonly generatedAt: string;
  readonly iteration: number;
  readonly items: readonly AgentWorkItem[];
  readonly completions: readonly WorkItemCompletion[];
  readonly summary: {
    readonly total: number;
    readonly pending: number;
    readonly completed: number;
    readonly byKind: Readonly<Record<WorkItemKind, number>>;
    readonly topPriority: AgentWorkItem | null;
  };
}
