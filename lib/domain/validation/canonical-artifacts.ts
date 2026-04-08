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
import type { AtomClass } from '../pipeline/atom-address';
import type { CompositionSubType } from '../pipeline/composition-address';
import type { ProjectionSubType } from '../pipeline/projection-address';

// ─── Atom validator ──────────────────────────────────────────────

export const validateAtomArtifact: (value: unknown) => Atom<AtomClass, unknown> =
  schemaDecode.decoderFor<Atom<AtomClass, unknown>>(AtomEnvelopeSchema);

// ─── Composition validator ───────────────────────────────────────

export const validateCompositionArtifact: (
  value: unknown,
) => Composition<CompositionSubType, unknown> = schemaDecode.decoderFor<
  Composition<CompositionSubType, unknown>
>(CompositionEnvelopeSchema);

// ─── Projection validator ────────────────────────────────────────

export const validateProjectionArtifact: (
  value: unknown,
) => Projection<ProjectionSubType> = schemaDecode.decoderFor<Projection<ProjectionSubType>>(
  ProjectionEnvelopeSchema,
);
