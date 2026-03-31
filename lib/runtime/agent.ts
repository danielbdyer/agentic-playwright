import type { ResolutionPipelineResult, ResolutionReceipt, GroundedStep, SemanticDictionaryAccrualInput } from '../domain/types';
import { runResolutionPipeline, type RuntimeStepAgentContext } from './agent/index';

/**
 * The outcome of a single resolution step.
 * Extends the receipt with semantic dictionary learning signals so the
 * caller (composition layer) can close the learning flywheel.
 */
export interface ResolutionStepOutcome {
  readonly receipt: ResolutionReceipt;
  /** Accrual input to persist into the semantic dictionary (when a later rung resolved). */
  readonly semanticAccrual: SemanticDictionaryAccrualInput | null;
  /** Entry ID of the dictionary entry that was used (for success/failure tracking). */
  readonly semanticDictionaryHitId: string | null;
}

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
export { runResolutionPipeline, RESOLUTION_PRECEDENCE } from './agent/index';
