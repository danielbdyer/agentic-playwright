import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import { createDashboardMcpServer, type DashboardMcpServerOptions, type LoopStatus } from '../../dashboard/mcp/dashboard-mcp-server';

function mockOptions(
  artifacts: Readonly<Record<string, unknown>>,
  loopStatus: LoopStatus = { phase: 'idle' },
): DashboardMcpServerOptions {
  return {
    readArtifact: (path: string) => artifacts[path] ?? null,
    screenshotCache: { get: () => null },
    pendingDecisions: new Map(),
    broadcast: () => {},
    getLoopStatus: () => loopStatus,
  };
}

function callTool(
  options: DashboardMcpServerOptions,
  tool: string,
  arguments_: Record<string, unknown> = {},
) {
  return Effect.runPromise(createDashboardMcpServer(options).handleToolCall({
    tool,
    arguments: arguments_,
  }));
}

test('get_decision_context surfaces matched handoff semantics and participation-led suggestion', async () => {
  const artifacts = {
    '.tesseract/workbench/index.json': {
      items: [{
        id: 'work-1',
        adoId: '10001',
        context: {
          proposalId: 'proposal-1',
          stepIndex: 2,
          artifactRefs: ['.tesseract/tasks/10001.resolution.json'],
        },
        evidence: { confidence: 0.15, sources: ['trace:10001:2'] },
        linkedProposals: ['proposal-1'],
        linkedBottlenecks: ['policy-search'],
      }],
    },
    '.tesseract/learning/proposals/proposal-1.json': {
      proposalId: 'proposal-1',
      title: 'Approve policy alias',
      category: 'needs-human',
    },
    '.tesseract/tasks/index.json': {
      tasks: [{ screen: 'policy-search', status: 'needs-human' }],
    },
    '.tesseract/tasks/10001.resolution.json': {
      adoId: '10001',
      winningSource: 'needs-human',
    },
    '.tesseract/inbox/index.json': {
      items: [{
        id: 'inbox-1',
        adoId: '10001',
        proposalId: 'proposal-1',
        requestedParticipation: 'approve',
        handoff: {
          unresolvedIntent: 'Approve the alias candidate for policy search.',
          attemptedStrategies: ['structured-translation', 'review queue'],
          evidenceSlice: {
            artifactPaths: ['generated/demo/policy-search/10001.review.md'],
            summaries: ['Alias candidate repeated across runs.'],
          },
          blockageType: 'knowledge-gap',
          requestedParticipation: 'approve',
          blastRadius: 'review-bound',
          epistemicStatus: 'review-required',
          semanticCore: {
            token: 'core-1',
            summary: 'Alias approval pending.',
            driftStatus: 'preserved',
          },
          staleness: {
            observedAt: '2026-04-05T00:00:00.000Z',
            status: 'fresh',
          },
          nextMoves: [{ action: 'Approve alias', rationale: 'The evidence is already bounded.' }],
          competingCandidates: [{
            ref: 'proposal-2',
            summary: 'Alternative alias wording',
            source: 'agent',
            status: 'review-required',
          }],
          tokenImpact: {
            payloadSizeBytes: 512,
            estimatedReadTokens: 128,
          },
          chain: {
            depth: 1,
            previousSemanticToken: null,
            semanticCorePreserved: true,
            driftDetectable: true,
            competingCandidateCount: 1,
          },
        },
      }],
    },
  } as const;

  const result = await callTool(mockOptions(artifacts), 'get_decision_context', { workItemId: 'work-1' });
  expect(result.isError).toBe(false);

  const payload = result.result as {
    requestedParticipation: string;
    suggestedAction: string;
    competingCandidateCount: number;
    handoff: { blockageType: string };
    inboxItem: { id: string };
  };

  expect(payload.inboxItem.id).toBe('inbox-1');
  expect(payload.handoff.blockageType).toBe('knowledge-gap');
  expect(payload.requestedParticipation).toBe('approve');
  expect(payload.suggestedAction).toBe('approve');
  expect(payload.competingCandidateCount).toBe(1);
});

