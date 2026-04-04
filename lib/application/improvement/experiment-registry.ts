/**
 * Experiment registry compatibility projection.
 *
 * The canonical recursive-improvement history lives in
 * `.tesseract/benchmarks/improvement-ledger.json`.
 * `experiments.json` remains as a compatibility projection for scripts and
 * historical tooling that still speak in `ExperimentRecord`.
 */

import path from 'path';
import { Effect } from 'effect';
import type { ExperimentRegistry, ExperimentRecord } from '../../domain/types';
import { appendExperiment, emptyExperimentRegistry } from '../../domain/types';
import type { ProjectPaths } from '../paths';
import { FileSystem } from '../ports';
import {
  improvementLedgerPath,
  loadImprovementLedger,
  recordImprovementRun,
  toExperimentRecord,
} from './improvement';

export function registryPath(paths: ProjectPaths): string {
  return path.join(paths.benchmarkRunsDir, 'experiments.json');
}

function loadLegacyRegistry(paths: ProjectPaths) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const filePath = registryPath(paths);
    const exists = yield* fs.exists(filePath);
    if (!exists) {
      return emptyExperimentRegistry();
    }
    return (yield* fs.readJson(filePath)) as ExperimentRegistry;
  });
}

function projectedRegistryFromImprovementLedger(paths: ProjectPaths) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const filePath = improvementLedgerPath(paths);
    const exists = yield* fs.exists(filePath);
    if (!exists) {
      return null;
    }

    const ledger = yield* loadImprovementLedger(paths);
    return {
      kind: 'experiment-registry' as const,
      version: 1 as const,
      experiments: ledger.runs.map((run) => toExperimentRecord(run)),
    };
  });
}

function mergeRegistries(
  primary: ExperimentRegistry,
  secondary: ExperimentRegistry,
): ExperimentRegistry {
  const merged = [...primary.experiments, ...secondary.experiments].reduce<Map<string, ExperimentRecord>>(
    (acc, experiment) => {
      const key = experiment.improvementRunId ?? experiment.id;
      if (!acc.has(key)) {
        acc.set(key, experiment);
      }
      return acc;
    },
    new Map(),
  );

  return {
    kind: 'experiment-registry',
    version: 1,
    experiments: [...merged.values()].sort((left, right) => left.runAt.localeCompare(right.runAt)),
  };
}

export function loadExperimentRegistry(paths: ProjectPaths) {
  return Effect.gen(function* () {
    const projected = yield* projectedRegistryFromImprovementLedger(paths);
    const legacy = yield* loadLegacyRegistry(paths);
    return projected ? mergeRegistries(projected, legacy) : legacy;
  });
}

export function saveExperimentRegistry(paths: ProjectPaths, registry: ExperimentRegistry) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    yield* fs.writeJson(registryPath(paths), registry);
  });
}

export function recordExperiment(
  paths: ProjectPaths,
  record: ExperimentRecord,
) {
  return Effect.gen(function* () {
    if (record.improvementRun) {
      yield* recordImprovementRun({ paths, run: record.improvementRun });
      const projected = yield* loadExperimentRegistry(paths);
      yield* saveExperimentRegistry(paths, projected);
      return projected;
    }

    const updatedLegacy = appendExperiment(yield* loadLegacyRegistry(paths), record);
    const projected = yield* loadExperimentRegistry(paths);
    const merged = mergeRegistries(projected, updatedLegacy);
    yield* saveExperimentRegistry(paths, merged);
    return merged;
  });
}
