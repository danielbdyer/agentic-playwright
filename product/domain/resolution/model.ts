/**
 * Domain model types for the resolution workflow package.
 */
import type { AgentInterpretationRequest, AgentInterpretationResult } from '../interpretation/agent-interpreter';

/**
 * The backend kinds the v1 AgentInterpreterPort chain supports.
 * Lives as the operand shape consumed by
 * `createCompositeReasoning(...)` through the 4b.B.* window. The
 * unified `Reasoning.interpret` operation covers this concern on
 * the v2 surface; adapter identification shifts to the `provider`
 * field on `ReasoningReceipt<'interpret'>`.
 */
export type AgentInterpreterKind = 'disabled' | 'heuristic' | 'llm-api' | 'session';

/**
 * Domain-owned interpreter port contract.
 *
 * This remains Effect/runtime-agnostic so runtime and composition adapters can
 * consume a stable semantic contract without importing application modules.
 *
 * The composite bridge at product/reasoning/adapters/composite.ts
 * takes an instance of this port (plus a TranslationProvider) and
 * exposes them as a unified `Reasoning` adapter. Retirement happens
 * when direct copilot-live and openai-live ReasoningService
 * implementations replace the composite bridge entirely — at that
 * point this interface is deleted along with its factory file.
 */
export interface AgentInterpreterPort<TProgram = Promise<AgentInterpretationResult>> {
  readonly id: string;
  readonly kind: AgentInterpreterKind;
  readonly interpret: (request: AgentInterpretationRequest) => TProgram;
}
