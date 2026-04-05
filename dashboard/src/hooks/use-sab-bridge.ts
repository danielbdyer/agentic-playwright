/**
 * W3.2: SharedArrayBuffer zero-copy bridge — wires usePipelineBuffer
 * to the dashboard's dispatch table so high-frequency events flow
 * through the ring buffer instead of JSON-over-WebSocket.
 *
 * The bridge polls the SAB each animation frame (via requestAnimationFrame)
 * and dispatches decoded BufferEvents into the same dispatch targets that
 * the WebSocket path uses. This eliminates serialization/deserialization
 * and GC pressure for the hot path.
 *
 * Pure mapping layer: converts numeric ordinals back to typed dispatch calls.
 */

import { useRef, useEffect } from 'react';
import { usePipelineBuffer, EVENT_TYPES, type BufferEvent } from './use-pipeline-buffer';

// ─── Ordinal-to-dispatch mapping (pure, no side effects) ───

/** Map numeric event type ordinals to dispatch event names.
 *  Inverse of EVENT_TYPE_ORDINALS in pipeline-event-bus.ts. */
const ORDINAL_TO_EVENT_NAME: Readonly<Record<number, string>> = {
  [EVENT_TYPES.ELEMENT_PROBED]: 'element-probed',
  [EVENT_TYPES.ELEMENT_ESCALATED]: 'element-escalated',
  [EVENT_TYPES.SCREEN_CAPTURED]: 'screen-captured',
  [EVENT_TYPES.ITERATION_START]: 'iteration-start',
  [EVENT_TYPES.ITERATION_COMPLETE]: 'iteration-complete',
  [EVENT_TYPES.PROGRESS]: 'progress',
  [EVENT_TYPES.RUNG_SHIFT]: 'rung-shift',
  [EVENT_TYPES.CALIBRATION_UPDATE]: 'calibration-update',
  [EVENT_TYPES.PROPOSAL_ACTIVATED]: 'proposal-activated',
  [EVENT_TYPES.CONFIDENCE_CROSSED]: 'confidence-crossed',
  [EVENT_TYPES.ARTIFACT_WRITTEN]: 'artifact-written',
  [EVENT_TYPES.STAGE_LIFECYCLE]: 'stage-lifecycle',
} as const;

/** Map governance ordinal back to string. */
const GOVERNANCE_NAMES: readonly string[] = ['approved', 'review-required', 'blocked'];

/** Map actor ordinal back to string. */
const ACTOR_NAMES: readonly string[] = ['system', 'agent', 'operator'];

/** Map resolution mode ordinal back to string. */
const MODE_NAMES: readonly string[] = ['deterministic', 'translation', 'agentic'];

/** Pure function: convert a BufferEvent (numeric) to the dispatch shape
 *  expected by the WebSocket dispatch table. Returns null for unknown types. */
export function bufferEventToDispatch(event: BufferEvent): {
  readonly type: string;
  readonly data: Readonly<Record<string, unknown>>;
} | null {
  const name = ORDINAL_TO_EVENT_NAME[event.eventType];
  if (!name) return null;
  return {
    type: name,
    data: {
      confidence: event.confidence,
      locatorRung: event.locatorRung,
      governance: GOVERNANCE_NAMES[event.governance] ?? 'approved',
      actor: ACTOR_NAMES[event.actor] ?? 'system',
      resolutionMode: MODE_NAMES[event.resolutionMode] ?? 'deterministic',
      iteration: event.iteration,
      boundingBox: event.hasBoundingBox
        ? { x: event.bx, y: event.by, width: event.bw, height: event.bh }
        : null,
      found: event.found,
      weightDrift: event.weightDrift,
      weights: {
        repairDensity: event.repairDensity,
        translationRate: event.translationRate,
        unresolvedRate: event.unresolvedRate,
        inverseFragmentShare: event.inverseFragmentShare,
      },
    },
  };
}

// ─── Hook ───

export interface SabBridgeOptions {
  /** The SharedArrayBuffer from the pipeline event bus. Null = disabled. */
  readonly sab: SharedArrayBuffer | null;
  /** Ring buffer capacity (must match pipeline-event-bus.ts). */
  readonly capacity?: number;
  /** Dispatch handler — same shape as the WebSocket message handler. */
  readonly onMessage: (msg: { readonly type: string; readonly data: unknown }) => void;
}

export interface SabBridgeHandle {
  /** Whether the SAB bridge is active. */
  readonly connected: boolean;
  /** Total events ever consumed through the bridge. */
  readonly totalConsumed: number;
}

/**
 * W3.2: Wire the SharedArrayBuffer ring buffer to the dashboard dispatch table.
 *
 * When a SAB is provided, this hook polls it each animation frame and dispatches
 * decoded events through the same handler the WebSocket path uses. When no SAB
 * is available (remote browser, cross-origin), the hook is inert and the
 * WebSocket path continues to work as the fallback.
 */
export function useSabBridge(options: SabBridgeOptions): SabBridgeHandle {
  const { sab, capacity = 1024, onMessage } = options;
  const handle = usePipelineBuffer(sab, capacity);
  const consumedRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const tick = () => {
    const count = handle.poll();
    for (let i = 0; i < count; i++) {
      const event = handle.read(i);
      const dispatch = bufferEventToDispatch(event);
      if (dispatch) {
        onMessageRef.current(dispatch);
      }
    }
    if (count > 0) {
      handle.totalEvents(); // advance cursor
      consumedRef.current += count;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (!sab) return;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [sab]);

  return {
    connected: handle.connected,
    totalConsumed: consumedRef.current,
  };
}
