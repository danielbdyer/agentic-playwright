import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isToolError } from '../../../src/core/errors.js';
import {
  emitFiles,
  emitTest,
  layoutOf,
  locateSpec,
  renderPageObject,
  renderSpec,
} from '../../../src/emit/index.js';
import { DEFAULT_CONFIG, workspacePaths } from '../../../src/workspace/workspace.js';
import type { Workspace } from '../../../src/workspace/workspace.js';
import { loginCatalog, loginRecording, policySearchCatalog, steps10001, testCase10001 } from './fixtures.js';

let root: string;
let workspace: Workspace;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'tesseract-emit-'));
  workspace = { paths: workspacePaths(root), config: DEFAULT_CONFIG };
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const read = (relative: string): Promise<string> => fs.readFile(path.join(root, relative), 'utf8');
const write = async (relative: string, text: string): Promise<void> => {
  await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await fs.writeFile(path.join(root, relative), text);
};

const emitInput = { testCase: testCase10001, steps: steps10001, catalogs: [policySearchCatalog, loginCatalog], area: 'policy' };

const failure = async (promise: Promise<unknown>): Promise<{ family: string; message: string; detail: Readonly<Record<string, unknown>> | undefined }> => {
  try {
    await promise;
  } catch (error) {
    if (isToolError(error)) return { family: error.family, message: error.message, detail: error.detail };
    throw error;
  }
  throw new Error('expected a ToolError');
};

