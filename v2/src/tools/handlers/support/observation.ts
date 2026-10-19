/**
 * One observation, the way every handler takes it: walk the page with the
 * workspace's caps and PII mode, save the record (and screenshot) under
 * .tesseract/snapshots/ so later calls can cite it by snapshotId, and
 * remember it for the page.
 */
import type { Snapshot } from '../../../contract/schemas.js';
import type { PageHandle } from '../../../browser/types.js';
import { observePage, saveSnapshotRecord, type SnapshotRecord } from '../../../observe/index.js';
import type { ToolContext } from '../../types.js';
import { rememberSnapshot } from './page-state.js';

export interface ObservationRequest {
  readonly scope?: string;
  readonly includeScreenshot?: boolean;
  readonly audit?: boolean;
  readonly maxCandidates?: number;
}

export interface Observation {
  readonly snapshot: Snapshot;
  readonly record: SnapshotRecord;
}

export const observeAndSave = async (ctx: ToolContext, handle: PageHandle, request: ObservationRequest = {}): Promise<Observation> => {
  const { config } = ctx.workspace;
  const observed = await observePage(handle.page, {
    pageId: handle.pageId,
    ...(request.scope !== undefined ? { scope: request.scope } : {}),
    maxCandidates: request.maxCandidates ?? config.observe.maxCandidates,
    maxAriaBytes: config.observe.maxAriaBytes,
    pii: config.pii,
    ...(request.includeScreenshot === true ? { includeScreenshot: true } : {}),
    ...(request.audit === true ? { audit: true } : {}),
    now: ctx.now,
  });
  const saved = await saveSnapshotRecord(ctx.workspace, observed.record, observed.screenshot);
  rememberSnapshot(handle.page, saved.record);
  const snapshot: Snapshot =
    saved.screenshotPath !== undefined ? { ...observed.snapshot, screenshotPath: saved.screenshotPath } : observed.snapshot;
  return { snapshot, record: saved.record };
};

/** Text of the alert, status, log and .feedback-message regions that are showing. */
export const visibleAlerts = (record: SnapshotRecord): readonly string[] => [
  ...new Set(
    record.candidates
      .filter((candidate) => record.categories[candidate.ref] === 'message' && candidate.visible && candidate.name.trim().length > 0)
      .map((candidate) => candidate.name.trim()),
  ),
];
