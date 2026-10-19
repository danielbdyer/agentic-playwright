/**
 * test.run receipts → ado.publish results. Pure.
 *
 * Outcome mapping (reader §6):
 *   passed → Passed          failed → Failed        timedOut → Timeout
 *   interrupted → Aborted    skipped → NotExecuted  flaky → Passed, with a comment
 *   a skipped test with a fixme step (an unresolved step raised as a handoff,
 *   emitted as test.fixme) → Blocked; the fixme step itself → Blocked.
 * Step outcomes: passed → Passed, failed → Failed, skipped → NotExecuted,
 * fixme → Blocked. RunStep.index is the 1-based index of the ADO step in the
 * revision the spec was emitted from. With the spec's emit records, a step is
 * published by the stepIdentifier that index had in the record current when
 * the run happened, so a case fetched again since (a step inserted or moved)
 * does not shift results onto steps that never ran; the result's
 * testCaseRevision is the revision the spec was emitted from. Without a
 * record (a hand-written spec), index maps to TestCase.steps[index - 1]. Steps
 * that do not map (setup steps, an index past the case's steps, a step the
 * case no longer has, or a case that is not cached) are left out of the
 * per-step results rather than guessed.
 *
 * Error text is passed through the PII gate when a mode is given (receipts
 * written by test.run already are; older ones may not be).
 */
import { redact, type PiiMode } from '../core/pii.js';
import type { RunReceipt, RunStep, TestCase } from '../contract/schemas.js';
import type { AdoOutcome, PublishResult, PublishStepResult, SpecRef } from './publish-plan.js';

/** What an emit record says about a spec's steps (structurally src/run's EmitRecord). */
export interface EmittedSteps {
  readonly at: string;
  readonly specPath: string;
  readonly revision: number;
  readonly steps: readonly { readonly index: number; readonly stepIdentifier: string }[];
}

export interface PublishMapOptions {
  /** Emit records in append order (readEmitRecords), to publish steps by the identifiers the spec ran. */
  readonly emits?: readonly EmittedSteps[];
  /** The workspace's PII mode, for error text. */
  readonly pii?: PiiMode;
}

/** The emit record of the receipt's spec that was current when it ran: the last one emitted at or before the receipt. */
const emittedFor = (receipt: RunReceipt, emits: readonly EmittedSteps[]): EmittedSteps | undefined => {
  const ranAt = Date.parse(receipt.at);
  return emits
    .filter((record) => record.specPath === receipt.spec && !(Date.parse(record.at) > ranAt))
    .at(-1);
};

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

const caseStepFor = (step: RunStep, testCase: TestCase, emitted: EmittedSteps | undefined): TestCase['steps'][number] | undefined => {
  if (emitted !== undefined) {
    const identifier = emitted.steps.find((s) => s.index === step.index)?.stepIdentifier;
    return identifier === undefined ? undefined : testCase.steps.find((s) => s.stepIdentifier === identifier);
  }
  return Number.isInteger(step.index) && step.index >= 1 ? testCase.steps[step.index - 1] : undefined;
};

const stepResults = (receipt: RunReceipt, testCase: TestCase | undefined, emitted: EmittedSteps | undefined, gate: (text: string) => string): readonly PublishStepResult[] => {
  if (testCase === undefined) return [];
  return receipt.steps.flatMap((step): readonly PublishStepResult[] => {
    const caseStep = caseStepFor(step, testCase, emitted);
    if (caseStep === undefined) return [];
    return [
      {
        stepIdentifier: caseStep.stepIdentifier,
        outcome: STEP_OUTCOME[step.outcome],
        durationMs: step.durationMs,
        ...(step.error !== undefined && step.error.length > 0 ? { errorMessage: gate(step.error) } : {}),
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
 * testCaseRevision is the revision the spec was emitted from (with emit
 * records), else the cached case's.
 */
export const receiptsToPublishResults = (
  receipts: readonly RunReceipt[],
  cases: readonly TestCase[],
  options: PublishMapOptions = {},
): readonly PublishResult[] => {
  const caseById = new Map(cases.map((testCase) => [testCase.id, testCase] as const));
  const pii = options.pii;
  const gate = (text: string): string => (pii === undefined ? text : redact(text, pii));
  return receipts.flatMap((receipt): readonly PublishResult[] => {
    if (receipt.testCase === undefined || receipt.testCase.length === 0) return [];
    const testCase = caseById.get(receipt.testCase);
    const emitted = emittedFor(receipt, options.emits ?? []);
    const steps = stepResults(receipt, testCase, emitted, gate);
    const comment = commentOf(receipt);
    const revision = emitted?.revision ?? testCase?.revision;
    return [
      {
        testCaseId: receipt.testCase,
        ...(revision !== undefined ? { testCaseRevision: revision } : {}),
        outcome: outcomeOfReceipt(receipt),
        durationMs: receipt.durationMs,
        ...(receipt.error !== undefined ? { errorMessage: gate(receipt.error.message), failureType: receipt.error.failureType } : {}),
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
