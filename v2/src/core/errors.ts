/**
 * Error families. Every tool names the subset it can produce; a failure that
 * fits none of them is `unclassified`, never a bare throw. The interaction
 * families (not-found, ambiguous, not-visible, not-enabled, timeout,
 * assertion-like) are v1's four interaction families plus the two the
 * reality study showed are distinct in practice: nothing matched, and more
 * than one thing matched.
 */
export const ERROR_FAMILIES = [
  'invalid-input',
  'not-configured',
  'rate-limited',
  'unavailable',
  'malformed-response',
  'timeout',
  'not-found',
  'ambiguous',
  'not-visible',
  'not-enabled',
  'assertion-like',
  'stale-snapshot',
  'conflict',
  'unclassified',
] as const;

export type ErrorFamily = (typeof ERROR_FAMILIES)[number];

export class ToolError extends Error {
  readonly family: ErrorFamily;
  readonly detail: Readonly<Record<string, unknown>> | undefined;

  constructor(family: ErrorFamily, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = 'ToolError';
    this.family = family;
    this.detail = detail;
  }
}

export const isToolError = (value: unknown): value is ToolError => value instanceof ToolError;

/** Wrap any thrown value as a ToolError, preserving an existing family. */
export const toToolError = (cause: unknown, fallback: ErrorFamily = 'unclassified'): ToolError => {
  if (isToolError(cause)) return cause;
  const message = cause instanceof Error ? cause.message : String(cause);
  return new ToolError(fallback, message);
};

export const foldErrorFamily = <R>(
  family: ErrorFamily,
  cases: { readonly [K in ErrorFamily]: () => R },
): R => cases[family]();
