import { ProgramFailure, StepProgram, StepProgramDiagnosticContext, StepProgramExecutionResult, StepProgramInterpreter } from '../../domain/program';
import { createDiagnostic } from '../../domain/diagnostics';
import { dryRunInterpreter } from './dry-run';
import { InterpreterEnvironment } from './types';

function classify(error: ProgramFailure): string {
  if (error.code === 'runtime-unknown-screen' || error.code === 'runtime-unknown-effect-target') {
    return 'resolvability';
  }
  if (error.code === 'runtime-unresolved-value-ref') {
    return 'data-resolution';
  }
  if (error.code === 'runtime-missing-snapshot-template') {
    return 'knowledge-missing-artifact';
  }
  if (error.code === 'runtime-step-program-escape-hatch') {
    return 'semantic-gap';
  }
  return 'runtime';
}

export const diagnosticInterpreter: StepProgramInterpreter<InterpreterEnvironment> = {
  mode: 'diagnostic',
  async run(program: StepProgram, environment: InterpreterEnvironment, context?: StepProgramDiagnosticContext): Promise<StepProgramExecutionResult> {
    const dryRun = await dryRunInterpreter.run(program, environment, context);
    if (dryRun.ok) {
      return {
        ok: true,
        value: {
          mode: this.mode,
          outcomes: dryRun.value.outcomes.map((outcome) => ({
            ...outcome,
            observedEffects: [...outcome.observedEffects, 'diagnostic:preconditions-satisfied'],
          })),
        },
      };
    }

    const lastOutcome = dryRun.value.outcomes[dryRun.value.outcomes.length - 1];
    const classification = classify(dryRun.error);
    const diagnosticError: ProgramFailure = {
      ...dryRun.error,
      context: {
        ...(dryRun.error.context ?? {}),
        classification,
        expectedEffects: lastOutcome?.expectedEffects.join('|') ?? 'none',
        observedEffects: lastOutcome?.observedEffects.join('|') ?? 'none',
      },
    };

    return {
      ok: false,
      error: diagnosticError,
      value: {
        mode: this.mode,
        outcomes: dryRun.value.outcomes.map((outcome) => ({
          ...outcome,
          diagnostics: outcome.status === 'failed'
            ? [
                ...outcome.diagnostics,
                {
                  code: diagnosticError.code,
                  message: `classification=${classification}`,
                  context: diagnosticError.context,
                },
              ]
            : outcome.diagnostics,
        })),
      },
      diagnostic: context
        ? createDiagnostic({
            code: diagnosticError.code,
            severity: 'error',
            message: `${diagnosticError.message} [${classification}]`,
            adoId: context.adoId,
            stepIndex: context.stepIndex,
            artifactPath: context.artifactPath,
            provenance: context.provenance,
          })
        : undefined,
    };
  },
};
