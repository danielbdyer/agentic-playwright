/**
 * Public-AUT cohort runner — Floor A.5 (with cycle-4
 * narrative-execute, cycle-6 first-word fallback).
 *
 * For each case in the cohort:
 *   1. Run the heuristic intent classifier on every step to extract
 *      verb + role + nameSubstring.
 *   2. Launch Playwright, navigate to `snapshot.targetAut`.
 *   3. For each classified step:
 *      a. Probe the DOM (getByRole / getByText / press-verb skips
 *         this step). When a multi-word nameSubstring query returns
 *         0 matches, try the first word alone (cycle-6 Probe Seed 7
 *         fallback).
 *      b. If the probe matched (or the verb is press),
 *         **narrative-execute**: perform the action so subsequent
 *         steps see the resulting page state. (Cycle 4: Probe Seed
 *         8 Phase A.)
 *   4. Record per-step outcome (probe result + action result) and
 *      emit a JSON receipt per case.
 *
 * Observation-only contract (cycle 5 Probe Seed 9, Entry 21): this
 * runner probes the DOM and writes append-only receipts. Receipts
 * are evidence, not canon. **No code path in this file may graduate
 * canon (catalog writes / proposal activations / trust-policy
 * threshold updates).** The cohort-trust-guard helper at
 * `cohort-trust-guard.ts` enforces §4.4 C2 at canon-write seams
 * when those seams land in future cycles; today there are no such
 * seams in the runner. Receipts carry `cohortRole` so post-hoc
 * audits can detect any future leakage.
 *
 * This is not the full compile pipeline; it skips parse/bind and
 * the 11-rung resolution ladder. Sophistication migrates here as
 * the substrate ladder lights more rungs.
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { classifyIntent } from '../../../product/domain/resolution/patterns/intent-classifier';
import type { ClassifiedIntent } from '../../../product/domain/resolution/patterns/rung-kernel';
import type { LoadedPublicAutCase } from './load-public-aut-cohort';
import { stripHtml, inferAllowedActions } from './intent-helpers';

export type StepDomResolution =
  | 'matched'
  | 'not-found'
  | 'ambiguous'
  | 'unclassified'
  | 'skipped-navigate'
  | 'no-target-name'
  | 'browser-error';

export type ActionAttempted = 'clicked' | 'filled' | 'pressed' | 'observed' | null;
export type ActionOutcome = 'succeeded' | 'failed' | 'skipped';

/**
 * Cycle 8 (semantic correctness): when a step's prose says
 * "click the X button" and the runner finds *some* button, did
 * it find the SAME button the test author meant? `expectedTarget`
 * on the AdoStep records the operator's intent; the runner
 * compares the matched element against that intent.
 *
 *   expected-match: matched element IS the expected target
 *   wrong-target:   matched element is NOT the expected target
 *                   (false positive: step "passed" on something
 *                   the test author did not mean)
 *   not-applicable: step doesn't have a DOM target (navigate, press)
 *   unverified:     no expectedTarget authored; runner can't compare
 *   not-found:      step didn't match anything; correctness moot
 */
export type TargetCorrectness =
  | 'expected-match'
  | 'wrong-target'
  | 'not-applicable'
  | 'unverified'
  | 'not-found';

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
  readonly actionAttempted: ActionAttempted;
  readonly actionOutcome: ActionOutcome;
  readonly actionDetail: string | null;
  readonly targetCorrectness: TargetCorrectness;
  readonly targetCorrectnessDetail: string | null;
}

