/**
 * Cohort trust guard — workshop-side preventive enforcement of the
 * spike's clean-room rule (`docs/v2-cold-start-cohort-spike.md
 * §4.4`).
 *
 * Cycle 4 of the cold-start cohort spike. Plants the helper that
 * the cohort runner calls before any side-effecting probe; today
 * it is preventive (the runner doesn't graduate canon at all), but
 * it documents the C2 invariant in code and gives the future
 * trust-policy gate at `product/application/policy/trust-policy.ts`
 * a known integration point.
 *
 * Invariants enforced:
 *   C2 — When a cohort run's role is 'held-out', no canon
 *        graduation may occur. The held-out partition is
 *        firewalled from the canon-graduation pipeline.
 *
 * Pure — no Effect imports, no I/O. The helper throws
 * synchronously when the invariant would be violated; callers
 * decide whether to convert to Effect.fail upstream.
 */

import { TesseractError } from '../../../product/domain/kernel/errors';
import type { CohortPartition } from './load-public-aut-cohort';

export class HeldOutCanonWriteAttempt extends TesseractError {
  override readonly _tag = 'HeldOutCanonWriteAttempt' as const;

  constructor(detail: string, cause?: unknown) {
    super(
      'cohort-clean-room-violation',
      `Held-out cohort role does not permit canon writes: ${detail}`,
      cause,
    );
    this.name = 'HeldOutCanonWriteAttempt';
  }
}

export class UnsanctionedHeldOutContact extends TesseractError {
  override readonly _tag = 'UnsanctionedHeldOutContact' as const;

  constructor(detail: string, cause?: unknown) {
    super(
      'cohort-clean-room-violation',
      `Held-out AUT contact requires --evaluation-handoff acknowledgement: ${detail}`,
      cause,
    );
    this.name = 'UnsanctionedHeldOutContact';
  }
}

/**
 * Clean-room C5 gate (Cycle 11 / G5). The cohort runner must refuse
 * to contact a held-out AUT unless the operator explicitly
 * acknowledges the evaluation handoff. Before this gate, the
 * held-out discipline was prose + cohort.json notes; cycles 5–7
 * showed how quietly contamination happens under prose-only rules.
 *
 * `role` is the effective cohort role for the AUT being contacted
 * (manifest partition, or --cohort-role override). `handoffAck` is
 * whether --evaluation-handoff was supplied. Training contact is
 * always sanctioned; held-out contact requires the acknowledgement.
 *
 * Throws synchronously; the CLI converts to a non-zero exit.
 */
export function assertHeldOutContactSanctioned(
  role: CohortPartition,
  handoffAck: boolean,
  contextDetail: string,
): void {
  if (role === 'held-out' && !handoffAck) {
    throw new UnsanctionedHeldOutContact(contextDetail);
  }
}

/**
 * Throws when the active cohort role would be permitted to write
 * canon under spike §4.4 C2's interpretation. The 'training' role
 * passes through; 'held-out' raises.
 *
 * Callers should invoke this BEFORE any side-effect that could
 * graduate canon (catalog writes, proposal activations,
 * trust-policy threshold updates). Today the public-AUT runner
 * has no such side effects, so the call is preventive — but
 * placing the call documents the invariant and ensures any
 * future code path that adds canon-writing behavior must reckon
 * with it explicitly.
 */
export function assertCanonWritesAllowed(
  role: CohortPartition,
  contextDetail: string,
): void {
  if (role === 'held-out') {
    throw new HeldOutCanonWriteAttempt(contextDetail);
  }
}

/**
 * Predicate form of the same guard, for callers that prefer to
 * branch rather than throw. Returns true when the role permits
 * canon writes.
 */
export function canonWritesAllowed(role: CohortPartition): boolean {
  return role === 'training';
}
