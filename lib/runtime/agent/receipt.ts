import { knowledgePaths } from '../../domain/ids';
import type { ResolutionReceipt } from '../../domain/types';
import { selectedDataset, selectedRunbook } from './select-controls';
import type { RuntimeAgentStageContext } from './types';
import { uniqueSorted } from './shared';

function baseReceiptFields(stage: RuntimeAgentStageContext) {
  const { task, context } = stage;
  const handshakes: import('../../domain/types').WorkflowStage[] = ['preparation', 'resolution'];
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
    knowledgeRefs: uniqueSorted(stage.knowledgeRefs),
    supplementRefs: uniqueSorted(stage.supplementRefs),
    controlRefs: stage.controlRefs,
    evidenceRefs: stage.evidenceRefs,
    observations: stage.observations,
    exhaustion: stage.exhaustion,
    handshakes,
    evidenceDrafts: [],
    proposalDrafts: [],
  };
}

export function needsHumanReceipt(stage: RuntimeAgentStageContext, overlayRefs: string[], translation: import('../../domain/types').TranslationReceipt | null): ResolutionReceipt {
  const base = baseReceiptFields(stage);
  return {
    ...base,
    kind: 'needs-human',
    governance: 'review-required',
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

export function explicitResolvedReceipt(stage: RuntimeAgentStageContext): ResolutionReceipt {
  const explicit = stage.task.explicitResolution;
  if (!explicit?.action || !explicit.screen) {
    throw new Error('explicitResolvedReceipt requires explicit action and screen');
  }
  return {
    ...baseReceiptFields(stage),
    kind: 'resolved',
    governance: 'approved',
    resolutionMode: 'deterministic',
    fingerprints: {
      ...baseReceiptFields(stage).fingerprints,
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
