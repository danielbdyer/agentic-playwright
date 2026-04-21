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
  // The shared append-only log set (v2 §2: "manifest-declared verbs
  // and the shared log set").
  'product/logs',
  // The manifest JSON + declaration runtime.
  'product/manifest',
  // The manifest SHAPE type itself — workshop/dashboard need to
  // type-check against the manifest envelope and verb entries.
  // Per `docs/v2-direction.md §2`, the manifest is half of the seam;
  // the type definitions at product/domain/manifest/ are the
  // compile-time half of that contract.
  'product/domain/manifest',
  // Dashboard projection types + MCP tool contract. product/ emits
  // DashboardEvent, WorkItemDecision, McpToolDefinition, etc.;
  // dashboard/ hosts the view layer + MCP server that consumes them.
  // This is a seam contract in the same sense as the manifest —
  // both sides must type-check against it.
  'product/domain/observation/dashboard',
  // Effect Context Tag definitions. The runtime DI seam:
  // workshop/orchestration and dashboard/server consume these Tags
  // to access product services (FileSystem, Dashboard, McpServer,
  // RuntimeScenarioRunner, etc.). Without this allowance, every
  // dashboard/workshop file that does `yield* FileSystem` would
  // need to be grandfathered.
  'product/application/ports',
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
  // workshop/ files that reach into product/ at the Step 0 baseline.
  //
  // Graduations removed at step-4b.cleanup.5 after audit:
  //  - 26 files whose current imports no longer reach into product/
  //    (mostly workshop/metrics/* visitor modules that were
  //    already structurally clean at Step 0 but got swept in).
  //  - 6 stale entries for deleted files (workshop/orchestration/
  //    dogfood/{activation,iteration,metrics,planner,reporting}.ts
  //    were never moved in with the dogfood.ts parent, and
  //    workshop/policy/escalation-policy.ts retired at cleanup.4).

  'workshop/convergence/types.ts',
  'workshop/measurement/baseline-store.ts',
  'workshop/measurement/score.ts',
  'workshop/learning/learning-bottlenecks.ts',
  'workshop/learning/learning-health.ts',
  'workshop/learning/learning-rankings.ts',
  'workshop/learning/learning-shared.ts',
  'workshop/learning/learning-state.ts',
  'workshop/learning/learning.ts',
  'workshop/learning/signal-maturation.ts',
  'workshop/synthesis/cohort-generator.ts',
  'workshop/synthesis/interface-fuzzer.ts',
  'workshop/synthesis/scenario-generator.ts',
  'workshop/policy/approve.ts',
  'workshop/policy/auto-approval.ts',
  'workshop/policy/governance-intelligence.ts',
  'workshop/policy/intervention-kernel.ts',
  'workshop/policy/trust-policy.ts',
  'workshop/orchestration/benchmark.ts',
  'workshop/orchestration/clean-slate.ts',
  'workshop/orchestration/convergence-proof.ts',
  'workshop/orchestration/dogfood-orchestrator.ts',
  'workshop/orchestration/dogfood.ts',
  'workshop/orchestration/evolve.ts',
  'workshop/orchestration/experiment-registry.ts',
  'workshop/orchestration/fingerprint-stability-probe.ts',
  'workshop/orchestration/fitness.ts',
  'workshop/orchestration/hotspots.ts',
  'workshop/orchestration/improvement-intelligence.ts',
  'workshop/orchestration/improvement.ts',
  'workshop/orchestration/knob-search.ts',
  'workshop/orchestration/knowledge-coverage.ts',
  'workshop/orchestration/memory-maturity-projection.ts',
  'workshop/orchestration/proposal-intelligence.ts',
  'workshop/orchestration/scorecard.ts',
  'workshop/orchestration/speedrun.ts',
  'workshop/orchestration/strategic-intelligence.ts',
  'workshop/metrics/metric/value.ts',
  'workshop/metrics/metric/visitors-discovery/fidelity.ts',
  'workshop/metrics/risk-formula.ts',
  'workshop/metrics/types.ts',
  'workshop/metrics/metric/visitors-discovery/index.ts',
]);

