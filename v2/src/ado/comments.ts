/**
 * Work item comments: how a handoff reaches the QA lead in the place they
 * already look (vision §5.7). The comments API is still a preview API on
 * Azure DevOps Services, hence its own api-version.
 */
import type { Handoff } from '../contract/schemas.js';
import type { AdoClient } from './client.js';
import { CommentSchema, parseBody } from './responses.js';

export const COMMENTS_API_VERSION = '7.1-preview.4';

export interface PostedComment {
  /** The comment's URL as Azure DevOps reports it (…/_apis/wit/workItems/{id}/comments/{commentId}). */
  readonly url: string;
  readonly commentId: number;
  /** The work item's page in the ADO web UI, where the comment shows in the discussion. */
  readonly workItemUrl: string;
}

/**
 * POST _apis/wit/workItems/{id}/comments with `{ text: html }`. Not retried
 * after an ambiguous failure, since a resend would post the comment twice.
 */
export const commentOnWorkItem = async (
  client: AdoClient,
  workItemId: string | number,
  html: string,
  options: { readonly apiVersion?: string } = {},
): Promise<PostedComment> => {
  const path = `_apis/wit/workItems/${encodeURIComponent(String(workItemId))}/comments`;
  const response = await client.request({
    method: 'POST',
    path,
    apiVersion: options.apiVersion ?? COMMENTS_API_VERSION,
    body: { text: html },
    idempotent: false,
    what: `comment on work item ${workItemId}`,
  });
  const comment = parseBody(CommentSchema, response.body, `comment on work item ${workItemId}`);
  const fallback = client.url(`${path}/${comment.id}`, undefined, options.apiVersion ?? COMMENTS_API_VERSION).replace(/\?.*$/, '');
  return { url: comment.url ?? fallback, commentId: comment.id, workItemUrl: client.workItemUrl(workItemId) };
};

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const list = (items: readonly string[]): string => (items.length === 0 ? '' : `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);

const BLOCKAGE_TEXT: Readonly<Record<Handoff['blockage'], string>> = {
  'ambiguous-target': 'several controls could be the target',
  'text-mismatch': 'the expected text does not match what the page shows',
  'not-found': 'the target could not be found',
  'missing-data': 'the test data this step needs is not declared',
  auth: 'authentication blocked the step',
  environment: 'the environment misbehaved',
  unsupported: 'the step asks for something not supported',
  other: 'the step could not be resolved',
};

/**
 * The HTML comment for a handoff: what is blocked and why, what was tried,
 * the candidates, what a human could do, and the assertion the agent would
 * write. Every value is escaped; nothing from the page is trusted as markup.
 */
export const formatHandoffComment = (handoff: Handoff, options: { readonly screenshotNote?: string } = {}): string =>
  [
    `<p><b>tesseract-qa needs a human for step ${handoff.stepIndex}${handoff.stepIdentifier !== undefined ? ` (ADO step ${escapeHtml(handoff.stepIdentifier)})` : ''}</b>: ${escapeHtml(BLOCKAGE_TEXT[handoff.blockage])}.</p>`,
    `<p>Step: ${escapeHtml(handoff.unresolvedIntent)}</p>`,
    handoff.attempted.length > 0 ? `<p>Tried:</p>${list(handoff.attempted)}` : '',
    handoff.candidates.length > 0
      ? `<p>Candidates:</p>${list(handoff.candidates.map((candidate) => `${candidate.role !== undefined ? `${candidate.role} ` : ''}"${candidate.name}"${candidate.why !== undefined ? ` (${candidate.why})` : ''}`))}`
      : '',
    handoff.proposedAssertion !== undefined ? `<p>Proposed assertion: <code>${escapeHtml(handoff.proposedAssertion)}</code></p>` : '',
    handoff.nextMoves.length > 0 ? `<p>To unblock:</p>${list(handoff.nextMoves)}` : '',
    options.screenshotNote !== undefined ? `<p>${escapeHtml(options.screenshotNote)}</p>` : '',
    `<p><i>Handoff ${escapeHtml(handoff.handoffId)}; the emitted test marks this step test.fixme until it is resolved.</i></p>`,
  ]
    .filter((part) => part.length > 0)
    .join('');
