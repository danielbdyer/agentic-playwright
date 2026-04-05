import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { approveProposal } from '../../lib/application/governance/approve';
import { projectBenchmarkScorecard } from '../../lib/application/improvement/benchmark';
import { emitOperatorInbox } from '../../lib/application/agency/inbox';
import { generatedProposalsPath } from '../../lib/application/paths';
import { refreshScenario } from '../../lib/application/resolution/refresh';
import { proposalIdForEntry } from '../../lib/application/agency/operator';
import { runWithLocalServices, runWithLocalServicesDetailed } from '../../lib/composition/local-services';
import { createAdoId } from '../../lib/domain/kernel/identity';
import type { ProposalBundle } from '../../lib/domain/execution/types';
import { createTestWorkspace } from '../support/workspace';

function projectPath(value: string): string {
  return value.replace(/\\/g, '/');
}

test('persist and no-write refresh compute the same derived fingerprints while no-write records a would-write ledger', async () => {
  const workspace = createTestWorkspace('operator-no-write-law');

  try {
    const adoId = createAdoId('10001');
    const baseline = await runWithLocalServicesDetailed(
      refreshScenario({ adoId, paths: workspace.paths }),
      workspace.rootDir,
      {
        posture: {
          interpreterMode: 'dry-run',
          writeMode: 'no-write',
          headed: false,
        },
      },
    );
    const persisted = await runWithLocalServices(
      refreshScenario({ adoId, paths: workspace.paths }),
      workspace.rootDir,
    );

    expect(baseline.result.compile.compileSnapshot.surface.surfaceFingerprint)
      .toBe(persisted.compile.compileSnapshot.surface.surfaceFingerprint);
    expect(baseline.result.compile.graph.graph.fingerprint)
      .toBe(persisted.compile.graph.graph.fingerprint);
    expect(baseline.result.compile.generatedTypes.screens)
      .toEqual(persisted.compile.generatedTypes.screens);
    expect(baseline.wouldWrite.some((entry) => projectPath(entry.path).includes('generated/demo/policy-search/10001.spec.ts'))).toBeTruthy();
    expect(readFileSync(workspace.suiteResolve('generated', 'demo', 'policy-search', '10001.spec.ts'), 'utf8').replace(/^\uFEFF/, ''))
      .toContain('scenario-context');
    expect(baseline.wouldWrite.some((entry) => projectPath(entry.path).includes('generated/demo/policy-search/10001.spec.ts'))).toBeTruthy();
    expect(baseline.wouldWrite.some((entry) => projectPath(entry.path).includes('.tesseract/graph/index.json'))).toBeTruthy();
  } finally {
    workspace.cleanup();
  }
});

