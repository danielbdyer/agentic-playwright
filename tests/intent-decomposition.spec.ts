/**
 * Agentic resolution enhancement tests.
 *
 * Architecture: LLM handles comprehension, pipeline handles structure.
 * - IntentDecomposition/TranslationDecomposition: LLM-produced schema
 * - proposalsFromDecomposition: converts LLM suggestions to proposals
 * - detectAliasConflicts (E4): pure structural conflict detection
 *
 * The LLM is not under test here — these test the pipeline's ability
 * to consume LLM output and produce correct deterministic artifacts.
 */

import { test, expect } from '@playwright/test';
import {
  detectAliasConflicts,
} from '../lib/domain/knowledge/inference';
import {
  proposalsFromDecomposition,
} from '../lib/runtime/agent/proposals';
import type { IntentDecomposition } from '../lib/domain/knowledge/inference';
import type { GroundedStep, StepTaskScreenCandidate, StepTaskElementCandidate } from '../lib/domain/types';

// ─── Test Fixtures ───

function makeTask(overrides: Partial<GroundedStep> = {}): GroundedStep {
  return {
    index: 1,
    actionText: 'Enter policy number in search field',
    expectedText: 'Policy number is accepted',
    normalizedIntent: 'enter policy number in search field',
    taskFingerprint: 'test-fp',
    allowedActions: ['input'],
    explicitResolution: null,
    grounding: { targetRefs: [], requiredStateRefs: [], forbiddenStateRefs: [], routeVariantRefs: [] },
    ...overrides,
  } as GroundedStep;
}

function makeScreen(): StepTaskScreenCandidate {
  return {
    screen: 'policy-search',
    url: '/policy-search.html',
    screenAliases: ['policy search', 'search screen'],
    routeVariantRefs: [],
    supplementRefs: [],
    knowledgeRefs: [],
    sectionSnapshots: [],
    elements: [makeElement()],
  } as unknown as StepTaskScreenCandidate;
}

function makeElement(): StepTaskElementCandidate {
  return {
    element: 'searchField',
    name: 'Search Field',
    aliases: ['search field', 'policy search input'],
    postures: [],
    targetRef: 'ref-1',
    role: 'textbox',
    widget: 'os-input',
    locator: [{ kind: 'test-id', value: 'search-field' }],
  } as unknown as StepTaskElementCandidate;
}

// ─── LLM Decomposition → Proposal Pipeline ───

test.describe('proposalsFromDecomposition: LLM handshake', () => {
  test('generates proposals from LLM-suggested aliases', () => {
    const task = makeTask();
    const screen = makeScreen();
    const element = makeElement();
    const decomposition: IntentDecomposition = {
      verb: 'fill',
      target: 'search field',
      data: null,
      suggestedAliases: ['type policy number in search', 'input policy number search field', 'key in policy number'],
      confidence: 0.9,
    };

    const proposals = proposalsFromDecomposition(task, screen, element, decomposition);

    expect(proposals.length).toBe(3);
    for (const p of proposals) {
      expect(p.artifactType).toBe('hints');
      expect(p.patch.screen).toBe('policy-search');
      expect(p.patch.element).toBe('searchField');
      expect(p.rationale).toContain('LLM decomposition');
      expect(p.rationale).toContain('0.9');
    }
  });

  test('filters out aliases that already exist on the element', () => {
    const task = makeTask();
    const screen = makeScreen();
    const element = makeElement(); // has 'search field' and 'policy search input'
    const decomposition: IntentDecomposition = {
      verb: 'fill',
      target: 'search field',
      data: null,
      suggestedAliases: ['search field', 'new phrasing', 'policy search input'],
      confidence: 0.85,
    };

    const proposals = proposalsFromDecomposition(task, screen, element, decomposition);

    expect(proposals.length).toBe(1);
    expect(proposals[0]!.patch.alias).toBe('new phrasing');
  });

  test('caps at 5 proposals to prevent alias bloat', () => {
    const task = makeTask();
    const screen = makeScreen();
    const element = makeElement();
    const decomposition: IntentDecomposition = {
      verb: 'fill',
      target: 'search field',
      data: null,
      suggestedAliases: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'],
      confidence: 0.8,
    };

    const proposals = proposalsFromDecomposition(task, screen, element, decomposition);

    expect(proposals.length).toBe(5);
  });

  test('returns empty for no suggested aliases', () => {
    const task = makeTask();
    const screen = makeScreen();
    const element = makeElement();
    const decomposition: IntentDecomposition = {
      verb: 'fill',
      target: 'search field',
      data: null,
      suggestedAliases: [],
      confidence: 0.9,
    };

    const proposals = proposalsFromDecomposition(task, screen, element, decomposition);
    expect(proposals).toHaveLength(0);
  });

  test('includes enriched patch data (role, widget, locator)', () => {
    const task = makeTask();
    const screen = makeScreen();
    const element = makeElement();
    const decomposition: IntentDecomposition = {
      verb: 'fill',
      target: 'search field',
      data: null,
      suggestedAliases: ['type in search box'],
      confidence: 0.9,
    };

    const proposals = proposalsFromDecomposition(task, screen, element, decomposition);

    expect(proposals.length).toBe(1);
    expect(proposals[0]!.patch.role).toBe('textbox');
    expect(proposals[0]!.patch.widget).toBe('os-input');
  });
});

// ─── E4: Knowledge Conflict Detection (Structural) ───

test.describe('E4: detectAliasConflicts', () => {
  test('detects alias shared across different elements', () => {
    const screenHints = {
      'policy-search': {
        screen: 'policy-search',
        elements: {
          searchField: { aliases: ['search', 'policy search'] },
          searchButton: { aliases: ['search', 'find'] },
        },
      },
    } as any;

    const conflicts = detectAliasConflicts(screenHints);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]!.alias).toBe('search');
    expect(conflicts[0]!.mappings).toHaveLength(2);
  });

  test('detects alias shared across different screens', () => {
    const screenHints = {
      'policy-search': {
        screen: 'policy-search',
        elements: {
          statusField: { aliases: ['status'] },
        },
      },
      'policy-detail': {
        screen: 'policy-detail',
        elements: {
          claimStatus: { aliases: ['status'] },
        },
      },
    } as any;

    const conflicts = detectAliasConflicts(screenHints);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]!.mappings).toHaveLength(2);
    expect(conflicts[0]!.mappings.map((m: any) => m.screen)).toContain('policy-search');
    expect(conflicts[0]!.mappings.map((m: any) => m.screen)).toContain('policy-detail');
  });

  test('returns empty for no conflicts', () => {
    const screenHints = {
      'policy-search': {
        screen: 'policy-search',
        elements: {
          searchField: { aliases: ['search field', 'find policy'] },
          searchButton: { aliases: ['search button', 'submit'] },
        },
      },
    } as any;

    const conflicts = detectAliasConflicts(screenHints);
    expect(conflicts).toHaveLength(0);
  });

  test('handles empty input', () => {
    expect(detectAliasConflicts({})).toHaveLength(0);
  });

  test('ignores duplicate same-element mappings', () => {
    const screenHints = {
      'policy-search': {
        screen: 'policy-search',
        elements: {
          searchField: { aliases: ['search', 'search'] },
        },
      },
    } as any;

    const conflicts = detectAliasConflicts(screenHints);
    expect(conflicts).toHaveLength(0);
  });
});