describe('emitTest / emitFiles', () => {
  it('writes the spec, the page objects and the flows, returning POSIX workspace-relative paths and a diff', async () => {
    const result = await emitTest(workspace, { ...emitInput, flows: [{ recording: loginRecording }] });
    expect(result.written).toEqual([
      'tests/policy/10001-verify-policy-search-returns-matching-policy.spec.ts',
      'pages/policy-search.page.ts',
      'pages/login.page.ts',
      'flows/login.ts',
    ]);
    expect(result.files.map((f) => f.status)).toEqual(['created', 'created', 'created', 'created']);
    expect(result.diff).toContain('--- /dev/null\n+++ b/tests/policy/10001-verify-policy-search-returns-matching-policy.spec.ts\n');
    expect(await read('tests/policy/10001-verify-policy-search-returns-matching-policy.spec.ts')).toBe(result.spec.text);
    expect(await read('flows/login.ts')).toContain('export async function login(page: Page, params: LoginParams)');
  });

  it('re-emitting the same inputs writes nothing and returns an empty diff', async () => {
    await emitTest(workspace, emitInput);
    const before = await fs.stat(path.join(root, 'pages/policy-search.page.ts'));
    const again = await emitTest(workspace, emitInput);
    expect(again.written).toEqual([]);
    expect(again.changed).toEqual([]);
    expect(again.diff).toBe('');
    expect(again.files.every((f) => f.status === 'unchanged')).toBe(true);
    expect((await fs.stat(path.join(root, 'pages/policy-search.page.ts'))).mtimeMs).toBe(before.mtimeMs);
  });

  it('a formatter run over emitted files does not make the next emit rewrite them', async () => {
    await emitTest(workspace, emitInput);
    const specPath = 'tests/policy/10001-verify-policy-search-returns-matching-policy.spec.ts';
    const formatted = (await read(specPath)).replace(/'([^'"\\\n]*)'/g, '"$1"').replace(/^( +)/gm, (s) => s + s);
    await write(specPath, formatted);
    const again = await emitTest(workspace, emitInput);
    expect(again.written).toEqual([]);
    expect(await read(specPath)).toBe(formatted);
  });

  it('a dry run returns the diff and writes nothing', async () => {
    const result = await emitTest(workspace, emitInput, { dryRun: true });
    expect(result.written).toEqual([]);
    expect(result.changed).toHaveLength(2);
    expect(result.diff).toContain('+++ b/pages/policy-search.page.ts');
    await expect(fs.access(path.join(root, 'pages'))).rejects.toThrow();
  });

  it('a hand edit is a conflict that writes nothing at all; force writes', async () => {
    await emitTest(workspace, emitInput);
    const pagePath = 'pages/policy-search.page.ts';
    const edited = (await read(pagePath)).replace("{ name: 'Search', exact: true }", "{ name: 'Find' }");
    await write(pagePath, edited);
    const revised = { ...emitInput, testCase: { ...testCase10001, revision: 2 } };
    const error = await failure(emitTest(workspace, revised));
    expect(error.family).toBe('conflict');
    expect(error.message).toContain('pages/policy-search.page.ts');
    expect(error.detail?.['diff']).toEqual(expect.stringContaining("-    return this.page.getByRole('search').getByRole('button', { name: 'Find' });"));
    expect(await read('tests/policy/10001-verify-policy-search-returns-matching-policy.spec.ts')).toContain("description: '1' }");
    const forced = await emitTest(workspace, revised, { force: true });
    expect(forced.written).toContain(pagePath);
    expect(forced.files.find((f) => f.path === pagePath)?.handEdited).toBe(true);
    expect(await read(pagePath)).not.toContain('Find');
  });

  it('keeps the existing line endings and byte-order mark', async () => {
    await emitTest(workspace, emitInput);
    const specPath = 'tests/policy/10001-verify-policy-search-returns-matching-policy.spec.ts';
    await write(specPath, `\uFEFF${(await read(specPath)).replace(/\n/g, '\r\n')}`);
    await emitTest(workspace, { ...emitInput, testCase: { ...testCase10001, revision: 2 } });
    const text = await read(specPath);
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text).toContain("{ type: 'ado-revision', description: '2' },\r\n");
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('keeps a spec where it is when the ADO title changes (sticky path), and refuses two specs for one case', async () => {
    await emitTest(workspace, emitInput);
    const renamed = { ...emitInput, testCase: { ...testCase10001, title: 'Policy search finds the policy', revision: 2 } };
    const result = await emitTest(workspace, renamed);
    expect(result.spec.path).toBe('tests/policy/10001-verify-policy-search-returns-matching-policy.spec.ts');
    expect(await read(result.spec.path)).toContain("test('ADO 10001 — Policy search finds the policy', {");
    expect(await locateSpec(workspace, '10001')).toBe(result.spec.path);
    expect(await locateSpec(workspace, '1000')).toBeNull();

    // emitFiles refuses a spec rendered at a different path than the existing one.
    const elsewhere = renderSpec({ ...emitInput, area: 'other', layout: layoutOf(workspace) });
    expect((await failure(emitFiles(workspace, { spec: elsewhere, pageObjects: [], flows: [] }))).family).toBe('conflict');

    await write('tests/other/10001-copy.spec.ts', '// a copy\n');
    expect((await failure(locateSpec(workspace, '10001'))).family).toBe('conflict');
  });

  it('honours an overrides file next to the page object', async () => {
    await write(
      'pages/policy-search.page.overrides.ts',
      "import type { Locator, Page } from '@playwright/test';\nexport class PolicySearchPageOverrides {\n  readonly page: Page;\n  constructor(page: Page) {\n    this.page = page;\n  }\n  get searchButton(): Locator {\n    return this.page.getByRole('button', { name: 'Find' });\n  }\n}\n",
    );
    const result = await emitTest(workspace, emitInput);
    const page = await read('pages/policy-search.page.ts');
    expect(page).toContain('export class PolicySearchPage extends PolicySearchPageOverrides {');
    expect(page).not.toContain('get searchButton');
    expect(result.pageObjects[0]!.members['policy-search:search-button']).toBe('searchButton');
  });

  it('refuses paths outside the workspace and duplicate paths', async () => {
    const page = renderPageObject('policy-search', policySearchCatalog.route, policySearchCatalog.facets, null);
    expect((await failure(emitFiles(workspace, { pageObjects: [{ ...page, path: '../outside.ts' }], flows: [] }))).family).toBe('invalid-input');
    expect((await failure(emitFiles(workspace, { pageObjects: [page, page], flows: [] }))).family).toBe('invalid-input');
  });

  it('reports orphaned kept code per file', async () => {
    await emitTest(workspace, emitInput);
    const pagePath = 'pages/policy-search.page.ts';
    await write(pagePath, (await read(pagePath)).replace('  /** facet policy-search:search-button', '  // tesseract:keep\n  /** facet policy-search:search-button'));
    const retired = {
      ...policySearchCatalog,
      facets: policySearchCatalog.facets.map((f) => (f.id === 'policy-search:search-button' ? { ...f, status: 'retired' as const } : f)),
    };
    const steps = steps10001.map((s) => (s.index === 3 ? { ...s, handoffId: 'h-3' } : s));
    const result = await emitTest(workspace, { ...emitInput, steps, catalogs: [retired] });
    expect(result.orphaned).toEqual([{ path: pagePath, keys: ['policy-search:search-button'] }]);
  });
});
