import type { WorkflowEnvelopeLineage, WorkflowStage } from '../types/workflow';
import type { Monoid } from './monoid';

// ─── Free Monoids ───
//
// A free monoid over T[] has identity [] and combine via concatenation.
// These are the simplest possible monoid instances — no quotienting.

/** Free monoid over string arrays — identity is [], combine is concatenation. */
export function freeStringMonoid(): Monoid<readonly string[]> {
  return {
    empty: [] as readonly string[],
    combine: (a, b) => [...a, ...b],
  };
}

/** Free monoid over WorkflowStage arrays. */
export function freeStageMonoid(): Monoid<readonly WorkflowStage[]> {
  return {
    empty: [] as readonly WorkflowStage[],
    combine: (a, b) => [...a, ...b],
  };
}

// ─── Product Monoid for WorkflowEnvelopeLineage ───
//
// Field-wise free monoid product. For the optional `experimentIds`,
// undefined is treated as the identity (empty array).

const normalizeExperimentIds = (
  ids: readonly string[] | undefined,
): readonly string[] => ids ?? [];

/** Monoid instance for full WorkflowEnvelopeLineage — field-wise free monoid product. */
export const lineageMonoid: Monoid<WorkflowEnvelopeLineage> = {
  empty: {
    sources: [],
    parents: [],
    handshakes: [],
    experimentIds: undefined,
  },
  combine: (a, b) => ({
    sources: [...a.sources, ...b.sources],
    parents: [...a.parents, ...b.parents],
    handshakes: [...a.handshakes, ...b.handshakes],
    experimentIds: (() => {
      const merged = [
        ...normalizeExperimentIds(a.experimentIds),
        ...normalizeExperimentIds(b.experimentIds),
      ];
      return merged.length > 0 ? merged : undefined;
    })(),
  }),
};

/** Combine two lineages via the product monoid. */
export function mergeLineage(
  a: WorkflowEnvelopeLineage,
  b: WorkflowEnvelopeLineage,
): WorkflowEnvelopeLineage {
  return lineageMonoid.combine(a, b);
}

/** Empty lineage (monoid identity). */
export const emptyLineage: WorkflowEnvelopeLineage = lineageMonoid.empty;
