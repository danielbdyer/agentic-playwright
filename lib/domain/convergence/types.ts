import type { ImprovementLoopIteration, ImprovementLoopConvergenceReason } from '../improvement/types';
import type { RungRate, PipelineFitnessReport } from '../fitness/types';

// ─── Per-trial result ───

export interface ConvergenceTrialResult {
  readonly seed: string;
  readonly iterations: readonly ImprovementLoopIteration[];
  readonly converged: boolean;
  readonly convergenceReason: ImprovementLoopConvergenceReason;
  /** hitRate per iteration — index 0 is iteration 1. */
  readonly hitRateTrajectory: readonly number[];
  /** Cumulative proposals activated per iteration. */
  readonly proposalTrajectory: readonly number[];
  /** Unresolved step count per iteration. */
  readonly unresolvedTrajectory: readonly number[];
  readonly finalHitRate: number;
  /** last iteration hitRate minus first iteration hitRate. */
  readonly hitRateDelta: number;
  /** Resolution-by-rung from the trial's fitness report. */
  readonly resolutionByRung: readonly RungRate[];
  readonly fitnessReport: PipelineFitnessReport;
}

// ─── Cross-trial verdict ───

export interface ConvergenceVerdict {
  /** True when meanHitRateDelta > 0.01 and majority of trials show positive delta. */
  readonly converges: boolean;
  readonly meanHitRateDelta: number;
  readonly stddevHitRateDelta: number;
  readonly meanFinalHitRate: number;
  /** Median iteration index where hitRate first exceeded 90% of final value, or null. */
  readonly medianIterationsToConverge: number | null;
  /** Mean per-iteration hitRate gain across trials. */
  readonly learningContribution: number;
  /** Median finalHitRate among trials where last 2 iterations had < 1% gain, or null. */
  readonly plateauLevel: number | null;
  /** Resolution rungs that dominate unresolved steps in >50% of trials. */
  readonly bottleneckSummary: readonly string[];
  readonly confidenceLevel: 'high' | 'moderate' | 'low';
}

// ─── Aggregate proof result ───

export interface ConvergenceProofResult {
  readonly trials: readonly ConvergenceTrialResult[];
  readonly verdict: ConvergenceVerdict;
  readonly runAt: string;
  readonly pipelineVersion: string;
}

// ─── Pure builders ───

function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1));
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function buildTrialResult(
  seed: string,
  iterations: readonly ImprovementLoopIteration[],
  converged: boolean,
  convergenceReason: ImprovementLoopConvergenceReason,
  fitnessReport: PipelineFitnessReport,
): ConvergenceTrialResult {
  const hitRateTrajectory = iterations.map((it) => it.knowledgeHitRate);
  const proposalTrajectory = iterations.reduce<readonly number[]>(
    (acc, it) => [...acc, (acc[acc.length - 1] ?? 0) + it.proposalsGenerated],
    [],
  );
  const unresolvedTrajectory = iterations.map((it) => it.unresolvedStepCount);
  const first = hitRateTrajectory[0] ?? 0;
  const last = hitRateTrajectory[hitRateTrajectory.length - 1] ?? 0;

  return {
    seed,
    iterations,
    converged,
    convergenceReason,
    hitRateTrajectory,
    proposalTrajectory,
    unresolvedTrajectory,
    finalHitRate: last,
    hitRateDelta: last - first,
    resolutionByRung: fitnessReport.metrics.resolutionByRung,
    fitnessReport,
  };
}

export function buildVerdict(trials: readonly ConvergenceTrialResult[]): ConvergenceVerdict {
  const deltas = trials.map((t) => t.hitRateDelta);
  const mDelta = mean(deltas);
  const sDelta = stddev(deltas);
  const positiveCount = deltas.filter((d) => d > 0).length;
  const majorityPositive = positiveCount > trials.length / 2;

  // Learning contribution: mean per-iteration gain
  const perIterGains = trials.map((t) => {
    const steps = Math.max(t.iterations.length - 1, 1);
    return t.hitRateDelta / steps;
  });
  const learning = mean(perIterGains);

  // Plateau detection: trials where last 2 iterations had < 1% improvement
  const plateauTrials = trials.filter((t) => {
    const traj = t.hitRateTrajectory;
    if (traj.length < 2) return false;
    const lastDelta = Math.abs((traj[traj.length - 1] ?? 0) - (traj[traj.length - 2] ?? 0));
    return lastDelta < 0.01;
  });
  const plateauLevel = plateauTrials.length > 0
    ? median(plateauTrials.map((t) => t.finalHitRate))
    : null;

  // Median iterations to converge: iteration where hitRate first exceeded 90% of final
  const convergenceIterations = trials
    .map((t) => {
      const threshold = t.finalHitRate * 0.9;
      if (t.finalHitRate <= 0) return null;
      const idx = t.hitRateTrajectory.findIndex((hr) => hr >= threshold);
      return idx >= 0 ? idx + 1 : null; // 1-indexed
    })
    .filter((x): x is number => x !== null);
  const medianIters = convergenceIterations.length > 0
    ? median(convergenceIterations)
    : null;

  // Bottleneck analysis: rungs that dominate unresolved steps in >50% of trials
  const rungCounts = new Map<string, number>();
  for (const trial of trials) {
    const sorted = [...trial.resolutionByRung].sort((a, b) => b.rate - a.rate);
    const top = sorted[0];
    if (top && top.rate > 0.3) {
      rungCounts.set(top.rung, (rungCounts.get(top.rung) ?? 0) + 1);
    }
  }
  const bottleneckSummary = [...rungCounts.entries()]
    .filter(([, count]) => count > trials.length / 2)
    .sort(([, a], [, b]) => b - a)
    .map(([rung, count]) => `${rung}: dominant in ${count}/${trials.length} trials`);

  // Confidence level
  const confidenceLevel: 'high' | 'moderate' | 'low' =
    trials.length >= 5 && sDelta < 0.1 ? 'high' :
    trials.length >= 3 ? 'moderate' :
    'low';

  return {
    converges: mDelta > 0.01 && majorityPositive,
    meanHitRateDelta: mDelta,
    stddevHitRateDelta: sDelta,
    meanFinalHitRate: mean(trials.map((t) => t.finalHitRate)),
    medianIterationsToConverge: medianIters,
    learningContribution: learning,
    plateauLevel,
    bottleneckSummary,
    confidenceLevel,
  };
}
