import { expect, test } from '@playwright/test';
import { SchemaError } from '../lib/domain/errors';
import { validateBenchmarkContext } from '../lib/domain/validation/execution';
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
    steps: [{ index: 0, action_text: 'click', expected_text: '', confidence: 'human' }],
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
  expectSchemaPath(() => validateScreenElements({ ...fixture, elements: { searchButton: { ...fixture.elements.searchButton, role: 1 } } }), 'screen-elements.elements.searchButton.role');
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
  expectSchemaPath(() => validateResolutionControl({ ...fixture, steps: [{ stepIndex: 'x', resolution: { action: 'click' } }] }), 'resolution-control.steps[0].stepIndex');
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
  expectSchemaPath(() => validateDerivedGraph({ ...fixture, nodes: [{ ...fixture.nodes[0], kind: 'bad' }] }), 'derived-graph.nodes[0].kind');
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
  expectSchemaPath(() => validateTrustPolicy({ ...fixture, artifactTypes: { ...fixture.artifactTypes, surface: { ...rule, minimumConfidence: 'bad' } } }), 'trustPolicy.artifactTypes.surface.minimumConfidence');
});
