import type { ResolutionPrecedenceRung } from '../../domain/resolution/precedence';
import type { ResolutionEvent, ResolutionReceipt } from '../../domain/types';
import type { RuntimeAgentStageContext } from './types';
import type { ResolutionAccumulator } from './resolution-stages';

export interface StrategyAttemptResult {
  receipt: ResolutionReceipt | null;
  events: ResolutionEvent[];
}

export interface ResolutionStrategy {
  readonly name: string;
  readonly rungs: readonly ResolutionPrecedenceRung[];
  readonly requiresAccumulator: boolean;
  attempt(stage: RuntimeAgentStageContext, acc: ResolutionAccumulator | null): Promise<StrategyAttemptResult>;
}

export interface StrategyChainResult {
  receipt: ResolutionReceipt | null;
  events: ResolutionEvent[];
}

export async function runStrategyChain(
  strategies: readonly ResolutionStrategy[],
  stage: RuntimeAgentStageContext,
  acc: ResolutionAccumulator | null,
): Promise<StrategyChainResult> {
  const step = async (
    remaining: readonly ResolutionStrategy[],
    priorEvents: readonly ResolutionEvent[],
  ): Promise<StrategyChainResult> => {
    const [head, ...tail] = remaining;
    if (!head) {
      return { receipt: null, events: [...priorEvents] };
    }
    const { receipt, events } = await head.attempt(stage, acc);
    const accumulated = [...priorEvents, ...events];
    return receipt
      ? { receipt, events: [...accumulated, { kind: 'receipt-produced', receipt }] }
      : step(tail, accumulated);
  };
  return step(strategies, []);
}
