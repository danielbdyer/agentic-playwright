import { Confidence, ScenarioStatus } from './types';

export function lifecycleForScenario(
  status: ScenarioStatus,
  hasUnboundSteps: boolean,
): 'normal' | 'fixme' | 'skip' | 'fail' {
  if (hasUnboundSteps || status === 'stub' || status === 'draft') {
    return 'fixme';
  }

  if (status === 'needs-repair') {
    return 'fail';
  }

  if (status === 'blocked' || status === 'deprecated') {
    return 'skip';
  }

  return 'normal';
}

export function aggregateConfidence(confidences: Confidence[]): Confidence | 'mixed' {
  const unique = [...new Set(confidences)];
  return unique.length === 1 ? unique[0] : 'mixed';
}

