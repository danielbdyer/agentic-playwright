import { RuntimeError } from '../../domain/errors';
import { deterministicRuntimeStepAgent } from '../agent';
import type { InterpretationStageInput, InterpretationStageOutput } from './types';

export async function runInterpretationStage(input: InterpretationStageInput): Promise<InterpretationStageOutput> {
  const startedAt = Date.now();
  const runAt = new Date().toISOString();
  const agent = input.environment.agent ?? deterministicRuntimeStepAgent;
  if (!input.resolutionContext) {
    throw new RuntimeError('runtime-missing-resolution-context', `Missing interface resolution context for step ${input.task.index}`);
  }

  const agentContext = {
    resolutionContext: input.resolutionContext,
    domResolver: input.environment.domResolver,
    previousResolution: input.state.previousResolution,
    observedStateSession: input.state.observedStateSession,
    provider: input.environment.provider,
    mode: input.environment.mode,
    runAt,
    translate: input.environment.translator,
    agentInterpreter: input.environment.agentInterpreter,
    controlSelection: input.environment.controlSelection,
  };

  const interpretation = await agent.resolve(input.task, agentContext);
  return {
    envelope: {
      stage: 'interpretation',
      lane: 'resolution',
      governance: interpretation.governance,
    },
    interpretation,
    runAt,
    startedAt,
    agentContext,
  };
}
