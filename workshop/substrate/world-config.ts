/**
 * WorldConfig — the substrate's input language.
 *
 * Per docs/v2-probe-ir-spike.md §8 and the Step-6 first-principles
 * redesign (workshop/observations/probe-spike-verdict-05.md when it
 * lands), every probe's worldSetup projects into a WorldConfig that
 * fully determines what the substrate renders. The substrate — any
 * rung, any adapter — is a pure function of WorldConfig plus the
 * facet-renderer registry.
 *
 * ## Invariants
 *
 * 1. **Deterministic.** Two probes with identical WorldConfig produce
 *    byte-identical DOM. No cross-probe state, no animation-timing,
 *    no hydration non-determinism.
 * 2. **Stateless.** A WorldConfig is complete on its own; rendering
 *    does not reference state from prior probes.
 * 3. **URL-addressable.** Every WorldConfig round-trips losslessly
 *    through a URL query string; the URL is the wire format between
 *    the harness (which mints the URL) and the synthetic app (which
 *    parses it). Round-trip is the identity per law W1.
 * 4. **Closed hook shapes at the rendering boundary.** The
 *    substrate carries hooks as `Record<string, unknown>`; each
 *    FacetRenderer narrows to its own hook interface at consumption.
 *    Unknown hook keys are silently ignored by renderers (forward-
 *    compatible).
 *
 * ## Wire format
 *
 * Single query parameter `world` carrying URI-encoded JSON. Opaque
 * at the URL level but trivially decodable (paste into
 * `decodeURIComponent` + `JSON.parse`). Chosen over a compact DSL
 * because facet IDs contain colons (`policy-search:searchButton`)
 * and robust delimiter escaping complicates ad-hoc parsers. JSON
 * sidesteps both concerns.
 *
 * ## Forward compatibility
 *
 * The WorldConfig shape is a single array of facet world-specs.
 * Screen-level renderers (v2 future per Step-6 sign-off) are a
 * derivation over this array — a "screen preset" expands into a
 * list of facet world-specs before serialization. The WorldConfig
 * type itself does not need to know about screens; the registry
 * that produces the spec list can carry that vocabulary.
 *
 * Pure module — no React, no IO, no Effect.
 */

/** Stable facet identity. Same string the manifest uses
 *  (`<scope>:<name>`). Not branded yet — keeping the surface
 *  minimal until a branded type adds value across more callsites. */
export type FacetId = string;

/** One facet's world-setup in a WorldConfig. Hooks are opaque at
 *  the substrate level; each renderer narrows at consumption. */
export interface FacetWorldSpec {
  readonly facetId: FacetId;
  readonly hooks: Readonly<Record<string, unknown>>;
}

/** The substrate's input language. Three shapes are accepted:
 *
 *    { facets: [...] }                      — explicit facet list
 *    { preset: "policy-detail" }            — screen-preset
 *    { preset: "...", hooks: { id: {...} }} — preset + per-facet overrides
 *
 *  When `facets` is present, it takes precedence over `preset` — an
 *  explicit list always wins (override-by-full-replacement is the
 *  simpler semantic than override-by-merge).
 *
 *  When only `preset` is present, the preset registry expands it to
 *  a facet list at render time. `hooks` (when present) maps facetId
 *  → per-facet hook overrides that merge on top of the preset's
 *  default hooks. This keeps the URL debuggable: `?world={"preset":
 *  "policy-detail","hooks":{"policy-detail:statusBadge":{"hide-target":
 *  true}}}` reads as "the policy-detail screen, with the status badge
 *  hidden." */
export interface WorldConfig {
  readonly facets?: readonly FacetWorldSpec[];
  readonly preset?: string;
  readonly hooks?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/** The URL query parameter name carrying the encoded WorldConfig.
 *  Exported so the harness and the synthetic app agree on the key. */
export const WORLD_CONFIG_QUERY_PARAM = 'world';

/** The empty WorldConfig — renders nothing. Useful as a default
 *  when the substrate is asked to render "no world." */
export const EMPTY_WORLD_CONFIG: WorldConfig = { facets: [] };

/** Construct a preset-keyed WorldConfig. Convenience constructor
 *  for the most common shape in rung-3 classifiers. */
export function presetWorldConfig(
  preset: string,
  hooks?: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): WorldConfig {
  return hooks === undefined ? { preset } : { preset, hooks };
}

/** Serialize a WorldConfig onto a URL. Appends or replaces the
 *  `world` query parameter. Deterministic — two calls with the
 *  same (baseUrl, config) produce the same output. */
export function serializeWorldConfigToUrl(
  baseUrl: string,
  config: WorldConfig,
): string {
  const encoded = encodeURIComponent(JSON.stringify(config));
  const separator = baseUrl.includes('?') ? '&' : '?';
  const stripped = stripExistingWorldParam(baseUrl);
  const stripSeparator = stripped.endsWith('?') || stripped.endsWith('&') ? '' : separator;
  return `${stripped}${stripSeparator}${WORLD_CONFIG_QUERY_PARAM}=${encoded}`;
}

/** Parse a URL's WorldConfig. Returns null when:
 *   - the URL has no `world` query parameter,
 *   - the value isn't valid URI-encoded JSON,
 *   - the JSON doesn't match the WorldConfig shape.
 *
 *  Returning null — not throwing — is deliberate. The synthetic
 *  app defaults to rendering nothing on a missing/malformed world,
 *  which matches the "empty is safe" invariant. The rung-3
 *  classifier treats null as a harness bug (the harness should
 *  always mint a valid URL). */
export function parseWorldConfigFromUrl(url: string): WorldConfig | null {
  const queryIndex = url.indexOf('?');
  if (queryIndex < 0) return null;
  const query = url.slice(queryIndex + 1);
  const params = new URLSearchParams(query);
  const raw = params.get(WORLD_CONFIG_QUERY_PARAM);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isValidWorldConfig(parsed)) return null;
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidFacetWorldSpec(value: unknown): value is FacetWorldSpec {
  if (!isRecord(value)) return false;
  if (typeof value['facetId'] !== 'string') return false;
  return isRecord(value['hooks']);
}

function isValidHookMap(value: unknown): value is Readonly<Record<string, Readonly<Record<string, unknown>>>> {
  if (!isRecord(value)) return false;
  for (const v of Object.values(value)) {
    if (!isRecord(v)) return false;
  }
  return true;
}

function isValidWorldConfig(value: unknown): value is WorldConfig {
  if (!isRecord(value)) return false;
  const { facets, preset, hooks } = value;
  if (facets !== undefined) {
    if (!Array.isArray(facets)) return false;
    if (!facets.every(isValidFacetWorldSpec)) return false;
  }
  if (preset !== undefined && typeof preset !== 'string') return false;
  if (hooks !== undefined && !isValidHookMap(hooks)) return false;
  // At least one of facets or preset must be present for a meaningful
  // WorldConfig; the empty case (`{}`) is accepted and resolves to
  // the empty facet list (same semantics as `{ facets: [] }`).
  return true;
}

function stripExistingWorldParam(url: string): string {
  const queryIndex = url.indexOf('?');
  if (queryIndex < 0) return url;
  const base = url.slice(0, queryIndex);
  const query = url.slice(queryIndex + 1);
  const params = new URLSearchParams(query);
  params.delete(WORLD_CONFIG_QUERY_PARAM);
  const remaining = params.toString();
  return remaining.length === 0 ? `${base}?` : `${base}?${remaining}&`;
}
