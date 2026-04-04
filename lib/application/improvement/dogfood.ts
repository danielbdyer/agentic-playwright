import path from 'path';
import { Effect } from 'effect';
import { activateProposalBundle, autoApproveEligibleProposals, quarantineToxicProposals, tryActivateProposal } from '../governance/activate-proposals';
import { isPending, isActivated } from '../../domain/governance/proposal-lifecycle';
import { deltaReloadProposalsAndRuns, loadWorkspaceCatalog } from '../catalog';
import { buildPartialFitnessMetrics } from '../analysis/fitness';
import { calibrateWeightsFromCorrelations } from '../learning/learning-bottlenecks';
import { aggregateLearningState, type LearningState } from '../learning/learning-state';
import { buildExecutionCoherence } from '../intelligence/execution-coherence';
import { signalMaturity, buildLearningSignalsSummary, countDegradingSignals } from '../learning/signal-maturation';
import { emitAgentWorkbench, processWorkItems, emitInterventionLineage } from '../agent/agent-workbench';
import { createDashboardDecider } from '../agent/dashboard-decider';
import { createDualModeDecider, createAgentDecider } from '../agent/agent-decider';
import type { AgentWorkItem, BottleneckWeightCorrelation, WorkItemCompletion } from '../../domain/types';
import { detectAliasConflicts } from '../../domain/knowledge/inference';
import { dashboardEvent } from '../../domain/types/intervention-context';
import type { DashboardPort } from '../ports';
import { Dashboard } from '../ports';
import { improvementLoopLedgerPath, type ProjectPaths } from '../paths';
import { compileScenariosParallel } from '../execution/compile';
import { runScenarioSelection } from '../execution/run';
import { FileSystem } from '../ports';
import { runStateMachine } from '../execution/state-machine';
import { pruneTranslationCache } from '../execution/translation/translation-cache';
import { round4 } from '../learning/learning-shared';
import type { BrowserPoolPort, BrowserPoolStats } from '../runtime-support/browser-pool';
import {
  readSemanticDictionary,
  writeSemanticDictionary,
  decayUnusedEntries,
} from '../execution/translation/semantic-translation-dictionary';
import {
  type ConvergenceState,
  initialConvergenceState,
  isTerminal,
  transitionConvergence,
} from '../../domain/projection/convergence-fsm';
import type { AdoId } from '../../domain/kernel/identity';
import { groupBy } from '../../domain/kernel/collections';
import { asDogfoodLedgerProjection, asImprovementLoopLedger, DEFAULT_PIPELINE_CONFIG } from '../../domain/types';
import type {
  AutoApprovalPolicy,
  BottleneckWeights,
  DogfoodLedgerProjection,
  ImprovementLoopLedger,
  ImprovementLoopConvergenceReason,
  ImprovementLoopIteration,
  KnowledgePosture,
  LearningSignalsSummary,
  ProposalBundle,
  SpeedrunProgressEvent,
  TrustPolicy,
} from '../../domain/types';
import { DEFAULT_AUTO_APPROVAL_POLICY } from '../../domain/governance/trust-policy';
import { matureComponentKnowledge, type ComponentEvidence } from '../../domain/projection/component-maturation';
import { aggregateQualityMetrics, findToxicAliases, type AliasOutcome } from '../../domain/governance/proposal-quality';
import type { RungRate } from '../../domain/types/improvement-context';
import type { ScreenGroupDecider, WorkItemDecider } from '../agent/agent-workbench';

export type DogfoodIterationResult = ImprovementLoopIteration;
export type DogfoodLedger = DogfoodLedgerProjection;

