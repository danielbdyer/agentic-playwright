/**
 * SharedArrayBuffer Round-Trip Encoding — Law Tests (W1.6)
 *
 * Verifies the encode/decode round-trip of DashboardEvents through the
 * SharedArrayBuffer ring buffer. The pipeline-event-bus encodes events
 * as fixed-size Float64 slots (18 values per event) and reads them back
 * through readSlot(). This test proves:
 *
 *   Law 1: Round-trip — write then read recovers all numeric fields
 *   Law 2: Exact capacity — filling exactly to capacity loses nothing
 *   Law 3: Wrap-around — events past capacity overwrite oldest slots correctly
 *   Law 4: Off-by-one — first slot, last slot, and boundary transitions are correct
 *   Law 5: BoundingBox encoding — null vs present bounding boxes round-trip
 *   Law 6: Governance/Actor/Mode ordinal encoding round-trips
 *   Law 7: Weights encoding round-trips
 *   Law 8: Event count monotonicity — readEventCount never decreases
 *
 * Tests the pure ring buffer functions directly (no Effect fibers).
 * Uses mulberry32 for deterministic randomization across 20 seeds.
 */

import { expect, test } from '@playwright/test';
import {
  createPipelineBuffer,
  readEventCount,
  readSlot,
} from '../lib/infrastructure/dashboard/pipeline-event-bus';
import type { PipelineBuffer } from '../lib/infrastructure/dashboard/pipeline-event-bus';
import type { DashboardEvent, DashboardEventKind } from '../lib/domain/observation/dashboard';
import { mulberry32, pick, randomInt , LAW_SEED_COUNT } from './support/random';

// ─── Constants (mirrored from pipeline-event-bus.ts) ───

const SLOT_SIZE = 18;

const EVENT_TYPE_ORDINALS: Readonly<Record<string, number>> = {
  'element-probed': 1, 'element-escalated': 2, 'screen-captured': 3,
  'iteration-start': 10, 'iteration-complete': 11, 'progress': 12,
  'rung-shift': 20, 'calibration-update': 21, 'proposal-activated': 22,
  'confidence-crossed': 23, 'artifact-written': 24, 'stage-lifecycle': 25,
  'item-pending': 30, 'item-processing': 31, 'item-completed': 32,
  'fiber-paused': 33, 'fiber-resumed': 34, 'workbench-updated': 35,
  'fitness-updated': 36, 'inbox-item-arrived': 37,
  'connected': 50, 'error': 51,
};

const GOVERNANCE_ORDINALS: Readonly<Record<string, number>> = {
  'approved': 0, 'review-required': 1, 'blocked': 2,
};

const ACTOR_ORDINALS: Readonly<Record<string, number>> = {
  'system': 0, 'agent': 1, 'operator': 2,
};

const MODE_ORDINALS: Readonly<Record<string, number>> = {
  'deterministic': 0, 'translation': 1, 'agentic': 2,
};

// ─── writeEvent (mirrored — not exported from module) ───

function writeEvent(buffer: PipelineBuffer, event: DashboardEvent): void {
  const ordinal = EVENT_TYPE_ORDINALS[event.type] ?? 0;
  const data = event.data as Record<string, unknown> | null;

  const slot = Atomics.add(buffer.header, 0, 1) % buffer.capacity;
  const offset = slot * SLOT_SIZE;

  buffer.slots[offset + 0] = ordinal;
  buffer.slots[offset + 1] = Date.now();

  if (data) {
    buffer.slots[offset + 2] = (data.confidence as number) ?? 0;
    buffer.slots[offset + 3] = (data.locatorRung as number) ?? 0;
    buffer.slots[offset + 4] = GOVERNANCE_ORDINALS[(data.governance as string) ?? ''] ?? 0;
    buffer.slots[offset + 5] = ACTOR_ORDINALS[(data.actor as string) ?? ''] ?? 0;
    buffer.slots[offset + 6] = MODE_ORDINALS[(data.resolutionMode as string) ?? ''] ?? 0;
    buffer.slots[offset + 7] = (data.iteration as number) ?? 0;

    const box = data.boundingBox as { x: number; y: number; width: number; height: number } | null;
    buffer.slots[offset + 8] = box?.x ?? NaN;
    buffer.slots[offset + 9] = box?.y ?? NaN;
    buffer.slots[offset + 10] = box?.width ?? NaN;
    buffer.slots[offset + 11] = box?.height ?? NaN;
    buffer.slots[offset + 12] = (data.found as boolean) ? 1 : 0;
    buffer.slots[offset + 13] = (data.weightDrift as number) ?? 0;

    const weights = data.weights as { repairDensity: number; translationRate: number; unresolvedRate: number; inverseFragmentShare: number } | undefined;
    buffer.slots[offset + 14] = weights?.repairDensity ?? 0;
    buffer.slots[offset + 15] = weights?.translationRate ?? 0;
    buffer.slots[offset + 16] = weights?.unresolvedRate ?? 0;
    buffer.slots[offset + 17] = weights?.inverseFragmentShare ?? 0;
  }

  Atomics.add(buffer.header, 1, 1);
}

