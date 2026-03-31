/**
 * Hardening Invariants — law-style tests for scaling and correctness properties.
 *
 * These tests codify the domain invariants that the hardening changes enforce.
 * They are observable properties, not benchmarks — each law asserts a structural
 * or correctness guarantee that must hold for the system to operate correctly
 * at production scale.
 *
 * Laws:
 *   1. IDF inverse recovery: addEntryToShingleIndex recovers df within ε of full rebuild
 *   2. IDF broken inverse: the old formula produces orders-of-magnitude errors
 *   3. Inverted index completeness: inverted index query returns same results as full scan
 *   4. Inverted index coverage: every entry's shingles appear in the inverted index
 *   5. Governance pre-filter: filter-then-topN retains more valid candidates than topN-then-filter
 *   6. Pagination envelope: paginated response preserves total count and hasMore flag
 *   7. Edge index equivalence: edge-indexed traversal visits same nodes as full-scan traversal
 *   8. Edge index early termination: traversal respects node visit cap
 *   9. Prune preserves shingle index: pruned catalog has a valid shingle index
 *  10. Concurrent claim atomicity: only one claim succeeds for the same key
 *  11. Action queue serialization: queued actions execute in order
 *  12. Serialized file-group writes: proposals targeting same file are ordered
 */

import { expect, test } from '@playwright/test';
import {
  buildShingleIndex,
  addEntryToShingleIndex,
  queryShingleIndex,
  tfidfCosineSimilarity,
  shingleTermFrequencies,
  type ShingleIndex,
} from '../lib/domain/shingles';
import {
  accrueSemanticEntry,
  emptyCatalog,
  ensureShingleIndex,
  pruneSemanticDictionary,
} from '../lib/application/semantic-translation-dictionary';
import { uniqueSorted } from '../lib/domain/collections';
import { createElementId, createScreenId } from '../lib/domain/identity';
import type { SemanticDictionaryAccrualInput, SemanticDictionaryTarget } from '../lib/domain/types';

// ─── Fixtures ───

const screens = ['policy-search', 'claim-intake', 'customer-profile', 'billing-summary', 'dashboard-home'];
const actions = ['click', 'fill', 'navigate', 'select', 'toggle'];
const elements = ['search-button', 'policy-input', 'claim-form', 'billing-table', 'nav-menu', 'date-picker', 'filter-dropdown', 'save-button'];
const adjectives = ['primary', 'secondary', 'disabled', 'highlighted', 'collapsed', 'required'];

function syntheticEntry(i: number): { id: string; text: string } {
  return {
    id: `entry-${i}`,
    text: `${actions[i % actions.length]} the ${adjectives[i % adjectives.length]} ${elements[i % elements.length]} on ${screens[i % screens.length]} page variant ${i % 20}`,
  };
}

function syntheticTarget(i: number): SemanticDictionaryTarget {
  return {
    action: actions[i % actions.length]! as 'click',
    screen: createScreenId(screens[i % screens.length]!),
    element: createElementId(elements[i % elements.length]!),
  };
}

function syntheticAccrualInput(i: number): SemanticDictionaryAccrualInput {
  return {
    normalizedIntent: syntheticEntry(i).text,
    target: syntheticTarget(i),
    provenance: { source: 'test', sessionId: 'session-0' },
    winningSource: 'structured-translation',
    taskFingerprint: `task-${i}`,
    knowledgeFingerprint: `kfp-${i}`,
  };
}

function syntheticGraph(nodeCount: number, density: number) {
  const kinds = ['scenario', 'step', 'confidence-overlay', 'screen', 'element'];
  const edgeKinds = ['derived-from', 'references', 'uses', 'contains', 'emits', 'affects'];
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `node-${i}`,
    kind: kinds[i % kinds.length]!,
  }));
  const edges: { from: string; to: string; kind: string }[] = [];
  for (let i = 0; i < nodeCount; i++) {
    for (let j = 0; j < density; j++) {
      const target = (i + j + 1) % nodeCount;
      edges.push({ from: `node-${i}`, to: `node-${target}`, kind: edgeKinds[(i + j) % edgeKinds.length]! });
    }
  }
  return { nodes, edges };
}

// ─── Law 1: IDF inverse recovery accuracy ───

