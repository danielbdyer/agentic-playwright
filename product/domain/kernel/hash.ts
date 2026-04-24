import { createHash } from 'crypto';
import { normalizeAriaSnapshot } from '../knowledge/aria-snapshot';
import type { AdoParameter, AdoStep } from '../intent/types';

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&apos;': "'",
  '&gt;': '>',
  '&lt;': '<',
  '&nbsp;': ' ',
  '&quot;': '"',
};

/**
 * Deterministic JSON-parity stringification for content fingerprints.
 *
 * `stableStringify` is the foundation of every content fingerprint
 * in the codebase: atom envelopes, composition envelopes, discovery
 * run outputs, proposal bundles, projection input sets, and the
 * promotion/demotion machinery all compute
 * `sha256(stableStringify(content))` somewhere in their pipeline.
 * The stability of those fingerprints is a load-bearing property
 * for the cold-start ↔ warm-start interop contract in
 * `docs/canon-and-derivation.md` § 8.1 and the M5 cohort trajectory
 * in `docs/alignment-targets.md`.
 *
 * The function mirrors `JSON.stringify` semantics with one strict
 * addition: object keys are sorted lexicographically so insertion
 * order does not leak into the output. Everything else about the
 * semantics — handling of `undefined`, `null`, arrays, primitives
 * — must match `JSON.stringify` so that:
 *
 *   1. The output is always valid JSON (parseable, no literal
 *      `undefined` tokens).
 *   2. Two objects that are `JSON.stringify`-equivalent produce
 *      byte-equal output regardless of how their undefined-valued
 *      keys were constructed (explicitly set to undefined vs
 *      structurally absent).
 *   3. The function is a pure, deterministic projection of
 *      value-shape — optional TypeScript fields (`foo?: T`) and
 *      explicit `foo: undefined` are treated identically because
 *      they encode the same thing: "this key has no value."
 *
 * The undefined-handling rules follow `JSON.stringify`:
 *
 *   - **Object fields with `undefined` values are OMITTED.** A
 *     field with `undefined` is equivalent to the field not being
 *     present. This is the load-bearing fix: the prior
 *     implementation produced `{"key":undefined}` (invalid JSON)
 *     for explicit `undefined` values while omitting the key
 *     entirely when the field was structurally absent, causing
 *     silent fingerprint drift across semantically-equivalent
 *     inputs.
 *   - **Array elements with `undefined` values are replaced with
 *     `null`.** Arrays have position-significant semantics;
 *     omitting an element would shift subsequent indices, so the
 *     JSON convention is to serialize `undefined` as `null`.
 *   - **`null` is preserved as the token `"null"`**, matching
 *     `JSON.stringify`. A null field is a present-but-null fact;
 *     an undefined field is an absent fact. The two are
 *     semantically different and must remain distinguishable.
 *
 * Pure domain — no Effect, no IO, no mutation.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    // Arrays preserve element order. Undefined elements are
    // serialized as `null` per JSON.stringify convention — arrays
    // are position-significant so omitting an element would shift
    // subsequent indices.
    return `[${value.map((item) => (item === undefined ? 'null' : stableStringify(item))).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    // Object fields with `undefined` values are OMITTED (matching
    // JSON.stringify). This makes `{ a: 1, b: undefined }` and
    // `{ a: 1 }` fingerprint-equivalent, which is the load-bearing
    // property for the canon-decomposer fingerprint story.
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    const body = entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',');
    return `{${body}}`;
  }

  return JSON.stringify(value);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// ─── Phantom-tagged fingerprint addresses (Phase 0c) ─────────────
//
// Every fingerprint in the codebase is a content-addressed
// identifier for SOMETHING — a task, a knowledge bundle, a
// controls selection, an atom's input set, a cache key, etc.
// Before Phase 0c every such identifier was a bare `string`,
// which meant any fingerprint could be passed anywhere a string
// was expected — including into the wrong slot of a sibling
// envelope. The most recent example: `envelope.ts:182` assigned
// `task: input.surfaceFingerprint`, a field name that literally
// lied about its content, and the compiler could not catch it.
//
// `Fingerprint<Tag>` is a branded string whose phantom tag
// identifies what the identifier points at. The brand is
// zero-cost at runtime (still a `string`), but at the type
// level a `Fingerprint<'task'>` and `Fingerprint<'knowledge'>`
// are distinct types that cannot be transposed.
//
// The tag registry (`FingerprintTag` below) is CLOSED per
// decision D2: adding a new fingerprint kind requires editing
// the registry. This matches the mapped-type registry discipline
// the codebase uses for `L4_VISITORS`, `AtomPromotionGateRegistry`,
// and `foldPhaseOutputSource`.
//
// There is NO untagged shim. The old `contentFingerprint(value)`
// and `taggedContentFingerprint(value)` helpers (without tags)
// have been deleted per the no-back-compat-shims doctrine in
// `docs/coding-notes.md` § Universal Operator Principles. Every
// call site passes its tag.
//
// See `docs/envelope-axis-refactor-plan.md` § 6 for the full
// rationale.

declare const FingerprintBrand: unique symbol;

/** A content-addressed identifier with a phantom tag identifying
 *  what it points at. Structurally a `string` at runtime; at the
 *  type level, `Fingerprint<'task'>` and `Fingerprint<'knowledge'>`
 *  are distinct types. */
