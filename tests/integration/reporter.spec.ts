import { readFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { refreshScenario } from '../../lib/application/resolution/refresh';
import { runWithLocalServices } from '../../lib/composition/local-services';
import { createAdoId } from '../../lib/domain/kernel/identity';
import { classifyFailure, findFailureContext } from '../../lib/infrastructure/reporting/tesseract-reporter';
import { validateDerivedGraph } from '../../lib/domain/validation';
import { createTestWorkspace } from '../support/workspace';

test('reporter graph context resolves a failed test back to the scenario node', async () => {
  const workspace = createTestWorkspace('reporter-graph-context');
  try {
    await runWithLocalServices(refreshScenario({ adoId: createAdoId('10001'), paths: workspace.paths }), workspace.rootDir);
    const graph = validateDerivedGraph(
      JSON.parse(readFileSync(path.join(workspace.rootDir, '.tesseract', 'graph', 'index.json'), 'utf8').replace(/^\uFEFF/, '')),
    );

    const context = findFailureContext(graph, '10001');
    expect(context.scenario).toBe('scenario:10001');
    expect(context.relatedNodes).toContain('generated-spec:10001');
  } finally {
    workspace.cleanup();
  }
});

test('reporter classifies runtime domain failures from stable runtime error code prefix', () => {
  const classification = classifyFailure('[runtime-unknown-screen] Unknown screen policy-search');
  expect(classification).toBe('runtime-domain');
});


test('reporter classifies assertion mismatches for forbidden auto-heal classes', () => {
  const classification = classifyFailure('Error: expect(page).toMatchAriaSnapshot() to match ARIA snapshot');
  expect(classification).toBe('structural-mismatch');
});
