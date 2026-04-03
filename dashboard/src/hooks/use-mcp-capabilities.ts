/**
 * useWebMcpCapabilities — progressive enhancement detection via Effect.
 *
 * Probes available layers in parallel using Effect.all:
 *   Layer 0: Screenshot stream (always available)
 *   Layer 1: Live DOM portal (app URL reachable)
 *   Layer 2: WebMCP / standalone MCP server
 *
 * Complexity:
 *   probeUrl:           O(1) — single HEAD request with 5s timeout
 *   probeMcpEndpoint:   O(1) — single GET request with 3s timeout
 *   detectCapabilities: O(3) — three parallel probes (constant, not per-item)
 *   detectWebMcp:       O(1) — synchronous window property check
 *
 * Uses Effect for structured concurrency (Effect.all), timeouts, and
 * graceful degradation (Effect.catchAll). useSyncExternalStore is NOT
 * appropriate here — this is a one-shot detection, not a subscription.
 */

import { useState, useEffect } from 'react';
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

/** O(1). Probe whether a URL is reachable. Effect.timeout prevents hung requests. */
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

/** O(1). Check if the dashboard server exposes an MCP endpoint. */
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

/** O(1). Check if Chrome WebMCP API is available. Synchronous — Effect.sync. */
const detectWebMcp: Effect.Effect<boolean, never, never> = Effect.sync(() =>
  typeof window !== 'undefined' && 'ai' in window && 'mcpServer' in (window as unknown as Record<string, unknown>),
);

/** O(1). Fetch server-reported capabilities from /api/capabilities. */
const fetchServerCapabilities = (baseUrl: string): Effect.Effect<{
  readonly screenshotStream: boolean;
  readonly liveDomPortal: boolean;
  readonly appUrl: string | null;
  readonly mcpEndpoint: string | null;
} | null, never, never> =>
  Effect.tryPromise({
    try: () => fetch(`${baseUrl}/api/capabilities`).then((r) => r.ok ? r.json() : null),
    catch: () => null,
  }).pipe(
    Effect.timeout(Duration.seconds(3)),
    Effect.map((opt) => opt ?? null),
    Effect.catchAll(() => Effect.succeed(null)),
  );

/** O(3). Detect all capabilities in parallel. Structured concurrency via Effect.all.
 *  Server-reported capabilities take precedence; client-side probing fills gaps. */
const detectCapabilities = (captureUrl: string | null, baseUrl: string): Effect.Effect<McpCapabilities, never, never> =>
  Effect.all({
    server: fetchServerCapabilities(baseUrl),
    mcpEndpoint: probeMcpEndpoint(baseUrl),
    webMcp: detectWebMcp,
  }).pipe(
    Effect.flatMap(({ server, mcpEndpoint, webMcp }) => {
      // Server-authoritative: use its appUrl and flags when available
      const appUrl = server?.appUrl ?? captureUrl ?? null;
      const serverLiveDom = server?.liveDomPortal ?? false;

      // If server says portal is available, trust it; otherwise probe the URL
      const portalCheck = serverLiveDom
        ? Effect.succeed(true)
        : appUrl
          ? probeUrl(appUrl)
          : Effect.succeed(false);

      return Effect.map(portalCheck, (domReachable) => ({
        screenshotStream: server?.screenshotStream ?? true,
        liveDomPortal: domReachable,
        mcpAvailable: webMcp || mcpEndpoint !== null,
        appUrl: domReachable ? appUrl : null,
        mcpEndpoint: server?.mcpEndpoint ?? mcpEndpoint,
      }));
    }),
  );

// ─── Hook ───

export function useWebMcpCapabilities(appUrl?: string | null): McpCapabilities {
  const [capabilities, setCapabilities] = useState<McpCapabilities>(BASE_CAPABILITIES);

  useEffect(() => {
    const fiber = Effect.runPromise(
      detectCapabilities(appUrl ?? null, window.location.origin),
    ).then(setCapabilities);
    return () => { fiber.catch(() => {}); };
  }, [appUrl]);

  return capabilities;
}
