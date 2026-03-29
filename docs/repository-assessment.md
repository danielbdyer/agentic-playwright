# Repository Assessment

**Date:** 2026-03-29  
**Scope:** Efficacy, performance, clarity of approach, consistency, and completeness

---

## Executive Summary

Tesseract is an ambitious, architecturally sophisticated system that compiles Azure DevOps manual test cases into executable Playwright specs through a governed, knowledge-preserving pipeline. The codebase reflects deep commitment to functional programming, type safety, and principled architecture. It excels at domain modeling and architectural rigor but shows signs of growing faster than its discipline can fully absorb — evidenced by 518 lint violations, 3 cross-layer import breaches, and a runtime layer that hasn't yet adopted the Effect patterns the rest of the system mandates.

**Overall reckoning: strong foundation, uneven execution, incomplete convergence.**

---

## Quantitative Profile

| Metric | Value |
|--------|-------|
| Library code | 61,278 lines across ~300 files |
| Test code | 41,570 lines across 185 files |
| Documentation | 15,566 lines across 41 docs |
| Dashboard | 12,437 lines |
| Total assertions | 5,327 |
| Law-style tests | 141 (76% of test files) |
| Lint violations | 518 (gate fails) |
| Cross-layer import violations | 3 |
| Non-exhaustive switches | 6 |
| Production dependencies | 4 (Playwright, Effect, TypeScript, yaml) |
| Dev dependencies | ~30 |

---

## 1. Efficacy

### What it accomplishes well

The end-to-end pipeline genuinely works: ADO test cases flow through parse → bind → compile → emit → execute, producing real Playwright specs with provenance-rich receipts. The resolution ladder (10 rungs from explicit → control → approved-knowledge → patterns → translation → live-DOM → agent → needs-human) is a sophisticated and well-designed approach to progressive resolution that degrades gracefully.

The dogfood loop (run → collect proposals → activate → rerun) demonstrates that the recursive improvement concept is operational, not theoretical. The speedrun harness with 15 tunable parameters shows genuine commitment to measurable self-improvement.

### Where efficacy falls short

The system's own metrics reveal the gap: demo scenarios achieve 100% hit rate via control resolution (the easy path), while synthetic scenarios hit only ~32% via alias matching (the path that tests real intelligence). This means the ambitious parts of the resolution ladder — the parts that distinguish Tesseract from a simpler template engine — are not yet delivering.

The 27 pre-existing test failures in `doctrine-compiler.ts` suggest that the doctrine verification layer, which is supposed to be an auto-verified constraint system, is itself partially broken. When the system that checks invariants has invariant violations, that's a credibility gap.

**Efficacy score: 7/10** — The deterministic pipeline core is solid. The adaptive/intelligent layers are architecturally ready but not yet delivering on their promise.

---

## 2. Performance

### Architectural performance decisions

The system makes several sound performance choices:

- **Parallel compilation**: `Effect.forEach` with configurable concurrency for scenario compilation
- **CPU-aware concurrency**: `resolveEffectConcurrency()` adapts to available cores
- **Checkpoint-accelerated seek**: Scene state reconstruction uses binary search on checkpoints, then linear replay — O(log n) seek for the dashboard time-lapse
- **Shared geometry/material constants** in R3F spatial components (module-level allocation avoidance)
- **InstancedMesh with imperative `updateMatrix()`** in render loops — correct Three.js performance pattern

### Performance concerns

The resolution pipeline context object (`RuntimeStepAgentContext`) threads 20+ fields through 10 strategy rungs. Each rung receives the full context even when it only needs a subset. At scale (hundreds of scenarios with dozens of steps each), this creates unnecessary allocation pressure.

All screen data must be loaded into memory before execution (`requireScreen` assumes in-memory registry). No lazy loading or streaming. For thin demos this is fine; for production with 100+ screens, this could become a bottleneck.

The dashboard's SharedArrayBuffer + WebSocket broadcast architecture is well-designed for real-time visualization, but the PubSub backpressure implementation should be stress-tested under high-throughput improvement runs.

**Performance score: 7/10** — Sound architectural choices, but the pipeline hasn't been stress-tested at production scale. The design allows for optimization; the optimization hasn't been done yet.

---

## 3. Clarity of Approach

### Strengths

The architectural vision is exceptionally clear. Three durable spines (interface, intervention, improvement) meeting six workflow lanes (intent, knowledge, control, resolution, execution, governance/projection) at one shared interpretation surface — this is a legible mental model. The documentation hierarchy (README → master-architecture → domain-ontology → coding-notes → seams-and-invariants) provides multiple entry points at different depths.

