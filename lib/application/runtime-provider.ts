import type { RuntimeInterpreterMode, RuntimeProviderCapabilities, ResolutionReceipt, StepTask } from '../domain/types';
import { deterministicRuntimeStepAgent } from '../runtime/agent';
import type { RuntimeStepAgentContext } from '../runtime/agent';

export type RuntimeProviderId = string;

export interface RuntimeProvider {
  id: RuntimeProviderId;
  capabilities: RuntimeProviderCapabilities;
  resolveStep(task: StepTask, context: RuntimeStepAgentContext): Promise<ResolutionReceipt>;
}

function deterministicProvider(): RuntimeProvider {
  return {
    id: 'deterministic-runtime-step-agent',
    capabilities: {
      supportsTranslation: true,
      supportsDom: true,
      supportsProposalDrafts: true,
      deterministicMode: true,
    },
    resolveStep(task, context) {
      return deterministicRuntimeStepAgent.resolve(task, context);
    },
  };
}

function providerCompatibilityError(provider: RuntimeProvider, mode: RuntimeInterpreterMode): string | null {
  if (mode === 'playwright' && !provider.capabilities.supportsDom) {
    return `Runtime provider "${provider.id}" cannot run in playwright mode without DOM support.`;
  }
  return null;
}

export function createRuntimeProviderRegistry(providers: RuntimeProvider[] = [deterministicProvider()]): Map<RuntimeProviderId, RuntimeProvider> {
  return new Map(providers.map((provider) => [provider.id, provider]));
}

const defaultRegistry = createRuntimeProviderRegistry();

export function resolveRuntimeProvider(input: {
  providerId?: RuntimeProviderId | null | undefined;
  mode: RuntimeInterpreterMode;
  translationEnabled: boolean;
  registry?: Map<RuntimeProviderId, RuntimeProvider>;
}): RuntimeProvider {
  const providerId = input.providerId ?? 'deterministic-runtime-step-agent';
  const registry = input.registry ?? defaultRegistry;
  const provider = registry.get(providerId);
  if (!provider) {
    throw new Error(`Unknown runtime provider "${providerId}".`);
  }
  const incompatibility = providerCompatibilityError(provider, input.mode);
  if (incompatibility) {
    throw new Error(incompatibility);
  }
  if (input.translationEnabled && !provider.capabilities.supportsTranslation) {
    throw new Error(`Runtime provider "${provider.id}" does not support translation.`);
  }
  return provider;
}
