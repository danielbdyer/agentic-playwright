import type { ObservedStateSession, ResolutionReceipt, GroundedStep } from '../../domain/types';
import { resolutionPrecedenceLaw } from '../../domain/precedence';
import { selectedControlRefs, selectedControlResolution } from './select-controls';
import { uniqueSorted } from './shared';
import type { ResolutionStrategy } from './strategy';
import { runStrategyChain } from './strategy';
import type { RuntimeAgentStageContext, RuntimeStepAgentContext } from './types';
import {
  tryExplicitResolution,
  buildLatticeAccumulator,
  tryApprovedKnowledgeResolution,
  tryOverlayResolution,
  tryTranslationResolution,
  tryLiveDomOrFallback,
} from './resolution-stages';

export const RESOLUTION_PRECEDENCE = resolutionPrecedenceLaw;

const MEMORY_MAX_ACTIVE_REFS = 8;
const MEMORY_MAX_RECENT_ASSERTIONS = 8;
const MEMORY_STALENESS_TTL_STEPS = 5;
const MEMORY_SCREEN_CONFIDENCE_FLOOR = 0.35;

function createEmptyObservedStateSession(): ObservedStateSession {
  return {
    currentScreen: null,
    activeStateRefs: [],
    lastObservedTransitionRefs: [],
    activeRouteVariantRefs: [],
    activeTargetRefs: [],
    lastSuccessfulLocatorRung: null,
    recentAssertions: [],
    lineage: [],
  };
}

function normalizeObservedStateSession(task: GroundedStep, memory: ObservedStateSession): ObservedStateSession {
  const screenStale = memory.currentScreen !== null && task.index - memory.currentScreen.observedAtStep > MEMORY_STALENESS_TTL_STEPS;
  const screenLowConfidence = memory.currentScreen !== null && memory.currentScreen.confidence < MEMORY_SCREEN_CONFIDENCE_FLOOR;
  const currentScreen = screenStale || screenLowConfidence ? null : memory.currentScreen;
  const clearStateRefs = screenLowConfidence || task.actionText.toLowerCase().includes('navigate');

  return {
    currentScreen,
    activeStateRefs: clearStateRefs ? [] : uniqueSorted(memory.activeStateRefs).slice(0, MEMORY_MAX_ACTIVE_REFS),
    lastObservedTransitionRefs: clearStateRefs ? [] : uniqueSorted(memory.lastObservedTransitionRefs).slice(0, MEMORY_MAX_ACTIVE_REFS),
    activeRouteVariantRefs: uniqueSorted(memory.activeRouteVariantRefs).slice(0, MEMORY_MAX_ACTIVE_REFS),
    activeTargetRefs: uniqueSorted(memory.activeTargetRefs).slice(0, MEMORY_MAX_ACTIVE_REFS),
    lastSuccessfulLocatorRung: memory.lastSuccessfulLocatorRung,
    recentAssertions: memory.recentAssertions
      .filter((entry) => Number.isFinite(entry.observedAtStep) && task.index - entry.observedAtStep <= MEMORY_STALENESS_TTL_STEPS)
      .slice(-MEMORY_MAX_RECENT_ASSERTIONS),
    lineage: memory.lineage.slice(-32),
  };
}

function resolvedTargetRef(stage: RuntimeAgentStageContext, receipt: ResolutionReceipt) {
  if (receipt.kind === 'needs-human' || !receipt.target.element) {
    return null;
  }
  const screen = stage.context.resolutionContext.screens.find((entry) => entry.screen === receipt.target.screen);
  return screen?.elements.find((entry) => entry.element === receipt.target.element)?.targetRef ?? null;
}

function routeVariantRefsForReceipt(stage: RuntimeAgentStageContext, receipt: ResolutionReceipt): string[] {
  if (receipt.kind === 'needs-human') {
    return stage.task.grounding.routeVariantRefs;
  }
  const screen = stage.context.resolutionContext.screens.find((entry) => entry.screen === receipt.target.screen);
  return screen?.routeVariantRefs.length ? screen.routeVariantRefs : stage.task.grounding.routeVariantRefs;
}

