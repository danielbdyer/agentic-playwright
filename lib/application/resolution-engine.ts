import { Effect } from 'effect';
import type { ResolutionEngineCapabilities, RuntimeInterpreterMode, GroundedStep, ResolutionStepOutcome } from '../domain/types';
import { TesseractError } from '../domain/errors';

export type ResolutionEngineId = string;

export interface ResolutionEngine {
  id: ResolutionEngineId;
  capabilities: ResolutionEngineCapabilities;
  resolveStep(task: GroundedStep, context: unknown): Effect.Effect<ResolutionStepOutcome, TesseractError>;
}

function engineCompatibilityError(engine: ResolutionEngine, mode: RuntimeInterpreterMode): string | null {
  if (mode === 'playwright' && !engine.capabilities.supportsDom) {
    return `Resolution engine "${engine.id}" cannot run in playwright mode without DOM support.`;
  }
  return null;
}

export function createResolutionEngineRegistry(engines: readonly ResolutionEngine[]): Map<ResolutionEngineId, ResolutionEngine> {
  return new Map(engines.map((engine) => [engine.id, engine]));
}

export function resolveResolutionEngine(input: {
  providerId?: ResolutionEngineId | null | undefined;
  mode: RuntimeInterpreterMode;
  translationEnabled: boolean;
  registry: Map<ResolutionEngineId, ResolutionEngine>;
}): Effect.Effect<ResolutionEngine, TesseractError> {
  const providerId = input.providerId ?? 'deterministic-runtime-step-agent';
  const engine = input.registry.get(providerId);
  if (!engine) {
    return Effect.fail(new TesseractError('resolution-error', `Unknown resolution engine "${providerId}".`));
  }
  const incompatibility = engineCompatibilityError(engine, input.mode);
  if (incompatibility) {
    return Effect.fail(new TesseractError('resolution-error', incompatibility));
  }
  if (input.translationEnabled && !engine.capabilities.supportsTranslation) {
    return Effect.fail(new TesseractError('resolution-error', `Resolution engine "${engine.id}" does not support translation.`));
  }
  return Effect.succeed(engine);
}
