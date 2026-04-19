import { test, expect } from '@playwright/test';
import { DEFAULT_PIPELINE_CONFIG, PipelineConfig, mergePipelineConfig } from '../product/domain/attention/pipeline-config';
import {
  ParetoFrontierEntry,
  ParetoObjectives,
  addToParetoFrontier,
  isAcceptedByParetoFrontier,
  paretoDominates,
} from '../workshop/metrics/types';
import {
  ExperimentRecord,
  acceptedExperiments,
  appendExperiment,
  emptyExperimentRegistry,
  experimentsForSubstrate,
} from '../product/domain/improvement/experiment';

// ─── PipelineConfig ───

test('DEFAULT_PIPELINE_CONFIG round-trips through JSON', () => {
  const serialized = JSON.stringify(DEFAULT_PIPELINE_CONFIG);
  const deserialized = JSON.parse(serialized) as PipelineConfig;
  expect(deserialized).toEqual(DEFAULT_PIPELINE_CONFIG);
});

test('mergePipelineConfig applies scalar overrides and preserves unspecified fields', () => {
  const merged = mergePipelineConfig(DEFAULT_PIPELINE_CONFIG, { translationThreshold: 0.5 });
  expect(merged.translationThreshold).toBe(0.5);
  expect(merged.bottleneckWeights).toEqual(DEFAULT_PIPELINE_CONFIG.bottleneckWeights);
  expect(merged.convergenceThreshold).toBe(DEFAULT_PIPELINE_CONFIG.convergenceThreshold);
});

test('mergePipelineConfig applies nested overrides without destroying sibling fields', () => {
  const merged = mergePipelineConfig(DEFAULT_PIPELINE_CONFIG, {
    bottleneckWeights: { ...DEFAULT_PIPELINE_CONFIG.bottleneckWeights, repairDensity: 0.5 },
  });
  expect(merged.bottleneckWeights.repairDensity).toBe(0.5);
  expect(merged.bottleneckWeights.translationRate).toBe(DEFAULT_PIPELINE_CONFIG.bottleneckWeights.translationRate);
});

test('bottleneck weights sum to approximately 1.0', () => {
  const w = DEFAULT_PIPELINE_CONFIG.bottleneckWeights;
  const sum = w.repairDensity + w.translationRate + w.unresolvedRate + w.inverseFragmentShare;
  expect(sum).toBeCloseTo(1.0, 4);
});

test('proposal ranking weights sum to approximately 1.0', () => {
  const w = DEFAULT_PIPELINE_CONFIG.proposalRankingWeights;
  const sum = w.scenarioImpact + w.bottleneckReduction + w.trustPolicy + w.evidence;
  expect(sum).toBeCloseTo(1.0, 4);
});

test('DOM scoring weights sum to approximately 1.0', () => {
  const w = DEFAULT_PIPELINE_CONFIG.domScoringWeights;
  const sum = w.visibility + w.roleName + w.locatorQuality + w.widgetCompatibility;
  expect(sum).toBeCloseTo(1.0, 4);
});

// ─── Pareto Dominance ───

test('paretoDominates: strictly better on all objectives dominates', () => {
  const a: ParetoObjectives = { knowledgeHitRate: 0.9, translationPrecision: 0.9, convergenceVelocity: 2, proposalYield: 0.8 };
  const b: ParetoObjectives = { knowledgeHitRate: 0.8, translationPrecision: 0.8, convergenceVelocity: 3, proposalYield: 0.7 };
  expect(paretoDominates(a, b)).toBe(true);
  expect(paretoDominates(b, a)).toBe(false);
});

test('paretoDominates: no entry dominates itself (reflexivity fails for strict)', () => {
  const a: ParetoObjectives = { knowledgeHitRate: 0.9, translationPrecision: 0.9, convergenceVelocity: 2, proposalYield: 0.8 };
  expect(paretoDominates(a, a)).toBe(false);
});

test('paretoDominates: trade-off means neither dominates', () => {
  const a: ParetoObjectives = { knowledgeHitRate: 0.9, translationPrecision: 0.7, convergenceVelocity: 2, proposalYield: 0.8 };
  const b: ParetoObjectives = { knowledgeHitRate: 0.8, translationPrecision: 0.9, convergenceVelocity: 2, proposalYield: 0.8 };
  expect(paretoDominates(a, b)).toBe(false);
  expect(paretoDominates(b, a)).toBe(false);
});

