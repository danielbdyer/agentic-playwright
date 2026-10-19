/**
 * The emitted files are real TypeScript that Playwright collects: write a
 * spec (single row, beforeEach flow), a multi-row spec (describe, fixme step,
 * select helper, page-level assertions), their page objects (one extending an
 * overrides file) and a flow into a temp project under v2/.tmp/ (so
 * @playwright/test resolves through node_modules), then
 *   - tsc --noEmit under strict, noUnused*, erasableSyntaxOnly, verbatimModuleSyntax;
 *   - playwright test --list --reporter=json in an ESM ("type": "module") project,
 * and check Playwright sees the titles, tags and details-object annotations.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedStep, TestCase } from '../../../src/contract/schemas.js';
import { emitFiles, renderFlow, renderOverridesScaffold, renderPageObject, renderSpec } from '../../../src/emit/index.js';
import type { ScreenCatalog } from '../../../src/emit/index.js';
import { DEFAULT_CONFIG, workspacePaths } from '../../../src/workspace/workspace.js';
import { facet, handoff, loginCatalog, loginRecording, policySearchCatalog, steps10001, testCase10001 } from './fixtures.js';

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const v2Root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tscBin = require.resolve('typescript/bin/tsc');
const playwrightCli = require.resolve('@playwright/test/cli');

const searchCatalog: ScreenCatalog = {
  ...policySearchCatalog,
  facets: [
    ...policySearchCatalog.facets,
    facet({ id: 'policy-search:status', role: 'combobox', tag: 'select', namingSource: 'label-for', locators: [{ strategy: 'label', value: 'Status' }] }),
    facet({ id: 'policy-search:region', role: 'combobox', tag: 'div', namingSource: 'aria-label', locators: [{ strategy: 'role-name', role: 'combobox', name: 'Region' }] }),
    facet({ id: 'policy-search:active-only', role: 'checkbox', tag: 'input', namingSource: 'label-wrap', status: 'stale', locators: [{ strategy: 'label', value: 'Active only' }] }),
  ],
};

const reportsCatalog: ScreenCatalog = {
  screen: 'reports',
  route: { url: '/Reports' },
  facets: [
    facet({ id: 'reports:export-button', role: 'button', tag: 'button', locators: [{ strategy: 'role-name', role: 'button', name: 'Export' }] }),
    facet({ id: 'reports:title', role: 'heading', tag: 'h1', locators: [{ strategy: 'role-name', role: 'heading', name: 'Reports' }] }),
  ],
};

const testCase10002: TestCase = {
  id: '10002',
  title: 'Filter policies by status and region',
  revision: 4,
  contentHash: 'sha256:abc',
  tags: ['Regression Suite; nightly'],
  steps: [
    { index: 1, stepIdentifier: '2', action: 'Open “Policy Search”', expected: 'Search screen loads' },
    { index: 2, stepIdentifier: '3', action: 'Pick @status in the Status list', expected: '' },
    { index: 3, stepIdentifier: '4', action: 'Pick the region @region', expected: '' },
    { index: 4, stepIdentifier: '5', action: 'Tick Active only and search', expected: 'Results are filtered' },
    { index: 5, stepIdentifier: '6;1', action: 'Verify the result count', expected: '@count rows' },
  ],
  parameters: ['status', 'region', 'count'],
  dataRows: [
    { status: 'Active', region: 'North', count: '2' },
    { status: 'Lapsed', region: 'South', count: '0' },
  ],
};

const steps10002: readonly ResolvedStep[] = [
  {
    index: 1,
    stepIdentifier: '2',
    actionText: 'Open “Policy Search”',
    expectedText: 'Search screen loads',
    verb: 'navigate',
    screen: 'policy-search',
    assertions: [{ kind: 'url' }, { kind: 'title', expected: 'Policy Search' }],
  },
  { index: 2, stepIdentifier: '3', actionText: 'Pick @status in the Status list', expectedText: '', verb: 'select', target: { facetId: 'policy-search:status' }, value: '@status' },
  { index: 3, stepIdentifier: '4', actionText: 'Pick the region @region', expectedText: '', verb: 'select', target: { facetId: 'policy-search:region' }, value: '@region' },
  {
    index: 4,
    stepIdentifier: '5',
    actionText: 'Tick Active only and search',
    expectedText: 'Results are filtered',
    verb: 'check',
    target: { facetId: 'policy-search:active-only' },
    assertions: [{ kind: 'checked' }, { kind: 'contains-text', target: { facetId: 'policy-search:heading' }, expected: 'Policy @status' }],
  },
  { index: 5, stepIdentifier: '6;1', actionText: 'Verify the result count', expectedText: '@count rows', verb: 'assert', handoffId: 'h-10002-5' },
];

interface ListedTest {
  readonly title: string;
  readonly tags: readonly string[];
  readonly annotations: readonly { readonly type: string; readonly description?: string }[];
}

interface ListedSuite {
  readonly title: string;
  readonly specs?: readonly { readonly title: string; readonly tags: readonly string[]; readonly tests: readonly { readonly annotations: ListedTest['annotations'] }[] }[];
  readonly suites?: readonly ListedSuite[];
}

const flatten = (suite: ListedSuite, prefix: readonly string[]): readonly ListedTest[] => [
  ...(suite.specs ?? []).map((spec) => ({ title: [...prefix, spec.title].join(' › '), tags: spec.tags, annotations: spec.tests[0]?.annotations ?? [] })),
  ...(suite.suites ?? []).flatMap((child) => flatten(child, [...prefix, child.title])),
];

describe('emitted files compile and are collected by Playwright', () => {
  let dir: string;

  beforeAll(async () => {
    await fs.mkdir(path.join(v2Root, '.tmp'), { recursive: true });
    dir = await fs.mkdtemp(path.join(v2Root, '.tmp', 'emit-compile-'));
    const workspace = { paths: workspacePaths(dir), config: DEFAULT_CONFIG };
    const specA = renderSpec({
      testCase: testCase10001,
      steps: steps10001,
      catalogs: [searchCatalog, loginCatalog],
      area: 'policy',
      flows: [{ recording: loginRecording }],
    });
    const specB = renderSpec({ testCase: testCase10002, steps: steps10002, catalogs: [searchCatalog], handoffs: [handoff({ handoffId: 'h-10002-5', testCaseId: '10002', stepIndex: 5 })] });
    const overrides = renderOverridesScaffold('reports').replace(
      '  // Example (add Locator to the type import):',
      "  get exportButton(): Locator {\n    return this.page.getByRole('button', { name: 'Export CSV' });\n  }\n\n  // Example (add Locator to the type import):",
    ).replace("import type { Page } from '@playwright/test';", "import type { Locator, Page } from '@playwright/test';");
    await fs.mkdir(path.join(dir, 'pages'), { recursive: true });
    await fs.writeFile(path.join(dir, 'pages/reports.page.overrides.ts'), overrides);
    const result = await emitFiles(workspace, {
      spec: specA,
      pageObjects: [
        renderPageObject('policy-search', searchCatalog.route, searchCatalog.facets, null),
        renderPageObject('login', loginCatalog.route, loginCatalog.facets, null),
        renderPageObject('reports', reportsCatalog.route, reportsCatalog.facets, overrides),
      ],
      flows: [renderFlow(loginRecording, new Map(loginCatalog.facets.map((f) => [f.id, f])), { login: loginCatalog.route })],
    });
    expect(result.written).toHaveLength(5);
    expect((await emitFiles(workspace, { spec: specB, pageObjects: [], flows: [] })).written).toEqual([specB.path]);

    await fs.writeFile(path.join(dir, 'package.json'), '{ "private": true, "type": "module" }\n');
    await fs.writeFile(
      path.join(dir, 'tsconfig.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            strict: true,
            noUncheckedIndexedAccess: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noImplicitOverride: true,
            exactOptionalPropertyTypes: true,
            erasableSyntaxOnly: true,
            verbatimModuleSyntax: true,
            types: ['node'],
            skipLibCheck: true,
            noEmit: true,
          },
          include: ['tests/**/*.ts', 'pages/**/*.ts', 'flows/**/*.ts'],
        },
        null,
        2,
      )}\n`,
    );
    await fs.writeFile(path.join(dir, 'playwright.config.mjs'), "export default { testDir: './tests', use: { baseURL: 'https://qa.example.com/App/' } };\n");
  }, 60_000);

  afterAll(async () => {
    // TESSERACT_KEEP_EMIT_TMP=1 leaves the project in v2/.tmp/ for inspection.
    if (dir !== undefined && process.env['TESSERACT_KEEP_EMIT_TMP'] !== '1') await fs.rm(dir, { recursive: true, force: true });
  });

  it('type-checks under a strict customer tsconfig', async () => {
    const outcome = await run(process.execPath, [tscBin, '-p', path.join(dir, 'tsconfig.json')], { cwd: dir }).then(
      () => ({ code: 0, output: '' }),
      (error: { code?: number; stdout?: string; stderr?: string }) => ({ code: error.code ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` }),
    );
    expect(outcome.output).toBe('');
    expect(outcome.code).toBe(0);
  }, 60_000);

  it('is collected by playwright test --list with titles, tags and annotations', async () => {
    const { stdout } = await run(process.execPath, [playwrightCli, 'test', '--list', '--reporter=json', '--config', path.join(dir, 'playwright.config.mjs')], {
      cwd: dir,
      env: { ...process.env, CI: '1', PW_TEST_HTML_REPORT_OPEN: 'never' },
      maxBuffer: 16 * 1024 * 1024,
    });
    const report = JSON.parse(stdout) as { readonly suites: readonly ListedSuite[]; readonly errors: readonly unknown[] };
    expect(report.errors).toEqual([]);
    const tests = report.suites.flatMap((suite) => flatten(suite, []));
    const annotation = (test: ListedTest, type: string): string | undefined => test.annotations.find((a) => a.type === type)?.description;

    const single = tests.find((t) => t.title === 'ADO 10001 — Verify policy search returns matching policy');
    expect(single).toBeDefined();
    expect(single!.tags).toEqual(['smoke', 'billing', 'P1']);
    expect(annotation(single!, 'ado-id')).toBe('10001');
    expect(annotation(single!, 'ado-revision')).toBe('1');
    expect(annotation(single!, 'content-hash')).toBe(testCase10001.contentHash);
    expect(JSON.parse(annotation(single!, 'ado-steps') ?? '[]')).toEqual(['2', '3', '4', '5']);

    const rows = tests.filter((t) => t.title.startsWith('ADO 10002 — Filter policies by status and region › '));
    expect(rows.map((t) => t.title)).toEqual([
      'ADO 10002 — Filter policies by status and region › Active, North, 2',
      'ADO 10002 — Filter policies by status and region › Lapsed, South, 0',
    ]);
    expect(rows.map((t) => annotation(t, 'ado-data-row'))).toEqual(['1', '2']);
    expect(rows.every((t) => annotation(t, 'ado-id') === '10002' && annotation(t, 'ado-revision') === '4')).toBe(true);
    expect(rows[0]!.tags).toEqual(['Regression-Suite-nightly']);
    expect(JSON.parse(annotation(rows[0]!, 'ado-steps') ?? '[]')).toEqual(['2', '3', '4', '5', '6;1']);
    expect(annotation(rows[0]!, 'ado-tags')).toBe('Regression Suite; nightly');
  }, 60_000);
});
