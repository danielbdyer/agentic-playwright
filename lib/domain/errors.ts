export class TesseractError extends Error {
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
  readonly path?: string | undefined;

  constructor(message: string, path?: string) {
    super('schema-error', path ? `${path}: ${message}` : message);
    this.name = 'SchemaError';
    this.path = path;
  }
}

export class RuntimeError extends TesseractError {
  readonly context?: Record<string, string> | undefined;

  constructor(code: string, message: string, context?: Record<string, string>, cause?: unknown) {
    super(code, message, cause);
    this.name = 'RuntimeError';
    this.context = context;
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

export function trustPolicyDeniedError(message: string): TesseractError {
  return new TesseractError('trust-policy-denied', message);
}

export function trustPolicyReviewRequiredError(message: string): TesseractError {
  return new TesseractError('trust-policy-review-required', message);
}