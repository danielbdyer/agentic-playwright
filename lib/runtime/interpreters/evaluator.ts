import { Match, pipe } from 'effect';
import type { StepInstruction } from '../../domain/types';
import type {
  ProgramFailure,
  StepProgram,
  StepProgramDiagnosticContext,
  StepProgramExecutionResult,
  StepProgramInstructionOutcome,
} from '../../domain/program';
import { interpreterOutcome } from './types';

export interface InstructionOutcome {
  status: 'ok' | 'failed';
  observedEffects: string[];
  diagnostics?: import('../../domain/program').StepInterpreterDiagnostic[];
  failureCode?: import('../../domain/program').ProgramFailureCode;
  locatorStrategy?: string;
  locatorRung?: number;
  widgetContract?: string;
}

export interface InstructionEvaluator<TEnv> {
  navigate(env: TEnv, instruction: Extract<StepInstruction, { kind: 'navigate' }>): Promise<InstructionOutcome>;
  enter(env: TEnv, instruction: Extract<StepInstruction, { kind: 'enter' }>): Promise<InstructionOutcome>;
  invoke(env: TEnv, instruction: Extract<StepInstruction, { kind: 'invoke' }>): Promise<InstructionOutcome>;
  observeStructure(env: TEnv, instruction: Extract<StepInstruction, { kind: 'observe-structure' }>): Promise<InstructionOutcome>;
  escapeHatch(env: TEnv, instruction: Extract<StepInstruction, { kind: 'custom-escape-hatch' }>): Promise<InstructionOutcome>;
}

function dispatchInstruction<TEnv>(
  evaluator: InstructionEvaluator<TEnv>,
  env: TEnv,
  instruction: StepInstruction,
): Promise<InstructionOutcome> {
  return pipe(
    Match.type<StepInstruction>(),
    Match.discriminatorsExhaustive('kind')({
      'navigate': (i) => evaluator.navigate(env, i),
      'enter': (i) => evaluator.enter(env, i),
      'invoke': (i) => evaluator.invoke(env, i),
      'observe-structure': (i) => evaluator.observeStructure(env, i),
      'custom-escape-hatch': (i) => evaluator.escapeHatch(env, i),
    }),
  )(instruction);
}

function toOutcome(index: number, instruction: StepInstruction, result: InstructionOutcome): StepProgramInstructionOutcome {
  return {
    ...interpreterOutcome({
      index,
      instruction,
      status: result.status,
      observedEffects: result.observedEffects,
      diagnostics: result.diagnostics,
      failureCode: result.failureCode,
    }),
    locatorStrategy: result.locatorStrategy,
    locatorRung: result.locatorRung,
    widgetContract: result.widgetContract,
  };
}

async function foldInstructions<TEnv>(
  instructions: readonly StepInstruction[],
  env: TEnv,
  evaluator: InstructionEvaluator<TEnv>,
  index: number,
  accumulated: readonly StepProgramInstructionOutcome[],
): Promise<{ outcomes: StepProgramInstructionOutcome[]; failure: ProgramFailure | null }> {
  if (index >= instructions.length) {
    return { outcomes: [...accumulated], failure: null };
  }

  const instruction = instructions[index]!;
  const result = await dispatchInstruction(evaluator, env, instruction);
  const outcome = toOutcome(index, instruction, result);
  const outcomes = [...accumulated, outcome];

  if (result.status === 'failed') {
    return {
      outcomes,
      failure: {
        code: result.failureCode ?? 'runtime-execution-failed',
        message: result.diagnostics?.[0]?.message ?? `Instruction ${index} failed`,
        context: {},
      },
    };
  }

  return foldInstructions(instructions, env, evaluator, index + 1, outcomes);
}

export async function interpretProgram<TEnv>(
  program: StepProgram,
  env: TEnv,
  evaluator: InstructionEvaluator<TEnv>,
  mode: string,
  _context?: StepProgramDiagnosticContext,
): Promise<StepProgramExecutionResult> {
  const { outcomes, failure } = await foldInstructions(program.instructions, env, evaluator, 0, []);

  return failure
    ? { ok: false, error: failure, value: { mode, outcomes } }
    : { ok: true, value: { mode, outcomes } };
}
