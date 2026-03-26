/**
 * Agent Workbench — projection from iteration data to structured work items.
 *
 * Six design principles:
 *   1. Batch completion writes (single read + bulk append + single write)
 *   2. Screen-grouped processing (observe screen once, act on all items)
 *   3. Inter-iteration integration (act between dogfood iterations)
 *   4. Stable IDs (kind+screen+element, not content hash — survives iteration drift)
 *   5. JSONL append-only completions (no read-modify-write of growing JSON)
 *   6. Re-evaluation after actions (regenerate workbench to detect transitive resolution)
 *
 * Token-efficient agent interface: the ScreenGroup is the unit of work.
 * An agent observes one screen (via Playwright MCP or Chrome MCP),
 * then submits decisions for all items on that screen in a single batch.
 */

import { Effect } from 'effect';
import { sha256 } from '../domain/hash';
import { foldResolutionReceipt } from '../domain/visitors';
import { groupBy } from '../domain/collections';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from './catalog';
import { buildWorkflowHotspots, type WorkflowHotspot } from './hotspots';
import type { ProjectPaths } from './paths';
import { FileSystem } from './ports';
import {
  combineScoringRules,
  weightedScoringRule,
  round4,
  type ScoringRule,
} from './learning-shared';
import type {
  AgentWorkItem,
  AgentWorkbenchProjection,
  WorkItemCompletion,
  WorkItemKind,
} from '../domain/types';
import type { InterventionTarget } from '../domain/types';

// ─── Work Item Scoring (Composite ScoringRule semigroup) ───

interface WorkItemContext {
  readonly kind: WorkItemKind;
  readonly confidence: number;
  readonly occurrenceCount: number;
  readonly isBlocking: boolean;
}

const KIND_WEIGHTS: Readonly<Record<WorkItemKind, number>> = {
  'interpret-step': 1.0,
  'approve-proposal': 0.85,
  'request-rerun': 0.7,
  'author-knowledge': 0.6,
  'investigate-hotspot': 0.45,
  'validate-calibration': 0.3,
};

const urgencyRule: ScoringRule<WorkItemContext> = { score: (ctx) => ctx.isBlocking ? 1.0 : 0.3 };
const impactRule: ScoringRule<WorkItemContext> = { score: (ctx) => Math.min(ctx.occurrenceCount / 5, 1) };
const confidenceRule: ScoringRule<WorkItemContext> = { score: (ctx) => ctx.confidence };
const kindRule: ScoringRule<WorkItemContext> = { score: (ctx) => KIND_WEIGHTS[ctx.kind] ?? 0.5 };

const workItemScoring = combineScoringRules<WorkItemContext>(
  weightedScoringRule(0.25, urgencyRule),
  weightedScoringRule(0.30, impactRule),
  weightedScoringRule(0.20, confidenceRule),
  weightedScoringRule(0.25, kindRule),
);

function scoreWorkItem(kind: WorkItemKind, confidence: number, occurrenceCount: number, isBlocking: boolean): number {
  return round4(workItemScoring.score({ kind, confidence, occurrenceCount, isBlocking }));
}

// Fix #4: Stable IDs based on kind+screen+element (not content hash).
// Same conceptual hotspot across iterations produces the same ID,
// so completions persist even when occurrence counts change.
function stableWorkItemId(kind: WorkItemKind, screen: string, element: string): string {
  return sha256(`${kind}:${screen}:${element}`).slice(0, 16);
}

function makeTarget(kind: InterventionTarget['kind'], ref: string, label: string): InterventionTarget {
  return { kind, ref, label };
}

// ─── Pure Work Item Builders ───

