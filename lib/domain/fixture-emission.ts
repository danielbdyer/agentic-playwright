// ─── Fixture-backed data emission ───
//
// Currently data values in generated specs resolve to single hardcoded strings,
// which blocks spec reuse across data combinations. This module provides
// utilities to emit fixture references instead of hardcoded literals, enabling
// parameterized specs that work with multiple datasets.

/**
 * A data binding describes the relationship between a scenario step and
 * its data source. This is the subset of fields needed for fixture emission.
 */
export interface DataBinding {
  readonly datasetId: string;
  readonly field: string;
  readonly value?: string | null | undefined;
}

/** Fixture reference prefix — all fixture refs start with this token. */
const FIXTURE_REF_PREFIX = 'fixture:';

/** Posture variant separator — joins posture and variant identifiers. */
const POSTURE_VARIANT_SEPARATOR = '/';

/**
 * Emit a reference to fixture data instead of a hardcoded literal.
 * The reference format is `fixture:{datasetId}.{field}` which can be
 * resolved at runtime against a loaded dataset.
 */
export function emitDatasetReference(binding: DataBinding): string {
  return `${FIXTURE_REF_PREFIX}${binding.datasetId}.${binding.field}`;
}

/**
 * Emit a posture-parameterized variant identifier.
 * Format: `{posture}/{variant}` — both components are always present.
 */
export function emitPostureVariant(posture: string, variant: string): string {
  const normalizedPosture = posture.trim() || 'default';
  const normalizedVariant = variant.trim() || 'default';
  return `${normalizedPosture}${POSTURE_VARIANT_SEPARATOR}${normalizedVariant}`;
}

/**
 * Detect whether a value is a hardcoded literal (not a fixture reference).
 * Empty strings and null/undefined are not considered hardcoded literals.
 */
export function isHardcodedLiteral(value: string): boolean {
  return value.length > 0 && !value.startsWith(FIXTURE_REF_PREFIX);
}

/**
 * Convert a hardcoded literal to a fixture reference.
 * The original value is encoded in the reference for round-trip recovery.
 * Format: `fixture:{datasetId}.{encodedValue}`
 *
 * The encoding is reversible: `extractHardcodedFromRef` recovers the original.
 */
export function convertToFixtureRef(hardcoded: string, datasetId: string): string {
  const encoded = encodeFieldName(hardcoded);
  return `${FIXTURE_REF_PREFIX}${datasetId}.${encoded}`;
}

/**
 * Extract the original hardcoded value from a fixture reference.
 * Returns null if the value is not a valid fixture reference.
 */
export function extractHardcodedFromRef(ref: string): { readonly datasetId: string; readonly field: string } | null {
  if (!ref.startsWith(FIXTURE_REF_PREFIX)) {
    return null;
  }
  const body = ref.slice(FIXTURE_REF_PREFIX.length);
  const dotIndex = body.indexOf('.');
  if (dotIndex < 0) {
    return null;
  }
  return {
    datasetId: body.slice(0, dotIndex),
    field: decodeFieldName(body.slice(dotIndex + 1)),
  };
}

// ─── Internal encoding ───

/**
 * Encode a field name for embedding in a fixture reference.
 * Dots and colons in the original value are percent-encoded to avoid
 * ambiguity with the reference format.
 */
function encodeFieldName(value: string): string {
  return value
    .replace(/%/g, '%25')
    .replace(/\./g, '%2E')
    .replace(/:/g, '%3A');
}

/**
 * Decode a percent-encoded field name back to the original value.
 */
function decodeFieldName(encoded: string): string {
  return encoded
    .replace(/%2E/g, '.')
    .replace(/%3A/g, ':')
    .replace(/%25/g, '%');
}
