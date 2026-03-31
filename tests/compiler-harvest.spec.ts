import { expect, test } from '@playwright/test';
import { validateDiscoveryIndex } from '../lib/domain/validation';
import { harvestDeclaredRoutes } from '../lib/infrastructure/tooling/harvest-routes';
import { runWithLocalServices } from '../lib/composition/local-services';
import { createTestWorkspace } from './support/workspace';

test('harvest visits declared route variants and writes route-scoped receipts', async () => {
  test.setTimeout(60_000);
  const workspace = createTestWorkspace('compiler-harvest');
  try {
    const result = await runWithLocalServices(
      harvestDeclaredRoutes({ paths: workspace.paths, app: 'demo' }),
      workspace.rootDir,
    );
    const index = validateDiscoveryIndex(workspace.readJson(
      '.tesseract',
      'discovery',
      'demo',
      'index.json',
    ));
    const defaultReceipt = workspace.readJson<{
      app: string;
      routeId: string;
      variantId: string;
      url: string;
      selectorProbes: Array<{ variantRef: string }>;
      stateObservations: Array<{ stateRef: string; source: string; observed: boolean }>;
      eventCandidates: Array<{ eventSignatureRef: string }>;
      transitionObservations: Array<{ transitionRef?: string | null; classification: string }>;
      observationDiffs: Array<{ eventSignatureRef?: string | null; classification: string }>;
      targets: unknown[];
    }>('.tesseract', 'discovery', 'demo', 'policy-search', 'default', 'crawl.json');
    const seededReceipt = workspace.readJson<{ variantId: string; url: string }>(
      '.tesseract',
      'discovery',
      'demo',
      'policy-search',
      'results-with-policy',
      'crawl.json',
    );

    expect(result.failures).toEqual([]);
    expect(result.receipts).toEqual(expect.arrayContaining([
      '.tesseract/discovery/demo/policy-search/default/crawl.json',
      '.tesseract/discovery/demo/policy-search/results-with-policy/crawl.json',
      '.tesseract/discovery/demo/policy-detail/with-policy/crawl.json',
    ]));
    expect(index.app).toBe('demo');
    expect(index.version).toBe(2);
    expect(index.receipts).toHaveLength(3);
    expect(index.receipts.every((entry) => entry.status === 'ok')).toBeTruthy();
    expect(index.receipts.every((entry) => entry.writeDisposition === 'rewritten')).toBeTruthy();
    expect(index.receipts.every((entry) => entry.contentFingerprint?.startsWith('sha256:'))).toBeTruthy();
    expect(index.receipts.every((entry) => entry.inputFingerprint?.startsWith('sha256:'))).toBeTruthy();
    expect(defaultReceipt.app).toBe('demo');
    expect(defaultReceipt.routeId).toBe('policy-search');
    expect(defaultReceipt.variantId).toBe('default');
    expect(defaultReceipt.url.startsWith('file:///')).toBeTruthy();
    expect(defaultReceipt.targets.length).toBeGreaterThan(0);
    expect(defaultReceipt.selectorProbes.length).toBeGreaterThan(0);
    expect(defaultReceipt.selectorProbes.every((probe) => probe.variantRef === 'route-variant:demo:policy-search:default')).toBeTruthy();
    expect(defaultReceipt.stateObservations.length).toBeGreaterThan(0);
    expect(defaultReceipt.eventCandidates.map((candidate) => candidate.eventSignatureRef)).toEqual([
      'event:policy-search:click-search',
      'event:policy-search:enter-policy-number',
    ]);
    expect(defaultReceipt.transitionObservations.some((entry) => entry.transitionRef === 'transition:policy-search:populate-policy-number')).toBeTruthy();
    expect(defaultReceipt.transitionObservations.some((entry) => entry.transitionRef === 'transition:policy-search:show-results')).toBeTruthy();
    expect(defaultReceipt.transitionObservations.every((entry) => entry.classification === 'matched')).toBeTruthy();
    expect(defaultReceipt.observationDiffs.some((entry) => entry.eventSignatureRef === 'event:policy-search:enter-policy-number' && entry.classification === 'observed')).toBeTruthy();
    expect(seededReceipt.variantId).toBe('results-with-policy');
    expect(seededReceipt.url).toContain('seed=POL-001');
  } finally {
    workspace.cleanup();
  }
});