// ─── Event Generators ───

const EVENT_KINDS: readonly DashboardEventKind[] = [
  'iteration-start', 'iteration-complete', 'progress',
  'element-probed', 'screen-captured', 'element-escalated',
  'item-pending', 'item-processing', 'item-completed',
  'rung-shift', 'calibration-update', 'proposal-activated',
  'confidence-crossed', 'artifact-written', 'stage-lifecycle',
  'fiber-paused', 'fiber-resumed', 'workbench-updated',
  'fitness-updated', 'inbox-item-arrived', 'connected', 'error',
];

const GOVERNANCE_KEYS: readonly string[] = ['approved', 'review-required', 'blocked'];
const ACTOR_KEYS: readonly string[] = ['system', 'agent', 'operator'];
const MODE_KEYS: readonly string[] = ['deterministic', 'translation', 'agentic'];

interface EventSpec {
  readonly kind: DashboardEventKind;
  readonly confidence: number;
  readonly locatorRung: number;
  readonly governance: string;
  readonly actor: string;
  readonly resolutionMode: string;
  readonly iteration: number;
  readonly boundingBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
  readonly found: boolean;
  readonly weightDrift: number;
  readonly weights: {
    readonly repairDensity: number;
    readonly translationRate: number;
    readonly unresolvedRate: number;
    readonly inverseFragmentShare: number;
  };
}

function generateEventSpec(next: () => number): EventSpec {
  const hasBBox = next() > 0.5;
  return {
    kind: pick(next, EVENT_KINDS),
    confidence: next(),
    locatorRung: randomInt(next, 10),
    governance: pick(next, GOVERNANCE_KEYS),
    actor: pick(next, ACTOR_KEYS),
    resolutionMode: pick(next, MODE_KEYS),
    iteration: randomInt(next, 1000),
    boundingBox: hasBBox ? {
      x: next() * 1920,
      y: next() * 1080,
      width: next() * 500,
      height: next() * 500,
    } : null,
    found: next() > 0.5,
    weightDrift: next(),
    weights: {
      repairDensity: next(),
      translationRate: next(),
      unresolvedRate: next(),
      inverseFragmentShare: next(),
    },
  };
}

function specToEvent(spec: EventSpec): DashboardEvent {
  return {
    type: spec.kind,
    timestamp: new Date().toISOString(),
    data: {
      confidence: spec.confidence,
      locatorRung: spec.locatorRung,
      governance: spec.governance,
      actor: spec.actor,
      resolutionMode: spec.resolutionMode,
      iteration: spec.iteration,
      boundingBox: spec.boundingBox,
      found: spec.found,
      weightDrift: spec.weightDrift,
      weights: spec.weights,
    },
  };
}

