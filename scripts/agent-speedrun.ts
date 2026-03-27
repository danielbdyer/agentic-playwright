/**
 * Agent-driven speedrun — invocable from a Claude Code session.
 *
 * This script runs the speedrun Effect program with the agent interpreter
 * set to 'heuristic' (context-aware scoring) by default, or 'session' when
 * a createChatCompletion callback is provided.
 *
 * Usage from Claude Code:
 *   npx tsx scripts/agent-speedrun.ts --count 30 --seed my-run --posture warm-start
 *
 * The agent interpreter resolves steps that would otherwise hit needs-human.
 * Progress is emitted to stderr and JSONL sidecar for real-time monitoring.
 *
 * For the session provider (LLM-backed), set TESSERACT_AGENT_PROVIDER=session
 * and provide the LLM endpoint via environment variables.
 */

import * as path from 'path';
import { createProjectPaths } from '../lib/application/paths';
import { loadAgentWorkbench, processWorkItems, type ActLoopResult, type ScreenGroupContext } from '../lib/application/agent-workbench';
import { multiSeedSpeedrun } from '../lib/application/speedrun';
import { resolveKnowledgePosture } from '../lib/application/knowledge-posture';
import { resolveAgentInterpreterProvider, type AgentInterpreterProvider } from '../lib/application/agent-interpreter-provider';
import { runWithLocalServices } from '../lib/composition/local-services';
import type { KnowledgePosture, SpeedrunProgressEvent } from '../lib/domain/types';
import { DEFAULT_PIPELINE_CONFIG } from '../lib/domain/types';

// ─── CLI argument parsing ───

const args = process.argv.slice(2);
function argVal(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1]! : fallback;
}

const count = Number(argVal('--count', '30'));
const seed = argVal('--seed', 'agent-run');
const maxIterations = Number(argVal('--max-iterations', '3'));
const actMode = args.includes('--act');
const maxActs = Number(argVal('--max-acts', '20'));
const explicitPosture = args.includes('--posture') ? argVal('--posture', '') as KnowledgePosture : undefined;

const rootDir = process.cwd();
const paths = createProjectPaths(rootDir, path.join(rootDir, 'dogfood'));
const knowledgePosture = resolveKnowledgePosture(paths.postureConfigPath, explicitPosture);

