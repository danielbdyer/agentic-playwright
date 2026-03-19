/**
 * Experiment Registry — tracks every speedrun with its configuration delta,
 * fitness results, and accept/reject decision.
 *
 * This is the "training log" of the self-improving pipeline. Every experiment
 * carries its substrate context so that learning is not biased by any single
 * evaluation environment.
 *
 * See docs/recursive-self-improvement.md § Experiment Registry.
 */

import type { PipelineConfig } from './pipeline-config';
import type { PipelineFitnessReport } from './fitness';

// ─── Substrate Context ───
//
// The substrate describes the evaluation environment. Fitness metrics and
// parameter sensitivity are substrate-dependent: a threshold that improves
// hit rate on synthetic phrasing templates may regress on production intent.
// By tagging every experiment with its substrate, the system can:
//   1. Compute correlations within-substrate (avoid cross-contamination)
//   2. Require improvement to hold across substrates before committing
//   3. Weight production evidence higher than synthetic evidence

export type ExperimentSubstrate = 'synthetic' | 'production' | 'hybrid';

export interface SubstrateContext {
  readonly substrate: ExperimentSubstrate;
  readonly seed: string;
  readonly scenarioCount: number;
  readonly screenCount: number;
  readonly phrasingTemplateVersion: string;
}

// ─── Scorecard Comparison (denormalized snapshot) ───

export interface ExperimentScorecardComparison {
  readonly improved: boolean;
  readonly knowledgeHitRateDelta: number;
  readonly translationPrecisionDelta: number;
  readonly convergenceVelocityDelta: number;
}

// ─── Experiment Record ───

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
}

// ─── Experiment Registry ───

export interface ExperimentRegistry {
  readonly kind: 'experiment-registry';
  readonly version: 1;
  readonly experiments: readonly ExperimentRecord[];
}

// ─── Pure constructors ───

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
