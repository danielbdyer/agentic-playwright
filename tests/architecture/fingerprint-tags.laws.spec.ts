/**
 * Phase 0c: Fingerprint<Tag> Laws
 *
 * Asserts that the Fingerprint<Tag> phantom brand prevents
 * cross-tag transposition at the type level, that the tag
 * registry is closed, and that the typed helpers produce
 * correctly tagged values.
 *
 * @see docs/envelope-axis-refactor-plan.md § 6 (Phase 0c)
 */
import { describe, test, expect } from 'vitest';
import type { Fingerprint, FingerprintTag } from '../../lib/domain/kernel/hash';
import { fingerprintFor, taggedFingerprintFor, asFingerprint } from '../../lib/domain/kernel/hash';

describe('Phase 0c: Fingerprint<Tag> laws', () => {
  // ─── Law 1: fingerprintFor returns a tagged fingerprint ────

  test('Law 1: fingerprintFor returns a Fingerprint branded value', () => {
    const fp = fingerprintFor('artifact', { x: 1 });
    // Runtime: still a string
    expect(typeof fp).toBe('string');
    expect(fp.length).toBe(64); // sha256 hex digest
  });

  // ─── Law 2: taggedFingerprintFor returns sha256:-prefixed ──

  test('Law 2: taggedFingerprintFor returns sha256:-prefixed string', () => {
    const fp = taggedFingerprintFor('content', { x: 1 });
    expect(fp.startsWith('sha256:')).toBe(true);
    expect(fp.length).toBe(71); // 'sha256:' + 64 hex chars
  });

  // ─── Law 3: Determinism ────────────────────────────────────

  test('Law 3: same tag + same value = same fingerprint', () => {
    const a = fingerprintFor('knowledge', { screen: 'policy-search', elements: 5 });
    const b = fingerprintFor('knowledge', { screen: 'policy-search', elements: 5 });
    expect(a).toBe(b);
  });

  // ─── Law 4: Different values produce different fingerprints ─

  test('Law 4: different values produce different fingerprints', () => {
    const a = fingerprintFor('content', { x: 1 });
    const b = fingerprintFor('content', { x: 2 });
    expect(a).not.toBe(b);
  });

  // ─── Law 5: asFingerprint is the boundary crossing ─────────

  test('Law 5: asFingerprint preserves the runtime value', () => {
    const raw = 'sha256:abc123def456';
    const fp = asFingerprint('artifact', raw);
    // Runtime: the value is unchanged
    expect(fp).toBe(raw);
    // Type-level: fp is Fingerprint<'artifact'>, not string
    type _IsTagged = typeof fp extends Fingerprint<'artifact'> ? true : false;
    const assertion: _IsTagged = true;
    expect(assertion).toBe(true);
  });

  // ─── Law 6: Cross-tag assignment is a type error ───────────

  test('Law 6: cannot assign a knowledge fingerprint where an artifact fingerprint is expected', () => {
    const knowledge = fingerprintFor('knowledge', { x: 1 });

    // @ts-expect-error cross-tag: knowledge → artifact
    const _artifact: Fingerprint<'artifact'> = knowledge;

    expect(knowledge).toBeDefined();
  });

  test('Law 6b: cannot assign a surface fingerprint where a controls fingerprint is expected', () => {
    const surface = fingerprintFor('surface', { screen: 's1' });

    // @ts-expect-error cross-tag: surface → controls
    const _controls: Fingerprint<'controls'> = surface;

    expect(surface).toBeDefined();
  });

  // ─── Law 7: Tag registry is exhaustive ─────────────────────

  test('Law 7: FingerprintTag includes all canonical tags', () => {
    // If a tag is removed from the registry, this array literal
    // will fail to compile because the removed tag is no longer
    // assignable to FingerprintTag.
    const tags: readonly FingerprintTag[] = [
      'artifact', 'content', 'surface', 'knowledge', 'controls', 'run',
      'atom-input', 'composition-input', 'projection-input',
      'ado-content', 'snapshot', 'rerun-plan', 'explanation',
      'translation-cache-key', 'agent-interp-cache-key',
      'projection-cache-key', 'proposal-id', 'inbox-item-id',
      'overlay-id', 'semantic-entry-id', 'discovery-receipt-id',
      'graph-node', 'graph-edge', 'derived-graph', 'interface-graph',
      'state-transition-graph', 'route-manifest', 'learning-manifest',
      'cohort', 'cohort-aggregate', 'stage-input-set',
      'harvest-input', 'harvest-receipt', 'harvest-index',
      'semantic-core',
    ];
    expect(tags.length).toBeGreaterThanOrEqual(30);
  });
});