test('isAcceptedByParetoFrontier: trade-off is accepted', () => {
  const frontier: ParetoFrontierEntry[] = [
    { pipelineVersion: 'v1', addedAt: '2024-01-01', objectives: { knowledgeHitRate: 0.9, translationPrecision: 0.7, convergenceVelocity: 2, proposalYield: 0.8 } },
  ];
  const candidate: ParetoObjectives = { knowledgeHitRate: 0.8, translationPrecision: 0.9, convergenceVelocity: 2, proposalYield: 0.8 };
  expect(isAcceptedByParetoFrontier(frontier, candidate)).toBe(true);
});

test('isAcceptedByParetoFrontier: dominated candidate is rejected', () => {
  const frontier: ParetoFrontierEntry[] = [
    { pipelineVersion: 'v1', addedAt: '2024-01-01', objectives: { knowledgeHitRate: 0.9, translationPrecision: 0.9, convergenceVelocity: 2, proposalYield: 0.8 } },
  ];
  const candidate: ParetoObjectives = { knowledgeHitRate: 0.8, translationPrecision: 0.8, convergenceVelocity: 3, proposalYield: 0.7 };
  expect(isAcceptedByParetoFrontier(frontier, candidate)).toBe(false);
});

test('addToParetoFrontier: new entry prunes dominated entries', () => {
  const frontier: ParetoFrontierEntry[] = [
    { pipelineVersion: 'v1', addedAt: '2024-01-01', objectives: { knowledgeHitRate: 0.8, translationPrecision: 0.8, convergenceVelocity: 3, proposalYield: 0.7 } },
    { pipelineVersion: 'v2', addedAt: '2024-01-02', objectives: { knowledgeHitRate: 0.7, translationPrecision: 0.9, convergenceVelocity: 2, proposalYield: 0.8 } },
  ];
  const newEntry: ParetoFrontierEntry = {
    pipelineVersion: 'v3',
    addedAt: '2024-01-03',
    objectives: { knowledgeHitRate: 0.9, translationPrecision: 0.9, convergenceVelocity: 2, proposalYield: 0.8 },
  };
  const updated = addToParetoFrontier(frontier, newEntry);
  // v1 should be pruned (dominated by v3), v2 should be pruned (dominated by v3)
  expect(updated).toHaveLength(1);
  expect(updated[0]!.pipelineVersion).toBe('v3');
});

test('paretoDominates: convergenceVelocity lower is better', () => {
  const faster: ParetoObjectives = { knowledgeHitRate: 0.8, translationPrecision: 0.8, convergenceVelocity: 1, proposalYield: 0.8 };
  const slower: ParetoObjectives = { knowledgeHitRate: 0.8, translationPrecision: 0.8, convergenceVelocity: 3, proposalYield: 0.8 };
  expect(paretoDominates(faster, slower)).toBe(true);
  expect(paretoDominates(slower, faster)).toBe(false);
});

// ─── Experiment Registry ───

test('appendExperiment is pure and immutable', () => {
  const registry = emptyExperimentRegistry();
  const record = { id: 'test-1', accepted: true, substrateContext: { substrate: 'synthetic' } } as unknown as ExperimentRecord;
  const updated = appendExperiment(registry, record);
  expect(registry.experiments).toHaveLength(0);
  expect(updated.experiments).toHaveLength(1);
});

test('experimentsForSubstrate filters correctly', () => {
  const synth = { id: 'synth-1', substrateContext: { substrate: 'synthetic' } } as unknown as ExperimentRecord;
  const prod = { id: 'prod-1', substrateContext: { substrate: 'production' } } as unknown as ExperimentRecord;
  const registry = appendExperiment(appendExperiment(emptyExperimentRegistry(), synth), prod);
  const filtered = experimentsForSubstrate(registry, 'synthetic');
  expect(filtered).toHaveLength(1);
  expect(filtered[0]!.id).toBe('synth-1');
});

test('acceptedExperiments filters correctly', () => {
  const accepted = { id: 'a-1', accepted: true } as unknown as ExperimentRecord;
  const rejected = { id: 'r-1', accepted: false } as unknown as ExperimentRecord;
  const registry = appendExperiment(appendExperiment(emptyExperimentRegistry(), accepted), rejected);
  const filtered = acceptedExperiments(registry);
  expect(filtered).toHaveLength(1);
  expect(filtered[0]!.id).toBe('a-1');
});