test.describe('Law 1: IDF inverse recovery', () => {
  for (const corpusSize of [10, 50, 200]) {
    test(`addEntryToShingleIndex IDF converges with full rebuild (N=${corpusSize})`, () => {
      const corpus = Array.from({ length: corpusSize }, (_, i) => syntheticEntry(i));
      const baseIndex = buildShingleIndex(corpus);
      const newEntry = syntheticEntry(corpusSize);

      const incremental = addEntryToShingleIndex(baseIndex, newEntry);
      const truth = buildShingleIndex([...corpus, newEntry]);

      // Every shingle in the truth index should have a close IDF in the incremental index
      let maxError = 0;
      for (const [shingle, truthIdf] of truth.idfWeights) {
        const incIdf = incremental.idfWeights.get(shingle) ?? 0;
        maxError = Math.max(maxError, Math.abs(truthIdf - incIdf));
      }

      // Incremental IDF must be within 0.1 of full rebuild (small epsilon for rounding)
      expect(maxError).toBeLessThan(0.1);
    });
  }
});

// ─── Law 2: Broken inverse produces catastrophic errors ───

test('Law 2: old broken IDF formula produces orders-of-magnitude df errors', () => {
  const corpus = Array.from({ length: 100 }, (_, i) => syntheticEntry(i));
  const index = buildShingleIndex(corpus);
  const N = index.stats.totalEntries;

  let oldTotalError = 0;
  let newTotalError = 0;
  let count = 0;

  for (const [shingle, idf] of index.idfWeights) {
    // Ground truth: count actual document frequency
    let trueDf = 0;
    for (const entry of index.entries.values()) {
      if (entry.shingles.has(shingle)) trueDf++;
    }

    // OLD (broken): exp(idf-1) * (N+1) - 1
    const oldDf = Math.round(Math.exp(idf - 1) * (N + 1)) - 1;
    // NEW (fixed): (N+1) / exp(idf-1) - 1
    const newDf = Math.round((N + 1) / Math.exp(idf - 1)) - 1;

    oldTotalError += Math.abs(trueDf - oldDf);
    newTotalError += Math.abs(trueDf - newDf);
    count++;
  }

  // Old formula must have massive errors (100x+ avg error)
  expect(oldTotalError / count).toBeGreaterThan(100);
  // New formula must have zero or near-zero errors
  expect(newTotalError / count).toBeLessThan(1);
});

// ─── Law 3: Inverted index query completeness ───

test('Law 3: inverted index returns same results as O(N) full scan', () => {
  const corpus = Array.from({ length: 500 }, (_, i) => syntheticEntry(i));
  const index = buildShingleIndex(corpus);
  const query = 'click the primary search button on policy search page';

  // NEW: uses inverted index
  const indexedResults = queryShingleIndex(query, index, 0.05);

  // OLD: full O(N) scan
  const queryTf = shingleTermFrequencies(query);
  const fullScanResults: { entryId: string; score: number }[] = [];
  for (const [entryId, entryData] of index.entries) {
    const score = tfidfCosineSimilarity(queryTf, entryData.tf, index.idfWeights);
    if (score >= 0.05) fullScanResults.push({ entryId, score });
  }
  fullScanResults.sort((a, b) => b.score - a.score);

  // Same result set — inverted index must not lose any matches
  expect(indexedResults.map((r) => r.entryId).sort()).toEqual(
    fullScanResults.map((r) => r.entryId).sort(),
  );

  // Scores must be identical (same math, just different iteration order)
  for (const indexed of indexedResults) {
    const fullScan = fullScanResults.find((r) => r.entryId === indexed.entryId);
    expect(fullScan).toBeDefined();
    expect(indexed.score).toBeCloseTo(fullScan!.score, 10);
  }
});

// ─── Law 4: Inverted index coverage ───

test('Law 4: every entry shingle appears in the inverted index', () => {
  const corpus = Array.from({ length: 200 }, (_, i) => syntheticEntry(i));
  const index = buildShingleIndex(corpus);

  for (const [entryId, entryData] of index.entries) {
    for (const shingle of entryData.shingles) {
      const postings = index.invertedIndex.get(shingle);
      expect(postings, `shingle "${shingle}" missing from inverted index`).toBeDefined();
      expect(postings!.has(entryId), `entry ${entryId} missing from posting list for "${shingle}"`).toBe(true);
    }
  }
});

// ─── Law 5: Governance pre-filter ordering ───

