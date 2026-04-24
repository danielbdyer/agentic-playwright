/**
 * CompilationReceipt emitter — Z11a.5.
 *
 * Pure builder (`buildCompilationReceipt`) + Effect-wrapped
 * filesystem writer (`emitCompilationReceipt`). The receipt shape
 * matches the Z11a.1 domain type exactly; this module is the
 * canonical constructor for the compounding engine's
 * customer-compilation cohort evidence.
 *
 * File path convention mirrors probe-receipts / scenario-receipts:
 *   workshop/logs/compilation-receipts/<iso-ts>-<adoId>-<fp>.json
 */

import { Effect } from 'effect';
import * as fs from 'fs';
import * as path from 'path';
import type {
  CompilationReceipt,
  CompilationReceiptPayload,
} from '../domain/compilation-receipt';
import type { HeuristicCaseSummary } from '../../customer-backlog/application/heuristic-classifier';
import {
  taggedFingerprintFor,
  asFingerprint,
  type Fingerprint,
} from '../../../product/domain/kernel/hash';

export interface BuildCompileReceiptInput {
  readonly summary: HeuristicCaseSummary;
  readonly hypothesisId: string | null;
  readonly reasoningReceiptIds: readonly string[];
  readonly totalLatencyMs: number;
  readonly substrateVersion: string;
  readonly manifestVersion: number;
  readonly adoContentHash: string;
  readonly computedAt: Date;
}

export function buildCompilationReceipt(input: BuildCompileReceiptInput): CompilationReceipt {
  const payload: CompilationReceiptPayload = {
    hypothesisId: input.hypothesisId,
    adoId: input.summary.adoId,
    corpus: input.summary.corpus,
    totalStepCount: input.summary.totalSteps,
    resolvedStepCount: input.summary.resolvedCount,
    needsHumanStepCount: input.summary.needsHumanCount,
    blockedStepCount: input.summary.blockedCount,
    handoffsEmitted: input.summary.handoffsEmittedCount,
    handoffsWithValidMissingContext: input.summary.handoffsWithValidContextCount,
    reasoningReceiptIds: input.reasoningReceiptIds,
    totalLatencyMs: input.totalLatencyMs,
    provenance: {
      substrateVersion: input.substrateVersion,
      manifestVersion: input.manifestVersion,
      computedAt: input.computedAt.toISOString(),
      adoContentFingerprint: asFingerprint('ado-content', input.adoContentHash),
    },
  };

  // Envelope fingerprint is content-addressed over the payload (minus
  // the computedAt wall-clock) so two runs with the same inputs on
  // the same day produce the same artifact fingerprint → dedup on
  // append. We include corpus+adoId in the hash input to be safe;
  // they're already in payload but making it explicit keeps the
  // invariant readable.
  const artifactInput = {
    kind: 'compilation-receipt' as const,
    adoId: input.summary.adoId,
    corpus: input.summary.corpus,
    totalStepCount: input.summary.totalSteps,
    resolvedStepCount: input.summary.resolvedCount,
    needsHumanStepCount: input.summary.needsHumanCount,
    blockedStepCount: input.summary.blockedCount,
    handoffsEmitted: input.summary.handoffsEmittedCount,
    handoffsWithValidMissingContext: input.summary.handoffsWithValidContextCount,
    substrateVersion: input.substrateVersion,
    manifestVersion: input.manifestVersion,
  };
  const artifactFp: Fingerprint<'artifact'> = taggedFingerprintFor('artifact', artifactInput);
  const contentFp: Fingerprint<'content'> = taggedFingerprintFor('content', payload);

  return {
    version: 1,
    stage: 'evidence',
    scope: 'compilation',
    kind: 'compilation-receipt',
    ids: {},
    fingerprints: {
      artifact: artifactFp,
      content: contentFp,
    },
    lineage: {
      sources: [`customer-backlog:${input.summary.corpus}:${input.summary.adoId}`],
      parents: [],
      handshakes: ['evidence'],
    },
    governance: 'approved',
    payload,
  };
}

export interface EmitCompileReceiptOptions extends BuildCompileReceiptInput {
  readonly logRoot: string;
}

function sanitizeTimestamp(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

export function emitCompilationReceipt(
  options: EmitCompileReceiptOptions,
): Effect.Effect<CompilationReceipt, never, never> {
  return Effect.sync(() => {
    const receipt = buildCompilationReceipt(options);
    const dir = path.join(options.logRoot, 'workshop', 'logs', 'compilation-receipts');
    fs.mkdirSync(dir, { recursive: true });
    const ts = sanitizeTimestamp(receipt.payload.provenance.computedAt);
    const fpSuffix = receipt.fingerprints.artifact.replace(/^sha256:/, '').slice(0, 12);
    const filename = `${ts}-${options.summary.adoId}-${fpSuffix}.json`;
    const fullPath = path.join(dir, filename);
    fs.writeFileSync(fullPath, JSON.stringify(receipt, null, 2));
    return receipt;
  });
}
