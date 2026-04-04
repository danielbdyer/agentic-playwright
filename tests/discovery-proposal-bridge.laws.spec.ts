/**
 * W2.8 — Discovery-to-Proposal Bridge Law Tests
 *
 * Laws verified:
 * 1. Completeness: every element produces exactly one ScreenElements proposal
 * 2. Hint coverage: every element with an accessible name produces a ScreenHints proposal
 * 3. Behavior coverage: every surface produces exactly one ScreenBehavior proposal
 * 4. No duplicates: proposal keys are unique within a bundle
 * 5. Empty discovery produces no bundles
 * 6. Proposal metadata points back to the correct discovery run
 * 7. Proposal count determinism: same input always yields same output count
 */

import { expect, test } from '@playwright/test';
import {
  generateProposalsFromDiscovery,
  type ProposalBundle,
  type DiscoveryProposal,
} from '../lib/application/governance/discovery-proposal-bridge';
import type { DiscoveryRun, DiscoveryObservedElement, DiscoveryObservedSurface } from '../lib/domain/target/interface-graph';
import type { CanonicalTargetRef, ElementId, ScreenId, SectionId, SurfaceId } from '../lib/domain/kernel/identity';
import { createScreenId, createElementId, createSurfaceId, createSectionId, createCanonicalTargetRef } from '../lib/domain/kernel/identity';
import { mulberry32, pick, randomWord, randomInt , LAW_SEED_COUNT } from './support/random';

// ─── Helpers ───


function makeScreenId(next: () => number): ScreenId {
  return createScreenId(`screen-${randomWord(next)}`);
}

function makeSurfaceId(next: () => number): SurfaceId {
  return createSurfaceId(`surface-${randomWord(next)}`);
}

function _makeElementId(next: () => number): ElementId {
  return createElementId(`element-${randomWord(next)}`);
}

function makeSectionId(next: () => number): SectionId {
  return createSectionId(`section-${randomWord(next)}`);
}

function makeTargetRef(screen: ScreenId, kind: string, id: string): CanonicalTargetRef {
  return createCanonicalTargetRef(`target:${kind}:${screen}:${id}`);
}

function randomSurface(next: () => number, screen: ScreenId): DiscoveryObservedSurface {
  const surfaceId = makeSurfaceId(next);
  return {
    id: surfaceId,
    targetRef: makeTargetRef(screen, 'surface', surfaceId),
    section: makeSectionId(next),
    selector: `[data-testid="${randomWord(next)}"]`,
    role: pick(next, ['main', 'form', 'region', null]),
    name: next() > 0.3 ? `Surface ${randomWord(next)}` : null,
    kind: pick(next, ['form', 'screen-root', 'action-cluster', 'section-root'] as const),
    assertions: next() > 0.5 ? ['state' as const] : [],
    testId: next() > 0.5 ? `tid-${randomWord(next)}` : null,
  };
}

let elementCounter = 0;

function randomElement(next: () => number, screen: ScreenId): DiscoveryObservedElement {
  const elementId = createElementId(`element-${randomWord(next)}-${elementCounter++}`) as ElementId;
  const surfaceId = makeSurfaceId(next);
  const hasName = next() > 0.3;
  return {
    id: elementId,
    targetRef: makeTargetRef(screen, 'element', elementId),
    surface: surfaceId,
    selector: `[data-testid="${randomWord(next)}"]`,
    role: pick(next, ['textbox', 'button', 'checkbox', 'combobox', 'link']),
    name: hasName ? `Element ${randomWord(next)}` : null,
    testId: next() > 0.5 ? `tid-${randomWord(next)}` : null,
    widget: pick(next, ['text-input', 'button', 'checkbox', 'combobox']),
    required: next() > 0.5,
    locatorHint: pick(next, ['test-id', 'role-name', 'css'] as const),
    locatorCandidates: [{ kind: 'test-id' as const, value: `loc-${randomWord(next)}` }],
  };
}

function makeDiscoveryRun(
  next: () => number,
  overrides?: {
    readonly elements?: readonly DiscoveryObservedElement[];
    readonly surfaces?: readonly DiscoveryObservedSurface[];
  },
): DiscoveryRun {
  const screen = makeScreenId(next);
  const elementCount = overrides?.elements ? undefined : randomInt(next, 8);
  const surfaceCount = overrides?.surfaces ? undefined : randomInt(next, 5);
  const elements = overrides?.elements ?? Array.from({ length: elementCount! }, () => randomElement(next, screen));
  const surfaces = overrides?.surfaces ?? Array.from({ length: surfaceCount! }, () => randomSurface(next, screen));

  return {
    kind: 'discovery-run',
    version: 2,
    stage: 'preparation',
    scope: 'workspace',
    governance: 'approved',
    app: 'test-app',
    routeId: `route-${randomWord(next)}` as any,
    variantId: `variant-${randomWord(next)}` as any,
    routeVariantRef: `route-variant:test`,
    runId: `run-${randomWord(next)}-${randomInt(next, 10000)}`,
    screen,
    url: `https://app.test/${randomWord(next)}`,
    title: `Test page ${randomWord(next)}`,
    discoveredAt: new Date().toISOString(),
    artifactPath: `test/path/${randomWord(next)}`,
    rootSelector: 'body',
    snapshotHash: `hash-${randomWord(next)}`,
    sections: [],
    surfaces,
    elements,
    snapshotAnchors: [],
    targets: [],
    reviewNotes: [],
    selectorProbes: [],
    stateObservations: [],
    eventCandidates: [],
    transitionObservations: [],
    observationDiffs: [],
    graphDeltas: { nodeIds: [], edgeIds: [] },
  };
}

