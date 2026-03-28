# Research Round 3: The Execution Surface, Composition Boundary, Schema Invariants, and Infrastructure Ports

*Final sequel to rounds 1 and 2. March 2026.*

Round 1 examined the big subsystems (graph, runtime, dogfood, knowledge) and found the feedback loops aren't closed. Round 2 examined the output quality and enforcement surfaces (emission, law tests, governance, dual graphs) and found structural fidelity is high except at the governance boundary. Round 3 goes to the remaining unexplored territory: the actual execution mechanics, the system's seams, and the adapters that connect it to the outside world.

---

## Perspective 9: The Runtime Execution Engine — Where Theory Meets the Browser

**Research question**: `lib/runtime/scenario.ts` (711 lines) is the runtime's central orchestrator. How does a scenario actually execute — from loaded run plan through Playwright interaction to evidence collection? And how do the four interpreter modes (execute, dry-run, diagnostic, evaluator) differ?

### Why this matters

Rounds 1 and 2 examined the resolution pipeline (how the system decides *what* to do) and the emission layer (how it *presents* what it did). But we never examined the actual execution — the code that opens a browser, navigates to a URL, fills an input, clicks a button, and observes the result. This is where every architectural decision gets tested against reality.

### Key files

- `lib/runtime/scenario.ts` (711 lines) — scenario execution orchestrator
- `lib/runtime/engage.ts` (152 lines) — step engagement (locator resolution → widget interaction)
- `lib/runtime/locate.ts` (99 lines) — locator ladder execution against live DOM
- `lib/runtime/interact.ts` (63 lines) — widget interaction dispatch
- `lib/runtime/program.ts` (236 lines) — step program interpretation
- `lib/runtime/execute/index.ts` — execution entry point
- `lib/runtime/interpreters/` — four interpreter modes
- `lib/runtime/observe/index.ts` — post-action observation
- `lib/runtime/result.ts` — result classification
- `lib/runtime/snapshots.ts` — snapshot assertion execution

### Findings

The execution engine is a **7-phase step lifecycle** orchestrated by `scenario.ts`:

1. **Resolution**: `agent.resolve(task, context)` → `ResolutionReceipt` (which screen, element, action to use)
2. **State precondition check**: Observe current DOM state refs, verify required/forbidden states
3. **Program compilation**: `compileStepProgram(resolvedStep)` → `StepProgram` (sequence of instructions: navigate, enter, invoke, observe-structure, custom-escape-hatch)
4. **Interpreter dispatch**: Playwright mode → live browser; dry-run → validation only; diagnostic → error classification
5. **Post-action observation**: Probe DOM for state transitions, compare before/after state refs
6. **Recovery**: On failure, attempt strategies (verify prerequisites, alternate locators, retry with backoff, refresh runtime)
7. **Result assembly**: `StepExecutionReceipt` with timing breakdown, failure family, recovery metadata, governance

**The locator ladder** (`locate.ts`) is elegant: strategies are tried in order (test-id → role-name → CSS), rung index tracks which strategy succeeded, and `degraded: true` flags fallback usage. Combined locators use Playwright's `.or()` API.

**Widget interaction** (`interact.ts`) is properly thin: look up capability contract, check preconditions (visible, enabled, editable), dispatch to handler. Three widget families (os-button, os-input, os-table) with typed action handlers.

**The four interpreters** serve distinct purposes:
- **Playwright** (`program.ts`): Actual browser execution with full instruction semantics
- **Dry-run**: Validates resolvability without a browser — fast pre-execution check
- **Diagnostic**: Dry-run + error classification (resolvability, data-resolution, knowledge-missing, semantic-gap)
- **Evaluator**: Pluggable instruction handler interface used by dry-run and diagnostic

**Key insight**: `scenario.ts` carries **very high business logic density** (711 lines of phase sequencing, state management, error classification, recovery orchestration). This is appropriate — it's the system's central coordination point. The files below it (engage, locate, interact) stay properly thin.

### Where it should go

