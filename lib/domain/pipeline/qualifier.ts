/**
 * Qualifier bag for qualifier-aware lookup.
 *
 * Per the canon-and-derivation doctrine § 6.6 Qualifier-aware
 * lookup, the lookup chain accepts an optional qualifier bag
 * alongside the atom address. The bag carries contextual filters
 * that the chain applies to the resolved atom via the projection
 * tier.
 *
 * The bag is structurally typed: every field is optional. An empty
 * bag (or `undefined`) means "no qualifiers — return the unfiltered
 * atom." A bag with one or more qualifiers triggers the projection
 * filtering pass after atom resolution.
 *
 * Pure domain — no Effect, no IO, no application imports.
 */

import type {
  RoleId,
  WizardId,
  WizardStateId,
  PermissionGroupId,
  EntityKind,
  ProcessStateId,
  FeatureFlagId,
} from './projection-address';

// ─── The qualifier bag ───────────────────────────────────────────

export interface QualifierBag {
  /** Which user role is querying. Triggers role-visibility and
   *  role-interaction projection filtering. */
  readonly role?: RoleId;

  /** Which wizard state the SUT is in. Triggers wizard-state
   *  projection filtering. */
  readonly wizardState?: { readonly wizard: WizardId; readonly state: WizardStateId };

  /** Which business process state a relevant entity is in. Triggers
   *  process-state projection filtering. */
  readonly processState?: { readonly entity: EntityKind; readonly state: ProcessStateId };

  /** Which feature flags are active. Triggers feature-flag projection
   *  filtering for each listed flag. */
  readonly featureFlags?: readonly FeatureFlagId[];

  /** Which permission groups apply. Triggers permission-group
   *  projection filtering for each listed group. */
  readonly permissionGroups?: readonly PermissionGroupId[];
}

/** A bag with no qualifiers — equivalent to passing `undefined`. */
export const EMPTY_QUALIFIER_BAG: QualifierBag = {};

/** True when the bag has at least one qualifier. */
export function hasQualifiers(bag: QualifierBag | undefined): boolean {
  if (bag === undefined) return false;
  return (
    bag.role !== undefined ||
    bag.wizardState !== undefined ||
    bag.processState !== undefined ||
    (bag.featureFlags !== undefined && bag.featureFlags.length > 0) ||
    (bag.permissionGroups !== undefined && bag.permissionGroups.length > 0)
  );
}

// ─── Atom applicability under projection filtering ──────────────

/** When projections are applied to an atom, the result has an
 *  applicability classification. Consumers can choose to ignore
 *  hidden atoms entirely or to read them with read-only semantics
 *  depending on what they're trying to do. */
export type AtomApplicability =
  | 'visible'      // atom is fully visible and not constrained
  | 'interactive'  // atom is visible AND the role can interact with it
  | 'read-only'    // atom is visible but the role cannot interact
  | 'hidden'       // atom is completely hidden from the role
  | 'gated';       // atom exists but is gated behind a condition (e.g. a feature flag)

/** Compose two applicabilities by intersection — if any one
 *  projection says hidden, the result is hidden; if any says
 *  read-only, the result is read-only; etc. The composition is
 *  associative and commutative; the identity element is `interactive`. */
export function intersectApplicability(
  a: AtomApplicability,
  b: AtomApplicability,
): AtomApplicability {
  // Hidden trumps everything.
  if (a === 'hidden' || b === 'hidden') return 'hidden';
  // Gated trumps everything except hidden.
  if (a === 'gated' || b === 'gated') return 'gated';
  // Read-only trumps interactive and visible.
  if (a === 'read-only' || b === 'read-only') return 'read-only';
  // Visible trumps interactive (visible is more restrictive).
  if (a === 'visible' || b === 'visible') return 'visible';
  // Both are interactive.
  return 'interactive';
}

/** Identity element for the intersect operation. Composing any
 *  applicability with this returns the other. */
export const APPLICABILITY_IDENTITY: AtomApplicability = 'interactive';
