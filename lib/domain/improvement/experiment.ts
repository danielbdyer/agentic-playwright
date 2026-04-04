/**
 * Experiment registry compatibility projection over the canonical
 * recursive-improvement ledger.
 *
 * The canonical training log is `ImprovementLedger`; this projection remains
 * available for legacy tooling that still consumes `ExperimentRecord`.
 */

import type { PipelineConfig } from '../attention/pipeline-config';
import type { PipelineFitnessReport } from '../fitness/types';
import type {
  ExperimentScorecardComparison,
  ExperimentSubstrate,
  ImprovementRun,
  SubstrateContext,
} from './types';

export interface ExperimentRecord {
  readonly id: string;
  readonly runAt: string;
  readonly pipelineVersion: string;
  readonly baselineConfig: PipelineConfig;
  readonly configDelta: Partial<PipelineConfig>;
  readonly substrateContext: SubstrateContext;
  readonly fitnessReport: PipelineFitnessReport;
  readonly scorecardComparison: ExperimentScorecardComparison;
  readonly accepted: boolean;
  readonly tags: readonly string[];
  readonly parentExperimentId: string | null;
  readonly improvementRunId?: string | null | undefined;
  readonly improvementRun?: ImprovementRun | undefined;
}

export interface ExperimentRegistry {
  readonly kind: 'experiment-registry';
  readonly version: 1;
  readonly experiments: readonly ExperimentRecord[];
}

export function emptyExperimentRegistry(): ExperimentRegistry {
  return { kind: 'experiment-registry', version: 1, experiments: [] };
}

export function appendExperiment(
  registry: ExperimentRegistry,
  record: ExperimentRecord,
): ExperimentRegistry {
  return {
    ...registry,
    experiments: [...registry.experiments, record],
  };
}

export function filterExperiments(
  registry: ExperimentRegistry,
  predicate: (record: ExperimentRecord) => boolean,
): readonly ExperimentRecord[] {
  return registry.experiments.filter(predicate);
}

export function experimentsForSubstrate(
  registry: ExperimentRegistry,
  substrate: ExperimentSubstrate,
): readonly ExperimentRecord[] {
  return filterExperiments(registry, (r) => r.substrateContext.substrate === substrate);
}

export function acceptedExperiments(
  registry: ExperimentRegistry,
): readonly ExperimentRecord[] {
  return filterExperiments(registry, (r) => r.accepted);
}

export function experimentsWithTag(
  registry: ExperimentRegistry,
  tag: string,
): readonly ExperimentRecord[] {
  return filterExperiments(registry, (r) => r.tags.includes(tag));
}
