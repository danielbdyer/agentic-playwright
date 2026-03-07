#!/usr/bin/env node
import { Effect } from 'effect';
import { bindScenario } from '../lib/application/bind';
import { bootstrapProject } from '../lib/application/bootstrap/service';
import { compileScenario } from '../lib/application/compile';
import { emitScenario } from '../lib/application/emit';
import { buildDerivedGraph } from '../lib/application/graph';
import { impactNode } from '../lib/application/impact';
import { describeScenarioPaths } from '../lib/application/inspect';
import { parseScenario } from '../lib/application/parse';
import { createProjectPaths } from '../lib/application/paths';
import { refreshScenario } from '../lib/application/refresh';
import { inspectSurface } from '../lib/application/surface';
import { syncSnapshots } from '../lib/application/sync';
import { traceScenario } from '../lib/application/trace';
import { generateTypes } from '../lib/application/types';
import { AdoSource, FileSystem } from '../lib/application/ports';
import { TesseractError } from '../lib/domain/errors';
import { createAdoId, createScreenId } from '../lib/domain/identity';
import { provideLocalServices } from '../lib/infrastructure/local-services';
import { captureScreenSection } from '../lib/infrastructure/tooling/capture-screen';

interface CliOptions {
  all?: boolean;
  adoId?: string;
  screen?: string;
  section?: string;
  strict?: boolean;
  nodeId?: string;
  baseUrl?: string;
  suiteIds?: string[];
  authStrategy?: string;
  crawlDepth?: number;
  crawlAllowHosts?: string[];
  crawlTimeoutMs?: number;
  crawlPageBudget?: number;
}

function parseArgs(argv: string[]): { command: string; options: CliOptions } {
  const [command = 'help', ...rest] = argv;
  const options: CliOptions = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === '--all') {
      options.all = true;
      continue;
    }
    if (token === '--strict') {
      options.strict = true;
      continue;
    }
    if (token === '--ado-id') {
      options.adoId = rest[index + 1];
      index += 1;
      continue;
    }
    if (token === '--screen') {
      options.screen = rest[index + 1];
      index += 1;
      continue;
    }
    if (token === '--section') {
      options.section = rest[index + 1];
      index += 1;
      continue;
    }
    if (token === '--node') {
      options.nodeId = rest[index + 1];
      index += 1;
      continue;
    }
    if (token === '--base-url') {
      options.baseUrl = rest[index + 1];
      index += 1;
      continue;
    }
    if (token === '--suite') {
      options.suiteIds = parseListArg(rest[index + 1], '--suite');
      index += 1;
      continue;
    }
    if (token === '--auth-strategy') {
      options.authStrategy = rest[index + 1];
      index += 1;
      continue;
    }
    if (token === '--crawl-depth') {
      options.crawlDepth = parseNumberArg(rest[index + 1], '--crawl-depth');
      index += 1;
      continue;
    }
    if (token === '--crawl-allow-hosts') {
      options.crawlAllowHosts = parseListArg(rest[index + 1], '--crawl-allow-hosts');
      index += 1;
      continue;
    }
    if (token === '--crawl-timeout-ms') {
      options.crawlTimeoutMs = parseNumberArg(rest[index + 1], '--crawl-timeout-ms');
      index += 1;
      continue;
    }
    if (token === '--crawl-page-budget') {
      options.crawlPageBudget = parseNumberArg(rest[index + 1], '--crawl-page-budget');
      index += 1;
    }
  }

  return { command, options };
}


