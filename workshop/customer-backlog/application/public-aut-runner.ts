/**
 * Public-AUT cohort runner — Floor A.6 (with cycle-4
 * narrative-execute, cycle-10 degraded-resolution ladder).
 *
 * For each case in the cohort:
 *   1. Run the heuristic intent classifier on every step to extract
 *      verb + role + nameSubstring.
 *   2. Launch Playwright, navigate to `snapshot.targetAut`.
 *   3. For each classified step, probe the DOM through the
 *      degraded-resolution ladder (cycle 10, journal Entry 37 —
 *      generalizing the cycle-6 first-word fallback after the
 *      cycle-9 held-out run scored 0/3 with evidence-free
 *      handoffs):
 *      a. **strict** — getByRole(role, { name }) with the full
 *         classifier phrase (getByText for role-less observes;
 *         press-verb skips DOM resolution).
 *      b. **phrase-reduction** — progressively weaker name queries
 *         derived from the phrase (pure kernel:
 *         product/domain/resolution/patterns/degraded-resolution).
 *      c. **inventory-scored** — harvest every element with the
 *         inferred role (including a11y-hidden ones), score their
 *         accessible names against the phrase, auto-accept only a
 *         visible, dominant, confirmation-unique candidate.
 *      d. When no rung accepts, the handoff carries the harvested
 *         inventory as evidence — counts, ranked candidates, and
 *         the attempt trace — so the next rung (agent or human)
 *         receives a menu, not a shrug.
 *      Then, if the probe matched (or the verb is press),
 *      **narrative-execute**: perform the action so subsequent
 *      steps see the resulting page state. (Cycle 4: Probe Seed
 *      8 Phase A.)
 *   4. Record per-step outcome (probe result + resolution rung +
 *      evidence + action result) and emit a JSON receipt per case.
 *
 * Every ladder match remains subject to the cycle-8 expectedTarget
 * verification, so added recall cannot silently buy false
 * positives.
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
import {
  phraseReductions,
  rankCandidates,
  selectDominantCandidate,
  DOMINANCE_THRESHOLD,
  DOMINANCE_MARGIN,
  type CandidateSurface,
  type ScoredCandidate,
} from '../../../product/domain/resolution/patterns/degraded-resolution';
import type { ClassifiedIntent } from '../../../product/domain/resolution/patterns/rung-kernel';
import { taggedFingerprintFor, type Fingerprint } from '../../../product/domain/kernel/hash';
import type { LoadedPublicAutCase } from './load-public-aut-cohort';
import { stripHtml, inferAllowedActions } from './intent-helpers';
import { buildLiveSurface, resolveViaPatternRegistry, type LiveSurface } from './surface-harvest';
import { attemptReasoningRung, type ReasoningMode } from './reasoning-rung';

/** Reasoning-rung config threaded through the ladder (Z11d). */
export interface ReasoningConfig {
  readonly mode: ReasoningMode;
  readonly rootDir: string;
}

const REASONING_OFF: ReasoningConfig = { mode: 'off', rootDir: '' };

/** Bumped from 'floor-a5-heuristic-naive-dom' at cycle 10: the
 *  degraded-resolution ladder can classify steps the A.5 runner
 *  could not, so receipts across the bump are not comparable. */
export const PUBLIC_AUT_SUBSTRATE_VERSION = 'floor-a6-degraded-ladder' as const;

/** Resolver-identity version (Cycle 11 / G5). Bump when the
 *  classifier or the ladder's resolution behavior changes in a way
 *  that could move a held-out outcome — that is precisely the
 *  change that re-arms a clean-room evaluation. Distinct from the
 *  substrate version (which is the receipt-shape/measurement-axes
 *  version). */
export const RESOLVER_VERSION = 'resolver-cycle11-unified-pattern-registry' as const;

/**
 * Fingerprint of the resolution machinery a receipt was produced
 * by: resolver version + substrate version + the dominance
 * thresholds the inventory rung auto-accepts on. Two held-out
 * receipts sharing this fingerprint are a duplicate evaluation at
 * the same resolver state (clean-room C3).
 */
