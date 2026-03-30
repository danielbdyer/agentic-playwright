import { Effect } from 'effect';
import type { DashboardPort } from '../ports';
import { DisabledDashboard } from '../ports';
import { dashboardEvent } from '../../domain/types/dashboard';
import { elapsedSince, nowMillis } from '../time';

// Module-level mutable ref — set once by the pipeline composition layer.
// Avoids polluting the generic StageRequirements with Dashboard.
let _dashboardRef: DashboardPort = DisabledDashboard;

/** Set the dashboard port for stage-lifecycle emission. Called once at startup. */
export function setStageTracerDashboard(dashboard: DashboardPort): void {
  _dashboardRef = dashboard;
}

/** Best-effort stage-lifecycle emission via module-level ref. Never fails. */
const emitStageDashboard = (data: unknown): Effect.Effect<void> =>
  _dashboardRef.emit(dashboardEvent('stage-lifecycle', data)).pipe(
    Effect.catchAll(() => Effect.void),
  );

export interface PipelineStage<StageDependencies, StageComputed, StagePersisted, StageError, StageRequirements> {
  name: string;
  loadDependencies?: () => Effect.Effect<StageDependencies, StageError, StageRequirements>;
  compute: (dependencies: StageDependencies) => Effect.Effect<StageComputed, StageError, StageRequirements>;
  fingerprintInput?: (dependencies: StageDependencies, computed: StageComputed) => string;
  fingerprintOutput?: (dependencies: StageDependencies, computed: StageComputed) => string | null;
  persist?: (
    dependencies: StageDependencies,
    computed: StageComputed,
  ) => Effect.Effect<{ result: StagePersisted; rewritten: string[] }, StageError, StageRequirements>;
}

export interface PipelineStageRunResult<StageDependencies, StageComputed, StagePersisted> {
  dependencies: StageDependencies;
  computed: StageComputed;
  persisted: StagePersisted | null;
  rewritten: string[];
  fingerprints: {
    input: string | null;
    output: string | null;
  };
}

export function runPipelineStage<
  StageDependencies,
  StageComputed,
  StagePersisted,
  StageError = never,
  StageRequirements = never,
>(
  stage: PipelineStage<StageDependencies, StageComputed, StagePersisted, StageError, StageRequirements>,
): Effect.Effect<PipelineStageRunResult<StageDependencies, StageComputed, StagePersisted>, StageError, StageRequirements> {
  return Effect.gen(function* () {
    const stageStart = yield* nowMillis;

    yield* emitStageDashboard({ stage: stage.name, phase: 'start' });

    const dependencies = stage.loadDependencies
      ? yield* stage.loadDependencies()
      : ({} as StageDependencies);
    const computed = yield* stage.compute(dependencies);
    const persisted = stage.persist
      ? yield* stage.persist(dependencies, computed)
      : null;

    yield* emitStageDashboard({
      stage: stage.name,
      phase: 'complete',
      durationMs: yield* elapsedSince(stageStart),
      rewrittenFiles: persisted?.rewritten,
    });

    return {
      dependencies,
      computed,
      persisted: persisted?.result ?? null,
      rewritten: persisted?.rewritten ?? [],
      fingerprints: {
        input: stage.fingerprintInput?.(dependencies, computed) ?? null,
        output: stage.fingerprintOutput?.(dependencies, computed) ?? null,
      },
    };
  });
}
