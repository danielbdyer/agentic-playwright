/**
 * useEventJournal — bridges journal I/O with checkpoint-accelerated seeking.
 *
 * In live mode, subscribes to the WebSocket event stream and maintains
 * an in-memory event log with periodic SceneState checkpoints for fast
 * seeking. In playback mode, loads a recorded journal from the REST API
 * and uses checkpoint-accelerated seek for timeline scrubbing.
 *
 * Architecture:
 *   Live mode:
 *     WS event → append to log → checkpoint every N events → SceneState
 *     Seek: find nearest checkpoint → replay events → SceneState
 *
 *   Playback mode:
 *     usePlaybackController manages the event cursor
 *     useEventJournal provides checkpoint-accelerated state reconstruction
 *
 * The hook maintains two parallel data structures:
 *   1. An ordered list of event envelopes (the full journal)
 *   2. A sorted list of SceneState checkpoints at regular intervals
 *
 * Seeking to an arbitrary position uses binary search on checkpoints
 * followed by linear replay of events between checkpoint and target.
 *
 * @see docs/first-day-flywheel-visualization.md Part VIII, Part X Challenge 3
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import type { FlywheelAct } from '../types';
import type { DashboardEventKind } from '../../../lib/domain/types/dashboard';
import {
  accumulate,
  accumulateBatch,
  INITIAL_SCENE_STATE,
  shouldCheckpoint,
  createCheckpoint,
  findNearestCheckpoint,
  type SceneState,
  type SceneCheckpoint,
} from '../../../lib/domain/scene-state-accumulator';
import {
  detectAutoBookmarks,
  finalizeBookmarks,
  assignBookmarkSlots,
  INITIAL_DETECTION_STATE,
  type BookmarkDetectionState,
  type Bookmark,
} from '../bookmark-system';
import { deriveAct } from '../../../lib/infrastructure/dashboard/journal-writer';

// ─── Event Envelope ───

/** Minimal typed event for journal accumulation. */
export interface JournalEventEnvelope {
  readonly type: DashboardEventKind;
  readonly timestamp: string;
  readonly sequenceNumber: number;
  readonly iteration: number;
  readonly act: FlywheelAct;
  readonly data: unknown;
}

// ─── Journal State ───

export interface EventJournalState {
  /** Total events recorded. */
  readonly totalEvents: number;
  /** Current scene state (at the latest event or at the seek position). */
  readonly sceneState: SceneState;
  /** All bookmarks (auto + manual). */
  readonly bookmarks: readonly Bookmark[];
  /** Number of checkpoints created. */
  readonly checkpointCount: number;
  /** Whether the journal is actively recording (live mode). */
  readonly recording: boolean;

  /** Append a live event to the journal. */
  readonly appendEvent: (type: DashboardEventKind, timestamp: string, data: unknown, iteration: number) => void;
  /** Seek to a specific sequence number (returns reconstructed SceneState). */
  readonly seekToSequence: (targetSequence: number) => SceneState;
  /** Get the scene state at the current position. */
  readonly currentState: () => SceneState;
  /** Finalize the journal (adds "biggest improvement" bookmark, assigns slots). */
  readonly finalize: () => void;
  /** Reset the journal to empty state. */
  readonly reset: () => void;
  /** Add a manual bookmark at the current position. */
  readonly addBookmark: (label: string, slotIndex?: number | null) => void;
}

// ─── Configuration ───

export interface EventJournalOptions {
  /** Checkpoint interval (number of events between checkpoints). Default: 500. */
  readonly checkpointInterval?: number;
  /** Whether to automatically detect auto-bookmarks. Default: true. */
  readonly autoBookmarks?: boolean;
}

// ─── Hook ───

