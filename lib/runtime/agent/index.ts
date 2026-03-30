import { Data, Effect } from 'effect';
import type { CausalLink, ConfidenceScaling, MemoryCapacityConfig, ObservedStateSession, ResolutionEvent, ResolutionPipelineResult, ResolutionReceipt, GroundedStep } from '../../domain/types';
import { DEFAULT_PIPELINE_CONFIG } from '../../domain/types';
import { resolutionPrecedenceLaw, type ResolutionPrecedenceRung } from '../../domain/precedence';
import { selectedControlRefs, selectedControlResolution } from './select-controls';
import { uniqueSorted } from './shared';
import { createStrategyRegistry } from './strategy-registry';
import { buildPipelineDAG, validateDAG } from '../../application/pipeline-dag';
import type { RuntimeAgentStageContext, RuntimeStepAgentContext, StageEffects, IntentInterpretation } from './types';
import { mergeEffectsIntoStage, EMPTY_EFFECTS } from './types';
import { interpretStepIntent } from './interpret-intent';
import {
  tryExplicitResolution,
  buildLatticeAccumulator,
  tryApprovedKnowledgeResolution,
  tryOverlayResolution,
  tryTranslationResolution,
  tryLiveDomOrFallback,
  type ResolutionAccumulator,
} from './resolution-stages';

export const RESOLUTION_PRECEDENCE = resolutionPrecedenceLaw;

export type MemoryCapacity = MemoryCapacityConfig;

const DEFAULT_MEMORY_CAPACITY: MemoryCapacity = DEFAULT_PIPELINE_CONFIG.memoryCapacity;

export class PipelineDagValidationError extends Data.TaggedError('PipelineDagValidationError')<{
  readonly diagnostics: readonly string[];
}> {}

export class StrategyTotalityError extends Data.TaggedError('StrategyTotalityError')<{
  readonly missingRungs: readonly ResolutionPrecedenceRung[];
}> {}

interface PipelineState {
  readonly stage: RuntimeAgentStageContext;
  readonly accumulator: ResolutionAccumulator | null;
  readonly emittedEvents: readonly ResolutionEvent[];
}

interface PipelineProgress {
  readonly state: PipelineState;
  readonly receipt: ResolutionReceipt | null;
}

interface PipelinePhase {
  readonly name: string;
  readonly run: (progress: PipelineProgress) => Effect.Effect<PipelineProgress, StrategyTotalityError>;
}

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

function mergeStage(state: PipelineState, effects: StageEffects): PipelineState {
  return {
    ...state,
    stage: mergeEffectsIntoStage(state.stage, effects),
    emittedEvents: [...state.emittedEvents, ...effectsToEvents(effects)],
  };
}

function withInterpretation(state: PipelineState, interpretation: IntentInterpretation | null): PipelineState {
  return {
    ...state,
    stage: {
      ...state.stage,
      interpretation: interpretation ?? undefined,
    },
  };
}

function appendReceiptEvent(state: PipelineState, receipt: ResolutionReceipt): PipelineState {
  return { ...state, emittedEvents: [...state.emittedEvents, { kind: 'receipt-produced', receipt }] };
}

function runStrategies(
  state: PipelineState,
  attempts: readonly ((s: PipelineState) => Effect.Effect<{ readonly state: PipelineState; readonly receipt: ResolutionReceipt | null }, never>)[],
): Effect.Effect<{ readonly state: PipelineState; readonly receipt: ResolutionReceipt | null }, never> {
  return Effect.reduce(
    attempts,
    { state, receipt: null as ResolutionReceipt | null },
    (progress, attempt) => progress.receipt
      ? Effect.succeed(progress)
      : attempt(progress.state).pipe(
          Effect.map((result) => result.receipt
            ? { state: appendReceiptEvent(result.state, result.receipt), receipt: result.receipt }
            : result),
        ),
  );
}

function runPipelinePhases(
  phases: readonly PipelinePhase[],
  initial: PipelineProgress,
): Effect.Effect<PipelineProgress, PipelineDagValidationError | StrategyTotalityError> {
  const dagStages = phases.map((phase, index) => ({
    name: phase.name,
    dependencies: index > 0 ? [phases[index - 1]!.name] : [],
  }));
  const dag = buildPipelineDAG(dagStages);
  const diagnostics = validateDAG(dag);
  if (diagnostics.length > 0) {
    return Effect.fail(new PipelineDagValidationError({ diagnostics }));
  }

  return Effect.reduce(
    phases,
    initial,
    (progress, phase) => progress.receipt ? Effect.succeed(progress) : phase.run(progress),
  );
}

