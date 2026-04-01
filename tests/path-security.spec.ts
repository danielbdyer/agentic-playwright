import path from 'path';
import { expect, test } from '@playwright/test';
import {
  createProjectPaths,
  generatedSpecPath,
  knowledgeArtifactPath,
  scenarioPath,
  taskPacketPath,
  translationCachePath,
  runbookPath,
  agentSessionPath,
} from '../lib/application/paths';
import { createAdoId, createSnapshotTemplateId } from '../lib/domain/kernel/identity';
import { computeAdoContentHash } from '../lib/domain/kernel/hash';
import { validateAdoSnapshot } from '../lib/domain/validation';

const rootDir = path.join(process.cwd(), 'tmp-root');
const suiteRoot = path.join(rootDir, 'dogfood');
const paths = createProjectPaths(rootDir, suiteRoot);
const adoId = createAdoId('10001');

test('createProjectPaths exposes lane aggregates with root/suite separation', () => {
  expect(paths.engine.rootDir).toBe(rootDir);
  expect(paths.engine.suiteRoot).toBe(suiteRoot);

  expect(paths.intent.scenariosDir).toBe(path.join(suiteRoot, 'scenarios'));
  expect(paths.governance.generatedDir).toBe(path.join(suiteRoot, 'generated'));
  expect(paths.resolution.tasksDir).toBe(path.join(rootDir, '.tesseract', 'tasks'));
  expect(paths.execution.runsDir).toBe(path.join(rootDir, '.tesseract', 'runs'));

  // Transitional aliases remain available for existing callsites.
  expect(paths.scenariosDir).toBe(paths.intent.scenariosDir);
  expect(paths.tasksDir).toBe(paths.resolution.tasksDir);
  expect(paths.generatedDir).toBe(paths.governance.generatedDir);
  expect(paths.runsDir).toBe(paths.execution.runsDir);
});

test('path helpers route suite scoped artifacts under suite root and engine artifacts under root', () => {
  const suitePath = 'demo/policy-search';

  expect(scenarioPath(paths, suitePath, adoId)).toBe(path.join(paths.intent.scenariosDir, 'demo', 'policy-search', '10001.scenario.yaml'));
  expect(generatedSpecPath(paths, suitePath, adoId)).toBe(path.join(paths.governance.generatedDir, 'demo', 'policy-search', '10001.spec.ts'));
  expect(knowledgeArtifactPath(paths, 'snapshots/policy-search/results-with-policy.yaml')).toBe(
    path.join(paths.knowledge.knowledgeDir, 'snapshots', 'policy-search', 'results-with-policy.yaml'),
  );
  expect(taskPacketPath(paths, adoId)).toBe(path.join(paths.resolution.tasksDir, '10001.resolution.json'));
  expect(translationCachePath(paths, 'intent-key')).toBe(path.join(paths.engine.translationCacheDir, 'intent-key.translation.json'));
});

test('control and execution helpers reject traversal attempts', () => {
  expect(() => runbookPath(paths, '../escape')).toThrow(/escapes expected root/i);
  expect(() => agentSessionPath(paths, '../session')).toThrow(/escapes expected root/i);
});

test('suite scoped helpers reject traversal and absolute path attempts', () => {
  const absolutePath = path.join(path.sep, 'tmp', 'attack');

  expect(() => scenarioPath(paths, '../escape', adoId)).toThrow(/escapes expected root/i);
  expect(() => generatedSpecPath(paths, '../../escape', adoId)).toThrow(/escapes expected root/i);
  expect(() => knowledgeArtifactPath(paths, '../screens/policy-search.elements.yaml')).toThrow(/escapes expected root/i);
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