test('operator inbox, approval receipts, and rerun plans share a stable proposal identity', async () => {
  const workspace = createTestWorkspace('operator-approval-loop');

  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(
      refreshScenario({ adoId, paths: workspace.paths }),
      workspace.rootDir,
    );

    const proposal = {
      proposalId: '',
      stepIndex: 2,
      artifactType: 'hints' as const,
      targetPath: 'knowledge/screens/policy-search.hints.yaml',
      title: 'Capture policy number phrasing',
      patch: {
        screen: 'policy-search',
        element: 'policyNumberInput',
        alias: 'Policy ref',
      },
      evidenceIds: ['.tesseract/evidence/demo-policy-number.json'],
      impactedSteps: [2],
      trustPolicy: {
        decision: 'review' as const,
        reasons: [],
      },
      certification: 'uncertified' as const,
      activation: {
        status: 'pending' as const,
        activatedAt: null,
        certifiedAt: null,
        reason: null,
      },
      lineage: {
        runIds: ['seeded-run'],
        evidenceIds: ['.tesseract/evidence/demo-policy-number.json'],
        sourceArtifactPaths: ['.tesseract/tasks/10001.resolution.json'],
        role: null,
        state: null,
        driftSeed: null,
      },
    };
    proposal.proposalId = proposalIdForEntry(
      { adoId, suite: 'demo/policy-search' },
      proposal,
    );
    const bundle: ProposalBundle = {
      kind: 'proposal-bundle',
      version: 1,
      stage: 'proposal',
      scope: 'scenario',
      ids: {
        adoId,
        suite: 'demo/policy-search',
        runId: 'seeded-run',
        dataset: null,
        runbook: null,
        resolutionControl: null,
      },
      fingerprints: {
        artifact: 'seeded-run:proposal',
        content: 'sha256:seeded',
        knowledge: 'sha256:knowledge',
        controls: 'sha256:controls',
        task: 'sha256:task',
        run: 'seeded-run',
      },
      lineage: {
        sources: ['generated/demo/policy-search/10001.proposals.json'],
        parents: ['sha256:task'],
        handshakes: ['preparation', 'resolution', 'execution', 'evidence', 'proposal'],
      },
      governance: 'review-required',
      payload: {
        adoId,
        runId: 'seeded-run',
        revision: 1,
        title: 'Verify policy search returns matching policy',
        suite: 'demo/policy-search',
        proposals: [proposal],
      },
      adoId,
      runId: 'seeded-run',
      revision: 1,
      title: 'Verify policy search returns matching policy',
      suite: 'demo/policy-search',
      proposals: [proposal],
    };
    const bundlePath = generatedProposalsPath(workspace.paths, 'demo/policy-search', adoId);
    mkdirSync(path.dirname(bundlePath), { recursive: true });
    writeFileSync(bundlePath, JSON.stringify(bundle, null, 2), 'utf8');

    const inbox = await runWithLocalServices(
      emitOperatorInbox({ paths: workspace.paths, filter: { adoId: '10001' } }),
      workspace.rootDir,
    );
    const hotspotIndex = workspace.readJson<{ kind: string; hotspots: Array<{ suggestions: Array<{ target: string }> }> }>('.tesseract', 'inbox', 'hotspots.json');
    const inboxProposal = inbox.items.find((item) => item.proposalId === proposal.proposalId) ?? null;
    expect(inboxProposal).toBeTruthy();
    expect(inboxProposal?.status).toBe('actionable');
    expect(hotspotIndex.kind).toBe('workflow-hotspot-index');
    expect(hotspotIndex.hotspots.every((entry) => entry.suggestions.length > 0)).toBeTruthy();

    const approved = await runWithLocalServices(
      approveProposal({ paths: workspace.paths, proposalId: proposal.proposalId }),
      workspace.rootDir,
    );
    const hintsText = readFileSync(workspace.resolve('knowledge', 'screens', 'policy-search.hints.yaml'), 'utf8').replace(/^\uFEFF/, '');
    const approvalText = readFileSync(approved.receiptPath, 'utf8').replace(/^\uFEFF/, '');

    expect(hintsText).toContain('Policy ref');
    expect(approved.receipt.proposalId).toBe(proposal.proposalId);
    expect(approved.rerunPlan.sourceProposalId).toBe(proposal.proposalId);
    expect(approved.rerunPlan.impactedScenarioIds).toContain('10001');
    expect(approvalText).toContain(proposal.proposalId);
    expect(approved.inbox.items.find((item) => item.proposalId === proposal.proposalId)?.status).toBe('approved');
  } finally {
    workspace.cleanup();
  }
});

