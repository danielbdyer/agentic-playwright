/**
 * test.run receipts → ado.publish results. Pure.
 *
 * Outcome mapping (reader §6):
 *   passed → Passed          failed → Failed        timedOut → Timeout
 *   interrupted → Aborted    skipped → NotExecuted  flaky → Passed, with a comment
 *   a skipped test with a fixme step (an unresolved step raised as a handoff,
 *   emitted as test.fixme) → Blocked; the fixme step itself → Blocked.
 * Step outcomes: passed → Passed, failed → Failed, skipped → NotExecuted,
 * fixme → Blocked. RunStep.index is 1-based and maps to
 * TestCase.steps[index - 1].stepIdentifier; steps that do not map (setup
 * steps, an index past the case's steps, or a case that is not cached) are
 * left out of the per-step results rather than guessed.
 */
import type { RunReceipt, RunStep, TestCase } from '../contract/schemas.js';
import type { AdoOutcome, PublishResult, PublishStepResult, SpecRef } from './publish-plan.js';

const TEST_OUTCOME: Readonly<Record<RunReceipt['outcome'], AdoOutcome>> = {
  passed: 'Passed',
  failed: 'Failed',
  timedOut: 'Timeout',
  interrupted: 'Aborted',
  skipped: 'NotExecuted',
  flaky: 'Passed',
};

const STEP_OUTCOME: Readonly<Record<RunStep['outcome'], AdoOutcome>> = {
  passed: 'Passed',
  failed: 'Failed',
  skipped: 'NotExecuted',
  fixme: 'Blocked',
};

export const outcomeOfReceipt = (receipt: RunReceipt): AdoOutcome =>
  receipt.outcome === 'skipped' && receipt.steps.some((step) => step.outcome === 'fixme') ? 'Blocked' : TEST_OUTCOME[receipt.outcome];

const stepResults = (receipt: RunReceipt, testCase: TestCase | undefined): readonly PublishStepResult[] => {
  if (testCase === undefined) return [];
  return receipt.steps.flatMap((step): readonly PublishStepResult[] => {
    const caseStep = Number.isInteger(step.index) && step.index >= 1 ? testCase.steps[step.index - 1] : undefined;
    if (caseStep === undefined) return [];
    return [
      {
        stepIdentifier: caseStep.stepIdentifier,
        outcome: STEP_OUTCOME[step.outcome],
        durationMs: step.durationMs,
        ...(step.error !== undefined && step.error.length > 0 ? { errorMessage: step.error } : {}),
        ...(caseStep.sharedStepId !== undefined ? { sharedStepId: caseStep.sharedStepId } : {}),
      },
    ];
  });
};

const commentOf = (receipt: RunReceipt): string | undefined => {
  if (receipt.outcome === 'flaky') return `flaky: passed after ${receipt.retries} ${receipt.retries === 1 ? 'retry' : 'retries'}`;
  if (outcomeOfReceipt(receipt) === 'Blocked') {
    const fixme = receipt.steps.filter((step) => step.outcome === 'fixme').map((step) => step.index);
    return `blocked: step${fixme.length === 1 ? '' : 's'} ${fixme.join(', ')} awaiting a human (handoff)`;
  }
  return undefined;
};

/**
 * One PublishResult per receipt that names a test case, in receipt order.
 * Receipts without a testCase cannot be published and are skipped. The
 * case's revision is used as testCaseRevision when the case is known.
 */
export const receiptsToPublishResults = (receipts: readonly RunReceipt[], cases: readonly TestCase[]): readonly PublishResult[] => {
  const caseById = new Map(cases.map((testCase) => [testCase.id, testCase] as const));
  return receipts.flatMap((receipt): readonly PublishResult[] => {
    if (receipt.testCase === undefined || receipt.testCase.length === 0) return [];
    const testCase = caseById.get(receipt.testCase);
    const steps = stepResults(receipt, testCase);
    const comment = commentOf(receipt);
    return [
      {
        testCaseId: receipt.testCase,
        ...(testCase !== undefined ? { testCaseRevision: testCase.revision } : {}),
        outcome: outcomeOfReceipt(receipt),
        durationMs: receipt.durationMs,
        ...(receipt.error !== undefined ? { errorMessage: receipt.error.message, failureType: receipt.error.failureType } : {}),
        ...(receipt.trace !== undefined ? { traceRef: receipt.trace } : {}),
        ...(receipt.dataRow !== undefined ? { dataRow: receipt.dataRow } : {}),
        ...(comment !== undefined ? { comment } : {}),
        ...(steps.length > 0 ? { steps } : {}),
      },
    ];
  });
};

/**
 * Spec path and test title per test case, from the receipts (for
 * associateAutomation and the results' automatedTestName). For a data-driven
 * case with one test per row, the first receipt's title is used; its spec
 * path is the same for every row.
 */
export const specsFromReceipts = (receipts: readonly RunReceipt[]): Readonly<Record<string, SpecRef>> =>
  receipts.reduce<Readonly<Record<string, SpecRef>>>(
    (acc, receipt) =>
      receipt.testCase === undefined || receipt.testCase.length === 0 || acc[receipt.testCase] !== undefined
        ? acc
        : { ...acc, [receipt.testCase]: { specPath: receipt.spec, testTitle: receipt.title } },
    {},
  );
