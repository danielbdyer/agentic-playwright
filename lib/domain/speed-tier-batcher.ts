/**
 * SpeedTierBatcher — pure domain module for event batching strategy
 * per playback speed tier.
 *
 * At different playback speeds, events need different treatment:
 *
 *   0.5× - 1×:  All events animated with original/normal stagger timing
 *   5×:         Events compressed 5× — stagger reduced proportionally
 *   10×:        Minor events batched per screen, steps batched per scenario
 *   25×:        Only act transitions and iteration summaries rendered individually
 *   50×:        Only iteration boundaries; observatory + scorecard update in discrete jumps
 *   100×:       Only convergence + final scorecard
 *
 * The batcher takes a speed tier and an event stream, and decides:
 *   1. Which events to render individually (with stagger)
 *   2. Which events to batch (accumulated delta, rendered as one frame)
 *   3. Which events to skip entirely (not visible at this speed)
 *
 * Pure domain logic. No React, no side effects.
 *
 * @see docs/first-day-flywheel-visualization.md Part III: Batching Strategy
 */

// ─── Speed Tiers ───

export interface SpeedTier {
  readonly speed: number;
  readonly label: string;
  readonly staggerMultiplier: number;
  readonly batchingLevel: BatchingLevel;
}

/** How aggressively to batch events at this speed. */
export type BatchingLevel =
  | 'none'           // All events animated individually
  | 'compress'       // Stagger timing compressed
  | 'per-screen'     // Batch probes per screen, steps per scenario
  | 'act-only'       // Only act transitions individually
  | 'iteration-only' // Only iteration boundaries
  | 'convergence-only'; // Only convergence and final scorecard

export const SPEED_TIERS: readonly SpeedTier[] = [
  { speed: 0.5,  label: '0.5×',  staggerMultiplier: 2.0,  batchingLevel: 'none' },
  { speed: 1.0,  label: '1×',    staggerMultiplier: 1.0,  batchingLevel: 'none' },
  { speed: 5.0,  label: '5×',    staggerMultiplier: 0.2,  batchingLevel: 'compress' },
  { speed: 10.0, label: '10×',   staggerMultiplier: 0.1,  batchingLevel: 'per-screen' },
  { speed: 25.0, label: '25×',   staggerMultiplier: 0.04, batchingLevel: 'act-only' },
  { speed: 50.0, label: '50×',   staggerMultiplier: 0.02, batchingLevel: 'iteration-only' },
  { speed: 100.0, label: '100×', staggerMultiplier: 0.01, batchingLevel: 'convergence-only' },
] as const;

// ─── Event Classification ───

/** How an event should be handled at the current speed. */
export type EventDisposition =
  | 'render'   // Render individually with stagger
  | 'batch'    // Accumulate into batch, render as delta
  | 'skip';    // Completely invisible at this speed

/** Event importance tier for batching decisions. */
export type EventImportance =
  | 'convergence'     // Convergence-evaluated with converged=true
  | 'iteration'       // iteration-start, iteration-summary
  | 'act-transition'  // stage-lifecycle (phase transitions)
  | 'scenario-level'  // scenario-compiled, scenario-executed
  | 'step-level'      // step-bound, step-executing, step-resolved
  | 'probe-level'     // element-probed, surface-discovered
  | 'ambient';        // progress, diagnostics, etc.

/** Event type → importance mapping. Pure. */
export function classifyEventImportance(eventType: string): EventImportance {
  switch (eventType) {
    case 'convergence-evaluated':
      return 'convergence';

    case 'iteration-start':
    case 'iteration-summary':
    case 'iteration-complete':
      return 'iteration';

    case 'stage-lifecycle':
      return 'act-transition';

    case 'scenario-compiled':
    case 'scenario-executed':
    case 'suite-slice-selected':
    case 'scenario-prioritized':
    case 'trust-policy-evaluated':
    case 'knowledge-activated':
      return 'scenario-level';

    case 'step-bound':
    case 'step-executing':
    case 'step-resolved':
    case 'route-navigated':
    case 'aria-tree-captured':
      return 'step-level';

    case 'element-probed':
    case 'surface-discovered':
    case 'screen-captured':
    case 'element-escalated':
      return 'probe-level';

    default:
      return 'ambient';
  }
}

// ─── Disposition Logic ───

/** Importance threshold per batching level — events at or above threshold are rendered. */
const IMPORTANCE_ORDER: readonly EventImportance[] = [
  'convergence',
  'iteration',
  'act-transition',
  'scenario-level',
  'step-level',
  'probe-level',
  'ambient',
];

const LEVEL_THRESHOLDS: Readonly<Record<BatchingLevel, EventImportance>> = {
  'none':              'ambient',        // Everything rendered
  'compress':          'ambient',        // Everything rendered (just faster)
  'per-screen':        'step-level',     // Steps and above rendered
  'act-only':          'act-transition', // Only act transitions and above
  'iteration-only':    'iteration',      // Only iterations and above
  'convergence-only':  'convergence',    // Only convergence
};

/**
 * Determine how an event should be handled at the current speed tier.
 *
 * @param eventType The dashboard event type string
 * @param batchingLevel Current batching aggressiveness
 * @returns Disposition: render individually, batch into delta, or skip
 */
export function classifyEvent(
  eventType: string,
  batchingLevel: BatchingLevel,
): EventDisposition {
  const importance = classifyEventImportance(eventType);
  const threshold = LEVEL_THRESHOLDS[batchingLevel];

  const importanceIdx = IMPORTANCE_ORDER.indexOf(importance);
  const thresholdIdx = IMPORTANCE_ORDER.indexOf(threshold);

  // Events at or above threshold are rendered
  if (importanceIdx <= thresholdIdx) return 'render';

  // Events one level below threshold are batched
  if (importanceIdx === thresholdIdx + 1) return 'batch';

  // Everything else is skipped
  return 'skip';
}

