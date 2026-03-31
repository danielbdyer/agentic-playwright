/**
 * SAB Zero-Copy — Law Tests (W3.2)
 *
 * Verifies ring buffer read/write correctness and zero-copy semantics
 * using synthetic event data generated from mulberry32 seeds.
 *
 * 20 mulberry32 seeds per law.
 */

import { expect, test } from '@playwright/test';
import { mulberry32, randomInt, pick , LAW_SEED_COUNT } from './support/random';
import {
  bufferEventToDispatch,
} from '../dashboard/src/hooks/use-sab-bridge';
import {
  EVENT_TYPES,
  type BufferEvent,
} from '../dashboard/src/hooks/use-pipeline-buffer';

// ─── Constants matching pipeline-event-bus.ts layout ───

const SLOT_SIZE = 18;
const HEADER_SIZE = 2;
const HEADER_BYTES = HEADER_SIZE * 4;

// ─── Synthetic event helpers ───

const EVENT_TYPE_VALUES: readonly number[] = Object.values(EVENT_TYPES);
const GOVERNANCE_VALUES: readonly number[] = [0, 1, 2];
const ACTOR_VALUES: readonly number[] = [0, 1, 2];
const MODE_VALUES: readonly number[] = [0, 1, 2];

function randomBufferEvent(next: () => number): BufferEvent {
  return {
    eventType: pick(next, EVENT_TYPE_VALUES),
    timestamp: next() * 1e12,
    confidence: next(),
    locatorRung: randomInt(next, 6),
    governance: pick(next, GOVERNANCE_VALUES),
    actor: pick(next, ACTOR_VALUES),
    resolutionMode: pick(next, MODE_VALUES),
    iteration: randomInt(next, 20),
    hasBoundingBox: next() > 0.5,
    bx: next() * 1280,
    by: next() * 720,
    bw: next() * 200,
    bh: next() * 100,
    found: next() > 0.5,
    weightDrift: next(),
    repairDensity: next(),
    translationRate: next(),
    unresolvedRate: next(),
    inverseFragmentShare: next(),
  };
}

/** Write a BufferEvent into a SharedArrayBuffer at a given slot index. */
function writeSlot(sab: SharedArrayBuffer, slotIndex: number, capacity: number, event: BufferEvent): void {
  const header = new Int32Array(sab, 0, HEADER_SIZE);
  const slots = new Float64Array(sab, HEADER_BYTES);
  const offset = (slotIndex % capacity) * SLOT_SIZE;

  slots[offset + 0] = event.eventType;
  slots[offset + 1] = event.timestamp;
  slots[offset + 2] = event.confidence;
  slots[offset + 3] = event.locatorRung;
  slots[offset + 4] = event.governance;
  slots[offset + 5] = event.actor;
  slots[offset + 6] = event.resolutionMode;
  slots[offset + 7] = event.iteration;
  slots[offset + 8] = event.hasBoundingBox ? event.bx : NaN;
  slots[offset + 9] = event.by;
  slots[offset + 10] = event.bw;
  slots[offset + 11] = event.bh;
  slots[offset + 12] = event.found ? 1 : 0;
  slots[offset + 13] = event.weightDrift;
  slots[offset + 14] = event.repairDensity;
  slots[offset + 15] = event.translationRate;
  slots[offset + 16] = event.unresolvedRate;
  slots[offset + 17] = event.inverseFragmentShare;

  // Advance write head and total
  Atomics.add(header, 0, 1);
  Atomics.add(header, 1, 1);
}

/** Read a BufferEvent from a SharedArrayBuffer at a given slot index. */
function readSlot(sab: SharedArrayBuffer, slotIndex: number, capacity: number): BufferEvent {
  const slots = new Float64Array(sab, HEADER_BYTES);
  const offset = (slotIndex % capacity) * SLOT_SIZE;
  const bx = slots[offset + 8]!;
  return {
    eventType: slots[offset + 0]!,
    timestamp: slots[offset + 1]!,
    confidence: slots[offset + 2]!,
    locatorRung: slots[offset + 3]!,
    governance: slots[offset + 4]!,
    actor: slots[offset + 5]!,
    resolutionMode: slots[offset + 6]!,
    iteration: slots[offset + 7]!,
    hasBoundingBox: !Number.isNaN(bx),
    bx,
    by: slots[offset + 9]!,
    bw: slots[offset + 10]!,
    bh: slots[offset + 11]!,
    found: slots[offset + 12]! === 1,
    weightDrift: slots[offset + 13]!,
    repairDensity: slots[offset + 14]!,
    translationRate: slots[offset + 15]!,
    unresolvedRate: slots[offset + 16]!,
    inverseFragmentShare: slots[offset + 17]!,
  };
}

