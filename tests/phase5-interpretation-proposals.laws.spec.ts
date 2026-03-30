import { expect, test } from '@playwright/test';
import {
  createInterfaceResolutionContext,
  createGroundedStep,
  createPolicySearchScreen,
  createPolicySearchElement,
} from './support/interface-fixtures';
import { proposalsFromInterpretation, proposalForSupplementGap } from '../lib/runtime/agent/proposals';
import type { IntentInterpretation } from '../lib/runtime/agent/types';
import { createScreenId, createElementId } from '../lib/domain/identity';

// ─── Fixtures ───

function baseResolutionContext() {
  return createInterfaceResolutionContext({
    screens: [createPolicySearchScreen()],
  });
}

function createInterpretation(overrides: Partial<IntentInterpretation> = {}): IntentInterpretation {
  return {
    stepText: 'Enter policy ref',
    interpretedAction: 'input',
    interpretedScreen: createScreenId('policy-search'),
    interpretedElement: createElementId('policyNumberInput'),
    interpretedPosture: null,
    confidence: 'high',
    source: 'knowledge-translation',
    knowledgeRefs: ['knowledge/screens/policy-search.elements.yaml'],
    ...overrides,
  };
}

// ─── WP4 Law Tests: Interpretation-Based Proposals ───

test('proposalsFromInterpretation generates hint alias when element matches', () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({
    actionText: 'Type in the policy reference number',
    expectedText: 'Reference accepted',
    normalizedIntent: 'type in the policy reference number => reference accepted',
  }, resolutionContext);

  const interpretation = createInterpretation({
    stepText: 'Type in the policy reference number',
    source: 'knowledge-translation',
  });

  const proposals = proposalsFromInterpretation(step, interpretation, resolutionContext);

  expect(proposals.length).toBeGreaterThan(0);
  const hintProposal = proposals.find((p) => p.artifactType === 'hints' && p.patch.element);
  expect(hintProposal).toBeDefined();
  expect(hintProposal!.patch.screen).toBe('policy-search');
  expect(hintProposal!.patch.element).toBe('policyNumberInput');
  expect(hintProposal!.patch.alias).toBe('Type in the policy reference number');
});

test('proposalsFromInterpretation carries interpretation source in patch', () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({
    actionText: 'Novel phrasing for policy ref',
  }, resolutionContext);

  const interpretation = createInterpretation({
    source: 'dom-exploration',
  });

  const proposals = proposalsFromInterpretation(step, interpretation, resolutionContext);

  const hintProposal = proposals.find((p) => p.patch.element);
  expect(hintProposal?.patch.source).toBe('dom-exploration');
});

test('proposalsFromInterpretation skips when element alias already exists', () => {
  const resolutionContext = baseResolutionContext();
  // Use the exact alias that already exists on the element
  const existingElement = resolutionContext.screens[0]!.elements[0]!;
  const existingAlias = existingElement.aliases[0]!;

  const step = createGroundedStep({
    actionText: existingAlias,
  }, resolutionContext);

  const interpretation = createInterpretation({
    stepText: existingAlias,
    source: 'knowledge-translation',
  });

  const proposals = proposalsFromInterpretation(step, interpretation, resolutionContext);

  // Should not propose alias that already exists
  const elementAliasProposal = proposals.find(
    (p) => p.patch.element && p.patch.alias === existingAlias,
  );
  expect(elementAliasProposal).toBeUndefined();
});

test('proposalsFromInterpretation returns empty when no screen matches', () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({}, resolutionContext);

  const interpretation = createInterpretation({
    interpretedScreen: createScreenId('nonexistent-screen'),
  });

  const proposals = proposalsFromInterpretation(step, interpretation, resolutionContext);
  expect(proposals).toHaveLength(0);
});

test('proposalsFromInterpretation returns empty when screen is null', () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({}, resolutionContext);

  const interpretation = createInterpretation({
    interpretedScreen: null,
  });

  const proposals = proposalsFromInterpretation(step, interpretation, resolutionContext);
  expect(proposals).toHaveLength(0);
});

test('proposalsFromInterpretation generates screen alias for non-heuristic sources', () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({
    actionText: 'Completely novel screen phrasing',
  }, resolutionContext);

  const interpretation = createInterpretation({
    source: 'knowledge-translation',
    interpretedElement: null,
  });

  const proposals = proposalsFromInterpretation(step, interpretation, resolutionContext);

  const screenAlias = proposals.find((p) => p.patch.screenAlias);
  expect(screenAlias).toBeDefined();
  expect(screenAlias!.patch.screenAlias).toBe('Completely novel screen phrasing');
});

test('proposalsFromInterpretation skips screen alias for knowledge-heuristic source', () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({
    actionText: 'Novel phrasing',
  }, resolutionContext);

  const interpretation = createInterpretation({
    source: 'knowledge-heuristic',
    interpretedElement: null,
  });

  const proposals = proposalsFromInterpretation(step, interpretation, resolutionContext);

  // Heuristic source means knowledge already matched — no screen alias needed
  const screenAlias = proposals.find((p) => p.patch.screenAlias);
  expect(screenAlias).toBeUndefined();
});

test('proposals carry provenance showing runtime interpretation source', () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({
    actionText: 'Enter the policy ID number',
  }, resolutionContext);

  const interpretation = createInterpretation({
    source: 'dom-exploration',
  });

  const proposals = proposalsFromInterpretation(step, interpretation, resolutionContext);

  for (const proposal of proposals) {
    expect(proposal.rationale).toContain('DOM exploration');
    expect(proposal.patch.source).toBe('dom-exploration');
    expect(proposal.title).toContain('dom-exploration');
  }
});

test('proposalForSupplementGap still works independently', () => {
  const screen = createPolicySearchScreen();
  const element = createPolicySearchElement();
  const step = createGroundedStep({
    actionText: 'Enter policy number',
  }, createInterfaceResolutionContext({ screens: [screen] }));

  const proposals = proposalForSupplementGap(step, screen, element);

  expect(proposals).toHaveLength(1);
  expect(proposals[0]!.artifactType).toBe('hints');
  expect(proposals[0]!.patch.screen).toBe('policy-search');
  expect(proposals[0]!.patch.element).toBe('policyNumberInput');
});

test('proposals pass trust-policy evaluation shape', () => {
  const resolutionContext = baseResolutionContext();
  const step = createGroundedStep({
    actionText: 'Type the policy ID',
  }, resolutionContext);

  const interpretation = createInterpretation({
    source: 'knowledge-translation',
  });

  const proposals = proposalsFromInterpretation(step, interpretation, resolutionContext);

  for (const proposal of proposals) {
    // Every proposal must have the required fields for trust-policy evaluation
    expect(typeof proposal.artifactType).toBe('string');
    expect(typeof proposal.targetPath).toBe('string');
    expect(typeof proposal.title).toBe('string');
    expect(typeof proposal.rationale).toBe('string');
    expect(proposal.patch).toBeDefined();
  }
});
