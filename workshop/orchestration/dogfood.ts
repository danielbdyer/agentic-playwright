import path from 'path';
import { Effect } from 'effect';
import { activateProposalBundle, autoApproveEligibleProposals, quarantineToxicProposals, tryActivateProposal } from '../../product/application/knowledge/activate-proposals';
import { isActivated, isPending } from '../../product/domain/proposal/lifecycle';
import { deltaReloadProposalsAndRuns, loadWorkspaceCatalog } from '../../product/application/catalog';
import { buildPartialFitnessMetrics } from './fitness';
import { calibrateWeightsFromCorrelations } from '../../product/application/learning/learning-bottlenecks';
import { aggregateLearningState, type LearningState } from '../../product/application/learning/learning-state';
import { buildExecutionCoherence } from '../../product/application/drift/execution-coherence';
import { signalMaturity, buildLearningSignalsSummary, countDegradingSignals } from '../../product/application/learning/signal-maturation';
import { emitAgentWorkbench, processWorkItems, emitInterventionLineage } from '../../product/application/agency/agent-workbench';
import { createDashboardDecider } from '../../product/application/agency/dashboard-decider';
import { createDualModeDecider, createAgentDecider } from '../../product/application/agency/agent-decider';
import type { BottleneckWeightCorrelation } from '../../product/domain/fitness/types';
import type { AgentWorkItem, WorkItemCompletion } from '../../product/domain/handshake/workbench';
import { detectAliasConflicts } from '../../product/domain/knowledge/inference';
import { dashboardEvent } from '../../product/domain/observation/dashboard';
import type { DashboardPort } from '../../product/application/ports';
import { Dashboard } from '../../product/application/ports';
import { improvementLoopLedgerPath, type ProjectPaths } from '../../product/application/paths';
import { compileScenariosParallel } from '../../product/application/resolution/compile';
import { runScenarioSelection } from '../../product/application/commitment/run';
import { FileSystem } from '../../product/application/ports';
import { runStateMachine } from '../../product/application/resilience/state-machine';
import { pruneTranslationCache } from '../../product/reasoning/translation-cache';
import { round4 } from '../../product/application/learning/learning-shared';
import type { BrowserPoolPort, BrowserPoolStats } from '../../product/application/runtime-support/browser-pool';
import {
  readSemanticDictionary,
  writeSemanticDictionary,
  decayUnusedEntries,
} from '../../product/reasoning/semantic-translation-dictionary';
import {
  type ConvergenceState,
  initialConvergenceState,
  isTerminal,
  transitionConvergence,
} from '../../product/domain/projection/convergence-fsm';
import type { AdoId } from '../../product/domain/kernel/identity';
import { groupBy } from '../../product/domain/kernel/collections';
import { DEFAULT_PIPELINE_CONFIG } from '../../product/domain/attention/pipeline-config';
import { asDogfoodLedgerProjection, asImprovementLoopLedger } from '../../product/domain/improvement/types';
import type { BottleneckWeights } from '../../product/domain/attention/pipeline-config';
import type { ProposalBundle } from '../../product/domain/execution/types';
import type { AutoApprovalPolicy, KnowledgePosture, TrustPolicy } from '../../product/domain/governance/workflow-types';
import type {
  DogfoodLedgerProjection,
  ImprovementLoopConvergenceReason,
  ImprovementLoopIteration,
  ImprovementLoopLedger,
  LearningSignalsSummary,
  SpeedrunProgressEvent,
} from '../../product/domain/improvement/types';
import { DEFAULT_AUTO_APPROVAL_POLICY } from '../../product/domain/governance/trust-policy';
import { matureComponentKnowledge, type ComponentEvidence } from '../../product/domain/projection/component-maturation';
import { aggregateQualityMetrics, findToxicAliases, type AliasOutcome } from '../../product/domain/proposal/quality';
import type { RungRate } from '../../product/domain/fitness/types';
import type { ScreenGroupDecider, WorkItemDecider } from '../../product/application/agency/agent-workbench';
import { collectPendingProposals } from './dogfood/activation';
import {
  consecutivePairs,
  deriveIterationCorrelations,
  iterationSignalStrengths,
} from './dogfood/metrics';
import { createInitialState, type LoopState } from './dogfood/planner';
import { getDegradingDimensionNames } from './dogfood/reporting';

export type DogfoodIterationResult = ImprovementLoopIteration;
export type DogfoodLedger = DogfoodLedgerProjection;
export { consecutivePairs, deriveIterationCorrelations, iterationSignalStrengths };

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
  // Phase 2.4 / T7 Big-O fix: previously this built a new Map on every
  // step for O(N²). Single-pass mutation into a local Map is O(N) and
  // returns the same immutable values array.
  const evidenceMap = new Map<string, ComponentEvidence>();
  for (const entry of runRecords) {
    for (const step of entry.artifact.steps) {
      if (!step.execution.widgetContract) continue;
      const componentType = step.execution.widgetContract;
      const action = step.interpretation.target?.action ?? 'unknown';
      const isSuccess = step.execution.failure.family === 'none';
      const existing = evidenceMap.get(componentType);
      evidenceMap.set(
        componentType,
        existing
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
      );
    }
  }
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
      readonly artifact: { readonly steps: ReadonlyArray<{ readonly execution: import('../../product/domain/evidence/types').StepExecutionReceipt }> };
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
    const screenHintsMap: Record<string, import('../../product/domain/knowledge/types').ScreenHints> = {};
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
