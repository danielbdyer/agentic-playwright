import { readFileSync, statSync, writeFileSync } from 'fs';
import { expect, test } from '@playwright/test';
import { validateDiscoveryIndex } from '../lib/domain/validation';
import { harvestDeclaredRoutes } from '../lib/infrastructure/tooling/harvest-routes';
import { runWithLocalServices } from '../lib/composition/local-services';
import { createTestWorkspace } from './support/workspace';
import { wait } from './support/compiler-helpers';

test('harvest reuses unchanged route receipts and rewrites deterministically on drift', async () => {
  test.setTimeout(180_000);
  const workspace = createTestWorkspace('compiler-harvest-idempotence');
  try {
    await runWithLocalServices(
      harvestDeclaredRoutes({ paths: workspace.paths, app: 'demo' }),
      workspace.rootDir,
    );
    const defaultReceiptPath = workspace.resolve('.tesseract', 'discovery', 'demo', 'policy-search', 'default', 'crawl.json');
    const resultsReceiptPath = workspace.resolve('.tesseract', 'discovery', 'demo', 'policy-search', 'results-with-policy', 'crawl.json');
    const firstIndex = validateDiscoveryIndex(workspace.readJson(
      '.tesseract',
      'discovery',
      'demo',
      'index.json',
    ));
    const firstFingerprint = firstIndex.receipts.find((entry) => entry.variantId === 'default')?.contentFingerprint ?? null;
    const firstResultsFingerprint = firstIndex.receipts.find((entry) => entry.variantId === 'results-with-policy')?.contentFingerprint ?? null;
    const firstModifiedAt = statSync(defaultReceiptPath).mtimeMs;
    const firstResultsModifiedAt = statSync(resultsReceiptPath).mtimeMs;

    await wait(50);
    await runWithLocalServices(
      harvestDeclaredRoutes({ paths: workspace.paths, app: 'demo' }),
      workspace.rootDir,
    );
    const reusedIndex = validateDiscoveryIndex(workspace.readJson(
      '.tesseract',
      'discovery',
      'demo',
      'index.json',
    ));
    const reusedFingerprint = reusedIndex.receipts.find((entry) => entry.variantId === 'default')?.contentFingerprint ?? null;

    expect(reusedIndex.receipts.every((entry) => entry.writeDisposition === 'reused')).toBeTruthy();
    expect(reusedFingerprint).toBe(firstFingerprint);
    expect(statSync(defaultReceiptPath).mtimeMs).toBe(firstModifiedAt);

    const fixturePath = workspace.resolve('fixtures', 'demo-harness', 'policy-search.html');
    const originalFixture = readFileSync(fixturePath, 'utf8').replace(/^\uFEFF/, '');
    writeFileSync(fixturePath, originalFixture.replace('Search Results', 'Policy Matches'), 'utf8');

    await wait(50);
    await runWithLocalServices(
      harvestDeclaredRoutes({ paths: workspace.paths, app: 'demo' }),
      workspace.rootDir,
    );
    const rewrittenIndex = validateDiscoveryIndex(workspace.readJson(
      '.tesseract',
      'discovery',
      'demo',
      'index.json',
    ));
    const rewrittenFingerprint = rewrittenIndex.receipts.find((entry) => entry.variantId === 'default')?.contentFingerprint ?? null;
    const rewrittenResultsEntry = rewrittenIndex.receipts.find((entry) => entry.variantId === 'results-with-policy') ?? null;

    expect(rewrittenIndex.receipts.some((entry) => entry.writeDisposition === 'rewritten')).toBeTruthy();
    expect(rewrittenIndex.receipts.find((entry) => entry.variantId === 'default')?.writeDisposition).toBe('reused');
    expect(rewrittenResultsEntry?.writeDisposition).toBe('rewritten');
    expect(rewrittenFingerprint).toBe(reusedFingerprint);
    expect(rewrittenResultsEntry?.contentFingerprint).not.toBe(firstResultsFingerprint);
    expect(statSync(defaultReceiptPath).mtimeMs).toBe(firstModifiedAt);
    expect(statSync(resultsReceiptPath).mtimeMs).toBeGreaterThan(firstResultsModifiedAt);
  } finally {
    workspace.cleanup();
  }
});
