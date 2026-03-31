/**
 * Thin public barrel for approved bounded contexts.
 *
 * Avoid adding direct exports from leaf modules here — expose new
 * contracts through the owning bounded context barrel.
 */
export * from './types/shared-context';
export * from './types/intent-context';
export * from './types/knowledge-context';
export * from './types/resolution-context';
export * from './types/execution-context';
export * from './types/intervention-context';
export * from './types/improvement-context';
export * from './types/interface-context';