/** Assert that a readSlot result matches the original spec (within Float64 precision). */
function assertSlotMatchesSpec(
  slot: ReturnType<typeof readSlot>,
  spec: EventSpec,
): void {
  expect(slot.eventType).toBe(EVENT_TYPE_ORDINALS[spec.kind] ?? 0);
  expect(slot.confidence).toBeCloseTo(spec.confidence, 10);
  expect(slot.locatorRung).toBe(spec.locatorRung);
  expect(slot.governance).toBe(GOVERNANCE_ORDINALS[spec.governance] ?? 0);
  expect(slot.actor).toBe(ACTOR_ORDINALS[spec.actor] ?? 0);
  expect(slot.resolutionMode).toBe(MODE_ORDINALS[spec.resolutionMode] ?? 0);
  expect(slot.iteration).toBe(spec.iteration);
  expect(slot.found).toBe(spec.found);
  expect(slot.weightDrift).toBeCloseTo(spec.weightDrift, 10);
  expect(slot.weights.repairDensity).toBeCloseTo(spec.weights.repairDensity, 10);
  expect(slot.weights.translationRate).toBeCloseTo(spec.weights.translationRate, 10);
  expect(slot.weights.unresolvedRate).toBeCloseTo(spec.weights.unresolvedRate, 10);
  expect(slot.weights.inverseFragmentShare).toBeCloseTo(spec.weights.inverseFragmentShare, 10);

  if (spec.boundingBox === null) {
    expect(slot.boundingBox).toBeNull();
  } else {
    expect(slot.boundingBox).not.toBeNull();
    expect(slot.boundingBox!.x).toBeCloseTo(spec.boundingBox.x, 10);
    expect(slot.boundingBox!.y).toBeCloseTo(spec.boundingBox.y, 10);
    expect(slot.boundingBox!.width).toBeCloseTo(spec.boundingBox.width, 10);
    expect(slot.boundingBox!.height).toBeCloseTo(spec.boundingBox.height, 10);
  }
}

// ─── Law Tests ───

