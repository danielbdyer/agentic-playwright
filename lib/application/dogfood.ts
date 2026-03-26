import path from 'path';
import { Effect } from 'effect';
import { activateProposalBundle, autoApproveEligibleProposals } from './activate-proposals';
import { loadWorkspaceCatalog } from './catalog';
import { buildPartialFitnessMetrics } from './fitness';
import { calibrateWeightsFromCorrelations } from './learning-bottlenecks';
import { improvementLoopLedgerPath, type ProjectPaths } from './paths';
import { refreshScenarioCore } from './refresh';
import { buildDerivedGraph } from './graph';
import { generateTypes } from './types';
import { resolveEffectConcurrency } from './concurrency';
import { runScenarioSelection } from './run';
import { FileSystem } from './ports';
import { runStateMachine } from './state-machine';
import { pruneTranslationCache } from './translation-cache';
import { round4 } from './learning-shared';
import type { AdoId } from '../domain/identity';
import { groupBy } from '../domain/collections';
import { asDogfoodLedgerProjection, asImprovementLoopLedger, DEFAULT_PIPELINE_CONFIG } from '../domain/types';
import type {
  AutoApprovalPolicy,
  BottleneckWeights,
  DogfoodLedgerProjection,
  ImprovementLoopLedger,
  ImprovementLoopConvergenceReason,
  ImprovementLoopIteration,
  KnowledgePosture,
  ProposalBundle,
  SpeedrunProgressEvent,
  TrustPolicy,
} from '../domain/types';
import { DEFAULT_AUTO_APPROVAL_POLICY } from '../domain/trust-policy';

export type DogfoodIterationResult = ImprovementLoopIteration;
export type DogfoodLedger = DogfoodLedgerProjection;

export interface DogfoodOptions {
  readonly paths: ProjectPaths;
  readonly maxIterations: number;
  readonly convergenceThreshold?: number | undefined;
  readonly maxInstructionCount?: number | undefined;
  readonly tag?: string | undefined;
  readonly runbook?: string | undefined;
  readonly interpreterMode?: 'dry-run' | 'diagnostic' | undefined;
  readonly autoApprovalPolicy?: AutoApprovalPolicy | undefined;
  /** Knowledge posture for catalog loading. Defaults to 'warm-start'. */
  readonly knowledgePosture?: KnowledgePosture | undefined;
  /**
   * Fire-and-forget progress callback. Invoked after each iteration completes
   * with the current metrics. The callback is a side channel for observability —
   * it does not participate in the pipeline computation.
   */
  readonly onProgress?: ((event: SpeedrunProgressEvent) => void) | undefined;
  /** Seed identifier threaded into progress events. */
  readonly seed?: string | undefined;
}

interface LoopState {
  readonly iterations: readonly DogfoodIterationResult[];
  readonly cumulativeInstructions: number;
  readonly converged: boolean;
  readonly convergenceReason: ImprovementLoopConvergenceReason;
  readonly startedAt: number;
  /** Self-calibrating bottleneck weights, threaded through iterations.
   *  Each iteration may adjust these based on observed correlation between
   *  bottleneck signals and hit-rate improvement. Pure state transition. */
  readonly bottleneckWeights: BottleneckWeights;
}

function createInitialState(): LoopState {
  return {
    iterations: [],
    cumulativeInstructions: 0,
    converged: false,
    convergenceReason: null,
    startedAt: Date.now(),
    bottleneckWeights: DEFAULT_PIPELINE_CONFIG.bottleneckWeights,
  };
}

function collectPendingProposals(bundles: readonly ProposalBundle[]): readonly ProposalBundle[] {
  return bundles.filter((bundle) =>
    bundle.proposals.some((proposal) => proposal.activation.status === 'pending'),
  );
}

/**
 * Derive bottleneck-weight correlations from consecutive iteration pairs.
 *
 * For each (iteration N, iteration N+1) pair, we observe:
 *   - Which bottleneck signal dominated in iteration N (highest unresolved rate, etc.)
 *   - Whether hit rate improved in iteration N+1
 *
 * If a signal correlated with improvement, its weight should increase.
 * If it correlated with stagnation, its weight should decrease.
 *
 * Pure function: (iterations) → correlations. No side effects.
 * This is the "gradient signal" for the self-calibrating scoring rule.
 */
