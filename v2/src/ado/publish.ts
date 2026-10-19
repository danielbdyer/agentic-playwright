/**
 * ado.publish: results back to Azure DevOps as a test run (reader §6 B–G).
 *
 *   0. ledger: a completed entry for runName → return it, send nothing
 *   1. resolve test points for results that name none (cached case, else
 *      GET …/testplan/Plans/{p}/Suites/{s}/TestPoint?testCaseId=)
 *   2. read shared-step revisions for the sharedStepModel of expanded steps
 *   3. associateAutomation: PATCH each work item (json-patch) — first, so a
 *      missing Work Items write scope fails before any run exists
 *   4. run: resume the ledger's created run, or find a pending attempt's run
 *      by title, or append pending, POST _apis/test/runs (never retried
 *      blindly), append created
 *   5. GET …/Runs/{id}/results → result id per point (POST results for any
 *      point ADO did not create one for)
 *   6. PATCH …/Runs/{id}/results: outcome, duration, error, comment, revision,
 *      iterationDetails with actionResults and parameters
 *   7. PATCH …/runs/{id} Completed, then append completed
 *
 * dryRun performs the read-only lookups (points, shared-step revisions, a
 * pending attempt's run) so the plan is exact, sends no write, writes no
 * ledger entry, and returns every request in order; ids the server would
 * assign appear as placeholders such as "{runId}".
 */
import { ToolError } from '../core/errors.js';
import type { RunReceipt, TestCase } from '../contract/schemas.js';
import type { Workspace } from '../workspace/workspace.js';
import type { AdoClient, AdoRequest } from './client.js';
import { automationPatch } from './automation.js';
import { loadCases } from './cache.js';
import { receiptsToPublishResults, specsFromReceipts } from './results.js';
import { readEmitRecords } from '../run/emit-records.js';
import { fetchTestPoints, fetchWorkItems } from './fetch.js';
import { latestEntry, workspaceLedger, type PublishLedger, type PublishLedgerEntry } from './ledger.js';
import {
  buildResultUpdate,
  buildRunComplete,
  buildRunCreate,
  groupByPoint,
  sharedStepIdResolver,
  type PointGroup,
  type PublishResult,
  type SpecRef,
} from './publish-plan.js';
import { collectPages, parseBody, TestResultListSchema, TestRunListSchema, TestRunSchema } from './responses.js';
import { FIELDS, type TestPointRef } from './testcase.js';

export interface PublishOptions {
  readonly planId: number;
  readonly suiteId: number;
  /** The idempotency key: publishing the same runName twice sends nothing the second time. */
  readonly runName: string;
  readonly results: readonly PublishResult[];
  /** Mark each case as automated by its spec (needs specByCase for every case). */
  readonly associateAutomation?: boolean;
  /** AutomatedTestStorage for every case; default each spec's path. */
  readonly automatedTestStorage?: string;
  /** Spec path and test title per test case id; used for association and the results' automatedTestName. */
  readonly specByCase?: Readonly<Record<string, SpecRef>>;
  /** Cached cases: their points, revisions, parameters, data rows and shared-step origins enrich the results. */
  readonly cases?: readonly TestCase[];
  /** Publish only to points of these configurations when a case has several. Default: every point of the case. */
  readonly configurationNames?: readonly string[];
  readonly dryRun?: boolean;
  /** Run comment; default "Published by tesseract-qa". */
  readonly runComment?: string;
  /** Pipeline build to link the run to. */
  readonly buildId?: number;
  readonly now?: () => Date;
}

export interface PlannedRequest {
  readonly method: string;
  readonly url: string;
  readonly body?: unknown;
}

