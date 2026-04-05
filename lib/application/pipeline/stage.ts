import { Effect } from 'effect';
import { enrichEventDataWithExecutionContext, withExecutionContext } from '../commitment/execution-context';
import { StageTracer } from '../ports';

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
): Effect.Effect<PipelineStageRunResult<StageDependencies, StageComputed, StagePersisted>, StageError, StageRequirements | StageTracer> {
  return withExecutionContext({ stage: stage.name })(Effect.gen(function* () {
    const stageStart = Date.now();
    const stageTracer = yield* StageTracer;

    yield* Effect.flatMap(
      enrichEventDataWithExecutionContext({ stage: stage.name, phase: 'start' }),
      (data) => stageTracer.emitStageStart(data),
    );

    const dependencies = stage.loadDependencies
      ? yield* stage.loadDependencies()
      : ({} as StageDependencies);
    const computed = yield* stage.compute(dependencies);
    const persisted = stage.persist
      ? yield* stage.persist(dependencies, computed)
      : null;

    yield* Effect.flatMap(
      enrichEventDataWithExecutionContext({
        stage: stage.name,
        phase: 'complete',
        durationMs: Date.now() - stageStart,
        rewrittenFiles: persisted?.rewritten,
      }),
      (data) => stageTracer.emitStageComplete(data),
    );

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
  }));
}
