/**
 * ado.fetch and ado.publish: the two ends of the Azure DevOps loop. The ado
 * library does the protocol work (fetching, caching, publishing with its
 * idempotency ledger); these handlers pick the inputs and the client.
 */
import { ToolError } from '../../core/errors.js';
import type { RunReceipt } from '../../contract/schemas.js';
import {
  adoClientFromWorkspace,
  fetchWithCache,
  loadCases,
  publishResults,
  receiptsToPublishResults,
  requireAdoClient,
  specsFromReceipts,
  workspaceLedger,
  type PublishResult,
  type SpecRef,
} from '../../ado/index.js';
import { latestEmitByCase, readEmitRecords, readRunReceipts } from '../../run/index.js';
import type { Workspace } from '../../workspace/workspace.js';
import type { ToolHandlers } from '../types.js';

/**
 * Spec path and test title per case, for associateAutomation and the
 * results' automatedTestName: from the run's receipts when publishing a run,
 * else from the latest emit record of each case.
 */
const specsFor = async (workspace: Workspace, caseIds: readonly string[], receipts: readonly RunReceipt[]): Promise<Readonly<Record<string, SpecRef>>> => {
  const fromReceipts = specsFromReceipts(receipts);
  const emits = latestEmitByCase(await readEmitRecords(workspace));
  return Object.fromEntries(
    caseIds.flatMap((id): readonly (readonly [string, SpecRef])[] => {
      const record = emits.get(id);
      const receipt = fromReceipts[id];
      if (receipt !== undefined) return [[id, record !== undefined ? { ...receipt, specPath: record.specPath } : receipt]];
      return record !== undefined ? [[id, { specPath: record.specPath, testTitle: record.testTitle ?? `ADO ${id}` }]] : [];
    }),
  );
};

export const adoHandlers: Pick<ToolHandlers, 'ado.fetch' | 'ado.publish'> = {
  'ado.fetch': async (input, ctx) => {
    const hasIds = input.ids !== undefined && input.ids.length > 0;
    if (!hasIds && input.wiql === undefined && input.planId === undefined) {
      throw new ToolError('invalid-input', 'give ids, a wiql query, or a planId (with an optional suiteId)');
    }
    if (input.suiteId !== undefined && input.planId === undefined) throw new ToolError('invalid-input', 'suiteId needs its planId');
    const client = adoClientFromWorkspace(ctx.workspace, ctx.env, { log: ctx.log });
    const result = await fetchWithCache(ctx.workspace, client, {
      ...(hasIds ? { ids: input.ids } : {}),
      ...(input.wiql !== undefined ? { wiql: input.wiql } : {}),
      ...(input.planId !== undefined ? { planId: input.planId } : {}),
      ...(input.suiteId !== undefined ? { suiteId: input.suiteId } : {}),
      ...(input.refresh === true ? { refresh: true } : {}),
    });
    return { testCases: [...result.testCases], source: result.source, warnings: [...result.warnings] };
  },

  'ado.publish': async (input, ctx) => {
    const { workspace } = ctx;
    if (input.fromRunId !== undefined && input.results !== undefined) {
      throw new ToolError('invalid-input', 'give either fromRunId or results, not both');
    }
    const receipts: readonly RunReceipt[] = input.fromRunId !== undefined ? await readRunReceipts(workspace, input.fromRunId) : [];
    if (input.fromRunId !== undefined && receipts.length === 0) {
      throw new ToolError('not-found', `no run receipts for run ${input.fromRunId} in .tesseract/receipts/runs.jsonl`, { runId: input.fromRunId });
    }
    const caseIds = [
      ...new Set([
        ...receipts.flatMap((receipt) => (receipt.testCase !== undefined ? [receipt.testCase] : [])),
        ...(input.results ?? []).map((result) => result.testCaseId),
      ]),
    ];
    const cases = await loadCases(workspace, caseIds);
    const results: readonly PublishResult[] = input.fromRunId !== undefined ? receiptsToPublishResults(receipts, cases) : (input.results ?? []);
    if (results.length === 0) {
      throw new ToolError(
        'invalid-input',
        input.fromRunId !== undefined ? `run ${input.fromRunId} has no receipts that name an Azure DevOps test case` : 'give fromRunId (a test.run runId) or results',
      );
    }
    const client = requireAdoClient(workspace, ctx.env, { log: ctx.log });
    const published = await publishResults(
      client,
      {
        planId: input.planId,
        suiteId: input.suiteId,
        runName: input.runName,
        results,
        cases,
        specByCase: await specsFor(workspace, caseIds, receipts),
        ...(input.associateAutomation === true ? { associateAutomation: true } : {}),
        ...(input.dryRun === true ? { dryRun: true } : {}),
        now: ctx.now,
      },
      workspaceLedger(workspace),
    );
    return {
      runId: published.runId,
      url: published.url,
      resultIds: [...published.resultIds],
      alreadyPublished: published.alreadyPublished,
      ...(published.requests !== undefined ? { requests: published.requests.map((r) => ({ method: r.method, url: r.url, ...(r.body !== undefined ? { body: r.body } : {}) })) } : {}),
    };
  },
};
