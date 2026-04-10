import { fingerprintFor } from '../kernel/hash';
import type { InterventionDriftStatus, InterventionSemanticCore } from './intervention';

export interface SemanticCoreSeed {
  readonly namespace: string;
  readonly summary: string;
  readonly stableFields: Readonly<Record<string, unknown>>;
}

export function semanticCoreToken(seed: SemanticCoreSeed): string {
  return `${seed.namespace}:${fingerprintFor('semantic-core', seed.stableFields)}`;
}

export function semanticCoreDriftStatus(
  currentToken: string,
  previousToken?: string | null | undefined,
): InterventionDriftStatus {
  if (!previousToken) return 'preserved';
  return previousToken === currentToken ? 'preserved' : 'drift-detected';
}

export function createSemanticCore(
  seed: SemanticCoreSeed,
  previousToken?: string | null | undefined,
): InterventionSemanticCore {
  const token = semanticCoreToken(seed);
  return {
    token,
    summary: seed.summary,
    driftStatus: semanticCoreDriftStatus(token, previousToken),
  };
}
