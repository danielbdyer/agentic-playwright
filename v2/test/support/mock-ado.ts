/**
 * A mock Azure DevOps Services organization for unit and end-to-end tests.
 *
 * It serves, over real HTTP on 127.0.0.1, every endpoint src/ado/ calls, with
 * the response shapes Azure DevOps uses (reader §1 and §6), and keeps enough
 * state to be checked afterwards: work items (with revisions bumped by PATCH),
 * comments, test runs, and test results created per point.
 *
 *   POST  {org}/{project}/_apis/wit/workitemsbatch                 ≤200 ids, fields filter, errorPolicy omit → null entries
 *   POST  …/_apis/wit/wiql?$top=N                                  a small WIQL evaluator (see evaluateWiql), or options.wiql
 *   GET   …/_apis/wit/workitems/{id}
 *   PATCH …/_apis/wit/workitems/{id}                               json-patch only (415 otherwise); test /rev → 412
 *   POST  …/_apis/wit/workItems/{id}/comments?api-version=…-preview
 *   GET   …/_apis/testplan/Plans/{p}/suites                        continuation-token paging
 *   GET   …/_apis/testplan/Plans/{p}/Suites/{s}/TestCase           continuation-token paging, pointAssignments
 *   GET   …/_apis/testplan/Plans/{p}/Suites/{s}/TestPoint?testCaseId=
 *   POST  …/_apis/test/runs                                        creates one Pending result per pointId
 *   GET   …/_apis/test/runs?runTitle=&minLastUpdatedDate=&maxLastUpdatedDate=   window ≤ 7 days (400 otherwise)
 *   GET   …/_apis/test/runs/{id}          PATCH …/_apis/test/runs/{id}
 *   GET   …/_apis/test/Runs/{id}/results?$top&$skip
 *   PATCH …/_apis/test/Runs/{id}/results  POST  …/_apis/test/Runs/{id}/results
 *
 * Every request is recorded in `requests` (method, url as received, path
 * under the project, query, content type, parsed body). Missing api-version
 * is a 400, a JSON body without a JSON content type is a 415, and with `pat`
 * set a request without credentials gets ADO's 203 sign-in page and a wrong
 * PAT gets 401. `failures` injects faults: a status (429 with Retry-After,
 * 5xx, 401…), a dropped connection, a request processed and THEN dropped (the
 * ambiguous failure publish's ledger recovers from), or a delay.
 *
 * Paths are matched case-insensitively, as ADO does (`Runs` and `runs`).
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ─── Inputs ────────────────────────────────────────────────────────────────

/** A Test Case work item. XML fields are given as Azure DevOps stores them. */
export interface MockCase {
  readonly id: number;
  /** System.Rev; default 1. */
  readonly rev?: number;
  readonly title?: string;
  readonly state?: string;
  /** System.WorkItemType; default "Test Case". */
  readonly type?: string;
  /** System.Tags as ADO stores them: "smoke; billing". */
  readonly tags?: string;
  readonly priority?: number;
  readonly areaPath?: string;
  readonly iterationPath?: string;
  /** Microsoft.VSTS.TCM.Steps XML (see stepsXml). */
  readonly steps?: string;
  /** Microsoft.VSTS.TCM.Parameters XML (see parametersXml). */
  readonly parameters?: string;
  /** Microsoft.VSTS.TCM.LocalDataSource XML or shared-parameter JSON (see dataSourceXml). */
  readonly dataSource?: string;
  /** Raw fields, applied last. */
  readonly fields?: Readonly<Record<string, unknown>>;
}

/** A Shared Steps work item. */
export interface MockSharedStep {
  readonly id: number;
  readonly rev?: number;
  readonly title?: string;
  readonly steps?: string;
  readonly parameters?: string;
  readonly fields?: Readonly<Record<string, unknown>>;
}

export interface MockPoint {
  readonly planId: number;
  readonly suiteId: number;
  readonly testCaseId: number;
  readonly pointId: number;
  readonly configurationId?: number;
  /** Default "Windows 10". */
  readonly configurationName?: string;
}

export interface MockSuite {
  readonly planId: number;
  readonly suiteId: number;
  readonly name?: string;
}

export interface MockFailure {
  readonly method?: string;
  /** Case-insensitive substring of the request path, or a RegExp tested against path + query. */
  readonly path: string | RegExp;
  /** respond (default): answer with `status`; drop: close the connection unanswered; process-then-drop: do the work, then close unanswered; delay: wait delayMs, then answer normally. */
  readonly mode?: 'respond' | 'drop' | 'process-then-drop' | 'delay';
  /** Default 500 (429 → JSON throttling message; 203 → sign-in HTML; 401 → empty). */
  readonly status?: number;
  /** How many matching requests fail; default 1. */
  readonly times?: number;
  /** Retry-After header value (seconds or an HTTP date). */
  readonly retryAfter?: number | string;
  readonly body?: string;
  readonly contentType?: string;
  readonly delayMs?: number;
}

