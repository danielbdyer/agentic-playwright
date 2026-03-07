import { CompilerDiagnostic, DiagnosticProvenance } from '../domain/types';
import { ProgramFailure, ProgramFailureCode, StepProgramDiagnosticContext, StepProgramExecutionResult } from '../domain/program';

export type RuntimeFailureCode = ProgramFailureCode;
export type RuntimeFailure = ProgramFailure;
export type RuntimeResult<T> = { ok: true; value: T } | { ok: false; error: RuntimeFailure; diagnostic?: CompilerDiagnostic };

export interface RuntimeDiagnosticContext extends StepProgramDiagnosticContext {
  adoId: CompilerDiagnostic['adoId'];
  provenance?: DiagnosticProvenance;
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
