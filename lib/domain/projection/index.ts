/**
 * Bounded context — domain/projection
 *
 * Pure domain logic for visualization, dashboard state, and replay projections.
 * Includes scene reconstruction, convergence ceremony FSMs, timeline batching,
 * and summary/overlay projections.
 *
 * Note: convergence-{finale,fsm,bounds} share overlapping type names and must
 * be imported directly rather than through this barrel.
 */
export * from './scene-state-accumulator';
export * from './speed-tier-batcher';
export * from './act-indicator';
export * from './iteration-timeline';
export * from './summary-view';
export * from './surface-overlay';
export * from './component-maturation';
export * from './binding-distribution';
export * from './speedrun-statistics';
