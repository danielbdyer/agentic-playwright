import { Effect } from 'effect';
import { emitAgentWorkbench, loadAgentWorkbench, nextWorkItem, completeWorkItem } from '../../agent-workbench';
import type { CommandSpec } from '../shared';

export const workbenchCommand: CommandSpec = {
  flags: ['--list', '--next', '--complete', '--skip', '--reason', '--skip-below'],
  parse: ({ flags }) => {
    const hasListFlag = Boolean(flags.list);
    const hasNextFlag = Boolean(flags.next);
    const completionId = flags.complete as string | undefined;
    const skipId = flags.skip as string | undefined;
    const reason = (flags.reason as string | undefined) ?? '';
    const skipBelow = flags.skipBelow as number | undefined;

    return {
      command: 'workbench',
      strictExitOnUnbound: false,
      postureInput: {},
      execute: (paths) => {
        // --next: return top-priority item
        if (hasNextFlag) {
          return nextWorkItem({ paths }).pipe(
            Effect.map((item) => item ?? { message: 'No pending work items.' }),
          );
        }
        // --complete <id>: mark item as completed
        if (completionId) {
          return completeWorkItem({
            paths,
            completion: {
              workItemId: completionId,
              status: 'completed',
              completedAt: new Date().toISOString(),
              rationale: reason || `Completed via CLI`,
              artifactsWritten: [],
            },
          });
        }
        // --skip <id>: mark item as skipped
        if (skipId) {
          return completeWorkItem({
            paths,
            completion: {
              workItemId: skipId,
              status: 'skipped',
              completedAt: new Date().toISOString(),
              rationale: reason || `Skipped via CLI`,
              artifactsWritten: [],
            },
          });
        }
        // --skip-below <threshold>: bulk skip low-priority items
        if (skipBelow !== undefined) {
          return loadAgentWorkbench({ paths }).pipe(
            Effect.flatMap((wb) => {
              if (!wb) return Effect.succeed([]);
              const toSkip = wb.items.filter((item) => item.priority < skipBelow);
              return Effect.all(
                toSkip.map((item) => completeWorkItem({
                  paths,
                  completion: {
                    workItemId: item.id,
                    status: 'skipped',
                    completedAt: new Date().toISOString(),
                    rationale: `Auto-skipped: priority ${item.priority.toFixed(3)} below threshold ${skipBelow}`,
                    artifactsWritten: [],
                  },
                })),
                { concurrency: 1 },
              );
            }),
          );
        }
        // --list: load and return workbench
        if (hasListFlag) {
          return loadAgentWorkbench({ paths }).pipe(
            Effect.map((wb) => wb ?? { message: 'No workbench found. Run a speedrun first.' }),
          );
        }
        // default: emit (regenerate) workbench projection
        return emitAgentWorkbench({ paths });
      },
    };
  },
};
