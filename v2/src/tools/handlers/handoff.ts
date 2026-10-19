/**
 * handoff.raise: ask a human instead of guessing (vision §5.7). The handoff
 * lands where the QA lead already looks: a file in the repository (written
 * first, so nothing that fails later can lose it), a screenshot of the page
 * when one is open, and a comment on the ADO test case when Azure DevOps is
 * configured. test.emit turns the returned handoffId into test.fixme.
 */
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { ToolError } from '../../core/errors.js';
import { relativePosix } from '../../core/fsio.js';
import type { Handoff } from '../../contract/schemas.js';
import { adoClientFromWorkspace, commentOnWorkItem, formatHandoffComment, loadCase } from '../../ado/index.js';
import { locateSpec } from '../../emit/index.js';
import type { Workspace } from '../../workspace/workspace.js';
import type { ToolHandlers } from '../types.js';
import { assertCaseId, handoffPath, handoffScreenshotPath, openHandoff, readHandoffFile, writeHandoffFile, type HandoffFile } from './handoff-store.js';

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** The spec already emitted for the case, if any (a second spec for the same id is a conflict elsewhere; here it just is not named). */
const specFor = async (workspace: Workspace, testCaseId: string): Promise<string | null> => {
  try {
    return await locateSpec(workspace, testCaseId);
  } catch {
    return null;
  }
};

/** The ADO step identifier of a step, from the cached case, when the caller did not give one. */
const cachedIdentifier = async (workspace: Workspace, testCaseId: string, stepIndex: number): Promise<string | undefined> => {
  try {
    return (await loadCase(workspace, testCaseId))?.steps.find((step) => step.index === stepIndex)?.stepIdentifier;
  } catch {
    return undefined;
  }
};

export const handoffHandlers: Pick<ToolHandlers, 'handoff.raise'> = {
  'handoff.raise': async (input, ctx) => {
    const { workspace } = ctx;
    const testCaseId = assertCaseId(input.testCaseId);
    const handle = input.evidence.pageId !== undefined ? ctx.browser.get(input.evidence.pageId) : null;

    const file = handoffPath(workspace, testCaseId, input.stepIndex);
    const previous = await readHandoffFile(workspace, testCaseId, input.stepIndex).catch(async (error: Error) => {
      // A hand-mangled file must not block asking a human; keep its bytes beside the new one.
      await fs.copyFile(file, `${file}.corrupt`).catch(() => undefined);
      ctx.log(`${relativePosix(workspace.paths.root, file)} was unreadable (${error.message}); kept as ${relativePosix(workspace.paths.root, file)}.corrupt`);
      return null;
    });
    const handoffId = `h-${testCaseId}-${input.stepIndex}-${randomBytes(4).toString('hex')}`;

    let screenshotPath: string | undefined;
    if (handle !== null) {
      const shot = handoffScreenshotPath(workspace, testCaseId, input.stepIndex);
      try {
        await handle.page.screenshot({ path: shot, fullPage: true, timeout: 10_000 });
        screenshotPath = relativePosix(workspace.paths.root, shot);
      } catch (error) {
        ctx.log(`handoff ${handoffId}: no screenshot (${(error as Error).message.split('\n')[0]})`);
      }
    }

    const stepIdentifier = input.stepIdentifier ?? (await cachedIdentifier(workspace, testCaseId, input.stepIndex));
    const handoff: Handoff = {
      handoffId,
      testCaseId,
      stepIndex: input.stepIndex,
      ...(stepIdentifier !== undefined ? { stepIdentifier } : {}),
      blockage: input.blockage,
      unresolvedIntent: input.unresolvedIntent,
      attempted: [...input.attempted],
      evidence: {
        ...(input.evidence.snapshotId !== undefined ? { snapshotId: input.evidence.snapshotId } : {}),
        ...(screenshotPath !== undefined ? { screenshotPath } : {}),
      },
      candidates: (input.candidates ?? []).map((candidate) => ({ ...candidate })),
      nextMoves: [...input.nextMoves],
      ...(input.proposedAssertion !== undefined ? { proposedAssertion: input.proposedAssertion } : {}),
      raisedAt: ctx.now().toISOString(),
      status: 'open',
    };
    const history = previous === null ? [] : [...(previous.history ?? []), openHandoff(previous)];
    const record: HandoffFile = { ...handoff, ...(history.length > 0 ? { history } : {}) };
    // The local handoff is written before anything that can fail remotely.
    await writeHandoffFile(workspace, record);

    const client = input.commentOnAdo === false ? null : adoClientFromWorkspace(workspace, ctx.env, { log: ctx.log });
    let adoCommentUrl: string | undefined;
    if (client !== null) {
      const spec = await specFor(workspace, testCaseId);
      const extra = [
        ...(spec !== null ? [`<p>Spec: <code>${escapeHtml(spec)}</code></p>`] : []),
        ...(history.length > 0 ? [`<p>Raised before for this step: ${history.map((h) => escapeHtml(h.handoffId)).join(', ')}.</p>`] : []),
      ].join('');
      try {
        const html = formatHandoffComment(handoff, screenshotPath !== undefined ? { screenshotNote: `Screenshot in the repository: ${screenshotPath}` } : {}) + extra;
        const posted = await commentOnWorkItem(client, testCaseId, html);
        adoCommentUrl = posted.url;
        await writeHandoffFile(workspace, { ...record, adoCommentUrl });
      } catch (error) {
        ctx.log(`handoff ${handoffId}: the Azure DevOps comment failed (${error instanceof ToolError ? `${error.family}: ` : ''}${(error as Error).message}); the handoff is saved at ${relativePosix(workspace.paths.root, file)}`);
      }
    }

    return {
      handoffId,
      path: relativePosix(workspace.paths.root, file),
      ...(screenshotPath !== undefined ? { screenshotPath } : {}),
      ...(adoCommentUrl !== undefined ? { adoCommentUrl } : {}),
    };
  },
};
