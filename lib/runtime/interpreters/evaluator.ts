import type { StepInstruction } from '../../domain/types';
import type {
  ProgramFailure,
  ProgramFailureCode,
  StepInterpreterDiagnostic,
  StepProgram,
  StepProgramDiagnosticContext,
  StepProgramExecutionResult,
  StepProgramInstructionOutcome,
} from '../../domain/program';
import { interpreterOutcome } from './types';

export interface InstructionOutcome {
  status: 'ok' | 'failed';
  observedEffects: string[];
  diagnostics?: StepInterpreterDiagnostic[];
  failureCode?: ProgramFailureCode;
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
  switch (instruction.kind) {
    case 'navigate': return evaluator.navigate(env, instruction);
    case 'enter': return evaluator.enter(env, instruction);
    case 'invoke': return evaluator.invoke(env, instruction);
    case 'observe-structure': return evaluator.observeStructure(env, instruction);
    case 'custom-escape-hatch': return evaluator.escapeHatch(env, instruction);
  }
}

export async function interpretProgram<TEnv>(
  program: StepProgram,
  env: TEnv,
  evaluator: InstructionEvaluator<TEnv>,
  mode: string,
  _context?: StepProgramDiagnosticContext,
): Promise<StepProgramExecutionResult> {
  const outcomes: StepProgramInstructionOutcome[] = [];

  for (let i = 0; i < program.instructions.length; i++) {
    const instruction = program.instructions[i]!;
    const result = await dispatchInstruction(evaluator, env, instruction);
    const outcome: StepProgramInstructionOutcome = {
      ...interpreterOutcome({
        index: i,
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

    outcomes.push(outcome);

    if (result.status === 'failed') {
      const failure: ProgramFailure = {
        code: result.failureCode ?? 'runtime-execution-failed',
        message: result.diagnostics?.[0]?.message ?? `Instruction ${i} failed`,
        context: {},
      };
      return {
        ok: false,
        error: failure,
        value: { mode, outcomes },
      };
    }
  }

  return { ok: true, value: { mode, outcomes } };
}