/** Extract bottleneck signal strengths from a single iteration's characteristics.
 *  Pure function: maps iteration metrics to weighted bottleneck signals. */
export function iterationSignalStrengths(iteration: DogfoodIterationResult): readonly { readonly signal: string; readonly strength: number }[] {
  const unresolvedRate = iteration.totalStepCount > 0
    ? iteration.unresolvedStepCount / iteration.totalStepCount
    : 0;
  return [
    { signal: 'high-unresolved-rate', strength: unresolvedRate },
    { signal: 'repair-recovery-hotspot', strength: iteration.proposalsActivated > 0 ? 0.3 : 0 },
    { signal: 'translation-fallback-dominant', strength: unresolvedRate > 0.5 ? 0.2 : 0 },
    { signal: 'thin-screen-coverage', strength: unresolvedRate > 0.3 ? 0.1 : 0 },
  ].filter(({ strength }) => strength > 0);
}

/** Zip consecutive items into (current, next) tuples for fold analysis over adjacent pairs. */
export function consecutivePairs<T>(items: readonly T[]): readonly (readonly [T, T])[] {
  return items.slice(0, -1).map((item, index) => [item, items[index + 1]!] as const);
}

export function deriveIterationCorrelations(
  iterations: readonly DogfoodIterationResult[],
): readonly import('../domain/types').BottleneckWeightCorrelation[] {
  if (iterations.length < 2) {
    return [];
  }

  // Flatmap consecutive pairs into weighted signal observations,
  // then group by signal and average the deltas. O(pairs × signals).
  const observations = consecutivePairs(iterations).flatMap(([current, next]) => {
    const hitRateDelta = next.knowledgeHitRate - current.knowledgeHitRate;
    return iterationSignalStrengths(current)
      .map(({ signal, strength }) => ({ signal, delta: hitRateDelta * strength }));
  });

  // Single-pass groupBy (O(n)) then map to averages
  const bySignal = groupBy(observations, (o) => o.signal);
  return Object.entries(bySignal).map(([signal, entries]) => ({
    signal,
    weight: 0,
    correlationWithImprovement: round4(
      entries.reduce((sum, e) => sum + e.delta, 0) / entries.length,
    ),
  }));
}

function computeTraceMetrics(runRecords: ReadonlyArray<{
  readonly artifact: {
    readonly steps: ReadonlyArray<{
      readonly interpretation: { readonly provenanceKind: string };
      readonly execution: { readonly execution: { readonly instructionCount?: number } };
    }>;
  };
}>) {
  const perScenario = runRecords.map((entry) => {
    const steps = entry.artifact.steps;
    const approvedKnowledge = steps.filter((s) =>
      s.interpretation.provenanceKind === 'approved-knowledge',
    ).length;
    const unresolved = steps.filter((s) =>
      s.interpretation.provenanceKind === 'unresolved',
    ).length;
    const instructionCount = steps.reduce((sum, s) =>
      sum + ((s.execution.execution as Record<string, number>).instructionCount ?? 0),
    0);
    return {
      knowledgeHitRate: steps.length > 0 ? approvedKnowledge / steps.length : 0,
      unresolvedCount: unresolved,
      totalSteps: steps.length,
      instructionCount,
    };
  });

  const totalSteps = perScenario.reduce((sum, m) => sum + m.totalSteps, 0);
  const totalUnresolved = perScenario.reduce((sum, m) => sum + m.unresolvedCount, 0);
  const totalInstructions = perScenario.reduce((sum, m) => sum + m.instructionCount, 0);
  const avgHitRate = perScenario.length === 0
    ? 0
    : perScenario.reduce((sum, m) => sum + m.knowledgeHitRate, 0) / perScenario.length;

  return { avgHitRate: round4(avgHitRate), totalUnresolved, totalSteps, totalInstructions };
}