export function resolverFingerprint(): Fingerprint<'resolver'> {
  return taggedFingerprintFor('resolver', {
    resolverVersion: RESOLVER_VERSION,
    substrateVersion: PUBLIC_AUT_SUBSTRATE_VERSION,
    dominanceThreshold: DOMINANCE_THRESHOLD,
    dominanceMargin: DOMINANCE_MARGIN,
  });
}

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

/**
 * Cycle 10: which rung of the degraded-resolution ladder produced
 * a match. Null when the step never reached DOM resolution
 * (navigate, press, unclassified) or did not match.
 */
export type ResolutionRung =
  /** Cycle 11 / G7: the product's own pattern registry, run against
   *  a live SurfaceIndex — the unified structured rung. */
  | 'structured-pattern'
  | 'strict'
  | 'phrase-reduction'
  | 'inventory-scored'
  /** Cycle 11 / Z11d: the file-mediated reasoning rung resolved a
   *  semantic bridge (e.g. "Japanese" → 日本語) from a filled pool
   *  response. */
  | 'reasoning';

/** A harvested element, scored against the classifier phrase. */
export interface ProbeCandidateEvidence {
  readonly name: string;
  readonly visible: boolean;
  readonly score: number;
}

/**
 * Cycle 10: what the page actually offered for the inferred role.
 * Attached to every handoff (and to inventory-scored matches, to
 * justify the choice) so a failed step hands the next rung real
 * evidence instead of "0 matches".
 */
export interface ProbeEvidence {
  readonly role: string;
  readonly phrase: string | null;
  readonly roleCountTotal: number;
  readonly roleCountVisible: number;
  readonly roleCountHidden: number;
  /** Top candidates by score (capped); approximated accessible
   *  names — the confirmation query, not this list, is what a
   *  match is accepted on. */
  readonly candidates: readonly ProbeCandidateEvidence[];
  /** Human-legible trace of every query the ladder tried. */
  readonly attempts: readonly string[];
  readonly note: string | null;
}

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
  readonly resolutionRung: ResolutionRung | null;
  readonly evidence: ProbeEvidence | null;
  /** Cycle 11 (G3): the captured resolution projection for this
   *  step (null for navigate/press/text/no-role). The frozen
   *  substrate a pure replay reconstructs the verdict from. */
  readonly trace: ResolutionTrace | null;
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
  /** Content hash of the ADO fixture (snapshot.contentHash). Carried
   *  on the result so the G1 compounding-evidence adapter can stamp
   *  the receipt's ado-content fingerprint without re-reading the
   *  fixture. */
  readonly adoContentHash: string;
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
  /** Cycle 11 (G4, honest denominators): main steps that actually
   *  require finding a DOM element — i.e. every step whose verb is
   *  NOT navigate or press. `stepsMatched` counts navigate gimmes
   *  (satisfied by the case-level page load) and press (no DOM
   *  target); those flatter the headline. `domTargetSteps` is the
   *  honest denominator the journal hand-derived every cycle. */
  readonly domTargetSteps: number;
  /** Of `domTargetSteps`, how many resolved to a real DOM match
   *  (domResolution === 'matched'; excludes skipped-navigate). The
   *  honest numerator. */
  readonly domTargetMatched: number;
  /** Cycle 11 (G4 / G1 bridge): handoffs (non-matched DOM-target
   *  steps) that carried a non-empty candidate menu in their
   *  evidence payload. This is the cycle-10 evidence-carrying-
   *  handoff signal, and it is exactly the
   *  `handoffsWithValidMissingContext` the compounding engine's
   *  intervention-fidelity prediction measures (G1). A handoff that
   *  hands the next rung a ranked menu is a *useful* handoff; one
   *  with empty hands is a dead end. */
  readonly handoffsWithEvidence: number;
  readonly elapsedMs: number;
  readonly receiptPath: string;
  readonly cohortRole: 'training' | 'held-out';
  readonly substrateVersion: typeof PUBLIC_AUT_SUBSTRATE_VERSION;
  /** Cycle 11 (G5): the resolver-identity fingerprint this receipt
   *  was produced under, so a duplicate held-out evaluation at the
   *  same resolver state is detectable (clean-room C3). */
  readonly resolverFingerprint: string;
  readonly runStartedAt: string;
}

