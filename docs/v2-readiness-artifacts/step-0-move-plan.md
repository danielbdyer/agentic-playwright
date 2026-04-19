# Step 0 move plan (Hour 0–1 dry-run)

> Status: dry-run produced 2026-04-19 per `docs/v2-readiness.md §1.2` Hour 0–1. Authoritative mapping source is `docs/v2-transmogrification.md §12.0` (§§12.1–12.7 for per-lane detail). Where §12.0 gives a per-verb target (e.g., "split into intelligence/index/, intelligence/target/"), Step 0 moves the whole monolith to the parent target folder and defers the internal split to its named step.

## Definition

Step 0 is an **atomic path reshape** with no behavior changes. Each entry below is `<lib src path> -> <dst path>`. Files with named shape adjustments (ladder order flip, error-family additions, facade switch, etc.) land at their mapped folder in Step 0 but the content change lands at its later step.

## Preconditions verified

- [x] `git status` clean on `claude/step-0-compartmentalization-xiYrZ`.
- [x] Branch is at `main` HEAD (`ba30376`).
- [x] Tag `pre-compartmentalization` created at `ba30376`.
- [x] `npm run build` passes (session-start hook output).
- [ ] **`npm test` baseline fails** — 7 test files failing / 11 tests (see "Baseline failures" below). Flag for user before first file moves.
- [x] Test file count: 267 `.spec.ts` in `tests/` + 1 in `tests-capture/` = 268 total. Vitest collects 247 after include/exclude.

## Baseline failures (pre-existing, not caused by Step 0)

All seven appear to be stale against the 2026-04-19 v2.1 doc corpus:

1. `tests/knowledge/knowledge-posture.laws.spec.ts` — references `CLAUDE.md` "Tier 1/2" language and `docs/recursive-self-improvement.md` (moved to `docs/v1-reference/`).
2. `tests/target/state-topology.spec.ts`.
3. `tests/flywheel-server-integration.laws.spec.ts` — 3 laws (journal CLI flag, speedrun auto-enable, playback API endpoints).
4. `tests/generated-types.spec.ts` — snapshot-template / fixture inclusion.
5. `tests/scoring-algebra.laws.spec.ts` — law 7 complexity bound.
6. `tests/architecture/docs.spec.ts` — 2 laws (deterministic auto-approval docs, spines vocabulary).
7. `tests/architecture/governance-verdict.laws.spec.ts` — law 8 (ad-hoc governance string comparisons).
8. `tests/fitness/architecture-fitness.laws.spec.ts` — domain-layer purity rate ≥ 98%.

