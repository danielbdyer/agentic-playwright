import { expect, test } from '@playwright/test';
import {
  orchestrateCohorts,
  findCohortIdOverlaps,
} from '../product/domain/synthesis/cohort-orchestrator';
import {
  REFERENCE_COHORTS,
  REFERENCE_COHORT_TOTAL,
} from '../product/domain/synthesis/reference-cohorts';
import type { CohortDefinition } from '../product/domain/synthesis/cohort-plan';
import type { SyntheticCatalogPlanInput } from '../product/domain/synthesis/scenario-plan';

// ─── Catalog fixture (mirrors synthesis-scenario-plan) ─────────────

const CATALOG: SyntheticCatalogPlanInput = {
  screens: [
    {
      screenId: 'policy-search',
      screenAliases: ['policy search'],
      elements: [
        { elementId: 'policyNumberInput', widget: 'os-input', aliases: ['policy number', 'search field'], required: true },
        { elementId: 'searchButton', widget: 'os-button', aliases: ['search button', 'search'], required: true },
        { elementId: 'resultsTable', widget: 'os-table', aliases: ['search results'], required: false },
      ],
    },
    {
      screenId: 'policy-detail',
      screenAliases: ['policy detail'],
      elements: [
        { elementId: 'policyNumber', widget: 'os-region', aliases: ['policy number'], required: false },
        { elementId: 'policyStatus', widget: 'os-region', aliases: ['policy status'], required: false },
        { elementId: 'effectiveDate', widget: 'os-region', aliases: ['effective date'], required: false },
      ],
    },
    {
      screenId: 'policy-amendment',
      screenAliases: ['amendment'],
      elements: [
        { elementId: 'amendmentStatus', widget: 'os-region', aliases: ['amendment status'], required: false },
        { elementId: 'reviewButton', widget: 'os-button', aliases: ['review'], required: true },
      ],
    },
  ],
};

const FIXED_TIMESTAMP = '2026-04-07T00:00:00.000Z';
const MASTER = 'test-master';

// ─── Reference cohort sanity ─────────────────────────────────────

test('REFERENCE_COHORTS has 12 entries', () => {
  expect(REFERENCE_COHORTS).toHaveLength(12);
});

test('REFERENCE_COHORT_TOTAL equals sum of cohort counts', () => {
  expect(REFERENCE_COHORT_TOTAL).toBe(
    REFERENCE_COHORTS.reduce((acc, c) => acc + c.count, 0),
  );
});

test('REFERENCE_COHORTS occupy contiguous non-overlapping ID ranges', () => {
  expect(findCohortIdOverlaps(REFERENCE_COHORTS)).toHaveLength(0);
});

test('REFERENCE_COHORTS cohortIds are unique', () => {
  const ids = REFERENCE_COHORTS.map((c) => c.cohortId);
  expect(new Set(ids).size).toBe(ids.length);
});

test('REFERENCE_COHORTS seedSuffixes are unique', () => {
  const suffixes = REFERENCE_COHORTS.map((c) => c.seedSuffix);
  expect(new Set(suffixes).size).toBe(suffixes.length);
});

// ─── Overlap detector ────────────────────────────────────────────

test('findCohortIdOverlaps detects two ranges that share IDs', () => {
  const cohorts: readonly CohortDefinition[] = [
    {
      cohortId: 'a',
      description: '',
      idStart: 100,
      count: 20,
      perturbation: { lexicalGap: 0, dataVariation: 0, coverageGap: 0, crossScreen: 0 },
      seedSuffix: 'a',
    },
    {
      cohortId: 'b',
      description: '',
      idStart: 110,
      count: 20,
      perturbation: { lexicalGap: 0, dataVariation: 0, coverageGap: 0, crossScreen: 0 },
      seedSuffix: 'b',
    },
  ];
  const overlaps = findCohortIdOverlaps(cohorts);
  expect(overlaps).toHaveLength(1);
  expect(overlaps[0]).toMatchObject({
    cohortA: 'a',
    cohortB: 'b',
    overlapStart: 110,
    overlapEnd: 120,
  });
});

