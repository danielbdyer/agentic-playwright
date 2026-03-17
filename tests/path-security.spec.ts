import path from 'path';
import { expect, test } from '@playwright/test';
import { createProjectPaths, generatedSpecPath, knowledgeArtifactPath, scenarioPath } from '../lib/application/paths';
import { createAdoId, createSnapshotTemplateId } from '../lib/domain/identity';
import { computeAdoContentHash } from '../lib/domain/hash';
import { validateAdoSnapshot } from '../lib/domain/validation';

const paths = createProjectPaths(path.join(process.cwd(), 'tmp-root'));
const adoId = createAdoId('10001');

test('path helpers accept normal nested suite paths', () => {
  const suitePath = 'demo/policy-search';

  expect(scenarioPath(paths, suitePath, adoId)).toBe(path.join(paths.scenariosDir, 'demo', 'policy-search', '10001.scenario.yaml'));
  expect(generatedSpecPath(paths, suitePath, adoId)).toBe(path.join(paths.generatedDir, 'demo', 'policy-search', '10001.spec.ts'));
  expect(knowledgeArtifactPath(paths, 'snapshots/policy-search/results-with-policy.yaml')).toBe(
    path.join(paths.knowledgeDir, 'snapshots', 'policy-search', 'results-with-policy.yaml'),
  );
});

test('path helpers reject traversal attempts with ../ segments', () => {
  expect(() => scenarioPath(paths, '../escape', adoId)).toThrow(/escapes expected root/i);
  expect(() => generatedSpecPath(paths, '../../escape', adoId)).toThrow(/escapes expected root/i);
  expect(() => knowledgeArtifactPath(paths, '../screens/policy-search.elements.yaml')).toThrow(/escapes expected root/i);
});

test('path helpers reject absolute path attempts', () => {
  const absolutePath = path.join(path.sep, 'tmp', 'attack');

  expect(() => scenarioPath(paths, absolutePath, adoId)).toThrow(/escapes expected root/i);
  expect(() => generatedSpecPath(paths, absolutePath, adoId)).toThrow(/escapes expected root/i);
  expect(() => knowledgeArtifactPath(paths, absolutePath)).toThrow(/escapes expected root/i);
});

test('ingress validation rejects mixed slash and backslash traversal for suitePath', () => {
  const fixture = {
    id: '10001',
    revision: 1,
    title: 'Traversal attempt',
    suitePath: 'demo\\..\\..\\escape',
    areaPath: 'demo',
    iterationPath: 'sprint1',
    tags: [],
    priority: 1,
    steps: [{ index: 1, action: 'a', expected: 'b' }],
    parameters: [],
    dataRows: [],
    syncedAt: '2024-01-01T00:00:00.000Z',
  };

  const withHash = {
    ...fixture,
    contentHash: '',
  } as Record<string, unknown>;

  withHash.contentHash = computeAdoContentHash(withHash as { steps: Array<{ index: number; action: string; expected: string }>; parameters: Array<{ name: string; values: string[] }> });

  expect(() => validateAdoSnapshot(withHash)).toThrow(/path traversal segments are not allowed/i);
});

test('ingress validation rejects mixed slash and backslash traversal for snapshot_template', () => {
  expect(() => createSnapshotTemplateId('snapshots\\..\\..\\secrets.yaml')).toThrow(/path traversal segments are not allowed/i);
});
