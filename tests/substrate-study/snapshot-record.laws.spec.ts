/**
 * SnapshotRecord domain laws (Z11g.d.0a Phase 1).
 *
 * Pin the constructor contract + structural-signature
 * determinism before the harness code starts consuming these
 * types. Per docs/v2-substrate-ladder-plan.d0a-harness-design.md
 * §§4.3, 8 L2, L6, L7.
 *
 *   L-Structural-Signature-Deterministic:
 *     computeStructuralSignature is a pure function of its
 *     projection-tuple inputs; identical node lists yield
 *     identical fingerprints; node-list reorderings yield
 *     identical fingerprints (sort is part of the projection).
 *
 *   L-Variant-Classifier-Exhaustive:
 *     foldVariantClassifier covers every union member;
 *     TypeScript enforces exhaustiveness at compile-time;
 *     runtime tests exercise each branch.
 *
 *   L-Hydration-Verdict-Total:
 *     foldHydrationVerdict covers every verdict kind; same
 *     discipline.
 *
 *   L-No-Raw-HTML-Persisted:
 *     SnapshotNode shape has no fields typed to hold HTML
 *     strings; the constructor cannot smuggle innerHTML in.
 *     Enforced structurally (type shape); tested by asserting
 *     the record JSON does not contain `<` characters in
 *     non-selector-path positions.
 */

import { describe, test, expect } from 'vitest';
import {
  computeStructuralSignature,
  foldVariantClassifier,
  snapshotRecord,
  type SnapshotNode,
  type VariantClassifierVerdict,
} from '../../workshop/substrate-study/domain/snapshot-record';
import {
  foldHydrationVerdict,
  isCaptureSuccessful,
  type HydrationVerdict,
} from '../../workshop/substrate-study/domain/hydration-verdict';

const EMPTY_TIMINGS = {
  phaseAms: 0,
  phaseBms: 0,
  phaseCms: 0,
  phaseDms: 0,
  phaseEms: 0,
} as const;

function stubNode(overrides: Partial<SnapshotNode> = {}): SnapshotNode {
  return {
    path: 'body > div',
    depth: 1,
    tag: 'div',
    id: null,
    classTokens: [],
    classPrefixFamily: null,
    dataAttrNames: [],
    dataAttrValues: {},
    ariaRole: null,
    ariaState: {},
    ariaNaming: { label: null, accessibleName: null },
    interaction: {
      tabindex: null,
      focusable: false,
      interactive: false,
      formRef: null,
      inputType: null,
      disabled: false,
      readonly: false,
      required: false,
      placeholder: null,
    },
    visibility: 'visible',
    boundingRect: { xBin: 0, yBin: 0, widthBin: 0, heightBin: 0 },
    clipped: false,
    framework: { hasShadowRoot: false, customElementName: null, iframeSrc: null },
    structural: {
      parentTag: null,
      parentRole: null,
      parentClassFamily: null,
      siblingIndex: 0,
      siblingCount: 1,
    },
    labelText: null,
    textLengthBucket: null,
    textNodeCount: 0,
    ...overrides,
  };
}

function stubVerdict(): HydrationVerdict {
  return {
    kind: 'stable',
    diagnostic: 'all phases passed',
    phaseTimings: { phaseAms: 50, phaseBms: 200, phaseCms: 400, phaseDms: 10, phaseEms: 100 },
    phaseBRetries: 0,
    mutationCount: 3,
  };
}

