import type { BoundStep, StepProvenanceKind } from './types';

export interface CountByProvenanceKind {
  explicit: number;
  'approved-knowledge': number;
  'live-exploration': number;
  'agent-interpreted': number;
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
  'agent-interpreted': 0,
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

export function summarizeProvenanceKinds(steps: readonly BoundStep[]): CountByProvenanceKind {
  return steps.reduce<CountByProvenanceKind>(
    (counts, step) => {
      const kind = provenanceKindForBoundStep(step);
      return { ...counts, [kind]: counts[kind] + 1 };
    },
    defaultProvenanceCounts(),
  );
}

export function summarizeGovernance(steps: readonly BoundStep[]): CountByGovernance {
  return steps.reduce<CountByGovernance>(
    (counts, step) => ({ ...counts, [step.binding.governance]: counts[step.binding.governance] + 1 }),
    defaultGovernanceCounts(),
  );
}

export function summarizeUnresolvedReasons(steps: readonly BoundStep[]): readonly CountedReason[] {
  const allReasons = steps.flatMap((step) => [
    ...step.binding.reasons,
    ...(step.binding.kind === 'deferred' ? ['runtime-resolution-required'] : []),
  ]);
  const counts = allReasons.reduce<ReadonlyMap<string, number>>(
    (map, reason) => new Map([...map, [reason, (map.get(reason) ?? 0) + 1]]),
    new Map(),
  );
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}
