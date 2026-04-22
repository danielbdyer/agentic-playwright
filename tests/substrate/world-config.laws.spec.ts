/**
 * WorldConfig — structural laws.
 *
 * Pins the substrate's input language invariants:
 *
 *   W1. Round-trip identity: parse(serialize(base, x)) equals x.
 *   W2. Serialization is deterministic — same inputs produce
 *       byte-identical output.
 *   W3. Parse of a malformed URL returns null (no throws).
 *   W4. The empty WorldConfig round-trips cleanly.
 *   W5. A URL without the `world` parameter returns null on parse.
 *   W6. Non-world query parameters on the base URL are preserved
 *       through serialization.
 *   W7. A stale `world` parameter is replaced, not duplicated, on
 *       re-serialization.
 */

import { describe, test, expect } from 'vitest';
import {
  EMPTY_WORLD_CONFIG,
  WORLD_CONFIG_QUERY_PARAM,
  parseWorldConfigFromUrl,
  serializeWorldConfigToUrl,
  type WorldConfig,
} from '../../workshop/substrate/world-config';

const BASE = 'http://127.0.0.1:3100/';

const SAMPLE: WorldConfig = {
  facets: [
    {
      facetId: 'policy-search:searchButton',
      hooks: { hidden: true },
    },
    {
      facetId: 'policy-search:policyNumberInput',
      hooks: { disabled: true, 'detach-after-ms': 1 },
    },
  ],
};

describe('WorldConfig laws', () => {
  test('W1: round-trip identity', () => {
    const url = serializeWorldConfigToUrl(BASE, SAMPLE);
    const parsed = parseWorldConfigFromUrl(url);
    expect(parsed).toEqual(SAMPLE);
  });

  test('W2: serialization is deterministic', () => {
    const a = serializeWorldConfigToUrl(BASE, SAMPLE);
    const b = serializeWorldConfigToUrl(BASE, SAMPLE);
    expect(a).toBe(b);
  });

  test('W3: malformed URL → null', () => {
    expect(parseWorldConfigFromUrl(`${BASE}?${WORLD_CONFIG_QUERY_PARAM}=not-json`)).toBeNull();
    expect(parseWorldConfigFromUrl(`${BASE}?${WORLD_CONFIG_QUERY_PARAM}=%7Bnope`)).toBeNull();
    // JSON that doesn't match the shape → null.
    const shaped = encodeURIComponent(JSON.stringify({ facets: 'wrong' }));
    expect(parseWorldConfigFromUrl(`${BASE}?${WORLD_CONFIG_QUERY_PARAM}=${shaped}`)).toBeNull();
  });

  test('W4: empty config round-trips', () => {
    const url = serializeWorldConfigToUrl(BASE, EMPTY_WORLD_CONFIG);
    const parsed = parseWorldConfigFromUrl(url);
    expect(parsed).toEqual(EMPTY_WORLD_CONFIG);
  });

  test('W5: URL without world param → null', () => {
    expect(parseWorldConfigFromUrl(BASE)).toBeNull();
    expect(parseWorldConfigFromUrl(`${BASE}?other=value`)).toBeNull();
  });

  test('W6: non-world query params are preserved', () => {
    const baseWithQuery = `${BASE}?theme=dark`;
    const url = serializeWorldConfigToUrl(baseWithQuery, SAMPLE);
    expect(url).toContain('theme=dark');
    const parsed = parseWorldConfigFromUrl(url);
    expect(parsed).toEqual(SAMPLE);
  });

  test('W7: stale world param is replaced, not duplicated', () => {
    const stale = serializeWorldConfigToUrl(BASE, EMPTY_WORLD_CONFIG);
    const fresh = serializeWorldConfigToUrl(stale, SAMPLE);
    // The fresh URL should have exactly one occurrence of
    // `world=`.
    const matches = fresh.match(new RegExp(`${WORLD_CONFIG_QUERY_PARAM}=`, 'g'));
    expect(matches?.length).toBe(1);
    expect(parseWorldConfigFromUrl(fresh)).toEqual(SAMPLE);
  });

  test('W8: preset-only config round-trips', () => {
    const presetOnly: WorldConfig = { preset: 'policy-detail' };
    const url = serializeWorldConfigToUrl(BASE, presetOnly);
    expect(parseWorldConfigFromUrl(url)).toEqual(presetOnly);
  });

  test('W9: preset + hooks round-trips', () => {
    const withHooks: WorldConfig = {
      preset: 'policy-detail',
      hooks: {
        'policy-detail:statusBadge': { 'hide-target': true },
      },
    };
    const url = serializeWorldConfigToUrl(BASE, withHooks);
    expect(parseWorldConfigFromUrl(url)).toEqual(withHooks);
  });

  test('W10: completely empty object is valid (empty world)', () => {
    const url = serializeWorldConfigToUrl(BASE, {} as WorldConfig);
    expect(parseWorldConfigFromUrl(url)).toEqual({});
  });

  test('W11: invalid hooks shape → null on parse', () => {
    const badHooks = encodeURIComponent(JSON.stringify({
      preset: 'x',
      hooks: { 'facet:x': 'not-a-record' },
    }));
    expect(parseWorldConfigFromUrl(`${BASE}?${WORLD_CONFIG_QUERY_PARAM}=${badHooks}`)).toBeNull();
  });

  test('W12: invalid preset type → null on parse', () => {
    const badPreset = encodeURIComponent(JSON.stringify({ preset: 42 }));
    expect(parseWorldConfigFromUrl(`${BASE}?${WORLD_CONFIG_QUERY_PARAM}=${badPreset}`)).toBeNull();
  });
});
