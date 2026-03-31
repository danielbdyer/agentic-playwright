import type {
  AgentInterpretationRequest,
  AgentInterpretationResult,
  AgentInterpreterKind,
  AgentInterpreterProvider,
} from '../../domain/types/agent-interpreter';

export type {
  AgentInterpretationRequest,
  AgentInterpretationResult,
  AgentInterpreterKind,
  AgentInterpreterProvider,
};

export interface AgentLlmApiDependencies {
  readonly createChatCompletion: (input: {
    readonly model: string;
    readonly maxTokens: number;
    readonly systemPrompt: string;
    readonly userMessage: string;
    readonly signal?: AbortSignal | undefined;
  }) => Promise<string>;
  readonly release?: (() => Promise<void>) | undefined;
}

export interface AgentInterpreterConfig {
  readonly provider: AgentInterpreterKind;
  readonly model: string;
  readonly fallback: AgentInterpreterKind;
  readonly budget: {
    readonly maxTokensPerStep: number;
    readonly maxCallsPerRun: number;
  };
}

export const DEFAULT_AGENT_INTERPRETER_CONFIG: AgentInterpreterConfig = {
  provider: 'disabled',
  model: 'gpt-4o',
  fallback: 'disabled',
  budget: {
    maxTokensPerStep: 4000,
    maxCallsPerRun: 100,
  },
};
