import type { CompilerDiagnostic, DiagnosticProvenance } from '../domain/types';
import type { ProgramFailure, ProgramFailureCode, StepProgramDiagnosticContext, StepProgramExecutionResult } from '../domain/commitment/program';

export type RuntimeFailureCode = ProgramFailureCode;
export type RuntimeFailure = ProgramFailure;
export type RuntimeResult<T> = { ok: true; value: T } | { ok: false; error: RuntimeFailure; diagnostic?: CompilerDiagnostic | undefined };

export interface RuntimeDiagnosticContext extends Omit<StepProgramDiagnosticContext, 'provenance'> {
  adoId: CompilerDiagnostic['adoId'];
  provenance?: DiagnosticProvenance | undefined;
}

export function runtimeOk<T>(value: T): RuntimeResult<T> {
  return { ok: true, value };
}

export function runtimeErr(code: RuntimeFailureCode, message: string, context?: Record<string, string>, cause?: unknown): RuntimeResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      context,
      cause,
    },
  };
}

export function toRuntimeVoidResult(result: StepProgramExecutionResult): RuntimeResult<void> {
  if (result.ok) {
    return runtimeOk(undefined);
  }
  return {
    ok: false,
    error: result.error,
    diagnostic: result.diagnostic,
  };
}
