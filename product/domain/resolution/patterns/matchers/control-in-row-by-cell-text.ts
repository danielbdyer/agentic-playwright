/**
 * control-in-row-by-cell-text — the row-scoped rung (reality-study
 * §10 C7, handoff N10).
 *
 * The held-out Bulkactionswithfilters screen showed nine bulk-select
 * checkboxes with no accessible name at all; their only handle is
 * the row they sit in, identified by a cell's text. This matcher
 * resolves an intent carrying `inRowWith`:
 *
 *   1. among `row` surfaces, keep those containing a surface whose
 *      text or name contains the cell text (case-insensitive);
 *      exactly one row must remain;
 *   2. within it, keep surfaces admitted by the role hint (or any
 *      role when none) and matching the name hint when present;
 *      exactly one must remain.
 *
 * Containment is the index's `ancestors` — real, not flat. Pure.
 */

import { Option } from 'effect';
import type { IndexedSurface, Matcher, MatcherResult } from '../rung-kernel';
import { matcherId, rolesAdmittedBy } from '../rung-kernel';

const MATCHER_ID = matcherId('control-in-row-by-cell-text');

function cellText(s: IndexedSurface): string | null {
  return s.text ?? s.name;
}

function matchName(s: IndexedSurface, target: string, strict: boolean): boolean {
  if (s.name === null) return false;
  return strict ? s.name === target : s.name.toLowerCase().includes(target.toLowerCase());
}

export const controlInRowByCellTextMatcher: Matcher = (ctx) => {
  const { role, name, nameSubstring, inRowWith } = ctx.intent.targetShape;
  if (!inRowWith) return Option.none();
  const needle = inRowWith.toLowerCase();

  const rows = ctx.surfaceIndex.findByRole('row').filter((row) =>
    ctx.surfaceIndex
      .surfacesWithin(row)
      .some((s) => (cellText(s) ?? '').toLowerCase().includes(needle)),
  );
  if (rows.length !== 1) return Option.none();
  const row = rows[0]!;

  const targetName = name ?? nameSubstring;
  const candidates = ctx.surfaceIndex
    .surfacesWithin(row)
    .filter((s) => (role ? rolesAdmittedBy(role).includes(s.role) : true))
    .filter((s) => (targetName ? matchName(s, targetName, Boolean(name)) : true));
  if (candidates.length !== 1) return Option.none();

  const surface = candidates[0]!;
  return Option.some<MatcherResult>({
    targetSurfaceId: surface.surfaceId,
    matcherId: MATCHER_ID,
    rationale: `${role ?? 'the only matching control'} inside the row whose cell says "${inRowWith}"`,
  });
};