function deriveObservedStateSessionAfterResolution(stage: RuntimeAgentStageContext, receipt: ResolutionReceipt): ObservedStateSession {
  if (receipt.kind === 'needs-human') {
    return stage.memory;
  }

  const confidenceScore = receipt.confidence === 'compiler-derived' ? 1 : receipt.confidence === 'agent-verified' ? 0.8 : 0.65;
  const targetRef = resolvedTargetRef(stage, receipt);
  const lineage = uniqueSorted([
    ...stage.memory.lineage,
    `step:${stage.task.index}`,
    `screen:${receipt.target.screen}`,
    `source:${receipt.winningSource}`,
    `confidence:${receipt.confidence}`,
  ]).slice(-32);

  return {
    currentScreen: {
      screen: receipt.target.screen,
      confidence: confidenceScore,
      observedAtStep: stage.task.index,
    },
    activeStateRefs: stage.memory.activeStateRefs,
    lastObservedTransitionRefs: stage.memory.lastObservedTransitionRefs,
    activeRouteVariantRefs: uniqueSorted([
      ...stage.memory.activeRouteVariantRefs,
      ...routeVariantRefsForReceipt(stage, receipt),
    ]).slice(0, MEMORY_MAX_ACTIVE_REFS),
    activeTargetRefs: targetRef
      ? uniqueSorted([...stage.memory.activeTargetRefs, targetRef]).slice(0, MEMORY_MAX_ACTIVE_REFS)
      : stage.memory.activeTargetRefs,
    lastSuccessfulLocatorRung: receipt.winningSource === 'live-dom' ? 0 : stage.memory.lastSuccessfulLocatorRung,
    recentAssertions: receipt.target.action === 'assert-snapshot'
      ? [
          ...stage.memory.recentAssertions,
          { summary: `${receipt.target.screen}:${receipt.target.snapshot_template ?? 'default'}`, observedAtStep: stage.task.index },
        ]
          .filter((entry) => stage.task.index - entry.observedAtStep <= MEMORY_STALENESS_TTL_STEPS)
          .slice(-MEMORY_MAX_RECENT_ASSERTIONS)
      : stage.memory.recentAssertions,
    lineage,
  };
}

const resolutionStrategies: readonly ResolutionStrategy[] = [
  {
    name: 'explicit-resolution',
    rungs: ['explicit', 'control'],
    requiresAccumulator: false,
    attempt: async (stage) => tryExplicitResolution(stage),
  },
  {
    name: 'approved-knowledge',
    rungs: ['approved-screen-knowledge', 'shared-patterns', 'prior-evidence'],
    requiresAccumulator: true,
    attempt: async (stage, acc) => tryApprovedKnowledgeResolution(stage, acc!),
  },
  {
    name: 'confidence-overlay',
    rungs: ['approved-equivalent-overlay'],
    requiresAccumulator: true,
    attempt: async (stage, acc) => tryOverlayResolution(stage, acc!),
  },
  {
    name: 'structured-translation',
    rungs: ['structured-translation'],
    requiresAccumulator: true,
    attempt: async (stage, acc) => tryTranslationResolution(stage, acc!),
  },
  {
    name: 'live-dom-fallback',
    rungs: ['live-dom', 'needs-human'],
    requiresAccumulator: true,
    attempt: async (stage, acc) => tryLiveDomOrFallback(stage, acc!),
  },
];

export async function runResolutionPipeline(task: GroundedStep, context: RuntimeStepAgentContext): Promise<ResolutionReceipt> {
  const memory = normalizeObservedStateSession(task, context.observedStateSession ?? createEmptyObservedStateSession());
  context.observedStateSession = memory;

  const stage: RuntimeAgentStageContext = {
    task,
    context,
    memory,
    controlResolution: selectedControlResolution(task, context),
    controlRefs: selectedControlRefs(task, context),
    evidenceRefs: uniqueSorted(context.resolutionContext.evidenceRefs),
    exhaustion: [],
    observations: [],
    knowledgeRefs: [],
    supplementRefs: [],
    memoryLineage: memory.lineage,
  };

  const applyMemory = (receipt: ResolutionReceipt): ResolutionReceipt => {
    const updated = deriveObservedStateSessionAfterResolution(stage, receipt);
    context.observedStateSession = updated;
    stage.memoryLineage = updated.lineage;
    return receipt;
  };

  const preAccumulatorStrategies = resolutionStrategies.filter((s) => !s.requiresAccumulator);
  const postAccumulatorStrategies = resolutionStrategies.filter((s) => s.requiresAccumulator);

  const earlyResult = await runStrategyChain(preAccumulatorStrategies, stage, null);
  if (earlyResult) {
    return applyMemory(earlyResult);
  }

  const acc = buildLatticeAccumulator(stage);

  const result = await runStrategyChain(postAccumulatorStrategies, stage, acc);
  if (result) {
    return applyMemory(result);
  }

  return applyMemory(await tryLiveDomOrFallback(stage, acc));
}

export type { RuntimeStepAgentContext } from './types';
