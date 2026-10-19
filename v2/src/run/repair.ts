/**
 * Repair in place (vision §4.8): run the specs so that the first failure
 * holds its browser open, reachable over the Chrome DevTools Protocol, until
 * the agent has observed and repaired the page and asks to go on.
 *
 * Nothing in the customer's repository changes. The requested specs are
 * copied to .tesseract/tmp/repair-<id>/ as shadow specs whose
 * "@playwright/test" import is a generated repair fixture and whose relative
 * imports point at the original page objects and flows (relative to the
 * shadow copy, which loads under ESM on Windows too). A
 * generated config imports the customer's config and overrides only what
 * repair needs: the shadow testDir, one worker, no retries, no test timeout
 * (actions and navigations keep the test's time budget, so a missing element
 * still fails), Chromium's remote debugging port, headless per the request.
 *
 * The repair fixture is an auto fixture on `page`. After a failed test it
 * writes .tesseract/repair/<repairId>.json (endpoint, URL, title, error, the
 * failing step) and waits for .tesseract/repair/<repairId>.resume, at most
 * fifteen minutes. A progress reporter writes each finished test as a JSON
 * line, so a paused run can report what already ran.
 */
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { exists, readText, writeFileAtomic } from '../core/fsio.js';
import type { Workspace } from '../workspace/workspace.js';
import type { Profile } from '../workspace/profiles.js';
import { profileUse } from './playwright.js';

/** How long a paused test holds its browser before giving up on the agent. */
export const REPAIR_HOLD_MS = 15 * 60 * 1000;

/** A free TCP port on 127.0.0.1 for Chromium's --remote-debugging-port. */
export const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });

const toPosix = (file: string): string => file.split(path.sep).join('/');

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.jsx'];

/**
 * The file a relative import names, with its extension: the path itself,
 * the path plus a source extension, a .js specifier written for a .ts file
 * (NodeNext style), or a directory's index. Null when nothing matches.
 */
export const resolveRelativeImport = async (fromFile: string, specifier: string): Promise<string | null> => {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const jsToTs = /\.(m|c)?js$/.test(base) ? [base.replace(/\.(m|c)?js$/, (_m, k: string | undefined) => `.${k ?? ''}ts`)] : [];
  const candidates = [
    ...(path.extname(base).length > 0 ? [base] : []),
    ...jsToTs,
    ...SOURCE_EXTENSIONS.map((ext) => `${base}${ext}`),
    ...SOURCE_EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
  ];
  for (const candidate of candidates) {
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch {
      // try the next
    }
  }
  return null;
};

const IMPORT_SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"\n]+)\2/g;

/**
 * How the shadow file at `fromFile` names `target`: a './' or '../' path
 * relative to its directory, in POSIX form. Node's ESM loader and
 * Playwright's resolver both take those on every platform, where an absolute
 * Windows path ('C:/…') reads as a URL with scheme 'c:' and fails to load.
 * Only when no relative path exists (another drive) is the absolute path used.
 */
export const shadowSpecifier = (fromFile: string, target: string): string => {
  const relative = path.relative(path.dirname(fromFile), target);
  if (relative.length === 0 || path.isAbsolute(relative)) return toPosix(target);
  const posix = toPosix(relative);
  return posix.startsWith('../') ? posix : `./${posix}`;
};

/**
 * Rewrite a spec's imports for its shadow copy: "@playwright/test" → the
 * repair fixture; relative specifiers → the file they name in the original
 * tree. With `shadowFile` (where the copy is written), specifiers are
 * relative to it; without, absolute paths. Line count and everything else
 * are unchanged.
 */
