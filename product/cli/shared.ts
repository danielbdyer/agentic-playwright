import type { Effect } from 'effect';
import type { ProjectPaths } from '../application/paths';
import type { ExecutionPosture, RuntimeInterpreterMode } from '../domain/governance/workflow-types';
import { TesseractError } from '../domain/kernel/errors';

export const interpreterModes = ['playwright', 'dry-run', 'diagnostic'] as const;
export const executionProfiles = ['interactive', 'ci-batch'] as const;
export const probeAdapters = [
  'dry-harness',
  'fixture-replay',
  'playwright-live',
  'production',
] as const;

export type InterpreterMode = (typeof interpreterModes)[number];
export type ExecutionProfile = (typeof executionProfiles)[number];
export type ProbeAdapter = (typeof probeAdapters)[number];

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
  posture?: string;
  adapter?: ProbeAdapter;
}

export type FlagName = keyof typeof flagDescriptorTable;
type FlagToParsedKey = {
  '--all': 'all';
  '--strict': 'strict';
  '--headed': 'headed';
  '--no-write': 'noWrite';
  '--baseline': 'baseline' | 'noWrite' | 'interpreterMode';
  '--ado-id': 'adoId';
  '--ado-source': 'adoSource';
  '--ado-org-url': 'adoOrgUrl';
  '--ado-project': 'adoProject';
  '--ado-pat': 'adoPat';
  '--ado-suite-path': 'adoSuitePath';
  '--ado-area-path': 'adoAreaPath';
  '--ado-iteration-path': 'adoIterationPath';
  '--ado-tag-filter': 'adoTagFilter';
  '--screen': 'screen';
  '--runbook': 'runbook';
  '--provider': 'provider';
  '--max-iterations': 'maxIterations';
  '--convergence-threshold': 'convergenceThreshold';
  '--max-cost': 'maxCost';
  '--tag': 'tag';
  '--proposal-id': 'proposalId';
  '--complete': 'complete';
  '--skip': 'skip';
  '--reason': 'reason';
  '--skip-below': 'skipBelow';
  '--list': 'list';
  '--next': 'next';
  '--count': 'count';
  '--seed': 'seed';
  '--seeds': 'seeds';
  '--substrate': 'substrate';
  '--max-epochs': 'maxEpochs';
  '--accepted': 'accepted';
  '--top': 'top';
  '--perturb': 'perturb';
  '--auto-evolve': 'autoEvolve';
  '--benchmark': 'benchmark';
  '--kind': 'kind';
  '--status': 'status';
  '--url': 'url';
  '--root-selector': 'rootSelector';
  '--routes': 'routes';
  '--section': 'section';
  '--interpreter-mode': 'interpreterMode';
  '--ci-batch': 'executionProfile';
  '--execution-profile': 'executionProfile';
  '--node': 'nodeId';
  '--disable-translation': 'disableTranslation';
  '--disable-translation-cache': 'disableTranslationCache';
  '--posture': 'posture';
  '--adapter': 'adapter';
};
type ParsedFlagKeys<TFlags extends readonly FlagName[]> = FlagToParsedKey[TFlags[number]];
export type ParsedFlagsFor<TFlags extends readonly FlagName[]> = Partial<Pick<ParsedFlags, ParsedFlagKeys<TFlags>>>;

