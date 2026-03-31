import { Context, Effect } from 'effect';
import type { TesseractError } from '../../domain/errors';
import type { LocatorStrategy, McpToolDefinition } from '../../domain/types';

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

export const DisabledScreenObserver: ScreenObservationPort = {
  observe: () => Effect.succeed({ url: '', ariaSnapshot: null, elementObservations: [] }),
};

export class ScreenObserver extends Context.Tag('tesseract/ScreenObserver')<ScreenObserver, ScreenObservationPort>() {}

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
  readonly handleToolCall: (invocation: McpToolInvocation) => Effect.Effect<McpToolResult, TesseractError>;
  readonly listTools: () => Effect.Effect<readonly McpToolDefinition[], never, never>;
}

export const DisabledMcpServer: McpServerPort = {
  handleToolCall: (inv) => Effect.succeed({ tool: inv.tool, result: { error: 'MCP server not available' }, isError: true }),
  listTools: () => Effect.succeed([]),
};

export class McpServer extends Context.Tag('tesseract/McpServer')<McpServer, McpServerPort>() {}
