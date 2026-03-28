/**
 * Workbench Consumer — Law Tests (W3.16)
 *
 * Verifies score ranking, capability matching, and queue consumption
 * invariants using synthetic work items generated from mulberry32 seeds.
 *
 * 150 mulberry32 seeds per law.
 */

import { expect, test } from '@playwright/test';
import { mulberry32, randomInt, pick, randomWord } from './support/random';
import {
  scoreWorkItem,
  scoreAndRank,
  canHandle,
  consumeNextWorkItem,
  DEFAULT_CAPABILITIES,
  DEFAULT_SCORE_WEIGHTS,
  type AgentCapabilities,
  type ScoreWeights,
} from '../lib/application/workbench-consumer';
import type { AgentWorkItem, WorkItemKind, WorkItemActionKind, WorkItemAction } from '../lib/domain/types/workbench';

// ─── Generators ───

const WORK_ITEM_KINDS: readonly WorkItemKind[] = [
  'interpret-step', 'approve-proposal', 'author-knowledge',
  'investigate-hotspot', 'validate-calibration', 'request-rerun',
];

const ACTION_KINDS: readonly WorkItemActionKind[] = [
  'approve', 'reject', 'inspect', 'author', 'rerun', 'skip',
];

function randomWorkItem(next: () => number, idPrefix = 'wi'): AgentWorkItem {
  const kind = pick(next, WORK_ITEM_KINDS);
  const actionCount = 1 + randomInt(next, 3);
  const actions: readonly WorkItemAction[] = Array.from({ length: actionCount }, (): WorkItemAction => ({
    kind: pick(next, ACTION_KINDS),
    target: { kind: 'selector', ref: `scr-${randomWord(next)}/${randomWord(next)}`, label: `el-${randomWord(next)}` },
    params: {},
  }));
  const linkedCount = randomInt(next, 4);
  return {
    id: `${idPrefix}-${randomWord(next)}`,
    kind,
    priority: randomInt(next, 100),
    title: `Work item ${randomWord(next)}`,
    rationale: `Because ${randomWord(next)}`,
    adoId: `ADO-${randomInt(next, 99999)}` as any,
    iteration: randomInt(next, 10),
    actions,
    context: {
      artifactRefs: [],
    },
    evidence: {
      confidence: next(),
      sources: [`source-${randomWord(next)}`],
    },
    linkedProposals: Array.from({ length: linkedCount }, () => `prop-${randomWord(next)}`),
    linkedHotspots: [],
    linkedBottlenecks: [],
  };
}

function randomQueue(next: () => number, count?: number): readonly AgentWorkItem[] {
  const n = count ?? (2 + randomInt(next, 15));
  return Array.from({ length: n }, (_, i) => randomWorkItem(next, `wi-${i}`));
}

function randomCapabilities(next: () => number): AgentCapabilities {
  // Pick a random subset of kinds and actions
  const kindCount = 1 + randomInt(next, WORK_ITEM_KINDS.length);
  const kinds = new Set<WorkItemKind>();
  for (let i = 0; i < kindCount; i++) {
    kinds.add(pick(next, WORK_ITEM_KINDS));
  }
  const actionCount = 1 + randomInt(next, ACTION_KINDS.length);
  const actions = new Set<WorkItemActionKind>();
  for (let i = 0; i < actionCount; i++) {
    actions.add(pick(next, ACTION_KINDS));
  }
  return {
    supportedKinds: kinds,
    supportedActions: actions,
    maxPriority: next() > 0.7 ? randomInt(next, 100) : 0,
    minConfidence: next() > 0.7 ? next() * 0.5 : 0,
  };
}

// ─── Law 1: Score determinism (150 seeds) ───

test.describe('scoreWorkItem determinism', () => {
  test('same item always produces same score (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const item = randomWorkItem(next);
      const score1 = scoreWorkItem(item);
      const score2 = scoreWorkItem(item);
      expect(score1).toBe(score2);
    }
  });
});

// ─── Law 2: Score monotonicity in priority (150 seeds) ───

test.describe('score monotonicity in priority', () => {
  test('higher priority produces higher score (all else equal) (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const base = randomWorkItem(next);
      const low = { ...base, priority: 10 };
      const high = { ...base, priority: 50 };
      expect(scoreWorkItem(high)).toBeGreaterThan(scoreWorkItem(low));
    }
  });
});

// ─── Law 3: scoreAndRank ordering (150 seeds) ───

test.describe('scoreAndRank ordering', () => {
  test('result is sorted by score descending (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const items = randomQueue(next);
      const ranked = scoreAndRank(items);

      for (let i = 1; i < ranked.length; i++) {
        expect(scoreWorkItem(ranked[i]!)).toBeLessThanOrEqual(scoreWorkItem(ranked[i - 1]!));
      }
    }
  });
});

// ─── Law 4: scoreAndRank preserves length (150 seeds) ───

test.describe('scoreAndRank preserves length', () => {
  test('output has same length as input (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const items = randomQueue(next);
      const ranked = scoreAndRank(items);
      expect(ranked.length).toBe(items.length);
    }
  });
});

// ─── Law 5: scoreAndRank does not mutate input (150 seeds) ───

test.describe('scoreAndRank immutability', () => {
  test('input array is not mutated (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const items = randomQueue(next);
      const snapshot = items.map((i) => i.id);
      scoreAndRank(items);
      expect(items.map((i) => i.id)).toEqual(snapshot);
    }
  });
});

