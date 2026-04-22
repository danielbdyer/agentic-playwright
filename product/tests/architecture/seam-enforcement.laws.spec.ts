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
  // Fitness types. Product-domain concepts that describe what's
  // measured (pipeline failure classes, improvement targets, proof
  // obligations, the scorecard shape). Workshop is the producer of
  // measurements; product emits the concepts that workshop measures
  // against. Moved out of workshop/metrics/types at step-4c.fitness-
  // sweep so product/domain/* can depend on them without crossing
  // into workshop/.
  'product/domain/fitness',
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
  // Manifest invoker — the handler-registry surface that binds
  // manifest-verb invocations to their runtime implementations.
  // Dashboard MCP server (and any future MCP host) imports this to
  // construct + consume the handler registry. Part of the manifest
  // seam contract (dashboard routes manifest-verb MCP tool calls
  // through this invoker), analogous to product/domain/manifest.
  'product/application/manifest',
  // Shared error hierarchy. TesseractError is the base class every
  // product service throws. workshop measurement code + dashboard
  // MCP servers both catch and log these errors at their boundaries;
  // without this allowance every file that says
  // `error instanceof TesseractError` would need grandfathering.
  'product/domain/kernel/errors',
  // Fingerprint<Tag> phantom registry + stableStringify. Every
  // cross-seam artifact carries a Fingerprint tagged against the
  // closed 30+ tag registry; workshop receipts + dashboard renders
  // alike need `fingerprintFor` + `taggedFingerprintFor` to mint
  // envelope identities. Infrastructure utility, not domain logic
  // — same justification as the error hierarchy.
  'product/domain/kernel/hash',
  // Retry schedule + resilience utilities. Every MCP server and
  // workshop probe that runs against flaky upstream services
  // reuses the named RETRY_POLICIES. Infrastructure utility, not
  // domain logic — same justification as the error hierarchy.
  'product/application/resilience',
  // CLI command contract. The user-facing CLI is an entry-point
  // concern: product/cli/shared.ts defines the CommandName union,
  // ParsedFlags, createCommandSpec, the shared flag descriptor
  // table, and the require* helpers. Both product/cli/commands/
  // and workshop/cli/commands/ extend this contract to contribute
  // command specs; the composed registry is assembled at the
  // entry point (bin/cli-registry.ts) and passed into
  // parseCliInvocation. Analogous to the manifest seam — the
  // shared vocabulary both sides type-check against. Graduated
  // the 6 workshop-orchestration commands off RULE_3 at
  // step-4c.cli-split.
  'product/cli/shared',
  // CLI parser + registry contract. The workshop CLI surface
  // imports the CliCommandRegistry type from the parser module
  // so its contribution can be composed into the merged
  // registry; the entry point (bin/cli-registry.ts) likewise
  // imports the type plus productCommandRegistry for merging.
  'product/cli/registry',
  // Improvement / experiment domain types. ExperimentRecord,
  // ImprovementRun, ImprovementLedger, SubstrateContext,
  // PipelineConfig deltas, SpeedrunProgressEvent —
  // recursive-improvement vocabulary that product emits and
  // workshop consumes wholesale (fitness, convergence-proof,
  // evolve, dogfood, benchmark, experiment-registry, CLI
  // experiments command all type-check against these). Pure
  // type definitions; no side effects. Shared-contract per
  // v2 §2 ("manifest-declared verbs and the shared log set").
  'product/domain/improvement',
  // Projection types. The shapes workshop produces and dashboard
  // renders: SceneState, FlywheelAct, SummaryView, ActIndicator,
  // BindingDistribution, IterationTimeline, ConvergenceFinale,
  // SurfaceOverlay, SpeedTier. "Projection" = read-model, the
  // view-layer contract between the measurement pipeline and the
  // render surface. Pure types + pure derivation functions; no
  // side effects. Dashboard's 7 grandfathered web UI files all
  // import from this subtree; workshop's projections emit into
  // it. Shared-contract, same justification as manifest.
  'product/domain/projection',
  // Proposal domain types. ProposalBundle, cluster types,
  // failure fragments, batch decision, activation lifecycle —
  // the shape of proposals that workshop produces and dashboard
  // renders in the batch-decision / failure-fragment views.
  'product/domain/proposal',
  // Handshake / intervention types. AgentWorkItem,
  // ScreenGroupContext, InterventionHandoff, WorkItemCompletion —
  // the shape of the agent-in-loop queue that dashboard renders
  // and workshop derives. Pure type definitions.
  'product/domain/handshake',
  // Governance types. WorkflowEnvelope, Governance enum,
  // KnowledgePosture, TrustPolicy, workflow-facade primitives.
  // Every cross-seam artifact carries a Governance tag; every
  // envelope declares its WorkflowMetadata<Stage>. Without this
  // allowance, every dashboard/workshop file that reads an
  // envelope would need grandfathering.
  'product/domain/governance',
  // Playwright tooling — launchHeadedHarness + createPlaywrightBridge
  // etc. These are infrastructure for running Playwright, not domain.
  // Dashboard uses them to expose browser MCP tools; workshop's
  // rung-3 substrate (playwright-live-harness) uses them to launch
  // the Chromium instance that renders the synthetic substrate. Pure
  // Playwright adapter utilities with no product-domain entanglement
  // — shared-contract, same justification as product/domain/kernel/hash.
  'product/instruments/tooling',
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
  // Graduation history:
  //  - step-4b.cleanup.5: 26 files graduated + 6 stale entries
  //    removed (deleted dogfood sub-files + escalation-policy).
  //  - step-4c.rule3-sweep: workshop/policy/* + workshop/learning/*
  //    directories MOVED to product/application/{policy,learning}/;
  //    12 entries removed here (files no longer exist in workshop/).
  //    hotspots.ts also moved at step-4b.cleanup.6.

  // workshop/convergence/types.ts — graduated at step-4c.cli-split
  // after product/domain/improvement moved to ALWAYS_ALLOWED as a
  // shared-contract path; file now imports only shared-contract
  // paths (product/domain/fitness + product/domain/improvement).
  'workshop/measurement/baseline-store.ts',
  'workshop/measurement/score.ts',
  'workshop/synthesis/cohort-generator.ts',
  'workshop/synthesis/interface-fuzzer.ts',
  'workshop/synthesis/scenario-generator.ts',
  'workshop/orchestration/benchmark.ts',
  'workshop/orchestration/clean-slate.ts',
  'workshop/orchestration/convergence-proof.ts',
  // workshop/orchestration/dogfood-orchestrator.ts — graduated at
  // step-4c.dashboard-src-graduate along with the domain/projection
  // expansion; its only cross-seam import is now shared-contract.
  'workshop/orchestration/dogfood.ts',
  'workshop/orchestration/evolve.ts',
  'workshop/orchestration/experiment-registry.ts',
  'workshop/orchestration/fingerprint-stability-probe.ts',
  'workshop/orchestration/fitness.ts',
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
  // dashboard/mcp/dashboard-mcp-server.ts graduated at
  // step-4c.graduate: its imports now route through the shared-
  // contract allowlist (product/domain/kernel/errors for
  // TesseractError, product/application/resilience for retry
  // utilities, plus the already-allowed manifest / ports paths).
  // dashboard/mcp/playwright-mcp-bridge.ts DELETED at
  // step-4c.headed-harness-graduate: factory logic moved to
  // product/instruments/tooling/playwright-bridge.ts; remaining
  // dashboard consumers now import port types directly from
  // product/application/ports.
  'dashboard/server.ts',
  // dashboard/src/ graduated at step-4c.dashboard-src-graduate:
  // the 7 web UI files that imported from product/domain/
  // {projection,proposal,handshake,governance} now route through
  // ALWAYS_ALLOWED_PRODUCT_PATHS (those four subtrees added as
  // shared-contract view-layer type paths). No code changed;
  // the policy expanded to match the reality that dashboard/src/
  // is a view of pure product domain types.
]);

