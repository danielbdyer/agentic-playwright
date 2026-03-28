import { knowledgePaths } from '../../domain/ids';
import type { ResolutionReceipt } from '../../domain/types';
import { mintApproved, mintReviewRequired } from '../../domain/types/workflow';
import { selectedDataset, selectedRunbook } from './select-controls';
import type { RuntimeAgentStageContext, StageEffects } from './types';
import { uniqueSorted } from './shared';

function baseReceiptFields(stage: RuntimeAgentStageContext, pendingEffects?: StageEffects) {
  const { task, context } = stage;
  const handshakes: import('../../domain/types').WorkflowStage[] = ['preparation', 'resolution'];
  const exhaustion = [...stage.exhaustion, ...(pendingEffects?.exhaustion ?? [])];
  const observations = [...stage.observations, ...(pendingEffects?.observations ?? [])];
  const knowledgeRefs = uniqueSorted([...stage.knowledgeRefs, ...(pendingEffects?.knowledgeRefs ?? [])]);
  const supplementRefs = uniqueSorted([...stage.supplementRefs, ...(pendingEffects?.supplementRefs ?? [])]);
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
    handshakes,
    evidenceDrafts: [],
    proposalDrafts: [],
  };
}

export function agentInterpretedReceipt(
  stage: RuntimeAgentStageContext,
  target: import('../../domain/types').ResolutionTarget,
  rationale: string,
  overlayRefs: string[],
  translation: import('../../domain/types').TranslationReceipt | null,
  pendingEffects?: StageEffects,
): ResolutionReceipt {
  const base = baseReceiptFields(stage, pendingEffects);
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

export function needsHumanReceipt(stage: RuntimeAgentStageContext, overlayRefs: string[], translation: import('../../domain/types').TranslationReceipt | null, pendingEffects?: StageEffects): ResolutionReceipt {
  const base = baseReceiptFields(stage, pendingEffects);
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
    throw new Error('explicitResolvedReceipt requires explicit action and screen');
  }
  return {
    ...baseReceiptFields(stage, pendingEffects),
    kind: 'resolved',
    governance: mintApproved(),
    resolutionMode: 'deterministic',
    fingerprints: {
      ...baseReceiptFields(stage, pendingEffects).fingerprints,
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
    },
  };
}
