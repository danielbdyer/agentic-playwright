/**
 * Automatic Knob Search — the self-improving evolution loop as an Effect program.
 *
 * 1. Run baseline speedrun
 * 2. Read top failure mode from fitness report
 * 3. Map to implicated parameters
 * 4. Generate candidate configs
 * 5. Run speedrun for each candidate
 * 6. Accept the best candidate that beats the Pareto frontier
 * 7. Record experiment in registry
 * 8. Repeat (up to maxEpochs)
 */

import path from 'path';
import { Effect, Either, Option } from 'effect';
import type { ProjectPaths } from './paths';
import { speedrunProgram, type SpeedrunInput, type SpeedrunResult } from './speedrun';
import { mappingForFailureClass, generateCandidates, type CandidateConfig } from './knob-search';
import { updateScorecard } from './fitness';
import { recordExperiment } from './experiment-registry';
import { scorecardPath } from './improvement';
import { cleanSlateProgram } from './clean-slate';
import { FileSystem } from './ports';
import type {
  ExperimentRecord,
  ExperimentSubstrate,
  PipelineConfig,
  PipelineScorecard,
  SpeedrunProgressEvent,
  SubstrateContext,
} from '../domain/types';
import { DEFAULT_PIPELINE_CONFIG } from '../domain/types';
import { TesseractError } from '../domain/errors';

// ─── Public types ───

export interface EvolveInput {
  readonly paths: ProjectPaths;
  readonly maxEpochs: number;
  readonly seed: string;
  readonly count: number;
  readonly maxIterations: number;
  readonly substrate?: ExperimentSubstrate | undefined;
  readonly onProgress?: ((event: SpeedrunProgressEvent) => void) | undefined;
}

export interface EvolveEpochResult {
  readonly epoch: number;
  readonly baseline: SpeedrunResult;
  readonly topFailureClass: string | null;
  readonly candidatesTested: number;
  readonly bestCandidate: CandidateConfig | null;
  readonly bestResult: SpeedrunResult | null;
  readonly accepted: boolean;
}

export interface EvolveResult {
  readonly epochs: readonly EvolveEpochResult[];
  readonly finalConfig: PipelineConfig;
  readonly configDelta: Partial<PipelineConfig>;
  readonly evolvedConfigPath: string;
}

// ─── Pure helpers ───

export type CandidateDecision =
  | {
    readonly accepted: true;
    readonly bestCandidate: CandidateConfig;
    readonly bestResult: SpeedrunResult;
    readonly nextConfig: PipelineConfig;
  }
  | {
    readonly accepted: false;
    readonly bestCandidate: null;
    readonly bestResult: null;
    readonly nextConfig: PipelineConfig;
  };

export function foldTopFailureClass<A>(
  topFailureClass: Option.Option<string>,
  branches: {
    readonly onMissing: () => A;
    readonly onPresent: (failureClass: string) => A;
  },
): A {
  return Option.match(topFailureClass, {
    onNone: branches.onMissing,
    onSome: branches.onPresent,
  });
}

export function decideCandidate(
  bestCandidate: Option.Option<CandidateConfig>,
  bestResult: Option.Option<SpeedrunResult>,
  currentConfig: PipelineConfig,
): Either.Either<CandidateDecision, TesseractError> {
  const candidatePresent = Option.isSome(bestCandidate);
  const resultPresent = Option.isSome(bestResult);
  if (candidatePresent !== resultPresent) {
    return Either.left(new TesseractError('validation-error', 'Candidate/result invariant mismatch: expected both present or both absent.'));
  }
  return candidatePresent && resultPresent
    ? Either.right({
      accepted: true,
      bestCandidate: bestCandidate.value,
      bestResult: bestResult.value,
      nextConfig: bestCandidate.value.config,
    })
    : Either.right({
      accepted: false,
      bestCandidate: null,
      bestResult: null,
      nextConfig: currentConfig,
    });
}

function diffConfigs(base: PipelineConfig, current: PipelineConfig): Record<string, unknown> {
  return Object.fromEntries(
    (Object.keys(base) as (keyof PipelineConfig)[])
      .flatMap((key) => JSON.stringify(base[key]) !== JSON.stringify(current[key]) ? [[key, current[key]]] : []),
  );
}

