/**
 * run/: the harness. Runs emitted specs with the customer's Playwright,
 * turns the JSON report into run receipts (steps mapped to ADO steps and
 * facets, failures classified as drift, candidate bug, environment or
 * unknown), feeds the outcomes to memory, and holds a failing browser open
 * for repair in place.
 *
 *   runSpecs(workspace, options)   test.run end to end
 *   releasePausedRuns()            let every paused run finish (called on shutdown)
 *   emit records                   what test.emit wrote, for run/review/publish
 */
export {
  DEFAULT_RUN_TIMEOUT_MS,
  RELEASE_GRACE_MS,
  RUN_RETENTION_MS,
  pausedRunIds,
  pruneRunDirs,
  readRunReceipts,
  releasePausedRuns,
  runSpecs,
  selectSpecs,
  type PausedRun,
  type RunSpecsOptions,
  type RunSpecsResult,
} from './run.js';
export {
  EmitRecordSchema,
  EmitRecordStepSchema,
  appendEmitRecord,
  latestEmitByCase,
  latestEmitBySpec,
  latestEmitFor,
  readEmitRecords,
  type EmitRecord,
  type EmitRecordStep,
} from './emit-records.js';
export { classifyRunFailure, facetNamedBy, familyOf, type FailureClass } from './classify.js';
export { facetIdsOf, receiptFor, summarize, type ReceiptContext, type RunSummary } from './receipts.js';
export { parseProgress, parseReport, TestOutcomeSchema, type ParsedReport, type TestOutcome, type TestOutcomeStep } from './report.js';
export {
  fileFilter,
  findCustomerConfig,
  minimalConfigSource,
  profileUse,
  resolvePlaywrightCli,
  specsUnder,
  startPlaywright,
  stopPlaywright,
  type ChildRun,
  type PlaywrightCli,
} from './playwright.js';
export {
  REPAIR_HOLD_MS,
  cleanupRepair,
  freePort,
  isModuleFile,
  prepareRepair,
  progressReporterSource,
  repairConfigSource,
  repairFixtureSource,
  resolveRelativeImport,
  rewriteShadowImports,
  type RepairPlan,
  type PrepareRepairOptions,
} from './repair.js';
