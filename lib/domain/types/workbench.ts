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

import type { AdoId } from '../identity';
import type { InterventionTarget } from './intervention';

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

export interface AgentWorkbenchProjection {
  readonly kind: 'agent-workbench';
  readonly version: 1;
  readonly generatedAt: string;
  readonly iteration: number;
  readonly items: readonly AgentWorkItem[];
  readonly summary: {
    readonly total: number;
    readonly byKind: Readonly<Record<WorkItemKind, number>>;
    readonly topPriority: AgentWorkItem | null;
  };
}
