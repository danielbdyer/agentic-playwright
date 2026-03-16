import type { ResolutionReceipt, GroundedStep } from '../domain/types';
import { runResolutionPipeline, type RuntimeStepAgentContext } from './agent/index';

export interface RuntimeStepAgent {
  resolve(task: GroundedStep, context: RuntimeStepAgentContext): Promise<ResolutionReceipt>;
}

export const deterministicRuntimeStepAgent: RuntimeStepAgent = {
  async resolve(task: GroundedStep, context: RuntimeStepAgentContext): Promise<ResolutionReceipt> {
    return runResolutionPipeline(task, context);
  },
};

export type { RuntimeStepAgentContext };
export { runResolutionPipeline, RESOLUTION_PRECEDENCE } from './agent/index';
