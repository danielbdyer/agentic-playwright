export class TesseractError extends Error {
  readonly _tag: string = 'TesseractError';
  readonly code: string;
  readonly cause?: unknown | undefined;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'TesseractError';
    this.code = code;
    this.cause = cause;
  }
}

export class SchemaError extends TesseractError {
  override readonly _tag = 'SchemaError' as const;
  readonly path?: string | undefined;

  constructor(message: string, path?: string) {
    super('schema-error', path ? `${path}: ${message}` : message);
    this.name = 'SchemaError';
    this.path = path;
  }
}

export class FileSystemError extends TesseractError {
  override readonly _tag: string = 'FileSystemError';
  readonly filePath?: string | undefined;

  constructor(code: string, message: string, filePath?: string, cause?: unknown) {
    super(code, message, cause);
    this.name = 'FileSystemError';
    this.filePath = filePath;
  }
}

export class ResolutionError extends TesseractError {
  override readonly _tag = 'ResolutionError' as const;
  readonly context?: Record<string, string> | undefined;

  constructor(code: string, message: string, context?: Record<string, string>, cause?: unknown) {
    super(code, message, cause);
    this.name = 'ResolutionError';
    this.context = context;
  }
}

export class RuntimeError extends TesseractError {
  override readonly _tag = 'RuntimeError' as const;
  readonly context?: Record<string, string> | undefined;

  constructor(code: string, message: string, context?: Record<string, string>, cause?: unknown) {
    super(code, message, cause);
    this.name = 'RuntimeError';
    this.context = context;
  }
}

export class PipelineError extends TesseractError {
  override readonly _tag = 'PipelineError' as const;
  readonly stage?: string | undefined;

  constructor(code: string, message: string, stage?: string, cause?: unknown) {
    super(code, message, cause);
    this.name = 'PipelineError';
    this.stage = stage;
  }
}

/**
 * @deprecated v1 translation-provider error base. Superseded by
 *             `ReasoningError` (five families). `classifyReasoningError`
 *             lifts instances of this class into `ReasoningUnclassifiedError`
 *             unless the cause matches a more specific family heuristic.
 */
export class TranslationProviderError extends TesseractError {
  override readonly _tag: string = 'TranslationProviderError';
  readonly provider?: string | undefined;

  constructor(code: string, message: string, provider?: string, cause?: unknown) {
    super(code, message, cause);
    this.name = 'TranslationProviderError';
    this.provider = provider;
  }
}

/** @deprecated Use `ReasoningUnavailableError`. `classifyReasoningError`
 *              lifts this into the v2 family automatically. */
export class TranslationProviderTimeoutError extends TranslationProviderError {
  override readonly _tag = 'TranslationProviderTimeoutError' as const;

  constructor(message: string, provider?: string, cause?: unknown) {
    super('translation-provider-timeout', message, provider, cause);
    this.name = 'TranslationProviderTimeoutError';
  }
}

/** @deprecated Use `ReasoningMalformedResponseError`.
 *              `classifyReasoningError` lifts this into the v2 family
 *              automatically. */
export class TranslationProviderParseError extends TranslationProviderError {
  override readonly _tag = 'TranslationProviderParseError' as const;

  constructor(message: string, provider?: string, cause?: unknown) {
    super('translation-provider-parse', message, provider, cause);
    this.name = 'TranslationProviderParseError';
  }
}

/** @deprecated v1 agent-interpreter error base. Superseded by
 *              `ReasoningError` (five families). */
export class AgentInterpreterProviderError extends TesseractError {
  override readonly _tag: string = 'AgentInterpreterProviderError';
  readonly provider?: string | undefined;

  constructor(code: string, message: string, provider?: string, cause?: unknown) {
    super(code, message, cause);
    this.name = 'AgentInterpreterProviderError';
    this.provider = provider;
  }
}

/** @deprecated Use `ReasoningUnavailableError`. */
export class AgentInterpreterTimeoutError extends AgentInterpreterProviderError {
  override readonly _tag = 'AgentInterpreterTimeoutError' as const;

  constructor(message: string, provider?: string, cause?: unknown) {
    super('agent-interpreter-timeout', message, provider, cause);
    this.name = 'AgentInterpreterTimeoutError';
  }
}

