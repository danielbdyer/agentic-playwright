/**
 * Manifest → MCP Tool projection (v2 §6 Step 4c).
 *
 * Pure conversion from a `VerbEntry` (product manifest verb
 * declaration) to an `McpToolDefinition` (the shape the dashboard
 * MCP server catalogs for agent consumption).
 *
 * Per docs/v2-direction.md §6 Step 4c: "Adding a verb to product/
 * automatically extends the dashboard's tool surface at the next
 * build." This function is the implementation of "automatically
 * extends" — feed it a manifest verb, get back a tool entry.
 *
 * ## Category mapping
 *
 * The manifest's `VerbCategory` taxonomy (intent / observe / mutation /
 * memory / reason / compose / execute / governance / diagnostic) is
 * richer than the MCP's three-part `McpToolCategory` (observe /
 * decide / control). This projection flattens to MCP's shape via:
 *
 *   observe, intent, memory, diagnostic → 'observe'
 *     (reading state or consuming upstream inputs)
 *   mutation, reason, compose, execute  → 'decide'
 *     (agent makes a call that changes state downstream)
 *   governance                          → 'control'
 *     (proposal emission / activation lifecycle)
 *
 * The mapping is not authoritative — a later refactor may expand
 * McpToolCategory to mirror VerbCategory exactly, at which point
 * this projection becomes an identity. For now the flattening is
 * pragmatic.
 *
 * ## Input schema
 *
 * The manifest names input types by reference (`VerbShapeDescriptor.
 * typeName` + `declaredIn` path) rather than embedding JSON Schema.
 * This projection emits a minimal schema envelope that names the
 * input type; a fuller JSON Schema derivation (walking the TS
 * declaration to extract properties) is a follow-up concern. The
 * schema shape here is enough for an MCP client to identify the
 * tool's input type; validation still happens inside the handler.
 *
 * ## Pure
 *
 * No Effect, no IO, no side effects. Input in, tool definition out.
 */

import type { McpToolCategory, McpToolDefinition } from '../observation/dashboard';
import type { VerbCategory, VerbEntry } from './verb-entry';

/** Flatten the 9-variant VerbCategory into the 3-variant
 *  McpToolCategory via the rationale in the module docstring. */
export function mcpCategoryForVerbCategory(category: VerbCategory): McpToolCategory {
  switch (category) {
    case 'observe':
    case 'intent':
    case 'memory':
    case 'diagnostic':
      return 'observe';
    case 'mutation':
    case 'reason':
    case 'compose':
    case 'execute':
      return 'decide';
    case 'governance':
      return 'control';
    default: {
      const exhaust: never = category;
      return exhaust;
    }
  }
}

/** Build a minimal JSON Schema envelope that names the manifest's
 *  declared input type. Callers that need full property derivation
 *  should walk the `inputs.declaredIn` TypeScript module directly. */
function inputSchemaForVerb(verb: VerbEntry): Record<string, unknown> {
  return {
    type: 'object',
    description: verb.inputs.summary ?? `Input for verb ${verb.name}`,
    'x-tesseract-input-type': verb.inputs.typeName,
    'x-tesseract-declared-in': verb.inputs.declaredIn,
    'x-tesseract-error-families': [...verb.errorFamilies],
    properties: {},
  };
}

/** Project a single manifest verb to an MCP tool definition. */
export function projectManifestVerbToMcpTool(verb: VerbEntry): McpToolDefinition {
  return {
    name: verb.name,
    category: mcpCategoryForVerbCategory(verb.category),
    description: verb.summary,
    inputSchema: inputSchemaForVerb(verb),
  };
}

/** Project a full manifest verb list to an MCP tool catalog. The
 *  output preserves verb order; callers that want category-grouped
 *  output can sort on the return value's `category` field. */
export function projectManifestVerbsToMcpTools(
  verbs: readonly VerbEntry[],
): readonly McpToolDefinition[] {
  return verbs.map(projectManifestVerbToMcpTool);
}
