/**
 * Seam Enforcement Laws — the compile-time guard on the three-folder
 * compartmentalization (`docs/v2-direction.md §§1–2`).
 *
 * Three rules:
 *
 *   Rule 1 — No file under `workshop/` imports from `product/` except
 *            through a manifest-declared verb (or the shared
 *            append-only log directories).
 *
 *   Rule 2 — Symmetric for `dashboard/`.
 *
 *   Rule 3 — `product/` never imports from `workshop/` or `dashboard/`.
 *
 * This test is **ratcheting**. Step 0 surfaces pre-existing v1 cross-seam
 * coupling that cannot be resolved without behavior changes — Step 0's
 * premise is "move files, not refactor behavior." The three rules
 * therefore accept a file-level grandfathered allowlist captured at the
 * Step 0 baseline. New violations outside the allowlist fail the build;
 * removed violations tighten the allowlist (manually or via a future
 * regeneration script).
 *
 * As each cross-seam coupling gets refactored in a named later step
 * (Step 1 reference-canon retirement, Step 2 manifest/verb declaration,
 * Step 4b Reasoning port consolidation, etc.), the corresponding file
 * gets removed from the allowlist. The allowlist is therefore a todo
 * ledger, not a permanent carve-out.
 *
 * @see docs/v2-readiness.md §2 for the original design.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');

function walkTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      results.push(...walkTs(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

const IMPORT_REGEX = /^\s*import\s+(?:type\s+)?(?:\{[^}]*\}|[A-Za-z_$][\w$]*|\*\s+as\s+[A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/gm;
const BARE_IMPORT_REGEX = /^\s*import\s+['"]([^'"]+)['"]/gm;
const DYNAMIC_IMPORT_REGEX = /import\(['"]([^'"]+)['"]\)/g;
const EXPORT_FROM_REGEX = /^\s*export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gm;

function extractImports(source: string): string[] {
  const hits: string[] = [];
  for (const m of source.matchAll(IMPORT_REGEX)) hits.push(m[1]!);
  for (const m of source.matchAll(BARE_IMPORT_REGEX)) hits.push(m[1]!);
  for (const m of source.matchAll(DYNAMIC_IMPORT_REGEX)) hits.push(m[1]!);
  for (const m of source.matchAll(EXPORT_FROM_REGEX)) hits.push(m[1]!);
  return hits;
}

function resolveRelative(importerFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const importerDir = path.dirname(importerFile);
  const resolved = path.resolve(importerDir, spec);
  return path.relative(REPO_ROOT, resolved).replace(/\\/g, '/');
}

function importCrossesInto(
  importerFile: string,
  spec: string,
  targetFolder: 'product' | 'workshop' | 'dashboard',
): boolean {
  const rel = resolveRelative(importerFile, spec);
  if (rel === null) return false;
  return rel === targetFolder || rel.startsWith(`${targetFolder}/`);
}

function readManifestAllowlist(): readonly string[] {
  const manifestPath = path.join(REPO_ROOT, 'product', 'manifest', 'manifest.json');
  if (!existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
      verbs?: ReadonlyArray<{ declaredIn?: string }>;
    };
    return (manifest.verbs ?? [])
      .map((v) => v.declaredIn)
      .filter((p): p is string => typeof p === 'string');
  } catch {
    return [];
  }
}

const ALWAYS_ALLOWED_PRODUCT_PATHS: readonly string[] = [
  'product/logs',
  'product/manifest',
];

function isManifestDeclaredOrLogPath(
  importerFile: string,
  spec: string,
  allowlist: readonly string[],
): boolean {
  const rel = resolveRelative(importerFile, spec);
  if (rel === null) return false;
  for (const allowed of ALWAYS_ALLOWED_PRODUCT_PATHS) {
    if (rel === allowed || rel.startsWith(`${allowed}/`)) return true;
  }
  for (const allowed of allowlist) {
    if (rel === allowed || rel.startsWith(`${allowed}/`)) return true;
  }
  return false;
}

// ─── Grandfathered file-level allowlists (Step 0 baseline) ───
//
// These files carry cross-seam imports that pre-date the Step 0 tree
// reshape. The coupling is v1-era; resolving it requires the behavior
// changes that later steps address. As each file's coupling is removed,
// it graduates off the list.

const RULE_1_GRANDFATHERED: ReadonlySet<string> = new Set([
  // workshop/ files that reach into product/ at the Step 0 baseline
  'workshop/convergence/types.ts',
  'workshop/convergence/index.ts',
  'workshop/measurement/baseline-store.ts',
  'workshop/measurement/index.ts',
  'workshop/measurement/score.ts',
  'workshop/learning/learning-bottlenecks.ts',
  'workshop/learning/learning-health.ts',
  'workshop/learning/learning-rankings.ts',
  'workshop/learning/learning-shared.ts',
  'workshop/learning/learning-state.ts',
  'workshop/learning/learning.ts',
  'workshop/learning/signal-maturation.ts',
  'workshop/synthesis/cohort-generator.ts',
  'workshop/synthesis/fixture-extractor.ts',
  'workshop/synthesis/interface-fuzzer.ts',
  'workshop/synthesis/scenario-generator.ts',
  'workshop/policy/approve.ts',
  'workshop/policy/auto-approval.ts',
  'workshop/policy/escalation-policy.ts',
  'workshop/policy/governance-intelligence.ts',
  'workshop/policy/intervention-kernel.ts',
  'workshop/policy/trust-policy.ts',
  'workshop/orchestration/benchmark.ts',
  'workshop/orchestration/clean-slate.ts',
  'workshop/orchestration/compounding-projection.ts',
  'workshop/orchestration/convergence-proof.ts',
  'workshop/orchestration/dogfood-orchestrator.ts',
  'workshop/orchestration/dogfood.ts',
  'workshop/orchestration/dogfood/activation.ts',
  'workshop/orchestration/dogfood/iteration.ts',
  'workshop/orchestration/dogfood/metrics.ts',
  'workshop/orchestration/dogfood/planner.ts',
  'workshop/orchestration/dogfood/reporting.ts',
  'workshop/orchestration/evolve.ts',
  'workshop/orchestration/experiment-registry.ts',
  'workshop/orchestration/fingerprint-stability-probe.ts',
  'workshop/orchestration/fitness.ts',
  'workshop/orchestration/hotspots.ts',
  'workshop/orchestration/improvement-intelligence.ts',
  'workshop/orchestration/improvement.ts',
  'workshop/orchestration/iteration-journal.ts',
  'workshop/orchestration/knob-search.ts',
  'workshop/orchestration/knowledge-coverage.ts',
  'workshop/orchestration/memory-maturity-projection.ts',
  'workshop/orchestration/proposal-intelligence.ts',
  'workshop/orchestration/scorecard.ts',
  'workshop/orchestration/speedrun.ts',
  'workshop/orchestration/strategic-intelligence.ts',
  'workshop/metrics/architecture-fitness.ts',
  'workshop/metrics/cohort.ts',
  'workshop/metrics/compounding.ts',
  'workshop/metrics/fingerprint-stability.ts',
  'workshop/metrics/memory-maturity-trajectory.ts',
  'workshop/metrics/memory-maturity.ts',
  'workshop/metrics/metric/baseline.ts',
  'workshop/metrics/metric/catalogue-discovery.ts',
  'workshop/metrics/metric/catalogue.ts',
  'workshop/metrics/metric/delta.ts',
  'workshop/metrics/metric/tree.ts',
  'workshop/metrics/metric/value.ts',
  'workshop/metrics/metric/visitor.ts',
  'workshop/metrics/metric/visitors/compounding-economics.ts',
  'workshop/metrics/metric/visitors/extraction-ratio.ts',
  'workshop/metrics/metric/visitors/handshake-density.ts',
  'workshop/metrics/metric/visitors/intervention-cost.ts',
  'workshop/metrics/metric/visitors/intervention-marginal-value.ts',
  'workshop/metrics/metric/visitors/memory-worthiness-ratio.ts',
  'workshop/metrics/metric/visitors/rung-distribution.ts',
  'workshop/metrics/metric/visitors-discovery/fidelity.ts',
  'workshop/metrics/outcome-metrics.ts',
  'workshop/metrics/risk-formula.ts',
  'workshop/metrics/risk-weights.ts',
  'workshop/metrics/targets.ts',
  'workshop/metrics/types.ts',
  'workshop/metrics/metric/visitors-discovery/index.ts',
]);

const RULE_2_GRANDFATHERED: ReadonlySet<string> = new Set([
  // dashboard/ files that reach into product/ at the Step 0 baseline
  'dashboard/bridges/cdp-screencast.ts',
  'dashboard/bridges/file-dashboard-port.ts',
  'dashboard/bridges/file-decision-bridge.ts',
  'dashboard/bridges/journal-writer.ts',
  'dashboard/bridges/pipeline-event-bus.ts',
  'dashboard/bridges/runtime-boundary.ts',
  'dashboard/bridges/ws-dashboard-adapter.ts',
  'dashboard/mcp/dashboard-mcp-server.ts',
  'dashboard/mcp/playwright-mcp-bridge.ts',
  'dashboard/mcp/resource-provider.ts',
  'dashboard/server.ts',
  'dashboard/server/config.ts',
  'dashboard/server/http-router.ts',
  'dashboard/server/mcp-tools.ts',
  'dashboard/server/runtime-state.ts',
  'dashboard/server/ws-hub.ts',
  'dashboard/server/infrastructure/file-access.ts',
  // dashboard/src/ is the web UI; it reaches into product/domain/ widely.
  // These are all grandfathered at Step 0.
  'dashboard/src/bookmark-system.ts',
  'dashboard/src/hooks/dashboard-event-observer.ts',
  'dashboard/src/hooks/flywheel-dispatch-handlers.ts',
  'dashboard/src/hooks/use-dashboard-observations.ts',
  'dashboard/src/hooks/use-event-journal.ts',
  'dashboard/src/narration-catalog.ts',
  'dashboard/src/organisms/before-after-comparison.ts',
  'dashboard/src/projections/events/dashboard-event-metadata.ts',
  'dashboard/src/projections/overlays/overlay-geometry.ts',
  'dashboard/src/spatial/scenario-cloud.ts',
  'dashboard/src/spatial/types.ts',
  'dashboard/src/types/events.ts',
]);

const RULE_3_GRANDFATHERED: ReadonlySet<string> = new Set([
  // product/ files that reach into workshop/ or dashboard/ at the Step 0 baseline
  'product/application/agency/agent-workbench.ts',
  'product/application/agency/dashboard-decider.ts',
  'product/application/agency/inbox.ts',
  'product/application/agency/operator.ts',
  'product/application/catalog/workspace-catalog.ts',
  'product/application/commitment/build-proposals.ts',
  'product/application/commitment/replay/replay-evaluation.ts',
  'product/application/commitment/replay/replay-interpretation.ts',
  'product/application/commitment/replay/rerun-plan.ts',
  'product/application/commitment/run.ts',
  'product/application/drift/execution-coherence.ts',
  'product/application/graph/graph.ts',
  'product/application/graph/impact.ts',
  'product/application/knowledge/activate-proposals.ts',
  'product/application/projections/workflow.ts',
  'product/application/resolution/compile.ts',
  'product/cli/commands/approve.ts',
  'product/cli/commands/benchmark.ts',
  'product/cli/commands/bind.ts',
  'product/cli/commands/capture.ts',
  'product/cli/commands/certify.ts',
  'product/cli/commands/compile.ts',
  'product/cli/commands/discover.ts',
  'product/cli/commands/dogfood.ts',
  'product/cli/commands/emit.ts',
  'product/cli/commands/evolve.ts',
  'product/cli/commands/experiments.ts',
  'product/cli/commands/generate.ts',
  'product/cli/commands/graph.ts',
  'product/cli/commands/harvest.ts',
  'product/cli/commands/impact.ts',
  'product/cli/commands/inbox.ts',
  'product/cli/commands/parse.ts',
  'product/cli/commands/paths.ts',
  'product/cli/commands/refresh.ts',
  'product/cli/commands/replay.ts',
  'product/cli/commands/rerun-plan.ts',
  'product/cli/commands/run.ts',
  'product/cli/commands/scorecard.ts',
  'product/cli/commands/surface.ts',
  'product/cli/commands/sync.ts',
  'product/cli/commands/trace.ts',
  'product/cli/commands/types.ts',
  'product/cli/commands/workbench.ts',
  'product/cli/commands/workflow.ts',
  'product/cli/registry.ts',
  'product/cli/shared.ts',
  'product/composition/env.ts',
  'product/composition/layers.ts',
  'product/composition/local-runtime-scenario-runner.ts',
  'product/composition/local-services.ts',
  'product/composition/scenario-context.ts',
  'product/reasoning/agent-interpreter-provider.ts',
  'product/reasoning/translation-provider.ts',
  // Additional product/ files reaching into workshop/ or dashboard/ at Step 0
  'product/domain/improvement/experiment.ts',
  'product/domain/improvement/types.ts',
  'product/domain/kernel/visitors.ts',
  'product/domain/projection/types.ts',
  'product/instruments/catalog/hints-writer.ts',
  'product/instruments/tooling/headed-harness.ts',
]);

function isGrandfathered(file: string, allowlist: ReadonlySet<string>): boolean {
  const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
  return allowlist.has(rel);
}

describe('seam enforcement: import topology across product / workshop / dashboard', () => {
  const manifestAllowlist = readManifestAllowlist();

  test('Rule 1 — no new file under workshop/ imports from product/ outside the Step 0 grandfathered set', () => {
    const files = walkTs(path.join(REPO_ROOT, 'workshop'));
    const violations: string[] = [];
    for (const file of files) {
      if (isGrandfathered(file, RULE_1_GRANDFATHERED)) continue;
      const src = readFileSync(file, 'utf-8');
      for (const spec of extractImports(src)) {
        if (importCrossesInto(file, spec, 'product')) {
          if (!isManifestDeclaredOrLogPath(file, spec, manifestAllowlist)) {
            violations.push(`${path.relative(REPO_ROOT, file)}: forbidden import of "${spec}"`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('Rule 2 — no new file under dashboard/ imports from product/ outside the Step 0 grandfathered set', () => {
    const files = walkTs(path.join(REPO_ROOT, 'dashboard'));
    const violations: string[] = [];
    for (const file of files) {
      if (isGrandfathered(file, RULE_2_GRANDFATHERED)) continue;
      const src = readFileSync(file, 'utf-8');
      for (const spec of extractImports(src)) {
        if (importCrossesInto(file, spec, 'product')) {
          if (!isManifestDeclaredOrLogPath(file, spec, manifestAllowlist)) {
            violations.push(`${path.relative(REPO_ROOT, file)}: forbidden import of "${spec}"`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('Rule 3 — no new file under product/ imports from workshop/ or dashboard/ outside the Step 0 grandfathered set', () => {
    const files = walkTs(path.join(REPO_ROOT, 'product'));
    const violations: string[] = [];
    for (const file of files) {
      if (isGrandfathered(file, RULE_3_GRANDFATHERED)) continue;
      const src = readFileSync(file, 'utf-8');
      for (const spec of extractImports(src)) {
        if (importCrossesInto(file, spec, 'workshop')) {
          violations.push(`${path.relative(REPO_ROOT, file)}: product/ → workshop/ ("${spec}")`);
        }
        if (importCrossesInto(file, spec, 'dashboard')) {
          violations.push(`${path.relative(REPO_ROOT, file)}: product/ → dashboard/ ("${spec}")`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