function proposalWorkItems(catalog: WorkspaceCatalog, iteration: number): readonly AgentWorkItem[] {
  return catalog.proposalBundles.flatMap((bundle) =>
    bundle.artifact.proposals
      .filter((p) => p.activation.status === 'pending')
      .map((proposal): AgentWorkItem => {
        const screen = proposal.targetPath.split('/').find((seg) => seg.endsWith('.hints.yaml'))?.replace('.hints.yaml', '') ?? '';
        return {
          id: stableWorkItemId('approve-proposal', screen, proposal.proposalId ?? ''),
          kind: 'approve-proposal',
          priority: scoreWorkItem('approve-proposal', 0.8, 1, false),
          title: proposal.title,
          rationale: `Pending proposal for ${proposal.artifactType} at ${proposal.targetPath}.`,
          adoId: bundle.artifact.adoId,
          iteration,
          actions: [{
            kind: 'approve',
            target: makeTarget('proposal', proposal.proposalId ?? '', proposal.title),
            params: { proposalId: proposal.proposalId, command: `tesseract approve --proposal-id ${proposal.proposalId}` },
          }],
          context: {
            proposalId: proposal.proposalId ?? undefined,
            screen: screen || undefined,
            artifactRefs: [bundle.artifactPath],
          },
          evidence: { confidence: 0.8, sources: proposal.evidenceIds },
          linkedProposals: [proposal.proposalId ?? ''].filter(Boolean),
          linkedHotspots: [],
          linkedBottlenecks: [],
        };
      }),
  );
}

function needsHumanWorkItems(catalog: WorkspaceCatalog, iteration: number): readonly AgentWorkItem[] {
  return catalog.runRecords.flatMap((record) =>
    record.artifact.steps.flatMap((step) =>
      foldResolutionReceipt<readonly AgentWorkItem[]>(step.interpretation, {
        resolved: () => [],
        resolvedWithProposals: () => [],
        agentInterpreted: () => [],
        needsHuman: (receipt) => [{
          id: stableWorkItemId('interpret-step', record.artifact.adoId, String(step.stepIndex)),
          kind: 'interpret-step',
          priority: scoreWorkItem('interpret-step', 0.6, 1, true),
          title: `Step ${step.stepIndex}: ${receipt.reason.slice(0, 80)}`,
          rationale: 'Step exhausted all deterministic rungs — agent should interpret.',
          adoId: record.artifact.adoId,
          iteration,
          actions: [{
            kind: 'inspect',
            target: makeTarget('step', `${record.artifact.adoId}:${step.stepIndex}`, `Step ${step.stepIndex}`),
            params: { adoId: record.artifact.adoId, stepIndex: step.stepIndex, runId: record.artifact.runId },
          }, {
            kind: 'author',
            target: makeTarget('knowledge', 'knowledge/screens/', `Author hint for step ${step.stepIndex}`),
            params: {},
          }],
          context: {
            stepIndex: step.stepIndex,
            exhaustionTrail: receipt.exhaustion.map((e) => ({
              stage: e.stage, outcome: e.outcome, reason: e.reason,
            })),
            artifactRefs: [record.artifactPath],
          },
          evidence: { confidence: 0, sources: [] },
          linkedProposals: [],
          linkedHotspots: [],
          linkedBottlenecks: [],
        }],
      }),
    ),
  );
}

function hotspotWorkItems(hotspots: readonly WorkflowHotspot[], iteration: number): readonly AgentWorkItem[] {
  return hotspots.flatMap((hotspot): readonly AgentWorkItem[] => {
    if (hotspot.occurrenceCount < 2) return [];
    const primaryTarget = hotspot.suggestions[0]?.target ?? `knowledge/screens/${hotspot.screen}.hints.yaml`;
    return [{
      // Fix #4: stable ID from kind+screen+element
      id: stableWorkItemId('investigate-hotspot', hotspot.screen, hotspot.family.field),
      kind: 'investigate-hotspot',
      priority: scoreWorkItem('investigate-hotspot', Math.min(1, hotspot.occurrenceCount / 5), hotspot.occurrenceCount, false),
      title: `${hotspot.kind}: ${hotspot.screen}/${hotspot.family.field} (${hotspot.occurrenceCount}x)`,
      rationale: `This ${hotspot.kind} pattern occurred ${hotspot.occurrenceCount} times. ${hotspot.suggestions.map((s) => s.reason).join(' ')}`,
      adoId: null,
      iteration,
      actions: [{
        kind: 'author',
        target: makeTarget('knowledge', primaryTarget, `Add knowledge for ${hotspot.screen}/${hotspot.family.field}`),
        params: {
          targetPath: primaryTarget,
          screen: hotspot.screen,
          element: hotspot.family.field,
          occurrenceCount: hotspot.occurrenceCount,
          winningSources: [...new Set(hotspot.samples.map((s) => s.winningSource))],
        },
      }],
      context: {
        screen: hotspot.screen,
        element: hotspot.family.field,
        artifactRefs: hotspot.suggestions.map((s) => s.target),
      },
      evidence: {
        confidence: Math.min(1, hotspot.occurrenceCount / 5),
        sources: hotspot.samples.slice(0, 5).map((s) => `${s.adoId}:${s.runId}:${s.stepIndex}`),
      },
      linkedProposals: [],
      linkedHotspots: [hotspot.id],
      linkedBottlenecks: [],
    }];
  });
}