These are **not** Step 0 blockers in substance (they don't test import topology), but they violate the stated precondition "`npm test` green on the starting baseline." See "Open questions for the user" below.


## Open questions for the user (flag before first file moves)

### Q1. Baseline test failures — proceed or fix first?

The readiness doc (§1.1) lists "`npm test` green on the starting baseline" as a precondition. Eight files are currently red (listed above). Options:

- **Proceed** — the failures are doc-reference checks (and one architecture-law) that pre-date the branch. Step 0 is a structural move; it will not fix or break these. We capture the red baseline, confirm Step 0 doesn't introduce new failures, and fix the eight in a follow-up.
- **Patch baseline first** — adjust the eight tests to the post-2026-04-19 doc layout in a preparatory commit on this branch before any file moves.
- **Rebase onto a cleaner point** — unlikely to help; all eight reference docs moved by commit `50201cc` (the v1-reference consolidation) which is already on main.

Preferred: **proceed and capture the red baseline**. Step 0's DoD becomes "no *new* failures beyond the 8-file baseline."

### Q2. Existing `dashboard/` folder — how does it interleave with the v2 `dashboard/` target?

The repo already has a top-level `dashboard/` (v1 web UI: React SPA + WS/HTTP server + MCP tools + tailwind config), which is the live speedrun observer. v2's `dashboard/` names three subfolders: `dashboard/mcp/`, `dashboard/bridges/`, `dashboard/projections/`. §12.0.7 names targets inside `dashboard/` but does not address the existing content.

Recommendation (to validate): leave the existing `dashboard/` content **in place at Step 0** and add the new subfolders as siblings. The existing files carry on as the web-UI layer; nothing about their function changes. A later step may reclassify them (`dashboard/projections/web-ui/`?) but that's beyond Step 0's scope.

### Q3. `tests/` stays at the repo root?

§8 of readiness talks exclusively about **rewriting imports in tests**, not moving test files. The per-folder destination summary (§12.0) names `product/tests/architecture/` as the destination for the new seam-enforcement law and the existing law 8, but says nothing about the other 265 `.spec.ts` files.

Recommendation (to validate): at Step 0, **tests stay at `tests/` root**, imports are rewritten. Only the two architecture laws (`governance-verdict.laws.spec.ts` and the new `seam-enforcement.laws.spec.ts`) live under `product/tests/architecture/`. Moving the wider test tree folder-by-folder is a later step.

### Q4. Top-level code not under `lib/`

- `bin/tesseract.ts`, `bin/tesseract-mcp.ts` — CLI entry points. Stay at `bin/` (composition-level).
- `scripts/` — admin / build / speedrun scripts. Stay at `scripts/`; imports rewrite.
- `dogfood/` — retires at Step 1, not Step 0. No move.
- `extension/` — VSCode extension. Stays at `extension/`.
- `tests-capture/` — stays.
- `playwright*.config.ts`, `eslint.config.cjs`, etc. — top-level; no move.


---

## Move mapping — folder by folder

Each section states: (a) wholesale folder mapping if uniform, (b) per-file destinations where `§12.0` names a different target, (c) "Step 0 target" when §12.0's target needs a subfolder split deferred to a later step.

### `lib/domain/` → `product/domain/` (wholesale, with two callouts)

Wholesale rule: every file under `lib/domain/` moves to `product/domain/` preserving the subpath.

Callouts per §12.0:

- `lib/domain/codegen/*` (5 files) → **`product/instruments/codegen/*`** per §12.0.2. `spec-codegen.ts`, `method-name.ts`, `ts-ast.ts`, `typegen.ts`, `index.ts`. (The codegen files are product-side but conceptually instruments, not domain types.)
- `lib/domain/convergence/types.ts` → **`workshop/convergence/types.ts`** per §12.0.6 (N-trial hylomorphic harness lives in workshop).
- `lib/domain/convergence/index.ts` → **`workshop/convergence/index.ts`** (barrel for the above).

Everything else stays `lib/domain/<subpath>` → `product/domain/<subpath>`:
- `agency/`, `aggregates/`, `algebra/`, `attention/`, `commitment/`, `confidence/`, `drift/`, `evidence/`, `execution/`, `fitness/`, `governance/`, `graph/`, `handshake/`, `improvement/`, `intent/`, `interface/`, `interpretation/`, `kernel/`, `knowledge/`, `learning/`, `observation/`, `pipeline/`, `projection/`, `proposal/`, `provenance/`, `resolution/`, `scenario/`, `schemas/`, `synthesis/`, `target/`, `validation/`, `widgets/`, plus `validation.ts`.
- `README.md` → `product/domain/README.md`.

**Ambiguity flagged**: `lib/domain/fitness/` contains the seven metric visitors (§12.0.6 places them at `workshop/metrics/visitors/`). §12.0 places the folder itself in workshop. The other `fitness/` files (`architecture-fitness.ts`, `cohort.ts`, `compounding.ts`, etc.) are mixed — some are pure metric types, others are infrastructure. Proposal: move **all of `lib/domain/fitness/`** to `workshop/metrics/` for Step 0 (preserving subpaths), and the later metric-visitor audit step reshapes the internal layout. This matches §3.5 "the seven visitors... port forward together" and leaves the split work for the per-visitor audit.


### `lib/runtime/` → `product/runtime/` (wholesale, with instrument callouts)

Wholesale rule: `lib/runtime/<subpath>` → `product/runtime/<subpath>`.

Callouts per §12.0.2 (files that §12.0 names as `product/instruments/…`):

- `lib/runtime/adapters/navigation-strategy.ts` → **`product/instruments/navigation/strategy.ts`** (shape adjustment at later step: `page.url()` idempotence check).
- `lib/runtime/widgets/interact.ts` → **`product/instruments/action/interact.ts`** (shape adjustment at later step: error-family envelope).
- `lib/runtime/widgets/locate.ts` → **`product/instruments/action/locate.ts`** (stays paired with interact; the facet-ref-to-locator shape lands at later step).

The other runtime files port cleanly to `product/runtime/<subpath>`:
- `adapters/aria.ts`, `adapters/load.ts`, `adapters/playwright-dom-resolver.ts` → `product/runtime/adapters/`.
- `execute/`, `interpreters/`, `observe/`, `resolution/`, `resolve/`, `widgets/` (minus interact+locate) → `product/runtime/<subpath>/`.
- `result.ts`, `scenario.ts` → `product/runtime/`.
- `widgets/os-*.ts`, `widgets/index.ts` → `product/runtime/widgets/` (these are OutSystems widget implementations; they stay alongside the other widget runtime).
- `README.md` → `product/runtime/README.md`.

**Ambiguity flagged**: §12.0.2 names `product/runtime/resolution/` for the monolith split of `resolution-stages.ts` but doesn't address the 16 sibling files in `lib/runtime/resolution/`. Proposal: move the whole `lib/runtime/resolution/` folder to `product/runtime/resolution/` for Step 0; the internal split (`lattice/`, `stages/`, `exhaustion/`, `accumulator/`) lands at its named step.

### `lib/composition/` → `product/composition/`

Wholesale: six files.
- `env.ts`, `layers.ts`, `load-run-plan.ts`, `local-runtime-scenario-runner.ts`, `local-services.ts`, `scenario-context.ts` → `product/composition/`.
- `README.md` → `product/composition/README.md`.

### `lib/playwright/` → `product/instruments/observation/`

Three files (per §12.0.2):
- `lib/playwright/aria.ts` → `product/instruments/observation/aria.ts`.
- `lib/playwright/locate.ts` → `product/instruments/observation/locator-ladder.ts` (rename per §12.0.2; shape adjustment — ladder order flip — lands at later step; Step 0 only changes the path).
- `lib/playwright/state-topology.ts` → `product/instruments/observation/state-topology.ts`.

**Decision point**: does Step 0 rename `locate.ts` → `locator-ladder.ts`, or keep the original filename and rename later? Recommendation: **keep the original filename** for Step 0 (one-for-one `git mv`), rename in a separate commit during the shape-adjustment step. Keeping filenames identical preserves git rename-detection.

### `lib/generated/` → `product/generated/`

One file:
- `lib/generated/tesseract-knowledge.ts` → `product/generated/tesseract-knowledge.ts`.


### `lib/infrastructure/` — split three ways

Per §12.0.2 / §12.0.6 / §12.0.7 the infrastructure tree splits along product / workshop / dashboard lines.

**→ `product/instruments/`:**
- `lib/infrastructure/ado/live-ado-source.ts` → `product/instruments/intent/live-ado-source.ts` (§12.0.2).
- `lib/infrastructure/ado/local-ado-source.ts` → `product/instruments/intent/local-ado-source.ts` (same folder per delta audit; testbed adapter concern is Step 5 but the file stays with its sibling).
- `lib/infrastructure/observation/playwright-screen-observer.ts` → `product/instruments/observation/playwright-screen-observer.ts`.
- `lib/infrastructure/knowledge/hints-writer.ts` → `product/instruments/catalog/hints-writer.ts` (catalog write instrument).
- `lib/infrastructure/screen-registry/local-screen-registry-loader.ts` → `product/instruments/catalog/local-screen-registry-loader.ts`.
- `lib/infrastructure/snapshots/local-snapshot-template-loader.ts` → `product/instruments/catalog/local-snapshot-template-loader.ts`.
- `lib/infrastructure/fs/local-fs.ts`, `recording-fs.ts` → `product/instruments/fs/` (shared filesystem adapter used by every other instrument).
- `lib/infrastructure/runtime/local-runtime-environment.ts`, `playwright-browser-pool.ts` → `product/instruments/runtime/`.
- `lib/infrastructure/repositories/*` (3 files) → `product/instruments/repositories/` (local filesystem-backed repositories; product-side adapters).
- `lib/infrastructure/reporting/tesseract-reporter.ts` → `product/instruments/reporting/` (Playwright reporter bridge).
- `lib/infrastructure/tooling/*` (7 files: `browser-options.ts`, `capture-screen.ts`, `discover-screen.ts`, `fixture-server.ts`, `harvest-routes.ts`, `headed-harness.ts`, `local-version-control.ts`) → `product/instruments/tooling/` (CLI-adjacent adapters for the agent's authoring flow).
- `lib/infrastructure/vscode/*` (4 files) → `product/instruments/vscode/` (Copilot participant + task/problem providers; product-side reasoning adapter hooks per §3.6).

**→ `dashboard/`:**
- `lib/infrastructure/mcp/dashboard-mcp-server.ts` → `dashboard/mcp/dashboard-mcp-server.ts` (§12.0.7). Internal split into `handlers/`, `context/`, `actions/` is the later step.
- `lib/infrastructure/mcp/playwright-mcp-bridge.ts` → `dashboard/mcp/playwright-mcp-bridge.ts`.
- `lib/infrastructure/mcp/resource-provider.ts` → `dashboard/mcp/resource-provider.ts`.
- `lib/infrastructure/dashboard/file-decision-bridge.ts` — **split** per §12.0.7: writer → `product/instruments/handshake/decision-bridge.ts`, watcher → `dashboard/bridges/decision-watcher.ts`. For Step 0 (no behavior changes), recommend **keeping the file whole** at one location and deferring the split. Proposed Step 0 target: `dashboard/bridges/file-decision-bridge.ts` (with a follow-up split commit at Step 0.x or a later named step).
- `lib/infrastructure/dashboard/cdp-screencast.ts` → `dashboard/bridges/cdp-screencast.ts`.
- `lib/infrastructure/dashboard/file-dashboard-port.ts` → `dashboard/bridges/file-dashboard-port.ts`.
- `lib/infrastructure/dashboard/journal-writer.ts` → `dashboard/bridges/journal-writer.ts`.
- `lib/infrastructure/dashboard/pipeline-event-bus.ts` → `dashboard/bridges/pipeline-event-bus.ts`.
- `lib/infrastructure/dashboard/runtime-boundary.ts` → `dashboard/bridges/runtime-boundary.ts`.
- `lib/infrastructure/dashboard/ws-dashboard-adapter.ts` → `dashboard/bridges/ws-dashboard-adapter.ts`.
- `lib/infrastructure/README.md` → `product/instruments/README.md` (or flag to drop — the new per-folder READMEs supersede).

**Ambiguity flagged** for `lib/infrastructure/dashboard/`: these seven files are the v1 "dashboard-adjacent" transports (WS, CDP screencast, file port, journal, event bus, boundary). They straddle — the writer side is product, the reader side is dashboard. Proposal: land them under `dashboard/bridges/` wholesale for Step 0 and let the later per-file split commits carve out the writer halves into `product/instruments/handshake/`. This is the "leave a conservative Step 0 target and sharpen later" approach the readiness doc recommends for ambiguity.


### `lib/application/` — mixed destinations (the high-risk submodule group)

§8.5 of readiness calls `lib/application/` the highest-risk cluster. Each submodule maps to a specific destination; §12.0 and §§12.1–12.7 drive the per-submodule targets below. Order of mapping is the order one would execute Hour 4–6 per-cluster rewrites.

#### → `workshop/` (measurement consumer)

- `lib/application/improvement/` → `workshop/orchestration/` (wholesale, 15 files + `dogfood/` subdirectory).
  - `speedrun.ts`, `benchmark.ts`, `clean-slate.ts`, `compounding-projection.ts`, `convergence-proof.ts`, `dogfood-orchestrator.ts`, `dogfood.ts`, `evolve.ts`, `experiment-registry.ts`, `fingerprint-stability-probe.ts`, `fitness.ts`, `hotspots.ts`, `improvement-intelligence.ts`, `improvement.ts`, `iteration-journal.ts`, `knob-search.ts`, `knowledge-coverage.ts`, `memory-maturity-projection.ts`, `proposal-intelligence.ts`, `scorecard.ts`, `strategic-intelligence.ts`.
  - `dogfood/activation.ts`, `dogfood/iteration.ts`, `dogfood/metrics.ts`, `dogfood/planner.ts`, `dogfood/reporting.ts` → `workshop/orchestration/dogfood/`.
  - **Callout**: §12.0.6 places `convergence-proof.ts` in `workshop/convergence/`, `speedrun.ts` in `workshop/orchestration/`, `scorecard.ts` in `workshop/scorecard/`. For Step 0 we land them all at `workshop/orchestration/` (preserving intra-folder imports) and split into `convergence/`, `scorecard/`, etc., at a follow-up step.
- `lib/application/measurement/` → `workshop/measurement/` (3 files: `baseline-store.ts`, `index.ts`, `score.ts`).
- `lib/application/learning/` → `workshop/learning/` (7 files). These feed workshop's scorecard / bottleneck detection; not customer-facing.
- `lib/application/synthesis/` → `workshop/synthesis/` (4 files: `cohort-generator.ts`, `fixture-extractor.ts`, `interface-fuzzer.ts`, `scenario-generator.ts`). §12.0 notes these are workshop-scaffolding; they port to workshop at Step 0 and get reshaped at Step 5 (probe IR).
- `lib/application/governance/trust-policy.ts` → `workshop/policy/trust-policy.ts` (§12.0.6).
- `lib/application/governance/auto-approval.ts` → `workshop/policy/auto-approval.ts`.
- `lib/application/governance/escalation-policy.ts` → `workshop/policy/escalation-policy.ts`.
- `lib/application/governance/intervention-kernel.ts` → `workshop/policy/intervention-kernel.ts`.
- `lib/application/governance/governance-intelligence.ts` → `workshop/policy/governance-intelligence.ts`.
- `lib/application/governance/approve.ts` → `workshop/policy/approve.ts` (proposal approval sits with trust policy).

**Ambiguity flagged**: `approve.ts` and `intervention-kernel.ts` could arguably go to `product/application/governance/` if they're called during customer-facing authoring. The docs don't explicitly name a destination. Proposal: land the whole `lib/application/governance/` folder in `workshop/policy/` for Step 0 per §12.0.6's naming of the policy directory; a follow-up audit can carve `approve.ts` etc. into `product/` if callsite evidence shows they belong there.

#### → `product/reasoning/` (the Reasoning port consolidation — per §12.0.4)

Step 0 only moves the files; the consolidation to `Reasoning.Tag` is Step 4b.

- `lib/application/resolution/translation/translate.ts` → `product/reasoning/translate.ts`.
- `lib/application/resolution/translation/translation-provider.ts` → `product/reasoning/translation-provider.ts`.
- `lib/application/resolution/translation/translation-cache.ts` → `product/reasoning/translation-cache.ts`.
- `lib/application/resolution/translation/semantic-translation-dictionary.ts` → `product/reasoning/semantic-translation-dictionary.ts`.
- `lib/application/agency/agent-interpreter-provider.ts` → `product/reasoning/agent-interpreter-provider.ts`.
- `lib/application/agency/agent-interpretation-cache.ts` → `product/reasoning/agent-interpretation-cache.ts`.

#### → `product/application/` (customer-facing orchestration)

- `lib/application/resolution/` (all except the `translation/` subfolder handled above) → `product/application/resolution/` (9 files: `bind.ts`, `compile-snapshot.ts`, `compile.ts`, `controls.ts`, `interface-resolution.ts`, `pipeline-dag.ts`, `provider-registry.ts`, `refresh.ts`, `resolution-engine.ts`, `task.ts`).
- `lib/application/commitment/` → `product/application/commitment/` (14 files + `replay/` subdir, 3 replay files).
- `lib/application/intent/` → `product/application/intent/` (2 files: `parse.ts`, `sync.ts`).
- `lib/application/discovery/` → `product/application/discovery/` (4 files).
- `lib/application/observation/` → `product/application/observation/` (2 files: `interface-intelligence.ts`, `parallel-harvest.ts`). §12.0.3 carves `interface-intelligence.ts` into `product/intelligence/` later; Step 0 keeps it with its sibling.
- `lib/application/graph/` → `product/application/graph/` (3 files).
- `lib/application/pipeline/` → `product/application/pipeline/` (4 files).
- `lib/application/knowledge/` → `product/application/knowledge/` (7 files).
- `lib/application/canon/` → `product/application/canon/` (10 files). §12.0.5 targets `product/catalog/` for `minting.ts` and the decomposers; Step 0 lands them under `product/application/canon/` and the rename + consolidation to `product/catalog/` is a follow-up.
- `lib/application/catalog/` → `product/application/catalog/` (7 files).
- `lib/application/drift/` → `product/application/drift/` (10 files). §12.0.5 routes `selector-health.ts` eventually to `product/catalog/locator-health.ts`; Step 0 keeps it with its siblings.
- `lib/application/projections/` → `product/application/projections/` (9 files).
- `lib/application/agency/` (minus `agent-interpreter-provider.ts` and `agent-interpretation-cache.ts`) → `product/application/agency/` (9 files: `agent-ab-testing.ts`, `agent-decider.ts`, `agent-session-adapter.ts`, `agent-session-ledger.ts`, `agent-workbench.ts`, `dashboard-decider.ts`, `inbox.ts`, `operator.ts`, `workspace-session.ts`).
  - **Callout**: `agent-ab-testing.ts` is workshop-flavored per §3.6 ("drop `ABTestConfig` routing (workshop scaffolding)"). Step 0 keeps it at `product/application/agency/`; Step 4b drops it when the Reasoning port consolidates.
  - **Callout**: `dashboard-decider.ts` arguably belongs on the dashboard side — but its callsite is inside the product's decision flow. Stays with product for Step 0.
- `lib/application/cache/` → `product/application/cache/` (1 file: `file-cache.ts`).
- `lib/application/paths/` → `product/application/paths/` (9 files + `paths.ts` barrel).
- `lib/application/paths.ts` → `product/application/paths.ts`.
- `lib/application/resilience/` → `product/application/resilience/` (2 files).
- `lib/application/runtime-support/` → `product/application/runtime-support/` (5 files).
- `lib/application/cli/` → `product/cli/` per §12.0's `product/cli/` target (25+ files under `commands/`, plus `registry.ts`, `shared.ts`).
- `lib/application/effect.ts` → `product/application/effect.ts`.
- `lib/application/ports.ts` → `product/application/ports.ts`.
- `lib/application/types.ts` → `product/application/types.ts`.
- `lib/application/README.md` → `product/application/README.md` (or drop in favor of new per-folder README).


### Top-level files

- `lib/README.md` → drop (the new per-folder READMEs supersede). Alternatively keep a redirect stub; recommend **drop**.

---

## Summary counts (indicative)

| Source | Files | Primary destination |
|---|---:|---|
| `lib/domain/` (excl. `codegen/`, `convergence/`, `fitness/`) | ~170 | `product/domain/` |
| `lib/domain/codegen/` | 5 | `product/instruments/codegen/` |
| `lib/domain/convergence/` | 2 | `workshop/convergence/` |
| `lib/domain/fitness/` | 30+ | `workshop/metrics/` |
| `lib/runtime/` (excl. interact/navigate/widgets/locate) | ~30 | `product/runtime/` |
| `lib/runtime/adapters/navigation-strategy.ts`, `widgets/interact.ts`, `widgets/locate.ts` | 3 | `product/instruments/{navigation,action}/` |
| `lib/composition/` | 6 | `product/composition/` |
| `lib/playwright/` | 3 | `product/instruments/observation/` |
| `lib/generated/` | 1 | `product/generated/` |
| `lib/infrastructure/ado,fs,knowledge,observation,reporting,repositories,runtime,screen-registry,snapshots,tooling,vscode/` | ~25 | `product/instruments/...` |
| `lib/infrastructure/mcp/` | 3 | `dashboard/mcp/` |
| `lib/infrastructure/dashboard/` | 7 | `dashboard/bridges/` |
| `lib/application/improvement/,measurement/,learning/,synthesis/,governance/` | ~50 | `workshop/...` |
| `lib/application/agency/{translation,agent-interpretation-cache,agent-interpreter-provider}` — + `resolution/translation/` | 6 | `product/reasoning/` |
| `lib/application/*` (all other submodules) | ~110 | `product/application/...` |
| `lib/application/cli/` | 27 | `product/cli/` |

Total lib source files moving: ~360 (includes TS files + sub-READMEs).

Zero files stay at `lib/` after Step 0. The `lib/` directory is deleted as the final move in the moves commit.

---

## Execution sequence (Hour 2–3 shell script sketch)

Pseudocode for the moves commit (to be scripted as bash + `git mv` after the user signs off on the mapping). Each line is one `git mv` (or `git mv -k` for batched moves).

```bash
#!/usr/bin/env bash
set -euo pipefail

mkdir -p product/{domain,application,runtime,instruments,catalog,intelligence,graph,reasoning,composition,generated,tests,cli,build,logs}
mkdir -p workshop/{orchestration,metrics,scorecard,convergence,policy,ledger,probe-derivation,logs,observations,measurement,learning,synthesis}
mkdir -p dashboard/{mcp,bridges,projections}

# --- product/domain/ (wholesale minus carve-outs) ---
git mv lib/domain/{agency,aggregates,algebra,attention,commitment,confidence,drift,evidence,execution,governance,graph,handshake,improvement,intent,interface,interpretation,kernel,knowledge,learning,observation,pipeline,projection,proposal,provenance,resolution,scenario,schemas,synthesis,target,validation,widgets} product/domain/
git mv lib/domain/validation.ts product/domain/

# --- product/instruments/codegen/ ---
git mv lib/domain/codegen product/instruments/codegen

# --- workshop/convergence/ ---
git mv lib/domain/convergence workshop/convergence

# --- workshop/metrics/ ---
git mv lib/domain/fitness workshop/metrics

# ... (continues folder-by-folder per the mapping above)
```

The full script is a straightforward enumeration of the mapping tables. It will be produced and executed at Hour 2–3 once the user signs off on this dry-run.

---

## Post-move import rewrite preview

Per §8.2 the rewrite is 836 imports across 227 test files plus the non-test sources. The bulk-sed pass per §1.2 Hour 3–4 targets:

```
lib/domain/         → product/domain/
lib/domain/codegen/ → product/instruments/codegen/    (applied before the previous line)
lib/domain/convergence/ → workshop/convergence/       (applied before lib/domain/)
lib/domain/fitness/ → workshop/metrics/               (applied before lib/domain/)
lib/runtime/        → product/runtime/
lib/composition/    → product/composition/
lib/playwright/     → product/instruments/observation/
lib/generated/      → product/generated/
lib/application/improvement/ → workshop/orchestration/
lib/application/measurement/ → workshop/measurement/
lib/application/learning/    → workshop/learning/
lib/application/synthesis/   → workshop/synthesis/
lib/application/governance/  → workshop/policy/
lib/application/cli/         → product/cli/
lib/application/resolution/translation/ → product/reasoning/
lib/application/agency/agent-interpreter-provider → product/reasoning/agent-interpreter-provider
lib/application/agency/agent-interpretation-cache → product/reasoning/agent-interpretation-cache
lib/application/ → product/application/               (applied last after all carve-outs)
lib/infrastructure/mcp/ → dashboard/mcp/
lib/infrastructure/dashboard/ → dashboard/bridges/
lib/infrastructure/ → product/instruments/            (applied last after all infra carve-outs)
```

Order matters: the more-specific rules run before the catch-all `lib/<folder>/ → product/<folder>/` rewrites.

---

## Checks before the moves commit

Before executing Hour 2–3:

1. User sign-off on this move-plan (flagged Q1–Q4 above).
2. Seam-enforcement test file authored per §2 of readiness (commit 0.0 — test first, moves second).
3. Folder-stub READMEs authored per §3 of readiness (commit 0.1).

Then Hour 2–3: execute the move script; commit "Step 0.2 — file moves (imports not yet updated; build broken)".

