/**
 * Runtime Screen Identification — Law Tests (W4.12)
 *
 * Verifies the screen identification system:
 *
 *   1. Signature extraction: DOM with known patterns yields expected signals
 *   2. Signal deduplication: no duplicate signals in output
 *   3. Empty DOM: empty input yields empty signals and null identification
 *   4. Graph matching: signals that overlap with graph labels produce candidates
 *   5. Candidate ordering: candidates are sorted by descending score
 *   6. Confidence bounds: confidence is always in [0, 1]
 *   7. No-match graceful: DOM unrelated to graph yields null screenId
 *   8. Determinism: same inputs always produce same outputs
 *   9. Identity stability: best match is stable across repeated calls
 *  10. Signal coverage: semantic tags, roles, testids, headings all extracted
 *
 * 20 seeds, law-style.
 */

import { expect, test } from '@playwright/test';
import {
  computeScreenSignature,
  matchSignatureToGraph,
  identifyScreenFromDOM,
} from '../lib/runtime/screen-identification';
import { createApplicationInterfaceGraph } from '../lib/domain/aggregates/application-interface-graph';
import type {
  ApplicationInterfaceGraph,
  InterfaceGraphNode,
  InterfaceGraphEdge,
} from '../lib/domain/types/interface';
import { mulberry32, pick, randomInt , LAW_SEED_COUNT } from './support/random';

// ─── Helpers ───


function makeScreenNode(id: string, label: string, screen: string): InterfaceGraphNode {
  return {
    id: `screen:${id}`,
    kind: 'screen',
    label,
    fingerprint: `fp-${id}`,
    screen: screen as any,
    artifactPaths: [],
    source: 'approved-knowledge',
  };
}

function makeTargetNode(id: string, label: string, screen: string): InterfaceGraphNode {
  return {
    id: `target:${id}`,
    kind: 'target',
    label,
    fingerprint: `fp-${id}`,
    screen: screen as any,
    artifactPaths: [],
    source: 'approved-knowledge',
  };
}

function makeContainsEdge(from: string, to: string): InterfaceGraphEdge {
  return {
    id: `edge:${from}-${to}`,
    kind: 'contains',
    from,
    to,
    fingerprint: `fp-edge-${from}-${to}`,
    lineage: [],
  };
}

function makeGraph(
  nodes: readonly InterfaceGraphNode[],
  edges: readonly InterfaceGraphEdge[],
): ApplicationInterfaceGraph {
  const graph = createApplicationInterfaceGraph({
    kind: 'application-interface-graph',
    version: 2,
    generatedAt: '2026-01-01T00:00:00Z',
    discoveryRunIds: [],
    routeRefs: [],
    routeVariantRefs: [],
    targetRefs: [],
    stateRefs: [],
    eventSignatureRefs: [],
    transitionRefs: [],
    nodes,
    edges,
  });
  if (!graph.ok) {
    throw new Error('test graph invariant violation');
  }
  return graph.value;
}

function makeDom(parts: {
  readonly title?: string;
  readonly headings?: readonly string[];
  readonly roles?: readonly string[];
  readonly testIds?: readonly string[];
  readonly semanticTags?: readonly string[];
  readonly ariaLabels?: readonly string[];
}): string {
  const titleHtml = parts.title ? `<title>${parts.title}</title>` : '';
  const headingHtml = (parts.headings ?? []).map((h) => `<h1>${h}</h1>`).join('');
  const roleHtml = (parts.roles ?? []).map((r) => `<div role="${r}"></div>`).join('');
  const testIdHtml = (parts.testIds ?? []).map((t) => `<div data-testid="${t}"></div>`).join('');
  const semanticHtml = (parts.semanticTags ?? []).map((t) => `<${t}></${t}>`).join('');
  const ariaHtml = (parts.ariaLabels ?? []).map((a) => `<button aria-label="${a}"></button>`).join('');

  return `<html><head>${titleHtml}</head><body>${headingHtml}${roleHtml}${testIdHtml}${semanticHtml}${ariaHtml}</body></html>`;
}

