import { useEffect, useRef } from 'react';
import type { ProbeEvent } from '../spatial/types';
import {
  EVENT_TYPES,
  PIPELINE_BUFFER_LAYOUT,
  usePipelineBuffer,
  type BufferEvent,
} from './use-pipeline-buffer';

const GOVERNANCE_ORDINALS = {
  approved: 0,
  'review-required': 1,
  blocked: 2,
} as const;

const GOVERNANCE_BY_ORDINAL = ['approved', 'review-required', 'blocked'] as const;
const ACTOR_BY_ORDINAL = ['system', 'agent', 'operator'] as const;
const MODE_BY_ORDINAL = ['deterministic', 'translation', 'agentic'] as const;

const DEFAULT_PROBE_BUFFER_CAPACITY = 2048;

interface ProbeEventMetadata {
  readonly id: string;
  readonly element: string;
  readonly screen: string;
  readonly strategy: string;
}

export interface ProbeEventBuffer {
  readonly sab: SharedArrayBuffer;
  readonly capacity: number;
  readonly header: Int32Array;
  readonly slots: Float64Array;
  readonly metadata: Array<ProbeEventMetadata | null>;
}

const actorOrdinal = (event: ProbeEvent): number =>
  ACTOR_BY_ORDINAL.indexOf(event.actor);

const resolutionModeOrdinal = (event: ProbeEvent): number =>
  MODE_BY_ORDINAL.indexOf(event.resolutionMode);

const governanceFromOrdinal = (ordinal: number): ProbeEvent['governance'] =>
  GOVERNANCE_BY_ORDINAL[ordinal] ?? 'approved';

const actorFromOrdinal = (ordinal: number): ProbeEvent['actor'] =>
  ACTOR_BY_ORDINAL[ordinal] ?? 'system';

const resolutionModeFromOrdinal = (ordinal: number): ProbeEvent['resolutionMode'] =>
  MODE_BY_ORDINAL[ordinal] ?? 'deterministic';

export const createProbeEventBuffer = (
  capacity = DEFAULT_PROBE_BUFFER_CAPACITY,
): ProbeEventBuffer | null => {
  if (typeof SharedArrayBuffer === 'undefined') {
    return null;
  }
  const slotBytes = capacity * PIPELINE_BUFFER_LAYOUT.slotSize * 8;
  const sab = new SharedArrayBuffer(PIPELINE_BUFFER_LAYOUT.headerBytes + slotBytes);
  return {
    sab,
    capacity,
    header: new Int32Array(sab, 0, PIPELINE_BUFFER_LAYOUT.headerSize),
    slots: new Float64Array(sab, PIPELINE_BUFFER_LAYOUT.headerBytes),
    metadata: new Array<ProbeEventMetadata | null>(capacity).fill(null),
  };
};

export const writeProbeEventToBuffer = (
  buffer: ProbeEventBuffer,
  event: ProbeEvent,
): void => {
  const slot = Atomics.add(buffer.header, 0, 1) % buffer.capacity;
  const offset = slot * PIPELINE_BUFFER_LAYOUT.slotSize;
  const box = event.boundingBox;

  buffer.metadata[slot] = {
    id: event.id,
    element: event.element,
    screen: event.screen,
    strategy: event.strategy,
  };

  buffer.slots[offset + 0] = EVENT_TYPES.ELEMENT_PROBED;
  buffer.slots[offset + 1] = Date.now();
  buffer.slots[offset + 2] = event.confidence;
  buffer.slots[offset + 3] = event.locatorRung;
  buffer.slots[offset + 4] = GOVERNANCE_ORDINALS[event.governance] ?? 0;
  buffer.slots[offset + 5] = Math.max(0, actorOrdinal(event));
  buffer.slots[offset + 6] = Math.max(0, resolutionModeOrdinal(event));
  buffer.slots[offset + 7] = 0;
  buffer.slots[offset + 8] = box?.x ?? Number.NaN;
  buffer.slots[offset + 9] = box?.y ?? Number.NaN;
  buffer.slots[offset + 10] = box?.width ?? Number.NaN;
  buffer.slots[offset + 11] = box?.height ?? Number.NaN;
  buffer.slots[offset + 12] = event.found ? 1 : 0;
  buffer.slots[offset + 13] = 0;
  buffer.slots[offset + 14] = 0;
  buffer.slots[offset + 15] = 0;
  buffer.slots[offset + 16] = 0;
  buffer.slots[offset + 17] = 0;

  Atomics.add(buffer.header, 1, 1);
};

