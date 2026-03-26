import path from 'path';
import { Effect } from 'effect';
import { approveProposal } from '../approve';
import { projectBenchmarkScorecard } from '../benchmark';
import { bindScenario } from '../bind';
import { compileScenario } from '../compile';
import { runDogfoodLoop } from '../dogfood';
import { emitScenario } from '../emit';
import { buildDerivedGraph } from '../graph';
import { impactNode } from '../impact';
import { emitOperatorInbox } from '../inbox';
import { emitAgentWorkbench, loadAgentWorkbench, nextWorkItem, completeWorkItem } from '../agent-workbench';
import { describeScenarioPaths } from '../inspect';
import { parseScenario } from '../parse';
import { createProjectPaths, type ProjectPaths } from '../paths';
import { refreshScenario } from '../refresh';
import { buildRerunPlan } from '../rerun-plan';
import { runScenarioSelection } from '../run';
import { replayInterpretation } from '../replay-interpretation';
import { renderBenchmarkScorecard } from '../scorecard';
import { inspectSurface } from '../surface';
import { syncSnapshots } from '../sync';
import { traceScenario } from '../trace';
import { generateTypes } from '../types';
import { inspectWorkflow } from '../workflow';
import { createAdoId, createScreenId } from '../../domain/identity';
import type { ExecutionPosture, RuntimeInterpreterMode } from '../../domain/types';
import { discoverScreenScaffold } from '../../infrastructure/tooling/discover-screen';
import { harvestDeclaredRoutes } from '../../infrastructure/tooling/harvest-routes';
import { captureScreenSection } from '../../infrastructure/tooling/capture-screen';

const interpreterModes = ['playwright', 'dry-run', 'diagnostic'] as const;
const executionProfiles = ['interactive', 'ci-batch'] as const;

type InterpreterMode = (typeof interpreterModes)[number];
type ExecutionProfile = (typeof executionProfiles)[number];

interface ParsedFlags {
  adoAreaPath?: string;
  adoIterationPath?: string;
  adoOrgUrl?: string;
  adoPat?: string;
  adoProject?: string;
  adoSource?: 'fixture' | 'live';
  adoSuitePath?: string;
  adoTagFilter?: string;
  all?: boolean;
  adoId?: string;
  baseline?: boolean;
  benchmark?: string;
  executionProfile?: ExecutionProfile;
  headed?: boolean;
  kind?: string;
  noWrite?: boolean;
  nodeId?: string;
  proposalId?: string;
  rootSelector?: string;
  routes?: string;
  runbook?: string;
  screen?: string;
  section?: string;
  status?: string;
  strict?: boolean;
  tag?: string;
  interpreterMode?: InterpreterMode;
  url?: string;
  disableTranslation?: boolean;
  disableTranslationCache?: boolean;
  provider?: string;
  maxIterations?: number;
  convergenceThreshold?: number;
  maxCost?: number;
  complete?: string;
  skip?: string;
  reason?: string;
  skipBelow?: number;
  list?: boolean;
  next?: boolean;
}

interface ParseContext {
  flags: ParsedFlags;
}

export interface CommandExecution {
  command: CommandName;
  strictExitOnUnbound: boolean;
  environment?: Record<string, string | undefined>;
  postureInput: {
    interpreterMode?: RuntimeInterpreterMode;
    executionProfile?: ExecutionProfile;
    headed?: boolean;
    noWrite?: boolean;
    baseline?: boolean;
  };
  execute(paths: ProjectPaths, posture: ExecutionPosture): Effect.Effect<unknown, unknown, unknown>;
}

interface CommandSpec {
  flags: readonly string[];
  parse(context: ParseContext): CommandExecution;
}

export type CommandName =
  | 'sync'
  | 'parse'
  | 'bind'
  | 'emit'
  | 'compile'
  | 'refresh'
  | 'run'
  | 'paths'
  | 'capture'
  | 'discover'
  | 'harvest'
  | 'surface'
  | 'graph'
  | 'trace'
  | 'impact'
  | 'types'
  | 'workflow'
  | 'inbox'
  | 'approve'
  | 'certify'
  | 'rerun-plan'
  | 'benchmark'
  | 'scorecard'
  | 'replay'
  | 'dogfood'
  | 'workbench';