// ─── Progress reporter ───

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m${seconds}s` : `${seconds}s`;
}

function onProgress(event: SpeedrunProgressEvent): void {
  const phaseLabel = event.phase === 'iterate' && event.metrics
    ? `[iter ${event.iteration}/${event.maxIterations}]`
    : `[${event.phase}]`;

  const metricsLabel = event.metrics
    ? ` hitRate=${(event.metrics.knowledgeHitRate * 100).toFixed(1)}% proposals=${event.metrics.proposalsActivated} unresolved=${event.metrics.unresolvedSteps}`
    : '';

  const calibrationLabel = event.calibration
    ? ` drift=${event.calibration.weightDrift.toFixed(4)}${event.calibration.topCorrelation ? ` top=${event.calibration.topCorrelation.signal}(${event.calibration.topCorrelation.strength > 0 ? '+' : ''}${event.calibration.topCorrelation.strength.toFixed(3)})` : ''}`
    : '';

  const convergenceLabel = event.convergenceReason
    ? ` convergence=${event.convergenceReason}`
    : '';

  process.stderr.write(
    `${phaseLabel}${metricsLabel}${convergenceLabel}${calibrationLabel} elapsed=${formatElapsed(event.elapsed)}\n`,
  );
}

// ─── Resolve agent interpreter ───

const agentInterpreter: AgentInterpreterProvider = resolveAgentInterpreterProvider();

// ─── Run ───

async function main(): Promise<void> {
  console.log(`Agent Speedrun: ${count} scenarios, ${maxIterations} max iterations, posture=${knowledgePosture}`);
  console.log(`Agent provider: ${agentInterpreter.id} (${agentInterpreter.kind})`);
  console.log(`Seed: ${seed}`);
  console.log('');

  const result = await runWithLocalServices(
    multiSeedSpeedrun({
      paths,
      config: DEFAULT_PIPELINE_CONFIG,
      seeds: [seed],
      count,
      maxIterations,
      knowledgePosture,
      onProgress,
    }),
    rootDir,
    {
      agentInterpreter,
      suiteRoot: paths.suiteRoot,
      posture: {
        interpreterMode: 'diagnostic',
        writeMode: 'persist',
        executionProfile: 'dogfood',
      },
      pipelineConfig: DEFAULT_PIPELINE_CONFIG,
    },
  );

  console.log('');
  console.log('=== Agent Speedrun Complete ===');
  console.log(`  Knowledge hit rate: ${(result.fitnessReport.metrics.knowledgeHitRate * 100).toFixed(1)}%`);
  console.log(`  Convergence: ${result.fitnessReport.metrics.convergenceVelocity} iterations`);

  const rungRates = result.fitnessReport.metrics.resolutionByRung;
  if (rungRates.length > 0) {
    console.log('  Resolution by rung:');
    for (const { rung, wins, rate } of rungRates) {
      if (wins > 0) {
        console.log(`    ${rung}: ${wins} wins (${(rate * 100).toFixed(1)}%)`);
      }
    }
  }

  const agentWins = rungRates.find((r) => r.rung === 'agent-interpreted');
  const needsHuman = rungRates.find((r) => r.rung === 'needs-human');
  if (agentWins && agentWins.wins > 0) {
    console.log(`\n  Agent interpreted ${agentWins.wins} steps that would have been needs-human.`);
  }
  if (needsHuman && needsHuman.wins > 0) {
    console.log(`  ${needsHuman.wins} steps still need human review.`);
  } else {
    console.log(`\n  All steps resolved — no human review needed.`);
  }

  // Print workbench summary via domain function
  const workbench = await runWithLocalServices(
    loadAgentWorkbench({ paths }),
    rootDir,
    { suiteRoot: paths.suiteRoot },
  );
  if (workbench && workbench.summary.total > 0) {
    console.log('\n=== Agent Workbench ===');
    console.log(`  ${workbench.summary.pending} pending, ${workbench.summary.completed} completed:`);
    for (const [kind, count] of Object.entries(workbench.summary.byKind)) {
      if (count > 0) console.log(`    ${kind}: ${count}`);
    }
    if (workbench.summary.topPriority) {
      console.log(`  Top priority: [${workbench.summary.topPriority.kind}] ${workbench.summary.topPriority.title} (score=${workbench.summary.topPriority.priority})`);
    }
    console.log(`  Transact: npx tsx scripts/act-on-workitem.ts --next`);
    console.log(`  Or:       node dist/bin/tesseract.js workbench --next`);
  }

  // --act mode: process work items automatically
  if (actMode && workbench && workbench.summary.pending > 0) {
    console.log(`\n=== Act Mode: Processing up to ${maxActs} items ===\n`);

    const actResult: ActLoopResult = await runWithLocalServices(
      processWorkItems({
        paths,
        maxItems: maxActs,
        reEvaluate: true,
        onScreenGroupStart: (group: ScreenGroupContext) => {
          const aliasCount = group.screen.screenAliases.length;
          const elementCount = group.screen.elements.length;
          console.log(`  ─── ${group.screen.screen} (${group.workItems.length} items, ${elementCount} elements, ${aliasCount} aliases) ───`);
        },
        onItemProcessed: (item, completion) => {
          const marker = completion.status === 'completed' ? '✓' : '○';
          console.log(`    ${marker} ${item.title}`);
        },
      }),
      rootDir,
      { suiteRoot: paths.suiteRoot },
    );

    console.log(`\n  Processed: ${actResult.processed} (${actResult.completed} completed, ${actResult.skipped} skipped)`);
    if (actResult.transitivelyResolved > 0) {
      console.log(`  ${actResult.transitivelyResolved} items resolved transitively.`);
    }
    if (actResult.remaining > 0) {
      console.log(`  ${actResult.remaining} items remaining.`);
    } else {
      console.log('  All work items resolved.');
    }
  }
}

main().catch((error) => {
  console.error('Agent speedrun failed:', error);
  process.exit(1);
});