/** @deprecated Use `ReasoningMalformedResponseError`. */
export class AgentInterpreterParseError extends AgentInterpreterProviderError {
  override readonly _tag = 'AgentInterpreterParseError' as const;

  constructor(message: string, provider?: string, cause?: unknown) {
    super('agent-interpreter-parse', message, provider, cause);
    this.name = 'AgentInterpreterParseError';
  }
}

// ─── Unified ReasoningError (v2 §3.6 + readiness §9) ───
//
// Five named families consolidating v1's TranslationProvider* and
// AgentInterpreter* hierarchies. The legacy classes above stay
// `@deprecated` through 4b.B.5; callsites migrate via
// `classifyReasoningError` in 4b.B.4.

export type ReasoningErrorFamily =
  | 'rate-limited'
  | 'context-exceeded'
  | 'malformed-response'
  | 'unavailable'
  | 'unclassified';

export class ReasoningError extends TesseractError {
  override readonly _tag: string = 'ReasoningError';
  readonly family: ReasoningErrorFamily;
  readonly provider?: string | undefined;

  constructor(family: ReasoningErrorFamily, message: string, provider?: string, cause?: unknown) {
    super(`reasoning-${family}`, message, cause);
    this.name = 'ReasoningError';
    this.family = family;
    this.provider = provider;
  }
}

export class ReasoningRateLimitedError extends ReasoningError {
  override readonly _tag = 'ReasoningRateLimitedError' as const;
  constructor(message: string, provider?: string, cause?: unknown) {
    super('rate-limited', message, provider, cause);
    this.name = 'ReasoningRateLimitedError';
  }
}

export class ReasoningContextExceededError extends ReasoningError {
  override readonly _tag = 'ReasoningContextExceededError' as const;
  constructor(message: string, provider?: string, cause?: unknown) {
    super('context-exceeded', message, provider, cause);
    this.name = 'ReasoningContextExceededError';
  }
}

export class ReasoningMalformedResponseError extends ReasoningError {
  override readonly _tag = 'ReasoningMalformedResponseError' as const;
  constructor(message: string, provider?: string, cause?: unknown) {
    super('malformed-response', message, provider, cause);
    this.name = 'ReasoningMalformedResponseError';
  }
}

export class ReasoningUnavailableError extends ReasoningError {
  override readonly _tag = 'ReasoningUnavailableError' as const;
  constructor(message: string, provider?: string, cause?: unknown) {
    super('unavailable', message, provider, cause);
    this.name = 'ReasoningUnavailableError';
  }
}

export class ReasoningUnclassifiedError extends ReasoningError {
  override readonly _tag = 'ReasoningUnclassifiedError' as const;
  constructor(message: string, provider?: string, cause?: unknown) {
    super('unclassified', message, provider, cause);
    this.name = 'ReasoningUnclassifiedError';
  }
}

/** Exhaustive fold over the five families. Use for dispatch that must
 *  handle every case — the switch's return-type proves exhaustiveness
 *  at compile time. */
export interface ReasoningErrorCases<R> {
  readonly rateLimited: (error: ReasoningRateLimitedError) => R;
  readonly contextExceeded: (error: ReasoningContextExceededError) => R;
  readonly malformedResponse: (error: ReasoningMalformedResponseError) => R;
  readonly unavailable: (error: ReasoningUnavailableError) => R;
  readonly unclassified: (error: ReasoningUnclassifiedError) => R;
}

export function foldReasoningError<R>(error: ReasoningError, cases: ReasoningErrorCases<R>): R {
  switch (error.family) {
    case 'rate-limited':
      return cases.rateLimited(error as ReasoningRateLimitedError);
    case 'context-exceeded':
      return cases.contextExceeded(error as ReasoningContextExceededError);
    case 'malformed-response':
      return cases.malformedResponse(error as ReasoningMalformedResponseError);
    case 'unavailable':
      return cases.unavailable(error as ReasoningUnavailableError);
    case 'unclassified':
      return cases.unclassified(error as ReasoningUnclassifiedError);
  }
}

