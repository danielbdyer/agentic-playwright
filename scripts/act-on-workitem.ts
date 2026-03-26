/**
 * Agent work item transactor — thin CLI wrapper over the workbench domain.
 *
 * All domain logic lives in lib/application/agent-workbench.ts.
 * This script just parses args, calls Effect programs, and formats output.
 *
 * Usage:
 *   npx tsx scripts/act-on-workitem.ts --list
 *   npx tsx scripts/act-on-workitem.ts --next
 *   npx tsx scripts/act-on-workitem.ts --complete <id> [--reason "..."]
 *   npx tsx scripts/act-on-workitem.ts --skip <id> [--reason "..."]
 *   npx tsx scripts/act-on-workitem.ts --skip-below <threshold>
 *
 * Prefer: npm run build && node dist/bin/tesseract.js workbench --list
 */

import * as path from 'path';
import { createProjectPaths } from '../lib/application/paths';
import { loadAgentWorkbench, nextWorkItem, completeWorkItem } from '../lib/application/agent-workbench';
import { runWithLocalServices } from '../lib/composition/local-services';
import type { AgentWorkItem, WorkItemCompletion } from '../lib/domain/types';

const args = process.argv.slice(2);
function argVal(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1]! : fallback;
}

const rootDir = process.cwd();
const paths = createProjectPaths(rootDir, path.join(rootDir, 'dogfood'));
const serviceOptions = { suiteRoot: paths.suiteRoot };

function printItem(item: AgentWorkItem, index: number): void {
  const marker = item.priority >= 0.5 ? '!' : ' ';
  console.log(`  ${marker} [${index + 1}] ${item.kind} (${item.priority.toFixed(3)}) ${item.title}`);
  console.log(`      id: ${item.id}`);
  if (item.context.screen) console.log(`      screen: ${item.context.screen}`);
  if (item.actions.length > 0) {
    console.log(`      actions: ${item.actions.map((a) => `${a.kind}:${a.target.label.slice(0, 50)}`).join(', ')}`);
  }
}

async function main(): Promise<void> {
  if (args.includes('--list')) {
    const wb = await runWithLocalServices(loadAgentWorkbench({ paths }), rootDir, serviceOptions);
    if (!wb) { console.log('No workbench found. Run a speedrun first.'); return; }
    console.log(`Agent Workbench: ${wb.summary.pending} pending, ${wb.summary.completed} completed\n`);
    wb.items.forEach(printItem);
    return;
  }

  if (args.includes('--next')) {
    const item = await runWithLocalServices(nextWorkItem({ paths }), rootDir, serviceOptions);
    if (!item) { console.log('No pending work items.'); return; }
    console.log(`Top priority:\n`);
    console.log(`  Kind:     ${item.kind}`);
    console.log(`  Priority: ${item.priority.toFixed(3)}`);
    console.log(`  Title:    ${item.title}`);
    console.log(`  Rationale: ${item.rationale}`);
    console.log(`  ID:       ${item.id}`);
    if (item.context.screen) console.log(`  Screen:   ${item.context.screen}`);
    console.log(`\n  Actions:`);
    for (const action of item.actions) {
      console.log(`    ${action.kind}: ${action.target.label}`);
      if (action.params.command) console.log(`      command: ${action.params.command}`);
    }
    return;
  }

  const completeId = args.includes('--complete') ? argVal('--complete', '') : '';
  const skipId = args.includes('--skip') ? argVal('--skip', '') : '';
  const reason = argVal('--reason', '');

  if (completeId || skipId) {
    const id = completeId || skipId;
    const status = completeId ? 'completed' as const : 'skipped' as const;
    const completion: WorkItemCompletion = {
      workItemId: id,
      status,
      completedAt: new Date().toISOString(),
      rationale: reason || `${status} via CLI`,
      artifactsWritten: [],
    };
    await runWithLocalServices(completeWorkItem({ paths, completion }), rootDir, serviceOptions);
    console.log(`${status === 'completed' ? '✓' : '○'} ${id}: ${completion.rationale}`);
    return;
  }

  if (args.includes('--skip-below')) {
    const threshold = Number(argVal('--skip-below', '0.4'));
    const wb = await runWithLocalServices(loadAgentWorkbench({ paths }), rootDir, serviceOptions);
    if (!wb) { console.log('No workbench found.'); return; }
    const toSkip = wb.items.filter((i) => i.priority < threshold);
    for (const item of toSkip) {
      await runWithLocalServices(completeWorkItem({
        paths,
        completion: {
          workItemId: item.id,
          status: 'skipped',
          completedAt: new Date().toISOString(),
          rationale: `Auto-skipped: priority ${item.priority.toFixed(3)} below ${threshold}`,
          artifactsWritten: [],
        },
      }), rootDir, serviceOptions);
      console.log(`  ○ ${item.title} (${item.priority.toFixed(3)})`);
    }
    console.log(`\nSkipped ${toSkip.length}. ${wb.items.length - toSkip.length} remaining.`);
    return;
  }

  console.log('Usage: --list | --next | --complete <id> | --skip <id> | --skip-below <threshold>');
}

main().catch((e) => { console.error(e); process.exit(1); });