export interface DogfoodOptions {
  readonly paths: ProjectPaths;
  readonly maxIterations: number;
  readonly convergenceThreshold?: number | undefined;
  readonly maxInstructionCount?: number | undefined;
  readonly tag?: string | undefined;
  readonly runbook?: string | undefined;
  readonly interpreterMode?: 'dry-run' | 'diagnostic' | 'playwright' | undefined;
  readonly autoApprovalPolicy?: AutoApprovalPolicy | undefined;
  /** When provided, process work items between iterations (inter-iteration act loop).
   *  The decider is invoked per screen group after each iteration's workbench is emitted.
   *  This enables the agent to act on hotspots/proposals before the next iteration runs. */
  readonly actBetweenIterations?: {
    readonly decider?: WorkItemDecider;
    readonly screenGroupDecider?: ScreenGroupDecider;
    readonly maxItemsPerIteration?: number;
    readonly onItemProcessed?: (item: AgentWorkItem, completion: WorkItemCompletion) => void;
  } | undefined;
  /** Dashboard port for dual-mode decider integration.
   *  When provided alongside mcpInvokeTool, creates a dual-mode decider:
   *  agent handles routine decisions (>=0.8 confidence), human handles ambiguous ones. */
  readonly dashboard?: DashboardPort | undefined;
  /** MCP tool invocation callback for the agent decider.
   *  When provided alongside dashboard, enables the outer agent to make decisions
   *  via structured MCP tools instead of human clicks. */
  readonly mcpInvokeTool?: ((toolName: string, args: Record<string, unknown>) => Promise<unknown>) | undefined;
  /** Knowledge posture for catalog loading. Defaults to 'warm-start'. */
  readonly knowledgePosture?: KnowledgePosture | undefined;
  /** Pre-calibrated bottleneck weights from prior experiment correlations.
   *  When provided, seeds the loop with learned weights instead of defaults. */
  readonly initialBottleneckWeights?: BottleneckWeights | undefined;
  /** Base URL of the SUT for Playwright execution (e.g., http://127.0.0.1:3200).
   *  Required when interpreterMode is 'playwright'. */
  readonly baseUrl?: string | undefined;
  /** Browser pool for page reuse across scenarios within iterations.
   *  When provided, the runner acquires/releases pages instead of launching new browsers.
   *  The pool lifecycle is managed by the caller (created before loop, closed after). */
  readonly browserPool?: BrowserPoolPort | undefined;
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
  /** Typed convergence FSM state, threaded through iterations. */
  readonly convergenceFsm: ConvergenceState;
  /** Accumulated learning state from intelligence modules, threaded through iterations.
   *  Each iteration refines this by feeding step execution receipts into the aggregator.
   *  Null on first iteration or when no receipts are available. */
  readonly learningState: LearningState | null;
  /** Snapshot of browser pool stats after each iteration (when pool is available). */
  readonly browserPoolStats: BrowserPoolStats | null;
  /** Hot screens from execution coherence — screens with multiple degraded signal
   *  dimensions. Threaded to the next iteration's scenario selection for prioritization. */
  readonly hotScreens: readonly string[];
}

function createInitialState(priorLearningState?: LearningState | null, initialBottleneckWeights?: BottleneckWeights): LoopState {
  return {
    iterations: [],
    cumulativeInstructions: 0,
    converged: false,
    convergenceReason: null,
    startedAt: Date.now(),
    bottleneckWeights: initialBottleneckWeights ?? DEFAULT_PIPELINE_CONFIG.bottleneckWeights,
    convergenceFsm: initialConvergenceState(),
    learningState: priorLearningState ?? null,
    browserPoolStats: null,
    hotScreens: [],
  };
}

/** Load persisted learning state from a prior invocation. Returns null if none exists. */
function loadPersistedLearningState(paths: ProjectPaths) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const raw = yield* fs.readJson(paths.execution.learningStatePath).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    );
    if (!raw || typeof raw !== 'object' || (raw as Record<string, unknown>).kind !== 'learning-state') {
      return null;
    }
    return raw as LearningState;
  });
}

