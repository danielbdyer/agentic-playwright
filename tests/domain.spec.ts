import { readFileSync } from 'fs';
import path from 'path';
import YAML from 'yaml';
import { expect, test } from '@playwright/test';
import { bindScenarioStep } from '../product/domain/governance/binding';
import {
  deriveGraph,
  mergeAccumulators,
  resolveConditionalEdges,
  EMPTY_GRAPH,
  type GraphBuildInput,
  type GraphAccumulator,
  type ConditionalEdge,
} from '../product/domain/graph/derived-graph';
import { deriveCapabilities, findCapability } from '../product/domain/commitment/grammar';
import { computeAdoContentHash, computeNormalizedSnapshotHash, normalizeAriaSnapshot } from '../product/domain/kernel/hash';
import {
  createAdoId,
  createElementId,
  createPostureId,
  createScreenId,
  createSnapshotTemplateId,
  createSurfaceId,
  createWidgetId,
} from '../product/domain/kernel/identity';
import { graphIds } from '../product/domain/kernel/ids';
import { mergePatternDocuments } from '../product/domain/knowledge/patterns';
import { compileStepProgram, traceStepProgram } from '../product/domain/commitment/program';
import { parseEffectTargetRef } from '../product/domain/governance/effect-target';
import { validatePostureContract } from '../product/domain/governance/posture-contract';
import { createRefPath, formatRefPath, parseRefPath } from '../product/domain/kernel/ref-path';
import { renderGeneratedKnowledgeModule } from '../product/instruments/codegen/typegen';
import {
  validateAdoSnapshot,
  validatePatternDocument,
  validateScenario,
  validateScreenElements,
  validateScreenHints,
  validateScreenPostures,
  validateSurfaceGraph,
} from '../product/domain/validation';

const rootDir = process.cwd();
const policySearchScreenId = createScreenId('policy-search');
const policyNumberInputId = createElementId('policyNumberInput');
const resultsTableId = createElementId('resultsTable');
const searchFormId = createSurfaceId('search-form');
const resultsGridId = createSurfaceId('results-grid');
const validPostureId = createPostureId('valid');
const invalidPostureId = createPostureId('invalid');
const validationSummaryId = createElementId('validationSummary');
const missingElementId = createElementId('missingElement');
const sharedTargetId = createElementId('sharedTarget');
const resultsWithPolicySnapshotId = createSnapshotTemplateId('snapshots/policy-search/results-with-policy.yaml');

const suiteRoot = path.join(rootDir, 'dogfood');

function readJsonFixture<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(path.join(suiteRoot, ...segments), 'utf8').replace(/^\uFEFF/, '')) as T;
}

function readYamlFixture(...segments: string[]) {
  return YAML.parse(readFileSync(path.join(suiteRoot, ...segments), 'utf8').replace(/^\uFEFF/, ''));
}

function readMergedPatterns() {
  const artifactPath = 'knowledge/patterns/core.patterns.yaml';
  const artifact = validatePatternDocument(readYamlFixture('knowledge', 'patterns', 'core.patterns.yaml'));
  return {
    artifactPath,
    artifact,
    merged: mergePatternDocuments([{ artifactPath, artifact }]),
  };
}

test('computeAdoContentHash stays stable for the seeded fixture', () => {
  const fixture = validateAdoSnapshot(readJsonFixture<Record<string, unknown>>('fixtures', 'ado', '10001.json'));
  expect(computeAdoContentHash(fixture)).toBe(fixture.contentHash);
});

test('normalizeAriaSnapshot canonicalizes browser-specific accessibility tree variants', () => {
  const approved = readFileSync(
    path.join(suiteRoot, 'knowledge', 'snapshots', 'policy-search', 'results-with-policy.yaml'),
    'utf8',
  ).replace(/^\uFEFF/, '');
  const currentBrowserVariant = `
role: table
name: Search Results
children:
  - role: none
    children:
      - role: row
        children:
          - role: columnheader
            name: Policy Number
            children:
              - role: text
                name: Policy Number
          - role: columnheader
            name: Status
            children:
              - role: text
                name: Status
  - role: rowgroup
    children:
      - role: row
        children:
          - role: gridcell
            name: POL-001
            children:
              - role: text
                name: POL-001
          - role: gridcell
            name: Active
            children:
              - role: text
                name: Active
`;

  expect(normalizeAriaSnapshot(currentBrowserVariant)).toBe(normalizeAriaSnapshot(approved));
  expect(computeNormalizedSnapshotHash(currentBrowserVariant)).toBe(computeNormalizedSnapshotHash(approved));
});

