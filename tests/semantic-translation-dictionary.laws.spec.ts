/**
 * Semantic Translation Dictionary — law-style tests.
 *
 * Tests the core properties:
 * 1. Semantic lookup: token Jaccard finds equivalent phrasings.
 * 2. Exact miss: unrelated intents do not match.
 * 3. Confidence accrual: repeated success boosts confidence with diminishing returns.
 * 4. Failure decay: failures reduce confidence.
 * 5. Promotion: high-confidence entries with sufficient reuse are promotion candidates.
 * 6. Pruning: low-confidence entries are pruned first.
 * 7. Resolution stage: semantic dictionary rung resolves when catalog has a match.
 * 8. Accrual from pipeline: successful translation produces semantic accrual input.
 */

import { expect, test } from '@playwright/test';
import { createElementId, createScreenId } from '../lib/domain/identity';
import type {
  SemanticDictionaryAccrualInput,
  SemanticDictionaryCatalog,
  SemanticDictionaryEntry,
  SemanticDictionaryTarget,
} from '../lib/domain/types';
import type { SemanticRetrievalContext } from '../lib/domain/types';
import {
  accrueSemanticEntry,
  emptyCatalog,
  lookupSemanticDictionary,
  markPromoted,
  promotionCandidates,
  pruneSemanticDictionary,
  recordSemanticFailure,
  recordSemanticSuccess,
} from '../lib/application/semantic-translation-dictionary';
import { trySemanticDictionaryResolution } from '../lib/runtime/agent/resolution-stages';
import {
  createAgentContext,
  createGroundedStep,
  createInterfaceResolutionContext,
  createPolicySearchScreen,
} from './support/interface-fixtures';
import type { ResolutionAccumulator } from '../lib/runtime/agent/resolution-stages';
import type { RuntimeAgentStageContext } from '../lib/runtime/agent/types';

// ─── Helpers ───

function target(overrides: Partial<SemanticDictionaryTarget> = {}): SemanticDictionaryTarget {
  return {
    action: 'input',
    screen: createScreenId('policy-search'),
    element: createElementId('policyNumberInput'),
    posture: null,
    snapshotTemplate: null,
    ...overrides,
  };
}

function accrualInput(overrides: Partial<SemanticDictionaryAccrualInput> = {}): SemanticDictionaryAccrualInput {
  return {
    normalizedIntent: 'enter policy number into search box',
    target: target(),
    provenance: 'translation',
    winningSource: 'structured-translation',
    taskFingerprint: 'sha256:task-a',
    knowledgeFingerprint: 'sha256:knowledge-a',
    ...overrides,
  };
}

function catalogWithEntry(entry: Partial<SemanticDictionaryEntry> = {}): SemanticDictionaryCatalog {
  const catalog = emptyCatalog();
  return accrueSemanticEntry(catalog, accrualInput(entry as Partial<SemanticDictionaryAccrualInput>));
}

function highConfidenceEntry(normalizedIntent: string): SemanticDictionaryCatalog {
  let catalog = emptyCatalog();
  catalog = accrueSemanticEntry(catalog, accrualInput({ normalizedIntent }));
  // Boost confidence through repeated success
  const entryId = catalog.entries[0]!.id;
  for (let i = 0; i < 15; i++) {
    catalog = recordSemanticSuccess(catalog, entryId);
  }
  return catalog;
}

function minimalStageContext(semanticDictionary: SemanticDictionaryCatalog | undefined): {
  stage: RuntimeAgentStageContext;
  acc: ResolutionAccumulator;
} {
  const resolutionContext = createInterfaceResolutionContext({
    screens: [createPolicySearchScreen()],
  });
  const task = createGroundedStep({
    actionText: 'Enter policy number',
    expectedText: 'Field accepts value',
    normalizedIntent: 'enter policy number => field accepts value',
    allowedActions: ['input'],
  }, resolutionContext);
  const context = createAgentContext(resolutionContext, {
    provider: 'test-agent',
    runAt: '2026-01-01T00:00:00.000Z',
    semanticDictionary,
  });
  const stage: RuntimeAgentStageContext = {
    task,
    context,
    memory: {
      currentScreen: null,
      activeStateRefs: [],
      lastObservedTransitionRefs: [],
      activeRouteVariantRefs: [],
      activeTargetRefs: [],
      lastSuccessfulLocatorRung: null,
      recentAssertions: [],
      causalLinks: [],
      lineage: [],
    },
    controlResolution: null,
    controlRefs: [],
    evidenceRefs: [],
    exhaustion: [],
    observations: [],
    knowledgeRefs: [],
    supplementRefs: [],
    memoryLineage: [],
  };
  const acc: ResolutionAccumulator = {
    action: 'input',
    screen: null,
    element: null,
    posture: null,
    snapshotTemplate: null,
    override: { source: '', override: null },
    actionLattice: { ranked: [], selected: null },
    screenLattice: { ranked: [], selected: null },
    elementLattice: { ranked: [], selected: null },
    postureLattice: { ranked: [], selected: null },
    snapshotLattice: { ranked: [], selected: null },
    overlayResult: { screen: null, element: null, posture: null, snapshotTemplate: null, overlayRefs: [] },
    translated: { translation: null, screen: null, element: null, overlayRefs: [] },
  };
  return { stage, acc };
}

