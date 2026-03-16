import type { ObservedStateSession, ResolutionCandidateSummary, ResolutionReceipt, GroundedStep } from '../../domain/types';
import { resolutionPrecedenceLaw } from '../../domain/precedence';
import { selectedControlRefs, selectedControlResolution } from './select-controls';
import { uniqueSorted } from './shared';
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
  const next: ObservedStateSession = {
    currentScreen: memory.currentScreen,
    activeStateRefs: uniqueSorted(memory.activeStateRefs).slice(0, MEMORY_MAX_ACTIVE_REFS),
    lastObservedTransitionRefs: uniqueSorted(memory.lastObservedTransitionRefs).slice(0, MEMORY_MAX_ACTIVE_REFS),
    activeRouteVariantRefs: uniqueSorted(memory.activeRouteVariantRefs).slice(0, MEMORY_MAX_ACTIVE_REFS),
    activeTargetRefs: uniqueSorted(memory.activeTargetRefs).slice(0, MEMORY_MAX_ACTIVE_REFS),
    lastSuccessfulLocatorRung: memory.lastSuccessfulLocatorRung,
    recentAssertions: memory.recentAssertions
      .filter((entry) => Number.isFinite(entry.observedAtStep) && task.index - entry.observedAtStep <= MEMORY_STALENESS_TTL_STEPS)
      .slice(-MEMORY_MAX_RECENT_ASSERTIONS),
    lineage: memory.lineage.slice(-32),
  };

  if (next.currentScreen && task.index - next.currentScreen.observedAtStep > MEMORY_STALENESS_TTL_STEPS) {
    next.currentScreen = null;
  }
  if (next.currentScreen && next.currentScreen.confidence < MEMORY_SCREEN_CONFIDENCE_FLOOR) {
    next.currentScreen = null;
    next.activeStateRefs = [];
    next.lastObservedTransitionRefs = [];
  }
  if (task.actionText.toLowerCase().includes('navigate')) {
    next.activeStateRefs = [];
    next.lastObservedTransitionRefs = [];
  }

  return next;
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

function updateObservedStateSessionAfterResolution(stage: RuntimeAgentStageContext, receipt: ResolutionReceipt): void {
  if (receipt.kind === 'needs-human') {
    return;
  }

  const memory = stage.memory;
  memory.currentScreen = {
    screen: receipt.target.screen,
    confidence: receipt.confidence === 'compiler-derived' ? 1 : receipt.confidence === 'agent-verified' ? 0.8 : 0.65,
    observedAtStep: stage.task.index,
  };
  memory.activeRouteVariantRefs = uniqueSorted([
    ...memory.activeRouteVariantRefs,
    ...routeVariantRefsForReceipt(stage, receipt),
  ]).slice(0, MEMORY_MAX_ACTIVE_REFS);

  const targetRef = resolvedTargetRef(stage, receipt);
  if (targetRef) {
    memory.activeTargetRefs = uniqueSorted([...memory.activeTargetRefs, targetRef]).slice(0, MEMORY_MAX_ACTIVE_REFS);
  }

  if (receipt.target.action === 'assert-snapshot') {
    memory.recentAssertions = [
      ...memory.recentAssertions,
      { summary: `${receipt.target.screen}:${receipt.target.snapshot_template ?? 'default'}`, observedAtStep: stage.task.index },
    ]
      .filter((entry) => stage.task.index - entry.observedAtStep <= MEMORY_STALENESS_TTL_STEPS)
      .slice(-MEMORY_MAX_RECENT_ASSERTIONS);
  }

  if (receipt.winningSource === 'live-dom') {
    memory.lastSuccessfulLocatorRung = 0;
  }

  memory.lineage = uniqueSorted([
    ...memory.lineage,
    `step:${stage.task.index}`,
    `screen:${receipt.target.screen}`,
    `source:${receipt.winningSource}`,
    `confidence:${receipt.confidence}`,
  ]).slice(-32);
  stage.memoryLineage = memory.lineage;
}

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

  const explicit = tryExplicitResolution(stage);
  if (explicit) {
    updateObservedStateSessionAfterResolution(stage, explicit);
    return explicit;
  }

  const acc = buildLatticeAccumulator(stage);

  const knowledge = tryApprovedKnowledgeResolution(stage, acc);
  if (knowledge) {
    updateObservedStateSessionAfterResolution(stage, knowledge);
    return knowledge;
  }

  const overlay = tryOverlayResolution(stage, acc);
  if (overlay) {
    updateObservedStateSessionAfterResolution(stage, overlay);
    return overlay;
  }

  const translation = await tryTranslationResolution(stage, acc);
  if (translation) {
    updateObservedStateSessionAfterResolution(stage, translation);
    return translation;
  }

  const receipt = await tryLiveDomOrFallback(stage, acc);
  updateObservedStateSessionAfterResolution(stage, receipt);
  return receipt;
}

export type { RuntimeStepAgentContext } from './types';
