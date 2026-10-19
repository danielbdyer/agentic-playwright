/**
 * test.run's engine: run specs with the customer's Playwright, read the
 * JSON report, write one run receipt per test, and feed the outcomes back to
 * memory (passes count toward promotion, a drifted locator counts against
 * its facet's health).
 */
import { promises as fs, rmSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ToolError } from '../core/errors.js';
import { appendJsonl, exists, readJson, readJsonl, readText, relativePosix } from '../core/fsio.js';
import { newId } from '../core/hash.js';
import { RunReceiptSchema, type Facet, type RunReceipt, type TestCase } from '../contract/schemas.js';
import { loadCases } from '../ado/cache.js';
import { facetsByIds, recordTestRuns, type TestRunInput } from '../memory/index.js';
import type { Profile } from '../workspace/profiles.js';
import { resolveInside, type Workspace } from '../workspace/workspace.js';
import { latestEmitBySpec, readEmitRecords, type EmitRecord } from './emit-records.js';
import { fileFilter, findCustomerConfig, specsUnder, resolvePlaywrightCli, startPlaywright, stopPlaywright, writeMinimalConfig, type ChildRun } from './playwright.js';
import { cleanupRepair, prepareRepair, type RepairPlan } from './repair.js';
import { facetIdsOf, gateReceipt, receiptFor, summarize, type ReceiptContext, type RunSummary } from './receipts.js';
import { parseProgress, parseReport, type TestOutcome } from './report.js';

export const DEFAULT_RUN_TIMEOUT_MS = 10 * 60 * 1000;
/** How long releasePausedRuns waits for a released run to exit before killing it. */
export const RELEASE_GRACE_MS = 10_000;

export interface RunSpecsOptions {
  /**
   * The runtime (MCP session) starting the run; default DEFAULT_RUN_OWNER.
   * A run belongs to its owner: runSpecs releases only the owner's paused
   * runs before it starts, and stopRuns(owner) stops only the owner's runs.
   */
  readonly owner?: string;
  /** Workspace-relative (or absolute, inside the workspace) spec paths; default every *.spec.ts under the tests directory. */
  readonly specPaths?: readonly string[];
  readonly grep?: string;
  /** The profile the run is for (TESSERACT_PROFILE / TESSERACT_BASE_URL); null for none. */
  readonly profile?: Profile | null;
  /** Name to export as TESSERACT_PROFILE (a profile file's name; omitted for a TESSERACT_BASE_URL-only profile). */
  readonly profileName?: string;
  /** Environment the run inherits (TESSERACT_PARAM_* and the rest). Default process.env. */
  readonly env?: NodeJS.ProcessEnv;
  readonly headed?: boolean;
  readonly retries?: number;
  /** Wall-clock budget for the whole run. Default 10 minutes. */
  readonly timeoutMs?: number;
  /** Hold the browser open at the first failure for repair in place. */
  readonly pauseOnFailure?: boolean;
  /** Default true: record outcomes as facet evidence. */
  readonly updateMemory?: boolean;
  readonly now?: () => Date;
  readonly log?: (message: string) => void;
}

export interface PausedRun {
  readonly repairId: string;
  readonly cdpEndpoint: string;
  readonly url?: string;
  readonly failingStep?: string;
}

export interface RunSpecsResult {
  readonly runId: string;
  readonly receipts: readonly RunReceipt[];
  readonly summary: RunSummary;
  /** Workspace-relative path of the JSON report (absent for a paused run, whose report is not written yet). */
  readonly reportPath?: string;
  readonly paused?: PausedRun;
  readonly promoted: readonly string[];
  readonly staled: readonly string[];
  /** What the run did not do as asked (e.g. retries with pauseOnFailure); also logged. */
  readonly warnings?: readonly string[];
}

// ─── Runs in flight and paused ─────────────────────────────────────────────

/** The owner of runs started without one (a single-runtime process: the stdio server, the CLI). */
export const DEFAULT_RUN_OWNER = 'default';

/**
 * running: runSpecs is waiting on it; paused: held open for repair in place
 * after runSpecs returned; stopping: being released or stopped (it stays
 * tracked, for the exit hook, until it exits).
 */
type RunState = 'running' | 'paused' | 'stopping';