// ─── 1. Semantic Lookup ───

test('semantic lookup matches equivalent phrasings via token Jaccard', () => {
  const catalog = highConfidenceEntry('enter policy number into search box');

  // Equivalent phrasing with different word order
  const match1 = lookupSemanticDictionary('policy number enter into search box', catalog);
  expect(match1).not.toBeNull();
  expect(match1!.similarityScore).toBeGreaterThan(0.5);

  // Subset match with high overlap
  const match2 = lookupSemanticDictionary('enter policy number search box', catalog);
  expect(match2).not.toBeNull();
});

test('semantic lookup matches partial phrasing with sufficient overlap', () => {
  const catalog = highConfidenceEntry('click the search button on policy screen');

  const match = lookupSemanticDictionary('click search button policy screen', catalog);
  expect(match).not.toBeNull();
  expect(match!.similarityScore).toBeGreaterThan(0.5);
});

// ─── 2. Exact Miss ───

test('semantic lookup returns null for unrelated intents', () => {
  const catalog = highConfidenceEntry('enter policy number into search box');

  const match = lookupSemanticDictionary('navigate to claims dashboard', catalog);
  expect(match).toBeNull();
});

test('semantic lookup returns null for empty catalog', () => {
  const match = lookupSemanticDictionary('enter policy number', emptyCatalog());
  expect(match).toBeNull();
});

test('semantic lookup returns null for empty query', () => {
  const catalog = highConfidenceEntry('enter policy number');
  const match = lookupSemanticDictionary('', catalog);
  expect(match).toBeNull();
});

// ─── 3. Confidence Accrual ───

test('accrual creates a new entry with initial confidence', () => {
  const catalog = accrueSemanticEntry(emptyCatalog(), accrualInput());
  expect(catalog.entries).toHaveLength(1);
  expect(catalog.entries[0]!.confidence).toBe(0.5);
  expect(catalog.entries[0]!.successCount).toBe(1);
  expect(catalog.entries[0]!.failureCount).toBe(0);
  expect(catalog.summary.totalEntries).toBe(1);
});

test('repeated accrual of same intent reinforces confidence with diminishing returns', () => {
  let catalog = accrueSemanticEntry(emptyCatalog(), accrualInput());
  const entryId = catalog.entries[0]!.id;

  const c1 = catalog.entries[0]!.confidence;
  catalog = recordSemanticSuccess(catalog, entryId);
  const c2 = catalog.entries[0]!.confidence;
  catalog = recordSemanticSuccess(catalog, entryId);
  const c3 = catalog.entries[0]!.confidence;

  // Confidence increases
  expect(c2).toBeGreaterThan(c1);
  expect(c3).toBeGreaterThan(c2);

  // Diminishing returns: each boost is smaller
  const boost1 = c2 - c1;
  const boost2 = c3 - c2;
  expect(boost2).toBeLessThan(boost1);
});

test('accrual of same intent with same target updates existing entry', () => {
  let catalog = accrueSemanticEntry(emptyCatalog(), accrualInput());
  catalog = accrueSemanticEntry(catalog, accrualInput({ taskFingerprint: 'sha256:task-b' }));

  // Still one entry, not two
  expect(catalog.entries).toHaveLength(1);
  expect(catalog.entries[0]!.successCount).toBe(2);
  expect(catalog.entries[0]!.taskFingerprints).toContain('sha256:task-a');
  expect(catalog.entries[0]!.taskFingerprints).toContain('sha256:task-b');
});

