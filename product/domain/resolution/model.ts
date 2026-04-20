/**
 * Domain model types for the resolution workflow package.
 */
import type { AgentInterpretationRequest, AgentInterpretationResult } from '../interpretation/agent-interpreter';

/** The backend kinds the agent-interpretation strategy contract
 *  supports. Consumed by `createReasoning(...)` at
 *  `product/reasoning/adapters/index.ts` to route `Reasoning.interpret`
 *  calls to the correct backend. */
export type AgentInterpreterKind = 'disabled' | 'heuristic' | 'llm-api' | 'session';

/**
 * Domain-owned agent-interpretation backend contract.
 *
 * Effect/runtime-agnostic so runtime and composition adapters can
 * consume a stable semantic contract without importing application
 * modules. Used internally by `product/reasoning/adapters/agent-
 * backends.ts` and passed to `createReasoning({ translation, agent })`
 * at `adapters/index.ts`. External saga code consumes `ReasoningService`
 * via the `Reasoning.Tag` and never holds an `AgentInterpreterPort`
 * directly.
 */
export interface AgentInterpreterPort<TProgram = Promise<AgentInterpretationResult>> {
  readonly id: string;
  readonly kind: AgentInterpreterKind;
  readonly interpret: (request: AgentInterpretationRequest) => TProgram;
}
