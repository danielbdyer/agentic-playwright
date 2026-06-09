/**
 * promptFingerprint — the reasoning-pool's content-addressed key
 * (Z11d, plan §8.1).
 *
 * Pure function over (op, promptText, model, temperature,
 * closedParams). Same inputs → byte-equal fingerprint (I-Fingerprint).
 * `stableStringify` inside `taggedFingerprintFor` sorts object keys,
 * so closed-param insertion order cannot perturb the key (ZD1.b).
 *
 * Callsites that embed wall-clock or UUIDs in `promptText` forfeit
 * cache hits by design — that is a call-site bug, not a pool concern.
 *
 * Uses the raw-hex `fingerprintFor` (not the `sha256:`-prefixed
 * `taggedFingerprintFor`) because the fingerprint doubles as the
 * pool file's basename and `:` is illegal in Windows filenames.
 */

import { fingerprintFor, type Fingerprint } from '../../domain/kernel/hash';
import type { ReasoningOp } from '../reasoning';

export function promptFingerprint(
  op: ReasoningOp,
  promptText: string,
  model: string,
  temperature: number,
  closedParams: Readonly<Record<string, string>>,
): Fingerprint<'reasoning-pool-key'> {
  return fingerprintFor('reasoning-pool-key', {
    op,
    promptText,
    model,
    temperature,
    closedParams,
  });
}
