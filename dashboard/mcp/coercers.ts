/**
 * JSON coercion helpers — carved out of
 * `dashboard/mcp/dashboard-mcp-server.ts` at Step 4a (round 2) per
 * `docs/v2-direction.md §6 Step 4a` and §3.7's named split.
 *
 * Pure type narrowing over `unknown` values deserialized from
 * `.tesseract/` JSON artifacts. Used by every MCP tool handler
 * that reads workbench / proposal / scorecard / catalog artifacts.
 *
 * Pure — no Effect, no IO.
 */

export type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null ? value as JsonRecord : null;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asStringArray(value: unknown): readonly string[] {
  return asArray(value).filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}