export type Fingerprint<Tag extends FingerprintTag> = string & {
  readonly [FingerprintBrand]: Tag;
};

/** The closed registry of fingerprint tags. Adding a new kind
 *  requires editing this union. */
export type FingerprintTag =
  // ─── Envelope identity fingerprints ───
  | 'artifact' // the envelope itself (e.g., runId, proposal id)
  | 'content' // the content hash of the payload/intent
  | 'surface' // resolved interface surface (was named 'task' before D1)
  | 'knowledge' // knowledge catalog state
  | 'controls' // control selection state
  | 'run' // execution session identity
  // ─── Tier identity fingerprints ───
  | 'atom-input' // Atom.inputFingerprint (Tier 1)
  | 'composition-input' // Composition.inputFingerprint (Tier 2)
  | 'projection-input' // Projection.inputFingerprint (Tier 3)
  // ─── Domain-specific content fingerprints ───
  | 'ado-content' // ADO snapshot content hash
  | 'snapshot' // knowledge snapshot hash
  | 'rerun-plan' // rerun plan fingerprint
  | 'explanation' // rerun explanation fingerprint
  // ─── Cache keys (discriminated from content fingerprints) ───
  | 'translation-cache-key'
  | 'agent-interp-cache-key'
  | 'projection-cache-key'
  | 'proposal-id'
  | 'inbox-item-id'
  | 'overlay-id'
  | 'semantic-entry-id'
  | 'discovery-receipt-id'
  // ─── Graph and derived ───
  | 'graph-node'
  | 'graph-edge'
  | 'derived-graph'
  | 'interface-graph'
  | 'state-transition-graph'
  | 'route-manifest'
  | 'learning-manifest'
  | 'cohort'
  | 'cohort-aggregate'
  | 'stage-input-set'
  | 'harvest-input'
  | 'harvest-receipt'
  | 'harvest-index'
  | 'semantic-core'
  // Scenario corpus (Step 8 / docs/v2-scenario-corpus-plan.md §3.4)
  // — `'scenario'` keys an authored Scenario value (excludes
  // cosmetic fields per scenarioKeyableShape); `'scenario-receipt'`
  // keys a ScenarioReceipt envelope. Fingerprints stamp on
  // ScenarioReceipt provenance for drift-detection across
  // substrate-version bumps.
  | 'scenario'
  | 'scenario-receipt'
  // Compounding engine (Step 9 / docs/v2-compounding-engine-plan.md §3.1,
  // §3.3). `'hypothesis'` keys an authored Hypothesis value (excludes
  // cosmetic fields per hypothesisKeyableShape); `'hypothesis-receipt'`
  // keys a HypothesisReceipt envelope emitted per evaluation cycle.
  // Stamped on scoreboard snapshots so regression detection can
  // tie observed outcomes back to the authored predictions that
  // generated them.
  | 'hypothesis'
  | 'hypothesis-receipt'
  // Customer-compilation cohort (Step 11 Z11a). Keys a
  // CompilationReceipt envelope emitted per `tesseract compile
  // --emit-compounding-receipt` invocation. The receipt captures
  // resolution outcomes (resolved / needs-human / blocked step
  // counts) plus the intervention-fidelity floor used by the
  // needs-human corpus's hypothesis judgment.
  | 'compilation-receipt'
  // Substrate ladder (Step 11 Z11g). Keys the invariant-band
  // sub-fingerprint of a ProbeReceipt — a pure projection over
  // the axes cross-rung parity laws compare on (probeId,
  // observed classification, observed error-family, fixture
  // fingerprint, substrate version). Computed inside
  // probeReceipt() so L-Invariant-Content-Pure holds by
  // construction.
  | 'probe-receipt-invariant'
  // Substrate-study snapshot (Step 11 Z11g.d.0a). Keys the
  // structural signature of a SnapshotRecord — a fingerprint
  // over the captured DOM's (depth, tag, role, class-prefix-
  // family, data-attr-names) tuples, sorted by path, sha256'd.
  // Used by the hydration-detector's Phase C signature-
  // stability check (docs/v2-substrate-ladder-plan.d0a-harness-
  // design.md §4.3).
  | 'snapshot-signature';

