/**
 * Compounding scoreboard projection — read-only dashboard view.
 *
 * Per docs/v2-compounding-engine-plan.md §7.Z10, the dashboard
 * reads the most-recent scoreboard snapshot written by the
 * compounding engine (workshop/logs/scoreboard-snapshots/) and
 * projects it into a dashboard-friendly shape:
 *
 *   - graduation panel (state + missing conditions)
 *   - coverage + pass-ratio gauges
 *   - trajectory list (per cohort)
 *   - gap list (probe + scenario)
 *   - ratchet status (active / broken)
 *
 * The projection is PURE — it does not touch the filesystem;
 * callers hand it a snapshot envelope. The dashboard server
 * composes snapshot reads (via the workshop logs seam) then
 * calls projectCompoundingScoreboard.
 *
 * No Effect imports; pure function.
 */

import type {
  CompoundingScoreboard,
} from '../../../workshop/compounding/domain/scoreboard';
import type { SnapshotEnvelope } from '../../../workshop/compounding/application/snapshot-store';
import type { GraduationCondition } from '../../../workshop/compounding/domain/graduation';

export interface CompoundingScoreboardProjection {
  readonly generatedAt: string;
  readonly substrateVersion: string;
  readonly graduationPanel: {
    readonly state: 'holds' | 'not-yet' | 'regressed';
    readonly missingConditions: readonly string[];
    readonly conditions: readonly GraduationCondition[];
  };
  readonly gauges: {
    readonly probeCoverageRatio: number;
    readonly scenarioPassRatio: number;
  };
  readonly trajectoryPanels: readonly {
    readonly cohortId: string;
    readonly entryCount: number;
    readonly latestRate: number | null;
  }[];
  readonly gapPanel: {
    readonly probeGapCount: number;
    readonly scenarioGapCount: number;
    readonly topProbeGaps: readonly { readonly verb: string; readonly facetKind: string; readonly errorFamily: string | null }[];
    readonly topScenarioGaps: readonly { readonly topologyId: string; readonly uncoveredInvariants: readonly string[] }[];
  };
  readonly ratchetPanel: {
    readonly active: number;
    readonly broken: number;
    readonly breakDetails: readonly {
      readonly ratchetId: string;
      readonly scenarioId: string;
      readonly firstPassedAt: string;
      readonly brokenAt: string;
    }[];
  };
  readonly snapshotFingerprint: string | null;
}

export function projectCompoundingScoreboard(
  envelope: SnapshotEnvelope | null,
  options: { readonly topN?: number } = {},
): CompoundingScoreboardProjection | null {
  if (envelope === null) return null;
  return projectCompoundingScoreboardFromBoard(envelope.scoreboard, {
    topN: options.topN,
    snapshotFingerprint: envelope.fingerprint,
  });
}

export function projectCompoundingScoreboardFromBoard(
  scoreboard: CompoundingScoreboard,
  options: { readonly topN?: number; readonly snapshotFingerprint?: string } = {},
): CompoundingScoreboardProjection {
  const topN = options.topN ?? 5;

  const trajectoryPanels = scoreboard.trajectories.map((t) => {
    const latest = t.entries[t.entries.length - 1] ?? null;
    return {
      cohortId: t.cohortId,
      entryCount: t.entries.length,
      latestRate: latest?.rate ?? null,
    };
  });

  const gapPanel = {
    probeGapCount: scoreboard.gaps.probeGaps.length,
    scenarioGapCount: scoreboard.gaps.scenarioGaps.length,
    topProbeGaps: scoreboard.gaps.probeGaps.slice(0, topN),
    topScenarioGaps: scoreboard.gaps.scenarioGaps.slice(0, topN).map((g) => ({
      topologyId: g.topologyId,
      uncoveredInvariants: g.uncoveredInvariants,
    })),
  };

  const ratchetPanel = {
    active: scoreboard.activeRatchetCount,
    broken: scoreboard.brokenRatchetCount,
    breakDetails:
      scoreboard.lastRegression?.ratchetBreaks.map((r) => ({
        ratchetId: r.ratchetId,
        scenarioId: r.scenarioId,
        firstPassedAt: r.firstPassedAt,
        brokenAt: r.brokenAt,
      })) ?? [],
  };

  return {
    generatedAt: scoreboard.generatedAt,
    substrateVersion: scoreboard.substrateVersion,
    graduationPanel: {
      state: scoreboard.graduation.state,
      missingConditions: scoreboard.graduation.missingConditions,
      conditions: scoreboard.graduation.conditions,
    },
    gauges: {
      probeCoverageRatio: scoreboard.probeCoverageRatio,
      scenarioPassRatio: scoreboard.scenarioPassRatio,
    },
    trajectoryPanels,
    gapPanel,
    ratchetPanel,
    snapshotFingerprint: options.snapshotFingerprint ?? null,
  };
}
