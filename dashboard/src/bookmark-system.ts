/**
 * Bookmark System — auto-bookmarks and manual bookmarks for flywheel time-lapse.
 *
 * The bookmark system marks significant moments during recording and playback:
 *
 * Auto-bookmarks (triggered by event detection):
 *   - First element discovered
 *   - First scenario compiled
 *   - First test passed
 *   - First proposal activated
 *   - First human decision (fiber-paused)
 *   - Each iteration boundary
 *   - Convergence achieved
 *   - Largest hit-rate jump
 *
 * Manual bookmarks (operator-triggered via keyboard or UI):
 *   - Stored with user-provided label, position, and scene snapshot
 *
 * Architecture:
 *   Event stream → detectAutoBookmarks(event, priorBookmarks) → Bookmark[]
 *   Operator action → createManualBookmark(position, label) → Bookmark
 *   Bookmarks persist in memory during a session and are serialized
 *   alongside the journal index for replay navigation.
 *
 * This module is pure domain logic. No React, no Three.js, no filesystem.
 *
 * @see docs/first-day-flywheel-visualization.md Part III: Bookmark System
 */

import type { DashboardEventKind } from '../../lib/domain/observation/dashboard';
import type { FlywheelAct } from '../../lib/domain/projection/scene-state-accumulator';

// ─── Bookmark Types ───

export type BookmarkKind = 'auto' | 'manual';

/** A bookmark marking a significant moment in the event journal. */
export interface Bookmark {
  readonly id: string;
  readonly kind: BookmarkKind;
  readonly label: string;
  readonly sequenceNumber: number;
  readonly timestamp: string;
  readonly iteration: number;
  readonly act: FlywheelAct;
  /** Human-readable shortcut key for jump-to (Ctrl+1 through Ctrl+9). */
  readonly slotIndex: number | null;
}

/** Auto-bookmark trigger definitions. */
export interface AutoBookmarkTrigger {
  readonly triggerId: string;
  readonly label: string;
  /** Predicate that checks if an event should trigger this bookmark. */
  readonly matches: (eventType: DashboardEventKind, data: Record<string, unknown>) => boolean;
  /** Whether this trigger fires only once (first occurrence). */
  readonly onceOnly: boolean;
}

// ─── Auto-Bookmark Trigger Registry ───

export const AUTO_BOOKMARK_TRIGGERS: readonly AutoBookmarkTrigger[] = [
  {
    triggerId: 'first-element-discovered',
    label: 'First discovery',
    matches: (type) => type === 'element-probed',
    onceOnly: true,
  },
  {
    triggerId: 'first-scenario-compiled',
    label: 'First compilation',
    matches: (type) => type === 'scenario-compiled',
    onceOnly: true,
  },
  {
    triggerId: 'first-green-test',
    label: 'First green test',
    matches: (type, data) =>
      type === 'scenario-executed' && data.passed === true,
    onceOnly: true,
  },
  {
    triggerId: 'first-knowledge-activation',
    label: 'First knowledge activation',
    matches: (type) => type === 'knowledge-activated',
    onceOnly: true,
  },
  {
    triggerId: 'first-human-intervention',
    label: 'First human intervention',
    matches: (type) => type === 'fiber-paused',
    onceOnly: true,
  },
  {
    triggerId: 'iteration-boundary',
    label: 'Iteration start',
    matches: (type) => type === 'iteration-start',
    onceOnly: false,
  },
  {
    triggerId: 'convergence-achieved',
    label: 'Convergence',
    matches: (type, data) =>
      type === 'convergence-evaluated' && data.converged === true,
    onceOnly: true,
  },
] as const;

// ─── Bookmark Detection State ───

/**
 * Immutable state tracking which auto-bookmark triggers have already fired.
 * Passed through the event stream to detect new auto-bookmarks.
 */
export interface BookmarkDetectionState {
  /** Set of trigger IDs that have already fired (for once-only triggers). */
  readonly firedTriggerIds: ReadonlySet<string>;
  /** All bookmarks detected so far. */
  readonly bookmarks: readonly Bookmark[];
  /** Counter for generating unique bookmark IDs. */
  readonly nextId: number;
  /** Highest hit-rate delta seen (for "largest improvement" detection). */
  readonly maxHitRateDelta: number;
  /** Sequence number of the event with the largest hit-rate delta. */
  readonly maxDeltaSequence: number | null;
  /** Timestamp of the event with the largest hit-rate delta. */
  readonly maxDeltaTimestamp: string | null;
  /** Iteration of the event with the largest hit-rate delta. */
  readonly maxDeltaIteration: number;
}

