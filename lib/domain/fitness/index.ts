/**
 * Bounded context — domain/fitness
 *
 * Measuring the gap — failure modes, metrics, scorecards, and Pareto objectives.
 */
export * from './architecture-fitness';
export * from './types';

// ─── L4 measurement primitives (phantom-branded, hierarchical) ───
//
// These exports establish the visitor + tree machinery the fifth-kind
// loop uses to derive pipeline-efficacy metrics from execution receipts.
// Visitor implementations and the runtime registry are populated by
// downstream commits; this index exposes only the foundational types
// and pure helpers.
export * from './metric';
export * from './metric-tree';
export * from './metric-catalogue';
export * from './metric-visitor';
export * from './metric-baseline';
export * from './metric-delta';
