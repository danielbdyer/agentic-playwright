/**
 * The two batch commands: `author` loops a decider over a suite through the
 * same runtime an MCP host uses (so receipts are identical), and `report`
 * turns the receipts into the three numbers a QA lead reads.
 */
import { ToolError } from '../core/errors.js';
import { loadWorkspace } from '../workspace/workspace.js';
import { authorSuite, createAnthropicDecider, createHeuristicDecider, type SuiteSummary } from '../driver/index.js';
import { authoringReceiptMarkdown, computeNumbers, renderNumbersMarkdown } from '../report/index.js';
import type { Runtime } from '../tools/runtime.js';

interface Flags {
  readonly flags: Readonly<Record<string, string | true>>;
  readonly positionals: readonly string[];
}

const str = (value: string | true | undefined): string | undefined => (typeof value === 'string' ? value : undefined);

const int = (value: string | true | undefined, flag: string): number | undefined => {
  const text = str(value);
  if (text === undefined) return undefined;
  const n = Number(text);
  if (!Number.isInteger(n)) throw new ToolError('invalid-input', `--${flag} must be an integer, got ${text}`);
  return n;
};

const print = (value: unknown): void => {
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
};

const renderSuite = (summary: SuiteSummary): string => {
  const lines = [
    `Authored ${summary.cases.length} case${summary.cases.length === 1 ? '' : 's'} with the ${summary.decider} decider in ${Math.round(summary.durationMs / 1000)}s.`,
    '',
    '| Case | Outcome | Steps resolved | Handoffs | Spec |',
    '|---|---|---|---|---|',
    ...summary.cases.map(
      (c) => `| ${c.testCaseId} ${c.title.replace(/\|/g, '\\|')} | ${c.outcome} | ${c.stepsResolved}/${c.stepsTotal} | ${c.handoffs.length} | ${c.specPath ?? '—'} |`,
    ),
  ];
  if (summary.run !== undefined) {
    lines.push('', 'error' in summary.run ? `Run failed: ${summary.run.error}` : `Run ${summary.run.runId}: ${summary.run.passed} passed, ${summary.run.failed} failed, ${summary.run.skipped} skipped, ${summary.run.flaky} flaky.`);
  }
  if (summary.publish !== undefined) {
    lines.push('error' in summary.publish ? `Publish failed: ${summary.publish.error}` : `Published to ADO run ${summary.publish.runId}${summary.publish.alreadyPublished ? ' (already published)' : ''}: ${summary.publish.url}`);
  }
  const handoffs = summary.cases.flatMap((c) => c.handoffs.map((h) => `- ${c.testCaseId} step ${h.stepIndex} (${h.blockage}): ${h.reason}`));
  if (handoffs.length > 0) lines.push('', 'Handoffs waiting on a human:', ...handoffs);
  if (summary.warnings.length > 0) lines.push('', 'Warnings:', ...summary.warnings.map((w) => `- ${w}`));
  return lines.join('\n');
};

export const runAuthorCommand = async (runtime: Runtime, { flags }: Flags): Promise<number> => {
  const ids = str(flags.ids)?.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
  const planId = int(flags.plan, 'plan');
  const suiteId = int(flags.suite, 'suite');
  if ((ids === undefined || ids.length === 0) && planId === undefined) {
    throw new ToolError('invalid-input', 'usage: tesseract-qa author --ids <id,...> | --plan <p> [--suite <s>] [--profile <p>] [--decider heuristic|anthropic] [--attempts <n>] [--case-budget-ms <ms>] [--no-refresh] [--run] [--publish --run-name <n>]');
  }
  const deciderName = str(flags.decider) ?? 'heuristic';
  if (deciderName !== 'heuristic' && deciderName !== 'anthropic') throw new ToolError('invalid-input', `--decider must be heuristic or anthropic, got ${deciderName}`);
  const decider = deciderName === 'anthropic' ? createAnthropicDecider({ env: runtime.ctx.env }) : createHeuristicDecider();
  const publish = flags.publish === true || str(flags.publish) !== undefined;
  const runName = str(flags['run-name']);
  if (publish && (planId === undefined || suiteId === undefined || runName === undefined)) {
    throw new ToolError('invalid-input', '--publish needs --plan, --suite, and --run-name');
  }
  const attempts = int(flags.attempts, 'attempts');
  const caseBudgetMs = int(flags['case-budget-ms'], 'case-budget-ms');
  const summary = await authorSuite(runtime, {
    ...(ids !== undefined && ids.length > 0 ? { testCaseIds: ids } : {}),
    ...(planId !== undefined ? { planId } : {}),
    ...(suiteId !== undefined ? { suiteId } : {}),
    ...(str(flags.profile) !== undefined ? { profile: str(flags.profile) } : {}),
    ...(str(flags['start-url']) !== undefined ? { startUrl: str(flags['start-url']) } : {}),
    decider,
    ...(attempts !== undefined || caseBudgetMs !== undefined
      ? { budgets: { ...(attempts !== undefined ? { attemptsPerStep: attempts } : {}), ...(caseBudgetMs !== undefined ? { wallClockMsPerCase: caseBudgetMs } : {}) } }
      : {}),
    ...(flags['no-refresh'] === true ? { refresh: false } : {}),
    run: flags.run === true || publish,
    ...(publish ? { publish: { planId: planId!, suiteId: suiteId!, runName: runName! } } : {}),
  });
  print(str(flags.format) === 'json' ? summary : renderSuite(summary));
  return summary.cases.some((c) => c.outcome === 'failed') ? 1 : 0;
};

export const runReportCommand = async (root: string, { flags }: Flags): Promise<number> => {
  const workspace = await loadWorkspace(root);
  const testCase = str(flags.case);
  if (testCase !== undefined) {
    print(await authoringReceiptMarkdown(workspace, testCase));
    return 0;
  }
  const numbers = await computeNumbers(workspace);
  print(str(flags.format) === 'json' ? numbers : renderNumbersMarkdown(numbers));
  return 0;
};
