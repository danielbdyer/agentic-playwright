/**
 * File-based decision bridge for cross-process MCP ↔ dogfood loop communication.
 *
 * The MCP server (separate process) writes decision files.
 * The speedrun process watches for them and resumes paused fibers.
 *
 * Protocol:
 *   MCP writes: .tesseract/workbench/decisions/<workItemId>.json
 *   Speedrun watches: fs.watch on decisions dir, read + delete = atomic claim
 */

import * as fs from 'fs';
import * as path from 'path';
import type { WorkItemDecision } from '../../domain/types/dashboard';

// ─── Writer (used by MCP process) ───

/** Atomically write a decision file. Temp-file + rename prevents partial reads. */
export function writeDecisionFile(decisionsDir: string, decision: WorkItemDecision): void {
  fs.mkdirSync(decisionsDir, { recursive: true });
  const filePath = path.join(decisionsDir, `${decision.workItemId}.json`);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(decision), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

// ─── Watcher (used by speedrun process) ───

export interface DecisionWatch {
  readonly promise: Promise<WorkItemDecision>;
  readonly cancel: () => void;
}

/** Try to claim (read + delete) a decision file. Returns null if not found or invalid. */
function tryClaimDecision(decisionsDir: string, workItemId: string): WorkItemDecision | null {
  const filePath = path.join(decisionsDir, `${workItemId}.json`);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    fs.unlinkSync(filePath);
    return JSON.parse(content) as WorkItemDecision;
  } catch {
    return null;
  }
}

/**
 * Watch for a decision file matching the given work item ID.
 *
 * 1. Checks if file already exists (covers race: MCP wrote before watcher started).
 * 2. Starts fs.watch on the decisions directory.
 * 3. On match: read + delete (atomic claim), resolve promise.
 * 4. On timeout: resolve with auto-skip decision.
 * 5. cancel() closes watcher and clears timeout.
 */
export function watchForDecision(
  decisionsDir: string,
  workItemId: string,
  timeoutMs: number,
): DecisionWatch {
  let watcher: fs.FSWatcher | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  const cleanup = () => {
    if (watcher) { try { watcher.close(); } catch { /* ignore */ } watcher = null; }
    if (timer) { clearTimeout(timer); timer = null; }
  };

  const promise = new Promise<WorkItemDecision>((resolve) => {
    const settle = (decision: WorkItemDecision) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(decision);
    };

    // Ensure directory exists before watching
    fs.mkdirSync(decisionsDir, { recursive: true });

    // Check for pre-existing decision (race: MCP wrote before we started watching)
    const existing = tryClaimDecision(decisionsDir, workItemId);
    if (existing) { settle(existing); return; }

    // Watch for new files
    try {
      watcher = fs.watch(decisionsDir, (_eventType, filename) => {
        if (filename === `${workItemId}.json`) {
          const decision = tryClaimDecision(decisionsDir, workItemId);
          if (decision) settle(decision);
        }
      });
      watcher.on('error', () => {
        // Watcher failed — fall through to timeout
      });
    } catch {
      // Directory watch failed — fall through to timeout
    }

    // Timeout → auto-skip
    timer = setTimeout(() => {
      settle({
        workItemId,
        status: 'skipped',
        rationale: `Auto-skip (${timeoutMs}ms timeout — no MCP decision received)`,
      });
    }, timeoutMs);
  });

  return {
    promise,
    cancel: () => {
      if (!settled) {
        settled = true;
        cleanup();
      }
    },
  };
}
