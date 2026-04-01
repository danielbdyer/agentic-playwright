import { test, expect } from '@playwright/test';
import {
  buildKnowledgeDependencies,
  extractHighRiskKnowledge,
  scenariosAffectedBy,
  type BoundScenarioSummary,
} from '../lib/application/knowledge-dependencies';

function makeScenario(overrides: Partial<{
  adoId: string;
  title: string;
  knowledgeRefs: string[][];
}>): BoundScenarioSummary {
  const refs = overrides.knowledgeRefs ?? [['knowledge/screens/PolicySearch.hints.yaml']];
  return {
    adoId: overrides.adoId ?? 'TC-001',
    title: overrides.title ?? 'Test Scenario',
    steps: refs.map((knowledgeRefs) => ({ knowledgeRefs })),
  };
}

test('Law 1: buildKnowledgeDependencies produces valid report', () => {
  const report = buildKnowledgeDependencies({
    scenarios: [],
    generatedAt: '2026-01-01T00:00:00Z',
  });
  expect(report.kind).toBe('knowledge-dependency-report');
  expect(report.version).toBe(1);
  expect(report.generatedAt).toBe('2026-01-01T00:00:00Z');
});

test('Law 2: empty scenarios produce empty report', () => {
  const report = buildKnowledgeDependencies({
    scenarios: [],
  });
  expect(report.totalKnowledgeRefs).toBe(0);
  expect(report.orphanRate).toBe(0);
  expect(report.usages.length).toBe(0);
});

test('Law 3: orphanRate is in [0, 1]', () => {
  const report = buildKnowledgeDependencies({
    scenarios: [makeScenario({ knowledgeRefs: [['ref-a']] })],
    allKnowledgeRefs: ['ref-a', 'ref-b', 'ref-c'],
  });
  expect(report.orphanRate).toBeGreaterThanOrEqual(0);
  expect(report.orphanRate).toBeLessThanOrEqual(1);
});

test('Law 4: orphanedKnowledge contains refs not used by any scenario', () => {
  const report = buildKnowledgeDependencies({
    scenarios: [makeScenario({ knowledgeRefs: [['ref-a']] })],
    allKnowledgeRefs: ['ref-a', 'ref-b'],
  });
  expect(report.orphanedKnowledge).toContain('ref-b');
  expect(report.orphanedKnowledge).not.toContain('ref-a');
});

test('Law 5: blastRadii sorted by stepCount descending', () => {
  const report = buildKnowledgeDependencies({
    scenarios: [
      makeScenario({ adoId: 'TC-001', knowledgeRefs: [['ref-a'], ['ref-a'], ['ref-a']] }),
      makeScenario({ adoId: 'TC-002', knowledgeRefs: [['ref-b']] }),
    ],
  });
  for (let i = 1; i < report.blastRadii.length; i++) {
    expect(report.blastRadii[i]!.stepCount)
      .toBeLessThanOrEqual(report.blastRadii[i - 1]!.stepCount);
  }
});

test('Law 6: riskLevel escalates with more dependents', () => {
  const report = buildKnowledgeDependencies({
    scenarios: [
      makeScenario({ adoId: 'TC-001', knowledgeRefs: [['ref-a']] }),
      makeScenario({ adoId: 'TC-002', knowledgeRefs: [['ref-a']] }),
      makeScenario({ adoId: 'TC-003', knowledgeRefs: [['ref-a']] }),
      makeScenario({ adoId: 'TC-004', knowledgeRefs: [['ref-a']] }),
      makeScenario({ adoId: 'TC-005', knowledgeRefs: [['ref-a']] }),
    ],
  });
  const refA = report.blastRadii.find((br) => br.knowledgeRef === 'ref-a');
  expect(refA!.riskLevel).toBe('high');
});

test('Law 7: scenariosAffectedBy returns correct scenarios', () => {
  const report = buildKnowledgeDependencies({
    scenarios: [
      makeScenario({ adoId: 'TC-001', knowledgeRefs: [['ref-a']] }),
      makeScenario({ adoId: 'TC-002', knowledgeRefs: [['ref-b']] }),
    ],
  });
  const affected = scenariosAffectedBy(report, 'ref-a');
  expect(affected.length).toBe(1);
  expect(affected[0]!.adoId).toBe('TC-001');
});

test('Law 8: extractHighRiskKnowledge limits to N items', () => {
  const report = buildKnowledgeDependencies({
    scenarios: [
      makeScenario({ adoId: 'TC-001', knowledgeRefs: [['ref-a'], ['ref-b'], ['ref-c']] }),
    ],
  });
  const top2 = extractHighRiskKnowledge(report, 2);
  expect(top2.length).toBeLessThanOrEqual(2);
});

test('Law 9: multiple scenarios sharing knowledge are counted correctly', () => {
  const report = buildKnowledgeDependencies({
    scenarios: [
      makeScenario({ adoId: 'TC-001', knowledgeRefs: [['ref-shared']] }),
      makeScenario({ adoId: 'TC-002', knowledgeRefs: [['ref-shared']] }),
    ],
  });
  const usage = report.usages.find((u) => u.knowledgeRef === 'ref-shared');
  expect(usage!.dependentScenarios.length).toBe(2);
  expect(usage!.dependentStepCount).toBe(2);
});

test('Law 10: pure function produces same output for same input', () => {
  const input = {
    scenarios: [
      makeScenario({ adoId: 'TC-001', knowledgeRefs: [['ref-a']] }),
    ],
    allKnowledgeRefs: ['ref-a', 'ref-b'],
    generatedAt: '2026-01-01T00:00:00Z',
  };
  const r1 = buildKnowledgeDependencies(input);
  const r2 = buildKnowledgeDependencies(input);
  expect(r1.totalKnowledgeRefs).toBe(r2.totalKnowledgeRefs);
  expect(r1.orphanRate).toBe(r2.orphanRate);
  expect(r1.averageBlastRadius).toBe(r2.averageBlastRadius);
  expect(r1.blastRadii.length).toBe(r2.blastRadii.length);
});
