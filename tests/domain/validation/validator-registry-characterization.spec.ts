import { expect, test } from '@playwright/test';
import { SchemaError } from '../../../lib/domain/errors';
import {
  validateBenchmarkImprovementProjection as validateBenchmarkImprovementProjectionLegacy,
  validateDerivedGraph as validateDerivedGraphLegacy,
  validateResolutionControl as validateResolutionControlLegacy,
  validateScenario as validateScenarioLegacy,
  validateScreenElements as validateScreenElementsLegacy,
  validateTrustPolicy as validateTrustPolicyLegacy,
} from '../../../lib/domain/validation/core';
import { validateBenchmarkImprovementProjection } from '../../../lib/domain/validation/execution';
import { validateScenario } from '../../../lib/domain/validation/intent';
import { validateScreenElements } from '../../../lib/domain/validation/knowledge';
import { validateDerivedGraph } from '../../../lib/domain/validation/projection';
import { validateResolutionControl } from '../../../lib/domain/validation/resolution';
import { validateTrustPolicy } from '../../../lib/domain/validation/trust-policy';

const scenarioFixture = {
  source: { ado_id: '10001', revision: 1, content_hash: 'hash', synced_at: '2026-01-01T00:00:00Z' },
  metadata: { title: 'Scenario', suite: 'smoke', tags: ['a'], priority: 1, status: 'active', status_detail: null },
  preconditions: [],
  steps: [{ index: 0, intent: 'click button', action_text: 'click', expected_text: '', action: 'click', confidence: 'human' }],
  postconditions: [],
} as const;

const screenElementsFixture = {
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
} as const;

const resolutionControlFixture = {
  kind: 'resolution-control',
  version: 1,
  name: 'default',
  selector: { adoIds: [], suites: ['smoke'], tags: [] },
  steps: [{ stepIndex: 0, resolution: { action: 'click', screen: 'policy-search' } }],
} as const;

const trustRule = { minimumConfidence: 0.5, requiredEvidence: { minCount: 1, kinds: ['trace'] } } as const;
const trustPolicyFixture = {
  version: 1,
  artifactTypes: {
    elements: trustRule,
    postures: trustRule,
    surface: trustRule,
    snapshot: trustRule,
    hints: trustRule,
    patterns: trustRule,
    routes: trustRule,
  },
  forbiddenAutoHealClasses: [],
} as const;

const derivedGraphFixture = {
  version: 'v1',
  fingerprint: 'fp',
  resources: [],
  resourceTemplates: [],
  nodes: [{ id: 'n1', kind: 'screen', label: 'Screen', fingerprint: 'n1', provenance: {} }],
  edges: [{ id: 'e1', kind: 'contains', from: 'n1', to: 'n1', fingerprint: 'e1', provenance: {} }],
} as const;

const benchmarkImprovementFixture = {
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
  scorecard: {
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
    executionTimingTotalsMs: { setup: 1, resolution: 1, action: 1, assertion: 1, retries: 0, teardown: 1, total: 5 },
    executionCostTotals: { instructionCount: 2, diagnosticCount: 1 },
    executionFailureFamilies: {},
    recoveryFamilies: {},
    recoveryStrategies: {},
    budgetBreachCount: 0,
    thresholdStatus: 'pass',
  },
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

test('registry-backed validators preserve legacy successful outputs', () => {
  expect(validateScenario(scenarioFixture)).toEqual(validateScenarioLegacy(scenarioFixture));
  expect(validateScreenElements(screenElementsFixture)).toEqual(validateScreenElementsLegacy(screenElementsFixture));
  expect(validateResolutionControl(resolutionControlFixture)).toEqual(validateResolutionControlLegacy(resolutionControlFixture));
  expect(validateTrustPolicy(trustPolicyFixture)).toEqual(validateTrustPolicyLegacy(trustPolicyFixture));
  expect(validateDerivedGraph(derivedGraphFixture)).toEqual(validateDerivedGraphLegacy(derivedGraphFixture));
  expect(validateBenchmarkImprovementProjection(benchmarkImprovementFixture)).toEqual(
    validateBenchmarkImprovementProjectionLegacy(benchmarkImprovementFixture),
  );
});

test('registry-backed validators preserve legacy schema paths on failures', () => {
  const runAndCapturePath = (fn: () => unknown) => {
    try {
      fn();
      throw new Error('expected schema error');
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaError);
      return (error as SchemaError).path;
    }
  };

  const invalidScenario = { ...scenarioFixture, metadata: { ...scenarioFixture.metadata, priority: 'bad' } };
  expect(runAndCapturePath(() => validateScenario(invalidScenario))).toEqual(
    runAndCapturePath(() => validateScenarioLegacy(invalidScenario)),
  );

  const invalidResolution = { ...resolutionControlFixture, steps: [{ stepIndex: 'x', resolution: { action: 'click' } }] };
  expect(runAndCapturePath(() => validateResolutionControl(invalidResolution))).toEqual(
    runAndCapturePath(() => validateResolutionControlLegacy(invalidResolution)),
  );
});
