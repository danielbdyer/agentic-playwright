/**
 * Agent Workbench — Law Tests
 *
 * Pure function invariants for work item generation, scoring, and completion.
 */

import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import { buildAgentWorkItems, defaultWorkItemDecider } from '../lib/application/agent/agent-workbench';
import type { WorkflowHotspot } from '../lib/application/improvement/hotspots';
import type { AgentWorkItem, WorkItemKind } from '../lib/domain/handshake/workbench';
import type { WorkspaceCatalog } from '../lib/application/catalog';

// ─── Mock Factories ───

function mockHotspot(overrides: Partial<WorkflowHotspot> = {}): WorkflowHotspot {
  return {
    id: 'hotspot-1',
    kind: 'translation-win',
    screen: 'policy-search',
    family: { field: 'searchButton', action: 'click' },
    occurrenceCount: 5,
    suggestions: [{ target: 'knowledge/screens/policy-search.hints.yaml', reason: 'Add aliases' }],
    samples: [{ adoId: '10001', runId: 'run-1', stepIndex: 1, winningSource: 'structured-translation', resolutionMode: 'agentic', locatorRung: null, widgetContract: null }],
    ...overrides,
  };
}

// Use a minimal catalog shape for testing pure builders
function emptyCatalog() {
  return {
    proposalBundles: [],
    runRecords: [],
    interpretationDriftRecords: [],
    resolutionGraphRecords: [],
  } as unknown as WorkspaceCatalog;
}

// ─── Invariant 1: Priority Ordering ───

test.describe('Work Item Priority Ordering', () => {
  test('items are sorted by priority descending', () => {
    const items = buildAgentWorkItems(emptyCatalog(), 1, [
      mockHotspot({ id: 'h1', occurrenceCount: 10 }),
      mockHotspot({ id: 'h2', occurrenceCount: 2 }),
      mockHotspot({ id: 'h3', occurrenceCount: 5 }),
    ]);
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.priority).toBeLessThanOrEqual(items[i - 1]!.priority);
    }
  });

  test('higher occurrence count produces higher priority', () => {
    const items = buildAgentWorkItems(emptyCatalog(), 1, [
      mockHotspot({ id: 'low', occurrenceCount: 2 }),
      mockHotspot({ id: 'high', occurrenceCount: 15 }),
    ]);
    const high = items.find((i) => i.id.length > 0 && i.title.includes('15x'));
    const low = items.find((i) => i.id.length > 0 && i.title.includes('2x'));
    expect(high).toBeDefined();
    expect(low).toBeDefined();
    expect(high!.priority).toBeGreaterThan(low!.priority);
  });
});

// ─── Invariant 2: Stable IDs ───

test.describe('Work Item Stable IDs', () => {
  test('same input produces same IDs (deterministic)', () => {
    const hotspots = [mockHotspot({ id: 'h1', occurrenceCount: 5 })];
    const a = buildAgentWorkItems(emptyCatalog(), 1, hotspots);
    const b = buildAgentWorkItems(emptyCatalog(), 1, hotspots);
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
  });

  test('different screen+element produce different work item IDs', () => {
    const items = buildAgentWorkItems(emptyCatalog(), 1, [
      mockHotspot({ id: 'h1', screen: 'policy-search', family: { field: 'searchButton', action: 'click' } }),
      mockHotspot({ id: 'h2', screen: 'policy-detail', family: { field: 'backToSearch', action: 'click' } }),
    ]);
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── Invariant 3: Kind Classification ───

test.describe('Work Item Kind Classification', () => {
  test('hotspots produce investigate-hotspot items', () => {
    const items = buildAgentWorkItems(emptyCatalog(), 1, [mockHotspot()]);
    expect(items.every((i) => i.kind === 'investigate-hotspot')).toBe(true);
  });

  test('hotspots with occurrenceCount < 2 are filtered out', () => {
    const items = buildAgentWorkItems(emptyCatalog(), 1, [
      mockHotspot({ id: 'h1', occurrenceCount: 1 }),
      mockHotspot({ id: 'h2', occurrenceCount: 3 }),
    ]);
    expect(items.length).toBe(1);
    expect(items[0]!.title).toContain('3x');
  });

  test('empty catalog produces zero items', () => {
    const items = buildAgentWorkItems(emptyCatalog(), 1, []);
    expect(items).toEqual([]);
  });
});

// ─── Invariant 4: Action Structure ───

test.describe('Work Item Actions', () => {
  test('hotspot items have author actions with targetPath', () => {
    const items = buildAgentWorkItems(emptyCatalog(), 1, [mockHotspot()]);
    for (const item of items) {
      expect(item.actions.length).toBeGreaterThan(0);
      expect(item.actions[0]!.kind).toBe('author');
      expect(item.actions[0]!.params.targetPath).toBeDefined();
    }
  });

  test('actions carry screen and element in params', () => {
    const items = buildAgentWorkItems(emptyCatalog(), 1, [
      mockHotspot({ screen: 'policy-detail', family: { field: 'effectiveDate', action: 'assert' } }),
    ]);
    expect(items[0]!.actions[0]!.params.screen).toBe('policy-detail');
    expect(items[0]!.actions[0]!.params.element).toBe('effectiveDate');
  });
});

// ─── Invariant 5: Evidence Confidence ───

test.describe('Evidence Confidence Scaling', () => {
  test('confidence scales with occurrence count (max 1.0 at 5+)', () => {
    const lowItems = buildAgentWorkItems(emptyCatalog(), 1, [mockHotspot({ id: 'h1', occurrenceCount: 2 })]);
    const highItems = buildAgentWorkItems(emptyCatalog(), 1, [mockHotspot({ id: 'h2', occurrenceCount: 10 })]);
    expect(lowItems[0]!.evidence.confidence).toBeLessThan(highItems[0]!.evidence.confidence);
    expect(highItems[0]!.evidence.confidence).toBe(1);
  });
});

// ─── Invariant 6: Default Decider ───

test.describe('Default Work Item Decider', () => {
  test('approves proposals', async () => {
    const item = { kind: 'approve-proposal' as WorkItemKind, title: 'test' } as AgentWorkItem;
    const result = await Effect.runPromise(defaultWorkItemDecider(item));
    expect(result?.status).toBe('completed');
  });

  test('acknowledges high-confidence hotspots', async () => {
    const item = { kind: 'investigate-hotspot' as WorkItemKind, title: 'test', evidence: { confidence: 0.8, sources: [] } } as unknown as AgentWorkItem;
    const result = await Effect.runPromise(defaultWorkItemDecider(item));
    expect(result?.status).toBe('completed');
  });

  test('skips low-confidence hotspots', async () => {
    const item = { kind: 'investigate-hotspot' as WorkItemKind, title: 'test', evidence: { confidence: 0.3, sources: [] } } as unknown as AgentWorkItem;
    const result = await Effect.runPromise(defaultWorkItemDecider(item));
    expect(result?.status).toBe('skipped');
  });

  test('skips interpret-step items (needs real agent)', async () => {
    const item = { kind: 'interpret-step' as WorkItemKind, title: 'test' } as AgentWorkItem;
    const result = await Effect.runPromise(defaultWorkItemDecider(item));
    expect(result?.status).toBe('skipped');
  });
});
