import type { Effect } from 'effect';
import type { ProjectPaths } from '../paths';
import type { ExecutionPosture, RuntimeInterpreterMode } from '../../domain/types';
import { TesseractError } from '../../domain/errors';

export const interpreterModes = ['playwright', 'dry-run', 'diagnostic'] as const;
export const executionProfiles = ['interactive', 'ci-batch'] as const;

export type InterpreterMode = (typeof interpreterModes)[number];
export type ExecutionProfile = (typeof executionProfiles)[number];

export interface ParsedFlags {
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
  count?: number;
  seed?: string;
  seeds?: string;
  substrate?: string;
  maxEpochs?: number;
  accepted?: boolean;
  top?: number;
  perturb?: number;
  autoEvolve?: boolean;
}

export interface ParseContext {
  readonly flags: ParsedFlags;
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
    isCI?: boolean;
  };
  execute(paths: ProjectPaths, posture: ExecutionPosture): Effect.Effect<unknown, unknown, unknown>;
}

export interface CommandSpec {
  readonly flags: readonly string[];
  readonly parse: (context: ParseContext) => CommandExecution;
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
  | 'workbench'
  | 'speedrun'
  | 'evolve'
  | 'experiments'
  | 'generate';

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
  'speedrun',
  'evolve',
  'experiments',
  'generate',
] as const;

export function withDefinedValues<TValue extends Record<string, unknown>>(value: TValue): Partial<TValue> {
  const entries = Object.entries(value).filter((entry) => entry[1] !== undefined);
  return Object.fromEntries(entries) as Partial<TValue>;
}

export function readFlagValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new TesseractError('invalid-argument', `Missing required ${flag}`);
  }
  return value;
}

export function parseEnum<TValue extends readonly string[]>(
  flag: string,
  value: string | undefined,
  validValues: TValue,
): TValue[number] {
  const raw = readFlagValue(flag, value);
  if ((validValues as readonly string[]).includes(raw)) {
    return raw as TValue[number];
  }
  throw new TesseractError('invalid-argument', `Invalid ${flag}: ${raw}`);
}

export function requireAdoId(value: string | undefined): string {
  if (!value) {
    throw new TesseractError('invalid-argument', 'Missing required --ado-id');
  }
  return value;
}

export function requireProposalId(value: string | undefined): string {
  if (!value) {
    throw new TesseractError('invalid-argument', 'Missing required --proposal-id');
  }
  return value;
}

export function requireBenchmark(value: string | undefined): string {
  if (!value) {
    throw new TesseractError('invalid-argument', 'Missing required --benchmark');
  }
  return value;
}

export function requireScreen(value: string | undefined): string {
  if (!value) {
    throw new TesseractError('invalid-argument', 'Missing required --screen');
  }
  return value;
}

export function requireSection(value: string | undefined): string {
  if (!value) {
    throw new TesseractError('invalid-argument', 'Missing required --section');
  }
  return value;
}

export function requireUrl(value: string | undefined): string {
  if (!value) {
    throw new TesseractError('invalid-argument', 'Missing required --url');
  }
  return value;
}

export function requireNode(value: string | undefined): string {
  if (!value) {
    throw new TesseractError('invalid-argument', 'Missing required --node');
  }
  return value;
}

export const flagReaders: Record<string, (argv: string[], index: number, flags: ParsedFlags) => number> = {
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
  '--count': (argv, index, flags) => {
    flags.count = Number(readFlagValue('--count', argv[index + 1]));
    return index + 1;
  },
  '--seed': (argv, index, flags) => {
    flags.seed = readFlagValue('--seed', argv[index + 1]);
    return index + 1;
  },
  '--seeds': (argv, index, flags) => {
    flags.seeds = readFlagValue('--seeds', argv[index + 1]);
    return index + 1;
  },
  '--substrate': (argv, index, flags) => {
    flags.substrate = readFlagValue('--substrate', argv[index + 1]);
    return index + 1;
  },
  '--max-epochs': (argv, index, flags) => {
    flags.maxEpochs = Number(readFlagValue('--max-epochs', argv[index + 1]));
    return index + 1;
  },
  '--accepted': (_argv, index, flags) => {
    flags.accepted = true;
    return index;
  },
  '--top': (argv, index, flags) => {
    flags.top = Number(readFlagValue('--top', argv[index + 1]));
    return index + 1;
  },
  '--perturb': (argv, index, flags) => {
    flags.perturb = Number(readFlagValue('--perturb', argv[index + 1]));
    return index + 1;
  },
  '--auto-evolve': (_argv, index, flags) => {
    flags.autoEvolve = true;
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
