import { test, expect } from '@playwright/test';
import {
  buildInterpretationCoherence,
  extractIncoherentIntents,
} from '../lib/application/drift/interpretation-coherence';
import type { RungHistoryIndex } from '../lib/application/drift/rung-drift';
import type { InterpretationDriftRecord } from '../lib/domain/execution/types';

function makeRungIndex(entries: Array<{
  intentRef: string;
  rungHistory: number[];
  driftDirection: 'improving' | 'stable' | 'degrading';
}>): RungHistoryIndex {
  return {
    entries: entries.map((e) => ({
      intentRef: e.intentRef,
      rungHistory: e.rungHistory,
      modalRung: e.rungHistory[0] ?? 0,
      currentRung: e.rungHistory[e.rungHistory.length - 1] ?? 0,
      driftDirection: e.driftDirection,
    })),
  };
}

function makeDriftRecord(overrides?: Partial<{
  steps: Array<{
    stepIndex: number;
    changed: boolean;
    target: string;
  }>;
}>): InterpretationDriftRecord {
  const steps = overrides?.steps ?? [];
  return {
    kind: 'interpretation-drift-record',
    version: 1,
    stage: 'resolution',
    scope: 'run',
    ids: {} as never,
    fingerprints: {} as never,
    lineage: {} as never,
    governance: 'approved',
    adoId: 'TC-001' as never,
    runId: 'run-1',
    comparedRunId: 'run-0',
    providerId: 'test',
    mode: 'test',
    comparedAt: '2026-01-01T00:00:00Z',
    changedStepCount: steps.filter((s) => s.changed).length,
    unchangedStepCount: steps.filter((s) => !s.changed).length,
    totalStepCount: steps.length,
    hasDrift: steps.some((s) => s.changed),
    provenance: {
      taskFingerprint: 'fp-1',
      knowledgeFingerprint: 'fp-2',
      controlsFingerprint: null,
      comparedTaskFingerprint: null,
      comparedKnowledgeFingerprint: null,
      comparedControlsFingerprint: null,
    },
    explainableByFingerprintDelta: false,
    steps: steps.map((s) => ({
      stepIndex: s.stepIndex,
      changed: s.changed,
      changes: s.changed ? [{ field: 'target', before: 'old', after: 'new' }] : [],
      before: {
        winningSource: 'approved-knowledge',
        target: s.target ?? `element-${s.stepIndex}`,
        governance: 'approved' as const,
        confidence: 'compiler-derived',
        exhaustionPath: [],
        resolutionGraphDigest: 'digest-1',
      },
      after: {
        winningSource: 'translation',
        target: s.target ?? `element-${s.stepIndex}`,
        governance: 'approved' as const,
        confidence: 'agent-proposed',
        exhaustionPath: [],
        resolutionGraphDigest: 'digest-2',
      },
    })),
  } as unknown as InterpretationDriftRecord;
}

test('Law 1: buildInterpretationCoherence produces valid report', () => {
  const report = buildInterpretationCoherence({
    rungIndex: makeRungIndex([]),
    driftRecords: [],
    generatedAt: '2026-01-01T00:00:00Z',
  });
  expect(report.kind).toBe('interpretation-coherence-report');
  expect(report.version).toBe(1);
  expect(report.generatedAt).toBe('2026-01-01T00:00:00Z');
});

test('Law 2: overallCoherenceScore is in [0, 1]', () => {
  const report = buildInterpretationCoherence({
    rungIndex: makeRungIndex([
      { intentRef: 'A:fill', rungHistory: [3, 5, 8], driftDirection: 'degrading' },
    ]),
    driftRecords: [],
  });
  expect(report.overallCoherenceScore).toBeGreaterThanOrEqual(0);
  expect(report.overallCoherenceScore).toBeLessThanOrEqual(1);
});

test('Law 3: empty inputs produce fully coherent report', () => {
  const report = buildInterpretationCoherence({
    rungIndex: makeRungIndex([]),
    driftRecords: [],
  });
  expect(report.overallCoherenceScore).toBe(1);
  expect(report.incoherentIntentCount).toBe(0);
});