/**
 * Cycle 11 (G4): pure derivation of the honest DOM-targeting
 * tallies from a case's step outcomes. Kept pure + exported so the
 * compounding-evidence adapter (G1) and the baseline ratchet (G2)
 * derive the same numbers the receipt does, with no re-counting
 * drift.
 *
 * A step is DOM-targeting iff its `targetCorrectness` is not
 * `'not-applicable'` — that verdict is set exactly for the two
 * gimme verbs (navigate, press). Unclassified steps
 * (`targetCorrectness: 'not-found'`) ARE counted: a step the
 * system could not classify is a step it failed on, and excluding
 * it would flatter the denominator.
 */
export interface PublicAutCaseTallies {
  readonly domTargetSteps: number;
  readonly domTargetMatched: number;
  readonly handoffsWithEvidence: number;
}

export function derivePublicAutCaseTallies(
  outcomes: readonly PublicAutStepOutcome[],
): PublicAutCaseTallies {
  let domTargetSteps = 0;
  let domTargetMatched = 0;
  let handoffsWithEvidence = 0;
  for (const o of outcomes) {
    if (o.targetCorrectness === 'not-applicable') continue;
    domTargetSteps += 1;
    if (o.domResolution === 'matched') {
      domTargetMatched += 1;
    } else if (o.evidence !== null && o.evidence.candidates.length > 0) {
      // A non-matched DOM-target step is a handoff; it carries
      // evidence iff the inventory harvest produced ≥1 candidate.
      handoffsWithEvidence += 1;
    }
  }
  return { domTargetSteps, domTargetMatched, handoffsWithEvidence };
}

interface RunOptions {
  readonly cohortRole?: 'training' | 'held-out';
  readonly logRoot: string;
  readonly browserExecutablePath?: string;
  readonly ignoreHTTPSErrors?: boolean;
  /** Cycle 11 (G3): when set, write a per-case capture record (the
   *  resolution traces + a stamped snapshotFingerprint) so the run
   *  can be replayed offline. Crucial for a held-out evaluation:
   *  the single permitted contact becomes a permanent substrate. */
  readonly capture?: boolean;
  /** Cycle 11 (Z11d): reasoning rung mode. 'record' parks pending
   *  semantic-bridge requests in the pool; 'replay' resolves bridges
   *  from filled answers; default 'off'. */
  readonly reasoningMode?: ReasoningMode;
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

/**
 * Cycle 11 (G3): the resolution-relevant projection of the live
 * page for one DOM-target step — everything the ladder consumed to
 * reach its verdict. Captured during a live run; a pure replay
 * (resolution-replay.ts) reconstructs the verdict from it offline,
 * so a held-out evaluation's single permitted contact yields a
 * frozen substrate that can be re-analyzed forever.
 *
 * This captures the projection the LADDER uses (query counts +
 * harvested inventory), not the full DOM. It cannot replay
 * narrative-execute state transitions or re-run a different
 * classifier — but it makes the resolution decision (the thing
 * under measurement) reproducible without re-contacting the site.
 */
export interface ResolutionTrace {
  readonly verb: ClassifiedIntent['verb'];
  readonly role: string;
  readonly phrase: string | null;
  /** Cycle 11 / G7: the product pattern-registry verdict (the
   *  structured rung). When matched, the registry resolved against
   *  the live SurfaceIndex; replay trusts this recorded bit (the
   *  full surface index is not captured in the lightweight trace,
   *  consistent with G3's "replay the verdict, not re-run the
   *  matchers" scope). Null when the structured rung did not run
   *  (non-role verbs never reach the ladder). */
  readonly structured: {
    readonly matched: boolean;
    readonly patternId: string | null;
    readonly matcherId: string | null;
  } | null;
  /** Live count of the strict getByRole(role, phrase) query. */
  readonly strictCount: number;
  /** Each phrase reduction tried (in order) with its live count.
   *  Empty when strict matched or strictCount > 1 (reductions are
   *  only attempted on a 0-count strict). */
  readonly reductions: readonly { readonly reduction: string; readonly count: number }[];
  /** The full harvested role inventory (name + visibility). Empty
   *  when a higher rung matched before the harvest ran. */
  readonly inventory: readonly CandidateSurface[];
  /** Inventory-rung confirmation: the dominant candidate's name and
   *  its exact/loose confirmation counts. Null when no dominant
   *  candidate was selected. */
  readonly confirmation: {
    readonly name: string;
    readonly exactCount: number;
    readonly looseCount: number;
  } | null;
  /** The verdict the live run reached — the replay target. */
  readonly liveResolution: StepDomResolution;
  readonly liveRung: ResolutionRung | null;
}

interface ProbeResult {
  readonly resolution: StepDomResolution;
  readonly matchCount: number;
  readonly rationale: string;
  /** When `resolution === 'matched'`, the locator the action stage
   *  should act on. Null otherwise. The press verb returns null
   *  because it does not target a DOM element. */
  readonly matchedLocator: Locator | null;
  readonly resolutionRung: ResolutionRung | null;
  readonly evidence: ProbeEvidence | null;
  /** Cycle 11 (G3): the captured resolution projection, present for
   *  role-ladder steps (null for navigate/press/text/no-role). */
  readonly trace: ResolutionTrace | null;
}

/** Inventory harvest caps: enough to characterize a marketing page
 *  without serializing its every link into the receipt. */
const MAX_HARVEST = 40;
const EVIDENCE_CANDIDATE_LIMIT = 12;

async function probeStep(
  page: Page,
  intent: ClassifiedIntent,
  reasoning: ReasoningConfig = REASONING_OFF,
): Promise<ProbeResult> {
  if (intent.verb === 'navigate') {
    return {
      resolution: 'skipped-navigate',
      matchCount: 0,
      rationale: 'navigate verb is satisfied by the case-level navigation to targetAut',
      matchedLocator: null,
      resolutionRung: null,
      evidence: null,
      trace: null,
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
        resolutionRung: null,
        evidence: null,
      trace: null,
      };
    }
    return {
      resolution: 'matched',
      matchCount: 1,
      rationale: `press verb resolved to key='${key}' (no DOM probe required)`,
      matchedLocator: null,
      resolutionRung: null,
      evidence: null,
      trace: null,
    };
  }

