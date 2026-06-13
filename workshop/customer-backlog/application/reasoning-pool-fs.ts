/**
 * Reasoning pool filesystem adapter — cohort side (Z11d).
 *
 * The cohort's reasoning rung writes pending requests and reads
 * filled responses using the SHARED pool format
 * (`product/domain/reasoning-pool/pool.ts`). The on-disk JSON shape
 * is the cross-seam contract; this is the workshop consumer of it,
 * mirroring how the cohort writes compilation receipts the product
 * compounding engine reads.
 *
 * Layout (under the pool root, default `.tesseract/reasoning-pool/`):
 *   pending/<fingerprint>.json   — recorded, awaiting a fill
 *   filled/<fingerprint>.json    — a fill pass authored a response
 *
 * Writes are atomic (temp + rename), the same discipline as the
 * MCP decision bridge, so a fill pass never reads a half-written
 * pending file.
 *
 * `.tesseract/` is gitignored; the pool is per-workspace runtime
 * state, not committed canon.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  parseFilledResponse,
  PoolError,
  type PendingRequest,
  type FilledResponse,
} from '../../../product/domain/reasoning-pool/pool';

export const DEFAULT_POOL_ROOT = path.join('.tesseract', 'reasoning-pool');

export function poolPaths(rootDir: string, poolRootRelative: string = DEFAULT_POOL_ROOT) {
  const root = path.join(rootDir, poolRootRelative);
  return {
    root,
    pendingDir: path.join(root, 'pending'),
    filledDir: path.join(root, 'filled'),
  };
}

/** Atomic write: temp file in the same dir, then rename. */
function atomicWrite(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

/** Record a pending request (idempotent on fingerprint — re-recording
 *  the same ask overwrites with identical content). */
export function recordPending(rootDir: string, pending: PendingRequest, poolRootRelative?: string): string {
  const { pendingDir } = poolPaths(rootDir, poolRootRelative);
  const file = path.join(pendingDir, `${pending.fingerprint}.json`);
  atomicWrite(file, `${JSON.stringify(pending, null, 2)}\n`);
  return file;
}

/** Write a filled response (the answer leg). Substrate-agnostic:
 *  the caller supplies the answer + provenance regardless of which
 *  reasoner produced it (Claude subagent, Copilot CLI, an API, a
 *  human). Atomic temp-rename so replay never reads a partial fill. */
export function writeFilled(rootDir: string, filled: FilledResponse, poolRootRelative?: string): string {
  const { filledDir } = poolPaths(rootDir, poolRootRelative);
  const file = path.join(filledDir, `${filled.fingerprint}.json`);
  atomicWrite(file, `${JSON.stringify(filled, null, 2)}\n`);
  return file;
}

/** Read a filled response by fingerprint. Returns the response, or a
 *  PoolError('not-filled') when no fill exists yet, or
 *  PoolError('malformed-fill') when the fill is invalid. */
export function readFilled(
  rootDir: string,
  fingerprint: string,
  poolRootRelative?: string,
): FilledResponse | PoolError {
  const { filledDir } = poolPaths(rootDir, poolRootRelative);
  const file = path.join(filledDir, `${fingerprint}.json`);
  if (!fs.existsSync(file)) {
    return new PoolError('not-filled', `no fill for ${fingerprint}`);
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parseFilledResponse(raw);
  } catch (cause) {
    return new PoolError('io-failed', `failed to read fill ${fingerprint}`, cause);
  }
}

/** List pending fingerprints that have no fill yet (for the fill
 *  pass / drain). */
export function listUnfilled(rootDir: string, poolRootRelative?: string): readonly PendingRequest[] {
  const { pendingDir, filledDir } = poolPaths(rootDir, poolRootRelative);
  if (!fs.existsSync(pendingDir)) return [];
  return fs
    .readdirSync(pendingDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(pendingDir, f), 'utf8')) as PendingRequest)
    .filter((p) => !fs.existsSync(path.join(filledDir, `${p.fingerprint}.json`)));
}