- **Recovery strategy extensibility** ✅: The recovery policy is embedded in scenario.ts. Extracting it as a composable strategy chain (like the resolution pipeline) would make it testable and configurable per-runbook.
- **Observation as a first-class phase** ✅: `observe/index.ts` is currently 3 lines (re-exports). The observation logic lives inside scenario.ts. Extracting it would make the observation phase independently testable and reusable for discovery.
- **Parallel step execution** ✅: Steps execute sequentially via `Effect.forEach(..., { concurrency: 1 })`. For independent steps (e.g., assertions on different screens), parallel execution could reduce wall-clock time.

---

## Perspective 10: The Composition Boundary — Effect Layers, Service Wiring, and the Playwright Bridge

**Research question**: `lib/composition/` is where Effect services get wired to real implementations and `Effect.runPromise` is permitted. How clean is this boundary? Does the system's Effect-forward architecture actually deliver on its promise of testable, composable orchestration?

### Why this matters

The CLAUDE.md mandates Effect-forward patterns: `Effect.gen` with `yield*`, `Effect.all({...})` for independent operations, `Effect.catchTag` over manual `_tag` discrimination, and `Effect.runPromise`/`Effect.runSync` only in `lib/composition/`. If this boundary is clean, the entire application and domain layer is testable in isolation. If it leaks, the FP architecture is cosmetic.

### Key files

- `lib/composition/layers.ts` (41 lines) — Effect layer definitions
- `lib/composition/local-services.ts` (153 lines) — local service implementations
- `lib/composition/scenario-context.ts` (126 lines) — the bridge between emitted specs and runtime
- `lib/composition/local-runtime-scenario-runner.ts` (139 lines) — runtime entry point
- `lib/application/ports.ts` — port definitions (FileSystem, RuntimePort, etc.)
- `lib/infrastructure/mcp/playwright-mcp-bridge.ts` (139 lines) — MCP-to-Playwright bridge
- `lib/infrastructure/mcp/dashboard-mcp-server.ts` (203 lines) — dashboard MCP server

### Findings

The composition boundary is **clean and well-enforced**, with a small number of principled exceptions.

**The boundary rule**: `Effect.runPromise` / `Effect.runSync` should only appear in `lib/composition/`. In practice:

- **`lib/composition/`**: 4 calls (local-services.ts: 2, local-runtime-scenario-runner.ts: 2) — the intended location
- **`lib/infrastructure/dashboard/`**: 3 calls — `Effect.runSync(PubSub.publish(...))` inside the event bus. These are fire-and-forget publishes inside a callback-driven context (SharedArrayBuffer writes). Principled exception — the Effect fiber can't reach here.
- **`lib/application/`**: 4 calls — `dashboard-decider.ts` (3) and `agent-decider.ts` (1) bridge Effect-typed dashboard/agent ports to Promise-based callback interfaces. `load-run-plan.ts` (1) uses `Effect.runSync` for synchronous plan loading inside the Playwright test runner. All are boundary adapters where async/Effect contexts can't propagate.

**Total leakage: 8 calls outside composition**, all at genuine boundary points. No calls in `lib/domain/` or `lib/runtime/`. The FP architecture delivers on its promise.

**Nine Effect Context.Tag ports** defined in `ports.ts`:
- `FileSystem`, `AdoSource`, `RuntimeScenarioRunner`, `ExecutionContext`, `PipelineConfigService`, `VersionControl`, `Dashboard`, `McpServer`, `PlaywrightBridge`

**Progressive enhancement pattern**: Every optional port (`Dashboard`, `McpServer`, `PlaywrightBridge`, `ScreenObserver`) has a `Disabled*` variant that no-ops or auto-skips. The pipeline runs identically with or without any of them. This is explicitly documented as an architectural invariant in `ports.ts` lines 107-119.

**The scenario-context bridge** (`composition/scenario-context.ts`) is the critical seam between emitted Playwright specs and the runtime engine. `createScenarioContext(page, adoId, fixtures)` returns a `ScenarioContext` with a `screen(id).executeStep(index, title)` API. Generated specs call this — it curries away all runtime internals (run plan, environment, state).

**Layer composition** (`local-services.ts`): `createLocalServiceContext()` builds a `Layer.mergeAll(...)` of all 9 ports, resolves posture from environment, wires ADO source from env vars, and returns a `provide()` function that eliminates all service requirements. `runWithLocalServices()` is the top-level entry point that calls `Effect.runPromise`.

### Where it should go