function determineConvergenceReason(
  iteration: number,
  maxIterations: number,
  proposalsActivated: number,
  prevHitRate: number | null,
  currentHitRate: number,
  cumulativeInstructions: number,
  options: DogfoodOptions,
): { readonly converged: boolean; readonly reason: DogfoodLedger['convergenceReason'] } {
  if (proposalsActivated === 0 && iteration > 1) {
    return { converged: true, reason: 'no-proposals' };
  }
  if (options.convergenceThreshold !== undefined && prevHitRate !== null) {
    const delta = currentHitRate - prevHitRate;
    if (delta < options.convergenceThreshold && iteration > 1) {
      return { converged: true, reason: 'threshold-met' };
    }
  }
  if (options.maxInstructionCount !== undefined && cumulativeInstructions >= options.maxInstructionCount) {
    return { converged: true, reason: 'budget-exhausted' };
  }
  if (iteration >= maxIterations) {
    return { converged: false, reason: 'max-iterations' };
  }
  return { converged: false, reason: null };
}

function accumulateProposalTotals(
  pendingBundles: readonly ProposalBundle[],
  paths: ProjectPaths,
  autoApprovalPolicy?: AutoApprovalPolicy | undefined,
  trustPolicy?: TrustPolicy | undefined,
): Effect.Effect<{ readonly activated: number; readonly blocked: number }, unknown, unknown> {
  return Effect.gen(function* () {
    const useAutoApproval = autoApprovalPolicy?.enabled && trustPolicy;
    const results = yield* Effect.all(
      pendingBundles.map((bundle) =>
        useAutoApproval
          ? autoApproveEligibleProposals({
              paths,
              proposalBundle: bundle,
              autoApprovalPolicy: autoApprovalPolicy!,
              trustPolicy: trustPolicy!,
            })
          : activateProposalBundle({ paths, proposalBundle: bundle }),
      ),
      { concurrency: 'unbounded' },
    );
    return results.reduce(
      (acc, result) => ({
        activated: acc.activated + result.activatedPaths.length,
        blocked: acc.blocked + result.blockedProposalIds.length,
      }),
      { activated: 0, blocked: 0 },
    );
  });
}

/** Wipe transient artifacts between iterations to cap memory and disk growth. */
function cleanupBetweenIterations(options: DogfoodOptions) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const sessionsDir = path.join(options.paths.rootDir, '.tesseract', 'sessions');
    const evidenceRunsDir = path.join(options.paths.rootDir, '.tesseract', 'evidence', 'runs');
    yield* Effect.all(
      [sessionsDir, evidenceRunsDir].map((dir) => fs.removeDir(dir)),
      { concurrency: 'unbounded' },
    );
    // Prune translation cache to keep disk bounded across iterations
    yield* Effect.promise(() => pruneTranslationCache({ paths: options.paths, maxEntries: 200 }));
  });
}

/** Compute L2 (Euclidean) distance between two weight vectors. Pure. */
function weightDrift(a: BottleneckWeights, b: BottleneckWeights): number {
  const keys: readonly (keyof BottleneckWeights)[] = ['repairDensity', 'translationRate', 'unresolvedRate', 'inverseFragmentShare'];
  return round4(Math.sqrt(keys.reduce((sum, k) => sum + (a[k] - b[k]) ** 2, 0)));
}

/** Build a progress event from the current iteration result and loop state. */
function buildProgressEvent(
  result: DogfoodIterationResult,
  state: LoopState,
  convergenceReason: ImprovementLoopConvergenceReason,
  iterationDurationMs: number,
  options: DogfoodOptions,
  resolutionByRung?: readonly import('../domain/types/fitness').RungRate[],
  correlations?: readonly import('../domain/types').BottleneckWeightCorrelation[],
): SpeedrunProgressEvent {
  const prevWeights = state.iterations.length > 1
    ? DEFAULT_PIPELINE_CONFIG.bottleneckWeights
    : state.bottleneckWeights;
  const topCorrelation = correlations && correlations.length > 0
    ? correlations.reduce((best, c) =>
        Math.abs(c.correlationWithImprovement) > Math.abs(best.correlationWithImprovement) ? c : best,
      )
    : null;

  return {
    kind: 'speedrun-progress',
    phase: 'iterate',
    iteration: result.iteration,
    maxIterations: options.maxIterations,
    metrics: {
      knowledgeHitRate: result.knowledgeHitRate,
      proposalsActivated: result.proposalsActivated,
      totalSteps: result.totalStepCount,
      unresolvedSteps: result.unresolvedStepCount,
      ...(resolutionByRung ? { resolutionByRung } : {}),
    },
    convergenceReason,
    elapsed: Date.now() - state.startedAt,
    phaseDurationMs: iterationDurationMs,
    wallClockMs: Date.now(),
    seed: options.seed ?? '',
    scenarioCount: result.scenarioIds.length,
    calibration: {
      weights: state.bottleneckWeights,
      weightDrift: weightDrift(state.bottleneckWeights, prevWeights),
      topCorrelation: topCorrelation
        ? { signal: topCorrelation.signal, strength: topCorrelation.correlationWithImprovement }
        : null,
    },
  };
}

