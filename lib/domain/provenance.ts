import type { BoundStep, StepProvenanceKind } from './types';

export interface CountByProvenanceKind {
  explicit: number;
  'approved-knowledge': number;
  'live-exploration': number;
  unresolved: number;
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
  explicit: 0,
  'approved-knowledge': 0,
  'live-exploration': 0,
  unresolved: 0,
});

const defaultGovernanceCounts = (): CountByGovernance => ({
  approved: 0,
  'review-required': 0,
  blocked: 0,
});

export function provenanceKindForBoundStep(step: BoundStep): StepProvenanceKind {
  if (step.binding.kind === 'unbound' || step.binding.kind === 'deferred' || step.confidence === 'unbound' || step.confidence === 'intent-only') {
    return 'unresolved';
  }

  if (step.resolution) {
    return 'explicit';
  }

  return 'approved-knowledge';
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
    if (step.binding.kind === 'deferred') {
      counts.set('runtime-resolution-required', (counts.get('runtime-resolution-required') ?? 0) + 1);
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