test('get_learning_summary groups inbox handoffs by participation and staleness', async () => {
  const artifacts = {
    '.tesseract/benchmarks/convergence-proof.json': {
      verdict: { converges: true, confidenceLevel: 'medium', learningContribution: 0.2 },
      trials: [{ hitRateTrajectory: [0.3, 0.6], proposalTrajectory: [4, 1] }],
      runAt: '2026-04-05T00:00:00.000Z',
    },
    '.tesseract/benchmarks/scorecard.json': {
      highWaterMark: {
        effectiveHitRate: 0.62,
        knowledgeHitRate: 0.78,
        translationPrecision: 0.7,
        proofObligations: [{
          obligation: 'structural-legibility',
          propertyRefs: ['K', 'L', 'S'],
          score: 0.72,
          status: 'healthy',
          evidence: 'translationPrecision=0.7',
        }],
      },
      history: [
        {
          runAt: '2026-04-04T00:00:00.000Z',
          pipelineVersion: 'v1',
          improved: true,
          theoremBaselineSummary: { total: 10, byStatus: { direct: 1, proxy: 4, missing: 5 }, direct: 1, proxy: 4, missing: 5, fullyBaselined: false, directGroups: ['H'], proxyGroups: ['K', 'L', 'S', 'M'], missingGroups: ['D', 'V', 'R', 'A', 'C'] },
        },
        {
          runAt: '2026-04-05T00:00:00.000Z',
          pipelineVersion: 'v2',
          improved: true,
          theoremBaselineSummary: { total: 10, byStatus: { direct: 3, proxy: 3, missing: 4 }, direct: 3, proxy: 3, missing: 4, fullyBaselined: false, directGroups: ['A', 'H', 'C'], proxyGroups: ['K', 'L', 'S'], missingGroups: ['D', 'V', 'R', 'M'] },
        },
      ],
    },
    '.tesseract/learning/proposals.json': {
      proposals: [
        { proposalId: 'proposal-1', category: 'needs-human', activation: { status: 'pending' } },
        { proposalId: 'proposal-2', category: 'route-discovery', activation: { status: 'activated' } },
      ],
    },
    '.tesseract/workbench/index.json': {
      items: [{ id: 'work-1' }],
    },
    '.tesseract/inbox/index.json': {
      items: [
        {
          id: 'inbox-1',
          requestedParticipation: 'approve',
          handoff: {
            requestedParticipation: 'approve',
            blockageType: 'knowledge-gap',
            epistemicStatus: 'review-required',
            blastRadius: 'review-bound',
            semanticCore: { token: 'core-1', summary: 'Approve alias', driftStatus: 'preserved' },
            staleness: { observedAt: '2026-04-05T00:00:00.000Z', status: 'fresh' },
            tokenImpact: { payloadSizeBytes: 256, estimatedReadTokens: 64 },
            chain: {
              depth: 1,
              previousSemanticToken: null,
              semanticCorePreserved: true,
              driftDetectable: true,
              competingCandidateCount: 0,
            },
          },
        },
        {
          id: 'inbox-2',
          requestedParticipation: 'inspect',
          handoff: {
            requestedParticipation: 'inspect',
            blockageType: 'route-uncertainty',
            epistemicStatus: 'informational',
            blastRadius: 'local',
            semanticCore: { token: 'core-2', summary: 'Refresh route evidence', driftStatus: 'unknown' },
            staleness: { observedAt: '2026-04-01T00:00:00.000Z', status: 'stale' },
            tokenImpact: { payloadSizeBytes: 300, estimatedReadTokens: 80 },
            chain: {
              depth: 2,
              previousSemanticToken: 'core-1',
              semanticCorePreserved: false,
              driftDetectable: true,
              competingCandidateCount: 0,
            },
          },
        },
      ],
    },
  } as const;

  const result = await callTool(mockOptions(artifacts), 'get_learning_summary');
  expect(result.isError).toBe(false);

  const payload = result.result as {
    proposalsByCategory: Record<string, number>;
    proofSummary: { total: number; critical: number; watch: number; healthy: number };
    proofObligations: readonly { obligation: string }[];
    inboxSummary: {
      byParticipation: Record<string, number>;
      byStalenessStatus: Record<string, number>;
      staleCount: number;
      totalEstimatedReadTokens: number;
      multiActorChainCount: number;
      driftDetectedCount: number;
    };
    theoremBaseline: readonly { theoremGroup: string; status: string }[];
    theoremBaselineSummary: { fullyBaselined: boolean; direct: number; proxy: number; missing: number; missingGroups: readonly string[] };
    theoremBaselineHistory: { direction: string; entries: readonly { direct: number; missing: number }[] };
    actionRequired: readonly string[];
    fitness: { gateMetric: string };
  };

  expect(payload.fitness.gateMetric).toBe('effective hit rate');
  expect(payload.proposalsByCategory).toEqual({ 'needs-human': 1, 'route-discovery': 1 });
  expect(payload.proofObligations.some((entry) => entry.obligation === 'structural-legibility')).toBe(true);
  expect(payload.proofObligations.some((entry) => entry.obligation === 'handoff-integrity')).toBe(true);
  expect(payload.proofObligations.some((entry) => entry.obligation === 'actor-chain-coherence')).toBe(true);
  expect(payload.proofSummary.total).toBe(3);
  expect(payload.inboxSummary.byParticipation.approve).toBe(1);
  expect(payload.inboxSummary.byParticipation.inspect).toBe(1);
  expect(payload.inboxSummary.byStalenessStatus.stale).toBe(1);
  expect(payload.inboxSummary.staleCount).toBe(1);
  expect(payload.inboxSummary.totalEstimatedReadTokens).toBe(144);
  expect(payload.inboxSummary.multiActorChainCount).toBe(1);
  expect(payload.inboxSummary.driftDetectedCount).toBe(1);
  expect(payload.theoremBaseline.some((entry) => entry.theoremGroup === 'A' && (entry.status === 'direct' || entry.status === 'proxy'))).toBe(true);
  expect(payload.theoremBaseline.some((entry) => entry.theoremGroup === 'H' && entry.status === 'direct')).toBe(true);
  expect(payload.theoremBaselineSummary.fullyBaselined).toBe(false);
  expect(payload.theoremBaselineSummary.missingGroups).toContain('V');
  expect(payload.theoremBaselineHistory.direction).toBe('improving');
  expect(payload.theoremBaselineHistory.entries).toHaveLength(2);
  expect(payload.actionRequired.some((entry) => entry.includes('stale'))).toBe(true);
  expect(payload.actionRequired.some((entry) => entry.includes('semantic drift'))).toBe(true);
});

