/**
 * ScreenPreset registry + resolver — structural laws.
 *
 * Pins:
 *   SP1. Empty registry has no presets.
 *   SP2. Registered preset is retrievable by id.
 *   SP3. Unregistered id returns null.
 *   SP4. Later entries win on duplicate id.
 *
 * Resolver laws:
 *   R1. explicit facets list wins over preset.
 *   R2. preset-only expands to the preset's facet list.
 *   R3. unknown preset returns empty list.
 *   R4. preset + hooks merges per-facet hook overrides (override
 *       keys win per-key).
 *   R5. no facets and no preset → empty list.
 */

import { describe, test, expect } from 'vitest';
import {
  EMPTY_SCREEN_PRESET_REGISTRY,
  lookupScreenPreset,
  resolveWorldConfig,
  screenPresetRegistry,
  type ScreenPreset,
} from '../../workshop/substrate/screen-preset';
import type { WorldConfig } from '../../workshop/substrate/world-config';

const POLICY_DETAIL_PRESET: ScreenPreset = {
  id: 'policy-detail',
  facets: [
    { facetId: 'policy-detail:statusBadge', hooks: { priority: 'high' } },
    { facetId: 'policy-detail:effectiveDate', hooks: {} },
  ],
};

describe('ScreenPreset registry laws', () => {
  test('SP1: empty registry has no presets', () => {
    const empty = screenPresetRegistry([]);
    expect(empty.presets.size).toBe(0);
    expect(EMPTY_SCREEN_PRESET_REGISTRY.presets.size).toBe(0);
  });

  test('SP2: registered preset retrievable by id', () => {
    const registry = screenPresetRegistry([POLICY_DETAIL_PRESET]);
    expect(lookupScreenPreset(registry, 'policy-detail')?.id).toBe('policy-detail');
  });

  test('SP3: unregistered id returns null', () => {
    const registry = screenPresetRegistry([POLICY_DETAIL_PRESET]);
    expect(lookupScreenPreset(registry, 'nope')).toBeNull();
    expect(lookupScreenPreset(EMPTY_SCREEN_PRESET_REGISTRY, 'anything')).toBeNull();
  });

  test('SP4: duplicate id — later wins', () => {
    const first = { id: 'x', facets: [] };
    const second = { id: 'x', facets: [{ facetId: 'f', hooks: {} }] };
    const registry = screenPresetRegistry([first, second]);
    expect(lookupScreenPreset(registry, 'x')).toBe(second);
  });
});

describe('resolveWorldConfig laws', () => {
  const registry = screenPresetRegistry([POLICY_DETAIL_PRESET]);

  test('R1: explicit facets win over preset', () => {
    const config: WorldConfig = {
      facets: [{ facetId: 'explicit:foo', hooks: {} }],
      preset: 'policy-detail',
    };
    expect(resolveWorldConfig(config, registry)).toEqual([
      { facetId: 'explicit:foo', hooks: {} },
    ]);
  });

  test('R2: preset-only expands to the preset facet list', () => {
    expect(resolveWorldConfig({ preset: 'policy-detail' }, registry)).toEqual(
      POLICY_DETAIL_PRESET.facets,
    );
  });

  test('R3: unknown preset returns empty list', () => {
    expect(resolveWorldConfig({ preset: 'nope' }, registry)).toEqual([]);
  });

  test('R4: preset + hooks merges per-facet overrides', () => {
    const resolved = resolveWorldConfig(
      {
        preset: 'policy-detail',
        hooks: {
          'policy-detail:statusBadge': { 'hide-target': true },
        },
      },
      registry,
    );
    expect(resolved[0]).toEqual({
      facetId: 'policy-detail:statusBadge',
      hooks: { priority: 'high', 'hide-target': true },
    });
    expect(resolved[1]).toEqual({
      facetId: 'policy-detail:effectiveDate',
      hooks: {},
    });
  });

  test('R5: no facets and no preset → empty list', () => {
    expect(resolveWorldConfig({}, registry)).toEqual([]);
  });
});
