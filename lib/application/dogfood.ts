import { Effect } from 'effect';
import { activateProposalBundle } from './activate-proposals';
import { loadWorkspaceCatalog } from './catalog';
import type { ProjectPaths } from './paths';
import { refreshScenario } from './refresh';
import { runScenarioSelection } from './run';
import { FileSystem } from './ports';
import type { AdoId } from '../domain/identity';
import type { ProposalBundle } from '../domain/types';

export interface DogfoodIterationResult {
  iteration: number;
  scenarioIds: string[];
  proposalsActivated: number;
  proposalsBlocked: number;
  knowledgeHitRate: number;
  unresolvedStepCount: number;
}

export interface DogfoodLedger {
  kind: 'dogfood-ledger';
  version: 1;
  maxIterations: number;
  completedIterations: number;
  converged: boolean;
  iterations: DogfoodIterationResult[];
  totalProposalsActivated: number;
  knowledgeHitRateDelta: number;
}

function collectPendingProposals(bundles: readonly ProposalBundle[]): ProposalBundle[] {
  return bundles.filter((bundle) =>
    bundle.proposals.some((proposal) => proposal.activation.status === 'pending'),
  );
}

function computeKnowledgeHitRate(traces: Array<{ knowledgeHitRate: number }>): number {
  return traces.length === 0
    ? 0
    : traces.reduce((sum, t) => sum + t.knowledgeHitRate, 0) / traces.length;
}

function computeUnresolvedCount(traces: Array<{ unresolvedCount: number }>): number {
  return traces.reduce((sum, t) => sum + t.unresolvedCount, 0);
}

export function runDogfoodLoop(options: {
  paths: ProjectPaths;
  maxIterations: number;
  tag?: string | undefined;
  runbook?: string | undefined;
  interpreterMode?: 'dry-run' | 'diagnostic' | undefined;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const iterations: DogfoodIterationResult[] = [];
    let converged = false;

    for (let iteration = 1; iteration <= options.maxIterations; iteration++) {
      // Step 1: refresh all scenarios
      const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
      const scenarioIds = catalog.scenarios.map((entry) => entry.artifact.source.ado_id);

      for (const adoId of scenarioIds) {
        yield* refreshScenario({ adoId: adoId as AdoId, paths: options.paths });
      }

      // Step 2: run all scenarios
      const runResult = yield* runScenarioSelection({
        paths: options.paths,
        tag: options.tag,
        runbookName: options.runbook,
        interpreterMode: options.interpreterMode ?? 'diagnostic',
      });

      // Step 3: collect traces for scorecard
      const postRunCatalog = yield* loadWorkspaceCatalog({ paths: options.paths });
      const traceMetrics = postRunCatalog.runRecords.map((entry) => {
        const steps = entry.artifact.steps;
        const approvedKnowledge = steps.filter((s) =>
          s.interpretation.provenanceKind === 'approved-knowledge',
        ).length;
        const unresolved = steps.filter((s) =>
          s.interpretation.provenanceKind === 'unresolved',
        ).length;
        return {
          knowledgeHitRate: steps.length > 0 ? approvedKnowledge / steps.length : 0,
          unresolvedCount: unresolved,
        };
      });

      const knowledgeHitRate = computeKnowledgeHitRate(traceMetrics);
      const unresolvedStepCount = computeUnresolvedCount(traceMetrics);

      // Step 4: collect and activate pending proposals
      const pendingBundles = collectPendingProposals(
        postRunCatalog.proposalBundles.map((entry) => entry.artifact),
      );

      let proposalsActivated = 0;
      let proposalsBlocked = 0;
      for (const bundle of pendingBundles) {
        const result = yield* activateProposalBundle({
          paths: options.paths,
          proposalBundle: bundle,
        });
        proposalsActivated += result.activatedPaths.length;
        proposalsBlocked += result.blockedProposalIds.length;
      }

      iterations.push({
        iteration,
        scenarioIds: runResult.selection.adoIds,
        proposalsActivated,
        proposalsBlocked,
        knowledgeHitRate: Number(knowledgeHitRate.toFixed(4)),
        unresolvedStepCount,
      });

      // Check convergence: no proposals to activate means the system is stable
      if (proposalsActivated === 0 && iteration > 1) {
        converged = true;
        break;
      }
    }

    const firstRate = iterations[0]?.knowledgeHitRate ?? 0;
    const lastRate = iterations[iterations.length - 1]?.knowledgeHitRate ?? 0;

    const ledger: DogfoodLedger = {
      kind: 'dogfood-ledger',
      version: 1,
      maxIterations: options.maxIterations,
      completedIterations: iterations.length,
      converged,
      iterations,
      totalProposalsActivated: iterations.reduce((sum, it) => sum + it.proposalsActivated, 0),
      knowledgeHitRateDelta: Number((lastRate - firstRate).toFixed(4)),
    };

    const ledgerPath = `${options.paths.rootDir}/.tesseract/runs/dogfood-ledger.json`;
    yield* fs.ensureDir(`${options.paths.rootDir}/.tesseract/runs`);
    yield* fs.writeJson(ledgerPath, ledger);

    return { ledger, ledgerPath };
  });
}
