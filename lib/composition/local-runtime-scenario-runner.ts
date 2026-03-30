import { Effect } from 'effect';
import { FileSystem } from '../application/ports';
import type { RuntimeScenarioRunnerPort } from '../application/ports';
import { createProjectPaths } from '../application/paths';
import { readTranslationCache, translationCacheKey, writeTranslationCache } from '../application/translation-cache';
import { translateIntentToOntology } from '../application/translate';
import type { TranslationProvider } from '../application/translation-provider';
import { resolveAgentInterpreterProvider, type AgentInterpreterProvider } from '../application/agent-interpreter-provider';
import type { TranslationReceipt, TranslationRequest } from '../domain/types';
import { LocalFileSystem } from '../infrastructure/fs/local-fs';
import { createLocalRuntimeEnvironment, type LocalRuntimeAgentInterpreter } from '../infrastructure/runtime/local-runtime-environment';
import { createScenarioRunState, runScenarioStep } from '../runtime/scenario';

function buildCachedTranslator(
  paths: ReturnType<typeof createProjectPaths>,
  cacheDisabled: boolean,
  provider: TranslationProvider,
): (request: TranslationRequest) => Promise<TranslationReceipt> {
  return (request) => Effect.runPromise(Effect.gen(function* () {
      const cacheKey = translationCacheKey(request);
      if (!cacheDisabled) {
      const cached = yield* readTranslationCache({ paths, request });
      if (cached) {
        return {
          ...cached.payload.receipt,
          translationProvider: provider.id,
          cache: { key: cacheKey, status: 'hit' as const, reason: null },
        };
      }
    }

    const translated = yield* provider.translate(request);
    const computed = {
      ...translated,
      translationProvider: provider.id,
      cache: {
        key: cacheKey,
        status: cacheDisabled ? 'disabled' as const : 'miss' as const,
        reason: cacheDisabled ? 'cache-disabled' : 'cache-miss',
      },
      failureClass: translated.failureClass ?? (translated.matched ? 'none' as const : 'no-candidate' as const),
    };
    if (!cacheDisabled) {
      yield* writeTranslationCache({ paths, request, receipt: computed });
    }
    return computed;
  }).pipe(Effect.provideService(FileSystem, LocalFileSystem)));
}

function buildDefaultTranslator(
  paths: ReturnType<typeof createProjectPaths>,
  cacheDisabled: boolean,
): (request: TranslationRequest) => Promise<TranslationReceipt> {
  return (request) => Effect.runPromise(Effect.gen(function* () {
    const cacheKey = translationCacheKey(request);
    if (!cacheDisabled) {
      const cached = yield* readTranslationCache({ paths, request });
      if (cached) {
        return {
          ...cached.payload.receipt,
          cache: { key: cacheKey, status: 'hit' as const, reason: null },
        };
      }
    }

    const translated = translateIntentToOntology(request);
    const computed = {
      ...translated,
      cache: {
        key: cacheKey,
        status: cacheDisabled ? 'disabled' as const : 'miss' as const,
        reason: cacheDisabled ? 'cache-disabled' : 'cache-miss',
      },
      failureClass: translated.matched ? 'none' as const : 'no-candidate' as const,
    };
    if (!cacheDisabled) {
      yield* writeTranslationCache({ paths, request, receipt: computed });
    }
    return computed;
  }).pipe(Effect.provideService(FileSystem, LocalFileSystem)));
}

function bridgeAgentInterpreterForRuntime(provider: AgentInterpreterProvider): LocalRuntimeAgentInterpreter {
  return {
    id: provider.id,
    kind: provider.kind,
    interpret: (request) => Effect.runPromise(provider.interpret(request)),
  };
}

/** Create a RuntimeScenarioRunnerPort with a specific agent interpreter provider.
 *  This is the injection point for agent sessions, Copilot, and dashboard integrations. */
function buildRunnerWithInterpreter(interpreterOverride?: AgentInterpreterProvider | undefined): RuntimeScenarioRunnerPort {
  return {
    runSteps(input) {
      return Effect.gen(function* () {
        const paths = createProjectPaths(input.rootDir, input.suiteRoot);
        const translationDisabled = Boolean(input.translationOptions?.disableTranslation);
        const cacheDisabled = Boolean(input.translationOptions?.disableTranslationCache);
        const externalProvider = input.translationOptions?.translationProvider;

        const translator = translationDisabled
          ? undefined
          : externalProvider
            ? buildCachedTranslator(paths, cacheDisabled, externalProvider)
            : buildDefaultTranslator(paths, cacheDisabled);

        const agentInterpreter = bridgeAgentInterpreterForRuntime(
          interpreterOverride ?? resolveAgentInterpreterProvider(),
        );

      const runtimeEnvironment = createLocalRuntimeEnvironment({
        rootDir: input.rootDir,
        suiteRoot: input.suiteRoot,
        screenIds: input.plan.screenIds,
        fixtures: input.plan.fixtures,
        mode: input.plan.mode,
        provider: input.resolutionEngine.id,
        controlSelection: input.plan.controlSelection,
        posture: input.plan.posture,
        translator,
        agentInterpreter,
        recoveryPolicy: input.plan.recoveryPolicy,
      });
      const runState = createScenarioRunState();
      const agent = {
        resolve: input.resolutionEngine.resolveStep,
      };

      const results = yield* Effect.forEach(
        input.plan.steps,
        (step) => Effect.promise(() =>
          runScenarioStep(step, { ...runtimeEnvironment, agent }, runState, input.plan.context, input.plan.resolutionContext),
        ),
        { concurrency: 1 },
      );

      return [...results];
    });
  },
  };
}

/** Default runner: resolves agent interpreter from environment (TESSERACT_AGENT_PROVIDER). */
export const LocalRuntimeScenarioRunner: RuntimeScenarioRunnerPort = buildRunnerWithInterpreter();

/** Factory: create a runner with a specific agent interpreter injected.
 *  Used by composition layer when an agent session provides its own interpreter. */
export const createLocalRuntimeScenarioRunnerWithInterpreter = (
  interpreter: AgentInterpreterProvider,
): RuntimeScenarioRunnerPort => buildRunnerWithInterpreter(interpreter);