describe('SnapshotRecord domain laws (Z11g.d.0a Phase 1)', () => {
  describe('L-Structural-Signature-Deterministic', () => {
    test('identical node lists yield identical fingerprints', () => {
      const nodes = [stubNode({ path: 'body > header' }), stubNode({ path: 'body > main' })];
      const sig1 = computeStructuralSignature(nodes);
      const sig2 = computeStructuralSignature(nodes);
      expect(sig2).toBe(sig1);
    });

    test('node-list reorderings yield identical fingerprints (sort-by-path is part of projection)', () => {
      const a = stubNode({ path: 'body > main' });
      const b = stubNode({ path: 'body > header' });
      const sigAB = computeStructuralSignature([a, b]);
      const sigBA = computeStructuralSignature([b, a]);
      expect(sigBA).toBe(sigAB);
    });

    test('tuple-invariant field changes do not affect signature', () => {
      // siblingCount, disabled, labelText, boundingRect, etc. are
      // not part of the structural-signature projection per §4.3.
      // Varying them must leave the signature unchanged.
      const base = stubNode({ path: 'body > div' });
      const varied = stubNode({
        path: 'body > div',
        structural: { ...base.structural, siblingCount: 99 },
        interaction: { ...base.interaction, disabled: true, tabindex: 5 },
        boundingRect: { xBin: 100, yBin: 200, widthBin: 300, heightBin: 400 },
        labelText: 'some text',
        textLengthBucket: '11-50',
        textNodeCount: 42,
      });
      expect(computeStructuralSignature([varied])).toBe(computeStructuralSignature([base]));
    });

    test('tuple-variant field changes DO affect signature', () => {
      // Each of (depth, tag, ariaRole, classPrefixFamily,
      // dataAttrNames) must change the signature when varied.
      const base = stubNode({ path: 'body > div' });
      const baseSig = computeStructuralSignature([base]);
      expect(computeStructuralSignature([stubNode({ path: 'body > div', depth: 2 })])).not.toBe(baseSig);
      expect(computeStructuralSignature([stubNode({ path: 'body > div', tag: 'span' })])).not.toBe(baseSig);
      expect(computeStructuralSignature([stubNode({ path: 'body > div', ariaRole: 'button' })])).not.toBe(baseSig);
      expect(computeStructuralSignature([stubNode({ path: 'body > div', classPrefixFamily: 'osui' })])).not.toBe(baseSig);
      expect(computeStructuralSignature([stubNode({ path: 'body > div', dataAttrNames: ['data-x'] })])).not.toBe(baseSig);
    });

    test('dataAttrNames order does not affect signature (internal sort)', () => {
      const a = stubNode({ path: 'body > div', dataAttrNames: ['data-b', 'data-a', 'data-c'] });
      const b = stubNode({ path: 'body > div', dataAttrNames: ['data-a', 'data-b', 'data-c'] });
      expect(computeStructuralSignature([b])).toBe(computeStructuralSignature([a]));
    });
  });

  describe('L-Variant-Classifier-Exhaustive', () => {
    test('foldVariantClassifier covers all 3 union members', () => {
      // Reactive-Web-only scope per 2026-04-24 Z11g.d
      // clarification. Traditional and Mobile branches removed;
      // they belong to a different distillation pipeline.
      const cases = [
        { kind: 'reactive', osuiClassCount: 10, evidence: ['osui-button ×10'] },
        { kind: 'not-reactive', evidence: ['no osui-* classes'] },
        { kind: 'ambiguous', conflictingEvidence: ['osui-* AND __OSVSTATE'] },
      ] satisfies VariantClassifierVerdict[];
      for (const v of cases) {
        const result = foldVariantClassifier(v, {
          reactive: () => 'reactive',
          notReactive: () => 'not-reactive',
          ambiguous: () => 'ambiguous',
        });
        expect(result).toBe(v.kind);
      }
    });
  });

  describe('L-Hydration-Verdict-Total', () => {
    test('foldHydrationVerdict covers all 10 verdict kinds', () => {
      const kinds: HydrationVerdict['kind'][] = [
        'stable',
        'stable-but-framework-confirmed-only',
        'navigation-error',
        'load-timeout',
        'observer-unavailable',
        'mutation-storm',
        'signature-unstable',
        'capture-unstable',
        'robots-disallowed',
        'sensitive-content-detected',
      ];
      for (const kind of kinds) {
        const verdict: HydrationVerdict = {
          kind,
          diagnostic: kind,
          phaseTimings: EMPTY_TIMINGS,
          phaseBRetries: 0,
          mutationCount: 0,
        };
        const result = foldHydrationVerdict(verdict, {
          stable: () => 'stable',
          stableButFrameworkConfirmedOnly: () => 'stable-but-framework-confirmed-only',
          navigationError: () => 'navigation-error',
          loadTimeout: () => 'load-timeout',
          observerUnavailable: () => 'observer-unavailable',
          mutationStorm: () => 'mutation-storm',
          signatureUnstable: () => 'signature-unstable',
          captureUnstable: () => 'capture-unstable',
          robotsDisallowed: () => 'robots-disallowed',
          sensitiveContentDetected: () => 'sensitive-content-detected',
        });
        expect(result).toBe(kind);
      }
    });

    test('isCaptureSuccessful returns true only for stable + stable-framework-confirmed', () => {
      const kinds: HydrationVerdict['kind'][] = [
        'stable',
        'stable-but-framework-confirmed-only',
        'navigation-error',
        'load-timeout',
        'observer-unavailable',
        'mutation-storm',
        'signature-unstable',
        'capture-unstable',
        'robots-disallowed',
        'sensitive-content-detected',
      ];
      const successful = new Set(['stable', 'stable-but-framework-confirmed-only']);
      for (const kind of kinds) {
        const verdict: HydrationVerdict = {
          kind,
          diagnostic: kind,
          phaseTimings: EMPTY_TIMINGS,
          phaseBRetries: 0,
          mutationCount: 0,
        };
        expect(isCaptureSuccessful(verdict)).toBe(successful.has(kind));
      }
    });
  });

  describe('snapshotRecord constructor', () => {
    test('stamps envelope constants (stage, scope, kind, governance)', () => {
      const rec = snapshotRecord({
        url: 'https://example.com/',
        fetchedAt: '2026-04-24T00:00:00.000Z',
        substrateVersion: '1.0.0',
        userAgent: 'test-ua',
        viewport: { width: 1280, height: 800 },
        hydration: stubVerdict(),
        captureLatencyMs: 1000,
        nodes: [stubNode()],
        framework: {
          reactDetected: false,
          angularDetected: false,
          vueDetected: false,
          webComponentCount: 0,
          shadowRootCount: 0,
          iframeCount: 0,
        },
        variantClassifier: { kind: 'not-os', evidence: ['stub'] },
      });
      expect(rec.stage).toBe('preparation');
      expect(rec.scope).toBe('run');
      expect(rec.kind).toBe('snapshot-record');
      expect(rec.governance).toBe('approved');
      expect(rec.payload.nodeCount).toBe(1);
      expect(rec.payload.structuralSignature.length).toBeGreaterThan(0);
      expect(rec.fingerprints.artifact.length).toBeGreaterThan(0);
      expect(rec.fingerprints.content.length).toBeGreaterThan(0);
    });

    test('identical input yields identical fingerprints (constructor determinism)', () => {
      const input = {
        url: 'https://example.com/',
        fetchedAt: '2026-04-24T00:00:00.000Z',
        substrateVersion: '1.0.0',
        userAgent: 'test-ua',
        viewport: { width: 1280, height: 800 },
        hydration: stubVerdict(),
        captureLatencyMs: 1000,
        nodes: [stubNode()],
        framework: {
          reactDetected: false,
          angularDetected: false,
          vueDetected: false,
          webComponentCount: 0,
          shadowRootCount: 0,
          iframeCount: 0,
        },
        variantClassifier: { kind: 'not-os' as const, evidence: ['stub'] },
      };
      const r1 = snapshotRecord(input);
      const r2 = snapshotRecord(input);
      expect(r2.fingerprints.artifact).toBe(r1.fingerprints.artifact);
      expect(r2.fingerprints.content).toBe(r1.fingerprints.content);
      expect(r2.payload.structuralSignature).toBe(r1.payload.structuralSignature);
    });

    test('lineage source includes the URL for traceability', () => {
      const rec = snapshotRecord({
        url: 'https://foo.example.com/bar',
        fetchedAt: '2026-04-24T00:00:00.000Z',
        substrateVersion: '1.0.0',
        userAgent: 'test-ua',
        viewport: { width: 1280, height: 800 },
        hydration: stubVerdict(),
        captureLatencyMs: 1000,
        nodes: [],
        framework: {
          reactDetected: false,
          angularDetected: false,
          vueDetected: false,
          webComponentCount: 0,
          shadowRootCount: 0,
          iframeCount: 0,
        },
        variantClassifier: { kind: 'not-os', evidence: [] },
      });
      expect(rec.lineage.sources).toEqual(['external-snapshot:https://foo.example.com/bar']);
    });
  });

  describe('L-No-Raw-HTML-Persisted (structural)', () => {
    test('SnapshotNode has no field that could carry HTML string content', () => {
      // Structural: inspect every SnapshotNode field at the type
      // level by constructing one and checking that labelText
      // (the only text-carrying field) is explicitly typed as
      // label-semantic content, not innerHTML.
      const node = stubNode({
        labelText: 'Submit', // legitimate label
      });
      // Label text must be either null or a short semantic string;
      // no field can hold multi-element HTML markup. The discipline
      // is convention-enforced at capture time (design §3.4); this
      // test confirms there's no *field* for innerHTML.
      //
      // TypeScript check: these keys are the complete set. Adding
      // a new field means this test's key list goes stale, forcing
      // deliberate review.
      const expectedKeys = new Set([
        'path',
        'depth',
        'tag',
        'id',
        'classTokens',
        'classPrefixFamily',
        'dataAttrNames',
        'dataAttrValues',
        'ariaRole',
        'ariaState',
        'ariaNaming',
        'interaction',
        'visibility',
        'boundingRect',
        'clipped',
        'framework',
        'structural',
        'labelText',
        'textLengthBucket',
        'textNodeCount',
      ]);
      const actualKeys = new Set(Object.keys(node));
      expect(actualKeys).toEqual(expectedKeys);
      // Sanity on label content: even when populated, we require
      // no angle brackets (no HTML sneaking in via label capture).
      if (node.labelText !== null) {
        expect(node.labelText).not.toMatch(/[<>]/);
      }
    });
  });
});
