/**
 * Repair-run preparation: shadow specs, and a repair config that really
 * loads the customer's config (CommonJS TypeScript and ES module
 * workspaces), keeps a setup dependency, drops non-Chromium projects, and
 * points the test project at the shadow specs — checked by asking the real
 * Playwright to list what it would run.
 */
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareRepair, resolveRelativeImport, rewriteShadowImports } from '../../../src/run/repair.js';
import { cleanupRepair } from '../../../src/run/repair.js';
import { minimalConfigSource } from '../../../src/run/playwright.js';
import { makeWorkspace, PLAYWRIGHT_TEST_DIR, type TestWorkspace } from './helpers.js';

const CLI = path.join(PLAYWRIGHT_TEST_DIR, 'cli.js');

const spec = (pageImport: string): string =>
  [
    "import { test, expect } from '@playwright/test';",
    `import { LoginPage } from '${pageImport}';`,
    '',
    "test('ADO 1 — login', { annotation: [{ type: 'ado-id', description: '1' }] }, async ({ page }) => {",
    '  const login = new LoginPage(page);',
    "  await test.step('Open', async () => { await expect(login.page).toBeDefined(); });",
    '});',
    '',
  ].join('\n');

const pageObject = "import type { Page } from '@playwright/test';\nexport class LoginPage { constructor(readonly page: Page) {} }\n";

interface Listed {
  readonly projects: readonly string[];
  readonly tests: readonly { readonly project: string; readonly file: string }[];
  readonly stderr: string;
}

/** `playwright test --list` with the JSON reporter, flattened to (project, absolute file). */
const list = (root: string, config: string): Listed => {
  const listed = spawnSync(process.execPath, [CLI, 'test', '--list', '--config', config, '--reporter', 'json'], { cwd: root, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } });
  const report = JSON.parse(listed.stdout) as {
    config: { rootDir: string; projects: { name: string }[] };
    suites: { file: string; specs: { tests: { projectName: string }[] }[]; suites?: unknown[] }[];
    errors: { message: string }[];
  };
  if (report.errors.length > 0) throw new Error(report.errors.map((e) => e.message).join('\n'));
  return {
    projects: report.config.projects.map((p) => p.name),
    // Suite files are relative to the config's rootDir (its top-level testDir).
    tests: report.suites.flatMap((suite) => suite.specs.flatMap((s) => s.tests.map((t) => ({ project: t.projectName, file: path.resolve(report.config.rootDir, suite.file) })))),
    stderr: listed.stderr,
  };
};

