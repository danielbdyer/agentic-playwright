/**
 * The tesseract-qa command line. Every tool is a subcommand generated from
 * its declaration; the workflow commands (record, preflight, audit, author,
 * report, init) are compositions of the same tools through the same
 * runtime, so a CLI call leaves exactly the receipts an MCP call would.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, CONTRACT_VERSION, findTool, wireName, type ToolDeclaration, type ToolOutput } from '../contract/tools.js';
import { ToolError, isToolError } from '../core/errors.js';
import { exists, writeFileAtomic } from '../core/fsio.js';
import { appendPreflightReceipt, lastPreflightReceipt } from '../tools/handlers/memory.js';
import { packageRoot, packageVersion } from '../core/package-root.js';
import { loadWorkspace } from '../workspace/workspace.js';
import { profilePath } from '../workspace/profiles.js';
import { driftedFiles, writeGenerated } from '../tools/generate.js';
import { buildLock, checkLock, writeLock } from '../tools/contract-lock.js';
import type { Runtime } from '../tools/runtime.js';
import { parseToolArgs, toolHelp } from './args.js';
import { createCliRuntime, defaultLog, resolveRoot } from './runtime.js';
import { runAuthorCommand, runReportCommand } from './workflows.js';

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;

interface Globals {
  readonly root: string;
  readonly headed: boolean;
  readonly rest: readonly string[];
}

/** Pull --root and --headed out from anywhere in argv. */
const globals = (argv: readonly string[]): Globals => {
  const rest: string[] = [];
  let root: string | undefined;
  let headed = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token === '--root') {
      root = argv[i + 1];
      i += 1;
    } else if (token.startsWith('--root=')) {
      root = token.slice('--root='.length);
    } else if (token === '--headed') {
      headed = true;
    } else {
      rest.push(token);
    }
  }
  return { root: resolveRoot(root), headed, rest };
};

/** Minimal flag reader for workflow commands: --name value, --flag, and positionals. */
export const readFlags = (argv: readonly string[]): { readonly flags: Readonly<Record<string, string | true>>; readonly positionals: readonly string[] } => {
  const flags: Record<string, string | true> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq >= 0) {
        flags[token.slice(2, eq)] = token.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[token.slice(2)] = next;
          i += 1;
        } else {
          flags[token.slice(2)] = true;
        }
      }
    } else {
      positionals.push(token);
    }
  }
  return { flags, positionals };
};

const str = (value: string | true | undefined): string | undefined => (typeof value === 'string' ? value : undefined);

const print = (value: unknown): void => {
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
};

const printError = (family: string, message: string, detail?: unknown): void => {
  process.stderr.write(`${JSON.stringify({ error: { family, message, ...(detail !== undefined ? { detail } : {}) } }, null, 2)}\n`);
};

const withRuntime = async <T>(g: Globals, body: (runtime: Runtime) => Promise<T>): Promise<T> => {
  const runtime = await createCliRuntime({ root: g.root, headed: g.headed });
  try {
    return await body(runtime);
  } finally {
    await runtime.close();
  }
};

/** Invoke a tool and throw its error as a ToolError. */
export const invokeOrThrow = async <O>(runtime: Runtime, name: string, input: unknown): Promise<O> => {
  const result = await runtime.invoke(name, input);
  if (!result.ok) throw new ToolError(result.error.family, result.error.message, result.error.detail as Record<string, unknown> | undefined);
  return result.output as O;
};

// ─── Commands ──────────────────────────────────────────────────────────────

const USAGE = `tesseract-qa ${CONTRACT_VERSION} — QA authoring toolbox for agents (MCP server and CLI)

Usage:
  tesseract-qa serve [--http <port>] [--host <host>] [--token-env <NAME>] [--root <dir>] [--headed]
  tesseract-qa <tool> [--<field> <value> ...] [--json '<object>'] [--input <file|->]
  tesseract-qa call <tool> ['<json>' | @file.json | -]
  tesseract-qa tools [--json]
  tesseract-qa init [--profile <name>] [--base-url <url>]
  tesseract-qa record <flow-name> --url <url> [--profile <name>] [--screen <s>] [--stop manual|urlChange]
  tesseract-qa preflight [--screen <s>] [--profile <p>] [--format text|md|json|hook] [--fail-on missing|stale|none] [--max-age 12h]
  tesseract-qa audit <url> [--profile <p>] [--format md|json]
  tesseract-qa author --ids <id,...> | --plan <p> --suite <s> [--profile <p>] [--decider heuristic|anthropic] [--attempts <n>] [--case-budget-ms <ms>] [--no-refresh] [--run] [--publish --run-name <n>]
  tesseract-qa report [--case <id>] [--format md|json]
  tesseract-qa generate [--allow-breaking] | drift-check | version

Tools (run "tesseract-qa <tool> --help" for flags):
${(TOOLS as readonly ToolDeclaration[]).map((t) => `  ${t.name.padEnd(18)} ${t.summary}`).join('\n')}
`;

