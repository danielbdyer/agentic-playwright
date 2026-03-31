/**
 * Domain model types for the resolution workflow package.
 */
import type { AgentInterpretationRequest, AgentInterpretationResult } from '../types/agent-interpreter';

export type AgentInterpreterKind = 'disabled' | 'heuristic' | 'llm-api' | 'session';

/**
 * Domain-owned interpreter port contract.
 *
 * This remains Effect/runtime-agnostic so runtime and composition adapters can
 * consume a stable semantic contract without importing application modules.
 */
export interface AgentInterpreterPort<TProgram = Promise<AgentInterpretationResult>> {
  readonly id: string;
  readonly kind: AgentInterpreterKind;
  readonly interpret: (request: AgentInterpretationRequest) => TProgram;
}
