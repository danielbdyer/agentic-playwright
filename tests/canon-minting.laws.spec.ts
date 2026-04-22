/**
 * Laws for the canon mint helpers
 * (`product/application/canon/minting.ts`).
 *
 * The mint helpers are the invariant envelope-construction
 * machinery shared by every canon decomposer. This file tests the
 * invariants exactly once, in one place. Per-decomposer test files
 * no longer need to re-assert them.
 *
 * Properties asserted:
 *
 *   - **Determinism**: same producer + same candidate → byte-equal
 *     envelope (including fingerprint).
 *   - **Fingerprint provenance independence**: changing
 *     `producedAt` / `producedBy` / `pipelineVersion` does NOT
 *     change the minted envelope's `inputFingerprint`. This is the
 *     load-bearing property that lets migration scripts re-run
 *     safely without triggering spurious promotion events.
 *   - **Fingerprint source independence (interop contract)**: two
 *     mint invocations with the same content but different
 *     `PhaseOutputSource` values produce byte-equal fingerprints.
 *     This is the cold-start ↔ warm-start interop contract from
 *     `docs/canon-and-derivation.md` § 8.1 at the atom level.
 *   - **Fingerprint content sensitivity**: changing the address OR
 *     the content changes the fingerprint.
 *   - **Atom class consistency**: the minted atom's `class` field
 *     equals its `address.class` field.
 *   - **Composition sub-type consistency**: the minted composition's
 *     `subType` field equals its `address.subType` field.
 *   - **Address preservation**: the minted envelope's `address` is
 *     byte-equal to the candidate's `address`.
 *   - **Content preservation**: the minted envelope's `content` is
 *     byte-equal to the candidate's `content`.
 *   - **Source threading**: the minted envelope's `source` field
 *     equals the producer's `source`.
 *   - **Provenance threading**: producedBy / producedAt /
 *     pipelineVersion / inputs flow through from the producer and
 *     candidate into the envelope.
 *   - **Composition atomReferences are part of the fingerprint**:
 *     two compositions with identical content but different
 *     atomReferences produce different fingerprints.
 *   - **Batch mint is equivalent to map-then-mint**: `mintAtoms`
 *     and `mintCompositions` produce output identical to mapping
 *     `mintAtom` / `mintComposition` over the candidate array.
 *   - **`producerFrom` projection**: extracts the four producer
 *     fields from any compatible input shape without mutation.
 *   - **JSON-parity from `stableStringify` propagates**: explicit
 *     `undefined` fields and structural absence produce the same
 *     fingerprint (the fix from the prior commit cascades to every
 *     mint call site).
 */

import { expect, test } from '@playwright/test';

import {
  mintAtom,
  mintAtoms,
  mintComposition,
  mintCompositions,
  producerFrom,
  type CanonProducer,
  type AtomCandidate,
  type CompositionCandidate,
} from '../product/application/canon/minting';
import type { ElementAtomAddress, RouteAtomAddress } from '../product/domain/pipeline/atom-address';
import type { RouteGraphCompositionAddress } from '../product/domain/pipeline/composition-address';
import type { AtomReference } from '../product/domain/pipeline/composition';
import { isAtomAddressConsistent } from '../product/domain/pipeline/atom';
import { isCompositionAddressConsistent } from '../product/domain/pipeline/composition';
import type { PhaseOutputSource } from '../product/domain/pipeline/source';
import { brandString } from '../product/domain/kernel/brand';

// ─── Fixtures ────────────────────────────────────────────────────

function makeProducer(
  overrides: Partial<CanonProducer<PhaseOutputSource>> = {},
): CanonProducer<PhaseOutputSource> {
  return {
    source: 'agentic-override' as PhaseOutputSource,
    producedBy: 'canon-minting:test:v1',
    producedAt: '2026-04-09T00:00:00.000Z',
    pipelineVersion: 'sha-test',
    ...overrides,
  };
}

type ElementContent = {
  readonly role: string;
  readonly name: string;
  readonly testId: string;
};

