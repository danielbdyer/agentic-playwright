/**
 * The batch driver (vision §5.11): ado.fetch → for each case, app.open and
 * author every step (case.ts) → test.emit → after the suite, one test.run
 * over the emitted specs → ado.publish from that run. Every call goes
 * through runtime.invoke, so the receipts are the same an interactive host
 * leaves. A case that fails is reported and left for the next run, which
 * authors it again from scratch.
 */
import { ToolError } from '../core/errors.js';
import type { ResolvedStep, RunReceipt, TestCase } from '../contract/schemas.js';
import type { Runtime } from '../tools/runtime.js';
import { loadProfile, type Profile } from '../workspace/profiles.js';
import { BUDGETED_TOOLS, BudgetExhausted, createCaller, type Caller } from './calls.js';
import { authorSteps, type AuthoredCase, type CaseEnv } from './case.js';
import { createHeuristicDecider } from './heuristic.js';
import {
  DEFAULT_BUDGETS,
  type AuthorSuiteOptions,
  type Budgets,
  type CaseRun,
  type CaseSummary,
  type HandoffSummary,
  type StepSummary,
  type SuiteSummary,
} from './types.js';

const DEFAULT_MEMORY_THRESHOLD = 0.6;
const DEFAULT_MIN_ASSERTION_CONFIDENCE = 0.5;

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const familyOf = (error: unknown): string => (error instanceof ToolError ? error.family : error instanceof BudgetExhausted ? 'timeout' : 'unclassified');

/** The step a test.emit failure names, from its detail or its message ("step 3: …"). */
const failingStep = (detail: Readonly<Record<string, unknown>> | undefined, message: string): number | null => {
  const fromDetail = detail?.step;
  if (typeof fromDetail === 'number' && Number.isInteger(fromDetail)) return fromDetail;
  const match = /\bstep (\d+)\b/i.exec(message);
  return match === null ? null : Number(match[1]);
};

interface Emitted {
  readonly specPath: string;
  readonly facetsUsed: readonly string[];
  readonly facetsMinted: readonly string[];
  readonly steps: readonly ResolvedStep[];
  readonly extraHandoffs: readonly HandoffSummary[];
}

/**
 * Emit the case. When emission rejects one step (a select on a control it
 * cannot drive, a facet without a locator), that step becomes an
 * "unsupported" handoff and emission runs again, so one bad step never
 * costs the whole case.
 */
const emitCase = async (
  call: Caller,
  testCase: TestCase,
  initial: readonly ResolvedStep[],
  flows: readonly { readonly name: string }[],
  commentOnAdo: boolean | undefined,
  deciderName: string,
  log: (message: string) => void,
): Promise<Emitted> => {
  let steps = [...initial];
  const extraHandoffs: HandoffSummary[] = [];
  for (let round = 0; round <= initial.length; round += 1) {
    const emitted = await call('test.emit', {
      testCase,
      steps,
      ...(flows.length > 0 ? { flows: flows.map((f) => ({ name: f.name })) } : {}),
      decision: { testCase: testCase.id, reason: `batch-authored by the ${deciderName} decider` },
    });
    if (emitted.ok) {
      return { specPath: emitted.output.specPath, facetsUsed: emitted.output.facetsUsed, facetsMinted: emitted.output.facetsMinted, steps, extraHandoffs };
    }
    const index = failingStep(emitted.detail, emitted.message);
    const step = index === null ? undefined : testCase.steps.find((s) => s.index === index);
    const current = steps.find((s) => s.index === index);
    if ((emitted.family !== 'invalid-input' && emitted.family !== 'not-found') || step === undefined || current === undefined || current.handoffId !== undefined) {
      throw new ToolError(emitted.family, `test.emit failed: ${emitted.message}`, emitted.detail as Record<string, unknown> | undefined);
    }
    log(`  emission rejected step ${step.index} (${emitted.family}): ${emitted.message}; handing it off`);
    const raised = await call('handoff.raise', {
      testCaseId: testCase.id,
      stepIndex: step.index,
      stepIdentifier: step.stepIdentifier,
      blockage: 'unsupported',
      unresolvedIntent: `${step.action} — the step was resolved on the page, but cannot be emitted: ${emitted.message}`.slice(0, 500),
      attempted: [`test.emit: ${emitted.family}: ${emitted.message}`.slice(0, 300)],
      evidence: {},
      candidates: [],
      nextMoves: ['Author this step by hand inside a tesseract:keep region, or reword it in ADO'],
      ...(commentOnAdo !== undefined ? { commentOnAdo } : {}),
      decision: { testCase: testCase.id, step: step.index, reason: 'emission rejected the resolved step' },
    });
    if (!raised.ok) throw new ToolError(raised.family, `could not raise a handoff for step ${step.index}: ${raised.message}`);
    extraHandoffs.push({ handoffId: raised.output.handoffId, stepIndex: step.index, blockage: 'unsupported', reason: emitted.message });
    steps = steps.map((s) =>
      s.index === step.index
        ? { index: s.index, stepIdentifier: s.stepIdentifier, actionText: s.actionText, expectedText: s.expectedText, verb: s.verb, handoffId: raised.output.handoffId }
        : s,
    );
  }
  throw new ToolError('unclassified', 'test.emit kept rejecting steps');
};