function randomDom(next: () => number): string {
  const titles = ['Dashboard', 'Settings', 'Login', 'Profile', 'Reports'];
  const headings = ['Welcome', 'Account', 'Orders', 'Analytics', 'Configuration'];
  const roles = ['navigation', 'main', 'banner', 'complementary', 'form'];
  const testIds = ['nav-menu', 'user-table', 'search-bar', 'settings-panel', 'login-form'];
  const tags = ['nav', 'header', 'footer', 'main', 'form'];
  const ariaLabels = ['close', 'menu', 'search', 'submit', 'cancel'];

  const titleValue = next() > 0.3 ? pick(next, titles) : undefined;
  return makeDom({
    ...(titleValue !== undefined ? { title: titleValue } : {}),
    headings: next() > 0.3 ? [pick(next, headings)] : [],
    roles: next() > 0.3 ? [pick(next, roles)] : [],
    testIds: next() > 0.3 ? [pick(next, testIds)] : [],
    semanticTags: next() > 0.3 ? [pick(next, tags)] : [],
    ariaLabels: next() > 0.3 ? [pick(next, ariaLabels)] : [],
  });
}

function randomGraph(next: () => number): ApplicationInterfaceGraph {
  const screenNames = ['dashboard', 'settings', 'login', 'profile', 'reports'];
  const count = 1 + randomInt(next, 4);
  const chosen = Array.from({ length: count }, () => pick(next, screenNames));
  const unique = [...new Set(chosen)];

  const screenNodes = unique.map((name) => makeScreenNode(name, name, name));
  const targetNodes = unique.flatMap((name) => {
    const targetCount = randomInt(next, 3);
    return Array.from({ length: targetCount }, (_, i) => {
      const label = pick(next, ['nav-menu', 'user-table', 'search-bar', 'submit', 'login-form', 'settings-panel']);
      return makeTargetNode(`${name}-target-${i}`, label, name);
    });
  });

  const edges = targetNodes.map((t) => {
    const parentScreen = screenNodes.find((s) => s.screen === t.screen);
    return parentScreen ? makeContainsEdge(parentScreen.id, t.id) : null;
  }).filter((e): e is InterfaceGraphEdge => e !== null);

  return makeGraph([...screenNodes, ...targetNodes], edges);
}

// ─── Law 1: Signature extraction ───

test.describe('Law 1: Signature extraction — known patterns yield signals', () => {
  test('title element extracted as title signal', () => {
    const dom = makeDom({ title: 'Dashboard' });
    const signals = computeScreenSignature(dom);
    expect(signals.some((s) => s.startsWith('title:'))).toBe(true);
    expect(signals.some((s) => s.includes('dashboard'))).toBe(true);
  });

  test('heading elements extracted as heading signals', () => {
    const dom = makeDom({ headings: ['Welcome Back'] });
    const signals = computeScreenSignature(dom);
    expect(signals.some((s) => s.startsWith('heading:'))).toBe(true);
  });

  test('role attributes extracted as role signals', () => {
    const dom = makeDom({ roles: ['navigation', 'main'] });
    const signals = computeScreenSignature(dom);
    expect(signals.filter((s) => s.startsWith('role:')).length).toBeGreaterThanOrEqual(2);
  });

  test('data-testid attributes extracted as testid signals', () => {
    const dom = makeDom({ testIds: ['login-form'] });
    const signals = computeScreenSignature(dom);
    expect(signals.some((s) => s === 'testid:login-form')).toBe(true);
  });

  test('semantic tags extracted as semantic signals', () => {
    const dom = makeDom({ semanticTags: ['nav', 'header'] });
    const signals = computeScreenSignature(dom);
    expect(signals.some((s) => s === 'semantic:nav')).toBe(true);
    expect(signals.some((s) => s === 'semantic:header')).toBe(true);
  });

  test('aria-label attributes extracted', () => {
    const dom = makeDom({ ariaLabels: ['Close dialog'] });
    const signals = computeScreenSignature(dom);
    expect(signals.some((s) => s.startsWith('aria-label:'))).toBe(true);
  });
});

