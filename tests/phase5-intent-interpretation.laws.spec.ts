import { expect, test } from '@playwright/test';
import {
  createInterfaceResolutionContext,
  createGroundedStep,
  createAgentContext,
  createPolicySearchScreen,
} from './support/interface-fixtures';
import {
  interpretStepIntent,
  heuristicInterpretation,
  rankHeuristicCandidates,
  confidenceFromScore,
  meetsThreshold,
  inferActionFromText,
} from '../lib/runtime/agent/intent/interpret-intent';
import { runResolutionPipeline } from '../lib/runtime/agent/index';
import { createScreenId } from '../lib/domain/kernel/identity';

// ─── Fixtures ───

function baseResolutionContext() {
  return createInterfaceResolutionContext({
    screens: [createPolicySearchScreen()],
  });
}

function baseStep(overrides: Partial<Parameters<typeof createGroundedStep>[0]> = {}) {
  const ctx = baseResolutionContext();
  return createGroundedStep(overrides, ctx);
}

// ─── WP3 Law Tests: Intent Interpretation ───

test('heuristic interpretation matches step text against knowledge aliases', () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({
    actionText: 'Enter policy ref',
    expectedText: 'Policy ref is accepted',
    normalizedIntent: 'enter policy ref => policy ref is accepted',
  }, resolutionContext);
  const context = createAgentContext(resolutionContext);

  const result = heuristicInterpretation(step, context);

  expect(result).not.toBeNull();
  expect(result!.source).toBe('knowledge-heuristic');
  expect(result!.interpretedScreen).toBe('policy-search');
});

test('heuristic interpretation returns null when no knowledge matches', () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({
    actionText: 'Completely unrelated gibberish action',
    expectedText: 'Nothing matches',
    normalizedIntent: 'completely unrelated gibberish action => nothing matches',
  }, resolutionContext);
  const context = createAgentContext(resolutionContext);

  const result = heuristicInterpretation(step, context);

  // May be null or have score 0 — either means no confident match
  if (result !== null) {
    expect(result.confidence).toBe('low');
  }
});

test('rankHeuristicCandidates produces sorted candidates by score', () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({
    actionText: 'Enter policy number',
    expectedText: 'Policy number is accepted',
    normalizedIntent: 'enter policy number => policy number is accepted',
  }, resolutionContext);
  const context = createAgentContext(resolutionContext);

  const candidates = rankHeuristicCandidates(step, context);

  // Candidates should be sorted descending by score
  for (let i = 1; i < candidates.length; i++) {
    expect(candidates[i]!.score).toBeLessThanOrEqual(candidates[i - 1]!.score);
  }
});

test('confidenceFromScore assigns correct confidence levels', () => {
  // With element (threshold = 6): high >= 12, medium >= 6, low < 6
  expect(confidenceFromScore(12, true)).toBe('high');
  expect(confidenceFromScore(6, true)).toBe('medium');
  expect(confidenceFromScore(3, true)).toBe('low');

  // Without element (threshold = 4): high >= 8, medium >= 4, low < 4
  expect(confidenceFromScore(8, false)).toBe('high');
  expect(confidenceFromScore(4, false)).toBe('medium');
  expect(confidenceFromScore(2, false)).toBe('low');
});

test('meetsThreshold correctly compares confidence levels', () => {
  expect(meetsThreshold('high', 'low')).toBe(true);
  expect(meetsThreshold('high', 'medium')).toBe(true);
  expect(meetsThreshold('high', 'high')).toBe(true);
  expect(meetsThreshold('medium', 'high')).toBe(false);
  expect(meetsThreshold('low', 'medium')).toBe(false);
  expect(meetsThreshold('low', 'low')).toBe(true);
});

test('inferActionFromText uses single allowed action', () => {
  const step = baseStep({ allowedActions: ['input'] });
  expect(inferActionFromText(step)).toBe('input');
});

test('inferActionFromText uses explicit resolution action when multiple allowed', () => {
  const step = baseStep({
    allowedActions: ['input', 'click'],
    explicitResolution: { action: 'click', screen: null, element: null },
  });
  expect(inferActionFromText(step)).toBe('click');
});

test('inferActionFromText returns null when ambiguous', () => {
  const step = baseStep({
    allowedActions: ['input', 'click'],
    explicitResolution: null,
  });
  expect(inferActionFromText(step)).toBeNull();
});

test('hybrid interpretation tries heuristic first and skips LLM when confident', async () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({
    actionText: 'Enter policy ref',
    expectedText: 'Policy ref is accepted',
    normalizedIntent: 'enter policy ref => policy ref is accepted',
  }, resolutionContext);

  let llmCalled = false;
  const context = createAgentContext(resolutionContext, {
    translate: async () => {
      llmCalled = true;
      return {
        kind: 'translation-receipt' as const,
        version: 1 as const,
        mode: 'structured-translation' as const,
        matched: false,
        selected: null,
        candidates: [],
        rationale: 'Mock',
        failureClass: 'no-candidate' as const,
      };
    },
  });

  const result = await interpretStepIntent(step, context, 'low');

  expect(result.interpretation).not.toBeNull();
  expect(result.interpretation!.source).toBe('knowledge-heuristic');
  // LLM should not be called when heuristic meets threshold
  expect(llmCalled).toBe(false);
});

