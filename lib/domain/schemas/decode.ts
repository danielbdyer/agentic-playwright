import { ParseResult, Schema } from 'effect';
import { SchemaError } from '../errors';

/**
 * Extract a dotted path from an Effect ParseError issue tree.
 * Walks nested Pointer/Composite nodes to build segments like "nodes[0].kind".
 */
function extractPath(issue: ParseResult.ParseIssue): string | undefined {
  const segments: Array<string | number> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = issue;
  while (current != null) {
    if (current._tag === 'Pointer') {
      segments.push(current.path);
      current = current.issue;
    } else if (current._tag === 'Composite' || current._tag === 'Transformation') {
      const issues = current.issues;
      if (issues != null) {
        current = Array.isArray(issues) ? issues[0] : issues;
      } else if (current.issue != null) {
        current = current.issue;
      } else {
        break;
      }
    } else {
      break;
    }
  }
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
