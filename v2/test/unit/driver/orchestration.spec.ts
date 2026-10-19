/**
 * The driver's control flow with the real runtime (so receipts are real)
 * and scripted handlers standing in for the page: budgets, bounded retries,
 * missing data, emission that rejects a step, decider failures, and the
 * Azure DevOps cache fallback. The browser path is covered by suite.spec.ts.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToolError } from '../../../src/core/errors.js';
import { readJsonl } from '../../../src/core/fsio.js';
import type { Facet, ResolvedStep, TestCase } from '../../../src/contract/schemas.js';
import type { ToolInput, ToolName, ToolOutput } from '../../../src/contract/tools.js';
import type { BrowserPool } from '../../../src/browser/types.js';
import { authorSuite, createHeuristicDecider, type Decider, type Decision } from '../../../src/driver/index.js';
import { createRuntime, type Runtime } from '../../../src/tools/runtime.js';
import type { ToolHandler, ToolHandlers } from '../../../src/tools/types.js';
import { loadWorkspace } from '../../../src/workspace/workspace.js';
import { snapshot, step } from './fixtures.js';

type Json = Record<string, unknown>;
type Calls = { tool: ToolName; input: Json }[];

const testCase = (steps: readonly [string, string][], extra: Partial<TestCase> = {}): TestCase => ({
  id: '20001',
  title: 'Search for a policy',
  revision: 1,
  contentHash: 'sha256:x',
  tags: [],
  steps: steps.map(([action, expected], i) => step(i + 1, action, expected)),
  parameters: ['policyNumber'],
  dataRows: [{ policyNumber: 'POL-001' }],
  ...extra,
});

const facet = (id: string): Facet => ({
  id,
  screen: id.split(':')[0]!,
  kind: 'element',
  displayName: id,
  aliases: [],
  locators: [{ strategy: 'role-name', role: 'button', name: 'x' }],
  status: 'candidate',
  provenance: { mintedAt: '2026-10-19T00:00:00.000Z', instrument: 'app.act' },
});

const notScripted = (tool: string): ToolHandler<ToolName> => async () => {
  throw new ToolError('unclassified', `${tool} is not scripted in this test`);
};

/** Handlers that behave like a policy-search page that never changes. */
const pageHandlers = (calls: Calls, overrides: Partial<{ [N in ToolName]: (input: ToolInput<N>, n: number) => Promise<ToolOutput<N>> }> = {}): ToolHandlers => {
  const count = new Map<string, number>();
  const wrap = <N extends ToolName>(name: N, fallback: (input: ToolInput<N>, n: number) => Promise<ToolOutput<N>>): ToolHandler<N> =>
    async (input) => {
      const n = (count.get(name) ?? 0) + 1;
      count.set(name, n);
      calls.push({ tool: name, input: input as unknown as Json });
      const override = overrides[name] as ((input: ToolInput<N>, n: number) => Promise<ToolOutput<N>>) | undefined;
      return (override ?? fallback)(input, n);
    };
  const base: ToolHandlers = {
    'app.open': wrap('app.open', async () => ({
      pageId: 'p-1',
      finalUrl: 'http://app.test/PolicyApp/PolicySearch',
      title: 'Policy Search',
      variant: 'reactive',
      hydration: { settled: true, elapsedMs: 1, reason: 'settled' },
      attached: false,
    })),
    'app.observe': wrap('app.observe', async (input) => ({ ...snapshot(), ...(input.scope !== undefined ? { scope: input.scope } : {}) })),
    'app.act': wrap('app.act', async () => ({
      outcome: 'succeeded' as const,
      resolved: { locator: { strategy: 'role-name' as const, role: 'button', name: 'Search' }, expression: "page.getByRole('button', { name: 'Search' })", verified: true, alternatives: [] },
      durationMs: 1,
    })),
    'app.assert': wrap('app.assert', async () => ({ passed: true, observed: true })),
    'memory.query': wrap('memory.query', async () => ({ facets: [], screenKnown: false })),
    'memory.mint': wrap('memory.mint', async (input) => ({ facet: facet(`${input.screen}:${input.facet.name ?? 'x'}`), created: true })),
    'memory.enrich': wrap('memory.enrich', async (input) => ({ facet: facet(input.facetId), changes: [] })),
    'memory.preflight': notScripted('memory.preflight') as ToolHandler<'memory.preflight'>,
    'test.emit': wrap('test.emit', async (input) => ({
      specPath: `tests/policy-search/${'id' in input.testCase ? input.testCase.id : 'x'}-search.spec.ts`,
      pageObjectPaths: [],
      flowPaths: [],
      facetsMinted: [],
      facetsUsed: [],
      diff: '',
      written: true,
      orphaned: [],
    })),
    'test.run': notScripted('test.run') as ToolHandler<'test.run'>,
    'ado.fetch': wrap('ado.fetch', async () => ({ testCases: [], source: 'ado' as const, warnings: [] })),
    'ado.publish': notScripted('ado.publish') as ToolHandler<'ado.publish'>,
    'handoff.raise': wrap('handoff.raise', async (input) => ({ handoffId: `h-${input.testCaseId}-${input.stepIndex}`, path: `.tesseract/handoffs/${input.testCaseId}-${input.stepIndex}.json` })),
    'review.record': notScripted('review.record') as ToolHandler<'review.record'>,
    'flow.record': notScripted('flow.record') as ToolHandler<'flow.record'>,
    'flow.run': notScripted('flow.run') as ToolHandler<'flow.run'>,
  };
  return base;
};