interface TrackedRun {
  readonly runId: string;
  readonly owner: string;
  readonly run: ChildRun;
  readonly plan: RepairPlan | null;
  readonly state: RunState;
}

/** Every Playwright child this process started and has not seen exit, by runId. */
const tracked = new Map<string, TrackedRun>();
/** Runs stopRuns ended while runSpecs was waiting on them: runSpecs reports them as stopped. */
const stoppedRuns = new Set<string>();

const setState = (runId: string, state: RunState): void => {
  const entry = tracked.get(runId);
  if (entry !== undefined) tracked.set(runId, { ...entry, state });
};

const ownedBy = (owner: string | undefined) => (entry: TrackedRun): boolean => owner === undefined || entry.owner === owner;

/** Last resort: when the process exits with runs still tracked, kill their process groups (browsers included) and drop their repair files. */
const onProcessExit = (): void => {
  for (const entry of tracked.values()) {
    entry.run.killGroup('SIGKILL');
    if (entry.plan !== null) {
      for (const target of [entry.plan.dir, entry.plan.repairFile, entry.plan.resumeFile]) {
        try {
          rmSync(target, { recursive: true, force: true });
        } catch {
          // best effort while exiting
        }
      }
    }
  }
};

let exitHookInstalled = false;

const track = (entry: TrackedRun): void => {
  if (!exitHookInstalled) {
    exitHookInstalled = true;
    process.on('exit', onProcessExit);
  }
  tracked.set(entry.runId, entry);
  void entry.run.exited.then(() => {
    const current = tracked.get(entry.runId);
    if (current?.run !== entry.run) return;
    tracked.delete(entry.runId);
    // A paused run that ends on its own (its hold expired) leaves nobody to clean up after it.
    if (current.state === 'paused' && current.plan !== null) void cleanupRepair(current.plan).catch(() => undefined);
  });
};

const release = async (entry: TrackedRun): Promise<void> => {
  if (entry.plan !== null) {
    try {
      await fs.mkdir(path.dirname(entry.plan.resumeFile), { recursive: true });
      await fs.writeFile(entry.plan.resumeFile, new Date().toISOString());
    } catch {
      // the kill below still ends it
    }
  }
  const timer = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), RELEASE_GRACE_MS).unref());
  if ((await Promise.race([entry.run.exited, timer])) === 'timeout') await stopPlaywright(entry.run);
  if (entry.plan !== null) await cleanupRepair(entry.plan).catch(() => undefined);
};

/**
 * Let paused runs go on: write each one's resume file, wait for it to exit
 * (killing it after 10 s). With an owner, only that owner's paused runs;
 * without one, every paused run. runSpecs does this for its own owner first.
 */
export const releasePausedRuns = async (owner?: string): Promise<void> => {
  const entries = [...tracked.values()].filter((entry) => entry.state === 'paused' && ownedBy(owner)(entry));
  entries.forEach((entry) => setState(entry.runId, 'stopping'));
  await Promise.all(entries.map(release));
};

/**
 * Shutdown: stop an owner's runs (every owner's without one). Paused runs are
 * released as above; runs still executing are killed with their process
 * group (browsers included), their repair files removed, and the runSpecs
 * call waiting on them fails with `unavailable`. A runtime's close hook calls
 * this with its own owner.
 */
export const stopRuns = async (owner?: string): Promise<void> => {
  const running = [...tracked.values()].filter((entry) => entry.state === 'running' && ownedBy(owner)(entry));
  running.forEach((entry) => {
    stoppedRuns.add(entry.runId);
    setState(entry.runId, 'stopping');
  });
  await Promise.all([
    releasePausedRuns(owner),
    ...running.map(async (entry) => {
      await stopPlaywright(entry.run);
      if (entry.plan !== null) await cleanupRepair(entry.plan).catch(() => undefined);
    }),
  ]);
};

/** Repair ids of runs currently paused (one owner's, or all; for diagnostics and tests). */
export const pausedRunIds = (owner?: string): readonly string[] =>
  [...tracked.values()].filter((entry) => entry.state === 'paused' && ownedBy(owner)(entry)).flatMap((entry) => (entry.plan !== null ? [entry.plan.repairId] : []));

