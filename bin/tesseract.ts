#!/usr/bin/env node
import { Effect } from 'effect';
import { approveProposal } from '../lib/application/approve';
import { projectBenchmarkScorecard } from '../lib/application/benchmark';
import { bindScenario } from '../lib/application/bind';
import { compileScenario } from '../lib/application/compile';
import { emitScenario } from '../lib/application/emit';
import { buildDerivedGraph } from '../lib/application/graph';
import { impactNode } from '../lib/application/impact';
import { emitOperatorInbox } from '../lib/application/inbox';
import { describeScenarioPaths } from '../lib/application/inspect';
import { parseScenario } from '../lib/application/parse';
import { createProjectPaths } from '../lib/application/paths';
import { refreshScenario } from '../lib/application/refresh';
import { buildRerunPlan } from '../lib/application/rerun-plan';
import { runScenarioSelection } from '../lib/application/run';
import { renderBenchmarkScorecard } from '../lib/application/scorecard';
import { inspectSurface } from '../lib/application/surface';
import { syncSnapshots } from '../lib/application/sync';
import { traceScenario } from '../lib/application/trace';
import { generateTypes } from '../lib/application/types';
import { inspectWorkflow } from '../lib/application/workflow';
import { TesseractError } from '../lib/domain/errors';
import { createAdoId, createScreenId } from '../lib/domain/identity';
import { runWithLocalServicesDetailed } from '../lib/composition/local-services';
import { discoverScreenScaffold } from '../lib/infrastructure/tooling/discover-screen';
import { captureScreenSection } from '../lib/infrastructure/tooling/capture-screen';
import type { ExecutionPosture, RuntimeInterpreterMode } from '../lib/domain/types';

interface CliOptions {
  all?: boolean | undefined;
  adoId?: string | undefined;
  baseline?: boolean | undefined;
  benchmark?: string | undefined;
  headed?: boolean | undefined;
  kind?: string | undefined;
  noWrite?: boolean | undefined;
  screen?: string | undefined;
  section?: string | undefined;
  strict?: boolean | undefined;
  nodeId?: string | undefined;
  proposalId?: string | undefined;
  status?: string | undefined;
  url?: string | undefined;
  rootSelector?: string | undefined;
  runbook?: string | undefined;
  tag?: string | undefined;
  interpreterMode?: RuntimeInterpreterMode | undefined;
  executionProfile?: 'interactive' | 'ci-batch' | undefined;
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
    if (token === '--headed') {
      options.headed = true;
      continue;
    }
    if (token === '--no-write') {
      options.noWrite = true;
      continue;
    }
    if (token === '--baseline') {
      options.baseline = true;
      options.noWrite = true;
      options.interpreterMode = 'dry-run';
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
    if (token === '--runbook') {
      options.runbook = rest[index + 1];
      index += 1;
      continue;
    }
    if (token === '--tag') {
      options.tag = rest[index + 1];
      index += 1;
      continue;
    }
    if (token === '--proposal-id') {
      options.proposalId = rest[index + 1];
      index += 1;
      continue;
    }
    if (token === '--benchmark') {
      options.benchmark = rest[index + 1];
      index += 1;
      continue;
    }
    if (token === '--kind') {
      options.kind = rest[index + 1];
      index += 1;
      continue;
    }
    if (token === '--status') {
      options.status = rest[index + 1];
      index += 1;
      continue;
    }
    if (token === '--url') {
      options.url = rest[index + 1];
      index += 1;
      continue;
    }
    if (token === '--root-selector') {
      options.rootSelector = rest[index + 1];
      index += 1;
      continue;
    }
    if (token === '--section') {
      options.section = rest[index + 1];
      index += 1;
      continue;
    }
    if (token === '--interpreter-mode') {
      const mode = rest[index + 1];
      if (mode === 'playwright' || mode === 'dry-run' || mode === 'diagnostic') {
        options.interpreterMode = mode;
      }
      index += 1;
      continue;
    }
    if (token === '--ci-batch') {
      options.executionProfile = 'ci-batch';
      continue;
    }
    if (token === '--execution-profile') {
      const profile = rest[index + 1];
      if (profile === 'interactive' || profile === 'ci-batch') {
        options.executionProfile = profile;
      }
      index += 1;
      continue;
    }
    if (token === '--node') {
      options.nodeId = rest[index + 1];
      index += 1;
    }
  }

  return { command, options };
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
  if ((command !== 'graph' && command !== 'types' && command !== 'emit') || !result || typeof result !== 'object') {
    return;
  }

