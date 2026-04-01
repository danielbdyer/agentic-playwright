/**
 * Bounded context — domain/resolution
 *
 * Pure domain logic for resolution precedence, comparison rules,
 * execution planning, and the agent interpreter port contract.
 */
export * from './model';
export * from './precedence';
// precedence-policy is consumed via precedence.ts (which re-exports what it needs)
export * from './comparison-rules';
export * from './execution-planner';
