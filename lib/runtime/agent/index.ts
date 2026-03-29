import type { CausalLink, ConfidenceScaling, MemoryCapacityConfig, ObservedStateSession, ResolutionEvent, ResolutionPipelineResult, ResolutionReceipt, GroundedStep } from '../../domain/types';
import { DEFAULT_PIPELINE_CONFIG } from '../../domain/types';
import { resolutionPrecedenceLaw } from '../../domain/precedence';
import { selectedControlRefs, selectedControlResolution } from './select-controls';
import { uniqueSorted } from './shared';
import type { ResolutionStrategy, StrategyAttemptResult } from './strategy';
import { runStrategyChain } from './strategy';
import { createStrategyRegistry } from './strategy-registry';
import { buildPipelineDAG, validateDAG } from '../../application/pipeline-dag';
import type { RuntimeAgentStageContext, RuntimeStepAgentContext, StageEffects } from './types';
import { mergeEffectsIntoStage } from './types';
import { interpretStepIntent } from './interpret-intent';
import {
  tryExplicitResolution,
  buildLatticeAccumulator,
  tryApprovedKnowledgeResolution,
  tryOverlayResolution,
  tryTranslationResolution,
  tryLiveDomOrFallback,
} from './resolution-stages';

export const RESOLUTION_PRECEDENCE = resolutionPrecedenceLaw;

export type MemoryCapacity = MemoryCapacityConfig;

const DEFAULT_MEMORY_CAPACITY: MemoryCapacity = DEFAULT_PIPELINE_CONFIG.memoryCapacity;

export function deriveMemoryCapacity(stepCount: number, stateNodeCount: number): MemoryCapacity {
  return {
    maxActiveRefs: Math.min(32, Math.max(8, Math.round(stateNodeCount * 0.5))),
    stalenessTtl: Math.min(10, Math.max(3, Math.round(stepCount * 0.3))),
    maxRecentAssertions: Math.min(16, Math.max(8, Math.round(stepCount * 0.2))),
    screenConfidenceFloor: stateNodeCount > 20 ? 0.25 : stateNodeCount > 10 ? 0.30 : 0.35,
    maxLineageEntries: Math.min(64, Math.max(32, stepCount)),
  };
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

function normalizeObservedStateSession(task: GroundedStep, memory: ObservedStateSession, capacity: MemoryCapacity): ObservedStateSession {
  const hasCausalOverride = memory.causalLinks.some((link) => link.relevantForSteps.includes(task.index));
  const screenStale = !hasCausalOverride && memory.currentScreen !== null && task.index - memory.currentScreen.observedAtStep > capacity.stalenessTtl;
  const screenLowConfidence = !hasCausalOverride && memory.currentScreen !== null && memory.currentScreen.confidence < capacity.screenConfidenceFloor;
  const currentScreen = screenStale || screenLowConfidence ? null : memory.currentScreen;
  const clearStateRefs = screenLowConfidence || task.actionText.toLowerCase().includes('navigate');

  return {
    currentScreen,
    activeStateRefs: clearStateRefs ? [] : uniqueSorted(memory.activeStateRefs).slice(0, capacity.maxActiveRefs),
    lastObservedTransitionRefs: clearStateRefs ? [] : uniqueSorted(memory.lastObservedTransitionRefs).slice(0, capacity.maxActiveRefs),
    activeRouteVariantRefs: uniqueSorted(memory.activeRouteVariantRefs).slice(0, capacity.maxActiveRefs),
    activeTargetRefs: uniqueSorted(memory.activeTargetRefs).slice(0, capacity.maxActiveRefs),
    lastSuccessfulLocatorRung: memory.lastSuccessfulLocatorRung,
    recentAssertions: memory.recentAssertions
      .filter((entry) => Number.isFinite(entry.observedAtStep) && task.index - entry.observedAtStep <= capacity.stalenessTtl)
      .slice(-capacity.maxRecentAssertions),
    causalLinks: memory.causalLinks.filter((link) => link.relevantForSteps.some((step) => step >= task.index)),
    lineage: memory.lineage.slice(-capacity.maxLineageEntries),
  };
}

function resolvedTargetRef(stage: RuntimeAgentStageContext, receipt: ResolutionReceipt) {
  if (receipt.kind === 'needs-human' || !receipt.target.element) {
    return null;
  }
  const screen = stage.context.resolutionContext.screens.find((entry) => entry.screen === receipt.target.screen);
  return screen?.elements.find((entry) => entry.element === receipt.target.element)?.targetRef ?? null;
}

function routeVariantRefsForReceipt(stage: RuntimeAgentStageContext, receipt: ResolutionReceipt): readonly string[] {
  if (receipt.kind === 'needs-human') {
    return stage.task.grounding.routeVariantRefs;
  }
  const screen = stage.context.resolutionContext.screens.find((entry) => entry.screen === receipt.target.screen);
  return screen?.routeVariantRefs.length ? screen.routeVariantRefs : stage.task.grounding.routeVariantRefs;
}

function deriveCausalLinks(stage: RuntimeAgentStageContext, receipt: ResolutionReceipt): readonly CausalLink[] {
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

function deriveObservedStateSessionAfterResolution(stage: RuntimeAgentStageContext, receipt: ResolutionReceipt, capacity: MemoryCapacity, scaling: ConfidenceScaling = DEFAULT_PIPELINE_CONFIG.confidenceScaling): ObservedStateSession {
  if (receipt.kind === 'needs-human') {
    return stage.memory;
  }

  const confidenceScore = receipt.confidence === 'compiler-derived' ? scaling.compilerDerived : receipt.confidence === 'agent-verified' ? scaling.agentVerified : scaling.agentProposed;
  const targetRef = resolvedTargetRef(stage, receipt);
  const lineage = uniqueSorted([
    ...stage.memory.lineage,
    `step:${stage.task.index}`,
    `screen:${receipt.target.screen}`,
    `source:${receipt.winningSource}`,
    `confidence:${receipt.confidence}`,
  ]).slice(-capacity.maxLineageEntries);

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
    ]).slice(0, capacity.maxActiveRefs),
    activeTargetRefs: targetRef
      ? uniqueSorted([...stage.memory.activeTargetRefs, targetRef]).slice(0, capacity.maxActiveRefs)
      : stage.memory.activeTargetRefs,
    lastSuccessfulLocatorRung: receipt.winningSource === 'live-dom' ? 0 : stage.memory.lastSuccessfulLocatorRung,
    recentAssertions: receipt.target.action === 'assert-snapshot'
      ? [
          ...stage.memory.recentAssertions,
          { summary: `${receipt.target.screen}:${receipt.target.snapshot_template ?? 'default'}`, observedAtStep: stage.task.index },
        ]
          .filter((entry) => stage.task.index - entry.observedAtStep <= capacity.stalenessTtl)
          .slice(-capacity.maxRecentAssertions)
      : stage.memory.recentAssertions,
    causalLinks: deriveCausalLinks(stage, receipt),
    lineage,
  };
}

