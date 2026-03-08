import { readFileSync } from 'fs';
import path from 'path';
import YAML from 'yaml';
import { expect, test } from '@playwright/test';
import { bindScenarioStep } from '../lib/domain/binding';
import { deriveGraph, type GraphBuildInput } from '../lib/domain/derived-graph';
import { deriveCapabilities, findCapability } from '../lib/domain/grammar';
import { computeAdoContentHash } from '../lib/domain/hash';
import {
  createAdoId,
  createElementId,
  createPostureId,
  createScreenId,
  createSnapshotTemplateId,
  createSurfaceId,
  createWidgetId,
} from '../lib/domain/identity';
import { graphIds } from '../lib/domain/ids';
import { mergePatternDocuments } from '../lib/domain/knowledge/patterns';
import { compileStepProgram, traceStepProgram } from '../lib/domain/program';
import { parseEffectTargetRef } from '../lib/domain/effect-target';
import { validatePostureContract } from '../lib/domain/posture-contract';
import { createRefPath, formatRefPath, parseRefPath } from '../lib/domain/ref-path';
import { renderGeneratedKnowledgeModule } from '../lib/domain/typegen';
import {
  validateAdoSnapshot,
  validatePatternDocument,
  validateScenario,
  validateScreenElements,
  validateScreenHints,
  validateScreenPostures,
  validateSurfaceGraph,
} from '../lib/domain/validation';

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

function readJsonFixture<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(path.join(rootDir, ...segments), 'utf8').replace(/^\uFEFF/, '')) as T;
}

function readYamlFixture(...segments: string[]) {
  return YAML.parse(readFileSync(path.join(rootDir, ...segments), 'utf8').replace(/^\uFEFF/, ''));
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

test('validateAdoSnapshot rejects a mismatched content hash', () => {
  const fixture = readJsonFixture<Record<string, unknown>>('fixtures', 'ado', '10001.json');
  fixture.contentHash = 'sha256:bad';
  expect(() => validateAdoSnapshot(fixture)).toThrow(/contentHash mismatch/i);
});

test('compileStepProgram lowers legacy input steps into a structured program', () => {
  const program = compileStepProgram({
    index: 2,
    intent: 'Enter policy number in search field',
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