export function useEventJournal(options?: EventJournalOptions): EventJournalState {
  const checkpointInterval = options?.checkpointInterval ?? 500;
  const autoBookmarks = options?.autoBookmarks ?? true;

  // ── Mutable internal state (refs for hot-path performance) ──
  const eventsRef = useRef<JournalEventEnvelope[]>([]);
  const checkpointsRef = useRef<SceneCheckpoint[]>([]);
  const sceneStateRef = useRef<SceneState>(INITIAL_SCENE_STATE);
  const bookmarkStateRef = useRef<BookmarkDetectionState>(INITIAL_DETECTION_STATE);
  const sequenceRef = useRef(0);
  const iterationRef = useRef(0);

  // ── Public state (triggers re-render at lower frequency) ──
  const [totalEvents, setTotalEvents] = useState(0);
  const [sceneState, setSceneState] = useState<SceneState>(INITIAL_SCENE_STATE);
  const [bookmarks, setBookmarks] = useState<readonly Bookmark[]>([]);
  const [checkpointCount, setCheckpointCount] = useState(0);
  const [recording, setRecording] = useState(true);

  // ── Append a live event ──
  const appendEvent = useCallback((
    type: DashboardEventKind,
    timestamp: string,
    data: unknown,
    iteration: number,
  ) => {
    sequenceRef.current += 1;
    const seq = sequenceRef.current;

    // Track iteration
    if (type === 'iteration-start' && typeof (data as Record<string, unknown>)?.iteration === 'number') {
      iterationRef.current = (data as Record<string, unknown>).iteration as number;
    }
    const iter = iteration > 0 ? iteration : iterationRef.current;

    // Derive act from event type
    const stageHint = typeof (data as Record<string, unknown>)?.stage === 'string'
      ? (data as Record<string, unknown>).stage as string
      : typeof (data as Record<string, unknown>)?.phase === 'string'
        ? (data as Record<string, unknown>).phase as string
        : null;
    const act = deriveAct(type, stageHint);

    const envelope: JournalEventEnvelope = {
      type,
      timestamp,
      sequenceNumber: seq,
      iteration: iter,
      act,
      data,
    };

    // Append to event log (mutate ref directly for O(1) hot-path performance)
    // eslint-disable-next-line no-restricted-syntax -- ref-local mutable array; perf-critical hot path
    eventsRef.current.push(envelope);

    // Accumulate scene state
    const newState = accumulate(sceneStateRef.current, envelope);
    sceneStateRef.current = newState;

    // Checkpoint if at interval
    if (shouldCheckpoint(seq, checkpointInterval)) {
      const checkpoint = createCheckpoint(newState);
      checkpointsRef.current = [...checkpointsRef.current, checkpoint];
      setCheckpointCount(checkpointsRef.current.length);
    }

    // Auto-bookmark detection
    if (autoBookmarks) {
      const newBookmarkState = detectAutoBookmarks(bookmarkStateRef.current, envelope);
      if (newBookmarkState !== bookmarkStateRef.current) {
        bookmarkStateRef.current = newBookmarkState;
        setBookmarks(newBookmarkState.bookmarks);
      }
    }

    // Batch state updates at lower frequency (every 10 events)
    if (seq % 10 === 0 || seq <= 5) {
      setTotalEvents(seq);
      setSceneState(newState);
    }
  }, [checkpointInterval, autoBookmarks]);

  // ── Seek to a specific sequence number ──
  const seekToSequence = useCallback((targetSequence: number): SceneState => {
    const events = eventsRef.current;
    const checkpoints = checkpointsRef.current;

    if (events.length === 0 || targetSequence <= 0) {
      return INITIAL_SCENE_STATE;
    }

    // Find nearest preceding checkpoint
    const checkpoint = findNearestCheckpoint(checkpoints, targetSequence);

    // Determine starting state and starting event index
    const startState = checkpoint ? checkpoint.state : INITIAL_SCENE_STATE;
    const startSeq = checkpoint ? checkpoint.sequenceNumber : 0;

    // Find events between checkpoint and target
    const startIdx = events.findIndex((e) => e.sequenceNumber > startSeq);
    if (startIdx < 0) return startState;

    const endIdx = events.findIndex((e) => e.sequenceNumber > targetSequence);
    const sliceEnd = endIdx >= 0 ? endIdx : events.length;
    const eventsToReplay = events.slice(startIdx, sliceEnd);

    // Replay events to reconstruct state
    const reconstructed = accumulateBatch(startState, eventsToReplay);

    // Update current state
    sceneStateRef.current = reconstructed;
    setSceneState(reconstructed);

    return reconstructed;
  }, []);

  // ── Get current state ──
  const currentState = useCallback((): SceneState => {
    return sceneStateRef.current;
  }, []);

  // ── Finalize the journal ──
  const finalize = useCallback(() => {
    setRecording(false);

    // Add "biggest improvement" bookmark
    const finalized = finalizeBookmarks(bookmarkStateRef.current);
    // Assign keyboard shortcut slots
    const slotted = assignBookmarkSlots(finalized);
    bookmarkStateRef.current = slotted;
    setBookmarks(slotted.bookmarks);

    // Final state update
    setTotalEvents(eventsRef.current.length);
    setSceneState(sceneStateRef.current);
  }, []);

  // ── Reset ──
  const reset = useCallback(() => {
    eventsRef.current = [];
    checkpointsRef.current = [];
    sceneStateRef.current = INITIAL_SCENE_STATE;
    bookmarkStateRef.current = INITIAL_DETECTION_STATE;
    sequenceRef.current = 0;
    iterationRef.current = 0;
    setTotalEvents(0);
    setSceneState(INITIAL_SCENE_STATE);
    setBookmarks([]);
    setCheckpointCount(0);
    setRecording(true);
  }, []);

  // ── Add manual bookmark ──
  const addBookmark = useCallback((label: string, slotIndex: number | null = null) => {
    const events = eventsRef.current;
    if (events.length === 0) return;

    const latestEvent = events[events.length - 1]!;
    const newState = createManualBookmarkFromEvent(
      bookmarkStateRef.current,
      label,
      latestEvent,
      slotIndex,
    );
    bookmarkStateRef.current = newState;
    setBookmarks(newState.bookmarks);
  }, []);

  return {
    totalEvents,
    sceneState,
    bookmarks,
    checkpointCount,
    recording,
    appendEvent,
    seekToSequence,
    currentState,
    finalize,
    reset,
    addBookmark,
  };
}

// ─── Internal helpers ───

import { createManualBookmark } from '../bookmark-system';

function createManualBookmarkFromEvent(
  state: BookmarkDetectionState,
  label: string,
  event: JournalEventEnvelope,
  slotIndex: number | null,
): BookmarkDetectionState {
  return createManualBookmark(state, label, event, slotIndex);
}