/** Runs this process started that have not exited (one owner's, or all; for diagnostics and tests). */
export const activeRuns = (owner?: string): readonly { readonly runId: string; readonly owner: string; readonly state: RunState; readonly pid?: number }[] =>
  [...tracked.values()]
    .filter(ownedBy(owner))
    .map((entry) => ({ runId: entry.runId, owner: entry.owner, state: entry.state, ...(entry.run.child.pid !== undefined ? { pid: entry.run.child.pid } : {}) }));

/** Run directories (reports, traces) older than this are removed when a new run starts. */
export const RUN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Remove .tesseract/tmp/run-* directories older than RUN_RETENTION_MS (by modification time). */
export const pruneRunDirs = async (workspace: Workspace, now: Date): Promise<readonly string[]> => {
  const entries = await fs.readdir(workspace.paths.tmp, { withFileTypes: true }).catch(() => []);
  const old = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && /^run-\d{14}-[0-9a-f]{8}$/.test(entry.name))
      .map(async (entry) => {
        const full = path.join(workspace.paths.tmp, entry.name);
        const stat = await fs.stat(full).catch(() => null);
        return stat !== null && now.getTime() - stat.mtimeMs > RUN_RETENTION_MS ? [full] : [];
      }),
  );
  const doomed = old.flat();
  await Promise.all(doomed.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  return doomed;
};

// ─── Spec selection ────────────────────────────────────────────────────────

const walkSpecs = async (dir: string): Promise<readonly string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return [];
    throw error;
  });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : walkSpecs(full);
      return entry.isFile() && entry.name.endsWith('.spec.ts') ? [full] : [];
    }),
  );
  return nested.flat().sort();
};

const SPEC_FILE = /\.(spec|test)\.(m|c)?[jt]sx?$/;

/** Absolute spec paths: the requested ones (inside the workspace, existing) or every *.spec.ts under tests/. */
export const selectSpecs = async (workspace: Workspace, requested: readonly string[] | undefined): Promise<readonly string[]> => {
  if (requested !== undefined && requested.length > 0) {
    const resolved = requested.map((spec) => resolveInside(workspace, spec));
    for (const [i, file] of resolved.entries()) {
      if (!SPEC_FILE.test(file)) throw new ToolError('invalid-input', `${requested[i]} is not a spec file (*.spec.ts)`);
      if (!(await exists(file))) throw new ToolError('not-found', `spec not found: ${requested[i]}`, { spec: requested[i] });
    }
    return [...new Set(resolved)];
  }
  const all = await walkSpecs(workspace.paths.tests);
  if (all.length === 0) {
    throw new ToolError('not-found', `no specs under ${relativePosix(workspace.paths.root, workspace.paths.tests) || '.'}/; emit one with test.emit first`);
  }
  return all;
};

// ─── Running ───────────────────────────────────────────────────────────────

const RepairRecordSchema = z.object({
  repairId: z.string(),
  cdpEndpoint: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
  error: z.string().optional(),
  failingStep: z.string().optional(),
  failingStepIndex: z.number().int().optional(),
  stepTitles: z.array(z.string()).optional(),
  file: z.string(),
  titlePath: z.array(z.string()).optional(),
  annotations: z.array(z.object({ type: z.string(), description: z.string().optional() })).optional(),
  durationMs: z.number().optional(),
});

type RepairRecord = z.infer<typeof RepairRecordSchema>;

/** The paused test as an outcome: the steps before the failing one ran, the failing one failed. */
const pausedOutcome = (record: RepairRecord): TestOutcome => {
  const titles = record.stepTitles ?? [];
  const failing = record.failingStepIndex ?? -1;
  const steps = failing >= 0 ? titles.slice(0, failing + 1).map((title, i) => ({ title, durationMs: 0, ...(i === failing && record.error !== undefined ? { error: record.error } : {}) })) : [];
  return {
    file: record.file,
    titlePath: record.titlePath ?? [],
    annotations: record.annotations ?? [],
    status: 'unexpected',
    lastStatus: 'failed',
    durationMs: record.durationMs ?? 0,
    retries: 0,
    ...(record.error !== undefined ? { error: record.error } : {}),
    steps,
  };
};