test('get_operator_briefing exposes handoff summary and proposal categories', async () => {
  const artifacts = {
    '.tesseract/graph/index.json': {
      nodes: [
        { id: 'screen:policy-search', kind: 'screen' },
        { id: 'element:policy-number', kind: 'element', widget: 'os-input', role: 'textbox' },
        { id: 'element:policy-table', kind: 'element', widget: 'os-table', role: 'table' },
      ],
      edges: [],
    },
    '.tesseract/benchmarks/scorecard.json': {
      highWaterMark: {
        effectiveHitRate: 0.58,
        knowledgeHitRate: 0.81,
        proofObligations: [{
          obligation: 'compounding-economics',
          propertyRefs: ['C', 'M'],
          score: 0.58,
          status: 'watch',
          evidence: 'gateHitRate=0.58',
        }],
      },
    },
    '.tesseract/learning/proposals.json': {
      proposals: [
        { proposalId: 'proposal-1', category: 'needs-human', activation: { status: 'activated' } },
        { proposalId: 'proposal-2', category: 'route-discovery', activation: { status: 'pending' } },
      ],
    },
    '.tesseract/inbox/index.json': {
      items: [{
        id: 'inbox-1',
        requestedParticipation: 'approve',
        handoff: {
          requestedParticipation: 'approve',
          blockageType: 'knowledge-gap',
          epistemicStatus: 'review-required',
          blastRadius: 'review-bound',
          semanticCore: { token: 'core-1', summary: 'Approve alias', driftStatus: 'preserved' },
          staleness: { observedAt: '2026-04-01T00:00:00.000Z', status: 'stale' },
          tokenImpact: { payloadSizeBytes: 256, estimatedReadTokens: 64 },
          chain: {
            depth: 2,
            previousSemanticToken: 'core-0',
            semanticCorePreserved: false,
            driftDetectable: true,
            competingCandidateCount: 0,
          },
        },
      }],
    },
    '.tesseract/graph/routes.json': {
      routes: [{ id: 'route-1' }],
    },
  } as const;

  const result = await callTool(mockOptions(artifacts), 'get_operator_briefing');
  expect(result.isError).toBe(false);

  const payload = result.result as {
    proposalCategories: Record<string, number>;
    proofSummary: { total: number; watch: number };
    proofObligations: readonly { obligation: string }[];
    handoffSummary: { staleCount: number; byParticipation: Record<string, number>; driftDetectedCount: number };
    theoremBaseline: readonly { theoremGroup: string; status: string }[];
    theoremBaselineSummary: { fullyBaselined: boolean; missingGroups: readonly string[] };
    recommendation: string;
  };

  expect(payload.proposalCategories).toEqual({ 'needs-human': 1, 'route-discovery': 1 });
  expect(payload.proofObligations.some((entry) => entry.obligation === 'compounding-economics')).toBe(true);
  expect(payload.proofObligations.some((entry) => entry.obligation === 'handoff-integrity')).toBe(true);
  expect(payload.proofObligations.some((entry) => entry.obligation === 'actor-chain-coherence')).toBe(true);
  expect(payload.proofSummary.total).toBe(3);
  expect(payload.handoffSummary.staleCount).toBe(1);
  expect(payload.handoffSummary.byParticipation.approve).toBe(1);
  expect(payload.handoffSummary.driftDetectedCount).toBe(1);
  expect(payload.theoremBaseline.some((entry) => entry.theoremGroup === 'A' && (entry.status === 'direct' || entry.status === 'proxy'))).toBe(true);
  expect(payload.theoremBaseline.some((entry) => entry.theoremGroup === 'C' && entry.status === 'direct')).toBe(true);
  expect(payload.theoremBaselineSummary.fullyBaselined).toBe(false);
  expect(payload.theoremBaselineSummary.missingGroups).toContain('V');
  expect(payload.recommendation).toContain('stale handoff');
});

