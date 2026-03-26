/**
 * Agent work item transactor — act on individual workbench items.
 *
 * Usage from Claude Code:
 *   npx tsx scripts/act-on-workitem.ts --item-id <id> --action approve
 *   npx tsx scripts/act-on-workitem.ts --item-id <id> --action skip --reason "not relevant"
 *   npx tsx scripts/act-on-workitem.ts --list                    # list pending items
 *   npx tsx scripts/act-on-workitem.ts --next                    # show top-priority item
 *   npx tsx scripts/act-on-workitem.ts --complete-all-skippable  # skip all low-priority items
 */

import * as fs from 'fs';
import * as path from 'path';
import { createProjectPaths } from '../lib/application/paths';
import { completeWorkItem } from '../lib/application/agent-workbench';
import { runWithLocalServices } from '../lib/composition/local-services';
import type { AgentWorkbenchProjection, AgentWorkItem, WorkItemCompletion } from '../lib/domain/types';

const args = process.argv.slice(2);
function argVal(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1]! : fallback;
}

const rootDir = process.cwd();
const paths = createProjectPaths(rootDir, path.join(rootDir, 'dogfood'));
const workbenchPath = paths.workbenchIndexPath;

function loadWorkbench(): AgentWorkbenchProjection | null {
  try {
    const projection = JSON.parse(fs.readFileSync(workbenchPath, 'utf8')) as AgentWorkbenchProjection;
    // Cross-reference completions to filter out completed items
    try {
      const completions = JSON.parse(fs.readFileSync(path.join(paths.workbenchDir, 'completions.json'), 'utf8')) as WorkItemCompletion[];
      const completedIds = new Set(completions.map((c) => c.workItemId));
      const pending = projection.items.filter((item) => !completedIds.has(item.id));
      return {
        ...projection,
        items: pending,
        completions,
        summary: {
          ...projection.summary,
          pending: pending.length,
          completed: completions.length,
        },
      };
    } catch {
      return projection;
    }
  } catch {
    return null;
  }
}

function printItem(item: AgentWorkItem, index: number): void {
  const status = item.priority >= 0.5 ? '!' : ' ';
  console.log(`  ${status} [${index + 1}] ${item.kind} (${item.priority.toFixed(3)}) ${item.title}`);
  console.log(`      id: ${item.id}`);
  if (item.context.screen) console.log(`      screen: ${item.context.screen}`);
  if (item.actions.length > 0) {
    console.log(`      actions: ${item.actions.map((a) => `${a.kind}:${a.target.label.slice(0, 50)}`).join(', ')}`);
  }
}

async function main(): Promise<void> {
  const workbench = loadWorkbench();
  if (!workbench) {
    console.log('No workbench found. Run agent-speedrun first.');
    process.exit(1);
  }

  // --list: show all pending items
  if (args.includes('--list')) {
    console.log(`Agent Workbench: ${workbench.summary.pending} pending, ${workbench.summary.completed} completed\n`);
    workbench.items.forEach(printItem);
    return;
  }

  // --next: show top-priority item with full context
  if (args.includes('--next')) {
    const top = workbench.items[0];
    if (!top) {
      console.log('No pending work items.');
      return;
    }
    console.log('Top priority work item:\n');
    console.log(`  Kind:     ${top.kind}`);
    console.log(`  Priority: ${top.priority.toFixed(3)}`);
    console.log(`  Title:    ${top.title}`);
    console.log(`  Rationale: ${top.rationale}`);
    console.log(`  ID:       ${top.id}`);
    if (top.context.screen) console.log(`  Screen:   ${top.context.screen}`);
    if (top.context.element) console.log(`  Element:  ${top.context.element}`);
    console.log(`  Evidence: confidence=${top.evidence.confidence.toFixed(2)}, sources=${top.evidence.sources.length}`);
    console.log(`\n  Actions:`);
    for (const action of top.actions) {
      console.log(`    ${action.kind}: ${action.target.label}`);
      if (action.params.command) console.log(`      command: ${action.params.command}`);
      if (action.params.targetPath) console.log(`      target: ${action.params.targetPath}`);
    }
    console.log(`\n  To act: npx tsx scripts/act-on-workitem.ts --item-id ${top.id} --action approve`);
    console.log(`  To skip: npx tsx scripts/act-on-workitem.ts --item-id ${top.id} --action skip --reason "..."`);
    return;
  }

  // --item-id + --action: complete a specific item
  const itemId = argVal('--item-id', '');
  const action = argVal('--action', '');
  const reason = argVal('--reason', '');

  if (itemId && action) {
    const item = workbench.items.find((i) => i.id === itemId || i.id.startsWith(itemId));
    if (!item) {
      console.error(`Work item not found: ${itemId}`);
      console.log('Available items:');
      workbench.items.forEach(printItem);
      process.exit(1);
    }

    const status = action === 'skip' ? 'skipped' as const
      : action === 'approve' || action === 'author' || action === 'rerun' ? 'completed' as const
      : 'completed' as const;

    const completion: WorkItemCompletion = {
      workItemId: item.id,
      status,
      completedAt: new Date().toISOString(),
      rationale: reason || `Agent ${action}: ${item.title}`,
      artifactsWritten: [],
    };

    await runWithLocalServices(
      completeWorkItem({ paths, completion }),
      rootDir,
      { suiteRoot: paths.suiteRoot },
    );

    console.log(`${status === 'completed' ? '✓' : '○'} ${item.kind}: ${item.title}`);
    console.log(`  Status: ${status}`);
    console.log(`  Rationale: ${completion.rationale}`);

    // Show next item
    const remaining = workbench.items.filter((i) => i.id !== item.id);
    if (remaining.length > 0) {
      console.log(`\n  Next: [${remaining[0]!.kind}] ${remaining[0]!.title} (${remaining[0]!.priority.toFixed(3)})`);
      console.log(`  ${remaining.length} items remaining.`);
    } else {
      console.log('\n  All work items completed!');
    }
    return;
  }

  // --complete-all-skippable: skip items below a priority threshold
  if (args.includes('--complete-all-skippable')) {
    const threshold = Number(argVal('--threshold', '0.4'));
    const skippable = workbench.items.filter((i) => i.priority < threshold);
    if (skippable.length === 0) {
      console.log(`No items below priority ${threshold}.`);
      return;
    }

    for (const item of skippable) {
      const completion: WorkItemCompletion = {
        workItemId: item.id,
        status: 'skipped',
        completedAt: new Date().toISOString(),
        rationale: `Auto-skipped: priority ${item.priority.toFixed(3)} below threshold ${threshold}`,
        artifactsWritten: [],
      };
      await runWithLocalServices(
        completeWorkItem({ paths, completion }),
        rootDir,
        { suiteRoot: paths.suiteRoot },
      );
      console.log(`  ○ skipped: ${item.title} (${item.priority.toFixed(3)})`);
    }
    console.log(`\nSkipped ${skippable.length} items. ${workbench.items.length - skippable.length} remaining.`);
    return;
  }

  // Default: show summary
  console.log(`Agent Workbench: ${workbench.summary.pending} pending, ${workbench.summary.completed} completed`);
  console.log('');
  console.log('Commands:');
  console.log('  --list                    List all pending items');
  console.log('  --next                    Show top-priority item with context');
  console.log('  --item-id <id> --action <approve|skip|author>   Act on an item');
  console.log('  --complete-all-skippable  Skip all items below threshold');
}

main().catch((error) => {
  console.error('Work item transactor failed:', error);
  process.exit(1);
});
