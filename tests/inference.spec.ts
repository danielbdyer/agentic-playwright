import { readFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { parseSnapshotToScenario } from '../lib/application/parse';
import { normalizeIntentText } from '../lib/domain/inference';
import { validateAdoSnapshot } from '../lib/domain/validation';

const rootDir = process.cwd();

function readJsonFixture<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(path.join(rootDir, ...segments), 'utf8').replace(/^\uFEFF/, '')) as T;
}

test('parseSnapshotToScenario preserves raw ADO intent as intent-only scenario steps', () => {
  const snapshot = validateAdoSnapshot(readJsonFixture<Record<string, unknown>>('fixtures', 'ado', '10001.json'));
  const scenario = parseSnapshotToScenario(snapshot);

  expect(scenario.preconditions).toEqual([{ fixture: 'demoSession' }]);
  expect(scenario.steps).toEqual([
    {
      index: 1,
      intent: 'Navigate to Policy Search screen',
      action_text: 'Navigate to Policy Search screen',
      expected_text: 'Policy Search screen loads',
      action: 'custom',
      screen: null,
      element: null,
      posture: null,
      override: null,
      snapshot_template: null,
      resolution: null,
      confidence: 'intent-only',
    },
    {
      index: 2,
      intent: 'Enter policy number in search field',
      action_text: 'Enter policy number in search field',
      expected_text: 'Policy Number accepts a valid policy',
      action: 'custom',
      screen: null,
      element: null,
      posture: null,
      override: null,
      snapshot_template: null,
      resolution: null,
      confidence: 'intent-only',
    },
    {
      index: 3,
      intent: 'Click Search button',
      action_text: 'Click Search button',
      expected_text: 'Search runs',
      action: 'custom',
      screen: null,
      element: null,
      posture: null,
      override: null,
      snapshot_template: null,
      resolution: null,
      confidence: 'intent-only',
    },
    {
      index: 4,
      intent: 'Verify search results show policy',
      action_text: 'Verify search results show policy',
      expected_text: 'Matching policy appears in Search Results',
      action: 'custom',
      screen: null,
      element: null,
      posture: null,
      override: null,
      snapshot_template: null,
      resolution: null,
      confidence: 'intent-only',
    },
  ]);
});

test('normalizeIntentText stays deterministic for runtime intent fingerprints', () => {
  expect(normalizeIntentText('  <p>Verify&nbsp;Search Results</p>  ')).toBe('verify search results');
  expect(normalizeIntentText('Click   Search button')).toBe('click search button');
});