test.describe('SharedArrayBuffer round-trip encoding laws', () => {

  // ─── Law 1: Round-trip — write then read recovers all numeric fields ───

  test('Law 1: single event round-trip preserves all fields (20 seeds)', () => {
    for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const spec = generateEventSpec(next);
      const event = specToEvent(spec);

      const buffer = createPipelineBuffer(8);
      writeEvent(buffer, event);

      const slot = readSlot(buffer, 0);
      assertSlotMatchesSpec(slot, spec);
    }
  });

  test('Law 1b: multiple events round-trip preserves all fields', () => {
    for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const count = 2 + randomInt(next, 14); // 2..15 events
      const buffer = createPipelineBuffer(16);

      const specs: readonly EventSpec[] = Array.from({ length: count }, () => generateEventSpec(next));
      for (const spec of specs) {
        writeEvent(buffer, specToEvent(spec));
      }

      for (let i = 0; i < count; i++) {
        assertSlotMatchesSpec(readSlot(buffer, i), specs[i]!);
      }
    }
  });

  // ─── Law 2: Exact capacity — filling exactly to capacity loses nothing ───

  test('Law 2: filling exactly to capacity preserves all events (20 seeds)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const next = mulberry32(seed);
      const capacity = 4 + randomInt(next, 12); // 4..15
      const buffer = createPipelineBuffer(capacity);

      const specs: readonly EventSpec[] = Array.from({ length: capacity }, () => generateEventSpec(next));
      for (const spec of specs) {
        writeEvent(buffer, specToEvent(spec));
      }

      expect(readEventCount(buffer)).toBe(capacity);

      for (let i = 0; i < capacity; i++) {
        assertSlotMatchesSpec(readSlot(buffer, i), specs[i]!);
      }
    }
  });

  // ─── Law 3: Wrap-around — events past capacity overwrite oldest slots ───

  test('Law 3: wrap-around overwrites oldest slots correctly (20 seeds)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const next = mulberry32(seed);
      const capacity = 4 + randomInt(next, 12); // 4..15
      const overflow = 1 + randomInt(next, capacity); // 1..capacity extra events
      const totalCount = capacity + overflow;
      const buffer = createPipelineBuffer(capacity);

      const specs: readonly EventSpec[] = Array.from({ length: totalCount }, () => generateEventSpec(next));
      for (const spec of specs) {
        writeEvent(buffer, specToEvent(spec));
      }

      expect(readEventCount(buffer)).toBe(totalCount);

      // After wrap-around, slot i contains the event at index (i) if i >= overflow,
      // or the event that wrapped into that slot. The write head advanced totalCount
      // times, so slot s contains the event whose write index % capacity === s.
      // The last `capacity` events are at indices [overflow, overflow+1, ..., totalCount-1].
      // Event at index j was written to slot (j % capacity).
      for (let j = overflow; j < totalCount; j++) {
        const slotIndex = j % capacity;
        assertSlotMatchesSpec(readSlot(buffer, slotIndex), specs[j]!);
      }
    }
  });

  // ─── Law 4: Off-by-one — first slot, last slot, boundary transitions ───

  test('Law 4a: first slot (index 0) is correctly written and read', () => {
    for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const spec = generateEventSpec(next);
      const buffer = createPipelineBuffer(16);
      writeEvent(buffer, specToEvent(spec));

      assertSlotMatchesSpec(readSlot(buffer, 0), spec);
      expect(readEventCount(buffer)).toBe(1);
    }
  });

  test('Law 4b: last slot (capacity - 1) is correctly written and read', () => {
    for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const capacity = 4 + randomInt(next, 28);
      const buffer = createPipelineBuffer(capacity);

      const specs: readonly EventSpec[] = Array.from({ length: capacity }, () => generateEventSpec(next));
      for (const spec of specs) {
        writeEvent(buffer, specToEvent(spec));
      }

      // Last slot is at index capacity - 1
      assertSlotMatchesSpec(readSlot(buffer, capacity - 1), specs[capacity - 1]!);
    }
  });

  test('Law 4c: boundary transition — event at capacity wraps to slot 0', () => {
    for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const capacity = 4 + randomInt(next, 12);
      const buffer = createPipelineBuffer(capacity);

      // Write exactly capacity events, then one more
      const specs: readonly EventSpec[] = Array.from({ length: capacity + 1 }, () => generateEventSpec(next));
      for (const spec of specs) {
        writeEvent(buffer, specToEvent(spec));
      }

      // The (capacity+1)th event wraps to slot 0, overwriting the first event
      assertSlotMatchesSpec(readSlot(buffer, 0), specs[capacity]!);
      // Slot 1 still has the second event (not yet overwritten)
      assertSlotMatchesSpec(readSlot(buffer, 1), specs[1]!);
    }
  });

  // ─── Law 5: BoundingBox encoding — null vs present round-trips ───

  test('Law 5: null boundingBox reads back as null', () => {
    for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const spec: EventSpec = {
        ...generateEventSpec(next),
        boundingBox: null,
      };
      const buffer = createPipelineBuffer(4);
      writeEvent(buffer, specToEvent(spec));

      expect(readSlot(buffer, 0).boundingBox).toBeNull();
    }
  });

  test('Law 5b: present boundingBox reads back with correct coordinates', () => {
    for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const bbox = {
        x: next() * 1920,
        y: next() * 1080,
        width: next() * 500,
        height: next() * 500,
      };
      const spec: EventSpec = {
        ...generateEventSpec(next),
        boundingBox: bbox,
      };
      const buffer = createPipelineBuffer(4);
      writeEvent(buffer, specToEvent(spec));

      const slot = readSlot(buffer, 0);
      expect(slot.boundingBox).not.toBeNull();
      expect(slot.boundingBox!.x).toBeCloseTo(bbox.x, 10);
      expect(slot.boundingBox!.y).toBeCloseTo(bbox.y, 10);
      expect(slot.boundingBox!.width).toBeCloseTo(bbox.width, 10);
      expect(slot.boundingBox!.height).toBeCloseTo(bbox.height, 10);
    }
  });

  // ─── Law 6: Governance/Actor/Mode ordinal encoding round-trips ───

  test('Law 6: all governance ordinals encode and decode correctly', () => {
    const _buffer = createPipelineBuffer(8);
    const governanceValues = ['approved', 'review-required', 'blocked'] as const;

    for (const gov of governanceValues) {
      const next = mulberry32(governanceValues.indexOf(gov));
      const spec: EventSpec = { ...generateEventSpec(next), governance: gov };
      const freshBuffer = createPipelineBuffer(4);
      writeEvent(freshBuffer, specToEvent(spec));

      expect(readSlot(freshBuffer, 0).governance).toBe(GOVERNANCE_ORDINALS[gov]);
    }
  });

  test('Law 6b: all actor ordinals encode and decode correctly', () => {
    const actorValues = ['system', 'agent', 'operator'] as const;

    for (const actor of actorValues) {
      const next = mulberry32(actorValues.indexOf(actor));
      const spec: EventSpec = { ...generateEventSpec(next), actor };
      const buffer = createPipelineBuffer(4);
      writeEvent(buffer, specToEvent(spec));

      expect(readSlot(buffer, 0).actor).toBe(ACTOR_ORDINALS[actor]);
    }
  });

  test('Law 6c: all resolution mode ordinals encode and decode correctly', () => {
    const modeValues = ['deterministic', 'translation', 'agentic'] as const;

    for (const mode of modeValues) {
      const next = mulberry32(modeValues.indexOf(mode));
      const spec: EventSpec = { ...generateEventSpec(next), resolutionMode: mode };
      const buffer = createPipelineBuffer(4);
      writeEvent(buffer, specToEvent(spec));

      expect(readSlot(buffer, 0).resolutionMode).toBe(MODE_ORDINALS[mode]);
    }
  });

  // ─── Law 7: Weights encoding round-trips ───

  test('Law 7: bottleneck weights round-trip through Float64 encoding (20 seeds)', () => {
    for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const weights = {
        repairDensity: next(),
        translationRate: next(),
        unresolvedRate: next(),
        inverseFragmentShare: next(),
      };
      const spec: EventSpec = { ...generateEventSpec(next), weights };
      const buffer = createPipelineBuffer(4);
      writeEvent(buffer, specToEvent(spec));

      const slot = readSlot(buffer, 0);
      expect(slot.weights.repairDensity).toBeCloseTo(weights.repairDensity, 10);
      expect(slot.weights.translationRate).toBeCloseTo(weights.translationRate, 10);
      expect(slot.weights.unresolvedRate).toBeCloseTo(weights.unresolvedRate, 10);
      expect(slot.weights.inverseFragmentShare).toBeCloseTo(weights.inverseFragmentShare, 10);
    }
  });

  // ─── Law 8: Event count monotonicity ───

  test('Law 8: readEventCount is monotonically non-decreasing (20 seeds)', () => {
    for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const eventCount = 1 + randomInt(next, 50);
      const buffer = createPipelineBuffer(16);

      let previousCount = 0;
      for (let i = 0; i < eventCount; i++) {
        const spec = generateEventSpec(next);
        writeEvent(buffer, specToEvent(spec));
        const currentCount = readEventCount(buffer);
        expect(currentCount).toBeGreaterThanOrEqual(previousCount);
        expect(currentCount).toBe(i + 1);
        previousCount = currentCount;
      }
    }
  });

  // ─── Law 9: Empty buffer baseline ───

  test('Law 9: empty buffer has zero event count and zero-initialized slots', () => {
    for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const capacity = 2 + randomInt(next, 30);
      const buffer = createPipelineBuffer(capacity);

      expect(readEventCount(buffer)).toBe(0);
      expect(buffer.capacity).toBe(capacity);
      expect(buffer.slots.length).toBe(capacity * SLOT_SIZE);

      const slot = readSlot(buffer, 0);
      expect(slot.eventType).toBe(0);
      expect(slot.confidence).toBe(0);
      expect(slot.iteration).toBe(0);
    }
  });

  // ─── Law 10: Double wrap-around ───

  test('Law 10: double wrap-around preserves latest capacity events', () => {
    for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const capacity = 4 + randomInt(next, 8); // 4..11
      const totalWrites = capacity * 2 + randomInt(next, capacity);
      const buffer = createPipelineBuffer(capacity);

      const specs: readonly EventSpec[] = Array.from({ length: totalWrites }, () => generateEventSpec(next));
      for (const spec of specs) {
        writeEvent(buffer, specToEvent(spec));
      }

      expect(readEventCount(buffer)).toBe(totalWrites);

      // The buffer now holds the last `capacity` events.
      // Event at write-index j is in slot (j % capacity).
      const startOfLatest = totalWrites - capacity;
      for (let j = startOfLatest; j < totalWrites; j++) {
        assertSlotMatchesSpec(readSlot(buffer, j % capacity), specs[j]!);
      }
    }
  });
});