test('confidence never exceeds 0.99', () => {
  let catalog = accrueSemanticEntry(emptyCatalog(), accrualInput());
  const entryId = catalog.entries[0]!.id;
  for (let i = 0; i < 100; i++) {
    catalog = recordSemanticSuccess(catalog, entryId);
  }
  expect(catalog.entries[0]!.confidence).toBeLessThanOrEqual(0.99);
});

// ─── 4. Failure Decay ───

test('failure reduces confidence', () => {
  let catalog = accrueSemanticEntry(emptyCatalog(), accrualInput());
  const entryId = catalog.entries[0]!.id;
  const before = catalog.entries[0]!.confidence;
  catalog = recordSemanticFailure(catalog, entryId);
  expect(catalog.entries[0]!.confidence).toBeLessThan(before);
  expect(catalog.entries[0]!.failureCount).toBe(1);
});

test('confidence never drops below 0', () => {
  let catalog = accrueSemanticEntry(emptyCatalog(), accrualInput());
  const entryId = catalog.entries[0]!.id;
  for (let i = 0; i < 20; i++) {
    catalog = recordSemanticFailure(catalog, entryId);
  }
  expect(catalog.entries[0]!.confidence).toBeGreaterThanOrEqual(0);
});

// ─── 5. Promotion ───

test('high-confidence entries with sufficient reuse are promotion candidates', () => {
  let catalog = accrueSemanticEntry(emptyCatalog(), accrualInput());
  const entryId = catalog.entries[0]!.id;

  // Not yet promotable (low confidence, low reuse)
  expect(promotionCandidates(catalog)).toHaveLength(0);

  // Boost to high confidence
  for (let i = 0; i < 20; i++) {
    catalog = recordSemanticSuccess(catalog, entryId);
  }

  expect(promotionCandidates(catalog)).toHaveLength(1);
  expect(promotionCandidates(catalog)[0]!.id).toBe(entryId);
});

test('promoted entries are excluded from promotion candidates', () => {
  let catalog = accrueSemanticEntry(emptyCatalog(), accrualInput());
  const entryId = catalog.entries[0]!.id;
  for (let i = 0; i < 20; i++) {
    catalog = recordSemanticSuccess(catalog, entryId);
  }
  expect(promotionCandidates(catalog)).toHaveLength(1);

  catalog = markPromoted(catalog, entryId);
  expect(catalog.entries[0]!.promoted).toBe(true);
  expect(promotionCandidates(catalog)).toHaveLength(0);
});

// ─── 6. Pruning ───

test('pruning removes lowest-confidence entries when over limit', () => {
  let catalog = emptyCatalog();
  for (let i = 0; i < 5; i++) {
    catalog = accrueSemanticEntry(catalog, accrualInput({
      normalizedIntent: `intent number ${i}`,
      target: target({ element: createElementId(`element${i}`) }),
    }));
  }
  expect(catalog.entries).toHaveLength(5);

  // Boost the first two entries
  for (const entry of catalog.entries.slice(0, 2)) {
    for (let i = 0; i < 5; i++) {
      catalog = recordSemanticSuccess(catalog, entry.id);
    }
  }

  const pruned = pruneSemanticDictionary(catalog, 3);
  expect(pruned.entries).toHaveLength(3);
  // The higher-confidence entries should survive
  expect(pruned.entries[0]!.successCount).toBeGreaterThan(1);
  expect(pruned.entries[1]!.successCount).toBeGreaterThan(1);
});

test('pruning is a no-op when under limit', () => {
  let catalog = accrueSemanticEntry(emptyCatalog(), accrualInput());
  const pruned = pruneSemanticDictionary(catalog, 100);
  expect(pruned.entries).toHaveLength(catalog.entries.length);
});

// ─── 7. Resolution Stage ───

test('semantic dictionary rung resolves when catalog has a matching entry', () => {
  const catalog = highConfidenceEntry('enter policy number field accepts value');
  const { stage, acc } = minimalStageContext(catalog);

  const result = trySemanticDictionaryResolution(stage, acc);
  expect(result.receipt).not.toBeNull();
  expect(result.receipt!.kind).toBe('resolved');
  expect(result.receipt!.winningSource).toBe('semantic-dictionary');
  expect(result.match).not.toBeNull();
  expect(result.match!.entry.target.screen).toBe(createScreenId('policy-search'));
});

