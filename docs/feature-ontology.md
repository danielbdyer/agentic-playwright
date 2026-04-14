# Feature Ontology and Rewrite Planning Map

> Status: Active — high-level decomposition of the current feature set for simplification planning.

This document inventories the codebase from a technical planning perspective: what features exist, why they exist, where they live, and how they interact. The goal is to support iterative simplification (fewer lines, less duplicated logic, clearer boundaries) without deleting load-bearing behavior.

Use this as a **planning ontology**, not a code-level spec. It is intentionally coarse enough for rewrite strategy, but precise enough to prevent accidental semantic regressions.

## 1) Product-level capability model

At a product level, the system is a governed QA automation intelligence engine with three macro capabilities:

- **Interface understanding** (deterministic and repeatable): ingest intent + observed application reality and compute executable interpretations.
- **Intervention handling** (agentic and governed): accept targeted overrides only when receipt-backed and policy-valid.
- **Recursive improvement** (measurable and auditable): run loops that propose, evaluate, accept/reject, and score whether learning actually helped.

Everything in the repository can be mapped to one or more of these three capabilities.

## 2) Architectural feature families (what exists)

### A. Intent ingestion and canonicalization

Primary feature set:

- Ingest upstream test intent (ADO/manual test semantics) and normalize it into canonical scenario artifacts.
- Preserve original intent wording while producing machine-usable structure for planning/execution.
- Resolve scenario-level defaults, overrides, and run metadata.

Planning value:

- This is the **front door contract**. Any rewrite can change internal representation, but cannot weaken scenario fidelity.

### B. Canon system and lookup-chain semantics

Primary feature set:

- Six-slot lookup chain with precedence among operator override, agentic override, deterministic observation, reference canon, live derivation, and cold derivation.
- Separation between canonical artifacts, reference canon, and derived artifacts.
- Posture- and mode-based controls (`cold-start`, `warm-start`, `production`, plus skip flags).

Planning value:

- This is the **truth arbitration core**. Most simplification bugs will be precedence bugs; keep this explicit and testable.

### C. Deterministic discovery and compiler lane

Primary feature set:

- Deterministic decomposition of observed data into typed artifacts.
- Rule-driven binding of scenarios to runtime-resolvable steps.
- Deterministic approval path for compiler-derived outputs.
- Projection of derived execution assets (specs, traces, proposals, reviews).

Planning value:

- This is the **repeatability engine**. A terse rewrite should preserve determinism guarantees before optimizing ergonomics.

### D. Runtime interpretation and execution lane

Primary feature set:

- Runtime step resolution against known knowledge plus live DOM exploration fallback.
- Widget/role affordance handling for interaction strategies.
- Data binding ladder (scenario override -> runbook/dataset -> defaults -> generated token).
- Playwright execution orchestration and run record capture.

Planning value:

- This is the **contact surface with the SUT**. Simplification should isolate domain intent from browser-specific mechanics.

### E. Knowledge authoring and supplementation lane

Primary feature set:

- Screen-local hints, shared patterns, surfaces, snapshots, route knowledge, and component choreography.
- Promotion path from local/specific discoveries toward reusable shared knowledge.
- Merge and patch semantics for non-destructive knowledge evolution.

Planning value:

- This is the **organizational memory surface**. Rewrite opportunity: unify repetitive YAML handling and normalization pipelines.

### F. Intervention and governance lane

Primary feature set:

- Typed `InterventionReceipt` model for override legitimacy.
- Handoff metadata and decision context for human/agent collaboration.
- Governance states (`approved`, `review-required`, `blocked`) distinct from confidence provenance.
- Policy boundary where certification/classification is evaluated.

Planning value:

- This is the **safety and accountability envelope**. Terseness cannot come at the cost of provenance and review semantics.

### G. Improvement and scoring lane

Primary feature set:

- Speedrun loops (corpus/iterate/fitness/score/baseline) and convergence workflows.
- Scorecard and theorem-family measurements (including direct/proxy/missing evidence posture).
- Metrics for deterministic memory value (M5) and intervention economics (C6).
- Proposal generation, activation, and demotion pathways.

Planning value:

