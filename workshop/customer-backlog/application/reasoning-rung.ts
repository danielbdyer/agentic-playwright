/**
 * Cohort reasoning rung — the file-mediated semantic bridge (Z11d).
 *
 * Praxis audit + journal Entry 36/37: the biggest named gap is
 * semantic bridging for steps whose wording shares no vocabulary
 * with the page — "Japanese" vs a link named 日本語. The
 * degraded-resolution kernel CORRECTLY refuses these (zero token
 * overlap), and the cycle-10 evidence-carrying handoff was designed
 * to be exactly this rung's input: a ranked candidate menu the
 * reasoning step chooses from.
 *
 * This is the reasoning rung of the G7 unified ladder, realized as
 * the plan's record/fill/replay triad (docs/v2-live-adapter-plan.md
 * §1.1) — no live LLM API; Claude IS the adapter, file-mediated:
 *
 *   record  — write a pending request (the candidate menu) to the
 *             pool, and hand off "deferred-to-reasoning" carrying
 *             the pool fingerprint. The step is honestly unresolved
 *             until a fill arrives.
 *   replay  — a fill pass authored the answer (the chosen accessible
 *             name, or NONE); confirm it against the live page and,
 *             on a unique match, resolve at rung 'reasoning'.
 *   off     — the rung is inert (the pre-Z11d behavior).
 *
 * The fingerprint is the reproducibility contract: the same menu +
 * phrase always hits the same pool entry, so a fill is reused
 * deterministically across runs (and across the record→fill→replay
 * cycle).
 */

import type { Locator, Page } from 'playwright';
import {
  buildPendingRequest,
  POOL_NONE,
  PoolError,
  type FilledResponse,
} from '../../../product/domain/reasoning-pool/pool';
import { recordPending, readFilled } from './reasoning-pool-fs';

export type ReasoningMode = 'off' | 'record' | 'replay';

export interface ReasoningCandidate {
  readonly name: string;
  readonly visible: boolean;
  readonly score: number;
}

export interface ReasoningRungInput {
  readonly rootDir: string;
  readonly mode: ReasoningMode;
  readonly verb: string;
  readonly role: string;
  readonly phrase: string | null;
  /** The ranked candidate menu (the cycle-10 evidence) the
   *  reasoning step chooses from. */
  readonly candidates: readonly ReasoningCandidate[];
  /** Confirm a chosen accessible name against the live page. */
  readonly confirm: (name: string) => Promise<Locator | null>;
}

export interface ReasoningRungOutcome {
  /** A unique-confirmed locator when replay resolved a bridge. */
  readonly matchedLocator: Locator | null;
  readonly resolvedName: string | null;
  /** True when record mode parked a pending request (the step is
   *  deferred to a fill pass). */
  readonly deferred: boolean;
  readonly pendingFingerprint: string | null;
  /** Token cost of the reasoning answer (replay), for metering. */
  readonly tokens: FilledResponse['tokens'] | null;
  readonly rationale: string;
}

const MODEL = 'claude-code-session';

/** Build the candidate-selection prompt + a stable pending request. */
function buildRequest(input: ReasoningRungInput) {
  const menu = input.candidates
    .map((c) => `- "${c.name}"${c.visible ? '' : ' (hidden)'}`)
    .join('\n');
  const prompt =
    `A QA test step (verb: ${input.verb}) targets a "${input.phrase ?? ''}" of role "${input.role}".\n` +
    `Token-overlap resolution found no match. Choose the single accessible name from the menu ` +
    `below that semantically IS the target (e.g. a link named 日本語 IS "Japanese language"), ` +
    `or answer ${POOL_NONE} if none is.\n\nMenu:\n${menu}\n\n` +
    `Answer with the exact accessible name, or ${POOL_NONE}.`;
  return buildPendingRequest({
    op: 'synthesize',
    model: MODEL,
    prompt,
    purpose: 'cohort-candidate-selection',
    context: { verb: input.verb, role: input.role, phrase: input.phrase, candidates: input.candidates },
    createdAt: new Date().toISOString(),
  });
}

const INERT: ReasoningRungOutcome = {
  matchedLocator: null,
  resolvedName: null,
  deferred: false,
  pendingFingerprint: null,
  tokens: null,
  rationale: 'reasoning rung off',
};

/**
 * Attempt the reasoning rung. Only meaningful when there are
 * candidates to choose from (an empty page has nothing to bridge to).
 */
export async function attemptReasoningRung(input: ReasoningRungInput): Promise<ReasoningRungOutcome> {
  if (input.mode === 'off' || input.candidates.length === 0) return INERT;

  const pending = buildRequest(input);
  const fp = pending.fingerprint;

  if (input.mode === 'record') {
    recordPending(input.rootDir, pending);
    return {
      matchedLocator: null,
      resolvedName: null,
      deferred: true,
      pendingFingerprint: fp,
      tokens: null,
      rationale: `deferred-to-reasoning: recorded pending pool request ${fp} (${input.candidates.length} candidates); awaiting fill`,
    };
  }

  // replay
  const filled = readFilled(input.rootDir, fp);
  if (filled instanceof PoolError) {
    return {
      matchedLocator: null,
      resolvedName: null,
      deferred: true,
      pendingFingerprint: fp,
      tokens: null,
      rationale: `reasoning replay miss (${filled.kind}) for ${fp}; record a fill then re-run`,
    };
  }
  if (filled.text.trim() === POOL_NONE || filled.text.trim().length === 0) {
    return {
      matchedLocator: null,
      resolvedName: null,
      deferred: false,
      pendingFingerprint: fp,
      tokens: filled.tokens ?? null,
      rationale: `reasoning answered ${POOL_NONE} for ${fp}: no menu candidate is the target`,
    };
  }

  const chosen = filled.text.trim();
  // Guard: the fill must name a candidate that was actually offered
  // (no hallucinated targets), then confirm it on the live page.
  const offered = input.candidates.some((c) => c.name === chosen);
  if (!offered) {
    return {
      matchedLocator: null,
      resolvedName: null,
      deferred: false,
      pendingFingerprint: fp,
      tokens: filled.tokens ?? null,
      rationale: `reasoning chose '${chosen}' which was not in the offered menu; rejected`,
    };
  }
  const locator = await input.confirm(chosen);
  if (!locator) {
    return {
      matchedLocator: null,
      resolvedName: null,
      deferred: false,
      pendingFingerprint: fp,
      tokens: filled.tokens ?? null,
      rationale: `reasoning chose '${chosen}' but it did not confirm to a unique visible element`,
    };
  }
  return {
    matchedLocator: locator,
    resolvedName: chosen,
    deferred: false,
    pendingFingerprint: fp,
    tokens: filled.tokens ?? null,
    rationale: `reasoning bridged '${input.phrase}' → '${chosen}' (filled pool ${fp}), confirmed unique`,
  };
}