export const rewriteShadowImports = async (source: string, originalFile: string, fixtureFile: string, shadowFile?: string): Promise<string> => {
  const name = (target: string): string => (shadowFile === undefined ? toPosix(target) : shadowSpecifier(shadowFile, target));
  const matches = [...source.matchAll(IMPORT_SPECIFIER)];
  const replacements = await Promise.all(
    matches.map(async (match): Promise<string> => {
      const [whole, lead, q, specifier] = match as unknown as [string, string, string, string];
      if (specifier === '@playwright/test') return `${lead}${q}${name(fixtureFile)}${q}`;
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const resolved = await resolveRelativeImport(originalFile, specifier);
        return `${lead}${q}${name(resolved ?? path.resolve(path.dirname(originalFile), specifier))}${q}`;
      }
      return whole;
    }),
  );
  let out = '';
  let last = 0;
  matches.forEach((match, i) => {
    out += source.slice(last, match.index) + replacements[i]!;
    last = (match.index ?? 0) + match[0].length;
  });
  return out + source.slice(last);
};

// ─── Generated sources ─────────────────────────────────────────────────────

export interface RepairFixtureOptions {
  readonly repairDir: string;
  readonly repairId: string;
  readonly cdpEndpoint: string;
  readonly holdMs?: number;
}

/**
 * The repair fixture module. It re-exports @playwright/test with `test`
 * extended by an auto fixture that, after a failed test, writes the repair
 * file and polls for the resume file. The failing step is found by reading
 * the spec at the innermost stack frame inside it: the nearest top-level
 * `await test.step(` opener at or above that line.
 */
export const repairFixtureSource = (options: RepairFixtureOptions): string => `// Generated by tesseract-qa for one paused test.run. Not part of the repository's tests.
import { test as base, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

export * from '@playwright/test';

const REPAIR_DIR = ${JSON.stringify(options.repairDir)};
const REPAIR_ID = ${JSON.stringify(options.repairId)};
const CDP_ENDPOINT = ${JSON.stringify(options.cdpEndpoint)};
const HOLD_MS = ${options.holdMs ?? REPAIR_HOLD_MS};

const ANSI = /\\u001b\\[[0-9;]*[A-Za-z]/g;
const OPENER = /^(\\s*)await\\s+test\\.step\\(\\s*(['"\`])((?:\\\\.|(?!\\2)[^\\\\])*)\\2/;

const unescape = (text: string): string =>
  text.replace(/\\\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_m: string, c: string) =>
    c === 'n' ? '\\n' : c === 'r' ? '\\r' : c === 't' ? '\\t' : c.length > 1 ? String.fromCharCode(parseInt(c.slice(1), 16)) : c);

interface StepScan { readonly titles: string[]; readonly index: number }

const scanSteps = (file: string, stack: string): StepScan => {
  try {
    const lines = readFileSync(file, 'utf8').split('\\n');
    const openers = lines.flatMap((line, i) => {
      const m = OPENER.exec(line);
      return m === null ? [] : [{ line: i + 1, indent: m[1]!.length, title: unescape(m[3]!) }];
    });
    const top = openers.length === 0 ? 0 : Math.min(...openers.map((o) => o.indent));
    const steps = openers.filter((o) => o.indent === top);
    const escaped = file.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
    const frame = new RegExp(escaped + ':(\\\\d+):\\\\d+').exec(stack);
    const errorLine = frame === null ? -1 : Number(frame[1]);
    const index = errorLine < 0 ? -1 : steps.filter((s) => s.line <= errorLine).length - 1;
    return { titles: steps.map((s) => s.title), index };
  } catch {
    return { titles: [], index: -1 };
  }
};

export const test = base.extend<{ tesseractRepair: void }>({
  tesseractRepair: [
    async ({ page }, use, testInfo) => {
      await use();
      if (testInfo.status === testInfo.expectedStatus || testInfo.status === 'skipped') return;
      const error = testInfo.errors[0];
      const scan = scanSteps(testInfo.file, error?.stack ?? '');
      const file = REPAIR_DIR + '/' + REPAIR_ID + '.json';
      const record = {
        repairId: REPAIR_ID,
        cdpEndpoint: CDP_ENDPOINT,
        url: page.url(),
        title: await page.title().catch(() => ''),
        error: (error?.message ?? error?.value ?? 'test failed').replace(ANSI, ''),
        ...(scan.index >= 0 && scan.titles[scan.index] !== undefined ? { failingStep: scan.titles[scan.index] } : {}),
        failingStepIndex: scan.index,
        stepTitles: scan.titles,
        file: testInfo.file,
        titlePath: testInfo.titlePath.slice(1),
        annotations: testInfo.annotations.map((a) => ({ type: a.type, ...(a.description !== undefined ? { description: a.description } : {}) })),
        status: testInfo.status ?? 'failed',
        durationMs: testInfo.duration,
      };
      mkdirSync(REPAIR_DIR, { recursive: true });
      writeFileSync(file + '.tmp', JSON.stringify(record));
      renameSync(file + '.tmp', file);
      const deadline = Date.now() + HOLD_MS;
      while (Date.now() < deadline && !existsSync(REPAIR_DIR + '/' + REPAIR_ID + '.resume')) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    },
    { auto: true },
  ],
});

export { expect };
`;

