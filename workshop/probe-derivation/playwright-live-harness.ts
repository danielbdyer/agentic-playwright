/**
 * PlaywrightLiveProbeHarness — rung-3 substrate per
 * docs/v2-probe-ir-spike.md §6.2 and the Step-6 first-principles
 * redesign.
 *
 * Composes three components:
 *   1. The synthetic substrate server (workshop/synthetic-app/server.ts).
 *   2. A real Chromium browser via launchHeadedHarness.
 *   3. A Rung3ClassifierRegistry + fallback VerbClassifierRegistry.
 *
 * Per probe:
 *   - Projects probe.worldSetup + probe.input into a WorldConfig.
 *   - Navigates the shared Playwright page to the serialized URL.
 *   - Looks up a rung-3 classifier for the verb; if found, runs it
 *     with the page injected. If not, falls through to rung 2.
 *   - Emits a receipt tagged with adapter 'playwright-live'.
 *
 * Lifecycle is scoped: `runPlaywrightLiveSpike` acquires the server
 * and browser via Effect.acquireRelease, runs the spike inside
 * Effect.scoped, and tears both down on completion. The harness
 * itself is synchronous after construction — it has no init phase.
 *
 * ## Projection: probe → WorldConfig
 *
 * The project function mines `probe.input` for a facet identifier
 * (the shape varies per verb: `facet-id`, `stable-id`, `target`,
 * etc.) and carries `probe.worldSetup` verbatim as the hook
 * dictionary. For verbs without a browser-bound input (facet-*,
 * intent-fetch), the WorldConfig is empty and the page renders the
 * `data-substrate-state="empty"` marker — the rung-2 fallback
 * classifier doesn't read the DOM anyway, so this is harmless.
 */

import { Effect, Layer } from 'effect';
import { runSpike, type SpikeVerdict } from './spike-harness';
import { ProbeHarness, type ProbeHarnessService } from './probe-harness';
import {
  lookupClassifier,
  type VerbClassifierRegistry,
} from './verb-classifier';
import {
  lookupRung3Classifier,
  type Rung3ClassifierRegistry,
} from './classifiers/rung-3/port';
import { createDefaultVerbClassifierRegistry } from './classifiers/default-registry';
import { createDefaultRung3ClassifierRegistry } from './classifiers/rung-3/registry';
import { probeReceipt } from './probe-receipt';
import type { Probe } from './probe-ir';
import type { ProbeDerivation } from './probe-ir';
import type { ProbeOutcome } from './probe-receipt';
import {
  serializeWorldConfigToUrl,
  EMPTY_WORLD_CONFIG,
  type WorldConfig,
} from '../substrate/world-config';
import { startSubstrateServer, type SubstrateServer } from '../synthetic-app/server';
import { launchHeadedHarness, type HeadedHarness } from '../../product/instruments/tooling/headed-harness';
import { fingerprintFor } from '../../product/domain/kernel/hash';
import type { Manifest } from '../../product/domain/manifest/manifest';
import type { ProbeSurfaceCohort, ProbeFacetKind, ProbeErrorFamily } from '../metrics/probe-surface-cohort';

const UNCLASSIFIED_OBSERVATION: ProbeOutcome['observed'] = {
  classification: 'ambiguous',
  errorFamily: null,
};

/** Project a probe into the substrate's WorldConfig.
 *
 *  Mines probe.input for a facet identifier. If one is found, the
 *  WorldConfig carries a single facet world-spec with that ID and
 *  probe.worldSetup as hooks. Otherwise the WorldConfig is empty
 *  (the synthetic page renders the empty marker; verbs that fall
 *  through to rung-2 classifiers don't read the DOM anyway). */
export function projectProbeToWorldConfig(probe: Probe): WorldConfig {
  const input = probe.input as Record<string, unknown> | null;
  if (input === null || typeof input !== 'object') return EMPTY_WORLD_CONFIG;
  const facetId = extractFacetId(input);
  if (facetId === null) return EMPTY_WORLD_CONFIG;
  const hooks = (probe.worldSetup ?? {}) as Record<string, unknown>;
  return { facets: [{ facetId, hooks }] };
}

function extractFacetId(input: Record<string, unknown>): string | null {
  if (typeof input['facet-id'] === 'string') return input['facet-id'];
  if (typeof input['stable-id'] === 'string') return input['stable-id'];
  return null;
}

function inferCohort(probe: Probe): ProbeSurfaceCohort {
  const input = probe.input as Record<string, unknown> | null;
  const surface = input && 'surface' in input ? (input['surface'] as Record<string, unknown> | null) : null;
  const kindRaw = surface?.['facet-kind'] ?? input?.['facet-kind'];
  const facetKind = isProbeFacetKind(kindRaw) ? kindRaw : 'element';
  const errorFamily = isProbeErrorFamily(probe.expected.errorFamily)
    ? probe.expected.errorFamily
    : null;
  return { verb: probe.verb, facetKind, errorFamily };
}

