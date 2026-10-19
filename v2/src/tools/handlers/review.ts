/**
 * review.record: a human's verdict on an emitted test. The acceptance
 * receipts are the acceptance number (vision §6.1); an accepted test also
 * promotes the candidate facets it uses to trusted, which is how a human's
 * review becomes memory.
 */
import { ToolError } from '../../core/errors.js';
import { appendJsonl } from '../../core/fsio.js';
import { AcceptanceReceiptSchema, type AcceptanceReceipt } from '../../contract/schemas.js';
import { recordAcceptance } from '../../memory/index.js';
import { latestEmitFor } from '../../run/index.js';
import type { ToolHandlers } from '../types.js';

/** Edits at most this many lines still count as accepted. */
export const SMALL_EDIT_LINES = 5;

/**
 * accept counts; accept-with-edit counts when the edit was small (≤ 5
 * changed lines) or was only a locator in an overrides file (the caller's
 * locatorEdited flag is that signal); reject never counts.
 */
export const countsAsAccepted = (decision: AcceptanceReceipt['decision'], changedLines: number | undefined, locatorEdited: boolean | undefined): boolean =>
  decision === 'accept' ||
  (decision === 'accept-with-edit' && ((changedLines !== undefined && changedLines <= SMALL_EDIT_LINES) || locatorEdited === true));

export const reviewHandlers: Pick<ToolHandlers, 'review.record'> = {
  'review.record': async (input, ctx) => {
    const { workspace } = ctx;
    const record = await latestEmitFor(workspace, input.testCaseId);
    if (record === null) {
      throw new ToolError('not-found', `test case ${input.testCaseId} has never been emitted; there is no test to review`, { testCaseId: input.testCaseId });
    }
    const counts = countsAsAccepted(input.decision, input.changedLines, input.locatorEdited);
    const { promoted } = await recordAcceptance(
      workspace,
      { testCaseId: input.testCaseId, facetIds: record.facets, reviewer: input.reviewer, decision: input.decision, countsAsAccepted: counts },
      { now: ctx.now },
    );
    const receipt: AcceptanceReceipt = {
      at: ctx.now().toISOString(),
      testCaseId: input.testCaseId,
      decision: input.decision,
      reviewer: input.reviewer,
      ...(input.changedLines !== undefined ? { changedLines: input.changedLines } : {}),
      ...(input.locatorEdited !== undefined ? { locatorEdited: input.locatorEdited } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      spec: record.specPath,
      facetsPromoted: [...promoted],
      countsAsAccepted: counts,
    };
    await appendJsonl(workspace.paths.reviewReceipts, AcceptanceReceiptSchema.parse(receipt));
    return receipt;
  },
};