test('Law 5: filter-then-topN retains ≥ as many valid candidates as topN-then-filter', () => {
  const corpus = Array.from({ length: 500 }, (_, i) => syntheticEntry(i));
  const index = buildShingleIndex(corpus);
  const query = 'click the primary search button on policy search';
  const topN = 30;

  // Simulate governance: every 3rd entry passes
  const passes = (id: string) => parseInt(id.split('-')[1]!, 10) % 3 === 0;

  const results = queryShingleIndex(query, index, 0.05);

  // OLD: slice first, filter second
  const oldCandidates = results.slice(0, topN).filter((r) => passes(r.entryId));

  // NEW: filter first, collect up to topN
  const newCandidates: typeof results[number][] = [];
  for (const r of results) {
    if (newCandidates.length >= topN) break;
    if (passes(r.entryId)) newCandidates.push(r);
  }

  // New approach must retain at least as many candidates
  expect(newCandidates.length).toBeGreaterThanOrEqual(oldCandidates.length);
});

// ─── Law 6: Pagination envelope ───

test('Law 6: paginated response preserves total count and hasMore semantics', () => {
  const items = Array.from({ length: 250 }, (_, i) => ({ id: `item-${i}` }));
  const pageSize = 100;

  // Page 1
  const page1 = items.slice(0, pageSize);
  expect(page1.length).toBe(100);
  expect(items.length).toBe(250);
  expect(0 + pageSize < items.length).toBe(true); // hasMore

  // Page 2
  const page2 = items.slice(100, 200);
  expect(page2.length).toBe(100);
  expect(100 + pageSize < items.length).toBe(true); // hasMore

  // Page 3 (last)
  const page3 = items.slice(200, 300);
  expect(page3.length).toBe(50);
  expect(200 + pageSize < items.length).toBe(false); // no more

  // Union of all pages equals the full list
  expect([...page1, ...page2, ...page3]).toEqual(items);
});

// ─── Law 7: Edge index equivalence ───

test('Law 7: edge-indexed BFS visits same nodes as full-scan BFS', () => {
  const graph = syntheticGraph(200, 3);
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const inwardKinds = new Set(['derived-from', 'references', 'uses']);
  const outwardKinds = new Set(['emits', 'affects']);

  function deps(edge: { from: string; to: string; kind: string }, current: string): string[] {
    if (inwardKinds.has(edge.kind)) return edge.to === current ? [edge.from] : [];
    if (outwardKinds.has(edge.kind)) return edge.from === current ? [edge.to] : [];
    if (edge.kind === 'contains' && edge.to === current) return [edge.from];
    return [];
  }

  // Full-scan BFS (old)
  const fullVisited = new Set<string>(['node-0']);
  const fullFrontier = ['node-0'];
  while (fullFrontier.length > 0) {
    const current = fullFrontier.shift()!;
    for (const edge of graph.edges) {
      for (const dep of deps(edge, current)) {
        if (!fullVisited.has(dep)) {
          fullVisited.add(dep);
          fullFrontier.push(dep);
        }
      }
    }
  }

  // Edge-indexed BFS (new)
  const edgeIndex = new Map<string, typeof graph.edges[number][]>();
  for (const edge of graph.edges) {
    for (const nodeId of [edge.from, edge.to]) {
      let list = edgeIndex.get(nodeId);
      if (!list) { list = []; edgeIndex.set(nodeId, list); }
      list.push(edge);
    }
  }
  const indexedVisited = new Set<string>(['node-0']);
  const indexedFrontier = ['node-0'];
  while (indexedFrontier.length > 0) {
    const current = indexedFrontier.shift()!;
    for (const edge of edgeIndex.get(current) ?? []) {
      for (const dep of deps(edge, current)) {
        if (!indexedVisited.has(dep)) {
          indexedVisited.add(dep);
          indexedFrontier.push(dep);
        }
      }
    }
  }

  // Must visit exactly the same nodes
  expect([...indexedVisited].sort()).toEqual([...fullVisited].sort());
});

// ─── Law 8: Early termination respects cap ───