function collectPendingProposals(bundles: readonly ProposalBundle[]): readonly ProposalBundle[] {
  return bundles.filter((bundle) =>
    bundle.payload.proposals.some((proposal) => isPending(proposal.activation)),
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
 *  Pure function: maps iteration metrics to weighted bottleneck signals.
 *  When learningSignals are present on the iteration, enriches with 7 maturity-dampened
 *  health dimensions (selector flakiness, timing regression, etc.). */
export function iterationSignalStrengths(iteration: DogfoodIterationResult): readonly { readonly signal: string; readonly strength: number }[] {
  const unresolvedRate = iteration.totalStepCount > 0
    ? iteration.unresolvedStepCount / iteration.totalStepCount
    : 0;
  const baseSignals = [
    { signal: 'high-unresolved-rate', strength: unresolvedRate },
    { signal: 'repair-recovery-hotspot', strength: iteration.proposalsActivated > 0 ? 0.3 : 0 },
    { signal: 'translation-fallback-dominant', strength: unresolvedRate > 0.5 ? 0.2 : 0 },
    { signal: 'thin-screen-coverage', strength: unresolvedRate > 0.3 ? 0.1 : 0 },
  ];

  const ls = iteration.learningSignals;
  if (!ls) return baseSignals.filter(({ strength }) => strength > 0);

  // Dampen health signals by iteration maturity — early signals have low weight
  const maturity = signalMaturity(iteration.iteration);
  const healthSignals = [
    { signal: 'selector-flakiness', strength: round4(ls.selectorFlakinessRate * maturity) },
    { signal: 'timing-regression', strength: round4(ls.timingRegressionRate * maturity) },
    { signal: 'console-noise', strength: round4(ls.consoleNoiseLevel * maturity) },
    { signal: 'cost-anomaly', strength: round4((1 - ls.costEfficiency) * maturity) },
    { signal: 'rung-degradation', strength: round4((1 - ls.rungStability) * maturity) },
    { signal: 'recovery-inefficiency', strength: round4((1 - ls.recoveryEfficiency) * maturity) },
    { signal: 'component-maturation-stall', strength: round4((1 - ls.componentMaturityRate) * maturity) },
  ];

  return [...baseSignals, ...healthSignals].filter(({ strength }) => strength > 0);
}

/** Zip consecutive items into (current, next) tuples for fold analysis over adjacent pairs. */
export function consecutivePairs<T>(items: readonly T[]): readonly (readonly [T, T])[] {
  return items.slice(0, -1).map((item, index) => [item, items[index + 1]!] as const);
}

export function deriveIterationCorrelations(
  iterations: readonly DogfoodIterationResult[],
): readonly BottleneckWeightCorrelation[] {
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

/**
 * Extract component evidence from run steps for maturation analysis.
 *
 * Maps (widgetContract, action, failure.family) from each step's execution
 * and interpretation receipts into ComponentEvidence records.
 *
 * Pure function: run records in, evidence list out.
 */
function extractComponentEvidence(runRecords: ReadonlyArray<{
  readonly artifact: {
    readonly steps: ReadonlyArray<{
      readonly interpretation: { readonly target?: { readonly action?: string | null } | null };
      readonly execution: {
        readonly widgetContract?: string | null;
        readonly failure: { readonly family: string };
      };
    }>;
  };
}>): readonly ComponentEvidence[] {
  const evidenceMap = runRecords
    .flatMap((entry) => entry.artifact.steps)
    .filter((step) => step.execution.widgetContract)
    .reduce<ReadonlyMap<string, ComponentEvidence>>(
      (acc, step) => {
        const componentType = step.execution.widgetContract!;
        const action = step.interpretation.target?.action ?? 'unknown';
        const isSuccess = step.execution.failure.family === 'none';
        const existing = acc.get(componentType);
        return new Map([...acc, [componentType, existing
          ? {
              componentType,
              actions: [...new Set([...existing.actions, action])].sort(),
              successCount: existing.successCount + (isSuccess ? 1 : 0),
              totalAttempts: existing.totalAttempts + 1,
            }
          : {
              componentType,
              actions: [action],
              successCount: isSuccess ? 1 : 0,
              totalAttempts: 1,
            },
        ]]);
      },
      new Map(),
    );
  return [...evidenceMap.values()];
}

/**
 * Extract alias outcomes from proposal bundles for quality classification.
 *
 * Maps activated proposals with their cross-run success/failure data into
 * AliasOutcome records for quality analysis (healthy/suspect/toxic).
 *
 * Pure function: bundles + run records in, alias outcomes out.
 */
function extractAliasOutcomes(
  bundles: readonly ProposalBundle[],
  runCount: number,
): readonly AliasOutcome[] {
  return bundles
    .flatMap((bundle) => bundle.payload.proposals)
    .flatMap((proposal) => isActivated(proposal.activation) ? [proposal] : [])
    .map((proposal): AliasOutcome => ({
      aliasId: proposal.proposalId,
      screenId: proposal.targetPath,
      elementId: proposal.title,
      proposedBy: proposal.artifactType,
      suggestedAt: proposal.activation.activatedAt ?? '',
      usedInRuns: runCount,
      misdirectionCount: proposal.certification === 'uncertified' ? 1 : 0,
      successCount: proposal.certification === 'certified' ? runCount : 0,
    }));
}

function accumulateProposalTotals(
  pendingBundles: readonly ProposalBundle[],
  paths: ProjectPaths,
  autoApprovalPolicy?: AutoApprovalPolicy | undefined,
  trustPolicy?: TrustPolicy | undefined,
  bottleneckWeights?: BottleneckWeights | undefined,
  aliasOutcomes?: readonly AliasOutcome[] | undefined,
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
              aliasOutcomes,
              bottleneckWeights,
            })
          : activateProposalBundle({ paths, proposalBundle: bundle }),
      ),
      { concurrency: 'unbounded' },
    );
    const totals = results.reduce(
      (acc, result) => ({
        activated: acc.activated + result.activatedPaths.length,
        blocked: acc.blocked + result.blockedProposalIds.length,
      }),
      { activated: 0, blocked: 0 },
    );

    // Layer 2: emit proposal-activated for each bundle's results
    const dashboard = yield* Dashboard;
    for (const result of results) {
      for (const activatedPath of result.activatedPaths) {
        yield* dashboard.emit(dashboardEvent('proposal-activated', {
          proposalId: activatedPath,
          artifactType: 'elements',
          targetPath: activatedPath,
          status: 'activated',
          confidence: 0.8,
          iteration: 0,
        }));
      }
      for (const blockedId of result.blockedProposalIds) {
        yield* dashboard.emit(dashboardEvent('proposal-activated', {
          proposalId: blockedId,
          artifactType: 'elements',
          targetPath: blockedId,
          status: 'blocked',
          confidence: 0,
          iteration: 0,
        }));
      }
    }

    return totals;
  });
}

