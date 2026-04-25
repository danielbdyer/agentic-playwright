/**
 * Log-set registry — the explicit enumeration of every
 * append-only log the system writes.
 *
 * ## Why this exists
 *
 * CLAUDE.md non-negotiable: "Every log is append-only. The
 * adapter refuses in-place updates; confidence derives on
 * read from the evidence log; contradictions never overwrite."
 * The doctrine names a SET of logs across the codebase
 * (hypothesis receipts, compilation receipts, scoreboard
 * snapshots, probe receipts, scenario receipts, parity
 * failures, substrate snapshots, hypotheses ledger,
 * improvement-run ledger, …) — but no code-level index of
 * that set existed. Consequences:
 *
 *   - Dashboard cannot auto-mount listings (each new log
 *     surface needs ad-hoc dashboard wiring).
 *   - Architecture tests cannot assert "every writer routes
 *     through the registry" because there's no registry.
 *   - Future-readers of CLAUDE.md cannot tell whether a new
 *     log is in scope ("did we just add an off-registry
 *     write?").
 *
 * This module is that index. Each log entry declares:
 *
 *   - `name` — stable identifier; matches CLAUDE.md.
 *   - `subdirSegment` — the leaf-or-stem path the writer
 *     uses (under workspace `.tesseract/` or `workshop/`,
 *     etc.).
 *   - `format` — file-per-record / jsonl-stream /
 *     state-state-with-tmp-rename. Discipline classification.
 *   - `schemaVersion` — the version stamp every record in
 *     this log carries (for forward-compat).
 *   - `idempotencyKey` — `'sample-id'` for stores with
 *     idempotent writes; `null` for true append streams.
 *   - `writer` — file:line of the canonical writer module.
 *
 * Per Agent E #7 audit recommendation. Adding a new log
 * means adding an entry here; future architecture-law tests
 * can assert that every write site in the codebase routes
 * through a registered log.
 *
 * Pure domain — no Effect, no IO. Read-only at runtime.
 */

/** Format tags discriminate write disciplines. */
export type LogFormat =
  | 'file-per-record' // <dir>/<id>.json — one record per file
  | 'jsonl-stream'    // <dir>/<file>.jsonl — appendFile-only
  | 'state-with-tmp-rename'; // single state file; safe-rename writes

/** A registry entry for a single log. */
export interface LogRegistryEntry {
  /** Stable name; appears in CLAUDE.md + dashboard listings. */
  readonly name: string;
  /** Path stem under the workspace root (e.g.,
   *  `.tesseract/compounding/receipts`). */
  readonly subdirSegment: string;
  /** File / write discipline tag. */
  readonly format: LogFormat;
  /** Schema version every record stamps in its envelope. */
  readonly schemaVersion: number;
  /** Idempotency key derivation for the writer. `null` for
   *  true append streams that don't dedup. Records named here
   *  are unique by content-hash + bucket; see the writer's
   *  doc-header for the keyOf function. */
  readonly idempotencyKey: 'sample-id' | 'timestamp-fp' | null;
  /** Canonical writer site, file:line. Linked from the
   *  registry to the implementation so dashboard /
   *  architecture-law tests can resolve. */
  readonly writer: string;
  /** Brief human-readable description of what the log
   *  carries. */
  readonly description: string;
}

/** The registry. Adding a new log requires adding an entry
 *  here AND wiring its writer; an architecture-law test (in
 *  product/tests/architecture/log-registry.laws.spec.ts)
 *  will eventually fail the build for any append-only writer
 *  not registered. */