export interface MockAdoOptions {
  readonly cases?: readonly MockCase[];
  readonly sharedSteps?: readonly MockSharedStep[];
  readonly points?: readonly MockPoint[];
  /** Extra suites (with names); suites named by points exist anyway. */
  readonly suites?: readonly MockSuite[];
  readonly failures?: readonly MockFailure[];
  /** Organization path segment; default "acme". */
  readonly org?: string;
  /** Default "demo". */
  readonly project?: string;
  /** When set, requests must authenticate with Basic ":" + pat. */
  readonly pat?: string;
  /** Page size of the testplan list endpoints; default 2 so paging is always exercised. */
  readonly pageSize?: number;
  /** Whether POST /runs with pointIds creates a result per point (ADO does); default true. */
  readonly createResultsForPoints?: boolean;
  /** Replace the built-in WIQL evaluator. */
  readonly wiql?: (query: string) => readonly number[];
  readonly firstRunId?: number;
  readonly firstResultId?: number;
}

// ─── Outputs ───────────────────────────────────────────────────────────────

export interface MockRequest {
  readonly method: string;
  /** Path and query exactly as received, e.g. "/acme/demo/_apis/test/runs?api-version=7.1". */
  readonly url: string;
  /** Decoded path under the project, e.g. "/_apis/test/runs". */
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly contentType?: string;
  readonly authorization?: string;
  /** Parsed JSON body, or the raw text when it is not JSON. */
  readonly body?: unknown;
}