The domain layer is a standout. Branded types (`AdoId`, `ScreenId`, `ElementId`) prevent ID confusion at compile time. Phantom governance types (`Approved<T>`, `ReviewRequired<T>`, `Blocked<T>`) encode governance constraints at the type level. `foldGovernance` forces exhaustive handling of all three governance paths. `Match.discriminatorsExhaustive` ensures every union member is handled. This is not just type safety — it's using the type system to make illegal states unrepresentable.

The separation between canonical inputs (human-authored, review-gated) and derived outputs (compiler-generated, auto-approved) is a powerful conceptual distinction that runs through everything. When the system says "don't hand-edit generated files," it means it — the generated files are disposable object code.

### Weaknesses

The clarity breaks down at the application/runtime boundary. The application layer is Effect-based; the runtime layer is Promise-based. This means error tracking, resource cleanup, and observability lose their structured foundations exactly where complexity is highest (live DOM interaction, agent interpretation, translation). The bridge between layers (`Effect.promise(() => runScenarioStep(...))`) wraps promises in Effect but loses diagnostic detail.

The documentation quantity (41 docs, 15K+ lines) creates a paradox: the system is thoroughly documented, but the sheer volume means newcomers must navigate significant material before they can contribute. Several docs reference each other in a web that requires multiple passes to absorb. The `docs/agent-context.md` is auto-generated to address this, but it compresses nuance into a brief that may oversimplify.

AGENTS.md, CLAUDE.md, and CODEX.md appear to contain identical or near-identical content — the relationship between these files is unclear and adds to the cognitive load.

**Clarity score: 8/10** — The conceptual model is genuinely clear and well-expressed. The domain layer is exemplary. The application/runtime boundary and documentation volume introduce friction.

---

## 4. Consistency

### Where consistency is strong

Terminology is remarkably consistent. The six lanes and three spines are used uniformly across README, AGENTS.md, domain-ontology.md, and the codebase. The retired "dragon" metaphor has been fully excised — no trace remains in any document. The functional programming style (immutable data, const bindings, higher-order functions, no mutation) is enforced by ESLint rules and is followed throughout the domain and application layers.

The test naming convention (`.laws.spec.ts` for property-based, `.spec.ts` for contract) is consistent across 185 test files. The law test pattern — proving properties that hold for all valid inputs using seeded Mulberry32 PRNG — is applied uniformly.

The governance vocabulary (confidence vs. governance, compiler-derived vs. intent-only, approved vs. review-required vs. blocked) is used consistently in types, documentation, and code.

### Where consistency breaks down

The lint gate fails with 518 violations. This is the most significant consistency gap. The violations break down as:

| Category | Count | Severity |
|----------|-------|----------|
| `import()` type annotations forbidden | 77 | Style (fixable) |
| Unused variables/imports | ~300 | Hygiene (fixable) |
| Structured errors missing | 25 | Design (needs refactoring) |
| `let` instead of `const` | 12 | FP violation |
| `Array.push()` instead of spread | 7 | FP violation |
| Imperative `for` loops | 5 | FP violation |
| Non-exhaustive switches | 6 | Safety gap |
| Cross-layer import violations | 3 | Architecture breach |
| `process.env` outside boundary | 3 | Encapsulation breach |

The FP style rules are defined, documented, and enforced by ESLint — but 24 production code files still violate them. The cross-layer import violations (application → runtime, runtime → application, infrastructure → runtime) directly contradict the architectural doctrine. These aren't in tests; they're in production library code.

The runtime layer's Promise-based approach is inconsistent with the Effect-based approach in the application layer. Both layers are in `lib/`, both are core pipeline code, but they use different effect management paradigms.

**Consistency score: 6/10** — The conceptual consistency is exceptional. The enforcement consistency is not. The system defines its rules clearly and then breaks them in ~100 places.

---

## 5. Completeness

### What's complete

- **Deterministic pipeline**: parse → bind → compile → emit → graph — fully operational
- **Resolution ladder**: 10 rungs, all implemented and tested
- **Knowledge system**: Surfaces, screens, elements, hints, postures, patterns — full CRUD
- **Governance model**: Proposals, trust policy, approval flow, operator inbox
- **Projection system**: Specs, traces, reviews, graph surfaces — all emitted
- **CLI surface**: 30+ commands covering all workflow lanes
- **Dogfood loop**: Operational end-to-end
- **Speedrun/fitness**: 15 tunable parameters, convergence metrics
- **Dashboard**: Full R3F spatial visualization with 46 components
- **VSCode extension**: Task provider, diagnostics bridge, Copilot Chat participant
- **Documentation**: 41 docs covering architecture, operations, authoring, direction

### What's incomplete

