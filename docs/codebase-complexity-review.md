# Codebase Complexity Review

Date: 2026-03-31 (updated from initial 2026-03-30 draft)

## Purpose

Critical evaluation of codebase sprawl, feature bloat, and the gap between
architectural ambition and working implementation. Goal: identify what to prune
so the project's goals become intelligible again.

This document reflects multiple rounds of adversarial verification by five
independent analysis agents (1 verifier, 2 blue-team advocates, 2 red-team
skeptics). Every deletion recommendation has been double-checked for import
chains, barrel re-exports, dashboard consumer liveness, CLI wiring, and roadmap
backing. The initial dead code scan had a ~33% false-positive rate; this final
plan corrects for that.

---

## By the Numbers

| Dimension | Count |
|---|---|
| Total files (excl node_modules/dist) | ~1,037 |
| `lib/` source files | 423 (62,951 LOC) |
| `lib/domain/` | 187 files, 27,286 LOC (43% of lib) |
| `lib/application/` | 147 files, 23,096 LOC (37% of lib) |
| `lib/runtime/` | 46 files, 6,457 LOC |
| `lib/infrastructure/` | 28 files, 4,926 LOC |
| `lib/composition/` | 6 files, 544 LOC |
| Test files | 210 (43,664 LOC, 7,273 tests) |
| Dashboard UI | 91 files (12,437 LOC) |
| Documentation | 62 .md files (17,897 LOC) |
| Dogfood fixtures/data | 202 files |
| Production dependencies | 4 (effect, typescript, yaml, @playwright/test) |
| Dev dependencies | 24 (7 are React/3D for dashboard) |
| Max directory depth | 8 levels |

---

## The Three Working Strengths

Everything that matters reduces to three capabilities:

1. **Deterministic compiler** — ADO test case -> parse -> bind -> compile -> emit -> Playwright spec
2. **Runtime resolution ladder** — 7 rungs from explicit control through live-DOM to needs-human
3. **Recursive improvement loop** — Convergence FSM, auto-approval, speedrun, bottleneck calibration

---

## Verification: What We Almost Got Wrong

The initial dead code scan identified ~57 files as dead. Rigorous verification
found **6 files that would have caused build failures or broken CLI commands**
if deleted:

| File | Lines | What would have broken |
|---|---|---|
| `validation/core.ts` | 2,293 | Entire validation pipeline — `core/` directory imports FROM this file; no `core/index.ts` exists |
| `pipeline/stage.ts` | 75 | `compile.ts`, `run.ts` — core pipeline backbone |
| `pipeline/incremental.ts` | 141 | `emit.ts`, `graph.ts`, `task.ts`, `types.ts`, `projections/runner.ts` |
| `replay-interpretation.ts` | 231 | CLI `replay` command |
| `inspect.ts` | 129 | CLI `paths` command |
| 5 A-lane application modules | ~800 | Completed roadmap items (A2, A3, W2.8, W2.13, W2.16), not abandoned |

**Lesson**: "no imports found by grep" is insufficient. Must verify TypeScript
module resolution (file vs directory), barrel re-export chains, dashboard
component liveness, and roadmap status before classifying anything as dead.

---

## Final Pruning Plan

### DO NOT TOUCH — Misclassified as dead

These files are alive and critical:

- `lib/domain/validation/core.ts` — the `core/` directory depends on this file
- `lib/application/pipeline/stage.ts` — called by compile, run
- `lib/application/pipeline/incremental.ts` — called by emit, graph, task, types, projections
- `lib/application/replay-interpretation.ts` — CLI replay command
- `lib/application/inspect.ts` — CLI paths command

### KEEP — A-lane integration cluster (completed roadmap items)

These are finished work items awaiting the A-lane wiring (A1 → A2 → A3 spine).
They have law tests, backlog references, and planned integration points:

| File | Lines | Roadmap | What it does |
|---|---|---|---|
| `auto-approval.ts` | 111 | A2 | Multi-gate auto-approval composing with trust policy |
| `dogfood-orchestrator.ts` | 146 | A3 | Loop planner with Lyapunov convergence detection |
| `iteration-journal.ts` | 125 | W2.16 | Anti-thrashing rejection memory across iterations |
| `agent-interpretation-cache.ts` | 145 | W2.13 | Knowledge-fingerprint-invalidating LLM cache |
| `discovery-proposal-bridge.ts` | 268 | W2.8 | Transforms DiscoveryRun → ProposalBundle (interface→improvement bridge) |

### KEEP — Governance safety net

| File | Lines | Why |
|---|---|---|
| `contradiction-detector.ts` | 200 | Safety net for unattended auto-approval (A2). Detects conflicting selectors/routes across knowledge base. Has law tests. |