1. **Formalize the leakage exceptions** ✅: The 8 `Effect.run*` calls outside composition are principled but undocumented. An architecture fitness test asserting "Effect.runPromise/runSync only in composition/ + documented exceptions" would prevent accidental leakage.
2. **The scenario-context bridge deserves a law test** ✅: `createScenarioContext` is the seam between codegen and runtime. A test verifying that the emitted spec's `executeStep` calls produce the same receipts as the application-layer `interpretScenarioFromPlan` would close the spec-runtime parity gap identified in Round 2.
3. **Extract the dashboard-decider bridge pattern**: Three files (`dashboard-decider.ts`, `agent-decider.ts`, `load-run-plan.ts`) all bridge Effect ↔ Promise at callback boundaries. A shared `effectCallback()` utility would standardize this pattern and make the boundaries explicit.

---

## Perspective 11: The Validation and Schema Layer — 4,600 Lines of Artifact Correctness

**Research question**: The domain layer has 1,738 lines of schemas (`lib/domain/schemas/`) and 2,856 lines of validation (`lib/domain/validation/`). How do these work together to enforce artifact correctness at system boundaries?

### Why this matters

Every artifact that flows between lanes (intent → knowledge → resolution → execution → governance) passes through validation. If the validation layer is comprehensive, artifacts can't silently corrupt. If it's patchy, the typed interfaces create a false sense of safety — the types say `ScreenElements` but the runtime data might be malformed.

### Key files

- `lib/domain/validation/core.ts` (2,206 lines) — the bulk of all validation logic
- `lib/domain/validation/interface.ts` (418 lines) — interface graph and selector canon validation
- `lib/domain/validation/primitives.ts` (81 lines) — primitive value validators
- `lib/domain/validation/rules.ts` (75 lines) — validation rule combinators
- `lib/domain/schemas/` (13 files, 1,738 lines) — schema definitions
- `tests/domain-validation-lanes.spec.ts` — lane-specific validation tests

### Findings

The validation layer is **comprehensive at the type level but sparse at the semantic level** — a pattern consistent with the governance gap found in Round 2.

**Scale**: 70 validator functions across `validation/core.ts` (2,206 lines), plus 13 schema files using **Effect Schema** (not Zod or io-ts). The system is incrementally migrating from custom validators to declarative schemas — ~20 validators now delegate to `schemaDecode.decoderFor<T>(schema)`.

**Three validation strategies coexist**:
1. **Primitive type checks** (`primitives.ts`): `expectString`, `expectNumber`, `expectEnum`, `expectId` — throw `SchemaError` with path
2. **Custom inline validators** (`core.ts`): Field-by-field validation with path-qualified errors, exhaustive discriminated union dispatch
3. **Effect Schema delegates**: Declarative schema validation for newer artifact types (TrustPolicy, Scenario, InterventionReceipt, DerivedGraph, etc.)

**Semantic invariants actually enforced** (beyond shape checking):
- **Graph topology** (ScreenBehavior only): Every state node has ≥1 predicate; every event signature has ≥1 transition ref + result state ref; all transition refs resolve; `resultStateRefs` must equal the union of target states from referenced transitions
- **Pattern action completeness**: All 4 required actions (navigate, input, click, assert-snapshot) must be present after merge
- **Discriminated union exhaustiveness**: 10+ variant types fully dispatched

**What validation misses**:
- **Cross-artifact references**: A step can reference a screen that doesn't exist in ScreenElements. A resolution can reference a control that's missing. No cross-document reference validation.
- **Temporal consistency**: No checks that `createdAt < updatedAt` or that timestamps are monotonic
- **Derivation correctness**: Fingerprints, confidence levels, and winning sources are assumed correct — never verified
- **Graph topology beyond ScreenBehavior**: Interface graph, state transition graph, and derived graph have no topology validation (acyclicity, reachability, node uniqueness)

**Test coverage**: `domain-validation-lanes.spec.ts` has 6 round-trip tests (parse → unparse → parse) + error path accuracy checks. `domain-types-exports-stability.spec.ts` verifies 181+ type exports are importable. No tests for semantic invariants, cross-artifact refs, or topology.

### Where it should go

