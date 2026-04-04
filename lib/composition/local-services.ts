import { Effect, Layer } from 'effect';
import {
  AdoSource,
  ApplicationInterfaceGraphStore,
  Dashboard,
  DisabledDashboard,
  DisabledMcpServer,
  DisabledStageTracer,
  ExecutionContext,
  FileSystem,
  ImprovementRunStore,
  McpServer,
  PipelineConfigService,
  RuntimeScenarioRunner,
  StageTracer,
  InterventionLedgerStore,
  VersionControl,
} from '../application/ports';
import { makeLocalAdoSource } from '../infrastructure/ado/local-ado-source';
import { makeLiveAdoSource, readLiveAdoSourceConfigFromEnv } from '../infrastructure/ado/live-ado-source';
import { LocalFileSystem } from '../infrastructure/fs/local-fs';
import { createRecordingWorkspaceFileSystem } from '../infrastructure/fs/recording-fs';
import { LocalApplicationInterfaceGraphRepository } from '../infrastructure/repositories/local-application-interface-graph-repository';
import { LocalImprovementRunRepository } from '../infrastructure/repositories/local-improvement-run-repository';
import { LocalInterventionLedgerRepository } from '../infrastructure/repositories/local-intervention-ledger-repository';
import { makeLocalVersionControl } from '../infrastructure/tooling/local-version-control';
import { LocalRuntimeScenarioRunner, createLocalRuntimeScenarioRunnerWithInterpreter, createLocalRuntimeScenarioRunnerWithPool } from './local-runtime-scenario-runner';
import type { AgentInterpreterPort } from '../domain/resolution/model';
import type { AgentInterpretationResult } from '../domain/interpretation/agent-interpreter';
import { PlaywrightBridge, DisabledPlaywrightBridge } from '../infrastructure/mcp/playwright-mcp-bridge';
import { dashboardEvent } from '../domain/observation/dashboard';
import type { ExecutionPosture, PipelineConfig, WriteJournalEntry } from '../domain/types';
import { DEFAULT_PIPELINE_CONFIG } from '../domain/types';
import type { DashboardPort, McpServerPort, StageTracerPort } from '../application/ports';
import { enrichEventDataWithExecutionContext } from '../application/context/execution-context';
import type { PlaywrightBridgePort } from '../infrastructure/mcp/playwright-mcp-bridge';

type EffectfulAgentInterpreterPort = AgentInterpreterPort<Effect.Effect<AgentInterpretationResult, never, never>>;

export interface LocalServiceOptions {
  readonly posture?: Partial<ExecutionPosture> | undefined;
  readonly suiteRoot?: string | undefined;
  readonly pipelineConfig?: PipelineConfig | undefined;
  /** Inject a custom agent interpreter. When provided, the runtime scenario runner
   *  uses this provider at rung 9 instead of the default (env-resolved) provider.
   *  This is the injection point for Claude Code sessions, VSCode Copilot, MCP tools,
   *  and future dashboard integrations. */
  readonly agentInterpreter?: EffectfulAgentInterpreterPort | undefined;
  /** Inject a dashboard port for Effect-driven real-time visualization.
   *  When provided, the fiber emits events and pauses for human decisions. */
  readonly dashboard?: DashboardPort | undefined;
  /** Inject an MCP server port for WebMCP / Playwright MCP integration.
   *  Progressive enhancement: when available, agents get structured tool
   *  access to the same observables the spatial dashboard renders. */
  readonly mcpServer?: McpServerPort | undefined;
  /** Inject a Playwright bridge for headed browser interaction.
   *  Progressive enhancement: when available, agents get direct DOM access. */
  readonly playwrightBridge?: PlaywrightBridgePort | undefined;
  /** Inject a browser pool for page reuse across scenario runs.
   *  When provided, the runtime scenario runner acquires/releases pages from the pool
   *  instead of launching a new browser per scenario. */
  readonly browserPool?: import('../application/runtime-support/browser-pool').BrowserPoolPort | undefined;
}

export interface LocalServiceContext {
  readonly posture: ExecutionPosture;
  readonly writeJournal: () => readonly WriteJournalEntry[];
  readonly provide: <A, E, R>(program: Effect.Effect<A, E, R>) => Effect.Effect<A, E, never>;
}

function resolveExecutionPosture(posture?: Partial<ExecutionPosture> | undefined): ExecutionPosture {
  return {
    interpreterMode: posture?.interpreterMode ?? 'playwright',
    writeMode: posture?.writeMode ?? 'persist',
    headed: posture?.headed ?? false,
    executionProfile: posture?.executionProfile ?? (process.env.CI ? 'ci-batch' : 'interactive'),
  };
}

