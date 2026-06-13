/**
 * Held-out contact ledger (Cycle 11 / G5).
 *
 * Praxis audit §G5: nothing prevented a session from running the
 * cohort runner against a held-out AUT, and contact tracking did
 * not exist — the clean-room was etiquette. This is the audit
 * trail: every contact with a held-out AUT appends one line to a
 * COMMITTED ledger (who/when/mode/cases/receipt fingerprints), so
 * contamination is auditable data in-repo rather than a story.
 *
 * The ledger lives under the committed cohort directory (NOT under
 * the gitignored workshop/logs/), because its whole value is being
 * version-controlled evidence. A held-out evaluation is operator-
 * gated and rare, so the churn is intended and small. After a
 * held-out run, the agent commits the appended ledger line.
 *
 * Append-only JSONL. No in-place edits, no deletion.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Why a held-out AUT was contacted. */
export type ContactMode =
  /** Operator-sanctioned evaluation handoff (--evaluation-handoff). */
  | 'evaluation-handoff'
  /** A training-partition contact (recorded only for held-out;
   *  training contact does not append). Present for forward-compat. */
  | 'training'
  /** A contact that bypassed the sanction gate — should never
   *  appear if the guard is wired, but recorded defensively if a
   *  future caller appends without the flag. */
  | 'unsanctioned';

export interface HeldOutContactEntry {
  readonly aut: string;
  readonly url: string;
  readonly partition: 'training' | 'held-out';
  readonly cohortRole: 'training' | 'held-out';
  readonly mode: ContactMode;
  readonly evaluationHandoffAck: boolean;
  readonly contactedAt: string;
  readonly casesContacted: number;
  /** Resolver fingerprint(s) the receipts were produced under, so a
   *  duplicate evaluation against the same held-out AUT at the same
   *  resolver state (clean-room C3) is detectable. */
  readonly resolverFingerprints: readonly string[];
  /** Free-text operator note (e.g., the handoff doc reference). */
  readonly note: string;
}

const LEDGER_RELATIVE = path.join(
  'workshop',
  'customer-backlog',
  'public-aut',
  'contact-ledger.jsonl',
);

export function contactLedgerPath(rootDir: string): string {
  return path.join(rootDir, LEDGER_RELATIVE);
}

/** Append one contact entry. Append-only; never rewrites. */
export function appendHeldOutContact(rootDir: string, entry: HeldOutContactEntry): void {
  const file = contactLedgerPath(rootDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');
}

/** Read the ledger (empty when never written). */
export function loadContactLedger(rootDir: string): readonly HeldOutContactEntry[] {
  const file = contactLedgerPath(rootDir);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as HeldOutContactEntry);
}

/**
 * Detect a duplicate held-out evaluation: a prior ledger entry for
 * the same AUT sharing any resolver fingerprint with `current`
 * means the held-out AUT was already evaluated at this resolver
 * state (clean-room C3 — held-out AUTs are single-use per
 * canon/resolver state). Returns the matching prior entries.
 */
export function findDuplicateContacts(
  prior: readonly HeldOutContactEntry[],
  current: { readonly aut: string; readonly resolverFingerprints: readonly string[] },
): readonly HeldOutContactEntry[] {
  const fps = new Set(current.resolverFingerprints);
  return prior.filter(
    (e) => e.aut === current.aut && e.resolverFingerprints.some((f) => fps.has(f)),
  );
}
