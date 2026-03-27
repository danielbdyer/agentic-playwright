/**
 * useWebMcpCapabilities — progressive enhancement detection via Effect.
 *
 * Probes available layers in parallel using Effect.all:
 *   Layer 0: Screenshot stream (always available)
 *   Layer 1: Live DOM portal (app URL reachable)
 *   Layer 2: WebMCP / standalone MCP server
 *
 * Uses Effect for:
 *   - Parallel probing with Effect.all (structured concurrency)
 *   - Effect.timeout on each probe (no hung requests)
 *   - Effect.catchAll for graceful degradation
 *   - Clean fiber semantics instead of raw Promise.all
 */

import { useState, useEffect, useCallback } from 'react';
import { Effect, Duration } from 'effect';

// ─── Types ───

export interface McpCapabilities {
  readonly screenshotStream: boolean;
  readonly liveDomPortal: boolean;
  readonly mcpAvailable: boolean;
  readonly appUrl: string | null;
  readonly mcpEndpoint: string | null;
}

const BASE_CAPABILITIES: McpCapabilities = {
  screenshotStream: true,
  liveDomPortal: false,
  mcpAvailable: false,
  appUrl: null,
  mcpEndpoint: null,
};

// ─── Pure Effect Programs (composable probes) ───

/** Probe whether a URL is reachable. Effect.timeout ensures no hung requests. */
const probeUrl = (url: string): Effect.Effect<boolean, never, never> =>
  Effect.tryPromise({
    try: () => fetch(url, { method: 'HEAD', mode: 'no-cors' }),
    catch: () => null,
  }).pipe(
    Effect.map((response) => response !== null && (response.type === 'opaque' || response.ok)),
    Effect.timeout(Duration.seconds(5)),
    Effect.map((opt) => opt ?? false),
    Effect.catchAll(() => Effect.succeed(false)),
  );

/** Check if the dashboard server exposes an MCP endpoint. */
const probeMcpEndpoint = (baseUrl: string): Effect.Effect<string | null, never, never> =>
  Effect.tryPromise({
    try: () => fetch(`${baseUrl}/api/mcp/tools`),
    catch: () => null,
  }).pipe(
    Effect.flatMap((response) =>
      response !== null && response.ok
        ? Effect.succeed(`${baseUrl}/api/mcp`)
        : Effect.succeed(null),
    ),
    Effect.timeout(Duration.seconds(3)),
    Effect.map((opt) => opt ?? null),
    Effect.catchAll(() => Effect.succeed(null)),
  );

/** Check if Chrome WebMCP API is available. Synchronous — Effect.sync. */
const detectWebMcp: Effect.Effect<boolean, never, never> = Effect.sync(() =>
  typeof window !== 'undefined' && 'ai' in window && 'mcpServer' in (window as unknown as Record<string, unknown>),
);

/** Detect all capabilities in parallel. Structured concurrency via Effect.all. */
const detectCapabilities = (appUrl: string | null, baseUrl: string): Effect.Effect<McpCapabilities, never, never> =>
  Effect.all({
    domReachable: appUrl ? probeUrl(appUrl) : Effect.succeed(false),
    mcpEndpoint: probeMcpEndpoint(baseUrl),
    webMcp: detectWebMcp,
  }).pipe(
    Effect.map(({ domReachable, mcpEndpoint, webMcp }) => ({
      screenshotStream: true,
      liveDomPortal: domReachable,
      mcpAvailable: webMcp || mcpEndpoint !== null,
      appUrl: domReachable ? appUrl : null,
      mcpEndpoint,
    })),
  );

// ─── Hook ───

export function useWebMcpCapabilities(appUrl?: string | null): McpCapabilities {
  const [capabilities, setCapabilities] = useState<McpCapabilities>(BASE_CAPABILITIES);

  const detect = useCallback(async () => {
    const baseUrl = window.location.origin;
    const result = await Effect.runPromise(detectCapabilities(appUrl ?? null, baseUrl));
    setCapabilities(result);
  }, [appUrl]);

  useEffect(() => { detect(); }, [detect]);

  return capabilities;
}
