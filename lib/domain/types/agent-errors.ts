/**
 * Agent interpretation error taxonomy.
 *
 * A discriminated union covering the failure modes an agent interpreter can
 * encounter. Each variant carries structured data for diagnostics and
 * recovery decisions. The fold function guarantees exhaustive case analysis
 * at the type level.
 */

// ─── Error Union ───

export type AgentInterpretationError =
  | { readonly kind: 'network-timeout'; readonly timeoutMs: number; readonly url?: string | undefined }
  | { readonly kind: 'rate-limited'; readonly retryAfterMs: number }
  | { readonly kind: 'token-overflow'; readonly tokensUsed: number; readonly maxTokens: number }
  | { readonly kind: 'auth-failure'; readonly provider: string }
  | { readonly kind: 'malformed-response'; readonly rawResponse: string }
  | { readonly kind: 'provider-error'; readonly statusCode: number; readonly message: string };

// ─── Fold ───

export interface AgentInterpretationErrorCases<R> {
  readonly networkTimeout: (e: Extract<AgentInterpretationError, { kind: 'network-timeout' }>) => R;
  readonly rateLimited: (e: Extract<AgentInterpretationError, { kind: 'rate-limited' }>) => R;
  readonly tokenOverflow: (e: Extract<AgentInterpretationError, { kind: 'token-overflow' }>) => R;
  readonly authFailure: (e: Extract<AgentInterpretationError, { kind: 'auth-failure' }>) => R;
  readonly malformedResponse: (e: Extract<AgentInterpretationError, { kind: 'malformed-response' }>) => R;
  readonly providerError: (e: Extract<AgentInterpretationError, { kind: 'provider-error' }>) => R;
}

export function foldAgentError<R>(
  error: AgentInterpretationError,
  cases: AgentInterpretationErrorCases<R>,
): R {
  switch (error.kind) {
    case 'network-timeout': return cases.networkTimeout(error);
    case 'rate-limited': return cases.rateLimited(error);
    case 'token-overflow': return cases.tokenOverflow(error);
    case 'auth-failure': return cases.authFailure(error);
    case 'malformed-response': return cases.malformedResponse(error);
    case 'provider-error': return cases.providerError(error);
  }
}

// ─── Predicates ───

/**
 * Returns true for transient errors that may succeed on retry:
 * network-timeout and rate-limited. All other errors are permanent.
 */
export function isRetryable(error: AgentInterpretationError): boolean {
  return foldAgentError(error, {
    networkTimeout: () => true,
    rateLimited: () => true,
    tokenOverflow: () => false,
    authFailure: () => false,
    malformedResponse: () => false,
    providerError: () => false,
  });
}
