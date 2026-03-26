/**
 * Agent Workbench — projection from iteration data to structured work items.
 *
 * Parallel to the operator inbox (inbox.ts), but designed for machine consumption.
 * Each builder is a pure function; the projection is disposable and regenerated
 * per iteration.
 *
 * Work items are prioritized using the ScoringRule semigroup from learning-shared.ts,
 * with weights for urgency, impact, confidence, and kind. Occurrence count and
 * blocking status drive aggressive differentiation so the top item is clearly
 * the most valuable action.
 *
 * Completion tracking: when an agent acts on a work item, it calls
 * completeWorkItem() which persists a WorkItemCompletion to the workbench.
 * The next projection filters completed items so they don't reappear.
 */

import { Effect } from 'effect';
import { sha256 } from '../domain/hash';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from './catalog';
import { buildWorkflowHotspots } from './hotspots';
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
        adoId: bundle.artifact.adoId as import('../domain/identity').AdoId,
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
    record.artifact.steps
      .filter((step) => step.interpretation.kind === 'needs-human')
      .map((step): AgentWorkItem => {
        const target = (step.interpretation as { target?: { screen?: string; element?: string; action?: string } }).target;
        const reason = (step.interpretation as { reason?: string }).reason ?? 'unresolved';
        return {
          id: workItemId('interpret-step', record.artifact.adoId, String(step.stepIndex)),
          kind: 'interpret-step',
          priority: scoreWorkItem('interpret-step', 0.6, 1, true),
          title: `Step ${step.stepIndex}: ${reason.slice(0, 80)}`,
          rationale: `This step exhausted all deterministic resolution rungs. The agent should interpret the step text and determine the correct screen, element, and action.`,
          adoId: record.artifact.adoId as import('../domain/identity').AdoId,
          iteration,
          actions: [{
            kind: 'inspect',
            target: makeTarget('step', `${record.artifact.adoId}:${step.stepIndex}`, `Inspect step ${step.stepIndex}`),
            params: { adoId: record.artifact.adoId, stepIndex: step.stepIndex, runId: record.artifact.runId },
          }, {
            kind: 'author',
            target: makeTarget('knowledge', target?.screen ? `knowledge/screens/${target.screen}.hints.yaml` : 'knowledge/screens/', `Author hint for step ${step.stepIndex}`),
            params: { screen: target?.screen, element: target?.element },
          }],
          context: {
            stepIndex: step.stepIndex,
            screen: target?.screen,
            element: target?.element,
            exhaustionTrail: (step.interpretation as { exhaustion?: ReadonlyArray<{ stage: string; outcome: string; reason: string }> }).exhaustion?.map((e) => ({
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
        };
      }),
  );
}

function hotspotWorkItems(catalog: WorkspaceCatalog, iteration: number): readonly AgentWorkItem[] {
  const hotspots = buildWorkflowHotspots(
    catalog.runRecords.map((e) => e.artifact),
    catalog.interpretationDriftRecords.map((e) => e.artifact),
    catalog.resolutionGraphRecords.map((e) => e.artifact),
  );
  return hotspots
    .filter((h) => h.occurrenceCount >= 2)
    .map((hotspot): AgentWorkItem => {
      // Generate concrete action: which file to edit and what to add
      const primaryTarget = hotspot.suggestions[0]?.target ?? `knowledge/screens/${hotspot.screen}.hints.yaml`;
      const field = hotspot.family.field;
      const screen = hotspot.screen;

      return {
        id: workItemId('investigate-hotspot', hotspot.id),
        kind: 'investigate-hotspot',
        // Key fix: occurrence count drives differentiation
        priority: scoreWorkItem('investigate-hotspot', Math.min(1, hotspot.occurrenceCount / 5), hotspot.occurrenceCount, false),
        title: `${hotspot.kind}: ${screen}/${field} (${hotspot.occurrenceCount}x)`,
        rationale: `This ${hotspot.kind} pattern occurred ${hotspot.occurrenceCount} times. ${hotspot.suggestions.map((s) => s.reason).join(' ')}`,
        adoId: null,
        iteration,
        actions: [{
          kind: 'author',
          target: makeTarget('knowledge', primaryTarget, `Add deterministic knowledge for ${screen}/${field}`),
          params: {
            targetPath: primaryTarget,
            screen,
            element: field,
            occurrenceCount: hotspot.occurrenceCount,
            // Concrete: what winning sources were involved
            winningSources: [...new Set(hotspot.samples.map((s) => s.winningSource))],
          },
        }],
        context: {
          screen,
          element: field,
          artifactRefs: hotspot.suggestions.map((s) => s.target),
        },
        evidence: {
          confidence: Math.min(1, hotspot.occurrenceCount / 5),
          sources: hotspot.samples.slice(0, 5).map((s) => `${s.adoId}:${s.runId}:${s.stepIndex}`),
        },
        linkedProposals: [],
        linkedHotspots: [hotspot.id],
        linkedBottlenecks: [],
      };
    });
}

// ─── Composition: pure builders → sorted work items ───

export function buildAgentWorkItems(catalog: WorkspaceCatalog, iteration: number): readonly AgentWorkItem[] {
  return [
    ...proposalWorkItems(catalog, iteration),
    ...needsHumanWorkItems(catalog, iteration),
    ...hotspotWorkItems(catalog, iteration),
  ].sort((a, b) => b.priority - a.priority);
}

function summarizeWorkItems(
  items: readonly AgentWorkItem[],
  completions: readonly WorkItemCompletion[],
): AgentWorkbenchProjection['summary'] {
  const completedIds = new Set(completions.map((c) => c.workItemId));
  const pending = items.filter((item) => !completedIds.has(item.id));
  const byKind = items.reduce<Record<WorkItemKind, number>>(
    (acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] ?? 0) + 1 }),
    { 'interpret-step': 0, 'approve-proposal': 0, 'author-knowledge': 0, 'investigate-hotspot': 0, 'validate-calibration': 0, 'request-rerun': 0 },
  );
  return {
    total: items.length,
    pending: pending.length,
    completed: completions.length,
    byKind,
    topPriority: pending[0] ?? null,
  };
}

