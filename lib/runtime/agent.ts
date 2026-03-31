import { Effect } from 'effect';
import type { ResolutionPipelineResult, ResolutionReceipt, GroundedStep, ResolutionStepOutcome } from '../domain/types';
import { deterministicResolutionEngine, runResolutionPipeline, type RuntimeStepAgentContext } from './agent/index';

export type { ResolutionStepOutcome };

export interface RuntimeStepAgent {
  resolve(task: GroundedStep, context: RuntimeStepAgentContext): Promise<ResolutionStepOutcome>;
}

export const deterministicRuntimeStepAgent: RuntimeStepAgent = {
  resolve: (task: GroundedStep, context: RuntimeStepAgentContext): Promise<ResolutionStepOutcome> =>
    Effect.runPromise(deterministicResolutionEngine.resolveStep(task, context)),
};

export type { RuntimeStepAgentContext, ResolutionPipelineResult };
export { runResolutionPipeline, RESOLUTION_PRECEDENCE, deterministicResolutionEngine } from './agent/index';