export interface ParseContext<TFlags extends ParsedFlags = ParsedFlags> {
  readonly flags: TFlags;
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

export interface CommandSpec<TFlags extends ParsedFlags = ParsedFlags> {
  readonly flags: readonly FlagName[];
  readonly parse: (context: ParseContext<TFlags>) => CommandExecution;
}

export function createCommandSpec<const TFlags extends readonly FlagName[]>(spec: {
  readonly flags: TFlags;
  readonly parse: (context: ParseContext<ParsedFlagsFor<TFlags>>) => CommandExecution;
}): CommandSpec<ParsedFlagsFor<TFlags>> {
  return spec;
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
  | 'evolve'
  | 'experiments'
  | 'generate'
  | 'probe-spike';

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
  'evolve',
  'experiments',
  'generate',
  'probe-spike',
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

type FlagArity = 0 | 1;
type FlagDecoder<TValue> = (value: string | undefined) => TValue;
type FlagDescriptor<TKey extends keyof ParsedFlags> = {
  readonly name: `--${string}`;
  readonly arity: FlagArity;
  readonly decoder: FlagDecoder<ParsedFlags[TKey]>;
  readonly merge: (flags: ParsedFlags, decoded: ParsedFlags[TKey]) => ParsedFlags;
};

const mergeFlag = <TKey extends keyof ParsedFlags>(key: TKey) =>
  (flags: ParsedFlags, decoded: ParsedFlags[TKey]): ParsedFlags => ({ ...flags, [key]: decoded });

const booleanDescriptor = <TKey extends keyof ParsedFlags>(
  name: `--${string}`,
  key: TKey,
  options?: { readonly merge?: (flags: ParsedFlags, decoded: true) => ParsedFlags },
): FlagDescriptor<TKey> => ({
  name,
  arity: 0,
  decoder: () => true as ParsedFlags[TKey],
  merge: options?.merge as FlagDescriptor<TKey>['merge'] ?? (mergeFlag(key) as FlagDescriptor<TKey>['merge']),
});

const valueDescriptor = <TKey extends keyof ParsedFlags>(
  name: `--${string}`,
  key: TKey,
  decoder: FlagDecoder<ParsedFlags[TKey]>,
): FlagDescriptor<TKey> => ({
  name,
  arity: 1,
  decoder,
  merge: mergeFlag(key),
});

export const flagDescriptorTable = {
  '--all': booleanDescriptor('--all', 'all'),
  '--strict': booleanDescriptor('--strict', 'strict'),
  '--headed': booleanDescriptor('--headed', 'headed'),
  '--no-write': booleanDescriptor('--no-write', 'noWrite'),
  '--baseline': booleanDescriptor('--baseline', 'baseline', {
    merge: (flags) => ({ ...flags, baseline: true, noWrite: true, interpreterMode: 'dry-run' }),
  }),
  '--ado-id': valueDescriptor('--ado-id', 'adoId', (value) => readFlagValue('--ado-id', value)),
  '--ado-source': valueDescriptor('--ado-source', 'adoSource', (value) => parseEnum('--ado-source', value, ['fixture', 'live'] as const)),
  '--ado-org-url': valueDescriptor('--ado-org-url', 'adoOrgUrl', (value) => readFlagValue('--ado-org-url', value)),
  '--ado-project': valueDescriptor('--ado-project', 'adoProject', (value) => readFlagValue('--ado-project', value)),
  '--ado-pat': valueDescriptor('--ado-pat', 'adoPat', (value) => readFlagValue('--ado-pat', value)),
  '--ado-suite-path': valueDescriptor('--ado-suite-path', 'adoSuitePath', (value) => readFlagValue('--ado-suite-path', value)),
  '--ado-area-path': valueDescriptor('--ado-area-path', 'adoAreaPath', (value) => readFlagValue('--ado-area-path', value)),
  '--ado-iteration-path': valueDescriptor('--ado-iteration-path', 'adoIterationPath', (value) => readFlagValue('--ado-iteration-path', value)),
  '--ado-tag-filter': valueDescriptor('--ado-tag-filter', 'adoTagFilter', (value) => readFlagValue('--ado-tag-filter', value)),
  '--screen': valueDescriptor('--screen', 'screen', (value) => readFlagValue('--screen', value)),
  '--runbook': valueDescriptor('--runbook', 'runbook', (value) => readFlagValue('--runbook', value)),
  '--provider': valueDescriptor('--provider', 'provider', (value) => readFlagValue('--provider', value)),
  '--max-iterations': valueDescriptor('--max-iterations', 'maxIterations', (value) => Number(readFlagValue('--max-iterations', value))),
  '--convergence-threshold': valueDescriptor('--convergence-threshold', 'convergenceThreshold', (value) => Number(readFlagValue('--convergence-threshold', value))),
  '--max-cost': valueDescriptor('--max-cost', 'maxCost', (value) => Number(readFlagValue('--max-cost', value))),
  '--tag': valueDescriptor('--tag', 'tag', (value) => readFlagValue('--tag', value)),
  '--proposal-id': valueDescriptor('--proposal-id', 'proposalId', (value) => readFlagValue('--proposal-id', value)),
  '--complete': valueDescriptor('--complete', 'complete', (value) => readFlagValue('--complete', value)),
  '--skip': valueDescriptor('--skip', 'skip', (value) => readFlagValue('--skip', value)),
  '--reason': valueDescriptor('--reason', 'reason', (value) => readFlagValue('--reason', value)),
  '--skip-below': valueDescriptor('--skip-below', 'skipBelow', (value) => Number(readFlagValue('--skip-below', value))),
  '--list': booleanDescriptor('--list', 'list'),
  '--next': booleanDescriptor('--next', 'next'),
  '--count': valueDescriptor('--count', 'count', (value) => Number(readFlagValue('--count', value))),
  '--seed': valueDescriptor('--seed', 'seed', (value) => readFlagValue('--seed', value)),
  '--seeds': valueDescriptor('--seeds', 'seeds', (value) => readFlagValue('--seeds', value)),
  '--substrate': valueDescriptor('--substrate', 'substrate', (value) => readFlagValue('--substrate', value)),
  '--max-epochs': valueDescriptor('--max-epochs', 'maxEpochs', (value) => Number(readFlagValue('--max-epochs', value))),
  '--accepted': booleanDescriptor('--accepted', 'accepted'),
  '--top': valueDescriptor('--top', 'top', (value) => Number(readFlagValue('--top', value))),
  '--perturb': valueDescriptor('--perturb', 'perturb', (value) => Number(readFlagValue('--perturb', value))),
  '--auto-evolve': booleanDescriptor('--auto-evolve', 'autoEvolve'),
  '--benchmark': valueDescriptor('--benchmark', 'benchmark', (value) => readFlagValue('--benchmark', value)),
  '--kind': valueDescriptor('--kind', 'kind', (value) => readFlagValue('--kind', value)),
  '--status': valueDescriptor('--status', 'status', (value) => readFlagValue('--status', value)),
  '--url': valueDescriptor('--url', 'url', (value) => readFlagValue('--url', value)),
  '--root-selector': valueDescriptor('--root-selector', 'rootSelector', (value) => readFlagValue('--root-selector', value)),
  '--routes': valueDescriptor('--routes', 'routes', (value) => readFlagValue('--routes', value)),
  '--section': valueDescriptor('--section', 'section', (value) => readFlagValue('--section', value)),
  '--interpreter-mode': valueDescriptor('--interpreter-mode', 'interpreterMode', (value) => parseEnum('--interpreter-mode', value, interpreterModes)),
  '--ci-batch': booleanDescriptor('--ci-batch', 'executionProfile', {
    merge: (flags) => ({ ...flags, executionProfile: 'ci-batch' }),
  }),
  '--execution-profile': valueDescriptor('--execution-profile', 'executionProfile', (value) => parseEnum('--execution-profile', value, executionProfiles)),
  '--node': valueDescriptor('--node', 'nodeId', (value) => readFlagValue('--node', value)),
  '--disable-translation': booleanDescriptor('--disable-translation', 'disableTranslation'),
  '--disable-translation-cache': booleanDescriptor('--disable-translation-cache', 'disableTranslationCache'),
  '--posture': valueDescriptor('--posture', 'posture', (value) => readFlagValue('--posture', value)),
  '--adapter': valueDescriptor('--adapter', 'adapter', (value) => parseEnum('--adapter', value, probeAdapters)),
} as const;

export type FlagDecodeResult = {
  readonly nextIndex: number;
  readonly flags: ParsedFlags;
};

function decodeFlagWithDescriptor<TKey extends keyof ParsedFlags>(
  descriptor: FlagDescriptor<TKey>,
  tokens: ReadonlyArray<string>,
  index: number,
  flags: ParsedFlags,
): FlagDecodeResult {
  const rawValue = descriptor.arity === 0 ? undefined : tokens[index + 1];
  const decoded = descriptor.decoder(rawValue) as ParsedFlags[TKey];
  return {
    nextIndex: descriptor.arity === 0 ? index : index + 1,
    flags: descriptor.merge(flags, decoded),
  };
}

export const flagDecoders: Record<FlagName, (tokens: ReadonlyArray<string>, index: number, flags: ParsedFlags) => FlagDecodeResult> =
  (Object.entries(flagDescriptorTable) as ReadonlyArray<[FlagName, (typeof flagDescriptorTable)[FlagName]]>).reduce(
    (acc, [name, descriptor]) => ({
      ...acc,
      [name]: (tokens: ReadonlyArray<string>, index: number, flags: ParsedFlags) =>
        decodeFlagWithDescriptor(descriptor as FlagDescriptor<keyof ParsedFlags>, tokens, index, flags),
    }),
    {} as Record<FlagName, (tokens: ReadonlyArray<string>, index: number, flags: ParsedFlags) => FlagDecodeResult>,
  );
