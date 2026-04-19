/**
 * Impact scheduler laws — verifies the C6 before/after measurement
 * pipeline: identify measurable interventions, capture snapshots,
 * compute impact.
 *
 * @see docs/cold-start-convergence-plan.md § 4.C item 2
 */
import { describe, test, expect } from 'vitest';
import { createScreenId, createElementId } from '../../product/domain/kernel/identity';
import type { InterventionReceipt, InterventionAttachmentRegion } from '../../product/domain/handshake/intervention';
import type { ResolutionStepShape } from '../../product/domain/handshake/region-snapshot';
import {
  identifyMeasurableInterventions,
  measureIntervention,
  measureInterventionBatch,
  type MeasurableIntervention,
} from '../../product/domain/handshake/impact-scheduler';

const SCREEN = createScreenId('policy-search');
const ELEMENT = createElementId('searchButton');

function makeRegion(): InterventionAttachmentRegion {
  return { screens: [SCREEN], elements: [], runbookRefs: [] };
}

function makeReceipt(overrides: Partial<InterventionReceipt> = {}): InterventionReceipt {
  return {
    interventionId: overrides.interventionId ?? 'int-1',
    kind: 'proposal-approved',
    status: overrides.status ?? 'completed',
    summary: 'test intervention',
    participantRefs: [],
    target: { kind: 'step', ref: 'step-0', label: 'test step' },
    effects: [],
    startedAt: '2026-04-10T00:00:00Z',
    payload: {},
    handoff: {
      unresolvedIntent: 'find policy',
      attemptedStrategies: [],
      evidenceSlice: { artifactPaths: [], summaries: [] },
      blockageType: 'target-ambiguity',
      requestedParticipation: 'approve',
      blastRadius: 'local',
      epistemicStatus: 'approved',
      semanticCore: { token: 'sem:test', summary: 'test', driftStatus: 'preserved' },
      attachmentRegion: overrides.handoff?.attachmentRegion ?? makeRegion(),
      ...overrides.handoff,
    },
    ...overrides,
  } as InterventionReceipt;
}

function makeStep(overrides: Partial<ResolutionStepShape> = {}): ResolutionStepShape {
  return {
    screen: SCREEN,
    element: ELEMENT,
    winningSource: overrides.winningSource ?? 'approved-screen-knowledge',
    governance: overrides.governance ?? 'approved',
    kind: overrides.kind ?? 'resolved',
  };
}

describe('Impact scheduler laws', () => {
  // ─── Identification ───

  test('Law 1: completed receipt with attachmentRegion is measurable', () => {
    const result = identifyMeasurableInterventions({
      receipts: [makeReceipt()],
      alreadyMeasuredIds: new Set(),
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.interventionId).toBe('int-1');
  });

  test('Law 2: non-completed receipt is not measurable', () => {
    const result = identifyMeasurableInterventions({
      receipts: [makeReceipt({ status: 'planned' })],
      alreadyMeasuredIds: new Set(),
    });
    expect(result).toHaveLength(0);
  });

  test('Law 3: receipt without attachmentRegion is not measurable', () => {
    const receipt = makeReceipt();
    const noRegion = {
      ...receipt,
      handoff: receipt.handoff ? { ...receipt.handoff, attachmentRegion: undefined } : undefined,
    } as InterventionReceipt;
    const result = identifyMeasurableInterventions({
      receipts: [noRegion],
      alreadyMeasuredIds: new Set(),
    });
    expect(result).toHaveLength(0);
  });

  test('Law 4: already-measured receipt is excluded', () => {
    const result = identifyMeasurableInterventions({
      receipts: [makeReceipt()],
      alreadyMeasuredIds: new Set(['int-1']),
    });
    expect(result).toHaveLength(0);
  });

  // ─── Measurement ───

  test('Law 5: measureIntervention produces impact receipt with correct fields', () => {
    const intervention: MeasurableIntervention = {
      interventionId: 'int-1',
      region: makeRegion(),
      receipt: makeReceipt(),
    };
    const before = [makeStep({ kind: 'agent-interpreted', governance: 'review-required' })];
    const after = [makeStep({ kind: 'resolved', governance: 'approved' })];

    const result = measureIntervention({
      intervention,
      beforeSteps: before,
      afterSteps: after,
      observedAt: '2026-04-10T12:00:00Z',
      estimatedReadTokens: 100,
      payloadSizeBytes: 500,
    });

    expect(result.kind).toBe('intervention-impact-receipt');
    expect(result.interventionId).toBe('int-1');
    expect(result.tokenImpact.ambiguityReduction).toBeGreaterThan(0);
    expect(result.tokenImpact.suspensionAvoided).toBe(true);
  });

  test('Law 6: no improvement → zero/negative impact', () => {
    const intervention: MeasurableIntervention = {
      interventionId: 'int-2',
      region: makeRegion(),
      receipt: makeReceipt({ interventionId: 'int-2' }),
    };
    // Same steps before and after — no improvement
    const steps = [makeStep()];

    const result = measureIntervention({
      intervention,
      beforeSteps: steps,
      afterSteps: steps,
      observedAt: '2026-04-10T12:00:00Z',
      estimatedReadTokens: 100,
      payloadSizeBytes: 500,
    });

    expect(result.tokenImpact.ambiguityReduction).toBe(0);
    expect(result.tokenImpact.rungImprovement).toBe(0);
  });

  // ─── Batch ───

  test('Law 7: measureInterventionBatch processes multiple interventions', () => {
    const interventions = [
      { interventionId: 'a', region: makeRegion(), receipt: makeReceipt({ interventionId: 'a' }) },
      { interventionId: 'b', region: makeRegion(), receipt: makeReceipt({ interventionId: 'b' }) },
    ];
    const results = measureInterventionBatch({
      interventions,
      beforeSteps: [makeStep({ kind: 'agent-interpreted' })],
      afterSteps: [makeStep({ kind: 'resolved' })],
      observedAt: '2026-04-10T12:00:00Z',
      defaultEstimatedReadTokens: 100,
      defaultPayloadSizeBytes: 500,
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.interventionId).toBe('a');
    expect(results[1]!.interventionId).toBe('b');
  });

  test('Law 8: deterministic for same input', () => {
    const intervention: MeasurableIntervention = {
      interventionId: 'det-1',
      region: makeRegion(),
      receipt: makeReceipt({ interventionId: 'det-1' }),
    };
    const input = {
      intervention,
      beforeSteps: [makeStep({ kind: 'agent-interpreted' })],
      afterSteps: [makeStep({ kind: 'resolved' })],
      observedAt: '2026-04-10T12:00:00Z',
      estimatedReadTokens: 100,
      payloadSizeBytes: 500,
    };
    const a = measureIntervention(input);
    const b = measureIntervention(input);
    expect(a).toEqual(b);
  });
});
