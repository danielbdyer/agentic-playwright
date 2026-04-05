/**
 * Playback Controller — time-lapse replay of recorded event journals.
 *
 * Loads a JSONL event journal and its companion index from the REST API,
 * then replays events through the same dispatch pathway as live events
 * at variable speed. Supports seek-by-position, seek-by-iteration,
 * seek-by-act, step forward/backward, and seven predefined speed tiers.
 *
 * Architecture:
 *   fetch(journal JSONL) → parse line-by-line → event[]
 *   fetch(index JSON)    → JournalIndex (seek support)
 *   requestAnimationFrame loop → emit events at speed-adjusted timing
 *
 * Speed batching strategy (per the flywheel visualization doc):
 *   ≥ 10×: batch events that fall within the same animation frame
 *   ≥ 25×: only emit act-transition events individually; batch the rest
 */

import { useState, useRef, useEffect } from 'react';
import type { FlywheelAct } from '../types';

// ─── Journal Types (client-local; avoids cross-boundary server import) ───

/** A single journaled event — the on-disk representation loaded from JSONL. */
export interface JournaledEvent {
  readonly type: string;
  readonly timestamp: string;
  readonly sequenceNumber: number;
  readonly iteration: number;
  readonly act: FlywheelAct;
  readonly data: unknown;
}

/** Per-act slice within an iteration index entry. */
interface JournalActIndex {
  readonly act: FlywheelAct;
  readonly startSequence: number;
  readonly endSequence: number;
  readonly startTimestamp: string;
  readonly endTimestamp: string;
  readonly eventCount: number;
}

/** Per-iteration slice of the journal index. */
interface JournalIterationIndex {
  readonly iteration: number;
  readonly startSequence: number;
  readonly endSequence: number;
  readonly startTimestamp: string;
  readonly endTimestamp: string;
  readonly eventCount: number;
  readonly acts: readonly JournalActIndex[];
}

/** Top-level index for random-access seek during replay. */
interface JournalIndex {
  readonly kind: 'dashboard-event-journal-index';
  readonly version: 1;
  readonly runId: string;
  readonly totalEvents: number;
  readonly totalDurationMs: number;
  readonly iterations: readonly JournalIterationIndex[];
}

// ─── Speed Tiers ───

export interface SpeedTier {
  readonly speed: number;
  readonly label: string;
}

/** Predefined speed tiers from the flywheel visualization doc. */
export const SPEED_TIERS: readonly SpeedTier[] = [
  { speed: 0.5,  label: 'Slow motion' },
  { speed: 1,    label: 'Real-time' },
  { speed: 5,    label: 'Quick review' },
  { speed: 10,   label: 'Summary' },
  { speed: 25,   label: 'Overview' },
  { speed: 50,   label: 'Fast-forward' },
  { speed: 100,  label: 'Sprint' },
];

// ─── Playback State ───

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'seeking' | 'complete';

export interface PlaybackControllerState {
  /** Current playback state. */
  readonly state: PlaybackState;
  /** Current speed multiplier. */
  readonly speed: number;
  /** Current speed tier label. */
  readonly speedLabel: string;
  /** Playback position as fraction [0, 1]. */
  readonly position: number;
  /** Current event index. */
  readonly currentIndex: number;
  /** Total event count. */
  readonly totalEvents: number;
  /** Current iteration. */
  readonly currentIteration: number;
  /** Current act. */
  readonly currentAct: FlywheelAct;
  /** Total duration of recording in ms. */
  readonly totalDurationMs: number;
  /** Elapsed playback time in ms. */
  readonly elapsedMs: number;
  /** Controls. */
  readonly play: () => void;
  readonly pause: () => void;
  readonly setSpeed: (speed: number) => void;
  readonly nextSpeedTier: () => void;
  readonly prevSpeedTier: () => void;
  readonly seekToPosition: (fraction: number) => void;
  readonly seekToIteration: (iteration: number) => void;
  readonly seekToAct: (iteration: number, act: FlywheelAct) => void;
  readonly stepForward: () => void;
  readonly stepBackward: () => void;
  /** Load a journal from a URL. */
  readonly loadJournal: (url: string) => Promise<void>;
}