test('findCohortIdOverlaps returns empty when ranges are adjacent but disjoint', () => {
  const cohorts: readonly CohortDefinition[] = [
    {
      cohortId: 'a',
      description: '',
      idStart: 100,
      count: 20,
      perturbation: { lexicalGap: 0, dataVariation: 0, coverageGap: 0, crossScreen: 0 },
      seedSuffix: 'a',
    },
    {
      cohortId: 'b',
      description: '',
      idStart: 120,
      count: 20,
      perturbation: { lexicalGap: 0, dataVariation: 0, coverageGap: 0, crossScreen: 0 },
      seedSuffix: 'b',
    },
  ];
  expect(findCohortIdOverlaps(cohorts)).toHaveLength(0);
});

// ─── Orchestrator: shape and counts ──────────────────────────────

test('orchestrator generates one group per cohort', () => {
  const result = orchestrateCohorts({
    cohorts: REFERENCE_COHORTS,
    masterSeed: MASTER,
    catalog: CATALOG,
    generatedAt: FIXED_TIMESTAMP,
  });
  expect(result.groups).toHaveLength(REFERENCE_COHORTS.length);
});

test('orchestrator total scenario count matches expected', () => {
  const result = orchestrateCohorts({
    cohorts: REFERENCE_COHORTS,
    masterSeed: MASTER,
    catalog: CATALOG,
    generatedAt: FIXED_TIMESTAMP,
  });
  expect(result.totalScenarios).toBe(REFERENCE_COHORT_TOTAL);
});

test('orchestrator assigns adoIds within each cohort\'s declared range', () => {
  const result = orchestrateCohorts({
    cohorts: REFERENCE_COHORTS,
    masterSeed: MASTER,
    catalog: CATALOG,
    generatedAt: FIXED_TIMESTAMP,
  });
  for (const group of result.groups) {
    const start = group.cohort.idStart;
    const end = start + group.cohort.count;
    for (const plan of group.plans) {
      const id = parseInt(plan.adoId, 10);
      expect(id).toBeGreaterThanOrEqual(start);
      expect(id).toBeLessThan(end);
    }
  }
});

test('orchestrator adoIds are globally unique across cohorts', () => {
  const result = orchestrateCohorts({
    cohorts: REFERENCE_COHORTS,
    masterSeed: MASTER,
    catalog: CATALOG,
    generatedAt: FIXED_TIMESTAMP,
  });
  const allIds = result.groups.flatMap((g) => g.plans.map((p) => p.adoId));
  expect(new Set(allIds).size).toBe(allIds.length);
});

// ─── Determinism ─────────────────────────────────────────────────

test('orchestrator is deterministic — identical inputs produce identical manifests', () => {
  const a = orchestrateCohorts({
    cohorts: REFERENCE_COHORTS,
    masterSeed: MASTER,
    catalog: CATALOG,
    generatedAt: FIXED_TIMESTAMP,
  });
  const b = orchestrateCohorts({
    cohorts: REFERENCE_COHORTS,
    masterSeed: MASTER,
    catalog: CATALOG,
    generatedAt: FIXED_TIMESTAMP,
  });
  expect(JSON.stringify(a.manifest)).toBe(JSON.stringify(b.manifest));
});

test('orchestrator: changing master seed changes the aggregate hash', () => {
  const a = orchestrateCohorts({
    cohorts: REFERENCE_COHORTS,
    masterSeed: 'seed-a',
    catalog: CATALOG,
    generatedAt: FIXED_TIMESTAMP,
  });
  const b = orchestrateCohorts({
    cohorts: REFERENCE_COHORTS,
    masterSeed: 'seed-b',
    catalog: CATALOG,
    generatedAt: FIXED_TIMESTAMP,
  });
  expect(a.manifest.contentHash).not.toBe(b.manifest.contentHash);
});

