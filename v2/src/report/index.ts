/**
 * report/: the three numbers (vision §6.1) and the per-test authoring
 * receipt, computed from the receipts and catalogs a workspace already has.
 * This replaces v1's dashboard: nothing here writes anything.
 *
 *   computeNumbers(workspace)                    acceptance, survival, cost, diagnostics
 *   renderNumbersMarkdown(numbers)               the page a QA lead reads
 *   authoringReceiptMarkdown(workspace, caseId)  one test, explained
 */
export { loadReceipts, AuthoringLineSchema, PreflightLineSchema, EMPTY_RECEIPTS, preflightLogFile, type AuthoringLine, type PreflightLine, type ReceiptSet } from './load.js';
export { computeNumbers, computeNumbersFrom, type CostSlice, type Numbers, type NumbersOptions, type PreflightRate, type Rate } from './numbers.js';
export { renderNumbersMarkdown } from './markdown.js';
export { authoringReceiptFrom, authoringReceiptMarkdown, describeCall } from './receipt.js';
export { attribute, caseCosts, caseIds, latestEmits, latestReviews, type Attributed, type CaseCost } from './model.js';
