import { expect, test } from '@playwright/test';
import {
  REFERENCE_COHORTS,
  REFERENCE_COHORT_TOTAL,
} from '../product/domain/synthesis/reference-cohorts';

// ─── Doctrinal partition: demo IDs vs reference cohort IDs ─────────
//
// dogfood/scenarios/demo/ holds hand-curated golden examples in
// [10000, 20000). dogfood/scenarios/reference/ holds the generated
// cohort corpus in [20000, 30000). The partition is the contract that
// keeps the fifth-kind loop's measurement workload separable from the
// unit-test golden fixtures.
//
// See docs/scenario-partition.md for the doctrinal explanation.

const DEMO_ID_LOW = 10000;
const DEMO_ID_HIGH = 20000;
const REFERENCE_ID_LOW = 20000;
const REFERENCE_ID_HIGH = 30000;

test('reference cohort ID floor stays at 20000', () => {
  const minIdStart = Math.min(...REFERENCE_COHORTS.map((c) => c.idStart));
  expect(minIdStart).toBeGreaterThanOrEqual(REFERENCE_ID_LOW);
});

test('reference cohort IDs stay below 30000', () => {
  const maxIdEnd = Math.max(...REFERENCE_COHORTS.map((c) => c.idStart + c.count));
  expect(maxIdEnd).toBeLessThanOrEqual(REFERENCE_ID_HIGH);
});

test('reference cohort IDs do not overlap demo ID range', () => {
  for (const cohort of REFERENCE_COHORTS) {
    const start = cohort.idStart;
    const end = cohort.idStart + cohort.count;
    // No part of the cohort range may fall inside [DEMO_ID_LOW, DEMO_ID_HIGH).
    const overlapsDemo = start < DEMO_ID_HIGH && end > DEMO_ID_LOW;
    expect(overlapsDemo).toBe(false);
  }
});

test('reference cohort total fits within the reserved range', () => {
  // [20000, 30000) gives 10000 IDs of headroom; the current 12 cohorts
  // use only 240. This test pins the headroom so future cohort growth
  // is intentional, not accidental.
  const reservedSize = REFERENCE_ID_HIGH - REFERENCE_ID_LOW;
  expect(REFERENCE_COHORT_TOTAL).toBeLessThanOrEqual(reservedSize);
});

test('all reference cohort IDs are deterministically inside [20000, 20240)', () => {
  // Pins the current cohort layout. If a new cohort is added, this
  // test must be updated alongside REFERENCE_COHORTS — that's the
  // forcing function that makes cohort growth a deliberate act.
  for (const cohort of REFERENCE_COHORTS) {
    expect(cohort.idStart).toBeGreaterThanOrEqual(20000);
    expect(cohort.idStart + cohort.count).toBeLessThanOrEqual(20240);
  }
});
