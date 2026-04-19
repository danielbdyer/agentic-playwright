/**
 * Confidence levels — trust in interpretations.
 *
 * Extracted from governance/workflow-types.ts during Phase 2 domain decomposition.
 */

export type Confidence = 'human' | 'agent-verified' | 'agent-proposed' | 'compiler-derived' | 'intent-only' | 'unbound';
