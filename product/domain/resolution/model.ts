/**
 * Domain model types for the resolution workflow package.
 */
import type { AgentInterpretationRequest, AgentInterpretationResult } from '../interpretation/agent-interpreter';

/**
 * @deprecated v1 Agent interpreter kind. Superseded by the unified
 *             `Reasoning` port (product/reasoning/reasoning.ts). The
 *             `Reasoning.interpret` operation covers this concern;
 *             adapter identification shifts to the `provider` field
 *             on `ReasoningReceipt<'interpret'>`.
 */
export type AgentInterpreterKind = 'disabled' | 'heuristic' | 'llm-api' | 'session';

/**
 * Domain-owned interpreter port contract.
 *
 * This remains Effect/runtime-agnostic so runtime and composition adapters can
 * consume a stable semantic contract without importing application modules.
 *
 * @deprecated v1 Agent interpreter port. Superseded by `Reasoning.Tag`
 *             + `ReasoningService.interpret` at product/reasoning/
 *             reasoning.ts. Existing implementations compose into the
 *             unified port via `createCompositeReasoning(...)`; new
 *             code should bypass this interface entirely.
 *
 *             Scheduled retirement: post-Step-4b, when the direct
 *             copilot-live and openai-live Reasoning adapters land
 *             and the composite bridge is no longer needed.
 */
export interface AgentInterpreterPort<TProgram = Promise<AgentInterpretationResult>> {
  readonly id: string;
  readonly kind: AgentInterpreterKind;
  readonly interpret: (request: AgentInterpretationRequest) => TProgram;
}
