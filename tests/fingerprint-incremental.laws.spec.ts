import { expect, test } from '@playwright/test';
import { sha256, stableStringify } from '../lib/domain/kernel/hash';
import {
  computeProjectionInputSetFingerprint,
  diffProjectionInputs,
  fingerprintProjectionArtifact,
  fingerprintProjectionOutput,
  type ProjectionBuildManifest,
  type ProjectionInputFingerprint,
} from '../lib/application/projections/cache';
import { mulberry32, randomWord , LAW_SEED_COUNT } from './support/random';

// ─── Helpers ───

function syntheticArtifact(next: () => number) {
  return {
    id: randomWord(next),
    steps: Array.from({ length: 1 + Math.floor(next() * 4) }, () => ({
      action: randomWord(next),
      target: randomWord(next),
    })),
    hash: sha256(randomWord(next)),
  };
}

function buildInputSet(next: () => number, count: number): ProjectionInputFingerprint[] {
  return Array.from({ length: count }, () =>
    fingerprintProjectionArtifact(
      randomWord(next),
      `artifacts/${randomWord(next)}.yaml`,
      syntheticArtifact(next),
    ),
  );
}

function buildManifest(
  inputs: ProjectionInputFingerprint[],
  outputFingerprint: string,
): ProjectionBuildManifest {
  return {
    version: 1,
    projection: 'test',
    inputSetFingerprint: computeProjectionInputSetFingerprint(inputs),
    outputFingerprint,
    inputs,
  };
}

// ─── Laws: fingerprint determinism ───

test('unchanged inputs produce identical fingerprints (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next1 = mulberry32(seed);
    const next2 = mulberry32(seed);
    const artifact1 = syntheticArtifact(next1);
    const artifact2 = syntheticArtifact(next2);

    const fp1 = fingerprintProjectionOutput(artifact1);
    const fp2 = fingerprintProjectionOutput(artifact2);
    expect(fp2).toBe(fp1);
  }
});

test('different inputs produce different fingerprints', () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const artifact = syntheticArtifact(next);
    const fp = fingerprintProjectionOutput(artifact);
    // Collision within 20 distinct seeds would indicate a broken hash
    expect(seen.has(fp)).toBe(false);
    seen.add(fp);
  }
});

test('fingerprint is deterministic — same seed always produces same hash (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const results: string[] = [];
    for (let trial = 0; trial < 3; trial += 1) {
      const next = mulberry32(seed);
      const artifact = syntheticArtifact(next);
      results.push(fingerprintProjectionOutput(artifact));
    }
    expect(results[1]).toBe(results[0]);
    expect(results[2]).toBe(results[0]);
  }
});

// ─── Laws: manifest-based cache invalidation ───

test('changed fingerprint triggers rebuild — diffProjectionInputs detects changed inputs', () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const next = mulberry32(seed);
    const inputCount = 2 + Math.floor(next() * 5);
    const originalInputs = buildInputSet(next, inputCount);
    const outputFp = fingerprintProjectionOutput({ inputs: originalInputs });
    const manifest = buildManifest(originalInputs, outputFp);

    // Mutate one input — simulate a changed artifact
    const mutatedInputs = originalInputs.map((input, idx) =>
      idx === 0
        ? fingerprintProjectionArtifact(input.kind, input.path, { mutated: true, seed })
        : input,
    );

    const diff = diffProjectionInputs(mutatedInputs, manifest);
    expect(diff.changedInputs.length).toBeGreaterThanOrEqual(1);
    expect(diff.changedInputs[0]).toContain(originalInputs[0]!.kind);

    // New input-set fingerprint must differ from manifest
    const newInputSetFp = computeProjectionInputSetFingerprint(mutatedInputs);
    expect(newInputSetFp).not.toBe(manifest.inputSetFingerprint);
  }
});

test('unchanged fingerprint skips rebuild — diffProjectionInputs reports no changes', () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const next = mulberry32(seed);
    const inputCount = 2 + Math.floor(next() * 5);
    const inputs = buildInputSet(next, inputCount);
    const outputFp = fingerprintProjectionOutput({ inputs });
    const manifest = buildManifest(inputs, outputFp);

    const diff = diffProjectionInputs(inputs, manifest);
    expect(diff.changedInputs).toEqual([]);
    expect(diff.removedInputs).toEqual([]);

    // Input-set fingerprint matches manifest — cache hit
    const currentFp = computeProjectionInputSetFingerprint(inputs);
    expect(currentFp).toBe(manifest.inputSetFingerprint);
  }
});

test('removed input detected by diffProjectionInputs', () => {
  const next = mulberry32(42);
  const inputs = buildInputSet(next, 4);
  const outputFp = fingerprintProjectionOutput({ inputs });
  const manifest = buildManifest(inputs, outputFp);

  // Remove last input
  const reduced = inputs.slice(0, 3);
  const diff = diffProjectionInputs(reduced, manifest);
  expect(diff.removedInputs.length).toBe(1);
});

test('added input changes input-set fingerprint', () => {
  const next = mulberry32(99);
  const inputs = buildInputSet(next, 3);
  const fp1 = computeProjectionInputSetFingerprint(inputs);

  const extra = fingerprintProjectionArtifact('extra', 'path/extra.yaml', { added: true });
  const fp2 = computeProjectionInputSetFingerprint([...inputs, extra]);
  expect(fp2).not.toBe(fp1);
});