/** Wipe transient artifacts between iterations to cap memory and disk growth.
 *  Also applies confidence decay to unused semantic dictionary entries. */
function cleanupBetweenIterations(options: DogfoodOptions, iterationStartTime: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const sessionsDir = path.join(options.paths.rootDir, '.tesseract', 'sessions');
    const evidenceRunsDir = path.join(options.paths.rootDir, '.tesseract', 'evidence', 'runs');
    yield* Effect.all(
      [sessionsDir, evidenceRunsDir, options.paths.decisionsDir].map((dir) => fs.removeDir(dir)),
      { concurrency: 'unbounded' },
    );
    // Prune translation cache to keep disk bounded across iterations
    yield* pruneTranslationCache({ paths: options.paths, maxEntries: 200 });
    // Decay unused semantic dictionary entries to prevent stale mappings
    yield* decaySemanticDictionaryEntries(options.paths, iterationStartTime);
  });
}

/** Apply confidence decay to semantic dictionary entries not used in this iteration. */
function decaySemanticDictionaryEntries(paths: ProjectPaths, iterationStartTime: string) {
  return Effect.gen(function* () {
    const catalog = yield* readSemanticDictionary(paths);
    const decayed = decayUnusedEntries(catalog, iterationStartTime);
    if (decayed.entries.length !== catalog.entries.length || decayed.summary.averageConfidence !== catalog.summary.averageConfidence) {
      yield* writeSemanticDictionary(paths, decayed);
    }
  }).pipe(Effect.catchAll(() => Effect.void));
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
  resolutionByRung?: readonly RungRate[],
  correlations?: readonly BottleneckWeightCorrelation[],
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
    ...(result.learningSignals ? {
      executionHealth: {
        healthScore: result.learningSignals.compositeHealthScore,
        degradingDimensions: getDegradingDimensionNames(result.learningSignals),
        maturity: signalMaturity(result.iteration),
      },
    } : {}),
  };
}

function getDegradingDimensionNames(ls: LearningSignalsSummary): readonly string[] {
  const dims: string[] = [];
  if (ls.timingRegressionRate > 0.3) dims.push('timingRegression');
  if (ls.selectorFlakinessRate > 0.3) dims.push('selectorFlakiness');
  if (ls.consoleNoiseLevel > 0.3) dims.push('consoleNoise');
  if (ls.recoveryEfficiency < 0.5) dims.push('recoveryEfficiency');
  if (ls.costEfficiency < 0.5) dims.push('costEfficiency');
  if (ls.rungStability < 0.5) dims.push('rungStability');
  if (ls.componentMaturityRate < 0.5) dims.push('componentMaturity');
  return dims;
}

