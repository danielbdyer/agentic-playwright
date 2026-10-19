/**
 * Reading test cases from Azure DevOps: by ids, by WIQL, or by test plan and
 * suite (which also yields the test points ado.publish needs).
 *
 * Request budget for N cases with S distinct shared steps: ceil(N/200)
 * workitemsbatch calls + ceil(S/200) for the shared steps, plus one WIQL call
 * or the suite's TestCase pages. v1 made one GET per case (reader §7.8).
 */
import { ToolError } from '../core/errors.js';
import type { TestCase } from '../contract/schemas.js';
import type { AdoClient } from './client.js';
import { asText, parseStepsXml } from './fields.js';
import {
  collectPages,
  parseBody,
  SuiteListPageSchema,
  SuiteTestCasePageSchema,
  TestPointPageSchema,
  WiqlResultSchema,
  WorkItemBatchSchema,
} from './responses.js';
import {
  buildTestCase,
  compareCaseIds,
  FIELDS,
  parseSharedStep,
  SHARED_STEP_FIELDS,
  sharedStepRefsOf,
  TEST_CASE_FIELDS,
  workItemTypeOf,
  type SharedStepDefinition,
  type TestPointRef,
  type WorkItem,
} from './testcase.js';

/** workitemsbatch accepts at most 200 ids per call. */
export const BATCH_LIMIT = 200;

export interface FetchResult {
  /** Sorted numerically by id. */
  readonly testCases: readonly TestCase[];
  /** Request-level warnings, then every case's warnings prefixed "case <id>: ". */
  readonly warnings: readonly string[];
}

const chunk = <T>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

/** Parse work item ids given as strings or numbers; anything not a positive integer is invalid input. */
export const parseWorkItemIds = (ids: readonly (string | number)[]): readonly number[] => {
  const bad = ids.filter((id) => !/^\d+$/.test(String(id).trim()) || Number(String(id).trim()) <= 0);
  if (bad.length > 0) {
    throw new ToolError('invalid-input', `work item ids must be positive integers; got ${bad.map((id) => JSON.stringify(id)).join(', ')}`, { ids: bad });
  }
  return [...new Set(ids.map((id) => Number(String(id).trim())))];
};

export interface WorkItemsResult {
  readonly items: readonly WorkItem[];
  /** Requested ids that came back empty: deleted, not visible to the PAT, or nonexistent. */
  readonly missing: readonly number[];
}

/**
 * POST _apis/wit/workitemsbatch in chunks of 200 with errorPolicy "omit", so
 * one deleted id does not fail the batch. `$expand` cannot be combined with
 * `fields`, so only fields are requested.
 */
export const fetchWorkItems = async (
  client: AdoClient,
  ids: readonly number[],
  fields: readonly string[],
  what = 'work items',
): Promise<WorkItemsResult> => {
  const items: WorkItem[] = [];
  for (const ids200 of chunk([...new Set(ids)], BATCH_LIMIT)) {
    const response = await client.request({
      method: 'POST',
      path: '_apis/wit/workitemsbatch',
      body: { ids: ids200, fields, errorPolicy: 'omit' },
      idempotent: true,
      what: `fetch ${what} ${ids200.length === 1 ? ids200[0] : `(${ids200.length})`}`,
    });
    const batch = parseBody(WorkItemBatchSchema, response.body, `fetch ${what}`);
    items.push(...batch.value.filter((item): item is NonNullable<typeof item> => item !== null));
  }
  const returned = new Set(items.map((item) => item.id));
  return { items, missing: [...new Set(ids)].filter((id) => !returned.has(id)) };
};

/** Fetch and parse shared steps; a ref that is not returned maps to null (reported per case by expandSteps). */
export const fetchSharedSteps = async (
  client: AdoClient,
  refs: readonly number[],
): Promise<ReadonlyMap<number, SharedStepDefinition | null>> => {
  if (refs.length === 0) return new Map();
  const { items } = await fetchWorkItems(client, refs, SHARED_STEP_FIELDS, 'shared steps');
  const byId = new Map(items.map((item) => [item.id, parseSharedStep(item)] as const));
  return new Map(refs.map((ref) => [ref, byId.get(ref) ?? null] as const));
};

