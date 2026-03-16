import type { ResolutionPrecedenceRung } from '../../domain/precedence';
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
  const allEvents: ResolutionEvent[] = [];
  for (const strategy of strategies) {
    const { receipt, events } = await strategy.attempt(stage, acc);
    allEvents.push(...events);
    if (receipt) {
      allEvents.push({ kind: 'receipt-produced', receipt });
      return { receipt, events: allEvents };
    }
  }
  return { receipt: null, events: allEvents };
}