function allProposals(bundles: readonly ProposalBundle[]): readonly DiscoveryProposal[] {
  return bundles.flatMap((bundle) => bundle.proposals);
}

function proposalKey(proposal: DiscoveryProposal): string {
  return `${proposal.proposalKind}:${proposal.targetPath}:${proposal.sourceElementId ?? ''}:${proposal.sourceSurfaceId ?? ''}`;
}

// ─── Law 1: Element completeness ───

test.describe('Law 1: Every element produces a ScreenElements proposal', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const run = makeDiscoveryRun(next);
      const bundles = generateProposalsFromDiscovery(run);
      const proposals = allProposals(bundles);
      const elementProposals = proposals.filter((p) => p.proposalKind === 'screen-elements');

      for (const element of run.elements) {
        const matching = elementProposals.filter((p) => p.sourceElementId === element.id);
        expect(matching.length).toBe(1);
      }
    });
  }
});

// ─── Law 2: Hint coverage — elements with accessible names get hints ───

test.describe('Law 2: Elements with accessible names produce ScreenHints proposals', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const run = makeDiscoveryRun(next);
      const bundles = generateProposalsFromDiscovery(run);
      const proposals = allProposals(bundles);
      const hintProposals = proposals.filter((p) => p.proposalKind === 'screen-hints');

      const elementsWithNames = run.elements.filter((e) => e.name !== null);
      const elementsWithoutNames = run.elements.filter((e) => e.name === null);

      for (const element of elementsWithNames) {
        const matching = hintProposals.filter((p) => p.sourceElementId === element.id);
        expect(matching.length).toBe(1);
      }

      for (const element of elementsWithoutNames) {
        const matching = hintProposals.filter((p) => p.sourceElementId === element.id);
        expect(matching.length).toBe(0);
      }
    });
  }
});

// ─── Law 3: Behavior coverage — every surface gets a ScreenBehavior proposal ───

test.describe('Law 3: Every surface produces a ScreenBehavior proposal', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const run = makeDiscoveryRun(next);
      const bundles = generateProposalsFromDiscovery(run);
      const proposals = allProposals(bundles);
      const behaviorProposals = proposals.filter((p) => p.proposalKind === 'screen-behavior');

      for (const surface of run.surfaces) {
        const matching = behaviorProposals.filter((p) => p.sourceSurfaceId === surface.id);
        expect(matching.length).toBe(1);
      }
    });
  }
});

// ─── Law 4: No duplicates — proposal keys are unique ───

test.describe('Law 4: No duplicate proposals within a bundle', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const run = makeDiscoveryRun(next);
      const bundles = generateProposalsFromDiscovery(run);
      const proposals = allProposals(bundles);
      const keys = proposals.map(proposalKey);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });
  }
});

// ─── Law 5: Empty discovery still produces route proposal ───

test.describe('Law 5: Empty discovery still emits route knowledge proposal', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const run = makeDiscoveryRun(next, { elements: [], surfaces: [] });
      const bundles = generateProposalsFromDiscovery(run);
      expect(bundles.length).toBe(1);
      const proposals = allProposals(bundles);
      expect(proposals).toHaveLength(1);
      expect(proposals[0]!.proposalKind).toBe('route-knowledge');
    });
  }
});

// ─── Law 6: Proposal metadata references the correct discovery run ───

test.describe('Law 6: All proposals reference the correct discoveryRunId', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const run = makeDiscoveryRun(next);
      const bundles = generateProposalsFromDiscovery(run);

      for (const bundle of bundles) {
        expect(bundle.discoveryRunId).toBe(run.runId);
        expect(bundle.screen).toBe(run.screen);
        for (const proposal of bundle.proposals) {
          expect(proposal.discoveryRunId).toBe(run.runId);
        }
      }
    });
  }
});

// ─── Law 7: Determinism — same input always yields same output count ───

test.describe('Law 7: Deterministic output for identical input', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next1 = mulberry32(seed);
      const run = makeDiscoveryRun(next1);
      const bundles1 = generateProposalsFromDiscovery(run);
      const bundles2 = generateProposalsFromDiscovery(run);

      const proposals1 = allProposals(bundles1);
      const proposals2 = allProposals(bundles2);

      expect(proposals1.length).toBe(proposals2.length);
      for (let i = 0; i < proposals1.length; i++) {
        expect(proposals1[i]!.proposalKind).toBe(proposals2[i]!.proposalKind);
        expect(proposals1[i]!.sourceElementId).toBe(proposals2[i]!.sourceElementId);
        expect(proposals1[i]!.sourceSurfaceId).toBe(proposals2[i]!.sourceSurfaceId);
      }
    });
  }
});

test('Law 8: Route proposal includes confidence, evidence, and impacted screens', () => {
  const next = mulberry32(7);
  const run = makeDiscoveryRun(next);
  const proposals = allProposals(generateProposalsFromDiscovery(run));
  const routeProposal = proposals.find((proposal) => proposal.proposalKind === 'route-knowledge');
  expect(routeProposal).toBeTruthy();
  expect(routeProposal!.confidence).toBe('low');
  expect(routeProposal!.evidenceIds).toContain(`discovery-run:${run.runId}`);
  expect(routeProposal!.impactedScreens).toEqual([run.screen]);
});