function createSab(capacity: number): SharedArrayBuffer {
  return new SharedArrayBuffer(HEADER_BYTES + capacity * SLOT_SIZE * 8);
}

// ─── Law 1: Write-then-read identity (20 seeds) ───

test.describe('SAB ring buffer write-then-read identity', () => {
  test('written event is read back identically (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const capacity = 8 + randomInt(next, 120);
      const sab = createSab(capacity);
      const event = randomBufferEvent(next);

      writeSlot(sab, 0, capacity, event);
      const readBack = readSlot(sab, 0, capacity);

      // Numeric fields must round-trip exactly
      expect(readBack.eventType).toBe(event.eventType);
      expect(readBack.confidence).toBeCloseTo(event.confidence, 10);
      expect(readBack.locatorRung).toBe(event.locatorRung);
      expect(readBack.governance).toBe(event.governance);
      expect(readBack.actor).toBe(event.actor);
      expect(readBack.resolutionMode).toBe(event.resolutionMode);
      expect(readBack.iteration).toBe(event.iteration);
      expect(readBack.found).toBe(event.found);
      expect(readBack.weightDrift).toBeCloseTo(event.weightDrift, 10);
      expect(readBack.repairDensity).toBeCloseTo(event.repairDensity, 10);
      expect(readBack.translationRate).toBeCloseTo(event.translationRate, 10);
      expect(readBack.unresolvedRate).toBeCloseTo(event.unresolvedRate, 10);
      expect(readBack.inverseFragmentShare).toBeCloseTo(event.inverseFragmentShare, 10);
    }
  });
});

// ─── Law 2: Ring buffer wrapping correctness (20 seeds) ───

test.describe('SAB ring buffer wrapping', () => {
  test('events survive ring wrap without corruption (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const capacity = 4 + randomInt(next, 12); // small capacity to force wrapping
      const sab = createSab(capacity);
      const eventCount = capacity + randomInt(next, capacity * 2);

      // Write more events than capacity (forces wrap)
      const events: BufferEvent[] = [];
      for (let i = 0; i < eventCount; i++) {
        const event = randomBufferEvent(next);
        events.push(event);
        writeSlot(sab, i, capacity, event);
      }

      // The last `capacity` events should be readable
      const startIdx = Math.max(0, eventCount - capacity);
      for (let i = startIdx; i < eventCount; i++) {
        const readBack = readSlot(sab, i, capacity);
        const original = events[i]!;
        expect(readBack.eventType).toBe(original.eventType);
        expect(readBack.iteration).toBe(original.iteration);
        expect(readBack.confidence).toBeCloseTo(original.confidence, 10);
      }
    }
  });
});

// ─── Law 3: Atomic header monotonicity (20 seeds) ───

test.describe('SAB header monotonicity', () => {
  test('total event count is monotonically increasing (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const capacity = 16 + randomInt(next, 64);
      const sab = createSab(capacity);
      const header = new Int32Array(sab, 0, HEADER_SIZE);
      const writeCount = 2 + randomInt(next, 50);

      let prevTotal = 0;
      for (let i = 0; i < writeCount; i++) {
        const event = randomBufferEvent(next);
        writeSlot(sab, i, capacity, event);
        const total = Atomics.load(header, 1);
        expect(total).toBeGreaterThan(prevTotal);
        prevTotal = total;
      }
    }
  });
});

// ─── Law 4: bufferEventToDispatch round-trip (20 seeds) ───

