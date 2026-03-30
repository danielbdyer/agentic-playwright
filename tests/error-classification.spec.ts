import { Effect } from 'effect';
import { expect, test } from '@playwright/test';
import { createAgentDecider } from '../lib/application/agent-decider';
import { withAgentTimeout } from '../lib/application/agent-interpreter-provider';
import { activateProposalBundle } from '../lib/application/activate-proposals';
import {
  createProposalBundleEnvelope,
  createScenarioEnvelopeFingerprints,
  createScenarioEnvelopeIds,
} from '../lib/application/catalog/envelope';
import { createAdoId } from '../lib/domain/identity';
import type { AgentWorkItem, ProposalBundle, ProposalEntry } from '../lib/domain/types';
import { FileSystem, type FileSystemPort } from '../lib/application/ports';
import { createProjectPaths } from '../lib/application/paths';
import { createDashboardMcpServer, type DashboardMcpServerOptions } from '../lib/infrastructure/mcp/dashboard-mcp-server';
import type { PlaywrightBridgePort } from '../lib/infrastructure/mcp/playwright-mcp-bridge';
import { FileSystemError, McpBridgeError } from '../lib/domain/errors';

const SAMPLE_WORK_ITEM: AgentWorkItem = {
  id: 'wi-1',
  kind: 'approve-proposal',
  title: 'Approve proposal',
  rationale: 'Test item',
  priority: 1,
  adoId: null,
  iteration: 1,
  evidence: {
    confidence: 0.9,
    sources: ['source-a'],
  },
  context: {
    screen: 'policy-search',
    element: 'searchButton',
    artifactRefs: [],
  },
  actions: [{ kind: 'approve', target: { kind: 'proposal', ref: 'p-1', label: 'Proposal p-1' }, params: {} }],
  linkedProposals: [],
  linkedHotspots: [],
  linkedBottlenecks: [],
};

function proposalBundleForActivation(): ProposalBundle {
  const proposal: ProposalEntry = {
    proposalId: 'proposal-error-case',
    stepIndex: 1,
    artifactType: 'hints',
    targetPath: 'knowledge/screens/policy-search.hints.yaml',
    title: 'Activation error path',
    patch: {
      screen: 'policy-search',
      element: 'searchButton',
      alias: 'Activation error alias',
    },
    evidenceIds: ['.tesseract/evidence/runs/10001/run-1/step-1-0.json'],
    impactedSteps: [1],
    trustPolicy: {
      decision: 'allow',
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
      evidenceIds: ['.tesseract/evidence/runs/10001/run-1/step-1-0.json'],
      sourceArtifactPaths: ['.tesseract/tasks/10001.runtime.json'],
      role: 'csr',
      state: 'quoted',
      driftSeed: 'seed-activation',
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
      title: 'Activation error test',
      suite: 'demo/policy-search',
      proposals: [proposal],
    },
    proposals: [proposal],
  });
}

function mcpOptions(overrides: Partial<DashboardMcpServerOptions> = {}): DashboardMcpServerOptions {
  const pendingDecisions = new Map<string, (decision: { workItemId: string; status: 'completed' | 'skipped'; rationale: string }) => void>();
  return {
    readArtifact: () => null,
    screenshotCache: { get: () => null },
    pendingDecisions,
    broadcast: () => undefined,
    ...overrides,
  };
}

test.describe('Typed error classification', () => {
  test('agent decider classifies tool invocation failures and keeps fallback-skipped outcome', async () => {
    const decider = createAgentDecider({
      invokeTool: async () => {
        throw new Error('socket closed');
      },
      timeout: 10_000,
    });

    const result = await Effect.runPromise(decider(SAMPLE_WORK_ITEM));
    expect(result).not.toBeNull();
    expect(result?.status).toBe('skipped');
    expect(result?.rationale).toContain('Agent tool error (decide_work_item): socket closed');
  });

  test('agent interpreter timeout wrapper maps timeout to token-budget fallback', async () => {
    const wrapped = withAgentTimeout(
      async () => new Promise((resolve) => setTimeout(() => resolve({
        interpreted: true,
        target: null,
        confidence: 1,
        rationale: 'late',
        proposalDrafts: [],
        provider: 'slow-provider',
      }), 25)),
      { budgetMs: 0, provider: 'slow-provider' },
    );

    const result = await wrapped({
      actionText: 'click search',
      expectedText: 'shows results',
      normalizedIntent: 'click search shows results',
      inferredAction: null,
      screens: [],
      exhaustionTrail: [],
      domSnapshot: null,
      priorTarget: null,
      taskFingerprint: 'task-1',
      knowledgeFingerprint: 'knowledge-1',
    });

    expect(result.interpreted).toBe(false);
    expect(result.rationale).toContain('timed out');
    expect(result.observation?.detail?.reason).toBe('token-budget-exceeded');
  });

  test('activation pipeline catches tagged proposal patch failures and blocks proposal', async () => {
    const mockFs: FileSystemPort = {
      readText: () => Effect.fail(new FileSystemError('read-failed', 'read failed', 'knowledge/screens/policy-search.hints.yaml')),
      writeText: () => Effect.succeed(undefined),
      readJson: () => Effect.succeed({}),
      writeJson: () => Effect.succeed(undefined),
      stat: () => Effect.succeed({ mtimeMs: 0 }),
      exists: () => Effect.succeed(true),
      removeFile: () => Effect.succeed(undefined),
      listDir: () => Effect.succeed([]),
      ensureDir: () => Effect.succeed(undefined),
      removeDir: () => Effect.succeed(undefined),
    };

    const activation = await Effect.runPromise(
      activateProposalBundle({
        paths: createProjectPaths('/tmp', '/tmp'),
        proposalBundle: proposalBundleForActivation(),
      }).pipe(Effect.provideService(FileSystem, mockFs)),
    );

    expect(activation.blockedProposalIds).toEqual(['proposal-error-case']);
    expect(activation.proposalBundle.proposals[0]?.activation.status).toBe('blocked');
    expect(activation.proposalBundle.proposals[0]?.activation.reason).toContain('read failed');
  });

  test('MCP handler classifies unexpected tool exceptions as ToolInvocationError', () => {
    const server = createDashboardMcpServer(mcpOptions({
      readArtifact: () => {
        throw new Error('artifact index unavailable');
      },
    }));

    const result = Effect.runSync(server.handleToolCall({
      tool: 'list_probed_elements',
      arguments: {},
    }));

    expect(result.isError).toBe(true);
    expect(result.result).toMatchObject({
      errorTag: 'ToolInvocationError',
      toolName: 'list_probed_elements',
    });
  });

  test('MCP browser bridge classifies known bridge failures without throwing handler errors', () => {
    const bridge: PlaywrightBridgePort = {
      isAvailable: () => Effect.succeed(true),
      execute: () => Effect.fail(new McpBridgeError('browser disconnected', 'click')),
      currentUrl: () => Effect.succeed(null),
    };

    const server = createDashboardMcpServer(mcpOptions({ playwrightBridge: bridge }));
    const result = Effect.runSync(server.handleToolCall({
      tool: 'browser_click',
      arguments: { selector: '#go' },
    }));

    expect(result.isError).toBe(false);
    expect(result.result).toMatchObject({
      success: false,
      errorTag: 'McpBridgeError',
      action: 'click',
    });
  });
});
