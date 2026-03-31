import { expect, test } from '@playwright/test';
import {
  createApplicationInterfaceGraph,
  graphInvariants,
  recordTransition,
} from '../../lib/domain/aggregates/application-interface-graph';
import {
  appendEvent,
  createInterventionLedger,
  interventionLedgerInvariants,
} from '../../lib/domain/aggregates/intervention-ledger';
import { recordCheckpoint, improvementRunInvariants } from '../../lib/domain/aggregates/improvement-run';
import type { AgentEvent, AgentSession, ImprovementRun } from '../../lib/domain/types';

const baseSession = {
  kind: 'agent-session',
  version: 1,
  sessionId: 'session-1',
  adapterId: 'deterministic',
  providerId: 'test',
  executionProfile: 'ci-batch',
  startedAt: '2026-03-31T00:00:00.000Z',
  completedAt: '2026-03-31T00:01:00.000Z',
  scenarioIds: ['ado-1'],
  runIds: ['run-1'],
  participants: [{
    participantId: 'participant:agent',
    kind: 'agent',
    label: 'Agent',
    capabilities: ['orient-workspace'],
    metadata: {},
  }],
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
} as unknown as AgentSession;

test('application-interface-graph aggregate maintains identity invariants', () => {
  const graph = createApplicationInterfaceGraph({
    kind: 'application-interface-graph',
    version: 2,
    generatedAt: '2026-03-31T00:00:00.000Z',
    discoveryRunIds: [],
    routeRefs: [],
    routeVariantRefs: [],
    targetRefs: ['target:1' as never],
    stateRefs: [],
    eventSignatureRefs: [],
    transitionRefs: [],
    nodes: [{
      id: 'target:1',
      kind: 'target',
      label: 'target:1',
      fingerprint: 'f1',
      artifactPaths: [],
      source: 'approved-knowledge',
    }],
    edges: [],
  });

  expect(graph.ok).toBe(true);
  if (!graph.ok) return;

  const transitioned = recordTransition(graph.value, 'transition:1' as never);
  expect(transitioned.ok).toBe(true);
  if (!transitioned.ok) return;

  expect(graphInvariants(transitioned.value)).toEqual({
    uniqueNodeIds: true,
    uniqueEdgeIds: true,
    referencesKnownNodes: true,
  });
  expect(transitioned.value.transitionRefs).toEqual(['transition:1']);
});

test('intervention-ledger aggregate appendEvent preserves lineage integrity', () => {
  const event = {
    version: 1,
    id: 'event-1',
    at: '2026-03-31T00:00:01.000Z',
    type: 'orientation',
    interventionId: 'intervention-1',
    interventionKind: 'orientation',
    actor: 'agent',
    summary: 'opened repo',
    participantRefs: [{ participantId: 'participant:agent', kind: 'agent' }],
    refs: { artifactPaths: [], graphNodeIds: [], selectorRefs: [], transcriptIds: [] },
    payload: {},
  } as AgentEvent;

  const created = createInterventionLedger({ session: baseSession });
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const ledger = appendEvent(created.value, event);
  expect(ledger.ok).toBe(true);
  if (!ledger.ok) return;

  expect(ledger.value.session.eventCount).toBe(1);
  expect(ledger.value.session.eventTypes.orientation).toBe(1);
  expect(interventionLedgerInvariants(ledger.value)).toEqual({
    interventionIdsKnown: true,
    participantRefsKnown: true,
  });
});

test('improvement-run aggregate enforces lineage continuity and governance consistency', () => {
  const run = {
    kind: 'improvement-run',
    version: 1,
    improvementRunId: 'improvement-1',
    pipelineVersion: '1.0.0',
    startedAt: '2026-03-31T00:00:00.000Z',
    completedAt: '2026-03-31T00:01:00.000Z',
    tags: [],
    substrateContext: {
      substrate: 'synthetic',
      seed: 'seed',
      scenarioCount: 1,
      screenCount: 1,
      phrasingTemplateVersion: 'v1',
    },
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
      plan: {
        summary: 'approve',
        governance: 'approved',
        target: { kind: 'codebase', ref: 'pipeline:1', label: 'Pipeline' },
        expectedArtifactPaths: [],
      },
      effects: [],
      startedAt: '2026-03-31T00:00:00.000Z',
      completedAt: '2026-03-31T00:01:00.000Z',
      payload: {},
    }],
    converged: true,
    convergenceReason: 'threshold-met',
    objectiveVector: { pipelineFitness: 1, architectureFitness: 1, operatorCost: 0 },
    fitnessReport: {} as never,
    scorecardComparison: {
      improved: true,
      knowledgeHitRateDelta: 0.1,
      translationPrecisionDelta: 0.1,
      convergenceVelocityDelta: 0.1,
    },
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
    signals: [{
      signalId: 'signal-1',
      kind: 'failure-mode',
      summary: 'signal',
      detail: 'detail',
      severity: 'info',
      targetPaths: [],
      interventionKinds: ['self-improvement-action'],
      metrics: {},
    }],
    candidateInterventions: [{
      candidateId: 'candidate-1',
      kind: 'self-improvement-action',
      target: { kind: 'codebase', ref: 'pipeline:1', label: 'Pipeline' },
      rationale: 'do it',
      sourceSignalIds: ['signal-1'],
      plannedChanges: [],
      configDelta: {},
      expectedObjectiveDelta: {},
    }],
    acceptanceDecisions: [{
      decisionId: 'decision-1',
      candidateInterventionIds: ['candidate-1'],
      verdict: 'accepted',
      decidedAt: '2026-03-31T00:01:00.000Z',
      rationale: 'good',
      objectiveVector: { pipelineFitness: 1, architectureFitness: 1, operatorCost: 0 },
      decidedBy: { participantId: 'participant:agent', kind: 'agent' },
    }],
    lineage: [],
    accepted: true,
    parentExperimentId: null,
  } as unknown as ImprovementRun;

  const checkpointed = recordCheckpoint(run, {
    entryId: 'lineage-1',
    at: '2026-03-31T00:01:00.000Z',
    kind: 'checkpoint',
    summary: 'checkpoint',
    relatedIds: ['decision-1'],
    artifactPaths: ['.tesseract/benchmarks/improvement-ledger.json'],
  });

  expect(checkpointed.ok).toBe(true);
  if (!checkpointed.ok) return;

  expect(improvementRunInvariants(checkpointed.value)).toEqual({
    uniqueIdentity: true,
    lineageContinuity: true,
    governanceConsistency: true,
  });
});
