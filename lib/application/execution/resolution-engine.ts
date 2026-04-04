import type { RuntimeInterpreterMode } from '../../domain/governance/workflow-types';
import type { GroundedStep, ResolutionEngineCapabilities, ResolutionStepOutcome } from '../../domain/resolution/types';
import { TesseractError } from '../../domain/kernel/errors';

export type ResolutionEngineId = string;

export interface ResolutionEngine {
  id: ResolutionEngineId;
  capabilities: ResolutionEngineCapabilities;
  resolveStep(task: GroundedStep, context: unknown): Promise<ResolutionStepOutcome>;
}

function deterministicEngine(): ResolutionEngine {
  return {
    id: 'deterministic-runtime-step-agent',
    capabilities: {
      supportsTranslation: true,
      supportsDom: true,
      supportsProposalDrafts: true,
      deterministicMode: true,
    },
    async resolveStep(task, context) {
      const runtimeAgent = await import('../../runtime/agent');
      return runtimeAgent.deterministicRuntimeStepAgent.resolve(task, context as never);
    },
  };
}

function engineCompatibilityError(engine: ResolutionEngine, mode: RuntimeInterpreterMode): string | null {
  if (mode === 'playwright' && !engine.capabilities.supportsDom) {
    return `Resolution engine "${engine.id}" cannot run in playwright mode without DOM support.`;
  }
  return null;
}

export function createResolutionEngineRegistry(engines: ResolutionEngine[] = [deterministicEngine()]): Map<ResolutionEngineId, ResolutionEngine> {
  return new Map(engines.map((engine) => [engine.id, engine]));
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
    throw new TesseractError('resolution-error', `Unknown resolution engine "${providerId}".`);
  }
  const incompatibility = engineCompatibilityError(engine, input.mode);
  if (incompatibility) {
    throw new TesseractError('resolution-error', incompatibility);
  }
  if (input.translationEnabled && !engine.capabilities.supportsTranslation) {
    throw new TesseractError('resolution-error', `Resolution engine "${engine.id}" does not support translation.`);
  }
  return engine;
}