const commandServe = async (g: Globals): Promise<number> => {
  const { flags } = readFlags(g.rest);
  const httpPort = str(flags.http);
  if (httpPort === undefined) {
    const { serveStdio } = await import('../server/transports.js');
    const runtime = await createCliRuntime({ root: g.root, headed: g.headed });
    await serveStdio(runtime);
    return EXIT_OK;
  }
  const port = Number(httpPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ToolError('invalid-input', `--http must be a port, got ${httpPort}`);
  const tokenEnv = str(flags['token-env']);
  const token = tokenEnv !== undefined ? process.env[tokenEnv] : undefined;
  if (tokenEnv !== undefined && (token === undefined || token.length < 16)) {
    throw new ToolError('not-configured', `--token-env ${tokenEnv} must name an environment variable holding a token of at least 16 characters`);
  }
  const { serveHttp } = await import('../server/transports.js');
  const { createBrowserPool } = await import('../browser/pool.js');
  const { createRuntime } = await import('../tools/runtime.js');
  const { createHandlers } = await import('../tools/handlers/index.js');
  const { releasePausedRuns } = await import('../run/index.js');
  const ws = await loadWorkspace(g.root);
  await serveHttp({
    port,
    host: str(flags.host) ?? '127.0.0.1',
    ...(token !== undefined ? { token } : {}),
    log: defaultLog,
    createRuntime: () =>
      createRuntime({
        workspace: ws,
        browser: createBrowserPool({ userAgentSuffix: ws.config.userAgentSuffix, headless: !g.headed, root: ws.paths.root, log: defaultLog }),
        handlers: createHandlers(),
        log: defaultLog,
        closeHooks: [releasePausedRuns],
      }),
  });
  await new Promise<never>(() => undefined);
  return EXIT_OK;
};

const commandTools = (g: Globals): number => {
  const { flags } = readFlags(g.rest);
  if (flags.json === true) {
    print((TOOLS as readonly ToolDeclaration[]).map((t) => ({ name: t.name, wireName: wireName(t.name), summary: t.summary, release: t.release, caller: t.caller })));
  } else {
    print((TOOLS as readonly ToolDeclaration[]).map((t) => `${t.name.padEnd(18)} ${wireName(t.name).padEnd(18)} ${t.release}  ${t.summary}`).join('\n'));
  }
  return EXIT_OK;
};

const runTool = async (g: Globals, declaration: ToolDeclaration, input: unknown): Promise<number> =>
  withRuntime(g, async (runtime) => {
    const result = await runtime.invoke(declaration.name, input);
    if (result.ok) {
      print(result.output);
      return EXIT_OK;
    }
    printError(result.error.family, result.error.message, result.error.detail);
    return result.error.family === 'invalid-input' ? EXIT_USAGE : EXIT_FAILED;
  });

const commandTool = async (g: Globals, declaration: ToolDeclaration, argv: readonly string[]): Promise<number> => {
  if (argv.includes('--help') || argv.includes('-h')) {
    print(toolHelp(declaration.name, declaration.summary, declaration.description, declaration.input));
    return EXIT_OK;
  }
  const input = await parseToolArgs(declaration.input, argv);
  return runTool(g, declaration, input);
};

const commandCall = async (g: Globals): Promise<number> => {
  const [name, source] = g.rest;
  const declaration = name === undefined ? undefined : findTool(name);
  if (declaration === undefined) throw new ToolError('invalid-input', `usage: tesseract-qa call <tool> ['<json>' | @file.json | -]; unknown tool ${name ?? '(none)'}`);
  let text = '{}';
  if (source === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    text = Buffer.concat(chunks).toString('utf8');
  } else if (source !== undefined && source.startsWith('@')) {
    text = await fs.readFile(path.resolve(source.slice(1)), 'utf8');
  } else if (source !== undefined) {
    text = source;
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    throw new ToolError('invalid-input', `input is not valid JSON: ${(error as Error).message}`);
  }
  return runTool(g, declaration, input);
};

const GITIGNORE_LINES = ['.tesseract/snapshots/', '.tesseract/tmp/', '.tesseract/repair/', 'test-results/', 'playwright-report/'];
const GITATTRIBUTES_LINES = ['.tesseract/evidence/*.jsonl merge=union', '.tesseract/receipts/*.jsonl merge=union'];

const appendMissingLines = async (file: string, lines: readonly string[], header: string): Promise<boolean> => {
  const current = (await exists(file)) ? await fs.readFile(file, 'utf8') : '';
  const present = new Set(current.split(/\r?\n/).map((l) => l.trim()));
  const missing = lines.filter((l) => !present.has(l));
  if (missing.length === 0) return false;
  const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
  await fs.writeFile(file, `${current}${prefix}${header}\n${missing.join('\n')}\n`);
  return true;
};

const commandInit = async (g: Globals): Promise<number> => {
  const { flags } = readFlags(g.rest);
  const workspace = await loadWorkspace(g.root);
  const created: string[] = [];
  if (!(await exists(workspace.paths.configFile))) {
    await writeFileAtomic(
      workspace.paths.configFile,
      `${JSON.stringify({ testsDir: 'tests', pagesDir: 'pages', flowsDir: 'flows', pii: 'standard', promoteAfterPasses: 3, ado: { orgUrl: null, project: null, patEnv: 'AZURE_DEVOPS_PAT' } }, null, 2)}\n`,
    );
    created.push('.tesseract/config.json');
  }
  const profileName = str(flags.profile) ?? 'qa';
  const baseURL = str(flags['base-url']);
  const profileFile = profilePath(workspace, profileName);
  if (!(await exists(profileFile))) {
    const normalized = baseURL === undefined ? 'https://qa.example.com/YourModule/' : baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
    await writeFileAtomic(profileFile, `${JSON.stringify({ name: profileName, baseURL: normalized }, null, 2)}\n`);
    created.push(path.relative(g.root, profileFile));
  }
  for (const dir of [workspace.paths.catalog, workspace.paths.evidence, workspace.paths.receipts, workspace.paths.handoffs]) {
    await fs.mkdir(dir, { recursive: true });
  }
  if (await appendMissingLines(path.join(g.root, '.gitignore'), GITIGNORE_LINES, '# tesseract-qa')) created.push('.gitignore (entries)');
  if (await appendMissingLines(path.join(g.root, '.gitattributes'), GITATTRIBUTES_LINES, '# tesseract-qa: append-only logs merge by union')) created.push('.gitattributes (entries)');
  print([
    created.length > 0 ? `Created: ${created.join(', ')}` : 'Already initialized.',
    '',
    'Add to playwright.config.ts so page objects get their base URL from the selected profile:',
    '',
    "  import { readFileSync } from 'node:fs';",
    "  const profile = process.env.TESSERACT_PROFILE ?? 'qa';",
    "  const baseURL = process.env.TESSERACT_BASE_URL ?? JSON.parse(readFileSync(`.tesseract/profiles/${profile}.json`, 'utf8')).baseURL;",
    '  // in defineConfig: use: { baseURL, trace: \'retain-on-failure\' }',
    '',
    'If the app team annotated widgets with os-test-id, also set use.testIdAttribute: \'os-test-id\'.',
    'Register the MCP server with your agent host: { "command": "npx", "args": ["tesseract-qa", "serve"] }',
  ].join('\n'));
  return EXIT_OK;
};

const commandRecord = async (g: Globals): Promise<number> => {
  const { flags, positionals } = readFlags(g.rest);
  const name = positionals[0];
  const url = str(flags.url);
  if (name === undefined || url === undefined) throw new ToolError('invalid-input', 'usage: tesseract-qa record <flow-name> --url <url> [--profile <name>]');
  return withRuntime({ ...g, headed: true }, async (runtime) => {
    const opened = await invokeOrThrow<ToolOutput<'app.open'>>(runtime, 'app.open', { url, headed: true, ...(str(flags.profile) !== undefined ? { profile: str(flags.profile) } : {}), auth: 'none' });
    process.stderr.write(`Recording "${name}" in the browser window. Walk the path, then press the Stop button in the page.\n`);
    const stopOn = str(flags.stop) === 'urlChange' ? 'urlChange' : 'manual';
    const recorded = await invokeOrThrow<ToolOutput<'flow.record'>>(runtime, 'flow.record', {
      name,
      pageId: opened.pageId,
      stopOn,
      ...(str(flags.profile) !== undefined ? { profile: str(flags.profile) } : {}),
      ...(str(flags.screen) !== undefined ? { screen: str(flags.screen) } : {}),
      ...(str(flags.timeout) !== undefined ? { timeoutMs: Number(str(flags.timeout)) } : {}),
    });
    print({
      flow: recorded.flowPath,
      recording: recorded.recordingPath,
      steps: recorded.steps.length,
      facetsMinted: recorded.facetsMinted,
      params: recorded.params,
      stoppedBy: recorded.stoppedBy,
    });
    return EXIT_OK;
  });
};

type PreflightOutput = ToolOutput<'memory.preflight'>;

const parseAge = (text: string | undefined): number => {
  if (text === undefined) return 12 * 3_600_000;
  const match = /^(\d+)(ms|s|m|h|d)?$/.exec(text.trim());
  if (match === null) throw new ToolError('invalid-input', `--max-age must look like 30m, 12h, or 2d; got ${text}`);
  const unit = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[(match[2] ?? 'ms') as 'ms' | 's' | 'm' | 'h' | 'd'];
  return Number(match[1]) * unit;
};

const problemsOf = (screen: PreflightOutput['screens'][number]): readonly string[] => [
  ...screen.facets.filter((f) => f.status === 'stale' || f.status === 'missing').map((f) => `${f.id} ${f.status}${f.detail !== undefined ? ` (${f.detail})` : ''}`),
  ...screen.fingerprintDiff,
  ...((screen as { detail?: string }).detail !== undefined ? [(screen as { detail?: string }).detail!] : []),
];

export const renderPreflight = (at: string, output: PreflightOutput, format: string): string => {
  const { ok, stale, missing, unchecked } = output.summary;
  const counts = `${ok} facets ok, ${stale} stale, ${missing} missing${unchecked > 0 ? `, ${unchecked} unchecked` : ''}`;
  if (format === 'hook') {
    const bad = output.screens.filter((s) => s.status !== 'ok' && s.status !== 'no-route');
    const head = `Tesseract preflight (${at}): ${counts} across ${output.screens.length} screens.`;
    if (bad.length === 0) return head;
    return [
      head,
      ...bad.slice(0, 8).map((s) => {
        const problems = problemsOf(s);
        return `- ${s.screen}: ${s.status}${problems.length > 0 ? ` — ${problems.slice(0, 3).join('; ')}` : ''}`;
      }),
      'Re-observe these screens before trusting their page objects (memory.preflight for details).',
    ].join('\n');
  }
  if (format === 'md') {
    return [
      '### Tesseract preflight',
      '',
      `${counts} (${at}).`,
      '',
      '| Screen | Status | Problems |',
      '|---|---|---|',
      ...output.screens.map((s) => {
        const problems = problemsOf(s);
        return `| ${s.screen} | ${s.status} | ${problems.length > 0 ? problems.map((p) => p.replace(/\|/g, '\\|')).join('<br>') : '—'} |`;
      }),
    ].join('\n');
  }
  return [
    `preflight ${at}: ok ${ok}, stale ${stale}, missing ${missing}, unchecked ${unchecked}`,
    ...output.screens.map((s) => `  ${s.screen.padEnd(28)} ${s.status.padEnd(12)} ${problemsOf(s).join('; ')}`),
  ].join('\n');
};

const commandPreflight = async (g: Globals): Promise<number> => {
  const { flags } = readFlags(g.rest);
  const format = str(flags.format) ?? 'text';
  const hook = format === 'hook';
  const failOn = str(flags['fail-on']) ?? (hook ? 'none' : 'missing');
  try {
    const workspace = await loadWorkspace(g.root);
    const catalogs = (await exists(workspace.paths.catalog)) ? (await fs.readdir(workspace.paths.catalog)).filter((f) => f.endsWith('.yaml')) : [];
    if (catalogs.length === 0) {
      if (!hook) print('No facet catalog yet (.tesseract/catalog/ is empty); nothing to preflight.');
      return EXIT_OK;
    }
    if (hook) {
      const last = await lastPreflightReceipt(workspace);
      if (last !== null && Date.now() - Date.parse(last.at) < parseAge(str(flags['max-age']))) {
        print(renderPreflight(last.at, last, 'hook'));
        return EXIT_OK;
      }
    }
    const profile = str(flags.profile);
    const input = {
      ...(str(flags.screen) !== undefined ? { screen: str(flags.screen) } : {}),
      ...(profile !== undefined ? { profile } : {}),
    };
    const output = await withRuntime(g, (runtime) => invokeOrThrow<PreflightOutput>(runtime, 'memory.preflight', input));
    const at = new Date().toISOString();
    await appendPreflightReceipt(workspace, output, { at, ...(profile !== undefined ? { profile } : {}) });
    print(format === 'json' ? output : renderPreflight(at, output, format));
    if (failOn === 'missing' && output.summary.missing > 0) return EXIT_FAILED;
    if (failOn === 'stale' && (output.summary.missing > 0 || output.summary.stale > 0)) return EXIT_FAILED;
    return EXIT_OK;
  } catch (error) {
    if (hook) {
      print(`Tesseract preflight skipped: ${(error as Error).message}`);
      return EXIT_OK;
    }
    throw error;
  }
};

type ObserveOutput = ToolOutput<'app.observe'>;

const renderAudit = (url: string, snapshot: ObserveOutput): string => {
  const findings = snapshot.audit ?? [];
  const byRef = new Map(snapshot.candidates.map((c) => [c.ref, c]));
  const describe = (ref: string): string => {
    const c = byRef.get(ref);
    if (c === undefined) return ref;
    const where = [c.landmark, c.dataBlock].filter((x) => x !== undefined).join(' / ');
    return `${c.role} "${c.name || '(no name)'}"${c.id !== undefined ? ` #${c.id}` : ''}${where.length > 0 ? ` in ${where}` : ''}`;
  };
  return [
    `## Testability audit: ${snapshot.title || url}`,
    '',
    `URL: ${snapshot.url} · variant: ${snapshot.variant} · candidates: ${snapshot.totalCandidates} · landmarks: ${snapshot.fingerprint.landmarks.join(', ') || 'none'}`,
    '',
    findings.length === 0 ? 'No findings: every control has a computed accessible name, names are unique within their landmark, and no control relies on a structural id alone.' : `${findings.length} finding${findings.length === 1 ? '' : 's'}:`,
    '',
    ...findings.flatMap((f) => [`### ${f.kind}`, '', f.message, '', ...f.refs.slice(0, 25).map((r) => `- ${describe(r)}`), ...(f.refs.length > 25 ? [`- … and ${f.refs.length - 25} more`] : []), '']),
    'Fixes that help both accessibility and test stability: give each control an accessible name (label, aria-label, or visible text), keep names unique within a landmark, and set a widget Name or os-test-id where a control has neither.',
  ].join('\n');
};

const commandAudit = async (g: Globals): Promise<number> => {
  const { flags, positionals } = readFlags(g.rest);
  const url = positionals[0] ?? str(flags.url);
  if (url === undefined) throw new ToolError('invalid-input', 'usage: tesseract-qa audit <url> [--profile <p>] [--format md|json]');
  return withRuntime(g, async (runtime) => {
    const opened = await invokeOrThrow<ToolOutput<'app.open'>>(runtime, 'app.open', { url, ...(str(flags.profile) !== undefined ? { profile: str(flags.profile) } : {}) });
    const snapshot = await invokeOrThrow<ObserveOutput>(runtime, 'app.observe', { pageId: opened.pageId, audit: true, maxCandidates: 500 });
    print(str(flags.format) === 'json' ? { url: snapshot.url, variant: snapshot.variant, fingerprint: snapshot.fingerprint, audit: snapshot.audit ?? [] } : renderAudit(url, snapshot));
    return EXIT_OK;
  });
};

const commandGenerate = async (g: Globals): Promise<number> => {
  const { flags } = readFlags(g.rest);
  const lock = await checkLock();
  if (lock.status === 'changed' && lock.diff.breaking.length > 0 && flags['allow-breaking'] !== true) {
    printError('conflict', 'breaking contract changes; rename the tool or pass --allow-breaking (pre-1.0 only)', lock.diff.breaking);
    return EXIT_FAILED;
  }
  const changed = await writeGenerated();
  if (lock.status !== 'ok') await writeLock(buildLock());
  const root = packageRoot();
  const inpage = path.join(root, 'scripts', 'build-inpage.mjs');
  if (await exists(inpage)) {
    const built = spawnSync(process.execPath, [inpage], { cwd: root, encoding: 'utf8' });
    if (built.status !== 0) {
      printError('unclassified', 'in-page bundle build failed', built.stderr);
      return EXIT_FAILED;
    }
  }
  print([...changed.map((f) => path.relative(root, f)), ...(lock.status !== 'ok' ? ['contract.lock.json'] : [])].join('\n') || 'Everything generated is up to date.');
  return EXIT_OK;
};

const commandDriftCheck = async (): Promise<number> => {
  const root = packageRoot();
  const problems: string[] = [];
  for (const file of await driftedFiles()) problems.push(`${path.relative(root, file)} differs from what the declaration generates`);
  const lock = await checkLock();
  if (lock.status === 'missing') problems.push('contract.lock.json is missing');
  if (lock.status === 'changed') {
    for (const b of lock.diff.breaking) problems.push(`breaking: ${b}`);
    if (lock.diff.additive.length > 0) problems.push(`contract changed additively (${lock.diff.additive.length} changes); run "tesseract-qa generate" and commit contract.lock.json`);
  }
  const inpage = path.join(root, 'scripts', 'build-inpage.mjs');
  if (await exists(inpage)) {
    const checked = spawnSync(process.execPath, [inpage, '--check'], { cwd: root, encoding: 'utf8' });
    if (checked.status !== 0) problems.push(`in-page bundle is stale: ${(checked.stderr || checked.stdout).trim()}`);
  }
  if (problems.length > 0) {
    process.stderr.write(`drift-check failed:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
    return EXIT_FAILED;
  }
  print('drift-check: no drift.');
  return EXIT_OK;
};

export const main = async (argv: readonly string[]): Promise<number> => {
  const g = globals(argv);
  const [command, ...rest] = g.rest;
  const sub: Globals = { ...g, rest };
  try {
    switch (command) {
      case undefined:
      case 'help':
      case '--help':
      case '-h':
        print(USAGE);
        return EXIT_OK;
      case 'version':
      case '--version':
        print(`${packageVersion()} (contract ${CONTRACT_VERSION})`);
        return EXIT_OK;
      case 'serve':
        return await commandServe(sub);
      case 'tools':
        return commandTools(sub);
      case 'call':
        return await commandCall(sub);
      case 'init':
        return await commandInit(sub);
      case 'record':
        return await commandRecord(sub);
      case 'preflight':
        return await commandPreflight(sub);
      case 'audit':
        return await commandAudit(sub);
      case 'author':
        return await withRuntime(sub, (runtime) => runAuthorCommand(runtime, readFlags(rest)));
      case 'report':
        return await runReportCommand(sub.root, readFlags(rest));
      case 'generate':
        return await commandGenerate(sub);
      case 'drift-check':
        return await commandDriftCheck();
      default: {
        const declaration = findTool(command);
        if (declaration === undefined) {
          printError('invalid-input', `unknown command: ${command}`);
          process.stderr.write(USAGE);
          return EXIT_USAGE;
        }
        return await commandTool(sub, declaration, rest);
      }
    }
  } catch (error) {
    if (isToolError(error)) {
      printError(error.family, error.message, error.detail);
      return error.family === 'invalid-input' ? EXIT_USAGE : EXIT_FAILED;
    }
    printError('unclassified', error instanceof Error ? error.message : String(error));
    return EXIT_FAILED;
  }
};
