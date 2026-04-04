/**
 * Agent Workbench — projection from iteration data to structured work items.
 *
 * Convergence design: the workbench and the deterministic resolution pipeline
 * share the SAME screen model (StepTaskScreenCandidate). The ScreenGroupContext
 * pairs a pre-built screen candidate with its work items — one observation,
 * all the context needed to decide on every item on that screen.
 *
 * Completions use the standard envelope pattern ({ kind, version, entries })
 * consistent with all other artifacts in the codebase.
 */

import { Effect } from 'effect';
import { sha256 } from '../../domain/kernel/hash';
import { isPending } from '../../domain/proposal/lifecycle';
import { foldResolutionReceipt } from '../../domain/kernel/visitors';
import { groupBy } from '../../domain/kernel/collections';
import type { SliceFn, ProjectionFn } from '../../domain/algebra/slice-projection';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from '../catalog';
import { buildWorkflowHotspots, type WorkflowHotspot } from '../improvement/hotspots';
import type { ProjectPaths } from '../paths';
import { FileSystem, Dashboard } from '../ports';
import { dashboardEvent } from '../../domain/types/intervention-context';
import {
  combineScoringRules,
  weightedScoringRule,
  round4,
  type ScoringRule,
} from '../learning/learning-shared';
import type {
  AgentWorkItem,
  AgentWorkbenchProjection,
  ScreenGroupContext,
  WorkbenchCompletionsEnvelope,
  WorkItemCompletion,
  WorkItemKind,
  StepTaskScreenCandidate,
  InterfaceResolutionContext,
} from '../../domain/types';
import type { ScreenId } from '../../domain/kernel/identity';
import type { InterventionLineageEntry, InterventionLineageEnvelope, InterventionTarget } from '../../domain/types';

// ─── Work Item Scoring (Composite ScoringRule semigroup) ───