/**
 * A reporter that appends each finished test as one TestOutcome JSON line
 * (the shape src/run/report.ts reads), so a paused run can report the
 * tests that finished before the pause.
 */
export const progressReporterSource = (progressFile: string): string => `// Generated by tesseract-qa for one paused test.run.
import { appendFileSync } from 'node:fs';

const FILE = ${JSON.stringify(progressFile)};

const describes = (test) => {
  const titles = [];
  for (let suite = test.parent; suite !== undefined && suite.type === 'describe'; suite = suite.parent) titles.unshift(suite.title);
  return titles;
};

const message = (error) => (error === undefined ? undefined : error.message ?? error.value);

export default class TesseractProgressReporter {
  onTestEnd(test, result) {
    const steps = result.steps.filter((step) => step.category === 'test.step').map((step) => {
      const error = message(step.error);
      return { title: step.title, durationMs: step.duration, ...(error !== undefined ? { error } : {}) };
    });
    const error = message(result.error ?? result.errors[0]);
    const trace = result.attachments.find((a) => a.name === 'trace' && a.path !== undefined);
    const line = {
      file: test.location.file,
      titlePath: [...describes(test), test.title],
      annotations: test.annotations.map((a) => ({ type: a.type, ...(a.description !== undefined ? { description: a.description } : {}) })),
      status: test.outcome(),
      lastStatus: result.status,
      durationMs: result.duration,
      retries: result.retry,
      ...(error !== undefined ? { error } : {}),
      steps,
      ...(trace !== undefined ? { tracePath: trace.path } : {}),
    };
    appendFileSync(FILE, JSON.stringify(line) + '\\n');
  }
  printsToStdio() {
    return false;
  }
}
`;

export interface RepairConfigOptions {
  /** The customer's config, or null when the workspace has none. */
  readonly customerConfig: string | null;
  /** Whether the customer's config is an ES module (else it is required). */
  readonly customerIsModule: boolean;
  readonly shadowDir: string;
  readonly outputDir: string;
  readonly reportFile: string;
  readonly reporterFile: string;
  readonly port: number;
  readonly headless: boolean;
  /** use options from the profile: what the config falls back to when the customer's config cannot be imported. */
  readonly fallbackUse: Readonly<Record<string, unknown>>;
}

/**
 * The repair config: the customer's config (imported, so its use options,
 * projects and setup stay theirs) with repair's overrides. Projects other
 * than Chromium are dropped (only Chromium speaks CDP); a project that only
 * serves as another's dependency (an auth setup) keeps its own testDir.
 * Paths the customer's config resolves against its own directory
 * (globalSetup, globalTeardown, webServer.cwd, setup testDirs) are made
 * absolute, since this file lives elsewhere.
 */
