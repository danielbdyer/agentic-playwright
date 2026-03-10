import { expect, test } from '@playwright/test';
import { createProjectPaths } from '../lib/application/paths';
import { parseCliInvocation, resolveExecutionPosture } from '../lib/application/cli/registry';

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
  const effect = invocation.execute(createProjectPaths(process.cwd()), resolveExecutionPosture(invocation.postureInput));
  expect(effect).toBeTruthy();
});

test('approve command enforces required proposal id', () => {
  const invocation = parseCliInvocation(['approve']);

  expect(() => invocation.execute(createProjectPaths(process.cwd()), resolveExecutionPosture(invocation.postureInput))).toThrow(
    'Missing required --proposal-id',
  );
});

test('capture command enforces required screen and section', () => {
  const missingScreen = parseCliInvocation(['capture', '--section', 'results-with-policy']);
  const missingSection = parseCliInvocation(['capture', '--screen', 'policy-search']);

  expect(() => missingScreen.execute(createProjectPaths(process.cwd()), resolveExecutionPosture(missingScreen.postureInput))).toThrow(
    'Missing required --screen',
  );
  expect(() => missingSection.execute(createProjectPaths(process.cwd()), resolveExecutionPosture(missingSection.postureInput))).toThrow(
    'Missing required --section',
  );
});

test('parser rejects invalid enums and unknown flags', () => {
  expect(() => parseCliInvocation(['run', '--interpreter-mode', 'bad-mode'])).toThrow('Invalid --interpreter-mode: bad-mode');
  expect(() => parseCliInvocation(['workflow', '--baseline'])).toThrow('Unknown flag for workflow: --baseline');
});
