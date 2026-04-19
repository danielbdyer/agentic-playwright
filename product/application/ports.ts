import { Effect, Context } from 'effect';
import type { AdoId } from '../domain/kernel/identity';
import type { ResolutionEngine } from './resolution/resolution-engine';
import type { TranslationProvider } from '../reasoning/translation-provider';
import { TesseractError } from '../domain/kernel/errors';
import type { ApplicationInterfaceGraphRepository } from '../domain/interface/application-interface-graph-repository';
import type { InterventionLedgerRepository } from '../domain/agency/intervention-ledger-repository';
import type { ImprovementRunRepository } from '../domain/improvement/improvement-run-repository';
import type { PipelineConfig } from '../domain/attention/pipeline-config';
import type { StepExecutionReceipt } from '../domain/execution/types';
import type {
  ExecutionPosture,
  LocatorStrategy,
  RuntimeInterpreterMode,
  WriteJournalEntry,
} from '../domain/governance/workflow-types';
import type { AgentWorkItem } from '../domain/handshake/workbench';
import type { DashboardEvent, McpToolDefinition, WorkItemDecision } from '../domain/observation/dashboard';
import type { ResolutionReceipt, ScenarioRunPlan } from '../domain/resolution/types';

export interface FileSystemPort {
  readText(path: string): Effect.Effect<string, TesseractError>;
  writeText(path: string, contents: string): Effect.Effect<void, TesseractError>;
  readJson(path: string): Effect.Effect<unknown, TesseractError>;
  writeJson(path: string, value: unknown): Effect.Effect<void, TesseractError>;
  stat(path: string): Effect.Effect<{ readonly mtimeMs: number }, TesseractError>;
  exists(path: string): Effect.Effect<boolean, TesseractError>;
  removeFile(path: string): Effect.Effect<void, TesseractError>;
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
      readonly locator: readonly LocatorStrategy[];
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
//
// ARCHITECTURAL INVARIANT: The dashboard is a projection, never a dependency.
//
//   1. Observation events (emit) flow freely — fire-and-forget, never block the fiber.
//   2. Decision gates (awaitDecision) are OPT-IN and always have a timeout fallback.
//   3. The pipeline runs identically with DisabledDashboard (headless default).
//   4. The frontend is a progressive enhancement layer — toggling it on/off
//      must not change pipeline behavior or output.
//   5. Any decision the dashboard can make, an agent or heuristic can also make.
//      The dashboard is one consumer of the DashboardPort interface, not the only one.
//
// The DisabledDashboard auto-skips all decisions instantly. The pipeline event bus
// defaults to decisionTimeoutMs: 0 (instant auto-skip). The WS adapter's 60s timeout
// is only active when a human explicitly opts into interactive mode.

export interface DashboardPort {
  /** Fire-and-forget: emit event to all connected dashboard clients.
   *  Never blocks the fiber. O(1) — publish to PubSub or no-op. */
  readonly emit: (event: DashboardEvent) => Effect.Effect<void, never, never>;
  /** Opt-in fiber pause: send work item to dashboard, await decision.
   *  Always has a timeout fallback — never blocks indefinitely.
   *  DisabledDashboard auto-skips instantly (no pause). */
  readonly awaitDecision: (item: AgentWorkItem) => Effect.Effect<WorkItemDecision, never, never>;
}

/** Disabled dashboard for CI/batch — auto-skips all decisions instantly.
 *  This is the default. The pipeline runs identically headless. */
export const DisabledDashboard: DashboardPort = {
  emit: () => Effect.succeed(undefined),
  awaitDecision: (item) => Effect.succeed({
    workItemId: item.id,
    status: 'skipped' as const,
    rationale: 'No dashboard connected — headless auto-skip',
  }),
};

export class Dashboard extends Context.Tag('tesseract/Dashboard')<Dashboard, DashboardPort>() {}

// ─── Stage Tracer (pipeline stage lifecycle projection) ───

export interface StageTracerPort {
  readonly emitStageStart: (data: unknown) => Effect.Effect<void, never, never>;
  readonly emitStageComplete: (data: unknown) => Effect.Effect<void, never, never>;
}

/** Disabled stage tracer for CI/batch — emits nothing. */
export const DisabledStageTracer: StageTracerPort = {
  emitStageStart: () => Effect.succeed(undefined),
  emitStageComplete: () => Effect.succeed(undefined),
};

export class StageTracer extends Context.Tag('tesseract/StageTracer')<StageTracer, StageTracerPort>() {}

export class ApplicationInterfaceGraphStore extends Context.Tag('tesseract/ApplicationInterfaceGraphStore')<ApplicationInterfaceGraphStore, ApplicationInterfaceGraphRepository>() {}
export class InterventionLedgerStore extends Context.Tag('tesseract/InterventionLedgerStore')<InterventionLedgerStore, InterventionLedgerRepository>() {}
export class ImprovementRunStore extends Context.Tag('tesseract/ImprovementRunStore')<ImprovementRunStore, ImprovementRunRepository>() {}

// ─── MCP Tool Server (WebMCP / Playwright MCP progressive enhancement) ───
//
// The MCP port exposes Tesseract's observation and action surface as
// structured tools that agents can invoke. This is representationally
// coherent with the spatial dashboard — same data, structured access.
//
// Progressive enhancement: when no MCP server is available, the dashboard
// falls back to screenshot textures + WS events. When MCP is available,
// agents get structured tool access to the same observables.

import type { McpToolInvocation, McpToolResult } from '../domain/observation/dashboard';
export type { McpToolInvocation, McpToolResult } from '../domain/observation/dashboard';

/** MCP resource descriptor for resources/list. */
export interface McpResource {
  readonly uri: string;
  readonly name: string;
  readonly description: string;
  readonly mimeType: string;
}

/** MCP resource content for resources/read. */
export interface McpResourceContent {
  readonly uri: string;
  readonly mimeType: string;
  readonly text: string;
}

export interface McpServerPort {
  /** Handle an incoming MCP tool invocation. Returns the tool result. */
  readonly handleToolCall: (invocation: McpToolInvocation) => Effect.Effect<McpToolResult, TesseractError>;
  /** List available tools (for MCP catalog negotiation). */
  readonly listTools: () => Effect.Effect<readonly McpToolDefinition[], never, never>;
  /** List available resources (for MCP resource negotiation). */
  readonly listResources: () => Effect.Effect<readonly McpResource[], never, never>;
  /** Read a resource by URI. */
  readonly readResource: (uri: string) => Effect.Effect<McpResourceContent, TesseractError>;
}

/** Disabled MCP server for environments without MCP support. */
export const DisabledMcpServer: McpServerPort = {
  handleToolCall: (inv) => Effect.succeed({ tool: inv.tool, result: { error: 'MCP server not available' }, isError: true }),
  listTools: () => Effect.succeed([]),
  listResources: () => Effect.succeed([]),
  readResource: (uri) => Effect.fail(new TesseractError('mcp-disabled', `MCP server not available (requested: ${uri})`)),
};

export class McpServer extends Context.Tag('tesseract/McpServer')<McpServer, McpServerPort>() {}
