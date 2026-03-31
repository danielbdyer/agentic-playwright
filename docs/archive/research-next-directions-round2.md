# Research Round 2: Four New Domains Uncovered

*Sequel to `research-next-directions.md`. March 2026.*

Round 1 examined the interface graph, runtime interpreter, dogfood loop, and knowledge layer. Those four perspectives converged on "close the feedback loops." But they also surfaced four equally important domains that went unexamined — domains that determine whether closing those loops is structurally sound or just plumbing.

---

## Perspective 5: The Emitted Surface — AST-Backed Codegen and Readable Playwright Output

**Research question**: The system's entire user-facing output is emitted Playwright test files. How good is the emission pipeline, and does the "readable spec" promise hold up?

### Why this matters

The architecture doc says "the emitted surface is standard Playwright with QA-grade narrative." If the emitted code is brittle, unreadable, or doesn't faithfully represent what the runtime actually does, then the system's most visible artifact undermines trust. The emission layer (`lib/domain/spec-codegen.ts`, `lib/domain/ts-ast.ts`, `lib/domain/grounded-flow.ts`, `lib/application/emit.ts`) is where the machine's understanding meets the human operator's eyes.

### What we found

- **AST-backed codegen**: `spec-codegen.ts` (281 lines) uses the TypeScript compiler API to build actual AST nodes — not string templates. This is a strong architectural choice that prevents injection and maintains structural correctness.
- **Grounded flow**: `grounded-flow.ts` (121 lines) translates `BoundScenario` + `ScenarioInterpretationSurface` into `GroundedSpecFlow` — an intermediate representation that carries provenance, governance, data source, and confidence per step.
- **Review projection**: `projections/review.ts` (345 lines) generates markdown review artifacts alongside the spec.
- **Law tests exist**: `readable-emission.laws.spec.ts` (344 lines) — the emission has property-based invariant tests.

### Findings

The emission layer is **sophisticated and structurally sound**:

1. **True AST construction**: `ts-ast.ts` wraps the TypeScript compiler API (`ts.factory.*`) with a clean builder DSL — `identifier()`, `callExpression()`, `awaitExpression()`, `constStatement()`, `importDeclaration()`. The printer uses `ts.createPrinter()` with `LineFeed` endings. This guarantees syntactic correctness by construction.

2. **POM-style facades**: Each screen becomes a `const testScreen = { ... }` object with arrow-function methods that delegate to `scenario.executeStep(index, title)`. Runtime internals (`runtimeEnvironment`, `runState`, `runPlan`) are never exposed. The readable-emission law tests explicitly verify this encapsulation — raw pipeline calls like `runScenarioHandshake` must never appear.

3. **Intent-only steps are included, not hidden**: Deferred steps emit as normal method calls. The `intent-only` confidence appears in `test.info().annotations` metadata, not as a FIXME in the test body. Only truly `unbound` steps trigger `test.fixme()`.

4. **Governance → lifecycle → test annotation**: `blocked` status → `test.skip()`. `needs-repair` → `test.fail()`. `review-required` → visible in review markdown and trace, but does not alter the test function. Aggregate governance is computed as: any step blocked → blocked; any step review-required → review-required.

5. **Four artifacts per scenario**: spec file, trace JSON (with `ScenarioExplanation`), review markdown (with 40+ fields per step including exhaustion trail, rung distribution, hit rates), and proposals bundle. All four are fingerprint-cached and incrementally rebuilt only when inputs change.

6. **Determinism verified at 100 seeds**: The law tests run emission 100 times with identical input and assert byte-identical output. AST round-trip validity (zero TypeScript diagnostics) is also tested. Step count parity (emitted `await` calls == input step count) is enforced.

### Where it should go

- **Fixture-backed data emission** ✅: Currently data values resolve to hardcoded literals. Emitting dataset references or posture-variant parameterization would make specs work across data combinations.
- **Parity proof**: No explicit test verifies that the readable spec and the runtime execution produce equivalent results. Adding a "spec replay" test that runs the emitted spec and compares its trace to the runtime's trace would close this gap.
- **Richer deferred-step rendering**: Intent-only steps look identical to resolved steps in the emitted code. A QA reading the spec can't tell which steps are grounded and which are deferred without checking annotations.

