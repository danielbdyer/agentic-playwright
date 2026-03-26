import path from 'path';
import { Effect } from 'effect';
import { activateProposalBundle, autoApproveEligibleProposals } from './activate-proposals';
import { loadWorkspaceCatalog } from './catalog';
import { buildPartialFitnessMetrics } from './fitness';
import { improvementLoopLedgerPath, type ProjectPaths } from './paths';
import { refreshScenario } from './refresh';
import { runScenarioSelection } from './run';
import { FileSystem } from './ports';
import { runStateMachine } from './state-machine';
import type { AdoId } from '../domain/identity';
import { asDogfoodLedgerProjection, asImprovementLoopLedger } from '../domain/types';
import type {
  AutoApprovalPolicy,
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
}

function createInitialState(): LoopState {
  return {
    iterations: [],
    cumulativeInstructions: 0,
    converged: false,
    convergenceReason: null,
    startedAt: Date.now(),
  };
}

function collectPendingProposals(bundles: readonly ProposalBundle[]): readonly ProposalBundle[] {
  return bundles.filter((bundle) =>
    bundle.proposals.some((proposal) => proposal.activation.status === 'pending'),
  );
}

function round4(value: number): number {
  return Number(value.toFixed(4));
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
      { concurrency: 1 },
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
  });
}

/** Build a progress event from the current iteration result and loop state. */
function buildProgressEvent(
  result: DogfoodIterationResult,
  convergenceReason: ImprovementLoopConvergenceReason,
  startedAt: number,
  iterationDurationMs: number,
  options: DogfoodOptions,
  resolutionByRung?: readonly import('../domain/types/fitness').RungRate[],
): SpeedrunProgressEvent {
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
    elapsed: Date.now() - startedAt,
    phaseDurationMs: iterationDurationMs,
    wallClockMs: Date.now(),
    seed: options.seed ?? '',
    scenarioCount: result.scenarioIds.length,
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
    // Step 1: refresh only tag-matching scenarios (compile-scope: scenarios + knowledge + controls)
    const catalog = yield* loadWorkspaceCatalog({
      paths: options.paths,
      knowledgePosture: iterationPosture,
      scope: 'compile',
    });
    const tag = options.tag ?? null;
    const scenarioIds = catalog.scenarios
      .map((entry) => entry.artifact)
      .filter((scenario) => !tag || scenario.metadata.tags.includes(tag))
      .map((scenario) => scenario.source.ado_id);
    yield* Effect.all(
      scenarioIds.map((adoId) => refreshScenario({ adoId: adoId as AdoId, paths: options.paths })),
      { concurrency: 1 },
    );

    // Step 2: run all scenarios
    const runResult = yield* runScenarioSelection({
      paths: options.paths,
      tag: options.tag,
      runbookName: options.runbook,
      interpreterMode: options.interpreterMode ?? 'diagnostic',
    });

    // Step 3: collect trace metrics (post-run scope: includes runs + proposals, skips sessions/evidence)
    const postRunCatalog = yield* loadWorkspaceCatalog({
      paths: options.paths,
      knowledgePosture: 'warm-start',
      scope: 'post-run',
    });
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

      const nextState: LoopState = {
        ...state,
        iterations: [...state.iterations, result],
        cumulativeInstructions: nextCumulativeInstructions,
        converged: convergence.converged,
        convergenceReason: convergence.reason ?? state.convergenceReason,
      };

      // Emit progress event after each iteration (with per-iteration rung breakdown)
      if (options.onProgress) {
        options.onProgress(buildProgressEvent(
          result,
          nextState.convergenceReason,
          state.startedAt,
          iterationDuration,
          options,
          partialFitness.resolutionByRung,
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
    yield* fs.writeJson(ledgerPath, ledger);
    yield* fs.writeJson(compatibilityLedgerPath, compatibilityLedger);

    return { ledger, ledgerPath, compatibilityLedger, compatibilityLedgerPath };
  });
}