export const repairConfigSource = (options: RepairConfigOptions): string => `// Generated by tesseract-qa for one paused test.run. Not part of the repository's config.
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CUSTOMER = ${JSON.stringify(options.customerConfig)};
const CUSTOMER_IS_MODULE = ${JSON.stringify(options.customerIsModule)};
const SHADOW_DIR = ${JSON.stringify(options.shadowDir)};
const LAUNCH_ARG = ${JSON.stringify(`--remote-debugging-port=${options.port}`)};
const HEADLESS = ${JSON.stringify(options.headless)};
const FALLBACK_USE = ${JSON.stringify(options.fallbackUse)};

const load = async () => {
  if (CUSTOMER === null) return { use: FALLBACK_USE };
  try {
    const mod = CUSTOMER_IS_MODULE ? await import(pathToFileURL(CUSTOMER).href) : createRequire(import.meta.url)(CUSTOMER);
    const config = mod !== null && typeof mod === 'object' && 'default' in mod ? mod.default : mod;
    return config ?? {};
  } catch (error) {
    process.stderr.write('tesseract-qa: could not import ' + CUSTOMER + ' for the repair run (' + (error && error.message ? error.message : String(error)) + '); using the profile baseURL\\n');
    return { use: FALLBACK_USE };
  }
};

const base = await load();
const customerDir = CUSTOMER === null ? process.cwd() : path.dirname(CUSTOMER);
const absolute = (p) => (typeof p === 'string' && !path.isAbsolute(p) ? path.resolve(customerDir, p) : p);
const scripts = (value) => (Array.isArray(value) ? value.map(absolute) : absolute(value));

// The test timeout is off so the hold is not cut short; actions and navigations keep the
// time the test would have had, or a missing element would wait for ever instead of failing.
const testTimeout = typeof base.timeout === 'number' && base.timeout > 0 ? base.timeout : 30000;
const baseUse = {
  ...(base.use ?? {}),
  actionTimeout: (base.use && base.use.actionTimeout) || testTimeout,
  navigationTimeout: (base.use && base.use.navigationTimeout) || testTimeout,
};

const repairUse = (use) => ({
  ...(use ?? {}),
  headless: HEADLESS,
  launchOptions: {
    ...((use && use.launchOptions) ?? {}),
    args: [...(((use && use.launchOptions && use.launchOptions.args) ?? []).filter((arg) => !String(arg).startsWith('--remote-debugging-port'))), LAUNCH_ARG],
  },
});

const projects = Array.isArray(base.projects) ? base.projects : undefined;
const isChromium = (project) => {
  const name = (project.use && project.use.browserName) ?? (base.use && base.use.browserName) ?? 'chromium';
  return name === 'chromium';
};
const dependencyNames = new Set((projects ?? []).flatMap((project) => project.dependencies ?? []));
const kept = projects === undefined ? undefined : (() => {
  const testProjects = projects.filter((project) => !dependencyNames.has(project.name) && isChromium(project)).slice(0, 1);
  const needed = new Set(testProjects.flatMap((project) => project.dependencies ?? []));
  return projects
    .filter((project) => testProjects.includes(project) || needed.has(project.name))
    .map((project) => testProjects.includes(project)
      ? { ...project, testDir: SHADOW_DIR, testMatch: undefined, testIgnore: undefined, retries: 0, use: repairUse(project.use) }
      : { ...project, testDir: absolute(project.testDir ?? base.testDir ?? '.') });
})();

const webServer = Array.isArray(base.webServer)
  ? base.webServer.map((server) => ({ ...server, cwd: absolute(server.cwd ?? '.') }))
  : base.webServer !== undefined
    ? { ...base.webServer, cwd: absolute(base.webServer.cwd ?? '.') }
    : undefined;

export default {
  ...base,
  ...(base.globalSetup !== undefined ? { globalSetup: scripts(base.globalSetup) } : {}),
  ...(base.globalTeardown !== undefined ? { globalTeardown: scripts(base.globalTeardown) } : {}),
  ...(webServer !== undefined ? { webServer } : {}),
  testDir: SHADOW_DIR,
  testMatch: undefined,
  testIgnore: undefined,
  outputDir: ${JSON.stringify(options.outputDir)},
  workers: 1,
  retries: 0,
  timeout: 0,
  fullyParallel: false,
  reporter: [['line'], ['json', { outputFile: ${JSON.stringify(options.reportFile)} }], [${JSON.stringify(options.reporterFile)}]],
  use: repairUse(baseUse),
  ...(kept !== undefined ? { projects: kept } : {}),
};
`;

// ─── Preparing a repair run ────────────────────────────────────────────────