test('validateAdoSnapshot auto-corrects a mismatched content hash', () => {
  const fixture = readJsonFixture<Record<string, unknown>>('fixtures', 'ado', '10001.json');
  fixture.contentHash = 'sha256:bad';
  const result = validateAdoSnapshot(fixture);
  expect(result.contentHash).not.toBe('sha256:bad');
  // The corrected hash should match the canonical fixture's hash
  const canonical = validateAdoSnapshot(readJsonFixture('fixtures', 'ado', '10001.json'));
  expect(result.contentHash).toBe(canonical.contentHash);
});

test('compileStepProgram lowers legacy input steps into a structured program', () => {
  const program = compileStepProgram({
    index: 2,
    intent: 'Enter policy number in search field',
    action_text: 'Enter policy number in search field',
    expected_text: 'Policy Number accepts a valid policy',
    action: 'input',
    screen: policySearchScreenId,
    element: policyNumberInputId,
    posture: validPostureId,
    override: '{{activePolicy.number}}',
    confidence: 'human',
  });

  expect(program).toEqual({
    kind: 'step-program',
    instructions: [{
      kind: 'enter',
      screen: policySearchScreenId,
      element: policyNumberInputId,
      posture: validPostureId,
      value: {
        kind: 'fixture-path',
        path: {
          segments: ['activePolicy', 'number'],
        },
      },
    }],
  });
});

test('bindScenarioStep keeps binding semantics in the domain and approves supported steps', () => {
  const surfaceGraph = validateSurfaceGraph(readYamlFixture('knowledge', 'surfaces', 'policy-search.surface.yaml'));
  const elements = validateScreenElements(readYamlFixture('knowledge', 'screens', 'policy-search.elements.yaml'));
  const postures = validateScreenPostures(readYamlFixture('knowledge', 'screens', 'policy-search.postures.yaml'));
  const step = {
    index: 2,
    intent: 'Enter policy number in search field',
    action_text: 'Enter policy number in search field',
    expected_text: 'Policy Number accepts a valid policy',
    action: 'input' as const,
    screen: policySearchScreenId,
    element: policyNumberInputId,
    posture: validPostureId,
    override: '{{activePolicy.number}}',
    snapshot_template: null,
    resolution: {
      action: 'input' as const,
      screen: policySearchScreenId,
      element: policyNumberInputId,
      posture: validPostureId,
      override: '{{activePolicy.number}}',
      snapshot_template: null,
    },
    confidence: 'compiler-derived' as const,
    program: compileStepProgram({
      index: 2,
      intent: 'Enter policy number in search field',
      action_text: 'Enter policy number in search field',
      expected_text: 'Policy Number accepts a valid policy',
      action: 'input',
      screen: policySearchScreenId,
      element: policyNumberInputId,
      posture: validPostureId,
      override: '{{activePolicy.number}}',
      confidence: 'compiler-derived',
    }),
  };

  const bound = bindScenarioStep(step, {
    screenElements: elements,
    screenPostures: postures,
    surfaceGraph,
    availableSnapshotTemplates: new Set([resultsWithPolicySnapshotId]),
  });

  expect(bound.binding.kind).toBe('bound');
  expect(bound.binding.governance).toBe('approved');
  expect(bound.binding.reasons).toEqual([]);
  expect(bound.confidence).toBe('compiler-derived');
});

test('bindScenarioStep reserves unbound for deterministic contradictions in explicit resolutions', () => {
  const bound = bindScenarioStep({
    index: 3,
    intent: 'Click search',
    action_text: 'Click search',
    expected_text: 'Search runs',
    action: 'click',
    screen: null,
    element: null,
    posture: null,
    override: null,
    snapshot_template: null,
    resolution: {
      action: 'click',
      screen: null,
      element: null,
      posture: null,
      override: null,
      snapshot_template: null,
    },
    confidence: 'agent-proposed',
    program: compileStepProgram({
      index: 3,
      intent: 'Click search',
      action_text: 'Click search',
      expected_text: 'Search runs',
      action: 'click',
      screen: null,
      element: null,
      posture: null,
      override: null,
      snapshot_template: null,
      confidence: 'agent-proposed',
    }),
  }, {});

  expect(bound.binding.reasons).toEqual(['missing-element', 'missing-screen']);
  expect(bound.binding.reviewReasons).toContain('agent-proposed');
  expect(bound.binding.governance).toBe('blocked');
  expect(bound.confidence).toBe('unbound');
});

