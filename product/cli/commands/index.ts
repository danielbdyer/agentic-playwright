import type { CommandName, CommandSpec } from '../shared';
import { syncCommand } from './sync';
import { parseCommand } from './parse';
import { bindCommand } from './bind';
import { emitCommand } from './emit';
import { compileCommand } from './compile';
import { refreshCommand } from './refresh';
import { replayCommand } from './replay';
import { runCommand } from './run';
import { pathsCommand } from './paths';
import { captureCommand } from './capture';
import { discoverCommand } from './discover';
import { harvestCommand } from './harvest';
import { surfaceCommand } from './surface';
import { graphCommand } from './graph';
import { traceCommand } from './trace';
import { impactCommand } from './impact';
import { typesCommand } from './types';
import { workflowCommand } from './workflow';
import { inboxCommand } from './inbox';
import { approveCommand } from './approve';
import { certifyCommand } from './certify';
import { rerunPlanCommand } from './rerun-plan';
import { workbenchCommand } from './workbench';

/**
 * Product-contributed CLI commands. The six commands that orchestrate
 * workshop surfaces (benchmark, scorecard, dogfood, evolve, experiments,
 * generate) moved to workshop/cli/commands/ at step-4c.cli-split so
 * product/ no longer imports workshop. They are composed back into a
 * merged registry at the CLI entry point (bin/tesseract.ts).
 *
 * Partial<Record<…>> because the full CommandName union spans both
 * folders; each side contributes its own subset.
 */
export const productCommandRegistry: Partial<Record<CommandName, CommandSpec>> = {
  sync: syncCommand,
  parse: parseCommand,
  bind: bindCommand,
  emit: emitCommand,
  compile: compileCommand,
  refresh: refreshCommand,
  replay: replayCommand,
  run: runCommand,
  paths: pathsCommand,
  capture: captureCommand,
  discover: discoverCommand,
  harvest: harvestCommand,
  surface: surfaceCommand,
  graph: graphCommand,
  trace: traceCommand,
  impact: impactCommand,
  types: typesCommand,
  workflow: workflowCommand,
  inbox: inboxCommand,
  approve: approveCommand,
  certify: certifyCommand,
  'rerun-plan': rerunPlanCommand,
  workbench: workbenchCommand,
};
