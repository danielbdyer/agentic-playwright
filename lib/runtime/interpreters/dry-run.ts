import { Match, pipe } from 'effect';
import type {
  ProgramFailure,
  StepProgram,
  StepProgramDiagnosticContext,
  StepProgramExecutionResult,
  StepProgramInterpreter,
} from '../../domain/commitment/program';
import { createDiagnostic } from '../../domain/governance/diagnostics';
import { runtimeEscapeHatchError } from '../../domain/kernel/errors';
import type { StepInstruction } from '../../domain/intent/types';
import type { InterpreterEnvironment } from './types';
import { interpreterOutcome, requireScreen, resolvePosture } from './types';

type DryRunStepResult =
  | { readonly cont: true; readonly outcome: ReturnType<typeof interpreterOutcome> }
  | { readonly cont: false; readonly outcome: ReturnType<typeof interpreterOutcome>; readonly error: ProgramFailure };

function failResult(
  mode: string,
  outcomes: ReturnType<typeof interpreterOutcome>[],
  error: ProgramFailure,
  context?: StepProgramDiagnosticContext,
): StepProgramExecutionResult {
  return {
    ok: false,
    error,
    value: { mode, outcomes },
    diagnostic: context
      ? createDiagnostic({
          code: error.code,
          severity: 'error',
          message: error.message,
          adoId: context.adoId,
          stepIndex: context.stepIndex,
          artifactPath: context.artifactPath,
          provenance: context.provenance,
        })
      : undefined,
  };
}

function validateElementTarget(
  environment: InterpreterEnvironment,
  index: number,
  instruction: Extract<StepInstruction, { kind: 'invoke' }> | Extract<StepInstruction, { kind: 'observe-structure' }>,
): DryRunStepResult {
  const screen = requireScreen(environment.screens, instruction.screen);
  if (!screen.ok) {
    return { cont: false, outcome: interpreterOutcome({ index, instruction, status: 'failed', diagnostics: [{ code: screen.code, message: screen.message, context: screen.context }], failureCode: screen.code }), error: { code: screen.code, message: screen.message, context: screen.context } };
  }
  if (!screen.value.elements[instruction.element]) {
    const error = { code: 'runtime-unknown-effect-target' as const, message: `Unknown element target ${instruction.element}`, context: { target: instruction.element, targetKind: 'element' } };
    return { cont: false, outcome: interpreterOutcome({ index, instruction, status: 'failed', diagnostics: [error], failureCode: error.code }), error };
  }
  if (instruction.kind === 'observe-structure' && !environment.hasSnapshotTemplate(instruction.snapshotTemplate)) {
    const error = { code: 'runtime-missing-snapshot-template' as const, message: `Missing snapshot template ${instruction.snapshotTemplate}`, context: { snapshotTemplate: instruction.snapshotTemplate } };
    return { cont: false, outcome: interpreterOutcome({ index, instruction, status: 'failed', diagnostics: [error], failureCode: error.code }), error };
  }
  return { cont: true, outcome: interpreterOutcome({ index, instruction, status: 'ok', observedEffects: ['target:validated'] }) };
}

const dryRunDispatch = pipe(
  Match.type<StepInstruction>(),
  Match.discriminatorsExhaustive('kind')({
    'navigate': (i) => (environment: InterpreterEnvironment, index: number): DryRunStepResult => {
      const screen = requireScreen(environment.screens, i.screen);
      if (!screen.ok) {
        return { cont: false, outcome: interpreterOutcome({ index, instruction: i, status: 'failed', diagnostics: [{ code: screen.code, message: screen.message, context: screen.context }], failureCode: screen.code }), error: { code: screen.code, message: screen.message, context: screen.context } };
      }
      return { cont: true, outcome: interpreterOutcome({ index, instruction: i, status: 'ok', observedEffects: ['navigation:validated'] }) };
    },
    'enter': (i) => (environment: InterpreterEnvironment, index: number): DryRunStepResult => {
      const screen = requireScreen(environment.screens, i.screen);
      if (!screen.ok) {
        return { cont: false, outcome: interpreterOutcome({ index, instruction: i, status: 'failed', diagnostics: [{ code: screen.code, message: screen.message, context: screen.context }], failureCode: screen.code }), error: { code: screen.code, message: screen.message, context: screen.context } };
      }
      if (!screen.value.elements[i.element]) {
        const error = { code: 'runtime-unknown-effect-target' as const, message: `Unknown element target ${i.element}`, context: { target: i.element, targetKind: 'element' } };
        return { cont: false, outcome: interpreterOutcome({ index, instruction: i, status: 'failed', diagnostics: [error], failureCode: error.code }), error };
      }
      const posture = resolvePosture(screen.value, i.element, i.posture);
      if (!posture.ok) {
        return { cont: false, outcome: interpreterOutcome({ index, instruction: i, status: 'failed', diagnostics: [{ code: posture.code, message: posture.message, context: posture.context }], failureCode: posture.code }), error: { code: posture.code, message: posture.message, context: posture.context } };
      }
      const resolved = environment.resolveValue(environment.fixtures, i.value);
      if (i.value && resolved === undefined) {
        const error = { code: 'runtime-unresolved-value-ref' as const, message: 'Unable to resolve input value', context: { instructionKind: i.kind } };
        return { cont: false, outcome: interpreterOutcome({ index, instruction: i, status: 'failed', diagnostics: [error], failureCode: error.code }), error };
      }
      return { cont: true, outcome: interpreterOutcome({ index, instruction: i, status: 'ok', observedEffects: ['value-entry:validated'] }) };
    },
    'invoke': (i) => (environment: InterpreterEnvironment, index: number): DryRunStepResult =>
      validateElementTarget(environment, index, i),
    'observe-structure': (i) => (environment: InterpreterEnvironment, index: number): DryRunStepResult =>
      validateElementTarget(environment, index, i),
    'custom-escape-hatch': (i) => (_environment: InterpreterEnvironment, index: number): DryRunStepResult => {
      const errorInfo = runtimeEscapeHatchError(i.reason);
      const error: ProgramFailure = { code: 'runtime-step-program-escape-hatch', message: errorInfo.message, context: errorInfo.context };
      return { cont: false, outcome: interpreterOutcome({ index, instruction: i, status: 'failed', diagnostics: [{ code: error.code, message: error.message, context: error.context }], failureCode: error.code }), error };
    },
  }),
);

export const dryRunInterpreter: StepProgramInterpreter<InterpreterEnvironment> = {
  mode: 'dry-run',
  async run(program: StepProgram, environment: InterpreterEnvironment, context?: StepProgramDiagnosticContext): Promise<StepProgramExecutionResult> {
    const step = (
      remaining: readonly [number, (typeof program.instructions)[number]][],
      priorOutcomes: readonly ReturnType<typeof interpreterOutcome>[],
    ): StepProgramExecutionResult => {
      if (remaining.length === 0) {
        return { ok: true, value: { mode: this.mode, outcomes: [...priorOutcomes] } };
      }
      const [head, ...rest] = remaining;
      const [index, instruction] = head!;
      const result = dryRunDispatch(instruction)(environment, index);
      const outcomes = [...priorOutcomes, result.outcome];
      if (!result.cont) {
        return failResult(this.mode, outcomes, result.error, context);
      }
      return step(rest, outcomes);
    };
    return step([...program.instructions.entries()], []);
  },
};