interface WorkItemContext {
  readonly kind: WorkItemKind;
  readonly confidence: number;
  readonly occurrenceCount: number;
  readonly isBlocking: boolean;
  /** Health boost from learning signals — higher when execution health is degraded. */
  readonly healthBoost: number;
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
const healthRule: ScoringRule<WorkItemContext> = { score: (ctx) => ctx.healthBoost };

const workItemScoring = combineScoringRules<WorkItemContext>(
  weightedScoringRule(0.20, urgencyRule),
  weightedScoringRule(0.25, impactRule),
  weightedScoringRule(0.20, confidenceRule),
  weightedScoringRule(0.20, kindRule),
  weightedScoringRule(0.15, healthRule),
);

function scoreWorkItem(kind: WorkItemKind, confidence: number, occurrenceCount: number, isBlocking: boolean, healthBoost: number = 0): number {
  return round4(workItemScoring.score({ kind, confidence, occurrenceCount, isBlocking, healthBoost }));
}

function stableWorkItemId(kind: WorkItemKind, screen: string, element: string): string {
  return sha256(`${kind}:${screen}:${element}`).slice(0, 16);
}

function makeTarget(kind: InterventionTarget['kind'], ref: string, label: string): InterventionTarget {
  return { kind, ref, label };
}

// ─── Pure Work Item Builders ───

function proposalWorkItems(catalog: WorkspaceCatalog, iteration: number): readonly AgentWorkItem[] {
  return catalog.proposalBundles.flatMap((bundle) =>
    bundle.artifact.payload.proposals
      .flatMap((p) => isPending(p.activation) ? [p] : [])
      .map((proposal): AgentWorkItem => {
        const screen = proposal.targetPath.split('/').find((seg) => seg.endsWith('.hints.yaml'))?.replace('.hints.yaml', '') ?? '';
        return {
          id: stableWorkItemId('approve-proposal', screen, proposal.proposalId ?? ''),
          kind: 'approve-proposal',
          priority: scoreWorkItem('approve-proposal', 0.8, 1, false),
          title: proposal.title,
          rationale: `Pending proposal for ${proposal.artifactType} at ${proposal.targetPath}.`,
          adoId: bundle.artifact.payload.adoId,
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
          id: stableWorkItemId('interpret-step', record.artifact.payload.adoId, String(step.stepIndex)),
          kind: 'interpret-step',
          priority: scoreWorkItem('interpret-step', 0.6, 1, true),
          title: `Step ${step.stepIndex}: ${receipt.reason.slice(0, 80)}`,
          rationale: 'Step exhausted all deterministic rungs — agent should interpret.',
          adoId: record.artifact.payload.adoId,
          iteration,
          actions: [{
            kind: 'inspect',
            target: makeTarget('step', `${record.artifact.payload.adoId}:${step.stepIndex}`, `Step ${step.stepIndex}`),
            params: { adoId: record.artifact.payload.adoId, stepIndex: step.stepIndex, runId: record.artifact.runId },
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

// ─── Health-Aware Work Items ───

/** Emit validate-calibration work items when health dimensions are critically degraded
 *  AND signal maturity is high enough to trust the signal (maturity > 0.4).
 *  Pure function: learning signals → work items. */
function healthWorkItems(
  learningSignals: import('../../domain/types').LearningSignalsSummary | undefined,
  iteration: number,
): readonly AgentWorkItem[] {
  if (!learningSignals) return [];

  // Only trust health signals after sufficient iterations
  const maturity = 1 - 1 / (1 + Math.max(0, iteration) / 3);
  if (maturity <= 0.4) return [];

  const dims: readonly { readonly name: string; readonly value: number; readonly lowerIsBetter: boolean; readonly target: string }[] = [
    { name: 'timingRegression', value: learningSignals.timingRegressionRate, lowerIsBetter: true, target: 'lib/application/timing-baseline.ts' },
    { name: 'selectorFlakiness', value: learningSignals.selectorFlakinessRate, lowerIsBetter: true, target: 'knowledge/screens/' },
    { name: 'consoleNoise', value: learningSignals.consoleNoiseLevel, lowerIsBetter: true, target: 'lib/application/console-intelligence.ts' },
    { name: 'recoveryEfficiency', value: learningSignals.recoveryEfficiency, lowerIsBetter: false, target: 'lib/application/recovery-effectiveness.ts' },
    { name: 'costEfficiency', value: learningSignals.costEfficiency, lowerIsBetter: false, target: 'lib/application/execution-cost.ts' },
    { name: 'rungStability', value: learningSignals.rungStability, lowerIsBetter: false, target: 'lib/application/rung-drift.ts' },
    { name: 'componentMaturity', value: learningSignals.componentMaturityRate, lowerIsBetter: false, target: 'lib/domain/projection/component-maturation.ts' },
  ];

  // Critical threshold: lower-is-better > 0.5, higher-is-better < 0.3
  const critical = dims.filter((d) => d.lowerIsBetter ? d.value > 0.5 : d.value < 0.3);

  return critical.map((dim): AgentWorkItem => ({
    id: stableWorkItemId('validate-calibration', 'health', dim.name),
    kind: 'validate-calibration',
    priority: scoreWorkItem('validate-calibration', round4(maturity), 1, false, round4(1 - learningSignals.compositeHealthScore)),
    title: `Health: ${dim.name} critically degraded (${dim.value.toFixed(2)})`,
    rationale: `Execution health dimension "${dim.name}" is critically ${dim.lowerIsBetter ? 'high' : 'low'} at maturity ${maturity.toFixed(2)}.`,
    adoId: null,
    iteration,
    actions: [{
      kind: 'inspect',
      target: makeTarget('knowledge', dim.target, `Investigate ${dim.name} degradation`),
      params: { dimension: dim.name, value: dim.value, maturity },
    }],
    context: {
      screen: undefined,
      element: dim.name,
      artifactRefs: [dim.target],
    },
    evidence: { confidence: round4(maturity), sources: [] },
    linkedProposals: [],
    linkedHotspots: [],
    linkedBottlenecks: [],
  }));
}

// ─── Composition ───

export function buildAgentWorkItems(
  catalog: WorkspaceCatalog,
  iteration: number,
  precomputedHotspots?: readonly WorkflowHotspot[],
  learningSignals?: import('../../domain/types').LearningSignalsSummary | undefined,
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
    ...healthWorkItems(learningSignals, iteration),
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

// ─── Envelope-Based Completions (consistent with all other artifacts) ───

function loadCompletions(paths: ProjectPaths) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const exists = yield* fs.exists(paths.workbenchCompletionsPath);
    if (!exists) return [];
    const raw = yield* fs.readJson(paths.workbenchCompletionsPath);
    const envelope = raw as WorkbenchCompletionsEnvelope;
    return envelope.kind === 'workbench-completions' ? envelope.entries : [];
  }).pipe(Effect.catchAll(() => Effect.succeed([] as readonly WorkItemCompletion[])));
}

export function completeWorkItems(options: {
  readonly paths: ProjectPaths;
  readonly completions: readonly WorkItemCompletion[];
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    yield* fs.ensureDir(options.paths.workbenchDir);
    const existing = yield* loadCompletions(options.paths);
    const envelope: WorkbenchCompletionsEnvelope = {
      kind: 'workbench-completions',
      version: 1,
      entries: [...existing, ...options.completions],
    };
    yield* fs.writeJson(options.paths.workbenchCompletionsPath, envelope);
    return envelope.entries;
  }).pipe(Effect.withSpan('complete-work-items-batch'));
}

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

// ─── Screen-Grouped Processing (unified with resolution pipeline) ───

/** Build a fallback screen candidate when no resolution context is available. */
function fallbackScreenCandidate(screenId: string): StepTaskScreenCandidate {
  return {
    screen: screenId as ScreenId,
    url: '',
    routeVariantRefs: [],
    screenAliases: [screenId],
    knowledgeRefs: [],
    supplementRefs: [],
    elements: [],
    sectionSnapshots: [],
  };
}

/** Group work items by screen and attach the full StepTaskScreenCandidate from
 *  the resolution context. This is the convergence point: the agent sees the
 *  SAME screen model as the deterministic resolution pipeline. */
export function groupByScreenWithContext(
  items: readonly AgentWorkItem[],
  resolutionContext?: InterfaceResolutionContext | null,
): readonly ScreenGroupContext[] {
  const screenMap = new Map(
    (resolutionContext?.screens ?? []).map((s) => [s.screen as string, s]),
  );
  const grouped = groupBy(items, (item) => item.context.screen ?? 'unknown');
  return Object.entries(grouped)
    .map(([screenId, screenItems]): ScreenGroupContext => ({
      screen: screenMap.get(screenId) ?? fallbackScreenCandidate(screenId),
      workItems: screenItems,
      totalOccurrences: screenItems.reduce((sum, i) => sum + (i.evidence.sources.length || 1), 0),
    }))
    .sort((a, b) => b.totalOccurrences - a.totalOccurrences);
}

// ─── Slice / Projection instances (Design Calculus Duality 3) ───
//
// The screen-grouped processing above follows the slice → project pattern:
//   sliceByScreen: extract work items for a single screen
//   projectToGroups: build ScreenGroupContext[] from all items
//
// The naturality law holds: slicing items first then projecting each slice
// produces the same ScreenGroupContext as projecting all then filtering by screen.

/** Slice: extract work items belonging to a specific screen. */
export const sliceWorkItemsByScreen: SliceFn<readonly AgentWorkItem[], string, readonly AgentWorkItem[]> =
  (items, screenId) => items.filter((i) => (i.context.screen ?? 'unknown') === screenId);

/** Project: compute all screen groups from a set of work items. */
export const projectToScreenGroups: ProjectionFn<readonly AgentWorkItem[], readonly ScreenGroupContext[]> =
  (items) => groupByScreenWithContext(items);

// ─── Act Loop ───

export interface ActLoopResult {
  readonly processed: number;
  readonly completed: number;
  readonly skipped: number;
  readonly remaining: number;
  readonly completions: readonly WorkItemCompletion[];
  readonly transitivelyResolved: number;
}

export type WorkItemDecisionResult = {
  readonly status: 'completed' | 'skipped';
  readonly rationale: string;
  readonly artifactsWritten?: readonly string[];
} | null;

export type WorkItemDecider = (item: AgentWorkItem) => Effect.Effect<WorkItemDecisionResult>;

/** Strategy for deciding on an entire screen group at once.
 *  Receives the full StepTaskScreenCandidate — all elements, aliases, selectors.
 *  The agent observes the screen once, gets full context, decides on all items. */
export type ScreenGroupDecider = (group: ScreenGroupContext) => Effect.Effect<
  readonly { readonly workItemId: string; readonly status: 'completed' | 'skipped'; readonly rationale: string; readonly artifactsWritten?: readonly string[] }[]
>;

export const defaultWorkItemDecider: WorkItemDecider = (item) => Effect.succeed((() => {
  switch (item.kind) {
    case 'approve-proposal':
      return { status: 'completed', rationale: `Auto-approved: ${item.title}` };
    case 'investigate-hotspot':
      return item.evidence.confidence >= 0.5
        ? { status: 'completed', rationale: `Acknowledged hotspot: ${item.title}` }
        : { status: 'skipped', rationale: `Low-confidence (${item.evidence.confidence.toFixed(2)}): ${item.title}` };
    case 'interpret-step':
      return { status: 'skipped', rationale: `Agent interpretation needed: ${item.title}` };
    case 'author-knowledge':
      return { status: 'skipped', rationale: `Knowledge authoring needed: ${item.title}` };
    case 'validate-calibration':
      return { status: 'skipped', rationale: `Calibration validation needed: ${item.title}` };
    case 'request-rerun':
      return { status: 'skipped', rationale: `Rerun requested: ${item.title}` };
  }
})());

function liftToScreenGroupDecider(decider: WorkItemDecider): ScreenGroupDecider {
  return (group) => {
    const step = (
      remaining: readonly AgentWorkItem[],
      acc: readonly { workItemId: string; status: 'completed' | 'skipped'; rationale: string; artifactsWritten?: readonly string[] }[],
    ): Effect.Effect<readonly { workItemId: string; status: 'completed' | 'skipped'; rationale: string; artifactsWritten?: readonly string[] }[]> => {
      if (remaining.length === 0) return Effect.succeed(acc);
      const [item, ...rest] = remaining;
      return decider(item!).pipe(
        Effect.flatMap((decision) => {
          if (!decision) return Effect.succeed(acc);
          return step(rest, [...acc, { workItemId: item!.id, ...decision }]);
        }),
      );
    };
    return step(group.workItems, []).pipe(Effect.map((decisions) => [...decisions]));
  };
}

/** Process work items in screen-grouped batches with full resolution context.
 *  One screen observation, all decisions for that screen. Batch completions per group. */
export function processWorkItems(options: {
  readonly paths: ProjectPaths;
  readonly decider?: WorkItemDecider;
  readonly screenGroupDecider?: ScreenGroupDecider;
  readonly resolutionContext?: InterfaceResolutionContext | null;
  readonly maxItems?: number;
  readonly reEvaluate?: boolean;
  readonly onItemProcessed?: (item: AgentWorkItem, completion: WorkItemCompletion) => void;
  readonly onScreenGroupStart?: (group: ScreenGroupContext) => void;
}) {
  return Effect.gen(function* () {
    const workbench = yield* loadAgentWorkbench({ paths: options.paths });
    if (!workbench || workbench.items.length === 0) {
      return { processed: 0, completed: 0, skipped: 0, remaining: 0, completions: [], transitivelyResolved: 0 } satisfies ActLoopResult;
    }

    const maxItems = options.maxItems ?? 50;
    const sgDecider = options.screenGroupDecider ?? liftToScreenGroupDecider(options.decider ?? defaultWorkItemDecider);
    const groups = groupByScreenWithContext(workbench.items, options.resolutionContext);

    const processGroups = (
      remaining: readonly ScreenGroupContext[],
      acc: readonly WorkItemCompletion[],
      processedSoFar: number,
    ): Effect.Effect<readonly WorkItemCompletion[], unknown, FileSystem> =>
      Effect.gen(function* () {
        if (remaining.length === 0 || processedSoFar >= maxItems) return acc;
        const [group, ...rest] = remaining;
        const budgetedGroup: ScreenGroupContext = {
          ...group!,
          workItems: group!.workItems.slice(0, maxItems - processedSoFar),
        };
        if (options.onScreenGroupStart) options.onScreenGroupStart(budgetedGroup);

        const decisions = yield* sgDecider(budgetedGroup);
        const batchCompletions: readonly WorkItemCompletion[] = decisions.map((d) => ({
          workItemId: d.workItemId,
          status: d.status,
          completedAt: new Date().toISOString(),
          rationale: d.rationale,
          artifactsWritten: d.artifactsWritten ?? [],
        }));

        if (batchCompletions.length > 0) {
          yield* completeWorkItems({ paths: options.paths, completions: batchCompletions });
        }

        if (options.onItemProcessed) {
          batchCompletions.forEach((completion) => {
            const item = budgetedGroup.workItems.find((i) => i.id === completion.workItemId);
            if (item) options.onItemProcessed!(item, completion);
          });
        }

        return yield* processGroups(rest, [...acc, ...batchCompletions], processedSoFar + batchCompletions.length);
      });

    const allCompletions = yield* processGroups(groups, [], 0);
    const processed = allCompletions.length;

    let transitivelyResolved = 0;
    if (options.reEvaluate !== false && allCompletions.length > 0) {
      const postActWorkbench = yield* loadAgentWorkbench({ paths: options.paths });
      transitivelyResolved = Math.max(0, workbench.items.length - (postActWorkbench?.items.length ?? 0) - allCompletions.length);
    }

    return {
      processed,
      completed: allCompletions.filter((c) => c.status === 'completed').length,
      skipped: allCompletions.filter((c) => c.status === 'skipped').length,
      remaining: Math.max(0, workbench.items.length - processed - transitivelyResolved),
      completions: allCompletions,
      transitivelyResolved,
    } satisfies ActLoopResult;
  }).pipe(Effect.withSpan('process-work-items'));
}

// ─── Intervention Lineage ───

/** Emit intervention lineage artifact — records the feedback arc from
 *  work item completion back to the next iteration. Pure projection. */
export function emitInterventionLineage(options: {
  readonly paths: ProjectPaths;
  readonly iteration: number;
  readonly completions: readonly WorkItemCompletion[];
  readonly workItems: readonly AgentWorkItem[];
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const entries: InterventionLineageEntry[] = options.completions.map((completion) => {
      const item = options.workItems.find((w) => w.id === completion.workItemId);
      return {
        kind: 'intervention-lineage-entry' as const,
        iteration: options.iteration,
        proposalId: item?.context.proposalId ?? null,
        workItemId: completion.workItemId,
        completionStatus: completion.status,
        rerunPlanId: null,
        artifactsWritten: [...completion.artifactsWritten],
        timestamp: completion.completedAt,
      };
    });

    // Load existing lineage and append
    const lineagePath = `${options.paths.workbenchDir}/lineage.json`;
    const existing = yield* Effect.gen(function* () {
      const exists = yield* fs.exists(lineagePath);
      if (!exists) return [];
      const raw = yield* fs.readJson(lineagePath);
      const envelope = raw as InterventionLineageEnvelope;
      return envelope.kind === 'intervention-lineage' ? [...envelope.entries] : [];
    }).pipe(Effect.catchAll(() => Effect.succeed([] as InterventionLineageEntry[])));

    const envelope: InterventionLineageEnvelope = {
      kind: 'intervention-lineage',
      version: 1,
      entries: [...existing, ...entries],
    };
    yield* fs.ensureDir(options.paths.workbenchDir);
    yield* fs.writeJson(lineagePath, envelope);
    return envelope;
  }).pipe(Effect.withSpan('emit-intervention-lineage'));
}

// ─── Effect Projection ───

export function emitAgentWorkbench(options: {
  readonly paths: ProjectPaths;
  readonly catalog?: WorkspaceCatalog | undefined;
  readonly iteration?: number | undefined;
  readonly hotspots?: readonly WorkflowHotspot[] | undefined;
  readonly learningSignals?: import('../../domain/types').LearningSignalsSummary | undefined;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths, scope: 'post-run' }));
    const completions = yield* loadCompletions(options.paths);
    const allItems = buildAgentWorkItems(catalog, options.iteration ?? 0, options.hotspots, options.learningSignals);
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

    // Emit workbench-updated so the dashboard can refresh in real-time
    const dashboard = yield* Dashboard;
    yield* dashboard.emit(dashboardEvent('workbench-updated', projection));

    return projection;
  }).pipe(Effect.withSpan('emit-agent-workbench'));
}
