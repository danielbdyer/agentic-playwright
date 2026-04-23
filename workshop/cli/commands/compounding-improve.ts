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

export const compoundingImproveCommand = createCommandSpec({
  flags: [] as const,
  parse: () => ({
    command: 'compounding-improve',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => {
      const layer = liveCompoundingLayer({ rootDir: paths.rootDir });
      const snapshotStore = createSnapshotStore({ logDir: defaultReceiptLogDir(paths.rootDir) });

      return Effect.gen(function* () {
        const prior = yield* snapshotStore.readMostRecent();
        const priorPassing = prior ? new Set(prior.passingArtifactIds) : undefined;
        const priorHolds = prior ? prior.scoreboard.graduation.state === 'holds' : false;
        const scoreboard = yield* computeScoreboard({
          now: () => new Date(),
          priorPassing,
          priorScoreboardFingerprint: prior?.fingerprint,
          priorHolds,
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
