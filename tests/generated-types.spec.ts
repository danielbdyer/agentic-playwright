import { expect, test } from '@playwright/test';
import { agent, fixture, fixtureIds, generatedToken, literal, snapshotTemplateIds } from '../lib/generated';

test('generated knowledge surface provides a typed agent-facing DSL', () => {
  const proposal = agent.screen('policy-search').element('policyNumberInput').input(fixture('activePolicy', 'number'), 'valid');
  const snapshotAssertion = agent.screen('policy-search').element('resultsTable').observeStructure('snapshots/policy-search/results-with-policy.yaml');
  const surfaceRef = agent.screen('policy-search').surface('results-grid');

  expect(proposal).toEqual({
    screen: 'policy-search',
    element: 'policyNumberInput',
    action: 'input',
    posture: 'valid',
    value: { kind: 'fixture-path', path: { segments: ['activePolicy', 'number'] } },
  });
  expect(snapshotAssertion.action).toBe('assert-snapshot');
  expect(surfaceRef).toEqual({ screen: 'policy-search', surface: 'results-grid' });
  expect(literal('POL-001')).toEqual({ kind: 'literal', value: 'POL-001' });
  expect(generatedToken('renewal-id')).toEqual({ kind: 'generated-token', token: 'renewal-id' });
});


test('generated unions include snapshot templates and fixtures referenced by the seeded scenario', () => {
  expect(snapshotTemplateIds).toContain('snapshots/policy-search/results-with-policy.yaml');
  expect(fixtureIds).toContain('activePolicy');
  expect(fixtureIds).toContain('demoSession');

  const snapshotRef: (typeof snapshotTemplateIds)[number] = 'snapshots/policy-search/results-with-policy.yaml';
  const fixtureRef: (typeof fixtureIds)[number] = 'activePolicy';

  expect(snapshotRef).toBe('snapshots/policy-search/results-with-policy.yaml');
  expect(fixtureRef).toBe('activePolicy');
});
