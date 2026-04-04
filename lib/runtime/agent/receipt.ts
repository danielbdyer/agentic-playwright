import { knowledgePaths } from '../../domain/kernel/ids';
import type { ResolutionTarget, StepWinningSource, WorkflowStage } from '../../domain/governance/workflow-types';
import type { ResolutionReceipt, TranslationReceipt } from '../../domain/resolution/types';
import { buildReasonChain } from '../../domain/resolution/reason-chain';
import { mintApproved, mintReviewRequired } from '../../domain/governance/workflow-types';
import { selectedDataset, selectedRunbook } from './resolution/select-controls';
import type { RuntimeAgentStageContext, StageEffects } from './types';
import { uniqueSorted } from './shared';
import { TesseractError } from '../../domain/kernel/errors';

function baseReceiptFields(stage: RuntimeAgentStageContext, pendingEffects?: StageEffects, winningSource?: StepWinningSource) {
  const { task, context } = stage;
  const handshakes: WorkflowStage[] = ['preparation', 'resolution'];
  const exhaustion = [...stage.exhaustion, ...(pendingEffects?.exhaustion ?? [])];
  const observations = [...stage.observations, ...(pendingEffects?.observations ?? [])];
  const knowledgeRefs = uniqueSorted([...stage.knowledgeRefs, ...(pendingEffects?.knowledgeRefs ?? [])]);
  const supplementRefs = uniqueSorted([...stage.supplementRefs, ...(pendingEffects?.supplementRefs ?? [])]);
  const reasonChain = buildReasonChain(exhaustion, winningSource ?? 'none');
  return {
    version: 1 as const,
    stage: 'resolution' as const,
    scope: 'step' as const,
    ids: {
      adoId: null,
      suite: null,
      runId: null,
      stepIndex: task.index,
      dataset: selectedDataset(task, context)?.name ?? null,
      runbook: selectedRunbook(task, context)?.name ?? null,
      resolutionControl: context.controlSelection?.resolutionControl ?? selectedRunbook(task, context)?.resolutionControl ?? null,
    },
    fingerprints: {
      artifact: task.taskFingerprint,
      knowledge: context.resolutionContext.knowledgeFingerprint,
      task: task.taskFingerprint,
      controls: context.resolutionContext.confidenceFingerprint ?? null,
      content: null,
      run: null,
    },
    lineage: {
      sources: uniqueSorted(stage.memoryLineage.map((entry) => `memory:${entry}`)),
      parents: [task.taskFingerprint],
      handshakes,
    },
    taskFingerprint: task.taskFingerprint,
    knowledgeFingerprint: context.resolutionContext.knowledgeFingerprint,
    provider: context.provider,
    mode: context.mode,
    runAt: context.runAt,
    stepIndex: task.index,
    knowledgeRefs,
    supplementRefs,
    controlRefs: stage.controlRefs,
    evidenceRefs: stage.evidenceRefs,
    observations,
    exhaustion,
    reasonChain,
    handshakes,
    evidenceDrafts: [],
    proposalDrafts: [],
  };
}

export function agentInterpretedReceipt(
  stage: RuntimeAgentStageContext,
  target: ResolutionTarget,
  rationale: string,
  overlayRefs: string[],
  translation: TranslationReceipt | null,
  pendingEffects?: StageEffects,
): ResolutionReceipt {
  const base = baseReceiptFields(stage, pendingEffects, 'agent-interpreted');
  return {
    ...base,
    kind: 'agent-interpreted',
    governance: mintReviewRequired(),
    resolutionMode: 'agentic',
    overlayRefs: uniqueSorted(overlayRefs),
    winningConcern: 'resolution',
    winningSource: 'agent-interpreted',
    translation,
    confidence: 'agent-proposed',
    provenanceKind: 'agent-interpreted',
    target,
    rationale,
  };
}

export function needsHumanReceipt(stage: RuntimeAgentStageContext, overlayRefs: string[], translation: TranslationReceipt | null, pendingEffects?: StageEffects): ResolutionReceipt {
  const base = baseReceiptFields(stage, pendingEffects, 'none');
  return {
    ...base,
    kind: 'needs-human',
    governance: mintReviewRequired(),
    resolutionMode: 'agentic',
    overlayRefs: uniqueSorted(overlayRefs),
    winningConcern: 'resolution',
    winningSource: 'none',
    translation,
    confidence: 'unbound',
    provenanceKind: 'unresolved',
    reason: 'No safe executable interpretation remained after exhausting explicit constraints, approved knowledge, prior evidence, live DOM exploration, and degraded resolution.',
  };
}

export function explicitResolvedReceipt(stage: RuntimeAgentStageContext, pendingEffects?: StageEffects): ResolutionReceipt {
  const explicit = stage.task.explicitResolution;
  if (!explicit?.action || !explicit.screen) {
    throw new TesseractError('missing-required', 'explicitResolvedReceipt requires explicit action and screen');
  }
  const explicitBase = baseReceiptFields(stage, pendingEffects, 'scenario-explicit');
  return {
    ...explicitBase,
    kind: 'resolved',
    governance: mintApproved(),
    resolutionMode: 'deterministic',
    fingerprints: {
      ...explicitBase.fingerprints,
      controls: null,
    },
    knowledgeRefs: [knowledgePaths.surface(explicit.screen), knowledgePaths.elements(explicit.screen)],
    supplementRefs: [],
    overlayRefs: [],
    winningConcern: 'intent',
    winningSource: 'scenario-explicit',
    translation: null,
    confidence: 'compiler-derived',
    provenanceKind: 'explicit',
    target: {
      action: explicit.action,
      screen: explicit.screen,
      element: explicit.element ?? null,
      posture: explicit.posture ?? null,
      override: explicit.override ?? null,
      snapshot_template: explicit.snapshot_template ?? null,
      semanticDestination: explicit.action === 'navigate' ? stage.task.normalizedIntent : null,
      routeVariantRef: null,
      routeState: explicit.route_state ?? null,
    },
  };
}
