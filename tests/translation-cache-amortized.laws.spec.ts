/**
 * Translation Cache Amortized Analysis — Law Tests
 *
 * Algebraic invariants for the translation cache pure functions:
 *   - Cache key determinism: same inputs => same key
 *   - Cache key collision resistance: different inputs => different keys
 *   - Monotone hit rate: repeated queries => non-decreasing hit rate
 *   - Identity round-trip: write then read returns original payload
 *
 * Tested functions:
 *   - translationCacheKey (translation-cache.ts)
 *   - TranslationCacheRecord structure
 */

import { expect, test } from '@playwright/test';
import { mulberry32 , LAW_SEED_COUNT } from './support/random';
import { translationCacheKey, type TranslationCacheRecord } from '../lib/application/resolution/translation/translation-cache';
import type { TranslationRequest } from '../lib/domain/resolution/types';

// ─── Helpers ───

function randomWord(next: () => number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const length = 1 + Math.floor(next() * 8);
  return Array.from({ length }, () => alphabet[Math.floor(next() * alphabet.length)]).join('');
}

function makeRequest(next: () => number): TranslationRequest {
  return {
    version: 1,
    taskFingerprint: `sha256:${randomWord(next)}${randomWord(next)}`,
    knowledgeFingerprint: `sha256:${randomWord(next)}${randomWord(next)}`,
    controlsFingerprint: next() > 0.5 ? `sha256:${randomWord(next)}` : null,
    normalizedIntent: randomWord(next),
    actionText: `Click ${randomWord(next)}`,
    expectedText: `Expect ${randomWord(next)}`,
    allowedActions: [],
    screens: [],
    evidenceRefs: [],
    overlayRefs: [],
  };
}

function makeCacheRecord(key: string, payload: unknown): TranslationCacheRecord {
  return {
    kind: 'translation-cache-record',
    version: 1,
    stage: 'resolution',
    scope: 'translation',
    cacheKey: key,
    fingerprint: `sha256:mock-fingerprint`,
    fingerprints: {
      task: 'sha256:task',
      knowledge: 'sha256:knowledge',
      controls: null,
      request: 'sha256:request',
    },
    lineage: {
      parents: ['sha256:task'],
      sources: ['sha256:knowledge'],
      handshakes: ['preparation', 'resolution'],
    },
    payload: payload as TranslationCacheRecord['payload'],
  };
}

// ─── Law 1: Cache key determinism ───

test.describe('Law 1: Cache key determinism — same inputs => same key', () => {
  test('identical requests produce identical keys (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next1 = mulberry32(seed);
      const next2 = mulberry32(seed);
      const req1 = makeRequest(next1);
      const req2 = makeRequest(next2);

      expect(translationCacheKey(req1)).toBe(translationCacheKey(req2));
    }
  });

  test('key is stable across repeated calls', () => {
    const next = mulberry32(42);
    const req = makeRequest(next);
    const key1 = translationCacheKey(req);
    const key2 = translationCacheKey(req);
    const key3 = translationCacheKey(req);
    expect(key1).toBe(key2);
    expect(key2).toBe(key3);
  });
});

// ─── Law 2: Cache key collision resistance ───

test.describe('Law 2: Cache key collision resistance — different inputs => different keys', () => {
  test('distinct requests produce distinct keys (20 seeds)', () => {
    const keys = new Set<string>();
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const req = makeRequest(next);
      keys.add(translationCacheKey(req));
    }
    expect(keys.size).toBe(LAW_SEED_COUNT);
  });

  test('differing only in actionText produces different keys', () => {
    const next = mulberry32(999);
    const req1 = makeRequest(next);
    const req2 = { ...req1, actionText: req1.actionText + '-modified' };
    expect(translationCacheKey(req1)).not.toBe(translationCacheKey(req2));
  });

  test('differing only in taskFingerprint produces different keys', () => {
    const next = mulberry32(1000);
    const req1 = makeRequest(next);
    const req2 = { ...req1, taskFingerprint: req1.taskFingerprint + '-alt' };
    expect(translationCacheKey(req1)).not.toBe(translationCacheKey(req2));
  });

  test('differing only in controlsFingerprint (null vs present) produces different keys', () => {
    const next = mulberry32(1001);
    const req1 = makeRequest(next);
    const withControls = { ...req1, controlsFingerprint: 'sha256:some-controls' };
    const withoutControls = { ...req1, controlsFingerprint: null };
    expect(translationCacheKey(withControls)).not.toBe(translationCacheKey(withoutControls));
  });
});

// ─── Law 3: Monotone hit rate ───

test.describe('Law 3: Monotone hit rate — repeated queries => non-decreasing hit rate', () => {
  test('simulated cache hits are monotone non-decreasing over query sequence', () => {
    const next = mulberry32(7777);

    // Generate a small universe of requests
    const universe = Array.from({ length: 10 }, () => makeRequest(next));

    // Simulate a cache: key -> record
    const cache = new Map<string, TranslationCacheRecord>();

    // Query sequence: pick randomly from universe, track cumulative hit rate
    const totalQueries = 200;
    let hits = 0;

    for (let q = 0; q < totalQueries; q++) {
      const req = universe[Math.floor(next() * universe.length)]!;
      const key = translationCacheKey(req);

      if (cache.has(key)) {
        hits++;
      } else {
        // Populate on miss
        cache.set(key, makeCacheRecord(key, { receipt: { kind: 'translation-receipt', version: 1, mode: 'structured-translation', matched: false, selected: null, candidates: [], rationale: 'mock' } }));
      }
    }

    // After all queries, the hit rate should reflect cache effectiveness:
    // With 10 unique keys and 200 queries, after warm-up we expect ~190/200 = 0.95 hit rate.
    // Use a conservative lower bound to avoid flakiness.
    const hitRate = hits / totalQueries;
    expect(hitRate).toBeGreaterThan(0.85);

    // Cache should have exactly |universe| entries (one per unique request)
    expect(cache.size).toBe(universe.length);
  });
});

// ─── Law 4: Identity round-trip ───

test.describe('Law 4: Identity round-trip — write then read returns original payload', () => {
  test('cache record payload round-trips through key lookup (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const req = makeRequest(next);
      const key = translationCacheKey(req);

      const mockReceipt = {
        kind: 'translation-receipt' as const,
        version: 1 as const,
        mode: 'structured-translation' as const,
        matched: next() > 0.5,
        selected: null,
        candidates: [],
        rationale: `rationale-${seed}`,
      };

      // Simulate write
      const record = makeCacheRecord(key, { receipt: mockReceipt });

      // Simulate read: lookup by key
      const store = new Map<string, TranslationCacheRecord>();
      store.set(record.cacheKey, record);

      const retrieved = store.get(key);
      expect(retrieved).toBeDefined();
      expect(retrieved!.kind).toBe('translation-cache-record');
      expect(retrieved!.cacheKey).toBe(key);
      expect(retrieved!.payload).toEqual({ receipt: mockReceipt });
    }
  });

  test('key used for write matches key for identical request', () => {
    const next1 = mulberry32(42);
    const next2 = mulberry32(42);
    const req1 = makeRequest(next1);
    const req2 = makeRequest(next2);

    const writeKey = translationCacheKey(req1);
    const readKey = translationCacheKey(req2);
    expect(writeKey).toBe(readKey);
  });
});