---

## Perspective 6: The Law Test Suite — 5,000 Lines of Executable Specification

**Research question**: The codebase has 20 law-style test files (`.laws.spec.ts`) totaling ~5,000 lines. What invariants do they collectively guarantee, where are the gaps, and do they function as a specification for the system's core contracts?

### Why this matters

Law tests are the system's immune system. They encode properties that must hold regardless of input. If they're comprehensive, they make refactoring safe and A1-style architectural shifts possible without regressions. If they're incomplete, the system's guarantees are aspirational rather than enforced.

### What we found

- **20 law test files** covering: precedence, posture contracts, governance, auto-approval, intent interpretation, translation, emission readability, dogfood invariants, learning invariants, pipeline fitness, architecture fitness, bottleneck calibration, speedrun statistics, agent lattice, visitors, collections
- **Largest files**: Phase 6 learning invariants (512 lines), posture contracts (442 lines), pipeline fitness (359 lines), readable emission (344 lines)
- **Naming convention**: files end in `.laws.spec.ts`, suggesting the team distinguishes law tests (property-based invariants) from regular tests (example-based)

### Findings

The law tests are a **genuine specification layer** — a mix of property-based and example-based tests, with clear strengths and identifiable gaps.

**Property-based (true forall-X style)**:
- **Bottleneck calibration** (297 lines): Weight sum = 1.0 +/- 0.01 preserved across all calibrations; floor >= 0.05 enforced even with strong negative correlation; deterministic under input permutation. Tested with 10-20 cumulative iterations.
- **Learning invariants** (512 lines): Fragment provenance completeness proportional to graph/selector refs; corpus health deterministic under fragment reordering; replay reproducibility = 1.0 when knowledge unchanged. 150+ seeds.
- **Readable emission** (344 lines): Determinism across 100 invocations; AST round-trip with zero diagnostics; step count parity.
- **Collections** (65 lines): `uniqueSorted` idempotence; `groupBy` determinism preserving insertion order. 150 random seeds.
- **Speedrun statistics** (300 lines): Mean, stddev, percentile correctness; regression detection thresholds; zero-stddev NaN safety.

**Example-based but contract-focused**:
- **Precedence** (138 lines): Explicit > Control > Approved Knowledge ordering; candidate permutation stability; needs-human only after machine rungs exhausted.
- **Auto-approval** (204 lines): Decision table covering all three execution profiles x trust policy states. `ci-batch` never auto-approves. Forbidden heal classes block even at 1.0 confidence.
- **Posture contracts** (442 lines): Normalization idempotence; effect deduplication via sort keys; effect target resolution precedence. ~75 random seeds.
- **Dogfood invariants** (336 lines): Ledger schema correctness; convergence reason enum completeness; adapter shape equivalence across deterministic and Copilot providers.
- **Visitors** (337 lines): Exhaustive dispatch for 7 discriminated union folds (ValueRef, StepInstruction, LocatorStrategy, ResolutionReceipt, etc.). Totality — no fold returns undefined.

**Coverage gaps — contracts without law tests**:
1. **Governance phantom types**: `Approved<T>`, `Blocked<T>`, `foldGovernance` — no laws test type-level isolation or minting rules
2. **Interface graph construction**: No acyclic DAG invariants, no parent-child ref integrity laws
3. **Selector canon ranking**: No laws on specificity ordering or determinism under alias expansion
4. **Discovery pipeline**: No end-to-end phase transition invariants
5. **Knowledge promotion**: No laws on how proposals become canonical knowledge
6. **Evidence sufficiency**: No laws on certification state machine transitions
7. **Cross-screen transitions**: No laws on route-variant application or state preservation

