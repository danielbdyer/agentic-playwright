/**
 * Pipeline DAG — Algebraic Law Tests (W4.1)
 *
 * Verifies formal properties of the pipeline DAG: topological sort correctness,
 * cycle detection, parallel group discovery, and dependency validation.
 *
 *   Law 1: Topological order — every node appears after all its dependencies
 *   Law 2: Completeness — every node appears exactly once in the sort
 *   Law 3: Cycle detection — cyclic graphs are rejected
 *   Law 4: Parallel groups — nodes in the same group share no dependencies
 *   Law 5: Parallel groups cover all nodes
 *   Law 6: DAG validation — catches missing deps, self-deps, duplicates, cycles
 *   Law 7: Empty DAG — degenerate input is handled gracefully
 *   Law 8: Single node — simplest non-trivial DAG
 *
 * 20 seeds, deterministic PRNG.
 */

import { expect, test } from '@playwright/test';
import {
  topologicalSort,
  buildPipelineDAG,
  findParallelGroups,
  validateDAG,
} from '../lib/domain/resolution/pipeline-dag';
import type { PipelineNode, PipelineDAG } from '../lib/domain/resolution/pipeline-dag';
import { mulberry32, randomWord, randomInt , LAW_SEED_COUNT } from './support/random';

// ─── Helpers ───

function node(id: string, dependencies: readonly string[] = []): PipelineNode {
  return { id, stage: id, dependencies };
}

function _dagFromNodes(nodes: readonly PipelineNode[]): PipelineDAG {
  return { nodes, topologicalOrder: topologicalSort(nodes) };
}

// ─── Standard test graphs ───

function linearPipeline(): readonly PipelineNode[] {
  return [
    node('prepare'),
    node('resolve', ['prepare']),
    node('execute', ['resolve']),
    node('report', ['execute']),
  ];
}

function diamondPipeline(): readonly PipelineNode[] {
  return [
    node('init'),
    node('compile', ['init']),
    node('test', ['init']),
    node('deploy', ['compile', 'test']),
  ];
}

function widePipeline(): readonly PipelineNode[] {
  return [
    node('a'),
    node('b'),
    node('c'),
    node('d'),
    node('merge', ['a', 'b', 'c', 'd']),
  ];
}

function cyclicPipeline(): readonly PipelineNode[] {
  return [
    node('a', ['c']),
    node('b', ['a']),
    node('c', ['b']),
  ];
}

// ─── Law 1: Topological order — every node appears after all its dependencies ───

test.describe('Law 1: Topological order correctness', () => {
  test('linear pipeline preserves dependency order', () => {
    const order = topologicalSort(linearPipeline());
    const indexOf = new Map(order.map((id, i) => [id, i] as const));
    expect(indexOf.get('prepare')!).toBeLessThan(indexOf.get('resolve')!);
    expect(indexOf.get('resolve')!).toBeLessThan(indexOf.get('execute')!);
    expect(indexOf.get('execute')!).toBeLessThan(indexOf.get('report')!);
  });

  test('diamond pipeline: deploy comes after both compile and test', () => {
    const order = topologicalSort(diamondPipeline());
    const indexOf = new Map(order.map((id, i) => [id, i] as const));
    expect(indexOf.get('init')!).toBeLessThan(indexOf.get('compile')!);
    expect(indexOf.get('init')!).toBeLessThan(indexOf.get('test')!);
    expect(indexOf.get('compile')!).toBeLessThan(indexOf.get('deploy')!);
    expect(indexOf.get('test')!).toBeLessThan(indexOf.get('deploy')!);
  });

  test('wide pipeline: merge comes after all independent nodes', () => {
    const order = topologicalSort(widePipeline());
    const indexOf = new Map(order.map((id, i) => [id, i] as const));
    expect(indexOf.get('a')!).toBeLessThan(indexOf.get('merge')!);
    expect(indexOf.get('b')!).toBeLessThan(indexOf.get('merge')!);
    expect(indexOf.get('c')!).toBeLessThan(indexOf.get('merge')!);
    expect(indexOf.get('d')!).toBeLessThan(indexOf.get('merge')!);
  });

  test('dependency order invariant holds (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const count = 2 + randomInt(next, 6);
      const ids = Array.from({ length: count }, (_, i) => `stage-${i}`);
      // Build a random DAG: each node can depend on earlier nodes only (acyclic by construction)
      const nodes = ids.map((id, i) => {
        const possibleDeps = ids.slice(0, i);
        const depCount = Math.min(randomInt(next, 3), possibleDeps.length);
        const deps = possibleDeps.slice(0, depCount);
        return node(id, deps);
      });

      const order = topologicalSort(nodes);
      const indexOf = new Map(order.map((id, i) => [id, i] as const));

      for (const n of nodes) {
        for (const dep of n.dependencies) {
          expect(indexOf.get(dep)!).toBeLessThan(indexOf.get(n.id)!);
        }
      }
    }
  });
});

// ─── Law 2: Completeness — every node appears exactly once ───

