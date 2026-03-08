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
    action: 'click',
    screen: screenId,
    element: elementId,
    posture: null,
    override: null,
    snapshot_template: null,
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
  const compilerDerived = boundStep();
  const hintBacked = boundStep({
    ruleId: 'core.click',
    supplementRefs: ['knowledge/screens/policy-search.hints.yaml'],
  });
  const patternBacked = boundStep({
    ruleId: 'custom.promoted.click',
    supplementRefs: ['knowledge/patterns/promoted.patterns.yaml'],
  });
  const unbound = boundStep({
    kind: 'unbound',
    confidence: 'unbound',
    reasons: ['missing-element'],
  });

  expect(provenanceKindForBoundStep(compilerDerived)).toBe('compiler-derived');
  expect(provenanceKindForBoundStep(hintBacked)).toBe('hint-backed');
  expect(provenanceKindForBoundStep(patternBacked)).toBe('pattern-backed');
  expect(provenanceKindForBoundStep(unbound)).toBe('unbound');
  expect(summarizeProvenanceKinds([compilerDerived, hintBacked, patternBacked, unbound])).toEqual({
    'compiler-derived': 1,
    'hint-backed': 1,
    'pattern-backed': 1,
    unbound: 1,
  });
});

test('provenance summaries count unresolved reasons deterministically', () => {
  const steps = [
    boundStep({ kind: 'unbound', confidence: 'unbound', reasons: ['missing-element', 'missing-screen'] }),
    boundStep({ kind: 'unbound', confidence: 'unbound', reasons: ['missing-element'] }),
  ];

  expect(summarizeUnresolvedReasons(steps)).toEqual([
    { reason: 'missing-element', count: 2 },
    { reason: 'missing-screen', count: 1 },
  ]);
});