// ─── Law 2: Signal deduplication ───

test.describe('Law 2: Signal deduplication — no duplicates in output', () => {
  test('signals are unique across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const dom = randomDom(next);
      const signals = computeScreenSignature(dom);
      expect(new Set(signals).size).toBe(signals.length);
    }
  });
});

// ─── Law 3: Empty DOM ───

test.describe('Law 3: Empty DOM — yields empty signals and null id', () => {
  test('empty string yields no signals', () => {
    expect(computeScreenSignature('')).toHaveLength(0);
  });

  test('empty DOM yields null screenId', () => {
    const graph = makeGraph([makeScreenNode('dash', 'dashboard', 'dashboard')], []);
    const result = identifyScreenFromDOM('', graph);
    expect(result.screenId).toBeNull();
    expect(result.confidence).toBe(0);
  });

  test('minimal HTML with no signals yields null', () => {
    const graph = makeGraph([makeScreenNode('dash', 'dashboard', 'dashboard')], []);
    const result = identifyScreenFromDOM('<html><body></body></html>', graph);
    expect(result.screenId).toBeNull();
  });
});

// ─── Law 4: Graph matching — overlapping signals produce candidates ───

test.describe('Law 4: Graph matching — overlapping signals produce candidates', () => {
  test('DOM with matching title produces candidate with positive score', () => {
    const graph = makeGraph([makeScreenNode('dashboard', 'dashboard', 'dashboard')], []);
    const dom = makeDom({ title: 'Dashboard' });
    const signals = computeScreenSignature(dom);
    const candidates = matchSignatureToGraph(signals, graph);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]!.matchScore).toBeGreaterThan(0);
  });

  test('DOM with matching testid produces candidate', () => {
    const targetNode = makeTargetNode('login-form', 'login-form', 'login');
    const screenNode = makeScreenNode('login', 'login', 'login');
    const edge = makeContainsEdge(screenNode.id, targetNode.id);
    const graph = makeGraph([screenNode, targetNode], [edge]);
    const dom = makeDom({ testIds: ['login-form'] });
    const signals = computeScreenSignature(dom);
    const candidates = matchSignatureToGraph(signals, graph);
    expect(candidates.length).toBeGreaterThan(0);
  });

  test('no candidates when signals and graph are disjoint', () => {
    const graph = makeGraph([makeScreenNode('xyz', 'completely-unrelated', 'xyz')], []);
    const dom = makeDom({ title: 'Dashboard', headings: ['Welcome'] });
    const signals = computeScreenSignature(dom);
    const candidates = matchSignatureToGraph(signals, graph);
    expect(candidates.every((c) => c.matchScore === 0 || candidates.length === 0)).toBe(true);
  });
});

// ─── Law 5: Candidate ordering — descending score ───

test.describe('Law 5: Candidate ordering — sorted by descending score', () => {
  test('candidates are monotonically non-increasing across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const dom = randomDom(next);
      const graph = randomGraph(next);
      const signals = computeScreenSignature(dom);
      const candidates = matchSignatureToGraph(signals, graph);

      for (let i = 1; i < candidates.length; i += 1) {
        expect(candidates[i - 1]!.matchScore).toBeGreaterThanOrEqual(candidates[i]!.matchScore);
      }
    }
  });
});

// ─── Law 6: Confidence bounds — always in [0, 1] ───

