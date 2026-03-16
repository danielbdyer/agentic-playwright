import type { CausalLink, ObservedStateSession, ResolutionEvent, ResolutionPipelineResult, ResolutionReceipt, GroundedStep } from '../../domain/types';
import { resolutionPrecedenceLaw } from '../../domain/precedence';
import { selectedControlRefs, selectedControlResolution } from './select-controls';
import { uniqueSorted } from './shared';
import type { ResolutionStrategy, StrategyAttemptResult } from './strategy';
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

export interface MemoryCapacity {
  maxActiveRefs: number;
  stalenessTtl: number;
  maxRecentAssertions: number;
  screenConfidenceFloor: number;
  maxLineageEntries: number;
}

const DEFAULT_MEMORY_CAPACITY: MemoryCapacity = {
  maxActiveRefs: 8,
  stalenessTtl: 5,
  maxRecentAssertions: 8,
  screenConfidenceFloor: 0.35,
  maxLineageEntries: 32,
};

export function deriveMemoryCapacity(stepCount: number, stateNodeCount: number): MemoryCapacity {
  return {
    maxActiveRefs: Math.min(32, Math.max(8, Math.round(stateNodeCount * 0.5))),
    stalenessTtl: Math.min(10, Math.max(3, Math.round(stepCount * 0.3))),
    maxRecentAssertions: Math.min(16, Math.max(8, Math.round(stepCount * 0.2))),
    screenConfidenceFloor: stateNodeCount > 20 ? 0.25 : stateNodeCount > 10 ? 0.30 : 0.35,
    maxLineageEntries: Math.min(64, Math.max(32, stepCount)),
  };
}

let activeCapacity: MemoryCapacity = DEFAULT_MEMORY_CAPACITY;

export function setMemoryCapacity(capacity: MemoryCapacity): void {
  activeCapacity = capacity;
}

export function resetMemoryCapacity(): void {
  activeCapacity = DEFAULT_MEMORY_CAPACITY;
}

function createEmptyObservedStateSession(): ObservedStateSession {
  return {
    currentScreen: null,
    activeStateRefs: [],
    lastObservedTransitionRefs: [],
    activeRouteVariantRefs: [],
    activeTargetRefs: [],
    lastSuccessfulLocatorRung: null,
    recentAssertions: [],
    causalLinks: [],
    lineage: [],
  };
}

function normalizeObservedStateSession(task: GroundedStep, memory: ObservedStateSession): ObservedStateSession {
  const hasCausalOverride = memory.causalLinks.some((link) => link.relevantForSteps.includes(task.index));
  const screenStale = !hasCausalOverride && memory.currentScreen !== null && task.index - memory.currentScreen.observedAtStep > activeCapacity.stalenessTtl;
  const screenLowConfidence = !hasCausalOverride && memory.currentScreen !== null && memory.currentScreen.confidence < activeCapacity.screenConfidenceFloor;
  const currentScreen = screenStale || screenLowConfidence ? null : memory.currentScreen;
  const clearStateRefs = screenLowConfidence || task.actionText.toLowerCase().includes('navigate');

  return {
    currentScreen,
    activeStateRefs: clearStateRefs ? [] : uniqueSorted(memory.activeStateRefs).slice(0, activeCapacity.maxActiveRefs),
    lastObservedTransitionRefs: clearStateRefs ? [] : uniqueSorted(memory.lastObservedTransitionRefs).slice(0, activeCapacity.maxActiveRefs),
    activeRouteVariantRefs: uniqueSorted(memory.activeRouteVariantRefs).slice(0, activeCapacity.maxActiveRefs),
    activeTargetRefs: uniqueSorted(memory.activeTargetRefs).slice(0, activeCapacity.maxActiveRefs),
    lastSuccessfulLocatorRung: memory.lastSuccessfulLocatorRung,
    recentAssertions: memory.recentAssertions
      .filter((entry) => Number.isFinite(entry.observedAtStep) && task.index - entry.observedAtStep <= activeCapacity.stalenessTtl)
      .slice(-activeCapacity.maxRecentAssertions),
    causalLinks: memory.causalLinks.filter((link) => link.relevantForSteps.some((step) => step >= task.index)),
    lineage: memory.lineage.slice(-activeCapacity.maxLineageEntries),
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

function deriveCausalLinks(stage: RuntimeAgentStageContext, receipt: ResolutionReceipt): CausalLink[] {
  if (receipt.kind === 'needs-human') return stage.memory.causalLinks;

  const expectedTransitions = stage.task.grounding.expectedTransitionRefs;
  const resultStates = stage.task.grounding.resultStateRefs;
  const remainingStepCount = stage.context.resolutionContext.screens.length > 0 ? 3 : 0;
  const relevantForSteps = Array.from(
    { length: remainingStepCount },
    (_, i) => stage.task.index + 1 + i,
  );

  const newLinks: CausalLink[] = expectedTransitions.flatMap((transitionRef, i) => {
    const targetState = resultStates[i];
    return targetState
      ? [{ stepIndex: stage.task.index, firedTransitionRef: transitionRef, targetStateRef: targetState, relevantForSteps }]
      : [];
  });

  return [...stage.memory.causalLinks, ...newLinks];
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
  ]).slice(-activeCapacity.maxLineageEntries);

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
    ]).slice(0, activeCapacity.maxActiveRefs),
    activeTargetRefs: targetRef
      ? uniqueSorted([...stage.memory.activeTargetRefs, targetRef]).slice(0, activeCapacity.maxActiveRefs)
      : stage.memory.activeTargetRefs,
    lastSuccessfulLocatorRung: receipt.winningSource === 'live-dom' ? 0 : stage.memory.lastSuccessfulLocatorRung,
    recentAssertions: receipt.target.action === 'assert-snapshot'
      ? [
          ...stage.memory.recentAssertions,
          { summary: `${receipt.target.screen}:${receipt.target.snapshot_template ?? 'default'}`, observedAtStep: stage.task.index },
        ]
          .filter((entry) => stage.task.index - entry.observedAtStep <= activeCapacity.stalenessTtl)
          .slice(-activeCapacity.maxRecentAssertions)
      : stage.memory.recentAssertions,
    causalLinks: deriveCausalLinks(stage, receipt),
    lineage,
  };
}