// ─── Helpers ───

/** Find the speed tier index closest to the given speed. */
function findTierIndex(speed: number): number {
  const idx = SPEED_TIERS.findIndex((t) => t.speed >= speed);
  return idx >= 0 ? idx : SPEED_TIERS.length - 1;
}

/** Compute the label for a given speed value. */
function labelForSpeed(speed: number): string {
  const tier = SPEED_TIERS.find((t) => t.speed === speed);
  return tier ? tier.label : `${speed}×`;
}

/** Determine whether an event represents an act transition relative to a prior act. */
function isActTransition(event: JournaledEvent, priorAct: FlywheelAct): boolean {
  return event.act !== priorAct;
}

/** Parse JSONL text into an array of JournaledEvent objects. */
function parseJournalLines(text: string): readonly JournaledEvent[] {
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as JournaledEvent);
}

// ─── Hook ───

export function usePlaybackController(
  onEvent: (event: JournaledEvent) => void,
  options?: {
    readonly autoPlay?: boolean;
    readonly initialSpeed?: number;
  },
): PlaybackControllerState {
  // ── Public state (triggers re-render) ──
  const [state, setState] = useState<PlaybackState>('idle');
  const [speed, setSpeedState] = useState(options?.initialSpeed ?? 1);
  const [position, setPosition] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [currentAct, setCurrentAct] = useState<FlywheelAct>(1);
  const [totalDurationMs, setTotalDurationMs] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  // ── Internal refs (no re-render on mutation) ──
  const eventsRef = useRef<readonly JournaledEvent[]>([]);
  const indexRef = useRef<JournalIndex | null>(null);
  const cursorRef = useRef(0);
  const speedRef = useRef(speed);
  const playingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);
  const onEventRef = useRef(onEvent);

  // Keep the handler ref stable to avoid re-binding effects
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // ── Sync public state from cursor ──
  const syncPublicState = (cursor: number) => {
    const events = eventsRef.current;
    const total = events.length;
    if (total === 0) return;

    const clamped = Math.max(0, Math.min(cursor, total - 1));
    const event = events[clamped]!;
    setCurrentIndex(clamped);
    setPosition(total > 1 ? clamped / (total - 1) : 0);
    setCurrentIteration(event.iteration);
    setCurrentAct(event.act);

    // Elapsed: difference between first event timestamp and current event timestamp
    const firstTs = new Date(events[0]!.timestamp).getTime();
    const currentTs = new Date(event.timestamp).getTime();
    setElapsedMs(currentTs - firstTs);
  };

  // ── Playback loop (requestAnimationFrame) ──
  const tick = (frameTime: number) => {
    if (!playingRef.current) return;

    const events = eventsRef.current;
    const total = events.length;

    if (cursorRef.current >= total) {
      playingRef.current = false;
      setState('complete');
      lastFrameTimeRef.current = null;
      return;
    }

    // Delta time since last frame (ms)
    const lastFrame = lastFrameTimeRef.current;
    const delta = lastFrame !== null ? frameTime - lastFrame : 0;
    lastFrameTimeRef.current = frameTime;

    // Skip first frame (no delta yet)
    if (lastFrame === null) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    // Accumulate scaled playback time
    const currentSpeed = speedRef.current;
    accumulatedRef.current += delta * currentSpeed;

    // Determine how many events fit within accumulated time budget
    const cursor = cursorRef.current;
    const currentEvent = events[cursor]!;
    const currentTs = new Date(currentEvent.timestamp).getTime();

    // Collect the span of events that fit within the accumulated time budget.
    // Uses a recursive step to avoid mutable array accumulation.
    const priorAct: FlywheelAct = cursor > 0 ? events[cursor - 1]!.act : currentEvent.act;

    const collectBatch = (idx: number, prior: FlywheelAct): number => {
      if (idx >= total) return idx;
      const evt = events[idx]!;
      const evtTs = new Date(evt.timestamp).getTime();
      const gap = evtTs - currentTs;

      // Check if this event falls within our time budget
      if (gap > accumulatedRef.current && idx > cursor) return idx;

      // Speed-dependent batching strategy
      if (currentSpeed >= 25) {
        // At ≥25×: only emit act-transition events individually, batch the rest
        if (isActTransition(evt, prior)) {
          onEventRef.current(evt);
        }
        return collectBatch(idx + 1, evt.act);
      } else if (currentSpeed >= 10) {
        // At ≥10×: batch events within the same frame, emit all at once
        onEventRef.current(evt);
        return collectBatch(idx + 1, evt.act);
      } else {
        // Normal speed: emit one event, then wait for next frame
        onEventRef.current(evt);
        accumulatedRef.current -= Math.max(0, gap);
        return idx + 1;
      }
    };

    const nextCursor = collectBatch(cursor, priorAct);

    // Consume time budget for events we advanced past
    if (nextCursor > cursor && nextCursor < total) {
      const lastEmittedTs = new Date(events[nextCursor - 1]!.timestamp).getTime();
      accumulatedRef.current -= Math.max(0, lastEmittedTs - currentTs);
    } else if (nextCursor > cursor) {
      accumulatedRef.current = 0;
    }

    // Advance cursor
    if (nextCursor > cursor) {
      cursorRef.current = nextCursor;
      syncPublicState(nextCursor < total ? nextCursor : total - 1);
    }

    // Check for completion
    if (nextCursor >= total) {
      playingRef.current = false;
      setState('complete');
      lastFrameTimeRef.current = null;
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
  };

  // ── Controls ──

  const play = () => {
    const events = eventsRef.current;
    if (events.length === 0) return;

    // If complete, restart from beginning
    if (cursorRef.current >= events.length) {
      cursorRef.current = 0;
      accumulatedRef.current = 0;
      syncPublicState(0);
    }

    playingRef.current = true;
    lastFrameTimeRef.current = null;
    accumulatedRef.current = 0;
    setState('playing');
    rafRef.current = requestAnimationFrame(tick);
  };

  const pause = () => {
    playingRef.current = false;
    lastFrameTimeRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setState('paused');
  };

  const setSpeed = (newSpeed: number) => {
    setSpeedState(newSpeed);
    speedRef.current = newSpeed;
  };

  const nextSpeedTier = () => {
    const idx = findTierIndex(speedRef.current);
    const next = Math.min(idx + 1, SPEED_TIERS.length - 1);
    const tier = SPEED_TIERS[next]!;
    setSpeedState(tier.speed);
    speedRef.current = tier.speed;
  };

  const prevSpeedTier = () => {
    const idx = findTierIndex(speedRef.current);
    const prev = Math.max(idx - 1, 0);
    const tier = SPEED_TIERS[prev]!;
    setSpeedState(tier.speed);
    speedRef.current = tier.speed;
  };

  const seekToPosition = (fraction: number) => {
    const events = eventsRef.current;
    if (events.length === 0) return;

    const wasPlaying = playingRef.current;
    if (wasPlaying) {
      playingRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    const clamped = Math.max(0, Math.min(1, fraction));
    const target = Math.round(clamped * (events.length - 1));
    cursorRef.current = target;
    accumulatedRef.current = 0;
    lastFrameTimeRef.current = null;
    syncPublicState(target);

    if (wasPlaying) {
      playingRef.current = true;
      setState('playing');
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  const seekToIteration = (iteration: number) => {
    const index = indexRef.current;
    const events = eventsRef.current;
    if (!index || events.length === 0) return;

    const iterEntry = index.iterations.find((it) => it.iteration === iteration);
    if (!iterEntry) return;

    // Find the event index matching the start sequence number
    const target = events.findIndex((e) => e.sequenceNumber >= iterEntry.startSequence);
    if (target < 0) return;

    const wasPlaying = playingRef.current;
    if (wasPlaying) {
      playingRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    cursorRef.current = target;
    accumulatedRef.current = 0;
    lastFrameTimeRef.current = null;
    syncPublicState(target);

    if (wasPlaying) {
      playingRef.current = true;
      setState('playing');
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  const seekToAct = (iteration: number, act: FlywheelAct) => {
    const index = indexRef.current;
    const events = eventsRef.current;
    if (!index || events.length === 0) return;

    const iterEntry = index.iterations.find((it) => it.iteration === iteration);
    if (!iterEntry) return;

    const actEntry = iterEntry.acts.find((a) => a.act === act);
    if (!actEntry) return;

    const target = events.findIndex((e) => e.sequenceNumber >= actEntry.startSequence);
    if (target < 0) return;

    const wasPlaying = playingRef.current;
    if (wasPlaying) {
      playingRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    cursorRef.current = target;
    accumulatedRef.current = 0;
    lastFrameTimeRef.current = null;
    syncPublicState(target);

    if (wasPlaying) {
      playingRef.current = true;
      setState('playing');
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  const stepForward = () => {
    const events = eventsRef.current;
    if (events.length === 0) return;

    // Pause if playing
    playingRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const next = Math.min(cursorRef.current + 1, events.length - 1);
    cursorRef.current = next;
    onEventRef.current(events[next]!);
    syncPublicState(next);

    setState(next >= events.length - 1 ? 'complete' : 'paused');
  };

  const stepBackward = () => {
    const events = eventsRef.current;
    if (events.length === 0) return;

    // Pause if playing
    playingRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const prev = Math.max(cursorRef.current - 1, 0);
    cursorRef.current = prev;
    syncPublicState(prev);

    setState('paused');
  };

  // ── Journal Loading ──

  const loadJournal = async (url: string): Promise<void> => {
    // Stop any active playback
    playingRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    setState('loading');
    cursorRef.current = 0;
    accumulatedRef.current = 0;
    lastFrameTimeRef.current = null;

    try {
      // Fetch journal JSONL and companion index in parallel
      const indexUrl = `${url}/index`;
      const [journalResponse, indexResponse] = await Promise.all([
        fetch(url),
        fetch(indexUrl),
      ]);

      if (!journalResponse.ok) {
        throw new Error(`Failed to fetch journal: ${journalResponse.status}`);
      }

      const journalText = await journalResponse.text();
      const events = parseJournalLines(journalText);
      eventsRef.current = events;

      // Parse index if available
      if (indexResponse.ok) {
        const indexData = (await indexResponse.json()) as JournalIndex;
        indexRef.current = indexData;
        setTotalDurationMs(indexData.totalDurationMs);
      } else {
        indexRef.current = null;
        // Derive duration from event timestamps
        if (events.length >= 2) {
          const firstTs = new Date(events[0]!.timestamp).getTime();
          const lastTs = new Date(events[events.length - 1]!.timestamp).getTime();
          setTotalDurationMs(lastTs - firstTs);
        } else {
          setTotalDurationMs(0);
        }
      }

      setTotalEvents(events.length);
      syncPublicState(0);

      if (events.length === 0) {
        setState('idle');
        return;
      }

      // Auto-play if configured
      if (options?.autoPlay) {
        playingRef.current = true;
        lastFrameTimeRef.current = null;
        accumulatedRef.current = 0;
        setState('playing');
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setState('paused');
      }
    } catch (err) {
      console.error('Failed to load journal:', err);
      setState('idle');
      eventsRef.current = [];
      indexRef.current = null;
      setTotalEvents(0);
      setTotalDurationMs(0);
    }
  };

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      playingRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return {
    state,
    speed,
    speedLabel: labelForSpeed(speed),
    position,
    currentIndex,
    totalEvents,
    currentIteration,
    currentAct,
    totalDurationMs,
    elapsedMs,
    play,
    pause,
    setSpeed,
    nextSpeedTier,
    prevSpeedTier,
    seekToPosition,
    seekToIteration,
    seekToAct,
    stepForward,
    stepBackward,
    loadJournal,
  };
}
