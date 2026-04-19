import { readFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { applyDriftEvents, type VarianceManifest } from '../../product/application/drift/drift';
import { runDogfoodLoop } from '../../workshop/orchestration/dogfood';
import { refreshScenario } from '../../product/application/resolution/refresh';
import { runWithLocalServices } from '../../product/composition/local-services';
import { createAdoId } from '../../product/domain/kernel/identity';
import type { DogfoodLedgerProjection, ImprovementLoopLedger } from '../../product/domain/improvement/types';
import { createTestWorkspace } from '../support/workspace';

test('dogfood loop completes two iterations and produces a legible ledger', async () => {
  test.setTimeout(180_000);
  const workspace = createTestWorkspace('dogfood-loop');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);

    const { ledger, ledgerPath, compatibilityLedgerPath } = await runWithLocalServices(
      runDogfoodLoop({
        paths: workspace.paths,
        maxIterations: 2,
        interpreterMode: 'diagnostic',
      }),
      workspace.rootDir,
    );

    expect(ledger.kind).toBe('improvement-loop-ledger');
    expect(ledger.version).toBe(1);
    expect(ledger.maxIterations).toBe(2);
    expect(ledger.completedIterations).toBeGreaterThanOrEqual(1);
    expect(ledger.completedIterations).toBeLessThanOrEqual(2);
    expect(ledger.iterations.length).toBeGreaterThanOrEqual(1);
    expect(ledger.iterations[0]!.iteration).toBe(1);
    expect(ledger.iterations[0]!.scenarioIds.length).toBeGreaterThan(0);
    expect(ledger.iterations[0]!.knowledgeHitRate).toBeGreaterThanOrEqual(0);
    expect(typeof ledger.knowledgeHitRateDelta).toBe('number');
    expect(typeof ledger.totalProposalsActivated).toBe('number');

    // Hardened ledger fields
    expect(ledger.convergenceReason).toBeDefined();
    expect(typeof ledger.totalInstructionCount).toBe('number');
    expect(ledger.totalInstructionCount).toBeGreaterThanOrEqual(0);
    expect(ledger.iterations[0]!.totalStepCount).toBeGreaterThan(0);
    expect(typeof ledger.iterations[0]!.instructionCount).toBe('number');
    expect(typeof ledger.iterations[0]!.unresolvedStepCount).toBe('number');

    const writtenLedger = JSON.parse(readFileSync(ledgerPath, 'utf8').replace(/^\uFEFF/, '')) as ImprovementLoopLedger;
    const compatibilityLedger = JSON.parse(readFileSync(compatibilityLedgerPath, 'utf8').replace(/^\uFEFF/, '')) as DogfoodLedgerProjection;
    expect(writtenLedger.kind).toBe('improvement-loop-ledger');
    expect(writtenLedger.completedIterations).toBe(ledger.completedIterations);
    expect(writtenLedger.convergenceReason).toBe(ledger.convergenceReason);
    expect(writtenLedger.totalInstructionCount).toBe(ledger.totalInstructionCount);
    expect(compatibilityLedger.kind).toBe('dogfood-ledger');
    expect(compatibilityLedger.completedIterations).toBe(ledger.completedIterations);
  } finally {
    workspace.cleanup();
  }
});

test('dogfood loop converges early when budget is exhausted', async () => {
  test.setTimeout(180_000);
  const workspace = createTestWorkspace('dogfood-budget');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);

    const { ledger } = await runWithLocalServices(
      runDogfoodLoop({
        paths: workspace.paths,
        maxIterations: 5,
        maxInstructionCount: 0,
        interpreterMode: 'diagnostic',
      }),
      workspace.rootDir,
    );

    expect(ledger.converged).toBe(true);
    expect(ledger.convergenceReason).toBe('budget-exhausted');
    expect(ledger.completedIterations).toBe(1);
    expect(ledger.totalInstructionCount).toBeGreaterThanOrEqual(0);
  } finally {
    workspace.cleanup();
  }
});

test('dogfood loop converges when threshold-met on stable knowledge', async () => {
  test.setTimeout(180_000);
  const workspace = createTestWorkspace('dogfood-threshold');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);

    const { ledger } = await runWithLocalServices(
      runDogfoodLoop({
        paths: workspace.paths,
        maxIterations: 3,
        convergenceThreshold: 0.5,
        interpreterMode: 'diagnostic',
      }),
      workspace.rootDir,
    );

    // With a high threshold (0.5), if knowledge doesn't improve by 50%+ between
    // iterations, convergence triggers. Stable knowledge base should trigger this.
    expect(ledger.completedIterations).toBeGreaterThanOrEqual(2);
    expect(['threshold-met', 'no-proposals', 'max-iterations']).toContain(ledger.convergenceReason);
  } finally {
    workspace.cleanup();
  }
});

test('drift applicator mutates knowledge files according to variance manifest', async () => {
  const workspace = createTestWorkspace('drift-applicator');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);

    const manifest: VarianceManifest = {
      kind: 'variance-manifest',
      version: 1,
      description: 'Test drift events for policy-search',
      screen: 'policy-search',
      'drift-events': [
        {
          id: 'label-drift-search-button',
          type: 'label-change',
          target: { screen: 'policy-search', element: 'searchButton' },
          mutation: { field: 'name', from: 'Search', to: 'Find Policies' },
        },
        {
          id: 'locator-drift-results',
          type: 'locator-degradation',
          target: { screen: 'policy-search', element: 'resultsTable' },
          mutation: { field: 'testId', from: 'search-results-table', to: 'results-grid-v2' },
        },
        {
          id: 'element-addition-reset',
          type: 'element-addition',
          target: { screen: 'policy-search' },
          mutation: {
            elementId: 'resetButton',
            definition: { role: 'button', name: 'Reset', testId: 'reset-btn', surface: 'search-actions', widget: 'os-button', required: false },
          },
        },
        {
          id: 'alias-removal-validation',
          type: 'alias-removal',
          target: { screen: 'policy-search', element: 'validationSummary' },
          mutation: { removedAliases: ['error summary'] },
        },
      ],
    };

    const result = await runWithLocalServices(
      applyDriftEvents({ paths: workspace.paths, manifest }),
      workspace.rootDir,
    );

    expect(result.appliedEventIds).toEqual([
      'label-drift-search-button',
      'locator-drift-results',
      'element-addition-reset',
      'alias-removal-validation',
    ]);
    expect(result.modifiedFiles.length).toBeGreaterThanOrEqual(1);

    // Verify elements file was mutated
    const elementsPath = path.join(workspace.rootDir, 'knowledge/screens/policy-search.elements.yaml');
    const elementsText = readFileSync(elementsPath, 'utf8');
    expect(elementsText).toContain('Find Policies');
    expect(elementsText).toContain('results-grid-v2');
    expect(elementsText).toContain('resetButton');

    // Verify hints file was mutated (alias removal). The drift mutation removes
    // the literal alias `error summary`; it does NOT sweep substrings, so
    // compound aliases such as `Assert error summary is shown` (seeded by the
    // richer proposal/decomposition pipeline) must survive. We test the
    // semantic invariant: the literal alias line is gone.
    const hintsPath = path.join(workspace.rootDir, 'knowledge/screens/policy-search.hints.yaml');
    const hintsText = readFileSync(hintsPath, 'utf8');
    expect(hintsText).not.toMatch(/^\s*-\s*error summary\s*$/m);
  } finally {
    workspace.cleanup();
  }
});
