/**
 * Static catalogue of pipeline-efficacy observability metric kinds.
 *
 * Pipeline metrics are efficacy signals derived from execution receipts
 * by `MetricVisitor`s. The catalogue is the authoritative list — adding a
 * new metric kind here forces every consumer (visitor registry, polarity
 * map, renderer) to handle it via TypeScript exhaustiveness, by design.
 *
 * The catalogue is intentionally narrow: only metrics that the fifth-kind
 * loop (author iteration) reads as a gradient signal belong here. Internal
 * counters used by single visitors do not need a catalogue entry.
 */

// ─── pipeline metric kinds ───

/** The authoritative list. Add new entries here AND register a visitor in
 *  `metric-visitor.ts` AND declare a polarity below. The TypeScript
 *  compiler enforces all three. */
export const PIPELINE_METRIC_KINDS = [
  'extraction-ratio',
  'handshake-density',
  'rung-distribution',
  'intervention-cost',
  'compounding-economics',
  'memory-worthiness-ratio',
  'intervention-marginal-value',
] as const;

export type PipelineMetricKind = typeof PIPELINE_METRIC_KINDS[number];

// ─── Polarity ───

/** Whether a higher value indicates better pipeline performance. */
export type MetricPolarity =
  | 'higher-is-better'
  | 'lower-is-better'
  | 'neutral';

/** Polarity for each pipeline metric kind. The `Record<PipelineMetricKind, ...>` shape
 *  forces compile-time exhaustiveness — adding a new kind without declaring
 *  its polarity is a type error. */
export const PIPELINE_METRIC_POLARITY: Readonly<Record<PipelineMetricKind, MetricPolarity>> = {
  'extraction-ratio': 'higher-is-better',
  'handshake-density': 'lower-is-better',
  'rung-distribution': 'neutral',
  'intervention-cost': 'lower-is-better',
  'compounding-economics': 'higher-is-better',
  'memory-worthiness-ratio': 'higher-is-better',
  'intervention-marginal-value': 'higher-is-better',
};

/** Look up the polarity of an arbitrary metric kind. Returns `'neutral'`
 *  for non-pipeline kinds (sub-metrics inside a tree, custom kinds, etc.). */
export function metricPolarity(kind: string): MetricPolarity {
  if ((PIPELINE_METRIC_KINDS as readonly string[]).includes(kind)) {
    return PIPELINE_METRIC_POLARITY[kind as PipelineMetricKind];
  }
  return 'neutral';
}

/** Type-narrowing predicate. */
export function isPipelineMetricKind(kind: string): kind is PipelineMetricKind {
  return (PIPELINE_METRIC_KINDS as readonly string[]).includes(kind);
}