  const incremental = (result as { incremental?: { status?: string | undefined; changedInputs?: string[] } }).incremental;
  if (!incremental || typeof incremental.status !== 'string') {
    return;
  }

  const changedInputs = Array.isArray(incremental.changedInputs) ? incremental.changedInputs : [];
  const changedSummary = changedInputs.length > 0 ? changedInputs.join(', ') : 'none';
  process.stderr.write(`[${command}] ${incremental.status}; changedInputs=${changedSummary}\n`);
}

function resolveExecutionPosture(options: CliOptions): ExecutionPosture {
  const executionProfile = options.executionProfile ?? (process.env.CI ? 'ci-batch' : 'interactive');
  return {
    interpreterMode: options.interpreterMode ?? 'diagnostic',
    writeMode: options.noWrite ? 'no-write' : 'persist',
    headed: executionProfile === 'ci-batch' ? false : Boolean(options.headed),
    executionProfile,
  };
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const paths = createProjectPaths(rootDir);
  const posture = resolveExecutionPosture(options);
  let baseProgram: Effect.Effect<unknown, unknown, unknown>;

  switch (command) {
    case 'sync':
      baseProgram = syncSnapshots({
        paths,
        ...(options.adoId ? { adoId: createAdoId(options.adoId) } : {}),
        ...(options.all ? { all: true } : {}),
      });
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
    case 'run':
      baseProgram = runScenarioSelection({
        ...(options.adoId ? { adoId: createAdoId(options.adoId) } : {}),
        paths,
        ...(options.runbook ? { runbookName: options.runbook } : {}),
        ...(options.tag ? { tag: options.tag } : {}),
        interpreterMode: options.interpreterMode === 'diagnostic' || options.interpreterMode === 'dry-run'
          ? options.interpreterMode
          : 'diagnostic',
        posture,
      });
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
    case 'discover':
      baseProgram = discoverScreenScaffold({
        ...(options.screen ? { screen: options.screen } : {}),
        url: requireArg(options.url, '--url'),
        ...(options.rootSelector ? { rootSelector: options.rootSelector } : {}),
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
    case 'workflow':
      baseProgram = inspectWorkflow({
        paths,
        ...(options.adoId ? { adoId: createAdoId(options.adoId) } : {}),
        ...(options.runbook ? { runbookName: options.runbook } : {}),
      });
      break;
    case 'inbox':
      baseProgram = emitOperatorInbox({
        paths,
        filter: {
          ...(options.adoId ? { adoId: options.adoId } : {}),
          ...(options.kind ? { kind: options.kind } : {}),
          ...(options.status ? { status: options.status } : {}),
        },
      });
      break;
    case 'approve':
      baseProgram = approveProposal({
        paths,
        proposalId: requireArg(options.proposalId, '--proposal-id'),
      });
      break;
    case 'rerun-plan':
      baseProgram = buildRerunPlan({
        paths,
        proposalId: requireArg(options.proposalId, '--proposal-id'),
      });
      break;
    case 'benchmark':
      baseProgram = projectBenchmarkScorecard({
        paths,
        benchmarkName: requireArg(options.benchmark, '--benchmark'),
        includeExecution: true,
      });
      break;
    case 'scorecard':
      baseProgram = renderBenchmarkScorecard({
        paths,
        benchmarkName: requireArg(options.benchmark, '--benchmark'),
      });
      break;
    default:
      throw new Error('Unknown command. Expected sync, parse, bind, emit, compile, refresh, run, paths, capture, discover, surface, graph, trace, impact, types, workflow, inbox, approve, rerun-plan, benchmark, or scorecard.');
  }

  if (options.interpreterMode) {
    process.env.TESSERACT_INTERPRETER_MODE = options.interpreterMode;
  }
  process.env.TESSERACT_WRITE_MODE = posture.writeMode;
  if (options.headed) {
    process.env.TESSERACT_HEADLESS = '0';
  }

  const execution = await runWithLocalServicesDetailed(baseProgram, rootDir, { posture });
  logIncrementalStatus(command, execution.result);
  logJson({
    result: execution.result,
    executionPosture: execution.posture,
    wouldWrite: execution.wouldWrite,
  });

  if (
    command === 'bind' &&
    options.strict &&
    typeof execution.result === 'object' &&
    execution.result !== null &&
    'hasUnbound' in execution.result &&
    (execution.result as { hasUnbound: boolean }).hasUnbound
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

