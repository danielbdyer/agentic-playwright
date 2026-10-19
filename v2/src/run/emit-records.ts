/**
 * Emit records: one JSON line per test.emit, appended to
 * .tesseract/receipts/emits.jsonl. They are how the rest of the loop knows
 * what an emitted spec is made of without parsing it: test.run maps report
 * steps to ADO steps and facets through them, review.record promotes the
 * facets a reviewed test uses, and ado.publish associates each case with
 * its spec. The latest record for a spec (or a case) wins.
 */
import { z } from 'zod';
import { appendJsonl, readJsonl } from '../core/fsio.js';
import type { Workspace } from '../workspace/workspace.js';

export const EmitRecordStepSchema = z.object({
  index: z.number().int(),
  stepIdentifier: z.string(),
  title: z.string(),
  facets: z.array(z.string()),
});

export const EmitRecordSchema = z.object({
  at: z.string(),
  testCaseId: z.string(),
  revision: z.number().int(),
  contentHash: z.string(),
  /** Workspace-relative POSIX path of the spec. */
  specPath: z.string(),
  /** The test's title as Playwright reports it (the describe title for a data-driven case). */
  testTitle: z.string().optional(),
  steps: z.array(EmitRecordStepSchema),
  /** Every facet the spec and the flows it calls use. */
  facets: z.array(z.string()),
  pageObjects: z.array(z.string()),
  flows: z.array(z.string()),
  session: z.string().optional(),
});

export type EmitRecordStep = z.infer<typeof EmitRecordStepSchema>;
export type EmitRecord = z.infer<typeof EmitRecordSchema>;

export const appendEmitRecord = async (workspace: Workspace, record: EmitRecord): Promise<void> => {
  await appendJsonl(workspace.paths.emitRecords, EmitRecordSchema.parse(record));
};

/** Every well-formed record, in append order (malformed lines are skipped). */
export const readEmitRecords = async (workspace: Workspace): Promise<readonly EmitRecord[]> =>
  (await readJsonl<unknown>(workspace.paths.emitRecords)).flatMap((line) => {
    const parsed = EmitRecordSchema.safeParse(line);
    return parsed.success ? [parsed.data] : [];
  });

/** Later entries overwrite earlier ones in a Map built from entries, so the latest record per key wins. */
const latestBy = (records: readonly EmitRecord[], key: (record: EmitRecord) => string): ReadonlyMap<string, EmitRecord> =>
  new Map(records.map((record) => [key(record), record] as const));

/** The latest record per spec path. */
export const latestEmitBySpec = (records: readonly EmitRecord[]): ReadonlyMap<string, EmitRecord> => latestBy(records, (r) => r.specPath);

/** The latest record per test case id. */
export const latestEmitByCase = (records: readonly EmitRecord[]): ReadonlyMap<string, EmitRecord> => latestBy(records, (r) => r.testCaseId);

/** The latest record for one test case, or null when it was never emitted. */
export const latestEmitFor = async (workspace: Workspace, testCaseId: string): Promise<EmitRecord | null> =>
  latestEmitByCase(await readEmitRecords(workspace)).get(testCaseId) ?? null;