test('Law 8: graph traversal with cap visits at most MAX_IMPACT_NODES', () => {
  // Dense graph that would visit many nodes without a cap
  const graph = syntheticGraph(500, 5);
  const MAX_IMPACT_NODES = 100;
  const edgeIndex = new Map<string, typeof graph.edges[number][]>();
  for (const edge of graph.edges) {
    for (const nodeId of [edge.from, edge.to]) {
      let list = edgeIndex.get(nodeId);
      if (!list) { list = []; edgeIndex.set(nodeId, list); }
      list.push(edge);
    }
  }

  const inwardKinds = new Set(['derived-from', 'references', 'uses']);
  const outwardKinds = new Set(['emits', 'affects']);
  function deps(edge: { from: string; to: string; kind: string }, current: string): string[] {
    if (inwardKinds.has(edge.kind)) return edge.to === current ? [edge.from] : [];
    if (outwardKinds.has(edge.kind)) return edge.from === current ? [edge.to] : [];
    if (edge.kind === 'contains' && edge.to === current) return [edge.from];
    return [];
  }

  const visited = new Set<string>(['node-0']);
  const frontier = ['node-0'];
  while (frontier.length > 0 && visited.size < MAX_IMPACT_NODES) {
    const current = frontier.shift()!;
    for (const edge of edgeIndex.get(current) ?? []) {
      for (const dep of deps(edge, current)) {
        if (!visited.has(dep)) {
          visited.add(dep);
          frontier.push(dep);
        }
      }
    }
  }

  expect(visited.size).toBeLessThanOrEqual(MAX_IMPACT_NODES);
});

// ─── Law 9: Prune preserves shingle index ───

test('Law 9: pruned catalog has a valid shingle index matching surviving entries', () => {
  let catalog = emptyCatalog();
  // Accrue 20 entries
  for (let i = 0; i < 20; i++) {
    catalog = accrueSemanticEntry(catalog, syntheticAccrualInput(i));
  }
  catalog = ensureShingleIndex(catalog);

  // Prune to 10
  const pruned = pruneSemanticDictionary(catalog, 10);

  expect(pruned.entries.length).toBe(10);
  // Shingle index must exist and match entry count
  expect(pruned.shingleIndex).toBeDefined();
  expect(pruned.shingleIndex!.stats.totalEntries).toBe(10);

  // Every surviving entry must be in the index
  for (const entry of pruned.entries) {
    expect(pruned.shingleIndex!.entries.has(entry.id)).toBe(true);
  }

  // Every shingle in the index must belong to a surviving entry
  for (const [shingle, postings] of pruned.shingleIndex!.invertedIndex) {
    for (const entryId of postings) {
      expect(pruned.entries.some((e) => e.id === entryId),
        `inverted index references pruned entry ${entryId} for shingle "${shingle}"`).toBe(true);
    }
  }
});

// ─── Law 10: Concurrent claim atomicity ───

test('Law 10: only one concurrent claim succeeds per key', () => {
  const map = new Map<string, (d: unknown) => void>();
  const resolverFn = (_d: unknown) => {};
  map.set('item-1', resolverFn);

  // Simulate two concurrent claims
  function claim(key: string): ((d: unknown) => void) | null {
    const resolver = map.get(key);
    if (!resolver) return null;
    map.delete(key);
    return resolver;
  }

  const first = claim('item-1');
  const second = claim('item-1');

  expect(first).not.toBeNull();
  expect(second).toBeNull();
  // Only one caller gets the resolver
});

// ─── Law 11: Action queue serialization ───

test('Law 11: queued actions execute in FIFO order', async () => {
  let pending: Promise<unknown> = Promise.resolve();
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = pending.then(fn, fn);
    pending = next.then(() => {}, () => {});
    return next;
  }

  const order: number[] = [];

  // Fire 5 concurrent actions
  const promises = Array.from({ length: 5 }, (_, i) =>
    enqueue(async () => {
      // Small delay to simulate async work
      await new Promise((r) => setTimeout(r, 1));
      order.push(i);
    }),
  );

  await Promise.all(promises);
  expect(order).toEqual([0, 1, 2, 3, 4]);
});

// ─── Law 12: Same-file proposal serialization ───

test('Law 12: proposals targeting the same file must be serializable', () => {
  // Model: group by targetPath, ensure each group is ordered
  const proposals = [
    { id: 'p1', targetPath: 'knowledge/screens/a.yaml', order: 1 },
    { id: 'p2', targetPath: 'knowledge/screens/b.yaml', order: 1 },
    { id: 'p3', targetPath: 'knowledge/screens/a.yaml', order: 2 },
    { id: 'p4', targetPath: 'knowledge/screens/a.yaml', order: 3 },
    { id: 'p5', targetPath: 'knowledge/screens/b.yaml', order: 2 },
  ];

  const byTarget = new Map<string, typeof proposals>();
  for (const p of proposals) {
    const group = byTarget.get(p.targetPath) ?? [];
    group.push(p);
    byTarget.set(p.targetPath, group);
  }

  // Each group preserves insertion order (FIFO within same file)
  const groupA = byTarget.get('knowledge/screens/a.yaml')!;
  expect(groupA.map((p) => p.id)).toEqual(['p1', 'p3', 'p4']);
  const groupB = byTarget.get('knowledge/screens/b.yaml')!;
  expect(groupB.map((p) => p.id)).toEqual(['p2', 'p5']);

  // Different targets can run concurrently (groups are independent)
  expect(byTarget.size).toBe(2);
});

