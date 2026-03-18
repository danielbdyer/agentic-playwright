import path from 'path';
import { expect, test } from '@playwright/test';
import { createProjectPaths } from '../lib/application/paths';
import { parseCliInvocation, resolveExecutionPosture } from '../lib/application/cli/registry';

const cwd = process.cwd();
const dogfoodPaths = createProjectPaths(cwd, path.join(cwd, 'dogfood'));

test('run command parses shared posture flags and baseline defaults', () => {
  const invocation = parseCliInvocation([
    'run',
    '--ado-id',
    '10001',
    '--runbook',
    'policy-smoke',
    '--baseline',
    '--headed',
    '--execution-profile',
    'interactive',
  ]);

  expect(invocation.command).toBe('run');
  const posture = resolveExecutionPosture(invocation.postureInput);
  expect(posture.interpreterMode).toBe('dry-run');
  expect(posture.writeMode).toBe('no-write');
  expect(posture.executionProfile).toBe('interactive');
  expect(posture.headed).toBeTruthy();
});

test('workflow command accepts ado and runbook filters', () => {
  const invocation = parseCliInvocation(['workflow', '--ado-id', '10001', '--runbook', 'suite-a']);

  expect(invocation.command).toBe('workflow');
  const effect = invocation.execute(dogfoodPaths, resolveExecutionPosture(invocation.postureInput));
  expect(effect).toBeTruthy();
});

test('approve command enforces required proposal id', () => {
  const invocation = parseCliInvocation(['approve']);

  expect(() => invocation.execute(dogfoodPaths, resolveExecutionPosture(invocation.postureInput))).toThrow(
    'Missing required --proposal-id',
  );
});

test('capture command enforces required screen and section', () => {
  const missingScreen = parseCliInvocation(['capture', '--section', 'results-with-policy']);
  const missingSection = parseCliInvocation(['capture', '--screen', 'policy-search']);

  expect(() => missingScreen.execute(dogfoodPaths, resolveExecutionPosture(missingScreen.postureInput))).toThrow(
    'Missing required --screen',
  );
  expect(() => missingSection.execute(dogfoodPaths, resolveExecutionPosture(missingSection.postureInput))).toThrow(
    'Missing required --section',
  );
});

test('parser rejects invalid enums and unknown flags', () => {
  expect(() => parseCliInvocation(['run', '--interpreter-mode', 'bad-mode'])).toThrow('Invalid --interpreter-mode: bad-mode');
  expect(() => parseCliInvocation(['workflow', '--baseline'])).toThrow('Unknown flag for workflow: --baseline');
});

test('sync command supports live ADO adapter overrides', () => {
  const invocation = parseCliInvocation([
    'sync',
    '--all',
    '--ado-source',
    'live',
    '--ado-org-url',
    'https://dev.azure.com/acme',
    '--ado-project',
    'demo',
    '--ado-pat',
    'token',
    '--ado-suite-path',
    'demo/policy-search',
    '--ado-area-path',
    'demo',
    '--ado-iteration-path',
    'demo/sprint-1',
    '--ado-tag-filter',
    'smoke',
  ]);

  expect(invocation.command).toBe('sync');
  expect(invocation.environment).toEqual({
    TESSERACT_ADO_SOURCE: 'live',
    TESSERACT_ADO_ORG_URL: 'https://dev.azure.com/acme',
    TESSERACT_ADO_PROJECT: 'demo',
    TESSERACT_ADO_PAT: 'token',
    TESSERACT_ADO_SUITE_PATH: 'demo/policy-search',
    TESSERACT_ADO_AREA_PATH: 'demo',
    TESSERACT_ADO_ITERATION_PATH: 'demo/sprint-1',
    TESSERACT_ADO_TAG: 'smoke',
  });
});


test('replay command parses provider and runbook filters', () => {
  const invocation = parseCliInvocation(['replay', '--ado-id', '10001', '--runbook', 'policy-smoke', '--provider', 'deterministic-runtime-step-agent']);

  expect(invocation.command).toBe('replay');
  const effect = invocation.execute(dogfoodPaths, resolveExecutionPosture(invocation.postureInput));
  expect(effect).toBeTruthy();
});