function isProbeFacetKind(value: unknown): value is ProbeFacetKind {
  return value === 'element' || value === 'state' || value === 'vocabulary' || value === 'route';
}

function isProbeErrorFamily(value: unknown): value is ProbeErrorFamily {
  return (
    value === 'not-visible' ||
    value === 'not-enabled' ||
    value === 'timeout' ||
    value === 'assertion-like' ||
    value === 'unclassified'
  );
}

export interface PlaywrightLiveProbeHarnessOptions {
  readonly appUrl: string;
  readonly harness: HeadedHarness;
  readonly rung2Registry: VerbClassifierRegistry;
  readonly rung3Registry: Rung3ClassifierRegistry;
  readonly now?: () => Date;
}

/** Compose the playwright-live harness. Synchronous — the caller
 *  has already acquired the server and the headed browser. */
export function createPlaywrightLiveProbeHarness(
  opts: PlaywrightLiveProbeHarnessOptions,
): ProbeHarnessService {
  const now = opts.now ?? (() => new Date());
  const page = opts.harness.page as {
    readonly goto: (url: string, opts?: { timeout?: number }) => Promise<unknown>;
  };
  return {
    execute: (probe: Probe) =>
      Effect.gen(function* () {
        const startedAt = now();
        const worldConfig = projectProbeToWorldConfig(probe);
        const url = serializeWorldConfigToUrl(opts.appUrl, worldConfig);
        yield* Effect.promise(() => page.goto(url, { timeout: 5_000 }));
        const rung3 = lookupRung3Classifier(opts.rung3Registry, probe.verb);
        const rung2 = lookupClassifier(opts.rung2Registry, probe.verb);
        const observed: ProbeOutcome['observed'] = rung3 !== null
          ? yield* rung3.classify(probe, opts.harness.page)
          : rung2 !== null
            ? yield* rung2.classify(probe)
            : UNCLASSIFIED_OBSERVATION;
        const completedAt = now();
        const elapsedMs = completedAt.getTime() - startedAt.getTime();
        const cohort = inferCohort(probe);
        const artifactFingerprint = fingerprintFor('artifact', {
          probeId: probe.id,
          startedAt: startedAt.toISOString(),
          adapter: 'playwright-live',
        });
        const contentFingerprint = fingerprintFor('content', {
          probeId: probe.id,
          expected: probe.expected,
          observed,
          adapter: 'playwright-live',
        });
        const fixtureFingerprint = fingerprintFor('content', {
          declaredIn: probe.declaredIn,
          fixtureName: probe.fixtureName,
          input: probe.input,
          worldSetup: probe.worldSetup,
        });
        return probeReceipt({
          probeId: probe.id,
          verb: probe.verb,
          fixtureName: probe.fixtureName,
          cohort,
          expected: probe.expected,
          observed,
          provenance: {
            adapter: 'playwright-live',
            manifestVersion: 1,
            fixtureFingerprint,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            elapsedMs,
          },
          runRecordRef: null,
          hypothesisId: null,
          artifactFingerprint,
          contentFingerprint,
        });
      }),
  };
}

// ─── Scoped lifecycle ───

function acquireServer(rootDir: string) {
  return Effect.acquireRelease(
    Effect.promise(() => startSubstrateServer({ rootDir })),
    (server: SubstrateServer) =>
      Effect.promise(() => server.stop()).pipe(Effect.catchAll(() => Effect.void)),
  );
}

function acquireBrowser(initialUrl: string) {
  return Effect.acquireRelease(
    Effect.promise(() => launchHeadedHarness({ headless: true, initialUrl })),
    (h: HeadedHarness) =>
      Effect.promise(() => h.dispose()).pipe(Effect.catchAll(() => Effect.void)),
  );
}

/** Run the spike under the playwright-live adapter. Scoped —
 *  acquires the substrate server and the headed browser, runs the
 *  spike, releases both on completion (success or failure). */
export function runPlaywrightLiveSpike(input: {
  readonly rootDir: string;
  readonly manifest: Manifest;
  readonly derivation: ProbeDerivation;
  readonly rung2Registry?: VerbClassifierRegistry;
  readonly rung3Registry?: Rung3ClassifierRegistry;
  readonly now?: () => Date;
}): Effect.Effect<SpikeVerdict, Error> {
  return Effect.scoped(
    Effect.gen(function* () {
      const server = yield* acquireServer(input.rootDir);
      const headed = yield* acquireBrowser(server.baseUrl);
      const harness = createPlaywrightLiveProbeHarness({
        appUrl: server.baseUrl,
        harness: headed,
        rung2Registry: input.rung2Registry ?? createDefaultVerbClassifierRegistry(),
        rung3Registry: input.rung3Registry ?? createDefaultRung3ClassifierRegistry(),
        ...(input.now !== undefined ? { now: input.now } : {}),
      });
      return yield* runSpike({
        manifest: input.manifest,
        derivation: input.derivation,
        ...(input.now !== undefined ? { now: input.now } : {}),
      }).pipe(Effect.provide(Layer.succeed(ProbeHarness, harness)));
    }),
  );
}
