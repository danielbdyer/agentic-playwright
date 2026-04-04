import type { Confidence, ScenarioStatus } from '../types/workflow';
import {
  isStub, isDraft, isNeedsRepair, isScenarioBlocked, isDeprecated,
} from './scenario-lifecycle';

export function lifecycleForScenario(
  status: ScenarioStatus,
  hasUnboundSteps: boolean,
): 'normal' | 'fixme' | 'skip' | 'fail' {
  if (hasUnboundSteps || isStub(status) || isDraft(status)) {
    return 'fixme';
  }

  if (isNeedsRepair(status)) {
    return 'fail';
  }

  if (isScenarioBlocked(status) || isDeprecated(status)) {
    return 'skip';
  }

  return 'normal';
}

export function aggregateConfidence(confidences: Confidence[]): Confidence | 'mixed' {
  const unique = [...new Set(confidences)];
  const [confidence] = unique;
  return unique.length === 1 && confidence ? confidence : 'mixed';
}
