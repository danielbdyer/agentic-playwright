/**
 * WorldShape — the substrate's canonical input language.
 *
 * A WorldShape declares the world's content (ordered SurfaceSpecs)
 * and its environmental entropy (an optional EntropyProfile). The
 * substrate's render equation is:
 *
 *     Substrate :: (WorldShape) → DOM
 *
 * Where earlier iterations keyed their vocabulary by business-
 * domain identifiers ("policy-search:searchButton"), WorldShape
 * speaks the classifier's own language: role, name, visibility,
 * enabled, input-backing, detach-timing.
 *
 * ## Wire format
 *
 * The URL serializer (`serializeWorldShapeToUrl`) writes a
 * WorldShape as the `shape` query parameter. `parseWorldShapeFromUrl`
 * reads it back. The parameter name was deliberately renamed from
 * `world` during the substrate refactor so legacy URL clients don't
 * silently parse under the new grammar.
 *
 * Pure domain.
 */

import type { SurfaceSpec } from './surface-spec';
import type { EntropyProfile } from './entropy-profile';

/** The substrate's canonical input. */
export interface WorldShape {
  /** Ordered surfaces to render. */
  readonly surfaces: readonly SurfaceSpec[];
  /** Optional environmental variance. When omitted, zero variance —
   *  the substrate renders the surfaces in declaration order with
   *  no wrapper layers, default chrome, no siblings. */
  readonly entropy?: EntropyProfile;
  /** Optional screen-preset identifier. When the substrate resolves
   *  a preset, the preset's surfaces + entropy merge into the
   *  explicit ones (explicit wins). Secondary mechanism per the
   *  Step-6 sign-off. */
  readonly preset?: string;
}

/** The query parameter the substrate URL carries. */
export const WORLD_SHAPE_QUERY_PARAM = 'shape';

/** The empty shape — renders nothing. */
export const EMPTY_WORLD_SHAPE: WorldShape = { surfaces: [] };

/** Right-biased override Monoid<WorldShape>. Combines two
 *  WorldShapes where the right (`b`) takes precedence on every
 *  axis when defined:
 *
 *    empty                = EMPTY_WORLD_SHAPE
 *    combine(a, b).surfaces  = b.surfaces.length > 0 ? b.surfaces : a.surfaces
 *    combine(a, b).entropy   = b.entropy ?? a.entropy
 *    combine(a, b).preset    = b.preset ?? a.preset
 *
 *  Used by `resolveTopology` (workshop/substrate/test-topology.ts)
 *  to apply a registered topology under an explicit shape:
 *
 *    resolveTopology(shape, registry)
 *      = combine(topologyShape, shape)   // shape wins on each axis
 *
 *  Right-biasing models "the explicit caller-supplied shape is
 *  authoritative; preset values fill in gaps."
 *
 *  Associativity: combine(a, combine(b, c)) = combine(combine(a, b), c).
 *  Both reduce to "the rightmost-defined value on each axis."
 *  Identity laws: combine(empty, x) = x = combine(x, empty).
 *
 *  See `tests/substrate/world-shape-monoid.laws.spec.ts` for
 *  the law-runner. */
export const worldShapeOverrideMonoid: {
  readonly empty: WorldShape;
  readonly combine: (a: WorldShape, b: WorldShape) => WorldShape;
} = {
  empty: EMPTY_WORLD_SHAPE,
  combine: (a, b) => {
    const surfaces = b.surfaces.length > 0 ? b.surfaces : a.surfaces;
    const entropy = b.entropy ?? a.entropy;
    const preset = b.preset ?? a.preset;
    return {
      surfaces,
      ...(entropy !== undefined ? { entropy } : {}),
      ...(preset !== undefined ? { preset } : {}),
    };
  },
};

/** Serialize a WorldShape onto a URL. */
export function serializeWorldShapeToUrl(
  baseUrl: string,
  shape: WorldShape,
): string {
  const encoded = encodeURIComponent(JSON.stringify(shape));
  const stripped = stripExistingShapeParam(baseUrl);
  const separator = stripped.endsWith('?') || stripped.endsWith('&') ? '' : (stripped.includes('?') ? '&' : '?');
  return `${stripped}${separator}${WORLD_SHAPE_QUERY_PARAM}=${encoded}`;
}

/** Parse a WorldShape from a URL. Returns null when the URL has
 *  no `shape` query param or it doesn't decode to a valid shape. */
export function parseWorldShapeFromUrl(url: string): WorldShape | null {
  const queryIndex = url.indexOf('?');
  if (queryIndex < 0) return null;
  const params = new URLSearchParams(url.slice(queryIndex + 1));
  const raw = params.get(WORLD_SHAPE_QUERY_PARAM);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isValidWorldShape(parsed)) return null;
  return parsed;
}

function stripExistingShapeParam(url: string): string {
  const queryIndex = url.indexOf('?');
  if (queryIndex < 0) return url;
  const base = url.slice(0, queryIndex);
  const params = new URLSearchParams(url.slice(queryIndex + 1));
  params.delete(WORLD_SHAPE_QUERY_PARAM);
  const remaining = params.toString();
  return remaining.length === 0 ? `${base}?` : `${base}?${remaining}&`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidSurfaceSpec(value: unknown): value is SurfaceSpec {
  if (!isRecord(value)) return false;
  if (typeof value['role'] !== 'string') return false;
  if (value['name'] !== undefined && typeof value['name'] !== 'string') return false;
  if (value['visibility'] !== undefined && typeof value['visibility'] !== 'string') return false;
  if (value['enabled'] !== undefined && typeof value['enabled'] !== 'boolean') return false;
  if (value['inputBacking'] !== undefined && typeof value['inputBacking'] !== 'string') return false;
  if (value['detachAfterMs'] !== undefined && typeof value['detachAfterMs'] !== 'number') return false;
  if (value['surfaceId'] !== undefined && typeof value['surfaceId'] !== 'string') return false;
  if (value['initialValue'] !== undefined && typeof value['initialValue'] !== 'string') return false;
  if (value['required'] !== undefined && typeof value['required'] !== 'boolean') return false;
  if (value['invalid'] !== undefined && typeof value['invalid'] !== 'boolean') return false;
  if (value['describedBy'] !== undefined && typeof value['describedBy'] !== 'string') return false;
  if (value['submitReveal'] !== undefined && typeof value['submitReveal'] !== 'string') return false;
  if (value['successMessage'] !== undefined && typeof value['successMessage'] !== 'string') return false;
  if (value['errorMessage'] !== undefined && typeof value['errorMessage'] !== 'string') return false;
  if (value['children'] !== undefined) {
    if (!Array.isArray(value['children'])) return false;
    if (!value['children'].every(isValidSurfaceSpec)) return false;
  }
  return true;
}

function isValidEntropyProfile(value: unknown): value is EntropyProfile {
  if (!isRecord(value)) return false;
  if (value['seed'] !== undefined && typeof value['seed'] !== 'string') return false;
  // Axes are optional and opaque at wire level; the renderer
  // validates structure before applying. Missing axis = zero
  // variance on that axis.
  return true;
}

function isValidWorldShape(value: unknown): value is WorldShape {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value['surfaces'])) return false;
  if (!value['surfaces'].every(isValidSurfaceSpec)) return false;
  if (value['entropy'] !== undefined && !isValidEntropyProfile(value['entropy'])) return false;
  if (value['preset'] !== undefined && typeof value['preset'] !== 'string') return false;
  return true;
}
