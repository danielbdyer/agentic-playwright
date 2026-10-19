import type { Workspace } from '../workspace/workspace.js';
import type { BrowserPool } from '../browser/types.js';
import type { ToolInput, ToolName, ToolOutput } from '../contract/tools.js';

/**
 * Everything a tool handler may touch. Handlers are plain async functions of
 * (validated input, context); the server and the CLI wrap them identically,
 * write the authoring receipt, and map ToolError families onto results.
 */
export interface ToolContext {
  readonly workspace: Workspace;
  readonly browser: BrowserPool;
  readonly env: NodeJS.ProcessEnv;
  readonly now: () => Date;
  /** Identifies this server/CLI session in provenance and receipts. */
  readonly session: string;
  /** Diagnostic log; goes to stderr, never to the MCP stdout channel. */
  readonly log: (message: string) => void;
  /** Lets one tool call another through the same receipts path (e.g. app.open → flow.run for login). */
  readonly call: <N extends ToolName>(name: N, input: ToolInput<N>) => Promise<ToolOutput<N>>;
  /**
   * Mark a top-level input field as sensitive for this call (e.g. app.act
   * discovers its target is a password field): the authoring receipt records
   * '<secret>' instead of the value. Per call; absent on hand-built contexts.
   */
  readonly markSensitive?: (field: string) => void;
}

export type ToolHandler<N extends ToolName> = (input: ToolInput<N>, ctx: ToolContext) => Promise<ToolOutput<N>>;

export type ToolHandlers = { readonly [N in ToolName]: ToolHandler<N> };
