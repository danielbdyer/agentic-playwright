/**
 * Shared cross-context value objects and governance primitives.
 *
 * Keep this surface small and stable: bounded contexts may depend on
 * these shared contracts, but should not depend on each other.
 */
export * from './workflow';
