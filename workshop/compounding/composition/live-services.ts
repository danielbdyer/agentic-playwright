/**
 * Layer composition root for the filesystem service set.
 *
 * Per docs/v2-compounding-engine-plan.md §4.5, this layer is what
 * CLI entry points + real scoreboard runs wire into Effect.provide.
 * It does NOT acquire scoped resources — node fs is process-global,
 * and hygiene lives in the individual adapters.
 *
 * Default log roots:
 *   hypothesis ledger  → <rootDir>/workshop/logs/
 *   receipt store      → <rootDir>/workshop/logs/
 *
 * CLI callers with a different convention can pass explicit
 * hypothesisLogDir + receiptLogDir options.
 */

import { Layer } from 'effect';
import path from 'node:path';
import { HypothesisLedger, ReceiptStore } from '../application/ports';
import { createFilesystemHypothesisLedger } from '../harness/filesystem-hypothesis-ledger';
import { createFilesystemReceiptStore } from '../harness/filesystem-receipt-store';

export interface LiveCompoundingLayerOptions {
  readonly rootDir: string;
  readonly hypothesisLogDir?: string;
  readonly receiptLogDir?: string;
}

export function defaultHypothesisLogDir(rootDir: string): string {
  return path.join(rootDir, 'workshop', 'logs');
}

export function defaultReceiptLogDir(rootDir: string): string {
  return path.join(rootDir, 'workshop', 'logs');
}

export function liveCompoundingLayer(options: LiveCompoundingLayerOptions) {
  const ledger = createFilesystemHypothesisLedger({
    logDir: options.hypothesisLogDir ?? defaultHypothesisLogDir(options.rootDir),
  });
  const store = createFilesystemReceiptStore({
    logDir: options.receiptLogDir ?? defaultReceiptLogDir(options.rootDir),
  });
  return Layer.mergeAll(
    Layer.succeed(HypothesisLedger, ledger),
    Layer.succeed(ReceiptStore, store),
  );
}
