/**
 * useWebMcpCapabilities — progressive enhancement detection for MCP layers.
 *
 * Detects which observation/interaction layers are available:
 *   Layer 0: Screenshot texture (always available)
 *   Layer 1: Live DOM portal (iframe when app URL is accessible)
 *   Layer 2: WebMCP tools (Chrome WebMCP or standalone MCP server)
 *
 * This hook is non-breaking: the spatial canvas renders with whatever
 * capabilities are available. Higher layers enhance, never replace.
 *
 * The key insight: the spatial overlay (glows, particles, knowledge)
 * is representationally coherent with MCP — both are projections of
 * the same observable: a running DOM with structured affordances.
 */

import { useState, useEffect, useCallback } from 'react';

export interface McpCapabilities {
  /** Layer 0: screenshot stream from WS. Always true. */
  readonly screenshotStream: boolean;
  /** Layer 1: live DOM portal via iframe (app URL is reachable). */
  readonly liveDomPortal: boolean;
  /** Layer 2: WebMCP or standalone MCP server is available. */
  readonly mcpAvailable: boolean;
  /** The app URL for iframe embedding (Layer 1). */
  readonly appUrl: string | null;
  /** Whether the dashboard server supports MCP tool routing. */
  readonly mcpEndpoint: string | null;
}

const BASE_CAPABILITIES: McpCapabilities = {
  screenshotStream: true,
  liveDomPortal: false,
  mcpAvailable: false,
  appUrl: null,
  mcpEndpoint: null,
};

/** Probe whether a URL is reachable (for iframe embedding). Pure async. */
const probeUrl = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
    return response.type === 'opaque' || response.ok;
  } catch {
    return false;
  }
};

/** Check if the dashboard server exposes an MCP endpoint. */
const probeMcpEndpoint = async (baseUrl: string): Promise<string | null> => {
  try {
    const response = await fetch(`${baseUrl}/api/mcp/tools`);
    if (response.ok) return `${baseUrl}/api/mcp`;
    return null;
  } catch {
    return null;
  }
};

/** Check if Chrome WebMCP API is available in the browser. */
const detectWebMcp = (): boolean =>
  typeof window !== 'undefined' && 'ai' in window && 'mcpServer' in (window as unknown as Record<string, unknown>);

export function useWebMcpCapabilities(appUrl?: string | null): McpCapabilities {
  const [capabilities, setCapabilities] = useState<McpCapabilities>(BASE_CAPABILITIES);

  const detect = useCallback(async () => {
    const baseUrl = window.location.origin;

    // Parallel capability probes
    const [domReachable, mcpEndpoint] = await Promise.all([
      appUrl ? probeUrl(appUrl) : Promise.resolve(false),
      probeMcpEndpoint(baseUrl),
    ]);

    const webMcpAvailable = detectWebMcp();

    setCapabilities({
      screenshotStream: true,
      liveDomPortal: domReachable,
      mcpAvailable: webMcpAvailable || mcpEndpoint !== null,
      appUrl: domReachable ? appUrl ?? null : null,
      mcpEndpoint,
    });
  }, [appUrl]);

  useEffect(() => { detect(); }, [detect]);

  return capabilities;
}
