/**
 * Scenario step-edge builders — carved out of
 * `product/domain/graph/derived-graph.ts` at Step 4a (round 2) per
 * `docs/v2-direction.md §6 Step 4a` and §3.7's named split.
 *
 * Each function is a pure `StepEdgeContext → readonly ConditionalEdge[]`
 * that turns a scenario step's trace, grounding, or binding into a
 * set of conditional edges wired to their referenced nodes.
 *
 * This pass extracts the 6 builders that depend only on shared
 * primitives. The 2 builders that also consume the derived-graph
 * `Lookups` object (`stepInstructionEdges` + `stepSupplementEdges`)
 * stay in derived-graph.ts.
 *
 * Pure domain — no Effect, no IO.
 */

import type { ScenarioInterpretationSurface } from '../../resolution/types';
import { graphIds } from '../../kernel/ids';
import { compileStepProgram, traceStepProgram } from '../../commitment/program';
import { explainBoundScenario } from '../../scenario/explanation';
import {
  type ConditionalEdge,
  conditionalEdge,
  createEdge,
} from './primitives';
import {
  mapKnowledgePathToNodeId,
  stepBinding,
  stepConfidence,
  type StepGraphContext,
} from './utilities';

/** Context threaded into every step-edge builder. */
export interface StepEdgeContext {
  readonly stepNodeId: string;
  readonly stepContext: StepGraphContext;
  readonly artifactPath: string;
  readonly explanation: ReturnType<typeof explainBoundScenario>['steps'][number] | undefined;
  readonly program: ReturnType<typeof compileStepProgram>;
  readonly trace: ReturnType<typeof traceStepProgram>;
  readonly taskStep: { readonly grounding?: { readonly targetRefs?: readonly string[] } } | null;
  readonly surface: ScenarioInterpretationSurface | null;
}

/** `step → screen` edges for every screen the step's trace touches. */
export function stepScreenEdges(ctx: StepEdgeContext): readonly ConditionalEdge[] {
  return ctx.trace.screens.map((screenId) => {
    const screenNodeId = graphIds.screen(screenId);
    return conditionalEdge(
      createEdge({
        kind: 'references',
        from: ctx.stepNodeId,
        to: screenNodeId,
        provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
      }),
      screenNodeId,
    );
  });
}

/** `step → target` edges driven by the task-step's grounding + the
 *  interpretation surface's declared screen refs. Each grounding
 *  targetRef emits one `uses` edge to the canonical `target:` node;
 *  v2 drops v1's parallel legacy screen/element/surface edges. */
export function stepTaskGroundingEdges(ctx: StepEdgeContext): readonly ConditionalEdge[] {
  if (!ctx.taskStep) return [];

  const taskScreenEdges = (ctx.surface?.payload.knowledgeSlice.screenRefs ?? [])
    .map((screenId) => {
      const screenNodeId = graphIds.screen(screenId);
      return conditionalEdge(
        createEdge({
          kind: 'references',
          from: ctx.stepNodeId,
          to: screenNodeId,
          provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
          payload: { source: 'task-packet-screen' },
        }),
        screenNodeId,
      );
    });

  const groundingEdges = (ctx.taskStep.grounding?.targetRefs ?? []).map((targetRef) => {
    const targetNodeId = graphIds.target(targetRef);
    return conditionalEdge(
      createEdge({
        kind: 'uses',
        from: ctx.stepNodeId,
        to: targetNodeId,
        provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
        payload: { source: 'task-grounding' },
      }),
      targetNodeId,
    );
  });

  return [...taskScreenEdges, ...groundingEdges];
}

/** `step → snapshot` edges for every snapshot template the step
 *  asserts on. */
export function stepSnapshotEdges(ctx: StepEdgeContext): readonly ConditionalEdge[] {
  return ctx.trace.snapshotTemplates.map((template) => {
    const snapshotNodeId = graphIds.snapshot.knowledge(template);
    return conditionalEdge(
      createEdge({
        kind: 'asserts',
        from: ctx.stepNodeId,
        to: snapshotNodeId,
        provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
      }),
      snapshotNodeId,
    );
  });
}

/** `step → knowledge artifact` edges resolved from the step's
 *  binding's `knowledgeRefs`. */
export function stepKnowledgeRefEdges(ctx: StepEdgeContext): readonly ConditionalEdge[] {
  const binding = stepBinding(ctx.stepContext);
  return (binding?.knowledgeRefs ?? [])
    .flatMap((ref) => {
      const targetNodeId = mapKnowledgePathToNodeId(ref, ctx.stepContext);
      return targetNodeId !== null ? [{ ref, targetNodeId }] : [];
    })
    .map(({ ref, targetNodeId }) =>
      conditionalEdge(
        createEdge({
          kind: 'references',
          from: ctx.stepNodeId,
          to: targetNodeId,
          provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
          payload: { source: 'knowledge-ref', ref },
        }),
        targetNodeId,
      ),
    );
}

/** `step → evidence` edges for every evidence ID attached to the
 *  step's binding. */
export function stepEvidenceRefEdges(ctx: StepEdgeContext): readonly ConditionalEdge[] {
  const binding = stepBinding(ctx.stepContext);
  return (binding?.evidenceIds ?? [])
    .map((evidenceId) => graphIds.evidence(evidenceId))
    .map((evidenceNodeId) =>
      conditionalEdge(
        createEdge({
          kind: 'references',
          from: ctx.stepNodeId,
          to: evidenceNodeId,
          provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
          payload: { source: 'evidence-ref' },
        }),
        evidenceNodeId,
      ),
    );
}

/** `step → overlay` edges for every confidence-overlay ref the
 *  scenario explanation attaches. */
export function stepOverlayRefEdges(ctx: StepEdgeContext): readonly ConditionalEdge[] {
  return (ctx.explanation?.overlayRefs ?? [])
    .map((overlayRef) => graphIds.confidenceOverlay(overlayRef))
    .map((overlayNodeId) =>
      conditionalEdge(
        createEdge({
          kind: 'references',
          from: ctx.stepNodeId,
          to: overlayNodeId,
          provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
          payload: { source: 'approved-equivalent-overlay' },
        }),
        overlayNodeId,
      ),
    );
}