// ─── Batch Window ───

/** A window of events accumulated for batch rendering. */
export interface EventBatch {
  readonly events: readonly BatchedEvent[];
  readonly startSequence: number;
  readonly endSequence: number;
  readonly screen: string | null; // If all events in batch are from same screen
  readonly scenarioId: string | null; // If all events are from same scenario
}

export interface BatchedEvent {
  readonly type: string;
  readonly sequenceNumber: number;
  readonly data: unknown;
}

/**
 * Group a stream of events into batches based on the current batching level.
 *
 * Events marked 'render' each get their own single-event batch.
 * Events marked 'batch' are accumulated until a 'render' event arrives
 * or the batch exceeds MAX_BATCH_SIZE.
 * Events marked 'skip' are dropped.
 *
 * @param events Raw event stream (in order)
 * @param batchingLevel Current level
 * @returns Batched event stream
 */
export function batchEvents(
  events: readonly BatchedEvent[],
  batchingLevel: BatchingLevel,
): readonly EventBatch[] {
  if (events.length === 0) return [];

  const batches: EventBatch[] = [];
  // eslint-disable-next-line no-restricted-syntax -- baseline: inherently stateful batching algorithm
  let currentBatch: BatchedEvent[] = [];
  // eslint-disable-next-line no-restricted-syntax -- baseline: inherently stateful batching algorithm
  let batchScreen: string | null = null;
  // eslint-disable-next-line no-restricted-syntax -- baseline: inherently stateful batching algorithm
  let batchScenario: string | null = null;

  const flushBatch = () => {
    if (currentBatch.length === 0) return;
    batches[batches.length] = {
      events: [...currentBatch],
      startSequence: currentBatch[0]!.sequenceNumber,
      endSequence: currentBatch[currentBatch.length - 1]!.sequenceNumber,
      screen: batchScreen,
      scenarioId: batchScenario,
    };
    currentBatch = [];
    batchScreen = null;
    batchScenario = null;
  };

  for (const event of events) {
    const disposition = classifyEvent(event.type, batchingLevel);

    if (disposition === 'skip') continue;

    if (disposition === 'render') {
      flushBatch(); // Flush any pending batch
      // Single-event batch for rendered events
      batches[batches.length] = {
        events: [event],
        startSequence: event.sequenceNumber,
        endSequence: event.sequenceNumber,
        screen: extractScreen(event.data),
        scenarioId: extractScenarioId(event.data),
      };
      continue;
    }

    // disposition === 'batch' — accumulate
    const eventScreen = extractScreen(event.data);
    const eventScenario = extractScenarioId(event.data);

    // If screen/scenario changed, flush previous batch
    if (batchingLevel === 'per-screen') {
      if (batchScreen !== null && eventScreen !== batchScreen) {
        flushBatch();
      }
    }

    currentBatch[currentBatch.length] = event;
    batchScreen = eventScreen;
    batchScenario = eventScenario;

    // Cap batch size
    if (currentBatch.length >= MAX_BATCH_SIZE) {
      flushBatch();
    }
  }

  flushBatch(); // Flush remaining
  return batches;
}

const MAX_BATCH_SIZE = 100;

// ─── Stagger Timing ───

/** Default stagger delays per event type (milliseconds at 1× speed). */
export const BASE_STAGGER_DELAYS: Readonly<Record<string, number>> = {
  'item-pending':          100,
  'element-probed':        60,
  'surface-discovered':    80,
  'route-navigated':       200,
  'aria-tree-captured':    150,
  'scenario-compiled':     120,
  'scenario-executed':     200,
  'step-bound':            40,
  'step-executing':        50,
  'step-resolved':         80,
  'trust-policy-evaluated': 100,
  'knowledge-activated':   150,
  'suite-slice-selected':  200,
  'scenario-prioritized':  100,
  'convergence-evaluated': 300,
  'iteration-summary':     200,
  'stage-lifecycle':       100,
} as const;

/**
 * Compute the stagger delay for an event at the current speed.
 *
 * @param eventType The event type
 * @param staggerMultiplier Speed-dependent multiplier from SpeedTier
 * @returns Delay in milliseconds (0 means instant)
 */
export function computeStaggerDelay(
  eventType: string,
  staggerMultiplier: number,
): number {
  const base = BASE_STAGGER_DELAYS[eventType] ?? 50;
  return Math.max(0, Math.round(base * staggerMultiplier));
}

// ─── Tier Navigation ───

/**
 * Get the next speed tier up or down.
 * Returns the same tier if already at the boundary.
 */
export function changeSpeedTier(
  currentSpeed: number,
  direction: 'up' | 'down',
): SpeedTier {
  const currentIdx = SPEED_TIERS.findIndex((t) => t.speed === currentSpeed);
  const idx = currentIdx >= 0 ? currentIdx : 1; // Default to 1× if unknown

  const nextIdx = direction === 'up'
    ? Math.min(SPEED_TIERS.length - 1, idx + 1)
    : Math.max(0, idx - 1);

  return SPEED_TIERS[nextIdx]!;
}

// ─── Data Extraction Helpers ───

function extractScreen(data: unknown): string | null {
  if (typeof data === 'object' && data !== null && 'screen' in data) {
    return typeof (data as Record<string, unknown>).screen === 'string'
      ? (data as Record<string, unknown>).screen as string
      : null;
  }
  return null;
}

function extractScenarioId(data: unknown): string | null {
  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>;
    if (typeof d.adoId === 'string') return d.adoId;
    if (typeof d.scenarioId === 'string') return d.scenarioId;
  }
  return null;
}
