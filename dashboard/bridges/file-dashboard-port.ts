/**
 * File-backed DashboardPort for MCP-connected sessions.
 *
 * emit() is a no-op (observation happens via MCP tools reading disk).
 * awaitDecision() pauses the fiber and watches for a decision file
 * written by the MCP server in a separate process.
 */

import { Effect } from 'effect';
import type { DashboardPort } from '../../application/ports';
import type { WorkItemDecision } from '../../domain/observation/dashboard';
import { watchForDecision } from './file-decision-bridge';

export interface FileBackedDashboardOptions {
  readonly decisionsDir: string;
  readonly decisionTimeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export function createFileBackedDashboardPort(options: FileBackedDashboardOptions): DashboardPort {
  const timeoutMs = options.decisionTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    emit: () => Effect.void,

    awaitDecision: (item) => Effect.async<WorkItemDecision, never, never>((resume) => {
      const watch = watchForDecision(options.decisionsDir, item.id, timeoutMs);

      watch.promise.then(
        (decision) => resume(Effect.succeed(decision)),
        // Should never reject, but handle gracefully
        () => resume(Effect.succeed({
          workItemId: item.id,
          status: 'skipped' as const,
          rationale: 'File decision watcher failed unexpectedly',
        })),
      );

      // Cleanup finalizer: cancel the watcher on fiber interruption
      return Effect.sync(() => watch.cancel());
    }),
  };
}
