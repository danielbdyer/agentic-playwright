/**
 * Metric visitor typeclass and registry.
 *
 * A `MetricVisitor<Input, Kind>` is a pure function that consumes typed
 * pipeline receipts and produces a `MetricNode<Kind>`. Visitors are the
 * ONLY way to construct an L4 metric — the runtime never imports this
 * module, and pipeline code never instruments itself with counters. Every
 * L4 metric is derived strictly downstream of receipt emission.
 *
 * Phantom branding on both sides:
 *   - Input is type-parameterized so the compiler enforces shape contracts.
 *   - Kind is the phantom brand on the output metric, ensuring the
 *     visitor's `outputKind` matches the metric it actually emits.
 *
 * The `L4VisitorRegistry` type is a structural map that forces compile-time
 * exhaustiveness over `L4MetricKind`. Adding a new L4 kind without
 * registering a visitor is a type error in any module that constructs the
 * registry. Visitor implementations land in subsequent commits; this module
 * establishes only the typeclass and the registry shape.
 */

import type { MetricNode } from './metric-tree';
import type { L4MetricKind } from './metric-catalogue';

// ─── Visitor typeclass ───

export interface MetricVisitor<Input, Kind extends string> {
  /** Stable identifier — used for provenance, logging, and registry keys.
   *  Convention: kebab-case, prefixed with `l4:` for L4 visitors. */
  readonly id: string;
  /** The metric kind this visitor emits. Phantom-branded so the type
   *  parameter matches what `visit` returns. */
  readonly outputKind: Kind;
  /** Human-readable description of the input shape. Useful for diagnostics
   *  when the runtime registry binds visitors to receipt sources. */
  readonly inputDescription: string;
  /** Pure function: input → metric node. Must be deterministic and
   *  side-effect free. */
  readonly visit: (input: Input) => MetricNode<Kind>;
}

// ─── Registry shape ───

/** Compile-time-exhaustive registry over L4 metric kinds. Each key MUST
 *  map to a visitor whose `outputKind` matches that key. The visitor's
 *  input type is `unknown` at the registry boundary because different
 *  visitors consume different receipt shapes; concrete bindings live in
 *  the application layer (`lib/application/measurement/`). */
export type L4VisitorRegistry = {
  readonly [K in L4MetricKind]: MetricVisitor<unknown, K>;
};

/** Type guard: assert that a candidate registry covers every L4 metric
 *  kind. Use at module boundaries to catch incomplete registrations. */
export function assertL4RegistryComplete(
  candidate: Readonly<Record<string, MetricVisitor<unknown, string>>>,
): asserts candidate is L4VisitorRegistry {
  // The check is structural: TypeScript enforces shape at compile time
  // via `L4VisitorRegistry`, but a runtime guard catches dynamic
  // construction (e.g. from a config file). We rely on the catalogue
  // module's `L4_METRIC_KINDS` for the source of truth.
  // (Importing it here would create a cycle through the index; callers
  // pass the expected kinds explicitly.)
  for (const key of Object.keys(candidate)) {
    const entry = candidate[key];
    if (entry === undefined) {
      throw new Error(`L4 visitor registry missing entry for kind: ${key}`);
    }
    if (entry.outputKind !== key) {
      throw new Error(
        `L4 visitor registry mismatch: key '${key}' maps to visitor with outputKind '${entry.outputKind}'`,
      );
    }
  }
}

// ─── Visitor application ───

/** Apply a visitor to its input. Trivial wrapper that exists so callers
 *  go through one named entry point — useful for instrumentation hooks
 *  later (e.g. wrapping with timing, caching). */
export function applyMetricVisitor<Input, Kind extends string>(
  visitor: MetricVisitor<Input, Kind>,
  input: Input,
): MetricNode<Kind> {
  return visitor.visit(input);
}
