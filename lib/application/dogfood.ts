import { Effect } from 'effect';
import { activateProposalBundle, autoApproveEligibleProposals } from './activate-proposals';
import { loadWorkspaceCatalog } from './catalog';
import type { ProjectPaths } from './paths';
import { refreshScenario } from './refresh';
import { runScenarioSelection } from './run';
import { FileSystem } from './ports';
import { runStateMachine } from './state-machine';
import type { AdoId } from '../domain/identity';
import type { AutoApprovalPolicy, KnowledgePosture, ProposalBundle, TrustPolicy } from '../domain/types';
import { DEFAULT_AUTO_APPROVAL_POLICY } from '../domain/trust-policy';

export interface DogfoodIterationResult {
  readonly iteration: number;
  readonly scenarioIds: readonly string[];
  readonly proposalsActivated: number;
  readonly proposalsBlocked: number;
  readonly knowledgeHitRate: number;
  readonly unresolvedStepCount: number;
  readonly totalStepCount: number;
  readonly instructionCount: number;
}

export interface DogfoodLedger {
  readonly kind: 'dogfood-ledger';
  readonly version: 1;
  readonly maxIterations: number;
  readonly completedIterations: number;
  readonly converged: boolean;
  readonly convergenceReason: 'no-proposals' | 'threshold-met' | 'budget-exhausted' | 'max-iterations' | null;
  readonly iterations: readonly DogfoodIterationResult[];
  readonly totalProposalsActivated: number;
  readonly totalInstructionCount: number;
  readonly knowledgeHitRateDelta: number;
}

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
}

interface LoopState {
  readonly iterations: readonly DogfoodIterationResult[];
  readonly cumulativeInstructions: number;
  readonly converged: boolean;
  readonly convergenceReason: DogfoodLedger['convergenceReason'];
}

const INITIAL_STATE: LoopState = {
  iterations: [],
  cumulativeInstructions: 0,
  converged: false,
  convergenceReason: null,
};

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

function runIteration(iteration: number, options: DogfoodOptions) {
  // On iteration 1, use the configured posture (which may be cold-start).
  // On subsequent iterations, always use warm-start — the loop has activated
  // proposals into the knowledge directory, so we need to read them back.
  const iterationPosture: KnowledgePosture = iteration === 1
    ? (options.knowledgePosture ?? 'warm-start')
    : 'warm-start';

  return Effect.gen(function* () {
    // Step 1: refresh all scenarios
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths, knowledgePosture: iterationPosture });
    const scenarioIds = catalog.scenarios.map((entry) => entry.artifact.source.ado_id);
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

    // Step 3: collect trace metrics (always warm-start — need to read run results)
    const postRunCatalog = yield* loadWorkspaceCatalog({ paths: options.paths, knowledgePosture: 'warm-start' });
    const metrics = computeTraceMetrics(postRunCatalog.runRecords as never);

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

    return result;
  });
}

function dogfoodMachine(options: DogfoodOptions) {
  return {
    initial: INITIAL_STATE,
    step: (state: LoopState) => Effect.gen(function* () {
      const iteration = state.iterations.length + 1;
      if (iteration > options.maxIterations) {
        return { next: state, done: true };
      }

      const result = yield* runIteration(iteration, options);
      const nextCumulativeInstructions = state.cumulativeInstructions + result.instructionCount;
      const prevHitRate = state.iterations.length > 0
        ? state.iterations[state.iterations.length - 1]!.knowledgeHitRate
        : null;

      const convergence = determineConvergenceReason(
        iteration, options.maxIterations, result.proposalsActivated,
        prevHitRate, result.knowledgeHitRate, nextCumulativeInstructions, options,
      );

      const nextState: LoopState = {
        iterations: [...state.iterations, result],
        cumulativeInstructions: nextCumulativeInstructions,
        converged: convergence.converged,
        convergenceReason: convergence.reason ?? state.convergenceReason,
      };

      return { next: nextState, done: convergence.converged || convergence.reason === 'max-iterations' };
    }),
  };
}

function buildLedger(state: LoopState, options: DogfoodOptions): DogfoodLedger {
  const firstRate = state.iterations[0]?.knowledgeHitRate ?? 0;
  const lastRate = state.iterations.length > 0
    ? state.iterations[state.iterations.length - 1]!.knowledgeHitRate
    : 0;

  return {
    kind: 'dogfood-ledger',
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
    const ledger = buildLedger(finalState, options);

    const ledgerPath = `${options.paths.rootDir}/.tesseract/runs/dogfood-ledger.json`;
    yield* fs.ensureDir(`${options.paths.rootDir}/.tesseract/runs`);
    yield* fs.writeJson(ledgerPath, ledger);

    return { ledger, ledgerPath };
  });
}