/** Initial empty detection state. */
export const INITIAL_DETECTION_STATE: BookmarkDetectionState = {
  firedTriggerIds: new Set(),
  bookmarks: [],
  nextId: 1,
  maxHitRateDelta: 0,
  maxDeltaSequence: null,
  maxDeltaTimestamp: null,
  maxDeltaIteration: 0,
};

// ─── Event Envelope (mirrors scene-state-accumulator) ───

interface EventEnvelope {
  readonly type: DashboardEventKind;
  readonly timestamp: string;
  readonly sequenceNumber: number;
  readonly iteration: number;
  readonly act: FlywheelAct;
  readonly data: unknown;
}

// ─── Pure Detection Functions ───

/**
 * O(k). Detect auto-bookmarks from a single event.
 *
 * Scans all registered triggers against the event. For once-only triggers,
 * checks if the trigger has already fired. Returns a new detection state
 * with any newly created bookmarks appended.
 *
 * Also tracks the largest hit-rate delta for the "biggest improvement"
 * bookmark, which is resolved at the end of the run via `finalize()`.
 *
 * @param state  Current detection state
 * @param event  The event to check
 * @returns New detection state (same reference if no changes)
 */
export function detectAutoBookmarks(
  state: BookmarkDetectionState,
  event: EventEnvelope,
): BookmarkDetectionState {
  const data = (event.data ?? {}) as Record<string, unknown>;

  // Check for largest hit-rate delta tracking
  const updatedDeltaState = trackHitRateDelta(state, event, data);

  // Check all triggers
  const matchedTriggers = AUTO_BOOKMARK_TRIGGERS.filter((trigger) => {
    // Skip if already fired (once-only)
    if (trigger.onceOnly && updatedDeltaState.firedTriggerIds.has(trigger.triggerId)) {
      return false;
    }
    return trigger.matches(event.type, data);
  });

  if (matchedTriggers.length === 0) return updatedDeltaState;

  // Create bookmarks for matched triggers
  const newFiredIds = new Set(updatedDeltaState.firedTriggerIds);
  const newBookmarks: readonly Bookmark[] = matchedTriggers.map((trigger, i) => {
    newFiredIds.add(trigger.triggerId);

    // For iteration-boundary, customize label with iteration number
    const label = trigger.triggerId === 'iteration-boundary'
      ? `Iteration ${event.iteration} start`
      : trigger.label;

    return {
      id: `auto-${updatedDeltaState.nextId + i}`,
      kind: 'auto' as const,
      label,
      sequenceNumber: event.sequenceNumber,
      timestamp: event.timestamp,
      iteration: event.iteration,
      act: event.act,
      slotIndex: null,
    };
  });

  return {
    ...updatedDeltaState,
    firedTriggerIds: newFiredIds,
    bookmarks: [...updatedDeltaState.bookmarks, ...newBookmarks],
    nextId: updatedDeltaState.nextId + newBookmarks.length,
  };
}

/** Track the convergence event with the largest hit-rate delta. */
function trackHitRateDelta(
  state: BookmarkDetectionState,
  event: EventEnvelope,
  data: Record<string, unknown>,
): BookmarkDetectionState {
  if (event.type !== 'convergence-evaluated') return state;

  const delta = typeof data.delta === 'number' ? data.delta : 0;
  if (delta <= state.maxHitRateDelta) return state;

  return {
    ...state,
    maxHitRateDelta: delta,
    maxDeltaSequence: event.sequenceNumber,
    maxDeltaTimestamp: event.timestamp,
    maxDeltaIteration: event.iteration,
  };
}

/**
 * Finalize detection state by adding the "biggest improvement" bookmark.
 *
 * Call after all events have been processed (at end of run or journal load).
 * Adds the bookmark for the iteration with the largest hit-rate delta,
 * if one was detected.
 *
 * @param state  Final detection state
 * @returns New state with "biggest improvement" bookmark appended
 */