const RULE_3_GRANDFATHERED: ReadonlySet<string> = new Set([
  // product/ files that reach into workshop/ or dashboard/ at the Step 0 baseline.
  //
  // Graduation history:
  //  - step-4b.cleanup.5: 29 entries graduated after cross-seam
  //    imports retired during earlier cleanups.
  //  - step-4b.cleanup.6: hotspots.ts moved to
  //    product/application/projections/; inbox + operator graduated.
  //  - step-4c.rule3-sweep: workshop/policy/* + workshop/learning/*
  //    directories MOVED to product/application/{policy,learning}/;
  //    12 product files graduated (agent-workbench, build-proposals,
  //    run, activate-proposals, compile, drift/execution-coherence,
  //    graph/graph, knowledge/activate-proposals, replay-evaluation,
  //    rerun-plan, projections/workflow, cli/commands/approve,
  //    cli/commands/certify).
  //  - step-4c.cli-split: 6 CLI commands that orchestrate workshop
  //    surfaces (benchmark, scorecard, dogfood, evolve, experiments,
  //    generate) MOVED to workshop/cli/commands/. parseCliInvocation
  //    now accepts a registry parameter; the entry point
  //    (bin/cli-registry.ts) composes product + workshop command
  //    registries. product/cli/shared + product/cli/registry added
  //    to ALWAYS_ALLOWED_PRODUCT_PATHS as the shared CLI contract.
  //  - step-4c.replay-sever: replayInterpretation stopped calling
  //    projectBenchmarkScorecard after core replay. Users already
  //    have a dedicated workshop CLI command for that projection
  //    (tesseract benchmark --benchmark X); bundling the
  //    side-effect was a coupling-for-convenience that no test
  //    depended on. replay-interpretation.ts graduated.
  //  - step-4c.headed-harness-graduate: createPlaywrightBridge
  //    factory moved from dashboard/mcp/playwright-mcp-bridge.ts
  //    to product/instruments/tooling/playwright-bridge.ts; the
  //    old dashboard module deleted. headed-harness.ts graduated
  //    off RULE_3, playwright-mcp-bridge.ts graduated off RULE_2
  //    (file deleted). Zero RULE_3 entries remain.

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
