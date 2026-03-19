import { expect, test } from '@playwright/test';
import { SchemaError } from '../lib/domain/errors';
import {
  validateBenchmarkContext,
  validateBenchmarkImprovementProjection,
  validateDogfoodRun,
} from '../lib/domain/validation/execution';
import { validateInterventionReceipt } from '../lib/domain/validation/intervention';
import { validateScenario } from '../lib/domain/validation/intent';
import { validateScreenElements } from '../lib/domain/validation/knowledge';
import { validateDerivedGraph } from '../lib/domain/validation/projection';
import { validateResolutionControl } from '../lib/domain/validation/resolution';
import { validateTrustPolicy } from '../lib/domain/validation/trust-policy';

function expectSchemaPath(fn: () => unknown, path: string) {
  try {
    fn();
    throw new Error('expected schema error');
  } catch (error) {
    expect(error).toBeInstanceOf(SchemaError);
    expect((error as SchemaError).path).toBe(path);
  }
}

test('intent validator round-trips scenario fixture and keeps error path', () => {
  const fixture = {
    source: { ado_id: '10001', revision: 1, content_hash: 'hash', synced_at: '2026-01-01T00:00:00Z' },
    metadata: { title: 'Scenario', suite: 'smoke', tags: ['a'], priority: 1, status: 'active', status_detail: null },
    preconditions: [],
    steps: [{ index: 0, intent: 'click button', action_text: 'click', expected_text: '', action: 'click', confidence: 'human' }],
    postconditions: [],
  };
  const parsed = validateScenario(fixture);
  expect(validateScenario(parsed)).toEqual(parsed);
  expectSchemaPath(() => validateScenario({ ...fixture, metadata: { ...fixture.metadata, priority: 'bad' } }), 'metadata.priority');
});

test('knowledge validator round-trips screen-elements fixture and keeps error path', () => {
  const fixture = {
    screen: 'policy-search',
    url: '/policy',
    elements: {
      searchButton: {
        role: 'button',
        name: 'Search',
        surface: 'main',
        widget: 'button',
        locator: [{ kind: 'test-id', value: 'search' }],
      },
    },
  };
  const parsed = validateScreenElements(fixture);
  expect(validateScreenElements(parsed)).toEqual(parsed);
  expectSchemaPath(() => validateScreenElements({ ...fixture, elements: { searchButton: { ...fixture.elements.searchButton, role: 1 } } }), 'elements.searchButton.role');
});

test('resolution validator round-trips resolution-control fixture and keeps error path', () => {
  const fixture = {
    kind: 'resolution-control',
    version: 1,
    name: 'default',
    selector: { adoIds: [], suites: ['smoke'], tags: [] },
    steps: [{ stepIndex: 0, resolution: { action: 'click', screen: 'policy-search' } }],
  };
  const parsed = validateResolutionControl(fixture);
  expect(validateResolutionControl(parsed)).toEqual(parsed);
  expectSchemaPath(() => validateResolutionControl({ ...fixture, steps: [{ stepIndex: 'x', resolution: { action: 'click' } }] }), 'steps[0].stepIndex');
});

test('intervention validator round-trips intervention receipt fixture and keeps error path', () => {
  const fixture = {
    interventionId: 'session-1:orientation',
    kind: 'orientation',
    status: 'completed',
    summary: 'Session oriented around the active scenario.',
    participantRefs: [{ participantId: 'session-1:system', kind: 'system' }],
    ids: {
      adoId: '10001',
      sessionId: 'session-1',
      runId: 'run-1',
      participantIds: ['session-1:system'],
      interventionIds: ['session-1:orientation'],
      improvementRunId: 'improvement-run-1',
      iteration: 1,
      parentExperimentId: 'experiment-1',
    },
    target: {
      kind: 'scenario',
      ref: '10001',
      label: 'Scenario 10001',
      ids: {
        adoId: '10001',
        sessionId: 'session-1',
      },
    },
    plan: {
      summary: 'Orient the session around the grounded task packet.',
      governance: 'approved',
      target: {
        kind: 'scenario',
        ref: '10001',
        label: 'Scenario 10001',
      },
      expectedArtifactPaths: ['.tesseract/tasks/10001.resolution.json'],
    },
    effects: [{
      kind: 'artifact-inspected',
      severity: 'info',
      summary: 'Loaded the interpretation surface.',
      target: {
        kind: 'artifact',
        ref: '.tesseract/tasks/10001.resolution.json',
        label: 'Scenario interpretation surface',
        artifactPath: '.tesseract/tasks/10001.resolution.json',
      },
      artifactPath: '.tesseract/tasks/10001.resolution.json',
      payload: {
        taskFingerprint: 'sha256:task',
      },
    }],
    startedAt: '2026-03-19T00:00:00Z',
    completedAt: '2026-03-19T00:00:05Z',
    payload: {
      host: 'deterministic',
    },
  };
  const parsed = validateInterventionReceipt(fixture);
  expect(validateInterventionReceipt(parsed)).toEqual(parsed);
  expectSchemaPath(() => validateInterventionReceipt({
    ...fixture,
    participantRefs: [{ participantId: 'session-1:system', kind: 'not-a-kind' }],
  }), 'participantRefs[0].kind');
});