function buildSubstrateContext(input: EvolveInput): SubstrateContext {
  return {
    substrate: input.substrate ?? 'synthetic',
    seed: input.seed,
    scenarioCount: input.count,
    screenCount: 0,
    phrasingTemplateVersion: 'v1',
  };
}

function buildExperimentRecord(
  result: SpeedrunResult,
  delta: Partial<PipelineConfig>,
  substrateContext: SubstrateContext,
  parentId: string | null,
  tag: string,
): ExperimentRecord {
  return {
    id: new Date().toISOString().replace(/[:.]/g, '-'),
    runAt: result.fitnessReport.runAt,
    pipelineVersion: result.pipelineVersion,
    baselineConfig: DEFAULT_PIPELINE_CONFIG,
    configDelta: delta,
    substrateContext,
    fitnessReport: result.fitnessReport,
    scorecardComparison: {
      improved: result.comparison.improved,
      knowledgeHitRateDelta: result.comparison.knowledgeHitRateDelta,
      translationPrecisionDelta: result.comparison.translationPrecisionDelta,
      convergenceVelocityDelta: result.comparison.convergenceVelocityDelta,
    },
    accepted: result.comparison.improved,
    tags: [tag, `epoch-${tag}`],
    parentExperimentId: parentId,
    improvementRunId: result.improvementRun.improvementRunId,
    improvementRun: result.improvementRun,
  };
}

// ─── Scorecard helpers ───

function loadScorecard(paths: ProjectPaths) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const artifactPath = scorecardPath(paths);
    const exists = yield* fs.exists(artifactPath);
    return exists ? (yield* fs.readJson(artifactPath)) as PipelineScorecard : null;
  });
}

function saveScorecard(paths: ProjectPaths, scorecard: PipelineScorecard) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const dir = path.dirname(scorecardPath(paths));
    yield* fs.ensureDir(dir);
    yield* fs.writeJson(scorecardPath(paths), scorecard);
  });
}

// ─── Single epoch step ───