- This is the **learning economics engine**. Rewrite should preserve metric computability and comparable historical trending.

### H. Operator and tooling lane

Primary feature set:

- CLI scripts for context mapping, diagnostics, speedrun orchestration, typechecks, and migration helpers.
- MCP server/tool bridge for dashboard-like agent workflows.
- File-backed decision queue and work-item approval mechanics.

Planning value:

- This is the **usability shell** around core engines. Rewrite opportunity: collapse duplicate command-path logic and shared argument parsing.

## 3) Cross-cutting invariants (must survive any rewrite)

- **Provenance is part of correctness**: source lineage and decision history are not optional metadata.
- **Deterministic vs agentic lanes remain distinct**: they can reconcile, but should not be conflated.
- **Lookup precedence is explicit and concern-specific**: resolution/data/run-selection ladders are stable semantics.
- **Domain purity boundaries remain intact**: side-effect-free domain layer, orchestrating application layer, adapter-based infrastructure.
- **Envelope vocabulary remains uniform**: stage/source/verdict/fingerprint consistency across artifact handoffs.

These invariants are the non-negotiable contract for low-risk simplification.

## 4) Decomposition by runtime lifecycle

### Phase 1: Intake and normalization

- Load suite-scoped inputs (intent, scenarios, fixtures, policy, knowledge, controls, evidence).
- Normalize to internal envelope-bearing structures.
- Apply posture/mode gates to determine which sources are eligible.

### Phase 2: Resolution planning

- For each scenario step, compute candidate bindings via precedence ladders.
- Attach confidence/provenance and governance status.
- Emit unresolved/needs-human outcomes only after deterministic ladders are exhausted.

### Phase 3: Execution and observation

- Execute steps through runtime affordances and Playwright adapters.
- Capture run records, traces, and evidence projections.
- Persist derived operational artifacts for diagnostics and learning.

### Phase 4: Learning and intervention

- Generate proposals from failures/drift/ambiguity.
- Accept or reject proposals through governance and approvals.
- Convert approved interventions into canonical overrides with receipt lineage.

### Phase 5: Scoring and convergence

- Recompute fitness, scorecards, and theorem obligations.
- Measure whether accepted changes improved target outcomes in bounded windows.
- Produce baseline snapshots and trend deltas for governance review.

## 5) Feature ontology by concern (planning-friendly index)

### 5.1 Intent and scenario semantics

- ADO sync ingestion
- Scenario schema and validation
- Scenario partition/corpus management
- Step-level intent preservation
- Runbook/context selection rules

### 5.2 Knowledge and reference canon

- Surface knowledge (UI-level understanding)
- Screen hints (screen-local resolution hints)
- Shared patterns (cross-screen reusable hints)
- Snapshot templates and aliases
- Route knowledge and routing heuristics
- Component choreography knowledge

### 5.3 Control and data systems

- Resolution controls
- Dataset controls and defaults
- Runbook definitions
- Data precedence ladders
- Deterministic token generation fallback

### 5.4 Resolver and planner engine

- Locator ladder strategy
- Affordance-driven action derivation
- Fallback exploration and degraded resolution
- Ambiguity escalation semantics (`needs-human`)
- Resolution receipts and confidence tagging

### 5.5 Runtime execution engine

- Playwright adapter layer
- Widget/role interaction adapters
- Execution guardrails and safe operations
- Run record schema and persistence
- Error classification and retry/degradation patterns

### 5.6 Governance and policy

- Trust-policy evaluation
- Certification annotations
- Approval/review/blocked decision surfaces
- Intervention receipt validation
- Governance folding utilities for exhaustive handling

### 5.7 Improvement loop and optimization

- Proposal generation and clustering
- Proposal activation pipeline
- Demotion and supersession logic
- Convergence proof workflows
- Fitness metrics and scorecard trend computation
- Benchmark evaluation and historical baselines

### 5.8 Projections and outputs

- Generated spec artifact emission
- Trace/review/proposal projection files
- Graph projection and index generation
- Task/resolution projection surfaces
- Dashboard/MCP summary projections

### 5.9 Developer workflow and diagnostics

