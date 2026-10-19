/**
 * Azure DevOps: reading test cases (ado.fetch), publishing results
 * (ado.publish), and commenting on work items (handoff.raise).
 *
 * Typical handler use:
 *   ado.fetch    → fetchWithCache(workspace, adoClientFromWorkspace(workspace, env), input)
 *   ado.publish  → fromRunId: publishReceipts(requireAdoClient(workspace, env), workspace, { ...input, receipts })
 *                  results:   publishResults(client, { ...input, results, cases: await loadCases(workspace, ids) }, workspaceLedger(workspace))
 *   handoff      → commentOnWorkItem(client, handoff.testCaseId, formatHandoffComment(handoff))
 */
export {
  adoClientFromWorkspace,
  adoSettings,
  buildQuery,
  createAdoClient,
  DEFAULT_API_VERSION,
  DEFAULT_PAT_ENV,
  encodeBasicAuth,
  parseRetryAfter,
  requireAdoClient,
  type AdoClient,
  type AdoClientOptions,
  type AdoRequest,
  type AdoResponse,
  type AdoSettings,
  type FetchLike,
  type HttpMethod,
  type QueryValue,
} from './client.js';
export {
  asInteger,
  asText,
  htmlToText,
  parseDataSource,
  parseParameterNames,
  parseStepsXml,
  splitTags,
  unionNames,
  type ParsedCompref,
  type ParsedDataSource,
  type ParsedStep,
  type ParsedSteps,
  type StepsNode,
} from './fields.js';
export {
  buildTestCase,
  compareCaseIds,
  contentHashOf,
  expandSteps,
  FIELDS,
  parseSharedStep,
  revisionOf,
  SHARED_STEP_FIELDS,
  sharedStepRefsOf,
  TEST_CASE_FIELDS,
  type BuildContext,
  type ContentHashInput,
  type ExpandedSteps,
  type SharedStepDefinition,
  type TestPointRef,
  type WorkItem,
} from './testcase.js';
export {
  assembleTestCases,
  BATCH_LIMIT,
  fetchSharedSteps,
  fetchTestCases,
  fetchTestCasesByIds,
  fetchTestCasesBySuite,
  fetchTestCasesByWiql,
  fetchTestPoints,
  fetchWorkItems,
  listPlanSuites,
  listSuiteTestCases,
  parseWorkItemIds,
  queryWiql,
  WIQL_DEFAULT_TOP,
  WIQL_MAX_TOP,
  type FetchResult,
  type FetchSelector,
  type SuiteEntry,
  type SuiteFilter,
  type WorkItemsResult,
} from './fetch.js';
export { casePath, fetchWithCache, listCachedCases, loadCase, loadCases, saveCase, type CachedFetchInput, type CachedFetchResult } from './cache.js';
export { AUTOMATED_TEST_TYPE, automatedTestId, automationPatch, type AutomationAssociation, type JsonPatchOperation } from './automation.js';
export { fileLedger, latestEntry, memoryLedger, workspaceLedger, type PublishLedger, type PublishLedgerEntry, type PublishLedgerState } from './ledger.js';
export {
  actionPathSegment,
  buildActionResults,
  buildResultUpdate,
  buildRunComplete,
  buildRunCreate,
  groupByPoint,
  iterationIdOf,
  iterationParameters,
  resultComment,
  resultErrorMessage,
  worstOutcome,
  type ActionResult,
  type AdoOutcome,
  type PointGroup,
  type PublishResult,
  type PublishStepResult,
  type SpecRef,
} from './publish-plan.js';
export { findRunByTitle, publishReceipts, publishResults, type PlannedRequest, type PublishedRun, type PublishOptions, type PublishReceiptsOptions } from './publish.js';
export { outcomeOfReceipt, receiptsToPublishResults, specsFromReceipts } from './results.js';
export { COMMENTS_API_VERSION, commentOnWorkItem, formatHandoffComment, type PostedComment } from './comments.js';