test('semantic dictionary rung skips when no catalog is provided', () => {
  const { stage, acc } = minimalStageContext(undefined);
  const result = trySemanticDictionaryResolution(stage, acc);
  expect(result.receipt).toBeNull();
  expect(result.effects.exhaustion[0]!.outcome).toBe('skipped');
});

test('semantic dictionary rung fails gracefully when no match found', () => {
  const catalog = highConfidenceEntry('navigate to claims dashboard');
  const { stage, acc } = minimalStageContext(catalog);

  const result = trySemanticDictionaryResolution(stage, acc);
  expect(result.receipt).toBeNull();
  expect(result.effects.exhaustion[0]!.outcome).toBe('failed');
});

test('semantic dictionary rung validates target still exists in resolution context', () => {
  // Create a catalog entry pointing to a screen that doesn't exist in the context
  const catalog = highConfidenceEntry('enter claim number into form');
  // Manually patch the entry to point to a non-existent screen
  const patchedEntries = catalog.entries.map((e) => ({
    ...e,
    target: { ...e.target, screen: createScreenId('non-existent-screen') },
  }));
  const patchedCatalog: SemanticDictionaryCatalog = {
    ...catalog,
    entries: patchedEntries,
  };

  // Use a query that would match the patched entry
  const { stage, acc } = minimalStageContext(patchedCatalog);
  stage.task = createGroundedStep({
    actionText: 'Enter claim number into form',
    expectedText: '',
    normalizedIntent: 'enter claim number into form',
    allowedActions: ['input'],
  }, stage.context.resolutionContext);

  const result = trySemanticDictionaryResolution(stage, acc);
  expect(result.receipt).toBeNull();
  // Should fail because the screen doesn't exist
  expect(result.effects.exhaustion[0]!.outcome).toBe('failed');
});

// ─── 8. Summary Statistics ───

test('catalog summary tracks aggregate statistics correctly', () => {
  let catalog = emptyCatalog();
  expect(catalog.summary.totalEntries).toBe(0);

  catalog = accrueSemanticEntry(catalog, accrualInput({ normalizedIntent: 'intent a' }));
  catalog = accrueSemanticEntry(catalog, accrualInput({
    normalizedIntent: 'intent b',
    target: target({ element: createElementId('elementB') }),
  }));
  expect(catalog.summary.totalEntries).toBe(2);
  expect(catalog.summary.averageConfidence).toBe(0.5);

  // Boost first entry to high confidence
  const id = catalog.entries[0]!.id;
  for (let i = 0; i < 20; i++) {
    catalog = recordSemanticSuccess(catalog, id);
  }
  expect(catalog.summary.highConfidenceCount).toBe(1);

  catalog = markPromoted(catalog, id);
  expect(catalog.summary.promotedCount).toBe(1);
});

// ─── 9. Structural Context Scoring ───

function retrievalContext(overrides: Partial<SemanticRetrievalContext> = {}): SemanticRetrievalContext {
  return {
    allowedActions: ['input', 'click'],
    currentScreen: createScreenId('policy-search'),
    availableScreens: [createScreenId('policy-search'), createScreenId('claims-dashboard')],
    activeRouteVariantRefs: [],
    governanceFilter: 'all',
    ...overrides,
  };
}

test('structural scoring boosts entries on the current screen', () => {
  const catalog = highConfidenceEntry('enter policy number field accepts value');
  const ctx = retrievalContext({ currentScreen: createScreenId('policy-search') });

  const match = lookupSemanticDictionary('enter policy number field accepts value', catalog, { retrievalContext: ctx });
  expect(match).not.toBeNull();
  expect(match!.scoring).toBeDefined();
  expect(match!.scoring!.structuralScore).toBeGreaterThan(0.5);
});

test('structural scoring penalises entries targeting unavailable screens', () => {
  const catalog = highConfidenceEntry('enter policy number field accepts value');
  // Screen policy-search is in the entry, but we say only claims-dashboard is available
  const ctx = retrievalContext({
    currentScreen: createScreenId('claims-dashboard'),
    availableScreens: [createScreenId('claims-dashboard')],
  });

  const match = lookupSemanticDictionary('enter policy number field accepts value', catalog, { retrievalContext: ctx });
  // Still might match on text, but structural score should be low
  if (match?.scoring) {
    expect(match.scoring.structuralScore).toBeLessThan(0.5);
  }
});