export interface MockWorkItem {
  readonly id: number;
  readonly rev: number;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface MockComment {
  readonly id: number;
  readonly workItemId: number;
  readonly text: string;
}

export interface MockRun {
  readonly id: number;
  readonly name: string;
  readonly planId: number;
  readonly state: string;
  readonly automated: boolean;
  readonly pointIds: readonly number[];
  readonly createdDate: string;
  readonly lastUpdatedDate: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface MockAdo {
  /** The organization URL to configure as AZURE_DEVOPS_ORG_URL / ado.orgUrl. */
  readonly url: string;
  readonly project: string;
  /** Every request, in arrival order (live). */
  readonly requests: readonly MockRequest[];
  readonly clearRequests: () => void;
  readonly workItem: (id: number) => MockWorkItem | undefined;
  readonly comments: (workItemId: number) => readonly MockComment[];
  readonly runs: () => readonly MockRun[];
  /** The results of a run as the API would return them, after any PATCHes. */
  readonly results: (runId: number) => readonly Record<string, unknown>[];
  /** Create a run directly (as if an earlier attempt had created it). */
  readonly addRun: (run: { readonly name: string; readonly planId: number; readonly pointIds?: readonly number[]; readonly state?: string; readonly lastUpdatedDate?: string }) => MockRun;
  /** Add a failure rule at run time. */
  readonly fail: (failure: MockFailure) => void;
  readonly close: () => Promise<void>;
}

// ─── XML builders for tests ────────────────────────────────────────────────

export type MockStepSpec =
  | { readonly id: number; readonly action: string; readonly expected?: string; readonly type?: 'ActionStep' | 'ValidateStep' }
  | { readonly compref: number; readonly ref: number; readonly children?: readonly MockStepSpec[] };

const escapeXml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A step field as ADO's editor stores it: HTML (text escaped) inside escaped XML; empty is self-closing. */
const stepField = (text: string): string =>
  text.length === 0 ? '<parameterizedString isformatted="true" />' : `<parameterizedString isformatted="true">${escapeXml(`<DIV><P>${escapeXml(text)}</P></DIV>`)}</parameterizedString>`;

const stepIds = (steps: readonly MockStepSpec[]): readonly number[] =>
  steps.flatMap((step) => ('compref' in step ? [step.compref, ...stepIds(step.children ?? [])] : [step.id]));

const renderStep = (step: MockStepSpec): string =>
  'compref' in step
    ? step.children !== undefined && step.children.length > 0
      ? `<compref id="${step.compref}" ref="${step.ref}">${step.children.map(renderStep).join('')}</compref>`
      : `<compref id="${step.compref}" ref="${step.ref}" />`
    : `<step id="${step.id}" type="${step.type ?? 'ActionStep'}">${stepField(step.action)}${stepField(step.expected ?? '')}<description /></step>`;

/** Microsoft.VSTS.TCM.Steps XML from plain step text. */
export const stepsXml = (steps: readonly MockStepSpec[]): string =>
  `<steps id="0" last="${Math.max(1, ...stepIds(steps))}">${steps.map(renderStep).join('')}</steps>`;

/** Microsoft.VSTS.TCM.Parameters XML. */
export const parametersXml = (names: readonly string[]): string =>
  `<parameters>${names.map((name) => `<param name="${escapeXml(name)}" bind="default" />`).join('')}</parameters>`;

/**
 * Microsoft.VSTS.TCM.LocalDataSource XML, schema included, as ADO serializes a
 * DataSet. An empty-string cell is written self-closing; an undefined cell is
 * omitted, as ADO does.
 */
export const dataSourceXml = (rows: readonly Readonly<Record<string, string | undefined>>[], columns?: readonly string[]): string => {
  const names = columns ?? [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const schema =
    '<xs:schema id="NewDataSet" xmlns="" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:msdata="urn:schemas-microsoft-com:xml-msdata">' +
    '<xs:element name="NewDataSet" msdata:IsDataSet="true" msdata:Locale=""><xs:complexType><xs:choice minOccurs="0" maxOccurs="unbounded">' +
    `<xs:element name="Table1"><xs:complexType><xs:sequence>${names.map((name) => `<xs:element name="${escapeXml(name)}" type="xs:string" minOccurs="0" />`).join('')}</xs:sequence></xs:complexType></xs:element>` +
    '</xs:choice></xs:complexType></xs:element></xs:schema>';
  const body = rows
    .map(
      (row) =>
        `<Table1>${names
          .map((name) => {
            const value = row[name];
            return value === undefined ? '' : value === '' ? `<${name} />` : `<${name}>${escapeXml(value)}</${name}>`;
          })
          .join('')}</Table1>`,
    )
    .join('');
  return `<NewDataSet>${schema}${body}</NewDataSet>`;
};

/** LocalDataSource JSON for a case bound to shared parameter sets. */
export const sharedParameterSource = (dataSetIds: readonly number[]): string =>
  JSON.stringify({ parameterMap: dataSetIds.map((id) => ({ paramName: `p${id}`, bind: 'p', sharedParameterDataSetId: id })), sharedParameterDataSetIds: dataSetIds, rowMappingType: 0 });

// ─── Server ────────────────────────────────────────────────────────────────

interface Reply {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  /** Raw text body with its own content type (HTML pages). */
  readonly text?: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const SIGN_IN_PAGE = '<!DOCTYPE html><html><head><title>Azure DevOps Services | Sign In</title></head><body>Sign in to your account</body></html>';
const DAY_MS = 24 * 60 * 60 * 1000;

const json = (status: number, body: unknown, headers: Readonly<Record<string, string>> = {}): Reply => ({ status, body, headers });
const errorBody = (message: string, typeKey = 'MockAdoException'): Record<string, unknown> => ({
  $id: '1',
  innerException: null,
  message,
  typeName: `Microsoft.TeamFoundation.${typeKey}, Microsoft.TeamFoundation`,
  typeKey,
  errorCode: 0,
  eventId: 3000,
});

const readBody = (request: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The built-in WIQL evaluator understands enough for tests:
 * [System.WorkItemType] = '…', [System.Id] IN (…), [System.Tags] CONTAINS '…',
 * [System.AreaPath] UNDER '…', joined by AND. Results are ordered by id.
 */
export const evaluateWiql = (query: string, items: readonly MockWorkItem[]): readonly number[] => {
  if (!/^\s*select\b/i.test(query) || !/\bfrom\s+workitems\b/i.test(query)) {
    throw new HttpError(400, 'TF51006: The query statement is missing a SELECT or FROM WorkItems clause.');
  }
  const typeMatch = /\[System\.WorkItemType\]\s*=\s*'((?:[^']|'')*)'/i.exec(query);
  const idsMatch = /\[System\.Id\]\s+IN\s*\(([^)]*)\)/i.exec(query);
  const tagMatch = /\[System\.Tags\]\s+CONTAINS\s+'((?:[^']|'')*)'/i.exec(query);
  const areaMatch = /\[System\.AreaPath\]\s+UNDER\s+'((?:[^']|'')*)'/i.exec(query);
  const unquote = (text: string): string => text.replace(/''/g, "'");
  const ids = idsMatch === null ? null : new Set(idsMatch[1]!.split(',').map((id) => Number(id.trim())));
  return items
    .filter((item) => typeMatch === null || String(item.fields['System.WorkItemType']).toLowerCase() === unquote(typeMatch[1]!).toLowerCase())
    .filter((item) => ids === null || ids.has(item.id))
    .filter(
      (item) =>
        tagMatch === null ||
        String(item.fields['System.Tags'] ?? '')
          .split(';')
          .map((tag) => tag.trim().toLowerCase())
          .includes(unquote(tagMatch[1]!).toLowerCase()),
    )
    .filter((item) => areaMatch === null || String(item.fields['System.AreaPath'] ?? '').toLowerCase().startsWith(unquote(areaMatch[1]!).toLowerCase()))
    .map((item) => item.id)
    .sort((a, b) => a - b);
};