export const readProbeEventMetadata = (
  buffer: ProbeEventBuffer,
  absoluteIndex: number,
): ProbeEventMetadata | null =>
  buffer.metadata[absoluteIndex % buffer.capacity] ?? null;

export const decodeBufferedProbeEvent = (
  event: BufferEvent,
  metadata: ProbeEventMetadata | null,
): ProbeEvent | null =>
  metadata === null
    ? null
    : {
        id: metadata.id,
        element: metadata.element,
        screen: metadata.screen,
        strategy: metadata.strategy,
        boundingBox: event.hasBoundingBox
          ? {
              x: event.bx,
              y: event.by,
              width: event.bw,
              height: event.bh,
            }
          : null,
        locatorRung: event.locatorRung,
        found: event.found,
        confidence: event.confidence,
        actor: actorFromOrdinal(event.actor),
        governance: governanceFromOrdinal(event.governance),
        resolutionMode: resolutionModeFromOrdinal(event.resolutionMode),
      };

export const readBufferedProbeEvent = (
  buffer: ProbeEventBuffer,
  absoluteIndex: number,
): ProbeEvent | null => {
  const offset = (absoluteIndex % buffer.capacity) * PIPELINE_BUFFER_LAYOUT.slotSize;
  const bx = buffer.slots[offset + 8]!;
  return decodeBufferedProbeEvent(
    {
      eventType: buffer.slots[offset + 0]!,
      timestamp: buffer.slots[offset + 1]!,
      confidence: buffer.slots[offset + 2]!,
      locatorRung: buffer.slots[offset + 3]!,
      governance: buffer.slots[offset + 4]!,
      actor: buffer.slots[offset + 5]!,
      resolutionMode: buffer.slots[offset + 6]!,
      iteration: buffer.slots[offset + 7]!,
      hasBoundingBox: !Number.isNaN(bx),
      bx,
      by: buffer.slots[offset + 9]!,
      bw: buffer.slots[offset + 10]!,
      bh: buffer.slots[offset + 11]!,
      found: buffer.slots[offset + 12]! === 1,
      weightDrift: buffer.slots[offset + 13]!,
      repairDensity: buffer.slots[offset + 14]!,
      translationRate: buffer.slots[offset + 15]!,
      unresolvedRate: buffer.slots[offset + 16]!,
      inverseFragmentShare: buffer.slots[offset + 17]!,
    },
    readProbeEventMetadata(buffer, absoluteIndex),
  );
};

export function useProbePipelineBridge(options: {
  readonly buffer: ProbeEventBuffer | null;
  readonly enqueue: (id: string, data: ProbeEvent) => void;
}) {
  const pipelineBuffer = usePipelineBuffer(
    options.buffer?.sab ?? null,
    options.buffer?.capacity ?? DEFAULT_PROBE_BUFFER_CAPACITY,
  );
  const enqueueRef = useRef(options.enqueue);
  enqueueRef.current = options.enqueue;

  useEffect(() => {
    if (options.buffer === null || !pipelineBuffer.connected) {
      return;
    }

    let frame = 0;
    const drain = () => {
      const batchSize = pipelineBuffer.poll();
      if (batchSize > 0) {
        const decodedBatch = Array.from({ length: batchSize }, (_, batchIndex) => {
          const absoluteIndex = pipelineBuffer.readIndex(batchIndex);
          return decodeBufferedProbeEvent(
            pipelineBuffer.read(batchIndex),
            readProbeEventMetadata(options.buffer!, absoluteIndex),
          );
        }).filter((event): event is ProbeEvent => event !== null);

        decodedBatch.forEach((event) => enqueueRef.current(event.id, event));
        pipelineBuffer.totalEvents();
      }
      frame = requestAnimationFrame(drain);
    };

    frame = requestAnimationFrame(drain);
    return () => cancelAnimationFrame(frame);
  }, [options.buffer, pipelineBuffer]);

  return { connected: pipelineBuffer.connected } as const;
}