test('traceStepProgram exposes semantic references without runtime execution', () => {
  const trace = traceStepProgram({
    kind: 'step-program',
    instructions: [{
      kind: 'observe-structure',
      screen: policySearchScreenId,
      element: resultsTableId,
      snapshotTemplate: resultsWithPolicySnapshotId,
    }],
  });

  expect(trace).toEqual({
    instructionKinds: ['observe-structure'],
    screens: [policySearchScreenId],
    elements: [resultsTableId],
    snapshotTemplates: [resultsWithPolicySnapshotId],
    hasEscapeHatch: false,
  });
});

test('surface graph becomes the structural source of capability derivation', () => {
  const surfaceGraph = validateSurfaceGraph(readYamlFixture('knowledge', 'surfaces', 'policy-search.surface.yaml'));
  const elements = validateScreenElements(readYamlFixture('knowledge', 'screens', 'policy-search.elements.yaml'));
  const capabilities = deriveCapabilities(surfaceGraph, elements);
  const searchForm = findCapability(capabilities, 'surface', searchFormId);

  expect(searchForm?.operations).toEqual(['enter', 'invoke', 'observe-state']);
});

test('reference-path helpers keep fixture paths structured', () => {
  const refPath = createRefPath('activePolicy', 'number');
  expect(refPath).toEqual({ segments: ['activePolicy', 'number'] });
  expect(formatRefPath(refPath)).toBe('activePolicy.number');
  expect(parseRefPath('activePolicy.number')).toEqual(refPath);
});

test('deriveGraph is deterministic from approved artifacts alone', () => {
  const snapshot = validateAdoSnapshot(readJsonFixture('fixtures', 'ado', '10001.json'));
  const scenario = validateScenario(readYamlFixture('scenarios', 'demo', 'policy-search', '10001.scenario.yaml'));
  const surfaceGraph = validateSurfaceGraph(readYamlFixture('knowledge', 'surfaces', 'policy-search.surface.yaml'));
  const elements = validateScreenElements(readYamlFixture('knowledge', 'screens', 'policy-search.elements.yaml'));
  const postures = validateScreenPostures(readYamlFixture('knowledge', 'screens', 'policy-search.postures.yaml'));
  const hints = validateScreenHints(readYamlFixture('knowledge', 'screens', 'policy-search.hints.yaml'));
  const patterns = readMergedPatterns();

  const input = {
    snapshots: [{ artifact: snapshot, artifactPath: '.ado-sync/snapshots/10001.json' }],
    surfaceGraphs: [{ artifact: surfaceGraph, artifactPath: 'knowledge/surfaces/policy-search.surface.yaml' }],
    knowledgeSnapshots: [{
      relativePath: resultsWithPolicySnapshotId,
      artifactPath: 'knowledge/snapshots/policy-search/results-with-policy.yaml',
    }],
    screenElements: [{ artifact: elements, artifactPath: 'knowledge/screens/policy-search.elements.yaml' }],
    screenPostures: [{ artifact: postures, artifactPath: 'knowledge/screens/policy-search.postures.yaml' }],
    screenHints: [{ artifact: hints, artifactPath: 'knowledge/screens/policy-search.hints.yaml' }],
    sharedPatterns: [{ artifact: patterns.artifact, artifactPath: patterns.artifactPath }],
    scenarios: [{
      artifact: scenario,
      artifactPath: 'scenarios/demo/policy-search/10001.scenario.yaml',
      generatedSpecPath: 'generated/demo/policy-search/10001.spec.ts',
      generatedSpecExists: true,
      generatedTracePath: 'generated/demo/policy-search/10001.trace.json',
      generatedTraceExists: true,
      generatedReviewPath: 'generated/demo/policy-search/10001.review.md',
      generatedReviewExists: true,
    }],
    evidence: [],
  } satisfies GraphBuildInput;

  const graph = deriveGraph(input);
  const graphAgain = deriveGraph(input);

  expect(graph.fingerprint).toBe(graphAgain.fingerprint);
  expect(graph.nodes.some((node) => node.id === graphIds.surface(policySearchScreenId, resultsGridId))).toBeTruthy();
  expect(graph.edges.some((edge) => edge.kind === 'observed-by' && edge.to === graphIds.snapshot.knowledge(resultsWithPolicySnapshotId))).toBeTruthy();
  expect(graph.nodes.some((node) => node.id === graphIds.screenHints(policySearchScreenId))).toBeTruthy();
  expect(graph.nodes.some((node) => node.id === graphIds.pattern('core.input'))).toBeTruthy();
  expect(graph.nodes.find((node) => node.id === graphIds.step(createAdoId('10001'), 2))?.payload?.provenanceKind).toBe('unresolved');
});