function effectsToEvents(effects: StageEffects): ResolutionEvent[] {
  return [
    ...effects.exhaustion.map((entry): ResolutionEvent => ({ kind: 'exhaustion-recorded', entry })),
    ...effects.observations.map((observation): ResolutionEvent => ({ kind: 'observation-recorded', observation })),
    ...(effects.knowledgeRefs.length > 0 ? [{ kind: 'refs-collected' as const, refKind: 'knowledge' as const, refs: effects.knowledgeRefs }] : []),
    ...(effects.supplementRefs.length > 0 ? [{ kind: 'refs-collected' as const, refKind: 'supplement' as const, refs: effects.supplementRefs }] : []),
  ];
}

function pureStrategy(
  name: string,
  rungs: ResolutionStrategy['rungs'],
  requiresAccumulator: boolean,
  fn: (stage: RuntimeAgentStageContext, acc: import('./resolution-stages').ResolutionAccumulator | null) => { receipt: ResolutionReceipt | null; effects: StageEffects } | Promise<{ receipt: ResolutionReceipt | null; effects: StageEffects }>,
): ResolutionStrategy {
  return {
    name,
    rungs,
    requiresAccumulator,
    async attempt(stage, acc): Promise<StrategyAttemptResult> {
      const result = await fn(stage, acc);
      Object.assign(stage, mergeEffectsIntoStage(stage, result.effects));
      return { receipt: result.receipt, events: effectsToEvents(result.effects) };
    },
  };
}

const preAccumulatorStrategies: readonly ResolutionStrategy[] = [
  pureStrategy('explicit-resolution', ['explicit', 'control'], false,
    (stage) => tryExplicitResolution(stage)),
];

function buildPostAccumulatorStrategies(accRef: { current: import('./resolution-stages').ResolutionAccumulator }): readonly ResolutionStrategy[] {
  return [
    pureStrategy('approved-knowledge', ['approved-screen-knowledge', 'shared-patterns', 'prior-evidence'], true,
      (stage) => tryApprovedKnowledgeResolution(stage, accRef.current)),
    {
      name: 'confidence-overlay',
      rungs: ['approved-equivalent-overlay'],
      requiresAccumulator: true,
      async attempt(stage): Promise<StrategyAttemptResult> {
        const result = tryOverlayResolution(stage, accRef.current);
        accRef.current = result.accumulator;
        Object.assign(stage, mergeEffectsIntoStage(stage, result.effects));
        return { receipt: result.receipt, events: effectsToEvents(result.effects) };
      },
    },
    {
      name: 'structured-translation',
      rungs: ['structured-translation'],
      requiresAccumulator: true,
      async attempt(stage): Promise<StrategyAttemptResult> {
        const result = await tryTranslationResolution(stage, accRef.current);
        accRef.current = result.accumulator;
        Object.assign(stage, mergeEffectsIntoStage(stage, result.effects));
        return { receipt: result.receipt, events: effectsToEvents(result.effects) };
      },
    },
    pureStrategy('live-dom-fallback', ['live-dom', 'agent-interpreted', 'needs-human'], true,
      async (stage) => tryLiveDomOrFallback(stage, accRef.current)),
  ];
}