function captureStageEvents(
  stage: RuntimeAgentStageContext,
  beforeExhaustionLen: number,
  beforeObservationLen: number,
): ResolutionEvent[] {
  return [
    ...stage.exhaustion.slice(beforeExhaustionLen).map((entry): ResolutionEvent => ({ kind: 'exhaustion-recorded', entry })),
    ...stage.observations.slice(beforeObservationLen).map((observation): ResolutionEvent => ({ kind: 'observation-recorded', observation })),
  ];
}

function wrapStageAsStrategy(
  name: string,
  rungs: ResolutionStrategy['rungs'],
  requiresAccumulator: boolean,
  fn: (stage: RuntimeAgentStageContext, acc: import('./resolution-stages').ResolutionAccumulator | null) => ResolutionReceipt | null | Promise<ResolutionReceipt | null>,
): ResolutionStrategy {
  return {
    name,
    rungs,
    requiresAccumulator,
    async attempt(stage, acc): Promise<StrategyAttemptResult> {
      const exhaustionBefore = stage.exhaustion.length;
      const observationsBefore = stage.observations.length;
      const receipt = await fn(stage, acc);
      const events = captureStageEvents(stage, exhaustionBefore, observationsBefore);
      if (stage.knowledgeRefs.length > 0) {
        events.push({ kind: 'refs-collected', refKind: 'knowledge', refs: [...stage.knowledgeRefs] });
      }
      if (stage.supplementRefs.length > 0) {
        events.push({ kind: 'refs-collected', refKind: 'supplement', refs: [...stage.supplementRefs] });
      }
      return { receipt, events };
    },
  };
}

const resolutionStrategies: readonly ResolutionStrategy[] = [
  wrapStageAsStrategy('explicit-resolution', ['explicit', 'control'], false,
    (stage) => tryExplicitResolution(stage)),
  wrapStageAsStrategy('approved-knowledge', ['approved-screen-knowledge', 'shared-patterns', 'prior-evidence'], true,
    (stage, acc) => tryApprovedKnowledgeResolution(stage, acc!)),
  wrapStageAsStrategy('confidence-overlay', ['approved-equivalent-overlay'], true,
    (stage, acc) => tryOverlayResolution(stage, acc!)),
  wrapStageAsStrategy('structured-translation', ['structured-translation'], true,
    (stage, acc) => tryTranslationResolution(stage, acc!)),
  wrapStageAsStrategy('live-dom-fallback', ['live-dom', 'needs-human'], true,
    (stage, acc) => tryLiveDomOrFallback(stage, acc!)),
];

export async function runResolutionPipeline(task: GroundedStep, context: RuntimeStepAgentContext): Promise<ResolutionPipelineResult> {
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

  const applyMemory = (receipt: ResolutionReceipt): ResolutionEvent => {
    const updated = deriveObservedStateSessionAfterResolution(stage, receipt);
    context.observedStateSession = updated;
    stage.memoryLineage = updated.lineage;
    return { kind: 'memory-updated', session: updated };
  };

  const preAccumulatorStrategies = resolutionStrategies.filter((s) => !s.requiresAccumulator);
  const postAccumulatorStrategies = resolutionStrategies.filter((s) => s.requiresAccumulator);

  const seedEvents: ResolutionEvent[] = [
    ...(stage.controlRefs.length > 0 ? [{ kind: 'refs-collected' as const, refKind: 'control' as const, refs: [...stage.controlRefs] }] : []),
    ...(stage.evidenceRefs.length > 0 ? [{ kind: 'refs-collected' as const, refKind: 'evidence' as const, refs: [...stage.evidenceRefs] }] : []),
  ];

  const earlyResult = await runStrategyChain(preAccumulatorStrategies, stage, null);
  if (earlyResult.receipt) {
    const memoryEvent = applyMemory(earlyResult.receipt);
    return { receipt: earlyResult.receipt, events: [...seedEvents, ...earlyResult.events, memoryEvent] };
  }

  const acc = buildLatticeAccumulator(stage);
  const latticeEvents = captureStageEvents(stage, 0, 0);

  const result = await runStrategyChain(postAccumulatorStrategies, stage, acc);
  if (result.receipt) {
    const memoryEvent = applyMemory(result.receipt);
    return { receipt: result.receipt, events: [...seedEvents, ...earlyResult.events, ...latticeEvents, ...result.events, memoryEvent] };
  }

  const exhaustionBefore = stage.exhaustion.length;
  const observationsBefore = stage.observations.length;
  const fallbackReceipt = await tryLiveDomOrFallback(stage, acc);
  const fallbackEvents = captureStageEvents(stage, exhaustionBefore, observationsBefore);
  const memoryEvent = applyMemory(fallbackReceipt);
  return {
    receipt: fallbackReceipt,
    events: [...seedEvents, ...earlyResult.events, ...latticeEvents, ...result.events, ...fallbackEvents, { kind: 'receipt-produced', receipt: fallbackReceipt }, memoryEvent],
  };
}

export type { RuntimeStepAgentContext } from './types';