test('Law 4: degrading rung drift marks intent as incoherent', () => {
  const report = buildInterpretationCoherence({
    rungIndex: makeRungIndex([
      { intentRef: 'A:fill', rungHistory: [3, 8], driftDirection: 'degrading' },
    ]),
    driftRecords: [],
  });
  const profile = report.profiles.find((p) => p.intentRef === 'A:fill');
  expect(profile!.isCoherent).toBe(false);
  expect(report.incoherentIntentCount).toBe(1);
});

test('Law 5: stable rung with no drift is coherent', () => {
  const report = buildInterpretationCoherence({
    rungIndex: makeRungIndex([
      { intentRef: 'A:fill', rungHistory: [3, 3, 3], driftDirection: 'stable' },
    ]),
    driftRecords: [],
  });
  const profile = report.profiles.find((p) => p.intentRef === 'A:fill');
  expect(profile!.isCoherent).toBe(true);
});

test('Law 6: driftExplainedByRungChange is in [0, 1]', () => {
  const report = buildInterpretationCoherence({
    rungIndex: makeRungIndex([
      { intentRef: 'element-0', rungHistory: [3, 8], driftDirection: 'degrading' },
    ]),
    driftRecords: [
      makeDriftRecord({
        steps: [{ stepIndex: 0, changed: true, target: 'element-0' }],
      }),
    ],
  });
  expect(report.driftExplainedByRungChange).toBeGreaterThanOrEqual(0);
  expect(report.driftExplainedByRungChange).toBeLessThanOrEqual(1);
});

test('Law 7: coherenceScore is in [0, 1] for each profile', () => {
  const report = buildInterpretationCoherence({
    rungIndex: makeRungIndex([
      { intentRef: 'A:fill', rungHistory: [3, 5, 8], driftDirection: 'degrading' },
      { intentRef: 'B:click', rungHistory: [2, 2], driftDirection: 'stable' },
    ]),
    driftRecords: [],
  });
  for (const profile of report.profiles) {
    expect(profile.coherenceScore).toBeGreaterThanOrEqual(0);
    expect(profile.coherenceScore).toBeLessThanOrEqual(1);
  }
});

test('Law 8: correlations have strength in [0, 1]', () => {
  const report = buildInterpretationCoherence({
    rungIndex: makeRungIndex([
      { intentRef: 'element-0', rungHistory: [3, 8], driftDirection: 'degrading' },
    ]),
    driftRecords: [
      makeDriftRecord({
        steps: [{ stepIndex: 0, changed: true, target: 'element-0' }],
      }),
    ],
  });
  for (const corr of report.correlations) {
    expect(corr.strength).toBeGreaterThanOrEqual(0);
    expect(corr.strength).toBeLessThanOrEqual(1);
  }
});

test('Law 9: extractIncoherentIntents limits to N items', () => {
  const report = buildInterpretationCoherence({
    rungIndex: makeRungIndex([
      { intentRef: 'A:fill', rungHistory: [3, 8], driftDirection: 'degrading' },
      { intentRef: 'B:click', rungHistory: [2, 9], driftDirection: 'degrading' },
      { intentRef: 'C:select', rungHistory: [1, 7], driftDirection: 'degrading' },
    ]),
    driftRecords: [],
  });
  const top2 = extractIncoherentIntents(report, 2);
  expect(top2.length).toBeLessThanOrEqual(2);
});

test('Law 10: pure function produces same output for same input', () => {
  const input = {
    rungIndex: makeRungIndex([
      { intentRef: 'A:fill', rungHistory: [3, 5, 8], driftDirection: 'degrading' as const },
    ]),
    driftRecords: [
      makeDriftRecord({
        steps: [{ stepIndex: 0, changed: true, target: 'element-0' }],
      }),
    ],
    generatedAt: '2026-01-01T00:00:00Z',
  };
  const r1 = buildInterpretationCoherence(input);
  const r2 = buildInterpretationCoherence(input);
  expect(r1.overallCoherenceScore).toBe(r2.overallCoherenceScore);
  expect(r1.driftExplainedByRungChange).toBe(r2.driftExplainedByRungChange);
  expect(r1.incoherentIntentCount).toBe(r2.incoherentIntentCount);
  expect(r1.profiles.length).toBe(r2.profiles.length);
});
