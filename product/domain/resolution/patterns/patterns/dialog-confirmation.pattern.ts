/**
 * dialog-confirmation — resolves click intents scoped to a dialog
 * (modal) landmark.
 *
 * Substrate caveat: current synthetic-app has no dialog role
 * support (tracked in docs/v2-synthetic-app-surface-backlog.md +
 * the CB-90101 needs-human ADO case). The pattern is registered as
 * an empty carrier today — it never fires under the present
 * substrate. Fires when the substrate grows dialog rendering.
 *
 * Applicability: verb=click plus either explicit dialog-context
 * cues in the action text ("in the modal", "in the dialog",
 * "in the confirmation") OR the intent names a canonical dialog
 * button (Confirm / Cancel / Accept / Dismiss / OK).
 *
 * Pure — no Effect imports.
 */

import type { MatcherContext, Pattern } from '../rung-kernel';
import { patternId } from '../rung-kernel';
import { firstMatchWins } from '../orchestrators/first-match-wins';
import { dialogButtonByNameMatcher } from '../matchers/dialog-button-by-name';

const DIALOG_CUE_RE = /\b(modal|dialog|confirmation|popup|lightbox)\b/i;
const DIALOG_BUTTON_NAME_RE = /\b(confirm|cancel|accept|dismiss|ok|close)\b/i;

function isDialogClick(ctx: MatcherContext): boolean {
  if (ctx.intent.verb !== 'click') return false;
  if (DIALOG_CUE_RE.test(ctx.intent.originalActionText)) return true;
  const { name, nameSubstring } = ctx.intent.targetShape;
  return Boolean(name && DIALOG_BUTTON_NAME_RE.test(name))
    || Boolean(nameSubstring && DIALOG_BUTTON_NAME_RE.test(nameSubstring));
}

export const dialogConfirmationPattern: Pattern = {
  id: patternId('dialog-confirmation'),
  description: 'Resolve click-on-button intents scoped to a dialog / alertdialog landmark',
  applicabilityGuard: isDialogClick,
  matchers: [dialogButtonByNameMatcher],
  orchestrator: firstMatchWins,
};