function parseNumberArg(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid value for ${flag}`);
  }
  return parsed;
}

function parseListArg(value: string | undefined, flag: string): string[] {
  if (!value) {
    throw new Error(`Missing required ${flag}`);
  }
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function requireArg(value: string | undefined, flag: string): string {
  if (!value) {
    throw new Error(`Missing required ${flag}`);
  }
  return value;
}

function logJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function logIncrementalStatus(command: string, result: unknown): void {
  if ((command !== 'graph' && command !== 'types') || !result || typeof result !== 'object') {
    return;
  }

  const incremental = (result as { incremental?: { status?: string; changedInputs?: string[] } }).incremental;
  if (!incremental || typeof incremental.status !== 'string') {
    return;
  }

  const changedInputs = Array.isArray(incremental.changedInputs) ? incremental.changedInputs : [];
  const changedSummary = changedInputs.length > 0 ? changedInputs.join(', ') : 'none';
  process.stderr.write(`[${command}] ${incremental.status}; changedInputs=${changedSummary}\n`);
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const paths = createProjectPaths(rootDir);
  let baseProgram: Effect.Effect<unknown, unknown, FileSystem | AdoSource>;

  switch (command) {
    case 'bootstrap':
      baseProgram = bootstrapProject({
        paths,
        input: {
          baseUrl: requireArg(options.baseUrl, '--base-url'),
          suiteIds: options.suiteIds ?? [],
          authStrategy: options.authStrategy ?? 'none',
          crawlBounds: {
            depth: options.crawlDepth ?? 1,
            hostAllowlist: options.crawlAllowHosts ?? [],
            timeoutMs: options.crawlTimeoutMs ?? 30000,
            pageBudget: options.crawlPageBudget ?? 20,
          },
        },
      });
      break;
    case 'sync':
      baseProgram = syncSnapshots({ adoId: options.adoId ? createAdoId(options.adoId) : undefined, all: options.all, paths });
      break;
    case 'parse':
      baseProgram = parseScenario({ adoId: createAdoId(requireArg(options.adoId, '--ado-id')), paths });
      break;
    case 'bind':
      baseProgram = bindScenario({ adoId: createAdoId(requireArg(options.adoId, '--ado-id')), paths });
      break;
    case 'emit':
      baseProgram = emitScenario({ adoId: createAdoId(requireArg(options.adoId, '--ado-id')), paths });
      break;
    case 'compile':
      baseProgram = compileScenario({ adoId: createAdoId(requireArg(options.adoId, '--ado-id')), paths });
      break;
    case 'refresh':
      baseProgram = refreshScenario({ adoId: createAdoId(requireArg(options.adoId, '--ado-id')), paths });
      break;
    case 'paths':
      baseProgram = describeScenarioPaths({ adoId: createAdoId(requireArg(options.adoId, '--ado-id')), paths });
      break;
    case 'capture':
      baseProgram = captureScreenSection({
        screen: createScreenId(requireArg(options.screen, '--screen')),
        section: requireArg(options.section, '--section'),
        paths,
      });
      break;
    case 'surface':
      baseProgram = inspectSurface({ screen: createScreenId(requireArg(options.screen, '--screen')), paths });
      break;
    case 'graph':
      baseProgram = buildDerivedGraph({ paths });
      break;
    case 'trace':
      baseProgram = traceScenario({ adoId: createAdoId(requireArg(options.adoId, '--ado-id')), paths });
      break;
    case 'impact':
      baseProgram = impactNode({ nodeId: requireArg(options.nodeId, '--node'), paths });
      break;
    case 'types':
      baseProgram = generateTypes({ paths });
      break;
    default:
      throw new Error('Unknown command. Expected bootstrap, sync, parse, bind, emit, compile, refresh, paths, capture, surface, graph, trace, impact, or types.');
  }

  const result = await Effect.runPromise(provideLocalServices(baseProgram, rootDir));
  logIncrementalStatus(command, result);
  logJson(result);

  if (
    command === 'bind' &&
    options.strict &&
    typeof result === 'object' &&
    result !== null &&
    'hasUnbound' in result &&
    (result as { hasUnbound: boolean }).hasUnbound
  ) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const rendered = error instanceof TesseractError
    ? `${error.code}: ${error.message}`
    : error instanceof Error
      ? error.message
      : String(error);
  process.stderr.write(`${rendered}\n`);
  process.exitCode = 1;
});