const isTestCaseItem = (item: WorkItem): boolean => {
  const type = workItemTypeOf(item);
  return type === undefined || type.toLowerCase() === 'test case';
};

/**
 * Turn Test Case work items into TestCases: batch-fetch every shared step
 * they reference (once, across all cases), expand, hash, sort.
 */
export const assembleTestCases = async (
  client: AdoClient,
  items: readonly WorkItem[],
  pointsByCase?: ReadonlyMap<number, readonly TestPointRef[]>,
): Promise<FetchResult> => {
  const requestWarnings: string[] = [];
  const cases = items.filter((item) => {
    if (isTestCaseItem(item)) return true;
    requestWarnings.push(`work item ${item.id} is a ${workItemTypeOf(item) ?? 'work item'}, not a Test Case; skipped`);
    return false;
  });
  const refs = [...new Set(cases.flatMap((item) => sharedStepRefsOf(parseStepsXml(asText(item.fields[FIELDS.steps])).nodes)))];
  const sharedSteps = await fetchSharedSteps(client, refs);
  const webUrl = (id: number): string => client.workItemUrl(id);
  const testCases = cases
    .map((item) => {
      const points = pointsByCase?.get(item.id);
      return buildTestCase(item, { sharedSteps, webUrl, ...(points !== undefined ? { points } : {}) });
    })
    .sort((a, b) => compareCaseIds(a.id, b.id));
  return {
    testCases,
    warnings: [...requestWarnings, ...testCases.flatMap((testCase) => (testCase.warnings ?? []).map((warning) => `case ${testCase.id}: ${warning}`))],
  };
};

/** Fetch test cases by work item id. Unknown ids are warnings; all unknown is not-found. */
export const fetchTestCasesByIds = async (client: AdoClient, ids: readonly (string | number)[]): Promise<FetchResult> => {
  const numeric = parseWorkItemIds(ids);
  if (numeric.length === 0) return { testCases: [], warnings: [] };
  const { items, missing } = await fetchWorkItems(client, numeric, TEST_CASE_FIELDS, 'test cases');
  if (items.length === 0) {
    throw new ToolError('not-found', `no test case found for ${numeric.length === 1 ? 'id' : 'ids'} ${numeric.join(', ')} (deleted, not visible to the token, or nonexistent)`, {
      ids: numeric,
    });
  }
  const assembled = await assembleTestCases(client, items);
  return { ...assembled, warnings: [...missingWarnings(missing), ...assembled.warnings] };
};

const missingWarnings = (missing: readonly number[]): readonly string[] =>
  missing.length === 0 ? [] : [`work item${missing.length === 1 ? '' : 's'} ${missing.join(', ')} not returned (deleted, not visible to the token, or nonexistent)`];

/** Default and ceiling for WIQL `$top`. ADO caps flat queries at 20 000. */
export const WIQL_DEFAULT_TOP = 1000;
export const WIQL_MAX_TOP = 20_000;

/**
 * Run a WIQL query and return the work item ids it names, in query order.
 * Flat queries return `workItems`; link queries return `workItemRelations`,
 * whose sources and targets are both collected.
 */
export const queryWiql = async (client: AdoClient, wiql: string, top: number = WIQL_DEFAULT_TOP): Promise<readonly number[]> => {
  if (wiql.trim().length === 0) throw new ToolError('invalid-input', 'the WIQL query is empty');
  const response = await client.request({
    method: 'POST',
    path: '_apis/wit/wiql',
    query: { $top: Math.max(1, Math.min(WIQL_MAX_TOP, Math.floor(top))) },
    body: { query: wiql },
    idempotent: true,
    what: 'the WIQL query',
  });
  const result = parseBody(WiqlResultSchema, response.body, 'the WIQL query');
  const ids = [
    ...(result.workItems ?? []).map((item) => item.id),
    ...(result.workItemRelations ?? []).flatMap((relation) => [relation.source?.id, relation.target?.id]),
  ].filter((id): id is number => typeof id === 'number');
  return [...new Set(ids)];
};

