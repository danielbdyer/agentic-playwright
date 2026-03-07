import { readFileSync } from 'fs';
import path from 'path';
import YAML from 'yaml';
import { expect, test } from '@playwright/test';
import { inferScenarioSteps } from '../lib/domain/inference';
import { validateAdoSnapshot, validateScreenElements, validateScreenHints, validateScreenPostures, validateSharedPatterns, validateSurfaceGraph } from '../lib/domain/validation';

const rootDir = process.cwd();

function readJsonFixture<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(path.join(rootDir, ...segments), 'utf8').replace(/^\uFEFF/, '')) as T;
}

function readYamlFixture(...segments: string[]) {
  return YAML.parse(readFileSync(path.join(rootDir, ...segments), 'utf8').replace(/^\uFEFF/, ''));
}

test('inferScenarioSteps deterministically derives the seeded scenario from approved knowledge', () => {
  const snapshot = validateAdoSnapshot(readJsonFixture<Record<string, unknown>>('fixtures', 'ado', '10001.json'));
  const knowledge = {
    surfaceGraphs: {
      'policy-search': validateSurfaceGraph(readYamlFixture('knowledge', 'surfaces', 'policy-search.surface.yaml')),
    },
    screenElements: {
      'policy-search': validateScreenElements(readYamlFixture('knowledge', 'screens', 'policy-search.elements.yaml')),
    },
    screenHints: {
      'policy-search': validateScreenHints(readYamlFixture('knowledge', 'screens', 'policy-search.hints.yaml')),
    },
    screenPostures: {
      'policy-search': validateScreenPostures(readYamlFixture('knowledge', 'screens', 'policy-search.postures.yaml')),
    },
    sharedPatterns: validateSharedPatterns(readYamlFixture('knowledge', 'patterns', 'core.patterns.yaml')),
  };

  const first = inferScenarioSteps(snapshot, knowledge);
  const second = inferScenarioSteps(snapshot, knowledge);
  const secondStep = first[1];
  const fourthStep = first[3];

  expect(first).toEqual(second);
  expect(first.map((entry) => entry.step.confidence)).toEqual([
    'compiler-derived',
    'compiler-derived',
    'compiler-derived',
    'compiler-derived',
  ]);
  expect(secondStep?.step.override).toBe('{{activePolicy.number}}');
  expect(secondStep?.supplementRefs).toContain('knowledge/patterns/core.patterns.yaml');
  expect(secondStep?.supplementRefs).toContain('knowledge/screens/policy-search.hints.yaml');
  expect(fourthStep?.step.snapshot_template).toBe('snapshots/policy-search/results-with-policy.yaml');
  expect(fourthStep?.ruleId).toBe('core.assert-snapshot');
});