interface SuiteEnv {
  readonly runtime: Runtime;
  readonly options: AuthorSuiteOptions;
  readonly budgets: Budgets;
  readonly profile: Profile | null;
  readonly deciderName: string;
  readonly log: (message: string) => void;
}

const failedCase = (testCase: TestCase, started: number, error: { family: string; message: string }, partial?: AuthoredCase): CaseSummary => ({
  testCaseId: testCase.id,
  title: testCase.title,
  revision: testCase.revision,
  outcome: 'failed',
  stepsTotal: testCase.steps.length,
  stepsResolved: partial?.summaries.filter((s) => s.status === 'resolved').length ?? 0,
  steps: partial?.summaries ?? [],
  handoffs: partial?.handoffs ?? [],
  facetsMinted: partial?.minted ?? [],
  facetsUsed: [],
  tokens: partial?.tokens ?? { prompt: 0, completion: 0 },
  durationMs: Date.now() - started,
  error,
});

const authorOne = async (suite: SuiteEnv, testCase: TestCase): Promise<CaseSummary> => {
  const { runtime, options, budgets, profile, log } = suite;
  const started = Date.now();
  const deadline = started + budgets.wallClockMsPerCase;
  const call = createCaller(runtime, (name) => {
    if (BUDGETED_TOOLS.has(name) && Date.now() > deadline) {
      throw new BudgetExhausted('wall-clock', `the case ran past its ${Math.round(budgets.wallClockMsPerCase / 1000)}s wall-clock budget`);
    }
  });
  log(`authoring ${testCase.id} "${testCase.title}" (${testCase.steps.length} steps, rev ${testCase.revision})`);
  if (testCase.steps.length === 0) {
    return failedCase(testCase, started, { family: 'invalid-input', message: 'the test case has no steps' });
  }

  const useFlow = profile?.storageStatePath === undefined && profile?.loginFlow !== undefined;
  const opened = await call('app.open', {
    ...(options.profile !== undefined ? { profile: options.profile } : {}),
    ...(options.startUrl !== undefined ? { url: options.startUrl } : {}),
    ...(useFlow ? { auth: 'flow' as const } : {}),
    decision: { testCase: testCase.id, reason: 'start the case on a fresh page' },
  });
  if (!opened.ok) return failedCase(testCase, started, { family: opened.family, message: `app.open failed: ${opened.message}` });

  const pageId = opened.output.pageId;
  const env: CaseEnv = {
    call,
    decider: options.decider ?? createHeuristicDecider(),
    budgets,
    profile,
    memoryThreshold: options.memoryThreshold ?? DEFAULT_MEMORY_THRESHOLD,
    minAssertionConfidence: options.minAssertionConfidence ?? DEFAULT_MIN_ASSERTION_CONFIDENCE,
    ...(options.commentOnAdo !== undefined ? { commentOnAdo: options.commentOnAdo } : {}),
    log,
    closePage: async (id) => runtime.ctx.browser.close(id),
  };

  let authored: AuthoredCase | undefined;
  try {
    authored = await authorSteps(env, testCase, pageId, opened.output.finalUrl);
    const flows = useFlow && profile?.loginFlow !== undefined ? [{ name: profile.loginFlow }] : [];
    const emitted = await emitCase(call, testCase, authored.steps, flows, options.commentOnAdo, suite.deciderName, log);
    const handoffs = [...authored.handoffs, ...emitted.extraHandoffs];
    const rejected = new Set(emitted.extraHandoffs.map((h) => h.stepIndex));
    const steps: readonly StepSummary[] = authored.summaries.map((s) => {
      const extra = emitted.extraHandoffs.find((h) => h.stepIndex === s.index);
      return extra === undefined ? s : { ...s, status: 'handoff', handoffId: extra.handoffId, blockage: extra.blockage, reason: extra.reason, facets: [] };
    });
    const resolvedCount = steps.filter((s) => s.status === 'resolved' && !rejected.has(s.index)).length;
    log(`  emitted ${emitted.specPath}: ${resolvedCount}/${testCase.steps.length} steps resolved, ${handoffs.length} handoff${handoffs.length === 1 ? '' : 's'}`);
    return {
      testCaseId: testCase.id,
      title: testCase.title,
      revision: testCase.revision,
      outcome: handoffs.length === 0 ? 'authored' : 'partial',
      stepsTotal: testCase.steps.length,
      stepsResolved: resolvedCount,
      steps,
      handoffs,
      specPath: emitted.specPath,
      facetsMinted: [...new Set([...authored.minted, ...emitted.facetsMinted])],
      facetsUsed: emitted.facetsUsed,
      tokens: authored.tokens,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    if (error instanceof ToolError && error.family === 'not-configured') throw error;
    log(`  ${testCase.id} failed: ${errorText(error)}`);
    return failedCase(testCase, started, { family: familyOf(error), message: errorText(error) }, authored);
  } finally {
    await env.closePage(pageId).catch(() => undefined);
  }
};

const runOf = (receipts: readonly RunReceipt[], runId: string, testCaseId: string, specPath: string | undefined): CaseRun | undefined => {
  const mine = receipts.filter((r) => r.testCase === testCaseId || (specPath !== undefined && r.spec === specPath));
  if (mine.length === 0) return undefined;
  const rank = (outcome: RunReceipt['outcome']): number => ['passed', 'skipped', 'flaky', 'interrupted', 'timedOut', 'failed'].indexOf(outcome);
  const worst = [...mine].sort((a, b) => rank(b.outcome) - rank(a.outcome))[0]!;
  return {
    runId,
    outcome: worst.outcome,
    durationMs: mine.reduce((sum, r) => sum + r.durationMs, 0),
    ...(worst.error !== undefined ? { error: worst.error.message } : {}),
  };
};

/**
 * Author a suite. Selection is by test case ids or by plan and suite; the
 * decider defaults to the heuristic (no model). Throws only when nothing can
 * be authored at all (no profile, Azure DevOps unreachable with nothing
 * cached, a decider that is not configured).
 */
export const authorSuite = async (
  runtime: Runtime,
  options: AuthorSuiteOptions,
  log: (message: string) => void = runtime.ctx.log,
): Promise<SuiteSummary> => {
  const started = Date.now();
  const ids = options.testCaseIds ?? [];
  if (ids.length === 0 && options.planId === undefined) {
    throw new ToolError('invalid-input', 'give testCaseIds, or planId (and suiteId)');
  }
  const budgets: Budgets = { ...DEFAULT_BUDGETS, ...(options.budgets ?? {}) };
  if (!Number.isInteger(budgets.attemptsPerStep) || budgets.attemptsPerStep < 1) {
    throw new ToolError('invalid-input', `attemptsPerStep must be a positive integer, got ${budgets.attemptsPerStep}`);
  }
  const decider = options.decider ?? createHeuristicDecider();
  const profile = await loadProfile(runtime.ctx.workspace, options.profile, runtime.ctx.env);
  const warnings: string[] = [];
  const call = createCaller(runtime);

  const selector = {
    ...(ids.length > 0 ? { ids: [...ids] } : {}),
    ...(options.planId !== undefined ? { planId: options.planId } : {}),
    ...(options.suiteId !== undefined ? { suiteId: options.suiteId } : {}),
  };
  let fetched = await call('ado.fetch', { ...selector, refresh: options.refresh ?? true });
  if (!fetched.ok && options.refresh !== true && (fetched.family === 'not-configured' || fetched.family === 'unavailable' || fetched.family === 'rate-limited')) {
    warnings.push(`ado.fetch could not refresh (${fetched.family}: ${fetched.message}); using cached cases`);
    fetched = await call('ado.fetch', { ...selector, refresh: false });
  }
  if (!fetched.ok) throw new ToolError(fetched.family, `ado.fetch failed: ${fetched.message}`);
  warnings.push(...fetched.output.warnings);
  const order = (tc: TestCase): number => (ids.indexOf(tc.id) < 0 ? Number.MAX_SAFE_INTEGER : ids.indexOf(tc.id));
  const cases = [...fetched.output.testCases].sort((a, b) => order(a) - order(b));
  log(`authoring ${cases.length} case${cases.length === 1 ? '' : 's'} with the ${decider.name} decider`);

  const suite: SuiteEnv = { runtime, options: { ...options, decider }, budgets, profile, deciderName: decider.name, log };
  const summaries: CaseSummary[] = [];
  for (const testCase of cases) {
    summaries.push(await authorOne(suite, testCase));
  }

  const specs = summaries.flatMap((s) => (s.specPath !== undefined ? [s.specPath] : []));
  const wantRun = options.run === true || options.publish !== undefined;
  let run: SuiteSummary['run'];
  let publish: SuiteSummary['publish'];
  let cased: readonly CaseSummary[] = summaries;
  if (wantRun && specs.length > 0) {
    log(`running ${specs.length} spec${specs.length === 1 ? '' : 's'}`);
    const ran = await call('test.run', { specPaths: [...new Set(specs)], ...(options.profile !== undefined ? { profile: options.profile } : {}) });
    if (ran.ok) {
      run = { runId: ran.output.runId, ...ran.output.summary };
      cased = summaries.map((s) => {
        const outcome = runOf(ran.output.receipts, ran.output.runId, s.testCaseId, s.specPath);
        return outcome === undefined ? s : { ...s, run: outcome };
      });
      if (options.publish !== undefined) {
        const published = await call('ado.publish', { ...options.publish, fromRunId: ran.output.runId });
        publish = published.ok
          ? { runId: published.output.runId, url: published.output.url, alreadyPublished: published.output.alreadyPublished }
          : { error: `${published.family}: ${published.message}` };
      }
    } else {
      run = { error: `${ran.family}: ${ran.message}` };
      if (options.publish !== undefined) publish = { error: 'not published: the run failed' };
    }
  } else if (options.publish !== undefined) {
    publish = { error: 'not published: no spec was emitted' };
  }

  return {
    decider: decider.name,
    cases: cased,
    ...(run !== undefined ? { run } : {}),
    ...(publish !== undefined ? { publish } : {}),
    warnings,
    durationMs: Date.now() - started,
  };
};