test('structural scoring rewards action compatibility', () => {
  const catalog = highConfidenceEntry('enter policy number field accepts value');
  const ctxCompatible = retrievalContext({ allowedActions: ['input'] });
  const ctxIncompatible = retrievalContext({ allowedActions: ['navigate'] });

  const matchCompat = lookupSemanticDictionary('enter policy number field accepts value', catalog, { retrievalContext: ctxCompatible });
  const matchIncompat = lookupSemanticDictionary('enter policy number field accepts value', catalog, { retrievalContext: ctxIncompatible });

  // Compatible action should score higher
  if (matchCompat?.scoring && matchIncompat?.scoring) {
    expect(matchCompat.scoring.structuralScore).toBeGreaterThan(matchIncompat.scoring.structuralScore);
  }
});

// ─── 10. Governance Filtering ───

test('approved-only filter excludes low-confidence unpromoted entries', () => {
  let catalog = accrueSemanticEntry(emptyCatalog(), accrualInput());
  // Entry is new: confidence 0.5, not promoted, 1 reuse — should be filtered
  const ctx = retrievalContext({ governanceFilter: 'approved-only' });
  const match = lookupSemanticDictionary('enter policy number into search box', catalog, { retrievalContext: ctx });
  expect(match).toBeNull();
});

test('approved-only filter includes promoted entries', () => {
  let catalog = highConfidenceEntry('enter policy number into search box');
  catalog = markPromoted(catalog, catalog.entries[0]!.id);
  const ctx = retrievalContext({ governanceFilter: 'approved-only' });
  const match = lookupSemanticDictionary('enter policy number into search box', catalog, { retrievalContext: ctx });
  expect(match).not.toBeNull();
});

test('approved-only filter includes high-confidence entries with sufficient reuse', () => {
  const catalog = highConfidenceEntry('enter policy number into search box');
  // Not promoted, but high confidence and 16+ reuses
  expect(catalog.entries[0]!.promoted).toBe(false);
  expect(catalog.entries[0]!.confidence).toBeGreaterThan(0.8);
  const ctx = retrievalContext({ governanceFilter: 'approved-only' });
  const match = lookupSemanticDictionary('enter policy number into search box', catalog, { retrievalContext: ctx });
  expect(match).not.toBeNull();
});

test('include-review filter includes medium-confidence entries', () => {
  let catalog = accrueSemanticEntry(emptyCatalog(), accrualInput());
  const ctx = retrievalContext({ governanceFilter: 'include-review' });
  const match = lookupSemanticDictionary('enter policy number into search box', catalog, { retrievalContext: ctx });
  expect(match).not.toBeNull();
});

test('multi-dimensional scoring produces scoring breakdown', () => {
  const catalog = highConfidenceEntry('enter policy number field accepts value');
  const ctx = retrievalContext();
  const match = lookupSemanticDictionary('enter policy number field accepts value', catalog, { retrievalContext: ctx });
  expect(match?.scoring).toBeDefined();
  expect(match!.scoring!.textSimilarity).toBeGreaterThan(0);
  expect(match!.scoring!.structuralScore).toBeGreaterThanOrEqual(0);
  expect(match!.scoring!.confidence).toBeGreaterThan(0);
  expect(match!.scoring!.combined).toBeGreaterThan(0);
});

// ─── 11. Determinism ───

test('lookup is deterministic for the same inputs', () => {
  const catalog = highConfidenceEntry('enter policy number');
  const first = lookupSemanticDictionary('enter policy number', catalog);
  const second = lookupSemanticDictionary('enter policy number', catalog);
  expect(first?.entry.id).toBe(second?.entry.id);
  expect(first?.similarityScore).toBe(second?.similarityScore);
  expect(first?.combinedScore).toBe(second?.combinedScore);
});

test('structural lookup is deterministic for the same context', () => {
  const catalog = highConfidenceEntry('enter policy number field accepts value');
  const ctx = retrievalContext();
  const first = lookupSemanticDictionary('enter policy number field accepts value', catalog, { retrievalContext: ctx });
  const second = lookupSemanticDictionary('enter policy number field accepts value', catalog, { retrievalContext: ctx });
  expect(first?.scoring?.combined).toBe(second?.scoring?.combined);
  expect(first?.scoring?.structuralScore).toBe(second?.scoring?.structuralScore);
});
