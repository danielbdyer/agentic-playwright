/**
 * Workshop-contributed CLI commands — graduated from product/cli/commands/
 * at step-4c.cli-split so product/ stops importing workshop orchestration.
 *
 * Product/ exports the CLI parser + shared vocabulary + command contract
 * (product/cli/shared.ts); workshop/ declares the subset of commands that
 * orchestrate workshop surfaces (benchmark, scorecard, dogfood, evolve,
 * experiments, generate) and contributes them to the composed registry
 * assembled at the CLI entry point (bin/tesseract.ts).
 *
 * Per docs/v2-direction.md §§1–2, the CLI is an entry-point concern that
 * composes both folders; the shared types live at product/cli/shared so
 * both sides type-check against the same contract.
 */

import type { CommandName, CommandSpec } from '../../../product/cli/shared';
import { benchmarkCommand } from './benchmark';
import { scorecardCommand } from './scorecard';
import { dogfoodCommand } from './dogfood';
import { evolveCommand } from './evolve';
import { experimentsCommand } from './experiments';
import { generateCommand } from './generate';
import { probeSpikeCommand } from './probe-spike';
import { scenarioVerifyCommand } from './scenario-verify';
import { compoundingScoreboardCommand } from './compounding-scoreboard';
import { compoundingImproveCommand } from './compounding-improve';

export const workshopCommandRegistry: Partial<Record<CommandName, CommandSpec>> = {
  benchmark: benchmarkCommand,
  scorecard: scorecardCommand,
  dogfood: dogfoodCommand,
  evolve: evolveCommand,
  experiments: experimentsCommand,
  generate: generateCommand,
  'probe-spike': probeSpikeCommand,
  'scenario-verify': scenarioVerifyCommand,
  'compounding-scoreboard': compoundingScoreboardCommand,
  'compounding-improve': compoundingImproveCommand,
};
