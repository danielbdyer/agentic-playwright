/**
 * Agent Workbench — projection from iteration data to structured work items.
 *
 * Parallel to the operator inbox (inbox.ts), but designed for machine consumption.
 * Each builder is a pure function; the projection is disposable and regenerated
 * per iteration.
 *
 * Scoring uses the ScoringRule semigroup from learning-shared.ts.
 * Completion tracking persists to workbenchCompletionsPath; the next projection
 * filters completed items so they don't reappear.
 */

import { Effect } from 'effect';
import { sha256 } from '../domain/hash';
import { foldResolutionReceipt } from '../domain/visitors';
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

function workItemId(kind: WorkItemKind, ...parts: readonly string[]): string {
  return sha256(`${kind}:${parts.join(':')}`).slice(0, 16);
}

function makeTarget(kind: InterventionTarget['kind'], ref: string, label: string): InterventionTarget {
  return { kind, ref, label };
}

// ─── Pure Work Item Builders ───

function proposalWorkItems(catalog: WorkspaceCatalog, iteration: number): readonly AgentWorkItem[] {
  return catalog.proposalBundles.flatMap((bundle) =>
    bundle.artifact.proposals
      .filter((p) => p.activation.status === 'pending')
      .map((proposal): AgentWorkItem => ({
        id: workItemId('approve-proposal', proposal.proposalId ?? bundle.artifact.adoId),
        kind: 'approve-proposal',
        priority: scoreWorkItem('approve-proposal', 0.8, 1, false),
        title: proposal.title,
        rationale: `Pending proposal for ${proposal.artifactType} at ${proposal.targetPath}. Approving will add the proposed knowledge to the canonical knowledge base.`,
        adoId: bundle.artifact.adoId,
        iteration,
        actions: [{
          kind: 'approve',
          target: makeTarget('proposal', proposal.proposalId ?? '', proposal.title),
          params: { proposalId: proposal.proposalId, command: `tesseract approve --proposal-id ${proposal.proposalId}` },
        }],
        context: {
          proposalId: proposal.proposalId ?? undefined,
          screen: proposal.targetPath.split('/').find((seg) => seg.endsWith('.hints.yaml'))?.replace('.hints.yaml', ''),
          artifactRefs: [bundle.artifactPath],
        },
        evidence: { confidence: 0.8, sources: proposal.evidenceIds },
        linkedProposals: [proposal.proposalId ?? ''].filter(Boolean),
        linkedHotspots: [],
        linkedBottlenecks: [],
      })),
  );
}

function needsHumanWorkItems(catalog: WorkspaceCatalog, iteration: number): readonly AgentWorkItem[] {
  return catalog.runRecords.flatMap((record) =>
    record.artifact.steps.flatMap((step) =>
      // Use the discriminated union's kind field for type-safe narrowing
      foldResolutionReceipt<readonly AgentWorkItem[]>(step.interpretation, {
        resolved: () => [],
        resolvedWithProposals: () => [],
        agentInterpreted: () => [],
        needsHuman: (receipt) => [{
          id: workItemId('interpret-step', record.artifact.adoId, String(step.stepIndex)),
          kind: 'interpret-step',
          priority: scoreWorkItem('interpret-step', 0.6, 1, true),
          title: `Step ${step.stepIndex}: ${receipt.reason.slice(0, 80)}`,
          rationale: 'This step exhausted all deterministic resolution rungs. The agent should interpret the step text and determine the correct screen, element, and action.',
          adoId: record.artifact.adoId,
          iteration,
          actions: [{
            kind: 'inspect',
            target: makeTarget('step', `${record.artifact.adoId}:${step.stepIndex}`, `Inspect step ${step.stepIndex}`),
            params: { adoId: record.artifact.adoId, stepIndex: step.stepIndex, runId: record.artifact.runId },
          }, {
            kind: 'author',
            target: makeTarget('knowledge', 'knowledge/screens/', `Author hint for step ${step.stepIndex}`),
            params: {},
          }],
          context: {
            stepIndex: step.stepIndex,
            exhaustionTrail: receipt.exhaustion.map((e) => ({
              stage: e.stage,
              outcome: e.outcome,
              reason: e.reason,
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
        id: workItemId('investigate-hotspot', hotspot.id),
        kind: 'investigate-hotspot',
        priority: scoreWorkItem('investigate-hotspot', Math.min(1, hotspot.occurrenceCount / 5), hotspot.occurrenceCount, false),
        title: `${hotspot.kind}: ${hotspot.screen}/${hotspot.family.field} (${hotspot.occurrenceCount}x)`,
        rationale: `This ${hotspot.kind} pattern occurred ${hotspot.occurrenceCount} times. ${hotspot.suggestions.map((s) => s.reason).join(' ')}`,
        adoId: null,
        iteration,
        actions: [{
          kind: 'author',
          target: makeTarget('knowledge', primaryTarget, `Add deterministic knowledge for ${hotspot.screen}/${hotspot.family.field}`),
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

/** Build work items from catalog data. Pure function: catalog → sorted items.
 *  Accepts optional pre-computed hotspots to avoid redundant computation
 *  when the caller already built them (e.g., inbox projection). */
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

/** Filter items by completion set. Pure. */
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
  return {
    total: items.length,
    pending: pendingItems.length,
    completed: completions.length,
    byKind,
    topPriority: pendingItems[0] ?? null,
  };
}

// ─── Completion Tracking ───

function loadCompletions(paths: ProjectPaths) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const exists = yield* fs.exists(paths.workbenchCompletionsPath);
    if (!exists) return [];
    const raw = yield* fs.readJson(paths.workbenchCompletionsPath);
    return (Array.isArray(raw) ? raw : []) as readonly WorkItemCompletion[];
  }).pipe(Effect.catchAll(() => Effect.succeed([] as readonly WorkItemCompletion[])));
}

export function completeWorkItem(options: {
  readonly paths: ProjectPaths;
  readonly completion: WorkItemCompletion;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const existing = yield* loadCompletions(options.paths);
    const updated = [...existing, options.completion];
    yield* fs.ensureDir(options.paths.workbenchDir);
    yield* fs.writeJson(options.paths.workbenchCompletionsPath, updated);
    return updated;
  }).pipe(Effect.withSpan('complete-work-item', { attributes: { workItemId: options.completion.workItemId } }));
}

// ─── Query Functions ───

/** Load the workbench projection with completions cross-referenced. */
export function loadAgentWorkbench(options: {
  readonly paths: ProjectPaths;
}) {
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
      summary: {
        ...projection.summary,
        pending: pending.length,
        completed: completions.length,
      },
    } satisfies AgentWorkbenchProjection;
  }).pipe(
    Effect.catchAll(() => Effect.succeed(null)),
    Effect.withSpan('load-agent-workbench'),
  );
}

/** Return the highest-priority pending work item, or null if none. */
export function nextWorkItem(options: {
  readonly paths: ProjectPaths;
}) {
  return Effect.gen(function* () {
    const workbench = yield* loadAgentWorkbench(options);
    return workbench?.items[0] ?? null;
  });
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
