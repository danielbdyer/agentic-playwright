import type { ResolutionPipelineResult, ResolutionReceipt, GroundedStep } from '../domain/types';
import { runResolutionPipeline, type RuntimeStepAgentContext } from './agent/index';

export interface RuntimeStepAgent {
  resolve(task: GroundedStep, context: RuntimeStepAgentContext): Promise<ResolutionReceipt>;
}

export const deterministicRuntimeStepAgent: RuntimeStepAgent = {
  async resolve(task: GroundedStep, context: RuntimeStepAgentContext): Promise<ResolutionReceipt> {
    const { receipt } = await runResolutionPipeline(task, context);
    return receipt;
  },
};

export type { RuntimeStepAgentContext, ResolutionPipelineResult };
export { runResolutionPipeline, RESOLUTION_PRECEDENCE } from './agent/index';
