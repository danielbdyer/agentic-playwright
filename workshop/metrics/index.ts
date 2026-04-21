/**
 * Bounded context — domain/fitness
 *
 * Measuring the gap — failure modes, metrics, scorecards, and Pareto objectives.
 */
export * from '../../product/domain/fitness/architecture-fitness';
export * from '../../product/domain/fitness/types';

// ─── L4 measurement primitives (phantom-branded, hierarchical) ───
//
// The visitor + tree machinery the fifth-kind loop uses to derive
// pipeline-efficacy metrics from execution receipts. Visitor
// implementations and the runtime registry are populated by downstream
// commits; this re-export exposes only the foundational types and pure
// helpers from the dedicated metric/ namespace.
export * from './metric/index';
