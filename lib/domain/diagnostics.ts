import { AdoId } from './identity';
import { CompilerDiagnostic, DiagnosticProvenance, DiagnosticSeverity, TrustPolicyDecision, TrustPolicyEvaluationReason } from './types';

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

function trustPolicyDiagnosticCode(decision: TrustPolicyDecision): string {
  if (decision === 'deny') {
    return 'trust-policy-blocked';
  }
  if (decision === 'review') {
    return 'trust-policy-review-required';
  }
  return 'trust-policy-allow';
}

export function createTrustPolicyDiagnostic(input: {
  adoId: AdoId;
  decision: TrustPolicyDecision;
  artifactPath: string;
  reasons: TrustPolicyEvaluationReason[];
  provenance?: DiagnosticProvenance;
}): CompilerDiagnostic {
  const reasonText = input.reasons.map((reason) => reason.message).join('; ');
  return createDiagnostic({
    code: trustPolicyDiagnosticCode(input.decision),
    severity: input.decision === 'deny' ? 'error' : input.decision === 'review' ? 'warn' : 'info',
    message: reasonText.length > 0 ? `Trust policy ${input.decision}: ${reasonText}` : `Trust policy ${input.decision}`,
    adoId: input.adoId,
    artifactPath: input.artifactPath,
    provenance: input.provenance,
  });
}