export const startMockAdo = async (options: MockAdoOptions = {}): Promise<MockAdo> => {
  const org = options.org ?? 'acme';
  const project = options.project ?? 'demo';
  const pageSize = Math.max(1, options.pageSize ?? 2);
  const createResults = options.createResultsForPoints ?? true;
  const points = [...(options.points ?? [])];
  const failures: { rule: MockFailure; remaining: number }[] = (options.failures ?? []).map((rule) => ({ rule, remaining: rule.times ?? 1 }));
  const requests: MockRequest[] = [];
  const now = (): string => new Date().toISOString();

  const workItems = new Map<number, { id: number; rev: number; fields: Record<string, unknown> }>();
  const addItem = (id: number, rev: number, fields: Record<string, unknown>): void => {
    workItems.set(id, { id, rev, fields: { 'System.Id': id, 'System.Rev': rev, 'System.TeamProject': project, ...fields } });
  };
  for (const item of options.cases ?? []) {
    addItem(item.id, item.rev ?? 1, {
      'System.WorkItemType': item.type ?? 'Test Case',
      'System.Title': item.title ?? `Test case ${item.id}`,
      'System.State': item.state ?? 'Design',
      'System.AreaPath': item.areaPath ?? project,
      'System.IterationPath': item.iterationPath ?? project,
      ...(item.tags !== undefined ? { 'System.Tags': item.tags } : {}),
      ...(item.priority !== undefined ? { 'Microsoft.VSTS.Common.Priority': item.priority } : {}),
      ...(item.steps !== undefined ? { 'Microsoft.VSTS.TCM.Steps': item.steps } : {}),
      ...(item.parameters !== undefined ? { 'Microsoft.VSTS.TCM.Parameters': item.parameters } : {}),
      ...(item.dataSource !== undefined ? { 'Microsoft.VSTS.TCM.LocalDataSource': item.dataSource } : {}),
      ...(item.fields ?? {}),
    });
  }
  for (const item of options.sharedSteps ?? []) {
    addItem(item.id, item.rev ?? 1, {
      'System.WorkItemType': 'Shared Steps',
      'System.Title': item.title ?? `Shared steps ${item.id}`,
      'System.State': 'Active',
      'System.AreaPath': project,
      'System.IterationPath': project,
      ...(item.steps !== undefined ? { 'Microsoft.VSTS.TCM.Steps': item.steps } : {}),
      ...(item.parameters !== undefined ? { 'Microsoft.VSTS.TCM.Parameters': item.parameters } : {}),
      ...(item.fields ?? {}),
    });
  }

  const suites: MockSuite[] = [...(options.suites ?? [])];
  for (const point of points) {
    if (!suites.some((suite) => suite.planId === point.planId && suite.suiteId === point.suiteId)) suites.push({ planId: point.planId, suiteId: point.suiteId });
  }
  const comments = new Map<number, MockComment[]>();
  const runs = new Map<number, MockRun & { fields: Record<string, unknown> }>();
  const results = new Map<number, Record<string, unknown>[]>();
  let nextRunId = options.firstRunId ?? 4711;
  let nextResultId = options.firstResultId ?? 100_000;
  let nextCommentId = 1;

  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const orgUrl = `http://127.0.0.1:${port}/${org}`;
  const projectUrl = `${orgUrl}/${encodeURIComponent(project)}`;

  const titleOf = (id: number): string => String(workItems.get(id)?.fields['System.Title'] ?? `Test case ${id}`);
  const configurationOf = (point: MockPoint): { id: string; name: string } => ({
    id: String(point.configurationId ?? 1),
    name: point.configurationName ?? 'Windows 10',
  });

  const runView = (run: MockRun & { fields: Record<string, unknown> }): Record<string, unknown> => ({
    id: run.id,
    name: run.name,
    url: `${projectUrl}/_apis/test/Runs/${run.id}`,
    webAccessUrl: `${projectUrl}/_TestManagement/Runs?runId=${run.id}&_a=runCharts`,
    isAutomated: run.automated,
    state: run.state,
    plan: { id: String(run.planId), name: `Plan ${run.planId}` },
    totalTests: results.get(run.id)?.length ?? 0,
    createdDate: run.createdDate,
    lastUpdatedDate: run.lastUpdatedDate,
    ...run.fields,
  });

  const newResultForPoint = (runId: number, pointId: number, extra: Record<string, unknown> = {}): Record<string, unknown> => {
    const point = points.find((candidate) => candidate.pointId === pointId);
    const testCaseId = point?.testCaseId ?? Number((extra.testCase as { id?: unknown } | undefined)?.id ?? 0);
    const result: Record<string, unknown> = {
      id: nextResultId,
      testPoint: { id: String(pointId) },
      testCase: { id: String(testCaseId), name: titleOf(testCaseId) },
      testCaseTitle: titleOf(testCaseId),
      testCaseRevision: workItems.get(testCaseId)?.rev ?? 1,
      testRun: { id: String(runId) },
      testPlan: { id: String(point?.planId ?? 0) },
      ...(point !== undefined ? { configuration: configurationOf(point) } : {}),
      outcome: 'Unspecified',
      state: 'Pending',
      priority: 0,
      ...extra,
    };
    nextResultId += 1;
    return result;
  };

  const createRun = (input: { name: string; planId: number; pointIds: readonly number[]; state?: string; automated?: boolean; fields?: Record<string, unknown>; lastUpdatedDate?: string }): MockRun => {
    const at = now();
    const run = {
      id: nextRunId,
      name: input.name,
      planId: input.planId,
      state: input.state ?? 'NotStarted',
      automated: input.automated ?? false,
      pointIds: [...input.pointIds],
      createdDate: at,
      lastUpdatedDate: input.lastUpdatedDate ?? at,
      fields: input.fields ?? {},
    };
    nextRunId += 1;
    runs.set(run.id, run);
    results.set(run.id, createResults ? input.pointIds.map((pointId) => newResultForPoint(run.id, pointId)) : []);
    return run;
  };

  /** Paged list for the testplan APIs: continuationToken in → x-ms-continuationtoken out. */
  const paged = (all: readonly unknown[], query: Readonly<Record<string, string>>): Reply => {
    const offset = Number(query.continuationToken ?? '0') || 0;
    const page = all.slice(offset, offset + pageSize);
    const next = offset + pageSize < all.length ? String(offset + pageSize) : undefined;
    return json(200, { value: page, count: page.length }, next !== undefined ? { 'x-ms-continuationtoken': next } : {});
  };

  const requireRun = (id: number): MockRun & { fields: Record<string, unknown> } => {
    const run = runs.get(id);
    if (run === undefined) throw new HttpError(404, `Test run ${id} does not exist.`);
    return run;
  };

  const route = (method: string, rest: string, query: Readonly<Record<string, string>>, body: unknown, contentType: string): Reply => {
    const lower = rest.toLowerCase();
    let m: RegExpExecArray | null;

    if (method === 'POST' && lower === '_apis/wit/workitemsbatch') {
      const request = (body ?? {}) as { ids?: unknown; fields?: unknown; errorPolicy?: unknown };
      if (!Array.isArray(request.ids) || request.ids.length === 0) throw new HttpError(400, 'The ids parameter is required.');
      if (request.ids.length > 200) throw new HttpError(400, 'TF401323: The number of work items requested exceeds the limit of 200.');
      const fields = Array.isArray(request.fields) ? (request.fields as string[]) : null;
      const value = (request.ids as number[]).map((id) => {
        const item = workItems.get(Number(id));
        if (item === undefined) {
          if (request.errorPolicy !== 'omit') throw new HttpError(404, `TF401232: Work item ${id} does not exist, or you do not have permissions to read it.`);
          return null;
        }
        const chosen = fields === null ? item.fields : Object.fromEntries(fields.filter((name) => name in item.fields).map((name) => [name, item.fields[name]]));
        return { id: item.id, rev: item.rev, fields: clone(chosen), url: `${projectUrl}/_apis/wit/workItems/${item.id}` };
      });
      return json(200, { count: value.length, value });
    }

    if (method === 'POST' && lower === '_apis/wit/wiql') {
      const text = String((body as { query?: unknown } | null)?.query ?? '');
      const ids = options.wiql !== undefined ? options.wiql(text) : evaluateWiql(text, [...workItems.values()]);
      const top = query.$top !== undefined ? Number(query.$top) : ids.length;
      return json(200, {
        queryType: 'flat',
        queryResultType: 'workItem',
        asOf: now(),
        columns: [{ referenceName: 'System.Id', name: 'ID', url: `${orgUrl}/_apis/wit/fields/System.Id` }],
        workItems: ids.slice(0, top).map((id) => ({ id, url: `${projectUrl}/_apis/wit/workItems/${id}` })),
      });
    }

    if ((m = /^_apis\/wit\/workitems\/(\d+)\/comments$/.exec(lower)) !== null && method === 'POST') {
      if (!/preview/i.test(query['api-version'] ?? '')) {
        throw new HttpError(400, `The requested version "${query['api-version']}" of the resource is under preview. The -preview flag must be supplied in the api-version for such requests.`);
      }
      const workItemId = Number(m[1]);
      if (!workItems.has(workItemId)) throw new HttpError(404, `TF401232: Work item ${workItemId} does not exist.`);
      const text = String((body as { text?: unknown } | null)?.text ?? '');
      const comment = { id: nextCommentId, workItemId, text };
      nextCommentId += 1;
      comments.set(workItemId, [...(comments.get(workItemId) ?? []), comment]);
      return json(200, {
        workItemId,
        id: comment.id,
        version: 1,
        text,
        createdBy: { displayName: 'Mock User' },
        createdDate: now(),
        url: `${projectUrl}/_apis/wit/workItems/${workItemId}/comments/${comment.id}`,
      });
    }

    if ((m = /^_apis\/wit\/workitems\/(\d+)$/.exec(lower)) !== null) {
      const item = workItems.get(Number(m[1]));
      if (item === undefined) throw new HttpError(404, `TF401232: Work item ${m[1]} does not exist, or you do not have permissions to read it.`);
      if (method === 'GET') return json(200, { id: item.id, rev: item.rev, fields: clone(item.fields), url: `${projectUrl}/_apis/wit/workItems/${item.id}` });
      if (method === 'PATCH') {
        if (!contentType.startsWith('application/json-patch+json')) {
          throw new HttpError(415, 'The request indicated a Content-Type of "application/json" for method type "PATCH" which is not supported. Valid content types for this method are: application/json-patch+json.');
        }
        if (!Array.isArray(body)) throw new HttpError(400, 'You must pass a valid patch document in the body of the request.');
        for (const op of body as { op?: string; path?: string; value?: unknown }[]) {
          if (op.op === 'test' && op.path === '/rev' && Number(op.value) !== item.rev) {
            throw new HttpError(412, `TF26071: This work item has been changed by someone else since you opened it (rev ${item.rev}).`);
          }
          const field = /^\/fields\/(.+)$/.exec(op.path ?? '');
          if (field === null) continue;
          if (op.op === 'add' || op.op === 'replace') item.fields[field[1]!] = op.value;
          if (op.op === 'remove') delete item.fields[field[1]!];
        }
        // ADO derives the automation status from the automated test name.
        if (typeof item.fields['Microsoft.VSTS.TCM.AutomatedTestName'] === 'string') item.fields['Microsoft.VSTS.TCM.AutomationStatus'] = 'Automated';
        item.rev += 1;
        item.fields['System.Rev'] = item.rev;
        return json(200, { id: item.id, rev: item.rev, fields: clone(item.fields), url: `${projectUrl}/_apis/wit/workItems/${item.id}` });
      }
    }

    if (method === 'GET' && (m = /^_apis\/testplan\/plans\/(\d+)\/suites$/.exec(lower)) !== null) {
      const planId = Number(m[1]);
      const inPlan = suites.filter((suite) => suite.planId === planId);
      if (inPlan.length === 0) throw new HttpError(404, `Test plan ${planId} does not exist.`);
      return paged(
        inPlan.map((suite) => ({ id: suite.suiteId, name: suite.name ?? `Suite ${suite.suiteId}`, suiteType: 'staticTestSuite', plan: { id: planId, name: `Plan ${planId}` } })),
        query,
      );
    }

    if (method === 'GET' && (m = /^_apis\/testplan\/plans\/(\d+)\/suites\/(\d+)\/testcase$/.exec(lower)) !== null) {
      const planId = Number(m[1]);
      const suiteId = Number(m[2]);
      if (!suites.some((suite) => suite.planId === planId && suite.suiteId === suiteId)) {
        throw new HttpError(404, `Test suite ${suiteId} does not exist in test plan ${planId}.`);
      }
      const inSuite = points.filter((point) => point.planId === planId && point.suiteId === suiteId);
      const caseIds = [...new Set(inSuite.map((point) => point.testCaseId))];
      return paged(
        caseIds.map((testCaseId) => ({
          testPlan: { id: planId, name: `Plan ${planId}` },
          testSuite: { id: suiteId, name: `Suite ${suiteId}` },
          workItem: { id: testCaseId, name: titleOf(testCaseId), workItemFields: [] },
          pointAssignments: inSuite
            .filter((point) => point.testCaseId === testCaseId)
            .map((point) => ({ id: point.pointId, configurationId: Number(configurationOf(point).id), configurationName: configurationOf(point).name, tester: null })),
        })),
        query,
      );
    }

    if (method === 'GET' && (m = /^_apis\/testplan\/plans\/(\d+)\/suites\/(\d+)\/testpoint$/.exec(lower)) !== null) {
      const planId = Number(m[1]);
      const suiteId = Number(m[2]);
      if (!suites.some((suite) => suite.planId === planId && suite.suiteId === suiteId)) {
        throw new HttpError(404, `Test suite ${suiteId} does not exist in test plan ${planId}.`);
      }
      const wanted = query.testCaseId === undefined ? null : new Set(query.testCaseId.split(',').map((id) => Number(id.trim())));
      return paged(
        points
          .filter((point) => point.planId === planId && point.suiteId === suiteId && (wanted === null || wanted.has(point.testCaseId)))
          .map((point) => ({
            id: point.pointId,
            configuration: { id: Number(configurationOf(point).id), name: configurationOf(point).name },
            testCaseReference: { id: point.testCaseId, name: titleOf(point.testCaseId) },
            testPlan: { id: planId },
            testSuite: { id: suiteId },
            isActive: true,
          })),
        query,
      );
    }

    if (lower === '_apis/test/runs' && method === 'POST') {
      const request = (body ?? {}) as { name?: unknown; plan?: { id?: unknown }; pointIds?: unknown; state?: unknown; automated?: unknown };
      if (typeof request.name !== 'string' || request.name.length === 0) throw new HttpError(400, 'The test run name is required.');
      const planId = Number(request.plan?.id);
      if (!Number.isInteger(planId) || planId <= 0) throw new HttpError(400, 'A test plan is required for this run.');
      const pointIds = Array.isArray(request.pointIds) ? (request.pointIds as unknown[]).map(Number) : [];
      const unknown = pointIds.filter((pointId) => !points.some((point) => point.pointId === pointId && point.planId === planId));
      if (unknown.length > 0) throw new HttpError(400, `Test points ${unknown.join(', ')} were not found in test plan ${planId}.`);
      const { name: _name, plan: _plan, pointIds: _points, state: _state, automated: _automated, ...rest } = request as Record<string, unknown>;
      const run = createRun({
        name: request.name,
        planId,
        pointIds,
        state: typeof request.state === 'string' ? request.state : 'NotStarted',
        automated: request.automated === true,
        fields: rest,
      });
      return json(200, runView(runs.get(run.id)!));
    }

    if (lower === '_apis/test/runs' && method === 'GET') {
      const hasWindow = query.minLastUpdatedDate !== undefined || query.maxLastUpdatedDate !== undefined;
      const min = query.minLastUpdatedDate === undefined ? NaN : Date.parse(query.minLastUpdatedDate);
      const max = query.maxLastUpdatedDate === undefined ? NaN : Date.parse(query.maxLastUpdatedDate);
      if (hasWindow && (Number.isNaN(min) || Number.isNaN(max))) throw new HttpError(400, 'Both minLastUpdatedDate and maxLastUpdatedDate are required.');
      if (hasWindow && (max < min || max - min > 7 * DAY_MS)) throw new HttpError(400, 'The date range between minLastUpdatedDate and maxLastUpdatedDate should be less than or equal to 7 days.');
      const planIds = query.planIds === undefined ? null : new Set(query.planIds.split(',').map((id) => Number(id.trim())));
      const matching = [...runs.values()].filter(
        (run) =>
          (query.runTitle === undefined || run.name === query.runTitle) &&
          (planIds === null || planIds.has(run.planId)) &&
          (!hasWindow || (Date.parse(run.lastUpdatedDate) >= min && Date.parse(run.lastUpdatedDate) <= max)),
      );
      return json(200, { value: matching.map(runView), count: matching.length });
    }

    if ((m = /^_apis\/test\/runs\/(\d+)$/.exec(lower)) !== null) {
      const run = requireRun(Number(m[1]));
      if (method === 'GET') return json(200, runView(run));
      if (method === 'PATCH') {
        const patch = (body ?? {}) as Record<string, unknown>;
        const updated = {
          ...run,
          ...(typeof patch.state === 'string' ? { state: patch.state } : {}),
          ...(typeof patch.name === 'string' ? { name: patch.name } : {}),
          lastUpdatedDate: now(),
          fields: { ...run.fields, ...Object.fromEntries(Object.entries(patch).filter(([key]) => key !== 'state' && key !== 'name')) },
        };
        runs.set(run.id, updated);
        return json(200, runView(updated));
      }
    }

    if ((m = /^_apis\/test\/runs\/(\d+)\/results$/.exec(lower)) !== null) {
      const run = requireRun(Number(m[1]));
      const list = results.get(run.id) ?? [];
      if (method === 'GET') {
        const skip = Number(query.$skip ?? '0') || 0;
        const top = Number(query.$top ?? '1000') || 1000;
        const page = list.slice(skip, skip + top);
        return json(200, { count: page.length, value: clone(page) });
      }
      if (!Array.isArray(body)) throw new HttpError(400, 'The request body must be an array of test results.');
      if (method === 'PATCH') {
        const updated = (body as Record<string, unknown>[]).map((patch) => {
          const index = list.findIndex((result) => result.id === Number(patch.id));
          if (index === -1) throw new HttpError(404, `Test result ${String(patch.id)} does not exist in run ${run.id}.`);
          const merged = { ...list[index]!, ...patch, id: list[index]!.id };
          list[index] = merged;
          return merged;
        });
        runs.set(run.id, { ...run, lastUpdatedDate: now() });
        return json(200, { count: updated.length, value: clone(updated) });
      }
      if (method === 'POST') {
        const created = (body as Record<string, unknown>[]).map((item) => {
          const pointId = Number((item.testPoint as { id?: unknown } | undefined)?.id);
          const { testPoint: _testPoint, ...rest } = item;
          const result = newResultForPoint(run.id, pointId, rest);
          list.push(result);
          return result;
        });
        results.set(run.id, list);
        runs.set(run.id, { ...run, lastUpdatedDate: now() });
        return json(200, { count: created.length, value: clone(created) });
      }
    }

    throw new HttpError(404, `The resource ${method} ${rest} is not served by the mock Azure DevOps.`);
  };

  const send = (response: http.ServerResponse, reply: Reply): void => {
    // A delayed reply can outlive a client that timed out and hung up.
    if (response.destroyed || response.writableEnded) return;
    if (reply.text !== undefined) {
      response.writeHead(reply.status, { 'content-type': 'text/html; charset=utf-8', ...(reply.headers ?? {}) });
      response.end(reply.text);
      return;
    }
    const text = reply.body === undefined ? '' : JSON.stringify(reply.body);
    response.writeHead(reply.status, {
      ...(text.length > 0 ? { 'content-type': 'application/json; charset=utf-8; api-version=7.1' } : {}),
      ...(reply.headers ?? {}),
    });
    response.end(text);
  };

  const failureReply = (rule: MockFailure): Reply => {
    const status = rule.status ?? 500;
    const headers: Record<string, string> = rule.retryAfter !== undefined ? { 'retry-after': String(rule.retryAfter) } : {};
    if (rule.body !== undefined) {
      return { status, text: rule.body, headers: { ...headers, ...(rule.contentType !== undefined ? { 'content-type': rule.contentType } : {}) } };
    }
    if (status === 203) return { status, text: SIGN_IN_PAGE, headers };
    if (status === 401) return { status, headers: { ...headers, 'www-authenticate': 'Basic realm="https://dev.azure.com/"' } };
    if (status === 429) {
      return json(status, errorBody('TF400733: The request has been throttled because of exceeded usage of resources.', 'RequestBlockedException'), {
        ...headers,
        'x-ratelimit-resource': 'ATCPU',
        'x-ratelimit-remaining': '0',
      });
    }
    return json(status, errorBody(`Mock failure (HTTP ${status}).`), headers);
  };

  const takeFailure = (method: string, path: string, target: string): MockFailure | undefined => {
    const entry = failures.find(
      (candidate) =>
        candidate.remaining > 0 &&
        (candidate.rule.method === undefined || candidate.rule.method.toUpperCase() === method) &&
        (typeof candidate.rule.path === 'string' ? path.toLowerCase().includes(candidate.rule.path.toLowerCase()) : candidate.rule.path.test(target)),
    );
    if (entry === undefined) return undefined;
    entry.remaining -= 1;
    return entry.rule;
  };

  server.on('request', (request, response) => {
    void (async () => {
      const method = (request.method ?? 'GET').toUpperCase();
      const target = request.url ?? '/';
      const parsed = new URL(target, orgUrl);
      const segments = parsed.pathname.split('/').filter((segment) => segment.length > 0).map(decodeURIComponent);
      const underProject = segments[0] === org && segments[1] === project ? segments.slice(2).join('/') : null;
      const query = Object.fromEntries(parsed.searchParams.entries());
      const contentType = (request.headers['content-type'] ?? '').toLowerCase();
      const raw = await readBody(request);
      const body = ((): unknown => {
        if (raw.length === 0) return undefined;
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          return raw;
        }
      })();
      requests.push({
        method,
        url: target,
        path: underProject === null ? parsed.pathname : `/${underProject}`,
        query,
        ...(request.headers['content-type'] !== undefined ? { contentType: request.headers['content-type'] } : {}),
        ...(request.headers.authorization !== undefined ? { authorization: request.headers.authorization } : {}),
        ...(body !== undefined ? { body } : {}),
      });

      if (options.pat !== undefined) {
        const expected = `Basic ${Buffer.from(`:${options.pat}`).toString('base64')}`;
        if (request.headers.authorization === undefined) return send(response, { status: 203, text: SIGN_IN_PAGE });
        if (request.headers.authorization !== expected) return send(response, failureReply({ path: '', status: 401 }));
      }

      const failure = takeFailure(method, underProject === null ? parsed.pathname : `/${underProject}`, target);
      if (failure !== undefined && failure.mode === 'drop') {
        request.socket.destroy();
        return;
      }
      if (failure !== undefined && failure.mode === 'delay') await new Promise((resolve) => setTimeout(resolve, failure.delayMs ?? 1000));
      if (failure !== undefined && (failure.mode === undefined || failure.mode === 'respond')) return send(response, failureReply(failure));

      const reply = ((): Reply => {
        try {
          if (underProject === null) throw new HttpError(404, `No project at ${parsed.pathname}; expected /${org}/${project}/…`);
          if (query['api-version'] === undefined) throw new HttpError(400, `No api-version was supplied for the "${method}" request. The version must be supplied either as part of the Accept header or as a query parameter.`);
          if (raw.length > 0 && !contentType.startsWith('application/json') && !contentType.startsWith('application/json-patch+json')) {
            throw new HttpError(415, `The request contained an entity body with no supported Content-Type ("${contentType || 'none'}").`);
          }
          if (raw.length > 0 && typeof body === 'string') throw new HttpError(400, 'The request body is not valid JSON.');
          return route(method, underProject, query, body, contentType);
        } catch (error) {
          if (error instanceof HttpError) return json(error.status, errorBody(error.message));
          return json(500, errorBody(error instanceof Error ? error.message : String(error)));
        }
      })();
      if (failure !== undefined && failure.mode === 'process-then-drop') {
        request.socket.destroy();
        return;
      }
      send(response, reply);
    })();
  });

  return {
    url: orgUrl,
    project,
    requests,
    clearRequests: () => {
      requests.length = 0;
    },
    workItem: (id) => {
      const item = workItems.get(id);
      return item === undefined ? undefined : clone(item);
    },
    comments: (workItemId) => clone(comments.get(workItemId) ?? []),
    runs: () => clone([...runs.values()]),
    results: (runId) => clone(results.get(runId) ?? []),
    addRun: (run) =>
      clone(
        createRun({
          name: run.name,
          planId: run.planId,
          pointIds: run.pointIds ?? [],
          state: run.state ?? 'InProgress',
          automated: true,
          ...(run.lastUpdatedDate !== undefined ? { lastUpdatedDate: run.lastUpdatedDate } : {}),
        }),
      ),
    fail: (failure) => {
      failures.push({ rule: failure, remaining: failure.times ?? 1 });
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
};