- Context/module-map generation
- Path/trace/impact/surface diagnostics
- Typecheck/test lanes
- Migration and maintenance scripts
- MCP fallback bridge utilities

## 6) Simplification opportunities (where cruft is likely)

### Opportunity class A: duplicated precedence logic

Symptoms:

- Similar ladder semantics implemented in multiple modules with minor variation.

Refactor direction:

- Centralize precedence rules as data + total fold visitors.
- Generate concern-specific evaluators instead of hand-coding each chain.

### Opportunity class B: envelope/header repetition

Symptoms:

- Repeated shaping/mapping of shared envelope metadata across artifact transforms.

Refactor direction:

- Standardize envelope constructors/mappers and remove handwritten boilerplate.

### Opportunity class C: parser/normalizer proliferation

Symptoms:

- Parallel validation and normalization routines for adjacent canon formats.

Refactor direction:

- Build canonical decoding combinators and shared schema adapters.

### Opportunity class D: script orchestration overlap

Symptoms:

- CLI scripts with repeated setup, path resolution, and reporting patterns.

Refactor direction:

- Introduce shared command harness + typed command contracts.

### Opportunity class E: projection emitter scattering

Symptoms:

- Output projections assembled in multiple places with repeated lineage/governance stitching.

Refactor direction:

- Consolidate into projection pipeline primitives with composable sinks.

## 7) Rewrite-safe slicing strategy

To rewrite tersely without semantic loss, apply slicing in this order:

1. **Extract invariant contracts first** (types, precedence tables, governance enums, envelope primitives).
2. **Consolidate duplicate transforms** (normalizers, mappers, projection builders).
3. **Collapse orchestration boilerplate** (script and app-level wrappers).
4. **Then compress runtime adapters** once contracts are stable.
5. **Re-baseline metrics after each slice** (M5/C6 + fitness + convergence) to detect regressions early.

## 8) Definition of done for this planning document

This ontology is useful when teams can answer, for any proposed deletion or rewrite:

- Which feature family does this code serve?
- Which invariant would be violated if removed?
- Which lifecycle phase would regress?
- Which scorecard metrics would detect the regression?
- Which output surfaces should still be explainable afterward?

If those questions remain answerable, the codebase can be made significantly terser without losing its core function.

## 9) Technical implementation surfaces (module-level I/O contracts)

This section maps conceptual features to concrete implementation surfaces: **what goes in, what comes out, and which module owns the transformation**.

### 9.1 Intent intake (ADO -> canonical snapshot)

**Library surfaces involved**

- Node/WHATWG `fetch` for live ADO calls.
- `effect` for typed error channels and retry scheduling.
- Domain hash + identity helpers for stable IDs and content fingerprints.

**Primary producer modules**

- `lib/infrastructure/ado/live-ado-source.ts`
- `lib/infrastructure/ado/local-ado-source.ts`

**Input shape (logical)**

- Live: ADO WIQL query + work item payloads (`System.*`, `Microsoft.VSTS.TCM.*` fields).
- Local: fixture JSON files under `fixtures/ado/*.json`.

**Output shape (logical)**

- Deterministic snapshot object with:
  - `id`, `revision`, `title`
  - `suitePath`, area/iteration metadata
  - `steps[]` (action/expected)
  - parameter rows / data rows
  - `contentHash`
  - `syncedAt`

**Handshake abstraction**

- Generic concept: *External intent source* port.
- Concrete implementation: `AdoSourcePort` with `listSnapshotIds()` and `loadSnapshot(adoId)`.

### 9.2 Canon decomposition and artifact minting

**Library surfaces involved**

- Pure TS data transforms + domain hash/identity branding.
- `effect` orchestration in application services.

**Primary producer modules**

- `lib/application/canon/decompose-*.ts`
- `lib/application/canon/minting.ts`
- `lib/application/catalog/*.ts`

**Input shape (logical)**

- Higher-order canonical documents (surfaces, hints, patterns, snapshots, routes, etc.).

**Output shape (logical)**

- Atomized envelope-bearing artifacts enriched with source/stage/provenance metadata.

**Handshake abstraction**