test('renderGeneratedKnowledgeModule emits explicit unions from approved knowledge', () => {
  const code = renderGeneratedKnowledgeModule({
    screens: ['policy-search'],
    surfaces: { 'policy-search': ['search-form'] },
    surfaceActions: { 'policy-search': { 'search-form': ['enter', 'observe-state'] } },
    elements: { 'policy-search': ['policyNumberInput'] },
    widgetActions: { 'os-input': ['fill', 'clear', 'get-value'] },
    postures: { 'policy-search': { policyNumberInput: ['valid'] } },
    snapshots: ['snapshots/policy-search/results-with-policy.yaml'],
    fixtures: ['activePolicy'],
  });

  expect(code).toContain('export type ScreenId = "policy-search";');
  expect(code).toContain('export type ScreenPostureId');
  expect(code.startsWith('// AUTO-GENERATED by tesseract')).toBeTruthy();
});

test('validateScreenPostures normalizes posture values and effect ordering deterministically', () => {
  const postures = validateScreenPostures({
    screen: policySearchScreenId,
    postures: {
      [policyNumberInputId]: {
        [invalidPostureId]: {
          values: ['NOTAPOLICY', 'NOTAPOLICY', 'A-BAD-VALUE'],
          effects: [
            { target: validationSummaryId, state: 'visible' },
            { target: validationSummaryId, state: 'visible' },
            { target: 'self', state: 'validation-error' },
          ],
        },
      },
    },
  });

  const invalidPosture = postures.postures[policyNumberInputId]?.[invalidPostureId];
  expect(invalidPosture?.values).toEqual(['A-BAD-VALUE', 'NOTAPOLICY']);
  expect(invalidPosture?.effects).toEqual([
    { target: validationSummaryId, targetKind: undefined, state: 'visible', message: null },
    { target: 'self', targetKind: 'self', state: 'validation-error', message: null },
  ]);
});

test('validatePostureContract flags unknown and empty posture contracts', () => {
  const surfaceGraph = validateSurfaceGraph(readYamlFixture('knowledge', 'surfaces', 'policy-search.surface.yaml'));
  const elements = validateScreenElements(readYamlFixture('knowledge', 'screens', 'policy-search.elements.yaml'));
  const postures = validateScreenPostures({
    screen: policySearchScreenId,
    postures: {
      [policyNumberInputId]: {
        [invalidPostureId]: {
          values: [],
          effects: [{ target: missingElementId, state: 'visible' }],
        },
      },
    },
  });

  const issues = validatePostureContract({
    elementId: policyNumberInputId,
    postureId: invalidPostureId,
    postures,
    elements,
    surfaceGraph,
  });

  expect(issues.map((issue) => issue.code).sort((left, right) => left.localeCompare(right))).toEqual([
    'missing-posture-values',
    'unknown-effect-target',
  ]);
});

