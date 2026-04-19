import { readFileSync, statSync, writeFileSync } from 'fs';
import { expect, test } from '@playwright/test';
import { validateDiscoveryIndex } from '../../product/domain/validation';
import { harvestDeclaredRoutes } from '../../product/instruments/tooling/harvest-routes';
import { runWithLocalServices } from '../../product/composition/local-services';
import { createTestWorkspace } from '../support/workspace';
import { wait } from '../support/compiler-helpers';

test('harvest reuses unchanged route receipts and rewrites deterministically on drift', async () => {
  test.setTimeout(60_000);
  const workspace = createTestWorkspace('compiler-harvest-idempotence');
  try {
    // === First harvest: everything is new → rewritten ===
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
    const firstModifiedAt = statSync(defaultReceiptPath).mtimeMs;
    const firstResultsModifiedAt = statSync(resultsReceiptPath).mtimeMs;

    // Verify inputFingerprint is populated after first harvest
    expect(firstIndex.receipts.every((entry) => entry.inputFingerprint?.startsWith('sha256:'))).toBeTruthy();
    const firstInputFingerprint = firstIndex.receipts.find((entry) => entry.variantId === 'default')?.inputFingerprint ?? null;
    expect(firstInputFingerprint).toBeTruthy();

    // === Second harvest: nothing changed → all reused via input fingerprint skip ===
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
    expect(reusedIndex.receipts.find((entry) => entry.variantId === 'default')?.inputFingerprint).toBe(firstInputFingerprint);
    expect(statSync(defaultReceiptPath).mtimeMs).toBe(firstModifiedAt);

    // === Third harvest: mutate HTML fixture (content drift) ===
    // Input fingerprint tracks route config + knowledge, not page content.
    // So an HTML-only change is skipped by input fingerprinting (no recrawl needed
    // from the harvest system's perspective — the inputs that govern crawl behavior
    // haven't changed). This is by design: input fingerprinting optimizes away
    // unnecessary browser launches when the harvest configuration is stable.
    const fixturePath = workspace.resolve('fixtures', 'demo-harness', 'policy-search.html');
    const originalFixture = readFileSync(fixturePath, 'utf8').replace(/^\uFEFF/, '');
    writeFileSync(fixturePath, originalFixture.replace('Search Results', 'Policy Matches'), 'utf8');

    await wait(50);
    await runWithLocalServices(
      harvestDeclaredRoutes({ paths: workspace.paths, app: 'demo' }),
      workspace.rootDir,
    );
    const afterHtmlChangeIndex = validateDiscoveryIndex(workspace.readJson(
      '.tesseract',
      'discovery',
      'demo',
      'index.json',
    ));

    // All reused — input fingerprint matches, so crawl is skipped entirely
    expect(afterHtmlChangeIndex.receipts.every((entry) => entry.writeDisposition === 'reused')).toBeTruthy();
    expect(statSync(defaultReceiptPath).mtimeMs).toBe(firstModifiedAt);
    expect(statSync(resultsReceiptPath).mtimeMs).toBe(firstResultsModifiedAt);

    // === Fourth harvest: mutate knowledge behavior → input fingerprint changes → recrawl ===
    const behaviorPath = workspace.suiteResolve('knowledge', 'screens', 'policy-search.behavior.yaml');
    const originalBehavior = readFileSync(behaviorPath, 'utf8');
    // Add an alias to change the file content without breaking ref integrity
    writeFileSync(behaviorPath, originalBehavior.replace(
      '  - policy search behavior',
      '  - policy search behavior\n  - policy search behavior v2',
    ), 'utf8');

    await wait(50);
    await runWithLocalServices(
      harvestDeclaredRoutes({ paths: workspace.paths, app: 'demo' }),
      workspace.rootDir,
    );
    const afterBehaviorChangeIndex = validateDiscoveryIndex(workspace.readJson(
      '.tesseract',
      'discovery',
      'demo',
      'index.json',
    ));

    // policy-search variants should be recrawled (their screen's behavior changed the input fingerprint)
    const defaultAfterBehavior = afterBehaviorChangeIndex.receipts.find((entry) => entry.variantId === 'default');
    expect(defaultAfterBehavior?.inputFingerprint).not.toBe(firstInputFingerprint);
    // At least one variant must have been rewritten (results-with-policy sees the HTML mutation)
    const resultsAfterBehavior = afterBehaviorChangeIndex.receipts.find((entry) => entry.variantId === 'results-with-policy');
    expect(resultsAfterBehavior?.writeDisposition).toBe('rewritten');
    expect(resultsAfterBehavior?.inputFingerprint).not.toBe(firstInputFingerprint);
  } finally {
    workspace.cleanup();
  }
});