test('get_operator_briefing promotes M to direct when the full meta proof family is present', async () => {
  const artifacts = {
    '.tesseract/graph/index.json': {
      nodes: [],
      edges: [],
    },
    '.tesseract/benchmarks/scorecard.json': {
      highWaterMark: {
        effectiveHitRate: 0.81,
        knowledgeHitRate: 0.88,
        proofObligations: [
          { obligation: 'surface-compressibility', propertyRefs: ['M'], score: 0.78, status: 'healthy', evidence: 'compressibility' },
          { obligation: 'surface-predictability', propertyRefs: ['M'], score: 0.74, status: 'healthy', evidence: 'predictability' },
          { obligation: 'surface-repairability', propertyRefs: ['M'], score: 0.76, status: 'healthy', evidence: 'repairability' },
          { obligation: 'participatory-repairability', propertyRefs: ['M'], score: 0.72, status: 'healthy', evidence: 'participatory' },
          { obligation: 'memory-worthiness', propertyRefs: ['M'], score: 0.79, status: 'healthy', evidence: 'memory' },
          { obligation: 'meta-worthiness', propertyRefs: ['M'], score: 0.76, status: 'healthy', evidence: 'meta' },
        ],
      },
      history: [],
    },
    '.tesseract/learning/proposals.json': {
      proposals: [],
    },
    '.tesseract/inbox/index.json': {
      items: [],
    },
    '.tesseract/graph/routes.json': {
      routes: [],
    },
  } as const;

  const result = await callTool(mockOptions(artifacts), 'get_operator_briefing');
  expect(result.isError).toBe(false);

  const payload = result.result as {
    theoremBaseline: readonly { theoremGroup: string; status: string }[];
    theoremBaselineSummary: { directGroups: readonly string[]; proxyGroups: readonly string[] };
  };

  expect(payload.theoremBaseline.find((entry) => entry.theoremGroup === 'M')?.status).toBe('direct');
  expect(payload.theoremBaselineSummary.directGroups).toContain('M');
  expect(payload.theoremBaselineSummary.proxyGroups).not.toContain('M');
});