### KEEP — Dashboard (paused, not pruned)

All dashboard visualization modules stay as-is. The dashboard is a view layer
on pause — not under review for pruning.

### KEEP — Facade directories with original code

| Directory | Live files | Dead scaffolding to clean |
|---|---|---|
| `domain/execution/` | `recovery-policy.ts` (6 consumers), `telemetry.ts` (2 consumers) | `index.ts`, `model.ts`, `ops.ts`, `validation.ts` |
| `domain/knowledge/` | `patterns.ts` (3 consumers), `screen-bundle.ts` (4 consumers) | `index.ts`, `model.ts`, `ops.ts`, `validation.ts` |

---

### DELETE — Dead domain modules (~3,100 source lines + ~4,200 test lines)

All verified HIGH confidence. Zero production imports. Dashboard consumer
chains traced and confirmed dead where applicable.

**Visualization domain logic (dashboard-adjacent, 9 files):**

| File | Lines | Notes |
|---|---|---|
| `flywheel-entity.ts` | 399 | Zero imports outside test |
| `journal-index.ts` | 345 | Infrastructure has parallel impl with different structure |
| `speed-tier-batcher.ts` | 337 | Dashboard consumer chain is dead (PlaybackControls never rendered) |
| `proposal-cluster.ts` | 307 | Dashboard consumer (proposal-cluster.tsx) never imported by any page |
| `screen-thumbnail.ts` | 300 | Zero dashboard imports |
| `act-indicator.ts` | 263 | Zero imports outside test |
| `failure-fragments.ts` | 273 | Shatter animation physics, zero consumers |
| `iteration-timeline.ts` | 248 | Flywheel UI timeline, zero consumers |
| `surface-overlay.ts` | 263 | ARIA landmark overlay, zero consumers |

**Future features never wired in (8 files):**

| File | Lines | Notes |
|---|---|---|
| `cold-start.ts` | 219 | Knowledge posture system already handles cold-start differently |
| `graduated-autonomy.ts` | 162 | Models manual/supervised/autonomous — system uses approved/review-required/blocked |
| `cost-accounting.ts` | 156 | BACKLOG C3 priority 11/17; basic arithmetic, 30 min rebuild |
| `causal-chain.ts` | 220 | Not on BACKLOG; traces and review.md already serve this purpose |
| `breakage-sim.ts` | 42 | Types-only for unstarted feature |
| `agent-errors.ts` | 60 | Parallel error taxonomy duplicating TesseractError |
| `architecture-fitness.ts` | 151 | Meta-analysis types requiring non-existent AST tooling |
| `emission-backends.ts` | 77 | Multi-backend emission (Cypress/Selenium) — emit pipeline hardcodes Playwright |

**Orphaned domain modules (5 files):**

| File | Lines | Notes |
|---|---|---|
| `affordance-matcher.ts` | 166 | Runtime evolved widget contracts instead of DOM-inferred affordances |
| `doctrine-compiler.ts` | 333 | Novel idea but uses string splicing (violates own AST-emission doctrine); rebuild with AST when needed |
| `binding-distribution.ts` | 235 | Zero imports outside test |
| `knowledge-coverage.ts` | 172 | Zero imports outside test |
| `rung-stress.ts` | 60 | Zero imports outside test |

**Dead algebra (2 files):**

| File | Lines | Notes |
|---|---|---|
| `algebra/kleisli.ts` | 55 | Thin wrapper over Effect's pipe/flatMap; research docs flag as deletable |
| `algebra/lineage.ts` | 65 | Correct monoid, but no code merges lineages; 15 min rebuild |

**Graph infrastructure (4 files):**

| File | Lines | Notes |
|---|---|---|
| `graph-builder.ts` | 222 | Phantom-typed builder; actual graph construction uses direct DerivedGraph construction |
| `graph-queries.ts` | 272 | BFS/reachability queries; graph is a projection artifact, not queried at runtime |
| `graph-validation.ts` | 164 | Cross-graph consistency; both graphs built by same pipeline |
| `concurrent-graph-builder.ts` | 83 | Wraps Effect.all; trivial to recreate |

**Pipeline/observability prototypes (4 files):**

| File | Lines | Notes |
|---|---|---|
| `dirty-tracking.ts` | 62 | Superseded by projections/cache.ts (richer model: structured per-input diffs, persistent manifests) |
| `parallel-harvest.ts` | 188 | Fabricated default SelectorCanon with all-zero fields; never connected to real data |
| `progress-reporting.ts` | 78 | Generic ProgressEvent doesn't match real SpeedrunProgressEvent used by dogfood/speedrun |
| `clarification.ts` | 127 | Zero imports outside test |