test('parseEffectTargetRef treats dual surface/element ids without explicit target kind as ambiguous', () => {
  const elements = validateScreenElements({
    screen: policySearchScreenId,
    url: '/policy-search',
    elements: {
      [sharedTargetId]: {
        role: 'alert',
        name: 'Shared target',
        testId: null,
        cssFallback: null,
        widget: createWidgetId('os-region'),
        surface: searchFormId,
      },
    },
  });

  const surfaceGraph = validateSurfaceGraph({
    screen: policySearchScreenId,
    url: '/policy-search',
    sections: {},
    surfaces: {
      [sharedTargetId]: {
        kind: 'validation-region',
        section: 'main',
        selector: '[data-test="shared-target"]',
        parents: [],
        children: [],
        elements: [],
        assertions: ['state'],
      },
    },
  });

  const targetRef = parseEffectTargetRef({
    effect: { target: sharedTargetId, state: 'visible' },
    elements,
    surfaceGraph,
  });

  expect(targetRef).toEqual({
    ok: false,
    error: {
      code: 'ambiguous-effect-target',
      target: sharedTargetId,
    },
  });
});

// --- Law-style tests for GraphAccumulator and conditional edge architecture ---

test('mergeAccumulators is associative: merge(merge(a,b),c) equals merge(a,merge(b,c))', () => {
  const nodeA = { id: 'a', kind: 'snapshot' as const, label: 'A', fingerprint: 'fa', provenance: {} };
  const nodeB = { id: 'b', kind: 'screen' as const, label: 'B', fingerprint: 'fb', provenance: {} };
  const nodeC = { id: 'c', kind: 'element' as const, label: 'C', fingerprint: 'fc', provenance: {} };
  const edgeAB = { id: 'e1', kind: 'contains' as const, from: 'a', to: 'b', fingerprint: 'fe1', provenance: {} };
  const edgeBC = { id: 'e2', kind: 'references' as const, from: 'b', to: 'c', fingerprint: 'fe2', provenance: {} };

  const accA: GraphAccumulator = { nodes: new Map([['a', nodeA]]), edges: new Map([['e1', edgeAB]]) };
  const accB: GraphAccumulator = { nodes: new Map([['b', nodeB]]), edges: new Map() };
  const accC: GraphAccumulator = { nodes: new Map([['c', nodeC]]), edges: new Map([['e2', edgeBC]]) };

  const leftAssoc = mergeAccumulators(mergeAccumulators(accA, accB), accC);
  const rightAssoc = mergeAccumulators(accA, mergeAccumulators(accB, accC));

  expect([...leftAssoc.nodes.keys()].sort()).toEqual([...rightAssoc.nodes.keys()].sort());
  expect([...leftAssoc.edges.keys()].sort()).toEqual([...rightAssoc.edges.keys()].sort());
});

test('resolveConditionalEdges includes edges whose required nodes exist and excludes others', () => {
  const existingNode = { id: 'existing', kind: 'snapshot' as const, label: 'X', fingerprint: 'fx', provenance: {} };
  const allNodes = new Map([['existing', existingNode]]);

  const keptEdge = { id: 'e-kept', kind: 'contains' as const, from: 'a', to: 'existing', fingerprint: 'fk', provenance: {} };
  const droppedEdge = { id: 'e-dropped', kind: 'references' as const, from: 'a', to: 'missing', fingerprint: 'fd', provenance: {} };
  const multiReqEdge = { id: 'e-multi', kind: 'uses' as const, from: 'existing', to: 'missing', fingerprint: 'fm', provenance: {} };

  const conditionalEdges: ConditionalEdge[] = [
    { edge: keptEdge, requiredNodeIds: ['existing'] },
    { edge: droppedEdge, requiredNodeIds: ['missing'] },
    { edge: multiReqEdge, requiredNodeIds: ['existing', 'missing'] },
  ];

  const resolved = resolveConditionalEdges(allNodes, conditionalEdges);

  expect(resolved.has('e-kept')).toBe(true);
  expect(resolved.has('e-dropped')).toBe(false);
  expect(resolved.has('e-multi')).toBe(false);
});

test('mergeAccumulators has EMPTY_GRAPH as identity element', () => {
  const nodeA = { id: 'a', kind: 'snapshot' as const, label: 'A', fingerprint: 'fa', provenance: {} };
  const acc: GraphAccumulator = { nodes: new Map([['a', nodeA]]), edges: new Map() };

  const leftId = mergeAccumulators(EMPTY_GRAPH, acc);
  const rightId = mergeAccumulators(acc, EMPTY_GRAPH);

  expect([...leftId.nodes.keys()]).toEqual([...acc.nodes.keys()]);
  expect([...rightId.nodes.keys()]).toEqual([...acc.nodes.keys()]);
});
