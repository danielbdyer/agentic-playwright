import type { ResolutionPrecedenceRung } from '../../domain/precedence';
import type { ResolutionReceipt } from '../../domain/types';
import type { RuntimeAgentStageContext } from './types';
import type { ResolutionAccumulator } from './resolution-stages';

export interface ResolutionStrategy {
  readonly name: string;
  readonly rungs: readonly ResolutionPrecedenceRung[];
  readonly requiresAccumulator: boolean;
  attempt(stage: RuntimeAgentStageContext, acc: ResolutionAccumulator | null): Promise<ResolutionReceipt | null>;
}

export function runStrategyChain(
  strategies: readonly ResolutionStrategy[],
  stage: RuntimeAgentStageContext,
  acc: ResolutionAccumulator | null,
): Promise<ResolutionReceipt | null> {
  return strategies.reduce<Promise<ResolutionReceipt | null>>(
    async (pending, strategy) => {
      const prior = await pending;
      if (prior) return prior;
      return strategy.attempt(stage, acc);
    },
    Promise.resolve(null),
  );
}
