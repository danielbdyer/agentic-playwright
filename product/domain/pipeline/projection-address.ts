/**
 * Projection addresses — typed identities for Tier 3 canonical
 * artifacts.
 *
 * Per the canon-and-derivation doctrine § 3.8 Tier 3 — Projections,
 * projections are constraints over the atom set: which atoms are
 * visible to which roles, which atoms are accessible in which wizard
 * states, etc. Each projection sub-type has its own identity shape
 * because they project different qualifier axes.
 *
 * ProjectionAddress is a discriminated union over projection
 * sub-type. The qualifier axes are also addressable as identifier
 * brands so the lookup chain can pass them around in QualifierBag.
 *
 * Pure domain — no Effect, no IO, no application imports.
 */

import type { Brand } from '../kernel/brand';
import type { ScreenId, ElementId } from '../kernel/identity';

// ─── Qualifier axis identifiers ──────────────────────────────────
//
// These brands address the contextual axes a projection filters on.
// QualifierBag (in qualifier.ts) carries instances of these brands.

export type RoleId = Brand<string, 'RoleId'>;
export type WizardId = Brand<string, 'WizardId'>;
export type WizardStateId = Brand<string, 'WizardStateId'>;
export type PermissionGroupId = Brand<string, 'PermissionGroupId'>;
export type EntityKind = Brand<string, 'EntityKind'>;
export type ProcessStateId = Brand<string, 'ProcessStateId'>;
export type FeatureFlagId = Brand<string, 'FeatureFlagId'>;

// ─── Projection sub-types ────────────────────────────────────────

/** The complete enumeration of projection sub-types. Adding a new
 *  sub-type requires adding a corresponding `ProjectionAddress`
 *  variant below AND a corresponding qualifier in QualifierBag. */
export const PROJECTION_SUB_TYPES = [
  'role-visibility',
  'role-interaction',
  'wizard-state',
  'permission-group',
  'posture-availability',
  'process-state',
  'feature-flag',
] as const;

export type ProjectionSubType = typeof PROJECTION_SUB_TYPES[number];

// ─── Per-sub-type identity tuples ────────────────────────────────

export interface RoleVisibilityProjectionAddress {
  readonly subType: 'role-visibility';
  readonly role: RoleId;
}

export interface RoleInteractionProjectionAddress {
  readonly subType: 'role-interaction';
  readonly role: RoleId;
}

export interface WizardStateProjectionAddress {
  readonly subType: 'wizard-state';
  readonly wizard: WizardId;
  readonly state: WizardStateId;
}

export interface PermissionGroupProjectionAddress {
  readonly subType: 'permission-group';
  readonly group: PermissionGroupId;
}

export interface PostureAvailabilityProjectionAddress {
  readonly subType: 'posture-availability';
  readonly screen: ScreenId;
  readonly element: ElementId;
}

export interface ProcessStateProjectionAddress {
  readonly subType: 'process-state';
  readonly entity: EntityKind;
  readonly state: ProcessStateId;
}

export interface FeatureFlagProjectionAddress {
  readonly subType: 'feature-flag';
  readonly flag: FeatureFlagId;
}

// ─── The ProjectionAddress union ─────────────────────────────────

export type ProjectionAddress =
  | RoleVisibilityProjectionAddress
  | RoleInteractionProjectionAddress
  | WizardStateProjectionAddress
  | PermissionGroupProjectionAddress
  | PostureAvailabilityProjectionAddress
  | ProcessStateProjectionAddress
  | FeatureFlagProjectionAddress;

export type ProjectionAddressOf<S extends ProjectionSubType> = Extract<
  ProjectionAddress,
  { subType: S }
>;

// ─── Stringification ─────────────────────────────────────────────

export function projectionAddressToPath(address: ProjectionAddress): string {
  switch (address.subType) {
    case 'role-visibility':
      return `role-visibility/${address.role}`;
    case 'role-interaction':
      return `role-interaction/${address.role}`;
    case 'wizard-state':
      return `wizard-state/${address.wizard}/${address.state}`;
    case 'permission-group':
      return `permission-groups/${address.group}`;
    case 'posture-availability':
      return `posture-availability/${address.screen}/${address.element}`;
    case 'process-state':
      return `process-state/${address.entity}/${address.state}`;
    case 'feature-flag':
      return `feature-flags/${address.flag}`;
  }
}

export function projectionAddressEquals(
  a: ProjectionAddress,
  b: ProjectionAddress,
): boolean {
  return projectionAddressToPath(a) === projectionAddressToPath(b);
}
