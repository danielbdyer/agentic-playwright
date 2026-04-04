/**
 * Bounded context — domain/execution
 *
 * Re-exports from commitment/ (the logic) and execution/types (the evidence types).
 * This barrel preserves backward compatibility during the Phase 2 migration.
 */
export * from '../commitment/program';
export * from '../commitment/runtime-loaders';
export * from '../commitment/grammar';
export * from '../commitment/grounded-flow';
export * from '../commitment/status';
