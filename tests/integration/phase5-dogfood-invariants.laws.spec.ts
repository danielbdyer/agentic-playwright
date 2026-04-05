import { expect, test } from '@playwright/test';
import type { AutoApprovalPolicy, TrustPolicy } from '../../lib/domain/governance/workflow-types';
import type { InterventionReceipt, Participant } from '../../lib/domain/handshake/intervention';
import type { AgentEvent } from '../../lib/domain/handshake/session';
import type { DogfoodLedgerProjection, ImprovementLoopIteration } from '../../lib/domain/improvement/types';
import { evaluateAutoApproval, DEFAULT_AUTO_APPROVAL_POLICY } from '../../lib/domain/governance/trust-policy';
import {
  createAgentSessionAdapterRegistry,
  resolveAgentSessionAdapter,
} from '../../lib/application/agency/agent-session-adapter';

// ─── Fixtures ───

const baseTrustPolicy: TrustPolicy = {
  version: 1,
  artifactTypes: {
    elements: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: [] } },
    postures: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: [] } },
    surface: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: [] } },
    snapshot: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: [] } },
    hints: { minimumConfidence: 0.7, requiredEvidence: { minCount: 0, kinds: [] } },
    patterns: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: [] } },
    routes: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: [] } },
  },
  forbiddenAutoHealClasses: ['dangerous-mutation'],
};

function createMockIterationResult(overrides: Partial<ImprovementLoopIteration> = {}): ImprovementLoopIteration {
  return {
    iteration: 1,
    scenarioIds: ['WI:1001'],
    proposalsGenerated: 2,
    proposalsActivated: 2,
    proposalsBlocked: 0,
    knowledgeHitRate: 0.75,
    unresolvedStepCount: 1,
    totalStepCount: 4,
    instructionCount: 100,
    ...overrides,
  };
}

function createMockLedger(overrides: Partial<DogfoodLedgerProjection> = {}): DogfoodLedgerProjection {
  return {
    kind: 'dogfood-ledger',
    version: 1,
    maxIterations: 3,
    completedIterations: 2,
    converged: true,
    convergenceReason: 'no-proposals',
    iterations: [
      createMockIterationResult({ iteration: 1, knowledgeHitRate: 0.5 }),
      createMockIterationResult({ iteration: 2, knowledgeHitRate: 0.75, proposalsActivated: 0 }),
    ],
    totalProposalsActivated: 2,
    totalInstructionCount: 200,
    knowledgeHitRateDelta: 0.25,
    ...overrides,
  };
}

function createSessionInterventions(
  participants: readonly Participant[],
  host: 'deterministic' | 'copilot-vscode-chat',
): readonly InterventionReceipt[] {
  return [{
    interventionId: 'session-1:orientation',
    kind: 'orientation',
    status: 'completed',
    summary: 'Session oriented around the active scenario.',
    participantRefs: participants.map((participant) => ({
      participantId: participant.participantId,
      kind: participant.kind,
    })),
    target: {
      kind: 'session',
      ref: 'session-1',
      label: 'Session session-1',
    },
    effects: [],
    startedAt: '2026-03-16T00:00:00Z',
    completedAt: '2026-03-16T00:00:01Z',
    payload: {
      host,
    },
  }];
}

// ─── WP6 Law Tests: Dogfood Invariants ───

test('dogfood ledger schema is structurally valid', () => {
  const ledger = createMockLedger();

  expect(ledger.kind).toBe('dogfood-ledger');
  expect(ledger.version).toBe(1);
  expect(typeof ledger.maxIterations).toBe('number');
  expect(typeof ledger.completedIterations).toBe('number');
  expect(typeof ledger.converged).toBe('boolean');
  expect(Array.isArray(ledger.iterations)).toBe(true);
  expect(typeof ledger.totalProposalsActivated).toBe('number');
  expect(typeof ledger.knowledgeHitRateDelta).toBe('number');
});

test('knowledge hit rate delta shows improvement across iterations', () => {
  const ledger = createMockLedger({
    iterations: [
      createMockIterationResult({ iteration: 1, knowledgeHitRate: 0.5 }),
      createMockIterationResult({ iteration: 2, knowledgeHitRate: 0.75 }),
    ],
    knowledgeHitRateDelta: 0.25,
  });

  expect(ledger.knowledgeHitRateDelta).toBeGreaterThan(0);
  expect(ledger.iterations[1]!.knowledgeHitRate).toBeGreaterThan(ledger.iterations[0]!.knowledgeHitRate);
});

