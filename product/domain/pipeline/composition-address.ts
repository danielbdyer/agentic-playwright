/**
 * Composition addresses — typed identities for Tier 2 canonical
 * artifacts.
 *
 * Per the canon-and-derivation doctrine § 3.7 Tier 2 — Compositions,
 * compositions are higher-order patterns over atoms. Each composition
 * sub-type has its own identity shape because they describe different
 * kinds of higher-order knowledge: a runbook is keyed by RunbookId,
 * a flow by FlowId, a workflow archetype by ArchetypeId, etc.
 *
 * CompositionAddress is a discriminated union over composition
 * sub-type. Each variant carries its own typed identity.
 *
 * Pure domain — no Effect, no IO, no application imports.
 */

import type { Brand } from '../kernel/brand';
import type { ScreenId } from '../kernel/identity';

// ─── Composition sub-type identities ─────────────────────────────

export type ArchetypeId = Brand<string, 'ArchetypeId'>;
export type FlowId = Brand<string, 'FlowId'>;
export type RunbookId = Brand<string, 'RunbookId'>;
export type RouteGraphId = Brand<string, 'RouteGraphId'>;
export type ExpansionRulesId = Brand<string, 'ExpansionRulesId'>;
export type SurfaceCompositionId = Brand<string, 'SurfaceCompositionId'>;
export type RecipeTemplateId = Brand<string, 'RecipeTemplateId'>;

// ─── Composition sub-types ───────────────────────────────────────

/** The complete enumeration of composition sub-types. Adding a new
 *  sub-type requires adding a corresponding `CompositionAddress`
 *  variant below. */
export const COMPOSITION_SUB_TYPES = [
  'archetype',
  'flow',
  'runbook',
  'route-graph',
  'expansion-rule',
  'surface-composition',
  'recipe-template',
] as const;

export type CompositionSubType = typeof COMPOSITION_SUB_TYPES[number];

// ─── Per-sub-type identity tuples ────────────────────────────────

export interface ArchetypeCompositionAddress {
  readonly subType: 'archetype';
  readonly id: ArchetypeId;
}

export interface FlowCompositionAddress {
  readonly subType: 'flow';
  readonly id: FlowId;
}

export interface RunbookCompositionAddress {
  readonly subType: 'runbook';
  readonly id: RunbookId;
}

export interface RouteGraphCompositionAddress {
  readonly subType: 'route-graph';
  readonly id: RouteGraphId;
}

export interface ExpansionRuleCompositionAddress {
  readonly subType: 'expansion-rule';
  readonly id: ExpansionRulesId;
}

export interface SurfaceCompositionAddress {
  readonly subType: 'surface-composition';
  readonly screen: ScreenId;
  readonly id: SurfaceCompositionId;
}

export interface RecipeTemplateCompositionAddress {
  readonly subType: 'recipe-template';
  readonly id: RecipeTemplateId;
}

// ─── The CompositionAddress union ────────────────────────────────

export type CompositionAddress =
  | ArchetypeCompositionAddress
  | FlowCompositionAddress
  | RunbookCompositionAddress
  | RouteGraphCompositionAddress
  | ExpansionRuleCompositionAddress
  | SurfaceCompositionAddress
  | RecipeTemplateCompositionAddress;

export type CompositionAddressOf<S extends CompositionSubType> = Extract<
  CompositionAddress,
  { subType: S }
>;

// ─── Stringification ─────────────────────────────────────────────

export function compositionAddressToPath(address: CompositionAddress): string {
  switch (address.subType) {
    case 'archetype':
      return `archetypes/${address.id}`;
    case 'flow':
      return `flows/${address.id}`;
    case 'runbook':
      return `runbooks/${address.id}`;
    case 'route-graph':
      return `route-graphs/${address.id}`;
    case 'expansion-rule':
      return `expansion-rules/${address.id}`;
    case 'surface-composition':
      return `surface-compositions/${address.screen}/${address.id}`;
    case 'recipe-template':
      return `recipe-templates/${address.id}`;
  }
}

export function compositionAddressEquals(
  a: CompositionAddress,
  b: CompositionAddress,
): boolean {
  return compositionAddressToPath(a) === compositionAddressToPath(b);
}
