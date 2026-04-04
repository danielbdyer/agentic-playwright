/**
 * HAR Network Determinism — Law Tests
 *
 * Invariants:
 *  1. harPathForScreen produces deterministic path
 *  2. shouldUseHar returns skip for live mode
 *  3. shouldUseHar returns record for record mode
 *  4. shouldUseHar returns replay when HAR exists
 *  5. shouldUseHar returns skip when HAR missing in replay mode
 *  6. upsertHarManifest replaces existing entry for same screen
 *  7. findHarForScreen returns null for unknown screen
 *  8. createHarArtifactRef produces complete ref
 *  9. DEFAULT_HAR_NETWORK_CONFIG is live mode
 * 10. harManifestPath is deterministic
 */

import { expect, test } from '@playwright/test';
import {
  harPathForScreen,
  harManifestPath,
  shouldUseHar,
  upsertHarManifest,
  findHarForScreen,
  createHarArtifactRef,
  DEFAULT_HAR_NETWORK_CONFIG,
  type HarManifest,
} from '../lib/application/runtime-support/har-network';

// ─── Law 1 ──────────────────────────────────────────────────────────────────

test('Law 1: harPathForScreen produces deterministic path', () => {
  const p1 = harPathForScreen('/knowledge', 'policy-search');
  const p2 = harPathForScreen('/knowledge', 'policy-search');
  expect(p1).toBe(p2);
  expect(p1).toContain('policy-search.har');
  expect(p1).toContain('screens');
});

// ─── Law 2 ──────────────────────────────────────────────────────────────────

test('Law 2: shouldUseHar returns skip for live mode', () => {
  const result = shouldUseHar({ mode: 'live', fallbackToNetwork: true, urlPattern: '**' }, null, 'any-screen');
  expect(result.action).toBe('skip');
});

// ─── Law 3 ──────────────────────────────────────────────────────────────────

test('Law 3: shouldUseHar returns record for record mode', () => {
  const result = shouldUseHar({ mode: 'record', fallbackToNetwork: true, urlPattern: '**' }, null, 'any-screen');
  expect(result.action).toBe('record');
});

// ─── Law 4 ──────────────────────────────────────────────────────────────────

test('Law 4: shouldUseHar returns replay when HAR exists', () => {
  const manifest: HarManifest = {
    kind: 'har-manifest', version: 1, updatedAt: '', artifacts: [
      { screenId: 'policy-search', harPath: '/path/to.har', recordedAt: '', requestCount: 5 },
    ],
  };
  const result = shouldUseHar({ mode: 'replay', fallbackToNetwork: true, urlPattern: '**' }, manifest, 'policy-search');
  expect(result.action).toBe('replay');
  expect(result.harPath).toBe('/path/to.har');
});

// ─── Law 5 ──────────────────────────────────────────────────────────────────

test('Law 5: shouldUseHar returns skip when HAR missing in replay mode', () => {
  const result = shouldUseHar({ mode: 'replay', fallbackToNetwork: true, urlPattern: '**' }, null, 'unknown');
  expect(result.action).toBe('skip');
});

// ─── Law 6 ──────────────────────────────────────────────────────────────────

test('Law 6: upsertHarManifest replaces existing entry for same screen', () => {
  const manifest = upsertHarManifest(null, createHarArtifactRef('screen-a', '/a.har', 3));
  const updated = upsertHarManifest(manifest, createHarArtifactRef('screen-a', '/a-v2.har', 5));
  expect(updated.artifacts).toHaveLength(1);
  expect(updated.artifacts[0]!.harPath).toBe('/a-v2.har');
  expect(updated.artifacts[0]!.requestCount).toBe(5);
});

// ─── Law 7 ──────────────────────────────────────────────────────────────────

test('Law 7: findHarForScreen returns null for unknown screen', () => {
  const manifest: HarManifest = {
    kind: 'har-manifest', version: 1, updatedAt: '', artifacts: [
      { screenId: 'known', harPath: '/k.har', recordedAt: '', requestCount: 1 },
    ],
  };
  expect(findHarForScreen(manifest, 'unknown')).toBeNull();
  expect(findHarForScreen(null, 'any')).toBeNull();
});

// ─── Law 8 ──────────────────────────────────────────────────────────────────

test('Law 8: createHarArtifactRef produces complete ref', () => {
  const ref = createHarArtifactRef('policy-search', '/path.har', 42);
  expect(ref.screenId).toBe('policy-search');
  expect(ref.harPath).toBe('/path.har');
  expect(ref.requestCount).toBe(42);
  expect(ref.recordedAt).toBeTruthy();
});

// ─── Law 9 ──────────────────────────────────────────────────────────────────

test('Law 9: DEFAULT_HAR_NETWORK_CONFIG defaults to live mode', () => {
  expect(DEFAULT_HAR_NETWORK_CONFIG.mode).toBe('live');
  expect(DEFAULT_HAR_NETWORK_CONFIG.fallbackToNetwork).toBe(true);
});

// ─── Law 10 ─────────────────────────────────────────────────────────────────

test('Law 10: harManifestPath is deterministic', () => {
  const p1 = harManifestPath('/tesseract');
  const p2 = harManifestPath('/tesseract');
  expect(p1).toBe(p2);
  expect(p1).toContain('har-manifest.json');
});