/** Classify a raw cause into the unified ReasoningError surface.
 *
 *  Conversion rules:
 *   - `TranslationProviderTimeoutError` / `AgentInterpreterTimeoutError`
 *     → `ReasoningUnavailableError` (timeout means provider didn't
 *     respond in the allocated window; treat as availability failure).
 *   - `TranslationProviderParseError` / `AgentInterpreterParseError`
 *     → `ReasoningMalformedResponseError`.
 *   - `ReasoningError` (any subclass) — passes through unchanged.
 *   - Rate-limit signals and context-exceeded signals come from
 *     adapter-specific parsing (HTTP 429, OpenAI error body codes).
 *     The raw `cause` is inspected for the standard signatures.
 *   - Anything else → `ReasoningUnclassifiedError`.
 *
 *  Adapters should prefer throwing the specific v2 class directly
 *  (e.g. `new ReasoningRateLimitedError(...)`) so this reconciler is
 *  only used on legacy errors during the 4b.B.* migration window.
 */
export function classifyReasoningError(cause: unknown, provider?: string): ReasoningError {
  if (cause instanceof ReasoningError) {
    return cause;
  }
  if (cause instanceof TranslationProviderTimeoutError || cause instanceof AgentInterpreterTimeoutError) {
    return new ReasoningUnavailableError(cause.message, provider ?? cause.provider, cause);
  }
  if (cause instanceof TranslationProviderParseError || cause instanceof AgentInterpreterParseError) {
    return new ReasoningMalformedResponseError(cause.message, provider ?? cause.provider, cause);
  }
  if (cause instanceof Error) {
    const message = cause.message;
    if (/429|rate limit|too many requests/i.test(message)) {
      return new ReasoningRateLimitedError(message, provider, cause);
    }
    if (/context length|context window|token.*exceed|maximum.*tokens/i.test(message)) {
      return new ReasoningContextExceededError(message, provider, cause);
    }
    if (/unavailable|service down|econnrefused|connection reset|5\d\d/i.test(message)) {
      return new ReasoningUnavailableError(message, provider, cause);
    }
    return new ReasoningUnclassifiedError(message, provider, cause);
  }
  return new ReasoningUnclassifiedError(String(cause), provider, cause);
}

export class FileSystemTransientIoError extends FileSystemError {
  override readonly _tag = 'FileSystemTransientIoError' as const;
  readonly operation: string;

  constructor(message: string, filePath: string, operation: string, cause?: unknown) {
    super('fs-transient-io', message, filePath, cause);
    this.name = 'FileSystemTransientIoError';
    this.operation = operation;
  }
}

export function unknownScreenError(screenId: string): RuntimeError {
  return new RuntimeError('runtime-unknown-screen', `Unknown screen ${screenId}`, { screenId });
}

export function unknownEffectTargetError(target: string, targetKind: 'surface' | 'element'): RuntimeError {
  return new RuntimeError('runtime-unknown-effect-target', `Unknown ${targetKind} target ${target}`, { target, targetKind });
}

export function missingActionHandlerError(widget: string, action: string): RuntimeError {
  return new RuntimeError('runtime-missing-action-handler', `No ${action} action registered for ${widget}`, { widget, action });
}

export function widgetPreconditionError(precondition: string): RuntimeError {
  return new RuntimeError(
    'runtime-widget-precondition-failed',
    `Widget precondition failed: ${precondition}`,
    { precondition },
  );
}

export function unknownWidgetActionError(widget: string, action: string): TesseractError {
  return new TesseractError('domain-unknown-widget-action', `Unknown widget action ${action} for ${widget}`);
}

export function snapshotHandleResolutionError(): RuntimeError {
  return new RuntimeError('runtime-snapshot-handle-resolution-failed', 'Unable to resolve element handle for ARIA snapshot');
}

export function runtimeEscapeHatchError(reason: string): RuntimeError {
  return new RuntimeError('runtime-step-program-escape-hatch', `Cannot execute step program escape hatch: ${reason}`, { reason });
}