function runIteration(iteration: number, options: DogfoodOptions) {
  // On iteration 1, use the configured posture (which may be cold-start).
  // On subsequent iterations, always use warm-start — the loop has activated
  // proposals into the knowledge directory, so we need to read them back.
  const iterationPosture: KnowledgePosture = iteration === 1
    ? (options.knowledgePosture ?? 'warm-start')
    : 'warm-start';

  return Effect.gen(function* () {
    // Step 1: Load catalog once for the iteration (compile-scope: scenarios + knowledge + controls)
    const catalog = yield* loadWorkspaceCatalog({
      paths: options.paths,
      knowledgePosture: iterationPosture,
      scope: 'compile',
    });

    // Step 1b: Refresh tag-matching scenarios. Core compilation (parse, bind,
    // emit) runs concurrently — only the global graph+types derivation is
    // deferred to a single pass afterward.
    const tag = options.tag ?? null;
    const scenarioIds = catalog.scenarios
      .map((entry) => entry.artifact)
      .filter((scenario) => !tag || scenario.metadata.tags.includes(tag))
      .map((scenario) => scenario.source.ado_id);
    const compileConcurrency = resolveEffectConcurrency();
    yield* Effect.all(
      scenarioIds.map((adoId) => refreshScenarioCore({ adoId: adoId as AdoId, paths: options.paths, catalog })),
      { concurrency: compileConcurrency },
    );
    // Single pass for global projections after all scenarios are compiled
    yield* Effect.all({
      graph: buildDerivedGraph({ paths: options.paths }),
      generatedTypes: generateTypes({ paths: options.paths }),
    }, { concurrency: 'unbounded' });

    // Step 2: load a single fresh catalog after refresh, then thread it to all scenario runs.
    // Previously each runScenario call loaded its own catalog — with N scenarios this was N+1 loads.
    // post-run scope suffices: scenarios + knowledge + controls + bound/task + runs + proposals.
    const runCatalog = yield* loadWorkspaceCatalog({
      paths: options.paths,
      knowledgePosture: 'warm-start',
      scope: 'post-run',
    });
    const runResult = yield* runScenarioSelection({
      paths: options.paths,
      catalog: runCatalog,
      tag: options.tag,
      runbookName: options.runbook,
      interpreterMode: options.interpreterMode ?? 'diagnostic',
    });

    // Step 3: collect trace metrics — reuse the post-run catalog already loaded by runScenarioSelection
    const postRunCatalog = runResult.postRunCatalog ?? (yield* loadWorkspaceCatalog({
      paths: options.paths,
      knowledgePosture: 'warm-start',
      scope: 'post-run',
    }));
    const metrics = computeTraceMetrics(postRunCatalog.runRecords as never);

    // Step 3b: compute per-iteration resolution-by-rung breakdown
    const runSteps = (postRunCatalog.runRecords as unknown as ReadonlyArray<{
      readonly artifact: {
        readonly steps: ReadonlyArray<{
          readonly interpretation: Record<string, unknown>;
          readonly execution: Record<string, unknown>;
        }>;
      };
    }>).flatMap((entry) =>
      entry.artifact.steps.map((step) => ({
        interpretation: step.interpretation,
        execution: step.execution,
      })),
    );
    const partialFitness = buildPartialFitnessMetrics({ runSteps: runSteps as never });

    // Step 4: collect and activate pending proposals
    const pendingBundles = collectPendingProposals(
      postRunCatalog.proposalBundles.map((entry) => entry.artifact),
    );
    const resolvedAutoPolicy = options.autoApprovalPolicy ?? {
      ...DEFAULT_AUTO_APPROVAL_POLICY,
      enabled: true,
      profile: 'dogfood',
    };
    const proposalTotals = yield* accumulateProposalTotals(
      pendingBundles,
      options.paths,
      resolvedAutoPolicy,
      postRunCatalog.trustPolicy.artifact,
    );

    // Step 5: cleanup transient artifacts to cap memory growth
    yield* cleanupBetweenIterations(options);

    const result: DogfoodIterationResult = {
      iteration,
      scenarioIds: runResult.selection.adoIds,
      proposalsActivated: proposalTotals.activated,
      proposalsBlocked: proposalTotals.blocked,
      knowledgeHitRate: metrics.avgHitRate,
      unresolvedStepCount: metrics.totalUnresolved,
      totalStepCount: metrics.totalSteps,
      instructionCount: metrics.totalInstructions,
    };

    return { result, partialFitness };
  });
}