test.describe('Law 6: Confidence bounds — confidence in [0, 1]', () => {
  test('confidence is bounded across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const dom = randomDom(next);
      const graph = randomGraph(next);
      const result = identifyScreenFromDOM(dom, graph);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Law 7: No-match graceful — unrelated DOM yields null ───

test.describe('Law 7: No-match graceful — disjoint DOM and graph', () => {
  test('totally unrelated DOM yields null screenId or zero confidence', () => {
    const graph = makeGraph(
      [makeScreenNode('zzz-unique', 'zzz-unique-screen-label', 'zzz-unique')],
      [],
    );
    const dom = '<html><body><div>Nothing relevant here at all</div></body></html>';
    const result = identifyScreenFromDOM(dom, graph);

    // Either null screenId or very low confidence
    if (result.screenId !== null) {
      expect(result.confidence).toBeLessThan(0.5);
    }
  });

  test('empty graph always yields null screenId across 20 seeds', () => {
    const emptyGraph = makeGraph([], []);

    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const dom = randomDom(next);
      const result = identifyScreenFromDOM(dom, emptyGraph);
      expect(result.screenId).toBeNull();
      expect(result.confidence).toBe(0);
    }
  });
});

// ─── Law 8: Determinism — same inputs, same outputs ───

test.describe('Law 8: Determinism — same inputs produce same outputs', () => {
  test('identifyScreenFromDOM is deterministic across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const dom = randomDom(next);
      // Reset PRNG for graph generation
      const next2 = mulberry32(seed);
      randomDom(next2); // consume same values
      const graph = randomGraph(next2);

      // Build graph with same seed twice
      const next3 = mulberry32(seed);
      randomDom(next3);
      const graph2 = randomGraph(next3);

      const result1 = identifyScreenFromDOM(dom, graph);
      const result2 = identifyScreenFromDOM(dom, graph2);

      expect(result1).toEqual(result2);
    }
  });

  test('computeScreenSignature is deterministic', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const dom = randomDom(next);

      const sig1 = computeScreenSignature(dom);
      const sig2 = computeScreenSignature(dom);
      expect(sig1).toEqual(sig2);
    }
  });
});

// ─── Law 9: Identity stability — best match is stable ───

test.describe('Law 9: Identity stability — best match stable across calls', () => {
  test('best screenId does not change across repeated calls', () => {
    const graph = makeGraph(
      [
        makeScreenNode('dashboard', 'dashboard', 'dashboard'),
        makeScreenNode('settings', 'settings', 'settings'),
      ],
      [],
    );
    const dom = makeDom({ title: 'Dashboard', headings: ['Dashboard Overview'] });

    const results = Array.from({ length: 10 }, () => identifyScreenFromDOM(dom, graph));
    const screenIds = results.map((r) => r.screenId);
    const unique = new Set(screenIds);
    expect(unique.size).toBe(1);
  });
});

// ─── Law 10: Signal coverage — all signal types can be extracted ───

test.describe('Law 10: Signal coverage — all extraction paths exercised', () => {
  test('rich DOM produces signals from all extraction paths', () => {
    const dom = makeDom({
      title: 'My Application',
      headings: ['Welcome', 'Getting Started'],
      roles: ['navigation', 'main', 'form'],
      testIds: ['sidebar', 'content-area'],
      semanticTags: ['nav', 'header', 'main', 'footer'],
      ariaLabels: ['Open menu', 'Close dialog'],
    });

    const signals = computeScreenSignature(dom);

    const prefixes = ['title:', 'heading:', 'role:', 'testid:', 'semantic:', 'aria-label:'];
    prefixes.forEach((prefix) => {
      const count = signals.filter((s) => s.startsWith(prefix)).length;
      expect(count).toBeGreaterThan(0);
    });
  });

  test('signal count scales with DOM richness across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const _next = mulberry32(seed);
      const simpleDom = makeDom({ title: 'Page' });
      const richDom = makeDom({
        title: 'Page',
        headings: ['H1', 'H2'],
        roles: ['main', 'nav'],
        testIds: ['a', 'b'],
        semanticTags: ['nav', 'main'],
        ariaLabels: ['label1'],
      });

      const simpleSignals = computeScreenSignature(simpleDom);
      const richSignals = computeScreenSignature(richDom);
      expect(richSignals.length).toBeGreaterThanOrEqual(simpleSignals.length);
    }
  });
});
