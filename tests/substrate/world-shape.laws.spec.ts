/**
 * WorldShape — structural laws.
 *
 *   WS1. round-trip identity: parse(serialize(x)) === x.
 *   WS2. serialization is deterministic.
 *   WS3. invalid URL → null (no throws).
 *   WS4. empty shape round-trips cleanly.
 *   WS5. shape with entropy round-trips.
 *   WS6. shape carrying all optional axes round-trips.
 *   WS7. URL without `shape` param → null.
 *   WS8. non-object surface in surfaces[] → null.
 */

import { describe, test, expect } from 'vitest';
import {
  EMPTY_WORLD_SHAPE,
  WORLD_SHAPE_QUERY_PARAM,
  parseWorldShapeFromUrl,
  serializeWorldShapeToUrl,
  type WorldShape,
} from '../../workshop/substrate/world-shape';

const BASE = 'http://127.0.0.1:3100/';

const RICH_SHAPE: WorldShape = {
  surfaces: [
    { role: 'button', name: 'Search' },
    {
      role: 'textbox',
      name: 'Policy Number',
      visibility: 'display-none',
      enabled: false,
      inputBacking: 'div-with-role',
      detachAfterMs: 50,
      surfaceId: 'example:surface',
      initialValue: 'POL-001',
    },
  ],
  entropy: {
    seed: 'probe-42',
    wrapperDepth: [1, 3],
    chromeTone: ['reef', 'ember'],
    spacingDensity: ['tidy', 'layered'],
    siblingJitter: [0, 2],
    surfaceOrder: 'shuffled',
    calloutShuffle: { count: 3 },
    badgeSubset: [2, 4],
  },
  preset: 'test-preset',
};

describe('WorldShape laws', () => {
  test('WS1: round-trip identity', () => {
    const url = serializeWorldShapeToUrl(BASE, RICH_SHAPE);
    expect(parseWorldShapeFromUrl(url)).toEqual(RICH_SHAPE);
  });

  test('WS2: serialization is deterministic', () => {
    const a = serializeWorldShapeToUrl(BASE, RICH_SHAPE);
    const b = serializeWorldShapeToUrl(BASE, RICH_SHAPE);
    expect(a).toBe(b);
  });

  test('WS3: invalid URL → null', () => {
    expect(parseWorldShapeFromUrl(`${BASE}?${WORLD_SHAPE_QUERY_PARAM}=nope`)).toBeNull();
    const badSurface = encodeURIComponent(JSON.stringify({
      surfaces: [{ role: 42 }],
    }));
    expect(parseWorldShapeFromUrl(`${BASE}?${WORLD_SHAPE_QUERY_PARAM}=${badSurface}`)).toBeNull();
  });

  test('WS4: empty shape round-trips', () => {
    expect(parseWorldShapeFromUrl(serializeWorldShapeToUrl(BASE, EMPTY_WORLD_SHAPE))).toEqual(EMPTY_WORLD_SHAPE);
  });

  test('WS5: shape with entropy round-trips', () => {
    const shape: WorldShape = {
      surfaces: [{ role: 'button', name: 'x' }],
      entropy: { seed: 'y', wrapperDepth: [1, 2] },
    };
    expect(parseWorldShapeFromUrl(serializeWorldShapeToUrl(BASE, shape))).toEqual(shape);
  });

  test('WS6: all-axes shape round-trips (smoke for RICH_SHAPE)', () => {
    const url = serializeWorldShapeToUrl(BASE, RICH_SHAPE);
    const parsed = parseWorldShapeFromUrl(url);
    expect(parsed).toEqual(RICH_SHAPE);
  });

  test('WS7: URL without `shape` param → null', () => {
    expect(parseWorldShapeFromUrl(BASE)).toBeNull();
  });

  test('WS8: non-object surface in surfaces[] → null', () => {
    const bad = encodeURIComponent(JSON.stringify({ surfaces: ['not-an-object'] }));
    expect(parseWorldShapeFromUrl(`${BASE}?${WORLD_SHAPE_QUERY_PARAM}=${bad}`)).toBeNull();
  });
});
