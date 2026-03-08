import type { BoundStep, StepProvenanceKind } from './types';

export interface CountByProvenanceKind {
  'compiler-derived': number;
  'hint-backed': number;
  'pattern-backed': number;
  unbound: number;
}

export interface CountByGovernance {
  approved: number;
  'review-required': number;
  blocked: number;
}

export interface CountedReason {
  reason: string;
  count: number;
}

const defaultProvenanceCounts = (): CountByProvenanceKind => ({
  'compiler-derived': 0,
  'hint-backed': 0,
  'pattern-backed': 0,
  unbound: 0,
});

const defaultGovernanceCounts = (): CountByGovernance => ({
  approved: 0,
  'review-required': 0,
  blocked: 0,
});

function hasHintSupplement(step: BoundStep): boolean {
  return step.binding.supplementRefs.some((ref) => ref.endsWith('.hints.yaml'));
}

function hasPatternSupplement(step: BoundStep): boolean {
  return step.binding.supplementRefs.some((ref) => ref.includes('/patterns/') && !ref.endsWith('/core.patterns.yaml'));
}

export function provenanceKindForBoundStep(step: BoundStep): StepProvenanceKind {
  if (step.binding.kind === 'unbound' || step.confidence === 'unbound') {
    return 'unbound';
  }

  if (hasHintSupplement(step)) {
    return 'hint-backed';
  }

  if (hasPatternSupplement(step)) {
    return 'pattern-backed';
  }

  return 'compiler-derived';
}

export function summarizeProvenanceKinds(steps: BoundStep[]): CountByProvenanceKind {
  const counts = defaultProvenanceCounts();
  for (const step of steps) {
    counts[provenanceKindForBoundStep(step)] += 1;
  }
  return counts;
}

export function summarizeGovernance(steps: BoundStep[]): CountByGovernance {
  const counts = defaultGovernanceCounts();
  for (const step of steps) {
    counts[step.binding.governance] += 1;
  }
  return counts;
}

export function summarizeUnresolvedReasons(steps: BoundStep[]): CountedReason[] {
  const counts = new Map<string, number>();

  for (const step of steps) {
    for (const reason of step.binding.reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => {
      const countOrder = right.count - left.count;
      if (countOrder !== 0) {
        return countOrder;
      }
      return left.reason.localeCompare(right.reason);
    });
}
