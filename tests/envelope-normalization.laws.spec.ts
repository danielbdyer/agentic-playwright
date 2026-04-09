/**
 * Envelope normalization laws.
 *
 * Every cross-boundary artifact type must carry the standard envelope:
 * kind, version, stage, scope, ids, fingerprints, lineage, governance, payload.
 *
 * Laws verified:
 * 1. extractMetadata → liftToEnvelope round-trips (adjunction)
 * 2. mapPayload identity law
 * 3. mapPayload composition law
 * 4. Envelope field completeness for all artifact constructors
 */

import { expect, test } from '@playwright/test';
import {
  extractMetadata,
  liftToEnvelope,
  mapPayload,
  verifyEnvelopeReceiptAdjunction,
} from '../lib/domain/governance/workflow-types';
import type { WorkflowEnvelope, WorkflowMetadata } from '../lib/domain/governance/workflow-types';

// ─── Fixtures ───

const ENVELOPE_FIELDS = ['version', 'stage', 'scope', 'ids', 'fingerprints', 'lineage', 'governance'] as const;

function createTestMetadata(): WorkflowMetadata<'execution'> {
  return {
    version: 1,
    stage: 'execution',
    scope: 'step',
    ids: { adoId: 'ADO-1' as any, suite: 'test' },
    fingerprints: { artifact: 'sha256:abc123' },
    lineage: { sources: ['src-1'], parents: ['parent-1'], handshakes: ['preparation'] },
    governance: 'approved',
  };
}

function createTestEnvelope<T>(payload: T): WorkflowEnvelope<T, 'execution'> {
  return {
    ...createTestMetadata(),
    payload,
  };
}

// ─── Law 1: extractMetadata → liftToEnvelope adjunction ───

test.describe('Envelope-Receipt Adjunction', () => {
  test('extractMetadata strips payload, liftToEnvelope restores it', () => {
    const original = createTestEnvelope({ value: 42, nested: { deep: true } });
    const metadata = extractMetadata(original);
    const restored = liftToEnvelope(metadata, original.payload);

    // Restored envelope should equal original
    expect(restored.payload).toEqual(original.payload);
    expect(restored.stage).toBe(original.stage);
    expect(restored.scope).toBe(original.scope);
    expect(restored.governance).toBe(original.governance);
  });

  test('verifyEnvelopeReceiptAdjunction returns true for valid round-trip', () => {
    const metadata = createTestMetadata();
    const payload = { data: 'test-value' };
    expect(verifyEnvelopeReceiptAdjunction(metadata, payload)).toBe(true);
  });

  test('extractMetadata does not include payload', () => {
    const envelope = createTestEnvelope({ secret: 'value' });
    const metadata = extractMetadata(envelope);
    expect('payload' in metadata).toBe(false);
  });
});

// ─── Law 2: mapPayload identity ───

test.describe('mapPayload Laws', () => {
  test('mapPayload with identity function returns structurally equal envelope', () => {
    const envelope = createTestEnvelope({ x: 1, y: 'hello' });
    const mapped = mapPayload(envelope, (p) => p);
    expect(mapped.payload).toEqual(envelope.payload);
    expect(mapped.stage).toBe(envelope.stage);
    expect(mapped.governance).toBe(envelope.governance);
  });

  test('mapPayload composition: f∘g = mapPayload(f) ∘ mapPayload(g)', () => {
    const envelope = createTestEnvelope({ count: 5 });
    const double = (p: { count: number }) => ({ count: p.count * 2 });
    const addOne = (p: { count: number }) => ({ count: p.count + 1 });

    const composed = mapPayload(mapPayload(envelope, addOne), double);
    const direct = mapPayload(envelope, (p) => double(addOne(p)));

    expect(composed.payload).toEqual(direct.payload);
  });

  test('mapPayload preserves all envelope metadata fields', () => {
    const envelope = createTestEnvelope({ value: 'before' });
    const mapped = mapPayload(envelope, () => ({ value: 'after' }));

    for (const field of ENVELOPE_FIELDS) {
      expect(mapped[field]).toEqual(envelope[field]);
    }
  });
});

// ─── Law 3: Envelope field completeness ───

test.describe('Envelope field completeness', () => {
  test('WorkflowEnvelope carries all required envelope fields', () => {
    const envelope = createTestEnvelope({ test: true });
    for (const field of ENVELOPE_FIELDS) {
      expect(field in envelope).toBe(true);
    }
    expect('payload' in envelope).toBe(true);
  });

  test('metadata round-trip preserves all fields', () => {
    const metadata = createTestMetadata();
    const envelope = liftToEnvelope(metadata, { test: 'payload' });
    const extracted = extractMetadata(envelope);

    for (const field of ENVELOPE_FIELDS) {
      expect(extracted[field]).toEqual(metadata[field]);
    }
  });
});