test('get_convergence_proof carries proof obligations from the scorecard high-water mark', async () => {
  const artifacts = {
    '.tesseract/benchmarks/convergence-proof.json': {
      verdict: { converges: true, confidenceLevel: 'medium' },
      trials: [{ seed: 's1', iterations: [], finalHitRate: 0.7, hitRateDelta: 0.2, converged: true }],
      runAt: '2026-04-05T00:00:00.000Z',
      pipelineVersion: 'abc123',
    },
    '.tesseract/benchmarks/scorecard.json': {
      highWaterMark: {
        proofObligations: [
          {
            obligation: 'variance-factorability',
            propertyRefs: ['V'],
            score: 0.67,
            status: 'healthy',
            evidence: 'approvedEquivalentRate=0.2',
          },
          {
            obligation: 'recoverability',
            propertyRefs: ['R'],
            score: 0.61,
            status: 'watch',
            evidence: 'recoverySuccessRate=0.61',
          },
          {
            obligation: 'meta-worthiness',
            propertyRefs: ['M'],
            score: 0.63,
            status: 'watch',
            evidence: 'economicsRisk=0.37',
          },
        ],
      },
    },
  } as const;

  const result = await callTool(mockOptions(artifacts), 'get_convergence_proof');
  expect(result.isError).toBe(false);

  const payload = result.result as {
    proofObligations: readonly { obligation: string }[];
    proofSummary: { total: number; watch: number };
    theoremBaseline: readonly { theoremGroup: string; status: string }[];
    theoremBaselineSummary: { fullyBaselined: boolean; missingGroups: readonly string[] };
  };

  expect(payload.proofObligations.some((entry) => entry.obligation === 'meta-worthiness')).toBe(true);
  expect(payload.proofObligations.some((entry) => entry.obligation === 'variance-factorability')).toBe(true);
  expect(payload.proofObligations.some((entry) => entry.obligation === 'recoverability')).toBe(true);
  expect(payload.proofObligations.some((entry) => entry.obligation === 'handoff-integrity')).toBe(true);
  expect(payload.proofObligations.some((entry) => entry.obligation === 'actor-chain-coherence')).toBe(true);
  expect(payload.proofSummary.total).toBe(5);
  expect(payload.proofSummary.watch).toBe(2);
  expect(payload.theoremBaseline.some((entry) => entry.theoremGroup === 'A' && (entry.status === 'direct' || entry.status === 'proxy'))).toBe(true);
  expect(payload.theoremBaseline.some((entry) => entry.theoremGroup === 'V' && entry.status === 'direct')).toBe(true);
  expect(payload.theoremBaseline.some((entry) => entry.theoremGroup === 'R' && (entry.status === 'direct' || entry.status === 'proxy'))).toBe(true);
  expect(payload.theoremBaseline.some((entry) => entry.theoremGroup === 'M' && entry.status === 'proxy')).toBe(true);
  expect(payload.theoremBaselineSummary.fullyBaselined).toBe(false);
  expect(payload.theoremBaselineSummary.missingGroups).toContain('D');
});

test('get_suggested_action considers stale and approval-oriented handoffs', async () => {
  const artifacts = {
    '.tesseract/benchmarks/scorecard.json': {
      highWaterMark: {
        effectiveHitRate: 0.45,
        knowledgeHitRate: 0.79,
      },
    },
    '.tesseract/learning/proposals.json': {
      proposals: [{ proposalId: 'proposal-1', activation: { status: 'pending' } }],
    },
    '.tesseract/graph/index.json': {
      nodes: [
        { id: 'a', kind: 'element', widget: 'os-input' },
        { id: 'b', kind: 'element', widget: 'os-button' },
        { id: 'c', kind: 'element', widget: 'os-table' },
        { id: 'd', kind: 'element', widget: 'os-checkbox' },
      ],
    },
    '.tesseract/inbox/index.json': {
      items: [{
        id: 'inbox-1',
        requestedParticipation: 'approve',
        handoff: {
          requestedParticipation: 'approve',
          blockageType: 'knowledge-gap',
          epistemicStatus: 'review-required',
          blastRadius: 'review-bound',
          semanticCore: { token: 'core-1', summary: 'Approve alias', driftStatus: 'preserved' },
          staleness: { observedAt: '2026-04-01T00:00:00.000Z', status: 'stale' },
          chain: {
            depth: 1,
            previousSemanticToken: null,
            semanticCorePreserved: true,
            driftDetectable: true,
            competingCandidateCount: 0,
          },
        },
      }],
    },
  } as const;

  const result = await callTool(mockOptions(artifacts), 'get_suggested_action', {});
  expect(result.isError).toBe(false);

  const payload = result.result as {
    suggestions: Array<{ action: string }>;
  };

  expect(payload.suggestions.some((entry) => entry.action === 'triage-handoffs')).toBe(true);
  expect(payload.suggestions.some((entry) => entry.action === 'refresh-stale-handoffs')).toBe(true);
});

