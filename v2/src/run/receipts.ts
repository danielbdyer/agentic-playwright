/**
 * Test outcomes → run receipts. Pure: everything the mapping needs (the
 * emit records, the facets they reference, the cached cases) is loaded by
 * the caller and passed in.
 *
 * Steps: the k-th top-level test.step is the k-th entry of the spec's
 * ado-steps annotation (its ADO stepIdentifier); the emit record supplies
 * the ADO step index and the facets that step uses. Steps a failure or a
 * fixme kept from running are reported as skipped, so a published result
 * shows them as not executed rather than missing.
 */
import type { Facet, RunReceipt, RunStep, TestCase } from '../contract/schemas.js';
import { stripAnsi } from '../act/classify.js';
import { classifyRunFailure } from './classify.js';
import type { EmitRecord, EmitRecordStep } from './emit-records.js';
import type { TestOutcome, TestOutcomeStep } from './report.js';

export interface ReceiptContext {
  readonly runId: string;
  readonly at: string;
  /** Absolute workspace root. */
  readonly root: string;
  /** Latest emit record per workspace-relative spec path. */
  readonly emitBySpec: ReadonlyMap<string, EmitRecord>;
  /** Facets referenced by those records, as memory has them now. */
  readonly facets: ReadonlyMap<string, Facet>;
  /** Cached test cases, for step indexes and data-row values when no emit record knows them. */
  readonly cases: ReadonlyMap<string, TestCase>;
  /** Maps a file that ran (a shadow spec) back to the workspace's spec. Identity by default. */
  readonly originalOf?: (file: string) => string;
}

const toRelative = (root: string, file: string): string => {
  const normalizedRoot = root.endsWith('/') || root.endsWith('\\') ? root : `${root}/`;
  const posix = file.split('\\').join('/');
  const rootPosix = normalizedRoot.split('\\').join('/');
  return posix.startsWith(rootPosix) ? posix.slice(rootPosix.length) : posix;
};

const annotation = (outcome: TestOutcome, type: string): string | undefined =>
  outcome.annotations.find((a) => a.type === type && a.description !== undefined)?.description;

