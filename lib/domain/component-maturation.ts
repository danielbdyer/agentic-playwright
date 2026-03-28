/**
 * W3.14: Component knowledge maturation from runtime evidence
 *
 * Pure domain module for maturing component knowledge based on
 * accumulated runtime evidence of successful widget interactions.
 */

// ─── Domain types ───

export interface ComponentEvidence {
  readonly componentType: string;
  readonly actions: readonly string[];
  readonly successCount: number;
  readonly totalAttempts: number;
}

export interface ComponentProposal {
  readonly componentType: string;
  readonly suggestedActions: readonly string[];
  readonly confidence: number;
}

// ─── Maturation logic ───

/**
 * Determine whether evidence for a component meets the threshold
 * for proposing a knowledge update.
 *
 * Pure predicate: evidence + threshold in, boolean out.
 */
export function shouldProposeUpdate(evidence: ComponentEvidence, threshold: number): boolean {
  return evidence.totalAttempts > 0
    && evidence.successCount / evidence.totalAttempts >= threshold;
}

/**
 * Compute a confidence score from evidence.
 * Confidence is the success rate weighted by sample size saturation.
 *
 * Pure function: evidence in, confidence number out.
 */
function computeConfidence(evidence: ComponentEvidence): number {
  const successRate = evidence.totalAttempts > 0
    ? evidence.successCount / evidence.totalAttempts
    : 0;
  // Sample-size saturation: approaches 1.0 as totalAttempts grows.
  // At 10 attempts saturation is ~0.91, at 20 it's ~0.95.
  const saturation = 1 - 1 / (1 + evidence.totalAttempts / 10);
  return successRate * saturation;
}

/**
 * Deduplicate and sort actions, keeping only unique entries.
 * Pure function.
 */
function uniqueSortedActions(actions: readonly string[]): readonly string[] {
  return [...new Set(actions)].sort();
}

/**
 * Given a component's evidence, produce a proposal if confidence
 * is above the implicit threshold derived from the evidence itself.
 *
 * Pure function: single evidence in, proposal or null out.
 */
function matureSingle(evidence: ComponentEvidence): ComponentProposal | null {
  const confidence = computeConfidence(evidence);
  return confidence > 0
    ? {
        componentType: evidence.componentType,
        suggestedActions: uniqueSortedActions(evidence.actions),
        confidence,
      }
    : null;
}

/**
 * Merge evidence for the same componentType by summing counts
 * and collecting actions.
 *
 * Pure function: evidence list in, merged evidence list out.
 */
function mergeEvidence(evidence: readonly ComponentEvidence[]): readonly ComponentEvidence[] {
  const merged = evidence.reduce<ReadonlyMap<string, ComponentEvidence>>(
    (acc, entry) => {
      const existing = acc.get(entry.componentType);
      return new Map([...acc, [entry.componentType, existing
        ? {
            componentType: entry.componentType,
            actions: uniqueSortedActions([...existing.actions, ...entry.actions]),
            successCount: existing.successCount + entry.successCount,
            totalAttempts: existing.totalAttempts + entry.totalAttempts,
          }
        : entry,
      ]]);
    },
    new Map(),
  );
  return [...merged.values()];
}

/**
 * Mature component knowledge from accumulated runtime evidence.
 *
 * Merges evidence by componentType, computes confidence for each,
 * and returns proposals sorted by descending confidence.
 *
 * Pure function: evidence list in, proposal list out.
 */
export function matureComponentKnowledge(
  evidence: readonly ComponentEvidence[],
): readonly ComponentProposal[] {
  const merged = mergeEvidence(evidence);
  return merged
    .flatMap((evidence) => {
      const proposal = matureSingle(evidence);
      return proposal !== null ? [proposal] : [];
    })
    .sort((a, b) => {
      const confidenceOrder = b.confidence - a.confidence;
      return confidenceOrder !== 0
        ? confidenceOrder
        : a.componentType.localeCompare(b.componentType);
    });
}