// ─── v2 §6 Step 4c: manifest verbs project into the MCP tool catalog ───

test('listTools surfaces one MCP tool per declared manifest verb', async () => {
  const server = createDashboardMcpServer(mockOptions({}));
  const tools = await Effect.runPromise(server.listTools());
  const names = new Set(tools.map((t) => t.name));

  // Each of the 8 declared manifest verbs (as of Step 4b) must
  // appear in the catalog. Adding a verb to
  // product/manifest/declarations.ts should extend this set
  // automatically — the test fails when the wire-up breaks.
  const expectedVerbs = [
    'facet-enrich', 'facet-mint', 'facet-query', 'intent-fetch',
    'interact', 'locator-health-track', 'observe', 'test-compose',
  ];
  for (const verb of expectedVerbs) {
    expect(names.has(verb)).toBe(true);
  }
});

test('manifest-derived tools carry the input-type reference in inputSchema', async () => {
  const server = createDashboardMcpServer(mockOptions({}));
  const tools = await Effect.runPromise(server.listTools());
  const facetEnrich = tools.find((t) => t.name === 'facet-enrich');
  expect(facetEnrich).toBeDefined();
  expect(facetEnrich!.inputSchema['x-tesseract-input-type']).toBe('FacetEnrichmentProposal');
  expect(facetEnrich!.inputSchema['x-tesseract-declared-in']).toBe('product/domain/memory/facet-record.ts');
});

test('invocation of a manifest verb dispatches to the registered handler', async () => {
  const { manifestVerbHandlerRegistry } = await import('../../product/application/manifest/invoker');
  const handlerArgs: unknown[] = [];
  const registry = manifestVerbHandlerRegistry({
    observe: (input) => {
      handlerArgs.push(input);
      return { aria: { role: 'main' }, capturedAt: '2026-04-20T00:00:00Z' };
    },
  });
  const options = { ...mockOptions({}), manifestVerbHandlers: registry };
  const server = createDashboardMcpServer(options);
  const result = await Effect.runPromise(server.handleToolCall({
    tool: 'observe',
    arguments: { screen: 'policy-search' },
  }));
  expect(result.isError).toBe(false);
  expect(handlerArgs).toEqual([{ screen: 'policy-search' }]);
  expect(result.result).toEqual(expect.objectContaining({
    aria: { role: 'main' },
    capturedAt: '2026-04-20T00:00:00Z',
  }));
});

test('invocation of an unregistered manifest verb falls through to the unknown-tool branch', async () => {
  const { manifestVerbHandlerRegistry } = await import('../../product/application/manifest/invoker');
  const registry = manifestVerbHandlerRegistry({
    observe: () => ({ ok: true }),
  });
  const options = { ...mockOptions({}), manifestVerbHandlers: registry };
  const server = createDashboardMcpServer(options);
  const result = await Effect.runPromise(server.handleToolCall({
    tool: 'facet-mint',
    arguments: {},
  }));
  expect(result.isError).toBe(true);
  const payload = result.result as { error: string };
  expect(payload.error).toContain('Unknown tool');
});

test('invocation of a manifest verb whose handler throws returns isError:true', async () => {
  const { manifestVerbHandlerRegistry } = await import('../../product/application/manifest/invoker');
  const registry = manifestVerbHandlerRegistry({
    'intent-fetch': () => { throw new Error('upstream ado down'); },
  });
  const options = { ...mockOptions({}), manifestVerbHandlers: registry };
  const server = createDashboardMcpServer(options);
  const result = await Effect.runPromise(server.handleToolCall({
    tool: 'intent-fetch',
    arguments: { id: '10001' },
  }));
  expect(result.isError).toBe(true);
  const payload = result.result as { error: string };
  expect(payload.error).toContain('upstream ado down');
});