  const { role, name, nameSubstring } = intent.targetShape;

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
      resolutionRung: null,
      evidence: null,
      trace: null,
    };
  }

  return probeByRoleLadder(page, intent.verb, role, name ?? null, nameSubstring ?? null, reasoning);
}

/**
 * Cycle 10 degraded-resolution ladder (journal Entry 37). Three
 * rungs, each weaker and more explicit than the last; every query
 * is recorded in the attempt trace, and a step that exhausts the
 * ladder hands off WITH the harvested inventory as evidence.
 *
 * Replaces the cycle-6 first-word fallback (Probe Seed 7), which
 * was rung 2 hand-rolled for one fixture's phrasing.
 *
 * Cycle 11 (G3): restructured to a single return path that also
 * emits a `ResolutionTrace` — the frozen projection a pure replay
 * reconstructs the verdict from.
 */
async function probeByRoleLadder(
  page: Page,
  verb: ClassifiedIntent['verb'],
  role: string,
  exactName: string | null,
  nameSubstring: string | null,
  reasoning: ReasoningConfig = REASONING_OFF,
): Promise<ProbeResult> {
  const phrase = exactName ?? nameSubstring;
  const attempts: string[] = [];
  const reductionsTried: { reduction: string; count: number }[] = [];
  let inventory: readonly CandidateSurface[] = [];
  let confirmation: ResolutionTrace['confirmation'] = null;
  let structured: ResolutionTrace['structured'] = null;
  const byRole = (q?: string | RegExp) =>
    q !== undefined
      ? page.getByRole(role as Parameters<Page['getByRole']>[0], { name: q })
      : page.getByRole(role as Parameters<Page['getByRole']>[0]);

  const mkTrace = (liveResolution: StepDomResolution, liveRung: ResolutionRung | null, strictCount: number): ResolutionTrace => ({
    verb,
    role,
    phrase,
    structured,
    strictCount,
    reductions: [...reductionsTried],
    inventory: [...inventory],
    confirmation,
    liveResolution,
    liveRung,
  });

  try {
    // ── Rung 0 (G7): the product's own pattern registry, run
    // against a live SurfaceIndex harvested from the real page.
    // This is the unification — the shipped resolution kernel now
    // executes against the cohort, instead of a parallel ladder.
    // Harvest once here; the inventory rung below reuses it.
    const live = await buildLiveSurface(page, role);
    const intent: ClassifiedIntent = {
      verb,
      targetShape: {
        role,
        ...(exactName !== null ? { name: exactName } : {}),
        ...(nameSubstring !== null ? { nameSubstring } : {}),
      },
      originalActionText: phrase ?? '',
    };
    const candidate = resolveViaPatternRegistry(intent, live.surfaceIndex);
    if (candidate) {
      const locator = live.locate(candidate.targetSurfaceId);
      structured = {
        matched: true,
        patternId: String(candidate.patternId),
        matcherId: String(candidate.matcherId),
      };
      attempts.push(`pattern-registry: ${candidate.patternId}/${candidate.matcherId} → ${candidate.targetSurfaceId}`);
      if (locator) {
        return {
          resolution: 'matched',
          matchCount: 1,
          rationale: `structured-pattern: ${candidate.patternId} via ${candidate.matcherId} (${candidate.rationale})`,
          matchedLocator: locator,
          resolutionRung: 'structured-pattern',
          evidence: null,
          trace: mkTrace('matched', 'structured-pattern', 0),
        };
      }
    } else {
      structured = { matched: false, patternId: null, matcherId: null };
    }

    // ── Rung 1: strict — the full classifier phrase ──────────────
    const strictQuery: string | RegExp | undefined = exactName
      ?? (nameSubstring ? buildNameQuery(nameSubstring) : undefined);
    const strictLocator = byRole(strictQuery);
    const strictCount = await strictLocator.count();
    const strictRationale = `getByRole('${role}'${strictQuery ? `, { name: ${strictQuery} }` : ''})`;
    attempts.push(`${strictRationale} → ${strictCount}`);
    if (strictCount === 1) {
      return {
        resolution: 'matched',
        matchCount: 1,
        rationale: `${strictRationale} matched exactly 1 element`,
        matchedLocator: strictLocator,
        resolutionRung: 'strict',
        evidence: null,
        trace: mkTrace('matched', 'strict', strictCount),
      };
    }

    // ── Rung 2: phrase reduction — weaker name queries ───────────
    // Only sensible when the strict query found nothing; when it
    // found several, weaker queries can only widen the ambiguity.
    if (strictCount === 0 && phrase) {
      for (const reduction of phraseReductions(phrase)) {
        const reductionQuery = buildNameQuery(reduction);
        const reductionLocator = byRole(reductionQuery);
        const reductionCount = await reductionLocator.count();
        reductionsTried.push({ reduction, count: reductionCount });
        attempts.push(`getByRole('${role}', { name: ${reductionQuery} }) → ${reductionCount}`);
        if (reductionCount === 1) {
          return {
            resolution: 'matched',
            matchCount: 1,
            rationale: `getByRole('${role}', { name: ${reductionQuery} }) matched exactly 1 element [phrase-reduction '${reduction}' from '${phrase}' after strict returned 0]`,
            matchedLocator: reductionLocator,
            resolutionRung: 'phrase-reduction',
            evidence: null,
            trace: mkTrace('matched', 'phrase-reduction', strictCount),
          };
        }
      }
    }

    // ── Rung 3: inventory harvest + deterministic scoring ────────
    // Reuse the G7 harvest (no second DOM pass).
    const harvest = roleInventoryFromLive(live);
    inventory = harvest.candidates;
    const ranked = rankCandidates(phrase ?? '', harvest.candidates);
    const evidence = buildProbeEvidence(role, phrase, harvest, ranked, attempts);

    const dominant = phrase ? selectDominantCandidate(ranked) : null;
    if (dominant) {
      // Confirm against Playwright's real accessible-name engine —
      // the harvest names are approximations. A unique visible
      // match on the harvested name is the acceptance condition.
      // Exact match first (a short name like 'EN' is a substring
      // of 'English'; substring-by-default would self-ambiguate),
      // then the tolerant substring form for harvest names that
      // approximate the real accessible name imperfectly.
      const exactLocator = page.getByRole(role as Parameters<Page['getByRole']>[0], {
        name: dominant.name,
        exact: true,
      });
      const exactCount = await exactLocator.count();
      attempts.push(`getByRole('${role}', { name: '${dominant.name}', exact: true }) [confirmation] → ${exactCount}`);
      let confirmed: Locator | null = exactCount === 1 ? exactLocator : null;
      let looseCount = 0;
      if (!confirmed) {
        const looseLocator = byRole(dominant.name);
        looseCount = await looseLocator.count();
        attempts.push(`getByRole('${role}', { name: '${dominant.name}' }) [confirmation] → ${looseCount}`);
        confirmed = looseCount === 1 ? looseLocator : null;
      }
      confirmation = { name: dominant.name, exactCount, looseCount };
      if (confirmed) {
        const runnerUp = ranked.find((c) => c.name !== dominant.name);
        return {
          resolution: 'matched',
          matchCount: 1,
          rationale: `inventory-scored: '${dominant.name}' (score ${dominant.score.toFixed(2)}${runnerUp ? ` vs runner-up '${runnerUp.name}' ${runnerUp.score.toFixed(2)}` : ', unrivaled'}) confirmed unique for phrase '${phrase}'`,
          matchedLocator: confirmed,
          resolutionRung: 'inventory-scored',
          evidence,
          trace: mkTrace('matched', 'inventory-scored', strictCount),
        };
      }
    }

    // ── Rung 4 (Z11d): reasoning — the file-mediated semantic
    // bridge. Token-overlap exhausted; offer the ranked menu to the
    // reasoning pool. Replay resolves a bridge (e.g. "Japanese" →
    // 日本語) from a filled answer; record defers with a pending
    // pool request. The cycle-10 evidence menu IS this rung's input.
    if (reasoning.mode !== 'off') {
      const reasoningOutcome = await attemptReasoningRung({
        rootDir: reasoning.rootDir,
        mode: reasoning.mode,
        verb,
        role,
        phrase,
        candidates: ranked.map((c) => ({ name: c.name, visible: c.visible, score: c.score })),
        confirm: async (chosenName) => {
          const exact = page.getByRole(role as Parameters<Page['getByRole']>[0], {
            name: chosenName,
            exact: true,
          });
          return (await exact.count()) === 1 ? exact : null;
        },
      });
      if (reasoningOutcome.matchedLocator) {
        attempts.push(reasoningOutcome.rationale);
        return {
          resolution: 'matched',
          matchCount: 1,
          rationale: reasoningOutcome.rationale,
          matchedLocator: reasoningOutcome.matchedLocator,
          resolutionRung: 'reasoning',
          evidence,
          trace: mkTrace('matched', 'reasoning', strictCount),
        };
      }
      // Not resolved by reasoning (deferred, NONE, or unconfirmed):
      // fall through to the evidence-carrying handoff, now noting
      // the reasoning attempt.
      attempts.push(reasoningOutcome.rationale);
    }

    // ── Ladder exhausted: hand off WITH evidence ─────────────────
    const resolution: StepDomResolution = strictCount > 1 ? 'ambiguous' : 'not-found';
    return {
      resolution,
      matchCount: strictCount,
      rationale: `${strictRationale} returned ${strictCount}; ladder exhausted (${attempts.length} attempts) over ${harvest.total} role='${role}' element(s) (${harvest.visibleCount} visible, ${harvest.hiddenCount} hidden)${evidence.note ? ` — ${evidence.note}` : ''}`,
      matchedLocator: null,
      resolutionRung: null,
      evidence,
      trace: mkTrace(resolution, null, strictCount),
    };
  } catch (err) {
    return {
      resolution: 'browser-error',
      matchCount: 0,
      rationale: `Playwright threw: ${(err as Error).message.slice(0, 200)}`,
      matchedLocator: null,
      resolutionRung: null,
      evidence: null,
      trace: null,
    };
  }
}

