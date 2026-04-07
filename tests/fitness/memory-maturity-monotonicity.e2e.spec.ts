/**
 * End-to-end: memory-maturity monotonicity under real catalog growth.
 *
 * `memory-maturity.laws.spec.ts` proves `computeMemoryMaturity` is
 * monotone in its inputs. This test proves the PROJECTION layer
 * (`projectMemoryMaturityCounts`) actually picks up real changes in a
 * real catalog — the producer → consumer chain that unit tests cannot
 * observe.
 *
 * Scenario:
 *   1. Refresh a scenario → baseline maturity count
 *   2. Run a dogfood iteration → maturity count unchanged or increased
 *      (the loop may add proposals but they're not all activated)
 *   3. Inject a new approved knowledge entry into the catalog
 *   4. Re-project maturity → count MUST be strictly greater
 *
 * This test will fail if:
 *   - `projectMemoryMaturityCounts` ignores `screenBundles[*].elements`
 *   - The `isApprovedElement` predicate regresses
 *   - The catalog loader stops picking up newly-written knowledge files
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import YAML from 'yaml';
import { Effect } from 'effect';
import { expect, test } from '@playwright/test';
import { loadWorkspaceCatalog } from '../../lib/application/catalog';
import { runDogfoodLoop } from '../../lib/application/improvement/dogfood';
import { projectMemoryMaturityCounts } from '../../lib/application/improvement/memory-maturity-projection';
import { refreshScenario } from '../../lib/application/resolution/refresh';
import { runWithLocalServices } from '../../lib/composition/local-services';
import { createAdoId } from '../../lib/domain/kernel/identity';
import {
  compareMaturity,
  computeMemoryMaturity,
} from '../../lib/domain/fitness/memory-maturity';
import { createTestWorkspace } from '../support/workspace';

test('memory maturity strictly increases when a new approved element is added', async () => {
  test.setTimeout(180_000);
  const ws = createTestWorkspace('maturity-monotone');
  try {
    // Step 1: refresh + baseline
    await runWithLocalServices(refreshScenario({ adoId: createAdoId('10001'), paths: ws.paths }), ws.rootDir);

    const baselineCounts = await runWithLocalServices(
      Effect.gen(function* () {
        const catalog = yield* loadWorkspaceCatalog({ paths: ws.paths, scope: 'post-run' });
        return projectMemoryMaturityCounts(catalog);
      }),
      ws.rootDir,
    );
    expect(baselineCounts.approvedElements).toBeGreaterThan(0);
    const baselineMaturity = computeMemoryMaturity(baselineCounts);
    const baselineTotal = baselineCounts.approvedElements
      + baselineCounts.promotedPatterns
      + baselineCounts.approvedRouteVariants;

    // Step 2: run a dogfood iteration (may add proposals that activate,
    // never shrinks the catalog)
    await runWithLocalServices(
      runDogfoodLoop({ paths: ws.paths, maxIterations: 1, interpreterMode: 'diagnostic' }),
      ws.rootDir,
    );
    const afterLoopCounts = await runWithLocalServices(
      Effect.gen(function* () {
        const catalog = yield* loadWorkspaceCatalog({ paths: ws.paths, scope: 'post-run' });
        return projectMemoryMaturityCounts(catalog);
      }),
      ws.rootDir,
    );
    const afterLoopMaturity = computeMemoryMaturity(afterLoopCounts);
    // Monotone: loop may add but never remove approved entries
    expect(compareMaturity(afterLoopMaturity, baselineMaturity)).toBeGreaterThanOrEqual(0);

    // Step 3: inject a brand-new approved element into the `policy-search`
    // hints file. We append a new element rather than creating a new
    // screen to avoid needing to fabricate matching elements/behavior/
    // postures files — the existing policy-search bundle has all four
    // companion files, so injecting into the hints file is sufficient.
    const hintsPath = path.join(ws.rootDir, 'dogfood', 'knowledge', 'screens', 'policy-search.hints.yaml');
    const hintsText = readFileSync(hintsPath, 'utf8').replace(/^\uFEFF/, '');
    const hints = YAML.parse(hintsText);
    hints.elements = hints.elements ?? {};
    // A synthetic element that the projection's `isApprovedElement`
    // predicate will count (has a non-empty alias AND a role).
    hints.elements['e2eInjectedElement'] = {
      aliases: ['e2e injected marker'],
      role: 'button',
      affordance: 'click',
    };
    writeFileSync(hintsPath, YAML.stringify(hints), 'utf8');

    // Companion elements file must also describe the element, otherwise
    // the catalog validator rejects the screen bundle.
    const elementsPath = path.join(ws.rootDir, 'dogfood', 'knowledge', 'screens', 'policy-search.elements.yaml');
    const elementsText = readFileSync(elementsPath, 'utf8').replace(/^\uFEFF/, '');
    const elements = YAML.parse(elementsText);
    elements.elements = elements.elements ?? {};
    elements.elements['e2eInjectedElement'] = {
      role: 'button',
      name: 'E2E Injected',
      testId: 'e2e-injected-btn',
      surface: 'search-actions',
      widget: 'os-button',
      required: false,
    };
    writeFileSync(elementsPath, YAML.stringify(elements), 'utf8');

    // Step 4: re-project maturity — MUST be strictly greater
    const afterInjectCounts = await runWithLocalServices(
      Effect.gen(function* () {
        const catalog = yield* loadWorkspaceCatalog({ paths: ws.paths, scope: 'post-run' });
        return projectMemoryMaturityCounts(catalog);
      }),
      ws.rootDir,
    );
    const afterInjectTotal = afterInjectCounts.approvedElements
      + afterInjectCounts.promotedPatterns
      + afterInjectCounts.approvedRouteVariants;
    expect(afterInjectTotal).toBeGreaterThan(baselineTotal);

    const afterInjectMaturity = computeMemoryMaturity(afterInjectCounts);
    expect(compareMaturity(afterInjectMaturity, baselineMaturity)).toBe(1);
  } finally {
    ws.cleanup();
  }
});

test('memory maturity projection is stable across identical catalog reads', async () => {
  const ws = createTestWorkspace('maturity-stable');
  try {
    await runWithLocalServices(refreshScenario({ adoId: createAdoId('10001'), paths: ws.paths }), ws.rootDir);

    const readOnce = () =>
      runWithLocalServices(
        Effect.gen(function* () {
          const catalog = yield* loadWorkspaceCatalog({ paths: ws.paths, scope: 'post-run' });
          return projectMemoryMaturityCounts(catalog);
        }),
        ws.rootDir,
      );

    const a = await readOnce();
    const b = await readOnce();

    // Deterministic projection: identical inputs → identical outputs
    expect(a.approvedElements).toBe(b.approvedElements);
    expect(a.promotedPatterns).toBe(b.promotedPatterns);
    expect(a.approvedRouteVariants).toBe(b.approvedRouteVariants);
  } finally {
    ws.cleanup();
  }
});
