import type { ResolutionPipelineResult, ResolutionReceipt, GroundedStep, ResolutionStepOutcome } from '../../domain/types';
import { runResolutionPipeline, type RuntimeStepAgentContext } from './index';

export type { ResolutionStepOutcome };

export interface RuntimeStepAgent {
  resolve(task: GroundedStep, context: RuntimeStepAgentContext): Promise<ResolutionStepOutcome>;
}

export const deterministicRuntimeStepAgent: RuntimeStepAgent = {
  async resolve(task: GroundedStep, context: RuntimeStepAgentContext): Promise<ResolutionStepOutcome> {
    const { receipt, semanticAccrual, semanticDictionaryHitId } = await runResolutionPipeline(task, context);
    return {
      receipt,
      semanticAccrual: semanticAccrual ?? null,
      semanticDictionaryHitId: semanticDictionaryHitId ?? null,
    };
  },
};

export type { RuntimeStepAgentContext, ResolutionPipelineResult };
export { runResolutionPipeline, RESOLUTION_PRECEDENCE } from './index';