/** The ado.publish output shape. */
export interface PublishedRun {
  readonly runId: number;
  readonly url: string;
  readonly resultIds: readonly number[];
  readonly alreadyPublished: boolean;
  /** Present for dryRun: every request, in order. */
  readonly requests?: readonly PlannedRequest[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const RESULTS_PAGE = 1000;
const PATCH_CHUNK = 100;

const chunk = <T>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

const validate = (options: PublishOptions): void => {
  const problems = [
    ...(options.runName.trim().length === 0 ? ['runName is empty'] : []),
    ...(!Number.isSafeInteger(options.planId) || options.planId <= 0 ? ['planId must be a positive integer'] : []),
    ...(!Number.isSafeInteger(options.suiteId) || options.suiteId <= 0 ? ['suiteId must be a positive integer'] : []),
    ...(options.results.length === 0 ? ['there are no results to publish'] : []),
    ...options.results.flatMap((result, i) => [
      ...(!/^\d+$/.test(result.testCaseId) ? [`results[${i}].testCaseId "${result.testCaseId}" is not a work item id`] : []),
      ...(!Number.isFinite(result.durationMs) || result.durationMs < 0 ? [`results[${i}].durationMs must be a non-negative number`] : []),
      ...(result.dataRow !== undefined && (!Number.isSafeInteger(result.dataRow) || result.dataRow < 0) ? [`results[${i}].dataRow must be a 0-based row index`] : []),
    ]),
  ];
  if (problems.length > 0) throw new ToolError('invalid-input', `cannot publish: ${problems.join('; ')}`, { problems });
  if (options.associateAutomation === true) {
    const missing = [...new Set(options.results.map((result) => result.testCaseId))].filter((id) => options.specByCase?.[id] === undefined);
    if (missing.length > 0) {
      throw new ToolError('invalid-input', `associateAutomation needs the spec path and test title of every case; missing for ${missing.join(', ')}`, { missing });
    }
  }
};

interface RunRef {
  readonly id: number;
  readonly url: string;
  readonly state?: string;
}

const runRef = (run: { id: number; webAccessUrl?: string | undefined; url?: string | undefined; state?: string | undefined }): RunRef => ({
  id: run.id,
  url: run.webAccessUrl ?? run.url ?? '',
  ...(run.state !== undefined ? { state: run.state } : {}),
});

/**
 * Look for the run a crashed attempt may have created. The query API needs a
 * last-updated window of at most 7 days; it runs from an hour before the
 * pending entry to an hour from now (clock skew), clipped to 7 days.
 */
export const findRunByTitle = async (
  client: AdoClient,
  runName: string,
  planId: number,
  since: Date,
  now: Date,
): Promise<RunRef | null> => {
  const max = new Date(now.getTime() + 60 * 60 * 1000);
  const min = new Date(Math.max(since.getTime() - 60 * 60 * 1000, max.getTime() - 7 * DAY_MS + 60 * 1000));
  const pages = await collectPages(
    client,
    {
      method: 'GET',
      path: '_apis/test/runs',
      query: { runTitle: runName, minLastUpdatedDate: min.toISOString(), maxLastUpdatedDate: max.toISOString(), planIds: planId },
      what: `the test run titled "${runName}"`,
    },
    TestRunListSchema,
  );
  const matches = pages
    .flatMap((page) => page.value)
    .filter((run) => run.name === runName && (run.plan === undefined || run.plan === null || run.plan.id === planId))
    .sort((a, b) => b.id - a.id);
  return matches[0] === undefined ? null : runRef(matches[0]);
};

/** Point → result id for every result in a run, paging with $top/$skip. */
const resultIdsByPoint = async (client: AdoClient, runId: number): Promise<ReadonlyMap<number, number>> => {
  const found = new Map<number, number>();
  for (let skip = 0; ; skip += RESULTS_PAGE) {
    const response = await client.request({
      method: 'GET',
      path: `_apis/test/Runs/${runId}/results`,
      query: { $top: RESULTS_PAGE, $skip: skip },
      what: `the results of test run ${runId}`,
    });
    const page = parseBody(TestResultListSchema, response.body, `the results of test run ${runId}`);
    for (const result of page.value) if (result.testPoint?.id !== undefined && !found.has(result.testPoint.id)) found.set(result.testPoint.id, result.id);
    if (page.value.length < RESULTS_PAGE) return found;
  }
};

export const publishResults = async (client: AdoClient, options: PublishOptions, ledger: PublishLedger): Promise<PublishedRun> => {
  validate(options);
  const now = options.now ?? (() => new Date());
  const dryRun = options.dryRun === true;
  const { planId, suiteId, runName } = options;
  const latest = latestEntry(await ledger.entries(), runName);

  if (latest !== undefined && (latest.planId !== planId || latest.suiteId !== suiteId)) {
    throw new ToolError(
      'invalid-input',
      `run name "${runName}" was already used for test plan ${latest.planId} suite ${latest.suiteId}; choose another runName to publish to plan ${planId} suite ${suiteId}`,
      { runName, planId: latest.planId, suiteId: latest.suiteId },
    );
  }
  if (latest?.state === 'completed' && latest.runId !== undefined) {
    return {
      runId: latest.runId,
      url: latest.url ?? '',
      resultIds: [...(latest.resultIds ?? [])],
      alreadyPublished: true,
      ...(dryRun ? { requests: [] } : {}),
    };
  }

  const requests: PlannedRequest[] = [];
  const record = (request: AdoRequest): void => {
    requests.push({ method: request.method, url: client.url(request.path, request.query, request.apiVersion), ...(request.body !== undefined ? { body: request.body } : {}) });
  };
  /** Reads go out even in a dry run; each is recorded. */
  const reader: AdoClient = {
    ...client,
    request: <T>(request: AdoRequest) => {
      record(request);
      return client.request<T>(request);
    },
  };
  /** Writes are recorded, and sent unless this is a dry run. */
  const write = async (request: AdoRequest, simulated: unknown): Promise<unknown> => {
    record(request);
    return dryRun ? simulated : (await client.request(request)).body;
  };
  const appendLedger = async (entry: Omit<PublishLedgerEntry, 'at' | 'runName' | 'planId' | 'suiteId'>): Promise<void> => {
    if (!dryRun) await ledger.append({ at: now().toISOString(), runName, planId, suiteId, ...entry });
  };

  // 1. Points.
  const caseById = new Map((options.cases ?? []).map((testCase) => [testCase.id, testCase] as const));
  const pointsByCase = new Map<string, readonly TestPointRef[]>();
  for (const testCaseId of [...new Set(options.results.filter((result) => result.testPointId === undefined).map((result) => result.testCaseId))]) {
    const known = caseById.get(testCaseId)?.points?.filter((point) => point.planId === planId && point.suiteId === suiteId) ?? [];
    const points = known.length > 0 ? known : await fetchTestPoints(reader, planId, suiteId, Number(testCaseId));
    const wanted = options.configurationNames;
    pointsByCase.set(
      testCaseId,
      wanted === undefined ? points : points.filter((point) => point.configurationName !== undefined && wanted.includes(point.configurationName)),
    );
  }
  const pointless = [...pointsByCase.entries()].filter(([, points]) => points.length === 0).map(([id]) => id);
  if (pointless.length > 0) {
    throw new ToolError(
      'not-found',
      `no test point in test plan ${planId} suite ${suiteId}${options.configurationNames !== undefined ? ` for configurations ${options.configurationNames.join(', ')}` : ''} for case${pointless.length === 1 ? '' : 's'} ${pointless.join(', ')}; add ${pointless.length === 1 ? 'it' : 'them'} to the suite or pass testPointId`,
      { testCaseIds: pointless },
    );
  }
  const groups = groupByPoint(options.results, pointsByCase);
  const pointIds = groups.map((group) => group.pointId);

  // 2. Shared-step revisions.
  const sharedIds = [
    ...new Set(
      options.results.flatMap((result) => {
        const resolve = sharedStepIdResolver(caseById.get(result.testCaseId));
        return (result.steps ?? []).map(resolve).filter((id): id is number => id !== undefined);
      }),
    ),
  ];
  const sharedRevisions = new Map<number, number>();
  if (sharedIds.length > 0) {
    const { items } = await fetchWorkItems(reader, sharedIds, [FIELDS.id, FIELDS.rev], 'shared step revisions');
    for (const item of items) {
      const rev = item.rev ?? (typeof item.fields[FIELDS.rev] === 'number' ? (item.fields[FIELDS.rev] as number) : undefined);
      if (rev !== undefined) sharedRevisions.set(item.id, rev);
    }
  }

  // 3. Automation association.
  if (options.associateAutomation === true) {
    for (const testCaseId of [...new Set(options.results.map((result) => result.testCaseId))]) {
      const spec = options.specByCase?.[testCaseId];
      if (spec === undefined) continue; // validate() guarantees presence
      await write(
        {
          method: 'PATCH',
          path: `_apis/wit/workitems/${testCaseId}`,
          body: automationPatch({ testCaseId, testName: spec.testTitle, storage: options.automatedTestStorage ?? spec.specPath }),
          contentType: 'application/json-patch+json',
          what: `associate case ${testCaseId} with its spec`,
        },
        null,
      );
    }
  }

  // 4. The run.
  const resumed = await (async (): Promise<RunRef | null> => {
    if (latest?.state === 'created' && latest.runId !== undefined) {
      try {
        const response = await reader.request({ method: 'GET', path: `_apis/test/runs/${latest.runId}`, what: `test run ${latest.runId}` });
        return runRef(parseBody(TestRunSchema, response.body, `test run ${latest.runId}`));
      } catch (error) {
        if (error instanceof ToolError && error.family === 'not-found') return null; // deleted since: create a new one
        throw error;
      }
    }
    if (latest?.state === 'pending') {
      const found = await findRunByTitle(reader, runName, planId, new Date(latest.at), now());
      // Found: remember it, so another interruption resumes it directly instead of searching again.
      if (found !== null) await appendLedger({ state: 'created', runId: found.id, url: found.url, ...(latest.pointIds !== undefined ? { pointIds: latest.pointIds } : {}) });
      return found;
    }
    return null;
  })();

  const run = await (async (): Promise<RunRef & { readonly simulated: boolean }> => {
    if (resumed !== null) return { ...resumed, simulated: false };
    await appendLedger({ state: 'pending', pointIds });
    const body = await write(
      {
        method: 'POST',
        path: '_apis/test/runs',
        body: buildRunCreate({
          runName,
          planId,
          pointIds,
          startedDate: now().toISOString(),
          ...(options.runComment !== undefined ? { comment: options.runComment } : {}),
          ...(options.buildId !== undefined ? { buildId: options.buildId } : {}),
        }),
        idempotent: false,
        what: `create test run "${runName}"`,
      },
      null,
    );
    if (dryRun) return { id: 0, url: '', simulated: true };
    const created = runRef(parseBody(TestRunSchema, body, `create test run "${runName}"`));
    await appendLedger({ state: 'created', runId: created.id, url: created.url, pointIds });
    return { ...created, simulated: false };
  })();
  const runPath = run.simulated ? '{runId}' : String(run.id);

  // A resumed run that was already completed: record it and stop.
  if (run.state === 'Completed') {
    const byPoint = await resultIdsByPoint(reader, run.id);
    const resultIds = pointIds.map((pointId) => byPoint.get(pointId)).filter((id): id is number => id !== undefined);
    await appendLedger({ state: 'completed', runId: run.id, url: run.url, resultIds, pointIds });
    return { runId: run.id, url: run.url, resultIds, alreadyPublished: true, ...(dryRun ? { requests } : {}) };
  }

  // 5. Result ids.
  const byPoint = new Map<number, number | string>(
    run.simulated ? pointIds.map((pointId) => [pointId, `{resultId of point ${pointId}}`] as const) : await resultIdsByPoint(reader, run.id),
  );
  const unmatched = groups.filter((group) => !byPoint.has(group.pointId));
  if (unmatched.length > 0) {
    const createdBody = await write(
      {
        method: 'POST',
        path: `_apis/test/Runs/${runPath}/results`,
        body: unmatched.map((group) => createResultBody(group, caseById.get(group.testCaseId))),
        idempotent: false,
        what: `add results to test run ${runPath}`,
      },
      { value: unmatched.map((group) => ({ id: `{resultId of point ${group.pointId}}`, testPoint: { id: group.pointId } })) },
    );
    if (!dryRun) {
      const created = parseBody(TestResultListSchema, createdBody, `add results to test run ${run.id}`);
      for (const result of created.value) if (result.testPoint?.id !== undefined) byPoint.set(result.testPoint.id, result.id);
    } else {
      for (const group of unmatched) byPoint.set(group.pointId, `{resultId of point ${group.pointId}}`);
    }
    const stillMissing = groups.filter((group) => !byPoint.has(group.pointId)).map((group) => group.pointId);
    if (stillMissing.length > 0) {
      throw new ToolError('malformed-response', `Azure DevOps created no result for test point${stillMissing.length === 1 ? '' : 's'} ${stillMissing.join(', ')} in run ${run.id}`, {
        runId: run.id,
        pointIds: stillMissing,
      });
    }
  }

  // 6. Update results.
  const completedAt = now();
  const updates = groups.map((group) =>
    buildResultUpdate(group, byPoint.get(group.pointId)!, {
      now: completedAt,
      sharedRevisions,
      ...(caseById.get(group.testCaseId) !== undefined ? { testCase: caseById.get(group.testCaseId)! } : {}),
      ...(options.specByCase?.[group.testCaseId] !== undefined ? { spec: options.specByCase[group.testCaseId]! } : {}),
      ...(options.automatedTestStorage !== undefined ? { automatedTestStorage: options.automatedTestStorage } : {}),
    }),
  );
  for (const batch of chunk(updates, PATCH_CHUNK)) {
    await write({ method: 'PATCH', path: `_apis/test/Runs/${runPath}/results`, body: batch, what: `update the results of test run ${runPath}` }, null);
  }

  // 7. Complete the run.
  await write({ method: 'PATCH', path: `_apis/test/runs/${runPath}`, body: buildRunComplete(now().toISOString()), what: `complete test run ${runPath}` }, null);
  const resultIds = groups.map((group) => byPoint.get(group.pointId)).filter((id): id is number => typeof id === 'number');
  await appendLedger({ state: 'completed', runId: run.id, url: run.url, resultIds, pointIds });
  return { runId: run.id, url: run.url, resultIds, alreadyPublished: false, ...(dryRun ? { requests } : {}) };
};

/** POST …/Runs/{id}/results item for a point ADO did not create a result for (reader §6 path B2). */
const createResultBody = (group: PointGroup, testCase: TestCase | undefined): Record<string, unknown> => {
  const revision = group.iterations.map((result) => result.testCaseRevision).find((value) => value !== undefined) ?? testCase?.revision;
  return {
    testPoint: { id: String(group.pointId) },
    testCase: { id: group.testCaseId },
    testCaseTitle: testCase?.title ?? `ADO ${group.testCaseId}`,
    ...(revision !== undefined ? { testCaseRevision: revision } : {}),
    state: 'Pending',
  };
};

export interface PublishReceiptsOptions extends Omit<PublishOptions, 'results' | 'cases' | 'specByCase'> {
  /** The receipts of one test.run (RunReceipt.runId = the fromRunId the agent gave). */
  readonly receipts: readonly RunReceipt[];
  /** Overrides the spec path / test title taken from the receipts. */
  readonly specByCase?: Readonly<Record<string, SpecRef>>;
  /** Ledger to use; default the workspace's .tesseract/receipts/publish.jsonl. */
  readonly ledger?: PublishLedger;
}

/**
 * ado.publish from a test.run: load the cached cases the receipts name (for
 * step identifiers, revisions, parameters, points), map the receipts to
 * results, take spec paths and titles from the receipts, and publish through
 * the workspace ledger.
 */
export const publishReceipts = async (client: AdoClient, workspace: Workspace, options: PublishReceiptsOptions): Promise<PublishedRun> => {
  const { receipts, ledger, specByCase, ...rest } = options;
  const cases = await loadCases(
    workspace,
    receipts.flatMap((receipt) => (receipt.testCase !== undefined ? [receipt.testCase] : [])),
  );
  // Steps publish by the identifiers the spec ran (its emit records), error text through the PII gate.
  const results = receiptsToPublishResults(receipts, cases, { emits: await readEmitRecords(workspace), pii: workspace.config.pii });
  if (results.length === 0) {
    throw new ToolError('invalid-input', 'nothing to publish: none of the run receipts names an Azure DevOps test case', { receipts: receipts.length });
  }
  return publishResults(client, { ...rest, results, cases, specByCase: specByCase ?? specsFromReceipts(receipts) }, ledger ?? workspaceLedger(workspace));
};
