import type { ResolutionReceipt, StepTask } from '../domain/types';
import { runResolutionPipeline, type RuntimeStepAgentContext } from './agent/index';

export interface RuntimeStepAgent {
  resolve(task: StepTask, context: RuntimeStepAgentContext): Promise<ResolutionReceipt>;
}

export const deterministicRuntimeStepAgent: RuntimeStepAgent = {
  async resolve(task: StepTask, context: RuntimeStepAgentContext): Promise<ResolutionReceipt> {
    return runResolutionPipeline(task, context);
  },
};

export type { RuntimeStepAgentContext };
export { runResolutionPipeline, RESOLUTION_PRECEDENCE } from './agent/index';