const adoStepsOf = (outcome: TestOutcome): readonly string[] => {
  const raw = annotation(outcome, 'ado-steps');
  if (raw === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

/** The ADO id a spec is for: its ado-id annotation, the emit record, or the numeric prefix of the file name. */
const testCaseOf = (outcome: TestOutcome, spec: string, record: EmitRecord | undefined): string | undefined => {
  const annotated = annotation(outcome, 'ado-id');
  if (annotated !== undefined && annotated.length > 0) return annotated;
  if (record !== undefined) return record.testCaseId;
  const prefix = /^(\d+)-/.exec(spec.split('/').pop() ?? '');
  return prefix?.[1];
};

/** The emitted ado-data-row annotation is 1-based (the row number a reader sees); receipts carry a 0-based index. */
const dataRowOf = (outcome: TestOutcome): number | undefined => {
  const raw = annotation(outcome, 'ado-data-row');
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return undefined;
  return Math.max(0, Number(raw.trim()) - 1);
};

const SKIPPED_IN_STEP = /Test is skipped/;

const conciseStepError = (raw: string): string => {
  const text = stripAnsi(raw);
  const body = text.split(/\n\s*Call log:/)[0] ?? text;
  const lines = body.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  const joined = lines.slice(0, 6).join('; ');
  return joined.length > 600 ? `${joined.slice(0, 600)}…` : joined;
};

interface MappedStep {
  readonly ran: TestOutcomeStep;
  readonly emitted: EmitRecordStep | undefined;
  readonly index: number;
}

const mapSteps = (outcome: TestOutcome, record: EmitRecord | undefined, testCase: TestCase | undefined): readonly MappedStep[] => {
  const identifiers = adoStepsOf(outcome);
  const emitted = record?.steps ?? [];
  return outcome.steps.map((ran, k) => {
    const identifier = identifiers[k];
    const byIdentifier = identifier === undefined ? undefined : emitted.find((step) => step.stepIdentifier === identifier);
    const step = byIdentifier ?? (identifier === undefined ? emitted[k] : undefined);
    const caseIndex = identifier === undefined ? undefined : testCase?.steps.find((s) => s.stepIdentifier === identifier)?.index;
    return { ran, emitted: step, index: step?.index ?? caseIndex ?? k + 1 };
  });
};

const OUTCOME: Readonly<Record<string, RunReceipt['outcome']>> = {
  passed: 'passed',
  failed: 'failed',
  timedOut: 'timedOut',
  interrupted: 'interrupted',
  skipped: 'skipped',
};

const outcomeOf = (outcome: TestOutcome): RunReceipt['outcome'] => {
  if (outcome.status === 'flaky') return 'flaky';
  if (outcome.status === 'skipped') return 'skipped';
  if (outcome.status === 'expected') return 'passed';
  const last = OUTCOME[outcome.lastStatus] ?? 'failed';
  return last === 'passed' || last === 'skipped' ? 'failed' : last;
};

const facetList = (ids: readonly string[], facets: ReadonlyMap<string, Facet>): readonly Facet[] =>
  ids.flatMap((id) => (facets.has(id) ? [facets.get(id)!] : []));

/** One receipt per test (per data row for a data-driven case). */
export const receiptFor = (outcome: TestOutcome, ctx: ReceiptContext): RunReceipt => {
  const file = ctx.originalOf?.(outcome.file) ?? outcome.file;
  const spec = toRelative(ctx.root, file);
  const record = ctx.emitBySpec.get(spec);
  const testCaseId = testCaseOf(outcome, spec, record);
  const testCase = testCaseId === undefined ? undefined : ctx.cases.get(testCaseId);
  const dataRow = dataRowOf(outcome);
  const result = outcomeOf(outcome);
  const fixme = outcome.annotations.some((a) => a.type === 'fixme');

  const mapped = mapSteps(outcome, record, testCase);
  const ranSteps: readonly RunStep[] = mapped.map(({ ran, emitted, index }) => {
    const stepOutcome: RunStep['outcome'] =
      ran.error === undefined ? 'passed' : SKIPPED_IN_STEP.test(stripAnsi(ran.error)) ? (fixme ? 'fixme' : 'skipped') : 'failed';
    return {
      index,
      title: ran.title,
      outcome: stepOutcome,
      durationMs: Math.round(ran.durationMs),
      facets: [...(emitted?.facets ?? [])],
      ...(ran.error !== undefined && stepOutcome !== 'passed' ? { error: conciseStepError(ran.error) } : {}),
    };
  });
  const covered = new Set(ranSteps.map((step) => step.index));
  const notRun: readonly RunStep[] = (record?.steps ?? [])
    .filter((step) => !covered.has(step.index))
    .map((step) => ({ index: step.index, title: step.title, outcome: 'skipped', durationMs: 0, facets: [...step.facets] }));

  const failed = result === 'failed' || result === 'timedOut' || result === 'interrupted';
  const failingStep = mapped.find(({ ran }) => ran.error !== undefined && !SKIPPED_IN_STEP.test(stripAnsi(ran.error)));
  const message = failingStep?.ran.error ?? outcome.error;
  const params = testCase?.dataRows[dataRow ?? 0] ?? {};
  const error =
    failed && message !== undefined
      ? classifyRunFailure(
          message,
          facetList(failingStep?.emitted?.facets ?? [], ctx.facets),
          facetList(record?.facets ?? [], ctx.facets),
          params,
        )
      : undefined;

  return {
    runId: ctx.runId,
    at: ctx.at,
    ...(testCaseId !== undefined ? { testCase: testCaseId } : {}),
    title: outcome.titlePath.join(' › '),
    spec,
    ...(dataRow !== undefined ? { dataRow } : {}),
    outcome: result,
    durationMs: Math.round(outcome.durationMs),
    retries: outcome.retries,
    ...(error !== undefined
      ? { error: { message: error.message, family: error.family, failureType: error.failureType, ...(error.facet !== undefined ? { facet: error.facet } : {}) } }
      : {}),
    steps: [...ranSteps, ...notRun].sort((a, b) => a.index - b.index),
    ...(outcome.tracePath !== undefined ? { trace: toRelative(ctx.root, outcome.tracePath) } : {}),
  };
};

export interface RunSummary {
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly flaky: number;
}

export const summarize = (receipts: readonly RunReceipt[]): RunSummary => ({
  passed: receipts.filter((r) => r.outcome === 'passed').length,
  failed: receipts.filter((r) => r.outcome === 'failed' || r.outcome === 'timedOut' || r.outcome === 'interrupted').length,
  skipped: receipts.filter((r) => r.outcome === 'skipped').length,
  flaky: receipts.filter((r) => r.outcome === 'flaky').length,
});

/** Facet ids every receipt's spec references (for loading them from memory). */
export const facetIdsOf = (records: Iterable<EmitRecord>): readonly string[] => [...new Set([...records].flatMap((record) => record.facets))];
