/**
 * Shared kernel — foundational types and utilities used across all bounded contexts.
 *
 * These modules are imported by 5+ consumers across multiple layers. They are
 * cross-cutting concerns: ID systems, error hierarchies, collection utilities,
 * hashing, visitor folds, and phantom brands.
 */
export * from './identity';
export * from './errors';
export * from './brand';
export * from './collections';
export * from './hash';
export * from './ids';
export * from './random';
export * from './ref-path';
export * from './visitors';
export * from './finite-state-machine';
export * from './observation-collapse';
export * from './governed-suspension';
