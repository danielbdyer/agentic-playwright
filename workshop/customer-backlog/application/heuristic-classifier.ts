/**
 * Heuristic compile-outcome classifier — Z11a.5 baseline.
 *
 * Given an ADO snapshot and its corpus tag, estimates the per-step
 * outcome the full compile pipeline would produce. Uses the Z11a.4b
 * intent classifier as its engine; applies corpus-aware policy on
 * top.
 *
 * **This is NOT the real compile pipeline.** The real compile path
 * (parse → bind → resolve via the 11-rung precedence ladder) runs
 * through product/application/resolution/compile.ts and requires a
 * full catalog + workspace session. Wiring that end-to-end against
 * the customer-backlog fixtures is deferred to Z11d (when the live
 * reasoning adapter closes the gap between raw ADO text and bind).
 *
 * In the meantime, this heuristic produces receipt shapes that:
 *  - Reflect the corpus-invariant we're measuring (needs-human
 *    corpus always counts as needs-human; resolvable corpus counts
 *    as resolvable when the intent-classifier accepts the step).
 *  - Let the compounding engine's customer-compilation cohort
 *    accumulate evidence from Z11a.5 onward.
 *  - Mark themselves as 'heuristic-z11a5' in substrate-version so
 *    later real-compile receipts are distinguishable under drift
 *    detection.
 *
 * Z11d replaces this file's function with a real-compile wrapper;
 * the receipt shape stays stable across the upgrade.
 *
 * Pure — no Effect imports.
 */

import type { AdoSnapshot } from '../../../product/domain/intent/types';
import type { StepAction } from '../../../product/domain/governance/workflow-types';
import { classifyIntent } from '../../../product/domain/resolution/patterns/intent-classifier';
import type { CustomerCompilationCorpus } from '../../compounding/domain/compilation-receipt';

export type StepOutcomeKind = 'would-resolve' | 'would-need-human' | 'would-be-blocked';

export interface StepOutcome {
  readonly stepIndex: number;
  readonly kind: StepOutcomeKind;
  readonly classifierVerdict: 'classified' | 'unclassified';
  readonly rationale: string;
}

export interface HeuristicCaseSummary {
  readonly adoId: string;
  readonly corpus: CustomerCompilationCorpus;
  readonly totalSteps: number;
  readonly resolvedCount: number;
  readonly needsHumanCount: number;
  readonly blockedCount: number;
  readonly handoffsEmittedCount: number;
  readonly handoffsWithValidContextCount: number;
  readonly perStepOutcomes: readonly StepOutcome[];
}

// ─── Action text → StepAction heuristics ──────────────────────

const STRIP_HTML_RE = /<[^>]+>/g;

function stripHtml(s: string): string {
  return s.replace(STRIP_HTML_RE, ' ').replace(/\s+/g, ' ').trim();
}

function mostLikelyActions(plainActionText: string): readonly StepAction[] {
  const plain = plainActionText.toLowerCase();
  const actions: StepAction[] = [];
  if (/\bnavigate|\bgo\s+to|\bopen\s+/.test(plain)) actions.push('navigate');
  if (/\bclick|\btap|\bpress|\bselect\s+the/.test(plain)) actions.push('click');
  if (/\benter|\btype|\bfill|\binput|\bpopulate|\bselect\s+\w+\s+from/.test(plain)) actions.push('input');
  if (/\bverify|\bobserve|\bcheck|\bconfirm\s+that|\bensure\b/.test(plain)) actions.push('assert-snapshot');
  return actions.length > 0 ? actions : ['custom'];
}

// ─── Per-step heuristic ────────────────────────────────────────

function classifyStep(
  index: number,
  rawActionText: string,
  corpus: CustomerCompilationCorpus,
): StepOutcome {
  const plain = stripHtml(rawActionText);
  const allowed = mostLikelyActions(plain);
  const classified = classifyIntent(plain, allowed);

  if (!classified) {
    return {
      stepIndex: index,
      kind: 'would-need-human',
      classifierVerdict: 'unclassified',
      rationale: `intent classifier produced no verb+shape; text: "${plain.slice(0, 60)}"`,
    };
  }

  // Corpus-aware policy: needs-human cases reference surfaces the
  // substrate does not render. The intent classifier can still shape
  // them, but the real compile would halt at the resolution step
  // because no surface canon covers the reference. We encode that
  // invariant here so the needs-human trajectory remains
  // adapter-invariant (§verdict-11 rubric).
  if (corpus === 'needs-human') {
    return {
      stepIndex: index,
      kind: 'would-need-human',
      classifierVerdict: 'classified',
      rationale: `needs-human corpus case; step classified as ${classified.verb}; surface absent → handoff expected`,
    };
  }

  // Resolvable corpus: classifier accepted, so the compile path can
  // at least bind a candidate. Whether the actual resolution finds a
  // matching surface depends on catalog + adapter — Z11d reality.
  return {
    stepIndex: index,
    kind: 'would-resolve',
    classifierVerdict: 'classified',
    rationale: `step classified as ${classified.verb}; role=${classified.targetShape.role ?? 'inferred'}`,
  };
}

// ─── Case aggregator ──────────────────────────────────────────

export function classifyCase(
  snapshot: AdoSnapshot,
  corpus: CustomerCompilationCorpus,
): HeuristicCaseSummary {
  const perStepOutcomes = snapshot.steps.map((step) =>
    classifyStep(step.index, step.action, corpus),
  );

  const resolvedCount = perStepOutcomes.filter((o) => o.kind === 'would-resolve').length;
  const needsHumanCount = perStepOutcomes.filter((o) => o.kind === 'would-need-human').length;
  const blockedCount = perStepOutcomes.filter((o) => o.kind === 'would-be-blocked').length;
  const handoffsEmittedCount = needsHumanCount + blockedCount;

  return {
    adoId: snapshot.id,
    corpus,
    totalSteps: snapshot.steps.length,
    resolvedCount,
    needsHumanCount,
    blockedCount,
    handoffsEmittedCount,
    // Z11a mechanical definition of validity: all emitted handoffs
    // are structurally valid (the heuristic can't tell semantically).
    // Z11d upgrade: the real handoff emission might produce
    // missingContext that doesn't name the right ambiguity, lowering
    // this count below handoffsEmittedCount.
    handoffsWithValidContextCount: handoffsEmittedCount,
    perStepOutcomes,
  };
}
