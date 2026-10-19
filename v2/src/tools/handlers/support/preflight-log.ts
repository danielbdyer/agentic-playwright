/**
 * The preflight receipt log: .tesseract/receipts/preflight.jsonl, one line
 * per preflight the CLI (or a CI job) chose to keep, append-only like every
 * other receipt. `tesseract-qa preflight` appends its result here so a
 * later `status` (or a dashboard) can say when memory was last checked
 * against the live app and what it found, without opening a browser.
 */
import path from 'node:path';
import { z } from 'zod';
import { appendJsonl, readJsonl } from '../../../core/fsio.js';
import { memoryPreflight, type ToolOutput } from '../../../contract/tools.js';
import type { Workspace } from '../../../workspace/workspace.js';

export const PreflightReceiptSchema = memoryPreflight.output.extend({
  at: z.string(),
  session: z.string().optional(),
  profile: z.string().optional(),
});

export type PreflightReceipt = z.infer<typeof PreflightReceiptSchema>;

export const preflightLogPath = (workspace: Workspace): string => path.join(workspace.paths.receipts, 'preflight.jsonl');

/** Append one preflight result. Never rewrites the log. */
export const appendPreflightReceipt = async (
  workspace: Workspace,
  result: ToolOutput<'memory.preflight'>,
  meta: { readonly at: string; readonly session?: string; readonly profile?: string },
): Promise<PreflightReceipt> => {
  const receipt = PreflightReceiptSchema.parse({
    at: meta.at,
    ...(meta.session !== undefined ? { session: meta.session } : {}),
    ...(meta.profile !== undefined ? { profile: meta.profile } : {}),
    ...result,
  });
  await appendJsonl(preflightLogPath(workspace), receipt);
  return receipt;
};

/** The most recent well-formed preflight receipt, or null when none was kept. */
export const lastPreflightReceipt = async (workspace: Workspace): Promise<PreflightReceipt | null> => {
  const lines = await readJsonl<unknown>(preflightLogPath(workspace));
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = PreflightReceiptSchema.safeParse(lines[index]);
    if (parsed.success) return parsed.data;
  }
  return null;
};
