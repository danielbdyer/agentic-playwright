import type { ResolutionPrecedenceRung } from '../../../domain/resolution/precedence';
import type { ResolutionEvent, ResolutionReceipt } from '../../../domain/resolution/types';
import type { RuntimeAgentStageContext } from '../types';
import type { ResolutionAccumulator } from '../resolution/resolution-stages';
import { walkStrategyChainAsync, type AsyncRungStrategy, type RungAttemptResult } from '../resolution/strategy-chain-walker';

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

/**
 * Run a chain of resolution strategies using the free-forgetful algebra.
 *
 * Each strategy is adapted to an AsyncRungStrategy, walked via
 * `walkStrategyChainAsync` (which uses `freeSearchAsync` under the hood),
 * and the trail's exhaustion entries are converted back to ResolutionEvents.
 *
 * This wires Duality 2 (Free/Forgetful) and Abstraction 5 (Strategy Chain Walker)
 * into the resolution pipeline.
 */
export async function runStrategyChain(
  strategies: readonly ResolutionStrategy[],
  stage: RuntimeAgentStageContext,
  acc: ResolutionAccumulator | null,
): Promise<StrategyChainResult> {
  // Collect events from all strategies (both successful and failed)
  const allEvents: ResolutionEvent[] = [];

  // Adapt ResolutionStrategy[] to AsyncRungStrategy<ResolutionReceipt>
  const rungStrategies: AsyncRungStrategy<ResolutionReceipt>[] = strategies.map(
    (strategy): AsyncRungStrategy<ResolutionReceipt> => ({
      rung: strategy.rungs[0] ?? 'needs-human',
      try: async (): Promise<RungAttemptResult<ResolutionReceipt>> => {
        const { receipt, events } = await strategy.attempt(stage, acc);
        allEvents.push(...events);
        if (receipt) {
          return { outcome: 'resolved', value: receipt, reason: strategy.name };
        }
        return { outcome: 'failed', reason: strategy.name };
      },
    }),
  );

  const { result } = await walkStrategyChainAsync(rungStrategies);

  if (result) {
    allEvents.push({ kind: 'receipt-produced', receipt: result });
  }

  return { receipt: result, events: allEvents };
}
