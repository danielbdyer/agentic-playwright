import { expect, test } from '@playwright/test';
import { applyProposalPatch, validatePatchedProposalArtifact } from '../../lib/application/knowledge/proposal-patches';
import type { ProposalEntry } from '../../lib/domain/execution/types';

function makeProposalEntry(input: {
  artifactType: ProposalEntry['artifactType'];
  targetPath: string;
  patch: Readonly<Record<string, unknown>>;
  enrichment?: ProposalEntry['enrichment'];
}): ProposalEntry {
  return {
    proposalId: 'proposal-1',
    stepIndex: 0,
    artifactType: input.artifactType,
    category: null,
    targetPath: input.targetPath,
    title: 'test proposal',
    patch: input.patch,
    enrichment: input.enrichment ?? null,
    evidenceIds: [],
    impactedSteps: [],
    trustPolicy: { decision: 'allow' } as ProposalEntry['trustPolicy'],
    certification: 'uncertified',
    activation: {
      status: 'activated',
      reason: 'test',
      activatedAt: '2026-04-05T00:00:00.000Z',
      certifiedAt: null,
    } as unknown as ProposalEntry['activation'],
    lineage: {
      runIds: [],
      evidenceIds: [],
      sourceArtifactPaths: [],
    } as unknown as ProposalEntry['lineage'],
  } as ProposalEntry;
}

test('hints patches are non-destructive for enriched semantics while merging aliases and locator ladders', () => {
  const existing = {
    screen: 'policy-search',
    elements: {
      searchButton: {
        aliases: ['Search'],
        role: 'button',
        affordance: 'click',
        locatorLadder: [
          { kind: 'role-name', role: 'button', name: 'Search' },
        ],
        source: 'human',
        epistemicStatus: 'observed',
        activationPolicy: 'manual-only',
      },
    },
  };

  const proposal = makeProposalEntry({
    artifactType: 'hints',
    targetPath: 'knowledge/screens/policy-search.hints.yaml',
    patch: {
      screen: 'policy-search',
      element: 'searchButton',
      alias: 'Find policy',
    },
    enrichment: {
      role: 'link',
      affordance: 'get-value',
      locatorLadder: [
        { kind: 'role-name', role: 'button', name: 'Search' },
        { kind: 'test-id', value: 'search-button' },
      ],
      source: 'agent',
      epistemicStatus: 'interpreted',
      activationPolicy: 'merge-locator-ladder',
    },
  });

  const merged = applyProposalPatch(existing, proposal);
  validatePatchedProposalArtifact(proposal.targetPath, proposal, merged);

  const element = (merged.elements as Record<string, Record<string, unknown>>).searchButton!;
  expect(element.aliases).toEqual(['Find policy', 'Search']);
  expect(element.role).toBe('button');
  expect(element.affordance).toBe('click');
  expect(element.source).toBe('human');
  expect(element.epistemicStatus).toBe('observed');
  expect(element.activationPolicy).toBe('manual-only');
  expect(element.locatorLadder).toHaveLength(2);
});

test('route knowledge patches merge new variants without overwriting reviewed route metadata', () => {
  const existing = {
    kind: 'route-knowledge',
    version: 1,
    governance: 'approved',
    app: 'demo',
    baseUrl: 'fixtures/demo-harness',
    routes: [{
      id: 'policy-search',
      screen: 'policy-search',
      entryUrl: '/policy-search.html',
      rootSelector: 'body',
      variants: [{
        id: 'default',
        screen: 'policy-search',
        url: '/policy-search.html',
        pathTemplate: '/policy-search.html',
        query: {},
        hash: null,
        tab: null,
        rootSelector: 'body',
        urlPattern: '/policy-search.html',
        dimensions: [],
        expectedEntryState: {
          requiredStateRefs: ['state:policy-search:search-form-visible'],
          forbiddenStateRefs: [],
        },
        historicalSuccess: {
          successCount: 4,
          failureCount: 0,
          lastSuccessAt: '2026-04-04T00:00:00.000Z',
        },
        state: {},
        mappedScreens: ['policy-search'],
      }],
    }],
  };

  const proposal = makeProposalEntry({
    artifactType: 'routes',
    targetPath: 'knowledge/routes/demo.routes.yaml',
    patch: {
      kind: 'route-knowledge',
      version: 1,
      governance: 'review-required',
      app: 'discover',
      routes: [{
        id: 'policy-search',
        screen: 'policy-search',
        entryUrl: '/policy-search.html?seed=POL-001',
        variants: [{
          id: 'results-with-policy',
          screen: 'policy-search',
          url: '/policy-search.html?seed=POL-001',
          pathTemplate: '/policy-search.html',
          query: { seed: 'POL-001' },
          hash: null,
          tab: null,
          rootSelector: 'body',
          urlPattern: '/policy-search.html?seed={seed}',
          dimensions: ['query'],
          expectedEntryState: {
            requiredStateRefs: ['state:policy-search:results-visible'],
            forbiddenStateRefs: [],
          },
          state: { seed: 'POL-001' },
          mappedScreens: ['policy-search'],
        }],
      }],
    },
  });

  const merged = applyProposalPatch(existing, proposal);
  validatePatchedProposalArtifact(proposal.targetPath, proposal, merged);

  expect(merged.kind).toBe('route-knowledge');
  expect(merged.app).toBe('demo');
  expect((merged.routes as readonly Record<string, unknown>[])).toHaveLength(1);

  const route = (merged.routes as readonly Record<string, unknown>[])[0]!;
  expect(route.entryUrl).toBe('/policy-search.html');

  const variants = route.variants as readonly Record<string, unknown>[];
  expect(variants).toHaveLength(2);
  expect(variants.map((variant) => variant.id)).toEqual(['default', 'results-with-policy']);
  expect(variants[1]!.query).toEqual({ seed: 'POL-001' });
});
