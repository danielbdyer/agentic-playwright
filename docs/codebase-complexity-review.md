# Codebase Complexity Review

Date: 2026-03-30

## Purpose

Critical evaluation of codebase sprawl, feature bloat, and the gap between architectural ambition and working implementation. Goal: identify what to prune so the project's goals become intelligible again.

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

## Minimum Viable Core

The essential system is **~70-80 files** out of 418 in `lib/`:

| Tier | What | Files |
|---|---|---|
| Entry point | `bin/tesseract.ts` | 1 |
| Critical CLI commands | parse, bind, emit, compile, run | 5 |
| Core orchestration | parse.ts, bind.ts, task.ts, emit.ts, compile.ts, run.ts, ports.ts | 7 |
| Composition | local-services.ts, layers.ts | 2 |
| Infrastructure | local-fs.ts, local-ado-source.ts, local-version-control.ts, agent/index.ts | 4 |
| Domain | types/*, identity, binding, validation, precedence, program, scenarios, schemas | ~55 |

**Bloat factor: ~5-6x over minimum viable.**

---

## What's Solidly Implemented

- Deterministic compiler pipeline (parse -> bind -> compile -> emit -> run) — fully tested
- Runtime resolution ladder — all 7 rungs, with recovery strategies
- Dogfood/recursive improvement — convergence FSM, auto-approval, speedrun (747 + 2016 LOC)
- Governance — phantom-branded types, trust policy, approval workflow
- Dashboard — WebSocket streaming, flywheel viz, time-lapse replay, emotional pacing
- Knowledge system — YAML screens/patterns/hints, proposals, freshness tracking
- Interface graph — routes, screens, targets, states, events, transitions

## What's Partially Implemented

| Subsystem | Completion | Notes |
|---|---|---|
| State/event topology | ~40% | Types exist, most scenarios use DOM fallback |
| Confidence decay/tuning | ~70% | Engine works, no operator UX |
| Translation cache | ~60% | Caching works, no scorecard observability |
| Route knowledge | ~30% | Discovery exists, not wired into navigator |
| MCP tool invocation | ~50% | Infrastructure plumbing, no external integration |

## What's Aspirational Only

| Subsystem | Status |
|---|---|
| VSCode/Copilot extension | Interface definitions only, no shipping extension |
| Phase 3-4 scenario decomposition | Specs work, intermediate grounding model not explicit |
| Replay & training corpora | Lane reserved, zero implementation |
| Offline optimization (DSPy/GEPA) | Intentionally separated, empty |
| Scale to 2000+ scenarios | Designed for it, never tested |

---

## Pruning Recommendations

### Tier 1 — Low-risk removals (reduce noise, no feature loss)

- **Aspirational interface contracts** — VSCode/Copilot extension types with no consumers
- **Duplicate files** — `PLAN.md` and `plan.md` both exist at root
- **Docs for unbuilt systems** — Phase 6 replay corpora, offline optimization lane, agent workbench VSCode integration
- **Dogfood archive bloat** — `.ado-sync/archive/` has 50+ directories of historical snapshots

### Tier 2 — Moderate pruning (design decisions needed)

- **State/event topology** — If scenarios work via DOM fallback, the partially-wired state modeling adds complexity without proportional value. Either complete adoption or defer the entire subsystem.
- **Dashboard** (91 files, 12K LOC, 7 React/3D dev dependencies) — Beautiful but large. Could be extracted to a separate package or deferred until the core stabilizes.
- **Confidence decay / freshness tracking** — No operator UX means nobody is tuning thresholds. Complexity serving no one yet.
- **28 of 33 CLI commands** — Only 5 are essential (parse, bind, emit, compile, run). The rest (sync, graph, benchmark, capture, discover, approve, refresh, etc.) could be gated behind a flag or moved to a contrib/advanced module.

### Tier 3 — Structural simplification (bigger decisions)

- **Domain layer at 27K LOC / 187 files** — 43% of all library code. Algebra, validation, and schema subsystems may over-model for current needs. Biggest target for essentialization, highest risk.
- **17,897 lines of architecture docs** — Doctrine is more ambitious than the code. Pruning docs to match reality would reduce cognitive load significantly.

---

## The Core Question

The architecture doctrine describes three spines converging on a shared interpretation surface:
1. **Interface Intelligence** — partially realized
2. **Agent Workbench** — contract-only (no VSCode extension ships)
3. **Recursive Improvement** — working well

The gap between doctrine and implementation is the primary source of disorientation. The system works; the vision describes a larger system that doesn't yet exist. Aligning docs to reality (or reality to a scoped-down vision) is the highest-leverage move for intelligibility.

---

## Suggested Next Steps

1. **Decide which of the three strengths is the current priority.** The compiler? The improvement loop? The runtime resolution? Pick one to sharpen; background the others.
2. **Archive or flag aspirational docs.** Mark clearly what's implemented vs. planned so orientation doesn't require archaeology.
3. **Extract dashboard to a separate concern.** It's well-isolated already (opt-in via Effect layers). Making it a separate build target reduces cognitive load on the core.
4. **Prune dead CLI commands.** Keep the 5 essential ones front-and-center; move the rest behind `tesseract advanced <command>` or similar.
5. **Scope the domain layer.** 187 files / 27K LOC deserves its own review pass to find over-modeling.