function dogfoodMachine(options: DogfoodOptions) {
  return {
    initial: createInitialState(),
    step: (state: LoopState) => Effect.gen(function* () {
      const iteration = state.iterations.length + 1;
      if (iteration > options.maxIterations) {
        return { next: state, done: true };
      }

      const iterationStart = Date.now();
      const { result, partialFitness } = yield* runIteration(iteration, options);
      const iterationDuration = Date.now() - iterationStart;
      const nextCumulativeInstructions = state.cumulativeInstructions + result.instructionCount;
      const prevHitRate = state.iterations.length > 0
        ? state.iterations[state.iterations.length - 1]!.knowledgeHitRate
        : null;

      const convergence = determineConvergenceReason(
        iteration, options.maxIterations, result.proposalsActivated,
        prevHitRate, result.knowledgeHitRate, nextCumulativeInstructions, options,
      );

      // Self-calibrate bottleneck weights from iteration history.
      // Pure state transition: derive correlations from consecutive iteration pairs,
      // then nudge weights in the direction of observed improvement.
      const updatedIterations = [...state.iterations, result];
      const correlations = deriveIterationCorrelations(updatedIterations);
      const calibratedWeights = correlations.length > 0
        ? calibrateWeightsFromCorrelations(state.bottleneckWeights, correlations)
        : state.bottleneckWeights;

      const nextState: LoopState = {
        ...state,
        iterations: updatedIterations,
        cumulativeInstructions: nextCumulativeInstructions,
        converged: convergence.converged,
        convergenceReason: convergence.reason ?? state.convergenceReason,
        bottleneckWeights: calibratedWeights,
      };

      // Emit progress event after each iteration (with calibration observability)
      if (options.onProgress) {
        options.onProgress(buildProgressEvent(
          result,
          nextState,
          nextState.convergenceReason,
          iterationDuration,
          options,
          partialFitness.resolutionByRung,
          correlations,
        ));
      }

      return { next: nextState, done: convergence.converged || convergence.reason === 'max-iterations' };
    }),
  };
}

function buildLedger(state: LoopState, options: DogfoodOptions): ImprovementLoopLedger<'improvement-loop-ledger'> {
  const firstRate = state.iterations[0]?.knowledgeHitRate ?? 0;
  const lastRate = state.iterations.length > 0
    ? state.iterations[state.iterations.length - 1]!.knowledgeHitRate
    : 0;

  return {
    kind: 'improvement-loop-ledger',
    version: 1,
    maxIterations: options.maxIterations,
    completedIterations: state.iterations.length,
    converged: state.converged,
    convergenceReason: state.convergenceReason,
    iterations: state.iterations,
    totalProposalsActivated: state.iterations.reduce((sum, it) => sum + it.proposalsActivated, 0),
    totalInstructionCount: state.cumulativeInstructions,
    knowledgeHitRateDelta: round4(lastRate - firstRate),
  };
}

export function runDogfoodLoop(options: DogfoodOptions) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const finalState = yield* runStateMachine(dogfoodMachine(options));
    const ledger = asImprovementLoopLedger(buildLedger(finalState, options));
    const compatibilityLedger = asDogfoodLedgerProjection(ledger);

    const ledgerPath = improvementLoopLedgerPath(options.paths);
    const compatibilityLedgerPath = `${options.paths.rootDir}/.tesseract/runs/dogfood-ledger.json`;
    yield* fs.ensureDir(options.paths.runsDir);
    yield* Effect.all([
      fs.writeJson(ledgerPath, ledger),
      fs.writeJson(compatibilityLedgerPath, compatibilityLedger),
    ], { concurrency: 'unbounded' });

    return { ledger, ledgerPath, compatibilityLedger, compatibilityLedgerPath };
  });
}