**Migration readiness: ~65%.** Architecture fitness laws (domain purity, import boundaries), type system laws (fold exhaustiveness, posture tiers), and pure function laws (statistics, collections, calibration) are implementation-agnostic and could serve as hard requirements for any reimplementation. Pipeline phase laws are contract-focused enough to port. But the governance and graph gaps mean critical contracts are unspecified.

### Where it should go

- **Add governance phantom type laws** ✅: Test that `Approved<T>` values can only be created through approved code paths, not by direct construction with `governance: 'approved'` strings.
- **Add graph construction laws** ✅: Acyclicity, ref integrity, node uniqueness, deterministic fingerprinting under input permutation.
- **Promote the law suite to a named specification**: If these tests are the migration spec for A1, name them as such and fill the gaps before the migration begins.

---

## Perspective 7: The Governance Boundary — Phantom Types, Trust Policy, and Formal Correctness

**Research question**: The system uses phantom branded types (`Approved<T>`, `Blocked<T>`), `foldGovernance` for exhaustive case analysis, and a trust policy for gating canonical mutations. How well does this governance model actually work in practice?

### Why this matters

Governance is the system's safety contract. If `Approved<T>` is a real type-level guarantee, then the compiler prevents unsafe operations. If it's a runtime-only convention with casts, then governance violations can slip through silently. The distinction between "governance is modeled" and "governance is enforced" is the difference between a principled system and a documented one.

### What we found

- **Phantom branded types** in `lib/domain/types/workflow.ts`: `Approved<T>`, `Blocked<T>`, `ReviewRequired<T>` using a `GovernanceBrand` symbol
- **Type guards**: `isApproved`, `isBlocked`, `isReviewRequired` — narrow at the type level
- **Assertion**: `requireApproved` — throws if governance isn't `'approved'`
- **Exhaustive fold**: `foldGovernance` with required handlers for all three states
- **ApprovedEnvelope<T>** / **BlockedEnvelope<T>** — typed wrappers for cross-boundary artifacts
- **Trust policy** evaluates per-artifact-type confidence thresholds with forbidden auto-heal classes

### Findings

The governance model is **well-designed at the type level but under-adopted in practice**. The gap between the domain layer's aspirations and the application layer's usage is the most significant structural finding in Round 2.

**Usage counts across `lib/`**:
- `foldGovernance`: **0 production call sites**. Defined in `workflow.ts`, referenced in architecture fitness tests and docs, but never called in application or runtime code.
- `requireApproved`: **0 production call sites**. Defined but only appears in docs and AGENTS.md.
- `isApproved` / `isBlocked` / `isReviewRequired`: **7 total calls** across 3 files (`grounded-flow.ts`, `scenario/explanation.ts`, `execution/validate-step-results.ts`).
- Raw `governance === 'approved'` / `=== 'blocked'` string checks: **10 occurrences** across `bind.ts`, `task.ts`, `workflow.ts`.
- `.governance` field access: **43 occurrences** across 17 files — mostly passing the value through, not branching on it.

**Where governance is "minted"**:
- `deriveGovernanceState({ hasBlocked, hasReviewRequired })` in `catalog/envelope.ts` — a pure function that takes boolean flags and returns a `Governance` string. This is the primary minting site, called in `bind.ts`, `task.ts`, `build-run-record.ts`, and `build-proposals.ts`.
- Hardcoded `governance: 'approved'` literals in `validation/core.ts` (3), `discover-screen.ts` (1), `agent-session-adapter.ts` (3), `emit.ts` (1), and `runtime/agent/resolution-stages.ts` (4).
- Hardcoded `governance: 'blocked'` in `runtime/scenario.ts` (2) for failed/needs-human steps.

**The phantom type gap**: `Approved<T>` and `Blocked<T>` are defined and exported, but the production pipeline **never creates or requires them**. All governance flows through the plain `Governance` string field. The phantom types are aspirational infrastructure — they would catch governance violations at compile time if adopted, but currently serve no enforcement role.

