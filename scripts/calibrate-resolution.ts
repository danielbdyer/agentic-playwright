/**
 * Resolution threshold calibration report (Cycle 11 / G6).
 *
 * Prints the precision/recall/F1 of the degraded-resolution kernel
 * over the synthetic ground-truth corpus, at the committed
 * thresholds and across a sweep. This is the offline instrument
 * that turns the dominance constants from guesses into measured
 * numbers — run it before changing DOMINANCE_THRESHOLD /
 * DOMINANCE_MARGIN.
 *
 *   npx tsx scripts/calibrate-resolution.ts [--seed N] [--count N]
 */

import { generateResolutionCorpus } from '../workshop/optimization/resolution-corpus';
import { sweep, calibrate, COMMITTED_THRESHOLDS } from '../workshop/optimization/threshold-calibration';

function flag(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  const v = Number.parseInt(process.argv[i + 1] ?? '', 10);
  return Number.isInteger(v) ? v : fallback;
}

const seed = flag('--seed', 42);
const count = flag('--count', 1000);
const corpus = generateResolutionCorpus(seed, count);
const result = sweep(corpus);

const committed = result.committed;
console.log(JSON.stringify({
  corpus: { seed, count },
  committedThresholds: COMMITTED_THRESHOLDS,
  committed: {
    precision: committed.precision,
    recall: committed.recall,
    f1: committed.f1,
    matrix: committed.matrix,
  },
  bestF1: {
    thresholds: result.bestF1.thresholds,
    precision: result.bestF1.precision,
    recall: result.bestF1.recall,
    f1: result.bestF1.f1,
  },
  perDivergence: ['exact', 'reducible', 'reworded', 'zero-overlap'].map((d) => {
    const slice = corpus.filter((c) => c.axes.divergence === d);
    const r = calibrate(slice, COMMITTED_THRESHOLDS);
    return { divergence: d, n: slice.length, precision: r.precision, recall: r.recall, matrix: r.matrix };
  }),
}, null, 2));