/**
 * Fetch the test cases a WIQL query names. With `onlyIds`, only those of the
 * query's results are fetched (the rest of the query is ignored).
 */
export const fetchTestCasesByWiql = async (
  client: AdoClient,
  wiql: string,
  top?: number,
  onlyIds?: readonly number[],
): Promise<FetchResult> => {
  const queried = await queryWiql(client, wiql, top);
  const only = onlyIds === undefined ? null : new Set(onlyIds);
  const ids = only === null ? queried : queried.filter((id) => only.has(id));
  const unmatched = onlyIds === undefined ? [] : onlyIds.filter((id) => !queried.includes(id));
  const unmatchedWarnings = unmatched.length > 0 ? [`work item${unmatched.length === 1 ? '' : 's'} ${unmatched.join(', ')} not returned by the WIQL query`] : [];
  if (ids.length === 0) return { testCases: [], warnings: [...unmatchedWarnings, 'the WIQL query returned no matching work items'] };
  const { items, missing } = await fetchWorkItems(client, ids, TEST_CASE_FIELDS, 'test cases');
  const assembled = await assembleTestCases(client, items);
  return { ...assembled, warnings: [...unmatchedWarnings, ...missingWarnings(missing), ...assembled.warnings] };
};

export interface SuiteEntry {
  readonly testCaseId: number;
  readonly points: readonly TestPointRef[];
}

/** GET …/testplan/Plans/{p}/Suites/{s}/TestCase, all pages: suite membership plus point assignments. */
export const listSuiteTestCases = async (client: AdoClient, planId: number, suiteId: number): Promise<readonly SuiteEntry[]> => {
  const pages = await collectPages(
    client,
    { method: 'GET', path: `_apis/testplan/Plans/${planId}/Suites/${suiteId}/TestCase`, what: `test plan ${planId} suite ${suiteId} test cases` },
    SuiteTestCasePageSchema,
  );
  return pages.flatMap((page) =>
    page.value.map((entry) => ({
      testCaseId: entry.workItem.id,
      points: entry.pointAssignments.map((point) => ({
        pointId: point.id,
        planId,
        suiteId,
        ...(point.configurationName !== undefined ? { configurationName: point.configurationName } : {}),
      })),
    })),
  );
};

/** GET …/testplan/Plans/{p}/suites, all pages: every suite id in the plan, root first. */
export const listPlanSuites = async (client: AdoClient, planId: number): Promise<readonly number[]> => {
  const pages = await collectPages(client, { method: 'GET', path: `_apis/testplan/Plans/${planId}/suites`, what: `test plan ${planId} suites` }, SuiteListPageSchema);
  return [...new Set(pages.flatMap((page) => page.value.map((suite) => suite.id)))];
};

export interface SuiteFilter {
  /** Fetch only these cases; ids not in the suite are reported. */
  readonly ids?: readonly number[];
  /** Fetch only cases a WIQL query returned; others are silently left out. */
  readonly wiqlIds?: readonly number[];
}

/**
 * Fetch every test case in a suite (or, without suiteId, in every suite of
 * the plan), each carrying its test points in that plan. Filters are applied
 * to suite membership before any work item is fetched.
 */
