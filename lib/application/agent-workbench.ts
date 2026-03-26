/**
 * Agent Workbench — projection from iteration data to structured work items.
 *
 * Parallel to the operator inbox (inbox.ts), but designed for machine consumption.
 * Each builder is a pure function; the projection is disposable and regenerated
 * per iteration.
 *
 * Work items are prioritized using the ScoringRule semigroup from learning-shared.ts,
 * with weights for urgency, impact, confidence, and kind.
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
  type ScoringRule,
} from './learning-shared';
import type {
  AgentWorkItem,
  AgentWorkbenchProjection,
  WorkItemKind,
} from '../domain/types';
import type { InterventionTarget } from '../domain/types';

// ─── Work Item Scoring (Composite ScoringRule semigroup) ───

interface WorkItemContext {
  readonly kind: WorkItemKind;
  readonly confidence: number;
  readonly affectedScenarios: number;
  readonly isBlocking: boolean;
}

const KIND_WEIGHTS: Readonly<Record<WorkItemKind, number>> = {
  'interpret-step': 0.9,
  'approve-proposal': 0.8,
  'request-rerun': 0.7,
  'author-knowledge': 0.6,
  'investigate-hotspot': 0.4,
  'validate-calibration': 0.3,
};

const urgencyRule: ScoringRule<WorkItemContext> = { score: (ctx) => ctx.isBlocking ? 1.0 : 0.5 };
const impactRule: ScoringRule<WorkItemContext> = { score: (ctx) => Math.min(ctx.affectedScenarios / 10, 1) };
const confidenceRule: ScoringRule<WorkItemContext> = { score: (ctx) => ctx.confidence };
const kindRule: ScoringRule<WorkItemContext> = { score: (ctx) => KIND_WEIGHTS[ctx.kind] ?? 0.5 };

const workItemScoring = combineScoringRules<WorkItemContext>(
  weightedScoringRule(0.30, urgencyRule),
  weightedScoringRule(0.25, impactRule),
  weightedScoringRule(0.25, confidenceRule),
  weightedScoringRule(0.20, kindRule),
);

function scoreWorkItem(kind: WorkItemKind, confidence: number, affectedScenarios: number, isBlocking: boolean): number {
  return Number(workItemScoring.score({ kind, confidence, affectedScenarios, isBlocking }).toFixed(4));
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
        rationale: `Pending proposal for ${proposal.artifactType} at ${proposal.targetPath}`,
        adoId: bundle.artifact.adoId as import('../domain/identity').AdoId,
        iteration,
        actions: [{
          kind: 'approve',
          target: makeTarget('proposal', proposal.proposalId ?? '', proposal.title),
          params: { proposalId: proposal.proposalId },
        }, {
          kind: 'inspect',
          target: makeTarget('artifact', proposal.targetPath, `Inspect ${proposal.targetPath}`),
          params: { artifactPath: proposal.targetPath },
        }],
        context: {
          proposalId: proposal.proposalId ?? undefined,
          screen: proposal.targetPath.split('/').find((seg) => seg.endsWith('.hints.yaml'))?.replace('.hints.yaml', ''),
          artifactRefs: [bundle.artifactPath],
        },
        evidence: {
          confidence: 0.8,
          sources: proposal.evidenceIds,
        },
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
      .map((step): AgentWorkItem => ({
        id: workItemId('interpret-step', record.artifact.adoId, String(step.stepIndex)),
        kind: 'interpret-step',
        priority: scoreWorkItem('interpret-step', 0.6, 1, true),
        title: `Interpret step ${step.stepIndex}: "${(step.interpretation as { reason?: string }).reason ?? 'unresolved'}"`,
        rationale: 'Step exhausted all deterministic rungs and needs agent interpretation.',
        adoId: record.artifact.adoId as import('../domain/identity').AdoId,
        iteration,
        actions: [{
          kind: 'inspect',
          target: makeTarget('step', `${record.artifact.adoId}:${step.stepIndex}`, `Step ${step.stepIndex}`),
          params: { adoId: record.artifact.adoId, stepIndex: step.stepIndex, runId: record.artifact.runId },
        }],
        context: {
          stepIndex: step.stepIndex,
          exhaustionTrail: (step.interpretation as { exhaustion?: ReadonlyArray<{ stage: string; outcome: string; reason: string }> }).exhaustion?.map((e) => ({
            stage: e.stage,
            outcome: e.outcome,
            reason: e.reason,
          })),
          artifactRefs: [record.artifactPath],
        },
        evidence: {
          confidence: 0,
          sources: [],
        },
        linkedProposals: [],
        linkedHotspots: [],
        linkedBottlenecks: [],
      })),
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
    .map((hotspot): AgentWorkItem => ({
      id: workItemId('investigate-hotspot', hotspot.id),
      kind: 'investigate-hotspot',
      priority: scoreWorkItem('investigate-hotspot', 0.5, hotspot.occurrenceCount, false),
      title: `${hotspot.kind}: ${hotspot.screen} / ${hotspot.family.field} (${hotspot.occurrenceCount}x)`,
      rationale: hotspot.suggestions.map((s) => s.reason).join('; '),
      adoId: null,
      iteration,
      actions: hotspot.suggestions.map((suggestion) => ({
        kind: 'author' as const,
        target: makeTarget('knowledge', suggestion.target, suggestion.reason),
        params: { targetPath: suggestion.target },
      })),
      context: {
        screen: hotspot.screen,
        element: hotspot.family.field,
        artifactRefs: hotspot.suggestions.map((s) => s.target),
      },
      evidence: {
        confidence: Math.min(1, hotspot.occurrenceCount / 5),
        sources: hotspot.samples.map((s) => `${s.adoId}:${s.runId}:${s.stepIndex}`),
      },
      linkedProposals: [],
      linkedHotspots: [hotspot.id],
      linkedBottlenecks: [],
    }));
}

// ─── Composition: pure builders → sorted work items ───

function buildAgentWorkItems(catalog: WorkspaceCatalog, iteration: number): readonly AgentWorkItem[] {
  return [
    ...proposalWorkItems(catalog, iteration),
    ...needsHumanWorkItems(catalog, iteration),
    ...hotspotWorkItems(catalog, iteration),
  ].sort((a, b) => b.priority - a.priority);
}

function summarizeWorkItems(items: readonly AgentWorkItem[]): AgentWorkbenchProjection['summary'] {
  const byKind = items.reduce<Record<WorkItemKind, number>>(
    (acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] ?? 0) + 1 }),
    { 'interpret-step': 0, 'approve-proposal': 0, 'author-knowledge': 0, 'investigate-hotspot': 0, 'validate-calibration': 0, 'request-rerun': 0 },
  );
  return {
    total: items.length,
    byKind,
    topPriority: items[0] ?? null,
  };
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
    const items = buildAgentWorkItems(catalog, options.iteration ?? 0);
    const projection: AgentWorkbenchProjection = {
      kind: 'agent-workbench',
      version: 1,
      generatedAt: new Date().toISOString(),
      iteration: options.iteration ?? 0,
      items,
      summary: summarizeWorkItems(items),
    };
    yield* fs.ensureDir(options.paths.workbenchDir);
    yield* fs.writeJson(options.paths.workbenchIndexPath, projection);
    return projection;
  });
}