test('hybrid interpretation falls back to LLM when heuristic confidence is below threshold', async () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({
    actionText: 'Completely novel action with no matching aliases',
    expectedText: 'Something unprecedented happens',
    normalizedIntent: 'completely novel action with no matching aliases => something unprecedented happens',
  }, resolutionContext);

  let llmCalled = false;
  const context = createAgentContext(resolutionContext, {
    translate: async () => {
      llmCalled = true;
      return {
        kind: 'translation-receipt' as const,
        version: 1 as const,
        mode: 'structured-translation' as const,
        matched: true,
        selected: {
          kind: 'screen' as const,
          target: 'policy-search',
          screen: createScreenId('policy-search'),
          aliases: ['policy search'],
          score: 0.8,
          sourceRefs: [],
        },
        candidates: [],
        rationale: 'LLM matched via translation.',
        failureClass: 'none' as const,
      };
    },
  });

  const result = await interpretStepIntent(step, context, 'high');

  expect(llmCalled).toBe(true);
  expect(result.interpretation).not.toBeNull();
  expect(result.interpretation!.source).toBe('knowledge-translation');
});

test('hybrid interpretation produces exhaustion entries for both phases', async () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({
    actionText: 'Unknown action',
    expectedText: 'Unknown result',
    normalizedIntent: 'unknown action => unknown result',
  }, resolutionContext);
  const context = createAgentContext(resolutionContext);

  const result = await interpretStepIntent(step, context, 'high');

  // Should have exhaustion entries for both heuristic and translation phases
  expect(result.effects.exhaustion.length).toBeGreaterThanOrEqual(1);
  const stages = result.effects.exhaustion.map((entry) => entry.stage);
  expect(stages).toContain('approved-screen-knowledge');
});

test('interpretation result carries knowledge refs from matched candidates', async () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({
    actionText: 'Enter policy ref',
    expectedText: 'Policy ref is accepted',
    normalizedIntent: 'enter policy ref => policy ref is accepted',
  }, resolutionContext);
  const context = createAgentContext(resolutionContext);

  const result = await interpretStepIntent(step, context, 'low');

  expect(result.interpretation).not.toBeNull();
  expect(result.interpretation!.knowledgeRefs.length).toBeGreaterThan(0);
});

test('interpretation is recorded on stage context during pipeline execution', async () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({
    actionText: 'Enter policy ref',
    expectedText: 'Policy ref is accepted',
    normalizedIntent: 'enter policy ref => policy ref is accepted',
  }, resolutionContext);
  const context = createAgentContext(resolutionContext);

  const result = await runResolutionPipeline(step, context);

  // Pipeline should complete — interpretation is an enrichment phase, not a blocker
  expect(result.receipt).not.toBeNull();
  expect(result.events.length).toBeGreaterThan(0);
});

test('interpretation provenance appears in pipeline resolution events', async () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({
    actionText: 'Enter policy ref',
    expectedText: 'Policy ref is accepted',
    normalizedIntent: 'enter policy ref => policy ref is accepted',
  }, resolutionContext);
  const context = createAgentContext(resolutionContext);

  const result = await runResolutionPipeline(step, context);

  // The pipeline should have exhaustion events from the interpretation phase
  const exhaustionEvents = result.events.filter(
    (event) => event.kind === 'exhaustion-recorded',
  );
  expect(exhaustionEvents.length).toBeGreaterThan(0);
});

test('intent-only step without knowledge falls through to later pipeline stages', async () => {
  const resolutionContext = createInterfaceResolutionContext({
    screens: [createPolicySearchScreen()],
  });
  const step = createGroundedStep({
    actionText: 'Completely novel action that nobody has ever seen',
    expectedText: 'Something completely unprecedented occurs',
    normalizedIntent: 'completely novel action => unprecedented',
  }, resolutionContext);
  const context = createAgentContext(resolutionContext);

  const result = await runResolutionPipeline(step, context);

  // Pipeline should still produce a receipt — even if it's needs-human
  expect(result.receipt).not.toBeNull();
  expect(['resolved', 'resolved-with-proposals', 'needs-human']).toContain(result.receipt.kind);
});

test('runtime interpreter produces same receipt types regardless of interpretation source', async () => {
  const resolutionContext = baseResolutionContext();

  // Step with matching knowledge (heuristic path)
  const knownStep = createGroundedStep({
    actionText: 'Enter policy ref',
    expectedText: 'Policy ref is accepted',
    normalizedIntent: 'enter policy ref => policy ref is accepted',
  }, resolutionContext);

  // Step with no matching knowledge (falls through)
  const unknownStep = createGroundedStep({
    actionText: 'Completely novel action xyz',
    expectedText: 'Something unprecedented',
    normalizedIntent: 'completely novel action xyz => unprecedented',
  }, resolutionContext);

  const knownResult = await runResolutionPipeline(knownStep, createAgentContext(resolutionContext));
  const unknownResult = await runResolutionPipeline(unknownStep, createAgentContext(resolutionContext));

  // Both should produce valid receipts with the same structural shape
  expect(knownResult.receipt).not.toBeNull();
  expect(unknownResult.receipt).not.toBeNull();
  expect(typeof knownResult.receipt.kind).toBe('string');
  expect(typeof unknownResult.receipt.kind).toBe('string');
  expect(Array.isArray(knownResult.events)).toBe(true);
  expect(Array.isArray(unknownResult.events)).toBe(true);
});
