/**
 * Kind-specific extensions to the FacetRecord.
 *
 * Per `docs/v2-direction.md §6 Step 3`, a facet is one of four
 * kinds: `element`, `state`, `vocabulary`, `route`. The core
 * record shape is uniform; each kind adds a small extension
 * object carrying shape-specific fields. The kind tag drives the
 * discriminated-union fold in consumer code.
 *
 * Pure domain — no Effect, no IO.
 */

import type { LocatorStrategyEntry } from './locator-health';

/** Kind discriminator. Every facet carries exactly one kind. */
export type FacetKind = 'element' | 'state' | 'vocabulary' | 'route';

/** Element-kind extension. Elements are concrete UI controls
 *  (buttons, inputs, rows, panels). The locator-strategy entries
 *  describe how to find them on the page. */
export interface ElementFacetExtension {
  readonly kind: 'element';
  /** The ARIA role the element presents. Empty string when the
   *  element has no declared role. */
  readonly role: string;
  /** Ordered locator strategies for this element. The runtime
   *  walks them in order; the first that resolves wins. Per
   *  `docs/v2-direction.md §3.2` the order is role → label →
   *  placeholder → text → test-id → css. */
  readonly locatorStrategies: readonly LocatorStrategyEntry[];
  /** Whether the element is interactive (can receive input) or
   *  purely observational. */
  readonly interactive: boolean;
}

/** State-kind extension. States describe observable page states —
 *  "results visible," "validation hidden," "policy number
 *  populated." They are checked via predicates, not clicked. */
export interface StateFacetExtension {
  readonly kind: 'state';
  /** Human-legible predicate sentence, e.g. "policyNumberInput has
   *  non-empty value." The predicate is the contract; the
   *  observation mechanism is a runtime concern. */
  readonly predicate: string;
  /** Facet IDs this state's predicate depends on. Observing one
   *  of these facets is a precondition for observing this state. */
  readonly dependsOn: readonly string[];
}

/** Vocabulary-kind extension. Vocabulary facets carry alias-set
 *  knowledge — "Policy Number" maps to `policyNumberInput`,
 *  "Claim number" maps to `claimIdInput`, and so on. They are the
 *  semantic-dictionary surface the agent consults during intent
 *  parsing. */
export interface VocabularyFacetExtension {
  readonly kind: 'vocabulary';
  /** The concept name the agent resolves to. */
  readonly concept: string;
  /** Phrases that have been observed to refer to `concept`. Each
   *  entry tracks its own evidence count so vocabulary drift
   *  surfaces as a per-alias shift rather than a whole-facet
   *  rewrite. */
  readonly aliases: ReadonlyArray<{
    readonly phrase: string;
    readonly evidenceCount: number;
  }>;
}

/** Route-kind extension. Routes encode navigable URLs and their
 *  classification (SPA vs. traditional, waitUntil policy). */
export interface RouteFacetExtension {
  readonly kind: 'route';
  /** The URL pattern as a templated string (`:param` segments). */
  readonly urlPattern: string;
  /** Whether this route needs a full-page load or is a SPA
   *  pushState route. Drives the navigate verb's waitUntil. */
  readonly classification: 'spa' | 'traditional';
  /** Which route-variant IDs the route exposes. */
  readonly variants: readonly string[];
}

/** The discriminated union of all four extensions. Every facet
 *  record embeds exactly one. */
export type FacetExtension =
  | ElementFacetExtension
  | StateFacetExtension
  | VocabularyFacetExtension
  | RouteFacetExtension;

/** Exhaustive fold over the four kinds. */
export function foldFacetExtension<R>(
  ext: FacetExtension,
  cases: {
    readonly element: (x: ElementFacetExtension) => R;
    readonly state: (x: StateFacetExtension) => R;
    readonly vocabulary: (x: VocabularyFacetExtension) => R;
    readonly route: (x: RouteFacetExtension) => R;
  },
): R {
  switch (ext.kind) {
    case 'element':
      return cases.element(ext);
    case 'state':
      return cases.state(ext);
    case 'vocabulary':
      return cases.vocabulary(ext);
    case 'route':
      return cases.route(ext);
  }
}