function resolveAdoSource(rootDir: string, suiteRoot?: string) {
  const selectedSource = process.env.TESSERACT_ADO_SOURCE?.trim().toLowerCase();
  if (selectedSource !== 'live') {
    return makeLocalAdoSource(rootDir, suiteRoot);
  }

  const config = readLiveAdoSourceConfigFromEnv(process.env);
  if (!config) {
    throw new Error('TESSERACT_ADO_SOURCE=live requires TESSERACT_ADO_ORG_URL, TESSERACT_ADO_PROJECT, TESSERACT_ADO_PAT, and TESSERACT_ADO_SUITE_PATH');
  }
  return makeLiveAdoSource(config);
}

export function createLocalServiceContext(rootDir: string, options?: LocalServiceOptions): LocalServiceContext {
  const posture = resolveExecutionPosture(options?.posture);
  const suiteRoot = options?.suiteRoot;
  const journal: WriteJournalEntry[] = [];
  const fileSystem = createRecordingWorkspaceFileSystem({
    rootDir,
    suiteRoot,
    posture,
    delegate: LocalFileSystem,
    journal,
  });
  const executionContext = {
    posture,
    writeJournal: () => [...journal],
  };

  const pipelineConfig = options?.pipelineConfig ?? DEFAULT_PIPELINE_CONFIG;
  const runtimeScenarioRunner = options?.browserPool
    ? createLocalRuntimeScenarioRunnerWithPool(options.browserPool, options.agentInterpreter)
    : options?.agentInterpreter
      ? createLocalRuntimeScenarioRunnerWithInterpreter(options.agentInterpreter)
      : LocalRuntimeScenarioRunner;
  const dashboard = options?.dashboard ?? DisabledDashboard;
  const stageTracer: StageTracerPort = options?.dashboard
    ? {
      emitStageStart: (data: unknown) => Effect.flatMap(
        enrichEventDataWithExecutionContext(data),
        (enriched) => dashboard.emit(dashboardEvent('stage-lifecycle', enriched)),
      ).pipe(Effect.catchAll(() => Effect.void)),
      emitStageComplete: (data: unknown) => Effect.flatMap(
        enrichEventDataWithExecutionContext(data),
        (enriched) => dashboard.emit(dashboardEvent('stage-lifecycle', enriched)),
      ).pipe(Effect.catchAll(() => Effect.void)),
    }
    : DisabledStageTracer;

  const layer = Layer.mergeAll(
    Layer.succeed(FileSystem, fileSystem),
    Layer.succeed(AdoSource, resolveAdoSource(rootDir, suiteRoot)),
    Layer.succeed(RuntimeScenarioRunner, runtimeScenarioRunner),
    Layer.succeed(ExecutionContext, executionContext),
    Layer.succeed(PipelineConfigService, { config: pipelineConfig }),
    Layer.succeed(VersionControl, makeLocalVersionControl(rootDir)),
    Layer.succeed(Dashboard, dashboard),
    Layer.succeed(StageTracer, stageTracer),
    Layer.succeed(McpServer, options?.mcpServer ?? DisabledMcpServer),
    Layer.succeed(PlaywrightBridge, options?.playwrightBridge ?? DisabledPlaywrightBridge),
    Layer.succeed(ApplicationInterfaceGraphStore, LocalApplicationInterfaceGraphRepository),
    Layer.succeed(InterventionLedgerStore, LocalInterventionLedgerRepository),
    Layer.succeed(ImprovementRunStore, LocalImprovementRunRepository),
  );

  return {
    posture,
    writeJournal: () => executionContext.writeJournal(),
    provide<A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, never> {
      return Effect.provide(
        program as Effect.Effect<A, E, FileSystem | AdoSource | RuntimeScenarioRunner | ExecutionContext | PipelineConfigService | VersionControl | Dashboard | StageTracer | McpServer | PlaywrightBridge | ApplicationInterfaceGraphStore | InterventionLedgerStore | ImprovementRunStore>,
        layer,
      ) as Effect.Effect<A, E, never>;
    },
  };
}

export function provideLocalServices<A, E, R>(
  program: Effect.Effect<A, E, R>,
  rootDir: string,
  options?: LocalServiceOptions,
): Effect.Effect<A, E, never> {
  return createLocalServiceContext(rootDir, options).provide(program);
}

export interface RunWithLocalServicesResult<A> {
  readonly result: A;
  readonly posture: ExecutionPosture;
  readonly wouldWrite: readonly WriteJournalEntry[];
}

export function runWithLocalServices<A, E, R>(
  program: Effect.Effect<A, E, R>,
  rootDir: string,
  options?: LocalServiceOptions,
): Promise<A> {
  return Effect.runPromise(provideLocalServices(program, rootDir, options));
}

export async function runWithLocalServicesDetailed<A, E, R>(
  program: Effect.Effect<A, E, R>,
  rootDir: string,
  options?: LocalServiceOptions,
): Promise<RunWithLocalServicesResult<A>> {
  const context = createLocalServiceContext(rootDir, options);
  const result = await Effect.runPromise(context.provide(program));
  return {
    result,
    posture: context.posture,
    wouldWrite: [...context.writeJournal()],
  };
}
