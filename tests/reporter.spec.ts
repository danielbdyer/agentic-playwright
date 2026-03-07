import { readFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { createProjectPaths } from '../lib/application/paths';
import { refreshScenario } from '../lib/application/refresh';
import { createAdoId } from '../lib/domain/identity';
import { findFailureContext } from '../lib/infrastructure/reporting/tesseract-reporter';
import { runWithLocalServices } from '../lib/infrastructure/local-services';
import { validateDerivedGraph } from '../lib/domain/validation';

test('reporter graph context resolves a failed test back to the scenario node', async () => {
  const paths = createProjectPaths(process.cwd());
  await runWithLocalServices(refreshScenario({ adoId: createAdoId('10001'), paths }), process.cwd());
  const graph = validateDerivedGraph(
    JSON.parse(readFileSync(path.join(process.cwd(), '.tesseract', 'graph', 'index.json'), 'utf8').replace(/^\uFEFF/, '')),
  );

  const context = findFailureContext(graph, '10001');
  expect(context.scenario).toBe('scenario:10001');
  expect(context.relatedNodes).toContain('generated-spec:10001');
});
