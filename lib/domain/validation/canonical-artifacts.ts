/**
 * Validators for the three-tier interface model canonical
 * artifacts (atoms, compositions, projections).
 *
 * Wraps the Effect Schema definitions in `lib/domain/schemas/pipeline.ts`
 * with `decoderFor<T>(schema)` helpers, matching the convention used
 * by every other validator under `lib/domain/validation/`.
 *
 * The schemas enforce both structural shape AND the cross-field
 * (class, address) consistency invariants via Schema.filter
 * refinements. Validators throw a SchemaError when input fails to
 * decode; consumers catch and re-wrap as TesseractError per the
 * existing convention if needed.
 *
 * Pure domain — no Effect runtime, no IO.
 */

import * as schemaDecode from '../schemas/decode';
import {
  AtomEnvelopeSchema,
  CompositionEnvelopeSchema,
  ProjectionEnvelopeSchema,
} from '../schemas/pipeline';
import type { Atom } from '../pipeline/atom';
import type { Composition } from '../pipeline/composition';
import type { Projection } from '../pipeline/projection';
import type { PhaseOutputSource } from '../pipeline/source';
import type { AtomClass } from '../pipeline/atom-address';
import type { CompositionSubType } from '../pipeline/composition-address';
import type { ProjectionSubType } from '../pipeline/projection-address';

// Validators return atoms/compositions/projections with the wide
// `PhaseOutputSource` union because validation runs at the
// persistence boundary — the source is carried as a runtime string
// field loaded from disk, not statically known at the call site.
// Downstream consumers that want to narrow can do so via type
// guards or explicit assignment.

// ─── Atom validator ──────────────────────────────────────────────

export const validateAtomArtifact: (
  value: unknown,
) => Atom<AtomClass, unknown, PhaseOutputSource> = schemaDecode.decoderFor<
  Atom<AtomClass, unknown, PhaseOutputSource>
>(AtomEnvelopeSchema);

// ─── Composition validator ───────────────────────────────────────

export const validateCompositionArtifact: (
  value: unknown,
) => Composition<CompositionSubType, unknown, PhaseOutputSource> = schemaDecode.decoderFor<
  Composition<CompositionSubType, unknown, PhaseOutputSource>
>(CompositionEnvelopeSchema);

// ─── Projection validator ────────────────────────────────────────

export const validateProjectionArtifact: (
  value: unknown,
) => Projection<ProjectionSubType, PhaseOutputSource> = schemaDecode.decoderFor<
  Projection<ProjectionSubType, PhaseOutputSource>
>(ProjectionEnvelopeSchema);
