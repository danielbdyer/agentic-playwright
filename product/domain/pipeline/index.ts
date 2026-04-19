/**
 * Bounded context — domain/pipeline
 *
 * Pure typed primitives for the canon-and-derivation doctrine's
 * three-tier interface model: atoms (Tier 1), compositions (Tier 2),
 * and projections (Tier 3), unified by the lookup precedence chain
 * and the promotion/demotion machinery.
 *
 * The application-layer wiring (extending WorkspaceCatalog,
 * implementing the lookup chain, integrating with PipelineStage)
 * lives in `product/application/pipeline/`. This namespace is types
 * only — no Effect, no IO, no side effects.
 *
 * Read `docs/canon-and-derivation.md` before editing this namespace.
 */

// Stage enumeration
export * from './stage-enum';

// Source classifier (the discriminated union for the 5 lookup chain slots)
export * from './source';

// Shared provenance shape (collapsed from the 3 identical tier-specific
// provenance types; the tier-specific names survive as aliases).
export * from './provenance';

// Tier 1 — Atoms
export * from './atom-address';
export * from './atom';

// Tier 2 — Compositions
export * from './composition-address';
export * from './composition';

// Tier 3 — Projections
export * from './projection-address';
export * from './projection';

// Qualifier-aware lookup support
export * from './qualifier';
export * from './lookup-chain';

// Promotion / demotion machinery
export * from './promotion-gate';
