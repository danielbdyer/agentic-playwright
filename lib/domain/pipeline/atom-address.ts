/**
 * Atom addresses — typed identities for Tier 1 canonical artifacts.
 *
 * Per the canon-and-derivation doctrine § 3.6 Tier 1 — Atoms, every
 * atom is addressed by its SUT-primitive identity. The address shape
 * varies per atom class because different primitives have different
 * identity tuples (a route is keyed by RouteId; an element is keyed
 * by (ScreenId, ElementId); a posture is keyed by
 * (ScreenId, ElementId, PostureName); etc.).
 *
 * AtomAddress is a discriminated union over atom class. Each variant
 * carries the typed identity tuple for its class. The discrimination
 * is on the `class` field.
 *
 * Pure domain — no Effect, no IO, no application imports.
 */

import type {
  RouteId,
  RouteVariantId,
  ScreenId,
  SurfaceId,
  ElementId,
  PostureId,
  SnapshotTemplateId,
} from '../kernel/identity';

// ─── Atom classes ─────────────────────────────────────────────────

/** The complete enumeration of atom classes. Adding a new class
 *  requires adding a corresponding `AtomAddress` variant below. */
export const ATOM_CLASSES = [
  'route',
  'route-variant',
  'screen',
  'surface',
  'element',
  'posture',
  'affordance',
  'selector',
  'pattern',
  'snapshot',
  'transition',
  'observation-predicate',
  'drift-mode',
  'resolution-override',
  'posture-sample',
] as const;

export type AtomClass = typeof ATOM_CLASSES[number];

// ─── Per-class identity tuples ───────────────────────────────────

export interface RouteAtomAddress {
  readonly class: 'route';
  readonly id: RouteId;
}

export interface RouteVariantAtomAddress {
  readonly class: 'route-variant';
  readonly route: RouteId;
  readonly variant: RouteVariantId;
}

export interface ScreenAtomAddress {
  readonly class: 'screen';
  readonly screen: ScreenId;
}

export interface SurfaceAtomAddress {
  readonly class: 'surface';
  readonly screen: ScreenId;
  readonly surface: SurfaceId;
}

export interface ElementAtomAddress {
  readonly class: 'element';
  readonly screen: ScreenId;
  readonly element: ElementId;
}

export interface PostureAtomAddress {
  readonly class: 'posture';
  readonly screen: ScreenId;
  readonly element: ElementId;
  readonly posture: PostureId;
}

export interface AffordanceAtomAddress {
  readonly class: 'affordance';
  readonly screen: ScreenId;
  readonly element: ElementId;
  readonly affordance: string;
}

export interface SelectorAtomAddress {
  readonly class: 'selector';
  readonly screen: ScreenId;
  readonly element: ElementId;
  readonly rung: string;
}

export interface PatternAtomAddress {
  readonly class: 'pattern';
  readonly id: string;
}

export interface SnapshotAtomAddress {
  readonly class: 'snapshot';
  readonly id: SnapshotTemplateId;
}

export interface TransitionAtomAddress {
  readonly class: 'transition';
  readonly fromScreen: ScreenId;
  readonly toScreen: ScreenId;
  readonly trigger: string;
}

export interface ObservationPredicateAtomAddress {
  readonly class: 'observation-predicate';
  readonly screen: ScreenId;
  readonly id: string;
}

export interface DriftModeAtomAddress {
  readonly class: 'drift-mode';
  readonly screen: ScreenId;
  readonly element: ElementId;
  readonly kind: string;
}

export interface ResolutionOverrideAtomAddress {
  readonly class: 'resolution-override';
  readonly screen: ScreenId;
  readonly intentFingerprint: string;
}

export interface PostureSampleAtomAddress {
  readonly class: 'posture-sample';
  readonly screen: ScreenId;
  readonly element: ElementId;
  readonly posture: PostureId;
}

// ─── The AtomAddress union ───────────────────────────────────────

export type AtomAddress =
  | RouteAtomAddress
  | RouteVariantAtomAddress
  | ScreenAtomAddress
  | SurfaceAtomAddress
  | ElementAtomAddress
  | PostureAtomAddress
  | AffordanceAtomAddress
  | SelectorAtomAddress
  | PatternAtomAddress
  | SnapshotAtomAddress
  | TransitionAtomAddress
  | ObservationPredicateAtomAddress
  | DriftModeAtomAddress
  | ResolutionOverrideAtomAddress
  | PostureSampleAtomAddress;

// ─── Address-by-class lookup type ────────────────────────────────

/** Look up the AtomAddress variant for a given class. Useful for
 *  generic helpers that need to bind their type parameter to a
 *  specific atom class. */
export type AtomAddressOf<C extends AtomClass> = Extract<AtomAddress, { class: C }>;

// ─── Stringification (for storage paths and logging) ─────────────

/** Render an address as a stable, filesystem-safe path fragment.
 *  Used by the canonical artifact store to construct on-disk paths
 *  and by the cache layer to compute file names. */
export function atomAddressToPath(address: AtomAddress): string {
  switch (address.class) {
    case 'route':
      return `routes/${address.id}`;
    case 'route-variant':
      return `route-variants/${address.route}/${address.variant}`;
    case 'screen':
      return `screens/${address.screen}`;
    case 'surface':
      return `surfaces/${address.screen}/${address.surface}`;
    case 'element':
      return `elements/${address.screen}/${address.element}`;
    case 'posture':
      return `postures/${address.screen}/${address.element}/${address.posture}`;
    case 'affordance':
      return `affordances/${address.screen}/${address.element}/${address.affordance}`;
    case 'selector':
      return `selectors/${address.screen}/${address.element}/${address.rung}`;
    case 'pattern':
      return `patterns/${address.id}`;
    case 'snapshot':
      return `snapshots/${address.id}`;
    case 'transition':
      return `transitions/${address.fromScreen}/${address.toScreen}/${address.trigger}`;
    case 'observation-predicate':
      return `observation-predicates/${address.screen}/${address.id}`;
    case 'drift-mode':
      return `drifts/${address.screen}/${address.element}/${address.kind}`;
    case 'resolution-override':
      return `resolution-overrides/${address.screen}/${address.intentFingerprint}`;
    case 'posture-sample':
      return `posture-samples/${address.screen}/${address.element}/${address.posture}`;
  }
}

/** Stable equality check for two atom addresses. Two addresses are
 *  equal iff they have the same class and the same identity tuple. */
export function atomAddressEquals(a: AtomAddress, b: AtomAddress): boolean {
  return atomAddressToPath(a) === atomAddressToPath(b);
}
