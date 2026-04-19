import { expect, test } from '@playwright/test';
import { chooseByPrecedence, precedencePolicies } from '../../product/domain/resolution/precedence';
import { controlResolutionForStep } from '../../product/application/resolution/controls';
import type { RuntimeControlSession } from '../../product/domain/resolution/types';

const allPolicies = [
  { name: 'resolution', rungs: precedencePolicies.resolution.rungs },
  { name: 'data-resolution', rungs: precedencePolicies.dataResolution.rungs },
  { name: 'run-selection', rungs: precedencePolicies.runSelection.rungs },
] as const;

test.describe('precedence policy laws', () => {
  test('monotonicity: adding a higher rung candidate cannot demote outcome', () => {
    const baseline = chooseByPrecedence([
      { rung: 'shared-patterns', value: 'shared' },
    ], precedencePolicies.resolution.rungs);

    const withHigher = chooseByPrecedence([
      { rung: 'shared-patterns', value: 'shared' },
      { rung: 'explicit', value: 'explicit' },
    ], precedencePolicies.resolution.rungs);

    expect(baseline).toBe('shared');
    expect(withHigher).toBe('explicit');
  });

  test('order stability: candidate insertion order does not affect selected value', () => {
    const forward = chooseByPrecedence([
      { rung: 'repo-default', value: 'repo' },
      { rung: 'runbook', value: 'runbook' },
      { rung: 'cli-flag', value: 'cli' },
    ], precedencePolicies.runSelection.rungs);

    const reverse = chooseByPrecedence([
      { rung: 'cli-flag', value: 'cli' },
      { rung: 'runbook', value: 'runbook' },
      { rung: 'repo-default', value: 'repo' },
    ], precedencePolicies.runSelection.rungs);

    expect(forward).toBe('cli');
    expect(reverse).toBe('cli');
  });

  for (const policy of allPolicies) {
    test(`regression: ${policy.name} rungs remain unchanged`, () => {
      const stable = {
        resolution: [
          'explicit',
          'control',
          'approved-screen-knowledge',
          'shared-patterns',
          'prior-evidence',
          'semantic-dictionary',
          'approved-equivalent-overlay',
          'structured-translation',
          'live-dom',
          'agent-interpreted',
          'needs-human',
        ],
        'data-resolution': [
          'explicit',
          'runbook-dataset-binding',
          'dataset-default',
          'hint-default-value',
          'posture-sample',
          'generated-token',
        ],
        'run-selection': ['cli-flag', 'runbook', 'repo-default'],
      } as const;
      expect([...policy.rungs]).toEqual(stable[policy.name]);
    });
  }
});

test('regression: control resolution still prioritizes selected control name', () => {
  const controls: RuntimeControlSession = {
    datasets: [],
    runbooks: [],
    resolutionControls: [
      { name: 'fallback', artifactPath: 'controls/resolution/fallback.yaml', stepIndex: 1, resolution: { action: 'click' } },
      { name: 'selected', artifactPath: 'controls/resolution/selected.yaml', stepIndex: 1, resolution: { action: 'input' } },
    ],
  };

  const selected = controlResolutionForStep(controls, 1, 'selected');
  expect(selected?.action).toBe('input');
});

