/**
 * Pure building blocks of ado.publish: the result types, grouping results by
 * test point into iterations, action paths for per-step results, and the
 * request bodies. publish.ts sequences these against the server.
 *
 * Confidence notes (reader §6): the outcome strings, durationInMs,
 * iterationDetails/actionResults and the stepIdentifier scheme are
 * medium-high confidence; actionPath (8 hex digits per level) and the
 * parent-level shared-step actionResult carrying sharedStepModel are medium.
 */
import type { FailureType, TestCase } from '../contract/schemas.js';
import type { TestPointRef } from './testcase.js';

/** ADO TestOutcome values this package writes. Timeout is not in the ado.publish input enum (contract change requested). */
export type AdoOutcome = 'Passed' | 'Failed' | 'Blocked' | 'NotExecuted' | 'Inconclusive' | 'Aborted' | 'Timeout';

export interface PublishStepResult {
  readonly stepIdentifier: string;
  readonly outcome: AdoOutcome;
  readonly durationMs?: number;
  readonly errorMessage?: string;
  /** Work item id of the shared step a "C;child" step came from; filled from the cached case when absent. */
  readonly sharedStepId?: number;
}

/** One executed test (one data row of one case). A superset of the ado.publish `results[]` item. */
export interface PublishResult {
  readonly testCaseId: string;
  /** When absent, the case's points in the plan/suite are resolved and the result is published to each. */
  readonly testPointId?: number;
  readonly testCaseRevision?: number;
  readonly outcome: AdoOutcome;
  readonly durationMs: number;
  readonly errorMessage?: string;
  readonly failureType?: FailureType;
  readonly traceRef?: string;
  /** 0-based index into TestCase.dataRows; published as iteration dataRow + 1. Absent means row 0 / iteration 1. */
  readonly dataRow?: number;
  /** Extra text for the result comment (e.g. "flaky: passed on retry 1"). */
  readonly comment?: string;
  readonly steps?: readonly PublishStepResult[];
}

/** Results for one test point, one per iteration, in iteration order. */
export interface PointGroup {
  readonly pointId: number;
  readonly testCaseId: string;
  readonly iterations: readonly PublishResult[];
}

const SEVERITY: readonly AdoOutcome[] = ['Failed', 'Timeout', 'Aborted', 'Blocked', 'Inconclusive', 'NotExecuted', 'Passed'];

/** The worst outcome wins: one failed iteration fails the point; a not-executed iteration keeps it from passing. */
export const worstOutcome = (outcomes: readonly AdoOutcome[]): AdoOutcome =>
  outcomes.reduce<AdoOutcome>((worst, outcome) => (SEVERITY.indexOf(outcome) < SEVERITY.indexOf(worst) ? outcome : worst), 'Passed');

export const iterationIdOf = (result: PublishResult): number => (result.dataRow ?? 0) + 1;

/**
 * Group results by test point. A result with testPointId goes to that point;
 * one without goes to every point resolved for its case. Within a point,
 * iterations are ordered by data row, and a later result for the same row
 * replaces an earlier one (the latest receipt wins).
 */
export const groupByPoint = (results: readonly PublishResult[], pointsByCase: ReadonlyMap<string, readonly TestPointRef[]>): readonly PointGroup[] => {
  const order: number[] = [];
  const groups = new Map<number, { testCaseId: string; byRow: Map<number, PublishResult> }>();
  for (const result of results) {
    const pointIds = result.testPointId !== undefined ? [result.testPointId] : (pointsByCase.get(result.testCaseId) ?? []).map((point) => point.pointId);
    for (const pointId of pointIds) {
      const group = groups.get(pointId) ?? { testCaseId: result.testCaseId, byRow: new Map<number, PublishResult>() };
      if (!groups.has(pointId)) {
        groups.set(pointId, group);
        order.push(pointId);
      }
      group.byRow.set(result.dataRow ?? 0, result);
    }
  }
  return order.map((pointId) => {
    const group = groups.get(pointId)!;
    return {
      pointId,
      testCaseId: group.testCaseId,
      iterations: [...group.byRow.entries()].sort(([a], [b]) => a - b).map(([, result]) => result),
    };
  });
};

/** One level of an action path: the step id as 8 uppercase hex digits. Null for a non-numeric id. */
export const actionPathSegment = (stepId: string): string | null =>
  /^\d+$/.test(stepId) ? Number(stepId).toString(16).toUpperCase().padStart(8, '0') : null;

export interface ActionResult {
  readonly actionPath: string;
  readonly iterationId: number;
  readonly stepIdentifier: string;
  readonly outcome: AdoOutcome;
  readonly durationInMs?: number;
  readonly errorMessage?: string;
  readonly sharedStepModel?: { readonly id: number; readonly revision: number };
}

