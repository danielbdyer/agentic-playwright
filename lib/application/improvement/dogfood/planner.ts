import { DEFAULT_PIPELINE_CONFIG } from '../../../domain/attention/pipeline-config';
import type { BottleneckWeights } from '../../../domain/attention/pipeline-config';
import {
  type ConvergenceState,
  initialConvergenceState,
} from '../../../domain/projection/convergence-fsm';
import type {
  ImprovementLoopConvergenceReason,
  ImprovementLoopIteration,
} from '../../../domain/improvement/types';
import type { LearningState } from '../../learning/learning-state';
import type { BrowserPoolStats } from '../../runtime-support/browser-pool';

export interface LoopState {
  readonly iterations: readonly ImprovementLoopIteration[];
  readonly cumulativeInstructions: number;
  readonly converged: boolean;
  readonly convergenceReason: ImprovementLoopConvergenceReason;
  readonly startedAt: number;
  readonly bottleneckWeights: BottleneckWeights;
  readonly convergenceFsm: ConvergenceState;
  readonly learningState: LearningState | null;
  readonly browserPoolStats: BrowserPoolStats | null;
  readonly hotScreens: readonly string[];
}

export function createInitialState(priorLearningState?: LearningState | null, initialBottleneckWeights?: BottleneckWeights): LoopState {
  return {
    iterations: [],
    cumulativeInstructions: 0,
    converged: false,
    convergenceReason: null,
    startedAt: Date.now(),
    bottleneckWeights: initialBottleneckWeights ?? DEFAULT_PIPELINE_CONFIG.bottleneckWeights,
    convergenceFsm: initialConvergenceState(),
    learningState: priorLearningState ?? null,
    browserPoolStats: null,
    hotScreens: [],
  };
}