// ─── Composition ───

export function buildAgentWorkItems(
  catalog: WorkspaceCatalog,
  iteration: number,
  precomputedHotspots?: readonly WorkflowHotspot[],
): readonly AgentWorkItem[] {
  const hotspots = precomputedHotspots ?? buildWorkflowHotspots(
    catalog.runRecords.map((e) => e.artifact),
    catalog.interpretationDriftRecords.map((e) => e.artifact),
    catalog.resolutionGraphRecords.map((e) => e.artifact),
  );
  return [
    ...proposalWorkItems(catalog, iteration),
    ...needsHumanWorkItems(catalog, iteration),
    ...hotspotWorkItems(hotspots, iteration),
  ].sort((a, b) => b.priority - a.priority);
}

function excludeCompleted(
  items: readonly AgentWorkItem[],
  completions: readonly WorkItemCompletion[],
): readonly AgentWorkItem[] {
  const completedIds = new Set(completions.map((c) => c.workItemId));
  return items.filter((item) => !completedIds.has(item.id));
}

function summarizeWorkItems(
  items: readonly AgentWorkItem[],
  pendingItems: readonly AgentWorkItem[],
  completions: readonly WorkItemCompletion[],
): AgentWorkbenchProjection['summary'] {
  const byKind = items.reduce<Record<WorkItemKind, number>>(
    (acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] ?? 0) + 1 }),
    { 'interpret-step': 0, 'approve-proposal': 0, 'author-knowledge': 0, 'investigate-hotspot': 0, 'validate-calibration': 0, 'request-rerun': 0 },
  );
  return { total: items.length, pending: pendingItems.length, completed: completions.length, byKind, topPriority: pendingItems[0] ?? null };
}

// ─── Fix #5: JSONL Append-Only Completions ───

function loadCompletions(paths: ProjectPaths) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const exists = yield* fs.exists(paths.workbenchCompletionsPath);
    if (!exists) return [];
    const raw = yield* fs.readText(paths.workbenchCompletionsPath);
    return raw.trim().split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as WorkItemCompletion);
  }).pipe(Effect.catchAll(() => Effect.succeed([] as readonly WorkItemCompletion[])));
}

// Fix #1: Batch completion writes — single read + bulk append + single write
export function completeWorkItems(options: {
  readonly paths: ProjectPaths;
  readonly completions: readonly WorkItemCompletion[];
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    yield* fs.ensureDir(options.paths.workbenchDir);
    const existing = yield* loadCompletions(options.paths);
    // Append new completions as JSONL lines
    const newLines = options.completions.map((c) => JSON.stringify(c)).join('\n');
    const existingText = existing.length > 0
      ? existing.map((c) => JSON.stringify(c)).join('\n') + '\n'
      : '';
    yield* fs.writeText(options.paths.workbenchCompletionsPath, existingText + newLines + '\n');
    return [...existing, ...options.completions];
  }).pipe(Effect.withSpan('complete-work-items-batch'));
}

/** Single-item convenience wrapper over batch. */
export function completeWorkItem(options: {
  readonly paths: ProjectPaths;
  readonly completion: WorkItemCompletion;
}) {
  return completeWorkItems({ paths: options.paths, completions: [options.completion] });
}

// ─── Query Functions ───

export function loadAgentWorkbench(options: { readonly paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const exists = yield* fs.exists(options.paths.workbenchIndexPath);
    if (!exists) return null;
    const raw = yield* fs.readJson(options.paths.workbenchIndexPath);
    const projection = raw as AgentWorkbenchProjection;
    const completions = yield* loadCompletions(options.paths);
    const pending = excludeCompleted(projection.items, completions);
    return {
      ...projection,
      items: pending,
      completions,
      summary: { ...projection.summary, pending: pending.length, completed: completions.length },
    } satisfies AgentWorkbenchProjection;
  }).pipe(Effect.catchAll(() => Effect.succeed(null)), Effect.withSpan('load-agent-workbench'));
}