- Generic concept: *Document -> atom decomposition pipeline*.
- Concrete implementation: decomposer registry + minting helpers + workspace catalog loaders.

### 9.3 Resolution pipeline (scenario step -> executable binding)

**Library surfaces involved**

- Domain visitor/fold pattern for discriminator-safe precedence decisions.
- Effect-based orchestration across interpretation and execution phases.

**Primary producer modules**

- `lib/application/commitment/planner.ts`
- `lib/application/commitment/interpret.ts`
- `lib/application/resolution/*.ts`
- `lib/runtime/resolution/*.ts`

**Input shape (logical)**

- Scenario step + run context + knowledge/control/canon context + previous evidence.

**Output shape (logical)**

- Bound step program instructions with confidence and governance annotations.
- Fallback decisions or `needs-human`/proposal generation signals.

**Handshake abstraction**

- Generic concept: *Resolution strategy chain*.
- Concrete implementation: stage registry + strategy walker + receipt/proposal emitters.

### 9.4 Execution pipeline (bound instructions -> run evidence)

**Library surfaces involved**

- Playwright page/locator APIs through runtime + adapter facades.
- Effect orchestration for sequencing, failure handling, and persistence.

**Primary producer modules**

- `lib/application/commitment/execute-steps.ts`
- `lib/application/commitment/persist-evidence.ts`
- `lib/application/commitment/build-run-record.ts`
- `lib/runtime/execute/program.ts`
- `lib/runtime/scenario.ts`

**Input shape (logical)**

- Bound step programs + runtime browser context + datasets + control policies.

**Output shape (logical)**

- Step receipts, run records, persisted evidence, and proposal candidates.

**Handshake abstraction**

- Generic concept: *Interpreter for bound program IR*.
- Concrete implementation: runtime interpreters (`execute`, `dry-run`, `diagnostic`, `evaluator`) plus commitment fold.

### 9.5 Improvement loop (run history -> proposals -> scorecards)

**Library surfaces involved**

- Effect orchestration + deterministic scoring visitors.
- File-backed state for journals, baselines, and score trees.

**Primary producer modules**

- `lib/application/improvement/speedrun.ts`
- `lib/application/improvement/fitness.ts`
- `lib/application/improvement/scorecard.ts`
- `lib/application/improvement/convergence-proof.ts`
- `scripts/speedrun.ts`

**Input shape (logical)**

- Iteration run records, intervention receipts, benchmark contexts, historical baselines.

**Output shape (logical)**

- Fitness reports, scorecards, convergence proofs, activation/demotion recommendations.

**Handshake abstraction**

- Generic concept: *Closed-loop optimizer with governed updates*.
- Concrete implementation: corpus/iterate/fitness/score/baseline command family.

## 10) Playwright technical details (DOM and ARIA flow)

This section answers the “how exactly does the runtime touch DOM state?” question with API-level specificity.

### 10.1 ARIA snapshot capture path

**Primary path**

1. Resolve target `Locator` (or use `body` locator for whole-page snapshot).
2. Convert locator to element handle via `locator.elementHandle()`.
3. Call `locator.page().accessibility.snapshot({ root: handle, interestingOnly: false })`.
4. Normalize + render snapshot into YAML-shaped text representation.

**Why this matters**

- Capturing from a rooted handle scopes snapshot collection to relevant subtree.
- `interestingOnly: false` keeps full accessibility tree fidelity for downstream matching.

**Owning modules**

- `lib/playwright/aria.ts`
- Re-export adapter: `lib/runtime/adapters/aria.ts`

### 10.2 Locator strategy resolution path

**Strategy types used in the Playwright utility layer**

- `test-id` -> `page.getByTestId(...)`
- `role-name` -> `page.getByRole(role, { name })`
- `css` -> `page.locator(cssSelector)`

**Resolution algorithm**

- Build ordered strategy list (primary + fallbacks).
- Probe each candidate with:
  - `locator.count()` and/or
  - `locator.isVisible()`
- Return first matching strategy, including:
  - chosen strategy
  - strategy index (rung)
  - `degraded` flag when fallback rung used.

**Owning modules**

- `lib/playwright/locate.ts`
- Runtime counterpart: `lib/runtime/widgets/locate.ts`

