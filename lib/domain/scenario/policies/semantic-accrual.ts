import type { ResolutionReceipt, SemanticDictionaryAccrualInput } from '../../types';

export interface SemanticAccrualDecisionInput {
  readonly interpretation: ResolutionReceipt;
  readonly executionStatus: 'ok' | 'failed' | 'skipped';
  readonly semanticAccrual: SemanticDictionaryAccrualInput | null | undefined;
  readonly semanticDictionaryHitId: string | null | undefined;
}

export interface SemanticAccrualDecision {
  readonly semanticAccrual: SemanticDictionaryAccrualInput | null;
  readonly semanticDictionaryHitId: string | null;
}

export function decideSemanticAccrual(input: SemanticAccrualDecisionInput): SemanticAccrualDecision {
  if (input.interpretation.kind === 'needs-human') {
    return { semanticAccrual: null, semanticDictionaryHitId: null };
  }

  return {
    semanticAccrual: input.semanticAccrual ?? null,
    semanticDictionaryHitId: input.semanticDictionaryHitId ?? null,
  };
}