export const commandNames: readonly CommandName[] = [
  'sync',
  'parse',
  'bind',
  'emit',
  'compile',
  'refresh',
  'run',
  'paths',
  'capture',
  'discover',
  'harvest',
  'surface',
  'graph',
  'trace',
  'impact',
  'types',
  'workflow',
  'inbox',
  'approve',
  'certify',
  'rerun-plan',
  'benchmark',
  'scorecard',
  'replay',
  'dogfood',
  'workbench',
] as const;

const flagReaders: Record<string, (argv: string[], index: number, flags: ParsedFlags) => number> = {
  '--all': (_argv, index, flags) => {
    flags.all = true;
    return index;
  },
  '--strict': (_argv, index, flags) => {
    flags.strict = true;
    return index;
  },
  '--headed': (_argv, index, flags) => {
    flags.headed = true;
    return index;
  },
  '--no-write': (_argv, index, flags) => {
    flags.noWrite = true;
    return index;
  },
  '--baseline': (_argv, index, flags) => {
    flags.baseline = true;
    flags.noWrite = true;
    flags.interpreterMode = 'dry-run';
    return index;
  },
  '--ado-id': (argv, index, flags) => {
    flags.adoId = readFlagValue('--ado-id', argv[index + 1]);
    return index + 1;
  },
  '--ado-source': (argv, index, flags) => {
    flags.adoSource = parseEnum('--ado-source', argv[index + 1], ['fixture', 'live'] as const);
    return index + 1;
  },
  '--ado-org-url': (argv, index, flags) => {
    flags.adoOrgUrl = readFlagValue('--ado-org-url', argv[index + 1]);
    return index + 1;
  },
  '--ado-project': (argv, index, flags) => {
    flags.adoProject = readFlagValue('--ado-project', argv[index + 1]);
    return index + 1;
  },
  '--ado-pat': (argv, index, flags) => {
    flags.adoPat = readFlagValue('--ado-pat', argv[index + 1]);
    return index + 1;
  },
  '--ado-suite-path': (argv, index, flags) => {
    flags.adoSuitePath = readFlagValue('--ado-suite-path', argv[index + 1]);
    return index + 1;
  },
  '--ado-area-path': (argv, index, flags) => {
    flags.adoAreaPath = readFlagValue('--ado-area-path', argv[index + 1]);
    return index + 1;
  },
  '--ado-iteration-path': (argv, index, flags) => {
    flags.adoIterationPath = readFlagValue('--ado-iteration-path', argv[index + 1]);
    return index + 1;
  },
  '--ado-tag-filter': (argv, index, flags) => {
    flags.adoTagFilter = readFlagValue('--ado-tag-filter', argv[index + 1]);
    return index + 1;
  },
  '--screen': (argv, index, flags) => {
    flags.screen = readFlagValue('--screen', argv[index + 1]);
    return index + 1;
  },
  '--runbook': (argv, index, flags) => {
    flags.runbook = readFlagValue('--runbook', argv[index + 1]);
    return index + 1;
  },
  '--provider': (argv, index, flags) => {
    flags.provider = readFlagValue('--provider', argv[index + 1]);
    return index + 1;
  },
  '--max-iterations': (argv, index, flags) => {
    flags.maxIterations = Number(readFlagValue('--max-iterations', argv[index + 1]));
    return index + 1;
  },
  '--convergence-threshold': (argv, index, flags) => {
    flags.convergenceThreshold = Number(readFlagValue('--convergence-threshold', argv[index + 1]));
    return index + 1;
  },
  '--max-cost': (argv, index, flags) => {
    flags.maxCost = Number(readFlagValue('--max-cost', argv[index + 1]));
    return index + 1;
  },
  '--tag': (argv, index, flags) => {
    flags.tag = readFlagValue('--tag', argv[index + 1]);
    return index + 1;
  },
  '--proposal-id': (argv, index, flags) => {
    flags.proposalId = readFlagValue('--proposal-id', argv[index + 1]);
    return index + 1;
  },
  '--complete': (argv, index, flags) => {
    flags.complete = readFlagValue('--complete', argv[index + 1]);
    return index + 1;
  },
  '--skip': (argv, index, flags) => {
    flags.skip = readFlagValue('--skip', argv[index + 1]);
    return index + 1;
  },
  '--reason': (argv, index, flags) => {
    flags.reason = readFlagValue('--reason', argv[index + 1]);
    return index + 1;
  },
  '--skip-below': (argv, index, flags) => {
    flags.skipBelow = Number(readFlagValue('--skip-below', argv[index + 1]));
    return index + 1;
  },
  '--list': (_argv, index, flags) => {
    flags.list = true;
    return index;
  },
  '--next': (_argv, index, flags) => {
    flags.next = true;
    return index;
  },
  '--benchmark': (argv, index, flags) => {
    flags.benchmark = readFlagValue('--benchmark', argv[index + 1]);
    return index + 1;
  },
  '--kind': (argv, index, flags) => {
    flags.kind = readFlagValue('--kind', argv[index + 1]);
    return index + 1;
  },
  '--status': (argv, index, flags) => {
    flags.status = readFlagValue('--status', argv[index + 1]);
    return index + 1;
  },
  '--url': (argv, index, flags) => {
    flags.url = readFlagValue('--url', argv[index + 1]);
    return index + 1;
  },
  '--root-selector': (argv, index, flags) => {
    flags.rootSelector = readFlagValue('--root-selector', argv[index + 1]);
    return index + 1;
  },
  '--routes': (argv, index, flags) => {
    flags.routes = readFlagValue('--routes', argv[index + 1]);
    return index + 1;
  },
  '--section': (argv, index, flags) => {
    flags.section = readFlagValue('--section', argv[index + 1]);
    return index + 1;
  },
  '--interpreter-mode': (argv, index, flags) => {
    flags.interpreterMode = parseEnum('--interpreter-mode', argv[index + 1], interpreterModes);
    return index + 1;
  },
  '--ci-batch': (_argv, index, flags) => {
    flags.executionProfile = 'ci-batch';
    return index;
  },
  '--execution-profile': (argv, index, flags) => {
    flags.executionProfile = parseEnum('--execution-profile', argv[index + 1], executionProfiles);
    return index + 1;
  },
  '--node': (argv, index, flags) => {
    flags.nodeId = readFlagValue('--node', argv[index + 1]);
    return index + 1;
  },
  '--disable-translation': (_argv, index, flags) => {
    flags.disableTranslation = true;
    return index;
  },
  '--disable-translation-cache': (_argv, index, flags) => {
    flags.disableTranslationCache = true;
    return index;
  },
};


