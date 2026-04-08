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
import { benchmarkCommand } from './benchmark';
import { scorecardCommand } from './scorecard';
import { dogfoodCommand } from './dogfood';
import { workbenchCommand } from './workbench';
import { evolveCommand } from './evolve';
import { experimentsCommand } from './experiments';
import { generateCommand } from './generate';

export const commandRegistry: Record<CommandName, CommandSpec> = {
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
  benchmark: benchmarkCommand,
  scorecard: scorecardCommand,
  dogfood: dogfoodCommand,
  workbench: workbenchCommand,
  evolve: evolveCommand,
  experiments: experimentsCommand,
  generate: generateCommand,
};
