import type {
  ProgramFailure,
  StepProgram,
  StepProgramDiagnosticContext,
  StepProgramExecutionResult,
  StepProgramInterpreter,
} from '../../domain/program';
import { createDiagnostic } from '../../domain/diagnostics';
import { runtimeEscapeHatchError } from '../../domain/errors';
import type { InterpreterEnvironment} from './types';
import { interpreterOutcome, requireScreen, resolvePosture } from './types';

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

export const dryRunInterpreter: StepProgramInterpreter<InterpreterEnvironment> = {
  mode: 'dry-run',
  async run(program: StepProgram, environment: InterpreterEnvironment, context?: StepProgramDiagnosticContext): Promise<StepProgramExecutionResult> {
    const outcomes: ReturnType<typeof interpreterOutcome>[] = [];

    for (const [index, instruction] of program.instructions.entries()) {
      switch (instruction.kind) {
        case 'navigate': {
          const screen = requireScreen(environment.screens, instruction.screen);
          if (!screen.ok) {
            outcomes.push(interpreterOutcome({ index, instruction, status: 'failed', diagnostics: [{ code: screen.code, message: screen.message, context: screen.context }], failureCode: screen.code }));
            return failResult(this.mode, outcomes, { code: screen.code, message: screen.message, context: screen.context }, context);
          }
          outcomes.push(interpreterOutcome({ index, instruction, status: 'ok', observedEffects: ['navigation:validated'] }));
          break;
        }
        case 'enter': {
          const screen = requireScreen(environment.screens, instruction.screen);
          if (!screen.ok) {
            outcomes.push(interpreterOutcome({ index, instruction, status: 'failed', diagnostics: [{ code: screen.code, message: screen.message, context: screen.context }], failureCode: screen.code }));
            return failResult(this.mode, outcomes, { code: screen.code, message: screen.message, context: screen.context }, context);
          }
          if (!screen.value.elements[instruction.element]) {
            const error = { code: 'runtime-unknown-effect-target' as const, message: `Unknown element target ${instruction.element}`, context: { target: instruction.element, targetKind: 'element' } };
            outcomes.push(interpreterOutcome({ index, instruction, status: 'failed', diagnostics: [error], failureCode: error.code }));
            return failResult(this.mode, outcomes, error, context);
          }
          const posture = resolvePosture(screen.value, instruction.element, instruction.posture);
          if (!posture.ok) {
            outcomes.push(interpreterOutcome({ index, instruction, status: 'failed', diagnostics: [{ code: posture.code, message: posture.message, context: posture.context }], failureCode: posture.code }));
            return failResult(this.mode, outcomes, { code: posture.code, message: posture.message, context: posture.context }, context);
          }
          const resolved = environment.resolveValue(environment.fixtures, instruction.value);
          if (instruction.value && resolved === undefined) {
            const error = { code: 'runtime-unresolved-value-ref' as const, message: 'Unable to resolve input value', context: { instructionKind: instruction.kind } };
            outcomes.push(interpreterOutcome({ index, instruction, status: 'failed', diagnostics: [error], failureCode: error.code }));
            return failResult(this.mode, outcomes, error, context);
          }
          outcomes.push(interpreterOutcome({ index, instruction, status: 'ok', observedEffects: ['value-entry:validated'] }));
          break;
        }
        case 'invoke':
        case 'observe-structure': {
          const screen = requireScreen(environment.screens, instruction.screen);
          if (!screen.ok) {
            outcomes.push(interpreterOutcome({ index, instruction, status: 'failed', diagnostics: [{ code: screen.code, message: screen.message, context: screen.context }], failureCode: screen.code }));
            return failResult(this.mode, outcomes, { code: screen.code, message: screen.message, context: screen.context }, context);
          }
          if (!screen.value.elements[instruction.element]) {
            const error = { code: 'runtime-unknown-effect-target' as const, message: `Unknown element target ${instruction.element}`, context: { target: instruction.element, targetKind: 'element' } };
            outcomes.push(interpreterOutcome({ index, instruction, status: 'failed', diagnostics: [error], failureCode: error.code }));
            return failResult(this.mode, outcomes, error, context);
          }
          if (instruction.kind === 'observe-structure' && !environment.hasSnapshotTemplate(instruction.snapshotTemplate)) {
            const error = { code: 'runtime-missing-snapshot-template' as const, message: `Missing snapshot template ${instruction.snapshotTemplate}`, context: { snapshotTemplate: instruction.snapshotTemplate } };
            outcomes.push(interpreterOutcome({ index, instruction, status: 'failed', diagnostics: [error], failureCode: error.code }));
            return failResult(this.mode, outcomes, error, context);
          }
          outcomes.push(interpreterOutcome({ index, instruction, status: 'ok', observedEffects: ['target:validated'] }));
          break;
        }
        case 'custom-escape-hatch': {
          const errorInfo = runtimeEscapeHatchError(instruction.reason);
          const error: ProgramFailure = { code: 'runtime-step-program-escape-hatch', message: errorInfo.message, context: errorInfo.context };
          outcomes.push(interpreterOutcome({ index, instruction, status: 'failed', diagnostics: [{ code: error.code, message: error.message, context: error.context }], failureCode: error.code }));
          return failResult(this.mode, outcomes, error, context);
        }
      }
    }

    return { ok: true, value: { mode: this.mode, outcomes } };
  },
};