function runIteration(iteration: number, options: DogfoodOptions, state: LoopState) {
  // On iteration 1, use the configured posture (which may be cold-start).
  // On subsequent iterations, always use warm-start — the loop has activated
  // proposals into the knowledge directory, so we need to read them back.
  const iterationPosture: KnowledgePosture = iteration === 1
    ? (options.knowledgePosture ?? 'warm-start')
    : 'warm-start';

  return Effect.gen(function* () {
    const iterationStartTime = new Date().toISOString();
    // Step 1: Load catalog once for the iteration (compile-scope: scenarios + knowledge + controls)
    const catalog = yield* loadWorkspaceCatalog({
      paths: options.paths,
      knowledgePosture: iterationPosture,
      scope: 'compile',
    });

    // Step 1b: Refresh tag-matching scenarios with bounded concurrency.
    // compileScenariosParallel handles per-scenario compilation + global
    // graph/types derivation in a single call.
    const tag = options.tag ?? null;
    const scenarioIds = catalog.scenarios
      .flatMap((entry) => !tag || entry.artifact.metadata.tags.includes(tag) ? [entry.artifact.source.ado_id] : []) as readonly AdoId[];
    yield* compileScenariosParallel({
      scenarioIds,
      paths: options.paths,
      catalog,
    });

    // Step 2: load a single fresh catalog after refresh, then thread it to all scenario runs.
    // Previously each runScenario call loaded its own catalog — with N scenarios this was N+1 loads.
    // post-run scope suffices: scenarios + knowledge + controls + bound/task + runs + proposals.
    const runCatalog = yield* loadWorkspaceCatalog({
      paths: options.paths,
      knowledgePosture: 'warm-start',
      scope: 'post-run',
    });
    const effectiveMode = options.interpreterMode ?? 'playwright';
    const runResult = yield* runScenarioSelection({
      paths: options.paths,
      catalog: runCatalog,
      tag: options.tag,
      runbookName: options.runbook,
      interpreterMode: effectiveMode,
      baseUrl: options.baseUrl,
      priorityScreens: state.hotScreens.length > 0 ? state.hotScreens : undefined,
    });

    // Step 3: collect trace metrics — delta-reload only proposals + run records
    // instead of full post-run catalog reload (saves 30-40% I/O at scale).
    const postRunCatalog = runResult.postRunCatalog ?? (yield* deltaReloadProposalsAndRuns(runCatalog));
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

    // Step 3c: component maturation — extract widget interaction evidence and produce proposals
    const componentEvidence = extractComponentEvidence(postRunCatalog.runRecords as never);
    const componentProposals = matureComponentKnowledge(componentEvidence);

    // Step 3d: aggregate learning state from all intelligence modules
    const executionReceipts = (postRunCatalog.runRecords as unknown as ReadonlyArray<{
      readonly artifact: { readonly steps: ReadonlyArray<{ readonly execution: import('../../domain/types').StepExecutionReceipt }> };
    }>).flatMap((entry) => entry.artifact.steps.map((step) => step.execution));
    const updatedLearningState = aggregateLearningState(executionReceipts, state.learningState);
    const coherence = buildExecutionCoherence({ learningState: updatedLearningState });
    const learningSignals = buildLearningSignalsSummary(
      updatedLearningState.signals,
      coherence.compositeHealthScore,
      coherence.hotScreens.length,
    );

    // Step 3e: proposal quality metrics — classify alias outcomes across runs
    const allBundles = postRunCatalog.proposalBundles.map((entry) => entry.artifact);
    const aliasOutcomes = extractAliasOutcomes(allBundles, iteration);
    const proposalQuality = aggregateQualityMetrics(aliasOutcomes);

    // Step 3f: quarantine toxic aliases — remove them from hints files
    // so they stop misdirecting resolution in future iterations.
    const toxicAliases = findToxicAliases(aliasOutcomes);
    const quarantineResult = yield* quarantineToxicProposals({
      paths: options.paths,
      toxicAliases,
    });
    if (quarantineResult.quarantinedCount > 0) {
      const qDashboard = yield* Dashboard;
      yield* qDashboard.emit(dashboardEvent('proposal-quarantined', {
        iteration,
        quarantinedCount: quarantineResult.quarantinedCount,
        quarantinedPaths: quarantineResult.quarantinedPaths,
      }));
    }

    // Step 3g (E4): Knowledge conflict detection — find aliases that map to
    // multiple different elements. These create ambiguous resolution and should
    // be flagged for the agent to resolve. On warm-start especially, stale or
    // conflicting aliases degrade resolution quality.
    const screenHintsMap: Record<string, import('../../domain/types').ScreenHints> = {};
    for (const hintsEnvelope of postRunCatalog.screenHints) {
      screenHintsMap[hintsEnvelope.artifact.screen] = hintsEnvelope.artifact;
    }
    const aliasConflicts = detectAliasConflicts(screenHintsMap);
    if (aliasConflicts.length > 0) {
      const cDashboard = yield* Dashboard;
      yield* cDashboard.emit(dashboardEvent('diagnostics', {
        phase: 'alias-conflict-detection',
        iteration,
        conflictCount: aliasConflicts.length,
        conflicts: aliasConflicts.slice(0, 10).map((c) => ({
          alias: c.alias,
          mappings: c.mappings,
        })),
      }));
    }

    // Step 4: collect and activate pending proposals (with bottleneck weights + toxic gate)
    const proposalsGenerated = allBundles.reduce((sum, bundle) => sum + bundle.payload.proposals.length, 0);
    // Count proposals already activated during the run phase — these were
    // written to knowledge files by activateProposalBundle() in run.ts and
    // are the primary vehicle for learning. The dogfood loop's second-pass
    // activation only catches stragglers.
    const runPhaseActivated = allBundles.reduce(
      (sum, bundle) => sum + bundle.payload.proposals.filter((p) => isActivated(p.activation)).length,
      0,
    );
    const pendingBundles = collectPendingProposals(allBundles);
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
      state.bottleneckWeights,
      aliasOutcomes,
    );

    // Step 4a½: emit component maturation and proposal quality diagnostics
    const iterationDashboard = yield* Dashboard;
    if (componentProposals.length > 0 || proposalQuality.toxicCount > 0) {
      yield* iterationDashboard.emit(dashboardEvent('diagnostics', {
        phase: 'component-maturation',
        iteration,
        componentProposals: componentProposals.map((p) => ({
          componentType: p.componentType,
          suggestedActions: p.suggestedActions,
          confidence: round4(p.confidence),
        })),
        proposalQuality: {
          totalAliases: proposalQuality.totalAliases,
          healthyCount: proposalQuality.healthyCount,
          suspectCount: proposalQuality.suspectCount,
          toxicCount: proposalQuality.toxicCount,
          misdirectionRate: round4(proposalQuality.misdirectionRate),
        },
      }));
    }

    // Step 4b: emit agent workbench (structured work items for agent consumption)
    yield* emitAgentWorkbench({ paths: options.paths, catalog: postRunCatalog, iteration, learningSignals });

    // Step 4c: inter-iteration act loop — process work items before next iteration
    // Resolve decider: dual-mode (agent + human) > explicit > none
    const resolvedDecider = options.actBetweenIterations?.decider
      ?? (options.dashboard && options.mcpInvokeTool
        ? createDualModeDecider({
            humanDecider: createDashboardDecider(options.dashboard),
            agentDecider: createAgentDecider({ invokeTool: options.mcpInvokeTool }),
          })
        : options.dashboard
          ? createDashboardDecider(options.dashboard)
          : undefined);

    // Always run the act loop: defaultWorkItemDecider auto-approves proposals
    // and provides audit trail. When dashboard/mcpInvokeTool are present, the
    // resolvedDecider handles real-time agent/human decisions instead.
    {
      const actOpts = options.actBetweenIterations ?? {};
      const actResult = yield* processWorkItems({
        paths: options.paths,
        maxItems: actOpts.maxItemsPerIteration ?? 10,
        ...(resolvedDecider ? { decider: resolvedDecider } : {}),
        ...(actOpts.screenGroupDecider ? { screenGroupDecider: actOpts.screenGroupDecider } : {}),
        ...(actOpts.onItemProcessed ? { onItemProcessed: actOpts.onItemProcessed } : {}),
      });

      // Step 4c½: close the activation loop — activate proposals approved by the act loop.
      // The act loop records decisions as workbench completions (bookkeeping), but proposals
      // are only written to disk by activateProposalBundle/tryActivateProposal. This step
      // bridges the gap: approved work items → actual knowledge activation.
      const approvedCompletionIds = new Set(
        actResult.completions
          .filter((c) => c.status === 'completed')
          .map((c) => c.workItemId),
      );
      if (approvedCompletionIds.size > 0 && pendingBundles.length > 0) {
        const fs = yield* FileSystem;
        const activatedAt = new Date().toISOString();
        const stillPending = pendingBundles.flatMap((bundle) =>
          bundle.payload.proposals.filter((p) => isPending(p.activation)),
        );
        const actLoopActivated = yield* Effect.forEach(
          stillPending,
          (proposal) => tryActivateProposal(fs, options.paths.suiteRoot, proposal, activatedAt),
          { concurrency: 5 },
        );
        const actLoopActivatedCount = actLoopActivated.filter((r) => !r.blocked).length;
        if (actLoopActivatedCount > 0) {
          yield* iterationDashboard.emit(dashboardEvent('proposal-activated', {
            phase: 'act-loop-feedback',
            iteration,
            activatedCount: actLoopActivatedCount,
          }));
        }
      }

      // Step 4d: emit intervention lineage (cross-iteration feedback arc)
      if (actResult.completions.length > 0) {
        yield* emitInterventionLineage({
          paths: options.paths,
          iteration,
          completions: actResult.completions,
          workItems: [],
        });
      }
    }

    // Step 5: cleanup transient artifacts to cap memory growth
    yield* cleanupBetweenIterations(options, iterationStartTime);

    const result: DogfoodIterationResult = {
      iteration,
      scenarioIds: runResult.selection.adoIds,
      proposalsGenerated,
      proposalsActivated: runPhaseActivated + proposalTotals.activated,
      proposalsBlocked: proposalTotals.blocked,
      knowledgeHitRate: metrics.avgHitRate,
      unresolvedStepCount: metrics.totalUnresolved,
      totalStepCount: metrics.totalSteps,
      instructionCount: metrics.totalInstructions,
      learningSignals,
    };

    return { result, partialFitness, learningState: updatedLearningState, hotScreens: coherence.hotScreens };
  });
}