function runEpoch(
  epoch: number,
  currentConfig: PipelineConfig,
  lastExperimentId: string | null,
  input: EvolveInput,
): Effect.Effect<{ readonly epochResult: EvolveEpochResult; readonly nextConfig: PipelineConfig; readonly nextExperimentId: string }, unknown, any> {
  return Effect.gen(function* () {
    const substrateContext = buildSubstrateContext(input);
    const baseInput: SpeedrunInput = {
      paths: input.paths,
      config: currentConfig,
      count: input.count,
      seed: input.seed,
      maxIterations: input.maxIterations,
      substrate: input.substrate,
      onProgress: input.onProgress,
    };

    // Step 1: Run baseline
    yield* cleanSlateProgram(input.paths.rootDir, input.paths);
    const baseline = yield* speedrunProgram(baseInput);
    const baseRecord = buildExperimentRecord(baseline, {}, substrateContext, lastExperimentId, `evolve-epoch-${epoch}-baseline`);
    yield* recordExperiment(input.paths, baseRecord);

    // Step 2: Read top failure mode
    const topFailure = Option.fromNullable(baseline.fitnessReport.failureModes[0]);
    const topFailureClass = Option.map(topFailure, (failure) => failure.class);
    const hasTopFailure = Option.isSome(topFailure);
    if (!hasTopFailure) {
      return {
        epochResult: { epoch, baseline, topFailureClass: null, candidatesTested: 0, bestCandidate: null, bestResult: null, accepted: false },
        nextConfig: currentConfig,
        nextExperimentId: baseRecord.id,
      };
    }

    // Step 3: Map to parameters
    const mapping = mappingForFailureClass(topFailure.value.class);
    if (mapping.implicatedParameters.length === 0) {
      return {
        epochResult: {
          epoch,
          baseline,
          topFailureClass: foldTopFailureClass(topFailureClass, {
            onMissing: () => null,
            onPresent: (failureClass) => failureClass,
          }),
          candidatesTested: 0,
          bestCandidate: null,
          bestResult: null,
          accepted: false,
        },
        nextConfig: currentConfig,
        nextExperimentId: baseRecord.id,
      };
    }

    // Step 4: Generate and test candidates
    const candidates = generateCandidates(currentConfig, mapping);
    let bestCandidate = Option.none<CandidateConfig>();
    let bestResult = Option.none<SpeedrunResult>();

    for (const candidate of candidates) {
      yield* cleanSlateProgram(input.paths.rootDir, input.paths);
      const result = yield* speedrunProgram({ ...baseInput, config: candidate.config });
      const record = buildExperimentRecord(result, candidate.delta, substrateContext, baseRecord.id, `evolve-epoch-${epoch}-candidate`);
      yield* recordExperiment(input.paths, record);

      if (result.comparison.improved) {
        const shouldReplaceBest = Option.match(bestResult, {
          onNone: () => true,
          onSome: (existingBest) => result.fitnessReport.metrics.knowledgeHitRate > existingBest.fitnessReport.metrics.knowledgeHitRate,
        });
        if (shouldReplaceBest) {
          bestCandidate = Option.some(candidate);
          bestResult = Option.some(result);
        }
      }
    }

    // Step 5: Accept or reject
    const decisionEither = decideCandidate(bestCandidate, bestResult, currentConfig);
    if (Either.isLeft(decisionEither)) {
      return yield* Effect.fail(decisionEither.left);
    }
    const decision = decisionEither.right;

    if (decision.accepted) {
      const existingScorecard = yield* loadScorecard(input.paths);
      const updatedScorecard = updateScorecard(decision.bestResult.fitnessReport, existingScorecard, decision.bestResult.comparison);
      yield* saveScorecard(input.paths, updatedScorecard);
    }

    return {
      epochResult: {
        epoch,
        baseline,
        topFailureClass: foldTopFailureClass(topFailureClass, {
          onMissing: () => null,
          onPresent: (failureClass) => failureClass,
        }),
        candidatesTested: candidates.length,
        bestCandidate: decision.bestCandidate,
        bestResult: decision.bestResult,
        accepted: decision.accepted,
      },
      nextConfig: decision.nextConfig,
      nextExperimentId: baseRecord.id,
    };
  });
}

// ─── Main evolution program ───

export function evolveProgram(input: EvolveInput): Effect.Effect<EvolveResult, unknown, any> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;

    const runEpochs = (
      epoch: number,
      acc: readonly EvolveEpochResult[],
      config: PipelineConfig,
      prevExperimentId: string | null,
    ): Effect.Effect<{ readonly epochs: readonly EvolveEpochResult[]; readonly finalConfig: PipelineConfig }, unknown, any> =>
      Effect.gen(function* () {
        if (epoch > input.maxEpochs) return { epochs: acc, finalConfig: config };
        const epochOutput: { readonly epochResult: EvolveEpochResult; readonly nextConfig: PipelineConfig; readonly nextExperimentId: string } = yield* runEpoch(
          epoch, config, prevExperimentId, input,
        );
        const nextAcc = [...acc, epochOutput.epochResult];
        // Stop if no failure modes or no candidate accepted
        if (!epochOutput.epochResult.topFailureClass || (!epochOutput.epochResult.accepted && epochOutput.epochResult.candidatesTested > 0)) {
          return { epochs: nextAcc, finalConfig: epochOutput.nextConfig };
        }
        return yield* runEpochs(epoch + 1, nextAcc, epochOutput.nextConfig, epochOutput.nextExperimentId);
      });

    const { epochs, finalConfig: currentConfig } = yield* runEpochs(1, [], DEFAULT_PIPELINE_CONFIG, null);

    // Save evolved config
    const configOutPath = path.join(input.paths.rootDir, '.tesseract', 'benchmarks', 'evolved-config.json');
    yield* fs.ensureDir(path.dirname(configOutPath));
    yield* fs.writeJson(configOutPath, currentConfig);

    return {
      epochs,
      finalConfig: currentConfig,
      configDelta: diffConfigs(DEFAULT_PIPELINE_CONFIG, currentConfig) as Partial<PipelineConfig>,
      evolvedConfigPath: configOutPath,
    };
  });
}