type Waited = { readonly kind: 'exited' } | { readonly kind: 'paused' } | { readonly kind: 'timeout' };

const waitForRun = async (run: ChildRun, deadline: number, repairFile: string | null): Promise<Waited> => {
  for (;;) {
    if (run.done()) return { kind: 'exited' };
    if (repairFile !== null && (await exists(repairFile))) return { kind: 'paused' };
    if (Date.now() >= deadline) return { kind: 'timeout' };
    await Promise.race([run.exited, new Promise((resolve) => setTimeout(resolve, 200))]);
  }
};

/** Tesseract's own variables: the run takes these from the caller's environment only, never from the process's. */
const TESSERACT_VARIABLE = /^TESSERACT_(PARAM_|PROFILE$|BASE_URL$)/;

/**
 * The run's environment: the process's (PATH, browsers, …) without
 * Tesseract's own variables, then the caller's (TESSERACT_PARAM_* secrets
 * among them), then the profile.
 */
const baseEnv = (options: RunSpecsOptions, nodePath: string | undefined): NodeJS.ProcessEnv => {
  const system = Object.fromEntries(Object.entries(process.env).filter(([name]) => !TESSERACT_VARIABLE.test(name)));
  const inherited: NodeJS.ProcessEnv = { ...system, ...(options.env ?? process.env) };
  const profile = options.profile ?? null;
  return {
    ...inherited,
    ...(options.profileName !== undefined ? { TESSERACT_PROFILE: options.profileName } : {}),
    ...(profile !== null ? { TESSERACT_BASE_URL: profile.baseURL } : {}),
    ...(nodePath !== undefined ? { NODE_PATH: [nodePath, inherited.NODE_PATH].filter((p) => p !== undefined && p.length > 0).join(path.delimiter) } : {}),
    FORCE_COLOR: '0',
    PLAYWRIGHT_HTML_OPEN: 'never',
  };
};

interface Loaded {
  readonly records: ReadonlyMap<string, EmitRecord>;
  readonly facets: ReadonlyMap<string, Facet>;
  readonly cases: ReadonlyMap<string, TestCase>;
}

const loadContext = async (workspace: Workspace, outcomes: readonly TestOutcome[]): Promise<Loaded> => {
  const records = latestEmitBySpec(await readEmitRecords(workspace));
  const { facets } = await facetsByIds(workspace, facetIdsOf(records.values())).catch(() => ({ facets: [] as readonly Facet[] }));
  const caseIds = [
    ...new Set([
      ...[...records.values()].map((r) => r.testCaseId),
      ...outcomes.flatMap((o) => o.annotations.filter((a) => a.type === 'ado-id' && a.description !== undefined).map((a) => a.description!)),
    ]),
  ];
  const cases = await loadCases(workspace, caseIds).catch(() => [] as readonly TestCase[]);
  return { records, facets: new Map(facets.map((f) => [f.id, f])), cases: new Map(cases.map((c) => [c.id, c])) };
};

const recordMemory = async (
  workspace: Workspace,
  runId: string,
  receipts: readonly RunReceipt[],
  records: ReadonlyMap<string, EmitRecord>,
  now: () => Date,
  log: (message: string) => void,
): Promise<{ readonly promoted: readonly string[]; readonly staled: readonly string[] }> => {
  const inputs = receipts.flatMap((receipt): readonly TestRunInput[] => {
    const record = records.get(receipt.spec);
    const failed = receipt.outcome === 'failed' || receipt.outcome === 'timedOut';
    if (record === undefined || record.facets.length === 0 || !(receipt.outcome === 'passed' || failed)) return [];
    return [
      {
        runId,
        testCaseId: receipt.testCase ?? record.testCaseId,
        facetIds: record.facets,
        outcome: failed ? 'failed' : 'passed',
        ...(receipt.error?.facet !== undefined ? { failedFacet: receipt.error.facet } : {}),
        ...(receipt.error !== undefined ? { failureFamily: receipt.error.family } : {}),
      },
    ];
  });
  if (inputs.length === 0) return { promoted: [], staled: [] };
  try {
    // One write per screen for the whole run, so gating sees the run as one: a
    // data-driven case's rows (or a config's projects) are one run, not several.
    const result = await recordTestRuns(workspace, inputs, { now });
    return { promoted: result.promoted, staled: result.staled };
  } catch (error) {
    log(`could not record run evidence for ${runId}: ${(error as Error).message}`);
    return { promoted: [], staled: [] };
  }
};