function withDefinedValues<TValue extends Record<string, unknown>>(value: TValue): Partial<TValue> {
  const entries = Object.entries(value).filter((entry) => entry[1] !== undefined);
  return Object.fromEntries(entries) as Partial<TValue>;
}

function readFlagValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing required ${flag}`);
  }
  return value;
}

function parseEnum<TValue extends readonly string[]>(
  flag: string,
  value: string | undefined,
  validValues: TValue,
): TValue[number] {
  const raw = readFlagValue(flag, value);
  if ((validValues as readonly string[]).includes(raw)) {
    return raw as TValue[number];
  }
  throw new Error(`Invalid ${flag}: ${raw}`);
}

function requireAdoId(value: string | undefined): string {
  if (!value) {
    throw new Error('Missing required --ado-id');
  }
  return value;
}

function requireProposalId(value: string | undefined): string {
  if (!value) {
    throw new Error('Missing required --proposal-id');
  }
  return value;
}

function requireBenchmark(value: string | undefined): string {
  if (!value) {
    throw new Error('Missing required --benchmark');
  }
  return value;
}

function requireScreen(value: string | undefined): string {
  if (!value) {
    throw new Error('Missing required --screen');
  }
  return value;
}

function requireSection(value: string | undefined): string {
  if (!value) {
    throw new Error('Missing required --section');
  }
  return value;
}

function requireUrl(value: string | undefined): string {
  if (!value) {
    throw new Error('Missing required --url');
  }
  return value;
}

function requireNode(value: string | undefined): string {
  if (!value) {
    throw new Error('Missing required --node');
  }
  return value;
}

const commandRegistry: Record<CommandName, CommandSpec> = {
  sync: {
    flags: ['--all', '--ado-id', '--ado-source', '--ado-org-url', '--ado-project', '--ado-pat', '--ado-suite-path', '--ado-area-path', '--ado-iteration-path', '--ado-tag-filter'],
    parse: ({ flags }) => ({
      command: 'sync',
      strictExitOnUnbound: false,
      environment: withDefinedValues({
        TESSERACT_ADO_SOURCE: flags.adoSource,
        TESSERACT_ADO_ORG_URL: flags.adoOrgUrl,
        TESSERACT_ADO_PROJECT: flags.adoProject,
        TESSERACT_ADO_PAT: flags.adoPat,
        TESSERACT_ADO_SUITE_PATH: flags.adoSuitePath,
        TESSERACT_ADO_AREA_PATH: flags.adoAreaPath,
        TESSERACT_ADO_ITERATION_PATH: flags.adoIterationPath,
        TESSERACT_ADO_TAG: flags.adoTagFilter,
      }),
      postureInput: {},
      execute: (paths) => syncSnapshots({
        paths,
        ...(flags.adoId ? { adoId: createAdoId(flags.adoId) } : {}),
        ...(flags.all ? { all: true } : {}),
      }),
    }),
  },
  parse: {
    flags: ['--ado-id'],
    parse: ({ flags }) => ({
      command: 'parse',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => parseScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
    }),
  },
  bind: {
    flags: ['--ado-id', '--strict'],
    parse: ({ flags }) => ({
      command: 'bind',
      strictExitOnUnbound: Boolean(flags.strict),
      postureInput: {},
      execute: (paths) => bindScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
    }),
  },
  emit: {
    flags: ['--ado-id'],
    parse: ({ flags }) => ({
      command: 'emit',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => emitScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
    }),
  },
  compile: {
    flags: ['--ado-id'],
    parse: ({ flags }) => ({
      command: 'compile',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => compileScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
    }),
  },
  refresh: {
    flags: ['--ado-id'],
    parse: ({ flags }) => ({
      command: 'refresh',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => refreshScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
    }),
  },
  replay: {
    flags: ['--ado-id', '--runbook', '--provider', '--interpreter-mode'],
    parse: ({ flags }) => ({
      command: 'replay',
      strictExitOnUnbound: false,
      postureInput: withDefinedValues({
        interpreterMode: flags.interpreterMode,
      }),
      execute: (paths, posture) => replayInterpretation({
        adoId: createAdoId(requireAdoId(flags.adoId)),
        ...(flags.runbook ? { runbookName: flags.runbook } : {}),
        ...(flags.provider ? { providerId: flags.provider } : {}),
        interpreterMode: posture.interpreterMode === 'diagnostic' || posture.interpreterMode === 'dry-run'
          ? posture.interpreterMode
          : 'diagnostic',
        paths,
      }),
    }),
  },
  run: {
    flags: ['--ado-id', '--runbook', '--provider', '--tag', '--interpreter-mode', '--execution-profile', '--ci-batch', '--headed', '--no-write', '--baseline', '--disable-translation', '--disable-translation-cache'],
    parse: ({ flags }) => ({
      command: 'run',
      strictExitOnUnbound: false,
      postureInput: withDefinedValues({
        interpreterMode: flags.interpreterMode,
        executionProfile: flags.executionProfile,
        headed: flags.headed,
        noWrite: flags.noWrite,
        baseline: flags.baseline,
      }),
      execute: (paths, posture) => runScenarioSelection({
        ...(flags.adoId ? { adoId: createAdoId(flags.adoId) } : {}),
        ...(flags.runbook ? { runbookName: flags.runbook } : {}),
        ...(flags.tag ? { tag: flags.tag } : {}),
        ...(flags.provider ? { providerId: flags.provider } : {}),
        interpreterMode: posture.interpreterMode === 'diagnostic' || posture.interpreterMode === 'dry-run'
          ? posture.interpreterMode
          : 'diagnostic',
        posture,
        paths,
        disableTranslation: Boolean(flags.disableTranslation),
        disableTranslationCache: Boolean(flags.disableTranslationCache),
      }),
    }),
  },
  paths: {
    flags: ['--ado-id'],
    parse: ({ flags }) => ({
      command: 'paths',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => describeScenarioPaths({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
    }),
  },
  capture: {
    flags: ['--screen', '--section'],
    parse: ({ flags }) => ({
      command: 'capture',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => captureScreenSection({
        screen: createScreenId(requireScreen(flags.screen)),
        section: requireSection(flags.section),
        paths,
      }),
    }),
  },
  discover: {
    flags: ['--screen', '--url', '--root-selector'],
    parse: ({ flags }) => ({
      command: 'discover',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => discoverScreenScaffold({
        ...(flags.screen ? { screen: flags.screen } : {}),
        ...(flags.rootSelector ? { rootSelector: flags.rootSelector } : {}),
        url: requireUrl(flags.url),
        paths,
      }),
    }),
  },
  harvest: {
    flags: ['--routes', '--all', '--headed'],
    parse: ({ flags }) => {
      const execution: CommandExecution = {
        command: 'harvest',
        strictExitOnUnbound: false,
        postureInput: withDefinedValues({
          headed: flags.headed,
        }),
        execute: (paths) => harvestDeclaredRoutes({
          paths,
          ...(flags.routes ? { app: flags.routes } : {}),
          ...(flags.all ? { all: true } : {}),
        }),
      };
      if (flags.headed) {
        execution.environment = { TESSERACT_HEADLESS: '0' };
      }
      return execution;
    },
  },
  surface: {
    flags: ['--screen'],
    parse: ({ flags }) => ({
      command: 'surface',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => inspectSurface({ screen: createScreenId(requireScreen(flags.screen)), paths }),
    }),
  },
  graph: {
    flags: [],
    parse: () => ({
      command: 'graph',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => buildDerivedGraph({ paths }),
    }),
  },
  trace: {
    flags: ['--ado-id'],
    parse: ({ flags }) => ({
      command: 'trace',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => traceScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
    }),
  },
  impact: {
    flags: ['--node'],
    parse: ({ flags }) => ({
      command: 'impact',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => impactNode({ nodeId: requireNode(flags.nodeId), paths }),
    }),
  },
  types: {
    flags: [],
    parse: () => ({
      command: 'types',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => generateTypes({ paths }),
    }),
  },
  workflow: {
    flags: ['--ado-id', '--runbook'],
    parse: ({ flags }) => ({
      command: 'workflow',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => inspectWorkflow({
        paths,
        ...(flags.adoId ? { adoId: createAdoId(flags.adoId) } : {}),
        ...(flags.runbook ? { runbookName: flags.runbook } : {}),
      }),
    }),
  },
  inbox: {
    flags: ['--ado-id', '--kind', '--status'],
    parse: ({ flags }) => ({
      command: 'inbox',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => emitOperatorInbox({
        paths,
        filter: {
          ...(flags.adoId ? { adoId: flags.adoId } : {}),
          ...(flags.kind ? { kind: flags.kind } : {}),
          ...(flags.status ? { status: flags.status } : {}),
        },
      }),
    }),
  },
  approve: {
    flags: ['--proposal-id'],
    parse: ({ flags }) => ({
      command: 'approve',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => approveProposal({
        paths,
        proposalId: requireProposalId(flags.proposalId),
        }),
    }),
  },
  certify: {
    flags: ['--proposal-id'],
    parse: ({ flags }) => ({
      command: 'certify',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => approveProposal({
        paths,
        proposalId: requireProposalId(flags.proposalId),
      }),
    }),
  },
  'rerun-plan': {
    flags: ['--proposal-id'],
    parse: ({ flags }) => ({
      command: 'rerun-plan',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => buildRerunPlan({
        paths,
        proposalId: requireProposalId(flags.proposalId),
      }),
    }),
  },
  benchmark: {
    flags: ['--benchmark'],
    parse: ({ flags }) => ({
      command: 'benchmark',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => projectBenchmarkScorecard({
        paths,
        benchmarkName: requireBenchmark(flags.benchmark),
        includeExecution: true,
      }),
    }),
  },
  scorecard: {
    flags: ['--benchmark'],
    parse: ({ flags }) => ({
      command: 'scorecard',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => renderBenchmarkScorecard({
        paths,
        benchmarkName: requireBenchmark(flags.benchmark),
      }),
    }),
  },
  dogfood: {
    flags: ['--max-iterations', '--convergence-threshold', '--max-cost', '--tag', '--runbook', '--interpreter-mode'],
    parse: ({ flags }) => ({
      command: 'dogfood',
      strictExitOnUnbound: false,
      postureInput: withDefinedValues({
        interpreterMode: flags.interpreterMode,
      }),
      execute: (paths) => runDogfoodLoop({
        paths,
        maxIterations: flags.maxIterations ?? 2,
        convergenceThreshold: flags.convergenceThreshold,
        maxInstructionCount: flags.maxCost,
        tag: flags.tag,
        runbook: flags.runbook,
        interpreterMode: (flags.interpreterMode === 'playwright' ? 'diagnostic' : flags.interpreterMode) as 'dry-run' | 'diagnostic' | undefined,
      }),
    }),
  },
  workbench: {
    flags: ['--list', '--next', '--complete', '--skip', '--reason', '--skip-below'],
    parse: ({ flags }) => {
      const hasListFlag = Boolean(flags.list);
      const hasNextFlag = Boolean(flags.next);
      const completionId = flags.complete as string | undefined;
      const skipId = flags.skip as string | undefined;
      const reason = (flags.reason as string | undefined) ?? '';
      const skipBelow = flags.skipBelow as number | undefined;

      return {
        command: 'workbench',
        strictExitOnUnbound: false,
        postureInput: {},
        execute: (paths) => {
          // --next: return top-priority item
          if (hasNextFlag) {
            return nextWorkItem({ paths }).pipe(
              Effect.map((item) => item ?? { message: 'No pending work items.' }),
            );
          }
          // --complete <id>: mark item as completed
          if (completionId) {
            return completeWorkItem({
              paths,
              completion: {
                workItemId: completionId,
                status: 'completed',
                completedAt: new Date().toISOString(),
                rationale: reason || `Completed via CLI`,
                artifactsWritten: [],
              },
            });
          }
          // --skip <id>: mark item as skipped
          if (skipId) {
            return completeWorkItem({
              paths,
              completion: {
                workItemId: skipId,
                status: 'skipped',
                completedAt: new Date().toISOString(),
                rationale: reason || `Skipped via CLI`,
                artifactsWritten: [],
              },
            });
          }
          // --skip-below <threshold>: bulk skip low-priority items
          if (skipBelow !== undefined) {
            return loadAgentWorkbench({ paths }).pipe(
              Effect.flatMap((wb) => {
                if (!wb) return Effect.succeed([]);
                const toSkip = wb.items.filter((item) => item.priority < skipBelow);
                return Effect.all(
                  toSkip.map((item) => completeWorkItem({
                    paths,
                    completion: {
                      workItemId: item.id,
                      status: 'skipped',
                      completedAt: new Date().toISOString(),
                      rationale: `Auto-skipped: priority ${item.priority.toFixed(3)} below threshold ${skipBelow}`,
                      artifactsWritten: [],
                    },
                  })),
                  { concurrency: 1 },
                );
              }),
            );
          }
          // --list: load and return workbench
          if (hasListFlag) {
            return loadAgentWorkbench({ paths }).pipe(
              Effect.map((wb) => wb ?? { message: 'No workbench found. Run a speedrun first.' }),
            );
          }
          // default: emit (regenerate) workbench projection
          return emitAgentWorkbench({ paths });
        },
      };
    },
  },
};

function parseTokensRec(
  tokens: ReadonlyArray<string>,
  index: number,
  flags: ParsedFlags,
  spec: { readonly flags: ReadonlyArray<string> },
  command: string,
): ParsedFlags {
  if (index >= tokens.length) {
    return flags;
  }

  const token = tokens[index];
  if (!token || !token.startsWith('--')) {
    return parseTokensRec(tokens, index + 1, flags, spec, command);
  }

  if (!spec.flags.includes(token)) {
    throw new Error(`Unknown flag for ${command}: ${token}`);
  }

  const reader = flagReaders[token];
  if (!reader) {
    throw new Error(`Unsupported flag reader for ${token}`);
  }

  const nextIndex = reader(tokens as string[], index, flags);
  return parseTokensRec(tokens, nextIndex + 1, flags, spec, command);
}

export function parseCliInvocation(argv: string[]): CommandExecution {
  const [rawCommand = 'help', ...tokens] = argv;
  if (!isCommandName(rawCommand)) {
    throw new Error('Unknown command. Expected sync, parse, bind, emit, compile, refresh, run, replay, paths, capture, discover, harvest, surface, graph, trace, impact, types, workflow, inbox, approve, certify, rerun-plan, benchmark, scorecard, dogfood, or workbench.');
  }

  const spec = commandRegistry[rawCommand];
  const flags = parseTokensRec(tokens, 0, {}, spec, rawCommand);

  return spec.parse({ flags });
}

function isCommandName(value: string): value is CommandName {
  return (commandNames as readonly string[]).includes(value);
}

export function resolveExecutionPosture(input: CommandExecution['postureInput']): ExecutionPosture {
  const executionProfile = input.executionProfile ?? (process.env.CI ? 'ci-batch' : 'interactive');
  const interpreterMode = input.baseline ? 'dry-run' : (input.interpreterMode ?? 'diagnostic');
  const writeMode = input.noWrite || input.baseline ? 'no-write' : 'persist';
  return {
    interpreterMode,
    writeMode,
    executionProfile,
    headed: executionProfile === 'ci-batch' ? false : Boolean(input.headed),
  };
}

export function createCliPaths(rootDir: string, suiteRoot?: string): ProjectPaths {
  return createProjectPaths(rootDir, suiteRoot ?? path.join(rootDir, 'dogfood'));
}