export const LOG_REGISTRY: readonly LogRegistryEntry[] = [
  {
    name: 'hypothesis-receipts',
    subdirSegment: '.tesseract/compounding/receipts/hypotheses',
    format: 'file-per-record',
    schemaVersion: 1,
    idempotencyKey: 'timestamp-fp',
    writer:
      'workshop/compounding/harness/filesystem-receipt-store.ts:appendHypothesisReceipt',
    description:
      'One file per (hypothesis-evaluation) cycle; aggregated by the compounding-engine fold into per-cohort trajectories.',
  },
  {
    name: 'hypotheses-ledger',
    subdirSegment: '.tesseract/compounding/hypotheses.jsonl',
    format: 'jsonl-stream',
    schemaVersion: 1,
    idempotencyKey: null,
    writer:
      'workshop/compounding/harness/filesystem-hypothesis-ledger.ts:appendHypothesis',
    description:
      'Authored hypotheses, line-per-hypothesis. Reader deduplicates by id (first-wins).',
  },
  {
    name: 'ratchets',
    subdirSegment: '.tesseract/compounding/ratchets',
    format: 'file-per-record',
    schemaVersion: 1,
    idempotencyKey: 'timestamp-fp',
    writer:
      'workshop/compounding/harness/filesystem-receipt-store.ts:appendRatchetEntry',
    description: 'Convergence ratchet entries; one per regression-detector emission.',
  },
  {
    name: 'scoreboard-snapshots',
    subdirSegment: '.tesseract/compounding/snapshots',
    format: 'file-per-record',
    schemaVersion: 1,
    idempotencyKey: 'timestamp-fp',
    writer: 'workshop/compounding/application/snapshot-store.ts:saveSnapshot',
    description: 'Scoreboard snapshots; readable by filename-sort to reconstruct the loss curve.',
  },
  {
    name: 'compilation-receipts',
    subdirSegment: '.tesseract/compounding/receipts/compilations',
    format: 'file-per-record',
    schemaVersion: 1,
    idempotencyKey: 'timestamp-fp',
    writer: 'workshop/compounding/emission/compile-receipt-emitter.ts:emit',
    description: 'Customer-compilation receipts emitted per `tesseract compile --emit-compounding-receipt`.',
  },
  {
    name: 'probe-receipts',
    subdirSegment: '.tesseract/probes/receipts',
    format: 'file-per-record',
    schemaVersion: 1,
    idempotencyKey: 'timestamp-fp',
    writer: 'workshop/probe-derivation/receipt-emitter.ts:emit',
    description: 'Probe-execution receipts; one per (probe, harness-rung, run) tuple.',
  },
  {
    name: 'scenario-receipts',
    subdirSegment: '.tesseract/scenarios/receipts',
    format: 'file-per-record',
    schemaVersion: 1,
    idempotencyKey: 'timestamp-fp',
    writer: 'workshop/scenarios/application/receipt-emitter.ts:emit',
    description: 'Scenario-execution receipts with full trace + invariant outcomes.',
  },
  {
    name: 'substrate-snapshots',
    subdirSegment: 'workshop/substrate-study/logs/snapshots',
    format: 'file-per-record',
    schemaVersion: 1,
    idempotencyKey: 'sample-id',
    writer:
      'workshop/substrate-study/infrastructure/snapshot-store.ts:write',
    description:
      'Reactive-OS DOM snapshots for Z11g.d.0a. Idempotent within an hour-bucket per (url, substrateVersion).',
  },
  {
    name: 'improvement-ledger',
    subdirSegment: '.tesseract/benchmarks/improvement-ledger.jsonl',
    format: 'jsonl-stream',
    schemaVersion: 1,
    idempotencyKey: null,
    writer:
      'product/instruments/repositories/local-improvement-run-repository.ts:appendRun',
    description:
      'Per-run experiment ledger; W4-E1 converted from rewrite-the-world to JSONL append-only.',
  },
  {
    name: 'dashboard-journal',
    subdirSegment: '.tesseract/dashboard/journal.jsonl',
    format: 'jsonl-stream',
    schemaVersion: 1,
    idempotencyKey: null,
    writer: 'dashboard/bridges/journal-writer.ts:appendJournalEntry',
    description:
      'Dashboard event journal; SSE clients tail; companion index is a derived projection.',
  },
];

/** Lookup helper: returns the entry for a given name, or
 *  null when not registered. */
export function findLogEntry(name: string): LogRegistryEntry | null {
  return LOG_REGISTRY.find((e) => e.name === name) ?? null;
}

/** Names of every log in the registry. */
export const REGISTERED_LOG_NAMES: readonly string[] = LOG_REGISTRY.map(
  (e) => e.name,
);