**Trust policy enforcement**: The trust policy in `lib/application/trust-policy.ts` (95 lines) is genuinely enforced. `evaluateTrustPolicyDecision()` checks per-artifact-type confidence thresholds and `forbiddenAutoHealClasses`. It returns `allow` / `review` / `deny`, which feeds into `activateProposalBundle()` to gate auto-approval. This is the one governance boundary that is **real and operational**, not aspirational.

### Where it should go

1. **Adopt `foldGovernance` at decision boundaries** ✅**.** The 10 raw string checks in `bind.ts`, `task.ts`, etc. should use `foldGovernance` for exhaustive case analysis. This is low-effort, high-value — it ensures new governance states (if ever added) produce compile errors at every branching site.

2. **Activate phantom types at one critical boundary** ✅**.** Pick the highest-value boundary — e.g., the `emit` stage should require `Approved<BoundScenario>` to generate a spec, `Blocked<BoundScenario>` to emit `test.skip()`. This would make governance a compile-time guarantee at the spec generation boundary, not just a runtime check.

3. **Centralize governance minting** ✅**.** The 14 hardcoded `governance: 'approved'` literals across 7 files are forgeable — any code can claim approval. A `mintApproved(artifact, evidence)` function that requires evidence provenance would make governance creation auditable and centralized.

4. **Add governance law tests** ✅**.** The architecture fitness tests verify that `foldGovernance` is exported and covers three cases, but no test verifies that governance flows correctly through the pipeline. A law test asserting "blocked input → blocked output at every pipeline stage" would catch governance leaks.

---

## Perspective 8: The Derived Graph and Scenario Decomposition — The 1,700-Line Projection Engine

**Research question**: `lib/domain/derived-graph.ts` is the single largest domain file at 1,731 lines. It builds the `DerivedGraph` — a scenario-centric projection that differs from the `ApplicationInterfaceGraph`. What is it, how does it relate to the interface graph, and is the system maintaining two parallel graph models?

### Why this matters

Round 1 researched the `ApplicationInterfaceGraph` (the interface intelligence projection). But there's a separate `DerivedGraph` that appears to be scenario-centric — projecting knowledge, controls, runs, and capabilities into a graph per scenario. If these two graphs overlap significantly, the system may have a "parallel truth" problem that contradicts the architecture's "prefer pure derivations over storing parallel truth" principle. If they serve distinct purposes cleanly, the decomposition is intentional and sound.

### What we found

- **`derived-graph.ts`** (1,731 lines) builds `DerivedGraph` with `GraphNode` and `GraphEdge` types (distinct from `InterfaceGraphNode` / `InterfaceGraphEdge`)
- Imports scenarios, controls, runs, surfaces, knowledge, interpretation drift, improvement runs, datasets, runbooks, resolution controls, confidence overlays
- Generates MCP resources and templates (`MappedMcpResource`, `MappedMcpTemplate`)
- Appears to be the backing model for `npm run graph` — the operator-facing projection
- Uses `graphIds` and `mcpUris` identity generators

### Findings

The two graphs are **intentionally separate and serve complementary purposes**. This is not a parallel-truth problem — it's a well-motivated separation of concerns.

**ApplicationInterfaceGraph** (per-application, interface-centric):
- 11 node kinds: route, route-variant, screen, section, surface, target, snapshot-anchor, harvest-run, state, event-signature, transition
- 9 edge kinds: route-target, variant-of-route, contains, references-target, references-snapshot, discovered-by, requires-state, causes-transition, results-in-state
- Built by `interface-intelligence.ts` from approved knowledge + discovery runs
- Typed node fields: `route?: RouteId`, `surface?: SurfaceId`, `element?: ElementId`, `targetRef?: CanonicalTargetRef`
- **Answers**: "What exists on each screen? What selectors work? What state transitions are possible?"

