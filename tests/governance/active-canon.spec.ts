import { expect, test } from '@playwright/test';
import YAML from 'yaml';
import { activateProposalBundle } from '../../lib/application/knowledge/activate-proposals';
import {
  createProposalBundleEnvelope,
  createScenarioEnvelopeFingerprints,
  createScenarioEnvelopeIds,
} from '../../lib/application/catalog/envelope';
import { runWithLocalServices } from '../../lib/composition/local-services';
import { createAdoId } from '../../lib/domain/kernel/identity';
import type { ProposalBundle, ProposalEntry } from '../../lib/domain/execution/types';
import { createTestWorkspace } from '../support/workspace';

function proposalBundleWithDecision(decision: ProposalEntry['trustPolicy']['decision']): ProposalBundle {
  const proposal: ProposalEntry = {
    proposalId: `proposal-${decision}`,
    stepIndex: 3,
    artifactType: 'hints',
    targetPath: 'knowledge/screens/policy-search.hints.yaml',
    title: `Capture ${decision} alias`,
    patch: {
      screen: 'policy-search',
      element: 'searchButton',
      alias: `Search alias ${decision}`,
    },
    evidenceIds: ['.tesseract/evidence/runs/10001/run-1/step-3-0.json'],
    impactedSteps: [3],
    trustPolicy: {
      decision,
      reasons: [],
    },
    certification: 'uncertified',
    activation: {
      status: 'pending',
      activatedAt: null,
      certifiedAt: null,
      reason: null,
    },
    lineage: {
      runIds: ['run-1'],
      evidenceIds: ['.tesseract/evidence/runs/10001/run-1/step-3-0.json'],
      sourceArtifactPaths: ['.tesseract/tasks/10001.runtime.json'],
      role: 'csr',
      state: 'quoted',
      driftSeed: 'seed-1',
    },
  };

  return createProposalBundleEnvelope({
    ids: createScenarioEnvelopeIds({
      adoId: createAdoId('10001'),
      suite: 'demo/policy-search',
      runId: 'run-1',
      dataset: 'demo-default',
      runbook: 'demo-smoke',
      resolutionControl: 'demo-policy-search',
    }),
    fingerprints: createScenarioEnvelopeFingerprints({
      artifact: 'run-1:proposal',
      content: 'sha256:content',
      knowledge: 'sha256:knowledge',
      controls: 'sha256:controls',
      task: 'sha256:task',
      run: 'run-1',
    }),
    lineage: {
      sources: ['.tesseract/tasks/10001.runtime.json'],
      parents: ['sha256:task', 'run-1'],
      handshakes: ['preparation', 'resolution', 'execution', 'evidence', 'proposal'],
    },
    governance: 'approved',
    payload: {
      adoId: createAdoId('10001'),
      runId: 'run-1',
      revision: 1,
      title: 'Verify policy search returns matching policy',
      suite: 'demo/policy-search',
      proposals: [proposal],
    },
    proposals: [proposal],
  });
}

test('activateProposalBundle keeps review proposals active in canon without certification', async () => {
  const workspace = createTestWorkspace('active-canon-review');
  try {
    const result = await runWithLocalServices(activateProposalBundle({
      paths: workspace.paths,
      proposalBundle: proposalBundleWithDecision('review'),
    }), workspace.rootDir);

    expect(result.blockedProposalIds).toEqual([]);
    expect(result.proposalBundle.governance).toBe('approved');
    expect(result.proposalBundle.payload.proposals[0]?.activation.status).toBe('activated');
    expect(result.proposalBundle.payload.proposals[0]?.certification).toBe('uncertified');

    const hints = YAML.parse(workspace.suiteReadText('knowledge', 'screens', 'policy-search.hints.yaml')) as {
      elements: Record<string, { aliases: string[]; acquired?: { certification: string; lineage: { role?: string | null } } }>;
    };
    expect(hints.elements.searchButton!.aliases).toContain('Search alias review');
    expect(hints.elements.searchButton!.acquired?.certification).toBe('uncertified');
    expect(hints.elements.searchButton!.acquired?.lineage.role).toBe('csr');
  } finally {
    workspace.cleanup();
  }
});

test('activateProposalBundle blocks deny proposals per trust policy', async () => {
  const workspace = createTestWorkspace('active-canon-deny');
  try {
    const result = await runWithLocalServices(activateProposalBundle({
      paths: workspace.paths,
      proposalBundle: proposalBundleWithDecision('deny'),
    }), workspace.rootDir);

    expect(result.blockedProposalIds).toContain('proposal-deny');
    expect(result.proposalBundle.payload.proposals[0]?.activation.status).toBe('blocked');
  } finally {
    workspace.cleanup();
  }
});
