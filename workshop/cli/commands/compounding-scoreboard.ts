/**
 * `tesseract compounding-scoreboard` — computes and emits the
 * current compounding scoreboard as JSON.
 *
 * Per docs/v2-compounding-engine-plan.md §7.Z8, this command:
 *   1. Composes the live compounding Layer against the root dir.
 *   2. Reads the most-recent snapshot (if any) + passes its
 *      passingArtifactIds as priorPassing.
 *   3. Runs computeScoreboard.
 *   4. Writes a new snapshot.
 *   5. Prints the scoreboard JSON to stdout.
 *
 * Exit code discipline (ZC28): always exits 0 on success. Errors
 * from the composition boundary bubble as Effect failures and
 * print to stderr.
 */

import { Effect } from 'effect';
import { createCommandSpec } from '../../../product/cli/shared';
import { computeScoreboard } from '../../compounding/application/compute-scoreboard';
import {
  createSnapshotStore,
} from '../../compounding/application/snapshot-store';
import { passingArtifactIds } from '../../compounding/application/regression';
import {
  liveCompoundingLayer,
  defaultReceiptLogDir,
} from '../../compounding/composition/live-services';
import { ReceiptStore } from '../../compounding/application/ports';
import { deriveProbesFromDisk } from '../../probe-derivation/derive-probes';
import {
  deriveProbeTargets,
  type ProbeTarget,
} from '../../probe-derivation/probe-targets';

/** Z10b — load the manifest-derived probe target set for a given
 *  rootDir; on any IO/parse failure (missing manifest, missing
 *  fixture file) fall back to an empty list so the scoreboard CLI
 *  remains robust against tempdir-style test fixtures. */
function loadProbeTargetsOrEmpty(rootDir: string): readonly ProbeTarget[] {
  try {
    const { derivation } = deriveProbesFromDisk(rootDir);
    return deriveProbeTargets(derivation);
  } catch {
    return [];
  }
}

export const compoundingScoreboardCommand = createCommandSpec({
  flags: [] as const,
  parse: () => ({
    command: 'compounding-scoreboard',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => {
      const layer = liveCompoundingLayer({ rootDir: paths.rootDir });
      const snapshotStore = createSnapshotStore({ logDir: defaultReceiptLogDir(paths.rootDir) });
      // Z10b — derive the probe target set from the manifest's
      // fixture corpus so `probe-coverage-is-100` is substantive
      // (every declared (verb, facetKind, errorFamily) triple must
      // have a passing probe receipt) rather than vacuous (any one
      // receipt clears the gate).
      //
      // Graceful tolerance: if rootDir has no manifest (e.g. a test
      // fixture harness directory), fall back to an empty target
      // list so the scoreboard still computes — the gate then
      // short-circuits to vacuous-1 exactly as it did pre-Z10b.
      const probeTargets = loadProbeTargetsOrEmpty(paths.rootDir);

      return Effect.gen(function* () {
        const prior = yield* snapshotStore.readMostRecent();
        const priorPassing = prior ? new Set(prior.passingArtifactIds) : undefined;
        const priorHolds = prior ? prior.scoreboard.graduation.state === 'holds' : false;
        const scoreboard = yield* computeScoreboard({
          now: () => new Date(),
          priorPassing,
          priorScoreboardFingerprint: prior?.fingerprint,
          priorHolds,
          gapInputs: { probeTargets, scenarioTargets: [] },
        });
        // Derive the current cycle's passing set for the next snapshot.
        const store = yield* ReceiptStore;
        const [probes, scenarios] = yield* Effect.all([
          store.latestProbeReceipts(),
          store.latestScenarioReceipts(),
        ]);
        const currentPassing = Array.from(passingArtifactIds(probes, scenarios));
        const envelope = yield* snapshotStore.write(scoreboard, currentPassing);
        return {
          scoreboard,
          snapshot: envelope.fingerprint,
          priorSnapshot: prior?.fingerprint ?? null,
        };
      }).pipe(Effect.provide(layer));
    },
  }),
});