export interface RepairPlan {
  readonly repairId: string;
  readonly dir: string;
  readonly configFile: string;
  readonly reportFile: string;
  readonly progressFile: string;
  readonly outputDir: string;
  /** .tesseract/repair/<repairId>.json */
  readonly repairFile: string;
  /** .tesseract/repair/<repairId>.resume */
  readonly resumeFile: string;
  readonly cdpEndpoint: string;
  /** Shadow spec → original spec, absolute paths. */
  readonly originals: ReadonlyMap<string, string>;
}

/** Whether a module file is ESM: .mjs/.mts, or .js/.ts under a package.json with "type": "module". */
export const isModuleFile = async (file: string): Promise<boolean> => {
  if (/\.m[jt]s$/.test(file)) return true;
  if (/\.c[jt]s$/.test(file)) return false;
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    const text = await readText(path.join(dir, 'package.json'));
    if (text !== null) {
      try {
        return (JSON.parse(text) as { type?: unknown }).type === 'module';
      } catch {
        return false;
      }
    }
    if (path.dirname(dir) === dir) return false;
  }
};

export interface PrepareRepairOptions {
  readonly repairId: string;
  /** Where Playwright writes results (traces) and the JSON report; outside the repair directory so they outlive it. */
  readonly outputDir: string;
  readonly reportFile: string;
  /** Absolute paths of the specs to shadow. */
  readonly specs: readonly string[];
  readonly customerConfig: string | null;
  readonly profile: Profile | null;
  readonly headed: boolean;
}

/** Write the shadow specs, the fixture, the progress reporter and the config for one repair run. */
export const prepareRepair = async (workspace: Workspace, options: PrepareRepairOptions): Promise<RepairPlan> => {
  const dir = path.join(workspace.paths.tmp, `repair-${options.repairId}`);
  const port = await freePort();
  const cdpEndpoint = `http://127.0.0.1:${port}`;
  const fixtureFile = path.join(dir, 'tesseract-repair-fixture.ts');
  const reporterFile = path.join(dir, 'tesseract-progress-reporter.mjs');
  const configFile = path.join(dir, 'playwright.repair.config.mjs');
  const { reportFile, outputDir } = options;
  const progressFile = path.join(dir, 'progress.jsonl');
  const shadowDir = path.join(dir, 'specs');
  const repairFile = path.join(workspace.paths.repair, `${options.repairId}.json`);
  const resumeFile = path.join(workspace.paths.repair, `${options.repairId}.resume`);

  const pairs = await Promise.all(
    options.specs.map(async (original) => {
      const shadow = path.join(shadowDir, path.relative(workspace.paths.root, original));
      const source = (await readText(original)) ?? '';
      await writeFileAtomic(shadow, await rewriteShadowImports(source, original, fixtureFile, shadow));
      return [shadow, original] as const;
    }),
  );
  await writeFileAtomic(fixtureFile, repairFixtureSource({ repairDir: toPosix(workspace.paths.repair), repairId: options.repairId, cdpEndpoint }));
  await writeFileAtomic(reporterFile, progressReporterSource(progressFile));
  await writeFileAtomic(
    configFile,
    repairConfigSource({
      customerConfig: options.customerConfig,
      customerIsModule: options.customerConfig === null ? false : await isModuleFile(options.customerConfig),
      shadowDir,
      outputDir,
      reportFile,
      reporterFile,
      port,
      headless: !options.headed,
      fallbackUse: { ...profileUse(workspace, options.profile), trace: 'retain-on-failure' },
    }),
  );
  await fs.mkdir(workspace.paths.repair, { recursive: true });
  return { repairId: options.repairId, dir, configFile, reportFile, progressFile, outputDir, repairFile, resumeFile, cdpEndpoint, originals: new Map(pairs) };
};

/** Remove a finished repair run's generated files (only paths this module created). */
export const cleanupRepair = async (plan: RepairPlan): Promise<void> => {
  await fs.rm(plan.dir, { recursive: true, force: true });
  await fs.rm(plan.repairFile, { force: true });
  await fs.rm(plan.resumeFile, { force: true });
};

export const repairFileExists = (plan: RepairPlan): Promise<boolean> => exists(plan.repairFile);