**Dead application modules (6 files):**

| File | Lines | Notes |
|---|---|---|
| `learning-evaluation.ts` | 174 | Zero tests, zero callers, stub replay evaluation |
| `entropy-injection.ts` | 304 | Speculative vocabulary tables; PRNG is 4 lines to recreate |
| `workbench-consumer.ts` | 188 | Fabricated scoring weights; rebuild from real usage data |
| `drift.ts` | 191 | No dedicated tests; testing utility for simulating knowledge drift |
| `execution-tempo.ts` | 131 | Zero imports outside test |
| `fixture-emission.ts` | 104 | Zero imports outside test |

### DELETE — Dead facade directories (5 dirs, ~20 files, ~180 lines)

All verified zero consumers, zero original code:

- `domain/governance/` — pure re-exports
- `domain/foundation/` — pure re-exports
- `domain/intent/` — pure re-exports
- `domain/resolution/` — pure re-exports
- `domain/projection/` — pure re-exports

### DELETE — Dead aspirational types (4 files, ~200 lines)

| File | Lines | Notes |
|---|---|---|
| `types/breakage-sim.ts` | 42 | Zero importers anywhere |
| `types/agent-errors.ts` | 60 | Zero importers |
| `types/architecture-fitness.ts` | 151 | Re-exported via barrel but never consumed |
| `types/emission.ts` | ~41 | Only consumed by dead emission-backends.ts |

### DELETE — Dead re-export scaffolding inside KEEP directories

Within `domain/execution/` and `domain/knowledge/`, delete the dead
`index.ts`, `model.ts`, `ops.ts`, `validation.ts` re-export files but keep
the live original-code files.

---

## Cleanup Cascade

When deleting the above, also remove:

- **Corresponding test files** (~35 `.laws.spec.ts` files, ~4,200 lines)
- **Dead dashboard components** that import from deleted domain modules:
  `dashboard/src/spatial/proposal-cluster.tsx`,
  `dashboard/src/molecules/speed-tier-selector.tsx`, and their test files
- **Barrel re-export line**: `export * from './kleisli'` in `algebra/index.ts`
- **Type barrel re-exports**: remove dead type re-exports from `domain/types.ts`
- **Documentation references**: update `docs/module-map.md`, `lib/domain/README.md`
- **Architecture test**: update `tests/architecture.spec.ts` file manifest

---

## Net Impact

| Metric | Before | After | Change |
|---|---|---|---|
| Dead source files | ~42 | 0 | -42 files |
| Dead test files | ~35 | 0 | -35 files |
| Dead source lines | ~5,600 | 0 | -5,600 LOC |
| Dead test lines | ~4,200 | 0 | -4,200 LOC |
| Dead facade dirs | 5 | 0 | -20 files, -180 LOC |
| Total reduction | | | **~77 files, ~10,000 LOC** |

The core pipeline, runtime, improvement loop, dashboard, A-lane cluster, and
governance safety net are untouched.

---

## Next Steps After Pruning

### Immediate (unblocks clarity)

1. **Execute the deletion plan above.** Commit as a single atomic cleanup.
2. **Run the full test suite** to confirm zero behavioral change.
3. **Update architecture.spec.ts** file manifest to match new reality.

### Short-term (reduces cognitive load)

4. **Clean dead re-export scaffolding** inside `domain/execution/` and
   `domain/knowledge/`.
5. **Align docs to reality.** Mark aspirational sections clearly in
   master-architecture.md, direction.md, and BACKLOG.md so orientation doesn't
   require archaeology.
6. **Bridge progress events to dashboard.** The existing `onProgress` callback
   in dogfood.ts/speedrun.ts/evolve.ts needs ~10 lines per file to also emit
   `dashboardEvent('progress', ...)`. No new module needed.

### Medium-term (essentialization)

7. **Wire the A-lane cluster.** auto-approval → dogfood-orchestrator →
   iteration-journal form the A1→A2→A3 spine. These are completed modules
   waiting for integration.
8. **Rebuild doctrine-compiler with AST emission.** The idea (compile CLAUDE.md
   into executable tests) is architecturally valuable; the current
   implementation uses string splicing. Git history preserves the design as
   reference.
9. **Scope the domain layer.** Even after pruning, `lib/domain/` is 27K LOC /
   187 files. A dedicated review pass for over-modeling in types/, validation/,
   and schemas/ is warranted.
10. **Decide the current priority spine.** Compiler? Improvement loop? Runtime
    resolution? Pick one to sharpen; background the others.