interface RoleInventory {
  readonly total: number;
  readonly visibleCount: number;
  readonly hiddenCount: number;
  readonly candidates: readonly CandidateSurface[];
}

/**
 * Derive the inventory rung's RoleInventory from the single G7
 * harvest (`buildLiveSurface`), which already enumerated every
 * element of the role INCLUDING a11y-hidden ones (the cycle-9
 * blindness fix — the language-switcher links existed but were
 * invisible). No second DOM pass: the same harvest feeds the
 * structured rung, the inventory rung, and the evidence payload.
 */
function roleInventoryFromLive(live: LiveSurface): RoleInventory {
  const sampled = live.all
    .slice(0, MAX_HARVEST)
    .map((n) => ({ name: n.name ?? '', visible: n.visible }));
  const candidates = sampled.filter((c) => c.name.length > 0);
  const visibleCount = sampled.filter((c) => c.visible).length;
  return {
    total: live.all.length,
    visibleCount,
    hiddenCount: live.all.length - visibleCount,
    candidates,
  };
}

function buildProbeEvidence(
  role: string,
  phrase: string | null,
  harvest: RoleInventory,
  ranked: readonly ScoredCandidate[],
  attempts: readonly string[],
): ProbeEvidence {
  const top = ranked[0];
  const note =
    top && !top.visible && top.score >= DOMINANCE_THRESHOLD
      ? `best-scoring candidate '${top.name}' is present but NOT in the visible accessibility tree (likely behind a collapsed menu or hidden region); auto-acting on it would be unsafe`
      : harvest.total === 0
        ? `page exposes no role='${role}' elements at all — the inferred role itself may be wrong`
        : top && top.score === 0 && phrase
          ? `no harvested candidate shares any token with the phrase '${phrase}' — bridging this gap needs semantic interpretation (reasoning-rung work, e.g. a non-English accessible name)`
          : null;
  // Dedupe by name before capping — header/footer twins would
  // otherwise crowd distinct candidates out of the evidence list.
  // The ranked order (score desc, visible first) means the kept
  // instance is always the strongest representative of its name.
  const seenNames = new Set<string>();
  const distinct = ranked.filter((c) => {
    const key = c.name.toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });
  return {
    role,
    phrase,
    roleCountTotal: harvest.total,
    roleCountVisible: harvest.visibleCount,
    roleCountHidden: harvest.hiddenCount,
    candidates: distinct.slice(0, EVIDENCE_CANDIDATE_LIMIT).map((c) => ({
      name: c.name,
      visible: c.visible,
      score: Number(c.score.toFixed(3)),
    })),
    attempts,
    note,
  };
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
        resolutionRung: null,
        evidence: null,
      trace: null,
      };
    }
    if (count === 1) {
      return {
        resolution: 'matched',
        matchCount: 1,
        rationale: `getByText(${query}) matched exactly 1 element (observe-fallback)`,
        matchedLocator: locator,
        resolutionRung: 'strict',
        evidence: null,
      trace: null,
      };
    }
    return {
      resolution: 'ambiguous',
      matchCount: count,
      rationale: `getByText(${query}) matched ${count} elements (observe-fallback)`,
      matchedLocator: null,
      resolutionRung: null,
      evidence: null,
      trace: null,
    };
  } catch (err) {
    return {
      resolution: 'browser-error',
      matchCount: 0,
      rationale: `Playwright threw during observe-fallback: ${(err as Error).message.slice(0, 200)}`,
      matchedLocator: null,
      resolutionRung: null,
      evidence: null,
      trace: null,
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
  reasoning: ReasoningConfig = REASONING_OFF,
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
      resolutionRung: null,
      evidence: null,
      trace: null,
      actionAttempted: null,
      actionOutcome: 'skipped',
      actionDetail: null,
      targetCorrectness: 'not-found',
      targetCorrectnessDetail: null,
    };
  }

  const probe = await probeStep(page, intent, reasoning);

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
    resolutionRung: probe.resolutionRung,
    evidence: probe.evidence,
    trace: probe.trace,
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
  const reasoning: ReasoningConfig = {
    mode: options.reasoningMode ?? 'off',
    rootDir: options.logRoot,
  };

  try {
    await page.goto(autUrl, { waitUntil: 'networkidle', timeout: 30_000 });

    // Cycle 7 (Probe Seed 8 Phase B): execute preconditions before
    // the main step loop. Preconditions reuse the same classify +
    // probe + execute pipeline but their outcomes do NOT count
    // toward stepsMatched / handoffsEmitted — they're setup, not
    // assertions. Failures surface in downstream handoffs honestly.
    if (snapshot.preconditions && snapshot.preconditions.length > 0) {
      for (const pre of snapshot.preconditions) {
        const outcome = await runPipelineStep(page, pre, firstDataRowValue, reasoning);
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
      const outcome = await runPipelineStep(page, step, firstDataRowValue, reasoning);
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
  const tallies = derivePublicAutCaseTallies(stepOutcomes);
  if (options.capture === true) {
    writeCaptureRecord({
      aut: aut.name,
      autUrl,
      adoId: snapshot.id,
      runStartedAt,
      stepOutcomes,
      preconditionOutcomes,
      logRoot: options.logRoot,
    });
  }
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
    tallies,
    elapsedMs,
    runStartedAt,
    logRoot: options.logRoot,
  });

  return {
    aut: aut.name,
    autUrl,
    partition: aut.partition,
    adoId: snapshot.id,
    adoContentHash: snapshot.contentHash,
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
    domTargetSteps: tallies.domTargetSteps,
    domTargetMatched: tallies.domTargetMatched,
    handoffsWithEvidence: tallies.handoffsWithEvidence,
    elapsedMs,
    receiptPath,
    cohortRole: options.cohortRole ?? aut.partition,
    substrateVersion: PUBLIC_AUT_SUBSTRATE_VERSION,
    resolverFingerprint: resolverFingerprint(),
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
  readonly tallies: PublicAutCaseTallies;
  readonly elapsedMs: number;
  readonly runStartedAt: string;
  readonly logRoot: string;
}

interface WriteCaptureArgs {
  readonly aut: string;
  readonly autUrl: string;
  readonly adoId: string;
  readonly runStartedAt: string;
  readonly stepOutcomes: readonly PublicAutStepOutcome[];
  readonly preconditionOutcomes: readonly PublicAutStepOutcome[];
  readonly logRoot: string;
}

/**
 * Cycle 11 (G3): write the per-case capture record — the frozen
 * resolution projection a pure replay reconstructs the verdict
 * from. Stores every step's `ResolutionTrace`, stamped with a
 * `snapshotFingerprint` over the traces (finally populating the
 * field the cohort manifest has reserved-but-null since cycle 1).
 * Append-only file-per-record under a registered log.
 */
function writeCaptureRecord(args: WriteCaptureArgs): string {
  const dir = path.join(args.logRoot, 'workshop', 'logs', 'public-aut-captures', args.aut);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = args.runStartedAt.replace(/[:.]/g, '-');
  const collect = (outcomes: readonly PublicAutStepOutcome[]) =>
    outcomes
      .filter((o) => o.trace !== null)
      .map((o) => ({ stepIndex: o.stepIndex, trace: o.trace }));
  const traces = collect(args.stepOutcomes);
  const preconditionTraces = collect(args.preconditionOutcomes);
  const snapshotFingerprint = taggedFingerprintFor('snapshot', { traces, preconditionTraces });
  const record = {
    schemaVersion: 1,
    captureKind: 'public-aut-resolution-capture',
    aut: args.aut,
    autUrl: args.autUrl,
    adoId: args.adoId,
    runStartedAt: args.runStartedAt,
    resolverFingerprint: resolverFingerprint(),
    snapshotFingerprint,
    preconditionTraces,
    traces,
  };
  const fullPath = path.join(dir, `${args.adoId}-${stamp}.capture.json`);
  fs.writeFileSync(fullPath, JSON.stringify(record, null, 2));
  return fullPath;
}

function writeCaseReceipt(args: WriteReceiptArgs): string {
  const dir = path.join(args.logRoot, 'workshop', 'logs', 'public-aut-receipts', args.aut);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = args.runStartedAt.replace(/[:.]/g, '-');
  const file = `${args.snapshot.id}-${stamp}.json`;
  const fullPath = path.join(dir, file);
  const receipt = {
    // Cycle 10: 4 → 5. Step outcomes gained `resolutionRung` and
    // `evidence` (the degraded-resolution ladder's harvest).
    // Cycle 11 (G4): 5 → 6. Added honest DOM-target tallies
    // (domTargetSteps / domTargetMatched / handoffsWithEvidence).
    // Cycle 11 (G5): + resolverFingerprint for clean-room C3.
    schemaVersion: 6,
    substrateVersion: PUBLIC_AUT_SUBSTRATE_VERSION,
    resolverFingerprint: resolverFingerprint(),
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
    domTargetSteps: args.tallies.domTargetSteps,
    domTargetMatched: args.tallies.domTargetMatched,
    handoffsWithEvidence: args.tallies.handoffsWithEvidence,
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