export function finalizeBookmarks(state: BookmarkDetectionState): BookmarkDetectionState {
  if (state.maxDeltaSequence === null || state.maxHitRateDelta === 0) return state;

  // Don't duplicate if already exists
  if (state.bookmarks.some((b) => b.label.startsWith('Biggest improvement'))) return state;

  const deltaPercent = Math.round(state.maxHitRateDelta * 100);
  const bookmark: Bookmark = {
    id: `auto-${state.nextId}`,
    kind: 'auto',
    label: `Biggest improvement (+${deltaPercent}%)`,
    sequenceNumber: state.maxDeltaSequence,
    timestamp: state.maxDeltaTimestamp!,
    iteration: state.maxDeltaIteration,
    act: 7,
    slotIndex: null,
  };

  return {
    ...state,
    bookmarks: [...state.bookmarks, bookmark],
    nextId: state.nextId + 1,
  };
}

/**
 * Create a manual bookmark at the given position.
 *
 * @param state  Current detection state
 * @param label  User-provided label
 * @param event  Current event envelope for position context
 * @param slotIndex  Optional keyboard shortcut slot (1-9)
 * @returns New state with manual bookmark appended
 */
export function createManualBookmark(
  state: BookmarkDetectionState,
  label: string,
  event: EventEnvelope,
  slotIndex: number | null = null,
): BookmarkDetectionState {
  const bookmark: Bookmark = {
    id: `manual-${state.nextId}`,
    kind: 'manual',
    label,
    sequenceNumber: event.sequenceNumber,
    timestamp: event.timestamp,
    iteration: event.iteration,
    act: event.act,
    slotIndex,
  };

  return {
    ...state,
    bookmarks: [...state.bookmarks, bookmark],
    nextId: state.nextId + 1,
  };
}

/**
 * Find a bookmark by slot index (for Ctrl+1 through Ctrl+9 navigation).
 *
 * @param state  Current detection state
 * @param slot   Slot index (1-9)
 * @returns The bookmark at that slot, or null
 */
export function findBookmarkBySlot(
  state: BookmarkDetectionState,
  slot: number,
): Bookmark | null {
  return state.bookmarks.find((b) => b.slotIndex === slot) ?? null;
}

/**
 * Assign keyboard shortcut slots to auto-bookmarks in order of sequence.
 *
 * Assigns slots 1-9 to the first 9 bookmarks (prioritizing milestones).
 * Manual bookmarks with explicit slots are preserved.
 *
 * @param state  Current detection state
 * @returns New state with slots assigned
 */
export function assignBookmarkSlots(state: BookmarkDetectionState): BookmarkDetectionState {
  // Separate manual bookmarks with explicit slots
  const explicitSlots = new Set(
    state.bookmarks
      .filter((b) => b.slotIndex !== null)
      .map((b) => b.slotIndex!),
  );

  // Priority order for auto-slot assignment
  const PRIORITY_LABELS = [
    'Convergence',
    'First green test',
    'First discovery',
    'First knowledge activation',
    'First compilation',
    'First human intervention',
    'Biggest improvement',
  ];

  const LOWEST_PRIORITY = PRIORITY_LABELS.length;

  const sorted = [...state.bookmarks]
    .filter((b) => b.slotIndex === null)
    .sort((a, b) => {
      const aIdx = PRIORITY_LABELS.indexOf(a.label);
      const bIdx = PRIORITY_LABELS.indexOf(b.label);
      const aPri = aIdx >= 0 ? aIdx : LOWEST_PRIORITY;
      const bPri = bIdx >= 0 ? bIdx : LOWEST_PRIORITY;
      return aPri !== bPri ? aPri - bPri : a.sequenceNumber - b.sequenceNumber;
    });

  const assignments = new Map<string, number>();
  let nextSlot = 1;

  for (const bookmark of sorted) {
    while (nextSlot <= 9 && explicitSlots.has(nextSlot)) {
      nextSlot += 1;
    }
    if (nextSlot > 9) break;
    assignments.set(bookmark.id, nextSlot);
    nextSlot += 1;
  }

  const updatedBookmarks = state.bookmarks.map((b) => {
    const slot = assignments.get(b.id);
    return slot !== undefined ? { ...b, slotIndex: slot } : b;
  });

  return { ...state, bookmarks: updatedBookmarks };
}