// ─── Completion Tracking ───

function loadCompletions(fs: import('./ports').FileSystemPort, paths: ProjectPaths): Effect.Effect<readonly WorkItemCompletion[], unknown, never> {
  return Effect.gen(function* () {
    const completionsPath = `${paths.workbenchDir}/completions.json`;
    const exists = yield* fs.exists(completionsPath);
    if (!exists) return [];
    const raw = yield* fs.readJson(completionsPath);
    return (Array.isArray(raw) ? raw : []) as readonly WorkItemCompletion[];
  }).pipe(Effect.catchAll(() => Effect.succeed([] as readonly WorkItemCompletion[])));
}

export function completeWorkItem(options: {
  readonly paths: ProjectPaths;
  readonly completion: WorkItemCompletion;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const existing = yield* loadCompletions(fs, options.paths);
    const updated = [...existing, options.completion];
    yield* fs.ensureDir(options.paths.workbenchDir);
    yield* fs.writeJson(`${options.paths.workbenchDir}/completions.json`, updated);
    return updated;
  });
}

// ─── Effect Projection ───

export function emitAgentWorkbench(options: {
  readonly paths: ProjectPaths;
  readonly catalog?: WorkspaceCatalog | undefined;
  readonly iteration?: number | undefined;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths, scope: 'post-run' }));
    const completions = yield* loadCompletions(fs, options.paths);
    const completedIds = new Set(completions.map((c) => c.workItemId));
    const allItems = buildAgentWorkItems(catalog, options.iteration ?? 0);
    // Filter out completed items so the workbench only shows pending work
    const pendingItems = allItems.filter((item) => !completedIds.has(item.id));
    const projection: AgentWorkbenchProjection = {
      kind: 'agent-workbench',
      version: 1,
      generatedAt: new Date().toISOString(),
      iteration: options.iteration ?? 0,
      items: pendingItems,
      completions,
      summary: summarizeWorkItems(allItems, completions),
    };
    yield* fs.ensureDir(options.paths.workbenchDir);
    yield* fs.writeJson(options.paths.workbenchIndexPath, projection);
    return projection;
  });
}
