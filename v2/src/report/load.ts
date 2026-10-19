/**
 * The one impure part of reporting: read the receipts and catalogs a
 * workspace has accumulated. Every line is parsed leniently (a malformed
 * line is skipped and counted, never fatal), because receipts are
 * append-only logs written by many versions over months.
 */
import path from 'node:path';
import { z } from 'zod';
import { listFiles, readJson, readJsonl } from '../core/fsio.js';
import {
  AcceptanceReceiptSchema,
  HandoffSchema,
  RunReceiptSchema,
  type AcceptanceReceipt,
  type Facet,
  type Handoff,
  type RunReceipt,
} from '../contract/schemas.js';
import { listScreens, loadScreen } from '../memory/index.js';
import { EmitRecordSchema, type EmitRecord } from '../run/emit-records.js';
import type { Workspace } from '../workspace/workspace.js';

/** One line of .tesseract/receipts/authoring.jsonl (inputs and outputs are summarized and redacted). */
export const AuthoringLineSchema = z.looseObject({
  at: z.string(),
  session: z.string().optional(),
  tool: z.string(),
  testCase: z.string().optional(),
  step: z.number().optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  outcome: z.enum(['succeeded', 'failed']),
  errorFamily: z.string().optional(),
  message: z.string().optional(),
  durationMs: z.number(),
  decision: z
    .looseObject({ chose: z.string().optional(), rejected: z.array(z.string()).optional(), reason: z.string().optional() })
    .optional(),
  host: z
    .looseObject({
      model: z.string().optional(),
      promptFingerprint: z.string().optional(),
      tokens: z.looseObject({ prompt: z.number().optional(), completion: z.number().optional() }).optional(),
    })
    .optional(),
});
export type AuthoringLine = z.infer<typeof AuthoringLineSchema>;

/** A kept preflight (.tesseract/receipts/preflight.jsonl), from the CLI or a CI job. */
export const PreflightLineSchema = z.looseObject({
  at: z.string(),
  summary: z.object({ ok: z.number(), stale: z.number(), missing: z.number(), unchecked: z.number().optional() }),
  screens: z.array(z.looseObject({ screen: z.string(), status: z.string() })).optional(),
});
export type PreflightLine = z.infer<typeof PreflightLineSchema>;

export interface ReceiptSet {
  readonly authoring: readonly AuthoringLine[];
  readonly runs: readonly RunReceipt[];
  readonly reviews: readonly AcceptanceReceipt[];
  readonly emits: readonly EmitRecord[];
  readonly preflights: readonly PreflightLine[];
  readonly handoffs: readonly Handoff[];
  /** Every facet of every screen's catalog, retired ones included. */
  readonly facets: readonly Facet[];
  /** Lines (or files) that did not parse, per source. */
  readonly skipped: Readonly<Record<string, number>>;
}

export const EMPTY_RECEIPTS: ReceiptSet = { authoring: [], runs: [], reviews: [], emits: [], preflights: [], handoffs: [], facets: [], skipped: {} };

const parseAll = <T>(lines: readonly unknown[], schema: z.ZodType<T>): { readonly items: readonly T[]; readonly skipped: number } => {
  const items = lines.flatMap((line) => {
    const parsed = schema.safeParse(line);
    return parsed.success ? [parsed.data] : [];
  });
  return { items, skipped: lines.length - items.length };
};

export const preflightLogFile = (workspace: Workspace): string => path.join(workspace.paths.receipts, 'preflight.jsonl');

const loadFacets = async (workspace: Workspace): Promise<{ readonly facets: readonly Facet[]; readonly skipped: number }> => {
  const screens = await listScreens(workspace);
  const loaded = await Promise.all(
    screens.map(async (screen) => {
      try {
        return (await loadScreen(workspace, screen)).catalog.facets;
      } catch {
        return null;
      }
    }),
  );
  return { facets: loaded.flatMap((facets) => facets ?? []), skipped: loaded.filter((facets) => facets === null).length };
};

const loadHandoffs = async (workspace: Workspace): Promise<{ readonly handoffs: readonly Handoff[]; readonly skipped: number }> => {
  const files = await listFiles(workspace.paths.handoffs, '.json');
  const raw = await Promise.all(files.map((file) => readJson<unknown>(file).catch(() => null)));
  const parsed = parseAll(raw, HandoffSchema);
  return { handoffs: parsed.items, skipped: parsed.skipped };
};

/** Read everything the numbers and the per-test receipt are computed from. */
export const loadReceipts = async (workspace: Workspace): Promise<ReceiptSet> => {
  const { paths } = workspace;
  const [authoring, runs, reviews, emits, preflights, handoffs, facets] = await Promise.all([
    readJsonl<unknown>(paths.authoringReceipts).then((lines) => parseAll(lines, AuthoringLineSchema)),
    readJsonl<unknown>(paths.runReceipts).then((lines) => parseAll(lines, RunReceiptSchema)),
    readJsonl<unknown>(paths.reviewReceipts).then((lines) => parseAll(lines, AcceptanceReceiptSchema)),
    readJsonl<unknown>(paths.emitRecords).then((lines) => parseAll(lines, EmitRecordSchema)),
    readJsonl<unknown>(preflightLogFile(workspace)).then((lines) => parseAll(lines, PreflightLineSchema)),
    loadHandoffs(workspace),
    loadFacets(workspace),
  ]);
  return {
    authoring: authoring.items,
    runs: runs.items,
    reviews: reviews.items,
    emits: emits.items,
    preflights: preflights.items,
    handoffs: handoffs.handoffs,
    facets: facets.facets,
    skipped: {
      authoring: authoring.skipped,
      runs: runs.skipped,
      reviews: reviews.skipped,
      emits: emits.skipped,
      preflights: preflights.skipped,
      handoffs: handoffs.skipped,
      catalogs: facets.skipped,
    },
  };
};
