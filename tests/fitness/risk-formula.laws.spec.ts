import { expect, test } from '@playwright/test';
import {
  aggregateRisk,
  applyRiskFormula,
  applyRiskFormulas,
  riskStatus,
  signalExtractorToScoringRule,
  type RiskFormula,
  type RiskSignal,
} from '../../lib/domain/fitness/risk-formula';

interface DemoInput {
  readonly ambiguity: number;
  readonly suspension: number;
}

const demoFormula: RiskFormula<DemoInput> = {
  obligation: 'compounding-economics',
  propertyRefs: ['C', 'M'],
  aggregate: 'max-of',
  extract: (input) => [
    { key: 'ambiguity', value: input.ambiguity },
    { key: 'suspension', value: input.suspension },
  ],
  evidenceFormat: (input) => `ambiguity=${input.ambiguity}, suspension=${input.suspension}`,
};

// ─── aggregateRisk ────────────────────────────────────────────────

test('max-of: returns the maximum signal value', () => {
  const signals: RiskSignal[] = [
    { key: 'a', value: 0.3 },
    { key: 'b', value: 0.8 },
    { key: 'c', value: 0.5 },
  ];
  expect(aggregateRisk(signals, 'max-of')).toBe(0.8);
});

test('max-of: empty signals → 0', () => {
  expect(aggregateRisk([], 'max-of')).toBe(0);
});

test('weighted-sum: uniform weights when not provided', () => {
  const signals: RiskSignal[] = [
    { key: 'a', value: 0.4 },
    { key: 'b', value: 0.6 },
  ];
  // (0.4 + 0.6) / 2 = 0.5
  expect(aggregateRisk(signals, 'weighted-sum')).toBeCloseTo(0.5, 12);
});

test('weighted-sum: custom weights respected', () => {
  const signals: RiskSignal[] = [
    { key: 'a', value: 0.4 },
    { key: 'b', value: 0.6 },
  ];
  // 0.4*0.25 + 0.6*0.75 = 0.55
  expect(aggregateRisk(signals, 'weighted-sum', [0.25, 0.75])).toBeCloseTo(0.55, 12);
});

test('aggregateRisk clamps values to [0,1]', () => {
  const signals: RiskSignal[] = [
    { key: 'a', value: 5 },
    { key: 'b', value: -2 },
  ];
  expect(aggregateRisk(signals, 'max-of')).toBe(1); // 5 → clamped to 1
});

// ─── riskStatus ───────────────────────────────────────────────────

test('riskStatus thresholds: 0.0 → healthy, 0.4 → watch, 0.8 → critical', () => {
  expect(riskStatus(0)).toBe('healthy');
  expect(riskStatus(0.29)).toBe('healthy');
  expect(riskStatus(0.3)).toBe('watch');
  expect(riskStatus(0.69)).toBe('watch');
  expect(riskStatus(0.7)).toBe('critical');
  expect(riskStatus(1.0)).toBe('critical');
});

// ─── applyRiskFormula ─────────────────────────────────────────────

test('applyRiskFormula: low-risk input → healthy obligation', () => {
  const obligation = applyRiskFormula(demoFormula, { ambiguity: 0.1, suspension: 0.05 });
  expect(obligation.status).toBe('healthy');
  expect(obligation.score).toBe(0.9); // 1 - max(0.1, 0.05)
  expect(obligation.measurementClass).toBe('heuristic-proxy');
});

test('applyRiskFormula: high-risk input → critical obligation', () => {
  const obligation = applyRiskFormula(demoFormula, { ambiguity: 0.9, suspension: 0.2 });
  expect(obligation.status).toBe('critical');
  expect(obligation.score).toBeCloseTo(0.1, 4);
});

test('applyRiskFormula: monotonicity in single input', () => {
  // Increasing any single risk input must non-decrease the obligation's risk
  const a = applyRiskFormula(demoFormula, { ambiguity: 0.2, suspension: 0.2 });
  const b = applyRiskFormula(demoFormula, { ambiguity: 0.5, suspension: 0.2 });
  const c = applyRiskFormula(demoFormula, { ambiguity: 0.5, suspension: 0.5 });
  expect(a.score).toBeGreaterThanOrEqual(b.score);
  expect(b.score).toBeGreaterThanOrEqual(c.score);
});

test('applyRiskFormula: measurementClass override is respected', () => {
  const directFormula: RiskFormula<DemoInput> = {
    ...demoFormula,
    measurementClass: 'direct',
  };
  const obligation = applyRiskFormula(directFormula, { ambiguity: 0, suspension: 0 });
  expect(obligation.measurementClass).toBe('direct');
});

// ─── applyRiskFormulas ────────────────────────────────────────────

test('applyRiskFormulas: emits one obligation per formula', () => {
  const obligations = applyRiskFormulas(
    [demoFormula, { ...demoFormula, obligation: 'recoverability', propertyRefs: ['R'] }],
    { ambiguity: 0.2, suspension: 0.1 },
  );
  expect(obligations).toHaveLength(2);
  expect(obligations[0]!.obligation).toBe('compounding-economics');
  expect(obligations[1]!.obligation).toBe('recoverability');
});

// ─── signalExtractorToScoringRule ─────────────────────────────────

test('signalExtractorToScoringRule: produces a ScoringRule that retrieves the named signal', () => {
  const rule = signalExtractorToScoringRule(demoFormula.extract, 'ambiguity');
  expect(rule.score({ ambiguity: 0.42, suspension: 0.1 })).toBe(0.42);
});

test('signalExtractorToScoringRule: missing signal name → 0', () => {
  const rule = signalExtractorToScoringRule(demoFormula.extract, 'nonexistent');
  expect(rule.score({ ambiguity: 0.42, suspension: 0.1 })).toBe(0);
});
