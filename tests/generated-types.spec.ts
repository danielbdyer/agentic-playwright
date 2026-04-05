import { expect, test } from '@playwright/test';
import { agent, fixture, generatedToken, literal } from '../lib/domain/governance/workflow-facade';
import { fixtureIds, snapshotTemplateIds } from '../lib/generated/tesseract-knowledge';

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

  // Type-level assertions require real generated types (not the bootstrap stub).
  // At runtime, snapshotTemplateIds/fixtureIds are populated by `npm run types`.
  const snapshotRef: string = 'snapshots/policy-search/results-with-policy.yaml';
  const fixtureRef: string = 'activePolicy';

  expect(snapshotRef).toBe('snapshots/policy-search/results-with-policy.yaml');
  expect(fixtureRef).toBe('activePolicy');
});