test('execution validator round-trips benchmark fixture and keeps error path', () => {
  const fixture = {
    kind: 'benchmark-context',
    version: 1,
    name: 'bench',
    suite: 'smoke',
    appRoute: '/app',
    fieldCatalog: [{ id: 'f1', screen: 'policy-search', element: 'search', label: 'Search', category: 'query', required: true, postures: [] }],
    flows: [{ id: 'flow1', title: 'Flow', route: '/app', screens: ['policy-search'], fieldIds: ['f1'] }],
    driftEvents: [],
    fieldAwarenessThresholds: {
      minFieldAwarenessCount: 1,
      minFirstPassScreenResolutionRate: 0.5,
      minFirstPassElementResolutionRate: 0.5,
      maxDegradedLocatorRate: 0.5,
    },
    benchmarkRunbooks: [],
    expansionRules: [],
  };
  const parsed = validateBenchmarkContext(fixture);
  expect(validateBenchmarkContext(parsed)).toEqual(parsed);
  expectSchemaPath(() => validateBenchmarkContext({ ...fixture, flows: [{ ...fixture.flows[0], fieldIds: [1] }] }), 'benchmarkContext.flows[0].fieldIds[0]');
});

test('execution validator round-trips canonical benchmark improvement and compatibility projections', () => {
  const scorecard = {
    kind: 'benchmark-scorecard',
    version: 1,
    benchmark: 'bench',
    generatedAt: '2026-03-19T00:00:00Z',
    uniqueFieldAwarenessCount: 1,
    firstPassScreenResolutionRate: 0.5,
    firstPassElementResolutionRate: 0.5,
    degradedLocatorRate: 0.1,
    reviewRequiredCount: 0,
    repairLoopCount: 0,
    operatorTouchCount: 0,
    knowledgeChurn: {},
    generatedVariantCount: 1,
    translationHitRate: 0.2,
    agenticHitRate: 0.1,
    approvedEquivalentCount: 0,
    thinKnowledgeScreenCount: 0,
    degradedLocatorHotspotCount: 0,
    interpretationDriftHotspotCount: 0,
    overlayChurn: 0,
    executionTimingTotalsMs: {
      setup: 1,
      resolution: 1,
      action: 1,
      assertion: 1,
      retries: 0,
      teardown: 1,
      total: 5,
    },
    executionCostTotals: {
      instructionCount: 2,
      diagnosticCount: 1,
    },
    executionFailureFamilies: {},
    recoveryFamilies: {},
    recoveryStrategies: {},
    budgetBreachCount: 0,
    thresholdStatus: 'pass',
  } as const;

  const fixture = {
    kind: 'benchmark-improvement-projection',
    version: 1,
    benchmark: 'bench',
    runId: 'run-1',
    executedAt: '2026-03-19T00:00:00Z',
    posture: {
      interpreterMode: 'diagnostic',
      writeMode: 'persist',
      headed: false,
      executionProfile: 'dogfood',
    },
    runbooks: ['synthetic-dogfood'],
    scenarioIds: ['10001'],
    driftEventIds: [],
    scorecard,
    improvement: {
      relatedRunIds: ['improvement-run-1'],
      latestRunId: 'improvement-run-1',
      latestAccepted: true,
      latestVerdict: 'accepted',
      latestDecisionId: 'decision-1',
      signalCount: 2,
      candidateInterventionCount: 1,
      checkpointRef: '.tesseract/benchmarks/scorecard.json',
    },
    nextCommands: ['tesseract scorecard --benchmark bench'],
  } as const;

  const parsedProjection = validateBenchmarkImprovementProjection(fixture);
  const parsedCompatibility = validateDogfoodRun({ ...fixture, kind: 'dogfood-run' });

  expect(validateBenchmarkImprovementProjection(parsedProjection)).toEqual(parsedProjection);
  expect(validateDogfoodRun(parsedCompatibility)).toEqual(parsedCompatibility);
  expectSchemaPath(
    () => validateBenchmarkImprovementProjection({
      ...fixture,
      improvement: {
        ...fixture.improvement,
        latestAccepted: 'yes',
      },
    }),
    'improvement.latestAccepted',
  );
});

test('projection validator round-trips derived graph fixture and keeps error path', () => {
  const fixture = {
    version: 'v1',
    fingerprint: 'fp',
    resources: [],
    resourceTemplates: [],
    nodes: [{ id: 'n1', kind: 'screen', label: 'Screen', fingerprint: 'n1', provenance: {} }],
    edges: [{ id: 'e1', kind: 'contains', from: 'n1', to: 'n1', fingerprint: 'e1', provenance: {} }],
  };
  const parsed = validateDerivedGraph(fixture);
  expect(validateDerivedGraph(parsed)).toEqual(parsed);
  expectSchemaPath(() => validateDerivedGraph({ ...fixture, nodes: [{ ...fixture.nodes[0], kind: 'bad' }] }), 'nodes[0].kind');
});

test('trust-policy validator round-trips trust policy fixture and keeps error path', () => {
  const rule = { minimumConfidence: 0.5, requiredEvidence: { minCount: 1, kinds: ['trace'] } };
  const fixture = {
    version: 1,
    artifactTypes: {
      elements: rule,
      postures: rule,
      surface: rule,
      snapshot: rule,
      hints: rule,
      patterns: rule,
    },
    forbiddenAutoHealClasses: [],
  };
  const parsed = validateTrustPolicy(fixture);
  expect(validateTrustPolicy(parsed)).toEqual(parsed);
  expectSchemaPath(() => validateTrustPolicy({ ...fixture, artifactTypes: { ...fixture.artifactTypes, surface: { ...rule, minimumConfidence: 'bad' } } }), 'artifactTypes.surface.minimumConfidence');
});
