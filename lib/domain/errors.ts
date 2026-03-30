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
  override readonly _tag = 'FileSystemError' as const;
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

export class AgentError extends TesseractError {
  override readonly _tag: string = 'AgentError';
  readonly provider?: string | undefined;

  constructor(code: string, message: string, provider?: string, cause?: unknown) {
    super(code, message, cause);
    this.name = 'AgentError';
    this.provider = provider;
  }
}

export class ToolInvocationError extends AgentError {
  override readonly _tag = 'ToolInvocationError' as const;
  readonly toolName: string;

  constructor(toolName: string, message: string, cause?: unknown) {
    super('agent-tool-invocation-failed', message, toolName, cause);
    this.name = 'ToolInvocationError';
    this.toolName = toolName;
  }
}

export class AgentTimeoutError extends AgentError {
  override readonly _tag = 'AgentTimeoutError' as const;
  readonly timeoutMs: number;

  constructor(provider: string, timeoutMs: number) {
    super('agent-timeout', `Agent timeout after ${timeoutMs}ms`, provider);
    this.name = 'AgentTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class ActivationError extends TesseractError {
  override readonly _tag = 'ActivationError' as const;
  readonly targetPath: string;

  constructor(targetPath: string, message: string, cause?: unknown) {
    super('activation-failed', message, cause);
    this.name = 'ActivationError';
    this.targetPath = targetPath;
  }
}

export class EmitError extends TesseractError {
  override readonly _tag = 'EmitError' as const;
  readonly adoId?: string | undefined;

  constructor(message: string, adoId?: string, cause?: unknown) {
    super('emit-failed', message, cause);
    this.name = 'EmitError';
    this.adoId = adoId;
  }
}

export class CatalogLoadError extends TesseractError {
  override readonly _tag = 'CatalogLoadError' as const;
  readonly catalogPath?: string | undefined;

  constructor(message: string, catalogPath?: string, cause?: unknown) {
    super('catalog-load-failed', message, cause);
    this.name = 'CatalogLoadError';
    this.catalogPath = catalogPath;
  }
}

export class McpBridgeError extends TesseractError {
  override readonly _tag = 'McpBridgeError' as const;
  readonly action?: string | undefined;

  constructor(message: string, action?: string, cause?: unknown) {
    super('mcp-bridge-failed', message, cause);
    this.name = 'McpBridgeError';
    this.action = action;
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

export function trustPolicyDeniedError(message: string): TesseractError {
  return new TesseractError('trust-policy-denied', message);
}

export function trustPolicyReviewRequiredError(message: string): TesseractError {
  return new TesseractError('trust-policy-review-required', message);
}