test('orchestrator: per-cohort hash is stable across regenerations', () => {
  const a = orchestrateCohorts({
    cohorts: REFERENCE_COHORTS,
    masterSeed: MASTER,
    catalog: CATALOG,
    generatedAt: FIXED_TIMESTAMP,
  });
  const b = orchestrateCohorts({
    cohorts: REFERENCE_COHORTS,
    masterSeed: MASTER,
    catalog: CATALOG,
    generatedAt: '2099-12-31T23:59:59.999Z', // different timestamp
  });
  for (let i = 0; i < a.groups.length; i++) {
    expect(a.groups[i]!.manifestEntry.contentHash).toBe(b.groups[i]!.manifestEntry.contentHash);
  }
  // Aggregate hash is also independent of timestamp.
  expect(a.manifest.contentHash).toBe(b.manifest.contentHash);
});

test('orchestrator: changing one cohort suffix only invalidates that cohort\'s hash', () => {
  const baseline = orchestrateCohorts({
    cohorts: REFERENCE_COHORTS,
    masterSeed: MASTER,
    catalog: CATALOG,
    generatedAt: FIXED_TIMESTAMP,
  });
  const tweaked: readonly CohortDefinition[] = REFERENCE_COHORTS.map((cohort, index) =>
    index === 0 ? { ...cohort, seedSuffix: 'mutated' } : cohort,
  );
  const after = orchestrateCohorts({
    cohorts: tweaked,
    masterSeed: MASTER,
    catalog: CATALOG,
    generatedAt: FIXED_TIMESTAMP,
  });
  expect(after.groups[0]!.manifestEntry.contentHash).not.toBe(
    baseline.groups[0]!.manifestEntry.contentHash,
  );
  for (let i = 1; i < after.groups.length; i++) {
    expect(after.groups[i]!.manifestEntry.contentHash).toBe(
      baseline.groups[i]!.manifestEntry.contentHash,
    );
  }
  // Aggregate hash changes because cohort 0 changed.
  expect(after.manifest.contentHash).not.toBe(baseline.manifest.contentHash);
});

// ─── Manifest shape ──────────────────────────────────────────────

test('manifest tags kind/version literally', () => {
  const result = orchestrateCohorts({
    cohorts: REFERENCE_COHORTS,
    masterSeed: MASTER,
    catalog: CATALOG,
    generatedAt: FIXED_TIMESTAMP,
  });
  expect(result.manifest.kind).toBe('cohort-manifest');
  expect(result.manifest.version).toBe(1);
  expect(result.manifest.masterSeed).toBe(MASTER);
  expect(result.manifest.totalScenarios).toBe(REFERENCE_COHORT_TOTAL);
});

test('per-cohort manifest entry preserves cohort metadata', () => {
  const result = orchestrateCohorts({
    cohorts: REFERENCE_COHORTS,
    masterSeed: MASTER,
    catalog: CATALOG,
    generatedAt: FIXED_TIMESTAMP,
  });
  for (let i = 0; i < REFERENCE_COHORTS.length; i++) {
    const cohort = REFERENCE_COHORTS[i]!;
    const entry = result.groups[i]!.manifestEntry;
    expect(entry.cohortId).toBe(cohort.cohortId);
    expect(entry.idStart).toBe(cohort.idStart);
    expect(entry.count).toBe(cohort.count);
    expect(entry.seed).toBe(`${MASTER}:${cohort.seedSuffix}`);
    expect(entry.archetypePreference).toEqual(cohort.archetypePreference ?? null);
  }
});

// ─── Archetype preference threading ──────────────────────────────

test('archetype preference cohort yields suite labels under reference/{cohortId}', () => {
  const result = orchestrateCohorts({
    cohorts: REFERENCE_COHORTS.filter((c) => c.cohortId === 'archetype-mix'),
    masterSeed: MASTER,
    catalog: CATALOG,
    generatedAt: FIXED_TIMESTAMP,
  });
  expect(result.groups).toHaveLength(1);
  for (const plan of result.groups[0]!.plans) {
    expect(plan.suite).toBe('reference/archetype-mix');
  }
});
