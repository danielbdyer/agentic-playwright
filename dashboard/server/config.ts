import path from 'path';

export type InterpreterMode = 'dry-run' | 'diagnostic' | 'playwright';
export type KnowledgePosture = 'warm-start' | 'cold-start' | 'production';

export interface DashboardSpeedrunConfig {
  readonly enabled: boolean;
  readonly count: number;
  readonly seed: string;
  readonly maxIterations: number;
  readonly posture: KnowledgePosture;
  readonly mode: InterpreterMode;
}

export interface DashboardServerConfig {
  readonly port: number;
  readonly rootDir: string;
  readonly dashboardDir: string;
  readonly journalEnabled: boolean;
  readonly journalRunId: string;
  readonly speedrun: DashboardSpeedrunConfig;
}

const argAfter = (argv: readonly string[], flag: string): string | null => {
  const idx = argv.indexOf(flag);
  return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] ?? null : null;
};

const hasFlag = (argv: readonly string[], flag: string): boolean => argv.includes(flag);

const toInt = (value: string | null, fallback: number): number => {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Generate a filesystem-safe run ID from a timestamp. */
export const generateRunId = (now: Date = new Date()): string =>
  `run-${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

export const parseDashboardConfig = (input: {
  readonly argv?: readonly string[];
  readonly serverDir: string;
  readonly now?: Date;
}): DashboardServerConfig => {
  const argv = input.argv ?? process.argv;
  const speedrun = hasFlag(argv, '--speedrun');
  const journalFlag = hasFlag(argv, '--journal');

  const rootDir = path.resolve(input.serverDir, '..');

  const modeRaw = argAfter(argv, '--mode');
  const mode: InterpreterMode = modeRaw === 'dry-run' || modeRaw === 'diagnostic' || modeRaw === 'playwright'
    ? modeRaw
    : 'playwright';

  const postureRaw = argAfter(argv, '--posture');
  const posture: KnowledgePosture = postureRaw === 'cold-start' || postureRaw === 'production' || postureRaw === 'warm-start'
    ? postureRaw
    : 'warm-start';

  return {
    port: toInt(argAfter(argv, '--port'), 3100),
    rootDir,
    dashboardDir: input.serverDir,
    journalEnabled: journalFlag || speedrun,
    journalRunId: argAfter(argv, '--run-id') ?? generateRunId(input.now),
    speedrun: {
      enabled: speedrun,
      count: toInt(argAfter(argv, '--count'), 50),
      seed: argAfter(argv, '--seed') ?? 'speedrun-v1',
      maxIterations: toInt(argAfter(argv, '--max-iterations'), 5),
      posture,
      mode,
    },
  };
};
