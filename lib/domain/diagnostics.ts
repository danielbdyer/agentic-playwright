import { AdoId } from './identity';
import { CompilerDiagnostic, DiagnosticProvenance, DiagnosticSeverity } from './types';

export function createDiagnostic(input: {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  adoId: AdoId;
  stepIndex?: number;
  artifactPath?: string;
  provenance?: DiagnosticProvenance;
}): CompilerDiagnostic {
  return {
    code: input.code,
    severity: input.severity,
    message: input.message,
    adoId: input.adoId,
    stepIndex: input.stepIndex,
    artifactPath: input.artifactPath,
    provenance: input.provenance ?? {},
  };
}

