import { Effect } from 'effect';
import type { RuntimeScenarioRunnerPort } from '../application/ports';
import { createProjectPaths } from '../application/paths';
import { readTranslationCache, translationCacheKey, writeTranslationCache } from '../application/translation-cache';
import { translateIntentToOntology } from '../application/translate';
import { createLocalRuntimeEnvironment } from '../infrastructure/runtime/local-runtime-environment';
import { createScenarioRunState, runScenarioStep } from '../runtime/scenario';

export const LocalRuntimeScenarioRunner: RuntimeScenarioRunnerPort = {
  runSteps(input) {
    return Effect.gen(function* () {
      const paths = createProjectPaths(input.rootDir);
      const translationDisabled = Boolean(input.translationOptions?.disableTranslation);
      const cacheDisabled = Boolean(input.translationOptions?.disableTranslationCache);

      const translator = translationDisabled
        ? undefined
        : ((request: Parameters<typeof translateIntentToOntology>[0]) => Effect.runPromise(Effect.gen(function* () {
            const cacheKey = translationCacheKey(request);
            if (!cacheDisabled) {
              const cached = yield* Effect.promise(() => readTranslationCache({ paths, request }));
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
              yield* Effect.promise(() => writeTranslationCache({ paths, request, receipt: computed }));
            }
            return computed;
          })));

      const runtimeEnvironment = createLocalRuntimeEnvironment({
        rootDir: input.rootDir,
        screenIds: input.plan.screenIds,
        fixtures: input.plan.fixtures,
        mode: input.plan.mode,
        provider: input.resolutionEngine.id,
        controlSelection: input.plan.controlSelection,
        posture: input.plan.posture,
        translator,
        recoveryPolicy: input.plan.recoveryPolicy,
      });
      const runState = createScenarioRunState();
      const agent = {
        resolve: input.resolutionEngine.resolveStep,
      };
      const results = [];

      for (const step of input.plan.steps) {
        results.push(yield* Effect.promise(() => runScenarioStep(step, { ...runtimeEnvironment, agent }, runState, input.plan.context, input.plan.resolutionContext)));
      }

      return results;
    });
  },
};