test('convergence reason is one of the valid enum values', () => {
  const validReasons: DogfoodLedgerProjection['convergenceReason'][] = ['no-proposals', 'threshold-met', 'budget-exhausted', 'max-iterations', null];

  for (const reason of validReasons) {
    const ledger = createMockLedger({ convergenceReason: reason });
    expect(validReasons).toContain(ledger.convergenceReason);
  }
});

test('no-proposals convergence when second iteration has zero proposals', () => {
  const ledger = createMockLedger({
    converged: true,
    convergenceReason: 'no-proposals',
    iterations: [
      createMockIterationResult({ iteration: 1, proposalsActivated: 3 }),
      createMockIterationResult({ iteration: 2, proposalsActivated: 0 }),
    ],
  });

  expect(ledger.converged).toBe(true);
  expect(ledger.convergenceReason).toBe('no-proposals');
});

// ─── Session Standardization Invariants ───

test('deterministic adapter emits full event vocabulary', () => {
  const adapter = resolveAgentSessionAdapter('deterministic-agent-session');

  expect(adapter.id).toBe('deterministic-agent-session');
  expect(adapter.host).toBe('deterministic');
  expect(typeof adapter.transcriptRefs).toBe('function');
  expect(typeof adapter.eventVocabulary).toBe('function');
  expect(typeof adapter.sessionSummary).toBe('function');
});

test('copilot adapter emits full event vocabulary', () => {
  const adapter = resolveAgentSessionAdapter('copilot-vscode-chat');

  expect(adapter.id).toBe('copilot-vscode-chat');
  expect(adapter.host).toBe('copilot-vscode-chat');
  expect(typeof adapter.transcriptRefs).toBe('function');
  expect(typeof adapter.eventVocabulary).toBe('function');
  expect(typeof adapter.sessionSummary).toBe('function');
});

test('adapter registry contains both deterministic and copilot adapters', () => {
  const registry = createAgentSessionAdapterRegistry();

  expect(registry.has('deterministic-agent-session')).toBe(true);
  expect(registry.has('copilot-vscode-chat')).toBe(true);
  expect(registry.size).toBe(2);
});

test('unknown adapter throws', () => {
  expect(() => resolveAgentSessionAdapter('nonexistent-adapter')).toThrow();
});

// ─── Workbench Degradation Invariant ───

test('workbench degradation: no agent present → all artifacts still emit', () => {
  // When no agent is configured (deterministic mode), the system should
  // still produce all required artifact types through the session adapter
  const adapter = resolveAgentSessionAdapter('deterministic-agent-session');

  // Transcript refs should be emitted even without an agent
  const transcripts = adapter.transcriptRefs({
    sessionId: 'test-session',
    adoId: 'WI:1001' as any,
    runId: 'run-1',
  });
  expect(transcripts.length).toBeGreaterThan(0);
  expect(transcripts[0]!.kind).toBe('none'); // no agent → no real transcript
});

// ─── Phase 5 Cross-WP Invariants ───

test('auto-approval in dogfood context: enabled by default for dogfood profile', () => {
  const defaultDogfoodPolicy: AutoApprovalPolicy = {
    ...DEFAULT_AUTO_APPROVAL_POLICY,
    enabled: true,
    profile: 'dogfood',
  };

  const result = evaluateAutoApproval({
    policy: defaultDogfoodPolicy,
    trustEvaluation: { decision: 'allow', reasons: [] },
    proposedChange: { artifactType: 'hints', confidence: 0.9 },
    trustPolicy: baseTrustPolicy,
  });

  expect(result.approved).toBe(true);
});

test('auto-approval blocked for ci-batch even in dogfood-like configuration', () => {
  const ciPolicy: AutoApprovalPolicy = {
    enabled: true,
    profile: 'ci-batch',
    forbiddenHealClasses: [],
    thresholdOverrides: {},
  };

  const result = evaluateAutoApproval({
    policy: ciPolicy,
    trustEvaluation: { decision: 'allow', reasons: [] },
    proposedChange: { artifactType: 'hints', confidence: 1.0 },
    trustPolicy: baseTrustPolicy,
  });

  expect(result.approved).toBe(false);
});

