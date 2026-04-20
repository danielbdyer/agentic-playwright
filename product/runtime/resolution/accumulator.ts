/**
 * Resolution accumulator types — carved out of resolution-stages.ts
 * at Step 4a per `docs/v2-direction.md §6 Step 4a`.
 *
 * Pure types that stage functions (lattice builder, per-rung
 * try* functions, late stages) pass to each other as the
 * resolution walks the precedence chain. Extracting these keeps
 * resolution-stages.ts smaller and gives the type surface a
 * stable, standalone import home.
 */

import type { ElementId, PostureId, SnapshotTemplateId } from '../../domain/kernel/identity';
import type { StepAction } from '../../domain/governance/workflow-types';
import type { StepTaskElementCandidate, StepTaskScreenCandidate } from '../../domain/knowledge/types';
import type { ResolutionReceipt } from '../../domain/resolution/types';
import type { RankedLattice } from './candidate-lattice';
import type { StageEffects } from './types';
import type { resolveWithConfidenceOverlay, resolveWithTranslation } from './translation';
import type { resolveOverride } from './resolve-target';

/** The accumulator carried through the resolution walk. Each stage
 *  reads earlier fields as priors and writes the one it resolved. */
export interface ResolutionAccumulator {
  action: StepAction | null;
  screen: StepTaskScreenCandidate | null;
  element: StepTaskElementCandidate | null;
  posture: PostureId | null;
  snapshotTemplate: SnapshotTemplateId | null;
  override: ReturnType<typeof resolveOverride>;
  actionLattice: RankedLattice<StepAction>;
  screenLattice: RankedLattice<StepTaskScreenCandidate>;
  elementLattice: RankedLattice<StepTaskElementCandidate>;
  postureLattice: RankedLattice<PostureId>;
  snapshotLattice: RankedLattice<SnapshotTemplateId>;
  overlayResult: ReturnType<typeof resolveWithConfidenceOverlay>;
  translated: Awaited<ReturnType<typeof resolveWithTranslation>>;
}

/** The common stage return shape — receipt + effects. */
export interface StageResult<R = ResolutionReceipt | null> {
  receipt: R;
  effects: StageEffects;
}

/** The lattice builder's return shape. */
export interface LatticeResult {
  accumulator: ResolutionAccumulator;
  effects: StageEffects;
}

/** An accumulator-advancing stage's return shape — lets the caller
 *  both observe the receipt + effects AND read the mutated
 *  accumulator snapshot. */
export interface AccumulatorStageResult {
  receipt: ResolutionReceipt | null;
  effects: StageEffects;
  accumulator: ResolutionAccumulator;
}

// Re-export the Element/Posture/Snapshot ID types so consumers can
// import the accumulator types together with the ID brands without
// reaching into `../../domain/kernel/identity` themselves.
export type { ElementId, PostureId, SnapshotTemplateId };