const fakePool = (): BrowserPool => ({
  open: async () => {
    throw new Error('no browser in this test');
  },
  navigate: async () => {
    throw new Error('no browser in this test');
  },
  get: () => {
    throw new ToolError('not-found', 'no pages');
  },
  list: () => [],
  close: async () => undefined,
  closeAll: async () => undefined,
});

let root: string;
let runtimes: Runtime[] = [];

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'tesseract-driver-flow-'));
  await mkdir(path.join(root, '.tesseract', 'profiles'), { recursive: true });
  await writeFile(path.join(root, '.tesseract', 'profiles', 'qa.json'), JSON.stringify({ name: 'qa', baseURL: 'http://app.test/PolicyApp/' }));
});

afterEach(async () => {
  for (const runtime of runtimes) await runtime.close();
  runtimes = [];
  await rm(root, { recursive: true, force: true });
});

const runtimeWith = async (handlers: ToolHandlers): Promise<Runtime> => {
  const workspace = await loadWorkspace(root, {});
  const runtime = createRuntime({ workspace, browser: fakePool(), handlers, env: {}, log: () => undefined });
  runtimes.push(runtime);
  return runtime;
};

const fetchOf = (tc: TestCase) => async () => ({ testCases: [tc], source: 'ado' as const, warnings: [] });

const emittedSteps = (calls: Calls): readonly ResolvedStep[] => {
  const emits = calls.filter((c) => c.tool === 'test.emit');
  return (emits[emits.length - 1]!.input.steps as ResolvedStep[]) ?? [];
};

