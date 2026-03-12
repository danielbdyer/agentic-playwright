import type { ResolutionEngineCapabilities, RuntimeInterpreterMode, ResolutionReceipt, StepTask } from '../domain/types';

export type ResolutionEngineId = string;
export type RuntimeProviderId = ResolutionEngineId;

export interface ResolutionEngine {
  id: ResolutionEngineId;
  capabilities: ResolutionEngineCapabilities;
  resolveStep(task: StepTask, context: unknown): Promise<ResolutionReceipt>;
}

export type RuntimeProvider = ResolutionEngine;

function deterministicProvider(): ResolutionEngine {
  return {
    id: 'deterministic-runtime-step-agent',
    capabilities: {
      supportsTranslation: true,
      supportsDom: true,
      supportsProposalDrafts: true,
      deterministicMode: true,
    },
    async resolveStep(task, context) {
      const runtimeAgent = await import('../runtime/agent');
      return runtimeAgent.deterministicRuntimeStepAgent.resolve(task, context as never);
    },
  };
}

function providerCompatibilityError(engine: ResolutionEngine, mode: RuntimeInterpreterMode): string | null {
  if (mode === 'playwright' && !engine.capabilities.supportsDom) {
    return `Resolution engine "${engine.id}" cannot run in playwright mode without DOM support.`;
  }
  return null;
}

export function createResolutionEngineRegistry(engines: ResolutionEngine[] = [deterministicProvider()]): Map<ResolutionEngineId, ResolutionEngine> {
  return new Map(engines.map((engine) => [engine.id, engine]));
}

export function createRuntimeProviderRegistry(providers: RuntimeProvider[] = [deterministicProvider()]): Map<RuntimeProviderId, RuntimeProvider> {
  return createResolutionEngineRegistry(providers);
}

const defaultRegistry = createResolutionEngineRegistry();

export function resolveResolutionEngine(input: {
  providerId?: ResolutionEngineId | null | undefined;
  mode: RuntimeInterpreterMode;
  translationEnabled: boolean;
  registry?: Map<ResolutionEngineId, ResolutionEngine>;
}): ResolutionEngine {
  const providerId = input.providerId ?? 'deterministic-runtime-step-agent';
  const registry = input.registry ?? defaultRegistry;
  const engine = registry.get(providerId);
  if (!engine) {
    throw new Error(`Unknown resolution engine "${providerId}".`);
  }
  const incompatibility = providerCompatibilityError(engine, input.mode);
  if (incompatibility) {
    throw new Error(incompatibility);
  }
  if (input.translationEnabled && !engine.capabilities.supportsTranslation) {
    throw new Error(`Resolution engine "${engine.id}" does not support translation.`);
  }
  return engine;
}

export function resolveRuntimeProvider(input: {
  providerId?: RuntimeProviderId | null | undefined;
  mode: RuntimeInterpreterMode;
  translationEnabled: boolean;
  registry?: Map<RuntimeProviderId, RuntimeProvider>;
}): RuntimeProvider {
  return resolveResolutionEngine(input);
}
