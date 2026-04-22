/**
 * WorldShape — the first-principles replacement for WorldConfig.
 *
 * A WorldShape declares the world's content (ordered SurfaceSpecs)
 * and its environmental entropy (an optional EntropyProfile). The
 * substrate's render equation is:
 *
 *     Substrate :: (WorldShape) → DOM
 *
 * Where WorldConfig's vocabulary was keyed by business-domain
 * identifiers ("policy-search:searchButton"), WorldShape speaks the
 * classifier's own language: role, name, visibility, enabled,
 * input-backing, detach-timing.
 *
 * ## Relationship to WorldConfig
 *
 * WorldConfig (workshop/substrate/world-config.ts) is retained as
 * a narrow legacy shape at the URL wire-format layer. During this
 * first-principles refactor, the substrate canonicalizes on
 * WorldShape internally; WorldConfig continues to serialize/parse
 * on the URL for back-compat with existing CLI/harness code, but
 * new callers should use WorldShape.
 *
 * The URL serializer (serializeWorldShapeToUrl) writes WorldShape
 * as the `world` query parameter directly. parseWorldShapeFromUrl
 * reads it back. Old clients that emit `{ facets: [...] }` continue
 * to parse via the legacy path — see conversion helpers below.
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

/** The query parameter the substrate URL carries. Renamed from
 *  'world' (which WorldConfig used) to 'shape' so legacy clients
 *  writing 'world' don't parse as the new format. */
export const WORLD_SHAPE_QUERY_PARAM = 'shape';

/** The empty shape — renders nothing. */
export const EMPTY_WORLD_SHAPE: WorldShape = { surfaces: [] };

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