const RULE_2_GRANDFATHERED: ReadonlySet<string> = new Set([
  // dashboard/ files that reach into product/ at the Step 0 baseline.
  //
  // Graduation history:
  //  - step-4b.cleanup.5: removed 7 dashboard server / bridge files
  //    that no longer import from product/.
  //  - step-4b.step-4c-slice: removed 11 more after expanding
  //    ALWAYS_ALLOWED_PRODUCT_PATHS with the shared-contract modules
  //    (product/domain/observation/dashboard + product/application/ports).

  // dashboard/ files still reaching into product/ paths outside the
  // shared-contract allowlist. Each retires when its specific
  // dependency either moves to a contract path or retires.
  'dashboard/bridges/pipeline-event-bus.ts',
  'dashboard/bridges/ws-dashboard-adapter.ts',
  'dashboard/mcp/dashboard-mcp-server.ts',
  'dashboard/mcp/playwright-mcp-bridge.ts',
  'dashboard/server.ts',
  // dashboard/src/ is the web UI; it reaches into product/domain/ widely.
  // These are grandfathered at Step 0 pending the full dashboard/src/
  // projection rewrite (beyond the Step 4c slice).
  'dashboard/src/bookmark-system.ts',
  'dashboard/src/hooks/dashboard-event-observer.ts',
  'dashboard/src/hooks/use-dashboard-observations.ts',
  'dashboard/src/hooks/use-event-journal.ts',
  'dashboard/src/organisms/before-after-comparison.ts',
  'dashboard/src/spatial/scenario-cloud.ts',
  'dashboard/src/spatial/types.ts',
]);

const RULE_3_GRANDFATHERED: ReadonlySet<string> = new Set([
  // product/ files that reach into workshop/ or dashboard/ at the Step 0 baseline.
  //
  // NOTE: 29 entries graduated at step-4b.cleanup.5 after audit showed
  // they no longer carry cross-seam imports (all of the CLI commands
  // that only consumed workshop-side helpers at Step 0 now import
  // from product/ only; the composition modules stopped needing
  // workshop/learning after Step 1's reference-canon retirement; the
  // reasoning ports retired at step-4b.retirement). The entries
  // remaining below still carry live cross-seam imports — their
  // retirement waits on the corresponding workshop/dashboard reshape.

  // product/application/agency/agent-workbench.ts — imports from
  //   workshop/learning/learning-shared. (hotspots graduated when
  //   hotspots.ts moved to product/application/projections/ —
  //   inbox and operator graduated at the same time.)
  'product/application/agency/agent-workbench.ts',
  // product/application/catalog/workspace-catalog.ts —
  //   workshop/orchestration/improvement.
  'product/application/catalog/workspace-catalog.ts',
  // product/application/commitment/build-proposals.ts —
  //   workshop/policy/trust-policy.
  'product/application/commitment/build-proposals.ts',
  'product/application/commitment/replay/replay-evaluation.ts',
  'product/application/commitment/replay/replay-interpretation.ts',
  'product/application/commitment/replay/rerun-plan.ts',
  'product/application/commitment/run.ts',
  'product/application/drift/execution-coherence.ts',
  'product/application/graph/graph.ts',
  'product/application/knowledge/activate-proposals.ts',
  'product/application/projections/workflow.ts',
  // product/application/resolution/compile.ts — workshop/learning/learning.
  'product/application/resolution/compile.ts',
  'product/cli/commands/approve.ts',
  'product/cli/commands/benchmark.ts',
  'product/cli/commands/certify.ts',
  'product/cli/commands/dogfood.ts',
  'product/cli/commands/evolve.ts',
  'product/cli/commands/experiments.ts',
  'product/cli/commands/generate.ts',
  'product/cli/commands/scorecard.ts',
  'product/composition/local-services.ts',
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