export function runResolutionPipeline(
  task: GroundedStep,
  context: RuntimeStepAgentContext,
  capacity: MemoryCapacity = DEFAULT_MEMORY_CAPACITY,
): Effect.Effect<ResolutionPipelineResult, PipelineDagValidationError | StrategyTotalityError> {
  const memory = normalizeObservedStateSession(task, context.observedStateSession ?? createEmptyObservedStateSession(), capacity);
  const stage: RuntimeAgentStageContext = {
    task,
    context: { ...context, observedStateSession: memory },
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

  const seedEvents: ResolutionEvent[] = [
    ...(stage.controlRefs.length > 0 ? [{ kind: 'refs-collected' as const, refKind: 'control' as const, refs: [...stage.controlRefs] }] : []),
    ...(stage.evidenceRefs.length > 0 ? [{ kind: 'refs-collected' as const, refKind: 'evidence' as const, refs: [...stage.evidenceRefs] }] : []),
  ];

  const phases: readonly PipelinePhase[] = [
    {
      name: 'intent-interpretation',
      run: (progress) => Effect.promise(() => interpretStepIntent(progress.state.stage.task, progress.state.stage.context)).pipe(
        Effect.map((interpretationResult) => ({
          ...progress,
          state: withInterpretation(mergeStage(progress.state, interpretationResult.effects), interpretationResult.interpretation),
        })),
      ),
    },
    {
      name: 'pre-accumulator',
      run: (progress) => runStrategies(progress.state, [
        (state) => Effect.sync(() => {
          const result = tryExplicitResolution(state.stage);
          return { state: mergeStage(state, result.effects), receipt: result.receipt };
        }),
      ]).pipe(Effect.map((result) => ({ state: result.state, receipt: result.receipt }))),
    },
    {
      name: 'lattice-accumulator',
      run: (progress) => Effect.sync(() => {
        const latticeResult = buildLatticeAccumulator(progress.state.stage);
        return {
          ...progress,
          state: { ...mergeStage(progress.state, latticeResult.effects), accumulator: latticeResult.accumulator },
        };
      }),
    },
    {
      name: 'post-accumulator',
      run: (progress) => {
        if (!progress.state.accumulator) {
          return Effect.succeed(progress);
        }

        const strategyRegistry = createStrategyRegistry([
          { name: 'explicit-resolution', rungs: ['explicit', 'control'], requiresAccumulator: false, attempt: async () => ({ receipt: null, events: [] }) },
          { name: 'approved-knowledge', rungs: ['approved-screen-knowledge', 'shared-patterns', 'prior-evidence'], requiresAccumulator: true, attempt: async () => ({ receipt: null, events: [] }) },
          { name: 'confidence-overlay', rungs: ['approved-equivalent-overlay'], requiresAccumulator: true, attempt: async () => ({ receipt: null, events: [] }) },
          { name: 'structured-translation', rungs: ['structured-translation'], requiresAccumulator: true, attempt: async () => ({ receipt: null, events: [] }) },
          { name: 'live-dom-fallback', rungs: ['live-dom', 'agent-interpreted', 'needs-human'], requiresAccumulator: true, attempt: async () => ({ receipt: null, events: [] }) },
        ]);
        const missingRungs = resolutionPrecedenceLaw.filter((rung) => !strategyRegistry.lookup(rung));
        if (missingRungs.length > 0) {
          return Effect.fail(new StrategyTotalityError({ missingRungs }));
        }

        const attempts = [
          (state: PipelineState) => Effect.sync(() => {
            const result = tryApprovedKnowledgeResolution(state.stage, state.accumulator!);
            return { state: mergeStage(state, result.effects), receipt: result.receipt };
          }),
          (state: PipelineState) => Effect.sync(() => {
            const result = tryOverlayResolution(state.stage, state.accumulator!);
            return {
              state: { ...mergeStage(state, result.effects), accumulator: result.accumulator },
              receipt: result.receipt,
            };
          }),
          (state: PipelineState) => Effect.promise(() => tryTranslationResolution(state.stage, state.accumulator!)).pipe(
            Effect.map((result) => ({
              state: { ...mergeStage(state, result.effects), accumulator: result.accumulator },
              receipt: result.receipt,
            })),
          ),
          (state: PipelineState) => Effect.promise(() => tryLiveDomOrFallback(state.stage, state.accumulator!)).pipe(
            Effect.map((result) => ({
              state: mergeStage(state, result.effects),
              receipt: result.receipt,
            })),
          ),
        ] as const;

        return runStrategies(progress.state, attempts).pipe(
          Effect.map((result) => ({ state: result.state, receipt: result.receipt })),
        );
      },
    },
    {
      name: 'final-fallback',
      run: (progress) => !progress.state.accumulator
        ? Effect.succeed(progress)
        : Effect.promise(() => tryLiveDomOrFallback(progress.state.stage, progress.state.accumulator!)).pipe(
            Effect.map((fallback) => {
              const nextState = appendReceiptEvent(mergeStage(progress.state, fallback.effects), fallback.receipt);
              return { state: nextState, receipt: fallback.receipt };
            }),
          ),
    },
  ];

  const initial: PipelineProgress = { state: { stage, accumulator: null, emittedEvents: [] }, receipt: null };

  return runPipelinePhases(phases, initial).pipe(
    Effect.map(({ state, receipt }) => {
      const resolvedReceipt = receipt!;
      const updated = deriveObservedStateSessionAfterResolution(state.stage, resolvedReceipt, capacity);
      const memoryEvent: ResolutionEvent = { kind: 'memory-updated', session: updated };
      context.observedStateSession = updated;
      return { receipt: resolvedReceipt, events: [...seedEvents, ...state.emittedEvents, memoryEvent] };
    }),
  );
}

export type { RuntimeStepAgentContext } from './types';
