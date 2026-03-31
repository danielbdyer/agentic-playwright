import { expect, test } from '@playwright/test';
import { appendEvent, createInterventionLedger } from '../lib/domain/aggregates/intervention-ledger';
import { createApplicationInterfaceGraph } from '../lib/domain/aggregates/application-interface-graph';
import { appendImprovementRun, emptyImprovementLedger } from '../lib/domain/aggregates/improvement-run';
import type { AgentEvent, AgentSession, ImprovementRun } from '../lib/domain/types';
import { LAW_SEED_COUNT, mulberry32, randomInt } from './support/random';

function baseSession(): AgentSession {
  return {
    kind: 'agent-session',
    version: 1,
    sessionId: 'session-1',
    adapterId: 'deterministic',
    providerId: 'test',
    executionProfile: 'ci-batch',
    startedAt: '2026-03-31T00:00:00.000Z',
    completedAt: '2026-03-31T00:01:00.000Z',
    scenarioIds: ['ado-1' as never],
    runIds: ['run-1'],
    participants: [{ participantId: 'participant:agent', kind: 'agent', label: 'Agent', capabilities: [], metadata: {} }],
    participantCount: 1,
    interventions: [{
      interventionId: 'intervention-1',
      kind: 'orientation',
      status: 'completed',
      summary: 'started',
      participantRefs: [{ participantId: 'participant:agent', kind: 'agent' }],
      target: { kind: 'workspace', ref: 'workspace', label: 'Workspace' },
      effects: [],
      startedAt: '2026-03-31T00:00:00.000Z',
      completedAt: '2026-03-31T00:01:00.000Z',
      payload: {},
    }],
    interventionCount: 1,
    improvementRunIds: [],
    transcripts: [],
    eventCount: 0,
    eventTypes: {
      orientation: 0,
      'artifact-inspection': 0,
      'discovery-request': 0,
      'observation-recorded': 0,
      'spec-fragment-proposed': 0,
      'proposal-approved': 0,
      'proposal-rejected': 0,
      'rerun-requested': 0,
      'execution-reviewed': 0,
      'benchmark-action': 0,
      'replay-action': 0,
    },
  };
}

function invalidImprovementRun(): ImprovementRun {
  return {
    kind: 'improvement-run',
    version: 1,
    improvementRunId: 'improvement-1',
    pipelineVersion: '1.0.0',
    startedAt: '2026-03-31T00:00:00.000Z',
    completedAt: '2026-03-31T00:01:00.000Z',
    tags: [],
    substrateContext: { substrate: 'synthetic', seed: 'seed', scenarioCount: 1, screenCount: 1, phrasingTemplateVersion: 'v1' },
    baselineConfig: {} as never,
    configDelta: {},
    participants: [],
    interventions: [{
      interventionId: 'intervention-1',
      kind: 'self-improvement-action',
      status: 'completed',
      summary: 'improve',
      participantRefs: [],
      target: { kind: 'codebase', ref: 'pipeline:1', label: 'Pipeline' },
      plan: { summary: 'approve', governance: 'approved', target: { kind: 'codebase', ref: 'pipeline:1', label: 'Pipeline' }, expectedArtifactPaths: [] },
      effects: [],
      startedAt: '2026-03-31T00:00:00.000Z',
      completedAt: '2026-03-31T00:01:00.000Z',
      payload: {},
    }],
    converged: true,
    convergenceReason: 'threshold-met',
    objectiveVector: { pipelineFitness: 1, architectureFitness: 1, operatorCost: 0 },
    fitnessReport: {} as never,
    scorecardComparison: { improved: false, knowledgeHitRateDelta: 0, translationPrecisionDelta: 0, convergenceVelocityDelta: 0 },
    iterations: [{
      iteration: 1,
      scenarioIds: ['ado-1'],
      proposalsActivated: 1,
      proposalsBlocked: 0,
      knowledgeHitRate: 1,
      unresolvedStepCount: 0,
      totalStepCount: 1,
      instructionCount: 1,
      objectiveVector: { pipelineFitness: 1, architectureFitness: 1, operatorCost: 0 },
      signalIds: ['signal-1'],
      candidateInterventionIds: ['candidate-1'],
      acceptanceDecisionIds: ['decision-1'],
    }],
    signals: [{ signalId: 'signal-1', kind: 'failure-mode', summary: 'signal', detail: 'detail', severity: 'info', targetPaths: [], interventionKinds: ['self-improvement-action'], metrics: {} }],
    candidateInterventions: [{ candidateId: 'candidate-1', kind: 'self-improvement-action', target: { kind: 'codebase', ref: 'pipeline:1', label: 'Pipeline' }, rationale: 'do it', sourceSignalIds: ['signal-1'], plannedChanges: [], configDelta: {}, expectedObjectiveDelta: {} }],
    acceptanceDecisions: [{ decisionId: 'decision-1', candidateInterventionIds: ['candidate-1'], verdict: 'accepted', decidedAt: '2026-03-31T00:01:00.000Z', rationale: 'good', objectiveVector: { pipelineFitness: 1, architectureFitness: 1, operatorCost: 0 }, decidedBy: { participantId: 'participant:agent', kind: 'agent' } }],
    lineage: [],
    accepted: false,
    parentExperimentId: null,
  };
}

test('law: application interface graph constructor rejects duplicate identities across seeds', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const duplicateCount = 2 + randomInt(next, 3);
    const nodes = Array.from({ length: duplicateCount }, () => ({
      id: 'target:duplicate',
      kind: 'target' as const,
      label: 'target',
      fingerprint: 'fp',
      artifactPaths: [],
      source: 'approved-knowledge' as const,
    }));
    const created = createApplicationInterfaceGraph({
      kind: 'application-interface-graph',
      version: 2,
      generatedAt: '2026-01-01T00:00:00Z',
      discoveryRunIds: [],
      routeRefs: [],
      routeVariantRefs: [],
      targetRefs: [],
      stateRefs: [],
      eventSignatureRefs: [],
      transitionRefs: [],
      nodes,
      edges: [],
    });
    expect(created.ok).toBe(false);
  }
});

test('law: intervention ledger mutator rejects unknown intervention references', () => {
  const created = createInterventionLedger({ session: baseSession() });
  expect(created.ok).toBe(true);
  if (!created.ok) return;
  const invalidEvent: AgentEvent = {
    version: 1,
    id: 'event-1',
    at: '2026-03-31T00:00:01.000Z',
    type: 'orientation',
    interventionId: 'missing-intervention',
    interventionKind: 'orientation',
    actor: 'agent',
    summary: 'invalid',
    participantRefs: [{ participantId: 'participant:agent', kind: 'agent' }],
    refs: { artifactPaths: [], graphNodeIds: [], selectorRefs: [], transcriptIds: [] },
    payload: {},
  };
  const appended = appendEvent(created.value, invalidEvent);
  expect(appended.ok).toBe(false);
});

test('law: improvement ledger append rejects invalid run and never mutates ledger', () => {
  const ledger = emptyImprovementLedger();
  const appended = appendImprovementRun(ledger, invalidImprovementRun());
  expect(appended.ok).toBe(false);
  expect(ledger.runs).toHaveLength(0);
});