// ─── Law 6: canHandle respects kind filter (150 seeds) ───

test.describe('canHandle kind filter', () => {
  test('items with unsupported kinds are rejected (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const item = randomWorkItem(next);
      const capabilities: AgentCapabilities = {
        ...DEFAULT_CAPABILITIES,
        supportedKinds: new Set<WorkItemKind>(), // empty — nothing supported
      };
      expect(canHandle(item, capabilities)).toBe(false);
    }
  });
});

// ─── Law 7: canHandle respects action filter (150 seeds) ───

test.describe('canHandle action filter', () => {
  test('items with no performable actions are rejected (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const item = randomWorkItem(next);
      const capabilities: AgentCapabilities = {
        ...DEFAULT_CAPABILITIES,
        supportedActions: new Set<WorkItemActionKind>(), // empty
      };
      expect(canHandle(item, capabilities)).toBe(false);
    }
  });
});

// ─── Law 8: canHandle with default capabilities accepts all (150 seeds) ───

test.describe('canHandle default capabilities', () => {
  test('default capabilities accept all well-formed items (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const item = randomWorkItem(next);
      expect(canHandle(item, DEFAULT_CAPABILITIES)).toBe(true);
    }
  });
});

// ─── Law 9: consumeNextWorkItem on empty queue (150 seeds) ───

test.describe('consumeNextWorkItem empty queue', () => {
  test('empty queue returns null item with queue-empty reason (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const result = consumeNextWorkItem([]);
      expect(result.item).toBeNull();
      expect(result.reason).toBe('queue-empty');
      expect(result.consideredCount).toBe(0);
    }
  });
});

// ─── Law 10: consumeNextWorkItem selects highest score (150 seeds) ───

test.describe('consumeNextWorkItem selects highest score', () => {
  test('selected item has the highest score among eligible items (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const items = randomQueue(next, 5 + randomInt(next, 10));
      const result = consumeNextWorkItem(items);

      if (result.item) {
        const ranked = scoreAndRank(items);
        expect(result.item.id).toBe(ranked[0]!.id);
      }
    }
  });
});

// ─── Law 11: consumeNextWorkItem metadata consistency (150 seeds) ───

test.describe('consumeNextWorkItem metadata', () => {
  test('consideredCount equals queue length (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const items = randomQueue(next);
      const result = consumeNextWorkItem(items);

      expect(result.consideredCount).toBe(items.length);
      expect(result.filteredCount).toBeLessThanOrEqual(items.length);
      expect(result.kind).toBe('workbench-consumption');
    }
  });
});

// ─── Law 12: Filtered count + eligible = total (150 seeds) ───

test.describe('filtered count arithmetic', () => {
  test('filteredCount + eligible = consideredCount (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const items = randomQueue(next);
      const caps = randomCapabilities(next);
      const result = consumeNextWorkItem(items, caps);

      const eligible = items.filter((i) => canHandle(i, caps)).length;
      expect(result.filteredCount).toBe(items.length - eligible);
    }
  });
});

// ─── Law 13: Score is non-negative for non-negative inputs (150 seeds) ───

test.describe('score non-negativity', () => {
  test('score is non-negative when all inputs are non-negative (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const item = randomWorkItem(next);
      // Our generator always produces non-negative priority and confidence
      const score = scoreWorkItem(item);
      expect(score).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── Law 14: Confidence floor filtering (150 seeds) ───

test.describe('confidence floor', () => {
  test('items below minConfidence are filtered out (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const item: AgentWorkItem = {
        ...randomWorkItem(next),
        evidence: { confidence: 0.1, sources: ['test'] },
      };
      const caps: AgentCapabilities = {
        ...DEFAULT_CAPABILITIES,
        minConfidence: 0.5,
      };
      expect(canHandle(item, caps)).toBe(false);
    }
  });

  test('items above minConfidence pass (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const item: AgentWorkItem = {
        ...randomWorkItem(next),
        evidence: { confidence: 0.9, sources: ['test'] },
      };
      const caps: AgentCapabilities = {
        ...DEFAULT_CAPABILITIES,
        minConfidence: 0.5,
      };
      expect(canHandle(item, caps)).toBe(true);
    }
  });
});

// ─── Law 15: Custom weights change ranking (150 seeds) ───

test.describe('custom weights change ranking', () => {
  test('zero priority weight makes confidence dominant (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const highPriLowConf: AgentWorkItem = {
        ...randomWorkItem(next),
        priority: 100,
        evidence: { confidence: 0.1, sources: [] },
        actions: [],
        linkedProposals: [],
      };
      const lowPriHighConf: AgentWorkItem = {
        ...randomWorkItem(next),
        priority: 1,
        evidence: { confidence: 0.99, sources: [] },
        actions: [],
        linkedProposals: [],
      };

      const confOnlyWeights: ScoreWeights = {
        priorityWeight: 0,
        confidenceWeight: 1.0,
        actionCountWeight: 0,
        linkedProposalWeight: 0,
      };

      const scoreHigh = scoreWorkItem(highPriLowConf, confOnlyWeights);
      const scoreLow = scoreWorkItem(lowPriHighConf, confOnlyWeights);
      expect(scoreLow).toBeGreaterThan(scoreHigh);
    }
  });
});
