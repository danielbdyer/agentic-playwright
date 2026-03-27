import { Effect, Context } from 'effect';
import type { AdoId } from '../domain/identity';
import type { ResolutionEngine } from './resolution-engine';
import type { TranslationProvider } from './translation-provider';
import type { TesseractError } from '../domain/errors';
import type {
  ExecutionPosture,
  PipelineConfig,
  ResolutionReceipt,
  RuntimeInterpreterMode,
  ScenarioRunPlan,
  StepExecutionReceipt,
  WriteJournalEntry,
} from '../domain/types';

export interface FileSystemPort {
  readText(path: string): Effect.Effect<string, TesseractError>;
  writeText(path: string, contents: string): Effect.Effect<void, TesseractError>;
  readJson(path: string): Effect.Effect<unknown, TesseractError>;
  writeJson(path: string, value: unknown): Effect.Effect<void, TesseractError>;
  exists(path: string): Effect.Effect<boolean, TesseractError>;
  listDir(path: string): Effect.Effect<string[], TesseractError>;
  ensureDir(path: string): Effect.Effect<void, TesseractError>;
  removeDir(path: string): Effect.Effect<void, TesseractError>;
}

export interface ExecutionContextPort {
  posture: ExecutionPosture;
  writeJournal(): readonly WriteJournalEntry[];
}

export interface VersionControlPort {
  currentRevision(): Effect.Effect<string, TesseractError>;
  restoreToHead(paths: readonly string[]): Effect.Effect<void, TesseractError>;
}

export interface AdoSourcePort {
  listSnapshotIds(): Effect.Effect<AdoId[], TesseractError>;
  loadSnapshot(adoId: AdoId): Effect.Effect<unknown, TesseractError>;
}

export type RuntimeScenarioMode = RuntimeInterpreterMode;

export interface RuntimeScenarioStepResult {
  readonly interpretation: ResolutionReceipt;
  readonly execution: StepExecutionReceipt;
}

export interface RuntimeScenarioRunnerPort {
  runSteps(input: {
    rootDir: string;
    suiteRoot?: string | undefined;
    plan: ScenarioRunPlan;
    resolutionEngine: ResolutionEngine;
    translationOptions?: {
      disableTranslation?: boolean | undefined;
      disableTranslationCache?: boolean | undefined;
      translationProvider?: TranslationProvider | undefined;
    } | undefined;
  }): Effect.Effect<RuntimeScenarioStepResult[], unknown>;
}

export class FileSystem extends Context.Tag('tesseract/FileSystem')<FileSystem, FileSystemPort>() {}
export class AdoSource extends Context.Tag('tesseract/AdoSource')<AdoSource, AdoSourcePort>() {}
export class RuntimeScenarioRunner extends Context.Tag('tesseract/RuntimeScenarioRunner')<RuntimeScenarioRunner, RuntimeScenarioRunnerPort>() {}
export class ExecutionContext extends Context.Tag('tesseract/ExecutionContext')<ExecutionContext, ExecutionContextPort>() {}
export class PipelineConfigService extends Context.Tag('tesseract/PipelineConfig')<PipelineConfigService, { readonly config: PipelineConfig }>() {}
export class VersionControl extends Context.Tag('tesseract/VersionControl')<VersionControl, VersionControlPort>() {}

// ─── Screen Observation (MCP integration surface) ───

export interface ScreenObservationResult {
  readonly url: string;
  readonly ariaSnapshot: string | null;
  readonly elementObservations: ReadonlyArray<{
    readonly element: string;
    readonly found: boolean;
    readonly visible: boolean;
    readonly enabled: boolean;
    readonly ariaLabel: string | null;
    readonly locatorRung: number;
    readonly locatorStrategy: string;
  }>;
}

export interface ScreenObservationPort {
  readonly observe: (input: {
    readonly url: string;
    readonly elements: ReadonlyArray<{
      readonly element: string;
      readonly locator: readonly import('../domain/types').LocatorStrategy[];
      readonly role: string;
      readonly name: string | null;
    }>;
  }) => Effect.Effect<ScreenObservationResult, TesseractError>;
}

/** Disabled observer for CI/batch — returns empty observations. */
export const DisabledScreenObserver: ScreenObservationPort = {
  observe: () => Effect.succeed({ url: '', ariaSnapshot: null, elementObservations: [] }),
};

export class ScreenObserver extends Context.Tag('tesseract/ScreenObserver')<ScreenObserver, ScreenObservationPort>() {}

// ─── Dashboard (Effect fiber → React view) ───

export interface DashboardPort {
  /** Fire-and-forget: emit event to all connected dashboard clients. */
  readonly emit: (event: import('../domain/types').DashboardEvent) => Effect.Effect<void, never, never>;
  /** Fiber pause: send work item to dashboard, await human decision.
   *  The fiber suspends until the human clicks approve/skip in the UI. */
  readonly awaitDecision: (item: import('../domain/types').AgentWorkItem) => Effect.Effect<import('../domain/types').WorkItemDecision, never, never>;
}

/** Disabled dashboard for CI/batch — auto-skips all decisions. */
export const DisabledDashboard: DashboardPort = {
  emit: () => Effect.succeed(undefined),
  awaitDecision: (item) => Effect.succeed({
    workItemId: item.id,
    status: 'skipped' as const,
    rationale: 'No dashboard connected',
  }),
};

export class Dashboard extends Context.Tag('tesseract/Dashboard')<Dashboard, DashboardPort>() {}

// ─── MCP Tool Server (WebMCP / Playwright MCP progressive enhancement) ───
//
// The MCP port exposes Tesseract's observation and action surface as
// structured tools that agents can invoke. This is representationally
// coherent with the spatial dashboard — same data, structured access.
//
// Progressive enhancement: when no MCP server is available, the dashboard
// falls back to screenshot textures + WS events. When MCP is available,
// agents get structured tool access to the same observables.

export interface McpToolInvocation {
  readonly tool: string;
  readonly arguments: Record<string, unknown>;
}

export interface McpToolResult {
  readonly tool: string;
  readonly result: unknown;
  readonly isError: boolean;
}

export interface McpServerPort {
  /** Handle an incoming MCP tool invocation. Returns the tool result. */
  readonly handleToolCall: (invocation: McpToolInvocation) => Effect.Effect<McpToolResult, TesseractError>;
  /** List available tools (for MCP catalog negotiation). */
  readonly listTools: () => Effect.Effect<readonly import('../domain/types').McpToolDefinition[], never, never>;
}

/** Disabled MCP server for environments without MCP support. */
export const DisabledMcpServer: McpServerPort = {
  handleToolCall: (inv) => Effect.succeed({ tool: inv.tool, result: { error: 'MCP server not available' }, isError: true }),
  listTools: () => Effect.succeed([]),
};

export class McpServer extends Context.Tag('tesseract/McpServer')<McpServer, McpServerPort>() {}