test.describe('Law 2: Completeness', () => {
  test('all nodes appear in topological order', () => {
    const nodes = diamondPipeline();
    const order = topologicalSort(nodes);
    expect(order.length).toBe(nodes.length);
    expect(new Set(order).size).toBe(nodes.length);
  });

  test('no extra nodes in output', () => {
    const nodes = linearPipeline();
    const order = topologicalSort(nodes);
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const id of order) {
      expect(nodeIds.has(id)).toBe(true);
    }
  });

  test('completeness holds for random DAGs (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const count = 1 + randomInt(next, 8);
      const ids = Array.from({ length: count }, (_, i) => `s${i}`);
      const nodes = ids.map((id, i) => {
        const deps = ids.slice(0, i).filter(() => next() > 0.5);
        return node(id, deps);
      });

      const order = topologicalSort(nodes);
      expect(order.length).toBe(count);
      expect(new Set(order).size).toBe(count);
    }
  });
});

// ─── Law 3: Cycle detection ───

test.describe('Law 3: Cycle detection', () => {
  test('simple cycle is detected', () => {
    expect(() => topologicalSort(cyclicPipeline())).toThrow(/[Cc]ycle/);
  });

  test('self-cycle is detected', () => {
    expect(() => topologicalSort([node('a', ['a'])])).toThrow(/[Cc]ycle/);
  });

  test('two-node mutual dependency is detected', () => {
    expect(() =>
      topologicalSort([node('a', ['b']), node('b', ['a'])]),
    ).toThrow(/[Cc]ycle/);
  });

  test('cycle in larger graph is detected', () => {
    const nodes = [
      node('a'),
      node('b', ['a']),
      node('c', ['b']),
      node('d', ['c', 'e']),
      node('e', ['d']),        // cycle: d -> e -> d
    ];
    expect(() => topologicalSort(nodes)).toThrow(/[Cc]ycle/);
  });

  test('buildPipelineDAG throws on cycles', () => {
    expect(() =>
      buildPipelineDAG([
        { name: 'a', dependencies: ['b'] },
        { name: 'b', dependencies: ['a'] },
      ]),
    ).toThrow(/[Cc]ycle/);
  });
});

// ─── Law 4: Parallel groups — no intra-group dependencies ───

test.describe('Law 4: Parallel group independence', () => {
  test('linear pipeline has one node per group', () => {
    const dag = buildPipelineDAG(linearPipeline().map((n) => ({ name: n.id, dependencies: [...n.dependencies] })));
    const groups = findParallelGroups(dag);
    expect(groups.length).toBe(4);
    for (const group of groups) {
      expect(group.length).toBe(1);
    }
  });

  test('wide pipeline: independent nodes share a group', () => {
    const dag = buildPipelineDAG(widePipeline().map((n) => ({ name: n.id, dependencies: [...n.dependencies] })));
    const groups = findParallelGroups(dag);
    // First group should have a, b, c, d (all independent)
    expect([...groups[0]!].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(groups[1]).toEqual(['merge']);
  });

  test('diamond pipeline has three groups', () => {
    const dag = buildPipelineDAG(diamondPipeline().map((n) => ({ name: n.id, dependencies: [...n.dependencies] })));
    const groups = findParallelGroups(dag);
    expect(groups.length).toBe(3);
    expect(groups[0]).toEqual(['init']);
    expect([...groups[1]!].sort()).toEqual(['compile', 'test']);
    expect(groups[2]).toEqual(['deploy']);
  });

  test('no intra-group dependencies (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const count = 2 + randomInt(next, 6);
      const ids = Array.from({ length: count }, (_, i) => `p${i}`);
      const stages = ids.map((id, i) => ({
        name: id,
        dependencies: ids.slice(0, i).filter(() => next() > 0.6),
      }));
      const dag = buildPipelineDAG(stages);
      const groups = findParallelGroups(dag);

      for (const group of groups) {
        const groupSet = new Set(group);
        const nodeMap = new Map(dag.nodes.map((n) => [n.id, n] as const));
        for (const id of group) {
          const deps = nodeMap.get(id)?.dependencies ?? [];
          for (const dep of deps) {
            // No node in the same group should be a dependency
            expect(groupSet.has(dep)).toBe(false);
          }
        }
      }
    }
  });
});

// ─── Law 5: Parallel groups cover all nodes ───

test.describe('Law 5: Parallel groups completeness', () => {
  test('all nodes appear in exactly one group', () => {
    const dag = buildPipelineDAG(diamondPipeline().map((n) => ({ name: n.id, dependencies: [...n.dependencies] })));
    const groups = findParallelGroups(dag);
    const allIds = groups.flat().sort();
    const nodeIds = dag.nodes.map((n) => n.id).sort();
    expect(allIds).toEqual(nodeIds);
  });

  test('no duplicate node across groups', () => {
    const dag = buildPipelineDAG(widePipeline().map((n) => ({ name: n.id, dependencies: [...n.dependencies] })));
    const groups = findParallelGroups(dag);
    const allIds = groups.flat();
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  test('completeness holds (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const count = 1 + randomInt(next, 7);
      const ids = Array.from({ length: count }, (_, i) => `q${i}`);
      const stages = ids.map((id, i) => ({
        name: id,
        dependencies: ids.slice(0, i).filter(() => next() > 0.5),
      }));
      const dag = buildPipelineDAG(stages);
      const groups = findParallelGroups(dag);
      const allIds = groups.flat();
      expect(allIds.length).toBe(count);
      expect(new Set(allIds).size).toBe(count);
    }
  });
});