function dogfoodMachine(options: DogfoodOptions, priorLearningState?: LearningState | null) {
  return {
    initial: createInitialState(priorLearningState, options.initialBottleneckWeights),
    step: (state: LoopState) => Effect.gen(function* () {
      const iteration = state.iterations.length + 1;
      if (iteration > options.maxIterations) {
        return { next: state, done: true };
      }

      const dashboard = yield* Dashboard;

      // Emit iteration-start
      yield* dashboard.emit(dashboardEvent('iteration-start', {
        iteration, maxIterations: options.maxIterations,
      }));

      const iterationStart = Date.now();
      const { result, partialFitness, learningState: iterationLearning, hotScreens: iterationHotScreens } = yield* runIteration(iteration, options, state);
      const iterationDuration = Date.now() - iterationStart;
      const nextCumulativeInstructions = state.cumulativeInstructions + result.instructionCount;
      const prevHitRate = state.iterations.length > 0
        ? state.iterations[state.iterations.length - 1]!.knowledgeHitRate
        : null;

      // Drive the convergence FSM with typed events from this iteration.
      const hitRateDelta = prevHitRate !== null ? result.knowledgeHitRate - prevHitRate : result.knowledgeHitRate;
      const afterIteration = transitionConvergence(state.convergenceFsm, {
        kind: 'iteration-complete',
        proposalsGenerated: result.proposalsGenerated,
        proposalsActivated: result.proposalsActivated,
        hitRateDelta,
        ...(options.convergenceThreshold !== undefined ? { convergenceThreshold: options.convergenceThreshold } : {}),
      });
      const afterBudget = options.maxInstructionCount !== undefined
        ? transitionConvergence(afterIteration, {
            kind: 'budget-check',
            instructionsUsed: nextCumulativeInstructions,
            maxInstructions: options.maxInstructionCount,
          })
        : afterIteration;
      const afterLimit = transitionConvergence(afterBudget, {
        kind: 'iteration-limit',
        current: iteration,
        max: options.maxIterations,
      });
      // Feed learning signals into FSM — prevents premature convergence
      // when hit rate improves but underlying execution quality degrades.
      const afterLearning = result.learningSignals
        ? transitionConvergence(afterLimit, {
            kind: 'learning-signal',
            degradingCount: countDegradingSignals(result.learningSignals),
            maturity: signalMaturity(iteration),
          })
        : afterLimit;
      // Feed browser pool health into FSM — high overflow rate prevents
      // premature convergence when the pool is exhausted under load.
      const poolStats = options.browserPool?.stats ?? null;
      const nextFsm = poolStats && poolStats.totalAcquired > 0
        ? transitionConvergence(afterLearning, {
            kind: 'browser-health',
            overflowRate: round4(poolStats.totalOverflow / poolStats.totalAcquired),
            reuseRate: round4(1 - poolStats.totalOverflow / poolStats.totalAcquired),
          })
        : afterLearning;
      const convergence = isTerminal(nextFsm)
        ? { converged: true, reason: nextFsm.reason as ImprovementLoopConvergenceReason }
        : { converged: false, reason: null as ImprovementLoopConvergenceReason };

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
        convergenceFsm: nextFsm,
        learningState: iterationLearning,
        browserPoolStats: poolStats,
        hotScreens: iterationHotScreens,
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

      // ─── Dashboard events: iteration lifecycle + convergence signals ───

      // Layer 1: iteration-complete
      yield* dashboard.emit(dashboardEvent('iteration-complete', {
        iteration,
        durationMs: iterationDuration,
        knowledgeHitRate: result.knowledgeHitRate,
        proposalsActivated: result.proposalsActivated,
        proposalsBlocked: result.proposalsBlocked,
        converged: convergence.converged,
        convergenceReason: convergence.reason,
      }));

      // Layer 1: fitness-updated
      yield* dashboard.emit(dashboardEvent('fitness-updated', {
        iteration,
        knowledgeHitRate: result.knowledgeHitRate,
        unresolvedStepCount: result.unresolvedStepCount,
        totalStepCount: result.totalStepCount,
      }));

      // Layer 2: rung-shift — resolution distribution for learning trajectory visualization
      if (partialFitness.resolutionByRung.length > 0) {
        yield* dashboard.emit(dashboardEvent('rung-shift', {
          iteration,
          distribution: partialFitness.resolutionByRung,
          knowledgeHitRate: result.knowledgeHitRate,
          totalSteps: result.totalStepCount,
        }));
      }

      // Layer 2: calibration-update — self-calibrating bottleneck weights
      yield* dashboard.emit(dashboardEvent('calibration-update', {
        iteration,
        weights: calibratedWeights,
        weightDrift: weightDrift(state.bottleneckWeights, calibratedWeights),
        correlations: correlations.map((c) => ({ signal: c.signal, strength: c.correlationWithImprovement })),
      }));

      // Layer 2: learning-signals — execution health from intelligence modules
      if (result.learningSignals) {
        yield* dashboard.emit(dashboardEvent('learning-signals', {
          iteration,
          signals: result.learningSignals,
          compositeHealth: result.learningSignals.compositeHealthScore,
          maturity: signalMaturity(iteration),
        }));
      }

      // Layer 2: browser-pool-health — pool reuse efficiency
      if (poolStats) {
        yield* dashboard.emit(dashboardEvent('browser-pool-health', {
          iteration,
          stats: poolStats,
          overflowRate: poolStats.totalAcquired > 0
            ? round4(poolStats.totalOverflow / poolStats.totalAcquired)
            : 0,
          reuseRate: poolStats.totalAcquired > 0
            ? round4(1 - poolStats.totalOverflow / poolStats.totalAcquired)
            : 0,
        }));
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
    // Load persisted learning state from prior invocation for cross-session continuity
    const priorLearningState = yield* loadPersistedLearningState(options.paths);
    const finalState = yield* runStateMachine(dogfoodMachine(options, priorLearningState));
    const ledger = asImprovementLoopLedger(buildLedger(finalState, options));
    const compatibilityLedger = asDogfoodLedgerProjection(ledger);

    const ledgerPath = improvementLoopLedgerPath(options.paths);
    const compatibilityLedgerPath = `${options.paths.rootDir}/.tesseract/runs/dogfood-ledger.json`;
    yield* fs.ensureDir(options.paths.runsDir);
    const writes = [
      fs.writeJson(ledgerPath, ledger),
      fs.writeJson(compatibilityLedgerPath, compatibilityLedger),
    ];
    // Persist accumulated learning state for cross-run accumulation
    if (finalState.learningState) {
      const learningDir = path.dirname(options.paths.execution.learningStatePath);
      writes.push(
        Effect.gen(function* () {
          yield* fs.ensureDir(learningDir);
          yield* fs.writeJson(options.paths.execution.learningStatePath, finalState.learningState);
        }),
      );
    }
    yield* Effect.all(writes, { concurrency: 'unbounded' });

    return { ledger, ledgerPath, compatibilityLedger, compatibilityLedgerPath };
  });
}