**DerivedGraph** (per-workspace, scenario-centric):
- 24 node kinds: snapshot, screen, screen-hints, pattern, confidence-overlay, dataset, resolution-control, runbook, section, surface, element, posture, capability, scenario, step, generated-spec, generated-trace, generated-review, evidence, policy-decision, participant, intervention, improvement-run, acceptance-decision
- 12 edge kinds: derived-from, contains, references, uses, learns-from, affects, asserts, emits, observed-by, proposed-change-for, governs, drifts-to
- Built by `derived-graph.ts` from scenarios + bound scenarios + runs + improvements + controls + evidence
- Generic node fields: `payload?: Record<string, unknown>` with flexible structure
- **Answers**: "Why do tests pass or fail? What improved? What drifted? What needs attention?"

**The type systems are completely separate**: `InterfaceGraphNode` / `InterfaceGraphEdge` (in `types/interface.ts`) vs. `GraphNode` / `GraphEdge` (in `types/projection.ts`). They share no inheritance or structural overlap.

**Knowledge overlap is read-only, not duplicated**: Both graphs consume `ScreenElements`, `ScreenPostures`, `SurfaceGraph` from the knowledge layer, but the ApplicationInterfaceGraph models their structural identity (targets, selectors, state topology) while the DerivedGraph models their operational relationships (which scenarios use them, what evidence they produced, which proposals affect them).

**MCP integration is on DerivedGraph only**: `MappedMcpResource` and `MappedMcpTemplate` expose four URI patterns:
- `tesseract://graph` — full workspace provenance graph
- `tesseract://screen/{screenId}` — screen surface + capabilities
- `tesseract://scenario/{adoId}` — scenario execution trace
- `tesseract://impact/{nodeId}` — impact subgraph

This is the **E2 VSCode extension surface** foundation. The MCP resources let a Copilot Chat participant query the workspace graph without running the full CLI.

**Two-pass conditional edge construction**: DerivedGraph uses a sophisticated pattern where Phase 1 builds unconditional nodes/edges and Phase 2 builds conditional edges that only materialize if both source and target nodes exist. This prevents dangling references when intermediate artifacts are missing.

### Where it should go

1. **Cross-graph references** ✅: The DerivedGraph's `screen` and `element` nodes could carry explicit references to ApplicationInterfaceGraph `targetRef` values. Today they're implicitly connected by shared `ScreenId` / `ElementId` values but not structurally linked. Adding cross-graph edges (or at least stable reference fields) would let impact queries traverse from "this scenario failed" to "this selector is unhealthy" without joining by string ID.

2. **MCP resource expansion** ✅: The four current MCP URIs are a minimal viable surface. Adding `tesseract://proposal/{proposalId}`, `tesseract://bottleneck/{screen}`, and `tesseract://run/{runId}` would make the agent workbench fully queryable from VSCode.

3. **DerivedGraph as the operator cockpit backing model**: The E1 backlog item (operator cockpit) could be built entirely as a consumer of DerivedGraph + its MCP URIs. The graph already carries the right provenance relationships — what's missing is a rendering layer, not a data model.

---

## Cross-cutting synthesis: structural fidelity

Round 1 found that the feedback loops aren't closed. Round 2 asks whether the output surfaces are faithful, the invariants are enforced, the governance is real, and the projections are coherent.

**The answer is nuanced.** The emission layer is excellent — AST-backed, deterministic, property-tested. The law test suite is a genuine specification layer covering ~65% of core contracts. The two graph models are intentionally separate and well-motivated. But the governance boundary has a significant gap: phantom types are defined but unused, `foldGovernance` is never called in production, and governance values are freely mintable by any code path.

| Domain | Structural Fidelity | Key Gap |
|--------|---------------------|---------|
| Emission layer | High | No spec-runtime parity proof; deferred steps look identical to resolved |
| Law test suite | Medium-High | 10 critical contracts lack laws (governance, graph, discovery, promotion) |
| Governance boundary | Low | Phantom types aspirational; 14 forgeable minting sites; `foldGovernance` unused |
| Graph architecture | High | Two clean complementary models; cross-graph references missing |

The single highest-leverage structural improvement across all four domains: **adopt `foldGovernance` and phantom type enforcement at the emission boundary**. This would make governance real at the system's most visible output surface — the point where operators decide whether to trust the machine.
