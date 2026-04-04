import type {
  LearningRuntime,
  ReplayEvaluationResult,
  ReplayEvaluationSummary,
  ReplayExample,
  ReplayStepResult,
  ResolutionReceipt,
} from '../../domain/types';
import { targetKey, driftFields as computeDriftFields } from '../../domain/resolution/comparison-rules';
import { round4 } from '../learning/learning-shared';

/** Compare two resolution receipts at a step. Pure. Uses shared comparison rules. */
function compareStep(
  stepIndex: number,
  original: ResolutionReceipt | null,
  replay: ResolutionReceipt | null,
): ReplayStepResult {
  const originalSource = original?.winningSource ?? 'none';
  const replaySource = replay?.winningSource ?? 'none';
  const originalTarget = original ? targetKey(original) : 'none';
  const replayTarget = replay ? targetKey(replay) : 'none';
  const drift = computeDriftFields(original, replay);

  return {
    stepIndex,
    originalWinningSource: originalSource,
    replayWinningSource: replaySource,
    originalTarget,
    replayTarget,
    matched: drift.length === 0,
    driftFields: drift as string[],
  };
}

export function evaluateReplayExample(input: {
  readonly example: ReplayExample;
  readonly originalReceipts: readonly ResolutionReceipt[];
  readonly replayReceipts: readonly ResolutionReceipt[];
  readonly replayRunId: string;
  readonly replayKnowledgeFingerprint: string;
  readonly evaluatedAt?: string | undefined;
}): ReplayEvaluationResult {
  const maxSteps = Math.max(input.originalReceipts.length, input.replayReceipts.length);
  const stepResults: readonly ReplayStepResult[] = Array.from({ length: maxSteps }, (_, i) =>
    compareStep(i, input.originalReceipts[i] ?? null, input.replayReceipts[i] ?? null),
  );

  const matchedCount = stepResults.filter((s) => s.matched).length;
  const driftedCount = stepResults.filter((s) => !s.matched).length;

  return {
    kind: 'replay-evaluation-result',
    version: 1,
    adoId: input.example.adoId,
    runId: input.replayRunId,
    originalRunId: input.example.runId,
    taskFingerprint: input.example.taskFingerprint,
    knowledgeFingerprint: input.replayKnowledgeFingerprint,
    originalKnowledgeFingerprint: input.example.knowledgeFingerprint,
    knowledgeChanged: input.example.knowledgeFingerprint !== input.replayKnowledgeFingerprint,
    stepCount: maxSteps,
    matchedStepCount: matchedCount,
    driftedStepCount: driftedCount,
    reproducibilityScore: maxSteps === 0 ? 1 : round4(matchedCount / maxSteps),
    stepResults,
    evaluatedAt: input.evaluatedAt ?? new Date(0).toISOString(),
  };
}

export function buildReplayEvaluationSummary(input: {
  readonly results: readonly ReplayEvaluationResult[];
  readonly totalExamples: number;
  readonly generatedAt?: string | undefined;
}): ReplayEvaluationSummary {
  const evaluated = input.results.length;
  const avgScore = evaluated === 0
    ? 0
    : round4(input.results.reduce((sum, r) => sum + r.reproducibilityScore, 0) / evaluated);
  const knowledgeChangedCount = input.results.filter((r) => r.knowledgeChanged).length;
  const perfectCount = input.results.filter((r) => r.reproducibilityScore === 1).length;
  const driftedCount = input.results.filter((r) => r.driftedStepCount > 0).length;

  const runtimes: readonly LearningRuntime[] = ['decomposition', 'repair-recovery', 'workflow'];
  const byRuntime = runtimes.map((runtime) => {
    const runtimeResults = input.results.filter((r) =>
      r.adoId.length > 0,
    );
    return {
      runtime,
      count: runtimeResults.length,
      avgReproducibility: runtimeResults.length === 0
        ? 0
        : round4(runtimeResults.reduce((sum, r) => sum + r.reproducibilityScore, 0) / runtimeResults.length),
    };
  });

  return {
    kind: 'replay-evaluation-summary',
    version: 1,
    generatedAt: input.generatedAt ?? new Date(0).toISOString(),
    totalExamples: input.totalExamples,
    evaluatedExamples: evaluated,
    avgReproducibilityScore: avgScore,
    knowledgeChangedCount,
    perfectReplayCount: perfectCount,
    driftedReplayCount: driftedCount,
    byRuntime,
  };
}
