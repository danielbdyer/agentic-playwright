/**
 * Lattice accumulator construction — carved out of
 * `resolution-stages.ts` at Step 4a (round 2) per
 * `docs/v2-direction.md §6 Step 4a` and §3.7's named split.
 *
 * Two pure functions:
 *   - `summaryForValue`: formats a ranked lattice into top /
 *     rejected candidate summaries for exhaustion trails.
 *   - `buildLatticeAccumulator`: ranks candidates across the five
 *     resolution concerns (action, screen, element, posture,
 *     snapshot) and packages the results into a `LatticeResult`
 *     for the next stage to consume.
 *
 * Pure domain — no Effect, no IO.
 */

import type { ResolutionCandidateSummary } from '../../domain/resolution/types';
import type { RuntimeAgentStageContext, StageEffects } from './types';
import type { LatticeResult } from './accumulator';
import {
  rankActionCandidates,
  rankElementCandidates,
  rankPostureCandidates,
  rankScreenCandidates,
  rankSnapshotCandidates,
  type LatticeCandidate,
} from './candidate-lattice';
import { resolveOverride } from './resolve-target';
import { exhaustionEntry } from './shared';

/** Format a lattice's ranked candidates into summary shape for the
 *  exhaustion trail. Pure; slices by `topN` (default 3). */
export function summaryForValue<T>(
  concern: ResolutionCandidateSummary['concern'],
  ranked: Array<LatticeCandidate<T>>,
  topN = 3,
): { topCandidates: ResolutionCandidateSummary[]; rejectedCandidates: ResolutionCandidateSummary[] } {
  const normalizeValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '(none)';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'object' && value !== null) {
      const cast = value as { screen?: string; element?: string };
      return cast.element ?? cast.screen ?? JSON.stringify(value);
    }
    return String(value);
  };
  const toSummary = (candidate: LatticeCandidate<T>): ResolutionCandidateSummary => ({
    concern,
    source: candidate.source,
    value: normalizeValue(candidate.value),
    score: candidate.score,
    reason: candidate.summary,
  });
  return {
    topCandidates: ranked.slice(0, topN).map(toSummary),
    rejectedCandidates: ranked.slice(1, topN + 1).map(toSummary),
  };
}

/** Rank candidates across all five resolution concerns and package
 *  the accumulator + lattice effects. Downstream stages read the
 *  accumulator fields as priors. */
export function buildLatticeAccumulator(stage: RuntimeAgentStageContext): LatticeResult {
  const { task, context, controlResolution, memory } = stage;

  const actionLattice = rankActionCandidates(task, controlResolution, context.resolutionContext);
  const action = actionLattice.selected?.value ?? null;
  const actionCandidates = summaryForValue('action', actionLattice.ranked);

  const screenLattice = rankScreenCandidates(task, action, controlResolution, context.previousResolution, context.resolutionContext, memory);
  const screen = screenLattice.selected?.value ?? null;

  const elementLattice = rankElementCandidates(task, screen, controlResolution, memory);
  const element = elementLattice.selected?.value ?? null;

  const postureLattice = rankPostureCandidates(task, element, controlResolution, context.resolutionContext);
  const posture = postureLattice.selected?.value ?? null;

  const override = resolveOverride(task, screen, element, posture, controlResolution, context);
  const snapshotLattice = rankSnapshotCandidates(task, screen, element, controlResolution);
  const snapshotTemplate = snapshotLattice.selected?.value ?? null;

  const supplementRefs = [
    ...(actionLattice.selected?.refs ?? []),
    ...(screen?.supplementRefs ?? []),
    ...(elementLattice.selected?.refs ?? []),
    ...(postureLattice.selected?.refs ?? []),
    ...(snapshotLattice.selected?.refs ?? []),
  ];
  const knowledgeRefs = screen ? [...screen.knowledgeRefs] : [];

  const exhaustion = [
    screen
      ? exhaustionEntry('approved-screen-knowledge', 'attempted', `Selected screen ${screen.screen}`, summaryForValue('screen', screenLattice.ranked))
      : exhaustionEntry('approved-screen-knowledge', 'failed', 'No screen candidate matched approved screen knowledge priors', summaryForValue('screen', screenLattice.ranked)),
    element
      ? exhaustionEntry('approved-screen-knowledge', 'attempted', `Matched element ${element.element}`, summaryForValue('element', elementLattice.ranked))
      : exhaustionEntry('approved-screen-knowledge', 'failed', 'No element candidate matched approved screen knowledge', summaryForValue('element', elementLattice.ranked)),
    exhaustionEntry('shared-patterns', posture ? 'attempted' : 'skipped', posture ? `Matched posture ${posture}` : 'No shared posture pattern required', summaryForValue('posture', postureLattice.ranked)),
    exhaustionEntry(
      'prior-evidence',
      context.resolutionContext.evidenceRefs.length > 0 ? 'attempted' : 'skipped',
      context.resolutionContext.evidenceRefs.length > 0 ? 'Prior evidence refs were available to the agent task' : 'No prior evidence refs available',
    ),
  ];

  const latticeObservation = {
    source: 'approved-screen-knowledge' as const,
    summary: 'Deterministic lattice ranked approved candidates across action, screen, element, posture, and snapshot concerns.',
    topCandidates: [
      ...actionCandidates.topCandidates.slice(0, 1),
      ...summaryForValue('screen', screenLattice.ranked).topCandidates.slice(0, 1),
      ...summaryForValue('element', elementLattice.ranked).topCandidates.slice(0, 1),
      ...summaryForValue('posture', postureLattice.ranked).topCandidates.slice(0, 1),
      ...summaryForValue('snapshot', snapshotLattice.ranked).topCandidates.slice(0, 1),
    ],
    rejectedCandidates: [
      ...actionCandidates.rejectedCandidates,
      ...summaryForValue('screen', screenLattice.ranked).rejectedCandidates,
      ...summaryForValue('element', elementLattice.ranked).rejectedCandidates,
      ...summaryForValue('posture', postureLattice.ranked).rejectedCandidates,
      ...summaryForValue('snapshot', snapshotLattice.ranked).rejectedCandidates,
    ],
  };

  const effects: StageEffects = { exhaustion, observations: [latticeObservation], knowledgeRefs, supplementRefs };

  return {
    accumulator: {
      action,
      screen,
      element,
      posture,
      snapshotTemplate,
      override,
      actionLattice,
      screenLattice,
      elementLattice,
      postureLattice,
      snapshotLattice,
      overlayResult: { screen: null, element: null, posture: null, snapshotTemplate: null, overlayRefs: [] },
      translated: { translation: null, screen: null, element: null, overlayRefs: [] },
    },
    effects,
  };
}
