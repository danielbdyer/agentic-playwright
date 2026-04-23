/**
 * `tesseract compounding-improve` — computes the scoreboard and
 * surfaces a ranked gap + regression list.
 *
 * Per docs/v2-compounding-engine-plan.md §7.Z8, this command is
 * the operator-facing "what should I author next?" report:
 *
 *   - Lists probe gaps (uncovered verb × facet-kind × error-family).
 *   - Lists scenario gaps (topologies with uncovered invariants).
 *   - Lists ratchet breaks (high-priority — customer incidents
 *     regressing).
 *   - Lists the graduation gate conditions that are NOT held, with
 *     their detail strings.
 *
 * Exit code discipline (ZC28): exits 0 if no ratchet breaks;
 * exits 1 if any ratchet breaks are present (signals a regression
 * gate). Other missing conditions (not-yet state) do not fail the
 * command — they're the whole point of improvement.
 */

import { Effect } from 'effect';
import { createCommandSpec } from '../../../product/cli/shared';
import { computeScoreboard } from '../../compounding/application/compute-scoreboard';
import { createSnapshotStore } from '../../compounding/application/snapshot-store';
import {
  liveCompoundingLayer,
  defaultReceiptLogDir,
} from '../../compounding/composition/live-services';
import { deriveProbesFromDisk } from '../../probe-derivation/derive-probes';
import {
  deriveProbeTargets,
  type ProbeTarget,
} from '../../probe-derivation/probe-targets';

/** Z10b — mirrors compounding-scoreboard's loader; see its comment
 *  block for why a tempdir without a manifest falls back to []. */
function loadProbeTargetsOrEmpty(rootDir: string): readonly ProbeTarget[] {
  try {
    const { derivation } = deriveProbesFromDisk(rootDir);
    return deriveProbeTargets(derivation);
  } catch {
    return [];
  }
}

export const compoundingImproveCommand = createCommandSpec({
  flags: [] as const,
  parse: () => ({
    command: 'compounding-improve',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => {
      const layer = liveCompoundingLayer({ rootDir: paths.rootDir });
      const snapshotStore = createSnapshotStore({ logDir: defaultReceiptLogDir(paths.rootDir) });
      // Z10b — mirrors compounding-scoreboard: derive the probe
      // target set from the manifest's fixture corpus so gap +
      // coverage reporting surface real uncovered surfaces, not
      // a vacuous "no targets, therefore no gaps".
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

        const missingConditions = scoreboard.graduation.conditions.filter((c) => !c.held);
        const ratchetBreaks = scoreboard.lastRegression?.ratchetBreaks ?? [];
        return {
          graduationState: scoreboard.graduation.state,
          missingConditions: missingConditions.map((c) => ({ name: c.name, detail: c.detail })),
          probeGaps: scoreboard.gaps.probeGaps,
          scenarioGaps: scoreboard.gaps.scenarioGaps,
          ratchetBreaks,
          probeCoverageRatio: scoreboard.probeCoverageRatio,
          scenarioPassRatio: scoreboard.scenarioPassRatio,
          activeRatchetCount: scoreboard.activeRatchetCount,
          brokenRatchetCount: scoreboard.brokenRatchetCount,
          exitCode: ratchetBreaks.length > 0 ? 1 : 0,
        };
      }).pipe(Effect.provide(layer));
    },
  }),
});