/** A decider that answers from a script and records what it was asked. */
const scriptedDecider = (answers: readonly (Decision | Error)[]) => {
  const asked: { exclude: readonly string[]; attempt: number; purpose: string }[] = [];
  const decider: Decider = {
    name: 'scripted',
    decide: async (input) => {
      asked.push({ exclude: input.exclude, attempt: input.attempt, purpose: input.purpose });
      const answer = answers[asked.length - 1] ?? answers[answers.length - 1]!;
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  return { decider, asked };
};

describe('the driver’s control flow', () => {
  it('retries a failed action on another candidate, excluding the one that failed', async () => {
    const calls: Calls = [];
    const runtime = await runtimeWith(
      pageHandlers(calls, {
        'ado.fetch': fetchOf(testCase([['Click Search button', '']])),
        'app.act': async (_input, n) =>
          n === 1
            ? { outcome: 'failed', errorFamily: 'not-visible', message: 'hidden behind an overlay', durationMs: 1 }
            : { outcome: 'succeeded', resolved: { locator: { strategy: 'role-name', role: 'button', name: 'Search' }, expression: 'x', verified: true, alternatives: [] }, durationMs: 1 },
      }),
    );
    const { decider, asked } = scriptedDecider([
      { kind: 'act', ref: 'c6', verb: 'click', reason: 'first try' },
      { kind: 'act', ref: 'c5', verb: 'click', reason: 'second try' },
    ]);
    const summary = await authorSuite(runtime, { testCaseIds: ['20001'], profile: 'qa', decider });
    expect(summary.cases[0]!.outcome).toBe('authored');
    expect(asked.map((a) => [a.attempt, a.exclude])).toEqual([
      [1, []],
      [2, ['c6']],
    ]);
    expect(summary.cases[0]!.steps[0]).toMatchObject({ status: 'resolved', attempts: 2, via: 'observe' });
  });

  it('hands off after attemptsPerStep failed attempts, listing what was tried', async () => {
    const calls: Calls = [];
    const runtime = await runtimeWith(
      pageHandlers(calls, {
        'ado.fetch': fetchOf(testCase([['Click Search button', ''], ['Click Filter', '']])),
        'app.act': async () => ({ outcome: 'failed', errorFamily: 'not-found', message: 'gone', durationMs: 1 }),
      }),
    );
    const { decider } = scriptedDecider([
      { kind: 'act', ref: 'c5', verb: 'click', reason: 'a' },
      { kind: 'act', ref: 'c6', verb: 'click', reason: 'b' },
    ]);
    const summary = await authorSuite(runtime, { testCaseIds: ['20001'], profile: 'qa', decider, budgets: { attemptsPerStep: 2 } });
    const c = summary.cases[0]!;
    expect(c.outcome).toBe('partial');
    expect(c.steps[0]).toMatchObject({ status: 'handoff', blockage: 'not-found', attempts: 2 });
    const raised = calls.filter((x) => x.tool === 'handoff.raise');
    expect(raised).toHaveLength(1);
    expect((raised[0]!.input.attempted as string[]).length).toBe(2);
    // The action never happened, so the next step is blocked by the same handoff instead of acting on the wrong page.
    expect(c.steps[1]).toMatchObject({ status: 'handoff', handoffId: c.steps[0]!.handoffId });
    expect(emittedSteps(calls).map((s) => s.handoffId)).toEqual(['h-20001-1', 'h-20001-1']);
  });

  it('hands off the current step when the wall-clock budget runs out, and blocks the rest', async () => {
    const calls: Calls = [];
    const runtime = await runtimeWith(
      pageHandlers(calls, {
        'ado.fetch': fetchOf(testCase([['Click Search button', ''], ['Click Filter', '']])),
        'app.observe': async () => {
          await new Promise((r) => setTimeout(r, 60));
          return snapshot();
        },
      }),
    );
    const summary = await authorSuite(runtime, { testCaseIds: ['20001'], profile: 'qa', budgets: { wallClockMsPerCase: 30 } });
    const c = summary.cases[0]!;
    expect(c.steps[0]).toMatchObject({ status: 'handoff', blockage: 'other' });
    expect(c.steps[0]!.reason).toMatch(/wall-clock budget exhausted/);
    expect(c.steps[1]).toMatchObject({ status: 'handoff', handoffId: c.steps[0]!.handoffId });
    expect(calls.filter((x) => x.tool === 'app.act')).toHaveLength(0);
    expect(c.specPath).toBeDefined();
  });

  it('hands off the step that crosses the token budget', async () => {
    const calls: Calls = [];
    const runtime = await runtimeWith(pageHandlers(calls, { 'ado.fetch': fetchOf(testCase([['Click Search button', ''], ['Click Filter', '']])) }));
    const host = { model: 'claude-test', promptFingerprint: 'sha256:p', tokens: { prompt: 500, completion: 100 } };
    const { decider } = scriptedDecider([
      { kind: 'act', ref: 'c5', verb: 'click', reason: 'Search', host },
      { kind: 'act', ref: 'c6', verb: 'click', reason: 'Filter', host },
    ]);
    const summary = await authorSuite(runtime, { testCaseIds: ['20001'], profile: 'qa', decider, budgets: { tokensPerCase: 1000 } });
    const c = summary.cases[0]!;
    expect(c.steps[0]!.status).toBe('resolved');
    expect(c.steps[1]).toMatchObject({ status: 'handoff', blockage: 'other' });
    expect(c.steps[1]!.reason).toMatch(/tokens budget exhausted/);
    expect(c.tokens).toEqual({ prompt: 1000, completion: 200 });
    // The receipt of the act carries the host's usage once; the mint after it does not repeat it.
    const receipts = await readJsonl<Json>(path.join(root, '.tesseract', 'receipts', 'authoring.jsonl'));
    expect(receipts.filter((r) => r.tool === 'app.act' && (r.host as Json | undefined)?.model === 'claude-test')).toHaveLength(1);
    expect(receipts.filter((r) => r.tool === 'memory.mint' && r.host !== undefined)).toHaveLength(0);
  });

  it('asks for test data instead of inventing it', async () => {
    const calls: Calls = [];
    const runtime = await runtimeWith(
      pageHandlers(calls, { 'ado.fetch': fetchOf(testCase([['Enter @policyNumber in search field', ''], ['Click Search button', '']], { dataRows: [] })) }),
    );
    const summary = await authorSuite(runtime, { testCaseIds: ['20001'], profile: 'qa' });
    const c = summary.cases[0]!;
    expect(c.steps[0]).toMatchObject({ status: 'handoff', blockage: 'missing-data' });
    expect(calls.filter((x) => x.tool === 'app.observe')).toHaveLength(0);
    expect(c.steps[1]!.handoffId).toBe(c.steps[0]!.handoffId);
  });

  it('turns a step emission rejects into an "unsupported" handoff and emits again', async () => {
    const calls: Calls = [];
    const runtime = await runtimeWith(
      pageHandlers(calls, {
        'ado.fetch': fetchOf(testCase([['Click Search button', ''], ['Click Filter', '']])),
        'test.emit': async (input, n) => {
          if (n === 1) throw new ToolError('invalid-input', 'step 2: facet policy-search:filter is a <div> with role generic; select needs a native <select>', { step: 2 });
          return { specPath: 'tests/x.spec.ts', pageObjectPaths: [], flowPaths: [], facetsMinted: [], facetsUsed: [], diff: '', written: true, orphaned: [], ...(input.steps.length > 0 ? {} : {}) };
        },
      }),
    );
    const summary = await authorSuite(runtime, { testCaseIds: ['20001'], profile: 'qa' });
    const c = summary.cases[0]!;
    expect(c.outcome).toBe('partial');
    expect(c.stepsResolved).toBe(1);
    expect(c.steps[1]).toMatchObject({ status: 'handoff', blockage: 'unsupported' });
    expect(calls.filter((x) => x.tool === 'test.emit')).toHaveLength(2);
    expect(emittedSteps(calls)[1]!.handoffId).toBe('h-20001-2');
    expect(c.handoffs.map((h) => h.blockage)).toEqual(['unsupported']);
  });

  it('turns a decider failure into a handoff, but stops the suite when the decider is not configured', async () => {
    const calls: Calls = [];
    const runtime = await runtimeWith(pageHandlers(calls, { 'ado.fetch': fetchOf(testCase([['Click Search button', '']])) }));
    const broken = scriptedDecider([new Error('socket hang up')]);
    const summary = await authorSuite(runtime, { testCaseIds: ['20001'], profile: 'qa', decider: broken.decider });
    expect(summary.cases[0]!.steps[0]).toMatchObject({ status: 'handoff', blockage: 'other' });
    expect(summary.cases[0]!.steps[0]!.reason).toMatch(/the decider failed: socket hang up/);

    const unconfigured = scriptedDecider([new ToolError('not-configured', 'no key')]);
    await expect(authorSuite(runtime, { testCaseIds: ['20001'], profile: 'qa', decider: unconfigured.decider })).rejects.toMatchObject({ family: 'not-configured' });
  });

  it('falls back to cached cases when Azure DevOps is not reachable, and reports it', async () => {
    const calls: Calls = [];
    const runtime = await runtimeWith(
      pageHandlers(calls, {
        'ado.fetch': async (input) => {
          if (input.refresh === true) throw new ToolError('not-configured', 'set AZURE_DEVOPS_PAT');
          return { testCases: [testCase([['Click Search button', '']])], source: 'cache', warnings: [] };
        },
      }),
    );
    const summary = await authorSuite(runtime, { testCaseIds: ['20001'], profile: 'qa' });
    expect(summary.warnings.join('\n')).toMatch(/using cached cases/);
    expect(summary.cases[0]!.outcome).toBe('authored');
    expect(calls.filter((x) => x.tool === 'ado.fetch').map((x) => x.input.refresh)).toEqual([true, false]);
  });

  it('does not publish when nothing was emitted, and rejects an empty selection', async () => {
    const calls: Calls = [];
    const runtime = await runtimeWith(pageHandlers(calls, { 'ado.fetch': async () => ({ testCases: [], source: 'ado', warnings: ['no test cases in suite 8'] }) }));
    const summary = await authorSuite(runtime, { planId: 7, suiteId: 8, profile: 'qa', publish: { planId: 7, suiteId: 8, runName: 'nightly' } });
    expect(summary.cases).toEqual([]);
    expect(summary.publish).toEqual({ error: 'not published: no spec was emitted' });
    expect(summary.warnings).toContain('no test cases in suite 8');
    await expect(authorSuite(runtime, { profile: 'qa' })).rejects.toMatchObject({ family: 'invalid-input' });
  });

  it('starts each case on a fresh page and stamps every call with the case and step it serves', async () => {
    const calls: Calls = [];
    const runtime = await runtimeWith(pageHandlers(calls, { 'ado.fetch': fetchOf(testCase([['Click Search button', '']])) }));
    await authorSuite(runtime, { testCaseIds: ['20001'], profile: 'qa', startUrl: 'Dashboard', decider: createHeuristicDecider() });
    expect(calls[1]).toMatchObject({ tool: 'app.open', input: { profile: 'qa', url: 'Dashboard' } });
    const receipts = await readJsonl<Json>(path.join(root, '.tesseract', 'receipts', 'authoring.jsonl'));
    const stepCalls = receipts.filter((r) => r.tool === 'app.observe' || r.tool === 'app.act' || r.tool === 'memory.mint' || r.tool === 'memory.query');
    expect(stepCalls.length).toBeGreaterThanOrEqual(4);
    expect(stepCalls.every((r) => r.testCase === '20001' && r.step === 1)).toBe(true);
  });
});
