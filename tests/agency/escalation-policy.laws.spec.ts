/**
 * Escalation Policy — law-style tests.
 *
 * Laws tested:
 * 1. No escalation before minimum iteration threshold
 * 2. needs-human steps always trigger escalation
 * 3. agent-proposed-low-confidence triggers escalation
 * 4. live-dom/agent-interpreted winning source triggers escalation
 * 5. Escalation capped at maxEscalatedScenarios
 * 6. Escalated scenarios sorted by priority (highest first)
 * 7. Empty input → no escalation
 * 8. Fully resolved steps → no escalation
 */

import { test, expect } from '@playwright/test';
import {
  evaluateEscalationPolicy,
  type EscalationThresholds,
} from '../../workshop/policy/escalation-policy';
import type { AdoId } from '../../product/domain/kernel/identity';

const adoId = (id: string) => id as AdoId;

const DEFAULT_THRESHOLDS: EscalationThresholds = {
  agentProposedConfidenceFloor: 0.6,
  maxEscalatedScenarios: 10,
  minIterationForEscalation: 1,
};

test.describe('Escalation Policy Laws', () => {
  test('no escalation before minimum iteration threshold', () => {
    const result = evaluateEscalationPolicy(
      [{ adoId: adoId('ADO-1'), stepIndex: 0, interpretation: { kind: 'needs-human' } }],
      0, // iteration 0, below threshold
      { ...DEFAULT_THRESHOLDS, minIterationForEscalation: 1 },
    );
    expect(result.escalatedScenarios).toHaveLength(0);
    expect(result.summary).toContain('below minimum');
  });

  test('needs-human steps always trigger escalation', () => {
    const result = evaluateEscalationPolicy(
      [
        { adoId: adoId('ADO-1'), stepIndex: 0, interpretation: { kind: 'needs-human' } },
        { adoId: adoId('ADO-1'), stepIndex: 1, interpretation: { kind: 'resolved' } },
      ],
      1,
      DEFAULT_THRESHOLDS,
    );
    expect(result.escalatedScenarios).toHaveLength(1);
    expect(result.escalatedScenarios[0]!.adoId).toBe('ADO-1');
    expect(result.escalatedScenarios[0]!.primaryReason).toBe('needs-human');
    expect(result.escalatedSteps).toBe(1);
  });

  test('agent-proposed-low-confidence triggers escalation', () => {
    const result = evaluateEscalationPolicy(
      [{ adoId: adoId('ADO-2'), stepIndex: 0, interpretation: { kind: 'agent-interpreted', confidence: 'agent-proposed' } }],
      1,
      DEFAULT_THRESHOLDS,
    );
    expect(result.escalatedScenarios).toHaveLength(1);
    expect(result.escalatedScenarios[0]!.primaryReason).toBe('agent-proposed-low-confidence');
  });

  test('live-dom winning source triggers escalation', () => {
    const result = evaluateEscalationPolicy(
      [{ adoId: adoId('ADO-3'), stepIndex: 0, interpretation: { kind: 'resolved', winningSource: 'live-dom' } }],
      1,
      DEFAULT_THRESHOLDS,
    );
    expect(result.escalatedScenarios).toHaveLength(1);
    expect(result.escalatedScenarios[0]!.primaryReason).toBe('live-dom-fallback');
  });

  test('agent-interpreted winning source triggers escalation', () => {
    const result = evaluateEscalationPolicy(
      [{ adoId: adoId('ADO-4'), stepIndex: 0, interpretation: { kind: 'resolved', winningSource: 'agent-interpreted' } }],
      1,
      DEFAULT_THRESHOLDS,
    );
    expect(result.escalatedScenarios).toHaveLength(1);
    expect(result.escalatedScenarios[0]!.primaryReason).toBe('live-dom-fallback');
  });

  test('escalation capped at maxEscalatedScenarios', () => {
    const steps = Array.from({ length: 20 }, (_, i) => ({
      adoId: adoId(`ADO-${i}`),
      stepIndex: 0,
      interpretation: { kind: 'needs-human' as const },
    }));
    const result = evaluateEscalationPolicy(steps, 1, {
      ...DEFAULT_THRESHOLDS,
      maxEscalatedScenarios: 5,
    });
    expect(result.escalatedScenarios).toHaveLength(5);
    expect(result.escalatedSteps).toBe(20);
  });

  test('escalated scenarios sorted by priority (highest first)', () => {
    const steps = [
      { adoId: adoId('ADO-low'), stepIndex: 0, interpretation: { kind: 'resolved', winningSource: 'live-dom' } },
      { adoId: adoId('ADO-high'), stepIndex: 0, interpretation: { kind: 'needs-human' } },
    ];
    const result = evaluateEscalationPolicy(steps, 1, DEFAULT_THRESHOLDS);
    expect(result.escalatedScenarios[0]!.adoId).toBe('ADO-high');
    expect(result.escalatedScenarios[1]!.adoId).toBe('ADO-low');
  });

  test('empty input → no escalation', () => {
    const result = evaluateEscalationPolicy([], 1, DEFAULT_THRESHOLDS);
    expect(result.escalatedScenarios).toHaveLength(0);
    expect(result.totalSteps).toBe(0);
    expect(result.summary).toContain('No steps require');
  });

  test('fully resolved steps → no escalation', () => {
    const result = evaluateEscalationPolicy(
      [
        { adoId: adoId('ADO-1'), stepIndex: 0, interpretation: { kind: 'resolved', confidence: 'compiler-derived', winningSource: 'explicit' } },
        { adoId: adoId('ADO-1'), stepIndex: 1, interpretation: { kind: 'resolved', confidence: 'compiler-derived', winningSource: 'control' } },
      ],
      1,
      DEFAULT_THRESHOLDS,
    );
    expect(result.escalatedScenarios).toHaveLength(0);
    expect(result.totalSteps).toBe(2);
  });

  test('multiple steps from same scenario grouped into one escalated scenario', () => {
    const result = evaluateEscalationPolicy(
      [
        { adoId: adoId('ADO-1'), stepIndex: 0, interpretation: { kind: 'needs-human' } },
        { adoId: adoId('ADO-1'), stepIndex: 2, interpretation: { kind: 'needs-human' } },
      ],
      1,
      DEFAULT_THRESHOLDS,
    );
    expect(result.escalatedScenarios).toHaveLength(1);
    expect(result.escalatedScenarios[0]!.triggerStepIndices).toEqual([0, 2]);
    expect(result.escalatedSteps).toBe(2);
  });
});
