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

/**
 * Compute a content fingerprint: `sha256(stableStringify(value))`.
 *
 * This is the load-bearing fingerprint recipe used throughout the
 * codebase — atoms, compositions, projections, caches, rerun plans,
 * agent interpretation envelopes, and the replay machinery all
 * compute their content hash by `stableStringify`-ing a value object
 * and SHA-256-ing the resulting string. Centralizing the recipe
 * here means any future tweak to the stringify normalization (e.g.
 * the undefined-omission fix that lived in stableStringify) cascades
 * to every call site automatically — no scattered `sha256(stableStringify(…))`
 * islands that could drift.
 *
 * Use `contentFingerprint` when you want the raw 64-char hex digest.
 * Use `taggedContentFingerprint` when the fingerprint is going into
 * a field that carries the `sha256:` prefix convention (atoms,
 * cache artifacts, envelope fingerprints, rerun plan fingerprints).
 *
 * Pure domain — no Effect, no IO.
 */
export function contentFingerprint(value: unknown): string {
  return sha256(stableStringify(value));
}

/**
 * Compute a content fingerprint with the `sha256:` prefix applied.
 * Equivalent to `\`sha256:${contentFingerprint(value)}\``.
 *
 * This is the canonical form for envelope fingerprints, cache keys
 * whose consumers use the prefix to disambiguate hash algorithms,
 * and atom/composition `inputFingerprint` fields.
 */
export function taggedContentFingerprint(value: unknown): string {
  return `sha256:${contentFingerprint(value)}`;
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
}): string {
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

  return taggedContentFingerprint(normalized);
}

export function computeNormalizedSnapshotHash(snapshot: string): string {
  return sha256(normalizeAriaSnapshot(snapshot));
}