1. **Cross-artifact reference validation** ✅: Add a `validateWorkspaceConsistency(catalog)` function that checks all references resolve — step.screen exists in ScreenElements, resolution.control exists in ResolutionControls, etc. This catches silent corruption during transformations.
2. **Graph topology validators for all three graphs** ✅: Extend the ScreenBehavior topology checks to ApplicationInterfaceGraph (node uniqueness, edge ref integrity, acyclic containment) and StateTransitionGraph (reachability, determinism).
3. **Complete the Effect Schema migration**: The 50+ custom validators in `core.ts` should migrate to Effect Schema with `Schema.filter()` for semantic checks. This would unify the validation surface and make schema-level invariants composable.

---

## Perspective 12: The Infrastructure Ports and Adapters — MCP, Dashboard, ADO, and the Outside World

**Research question**: The infrastructure layer connects Tesseract to external systems: Azure DevOps, Playwright browsers, MCP servers, WebSocket dashboards, filesystem, and screen registries. How well do these adapters implement the port contracts defined in the application layer?

### Why this matters

A hexagonal architecture is only as good as its adapters. The application layer defines ports (`FileSystem`, `RuntimePort`, `AdoSource`, etc.). The infrastructure layer provides adapters. If the adapters are thin and faithful, the system is truly portable and testable. If they carry business logic or state, the hexagonal promise is broken.

### Key files

- `lib/application/ports.ts` — port interface definitions
- `lib/infrastructure/mcp/dashboard-mcp-server.ts` (203 lines) — MCP dashboard server
- `lib/infrastructure/mcp/playwright-mcp-bridge.ts` (139 lines) — MCP-to-Playwright bridge
- `lib/infrastructure/dashboard/pipeline-event-bus.ts` (336 lines) — real-time event pipeline
- `lib/infrastructure/observation/playwright-screen-observer.ts` (112 lines) — screen observation
- `lib/infrastructure/reporting/tesseract-reporter.ts` (99 lines) — Playwright reporter
- `lib/infrastructure/runtime/local-runtime-environment.ts` (60 lines) — runtime environment
- `lib/infrastructure/ado/` — Azure DevOps adapter
- `lib/infrastructure/local-ado-source.ts` — local ADO source
- `lib/infrastructure/local-fs.ts` — filesystem adapter
- `lib/infrastructure/headed-harness.ts` — headed browser harness

### Findings

The infrastructure layer is **exemplary hexagonal architecture** — 14 adapters implementing 9 ports, all thin, all swappable via Effect Layer injection.

**Port inventory** (9 ports in `ports.ts`):
| Port | Adapters | Thinness |
|------|----------|----------|
| `FileSystem` | LocalFileSystem, RecordingFileSystem (shadow writes + journal) | Thin |
| `AdoSource` | Local (fixture JSON), Live (Azure DevOps REST API) | Local: thin; Live: medium (XML parsing) |
| `RuntimeScenarioRunner` | LocalRuntimeScenarioRunner (with optional agent interpreter injection) | Medium |
| `ExecutionContext` | Simple posture + journal struct | Thin |
| `VersionControl` | Git exec wrapper (`rev-parse`, `checkout`) | Thin |
| `ScreenObserver` | Playwright batch DOM queries + ARIA capture; Disabled no-op | Thin |
| `Dashboard` | PubSub event bus (SharedArrayBuffer ring buffer); WS adapter; Disabled auto-skip | Medium (encoding) |
| `McpServer` | Dashboard MCP server (8 tools); Disabled no-op | Thin (routing) |
| `PlaywrightBridge` | Page method wrapper (click, fill, navigate, screenshot); Disabled no-op | Thin |

**Key architectural patterns**:

1. **Progressive enhancement everywhere**: Every optional port has a `Disabled*` variant. The pipeline runs identically headless. Dashboard events are fire-and-forget. MCP tools are additive. Playwright bridge is opt-in.

2. **Recording filesystem**: Wraps LocalFileSystem with a shadow Map that journals all writes. Honors `ExecutionPosture.writeMode` — `'no-write'` mode shadows writes without touching disk. Protected roots (`.tesseract/`, `knowledge/`, `controls/`, etc.) stay safe.

3. **Zero-copy dashboard events**: SharedArrayBuffer ring buffer with numeric slot encoding (18 Float64 values per event) enables React visualization to read event data atomically without serialization overhead.