export const fetchTestCasesBySuite = async (client: AdoClient, planId: number, suiteId?: number, filter: SuiteFilter = {}): Promise<FetchResult> => {
  const suites = suiteId !== undefined ? [suiteId] : await listPlanSuites(client, planId);
  const entries: SuiteEntry[] = [];
  for (const suite of suites) entries.push(...(await listSuiteTestCases(client, planId, suite)));
  const pointsByCase = entries.reduce((acc, entry) => {
    const known = acc.get(entry.testCaseId) ?? [];
    const fresh = entry.points.filter((point) => !known.some((seen) => seen.pointId === point.pointId));
    return new Map(acc).set(entry.testCaseId, [...known, ...fresh]);
  }, new Map<number, readonly TestPointRef[]>());
  const where = suiteId !== undefined ? `suite ${suiteId} of test plan ${planId}` : `test plan ${planId}`;
  const onlyIds = filter.ids === undefined ? null : new Set(filter.ids);
  const onlyWiql = filter.wiqlIds === undefined ? null : new Set(filter.wiqlIds);
  const ids = [...pointsByCase.keys()].filter((id) => (onlyIds === null || onlyIds.has(id)) && (onlyWiql === null || onlyWiql.has(id)));
  const absent = filter.ids === undefined ? [] : filter.ids.filter((id) => !pointsByCase.has(id));
  const absentWarnings = absent.length > 0 ? [`case${absent.length === 1 ? '' : 's'} ${absent.join(', ')} not in ${where}`] : [];
  if (ids.length === 0) {
    return { testCases: [], warnings: [...absentWarnings, pointsByCase.size === 0 ? `${where} has no test cases` : `no test case in ${where} matched the filter`] };
  }
  const { items, missing } = await fetchWorkItems(client, ids, TEST_CASE_FIELDS, 'test cases');
  const assembled = await assembleTestCases(client, items, pointsByCase);
  return { ...assembled, warnings: [...absentWarnings, ...missingWarnings(missing), ...assembled.warnings] };
};

/**
 * GET …/testplan/Plans/{p}/Suites/{s}/TestPoint?testCaseId=… — the points of
 * one case in one suite (one per configuration). Used by publishing when a
 * result names no point.
 */
export const fetchTestPoints = async (client: AdoClient, planId: number, suiteId: number, testCaseId: number): Promise<readonly TestPointRef[]> => {
  const pages = await collectPages(
    client,
    {
      method: 'GET',
      path: `_apis/testplan/Plans/${planId}/Suites/${suiteId}/TestPoint`,
      query: { testCaseId },
      what: `test points of case ${testCaseId} in test plan ${planId} suite ${suiteId}`,
    },
    TestPointPageSchema,
  );
  return pages
    .flatMap((page) => page.value)
    .filter((point) => point.testCaseReference === undefined || point.testCaseReference.id === testCaseId)
    .map((point) => ({
      pointId: point.id,
      planId,
      suiteId,
      ...(point.configuration?.name !== undefined ? { configurationName: point.configuration.name } : {}),
    }));
};

export interface FetchSelector {
  readonly ids?: readonly string[];
  readonly wiql?: string;
  readonly planId?: number;
  readonly suiteId?: number;
  /** WIQL `$top`; default 1000, at most 20 000. */
  readonly top?: number;
}

/**
 * The ado.fetch selector rules. Every selector given narrows the result:
 * planId (+ suiteId) reads suite membership and points, then ids and/or the
 * WIQL result restrict it; without a plan, the WIQL result is restricted by
 * ids; ids alone fetch exactly those cases.
 */
export const fetchTestCases = async (client: AdoClient, selector: FetchSelector): Promise<FetchResult> => {
  const hasIds = selector.ids !== undefined && selector.ids.length > 0;
  const hasWiql = selector.wiql !== undefined && selector.wiql.trim().length > 0;
  if (selector.suiteId !== undefined && selector.planId === undefined) {
    throw new ToolError('invalid-input', 'suiteId needs planId: give the test plan the suite belongs to');
  }
  if (!hasIds && !hasWiql && selector.planId === undefined) {
    throw new ToolError('invalid-input', 'nothing to fetch: give ids, a WIQL query, or planId (with suiteId for one suite)');
  }
  const ids = hasIds ? parseWorkItemIds(selector.ids ?? []) : undefined;
  if (selector.planId !== undefined) {
    const wiqlIds = hasWiql ? await queryWiql(client, selector.wiql ?? '', selector.top) : undefined;
    return fetchTestCasesBySuite(client, selector.planId, selector.suiteId, {
      ...(ids !== undefined ? { ids } : {}),
      ...(wiqlIds !== undefined ? { wiqlIds } : {}),
    });
  }
  if (hasWiql) return fetchTestCasesByWiql(client, selector.wiql ?? '', selector.top, ids);
  return fetchTestCasesByIds(client, ids ?? []);
};