function makeElementAddress(
  screen: string = 'policy-search',
  element: string = 'policyNumberInput',
): ElementAtomAddress {
  return {
    class: 'element',
    screen: brandString<'ScreenId'>(screen),
    element: brandString<'ElementId'>(element),
  };
}

function makeAtomCandidate(
  overrides: Partial<AtomCandidate<'element', ElementContent>> = {},
): AtomCandidate<'element', ElementContent> {
  return {
    address: makeElementAddress(),
    content: { role: 'textbox', name: 'Policy Number', testId: 'policy-number-input' },
    inputs: ['screen-elements:policy-search'],
    ...overrides,
  };
}

function makeRouteGraphAddress(
  app: string = 'demo',
): RouteGraphCompositionAddress {
  return {
    subType: 'route-graph',
    id: brandString<'RouteGraphId'>(app),
  };
}

type RouteGraphContent = { readonly app: string; readonly baseUrl: string };

function makeRouteAtomReference(id: string = 'policy-search'): AtomReference {
  const address: RouteAtomAddress = { class: 'route', id: brandString<'RouteId'>(id) };
  return { address, role: 'member', order: 0 };
}

function makeCompositionCandidate(
  overrides: Partial<CompositionCandidate<'route-graph', RouteGraphContent>> = {},
): CompositionCandidate<'route-graph', RouteGraphContent> {
  return {
    address: makeRouteGraphAddress(),
    content: { app: 'demo', baseUrl: 'fixtures/synthetic-substrate' },
    atomReferences: [makeRouteAtomReference('policy-search')],
    inputs: ['route-knowledge:demo'],
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════
// producerFrom projection
// ════════════════════════════════════════════════════════════════

test('producerFrom extracts the four producer fields from a compatible input', () => {
  const input = {
    content: { anything: 'goes' },
    source: 'cold-derivation' as PhaseOutputSource,
    producedBy: 'canon-decomposer:test:v42',
    producedAt: '2030-01-01T00:00:00.000Z',
    pipelineVersion: 'sha-abc123',
  };
  const producer = producerFrom(input);
  expect(producer).toEqual({
    source: 'cold-derivation',
    producedBy: 'canon-decomposer:test:v42',
    producedAt: '2030-01-01T00:00:00.000Z',
    pipelineVersion: 'sha-abc123',
  });
});

test('producerFrom does not mutate the source input', () => {
  const input = {
    content: { x: 1 },
    source: 'agentic-override' as PhaseOutputSource,
    producedBy: 'p',
    producedAt: '2026-04-09T00:00:00.000Z',
    pipelineVersion: 'v',
  };
  const snapshot = JSON.parse(JSON.stringify(input));
  producerFrom(input);
  expect(input).toEqual(snapshot);
});

test('producerFrom handles optional pipelineVersion correctly', () => {
  const input = {
    source: 'agentic-override' as PhaseOutputSource,
    producedBy: 'p',
    producedAt: '2026-04-09T00:00:00.000Z',
  };
  const producer = producerFrom(input);
  expect(producer.pipelineVersion).toBeUndefined();
});

// ════════════════════════════════════════════════════════════════
// mintAtom — core invariants
// ════════════════════════════════════════════════════════════════

test('mintAtom is deterministic for the same (producer, candidate)', () => {
  const producer = makeProducer();
  const candidate = makeAtomCandidate();
  const a = mintAtom(producer, candidate);
  const b = mintAtom(producer, candidate);
  expect(a).toEqual(b);
  expect(a.inputFingerprint).toBe(b.inputFingerprint);
});

test('mintAtom address is byte-equal to the candidate address', () => {
  const candidate = makeAtomCandidate();
  const minted = mintAtom(makeProducer(), candidate);
  expect(minted.address).toEqual(candidate.address);
});

test('mintAtom content is byte-equal to the candidate content', () => {
  const candidate = makeAtomCandidate();
  const minted = mintAtom(makeProducer(), candidate);
  expect(minted.content).toEqual(candidate.content);
});

test('mintAtom class equals address.class (isAtomAddressConsistent)', () => {
  const minted = mintAtom(makeProducer(), makeAtomCandidate());
  expect(minted.class).toBe('element');
  expect(minted.address.class).toBe('element');
  expect(isAtomAddressConsistent(minted)).toBe(true);
});

test('mintAtom source is threaded from the producer', () => {
  const sources: readonly PhaseOutputSource[] = [
    'operator-override',
    'agentic-override',
    'deterministic-observation',
    'live-derivation',
    'cold-derivation',
  ];
  for (const source of sources) {
    const minted = mintAtom(makeProducer({ source }), makeAtomCandidate());
    expect(minted.source).toBe(source);
  }
});

test('mintAtom provenance threads producedBy / producedAt / pipelineVersion / inputs', () => {
  const minted = mintAtom(
    makeProducer({
      producedBy: 'canon-decomposer:specific:v9',
      producedAt: '2030-12-31T23:59:59.999Z',
      pipelineVersion: 'sha-feedface',
    }),
    makeAtomCandidate({ inputs: ['screen-elements:x', 'extra-ref'] }),
  );
  expect(minted.provenance.producedBy).toBe('canon-decomposer:specific:v9');
  expect(minted.provenance.producedAt).toBe('2030-12-31T23:59:59.999Z');
  expect(minted.provenance.pipelineVersion).toBe('sha-feedface');
  expect(minted.provenance.inputs).toEqual(['screen-elements:x', 'extra-ref']);
});

test('mintAtom qualityScore is threaded from the candidate when present', () => {
  const minted = mintAtom(
    makeProducer(),
    makeAtomCandidate({ qualityScore: 0.87 }),
  );
  expect(minted.qualityScore).toBe(0.87);
});

test('mintAtom does not mutate the candidate', () => {
  const candidate = makeAtomCandidate();
  const snapshot = JSON.parse(JSON.stringify(candidate));
  mintAtom(makeProducer(), candidate);
  expect(candidate).toEqual(snapshot);
});

// ════════════════════════════════════════════════════════════════
// mintAtom — fingerprint invariants (load-bearing)
// ════════════════════════════════════════════════════════════════

test('mintAtom inputFingerprint is independent of producedAt', () => {
  const candidate = makeAtomCandidate();
  const a = mintAtom(makeProducer({ producedAt: '2026-04-09T00:00:00.000Z' }), candidate);
  const b = mintAtom(makeProducer({ producedAt: '2030-12-31T23:59:59.999Z' }), candidate);
  expect(a.inputFingerprint).toBe(b.inputFingerprint);
});

test('mintAtom inputFingerprint is independent of producedBy', () => {
  const candidate = makeAtomCandidate();
  const a = mintAtom(makeProducer({ producedBy: 'p1' }), candidate);
  const b = mintAtom(makeProducer({ producedBy: 'p2' }), candidate);
  expect(a.inputFingerprint).toBe(b.inputFingerprint);
});

test('mintAtom inputFingerprint is independent of pipelineVersion', () => {
  const candidate = makeAtomCandidate();
  const a = mintAtom(makeProducer({ pipelineVersion: 'sha-a' }), candidate);
  const b = mintAtom(makeProducer({ pipelineVersion: 'sha-b' }), candidate);
  expect(a.inputFingerprint).toBe(b.inputFingerprint);
});

test('mintAtom inputFingerprint is INDEPENDENT of PhaseOutputSource (interop contract)', () => {
  // The load-bearing cold-start <-> warm-start interop property
  // from docs/canon-and-derivation.md § 8.1. Warm-path and
  // cold-path invocations with identical content MUST produce
  // byte-equal fingerprints so the promotion gate can recognize
  // them as equivalent.
  const candidate = makeAtomCandidate();
  const warm = mintAtom(makeProducer({ source: 'agentic-override' }), candidate);
  const cold = mintAtom(makeProducer({ source: 'cold-derivation' }), candidate);
  expect(warm.inputFingerprint).toBe(cold.inputFingerprint);
});

test('mintAtom inputFingerprint is INDEPENDENT of inputs array (inputs are not content)', () => {
  // The `inputs` list is demotion-cascade metadata — it describes
  // upstream dependencies, not content. Two atoms with the same
  // address and content but different upstream attribution must
  // fingerprint identically, so refactoring the upstream tagging
  // scheme does not invalidate existing canon.
  const a = mintAtom(makeProducer(), makeAtomCandidate({ inputs: ['x'] }));
  const b = mintAtom(makeProducer(), makeAtomCandidate({ inputs: ['y', 'z'] }));
  expect(a.inputFingerprint).toBe(b.inputFingerprint);
});

test('mintAtom inputFingerprint CHANGES when content changes', () => {
  const baseline = mintAtom(makeProducer(), makeAtomCandidate());
  const mutated = mintAtom(
    makeProducer(),
    makeAtomCandidate({
      content: { role: 'button', name: 'Different', testId: 'different' },
    }),
  );
  expect(baseline.inputFingerprint).not.toBe(mutated.inputFingerprint);
});

test('mintAtom inputFingerprint CHANGES when address changes', () => {
  const baseline = mintAtom(makeProducer(), makeAtomCandidate());
  const mutated = mintAtom(
    makeProducer(),
    makeAtomCandidate({
      address: makeElementAddress('different-screen', 'different-element'),
    }),
  );
  expect(baseline.inputFingerprint).not.toBe(mutated.inputFingerprint);
});

test('mintAtom inputFingerprint is stable across explicit-undefined vs structural-absence', () => {
  // The stableStringify JSON-parity fix cascades to mintAtom: two
  // candidates with semantically-equivalent content but one using
  // explicit undefined fields and the other omitting them must
  // fingerprint identically.
  const explicit = mintAtom(
    makeProducer(),
    {
      address: makeElementAddress(),
      content: {
        role: 'textbox',
        name: 'Policy Number',
        testId: 'policy-number-input',
        affordance: undefined,
        cssFallback: undefined,
      } as ElementContent,
      inputs: ['screen-elements:policy-search'],
    },
  );
  const absent = mintAtom(
    makeProducer(),
    {
      address: makeElementAddress(),
      content: {
        role: 'textbox',
        name: 'Policy Number',
        testId: 'policy-number-input',
      } as ElementContent,
      inputs: ['screen-elements:policy-search'],
    },
  );
  expect(explicit.inputFingerprint).toBe(absent.inputFingerprint);
});

// ════════════════════════════════════════════════════════════════
// mintComposition — core invariants
// ════════════════════════════════════════════════════════════════

test('mintComposition is deterministic for the same (producer, candidate)', () => {
  const producer = makeProducer();
  const candidate = makeCompositionCandidate();
  const a = mintComposition(producer, candidate);
  const b = mintComposition(producer, candidate);
  expect(a).toEqual(b);
  expect(a.inputFingerprint).toBe(b.inputFingerprint);
});

test('mintComposition subType equals address.subType', () => {
  const minted = mintComposition(makeProducer(), makeCompositionCandidate());
  expect(minted.subType).toBe('route-graph');
  expect(minted.address.subType).toBe('route-graph');
  expect(isCompositionAddressConsistent(minted)).toBe(true);
});

test('mintComposition address and content and atomReferences are byte-equal to candidate', () => {
  const candidate = makeCompositionCandidate();
  const minted = mintComposition(makeProducer(), candidate);
  expect(minted.address).toEqual(candidate.address);
  expect(minted.content).toEqual(candidate.content);
  expect(minted.atomReferences).toEqual(candidate.atomReferences);
});

test('mintComposition source and provenance are threaded from the producer', () => {
  const minted = mintComposition(
    makeProducer({
      source: 'deterministic-observation',
      producedBy: 'canon-decomposer:route-knowledge:v9',
      producedAt: '2030-01-01T00:00:00.000Z',
      pipelineVersion: 'sha-baadf00d',
    }),
    makeCompositionCandidate({ inputs: ['route-knowledge:demo'] }),
  );
  expect(minted.source).toBe('deterministic-observation');
  expect(minted.provenance.producedBy).toBe('canon-decomposer:route-knowledge:v9');
  expect(minted.provenance.producedAt).toBe('2030-01-01T00:00:00.000Z');
  expect(minted.provenance.pipelineVersion).toBe('sha-baadf00d');
  expect(minted.provenance.inputs).toEqual(['route-knowledge:demo']);
});

// ════════════════════════════════════════════════════════════════
// mintComposition — fingerprint invariants
// ════════════════════════════════════════════════════════════════

test('mintComposition inputFingerprint is independent of producer metadata', () => {
  const candidate = makeCompositionCandidate();
  const a = mintComposition(
    makeProducer({
      producedAt: '2026-04-09T00:00:00.000Z',
      producedBy: 'p1',
      pipelineVersion: 'v1',
      source: 'agentic-override',
    }),
    candidate,
  );
  const b = mintComposition(
    makeProducer({
      producedAt: '2030-12-31T23:59:59.999Z',
      producedBy: 'p2',
      pipelineVersion: 'v2',
      source: 'cold-derivation',
    }),
    candidate,
  );
  expect(a.inputFingerprint).toBe(b.inputFingerprint);
});

test('mintComposition inputFingerprint CHANGES when atomReferences change', () => {
  const baseline = mintComposition(
    makeProducer(),
    makeCompositionCandidate({
      atomReferences: [makeRouteAtomReference('policy-search')],
    }),
  );
  const extra = mintComposition(
    makeProducer(),
    makeCompositionCandidate({
      atomReferences: [
        makeRouteAtomReference('policy-search'),
        makeRouteAtomReference('policy-detail'),
      ],
    }),
  );
  expect(baseline.inputFingerprint).not.toBe(extra.inputFingerprint);
});

test('mintComposition inputFingerprint CHANGES when content changes', () => {
  const baseline = mintComposition(makeProducer(), makeCompositionCandidate());
  const mutated = mintComposition(
    makeProducer(),
    makeCompositionCandidate({
      content: { app: 'different-app', baseUrl: 'somewhere-else' },
    }),
  );
  expect(baseline.inputFingerprint).not.toBe(mutated.inputFingerprint);
});

test('mintComposition inputFingerprint CHANGES when address identity changes', () => {
  const baseline = mintComposition(makeProducer(), makeCompositionCandidate());
  const mutated = mintComposition(
    makeProducer(),
    makeCompositionCandidate({
      address: makeRouteGraphAddress('different-app'),
    }),
  );
  expect(baseline.inputFingerprint).not.toBe(mutated.inputFingerprint);
});

// ════════════════════════════════════════════════════════════════
// Batch helpers
// ════════════════════════════════════════════════════════════════

test('mintAtoms is equivalent to mapping mintAtom over the candidate array', () => {
  const producer = makeProducer();
  const candidates: ReadonlyArray<AtomCandidate<'element', ElementContent>> = [
    makeAtomCandidate(),
    makeAtomCandidate({ address: makeElementAddress('s2', 'e2') }),
    makeAtomCandidate({
      address: makeElementAddress('s3', 'e3'),
      content: { role: 'button', name: 'Go', testId: 'go-btn' },
    }),
  ];
  const batched = mintAtoms(producer, candidates);
  const manual = candidates.map((c) => mintAtom(producer, c));
  expect(batched).toEqual(manual);
});

test('mintCompositions is equivalent to mapping mintComposition over the candidate array', () => {
  const producer = makeProducer();
  const candidates: ReadonlyArray<
    CompositionCandidate<'route-graph', RouteGraphContent>
  > = [
    makeCompositionCandidate(),
    makeCompositionCandidate({
      address: makeRouteGraphAddress('app-2'),
      content: { app: 'app-2', baseUrl: '/2' },
    }),
  ];
  const batched = mintCompositions(producer, candidates);
  const manual = candidates.map((c) => mintComposition(producer, c));
  expect(batched).toEqual(manual);
});

test('mintAtoms([]) returns an empty readonly array', () => {
  expect(mintAtoms(makeProducer(), [])).toEqual([]);
});

test('mintCompositions([]) returns an empty readonly array', () => {
  expect(mintCompositions(makeProducer(), [])).toEqual([]);
});
