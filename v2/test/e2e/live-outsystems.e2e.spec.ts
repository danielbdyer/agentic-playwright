/**
 * Real contact, opt-in: TESSERACT_LIVE=1 npm run test:e2e.
 *
 * The batch driver with the heuristic decider (no model) authors a small
 * read-only case on the public OutSystems UI website's Productcatalog route
 * and runs the emitted spec against the live site. Productcatalog is a
 * `study` route in workshop/substrate-study/corpus/outsystems-ui-website.partition.json,
 * so this is a contact check, not a held-out evaluation; the actions are a
 * navigation and typing into a search box (no form submission, no writes).
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authorSuite } from '../../src/driver/index.js';
import { createCliRuntime } from '../../src/cli/runtime.js';
import type { Runtime } from '../../src/tools/runtime.js';
import { startMockAdo, stepsXml, type MockAdo } from '../support/mock-ado.js';
import { V2_ROOT } from './support.js';

const LIVE = process.env.TESSERACT_LIVE === '1';
const BASE = 'https://outsystemsui.outsystems.com/OutSystemsUIWebsite/';

describe.skipIf(!LIVE)('live OutSystems Reactive contact (study route, read-only)', () => {
  let root: string;
  let ado: MockAdo;
  let runtime: Runtime;

  beforeAll(async () => {
    await mkdir(path.join(V2_ROOT, '.tmp'), { recursive: true });
    root = await mkdtemp(path.join(V2_ROOT, '.tmp', 'live-'));
    ado = await startMockAdo({
      cases: [{
        id: 30001,
        rev: 1,
        title: 'Product catalog search finds headphones',
        tags: 'live; study-route',
        steps: stepsXml([
          { id: 2, action: 'Navigate to Product catalog screen', expected: 'Product catalog screen loads' },
          { id: 3, action: 'Enter "Headphones" in the search field', expected: '' },
          { id: 4, action: 'Verify the product list shows Headphones', expected: 'Headphones appear in the list' },
        ]),
      }],
    });
    await mkdir(path.join(root, '.tesseract', 'profiles'), { recursive: true });
    await writeFile(path.join(root, '.tesseract', 'profiles', 'osui.json'), JSON.stringify({ name: 'osui', baseURL: BASE }));
    await writeFile(path.join(root, '.tesseract', 'config.json'), JSON.stringify({ ado: { orgUrl: ado.url, project: ado.project, patEnv: 'AZURE_DEVOPS_PAT' } }));
    await writeFile(
      path.join(root, 'playwright.config.ts'),
      "import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: 'tests', timeout: 60_000, use: { baseURL: process.env.TESSERACT_BASE_URL ?? '" + BASE + "' } });\n",
    );
    runtime = await createCliRuntime({ root, env: { ...process.env, AZURE_DEVOPS_PAT: 'live' } });
  }, 60_000);

  afterAll(async () => {
    await runtime?.close();
    await ado?.close();
    if (process.env.TESSERACT_E2E_KEEP !== '1') await rm(root, { recursive: true, force: true });
  });

  it('authors every step with no model and the emitted spec passes against the live site', async () => {
    const summary = await authorSuite(runtime, { testCaseIds: ['30001'], profile: 'osui', startUrl: 'Productcatalog', run: true });
    const result = summary.cases[0]!;
    expect(result.outcome, JSON.stringify(result.steps, null, 2)).toBe('authored');
    expect(result.steps.map((s) => s.status)).toEqual(['resolved', 'resolved', 'resolved']);
    expect(summary.run).toMatchObject({ passed: 1, failed: 0 });

    const spec = await readFile(path.join(root, result.specPath!), 'utf8');
    expect(spec).not.toMatch(/getBy|locator\(/);
    const pageObject = await readFile(path.join(root, 'pages', 'product-catalog.page.ts'), 'utf8');
    // The placeholder-named searchbox, scoped by the search landmark the reality study found on every route.
    expect(pageObject).toMatch(/getByRole\('search'\)\.getByRole\('searchbox', \{ name: 'Search Product', exact: true \}\)/);
  }, 300_000);
});
