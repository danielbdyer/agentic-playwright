/**
 * The case cache: one `<id>.json` per test case under .tesseract/cases/, the
 * TestCase exactly as ado.fetch returned it. test.emit loads cases by id from
 * here, and the MCP `tesseract://cases/{id}` resource serves these files.
 */
import path from 'node:path';
import { ToolError } from '../core/errors.js';
import { listFiles, readText, writeJson } from '../core/fsio.js';
import { TestCaseSchema, type TestCase } from '../contract/schemas.js';
import type { Workspace } from '../workspace/workspace.js';
import type { AdoClient } from './client.js';
import { fetchTestCases, parseWorkItemIds, type FetchSelector } from './fetch.js';
import { compareCaseIds } from './testcase.js';

/** Same rule as the server's case resource, so every cached id is addressable there. */
const CASE_ID = /^[A-Za-z0-9_-]+$/;

export const casePath = (workspace: Workspace, id: string): string => {
  if (!CASE_ID.test(id)) throw new ToolError('invalid-input', `invalid test case id: ${JSON.stringify(id)}`);
  return path.join(workspace.paths.cases, `${id}.json`);
};

/** Write a case to the cache (atomically) and return the file path. */
export const saveCase = async (workspace: Workspace, testCase: TestCase): Promise<string> => {
  const file = casePath(workspace, testCase.id);
  await writeJson(file, TestCaseSchema.parse(testCase));
  return file;
};

/** Read a cached case; null when it was never fetched; malformed-response when the file is not a valid TestCase. */
export const loadCase = async (workspace: Workspace, id: string): Promise<TestCase | null> => {
  const file = casePath(workspace, id);
  const text = await readText(file);
  if (text === null) return null;
  const parsed = ((): unknown => {
    try {
      return JSON.parse(text.replace(/^﻿/, '')) as unknown;
    } catch (error) {
      throw new ToolError('malformed-response', `cached case ${id} is not valid JSON (${(error as Error).message}); fetch it again with refresh`, { file });
    }
  })();
  const result = TestCaseSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ToolError(
      'malformed-response',
      `cached case ${id} does not match the TestCase shape${issue !== undefined ? ` (${issue.path.join('.') || '(root)'}: ${issue.message})` : ''}; fetch it again with refresh`,
      { file },
    );
  }
  return result.data;
};

/** Ids of every cached case, numeric ids in numeric order. */
export const listCachedCases = async (workspace: Workspace): Promise<readonly string[]> =>
  (await listFiles(workspace.paths.cases, '.json'))
    .map((file) => path.basename(file, '.json'))
    .filter((id) => CASE_ID.test(id))
    .sort(compareCaseIds);

export interface CachedFetchInput extends FetchSelector {
  /** Re-read from Azure DevOps even when every requested case is cached. */
  readonly refresh?: boolean;
}

/** The ado.fetch output shape. */
export interface CachedFetchResult {
  readonly testCases: readonly TestCase[];
  readonly source: 'ado' | 'cache';
  readonly warnings: readonly string[];
}

/**
 * ado.fetch end to end. A request by ids alone is answered from the cache
 * when every case is cached and refresh is not set, and from the cache when
 * Azure DevOps is not configured (client null) and every case is cached.
 * Otherwise the cases are fetched (a WIQL or plan/suite request always goes
 * to Azure DevOps, since membership cannot be known offline) and each one is
 * written to the cache.
 */
export const fetchWithCache = async (workspace: Workspace, client: AdoClient | null, input: CachedFetchInput): Promise<CachedFetchResult> => {
  const idsOnly = input.ids !== undefined && input.ids.length > 0 && input.wiql === undefined && input.planId === undefined && input.suiteId === undefined;
  if (idsOnly && (input.refresh !== true || client === null)) {
    const ids = parseWorkItemIds(input.ids ?? []).map(String);
    const cached = await Promise.all(ids.map((id) => loadCase(workspace, id)));
    if (cached.every((testCase): testCase is TestCase => testCase !== null)) {
      return {
        testCases: [...cached].sort((a, b) => compareCaseIds(a.id, b.id)),
        source: 'cache',
        warnings: client === null && input.refresh === true ? ['Azure DevOps is not configured; returned the cached copies'] : [],
      };
    }
  }
  if (client === null) {
    throw new ToolError(
      'not-configured',
      'Azure DevOps is not configured (set AZURE_DEVOPS_ORG_URL, AZURE_DEVOPS_PROJECT and AZURE_DEVOPS_PAT), and the requested cases are not all cached',
    );
  }
  const result = await fetchTestCases(client, input);
  for (const testCase of result.testCases) await saveCase(workspace, testCase);
  return { testCases: result.testCases, source: 'ado', warnings: result.warnings };
};
