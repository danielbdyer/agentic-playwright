/**
 * The publish ledger: an append-only JSON-lines file, keyed by run name, that
 * makes ado.publish idempotent. Azure DevOps has no idempotency key for
 * creating a test run, so the ledger is what knows a run was already created.
 *
 * Each publish appends up to three entries:
 *   pending   — written before POST /runs; a crash after it means a run may or
 *               may not exist, and the next attempt looks it up by title;
 *   created   — written as soon as ADO returns the run id; a crash after it
 *               resumes that run directly;
 *   completed — written after the run is completed; a later publish with the
 *               same name sends nothing and returns this entry.
 * The latest entry for a run name is its state.
 */
import { appendJsonl, readJsonl } from '../core/fsio.js';
import type { Workspace } from '../workspace/workspace.js';

export type PublishLedgerState = 'pending' | 'created' | 'completed';

export interface PublishLedgerEntry {
  readonly at: string;
  readonly runName: string;
  readonly state: PublishLedgerState;
  readonly planId: number;
  readonly suiteId: number;
  readonly runId?: number;
  /** The run's page in the ADO web UI. */
  readonly url?: string;
  readonly resultIds?: readonly number[];
  readonly pointIds?: readonly number[];
}

export interface PublishLedger {
  /** Every entry, in append order. */
  readonly entries: () => Promise<readonly PublishLedgerEntry[]>;
  readonly append: (entry: PublishLedgerEntry) => Promise<void>;
}

const isEntry = (value: unknown): value is PublishLedgerEntry => {
  if (value === null || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.runName === 'string' &&
    typeof entry.at === 'string' &&
    (entry.state === 'pending' || entry.state === 'created' || entry.state === 'completed') &&
    typeof entry.planId === 'number' &&
    typeof entry.suiteId === 'number' &&
    (entry.runId === undefined || typeof entry.runId === 'number')
  );
};

/** A ledger backed by a .jsonl file. Lines that are not ledger entries are ignored. */
export const fileLedger = (file: string): PublishLedger => ({
  entries: async () => (await readJsonl<unknown>(file)).filter(isEntry),
  append: (entry) => appendJsonl(file, entry),
});

/** The workspace's ledger, .tesseract/receipts/publish.jsonl. */
export const workspaceLedger = (workspace: Workspace): PublishLedger => fileLedger(workspace.paths.publishReceipts);

/** An in-memory ledger, for tests and one-off scripts. */
export const memoryLedger = (initial: readonly PublishLedgerEntry[] = []): PublishLedger & { readonly snapshot: () => readonly PublishLedgerEntry[] } => {
  const store: PublishLedgerEntry[] = [...initial];
  return {
    entries: async () => [...store],
    append: async (entry) => {
      store.push(entry);
    },
    snapshot: () => [...store],
  };
};

/** The latest entry for a run name, or undefined when it was never published. */
export const latestEntry = (entries: readonly PublishLedgerEntry[], runName: string): PublishLedgerEntry | undefined =>
  [...entries].reverse().find((entry) => entry.runName === runName);
