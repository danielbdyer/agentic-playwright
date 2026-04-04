import { expect, test } from '@playwright/test';
import { loadWorkspaceCatalog } from '../lib/application/catalog';
import { buildProposals } from '../lib/application/commitment/build-proposals';
import { buildRunRecord } from '../lib/application/commitment/build-run-record';
import { foldScenarioRun } from '../lib/application/commitment/fold';
import { selectRunContext } from '../lib/application/commitment/select-run-context';
import { runWithLocalServices } from '../lib/composition/local-services';
import { refreshScenario } from '../lib/application/workspace/refresh';
import { createAdoId } from '../lib/domain/kernel/identity';
import type { ScenarioRunPlan } from '../lib/domain/resolution/types';
import type { RuntimeScenarioStepResult } from '../lib/application/ports';
import type { PersistedEvidenceArtifact } from '../lib/application/commitment/persist-evidence';
import { createInterfaceResolutionContext } from './support/interface-fixtures';
import { createTestWorkspace } from './support/workspace';

function fakePlan(runId: string, options?: { withRunbookAndDataset?: boolean }): ScenarioRunPlan {
  const withRunbookAndDataset = options?.withRunbookAndDataset ?? false;
  return {
    kind: 'scenario-run-plan',
    version: 1,
    adoId: createAdoId('10001'),
    runId,
    surfaceFingerprint: 'sha256:task',
    title: 'Scenario',
    suite: 'Demo',
    controlsFingerprint: 'sha256:controls',
    posture: {
      interpreterMode: 'diagnostic',
      writeMode: 'persist',
      headed: false,
      executionProfile: 'ci-batch',
    },
    mode: 'diagnostic',
    steps: [],
    resolutionContext: createInterfaceResolutionContext(),
    screenIds: [],
    fixtures: {},
    context: {
      adoId: createAdoId('10001'),
      revision: 1,
      contentHash: 'sha256:content',
    },
    controlSelection: {
      runbook: withRunbookAndDataset ? 'smoke-runbook' : null,
      dataset: withRunbookAndDataset ? 'smoke-dataset' : null,
      resolutionControl: withRunbookAndDataset ? 'default-resolution' : null,
    },
    controlArtifactPaths: {
      runbook: withRunbookAndDataset ? 'controls/runbooks/smoke.runbook.yaml' : null,
      dataset: withRunbookAndDataset ? 'controls/datasets/smoke.dataset.yaml' : null,
    },
    translationEnabled: true,
    translationCacheEnabled: true,
    providerId: 'deterministic-runtime-step-agent',
  };
}

function fakeStepResult(input: {
  stepIndex: number;
  interpretationKind: 'resolved' | 'resolved-with-proposals' | 'needs-human';
  status?: 'ok' | 'failed';
}): RuntimeScenarioStepResult {
  return {
    interpretation: {
      kind: input.interpretationKind,
      stepIndex: input.stepIndex,
      runAt: '2024-01-01T00:00:00.000Z',
      proposalDrafts: [],
      evidenceDrafts: [],
    },
    execution: {
      stepIndex: input.stepIndex,
      runAt: '2024-01-01T00:00:01.000Z',
      execution: {
        status: input.status ?? 'ok',
      },
    },
  } as unknown as RuntimeScenarioStepResult;
}

function fakeFold(plan: ScenarioRunPlan, stepResults: RuntimeScenarioStepResult[], evidenceWrites: PersistedEvidenceArtifact[]) {
  return foldScenarioRun({ plan, stepResults, evidenceWrites });
}

test('selectRunContext keeps run selection precedence: CLI mode > runbook mode > posture mode', async () => {
  const workspace = createTestWorkspace('execution-context-precedence');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const catalog = await runWithLocalServices(loadWorkspaceCatalog({ paths: workspace.paths }), workspace.rootDir);

    const fromRunbook = selectRunContext({
      adoId,
      catalog,
      paths: workspace.paths,
      executionContextPosture: {
        interpreterMode: 'dry-run',
        writeMode: 'persist',
        headed: false,
        executionProfile: 'ci-batch',
      },
    });
    expect(fromRunbook.plan.mode).toBe('diagnostic');

    const fromCli = selectRunContext({
      adoId,
      catalog,
      paths: workspace.paths,
      interpreterMode: 'dry-run',
      executionContextPosture: {
        interpreterMode: 'diagnostic',
        writeMode: 'persist',
        headed: false,
        executionProfile: 'ci-batch',
      },
    });
    expect(fromCli.plan.mode).toBe('dry-run');
  } finally {
    workspace.cleanup();
  }
});

