/**
 * Improvement ledger — path + loader + saver + experiment projection.
 *
 * Extracted from workshop/orchestration/improvement.ts at step-4c's
 * final RULE_3 sweep. The ledger JSON is a product artifact (under
 * `.tesseract/benchmarks/`) written by workshop's improvement loop
 * and read by product's workspace-catalog + cli/experiments + test
 * harnesses.
 *
 * Putting the path + Effect wrappers here makes the ledger a
 * product-owned surface that workshop and product both consume
 * through a single location — the seam passes because the
 * import direction is product/ → product/, not product/ → workshop/.
 */

import path from 'path';
import { Effect } from 'effect';
import { ImprovementRunStore } from '../ports';
import type { ProjectPaths } from '../paths';
import type { ExperimentRecord } from '../../domain/improvement/experiment';
import type { ImprovementLedger, ImprovementRun } from '../../domain/improvement/types';

export function improvementLedgerPath(paths: ProjectPaths): string {
  return path.join(paths.rootDir, '.tesseract', 'benchmarks', 'improvement-ledger.json');
}

export function loadImprovementLedger(paths: ProjectPaths) {
  return Effect.gen(function* () {
    const repository = yield* ImprovementRunStore;
    return yield* Effect.promise(() => repository.loadLedger(improvementLedgerPath(paths)));
  });
}

export function saveImprovementLedger(paths: ProjectPaths, ledger: ImprovementLedger) {
  return Effect.gen(function* () {
    const repository = yield* ImprovementRunStore;
    return yield* Effect.promise(() => repository.saveLedger(improvementLedgerPath(paths), ledger));
  });
}

export function toExperimentRecord(run: ImprovementRun): ExperimentRecord {
  return {
    id: run.improvementRunId,
    runAt: run.completedAt ?? run.startedAt,
    pipelineVersion: run.pipelineVersion,
    baselineConfig: run.baselineConfig,
    configDelta: run.configDelta,
    substrateContext: run.substrateContext,
    fitnessReport: run.fitnessReport,
    scorecardComparison: run.scorecardComparison,
    accepted: run.accepted,
    tags: run.tags,
    parentExperimentId: run.parentExperimentId,
    improvementRunId: run.improvementRunId,
    improvementRun: run,
  };
}
