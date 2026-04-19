import { expect, test } from '@playwright/test';
import { buildOperatorInboxItems, renderOperatorInboxMarkdown } from '../../product/application/agency/operator';
import type { ProposalBundle } from '../../product/domain/execution/types';
import type { WorkspaceCatalog } from '../../product/application/catalog';

function mockCatalog(): WorkspaceCatalog {
  const proposalA = {
    proposalId: 'proposal-a',
    stepIndex: 2,
    artifactType: 'hints' as const,
    category: 'needs-human' as const,
    targetPath: 'knowledge/screens/policy-search.hints.yaml',
    title: 'Capture policy number phrasing',
    patch: {
      screen: 'policy-search',
      element: 'policyNumberInput',
      alias: 'Policy ref',
    },
    evidenceIds: [],
    impactedSteps: [2],
    trustPolicy: { decision: 'review' as const, reasons: [] },
    certification: 'uncertified' as const,
    activation: { status: 'pending' as const, activatedAt: null, certifiedAt: null, reason: null },
    lineage: { runIds: ['run-1'], evidenceIds: [], sourceArtifactPaths: [] },
  };
  const proposalB = {
    ...proposalA,
    proposalId: 'proposal-b',
    title: 'Capture alternate policy phrasing',
    patch: {
      screen: 'policy-search',
      element: 'policyNumberInput',
      alias: 'Policy identifier',
    },
  };
  const bundle: ProposalBundle = {
    kind: 'proposal-bundle',
    version: 1,
    stage: 'proposal',
    scope: 'scenario',
    ids: {
      adoId: '10001' as never,
      suite: 'demo/policy-search',
      runId: 'run-1',
      dataset: null,
      runbook: null,
      resolutionControl: null,
    },
    fingerprints: { artifact: 'fp', content: 'fp', knowledge: 'fp', controls: 'fp', surface: 'fp', run: 'run-1' },
    lineage: { sources: [], parents: [], handshakes: [] },
    governance: 'review-required',
    payload: {
      adoId: '10001' as never,
      runId: 'run-1',
      revision: 1,
      title: 'Scenario',
      suite: 'demo/policy-search',
      proposals: [proposalA, proposalB],
    },
  } as unknown as ProposalBundle;

  return {
    approvalReceipts: [],
    proposalBundles: [{ artifact: bundle, artifactPath: 'generated/demo/policy-search/10001.proposals.json' }],
    runRecords: [{
      artifact: {
        adoId: '10001' as never,
        runId: 'run-1',
        completedAt: '2026-04-05T00:00:00.000Z',
        payload: { completedAt: '2026-04-05T00:00:00.000Z' },
        steps: [],
      },
      artifactPath: '.tesseract/runs/run-1/run.json',
    }],
    resolutionGraphRecords: [],
    improvementRuns: [],
    rerunPlans: [],
  } as unknown as WorkspaceCatalog;
}

test('operator inbox handoffs preserve competing candidates and participation metadata', () => {
  const items = buildOperatorInboxItems(mockCatalog());
  const proposalItem = items.find((item) => item.proposalId === 'proposal-a');

  expect(proposalItem).toBeTruthy();
  expect(proposalItem?.handoff?.requiredCapabilities).toContain('approve-proposals');
  expect(proposalItem?.handoff?.requiredAuthorities).toContain('approve-canonical-change');
  expect(proposalItem?.handoff?.nextMoves?.length).toBeGreaterThan(0);
  expect(proposalItem?.handoff?.competingCandidates?.some((candidate) => candidate.ref === 'proposal-b')).toBe(true);
  expect(proposalItem?.handoff?.semanticCore.driftStatus).toBe('preserved');
  expect(proposalItem?.handoff?.chain?.depth).toBe(1);
  expect(proposalItem?.handoff?.chain?.semanticCorePreserved).toBe(true);
  expect(proposalItem?.handoff?.chain?.driftDetectable).toBe(true);
  expect(proposalItem?.handoff?.chain?.competingCandidateCount).toBe(1);
});

test('operator inbox markdown renders the richer handoff vocabulary', () => {
  const markdown = renderOperatorInboxMarkdown(buildOperatorInboxItems(mockCatalog()));

  expect(markdown).toContain('Handoff required capabilities');
  expect(markdown).toContain('Handoff competing candidates');
  expect(markdown).toContain('Handoff chain');
  expect(markdown).toContain('proposal-b:review-required');
});
