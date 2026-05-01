/**
 * Public-AUT cohort runner — Floor A.5.
 *
 * For each case in the cohort:
 *   1. Run the heuristic intent classifier (Z11a.4b) on every step
 *      to extract verb + role + nameSubstring.
 *   2. Launch Playwright, navigate to `snapshot.targetAut`.
 *   3. For each classified step, attempt a single naive DOM
 *      resolution via `page.getByRole(role, { name })`.
 *   4. Record per-step outcome and emit a JSON receipt per case.
 *
 * This is not the full compile pipeline; it skips parse/bind and
 * the 11-rung resolution ladder. It exists to surface real
 * not-found handoffs against a real AUT using the current
 * generic-tier matchers (role + name), so the cohort's first
 * real-handoff log becomes legible.
 *
 * The runner is intentionally simple. Sophistication migrates here
 * as the substrate ladder lights more rungs.
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium, type Browser, type Page } from 'playwright';
import { classifyIntent } from '../../../product/domain/resolution/patterns/intent-classifier';
import type { ClassifiedIntent } from '../../../product/domain/resolution/patterns/rung-kernel';
import type { StepAction } from '../../../product/domain/governance/workflow-types';
import type { LoadedPublicAutCase } from './load-public-aut-cohort';

const STRIP_HTML_RE = /<[^>]+>/g;

function stripHtml(s: string): string {
  return s.replace(STRIP_HTML_RE, ' ').replace(/\s+/g, ' ').trim();
}

function inferAllowedActions(plain: string): readonly StepAction[] {
  const lower = plain.toLowerCase();
  const actions: StepAction[] = [];
  if (/\bnavigate|\bgo\s+to|\bopen\s+/.test(lower)) actions.push('navigate');
  if (/\bclick|\btap|\bpress|\bselect\s+the/.test(lower)) actions.push('click');
  if (/\benter|\btype|\bfill|\binput|\bpopulate|\bselect\s+\w+\s+from/.test(lower)) actions.push('input');
  if (/\bverify|\bobserve|\bcheck|\bconfirm\s+that|\bensure\b/.test(lower)) actions.push('assert-snapshot');
  return actions.length > 0 ? actions : ['custom'];
}

export type StepDomResolution =
  | 'matched'
  | 'not-found'
  | 'ambiguous'
  | 'unclassified'
  | 'skipped-navigate'
  | 'no-target-name'
  | 'browser-error';

export interface PublicAutStepOutcome {
  readonly stepIndex: number;
  readonly actionTextPlain: string;
  readonly classifierVerdict: 'classified' | 'unclassified';
  readonly verb: ClassifiedIntent['verb'] | null;
  readonly inferredRole: string | null;
  readonly inferredName: string | null;
  readonly inferredNameSubstring: string | null;
  readonly domResolution: StepDomResolution;
  readonly matchCount: number;
  readonly rationale: string;
}

export interface PublicAutCaseResult {
  readonly aut: string;
  readonly autUrl: string;
  readonly partition: 'training' | 'held-out';
  readonly adoId: string;
  readonly title: string;
  readonly stepCount: number;
  readonly stepOutcomes: readonly PublicAutStepOutcome[];
  readonly stepsMatched: number;
  readonly handoffsEmitted: number;
  readonly elapsedMs: number;
  readonly receiptPath: string;
  readonly cohortRole: 'training' | 'held-out';
  readonly substrateVersion: 'floor-a5-heuristic-naive-dom';
  readonly runStartedAt: string;
}

interface RunOptions {
  readonly cohortRole?: 'training' | 'held-out';
  readonly logRoot: string;
  readonly browserExecutablePath?: string;
  readonly ignoreHTTPSErrors?: boolean;
}

function classifyStep(actionText: string): {
  verdict: 'classified' | 'unclassified';
  intent: ClassifiedIntent | null;
  plain: string;
} {
  const plain = stripHtml(actionText);
  const allowed = inferAllowedActions(plain);
  const intent = classifyIntent(plain, allowed);
  return { verdict: intent ? 'classified' : 'unclassified', intent, plain };
}

async function probeStep(
  page: Page,
  intent: ClassifiedIntent,
): Promise<{ resolution: StepDomResolution; matchCount: number; rationale: string }> {
  if (intent.verb === 'navigate') {
    return {
      resolution: 'skipped-navigate',
      matchCount: 0,
      rationale: 'navigate verb is satisfied by the case-level navigation to targetAut',
    };
  }

  const { role, name, nameSubstring } = intent.targetShape;
  const queryName: string | RegExp | undefined = name
    ? name
    : nameSubstring
      ? new RegExp(escapeRegExp(nameSubstring), 'i')
      : undefined;

  if (!role) {
    return {
      resolution: 'no-target-name',
      matchCount: 0,
      rationale: `verb=${intent.verb}; classifier did not infer a target role`,
    };
  }

  try {
    const locator = queryName
      ? page.getByRole(role as Parameters<Page['getByRole']>[0], { name: queryName })
      : page.getByRole(role as Parameters<Page['getByRole']>[0]);
    const count = await locator.count();
    if (count === 0) {
      return {
        resolution: 'not-found',
        matchCount: 0,
        rationale: `getByRole('${role}'${queryName ? `, { name: ${queryName} }` : ''}) returned 0 matches`,
      };
    }
    if (count === 1) {
      return {
        resolution: 'matched',
        matchCount: 1,
        rationale: `getByRole('${role}'${queryName ? `, { name: ${queryName} }` : ''}) matched exactly 1 element`,
      };
    }
    return {
      resolution: 'ambiguous',
      matchCount: count,
      rationale: `getByRole('${role}'${queryName ? `, { name: ${queryName} }` : ''}) matched ${count} elements`,
    };
  } catch (err) {
    return {
      resolution: 'browser-error',
      matchCount: 0,
      rationale: `Playwright threw: ${(err as Error).message.slice(0, 200)}`,
    };
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function runPublicAutCase(
  caseEntry: LoadedPublicAutCase,
  browser: Browser,
  options: RunOptions,
): Promise<PublicAutCaseResult> {
  const runStart = Date.now();
  const runStartedAt = new Date(runStart).toISOString();
  const { snapshot, aut } = caseEntry;
  const autUrl = snapshot.targetAut ?? aut.url;

  const ctx = await browser.newContext({
    ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? true,
  });
  const page = await ctx.newPage();

  const stepOutcomes: PublicAutStepOutcome[] = [];
  let stepsMatched = 0;
  let handoffsEmitted = 0;

  try {
    await page.goto(autUrl, { waitUntil: 'networkidle', timeout: 30_000 });

    for (const step of snapshot.steps) {
      const { verdict, intent, plain } = classifyStep(step.action);
      if (!intent) {
        const outcome: PublicAutStepOutcome = {
          stepIndex: step.index,
          actionTextPlain: plain,
          classifierVerdict: verdict,
          verb: null,
          inferredRole: null,
          inferredName: null,
          inferredNameSubstring: null,
          domResolution: 'unclassified',
          matchCount: 0,
          rationale: 'intent classifier returned null',
        };
        stepOutcomes.push(outcome);
        handoffsEmitted += 1;
        continue;
      }

      const probe = await probeStep(page, intent);
      const outcome: PublicAutStepOutcome = {
        stepIndex: step.index,
        actionTextPlain: plain,
        classifierVerdict: 'classified',
        verb: intent.verb,
        inferredRole: intent.targetShape.role ?? null,
        inferredName: intent.targetShape.name ?? null,
        inferredNameSubstring: intent.targetShape.nameSubstring ?? null,
        domResolution: probe.resolution,
        matchCount: probe.matchCount,
        rationale: probe.rationale,
      };
      stepOutcomes.push(outcome);
      if (outcome.domResolution === 'matched' || outcome.domResolution === 'skipped-navigate') {
        stepsMatched += 1;
      } else {
        handoffsEmitted += 1;
      }
    }
  } finally {
    await ctx.close();
  }

  const elapsedMs = Date.now() - runStart;
  const receiptPath = writeCaseReceipt({
    aut: aut.name,
    autUrl,
    partition: aut.partition,
    cohortRole: options.cohortRole ?? aut.partition,
    snapshot,
    stepOutcomes,
    stepsMatched,
    handoffsEmitted,
    elapsedMs,
    runStartedAt,
    logRoot: options.logRoot,
  });

  return {
    aut: aut.name,
    autUrl,
    partition: aut.partition,
    adoId: snapshot.id,
    title: snapshot.title,
    stepCount: snapshot.steps.length,
    stepOutcomes,
    stepsMatched,
    handoffsEmitted,
    elapsedMs,
    receiptPath,
    cohortRole: options.cohortRole ?? aut.partition,
    substrateVersion: 'floor-a5-heuristic-naive-dom',
    runStartedAt,
  };
}

interface WriteReceiptArgs {
  readonly aut: string;
  readonly autUrl: string;
  readonly partition: 'training' | 'held-out';
  readonly cohortRole: 'training' | 'held-out';
  readonly snapshot: LoadedPublicAutCase['snapshot'];
  readonly stepOutcomes: readonly PublicAutStepOutcome[];
  readonly stepsMatched: number;
  readonly handoffsEmitted: number;
  readonly elapsedMs: number;
  readonly runStartedAt: string;
  readonly logRoot: string;
}

function writeCaseReceipt(args: WriteReceiptArgs): string {
  const dir = path.join(args.logRoot, 'workshop', 'logs', 'public-aut-receipts', args.aut);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = args.runStartedAt.replace(/[:.]/g, '-');
  const file = `${args.snapshot.id}-${stamp}.json`;
  const fullPath = path.join(dir, file);
  const receipt = {
    schemaVersion: 1,
    substrateVersion: 'floor-a5-heuristic-naive-dom',
    aut: args.aut,
    autUrl: args.autUrl,
    partition: args.partition,
    cohortRole: args.cohortRole,
    adoId: args.snapshot.id,
    adoContentHash: args.snapshot.contentHash,
    title: args.snapshot.title,
    runStartedAt: args.runStartedAt,
    elapsedMs: args.elapsedMs,
    stepCount: args.snapshot.steps.length,
    stepsMatched: args.stepsMatched,
    handoffsEmitted: args.handoffsEmitted,
    stepOutcomes: args.stepOutcomes,
  };
  fs.writeFileSync(fullPath, JSON.stringify(receipt, null, 2));
  return fullPath;
}

export async function runPublicAutCohort(
  cases: readonly LoadedPublicAutCase[],
  options: RunOptions,
): Promise<readonly PublicAutCaseResult[]> {
  if (cases.length === 0) return [];
  const launchOptions: Parameters<typeof chromium.launch>[0] = {};
  if (options.browserExecutablePath) {
    launchOptions.executablePath = options.browserExecutablePath;
  }
  const browser = await chromium.launch(launchOptions);
  try {
    const results: PublicAutCaseResult[] = [];
    for (const caseEntry of cases) {
      const result = await runPublicAutCase(caseEntry, browser, options);
      results.push(result);
    }
    return results;
  } finally {
    await browser.close();
  }
}