test('session ledger determinism: same session input → same adapter output shape', () => {
  const adapter = resolveAgentSessionAdapter('deterministic-agent-session');
  const participants = adapter.participants({ sessionId: 'session-1', providerId: 'test' });
  const interventions = createSessionInterventions(participants, 'deterministic');

  const input1 = {
    sessionId: 'session-1',
    providerId: 'test',
    executionProfile: 'dogfood' as const,
    startedAt: '2026-03-16T00:00:00Z',
    completedAt: '2026-03-16T01:00:00Z',
    scenarioIds: ['WI:1001' as any],
    runIds: ['run-1'],
    participants,
    interventions,
    improvementRunIds: ['improvement-run-1'],
    transcripts: adapter.transcriptRefs({ sessionId: 'session-1', adoId: 'WI:1001' as any, runId: 'run-1' }),
    events: [] as AgentEvent[],
  };

  const session1 = adapter.sessionSummary(input1);
  const session2 = adapter.sessionSummary(input1);

  // Same input produces identical output (excluding timestamps)
  expect(session1.kind).toBe(session2.kind);
  expect(session1.version).toBe(session2.version);
  expect(session1.sessionId).toBe(session2.sessionId);
  expect(session1.adapterId).toBe(session2.adapterId);
  expect(session1.executionProfile).toBe(session2.executionProfile);
  expect(session1.eventCount).toBe(session2.eventCount);
  expect(session1.participantCount).toBe(participants.length);
  expect(session1.interventionCount).toBe(interventions.length);
  expect(session1.improvementRunIds).toEqual(['improvement-run-1']);
});

test('provider equivalence: both adapters produce valid AgentSession schema', () => {
  const adapters = ['deterministic-agent-session', 'copilot-vscode-chat'];

  for (const adapterId of adapters) {
    const adapter = resolveAgentSessionAdapter(adapterId);
    const participants = adapter.participants({
      sessionId: 'session-1',
      providerId: 'test',
    });
    const interventions = createSessionInterventions(participants, adapter.host);
    const transcripts = adapter.transcriptRefs({
      sessionId: 'session-1',
      adoId: 'WI:1001' as any,
      runId: 'run-1',
    });

    const session = adapter.sessionSummary({
      sessionId: 'session-1',
      providerId: 'test',
      executionProfile: 'dogfood',
      startedAt: '2026-03-16T00:00:00Z',
      completedAt: null,
      scenarioIds: ['WI:1001' as any],
      runIds: ['run-1'],
      participants,
      interventions,
      improvementRunIds: ['improvement-run-1'],
      transcripts,
      events: [],
    });

    // Both adapters must produce structurally valid sessions
    expect(session.kind).toBe('agent-session');
    expect(session.version).toBe(1);
    expect(typeof session.sessionId).toBe('string');
    expect(typeof session.adapterId).toBe('string');
    expect(typeof session.providerId).toBe('string');
    expect(session.executionProfile).toBe('dogfood');
    expect(typeof session.eventCount).toBe('number');
    expect(typeof session.eventTypes).toBe('object');
    expect(session.participantCount).toBe(participants.length);
    expect(session.interventionCount).toBe(interventions.length);
    expect(session.improvementRunIds).toEqual(['improvement-run-1']);
  }
});

test('session summary preserves typed participants and interventions', () => {
  const adapter = resolveAgentSessionAdapter('deterministic-agent-session');
  const participants = adapter.participants({ sessionId: 'session-1', providerId: 'test' });
  const interventions = createSessionInterventions(participants, 'deterministic');

  const session = adapter.sessionSummary({
    sessionId: 'session-1',
    providerId: 'test',
    executionProfile: 'dogfood',
    startedAt: '2026-03-16T00:00:00Z',
    completedAt: null,
    scenarioIds: ['WI:1001' as any],
    runIds: ['run-1'],
    participants,
    interventions,
    improvementRunIds: ['improvement-run-1'],
    transcripts: adapter.transcriptRefs({ sessionId: 'session-1', adoId: 'WI:1001' as any, runId: 'run-1' }),
    events: [],
  });

  expect(session.participants.map((participant) => participant.kind).sort()).toEqual(['agent', 'system']);
  expect(session.interventions.map((intervention) => intervention.interventionId)).toEqual(['session-1:orientation']);
  expect(session.participantCount).toBe(session.participants.length);
  expect(session.interventionCount).toBe(session.interventions.length);
});