test('stableStringify key ordering is deterministic regardless of insertion order', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    // Use unique keys to avoid duplicate-key collisions in Object.fromEntries
    const keys = Array.from({ length: 4 }, (_, i) => `key_${i}_${randomWord(next)}`);
    const values = Array.from({ length: 4 }, () => randomWord(next));

    const pairs = keys.map((k, i) => [k, values[i]] as const);
    const obj1 = Object.fromEntries(pairs);
    const obj2 = Object.fromEntries([...pairs].reverse());

    // Same key-value pairs in different insertion order produce same stringification
    expect(stableStringify(obj1)).toBe(stableStringify(obj2));
  }
});

// ─── stableStringify JSON-parity for undefined / null ──────────
//
// These laws lock down the load-bearing property that explicit
// `undefined` and structurally-absent fields produce the SAME
// output, while `null` and `undefined` remain distinguishable. The
// prior implementation emitted the literal token `undefined` for
// explicit undefined values, which (a) was not valid JSON and (b)
// silently broke fingerprint stability for every atom/composition
// whose content had optional fields — the canon-decomposer
// fingerprint story, the discovery decomposer's snapshot extractor,
// the projection input set fingerprinter, and more.

test('stableStringify omits object keys whose values are undefined (JSON.stringify parity)', () => {
  expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
});

test('stableStringify distinguishes null from undefined', () => {
  // null is a present-but-null fact; undefined is an absent fact.
  expect(stableStringify({ a: null })).not.toBe(stableStringify({ a: undefined }));
  expect(stableStringify({ a: null })).toBe('{"a":null}');
  expect(stableStringify({ a: undefined })).toBe('{}');
});

test('stableStringify omits nested undefined-valued keys recursively', () => {
  const withUndef = stableStringify({
    outer: { name: 'alice', opt: undefined, inner: { x: 1, y: undefined } },
  });
  const without = stableStringify({
    outer: { name: 'alice', inner: { x: 1 } },
  });
  expect(withUndef).toBe(without);
});

test('stableStringify output is always valid JSON', () => {
  // JSON.parse(stableStringify(x)) must succeed for any JSON-like
  // input — this catches the "literal undefined token" bug class.
  const cases: unknown[] = [
    { a: 1, b: undefined, c: 'hello' },
    { outer: { opt: undefined } },
    [],
    [1, 2, 3],
    [1, undefined, 3],
    { nested: [undefined, { a: undefined }] },
    null,
    'string',
    42,
    true,
    false,
  ];
  for (const value of cases) {
    const serialized = stableStringify(value);
    expect(() => JSON.parse(serialized)).not.toThrow();
  }
});

test('stableStringify replaces undefined array elements with null (JSON.stringify parity)', () => {
  // Arrays are position-significant. Omitting an undefined element
  // would shift subsequent indices; the JSON convention is to
  // serialize undefined as null.
  expect(stableStringify([1, undefined, 3])).toBe('[1,null,3]');
  expect(stableStringify([undefined])).toBe('[null]');
  expect(stableStringify([undefined, undefined])).toBe('[null,null]');
});

test('stableStringify is JSON-parity-equivalent for pure JSON values', () => {
  // For any value that contains no undefined fields, stableStringify
  // must produce output that JSON.parse round-trips back to an
  // equivalent structure. This is the strict JSON-parity property.
  const cases: unknown[] = [
    { simple: 1 },
    { nested: { deeper: { deepest: true } } },
    [1, 2, 3],
    { list: [1, 2, 3], nested: { a: null, b: 'x' } },
  ];
  for (const value of cases) {
    const serialized = stableStringify(value);
    expect(JSON.parse(serialized)).toEqual(value);
  }
});

test('stableStringify: explicit undefined and structural absence are byte-equivalent at every nesting depth', () => {
  // The load-bearing canon-decomposer fingerprint property: an
  // upstream parser that sometimes fills in `{ foo: undefined }`
  // and sometimes omits `foo` entirely MUST produce byte-equal
  // fingerprints for the same semantic content.
  const explicitUndefined = {
    address: { class: 'element', screen: 'policy-search', element: 'policyNumberInput' },
    content: {
      role: 'textbox',
      name: 'Policy Number',
      testId: 'policy-number-input',
      cssFallback: undefined,        // explicitly undefined
      affordance: undefined,          // explicitly undefined
      locator: undefined,             // explicitly undefined
    },
  };
  const structurallyAbsent = {
    address: { class: 'element', screen: 'policy-search', element: 'policyNumberInput' },
    content: {
      role: 'textbox',
      name: 'Policy Number',
      testId: 'policy-number-input',
      // cssFallback, affordance, locator all omitted
    },
  };
  expect(stableStringify(explicitUndefined)).toBe(stableStringify(structurallyAbsent));
  // And by extension, their sha256 fingerprints must match.
  expect(sha256(stableStringify(explicitUndefined))).toBe(
    sha256(stableStringify(structurallyAbsent)),
  );
});

test('null manifest always triggers rebuild', () => {
  const next = mulberry32(7);
  const inputs = buildInputSet(next, 3);

  const diff = diffProjectionInputs(inputs, null);
  // All inputs are "changed" relative to a null baseline
  expect(diff.changedInputs.length).toBe(inputs.length);
});
