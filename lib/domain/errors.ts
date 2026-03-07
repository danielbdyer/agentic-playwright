export class TesseractError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'TesseractError';
    this.code = code;
    this.cause = cause;
  }
}

export class SchemaError extends TesseractError {
  readonly path?: string;

  constructor(message: string, path?: string) {
    super('schema-error', path ? `${path}: ${message}` : message);
    this.name = 'SchemaError';
    this.path = path;
  }
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

