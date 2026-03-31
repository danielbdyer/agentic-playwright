import { expect, test } from '@playwright/test';
import { summarizeProvenanceKinds, summarizeUnresolvedReasons, provenanceKindForBoundStep } from '../lib/domain/provenance';
import { createElementId, createScreenId } from '../lib/domain/identity';
import type { BoundStep } from '../lib/domain/types';

const screenId = createScreenId('policy-search');
const elementId = createElementId('searchButton');

function boundStep(overrides: Partial<BoundStep['binding']> & { confidence?: BoundStep['confidence'] } = {}): BoundStep {
  return {
    index: 1,
    intent: 'Click Search button',
    action_text: 'Click Search button',
    expected_text: 'Search runs',
    action: 'click',
    screen: screenId,
    element: elementId,
    posture: null,
    override: null,
    snapshot_template: null,
    resolution: null,
    confidence: overrides.confidence ?? 'compiler-derived',
    binding: {
      kind: overrides.kind ?? 'bound',
      reasons: overrides.reasons ?? [],
      ruleId: overrides.ruleId ?? null,
      normalizedIntent: 'click search button => search runs',
      knowledgeRefs: [],
      supplementRefs: overrides.supplementRefs ?? [],
      evidenceIds: [],
      governance: overrides.governance ?? 'approved',
      reviewReasons: [],
    },
  };
}

test('provenance helpers distinguish compiler-derived, hint-backed, pattern-backed, and unbound steps', () => {
  const explicit = {
    ...boundStep(),
    resolution: {
      action: 'click' as const,
      screen: screenId,
      element: elementId,
      posture: null,
      override: null,
      snapshot_template: null,
    },
  };
  const approvedKnowledge = boundStep();
  const deferred = boundStep({
    kind: 'deferred',
    confidence: 'intent-only',
  });
  const unbound = boundStep({
    kind: 'unbound',
    confidence: 'unbound',
    reasons: ['missing-element'],
  });

  expect(provenanceKindForBoundStep(explicit)).toBe('explicit');
  expect(provenanceKindForBoundStep(approvedKnowledge)).toBe('approved-knowledge');
  expect(provenanceKindForBoundStep(deferred)).toBe('unresolved');
  expect(provenanceKindForBoundStep(unbound)).toBe('unresolved');
  expect(summarizeProvenanceKinds([explicit, approvedKnowledge, deferred, unbound])).toEqual({
    explicit: 1,
    'approved-knowledge': 1,
    'live-exploration': 0,
    'agent-interpreted': 0,
    unresolved: 2,
  });
});

test('provenance summaries count unresolved reasons deterministically', () => {
  const steps = [
    boundStep({ kind: 'deferred', confidence: 'intent-only' }),
    boundStep({ kind: 'unbound', confidence: 'unbound', reasons: ['missing-element'] }),
  ];

  expect(summarizeUnresolvedReasons(steps)).toEqual([
    { reason: 'missing-element', count: 1 },
    { reason: 'runtime-resolution-required', count: 1 },
  ]);
});
