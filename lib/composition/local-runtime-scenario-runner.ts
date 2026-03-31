import { Effect } from 'effect';
import { FileSystem } from '../application/ports/infrastructure-ports';
import type { ExecutionScenarioRunnerPort } from '../application/ports/execution-ports';
import { createProjectPaths, type ProjectPaths } from '../application/paths';
import { readTranslationCache, translationCacheKey, writeTranslationCache } from '../application/translation-cache';
import {
  accrueSemanticEntry,
  readSemanticDictionary,
  recordSemanticFailure,
  recordSemanticSuccess,
  writeSemanticDictionary,
} from '../application/semantic-translation-dictionary';
import { translateIntentToOntology } from '../application/translate';
import type { TranslationProvider } from '../application/translation-provider';
import { resolveAgentInterpreterProvider, type AgentInterpreterProvider } from '../application/agent-interpreter-provider';
import type { SemanticDictionaryCatalog, TranslationReceipt, TranslationRequest } from '../domain/types';
import { LocalFileSystem } from '../infrastructure/fs/local-fs';
import { createLocalRuntimeEnvironment, type LocalRuntimeAgentInterpreter } from '../infrastructure/runtime/local-runtime-environment';
import { createScenarioRunState, runScenarioStep } from '../runtime/scenario';

export function buildCachedTranslator(
  paths: ProjectPaths,
  cacheDisabled: boolean,
  provider: TranslationProvider,
): (request: TranslationRequest) => Effect.Effect<TranslationReceipt, never, never> {
  return (request) => Effect.gen(function* () {
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
  }).pipe(Effect.provideService(FileSystem, LocalFileSystem));
}

export function buildDefaultTranslator(
  paths: ProjectPaths,
  cacheDisabled: boolean,
): (request: TranslationRequest) => Effect.Effect<TranslationReceipt, never, never> {
  return (request) => Effect.gen(function* () {
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
  }).pipe(Effect.provideService(FileSystem, LocalFileSystem));
}

export function bridgeAgentInterpreterForRuntime(provider: AgentInterpreterProvider): LocalRuntimeAgentInterpreter {
  return {
    id: provider.id,
    kind: provider.kind,
    interpret: (request) => Effect.runPromise(provider.interpret(request)),
  };
}

/** Create a ExecutionScenarioRunnerPort with a specific agent interpreter provider.
 *  This is the injection point for agent sessions, Copilot, and dashboard integrations. */
function buildRunnerWithInterpreter(interpreterOverride?: AgentInterpreterProvider | undefined): ExecutionScenarioRunnerPort {
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

        const runtimeTranslator = translator
          ? ((request: TranslationRequest) => Effect.runPromise(translator(request)))
          : undefined;

        const agentInterpreter = bridgeAgentInterpreterForRuntime(
          interpreterOverride ?? resolveAgentInterpreterProvider(),
        );

      // ─── Semantic Dictionary: load once per run ───
      const semanticDictionary: SemanticDictionaryCatalog = yield* readSemanticDictionary(paths).pipe(
        Effect.provideService(FileSystem, LocalFileSystem),
      );
      let catalog = semanticDictionary;
      let catalogDirty = false;

      const runtimeEnvironment = createLocalRuntimeEnvironment({
        rootDir: input.rootDir,
        suiteRoot: input.suiteRoot,
        screenIds: input.plan.screenIds,
        fixtures: input.plan.fixtures,
        mode: input.plan.mode,
        provider: input.resolutionEngine.id,
        controlSelection: input.plan.controlSelection,
        posture: input.plan.posture,
        translator: runtimeTranslator,
        agentInterpreter,
        recoveryPolicy: input.plan.recoveryPolicy,
      });
      const runState = createScenarioRunState();
      const agent = {
        resolve: input.resolutionEngine.resolveStep,
      };

      const results = yield* Effect.forEach(
        input.plan.steps,
        (step) => Effect.gen(function* () {
          // Inject the latest catalog into the environment for each step
          const stepResult = yield* Effect.promise(() =>
            runScenarioStep(
              step,
              { ...runtimeEnvironment, agent, semanticDictionary: catalog },
              runState,
              input.plan.context,
              input.plan.resolutionContext,
            ),
          );

          // ─── Semantic Dictionary: accrue + track success/failure ───
          if (stepResult.semanticAccrual) {
            catalog = accrueSemanticEntry(catalog, stepResult.semanticAccrual);
            catalogDirty = true;
          }
          const stepSucceeded = stepResult.execution.execution.status === 'ok';
          if (stepResult.semanticDictionaryHitId) {
            catalog = stepSucceeded
              ? recordSemanticSuccess(catalog, stepResult.semanticDictionaryHitId)
              : recordSemanticFailure(catalog, stepResult.semanticDictionaryHitId);
            catalogDirty = true;
          }

          return stepResult;
        }),
        { concurrency: 1 },
      );

      // ─── Semantic Dictionary: persist once at end of run ───
      if (catalogDirty) {
        yield* writeSemanticDictionary(paths, catalog).pipe(
          Effect.provideService(FileSystem, LocalFileSystem),
        );
      }

      return [...results];
    });
  },
  };
}

/** Default runner: resolves agent interpreter from environment (TESSERACT_AGENT_PROVIDER). */
export const LocalRuntimeScenarioRunner: ExecutionScenarioRunnerPort = buildRunnerWithInterpreter();

/** Factory: create a runner with a specific agent interpreter injected.
 *  Used by composition layer when an agent session provides its own interpreter. */
export const createLocalRuntimeScenarioRunnerWithInterpreter = (
  interpreter: AgentInterpreterProvider,
): ExecutionScenarioRunnerPort => buildRunnerWithInterpreter(interpreter);