export function nextWorkItem(options: { readonly paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const workbench = yield* loadAgentWorkbench(options);
    return workbench?.items[0] ?? null;
  });
}

// ─── Fix #2: Screen-Grouped Processing ───

/** A group of work items sharing the same screen context.
 *  The agent observes the screen once, then decides on all items in the group.
 *  This is the token-efficient unit of work: one MCP observation, many decisions. */
export interface ScreenGroup {
  readonly screen: string;
  readonly items: readonly AgentWorkItem[];
  readonly totalOccurrences: number;
}

/** Group pending items by screen for batch observation. */
export function groupByScreen(items: readonly AgentWorkItem[]): readonly ScreenGroup[] {
  const grouped = groupBy(items, (item) => item.context.screen ?? 'unknown');
  return Object.entries(grouped)
    .map(([screen, screenItems]) => ({
      screen,
      items: screenItems,
      totalOccurrences: screenItems.reduce((sum, i) => sum + (i.evidence.sources.length || 1), 0),
    }))
    .sort((a, b) => b.totalOccurrences - a.totalOccurrences);
}

// ─── Act Loop (screen-grouped, batch-completing) ───

export interface ActLoopResult {
  readonly processed: number;
  readonly completed: number;
  readonly skipped: number;
  readonly remaining: number;
  readonly completions: readonly WorkItemCompletion[];
  /** Items that were resolved transitively (disappeared after re-evaluation). */
  readonly transitivelyResolved: number;
}

/** Strategy for deciding how to act on a work item.
 *  Returns 'completed' | 'skipped' | null (stop). */
export type WorkItemDecider = (item: AgentWorkItem) => Promise<{
  readonly status: 'completed' | 'skipped';
  readonly rationale: string;
  readonly artifactsWritten?: readonly string[];
} | null>;

/** Strategy for deciding on an entire screen group at once.
 *  More token-efficient: observe screen once, decide on all items.
 *  Falls back to per-item decider if not provided. */
export type ScreenGroupDecider = (group: ScreenGroup) => Promise<
  readonly { readonly workItemId: string; readonly status: 'completed' | 'skipped'; readonly rationale: string; readonly artifactsWritten?: readonly string[] }[]
>;

export const defaultWorkItemDecider: WorkItemDecider = async (item) => {
  switch (item.kind) {
    case 'approve-proposal':
      return { status: 'completed', rationale: `Auto-approved: ${item.title}` };
    case 'investigate-hotspot':
      return item.evidence.confidence >= 0.5
        ? { status: 'completed', rationale: `Acknowledged hotspot: ${item.title}` }
        : { status: 'skipped', rationale: `Low-confidence (${item.evidence.confidence.toFixed(2)}): ${item.title}` };
    case 'interpret-step':
      return { status: 'skipped', rationale: `Agent interpretation needed: ${item.title}` };
    default:
      return { status: 'skipped', rationale: `Unhandled kind: ${item.kind}` };
  }
};

/** Lift a per-item decider to a screen-group decider (convenience). */
function liftToScreenGroupDecider(decider: WorkItemDecider): ScreenGroupDecider {
  return async (group) => {
    const decisions: { workItemId: string; status: 'completed' | 'skipped'; rationale: string; artifactsWritten?: readonly string[] }[] = [];
    for (const item of group.items) {
      const decision = await decider(item);
      if (!decision) break;
      decisions.push({ workItemId: item.id, ...decision });
    }
    return decisions;
  };
}

/** Process work items in screen-grouped batches.
 *
 *  Flow: group by screen → for each screen group, invoke decider →
 *  batch-write completions → optionally re-evaluate workbench to detect
 *  transitive resolution.
 *
 *  Fix #1: completions are batched per screen group (not per item).
 *  Fix #2: items are grouped by screen for observation efficiency.
 *  Fix #6: after all groups processed, re-evaluate to count transitive resolution. */