// ─── Law 6: DAG validation diagnostics ───

test.describe('Law 6: DAG validation diagnostics', () => {
  test('valid DAG produces no diagnostics', () => {
    const dag = buildPipelineDAG(linearPipeline().map((n) => ({ name: n.id, dependencies: [...n.dependencies] })));
    expect(validateDAG(dag)).toEqual([]);
  });

  test('missing dependency is reported', () => {
    const dag: PipelineDAG = {
      nodes: [node('a', ['missing'])],
      topologicalOrder: ['a'],
    };
    const diags = validateDAG(dag);
    expect(diags.some((d) => d.includes('missing'))).toBe(true);
  });

  test('self-dependency is reported', () => {
    const dag: PipelineDAG = {
      nodes: [node('a', ['a'])],
      topologicalOrder: ['a'],
    };
    const diags = validateDAG(dag);
    expect(diags.some((d) => d.includes('depends on itself'))).toBe(true);
  });

  test('duplicate node IDs are reported', () => {
    const dag: PipelineDAG = {
      nodes: [node('a'), node('a')],
      topologicalOrder: ['a', 'a'],
    };
    const diags = validateDAG(dag);
    expect(diags.some((d) => d.includes('Duplicate'))).toBe(true);
  });

  test('cycle is reported as diagnostic', () => {
    const dag: PipelineDAG = {
      nodes: cyclicPipeline(),
      topologicalOrder: [], // invalid but we are testing validateDAG
    };
    const diags = validateDAG(dag);
    expect(diags.some((d) => d.includes('Cycle'))).toBe(true);
  });

  test('multiple issues are all reported', () => {
    const dag: PipelineDAG = {
      nodes: [node('a', ['a', 'missing']), node('a')],
      topologicalOrder: [],
    };
    const diags = validateDAG(dag);
    expect(diags.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Law 7: Empty DAG ───

test.describe('Law 7: Empty DAG', () => {
  test('empty input produces empty topological order', () => {
    const order = topologicalSort([]);
    expect(order).toEqual([]);
  });

  test('empty DAG has empty parallel groups', () => {
    const dag: PipelineDAG = { nodes: [], topologicalOrder: [] };
    const groups = findParallelGroups(dag);
    expect(groups).toEqual([]);
  });

  test('empty DAG validates clean', () => {
    const dag: PipelineDAG = { nodes: [], topologicalOrder: [] };
    expect(validateDAG(dag)).toEqual([]);
  });
});

// ─── Law 8: Single node ───

test.describe('Law 8: Single node', () => {
  test('single node with no dependencies', () => {
    const order = topologicalSort([node('only')]);
    expect(order).toEqual(['only']);
  });

  test('single node forms one parallel group', () => {
    const dag = buildPipelineDAG([{ name: 'only', dependencies: [] }]);
    const groups = findParallelGroups(dag);
    expect(groups).toEqual([['only']]);
  });

  test('single node validates clean', () => {
    const dag = buildPipelineDAG([{ name: 'only', dependencies: [] }]);
    expect(validateDAG(dag)).toEqual([]);
  });
});

// ─── Law 9: buildPipelineDAG integration ───

test.describe('Law 9: buildPipelineDAG integration', () => {
  test('builds DAG with correct topological order', () => {
    const dag = buildPipelineDAG([
      { name: 'load', dependencies: [] },
      { name: 'compile', dependencies: ['load'] },
      { name: 'emit', dependencies: ['compile'] },
    ]);
    expect(dag.topologicalOrder).toEqual(['load', 'compile', 'emit']);
    expect(dag.nodes.length).toBe(3);
  });

  test('nodes retain stage field matching name', () => {
    const dag = buildPipelineDAG([
      { name: 'alpha', dependencies: [] },
      { name: 'beta', dependencies: ['alpha'] },
    ]);
    for (const n of dag.nodes) {
      expect(n.stage).toBe(n.id);
    }
  });

  test('dependencies with missing references still sort but validate with diagnostics (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const nodeCount = 2 + randomInt(next, 5);
      const ids = Array.from({ length: nodeCount }, (_, i) => `node-${i}`);
      const stages = ids.map((id, i) => ({
        name: id,
        dependencies: [
          ...ids.slice(0, i).filter(() => next() > 0.5),
          ...(next() > 0.8 ? [`ghost-${randomWord(next)}`] : []),
        ],
      }));
      const dag = buildPipelineDAG(stages);
      // Should still sort correctly (ghost deps are outside the node set)
      expect(dag.topologicalOrder.length).toBe(nodeCount);
      // But validation catches the ghosts
      const diags = validateDAG(dag);
      const hasGhost = stages.some((s) => s.dependencies.some((d) => d.startsWith('ghost-')));
      if (hasGhost) {
        expect(diags.some((d) => d.includes('missing'))).toBe(true);
      }
    }
  });
});
