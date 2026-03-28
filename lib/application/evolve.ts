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
import { Effect } from 'effect';
import type { ProjectPaths } from './paths';
import { speedrunProgram, type SpeedrunInput, type SpeedrunResult } from './speedrun';
import { mappingForFailureClass, generateCandidates, type CandidateConfig } from './knob-search';
import { updateScorecard } from './fitness';
import { recordExperiment } from './experiment-registry';
import { scorecardPath } from './improvement';
import { cleanSlateProgram } from './clean-slate';
import { FileSystem, VersionControl } from './ports';
import type {
  ExperimentRecord,
  ExperimentSubstrate,
  PipelineConfig,
  PipelineScorecard,
  SpeedrunProgressEvent,
  SubstrateContext,
} from '../domain/types';
import { DEFAULT_PIPELINE_CONFIG } from '../domain/types';

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

function diffConfigs(base: PipelineConfig, current: PipelineConfig): Record<string, unknown> {
  return Object.fromEntries(
    (Object.keys(base) as (keyof PipelineConfig)[])
      .filter((key) => JSON.stringify(base[key]) !== JSON.stringify(current[key]))
      .map((key) => [key, current[key]]),
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
    const topFailure = baseline.fitnessReport.failureModes[0] ?? null;
    if (!topFailure) {
      return {
        epochResult: { epoch, baseline, topFailureClass: null, candidatesTested: 0, bestCandidate: null, bestResult: null, accepted: false },
        nextConfig: currentConfig,
        nextExperimentId: baseRecord.id,
      };
    }

    // Step 3: Map to parameters
    const mapping = mappingForFailureClass(topFailure.class);
    if (mapping.implicatedParameters.length === 0) {
      return {
        epochResult: { epoch, baseline, topFailureClass: topFailure.class, candidatesTested: 0, bestCandidate: null, bestResult: null, accepted: false },
        nextConfig: currentConfig,
        nextExperimentId: baseRecord.id,
      };
    }

    // Step 4: Generate and test candidates
    const candidates = generateCandidates(currentConfig, mapping);
    let bestCandidate: CandidateConfig | null = null;
    let bestResult: SpeedrunResult | null = null;

    for (const candidate of candidates) {
      yield* cleanSlateProgram(input.paths.rootDir, input.paths);
      const result = yield* speedrunProgram({ ...baseInput, config: candidate.config });
      const record = buildExperimentRecord(result, candidate.delta, substrateContext, baseRecord.id, `evolve-epoch-${epoch}-candidate`);
      yield* recordExperiment(input.paths, record);

      if (result.comparison.improved) {
        if (!bestResult || result.fitnessReport.metrics.knowledgeHitRate > bestResult.fitnessReport.metrics.knowledgeHitRate) {
          bestCandidate = candidate;
          bestResult = result;
        }
      }
    }

    // Step 5: Accept or reject
    const accepted = bestCandidate !== null && bestResult !== null;
    const nextConfig = accepted ? bestCandidate!.config : currentConfig;

    if (accepted) {
      const existingScorecard = yield* loadScorecard(input.paths);
      const updatedScorecard = updateScorecard(bestResult!.fitnessReport, existingScorecard, bestResult!.comparison);
      yield* saveScorecard(input.paths, updatedScorecard);
    }

    return {
      epochResult: {
        epoch,
        baseline,
        topFailureClass: topFailure.class,
        candidatesTested: candidates.length,
        bestCandidate,
        bestResult,
        accepted,
      },
      nextConfig,
      nextExperimentId: baseRecord.id,
    };
  });
}

// ─── Main evolution program ───

export function evolveProgram(input: EvolveInput): Effect.Effect<EvolveResult, unknown, any> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const epochs: EvolveEpochResult[] = [];
    let currentConfig: PipelineConfig = DEFAULT_PIPELINE_CONFIG;
    let lastExperimentId: string | null = null;

    for (let epoch = 1; epoch <= input.maxEpochs; epoch++) {
      const epochOutput: { readonly epochResult: EvolveEpochResult; readonly nextConfig: PipelineConfig; readonly nextExperimentId: string } = yield* runEpoch(
        epoch, currentConfig, lastExperimentId, input,
      );
      epochs.push(epochOutput.epochResult);
      currentConfig = epochOutput.nextConfig;
      lastExperimentId = epochOutput.nextExperimentId;

      // Stop if no failure modes or no candidate accepted
      if (!epochOutput.epochResult.topFailureClass || (!epochOutput.epochResult.accepted && epochOutput.epochResult.candidatesTested > 0)) {
        break;
      }
    }

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
