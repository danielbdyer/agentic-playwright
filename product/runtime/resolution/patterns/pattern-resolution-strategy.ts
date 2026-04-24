/**
 * Pattern-resolution strategy — Z11a.4b.
 *
 * ResolutionStrategy implementation filling the `'shared-patterns'`
 * rung of the canonical resolution precedence ladder. Walks the
 * injected PatternRegistry against a classified intent + stage-
 * derived SurfaceIndex; returns a PatternCandidate-backed receipt
 * on match, `{ receipt: null }` otherwise.
 *
 * **Receipt minting is deferred.** Z11a.4b ships the plumbing:
 * registration at the canonical rung, intent classification,
 * registry walk, candidate attribution. Receipt minting
 * (`patternResolvedReceipt` helper that carries patternId +
 * matcherId + matcherIndex into the receipt's provenance) lands in
 * Z11a.5 alongside the compile-emitter work that will consume
 * pattern receipts as evidence. Until then, matches produce
 * observations naming the firing pattern but return null receipts;
 * the pipeline falls through to later rungs unchanged.
 *
 * This is the same shape-locking approach Z11a.1 used for the
 * confirmation-judgment stub: plumbing locked, behavior landing in
 * a dedicated follow-up slice.
 *
 * **Full Effect migration (ResolutionStrategy Promise→Effect) is
 * deferred** — flagged in the epic queue as a dedicated refactor.
 * The pattern-resolution strategy's `attempt` matches the existing
 * Promise-based `ResolutionStrategy` interface; matchers are sync-
 * pure domain functions, so no Promise/Effect adapter is needed
 * internally.
 */

import { classifyIntent } from '../../../domain/resolution/patterns/intent-classifier';
import type { PatternRegistry } from '../../../domain/resolution/patterns/registry';
import { foldPatternRungResult, type MatcherContext, type PatternCandidate } from '../../../domain/resolution/patterns/rung-kernel';
import type { ResolutionObservation } from '../../../domain/resolution/types';
import type { ResolutionStrategy, StrategyAttemptResult } from '../strategy';
import type { RuntimeAgentStageContext } from '../types';
import { surfaceIndexFromStage } from './surface-index-from-stage';

const STRATEGY_NAME = 'pattern-resolution';

/** Walk the registry's patterns in order; return the first candidate
 *  produced by any pattern, or null if none matched. Exported for
 *  law testing; the strategy's `attempt` delegates here. */
export function walkRegistry(
  registry: PatternRegistry,
  ctx: MatcherContext,
): PatternCandidate | null {
  for (const pattern of registry.patterns) {
    const result = pattern.orchestrator(pattern, ctx);
    const candidate = foldPatternRungResult(result, {
      matched: (r) => r.candidate,
      noMatch: () => null,
    });
    if (candidate !== null) return candidate;
  }
  return null;
}

function candidateToObservation(candidate: PatternCandidate): ResolutionObservation {
  return {
    source: 'shared-patterns',
    summary: `Pattern ${candidate.patternId} fired at matcher index ${candidate.matcherIndex} (${candidate.matcherId})`,
    detail: {
      patternId: candidate.patternId,
      matcherId: candidate.matcherId,
      matcherIndex: String(candidate.matcherIndex),
      targetSurfaceId: candidate.targetSurfaceId,
      rationale: candidate.rationale,
    },
  };
}

/** Construct the pattern-resolution ResolutionStrategy bound to a
 *  given PatternRegistry. Composition wires the default registry at
 *  the post-accumulator strategy list; tests inject custom
 *  registries to exercise specific pattern-module behavior.
 */
export function createPatternResolutionStrategy(registry: PatternRegistry): ResolutionStrategy {
  return {
    name: STRATEGY_NAME,
    rungs: ['shared-patterns'],
    requiresAccumulator: false,
    async attempt(stage: RuntimeAgentStageContext): Promise<StrategyAttemptResult> {
      const intent = classifyIntent(stage.task.actionText, stage.task.allowedActions);
      if (intent === null) {
        return { receipt: null, events: [] };
      }

      const surfaceIndex = surfaceIndexFromStage(stage);
      const ctx: MatcherContext = { intent, surfaceIndex };

      const candidate = walkRegistry(registry, ctx);
      if (candidate === null) {
        return { receipt: null, events: [] };
      }

      // Z11a.4b: observation without receipt. The observation tells
      // operators (and the compounding engine, when it consumes
      // observations) which pattern fired, so data is not lost even
      // though the receipt-mint path is not yet active. Z11a.5
      // upgrades this branch to mint a ResolutionReceipt.
      const observation = candidateToObservation(candidate);
      return { receipt: null, events: [{ kind: 'observation-recorded', observation }] };
    },
  };
}
