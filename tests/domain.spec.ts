import { readFileSync } from 'fs';
import path from 'path';
import YAML from 'yaml';
import { expect, test } from '@playwright/test';
import { deriveGraph } from '../lib/domain/derived-graph';
import { deriveCapabilities, findCapability } from '../lib/domain/grammar';
import { computeAdoContentHash } from '../lib/domain/hash';
import { graphIds } from '../lib/domain/ids';
import { compileStepProgram, traceStepProgram } from '../lib/domain/program';
import { parseEffectTargetRef } from '../lib/domain/effect-target';
import { normalizeScreenPostures, validatePostureContract } from '../lib/domain/posture-contract';
import { createRefPath, formatRefPath, parseRefPath } from '../lib/domain/ref-path';
import { renderGeneratedKnowledgeModule } from '../lib/domain/typegen';
import { validateAdoSnapshot, validateScenario, validateScreenElements, validateScreenPostures, validateSurfaceGraph } from '../lib/domain/validation';

const rootDir = process.cwd();

function readJsonFixture<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(path.join(rootDir, ...segments), 'utf8').replace(/^\uFEFF/, '')) as T;
}

function readYamlFixture(...segments: string[]) {
  return YAML.parse(readFileSync(path.join(rootDir, ...segments), 'utf8').replace(/^\uFEFF/, ''));
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
    screen: 'policy-search',
    element: 'policyNumberInput',
    posture: 'valid',
    override: '{{activePolicy.number}}',
    confidence: 'human',
  });

  expect(program).toEqual({
    kind: 'step-program',
    instructions: [{
      kind: 'enter',
      screen: 'policy-search',
      element: 'policyNumberInput',
      posture: 'valid',
      value: {
        kind: 'fixture-path',
        path: {
          segments: ['activePolicy', 'number'],
        },
      },
    }],
  });
});

test('traceStepProgram exposes semantic references without runtime execution', () => {
  const trace = traceStepProgram({
    kind: 'step-program',
    instructions: [{
      kind: 'observe-structure',
      screen: 'policy-search',
      element: 'resultsTable',
      snapshotTemplate: 'snapshots/policy-search/results-with-policy.yaml',
    }],
  });

  expect(trace).toEqual({
    instructionKinds: ['observe-structure'],
    screens: ['policy-search'],
    elements: ['resultsTable'],
    snapshotTemplates: ['snapshots/policy-search/results-with-policy.yaml'],
    hasEscapeHatch: false,
  });
});

test('surface graph becomes the structural source of capability derivation', () => {
  const surfaceGraph = validateSurfaceGraph(readYamlFixture('knowledge', 'surfaces', 'policy-search.surface.yaml'));
  const elements = validateScreenElements(readYamlFixture('knowledge', 'screens', 'policy-search.elements.yaml'));
  const capabilities = deriveCapabilities(surfaceGraph, elements);
  const searchForm = findCapability(capabilities, 'surface', 'search-form');

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

  const input = {
    snapshots: [{ artifact: snapshot, artifactPath: '.ado-sync/snapshots/10001.json' }],
    surfaceGraphs: [{ artifact: surfaceGraph, artifactPath: 'knowledge/surfaces/policy-search.surface.yaml' }],
    knowledgeSnapshots: [{
      relativePath: 'snapshots/policy-search/results-with-policy.yaml',
      artifactPath: 'knowledge/snapshots/policy-search/results-with-policy.yaml',
    }],
    screenElements: [{ artifact: elements, artifactPath: 'knowledge/screens/policy-search.elements.yaml' }],
    screenPostures: [{ artifact: postures, artifactPath: 'knowledge/screens/policy-search.postures.yaml' }],
    scenarios: [{
      artifact: scenario,
      artifactPath: 'scenarios/demo/policy-search/10001.scenario.yaml',
      generatedSpecPath: 'generated/demo/policy-search/10001.spec.ts',
      generatedSpecExists: true,
    }],
    evidence: [],
  };

  const graph = deriveGraph(input);
  const graphAgain = deriveGraph(input);

  expect(graph.fingerprint).toBe(graphAgain.fingerprint);
  expect(graph.nodes.some((node) => node.id === graphIds.surface('policy-search', 'results-grid'))).toBeTruthy();
  expect(graph.edges.some((edge) => edge.kind === 'asserts' && edge.to === graphIds.snapshot.knowledge('snapshots/policy-search/results-with-policy.yaml'))).toBeTruthy();
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
  const raw = {
    screen: 'policy-search',
    postures: {
      policyNumberInput: {
        invalid: {
          values: ['NOTAPOLICY', 'NOTAPOLICY', 'A-BAD-VALUE'],
          effects: [
            { target: 'validationSummary', state: 'visible' },
            { target: 'validationSummary', state: 'visible' },
            { target: 'self', state: 'validation-error' },
          ],
        },
      },
    },
  };

  const postures = validateScreenPostures(raw);
  expect(postures.postures.policyNumberInput.invalid.values).toEqual(['A-BAD-VALUE', 'NOTAPOLICY']);
  expect(postures.postures.policyNumberInput.invalid.effects).toEqual([
    { target: 'validationSummary', targetKind: undefined, state: 'visible', message: null },
    { target: 'self', targetKind: 'self', state: 'validation-error', message: null },
  ]);
});

test('validatePostureContract flags unknown and empty posture contracts', () => {
  const surfaceGraph = validateSurfaceGraph(readYamlFixture('knowledge', 'surfaces', 'policy-search.surface.yaml'));
  const elements = validateScreenElements(readYamlFixture('knowledge', 'screens', 'policy-search.elements.yaml'));
  const postures = normalizeScreenPostures({
    screen: 'policy-search',
    postures: {
      policyNumberInput: {
        invalid: {
          values: [],
          effects: [{ target: 'missingElement', state: 'visible' }],
        },
      },
    },
  });

  const issues = validatePostureContract({
    elementId: 'policyNumberInput',
    postureId: 'invalid',
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
  const elements = {
    screen: 'policy-search',
    url: '/policy-search',
    elements: {
      sharedTarget: {
        role: 'alert',
        name: 'Shared target',
        testId: null,
        cssFallback: null,
        widget: 'os-region',
        surface: 'search-form',
      },
    },
  };
  const surfaceGraph = {
    screen: 'policy-search',
    url: '/policy-search',
    sections: {},
    surfaces: {
      sharedTarget: {
        kind: 'validation-region',
        section: 'main',
        selector: '[data-test="shared-target"]',
        parents: [],
        children: [],
        elements: [],
        assertions: ['state'],
      },
    },
  };

  const targetRef = parseEffectTargetRef({
    effect: { target: 'sharedTarget', state: 'visible' },
    elements,
    surfaceGraph,
  });

  expect(targetRef).toEqual({
    ok: false,
    error: {
      code: 'ambiguous-effect-target',
      target: 'sharedTarget',
    },
  });
});