/**
 * Per-step results for one iteration. A top-level step "5" has path
 * "00000005". Steps expanded from shared steps ("5;2") are preceded, once per
 * compref, by a parent result for "5" carrying sharedStepModel {id, revision}
 * and the worst of its children's outcomes; each child's path is the parent
 * path followed by its own segment ("0000000500000002"). Steps whose ids are
 * not numeric cannot be addressed and are left out.
 */
export const buildActionResults = (
  steps: readonly PublishStepResult[],
  iterationId: number,
  sharedStepIdOf: (step: PublishStepResult) => number | undefined,
  sharedRevisions: ReadonlyMap<number, number>,
): readonly ActionResult[] => {
  const emitted = new Set<string>();
  const detail = (step: PublishStepResult): Pick<ActionResult, 'durationInMs' | 'errorMessage'> => ({
    ...(step.durationMs !== undefined ? { durationInMs: Math.round(step.durationMs) } : {}),
    ...(step.errorMessage !== undefined && step.errorMessage.length > 0 ? { errorMessage: step.errorMessage } : {}),
  });
  return steps.flatMap((step): readonly ActionResult[] => {
    const [head = '', child, ...rest] = step.stepIdentifier.split(';');
    const parentPath = actionPathSegment(head.trim());
    if (parentPath === null || rest.length > 0) return [];
    if (child === undefined) {
      return [{ actionPath: parentPath, iterationId, stepIdentifier: head.trim(), outcome: step.outcome, ...detail(step) }];
    }
    const childPath = actionPathSegment(child.trim());
    if (childPath === null) return [];
    const childResult: ActionResult = {
      actionPath: `${parentPath}${childPath}`,
      iterationId,
      stepIdentifier: `${head.trim()};${child.trim()}`,
      outcome: step.outcome,
      ...detail(step),
    };
    if (emitted.has(head)) return [childResult];
    emitted.add(head);
    const siblings = steps.filter((other) => other.stepIdentifier.split(';')[0] === head && other.stepIdentifier.includes(';'));
    const sharedId = siblings.map(sharedStepIdOf).find((id): id is number => id !== undefined);
    const revision = sharedId === undefined ? undefined : sharedRevisions.get(sharedId);
    const totalMs = siblings.reduce<number | undefined>((sum, other) => (other.durationMs === undefined ? sum : (sum ?? 0) + other.durationMs), undefined);
    const parent: ActionResult = {
      actionPath: parentPath,
      iterationId,
      stepIdentifier: head.trim(),
      outcome: worstOutcome(siblings.map((other) => other.outcome)),
      ...(totalMs !== undefined ? { durationInMs: Math.round(totalMs) } : {}),
      ...(sharedId !== undefined && revision !== undefined ? { sharedStepModel: { id: sharedId, revision } } : {}),
    };
    return [parent, childResult];
  });
};

export interface IterationParameter {
  readonly parameterName: string;
  readonly value: string;
  readonly iterationId: number;
}

/** The data row's parameter values, when the case is known and has that row. */
export const iterationParameters = (testCase: TestCase | undefined, result: PublishResult): readonly IterationParameter[] => {
  const row = testCase?.dataRows[result.dataRow ?? 0];
  if (testCase === undefined || row === undefined) return [];
  const iterationId = iterationIdOf(result);
  return testCase.parameters.map((name) => ({ parameterName: name, value: row[name] ?? '', iterationId }));
};

const COMMENT_LIMIT = 1000;
const ERROR_LIMIT = 4000;

const cap = (text: string, limit: number): string => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text);

const describe = (result: PublishResult): string =>
  [
    result.traceRef !== undefined ? `trace: ${result.traceRef}` : null,
    result.failureType !== undefined ? `failureType: ${result.failureType}` : null,
    result.comment ?? null,
  ]
    .filter((part): part is string => part !== null && part.length > 0)
    .join('; ');

/**
 * The result comment: the trace reference and the v2 failure type (ADO's own
 * failureType is a per-project free-text list that does not map onto v2's),
 * per iteration when there are several.
 */
export const resultComment = (iterations: readonly PublishResult[]): string | undefined => {
  const parts =
    iterations.length === 1
      ? [describe(iterations[0]!)]
      : iterations.map((result) => (describe(result).length > 0 ? `row ${iterationIdOf(result)}: ${describe(result)}` : ''));
  const text = parts.filter((part) => part.length > 0).join(' | ');
  return text.length > 0 ? cap(`[tesseract-qa] ${text}`, COMMENT_LIMIT) : undefined;
};

