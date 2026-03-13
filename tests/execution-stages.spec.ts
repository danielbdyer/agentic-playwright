import { expect, test } from '@playwright/test';
import { loadWorkspaceCatalog } from '../lib/application/catalog';
import { buildProposals } from '../lib/application/execution/build-proposals';
import { buildRunRecord } from '../lib/application/execution/build-run-record';
import { selectRunContext } from '../lib/application/execution/select-run-context';
import { runWithLocalServices } from '../lib/composition/local-services';
import { refreshScenario } from '../lib/application/refresh';
import { createAdoId } from '../lib/domain/identity';
import type { RuntimeScenarioStepResult } from '../lib/application/ports';
import type { SelectedRunContext } from '../lib/application/execution/select-run-context';
import type { PersistedEvidenceArtifact } from '../lib/application/execution/persist-evidence';
import { createInterfaceResolutionContext } from './support/interface-fixtures';
import { createTestWorkspace } from './support/workspace';

function fakeSelectedContext(runId: string, options?: { withRunbookAndDataset?: boolean }): SelectedRunContext {
  const withRunbookAndDataset = options?.withRunbookAndDataset ?? false;
  return {
    runId,
    scenarioEntry: {
      artifact: {
        source: {
          ado_id: createAdoId('10001'),
          revision: 1,
          content_hash: 'sha256:content',
          synced_at: '2024-01-01T00:00:00.000Z',
        },
        metadata: {
          title: 'Scenario',
          suite: 'Demo',
          tags: [],
          priority: 1,
          status: 'active',
          status_detail: null,
        },
        preconditions: [],
        postconditions: [],
        steps: [],
      },
      artifactPath: 'scenarios/10001.scenario.yaml',
      absolutePath: '/tmp/scenarios/10001.scenario.yaml',
      fingerprint: 'fp:scenario',
    },
    boundScenarioEntry: {} as SelectedRunContext['boundScenarioEntry'],
    taskPacketEntry: {
      artifact: {
        kind: 'scenario-task-packet',
        version: 5,
        stage: 'preparation',
        scope: 'scenario',
        ids: {
          adoId: createAdoId('10001'),
          suite: 'Demo',
          dataset: null,
          runbook: null,
          resolutionControl: null,
        },
        taskFingerprint: 'sha256:task',
        payload: {
          adoId: createAdoId('10001'),
          revision: 1,
          title: 'Scenario',
          suite: 'Demo',
          knowledgeFingerprint: 'sha256:knowledge',
          interface: { fingerprint: null, artifactPath: null },
          selectors: { fingerprint: null, artifactPath: null },
          stateGraph: { fingerprint: null, artifactPath: null },
          knowledgeSlice: {
            routeRefs: [],
            routeVariantRefs: [],
            screenRefs: [],
            targetRefs: [],
            stateRefs: [],
            eventSignatureRefs: [],
            transitionRefs: [],
            evidenceRefs: [],
            controlRefs: [],
          },
          steps: [],
        },
        fingerprints: {
          artifact: 'sha256:task',
          content: 'sha256:content',
          knowledge: 'sha256:knowledge',
          controls: 'sha256:controls',
          task: 'sha256:task',
          run: null,
        },
        lineage: {
          sources: [],
          parents: [],
          handshakes: ['preparation'],
        },
        governance: 'approved',
      },
      artifactPath: '.tesseract/tasks/10001.resolution.json',
      absolutePath: '/tmp/.tesseract/tasks/10001.resolution.json',
      fingerprint: 'fp:task',
    } as SelectedRunContext['taskPacketEntry'],
    snapshotEntry: {} as SelectedRunContext['snapshotEntry'],
    activeRunbook: withRunbookAndDataset
      ? {
          name: 'smoke-runbook',
          resolutionControl: 'default-resolution',
          artifactPath: 'controls/runbooks/smoke.runbook.yaml',
        } as SelectedRunContext['activeRunbook']
      : null,
    activeDataset: withRunbookAndDataset
      ? {
          name: 'smoke-dataset',
          artifactPath: 'controls/datasets/smoke.dataset.yaml',
        } as SelectedRunContext['activeDataset']
      : null,
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
    expect(fromRunbook.mode).toBe('diagnostic');

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
    expect(fromCli.mode).toBe('dry-run');
  } finally {
    workspace.cleanup();
  }
});

test('buildRunRecord governance is blocked for failed execution and approved for active-canon proposal resolution', () => {
  const adoId = createAdoId('10001');
  const evidenceWrites: PersistedEvidenceArtifact[] = [{
    artifactPath: '.tesseract/evidence/runs/10001/run-1/step-2-0.json',
    absolutePath: '/tmp/step-2-0.json',
    stepIndex: 2,
  }];

  const failedRun = buildRunRecord({
    adoId,
    runId: 'run-1',
    selectedContext: fakeSelectedContext('run-1'),
    stepResults: [
      fakeStepResult({ stepIndex: 2, interpretationKind: 'resolved', status: 'failed' }),
    ],
    evidenceWrites,
  });
  expect(failedRun.runRecord.governance).toBe('blocked');

  const reviewRun = buildRunRecord({
    adoId,
    runId: 'run-2',
    selectedContext: fakeSelectedContext('run-2'),
    stepResults: [
      fakeStepResult({ stepIndex: 2, interpretationKind: 'resolved-with-proposals' }),
    ],
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
  } as unknown as Parameters<typeof buildProposals>[0]['evidenceCatalog'];

  const withoutSupplementsRecord = buildRunRecord({
    adoId,
    runId: 'run-no-controls',
    selectedContext: fakeSelectedContext('run-no-controls'),
    stepResults,
    evidenceWrites,
  }).runRecord;
  const withSupplementsRecord = buildRunRecord({
    adoId,
    runId: 'run-with-controls',
    selectedContext: fakeSelectedContext('run-with-controls', { withRunbookAndDataset: true }),
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
    selectedContext: fakeSelectedContext('run-no-controls'),
    stepResults,
    evidenceWrites,
    evidenceCatalog,
  }).proposalBundle;
  const withSupplementsProposal = buildProposals({
    adoId,
    runId: 'run-with-controls',
    selectedContext: fakeSelectedContext('run-with-controls', { withRunbookAndDataset: true }),
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
