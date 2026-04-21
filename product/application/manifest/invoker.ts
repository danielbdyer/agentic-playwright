/**
 * Manifest verb handler registry (v2 §6 Step 4c — full).
 *
 * The projection function `projectManifestVerbToMcpTool` lifts each
 * manifest verb into an MCP tool definition (surface visibility).
 * This module provides the dispatch layer: a registry that binds a
 * handler to each declared verb, plus the invocation helper that
 * dashboard's MCP server calls when an agent invokes a manifest-
 * derived tool.
 *
 * Registration happens at composition time (typically in the MCP
 * host's bootstrap — `bin/tesseract-mcp.ts` or the host process
 * that owns the speedrun). The dashboard MCP server receives the
 * registry via `DashboardMcpServerOptions.manifestVerbHandlers`
 * and dispatches tool invocations against it.
 *
 * ## Handler shape
 *
 * Handlers are synchronous-or-Promise-returning functions that
 * accept a raw input (JSON-deserialized from the MCP invocation)
 * and return an outcome (success value, error envelope, or
 * Promise thereof). This matches the shape dashboard-mcp-server's
 * existing `toolHandlers` registry uses; manifest-derived handlers
 * drop into the same dispatch pattern.
 *
 * Input validation and runtime wiring to product code (the
 * Reasoning port, the FileSystem port, etc.) live inside the
 * handler — the registry is just the lookup table.
 *
 * ## Empty registry
 *
 * `emptyManifestVerbHandlerRegistry()` returns a registry with no
 * handlers registered. The dashboard MCP server treats unknown
 * manifest verbs (those without handlers) by falling through to
 * the legacy `routeToolCall` dispatch, which returns an
 * "Unknown tool" error. This lets the catalog surface verbs before
 * their handlers are wired, with graceful degradation.
 */

/** A single manifest-verb invocation handler. Receives the raw
 *  input (MCP client sends an `arguments` JSON object) and returns
 *  the outcome. Errors can be signaled by throwing or by returning
 *  an envelope with `isError: true` field. */
export type ManifestVerbHandler = (input: unknown) => unknown | Promise<unknown>;

/** The registry: a name-keyed map of handlers. Callers that
 *  register partial sets (e.g. only observe + intent-fetch are
 *  wired) get graceful degradation on the unwired verbs. */
export interface ManifestVerbHandlerRegistry {
  readonly handlers: Readonly<Record<string, ManifestVerbHandler>>;
}

/** An empty registry. The dashboard MCP server's default — verbs
 *  surface in listTools but invocations fall through. */
export function emptyManifestVerbHandlerRegistry(): ManifestVerbHandlerRegistry {
  return { handlers: {} };
}

/** Construct a registry from a name-keyed handler record. */
export function manifestVerbHandlerRegistry(
  handlers: Readonly<Record<string, ManifestVerbHandler>>,
): ManifestVerbHandlerRegistry {
  return { handlers };
}

/** Merge two registries — right wins on key collision. Useful
 *  when the bootstrap composes a base registry with host-specific
 *  extensions. */
export function mergeManifestVerbHandlerRegistries(
  base: ManifestVerbHandlerRegistry,
  extensions: ManifestVerbHandlerRegistry,
): ManifestVerbHandlerRegistry {
  return {
    handlers: { ...base.handlers, ...extensions.handlers },
  };
}

/** Lookup + invocation. Returns the raw handler result on success,
 *  or an error-envelope object when no handler is registered for
 *  the named verb. Awaits Promise-returning handlers before
 *  returning. Caller wraps in the MCP tool-result envelope. */
export async function invokeManifestVerb(
  registry: ManifestVerbHandlerRegistry,
  verbName: string,
  input: unknown,
): Promise<{ readonly handled: true; readonly result: unknown } | { readonly handled: false }> {
  const handler = registry.handlers[verbName];
  if (!handler) {
    return { handled: false };
  }
  const result = await handler(input);
  return { handled: true, result };
}