export function toTesseractError(
  cause: unknown,
  fallbackCode = 'unexpected-error',
  fallbackMessage = 'Unexpected error',
): TesseractError {
  if (cause instanceof TesseractError) {
    return cause;
  }

  if (cause instanceof Error) {
    return new TesseractError(fallbackCode, cause.message, cause);
  }

  return new TesseractError(fallbackCode, fallbackMessage, cause);
}

export function toFileSystemError(
  cause: unknown,
  code: string,
  message: string,
  filePath?: string,
): FileSystemError {
  if (cause instanceof FileSystemError) {
    return cause;
  }

  if (cause instanceof Error) {
    return new FileSystemError(code, cause.message, filePath, cause);
  }

  return new FileSystemError(code, message, filePath, cause);
}

function isTimeoutLikeError(cause: unknown): boolean {
  if (!(cause instanceof Error)) {
    return false;
  }
  return cause.name === 'AbortError'
    || cause.name === 'TimeoutError'
    || /timed?\s*out/i.test(cause.message);
}

function isTransientIoError(cause: unknown): boolean {
  if (typeof cause !== 'object' || cause === null) {
    return false;
  }
  const code = 'code' in cause ? String((cause as { code?: unknown }).code ?? '') : '';
  return code === 'EAGAIN' || code === 'EMFILE' || code === 'ENFILE' || code === 'EBUSY';
}

export function translationProviderTimeoutError(
  cause: unknown,
  provider?: string,
): TranslationProviderTimeoutError {
  return new TranslationProviderTimeoutError(
    cause instanceof Error ? cause.message : 'Translation provider call timed out.',
    provider,
    cause,
  );
}

export function translationProviderParseError(
  cause: unknown,
  provider?: string,
): TranslationProviderParseError {
  return new TranslationProviderParseError(
    cause instanceof Error ? cause.message : 'Unable to parse translation provider response.',
    provider,
    cause,
  );
}

export function translationProviderError(
  cause: unknown,
  provider?: string,
): TranslationProviderError | TranslationProviderTimeoutError | TranslationProviderParseError {
  if (cause instanceof TranslationProviderError) {
    return cause;
  }
  if (isTimeoutLikeError(cause)) {
    return translationProviderTimeoutError(cause, provider);
  }
  return new TranslationProviderError(
    'translation-provider-failed',
    cause instanceof Error ? cause.message : 'Translation provider call failed.',
    provider,
    cause,
  );
}

export function agentInterpreterTimeoutError(
  cause: unknown,
  provider?: string,
): AgentInterpreterTimeoutError {
  return new AgentInterpreterTimeoutError(
    cause instanceof Error ? cause.message : 'Agent interpretation timed out.',
    provider,
    cause,
  );
}

export function agentInterpreterParseError(
  cause: unknown,
  provider?: string,
): AgentInterpreterParseError {
  return new AgentInterpreterParseError(
    cause instanceof Error ? cause.message : 'Unable to parse agent response.',
    provider,
    cause,
  );
}

export function agentInterpreterProviderError(
  cause: unknown,
  provider?: string,
): AgentInterpreterProviderError | AgentInterpreterTimeoutError | AgentInterpreterParseError {
  if (cause instanceof AgentInterpreterProviderError) {
    return cause;
  }
  if (isTimeoutLikeError(cause)) {
    return agentInterpreterTimeoutError(cause, provider);
  }
  return new AgentInterpreterProviderError(
    'agent-interpreter-provider-failed',
    cause instanceof Error ? cause.message : 'Agent interpretation provider call failed.',
    provider,
    cause,
  );
}

export function toFileSystemOperationError(
  cause: unknown,
  operation: string,
  filePath: string,
): FileSystemError {
  if (cause instanceof FileSystemError) {
    return cause;
  }
  if (isTransientIoError(cause)) {
    return new FileSystemTransientIoError(
      `Transient I/O failure during ${operation} on ${filePath}`,
      filePath,
      operation,
      cause,
    );
  }
  return toFileSystemError(cause, `fs-${operation}-failed`, `Unable to ${operation} ${filePath}`, filePath);
}

export function trustPolicyDeniedError(message: string): TesseractError {
  return new TesseractError('trust-policy-denied', message);
}

export function trustPolicyReviewRequiredError(message: string): TesseractError {
  return new TesseractError('trust-policy-review-required', message);
}
