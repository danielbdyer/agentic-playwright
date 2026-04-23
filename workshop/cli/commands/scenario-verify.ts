/**
 * `tesseract scenario-verify` — runs the scenario corpus end-to-end.
 *
 * Per docs/v2-scenario-corpus-plan.md §7.S9, this command:
 *   1. Loads every scenario in workshop/scenarios/corpus/.
 *   2. Resolves the harness via the --adapter flag (mirrors the
 *      probe-spike pattern):
 *        scenario-dry            (default)
 *        scenario-fixture-replay
 *        scenario-playwright-live
 *   3. Runs each scenario; aggregates outcomes.
 *   4. Emits a one-page verdict to stdout (probesCompletingAsExpected
 *      style). Exits 0 if every scenario verdicts trajectory-holds;
 *      exits 1 otherwise.
 *
 * The CLI deliberately reuses the existing --adapter flag so the
 * scenario harness selection mirrors the probe-spike adapter
 * selection — different harness families, same flag pattern.
 */

import { Effect, Layer } from 'effect';
import path from 'node:path';
import { createCommandSpec } from '../../../product/cli/shared';
import {
  defaultCorpusDir,
  loadCorpusFromDirectory,
} from '../../scenarios/corpus/catalog';
import {
  ScenarioHarness,
  type ScenarioHarnessService,
} from '../../scenarios/application/scenario-harness-port';
import { runScenario, type RunOutput, verdictPasses } from '../../scenarios/application/run-scenario';
import { createDryScenarioHarness } from '../../scenarios/harness/dry-scenario-harness';
import { createFixtureReplayScenarioHarness } from '../../scenarios/harness/fixture-replay-scenario-harness';
import { buildScenarioReceipt } from '../../scenarios/application/build-receipt';
import { emitScenarioReceiptsToFilesystem } from '../../scenarios/application/receipt-emitter';
import type { ScenarioReceipt } from '../../scenarios/domain/scenario-receipt';
import { startSubstrateServer } from '../../synthetic-app/server';
import { launchHeadedHarness } from '../../../product/instruments/tooling/headed-harness';
import { createPlaywrightLiveScenarioHarness } from '../../scenarios/harness/playwright-live-scenario-harness';

export const scenarioVerifyCommand = createCommandSpec({
  flags: ['--adapter', '--emit-receipts', '--hypothesis-id'] as const,
  parse: (context) => ({
    command: 'scenario-verify',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => {
      const adapter = context.flags.adapter ?? 'dry-harness';
      const corpus = loadCorpusFromDirectory(defaultCorpusDir(paths.rootDir));
      const errorIssues = corpus.issues.flatMap((entry) =>
        entry.issues
          .filter((i) => i.severity === 'error')
          .map((i) => `${entry.file}: ${i.path} — ${i.message}`),
      );
      if (errorIssues.length > 0) {
        return Effect.sync(() => ({
          adapter,
          totalScenarios: corpus.scenarios.size,
          loadErrors: errorIssues,
          results: [] as readonly { id: string; verdict: string }[],
          allPassed: false,
          receiptsEmittedTo: null as string | null,
        }));
      }

      const emission: EmissionFlags = {
        emitReceipts: context.flags.emitReceipts === true,
        hypothesisId: context.flags.hypothesisId,
      };
      const logDir = path.join(paths.rootDir, 'workshop', 'logs');

      if (adapter === 'playwright-live') {
        return runScenarioCorpusPlaywright(paths.rootDir, corpus, emission, logDir);
      }

      const harness =
        adapter === 'fixture-replay'
          ? createFixtureReplayScenarioHarness()
          : createDryScenarioHarness();
      return runScenarioCorpus(harness, corpus, adapter, emission, logDir);
    },
  }),
});

interface EmissionFlags {
  readonly emitReceipts: boolean;
  readonly hypothesisId: string | undefined;
}

function runScenarioCorpus(
  harness: ScenarioHarnessService,
  corpus: ReturnType<typeof loadCorpusFromDirectory>,
  adapter: string,
  emission: EmissionFlags,
  logDir: string,
) {
  return Effect.gen(function* () {
    const results: { id: string; verdict: string }[] = [];
    const receipts: ScenarioReceipt[] = [];
    for (const [id, scenario] of corpus.scenarios) {
      const output: RunOutput = yield* runScenario(scenario).pipe(
        Effect.provide(Layer.succeed(ScenarioHarness, harness)),
        Effect.catchAll(() =>
          Effect.succeed({
            scenario,
            trace: { steps: [], firstDivergence: null },
            invariantOutcomes: [],
            verdict: 'harness-failed',
            startedAt: new Date(),
            completedAt: new Date(),
            harnessTag: harness.tag,
          } satisfies RunOutput),
        ),
      );
      const receipt = buildScenarioReceipt(output, {
        hypothesisId: emission.hypothesisId,
      });
      receipts.push(receipt);
      results.push({ id, verdict: output.verdict });
    }
    if (emission.emitReceipts) {
      yield* emitScenarioReceiptsToFilesystem({
        logDir,
        receipts,
        hypothesisId: emission.hypothesisId,
      });
    }
    const allPassed = results.every((r) => verdictPasses(r.verdict as never));
    return {
      adapter,
      totalScenarios: corpus.scenarios.size,
      loadErrors: [] as string[],
      results,
      allPassed,
      receiptsEmittedTo: emission.emitReceipts ? logDir : null,
    };
  });
}

function runScenarioCorpusPlaywright(
  rootDir: string,
  corpus: ReturnType<typeof loadCorpusFromDirectory>,
  emission: EmissionFlags,
  logDir: string,
) {
  return Effect.scoped(
    Effect.gen(function* () {
      const server = yield* Effect.acquireRelease(
        Effect.promise(() => startSubstrateServer({ rootDir })),
        (s) => Effect.promise(() => s.stop()).pipe(Effect.catchAll(() => Effect.void)),
      );
      const headed = yield* Effect.acquireRelease(
        Effect.promise(() => launchHeadedHarness({ headless: true, initialUrl: server.baseUrl })),
        (h) => Effect.promise(() => h.dispose()).pipe(Effect.catchAll(() => Effect.void)),
      );
      const harness = createPlaywrightLiveScenarioHarness({
        appUrl: server.baseUrl,
        harness: headed,
      });
      return yield* runScenarioCorpus(harness, corpus, 'playwright-live', emission, logDir);
    }),
  );
}