4. **Decision timeouts are mandatory**: `awaitDecision()` always has a fallback — 0ms auto-skip for the event bus (default), 60s for WebSocket. The pipeline never blocks indefinitely.

5. **Environment-driven adapter selection**: ADO source chosen via `TESSERACT_ADO_SOURCE=live` env var. Execution posture inferred from `CI` environment. Agent provider from `TESSERACT_AGENT_PROVIDER`.

**MCP tool surface** (8 tools exposed by dashboard-mcp-server.ts):
- `list_probed_elements` — reads workbench index
- `get_screen_capture` — returns cached screenshot
- `get_knowledge_state` — reads graph index
- `get_queue_items` — reads workbench + completions
- `get_fitness_metrics` — reads scorecard
- `approve_work_item` — resolves pending decision
- `skip_work_item` — resolves pending decision
- `get_iteration_status` — reads speedrun progress

**Testing gap**: No visible unit tests for any adapter. All tested implicitly through integration (CLI runs, artifact generation). The adapters are thin enough that this is defensible, but the Live ADO adapter (XML parsing, content hashing) and the event bus (SharedArrayBuffer encoding) carry enough logic to warrant direct tests.

### Where it should go

1. **Test the Live ADO adapter** ✅: XML step extraction and content hashing are the most complex adapter logic. A fixture-based test with real ADO API responses would catch parsing regressions.
2. **Test the event bus encoding** ✅: The SharedArrayBuffer slot encoding is clever but fragile — off-by-one in numeric slots would produce silent corruption. A round-trip test (encode → decode → compare) would be cheap insurance.
3. **Expand the MCP tool surface** ✅: 8 tools is a minimal viable surface. Adding `decide_work_item` (the agent decider already uses this name), `get_scenario_trace`, and `get_proposal_detail` would make the MCP server sufficient for a fully agentic VSCode integration.

---

## Cross-cutting synthesis: execution fidelity

Rounds 1 and 2 examined what the system *knows* and *promises*. Round 3 examines what it *does* — the actual browser interaction, the service wiring, the data validation, and the external system adapters.

**The answer is reassuring.** The execution engine is well-structured with a clean 7-phase step lifecycle. The composition boundary is clean with only 8 principled `Effect.run*` calls outside the composition layer. The infrastructure adapters are properly thin and universally swappable. The validation layer catches type-level corruption comprehensively.

| Domain | Execution Fidelity | Key Gap |
|--------|-------------------|---------|
| Runtime execution | High | Recovery strategies embedded in scenario.ts; observation not yet a first-class phase |
| Composition boundary | Very High | 8 principled leakage points; no spec-runtime parity test |
| Validation & schemas | Medium | Comprehensive type-level; sparse semantic; no cross-artifact ref checking |
| Infrastructure adapters | High | All thin and swappable; no unit tests for complex adapters |

## Final synthesis across all three rounds

Twelve perspectives. 44,500 lines of TypeScript. One system.

**What Tesseract gets right**: The type model is rich and principled. The Effect architecture delivers real composability. The infrastructure is properly hexagonal. The emission layer is AST-backed and deterministic. The dogfood loop is production-ready. The law test suite is a genuine specification layer.

**What Tesseract needs next**, in priority order:

| # | Move | Round | Impact |
|---|------|-------|--------|
| 1 | Discovery-to-proposal bridge | R1 | Knowledge grows without human authoring |
| 2 | Minimal A1 runtime interpreter | R1 | Novel phrasing works without alias tending |
| 3 | Adopt `foldGovernance` at emission boundary | R2 | Governance becomes real, not aspirational |
| 4 | Structured entropy injection | R1 | Knowledge hardens faster |
| 5 | Cross-artifact reference validation ✅ | R3 | Silent corruption caught at boundaries |
| 6 | Governance phantom type law tests | R2 | Specification covers the safety contract |
| 7 | Architecture fitness test for Effect boundary ✅ | R3 | Prevents composition leakage |
| 8 | Spec-runtime parity test ✅ | R2+R3 | Closes the trust gap between emitted code and actual execution |

The system is at an inflection point. The machinery is built. The contracts are typed. The architecture is sound. What remains is closing the loops (R1), enforcing the governance boundary (R2), and validating the execution surface (R3). None of these require architectural changes — they require wiring, adoption, and testing of infrastructure that already exists.