test('benchmark scorecard projects a 20+ field benchmark surface with readable variants', async () => {
  const workspace = createTestWorkspace('operator-benchmark');

  try {
    const result = await runWithLocalServices(
      projectBenchmarkScorecard({
        paths: workspace.paths,
        benchmarkName: 'flagship-policy-journey',
        includeExecution: false,
      }),
      workspace.rootDir,
    );
    const scorecard = JSON.parse(readFileSync(result.scorecardJsonPath, 'utf8').replace(/^\uFEFF/, '')) as {
      uniqueFieldAwarenessCount: number;
      generatedVariantCount: number;
      thresholdStatus: string;
    };
    const variantsSpec = readFileSync(result.variantsSpecPath, 'utf8').replace(/^\uFEFF/, '');
    const scorecardMarkdown = readFileSync(result.scorecardMarkdownPath, 'utf8').replace(/^\uFEFF/, '');

    expect(scorecard.uniqueFieldAwarenessCount).toBeGreaterThanOrEqual(24);
    expect(scorecard.generatedVariantCount).toBeGreaterThan(0);
    expect(['pass', 'warn', 'fail']).toContain(scorecard.thresholdStatus);
    expect(variantsSpec).toContain("workflow.screen('coverage-details').element('policyNumberInput').input");
    expect(scorecardMarkdown).toContain('Next commands: tesseract benchmark --benchmark flagship-policy-journey');
  } finally {
    workspace.cleanup();
  }
});

test('ci-batch posture forbids proposal approval', async () => {
  const workspace = createTestWorkspace('operator-ci-batch-approval');

  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(
      refreshScenario({ adoId, paths: workspace.paths }),
      workspace.rootDir,
    );

    const proposal = {
      proposalId: '',
      stepIndex: 2,
      artifactType: 'hints' as const,
      targetPath: 'knowledge/screens/policy-search.hints.yaml',
      title: 'Capture policy number phrasing',
      patch: {
        screen: 'policy-search',
        element: 'policyNumberInput',
        alias: 'Policy ref',
      },
      evidenceIds: ['.tesseract/evidence/demo-policy-number.json'],
      impactedSteps: [2],
      trustPolicy: {
        decision: 'review' as const,
        reasons: [],
      },
      certification: 'uncertified' as const,
      activation: {
        status: 'pending' as const,
        activatedAt: null,
        certifiedAt: null,
        reason: null,
      },
      lineage: {
        runIds: ['seeded-run'],
        evidenceIds: ['.tesseract/evidence/demo-policy-number.json'],
        sourceArtifactPaths: ['.tesseract/tasks/10001.resolution.json'],
        role: null,
        state: null,
        driftSeed: null,
      },
    };
    proposal.proposalId = proposalIdForEntry(
      { adoId, suite: 'demo/policy-search' },
      proposal,
    );
    const bundle: ProposalBundle = {
      kind: 'proposal-bundle',
      version: 1,
      stage: 'proposal',
      scope: 'scenario',
      ids: {
        adoId,
        suite: 'demo/policy-search',
        runId: 'seeded-run',
        dataset: null,
        runbook: null,
        resolutionControl: null,
      },
      fingerprints: {
        artifact: 'seeded-run:proposal',
        content: 'sha256:seeded',
        knowledge: 'sha256:knowledge',
        controls: 'sha256:controls',
        task: 'sha256:task',
        run: 'seeded-run',
      },
      lineage: {
        sources: ['generated/demo/policy-search/10001.proposals.json'],
        parents: ['sha256:task'],
        handshakes: ['preparation', 'resolution', 'execution', 'evidence', 'proposal'],
      },
      governance: 'review-required',
      payload: {
        adoId,
        runId: 'seeded-run',
        revision: 1,
        title: 'Verify policy search returns matching policy',
        suite: 'demo/policy-search',
        proposals: [proposal],
      },
      adoId,
      runId: 'seeded-run',
      revision: 1,
      title: 'Verify policy search returns matching policy',
      suite: 'demo/policy-search',
      proposals: [proposal],
    };
    const bundlePath = generatedProposalsPath(workspace.paths, 'demo/policy-search', adoId);
    mkdirSync(path.dirname(bundlePath), { recursive: true });
    writeFileSync(bundlePath, JSON.stringify(bundle, null, 2), 'utf8');

    await expect(async () => {
      await runWithLocalServices(
        approveProposal({ paths: workspace.paths, proposalId: proposal.proposalId }),
        workspace.rootDir,
        {
          posture: {
            executionProfile: 'ci-batch',
          },
        },
      );
    }).rejects.toThrow('Approvals are disabled in ci-batch execution profile');
  } finally {
    workspace.cleanup();
  }
});
