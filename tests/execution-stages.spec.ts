import { expect, test } from '@playwright/test';
import { loadWorkspaceCatalog } from '../lib/application/catalog';
import { buildRunRecord } from '../lib/application/execution/build-run-record';
import { selectRunContext } from '../lib/application/execution/select-run-context';
import { runWithLocalServices } from '../lib/composition/local-services';
import { refreshScenario } from '../lib/application/refresh';
import { createAdoId } from '../lib/domain/identity';
import type { RuntimeScenarioStepResult } from '../lib/application/ports';
import type { SelectedRunContext } from '../lib/application/execution/select-run-context';
import type { PersistedEvidenceArtifact } from '../lib/application/execution/persist-evidence';
import { createTestWorkspace } from './support/workspace';

function fakeSelectedContext(runId: string): SelectedRunContext {
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
        taskFingerprint: 'sha256:task',
        knowledgeFingerprint: 'sha256:knowledge',
        fingerprints: {
          controls: 'sha256:controls',
        },
      },
    } as SelectedRunContext['taskPacketEntry'],
    snapshotEntry: {} as SelectedRunContext['snapshotEntry'],
    activeRunbook: null,
    activeDataset: null,
    posture: {
      interpreterMode: 'diagnostic',
      writeMode: 'persist',
      headed: false,
      executionProfile: 'ci-batch',
    },
    mode: 'diagnostic',
    steps: [],
    screenIds: [],
    fixtures: {},
    context: {
      adoId: createAdoId('10001'),
      revision: 1,
      contentHash: 'sha256:content',
    },
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

test('buildRunRecord governance is blocked for failed execution and review-required for proposal resolution', () => {
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
  expect(reviewRun.runRecord.governance).toBe('review-required');
});