export interface PipelinePhase {
  readonly name: string;
  run(stage: RuntimeAgentStageContext): Promise<import('./strategy').StrategyChainResult>;
}

async function runPipelinePhases(
  phases: readonly PipelinePhase[],
  stage: RuntimeAgentStageContext,
): Promise<import('./strategy').StrategyChainResult> {
  // Validate phase chain as a linear DAG: each phase depends on its predecessor.
  const dagStages = phases.map((phase, index) => ({
    name: phase.name,
    dependencies: index > 0 ? [phases[index - 1]!.name] : [],
  }));
  const dag = buildPipelineDAG(dagStages);
  const diagnostics = validateDAG(dag);
  if (diagnostics.length > 0) {
    throw new Error(`Pipeline phase DAG invalid: ${diagnostics.join('; ')}`);
  }

  const step = async (
    remaining: readonly PipelinePhase[],
    priorEvents: readonly ResolutionEvent[],
  ): Promise<import('./strategy').StrategyChainResult> => {
    const [head, ...tail] = remaining;
    if (!head) {
      return { receipt: null, events: [...priorEvents] };
    }
    const result = await head.run(stage);
    const accumulated = [...priorEvents, ...result.events];
    return result.receipt
      ? { receipt: result.receipt, events: accumulated }
      : step(tail, accumulated);
  };
  return step(phases, []);
}

export async function runResolutionPipeline(
  task: GroundedStep,
  context: RuntimeStepAgentContext,
  capacity: MemoryCapacity = DEFAULT_MEMORY_CAPACITY,
): Promise<ResolutionPipelineResult> {
  const memory = normalizeObservedStateSession(task, context.observedStateSession ?? createEmptyObservedStateSession(), capacity);
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
    const updated = deriveObservedStateSessionAfterResolution(stage, receipt, capacity);
    context.observedStateSession = updated;
    stage.memoryLineage = updated.lineage;
    return { kind: 'memory-updated', session: updated };
  };

  const seedEvents: ResolutionEvent[] = [
    ...(stage.controlRefs.length > 0 ? [{ kind: 'refs-collected' as const, refKind: 'control' as const, refs: [...stage.controlRefs] }] : []),
    ...(stage.evidenceRefs.length > 0 ? [{ kind: 'refs-collected' as const, refKind: 'evidence' as const, refs: [...stage.evidenceRefs] }] : []),
  ];

  const accRef = { current: null as import('./resolution-stages').ResolutionAccumulator | null };

  const phases: readonly PipelinePhase[] = [
    {
      name: 'intent-interpretation',
      run: async (s) => {
        const interpretationResult = await interpretStepIntent(s.task, s.context);
        Object.assign(s, mergeEffectsIntoStage(s, interpretationResult.effects));
        s.interpretation = interpretationResult.interpretation ?? undefined;
        return { receipt: null, events: effectsToEvents(interpretationResult.effects) };
      },
    },
    {
      name: 'pre-accumulator',
      run: (s) => runStrategyChain(preAccumulatorStrategies, s, null),
    },
    {
      name: 'lattice-accumulator',
      run: async (s) => {
        const latticeResult = buildLatticeAccumulator(s);
        Object.assign(s, mergeEffectsIntoStage(s, latticeResult.effects));
        accRef.current = latticeResult.accumulator;
        return { receipt: null, events: effectsToEvents(latticeResult.effects) };
      },
    },
    {
      name: 'post-accumulator',
      run: (s) => {
        const postStrategies = buildPostAccumulatorStrategies(accRef as { current: import('./resolution-stages').ResolutionAccumulator });
        const registry = createStrategyRegistry([...preAccumulatorStrategies, ...postStrategies]);
        const missingRungs = resolutionPrecedenceLaw.filter((rung) => !registry.lookup(rung));
        if (missingRungs.length > 0) {
          throw new Error(`Strategy registry not total — missing rungs: ${missingRungs.join(', ')}`);
        }
        return runStrategyChain(registry.strategiesInOrder().filter((s) => s.requiresAccumulator), s, accRef.current);
      },
    },
    {
      name: 'final-fallback',
      run: async (s) => {
        const fallback = await tryLiveDomOrFallback(s, accRef.current!);
        Object.assign(s, mergeEffectsIntoStage(s, fallback.effects));
        return {
          receipt: fallback.receipt,
          events: [...effectsToEvents(fallback.effects), { kind: 'receipt-produced' as const, receipt: fallback.receipt }],
        };
      },
    },
  ];

  const result = await runPipelinePhases(phases, stage);
  const receipt = result.receipt!;
  const memoryEvent = applyMemory(receipt);
  return { receipt, events: [...seedEvents, ...result.events, memoryEvent] };
}

export type { RuntimeStepAgentContext } from './types';
