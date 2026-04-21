/**
 * Dashboard MCP server configuration types — carved out of
 * `dashboard/mcp/dashboard-mcp-server.ts` at Step 4a per
 * `docs/v2-direction.md §6 Step 4a` and §3.7's named split.
 *
 * Pure interface definitions for the server's options bag and
 * four lifecycle / contribution payloads. Extracting them lets
 * consumers (the dashboard's wiring layer, test harnesses) import
 * the configuration surface without dragging in the ~1800 LOC
 * handler implementation module.
 */

import type {
  HintContribution,
  LocatorAliasContribution,
  ScreenCapturedEvent,
  WorkItemDecision,
} from '../../product/domain/observation/dashboard';
import type { ManifestVerbHandlerRegistry } from '../../product/application/manifest/invoker';
import type { PlaywrightBridgePort } from './playwright-mcp-bridge';

export interface DashboardMcpServerOptions {
  /** Read a JSON artifact from the .tesseract/ directory. Returns null if not found. */
  readonly readArtifact: (relativePath: string) => unknown | null;
  /** In-memory cache of the latest screenshot. */
  readonly screenshotCache: { readonly get: () => ScreenCapturedEvent | null };
  /** Pending decisions Map — shared with the WS adapter. Resolving resumes the fiber. */
  readonly pendingDecisions: ReadonlyMap<string, (decision: WorkItemDecision) => void>;
  /** Broadcast an event to all connected WS clients. */
  readonly broadcast: (event: unknown) => void;
  /** Optional Playwright bridge for live browser interaction (headed mode). */
  readonly playwrightBridge?: PlaywrightBridgePort;
  /** Optional manifest verb handler registry. When provided, MCP tool
   *  invocations for manifest-derived tools route through the registered
   *  handler; when absent or when a verb has no handler registered, the
   *  invocation falls through to the legacy toolHandlers dispatch,
   *  which returns an "Unknown tool" error. */
  readonly manifestVerbHandlers?: ManifestVerbHandlerRegistry;

  // ─── Lifecycle callbacks (host-mode only) ───

  /** Start the speedrun loop. Returns immediately; the loop runs as a background fiber.
   *  Provided by the host process when the MCP server owns the speedrun lifecycle. */
  readonly startSpeedrun?: (config: SpeedrunStartConfig) => Promise<SpeedrunHandle>;
  /** Stop a running speedrun. Interrupts the background fiber. */
  readonly stopSpeedrun?: () => Promise<void>;
  /** Get the current loop status from the host process. */
  readonly getLoopStatus?: () => LoopStatus;

  // ─── Knowledge contribution callbacks (host-mode only) ───

  /** Write a hint to a screen's hints.yaml file. Returns the written path. */
  readonly writeHint?: (params: HintContribution) => string | null;
  /** Decisions directory for file-backed cross-process decisions (standalone mode fallback).
   *  When no in-memory resolver exists for a work item, the server writes a decision file
   *  to this directory. A running --mcp-decisions speedrun watches for these files. */
  readonly decisionsDir?: string | undefined;
  /** Write a locator alias to a screen's hints.yaml file. Returns the written path. */
  readonly writeLocatorAlias?: (params: LocatorAliasContribution) => string | null;
}

/** Configuration for starting a speedrun via MCP tool. */
export interface SpeedrunStartConfig {
  readonly count?: number | undefined;
  readonly seeds?: readonly string[] | undefined;
  readonly maxIterations?: number | undefined;
  readonly knowledgePosture?: string | undefined;
  readonly interpreterMode?: string | undefined;
}

/** Handle to a running speedrun fiber. */
export interface SpeedrunHandle {
  readonly status: 'started';
  readonly seeds: readonly string[];
  readonly maxIterations: number;
}

/** Status of the speedrun loop. */
export interface LoopStatus {
  readonly phase: 'idle' | 'running' | 'paused-for-decisions' | 'completed' | 'failed';
  readonly iteration?: number | undefined;
  readonly maxIterations?: number | undefined;
  readonly pendingDecisionCount?: number | undefined;
  readonly elapsedMs?: number | undefined;
  readonly error?: string | undefined;
  readonly lastProgress?: unknown;
}

// Contribution payload types moved to product/domain/observation/dashboard
// at step-4c.final-sweep so product contributors (hints-writer) can
// emit them without crossing the seam. Re-export for in-dashboard
// consumers that still import from this module.
export type { HintContribution, LocatorAliasContribution } from '../../product/domain/observation/dashboard';