/** Adopt an existing string as a tagged fingerprint. Use sparingly
 *  — this is the type-system "I know what I'm doing" escape hatch
 *  for places that consume fingerprints from persistence or
 *  external callers where the tag is known from context. */
export function asFingerprint<Tag extends FingerprintTag>(
  tag: Tag,
  value: string,
): Fingerprint<Tag> {
  void tag;
  return value as Fingerprint<Tag>;
}

/**
 * Compute a content fingerprint: `sha256(stableStringify(value))`,
 * branded with a phantom `Tag`. This is the canonical form for
 * identifying cache keys and derived content addresses whose
 * consumers interpret the raw hex digest without a `sha256:` prefix.
 *
 * The `tag` parameter is phantom-only at runtime (discarded) but
 * forces the caller to declare what the fingerprint points at,
 * which the type system can then check.
 *
 * Pure domain — no Effect, no IO.
 */
export function fingerprintFor<Tag extends FingerprintTag>(
  tag: Tag,
  value: unknown,
): Fingerprint<Tag> {
  void tag;
  return sha256(stableStringify(value)) as Fingerprint<Tag>;
}

/**
 * Compute a content fingerprint with the `sha256:` prefix applied,
 * branded with a phantom `Tag`. This is the canonical form for
 * envelope fingerprints, `inputFingerprint` fields on canon
 * artifacts, and cache record fingerprints that disambiguate
 * hash algorithms at the field level.
 */
export function taggedFingerprintFor<Tag extends FingerprintTag>(
  tag: Tag,
  value: unknown,
): Fingerprint<Tag> {
  void tag;
  return `sha256:${sha256(stableStringify(value))}` as Fingerprint<Tag>;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(amp|apos|gt|lt|nbsp|quot);/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

export function normalizeHtmlText(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export { normalizeAriaSnapshot };

export function computeAdoContentHash(input: {
  steps: readonly AdoStep[];
  parameters: readonly AdoParameter[];
}): Fingerprint<'ado-content'> {
  const normalized = {
    parameters: input.parameters.map((parameter) => ({
      name: parameter.name,
      values: [...parameter.values],
    })),
    steps: input.steps.map((step) => ({
      action: normalizeHtmlText(step.action),
      expected: normalizeHtmlText(step.expected),
      index: step.index,
      sharedStepId: step.sharedStepId ?? null,
    })),
  };

  return taggedFingerprintFor('ado-content', normalized);
}

export function computeNormalizedSnapshotHash(snapshot: string): string {
  return sha256(normalizeAriaSnapshot(snapshot));
}