test.describe('bufferEventToDispatch conversion', () => {
  test('known event types produce non-null dispatch (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const event = randomBufferEvent(next);

      const dispatch = bufferEventToDispatch(event);
      // All generated events use valid EVENT_TYPE ordinals, so dispatch should be non-null
      expect(dispatch).not.toBeNull();
      expect(dispatch!.type).toBeTruthy();
      expect(typeof dispatch!.data).toBe('object');
    }
  });

  test('unknown event types produce null dispatch (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const event: BufferEvent = {
        ...randomBufferEvent(next),
        eventType: 999 + randomInt(next, 1000), // definitely not a valid ordinal
      };

      const dispatch = bufferEventToDispatch(event);
      expect(dispatch).toBeNull();
    }
  });
});

// ─── Law 5: Governance ordinal mapping (20 seeds) ───

test.describe('governance ordinal bijection', () => {
  test('governance ordinals 0,1,2 map to known names (20 seeds)', () => {
    const expectedNames = ['approved', 'review-required', 'blocked'];
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const govIdx = randomInt(next, 3);
      const event: BufferEvent = {
        ...randomBufferEvent(next),
        governance: govIdx,
      };

      const dispatch = bufferEventToDispatch(event);
      expect(dispatch).not.toBeNull();
      const data = dispatch!.data as Record<string, unknown>;
      expect(expectedNames).toContain(data.governance);
      expect(data.governance).toBe(expectedNames[govIdx]);
    }
  });
});

// ─── Law 6: Zero-copy — views share underlying buffer (20 seeds) ───

test.describe('zero-copy shared memory', () => {
  test('Int32Array and Float64Array views share the same ArrayBuffer (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const capacity = 8 + randomInt(next, 256);
      const sab = createSab(capacity);

      const header = new Int32Array(sab, 0, HEADER_SIZE);
      const slots = new Float64Array(sab, HEADER_BYTES);

      // Both views reference the same buffer
      expect(header.buffer).toBe(sab);
      expect(slots.buffer).toBe(sab);

      // Writing through one view is visible through the other
      const event = randomBufferEvent(next);
      writeSlot(sab, 0, capacity, event);

      // Header total should be 1
      expect(Atomics.load(header, 1)).toBe(1);
      // Slot data should be readable
      expect(slots[0]).toBe(event.eventType);
    }
  });
});

// ─── Law 7: Bounding box NaN encoding (20 seeds) ───

test.describe('bounding box NaN encoding', () => {
  test('hasBoundingBox false produces NaN in bx slot (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const capacity = 16;
      const sab = createSab(capacity);
      const event: BufferEvent = {
        ...randomBufferEvent(next),
        hasBoundingBox: false,
      };

      writeSlot(sab, 0, capacity, event);
      const readBack = readSlot(sab, 0, capacity);
      expect(readBack.hasBoundingBox).toBe(false);
    }
  });

  test('hasBoundingBox true preserves coordinates (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const capacity = 16;
      const sab = createSab(capacity);
      const event: BufferEvent = {
        ...randomBufferEvent(next),
        hasBoundingBox: true,
        bx: next() * 1280,
        by: next() * 720,
        bw: next() * 200,
        bh: next() * 100,
      };

      writeSlot(sab, 0, capacity, event);
      const readBack = readSlot(sab, 0, capacity);
      expect(readBack.hasBoundingBox).toBe(true);
      expect(readBack.bx).toBeCloseTo(event.bx, 10);
      expect(readBack.by).toBeCloseTo(event.by, 10);
      expect(readBack.bw).toBeCloseTo(event.bw, 10);
      expect(readBack.bh).toBeCloseTo(event.bh, 10);
    }
  });
});

// ─── Law 8: Dispatch data shape invariant (20 seeds) ───

test.describe('dispatch data shape', () => {
  test('dispatch always includes governance, actor, resolutionMode (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const event = randomBufferEvent(next);
      const dispatch = bufferEventToDispatch(event);

      if (dispatch) {
        const data = dispatch.data as Record<string, unknown>;
        expect(typeof data.governance).toBe('string');
        expect(typeof data.actor).toBe('string');
        expect(typeof data.resolutionMode).toBe('string');
        expect(typeof data.confidence).toBe('number');
        expect(typeof data.iteration).toBe('number');
      }
    }
  });
});