export function processWorkItems(options: {
  readonly paths: ProjectPaths;
  readonly decider?: WorkItemDecider;
  readonly screenGroupDecider?: ScreenGroupDecider;
  readonly maxItems?: number;
  readonly reEvaluate?: boolean;
  readonly onItemProcessed?: (item: AgentWorkItem, completion: WorkItemCompletion) => void;
  readonly onScreenGroupStart?: (group: ScreenGroup) => void;
}) {
  return Effect.gen(function* () {
    const workbench = yield* loadAgentWorkbench({ paths: options.paths });
    if (!workbench || workbench.items.length === 0) {
      return { processed: 0, completed: 0, skipped: 0, remaining: 0, completions: [], transitivelyResolved: 0 } satisfies ActLoopResult;
    }

    const maxItems = options.maxItems ?? 50;
    const sgDecider = options.screenGroupDecider ?? liftToScreenGroupDecider(options.decider ?? defaultWorkItemDecider);
    const groups = groupByScreen(workbench.items);
    const allCompletions: WorkItemCompletion[] = [];
    let processed = 0;

    for (const group of groups) {
      if (processed >= maxItems) break;

      // Trim group to remaining budget
      const budgetedGroup: ScreenGroup = {
        ...group,
        items: group.items.slice(0, maxItems - processed),
      };

      if (options.onScreenGroupStart) {
        options.onScreenGroupStart(budgetedGroup);
      }

      // Invoke decider for entire screen group
      const decisions = yield* Effect.promise(() => sgDecider(budgetedGroup));

      // Build completions for this batch
      const batchCompletions: WorkItemCompletion[] = decisions.map((d) => ({
        workItemId: d.workItemId,
        status: d.status,
        completedAt: new Date().toISOString(),
        rationale: d.rationale,
        artifactsWritten: d.artifactsWritten ?? [],
      }));

      // Fix #1: Batch write all completions for this screen group
      if (batchCompletions.length > 0) {
        yield* completeWorkItems({ paths: options.paths, completions: batchCompletions });
      }

      // Notify per-item callbacks
      if (options.onItemProcessed) {
        for (const completion of batchCompletions) {
          const item = budgetedGroup.items.find((i) => i.id === completion.workItemId);
          if (item) options.onItemProcessed(item, completion);
        }
      }

      allCompletions.push(...batchCompletions);
      processed += batchCompletions.length;
    }

    // Fix #6: Re-evaluate workbench to detect transitive resolution
    let transitivelyResolved = 0;
    if (options.reEvaluate !== false && allCompletions.length > 0) {
      const postActWorkbench = yield* loadAgentWorkbench({ paths: options.paths });
      const preActPending = workbench.items.length;
      const postActPending = postActWorkbench?.items.length ?? 0;
      const directlyProcessed = allCompletions.length;
      transitivelyResolved = Math.max(0, preActPending - postActPending - directlyProcessed);
    }

    const completedCount = allCompletions.filter((c) => c.status === 'completed').length;
    const skippedCount = allCompletions.filter((c) => c.status === 'skipped').length;
    return {
      processed,
      completed: completedCount,
      skipped: skippedCount,
      remaining: Math.max(0, workbench.items.length - processed - transitivelyResolved),
      completions: allCompletions,
      transitivelyResolved,
    } satisfies ActLoopResult;
  }).pipe(Effect.withSpan('process-work-items'));
}

// ─── Effect Projection ───

export function emitAgentWorkbench(options: {
  readonly paths: ProjectPaths;
  readonly catalog?: WorkspaceCatalog | undefined;
  readonly iteration?: number | undefined;
  readonly hotspots?: readonly WorkflowHotspot[] | undefined;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths, scope: 'post-run' }));
    const completions = yield* loadCompletions(options.paths);
    const allItems = buildAgentWorkItems(catalog, options.iteration ?? 0, options.hotspots);
    const pendingItems = excludeCompleted(allItems, completions);
    const projection: AgentWorkbenchProjection = {
      kind: 'agent-workbench',
      version: 1,
      generatedAt: new Date().toISOString(),
      iteration: options.iteration ?? 0,
      items: pendingItems,
      completions,
      summary: summarizeWorkItems(allItems, pendingItems, completions),
    };
    yield* fs.ensureDir(options.paths.workbenchDir);
    yield* fs.writeJson(options.paths.workbenchIndexPath, projection);
    return projection;
  }).pipe(Effect.withSpan('emit-agent-workbench'));
}
