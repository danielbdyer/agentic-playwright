import { ParseResult, Schema } from 'effect';
import { Either } from 'effect';
import { SchemaError } from '../errors';

/**
 * Extract a dotted path from an Effect ParseError issue tree.
 * Walks nested Pointer/Composite nodes to build segments like "nodes[0].kind".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectSegments(node: any, acc: ReadonlyArray<string | number> = []): ReadonlyArray<string | number> {
  if (node == null || typeof node !== 'object') return acc;
  const nextAcc = Object.prototype.hasOwnProperty.call(node, 'path') ? [...acc, node.path] : acc;
  if (Object.prototype.hasOwnProperty.call(node, 'issue')) {
    return collectSegments(node.issue, nextAcc);
  }
  if (Object.prototype.hasOwnProperty.call(node, 'issues')) {
    const issues = Array.isArray(node.issues) ? node.issues : [node.issues];
    const first = issues.find((issue: unknown) => issue != null);
    return first != null ? collectSegments(first, nextAcc) : nextAcc;
  }
  return nextAcc;
}

function extractPath(issue: ParseResult.ParseIssue): string | undefined {
  const segments = collectSegments(issue);
  if (segments.length === 0) return undefined;
  return segments
    .map((s, i) => (typeof s === 'number' ? `[${s}]` : (i > 0 ? '.' : '') + String(s)))
    .join('');
}

/**
 * Migration helper: creates a decoder that casts to the legacy type.
 * Use this during the incremental migration when schema-derived types
 * differ structurally from existing `Brand<T, Name>` or mutable-array types.
 * Once types are fully derived from schemas, replace with plain `decodeUnknownSync`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decoderFor<Target>(schema: Schema.Schema<any, any>): (input: unknown) => Target {
  return decodeUnknownSync<unknown, unknown, Target>(schema);
}

/**
 * Creates a synchronous decoder from an Effect.Schema.
 *
 * The optional `Target` type parameter allows specifying the return type explicitly,
 * which is useful during the migration period when Effect.Schema branded types
 * differ structurally from the existing `Brand<T, Name>` types. Once all types
 * are derived from schemas (Phase 5+), this override becomes unnecessary.
 */
export function decodeUnknownSync<A, I, Target = A>(schema: Schema.Schema<A, I>): (input: unknown) => Target {
  const decode = Schema.decodeUnknownSync(schema, { errors: 'all' });
  return (input: unknown) => {
    try {
      return decode(input) as unknown as Target;
    } catch (e) {
      if (ParseResult.isParseError(e)) {
        const path = extractPath(e.issue);
        throw new SchemaError(
          ParseResult.TreeFormatter.formatErrorSync(e),
          path,
        );
      }
      throw e;
    }
  };
}

export function decodeUnknownEither<A, I, Target = A>(
  schema: Schema.Schema<A, I>,
): (input: unknown) => Either.Either<Target, SchemaError> {
  const decode = decodeUnknownSync<A, I, Target>(schema);
  return (input: unknown) => {
    try {
      return Either.right(decode(input));
    } catch (error) {
      if (error instanceof SchemaError) {
        return Either.left(error);
      }
      throw error;
    }
  };
}

export function decodeUnknownEitherOrThrow<A, I, Target = A>(
  schema: Schema.Schema<A, I>,
): (input: unknown) => Target {
  const decode = decodeUnknownEither<A, I, Target>(schema);
  return (input: unknown) =>
    Either.match(decode(input), {
      onLeft: (error) => {
        throw error;
      },
      onRight: (value) => value,
    });
}

export function encodeSync<A, I>(schema: Schema.Schema<A, I>): (value: A) => I {
  const encode = Schema.encodeSync(schema, { errors: 'all' });
  return (value: A) => {
    try {
      return encode(value);
    } catch (e) {
      if (ParseResult.isParseError(e)) {
        throw new SchemaError(
          ParseResult.TreeFormatter.formatErrorSync(e),
        );
      }
      throw e;
    }
  };
}