const tail = (text: string, lines = 30): string => text.split('\n').slice(-lines).join('\n').trim();

const stoppedError = (runId: string): ToolError =>
  new ToolError('unavailable', 'the test run was stopped before it finished (the server or session is shutting down)', { runId });

/**
 * Run specs with Playwright and turn the report into receipts. Releases the
 * owner's paused run first. With pauseOnFailure, returns as soon as the
 * first failing test holds its browser (the run stays alive until released).
 * Receipts are written and returned through the workspace's PII gate.
 */
export const runSpecs = async (workspace: Workspace, options: RunSpecsOptions = {}): Promise<RunSpecsResult> => {
  const owner = options.owner ?? DEFAULT_RUN_OWNER;
  await releasePausedRuns(owner);
  const now = options.now ?? (() => new Date());
  const log = options.log ?? (() => undefined);
  const runId = newId('run', now());
  const warnings =
    options.pauseOnFailure === true && options.retries !== undefined && options.retries > 0
      ? [`retries (${options.retries}) were not attempted: with pauseOnFailure the first failure pauses for repair instead of retrying`]
      : [];
  const specs = await selectSpecs(workspace, options.specPaths);
  const cli = resolvePlaywrightCli(workspace);
  const customerConfig = await findCustomerConfig(workspace);
  const profile = options.profile ?? null;
  const env = baseEnv(options, cli.nodePath);
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS);
  const runDir = path.join(workspace.paths.tmp, runId);
  await pruneRunDirs(workspace, now()).catch(() => []);

  const plan =
    options.pauseOnFailure === true
      ? await prepareRepair(workspace, {
          repairId: `r-${runId}`,
          specs,
          customerConfig,
          profile,
          headed: options.headed === true,
          outputDir: path.join(runDir, 'results'),
          reportFile: path.join(runDir, 'report.json'),
        })
      : null;
  const reportFile = path.join(runDir, 'report.json');
  const configFile = plan?.configFile ?? customerConfig ?? (await writeMinimalConfig(path.join(runDir, 'playwright.config.mjs'), workspace, profile));
  const filters = plan !== null ? [] : options.specPaths !== undefined && options.specPaths.length > 0 ? specs.map(fileFilter) : [specsUnder(workspace.paths.tests)];
  const args = [
    '--config', configFile,
    ...(plan === null ? ['--reporter', 'json,line', '--output', path.join(runDir, 'results')] : ['--max-failures', '1']),
    ...(options.headed === true ? ['--headed'] : []),
    ...(plan === null && options.retries !== undefined ? ['--retries', String(options.retries)] : []),
    ...(options.grep !== undefined && options.grep.length > 0 ? ['--grep', options.grep] : []),
    ...filters,
  ];
  await fs.mkdir(runDir, { recursive: true });
  log(`test.run ${runId}: ${specs.length} spec(s) with ${relativePosix(workspace.paths.root, configFile)} (${cli.source} Playwright)`);
  warnings.forEach((warning) => log(`test.run ${runId}: ${warning}`));
  const run = startPlaywright(cli.cli, args, workspace.paths.root, { ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile });
  track({ runId, owner, run, plan, state: 'running' });

  const waited = await waitForRun(run, deadline, plan?.repairFile ?? null);
  const at = now().toISOString();
  if (stoppedRuns.delete(runId)) {
    if (plan !== null) await cleanupRepair(plan).catch(() => undefined);
    throw stoppedError(runId);
  }

  if (waited.kind === 'timeout') {
    await stopPlaywright(run);
    if (plan !== null) await cleanupRepair(plan).catch(() => undefined);
    throw new ToolError('timeout', `the test run did not finish within ${options.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS} ms and was stopped`, { runId, output: tail(run.output()) });
  }

  const originalOf = plan === null ? undefined : (file: string): string => plan.originals.get(path.resolve(file)) ?? file;

  let outcomes: readonly TestOutcome[];
  let pausedRecord: RepairRecord | null = null;
  let reportPath: string | undefined;
  if (waited.kind === 'paused' && plan !== null) {
    const parsed = RepairRecordSchema.safeParse(await readJson<unknown>(plan.repairFile).catch(() => null));
    if (!parsed.success) {
      await stopPlaywright(run);
      await cleanupRepair(plan).catch(() => undefined);
      throw new ToolError('malformed-response', 'the paused test wrote an unreadable repair file');
    }
    pausedRecord = parsed.data;
    outcomes = parseProgress((await readText(plan.progressFile)) ?? '');
    if (stoppedRuns.delete(runId)) throw stoppedError(runId);
    // Held for repair in place until its owner's next run or stopRuns releases it (see track for a hold that expires).
    setState(runId, 'paused');
  } else {
    const text = await readText(reportFile);
    if (text === null) {
      if (plan !== null) await cleanupRepair(plan).catch(() => undefined);
      throw new ToolError('unclassified', `Playwright exited without a report:\n${tail(run.output())}`, { runId });
    }
    const report = parseReport(text);
    outcomes = report.outcomes;
    reportPath = relativePosix(workspace.paths.root, reportFile);
    if (outcomes.length === 0) {
      if (plan !== null) await cleanupRepair(plan).catch(() => undefined);
      // "No tests found" also follows a spec that failed to load; only alone does it mean the selection matched nothing.
      const loadErrors = report.errors.filter((error) => !/^Error: No tests found/i.test(error));
      const config = relativePosix(workspace.paths.root, configFile);
      if (loadErrors.length === 0 && report.errors.length > 0) {
        throw new ToolError('not-found', `Playwright found no tests to run with ${config}; check that its testDir contains ${relativePosix(workspace.paths.root, workspace.paths.tests)}/`, { runId });
      }
      throw new ToolError('unclassified', `Playwright could not run the specs (${config}): ${(loadErrors.join('\n') || tail(run.output())).slice(0, 2000)}`, { runId });
    }
    if (plan !== null) await cleanupRepair(plan).catch(() => undefined);
  }

  const loaded = await loadContext(workspace, outcomes);
  const ctx: ReceiptContext = {
    runId,
    at,
    root: workspace.paths.root,
    emitBySpec: loaded.records,
    facets: loaded.facets,
    cases: loaded.cases,
    ...(originalOf !== undefined ? { originalOf } : {}),
  };
  const finished = outcomes.map((outcome) => receiptFor(outcome, ctx));
  const pausedReceipt =
    pausedRecord === null
      ? null
      : {
          ...receiptFor(pausedOutcome(pausedRecord), ctx),
          paused: {
            repairId: pausedRecord.repairId,
            cdpEndpoint: pausedRecord.cdpEndpoint,
            ...(pausedRecord.url !== undefined ? { url: pausedRecord.url } : {}),
            ...(pausedRecord.failingStep !== undefined ? { failingStep: pausedRecord.failingStep } : {}),
          },
        };
  const receipts: readonly RunReceipt[] = [...finished, ...(pausedReceipt === null ? [] : [pausedReceipt])].map((receipt) =>
    gateReceipt(receipt, workspace.config.pii),
  );

  const pausedOut = receipts.find((receipt) => receipt.paused !== undefined)?.paused;
  const memory =
    options.updateMemory === false ? { promoted: [], staled: [] } : await recordMemory(workspace, runId, receipts, loaded.records, now, log);
  for (const receipt of receipts) await appendJsonl(workspace.paths.runReceipts, receipt);

  return {
    runId,
    receipts,
    summary: summarize(receipts),
    ...(reportPath !== undefined ? { reportPath } : {}),
    ...(pausedOut !== undefined ? { paused: pausedOut } : {}),
    promoted: memory.promoted,
    staled: memory.staled,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
};

/** Every well-formed run receipt with this runId, in append order. */
export const readRunReceipts = async (workspace: Workspace, runId: string): Promise<readonly RunReceipt[]> =>
  (await readJsonl<unknown>(workspace.paths.runReceipts)).flatMap((line) => {
    const parsed = RunReceiptSchema.safeParse(line);
    return parsed.success && parsed.data.runId === runId ? [parsed.data] : [];
  });
