/**
 * Compatibility shim: re-exports the modular agent-interpreter implementation
 * from lib/application/agent-interpreter/ for incremental migration.
 */

export type {
  AgentInterpretationRequest,
  AgentInterpretationResult,
  AgentInterpreterKind,
  AgentInterpreterProvider,
} from '../domain/types/agent-interpreter';

export {
  DEFAULT_AGENT_INTERPRETER_CONFIG,
  type AgentInterpreterConfig,
  type AgentLlmApiDependencies,
} from './agent-interpreter/contract';

export { resolveAgentInterpreterProvider } from './agent-interpreter/factory';

export {
  withAgentTimeout,
  withAgentTimeoutEffect,
  createTimeoutBoundedProvider,
} from './agent-interpreter/resilience';

export { createScopedLlmApiAgentProvider } from './agent-interpreter/providers/llm-api';
export { createScopedSessionProvider } from './agent-interpreter/providers/session';
