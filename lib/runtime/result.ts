import { CompilerDiagnostic, DiagnosticProvenance } from '../domain/types';

export type RuntimeFailureCode =
  | 'runtime-unknown-screen'
  | 'runtime-unknown-effect-target'
  | 'runtime-missing-action-handler'
  | 'runtime-snapshot-handle-resolution-failed'
  | 'runtime-step-program-escape-hatch'
  | 'runtime-execution-failed';

export interface RuntimeFailure {
  code: RuntimeFailureCode;
  message: string;
  context?: Record<string, string>;
  cause?: unknown;
}

export type RuntimeResult<T> = { ok: true; value: T } | { ok: false; error: RuntimeFailure; diagnostic?: CompilerDiagnostic };

export interface RuntimeDiagnosticContext {
  adoId: CompilerDiagnostic['adoId'];
  stepIndex?: number;
  artifactPath?: string;
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
