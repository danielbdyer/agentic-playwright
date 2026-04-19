/**
 * Tesseract Dashboard Server — Effect-native TypeScript with PubSub event bus.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { Effect } from 'effect';
import {
  createPipelineEventBus,
  subscribeWsBroadcaster,
} from '../dashboard/bridges/pipeline-event-bus';
import {
  subscribeJournalWriter,
  journalWriterConfig,
} from '../dashboard/bridges/journal-writer';
import { createProjectPaths } from '../product/application/paths';
import { runWithLocalServices } from '../product/composition/local-services';
import { speedrunProgram } from '../workshop/orchestration/speedrun';
import { DEFAULT_PIPELINE_CONFIG } from '../product/domain/attention/pipeline-config';
import { startFixtureServer } from '../product/instruments/tooling/fixture-server';
import { createPlaywrightBrowserPool } from '../product/instruments/runtime/playwright-browser-pool';
import { resolvePlaywrightHeadless } from '../product/instruments/tooling/browser-options';
import { withScreencast } from '../dashboard/bridges/cdp-screencast';
import { parseDashboardConfig } from './server/config';
import { createFileAccess } from './server/infrastructure/file-access';
import { createMcpToolsRegistry } from './server/mcp-tools';
import { createHttpRouter } from './server/http-router';
import { createRuntimeState } from './server/runtime-state';
import { createWsHub } from './server/ws-hub';

const config = parseDashboardConfig({
  serverDir: __dirname,
});

const files = createFileAccess(config.rootDir);
const runtimeState = createRuntimeState();
const wsHub = createWsHub();
const mcpTools = createMcpToolsRegistry({ files });

let watchDebounce: ReturnType<typeof setTimeout> | null = null;
const watchArtifacts = (): void => {
  for (const dir of ['.tesseract/workbench', '.tesseract/benchmarks', '.tesseract/runs'].map((d) => path.join(config.rootDir, d))) {
    try {
      fs.watch(dir, { recursive: true }, () => {
        if (watchDebounce) clearTimeout(watchDebounce);
        watchDebounce = setTimeout(() => {
          const wb = files.readJsonFile('.tesseract/workbench/index.json');
          if (wb) wsHub.broadcastJson({ type: 'workbench-updated', data: wb });
          const sc = files.readJsonFile('.tesseract/benchmarks/scorecard.json');
          if (sc) wsHub.broadcastJson({ type: 'fitness-updated', data: sc });
        }, 500);
      });
    } catch {
      // Directory may not exist yet.
    }
  }
};

const main = Effect.gen(function* () {
  const paths = createProjectPaths(config.rootDir, path.join(config.rootDir, 'dogfood'));

  const bus = yield* createPipelineEventBus({ bufferCapacity: 2048, decisionTimeoutMs: 0 });
  yield* bus.start();
  yield* subscribeWsBroadcaster(bus.pubsub, wsHub.broadcastJson);

  if (config.journalEnabled) {
    const journalDir = path.join(config.rootDir, '.tesseract', 'runs', config.journalRunId);
    const journalPath = path.join(journalDir, 'dashboard-events.jsonl');
    const journalConfig = journalWriterConfig({
      journalPath,
      flushIntervalMs: 1000,
      maxFileSizeBytes: 50_000_000,
    });
    yield* subscribeJournalWriter(bus.pubsub, journalConfig);
    console.log(`  Journal:    ${journalPath}`);
  }

  const server = http.createServer(createHttpRouter({
    port: config.port,
    rootDir: config.rootDir,
    dashboardDir: config.dashboardDir,
    files,
    mcpTools,
    runtimeState,
  }));

  wsHub.attach(server, '/ws');

  yield* Effect.async<void>((resume) => {
    server.listen(config.port, () => {
      console.log(`\n  Tesseract Dashboard v2: http://localhost:${config.port}`);
      console.log(`  Event bus:  Effect.PubSub → SharedArrayBuffer (${2048} slots)`);
      console.log(`  WebSocket:  ws://localhost:${config.port}/ws`);
      console.log(`  MCP Tools:  http://localhost:${config.port}/api/mcp/tools`);
      if (config.journalEnabled) {
        console.log(`  Journal:    .tesseract/runs/${config.journalRunId}/dashboard-events.jsonl`);
      }
      if (config.speedrun.enabled) {
        console.log('  Speedrun:   active');
      }
      console.log('');
      resume(Effect.void);
    });
  });

  watchArtifacts();

  if (config.speedrun.enabled) {
    const { count, seed, maxIterations, posture, mode } = config.speedrun;
    const headless = resolvePlaywrightHeadless(process.env);
    const interpreterMode = mode;
    const needsBrowser = interpreterMode === 'playwright';

    console.log(`  Speedrun: count=${count} seed=${seed} maxIterations=${maxIterations} posture=${posture} headless=${headless}\n`);

    yield* Effect.fork(
      Effect.gen(function* () {
        const fixtureServer = needsBrowser
          ? yield* Effect.promise(() => startFixtureServer({ rootDir: config.rootDir }))
          : null;

        const browserPool = needsBrowser
          ? yield* Effect.promise(() => createPlaywrightBrowserPool({
              headless,
              config: { poolSize: 4, preWarm: true, maxPageAgeMs: 300_000 },
            }))
          : undefined;

        const baseUrl = fixtureServer?.baseUrl;
        if (baseUrl) runtimeState.setFixtureUrl(baseUrl);

        if (fixtureServer) console.log(`  Fixture server: ${fixtureServer.baseUrl}`);
        if (browserPool) console.log(`  Browser pool: 4 pages (${headless ? 'headless' : 'HEADED'})`);

        let screencastFrameCount = 0;
        const poolWithScreencast = browserPool
          ? withScreencast(browserPool, (frame) => {
              if (!runtimeState.getSnapshot().screencastActive) {
                runtimeState.setScreencastActive(true);
                wsHub.broadcastJson({ type: 'connected', data: { connected: true } });
                console.log('  CDP screencast: first frame — streaming live.');
              }
              screencastFrameCount++;
              wsHub.broadcastFrame(frame.imageBase64, frame.width, frame.height);
            }, { quality: 60, maxWidth: 1280, maxHeight: 720 })
          : undefined;

        if (browserPool) {
          console.log(`  CDP screencast: ${headless ? 'headless (may not produce frames)' : 'HEADED — live frames will stream to dashboard'}`);
        }

        const program = speedrunProgram({
          paths,
          config: DEFAULT_PIPELINE_CONFIG,
          count,
          seed,
          maxIterations,
          interpreterMode,
          knowledgePosture: posture,
          baseUrl,
          browserPool: poolWithScreencast,
          onProgress: (event) => {
            wsHub.broadcastJson({
              type: 'progress',
              timestamp: new Date().toISOString(),
              data: event,
            });
          },
        });

        try {
          yield* Effect.promise(() => runWithLocalServices(program, config.rootDir, {
            suiteRoot: paths.suiteRoot,
            dashboard: bus.dashboardPort,
            browserPool: poolWithScreencast,
          }));
          console.log(`\n  Speedrun complete. Screencast frames: ${screencastFrameCount}. Dashboard remains active.\n`);
        } finally {
          runtimeState.setScreencastActive(false);
          runtimeState.setFixtureUrl(null);
          const poolToClose = poolWithScreencast ?? browserPool;
          if (poolToClose) {
            const stats = poolToClose.stats;
            console.log(`  Browser pool stats: acquired=${stats.totalAcquired} released=${stats.totalReleased} overflow=${stats.totalOverflow} resets=${stats.totalResets}`);
            yield* Effect.promise(() => poolToClose.close());
          }
          if (fixtureServer) {
            yield* Effect.promise(() => fixtureServer.stop());
          }
        }
      }),
    );
  }

  yield* Effect.never;
});

Effect.runPromise(Effect.scoped(main)).catch((err) => {
  console.error('Dashboard server error:', err);
  process.exitCode = 1;
});
