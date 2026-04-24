/**
 * dialog-button-by-name — matcher for click-on-button inside a
 * dialog landmark (dialog / alertdialog). Fires when the intent
 * names a button and the page has a dialog landmark containing a
 * single button with that name.
 *
 * Substrate note: the current synthetic-app does not render dialog
 * surfaces (one of the 14 gaps in docs/v2-synthetic-app-surface-
 * backlog.md). This matcher is always a miss under current fixtures
 * — by design — and will fire when the modal dialog preset lands
 * in a future substrate slice.
 *
 * Pure — no Effect imports.
 */

import { Option } from 'effect';
import type { IndexedSurface, Matcher, MatcherResult } from '../rung-kernel';
import { matcherId } from '../rung-kernel';

const MATCHER_ID = matcherId('dialog-button-by-name');

function matchName(s: IndexedSurface, target: string, strict: boolean): boolean {
  if (s.name === null) return false;
  return strict ? s.name === target : s.name.toLowerCase().includes(target.toLowerCase());
}

function findDialog(ctx: Parameters<Matcher>[0]): Option.Option<IndexedSurface> {
  const dialog = ctx.surfaceIndex.findLandmarkByRole('dialog');
  if (Option.isSome(dialog)) return dialog;
  return ctx.surfaceIndex.findLandmarkByRole('alertdialog');
}

export const dialogButtonByNameMatcher: Matcher = (ctx) => {
  const { role, name, nameSubstring } = ctx.intent.targetShape;
  const targetName = name ?? nameSubstring;
  if (!targetName) return Option.none();
  if (role && role !== 'button') return Option.none();

  const dialog = findDialog(ctx);
  if (Option.isNone(dialog)) return Option.none();

  const buttons = ctx.surfaceIndex
    .surfacesWithin(dialog.value)
    .filter((s) => s.role === 'button' && matchName(s, targetName, Boolean(name)));
  if (buttons.length !== 1) return Option.none();

  const surface = buttons[0]!;
  return Option.some<MatcherResult>({
    targetSurfaceId: surface.surfaceId,
    matcherId: MATCHER_ID,
    rationale: `button named "${targetName}" inside dialog landmark`,
  });
};