describe('repair preparation', () => {
  let ws: TestWorkspace | undefined;
  afterEach(async () => {
    await ws?.dispose();
    ws = undefined;
  });

  it('rewrites @playwright/test to the fixture and relative imports to the files they name', async () => {
    ws = await makeWorkspace();
    const root = ws.root;
    await fs.mkdir(path.join(root, 'pages'), { recursive: true });
    await fs.mkdir(path.join(root, 'tests', 'login'), { recursive: true });
    await fs.writeFile(path.join(root, 'pages', 'login.page.ts'), pageObject);
    await fs.mkdir(path.join(root, 'flows'), { recursive: true });
    await fs.writeFile(path.join(root, 'flows', 'index.ts'), 'export const x = 1;\n');
    const original = path.join(root, 'tests', 'login', '1-login.spec.ts');
    expect(await resolveRelativeImport(original, '../../pages/login.page')).toBe(path.join(root, 'pages', 'login.page.ts'));
    expect(await resolveRelativeImport(original, '../../pages/login.page.js')).toBe(path.join(root, 'pages', 'login.page.ts'));
    expect(await resolveRelativeImport(original, '../../flows')).toBe(path.join(root, 'flows', 'index.ts'));
    expect(await resolveRelativeImport(original, '../../nowhere')).toBeNull();

    const source = `${spec('../../pages/login.page')}import '../../flows';\nconst lazy = () => import("../../pages/login.page");\nimport { devices } from "@playwright/test";\n`;
    const rewritten = await rewriteShadowImports(source, original, '/x/fixture.ts');
    expect(rewritten).toContain("import { test, expect } from '/x/fixture.ts';");
    expect(rewritten).toContain(`import { LoginPage } from '${path.join(root, 'pages', 'login.page.ts')}';`);
    expect(rewritten).toContain(`import '${path.join(root, 'flows', 'index.ts')}';`);
    expect(rewritten).toContain(`import("${path.join(root, 'pages', 'login.page.ts')}")`);
    expect(rewritten).toContain('import { devices } from "/x/fixture.ts";');
    expect(rewritten.split('\n')).toHaveLength(source.split('\n').length);
  });

  it('writes a minimal config that loads anywhere (plain ESM, no imports)', () => {
    const text = minimalConfigSource('/ws/tests', { baseURL: 'http://x/App/', storageState: '/ws/.auth/qa.json' });
    expect(text).not.toMatch(/^import /m);
    expect(text).toContain('"testDir": "/ws/tests"');
    expect(text).toContain('"trace": "retain-on-failure"');
  });

  const customerProjects = [
    "  projects: [",
    "    { name: 'setup', testMatch: /.*\\.setup\\.ts/ },",
    "    { name: 'chromium', use: { browserName: 'chromium' }, dependencies: ['setup'] },",
    "    { name: 'firefox', use: { browserName: 'firefox' } },",
    '  ],',
  ];

  const prepareIn = async (moduleType: 'commonjs' | 'module', configName: string): Promise<{ readonly listed: Listed; readonly shadow: string; readonly root: string }> => {
    ws = await makeWorkspace({ baseURL: 'http://127.0.0.1:9/App/' });
    const root = ws.root;
    if (moduleType === 'module') await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'customer', type: 'module' }));
    await fs.mkdir(path.join(root, 'pages'), { recursive: true });
    await fs.mkdir(path.join(root, 'tests', 'login'), { recursive: true });
    await fs.writeFile(path.join(root, 'pages', 'login.page.ts'), pageObject);
    await fs.writeFile(path.join(root, 'tests', 'login', '1-login.spec.ts'), spec('../../pages/login.page'));
    await fs.writeFile(path.join(root, 'tests', 'other.spec.ts'), "import { test } from '@playwright/test';\ntest('not requested', () => {});\n");
    await fs.writeFile(path.join(root, 'tests', 'auth.setup.ts'), "import { test as setup } from '@playwright/test';\nsetup('authenticate', async () => {});\n");
    await fs.writeFile(
      path.join(root, configName),
      ["import { defineConfig } from '@playwright/test';", 'export default defineConfig({', "  testDir: 'tests',", '  timeout: 12_345,', ...customerProjects, '});', ''].join('\n'),
    );
    const original = path.join(root, 'tests', 'login', '1-login.spec.ts');
    const plan = await prepareRepair(ws.workspace, {
      repairId: 'r-test',
      specs: [original],
      customerConfig: path.join(root, configName),
      profile: null,
      headed: false,
      outputDir: path.join(ws.workspace.paths.tmp, 'run-x', 'results'),
      reportFile: path.join(ws.workspace.paths.tmp, 'run-x', 'report.json'),
    });
    const shadow = [...plan.originals.keys()][0]!;
    expect(plan.originals.get(shadow)).toBe(original);
    expect(plan.cdpEndpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const listed = list(root, plan.configFile);
    const config = await fs.readFile(plan.configFile, 'utf8');
    expect(config).toContain('--remote-debugging-port=');
    await cleanupRepair(plan);
    await expect(fs.stat(plan.dir)).rejects.toThrow();
    return { listed, shadow, root };
  };

  it.each([
    ['a CommonJS workspace with playwright.config.ts', 'commonjs', 'playwright.config.ts'],
    ['an ES module workspace with playwright.config.ts', 'module', 'playwright.config.ts'],
    ['a workspace with playwright.config.mjs', 'commonjs', 'playwright.config.mjs'],
  ] as const)('imports the customer config in %s: setup kept, firefox dropped, shadow specs only', async (_label, moduleType, configName) => {
    const { listed, shadow, root } = await prepareIn(moduleType, configName);
    expect(listed.stderr).not.toMatch(/could not import/);
    expect([...listed.projects].sort()).toEqual(['chromium', 'setup']);
    expect(listed.tests).toEqual(
      expect.arrayContaining([
        { project: 'setup', file: path.join(root, 'tests', 'auth.setup.ts') },
        { project: 'chromium', file: shadow },
      ]),
    );
    expect(listed.tests).toHaveLength(2);
  }, 60_000);
});