test('buildRunRecord governance is blocked for failed execution and approved for active-canon proposal resolution', () => {
  const evidenceWrites: PersistedEvidenceArtifact[] = [{
    artifactPath: '.tesseract/evidence/runs/10001/run-1/step-2-0.json',
    absolutePath: '/tmp/step-2-0.json',
    stepIndex: 2,
  }];

  const failedPlan = fakePlan('run-1');
  const failedStepResults = [fakeStepResult({ stepIndex: 2, interpretationKind: 'resolved', status: 'failed' })];
  const failedRun = buildRunRecord({
    plan: failedPlan,
    fold: fakeFold(failedPlan, failedStepResults, evidenceWrites),
    stepResults: failedStepResults,
    evidenceWrites,
  });
  expect(failedRun.runRecord.governance).toBe('blocked');

  const reviewPlan = fakePlan('run-2');
  const reviewStepResults = [fakeStepResult({ stepIndex: 2, interpretationKind: 'resolved-with-proposals' })];
  const reviewRun = buildRunRecord({
    plan: reviewPlan,
    fold: fakeFold(reviewPlan, reviewStepResults, evidenceWrites),
    stepResults: reviewStepResults,
    evidenceWrites,
  });
  expect(reviewRun.runRecord.governance).toBe('approved');
});

test('run/proposal envelopes preserve ids and lineage with/without runbook + dataset', () => {
  const adoId = createAdoId('10001');
  const stepResults = [fakeStepResult({ stepIndex: 1, interpretationKind: 'resolved' })];
  const evidenceWrites: PersistedEvidenceArtifact[] = [];
  const evidenceCatalog = {
    evidenceRecords: [],
    trustPolicy: { artifact: {} },
    runbooks: [],
    datasets: [],
  } as unknown as Parameters<typeof buildProposals>[0]['evidenceCatalog'];

  const planNoControls = fakePlan('run-no-controls');
  const withoutSupplementsRecord = buildRunRecord({
    plan: planNoControls,
    fold: fakeFold(planNoControls, stepResults, evidenceWrites),
    stepResults,
    evidenceWrites,
  }).runRecord;
  const planWithControls = fakePlan('run-with-controls', { withRunbookAndDataset: true });
  const withSupplementsRecord = buildRunRecord({
    plan: planWithControls,
    fold: fakeFold(planWithControls, stepResults, evidenceWrites),
    stepResults,
    evidenceWrites,
  }).runRecord;

  expect(withoutSupplementsRecord.ids.runbook).toBeNull();
  expect(withoutSupplementsRecord.ids.dataset).toBeNull();
  expect(withoutSupplementsRecord.lineage.sources).toEqual(['sha256:task']);
  expect(withSupplementsRecord.ids.runbook).toBe('smoke-runbook');
  expect(withSupplementsRecord.ids.dataset).toBe('smoke-dataset');
  expect(withSupplementsRecord.lineage.sources).toEqual([
    'sha256:task',
    'controls/runbooks/smoke.runbook.yaml',
    'controls/datasets/smoke.dataset.yaml',
  ]);

  const withoutSupplementsProposal = buildProposals({
    adoId,
    runId: 'run-no-controls',
    plan: planNoControls,
    surfaceArtifactPath: '.tesseract/tasks/10001.resolution.json',
    stepResults,
    evidenceWrites,
    evidenceCatalog,
  }).proposalBundle;
  const withSupplementsProposal = buildProposals({
    adoId,
    runId: 'run-with-controls',
    plan: planWithControls,
    surfaceArtifactPath: '.tesseract/tasks/10001.resolution.json',
    stepResults,
    evidenceWrites,
    evidenceCatalog,
  }).proposalBundle;

  expect(withoutSupplementsProposal.ids.runbook).toBeNull();
  expect(withoutSupplementsProposal.ids.dataset).toBeNull();
  expect(withoutSupplementsProposal.lineage.sources).toEqual(['sha256:task']);
  expect(withSupplementsProposal.ids.runbook).toBe('smoke-runbook');
  expect(withSupplementsProposal.ids.dataset).toBe('smoke-dataset');
  expect(withSupplementsProposal.lineage.sources).toEqual([
    'sha256:task',
    'controls/runbooks/smoke.runbook.yaml',
    'controls/datasets/smoke.dataset.yaml',
  ]);
});