- **Alias-based resolution**: ~32% hit rate for synthetic scenarios. The system acknowledges this gap in its own agent-context.md
- **Confidence-gated auto-approval** (Backlog A2): Designed but not yet wired to auto-approve proposals meeting trust-policy thresholds
- **Dogfood orchestrator** (Backlog A3): The `npm run dogfood` command exists but the full convergence-seeking chain (discover → sync → compile → run → inbox → auto-approve → recompile → rerun → ledger) isn't fully automated
- **Translation cache hardening** (Backlog C1): The structured translation bridge exists but caching isn't hardened
- **Widget family coverage** (Backlog C2): Only 4 widget handlers (button, input, table, OS-button). Real applications need 15+
- **Structured entropy** (Backlog D1): Designed but not fully implemented
- **Production deployment**: The system operates in dogfood mode only. No production suite is tracked
- **Error path coverage**: Only 34 `toThrow()` assertions across 5,327 total (0.6%). Error paths are under-tested
- **Lint gate**: `npm run check` fails. This means the defined quality gate cannot currently pass

### Deleted but not replaced

The agent-context.md explicitly lists deleted modules: `camera-choreography.ts`, `emotional-pacing.ts`, `breakage-simulator.ts`, `projection/index.ts`. Meanwhile, repository memories reference these modules as complete. The dashboard/visualization layer has 46 components and 558 tests according to stored memories, but these modules were deleted. This suggests a significant feature regression that hasn't been fully reconciled.

**Completeness score: 6/10** — The core pipeline is complete and operational. The adaptive intelligence layer (what makes this more than a template engine) is architecturally ready but execution-incomplete. The quality gate itself cannot pass.

---

## Synthesis

### What this repository does exceptionally well

1. **Domain modeling**: The use of branded types, phantom governance types, exhaustive pattern matching, and pure functional design in `lib/domain/` is production-quality work. This is among the best TypeScript domain modeling I've encountered.

2. **Architectural vision**: The three-spine, six-lane model with clear canonical/derived separation is a genuinely original contribution to the test automation space. The conceptual framework is compelling.

3. **Test philosophy**: 141 law-style tests using seeded PRNG to prove invariants (determinism, precedence, normalization, round-trips) is sophisticated. The architecture-fitness tests that use filesystem inspection to enforce layer boundaries are clever.

4. **Documentation depth**: 41 docs with consistent vocabulary, clear hierarchy, and auto-generated agent briefs. The docs-as-tests pattern ensures terminology doesn't silently drift.

5. **Minimal dependency surface**: 4 production dependencies. The system builds its own abstractions rather than accumulating library debt.

### What needs attention

1. **Lint gate must pass**: 518 violations means the defined quality standard isn't met. The most critical are the 3 cross-layer import violations, 6 non-exhaustive switches, and 25 unstructured error throws. The unused imports are tedious but fixable.

2. **Runtime/application paradigm mismatch**: The Promise-based runtime should migrate to Effect, or the boundary should be explicitly documented as a paradigm bridge. Currently it's an implicit inconsistency.

3. **Resolution intelligence gap**: 32% synthetic hit rate is the system's most important metric to improve. The entire value proposition depends on the resolution ladder working for non-trivial cases.

4. **Feature regression reconciliation**: The deleted visualization modules (camera-choreography, emotional-pacing, etc.) vs. the 46-component dashboard needs to be reconciled. Either the dashboard was simplified or the memories are stale.

5. **Error path testing**: 0.6% error-path assertion coverage is too low for a system that governs its own improvement. The governance model needs negative-path proof.

### The fundamental tension

Tesseract is a system that aspires to be a *governed, self-improving compiler from human intent to executable tests*. The governed part works: canonical inputs, derived outputs, trust policy, approval flow. The compiler part works: deterministic pipeline from ADO → Playwright spec. The self-improving part is architecturally ready but execution-incomplete.

The system has built the scaffolding for something genuinely ambitious. The question is whether the scaffolding will be filled in (alias matching improvement, auto-approval, full dogfood orchestration) or whether the architectural investment will remain ahead of the delivered capability.

---

## Scores Summary

| Dimension | Score | Key Factor |
|-----------|-------|-----------|
| **Efficacy** | 7/10 | Core pipeline works; adaptive intelligence at 32% |
| **Performance** | 7/10 | Sound architecture; not stress-tested at scale |
| **Clarity** | 8/10 | Exceptional domain modeling; documentation volume friction |
| **Consistency** | 6/10 | Strong conceptual consistency; 518 lint violations |
| **Completeness** | 6/10 | Core complete; quality gate fails; adaptive layers incomplete |
| **Overall** | **6.8/10** | Strong foundation, uneven execution |