export const resultErrorMessage = (iterations: readonly PublishResult[]): string | undefined => {
  const failing = iterations.filter((result) => result.errorMessage !== undefined && result.errorMessage.length > 0);
  if (failing.length === 0) return undefined;
  const text = iterations.length === 1 ? failing[0]!.errorMessage! : failing.map((result) => `row ${iterationIdOf(result)}: ${result.errorMessage}`).join('\n');
  return cap(text, ERROR_LIMIT);
};

export interface SpecRef {
  /** Spec path relative to the repository root, e.g. "tests/policy/10001-verify-policy-search.spec.ts". */
  readonly specPath: string;
  /** The test's title as Playwright reports it. */
  readonly testTitle: string;
}

export interface ResultUpdateContext {
  readonly now: Date;
  readonly testCase?: TestCase;
  readonly spec?: SpecRef;
  readonly automatedTestStorage?: string;
  readonly sharedRevisions: ReadonlyMap<number, number>;
}

/** Shared-step origin of a step: as given, else from the cached case's step with the same identifier. */
export const sharedStepIdResolver =
  (testCase: TestCase | undefined) =>
  (step: PublishStepResult): number | undefined =>
    step.sharedStepId ?? testCase?.steps.find((candidate) => candidate.stepIdentifier === step.stepIdentifier)?.sharedStepId;

/**
 * The PATCH _apis/test/Runs/{runId}/results item for one point: completed,
 * with the aggregated outcome, total duration, error, comment, revision, and
 * one iterationDetails entry per data row. Dates are laid out backwards from
 * `now` so iterations do not overlap.
 */
export const buildResultUpdate = (group: PointGroup, resultId: number | string, context: ResultUpdateContext): Record<string, unknown> => {
  const totalMs = group.iterations.reduce((sum, result) => sum + Math.max(0, result.durationMs), 0);
  const start = context.now.getTime() - totalMs;
  const sharedStepIdOf = sharedStepIdResolver(context.testCase);
  const iterationDetails = group.iterations.map((result, position) => {
    const offset = group.iterations.slice(0, position).reduce((sum, earlier) => sum + Math.max(0, earlier.durationMs), 0);
    const iterationId = iterationIdOf(result);
    const parameters = iterationParameters(context.testCase, result);
    const actionResults = buildActionResults(result.steps ?? [], iterationId, sharedStepIdOf, context.sharedRevisions);
    const error = resultErrorMessage([result]);
    const comment = describe(result);
    return {
      id: iterationId,
      outcome: result.outcome,
      durationInMs: Math.round(Math.max(0, result.durationMs)),
      startedDate: new Date(start + offset).toISOString(),
      completedDate: new Date(start + offset + Math.max(0, result.durationMs)).toISOString(),
      ...(error !== undefined ? { errorMessage: error } : {}),
      ...(comment.length > 0 ? { comment: cap(comment, COMMENT_LIMIT) } : {}),
      actionResults,
      ...(parameters.length > 0 ? { parameters } : {}),
    };
  });
  const revision = group.iterations.map((result) => result.testCaseRevision).find((value) => value !== undefined) ?? context.testCase?.revision;
  const errorMessage = resultErrorMessage(group.iterations);
  const comment = resultComment(group.iterations);
  return {
    id: resultId,
    state: 'Completed',
    outcome: worstOutcome(group.iterations.map((result) => result.outcome)),
    durationInMs: Math.round(totalMs),
    startedDate: new Date(start).toISOString(),
    completedDate: context.now.toISOString(),
    ...(errorMessage !== undefined ? { errorMessage } : {}),
    ...(comment !== undefined ? { comment } : {}),
    ...(revision !== undefined ? { testCaseRevision: revision } : {}),
    ...(context.spec !== undefined
      ? { automatedTestName: context.spec.testTitle, automatedTestStorage: context.automatedTestStorage ?? context.spec.specPath }
      : {}),
    iterationDetails,
  };
};

export interface RunCreateInput {
  readonly runName: string;
  readonly planId: number;
  readonly pointIds: readonly number[];
  readonly startedDate: string;
  readonly comment?: string;
  readonly buildId?: number;
}

/** POST _apis/test/runs body. With pointIds, ADO creates one pending result per point. */
export const buildRunCreate = (input: RunCreateInput): Record<string, unknown> => ({
  name: input.runName,
  plan: { id: String(input.planId) },
  pointIds: [...new Set(input.pointIds)].sort((a, b) => a - b),
  automated: true,
  state: 'InProgress',
  startedDate: input.startedDate,
  comment: input.comment ?? 'Published by tesseract-qa',
  ...(input.buildId !== undefined ? { build: { id: String(input.buildId) } } : {}),
});

/** PATCH _apis/test/runs/{runId} body. */
export const buildRunComplete = (completedDate: string): Record<string, unknown> => ({ state: 'Completed', completedDate });