export interface PublicAutCaseResult {
  readonly aut: string;
  readonly autUrl: string;
  readonly partition: 'training' | 'held-out';
  readonly adoId: string;
  readonly title: string;
  readonly stepCount: number;
  readonly stepOutcomes: readonly PublicAutStepOutcome[];
  readonly preconditionOutcomes: readonly PublicAutStepOutcome[];
  readonly preconditionsRan: number;
  readonly preconditionsSucceeded: number;
  readonly stepsMatched: number;
  readonly handoffsEmitted: number;
  /** Cycle 8: number of main steps where the matched element is
   *  not the operator-authored expected target. A "matched" step
   *  with wrong-target is a false positive — the runner found
   *  *something* but not what the test author meant. */
  readonly falsePositives: number;
  /** Cycle 8: number of main steps with an authored expectedTarget
   *  whose match was verified (expected-match). The genuine
   *  semantic-correctness count. */
  readonly verifiedMatches: number;
  /** Cycle 8: number of main steps that lack an authored
   *  expectedTarget (and therefore can't be checked). Tracks the
   *  authoring debt. */
  readonly unverifiedSteps: number;
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

interface ProbeResult {
  readonly resolution: StepDomResolution;
  readonly matchCount: number;
  readonly rationale: string;
  /** When `resolution === 'matched'`, the locator the action stage
   *  should act on. Null otherwise. The press verb returns null
   *  because it does not target a DOM element. */
  readonly matchedLocator: Locator | null;
}

async function probeStep(page: Page, intent: ClassifiedIntent): Promise<ProbeResult> {
  if (intent.verb === 'navigate') {
    return {
      resolution: 'skipped-navigate',
      matchCount: 0,
      rationale: 'navigate verb is satisfied by the case-level navigation to targetAut',
      matchedLocator: null,
    };
  }

  // Press verb does not need DOM resolution — the action stage
  // calls `page.keyboard.press(nameSubstring)`. We mark the step
  // 'matched' when the classifier extracted a key name, so the
  // action stage runs.
  if (intent.verb === 'press') {
    const key = intent.targetShape.nameSubstring;
    if (!key) {
      return {
        resolution: 'no-target-name',
        matchCount: 0,
        rationale: 'press verb classified, but no key name extracted',
        matchedLocator: null,
      };
    }
    return {
      resolution: 'matched',
      matchCount: 1,
      rationale: `press verb resolved to key='${key}' (no DOM probe required)`,
      matchedLocator: null,
    };
  }

  const { role, name, nameSubstring } = intent.targetShape;
  const queryName: string | RegExp | undefined = name
    ? name
    : nameSubstring
      ? buildNameQuery(nameSubstring)
      : undefined;

  // Probe Seed 5 fallback (cycle 3): the observe verb's classifier
  // does not infer a role. Rather than emit a no-target-name handoff,
  // attempt a text-content lookup on the inferred nameSubstring. The
  // resolution is honest about which strategy ran via the rationale.
  if (!role && intent.verb === 'observe' && nameSubstring) {
    return probeByText(page, nameSubstring);
  }

  if (!role) {
    return {
      resolution: 'no-target-name',
      matchCount: 0,
      rationale: `verb=${intent.verb}; classifier did not infer a target role`,
      matchedLocator: null,
    };
  }

  try {
    const locator = queryName
      ? page.getByRole(role as Parameters<Page['getByRole']>[0], { name: queryName })
      : page.getByRole(role as Parameters<Page['getByRole']>[0]);
    const count = await locator.count();
    const queryRationale = `getByRole('${role}'${queryName ? `, { name: ${queryName} }` : ''})`;
    if (count === 1) {
      return {
        resolution: 'matched',
        matchCount: 1,
        rationale: `${queryRationale} matched exactly 1 element`,
        matchedLocator: locator,
      };
    }
    if (count > 1) {
      return {
        resolution: 'ambiguous',
        matchCount: count,
        rationale: `${queryRationale} matched ${count} elements`,
        matchedLocator: null,
      };
    }
    // count === 0 — try the cycle-6 first-word fallback (Probe Seed 7):
    // when the classifier extracts a multi-word nameSubstring that
    // includes descriptive context ("Active filter", "Submit Order"
    // followed by a context-only word), the multi-word query may miss
    // even when the actual element is named with just the first
    // word. Re-probe with first-word-only and report the rationale
    // honestly.
    if (nameSubstring && hasMultipleWords(nameSubstring)) {
      const firstWord = firstWordOf(nameSubstring);
      const firstWordQuery = buildNameQuery(firstWord);
      const firstWordLocator = page.getByRole(
        role as Parameters<Page['getByRole']>[0],
        { name: firstWordQuery },
      );
      const firstWordCount = await firstWordLocator.count();
      const fwQueryRationale = `getByRole('${role}', { name: ${firstWordQuery} }) [first-word fallback after ${queryRationale} returned 0]`;
      if (firstWordCount === 1) {
        return {
          resolution: 'matched',
          matchCount: 1,
          rationale: `${fwQueryRationale} matched exactly 1 element`,
          matchedLocator: firstWordLocator,
        };
      }
      if (firstWordCount > 1) {
        return {
          resolution: 'ambiguous',
          matchCount: firstWordCount,
          rationale: `${fwQueryRationale} matched ${firstWordCount} elements`,
          matchedLocator: null,
        };
      }
    }
    return {
      resolution: 'not-found',
      matchCount: 0,
      rationale: `${queryRationale} returned 0 matches`,
      matchedLocator: null,
    };
  } catch (err) {
    return {
      resolution: 'browser-error',
      matchCount: 0,
      rationale: `Playwright threw: ${(err as Error).message.slice(0, 200)}`,
      matchedLocator: null,
    };
  }
}

function hasMultipleWords(s: string): boolean {
  return /\s/.test(s.trim());
}

function firstWordOf(s: string): string {
  const trimmed = s.trim();
  const ws = trimmed.search(/\s/);
  return ws < 0 ? trimmed : trimmed.slice(0, ws);
}

async function probeByText(page: Page, nameSubstring: string): Promise<ProbeResult> {
  const query = buildNameQuery(nameSubstring);
  try {
    const locator = page.getByText(query);
    const count = await locator.count();
    if (count === 0) {
      return {
        resolution: 'not-found',
        matchCount: 0,
        rationale: `getByText(${query}) returned 0 matches (observe-fallback)`,
        matchedLocator: null,
      };
    }
    if (count === 1) {
      return {
        resolution: 'matched',
        matchCount: 1,
        rationale: `getByText(${query}) matched exactly 1 element (observe-fallback)`,
        matchedLocator: locator,
      };
    }
    return {
      resolution: 'ambiguous',
      matchCount: count,
      rationale: `getByText(${query}) matched ${count} elements (observe-fallback)`,
      matchedLocator: null,
    };
  } catch (err) {
    return {
      resolution: 'browser-error',
      matchCount: 0,
      rationale: `Playwright threw during observe-fallback: ${(err as Error).message.slice(0, 200)}`,
      matchedLocator: null,
    };
  }
}

interface ActionResult {
  readonly attempted: ActionAttempted;
  readonly outcome: ActionOutcome;
  readonly detail: string | null;
}

const ACTION_SKIPPED: ActionResult = { attempted: null, outcome: 'skipped', detail: null };

/**
 * Narrative-execute (cycle 4, Probe Seed 8 Phase A): when a step
 * matched the DOM, perform the verb's action so subsequent steps
 * within the same case see the resulting page state.
 *
 * Verb mapping:
 *   click   → locator.click()
 *   input   → locator.fill(firstDataRowValue)
 *   press   → page.keyboard.press(nameSubstring)
 *   observe → no-op (observation is read-only)
 *   navigate, select → no-op (no action wired today)
 */
async function executeAction(
  page: Page,
  intent: ClassifiedIntent,
  matchedLocator: Locator | null,
  firstDataRowValue: string | null,
): Promise<ActionResult> {
  try {
    switch (intent.verb) {
      case 'click': {
        if (!matchedLocator) return ACTION_SKIPPED;
        await matchedLocator.click({ timeout: 5000 });
        return { attempted: 'clicked', outcome: 'succeeded', detail: 'locator.click() resolved' };
      }
      case 'input': {
        if (!matchedLocator) return ACTION_SKIPPED;
        if (firstDataRowValue === null) {
          return {
            attempted: 'filled',
            outcome: 'failed',
            detail: 'no dataRow value available to fill',
          };
        }
        await matchedLocator.fill(firstDataRowValue, { timeout: 5000 });
        return {
          attempted: 'filled',
          outcome: 'succeeded',
          detail: `locator.fill(${JSON.stringify(firstDataRowValue)}) resolved`,
        };
      }
      case 'press': {
        const key = intent.targetShape.nameSubstring;
        if (!key) return ACTION_SKIPPED;
        await page.keyboard.press(key);
        return { attempted: 'pressed', outcome: 'succeeded', detail: `keyboard.press('${key}')` };
      }
      case 'observe':
        return { attempted: 'observed', outcome: 'succeeded', detail: 'observation is read-only' };
      case 'navigate':
      case 'select':
        return ACTION_SKIPPED;
    }
  } catch (err) {
    return {
      attempted: actionAttemptedForVerb(intent.verb),
      outcome: 'failed',
      detail: `${(err as Error).message.slice(0, 200)}`,
    };
  }
}

function actionAttemptedForVerb(verb: ClassifiedIntent['verb']): ActionAttempted {
  switch (verb) {
    case 'click':    return 'clicked';
    case 'input':    return 'filled';
    case 'press':    return 'pressed';
    case 'observe':  return 'observed';
    case 'navigate':
    case 'select':   return null;
  }
}

function firstDataRowValueOf(snapshot: LoadedPublicAutCase['snapshot']): string | null {
  if (snapshot.dataRows.length === 0) return null;
  const row = snapshot.dataRows[0]!;
  for (const value of Object.values(row)) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

/**
 * Per-step pipeline: classify the action text, probe the DOM, then
 * narrative-execute when the probe matched. Used for both main
 * steps and preconditions (cycle 7) — preconditions follow the
 * same cycle-4 narrative-execute discipline so the runner does not
 * have a bifurcated execution path.
 *
 * Cycle 8: when the step carries an `expectedTarget`, also verify
 * the matched element IS the expected target by re-querying the
 * page with the expected role + name and comparing the elements'
 * outerHTML. Records `targetCorrectness` in the outcome.
 */
async function runPipelineStep(
  page: Page,
  step: { readonly index: number; readonly action: string; readonly expectedTarget?: { readonly role?: string | undefined; readonly name?: string | undefined } | undefined },
  firstDataRowValue: string | null,
): Promise<PublicAutStepOutcome> {
  const { verdict, intent, plain } = classifyStep(step.action);
  if (!intent) {
    return {
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
      actionAttempted: null,
      actionOutcome: 'skipped',
      actionDetail: null,
      targetCorrectness: 'not-found',
      targetCorrectnessDetail: null,
    };
  }

  const probe = await probeStep(page, intent);

  // Cycle 8: semantic-correctness check happens BEFORE
  // narrative-execute. Click actions can navigate away (form
  // submission, hash route change), so the matched element may
  // not exist by the time the action completes. Verifying first
  // captures the correctness verdict while both matched and
  // expected locators are still valid against the same DOM
  // snapshot.
  const correctness = await verifyTargetCorrectness(
    page,
    intent,
    probe.resolution,
    probe.matchedLocator,
    step.expectedTarget,
  );

  // Cycle 4 narrative-execute: when the step matched (and isn't
  // navigate, which the case-level navigation already satisfied),
  // perform the verb's action so subsequent steps see the
  // resulting page state.
  const action: ActionResult = (probe.resolution === 'matched' && intent.verb !== 'navigate')
    ? await executeAction(page, intent, probe.matchedLocator, firstDataRowValue)
    : ACTION_SKIPPED;

  return {
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
    actionAttempted: action.attempted,
    actionOutcome: action.outcome,
    actionDetail: action.detail,
    targetCorrectness: correctness.kind,
    targetCorrectnessDetail: correctness.detail,
  };
}

/**
 * Cycle 8 semantic-correctness verification.
 *
 * Compares the runner's matched element against the operator's
 * authored expected target. Returns a TargetCorrectness verdict
 * plus a human-legible detail string.
 *
 * The comparison uses outerHTML as a stable per-element identifier:
 * imperfect (two distinct elements with identical outerHTML would
 * appear equal), but adequate for the kinds of mismatch the cohort
 * is designed to surface (e.g., toggle-all vs per-todo toggle —
 * different elements, different outerHTML).
 */
async function verifyTargetCorrectness(
  page: Page,
  intent: ClassifiedIntent,
  probeResolution: StepDomResolution,
  matchedLocator: Locator | null,
  expectedTarget: { readonly role?: string | undefined; readonly name?: string | undefined } | undefined,
): Promise<{ readonly kind: TargetCorrectness; readonly detail: string | null }> {
  // Verbs that don't target a DOM element (navigate, press) are
  // not subject to semantic correctness.
  if (intent.verb === 'navigate' || intent.verb === 'press') {
    return { kind: 'not-applicable', detail: `verb=${intent.verb} has no DOM target` };
  }

  // Probe didn't match: correctness is moot.
  if (probeResolution !== 'matched' || !matchedLocator) {
    return { kind: 'not-found', detail: null };
  }

  // No expected target authored: can't verify.
  if (!expectedTarget || (!expectedTarget.role && !expectedTarget.name)) {
    return { kind: 'unverified', detail: 'no expectedTarget authored on this step' };
  }

  try {
    const expectedRole = expectedTarget.role;
    const expectedName = expectedTarget.name;
    const expectedLocator = (expectedRole
      ? (expectedName !== undefined
          ? page.getByRole(expectedRole as Parameters<Page['getByRole']>[0], { name: expectedName })
          : page.getByRole(expectedRole as Parameters<Page['getByRole']>[0]))
      : (expectedName !== undefined ? page.getByText(expectedName) : null));

    if (!expectedLocator) {
      return { kind: 'unverified', detail: 'expectedTarget present but neither role nor name resolvable' };
    }

    const expectedCount = await expectedLocator.count();
    if (expectedCount === 0) {
      return {
        kind: 'wrong-target',
        detail: `expected ${describeTarget(expectedTarget)} but no element on the page matches that description`,
      };
    }

    const matchedHtml = await matchedLocator.first().evaluate(el => el.outerHTML).catch(() => null);
    const expectedHtml = await expectedLocator.first().evaluate(el => el.outerHTML).catch(() => null);
    if (matchedHtml === null || expectedHtml === null) {
      return { kind: 'unverified', detail: 'failed to read element identity for comparison' };
    }
    if (matchedHtml === expectedHtml) {
      return {
        kind: 'expected-match',
        detail: `matched element IS the expected ${describeTarget(expectedTarget)}`,
      };
    }
    return {
      kind: 'wrong-target',
      detail: `matched a different element than the expected ${describeTarget(expectedTarget)} (false positive)`,
    };
  } catch (err) {
    return { kind: 'unverified', detail: `verification threw: ${(err as Error).message.slice(0, 200)}` };
  }
}

function describeTarget(t: { readonly role?: string | undefined; readonly name?: string | undefined }): string {
  if (t.role && t.name) return `role='${t.role}' + name='${t.name}'`;
  if (t.role) return `role='${t.role}'`;
  if (t.name) return `name='${t.name}'`;
  return '(empty target)';
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a tolerant case-insensitive RegExp from a classifier
 * `nameSubstring`. Source-text hyphens are matched as `[-\s]?` so
 * "new-todo" matches a rendered label "New Todo" — Probe Seed 6
 * (cycle 3): rendered accessible names rarely preserve the
 * fixture-source-text punctuation the classifier extracted.
 */
function buildNameQuery(nameSubstring: string): RegExp {
  const escaped = escapeRegExp(nameSubstring).replace(/-/g, '[-\\s]?');
  return new RegExp(escaped, 'i');
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

  // Cycle 5 correction (Entry 21): the runner is observation-only.
  // It probes the DOM and writes append-only receipts — neither of
  // those is a canon graduation. The trust guard must therefore NOT
  // fire here on held-out cases (cycle 4's preflight call was over-
  // conservative; it blocked legitimate held-out evaluation).
  //
  // The guard's correct integration point is at the future code path
  // that actually graduates canon (catalog writes, proposal
  // activation, trust-policy threshold updates). Until that path
  // lands, the runner records the cohort role in every receipt
  // (`cohortRole` field) so post-hoc audits can detect any leakage,
  // and the guard helper waits at its module boundary for the right
  // caller. See cohort-trust-guard.ts.
  const cohortRole = options.cohortRole ?? aut.partition;

  const ctx = await browser.newContext({
    ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? true,
  });
  const page = await ctx.newPage();

  const stepOutcomes: PublicAutStepOutcome[] = [];
  let stepsMatched = 0;
  let handoffsEmitted = 0;
  let falsePositives = 0;
  let verifiedMatches = 0;
  let unverifiedSteps = 0;
  const firstDataRowValue = firstDataRowValueOf(snapshot);
  const preconditionOutcomes: PublicAutStepOutcome[] = [];
  let preconditionsSucceeded = 0;

  try {
    await page.goto(autUrl, { waitUntil: 'networkidle', timeout: 30_000 });

    // Cycle 7 (Probe Seed 8 Phase B): execute preconditions before
    // the main step loop. Preconditions reuse the same classify +
    // probe + execute pipeline but their outcomes do NOT count
    // toward stepsMatched / handoffsEmitted — they're setup, not
    // assertions. Failures surface in downstream handoffs honestly.
    if (snapshot.preconditions && snapshot.preconditions.length > 0) {
      for (const pre of snapshot.preconditions) {
        const outcome = await runPipelineStep(page, pre, firstDataRowValue);
        preconditionOutcomes.push(outcome);
        // A precondition counts as succeeded iff the probe matched
        // AND, when the matched verb requires an action, that
        // action succeeded. Skipped-navigate also counts. This
        // catches cases where the probe matches a target but the
        // action silently fails (e.g., an input fill with no
        // dataRow value to use). Cycle 7 follow-up to the
        // diagnostic in Entry 29.
        const probeOk = outcome.domResolution === 'matched' || outcome.domResolution === 'skipped-navigate';
        const actionOk = outcome.actionOutcome !== 'failed';
        if (probeOk && actionOk) {
          preconditionsSucceeded += 1;
        }
      }
      // After preconditions complete, wait briefly for the AUT to
      // settle. React (and similar reactive frameworks) commit
      // state updates asynchronously; without a settling pause, a
      // step that probes immediately can race the framework's
      // re-render. The diagnostic in cycle 7 (Entry 29) showed
      // TodoMVC's filter-link DOM appearing on the next microtask
      // after Enter is pressed, which the runner's tight loop
      // could miss.
      await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
    }

    for (const step of snapshot.steps) {
      const outcome = await runPipelineStep(page, step, firstDataRowValue);
      stepOutcomes.push(outcome);
      if (outcome.domResolution === 'matched' || outcome.domResolution === 'skipped-navigate') {
        stepsMatched += 1;
      } else {
        handoffsEmitted += 1;
      }
      // Cycle 8: tally semantic-correctness counters.
      if (outcome.targetCorrectness === 'wrong-target') {
        falsePositives += 1;
      } else if (outcome.targetCorrectness === 'expected-match') {
        verifiedMatches += 1;
      } else if (outcome.targetCorrectness === 'unverified') {
        unverifiedSteps += 1;
      }
    }
  } finally {
    await ctx.close();
  }

  const elapsedMs = Date.now() - runStart;
  const preconditionsRan = preconditionOutcomes.length;
  const receiptPath = writeCaseReceipt({
    aut: aut.name,
    autUrl,
    partition: aut.partition,
    cohortRole: options.cohortRole ?? aut.partition,
    snapshot,
    stepOutcomes,
    preconditionOutcomes,
    preconditionsRan,
    preconditionsSucceeded,
    stepsMatched,
    handoffsEmitted,
    falsePositives,
    verifiedMatches,
    unverifiedSteps,
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
    preconditionOutcomes,
    preconditionsRan,
    preconditionsSucceeded,
    stepsMatched,
    handoffsEmitted,
    falsePositives,
    verifiedMatches,
    unverifiedSteps,
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
  readonly preconditionOutcomes: readonly PublicAutStepOutcome[];
  readonly preconditionsRan: number;
  readonly preconditionsSucceeded: number;
  readonly stepsMatched: number;
  readonly handoffsEmitted: number;
  readonly falsePositives: number;
  readonly verifiedMatches: number;
  readonly unverifiedSteps: number;
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
    schemaVersion: 4,
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
    preconditionsRan: args.preconditionsRan,
    preconditionsSucceeded: args.preconditionsSucceeded,
    preconditionOutcomes: args.preconditionOutcomes,
    stepsMatched: args.stepsMatched,
    handoffsEmitted: args.handoffsEmitted,
    falsePositives: args.falsePositives,
    verifiedMatches: args.verifiedMatches,
    unverifiedSteps: args.unverifiedSteps,
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
