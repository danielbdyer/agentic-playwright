/**
 * Static catalogue of L4 (Layer-4) observability metric kinds.
 *
 * L4 metrics are pipeline-efficacy signals derived from execution receipts
 * by `MetricVisitor`s. The catalogue is the authoritative list — adding a
 * new metric kind here forces every consumer (visitor registry, polarity
 * map, renderer) to handle it via TypeScript exhaustiveness, by design.
 *
 * The catalogue is intentionally narrow: only metrics that the fifth-kind
 * loop (author iteration) reads as a gradient signal belong here. Internal
 * counters used by single visitors do not need a catalogue entry.
 */

// ─── L4 metric kinds ───

/** The authoritative list. Add new entries here AND register a visitor in
 *  `metric-visitor.ts` AND declare a polarity below. The TypeScript
 *  compiler enforces all three. */
export const L4_METRIC_KINDS = [
  'extraction-ratio',
  'handshake-density',
  'rung-distribution',
  'intervention-cost',
  'compounding-economics',
] as const;

export type L4MetricKind = typeof L4_METRIC_KINDS[number];

// ─── Polarity ───

/** Whether a higher value indicates better pipeline performance. */
export type MetricPolarity =
  | 'higher-is-better'
  | 'lower-is-better'
  | 'neutral';

/** Polarity for each L4 metric kind. The `Record<L4MetricKind, ...>` shape
 *  forces compile-time exhaustiveness — adding a new kind without declaring
 *  its polarity is a type error. */
export const L4_METRIC_POLARITY: Readonly<Record<L4MetricKind, MetricPolarity>> = {
  'extraction-ratio': 'higher-is-better',
  'handshake-density': 'lower-is-better',
  'rung-distribution': 'neutral',
  'intervention-cost': 'lower-is-better',
  'compounding-economics': 'higher-is-better',
};

/** Look up the polarity of an arbitrary metric kind. Returns `'neutral'`
 *  for non-L4 kinds (sub-metrics inside a tree, custom kinds, etc.). */
export function metricPolarity(kind: string): MetricPolarity {
  if ((L4_METRIC_KINDS as readonly string[]).includes(kind)) {
    return L4_METRIC_POLARITY[kind as L4MetricKind];
  }
  return 'neutral';
}

/** Type-narrowing predicate. */
export function isL4MetricKind(kind: string): kind is L4MetricKind {
  return (L4_METRIC_KINDS as readonly string[]).includes(kind);
}
