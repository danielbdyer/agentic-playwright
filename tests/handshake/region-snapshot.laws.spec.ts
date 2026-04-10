/**
 * Region snapshot capture laws.
 *
 * Verifies that captureRegionSnapshot correctly filters steps by
 * attachment region and computes ambiguity, suspension, and rung
 * distribution metrics.
 *
 * @see docs/cold-start-convergence-plan.md § 4.C item 2
 */
import { describe, test, expect } from 'vitest';
import { createScreenId, createElementId } from '../../lib/domain/kernel/identity';
import type { InterventionAttachmentRegion } from '../../lib/domain/handshake/intervention';
import {
  captureRegionSnapshot,
  type ResolutionStepShape,
} from '../../lib/domain/handshake/region-snapshot';

const SCREEN = createScreenId('policy-search');
const ELEMENT = createElementId('searchButton');
const OTHER_SCREEN = createScreenId('policy-detail');

function makeRegion(overrides?: Partial<InterventionAttachmentRegion>): InterventionAttachmentRegion {
  return {
    screens: overrides?.screens ?? [SCREEN],
    elements: overrides?.elements ?? [],
    runbookRefs: overrides?.runbookRefs ?? [],
  };
}

function makeStep(overrides: Partial<ResolutionStepShape> = {}): ResolutionStepShape {
  return {
    screen: overrides.screen ?? SCREEN,
    element: overrides.element ?? ELEMENT,
    winningSource: overrides.winningSource ?? 'approved-screen-knowledge',
    governance: overrides.governance ?? 'approved',
    kind: overrides.kind ?? 'resolved',
  };
}

describe('Region snapshot capture laws', () => {
  test('Law 1: empty steps → zero snapshot', () => {
    const snapshot = captureRegionSnapshot({ steps: [], region: makeRegion() });
    expect(snapshot.ambiguityRate).toBe(0);
    expect(snapshot.suspensionRate).toBe(0);
    expect(snapshot.meanRungIndex).toBe(0);
  });

  test('Law 2: all approved, resolved → zero ambiguity and suspension', () => {
    const steps = [
      makeStep({ winningSource: 'approved-screen-knowledge' }),
      makeStep({ winningSource: 'scenario-explicit' }),
    ];
    const snapshot = captureRegionSnapshot({ steps, region: makeRegion() });
    expect(snapshot.ambiguityRate).toBe(0);
    expect(snapshot.suspensionRate).toBe(0);
  });

  test('Law 3: agent-interpreted steps count as ambiguous', () => {
    const steps = [
      makeStep({ kind: 'resolved' }),
      makeStep({ kind: 'agent-interpreted' }),
    ];
    const snapshot = captureRegionSnapshot({ steps, region: makeRegion() });
    expect(snapshot.ambiguityRate).toBe(0.5);
  });

  test('Law 4: needs-human steps count as ambiguous', () => {
    const steps = [makeStep({ kind: 'needs-human' })];
    const snapshot = captureRegionSnapshot({ steps, region: makeRegion() });
    expect(snapshot.ambiguityRate).toBe(1);
  });

  test('Law 5: review-required governance counts as suspended', () => {
    const steps = [
      makeStep({ governance: 'approved' }),
      makeStep({ governance: 'review-required' }),
    ];
    const snapshot = captureRegionSnapshot({ steps, region: makeRegion() });
    expect(snapshot.suspensionRate).toBe(0.5);
  });

  test('Law 6: steps outside the attachment region are excluded', () => {
    const steps = [
      makeStep({ screen: SCREEN, kind: 'agent-interpreted' }),
      makeStep({ screen: OTHER_SCREEN, kind: 'agent-interpreted' }),
    ];
    const snapshot = captureRegionSnapshot({ steps, region: makeRegion() });
    // Only the SCREEN step matches; OTHER_SCREEN is excluded
    expect(snapshot.ambiguityRate).toBe(1); // 1 of 1 matching step
  });

  test('Law 7: element-level region filtering works', () => {
    const region = makeRegion({
      screens: [],
      elements: [[SCREEN, ELEMENT]],
    });
    const steps = [
      makeStep({ screen: SCREEN, element: ELEMENT }),
      makeStep({ screen: SCREEN, element: createElementId('otherElement') }),
    ];
    const snapshot = captureRegionSnapshot({ steps, region });
    // Only the searchButton step matches the element-level filter
    expect(snapshot.ambiguityRate).toBe(0); // 1 matching step, resolved
  });

  test('Law 8: deterministic for same input', () => {
    const steps = [
      makeStep({ kind: 'agent-interpreted', governance: 'review-required' }),
      makeStep({ kind: 'resolved', governance: 'approved' }),
    ];
    const a = captureRegionSnapshot({ steps, region: makeRegion() });
    const b = captureRegionSnapshot({ steps, region: makeRegion() });
    expect(a).toEqual(b);
  });
});