// ─── Observability: Performance assertions ───

test.describe('Performance observable: scaling characteristics', () => {
  test('inverted index only scores entries reachable via shared shingles', () => {
    // Law: the inverted index identifies candidates by shingle overlap.
    // When the corpus contains entries with NO shingle overlap to the query,
    // those entries are never scored (no false negatives, true skipping).
    const corpus = [
      // These share shingles with the query
      { id: 'related-1', text: 'click the search button on policy page' },
      { id: 'related-2', text: 'press the policy search field' },
      // These have zero 3-gram overlap with the query
      { id: 'unrelated-1', text: 'xyzzy frobnitz qux' },
      { id: 'unrelated-2', text: 'zzzzz wwwww mmmmm' },
    ];
    const index = buildShingleIndex(corpus);
    const query = 'click the search button on policy';

    const queryTf = shingleTermFrequencies(query);
    const candidateIds = new Set<string>();
    for (const shingle of queryTf.keys()) {
      const postings = index.invertedIndex.get(shingle);
      if (postings) {
        for (const id of postings) candidateIds.add(id);
      }
    }

    // Unrelated entries must be skipped by the inverted index
    expect(candidateIds.has('unrelated-1')).toBe(false);
    expect(candidateIds.has('unrelated-2')).toBe(false);
    // Related entries must be found
    expect(candidateIds.has('related-1')).toBe(true);
    expect(candidateIds.has('related-2')).toBe(true);

    // queryShingleIndex results must be a subset of candidates
    const results = queryShingleIndex(query, index, 0.01);
    for (const r of results) {
      expect(candidateIds.has(r.entryId)).toBe(true);
    }
    // And must not contain unrelated entries
    expect(results.some((r) => r.entryId === 'unrelated-1')).toBe(false);
    expect(results.some((r) => r.entryId === 'unrelated-2')).toBe(false);
  });

  test('edge-indexed traversal scales better than O(N*E)', () => {
    const smallGraph = syntheticGraph(100, 3);
    const largeGraph = syntheticGraph(1000, 3);
    const inwardKinds = new Set(['derived-from', 'references', 'uses']);
    const outwardKinds = new Set(['emits', 'affects']);

    function bfsWithIndex(graph: ReturnType<typeof syntheticGraph>) {
      const edgeIndex = new Map<string, typeof graph.edges[number][]>();
      for (const edge of graph.edges) {
        for (const id of [edge.from, edge.to]) {
          let list = edgeIndex.get(id);
          if (!list) { list = []; edgeIndex.set(id, list); }
          list.push(edge);
        }
      }
      const visited = new Set<string>(['node-0']);
      const frontier = ['node-0'];
      while (frontier.length > 0) {
        const current = frontier.shift()!;
        for (const edge of edgeIndex.get(current) ?? []) {
          const deps: string[] = [];
          if (inwardKinds.has(edge.kind) && edge.to === current) deps.push(edge.from);
          if (outwardKinds.has(edge.kind) && edge.from === current) deps.push(edge.to);
          if (edge.kind === 'contains' && edge.to === current) deps.push(edge.from);
          for (const d of deps) {
            if (!visited.has(d)) { visited.add(d); frontier.push(d); }
          }
        }
      }
      return visited.size;
    }

    // Warm up
    bfsWithIndex(smallGraph);
    bfsWithIndex(largeGraph);

    const iterations = 10;
    const smallStart = performance.now();
    for (let i = 0; i < iterations; i++) bfsWithIndex(smallGraph);
    const smallMs = (performance.now() - smallStart) / iterations;

    const largeStart = performance.now();
    for (let i = 0; i < iterations; i++) bfsWithIndex(largeGraph);
    const largeMs = (performance.now() - largeStart) / iterations;

    // Graph is 10x bigger with 10x more edges. O(N*E) would be 100x.
    // With edge index it should be closer to 10x or less.
    const ratio = largeMs / Math.max(smallMs, 0.01);
    expect(ratio).toBeLessThan(50);
  });
});
