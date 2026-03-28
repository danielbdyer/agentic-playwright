import { expect, test } from '@playwright/test';
import {
  createProgressEvent,
  estimateRemaining,
  formatProgressLine,
  serializeProgress,
  type ProgressEvent,
} from '../lib/application/progress-reporting';
import { mulberry32, randomWord, randomInt } from './support/random';

// ─── Helpers ───

function syntheticEvent(next: () => number): ProgressEvent {
  const total = 1 + randomInt(next, 50);
  const completed = randomInt(next, total + 1);
  const elapsed = 1000 + Math.floor(next() * 60000);
  return createProgressEvent({
    phase: randomWord(next),
    iteration: randomInt(next, 20),
    completedScenarios: completed,
    totalScenarios: total,
    currentMetrics: { knowledgeHitRate: next(), translationPrecision: next() },
    elapsed,
    estimatedRemaining: estimateRemaining(completed, total, elapsed),
  });
}

// ─── Law 1: estimateRemaining is null when completed=0 ───

test('Law 1: estimateRemaining is null when completed is zero (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const total = 1 + randomInt(next, 100);
    const elapsed = 1000 + Math.floor(next() * 60000);

    const result = estimateRemaining(0, total, elapsed);
    expect(result).toBeNull();
  }
});

// ─── Law 2: estimateRemaining decreases as completed increases ───

test('Law 2: estimateRemaining decreases as completed increases for fixed total/elapsed (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const total = 5 + randomInt(next, 50);
    const elapsed = 5000 + Math.floor(next() * 30000);

    // Compare two completion points: fewer completed vs more completed
    const low = 1 + randomInt(next, Math.floor(total / 2));
    const high = low + 1 + randomInt(next, total - low);

    const estimateLow = estimateRemaining(low, total, elapsed);
    const estimateHigh = estimateRemaining(high, total, elapsed);

    expect(estimateLow).not.toBeNull();
    expect(estimateHigh).not.toBeNull();

    // More completed work means less estimated remaining time
    expect(estimateHigh!).toBeLessThan(estimateLow!);
  }
});

// ─── Law 3: formatProgressLine contains phase, iteration, completed/total ───

test('Law 3: formatProgressLine contains phase, iteration, and completion fraction (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const event = syntheticEvent(next);
    const line = formatProgressLine(event);

    expect(line).toContain(event.phase);
    expect(line).toContain(String(event.iteration));
    expect(line).toContain(`${event.completedScenarios}/${event.totalScenarios}`);
  }
});

// ─── Law 4: serializeProgress produces valid JSON that round-trips ───

test('Law 4: serializeProgress produces valid JSON that round-trips (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const event = syntheticEvent(next);
    const serialized = serializeProgress(event);

    // Must be valid JSON
    const parsed = JSON.parse(serialized) as ProgressEvent;

    // Round-trip: all fields preserved
    expect(parsed.phase).toBe(event.phase);
    expect(parsed.iteration).toBe(event.iteration);
    expect(parsed.completedScenarios).toBe(event.completedScenarios);
    expect(parsed.totalScenarios).toBe(event.totalScenarios);
    expect(parsed.elapsed).toBe(event.elapsed);
    expect(parsed.estimatedRemaining).toBe(event.estimatedRemaining);
    expect(parsed.currentMetrics).toEqual(event.currentMetrics);
  }
});

// ─── Law 5: createProgressEvent fills defaults for missing fields ───

test('Law 5: createProgressEvent fills defaults for missing fields (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const total = 1 + randomInt(next, 100);

    // Minimal input: only totalScenarios
    const event = createProgressEvent({ totalScenarios: total });

    expect(event.phase).toBe('unknown');
    expect(event.iteration).toBe(0);
    expect(event.completedScenarios).toBe(0);
    expect(event.totalScenarios).toBe(total);
    expect(event.currentMetrics).toEqual({});
    expect(event.elapsed).toBe(0);
    expect(event.estimatedRemaining).toBeNull();

    // Partial input: some fields provided
    const phase = randomWord(next);
    const iteration = randomInt(next, 20);
    const partial = createProgressEvent({
      totalScenarios: total,
      phase,
      iteration,
    });

    expect(partial.phase).toBe(phase);
    expect(partial.iteration).toBe(iteration);
    expect(partial.completedScenarios).toBe(0);
    expect(partial.elapsed).toBe(0);
  }
});

// ─── Law 6: Edge cases — zero scenarios, single scenario, all complete ───

test('Law 6: edge cases — zero scenarios, single scenario, all complete (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);

    // Zero total scenarios: percentage should be 0, no crash
    const zeroEvent = createProgressEvent({ totalScenarios: 0 });
    const zeroLine = formatProgressLine(zeroEvent);
    expect(zeroLine).toContain('0/0');
    expect(zeroLine).toContain('0%');

    // Single scenario, not completed
    const singleIncomplete = createProgressEvent({
      totalScenarios: 1,
      completedScenarios: 0,
      elapsed: 5000,
    });
    expect(estimateRemaining(0, 1, 5000)).toBeNull();
    expect(formatProgressLine(singleIncomplete)).toContain('0/1');

    // Single scenario, completed
    const singleComplete = createProgressEvent({
      totalScenarios: 1,
      completedScenarios: 1,
      elapsed: 5000,
      estimatedRemaining: estimateRemaining(1, 1, 5000),
    });
    expect(singleComplete.estimatedRemaining).toBe(0);
    expect(formatProgressLine(singleComplete)).toContain('1/1');
    expect(formatProgressLine(singleComplete)).toContain('100%');

    // All complete: estimateRemaining is 0
    const total = 2 + randomInt(next, 20);
    const elapsed = 1000 + Math.floor(next() * 30000);
    const allComplete = estimateRemaining(total, total, elapsed);
    expect(allComplete).toBe(0);

    // Serialization round-trips for edge cases
    const serialized = serializeProgress(zeroEvent);
    const parsed = JSON.parse(serialized) as typeof zeroEvent;
    expect(parsed.totalScenarios).toBe(0);
    expect(parsed.completedScenarios).toBe(0);
  }
});