### 10.3 State topology observation path

When verifying state predicates and transitions, Playwright methods used include:

- `locator.isVisible()`
- `locator.isEnabled()`
- `locator.textContent()`
- `locator.inputValue()`
- `locator.getAttribute(...)`
- `page.url()`
- `page.waitForTimeout(settleMs)`
- action dispatchers: `locator.fill(...)`, `locator.click()`

**Information flow**

- Inputs:
  - `InterfaceResolutionContext` (graph + screen candidates)
  - target `stateRefs` / expected transitions
  - route context
- Outputs:
  - `StateObservationResult[]`
  - `TransitionObservation` with classification (`matched`, `ambiguous-match`, `unexpected-effects`, `missing-expected`) and normalized details.

**Owning module**

- `lib/playwright/state-topology.ts`

### 10.4 Screen observation adapter path

For whole-screen observation, the adapter composes:

- optional navigation: `page.goto(url, { waitUntil, timeout })`
- ARIA capture on `page.locator('body')`
- per-element probing with resolved locators:
  - `locator.first().isVisible()`
  - `locator.first().isEnabled()`
  - `locator.first().getAttribute('aria-label')`

**Owning module**

- `lib/infrastructure/observation/playwright-screen-observer.ts`

## 11) Library stack vs generic implementation handshakes

This is the abstraction lens for rewrite planning: keep the handshake, swap implementation details.

### 11.1 Effect (`effect` package)

- **Generic handshake**: declarative effect graph with typed failure channels and composable retries.
- **Current concrete usage**:
  - `Effect.tryPromise(...)` wrappers on async ports/adapters.
  - `Effect.retryOrElse(...)` for transient failures.
  - structured spans in selected adapters (`Effect.withSpan(...)`).

### 11.2 Playwright (`@playwright/test`)

- **Generic handshake**: deterministic browser interaction + DOM/AX observability through locator/page abstractions.
- **Current concrete usage**:
  - role/test-id/CSS locator primitives.
  - accessibility tree snapshots via `page.accessibility.snapshot(...)`.
  - execution actions (`click`, `fill`) and visibility/enabled checks.

### 11.3 YAML and JSON surfaces (`yaml`, fs, JSON.parse/stringify)

- **Generic handshake**: canonical artifact persistence + schema-driven load/validate/decompose.
- **Current concrete usage**:
  - checked-in canon/reference docs (knowledge/controls/benchmarks/scenarios).
  - JSON projections and run artifacts in `.tesseract/*` and `generated/*`.

### 11.4 TypeScript branded/phantom typing

- **Generic handshake**: encode governance and pipeline invariants into compile-time constraints.
- **Current concrete usage**:
  - branded IDs and governance wrappers.
  - stage/source/verdict/fingerprint-typed envelope flows.

## 12) End-to-end information-flow graph (compressed)

Use this as the rewrite-safe “wiring” model.

1. **Intent source** (`fixtures/ado` or live ADO API)
   -> snapshot loader ports
   -> canonical scenario IR.
2. **Canonical + reference + override materials**
   -> decomposition/minting
   -> workspace catalog with source-tagged atoms.
3. **Scenario + catalog + controls + policy**
   -> planner + interpreter
   -> executable step programs + governance/confidence receipts.
4. **Executable programs + browser runtime**
   -> Playwright execution + observation
   -> evidence + run records + proposals.
5. **Run records + interventions + baselines**
   -> speedrun/fitness/score loops
   -> scorecards, convergence judgments, promotion/demotion actions.

## 13) Suggested deeper decomposition passes (for future versions of this document)

To keep iterating this ontology toward full engineering rewrite guidance, add the following in future revisions:

- **Per-command I/O appendix**: each CLI command’s inputs, outputs, and persisted artifacts.
- **Per-artifact schema index**: canonical field inventory by artifact kind with producer/consumer pairs.
- **Failure taxonomy map**: transient vs deterministic vs governance-blocked errors by lane.
- **Latency budget table**: expected cost per major phase (intake, resolution, execution, scoring).
- **Test ownership matrix**: which law tests protect each invariant and precedence rule.
