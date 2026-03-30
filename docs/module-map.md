# Module Map

Auto-generated structural inventory of the codebase. Do not hand-edit; run `npm run map`.
Last generated: 2026-03-30.

Use this document to locate modules by layer, understand what each file does, and find entry points for common tasks.

## Layer Overview

| Layer | Directory | Files | Description |
| --- | --- | --- | --- |
| **Domain** | `lib/domain/` | 176 | Pure, side-effect-free domain logic. No imports from other layers. No filesystem, network, or Effect dependencies. |
| **Application** | `lib/application/` | 145 | Effect-based orchestration layer. CLI commands, execution pipelines, fitness reports, improvement loops, and workspace catalog management. |
| **Runtime** | `lib/runtime/` | 46 | Playwright execution layer. Scenario step execution, agent resolution, screen identification, locator resolution, and ARIA snapshot handling. |
| **Infrastructure** | `lib/infrastructure/` | 28 | Ports and adapters. File system abstraction, Azure DevOps integration, dashboard event bus, MCP protocol, VSCode integration, and Playwright reporter. |
| **Composition** | `lib/composition/` | 6 | Dependency injection and service wiring. Effect Layer definitions, environment configuration, and service provisioning. |
| **Playwright** | `lib/playwright/` | 3 | Thin Playwright-specific utilities for ARIA capture, locator resolution strategies, and state topology observation. |

**Total**: 404 TypeScript modules across 6 layers.

## Layer Dependencies

```
domain ← (no dependencies on other layers)
application ← domain
runtime ← domain
infrastructure ← domain, application
composition ← domain, application, infrastructure, runtime
playwright ← (standalone Playwright utilities)
```

## Domain Layer — `lib/domain/`

Pure, side-effect-free domain logic. No imports from other layers. No filesystem, network, or Effect dependencies.

### Subdirectories

| Directory | Files | Key Contents |
| --- | --- | --- |
| `algebra/` | 7 | envelope-mergers, index, kleisli, … |
| `execution/` | 6 | index, model, ops, … |
| `foundation/` | 4 | index, model, ops, … |
| `governance/` | 4 | index, model, ops, … |
| `intent/` | 4 | index, model, ops, … |
| `knowledge/` | 6 | index, model, ops, … |
| `projection/` | 4 | index, model, ops, … |
| `resolution/` | 4 | index, model, ops, … |
| `scenario/` | 2 | explanation, tier-projection |
| `schemas/` | 14 | control, decode, enums, … |
| `types/` | 30 | affordance, agent-errors, agent-interpreter, … |
| `validation/` | 16 | core, execution, index, … |
| `widgets/` | 1 | contracts |

### Modules

| File | Purpose | Exports |
| --- | --- | --- |
| `act-indicator.ts` | ActIndicator — pure domain module for act badge state machine. | 17 |
| `affordance-matcher.ts` | Deduplicate and sort capabilities for deterministic output. | 2 |
| `agent-budget.ts` | Agent token budget enforcement. | 5 |
| `agent-dsl.ts` | — | 1 |
| `aria-snapshot.ts` | — | 4 |
| `batch-decision.ts` | BatchDecision — pure domain module for multi-select decision interaction. | 21 |
| `binding-distribution.ts` | BindingDistribution — pure domain module for step binding classification. | 17 |
| `binding.ts` | — | 4 |
| `brand.ts` | — | 2 |
| `causal-chain.ts` | Pure builder for causal chains (N2.1 — One-Click "Why"). | 3 |
| `clarification.ts` | Build a structured clarification request when the resolution pipeline | 1 |
| `cold-start.ts` | Cold-Start Accelerator — pure domain logic (N2.3) | 8 |
| `collections.ts` | — | 5 |
| `comparison-rules.ts` | Comparison Rules — shared pure functions for resolution receipt comparison. | 4 |
| `component-maturation.ts` | W3.14: Component knowledge maturation from runtime evidence | 4 |
| `contradiction-detector.ts` | Knowledge Contradiction Detector (N1.10) | 7 |
| `convergence-bounds.ts` | Fixed-point convergence bounds via Lyapunov stability analysis. | 8 |
| `convergence-finale.ts` | Convergence Finale State Machine — pure FSM for the most emotionally | 16 |
| `convergence-fsm.ts` | Typed finite state machine for dogfood convergence detection. | 9 |
| `cost-accounting.ts` | Cost OS — Pure computation for unified pipeline phase accounting. | 5 |
| `derived-graph.ts` | Complexity audit (W5.9) | 20 |
| `diagnostics.ts` | — | 2 |
| `discovery.ts` | — | 8 |
| `doctrine-compiler.ts` | Self-Verification Doctrine Compiler (W4.11) | 5 |
| `effect-target.ts` | — | 10 |
| `emission-backends.ts` | — | 6 |
| `errors.ts` | — | 31 |
| `execution-planner.ts` | Pure graph pathfinding for state-transition execution planning. | 4 |
| `execution-tempo.ts` | ─── Constants ─── | 3 |
| `failure-fragments.ts` | FailureFragments — pure domain module for failure particle physics. | 10 |
| `fixture-emission.ts` | A data binding describes the relationship between a scenario step and | 6 |
| `flywheel-entity.ts` | FlywheelEntity — unified particle type with act-specific visual properties. | 9 |
| `graduated-autonomy.ts` | Graduated Autonomy — Pure Computation (N1.9) | 4 |
| `grammar.ts` | — | 2 |
| `graph-builder.ts` | Typed Graph Builder with Phantom Build Phases (W5.28) | 9 |
| `graph-queries.ts` | Runtime graph queries (W4.3) | 6 |
| `graph-query.ts` | — | 2 |
| `graph-validation.ts` | W2.10 — Cross-graph consistency validation | 3 |
| `grounded-flow.ts` | — | 1 |
| `hash.ts` | — | 6 |
| `identity.ts` | — | 33 |
| `ids.ts` | — | 4 |
| `inference.ts` | Split text into word-boundary tokens, filtering empties. */ | 5 |
| `iteration-timeline.ts` | IterationTimeline — pure domain module for multi-iteration timeline. | 19 |
| `journal-index.ts` | JournalIndex — pure domain module for journal index generation and O(1) seek. | 14 |
| `knowledge-coverage.ts` | Knowledge Coverage as Scorecard Metric (W3.9 + N1.8) | 9 |
| `knowledge-freshness.ts` | Knowledge Decay & Freshness Policy (W2.9) | 4 |
| `method-name.ts` | Derive a POM-style method name from a grounded step's action, element, and intent. | 2 |
| `posture-contract.ts` | — | 7 |
| `precedence.ts` | Select the highest-precedence candidate value according to a rung law. | 8 |
| `program.ts` | — | 14 |
| `proposal-cluster.ts` | ProposalCluster — pure domain module for proposal clustering physics. | 13 |
| `proposal-quality.ts` | W4.15: Proposal quality metrics in agent→alias feedback loop | 11 |
| `provenance.ts` | — | 7 |
| `reason-chain.ts` | Reason chain builder — derives a machine-readable decision trail | 2 |
| `ref-path.ts` | — | 3 |
| `route-knowledge.ts` | Extract route patterns from observed routes by grouping by screenId | 3 |
| `rung-stress.ts` | Classify marginal value verdict from resolution metrics. | 1 |
| `runtime-loaders.ts` | — | 4 |
| `scene-state-accumulator.ts` | Scene State Accumulator — pure domain module for flywheel time-lapse seek/batching. | 13 |
| `screen-thumbnail.ts` | ScreenThumbnail — pure domain module for multi-screen discovery context. | 22 |
| `spec-codegen.ts` | — | 6 |
| `speed-tier-batcher.ts` | SpeedTierBatcher — pure domain module for event batching strategy | 13 |
| `speedrun-statistics.ts` | Pure statistical functions for speedrun phase timing analysis. | 22 |
| `status.ts` | — | 2 |
| `summary-view.ts` | SummaryView — pure domain model for the post-convergence summary view. | 15 |
| `surface-overlay.ts` | SurfaceOverlay — pure domain module for ARIA landmark region overlays. | 18 |
| `trust-policy.ts` | Evaluate whether a proposal should be auto-approved based on: | 3 |
| `ts-ast.ts` | — | 16 |
| `typegen.ts` | — | 2 |
| `types.ts` | — | 21 |
| `validation.ts` | — | 1 |
| `visitors.ts` | Typed visitor (fold) functions for exhaustive case analysis on discriminated unions. | 37 |
| `workflow-facade.ts` | — | 11 |

## Application Layer — `lib/application/`

Effect-based orchestration layer. CLI commands, execution pipelines, fitness reports, improvement loops, and workspace catalog management.

### Subdirectories

| Directory | Files | Key Contents |
| --- | --- | --- |
| `cache/` | 1 | file-cache |
| `catalog/` | 7 | envelope, index, loaders, … |
| `cli/` | 33 | commands/approve, commands/benchmark, commands/bind, … |
| `execution/` | 11 | build-proposals, build-run-record, execute-steps, … |
| `inspection/` | 1 | index |
| `intake/` | 1 | index |
| `pipeline/` | 3 | incremental, index, stage |
| `preparation/` | 1 | index |
| `projections/` | 3 | cache, review, runner |
| `synthesis/` | 2 | interface-fuzzer, scenario-generator |

### Modules

| File | Purpose | Exports |
| --- | --- | --- |
| `activate-proposals.ts` | Filter proposals eligible for auto-approval, then activate them. | 6 |
| `agent-ab-testing.ts` | Agent provider A/B testing infrastructure. | 9 |
| `agent-decider.ts` | Agent Decider — routes work item decisions to an external AI agent via MCP tools. | 5 |
| `agent-interpretation-cache.ts` | Agent Interpretation Cache — avoids redundant LLM calls for identical steps. | 6 |
| `agent-interpreter-provider.ts` | AgentInterpreterProvider — Strategy pattern for pluggable agent interpretation backends. | 10 |
| `agent-session-adapter.ts` | — | 4 |
| `agent-session-ledger.ts` | — | 2 |
| `agent-workbench.ts` | Agent Workbench — projection from iteration data to structured work items. | 14 |
| `approve.ts` | — | 1 |
| `artifacts.ts` | — | 1 |
| `auto-approval.ts` | Compose auto-approval with trust policy: auto-approval can only succeed when | 7 |
| `benchmark.ts` | — | 2 |
| `bind.ts` | — | 1 |
| `clean-slate.ts` | Clean-slate preparation — wipe synthetic and ephemeral artifacts. | 1 |
| `compile-snapshot.ts` | — | 2 |
| `compile.ts` | Core compilation: parse, bind, project surfaces, emit — but skip global | 3 |
| `concurrency.ts` | Resolve a concurrency level suitable for Effect.all / Effect.forEach. | 1 |
| `concurrent-graph-builder.ts` | Concurrent Graph Node Building (W5.16) | 5 |
| `confidence.ts` | — | 2 |
| `controls.ts` | — | 5 |
| `dashboard-decider.ts` | Create a WorkItemDecider that routes decisions through the dashboard. | 1 |
| `diff.ts` | — | 1 |
| `dirty-tracking.ts` | Compute a deterministic SHA-256 fingerprint from a sorted list of input strings. | 4 |
| `discovery-proposal-bridge.ts` | W2.8: Discovery-to-proposal bridge | 3 |
| `dogfood-orchestrator.ts` | Dogfood orchestrator — configurable self-improving loop planner. | 9 |
| `dogfood.ts` | When provided, process work items between iterations (inter-iteration act loop). | 7 |
| `drift.ts` | — | 9 |
| `effect.ts` | — | 3 |
| `emit.ts` | Governance-branded bound scenario types for the emission boundary. | 6 |
| `entropy-injection.ts` | Structured entropy injection for scenario variant generation. | 8 |
| `evolve.ts` | Automatic Knob Search — the self-improving evolution loop as an Effect program. | 7 |
| `experiment-registry.ts` | Experiment registry compatibility projection. | 4 |
| `fitness.ts` | Pipeline Fitness Report emission and Scorecard comparison. | 10 |
| `graph.ts` | — | 6 |
| `hotspots.ts` | Hotspot Detection — identifies recurring resolution patterns that | 5 |
| `impact.ts` | — | 1 |
| `improvement.ts` | — | 8 |
| `inbox.ts` | — | 1 |
| `inference.ts` | — | 2 |
| `inspect.ts` | — | 1 |
| `interface-intelligence.ts` | Complexity audit (W5.9) | 3 |
| `interface-resolution.ts` | Total completed runs so far (used for freshness decay calculation). */ | 1 |
| `intervention-kernel.ts` | — | 5 |
| `iteration-journal.ts` | Iteration Journal (W2.16) | 11 |
| `knob-search.ts` | Knob Search — maps pipeline failure modes to tunable parameters and | 5 |
| `knowledge-posture.ts` | Knowledge Posture Resolution | 1 |
| `learning-bottlenecks.ts` | — | 2 |
| `learning-evaluation.ts` | — | 2 |
| `learning-health.ts` | — | 1 |
| `learning-rankings.ts` | Pre-compute a Map from screen name → Set of adoIds whose proposals touch that screen. */ | 1 |
| `learning-shared.ts` | Shared pure utilities for Phase 6 learning evaluation modules. | 7 |
| `learning.ts` | — | 2 |
| `operator.ts` | Render the full operator inbox as markdown. Pure composition of section renderers. */ | 5 |
| `parallel-harvest.ts` | Structured Concurrency for Discovery Harvesting (W5.14) | 11 |
| `parse.ts` | — | 2 |
| `paths.ts` | Suite root: where content/training data lives. | 56 |
| `pipeline-dag.ts` | Formal pipeline DAG with auto-ordering (W4.1) | 7 |
| `ports.ts` | Disabled observer for CI/batch — returns empty observations. */ | 28 |
| `progress-reporting.ts` | A structured progress event emitted at phase boundaries and after | 5 |
| `proposal-patches.ts` | Deep merge two records. Pure recursive fold — no mutation. */ | 4 |
| `provider-registry.ts` | — | 2 |
| `refresh.ts` | Core refresh: sync snapshots + compile without global graph/types. | 2 |
| `replay-evaluation.ts` | Compare two resolution receipts at a step. Pure. Uses shared comparison rules. */ | 2 |
| `replay-interpretation.ts` | — | 1 |
| `rerun-plan.ts` | — | 3 |
| `resolution-engine.ts` | — | 4 |
| `run.ts` | Core scenario run: execute, persist evidence, build proposals, write run | 6 |
| `scorecard.ts` | — | 1 |
| `speedrun.ts` | Speedrun core — the programmatic forward pass of the self-improving loop. | 16 |
| `state-machine.ts` | — | 2 |
| `surface.ts` | — | 1 |
| `sync.ts` | — | 1 |
| `task.ts` | — | 3 |
| `trace.ts` | — | 1 |
| `translate.ts` | — | 1 |
| `translation-cache.ts` | Prune the translation cache to at most `maxEntries` files, keeping the | 5 |
| `translation-provider.ts` | TranslationProvider — Strategy pattern for pluggable translation backends. | 8 |
| `trust-policy.ts` | — | 7 |
| `types.ts` | Extract fixture IDs from a template override string. Pure. */ | 3 |
| `workbench-consumer.ts` | W3.16: Agent Workbench Consumer — scored work-item queue as consumable surface. | 9 |
| `workflow.ts` | — | 1 |
| `workspace-session.ts` | — | 6 |

## Runtime Layer — `lib/runtime/`

Playwright execution layer. Scenario step execution, agent resolution, screen identification, locator resolution, and ARIA snapshot handling.

### Subdirectories

| Directory | Files | Key Contents |
| --- | --- | --- |
| `adapters/` | 1 | playwright-dom-resolver |
| `agent/` | 17 | candidate-lattice, dom-fallback, index, … |
| `execute/` | 1 | index |
| `interpreters/` | 5 | diagnostic, dry-run, evaluator, … |
| `observe/` | 2 | execute, index |
| `resolve/` | 1 | index |
| `widgets/` | 4 | index, os-button, os-input, … |

### Modules

| File | Purpose | Exports |
| --- | --- | --- |
| `agent.ts` | — | 4 |
| `aria.ts` | — | 1 |
| `console-sentinel.ts` | Console Sentinel — captures browser console messages during step execution. | 3 |
| `data.ts` | — | 2 |
| `engage.ts` | — | 1 |
| `interact.ts` | — | 1 |
| `load.ts` | — | 4 |
| `locate.ts` | Re-export from playwright layer — locator resolution is a Playwright concern | 1 |
| `parallel-steps.ts` | W3.6: Parallel Step Execution — Dependency Analysis & Independent Step Detection | 5 |
| `program.ts` | — | 3 |
| `recovery-strategies.ts` | Recovery Strategy Chain (W2.12) | 13 |
| `result.ts` | — | 7 |
| `scenario.ts` | — | 8 |
| `screen-identification.ts` | Runtime screen identification from DOM + interface graph. | 5 |
| `snapshots.ts` | — | 4 |

## Infrastructure Layer — `lib/infrastructure/`

Ports and adapters. File system abstraction, Azure DevOps integration, dashboard event bus, MCP protocol, VSCode integration, and Playwright reporter.

### Subdirectories

| Directory | Files | Key Contents |
| --- | --- | --- |
| `ado/` | 2 | live-ado-source, local-ado-source |
| `dashboard/` | 4 | journal-writer, pipeline-event-bus, runtime-boundary, … |
| `fs/` | 2 | local-fs, recording-fs |
| `mcp/` | 3 | dashboard-mcp-server, playwright-mcp-bridge, resource-provider |
| `observation/` | 1 | playwright-screen-observer |
| `reporting/` | 1 | tesseract-reporter |
| `runtime/` | 1 | local-runtime-environment |
| `screen-registry/` | 1 | local-screen-registry-loader |
| `snapshots/` | 1 | local-snapshot-template-loader |
| `tooling/` | 5 | browser-options, capture-screen, discover-screen, … |
| `vscode/` | 4 | copilot-participant, problem-matcher, task-provider, … |

### Modules

| File | Purpose | Exports |
| --- | --- | --- |
| `headed-harness.ts` | Headed Harness — launches a Playwright browser and wires it into Tesseract. | 5 |
| `local-ado-source.ts` | — | 1 |
| `local-fs.ts` | — | 1 |

## Composition Layer — `lib/composition/`

Dependency injection and service wiring. Effect Layer definitions, environment configuration, and service provisioning.

### Modules

| File | Purpose | Exports |
| --- | --- | --- |
| `env.ts` | Environment variable reads centralized at the composition boundary. | 3 |
| `layers.ts` | — | 6 |
| `load-run-plan.ts` | — | 3 |
| `local-runtime-scenario-runner.ts` | Create a RuntimeScenarioRunnerPort with a specific agent interpreter provider. | 2 |
| `local-services.ts` | Inject a custom agent interpreter. When provided, the runtime scenario runner | 7 |
| `scenario-context.ts` | A screen-scoped context that exposes POM-style step execution. | 3 |

## Playwright Layer — `lib/playwright/`

Thin Playwright-specific utilities for ARIA capture, locator resolution strategies, and state topology observation.

### Modules

| File | Purpose | Exports |
| --- | --- | --- |
| `aria.ts` | — | 2 |
| `locate.ts` | — | 5 |
| `state-topology.ts` | — | 8 |

## Quick Reference — Where to Find Things

| Task | Start Here |
| --- | --- |
| Understand domain types | `lib/domain/types/` (30 type definition files) |
| Add a CLI command | `lib/application/cli/commands/` + register in `lib/application/cli/registry.ts` |
| Modify the execution pipeline | `lib/application/execution/` (11 files: plan → interpret → execute → evidence → proposals) |
| Change resolution logic | `lib/runtime/agent/` (17 files: strategy registry, resolution stages, candidate lattice) |
| Add a new screen to knowledge | `dogfood/knowledge/screens/{screen}.elements.yaml` + `.hints.yaml` + `.surface.yaml` |
| Modify graph derivation | `lib/domain/derived-graph.ts` + `lib/application/graph.ts` |
| Change code emission | `lib/domain/spec-codegen.ts` + `lib/application/emit.ts` |
| Understand governance | `lib/domain/governance/` (4 files) + `lib/domain/types/workflow.ts` |
| Wire new infrastructure | `lib/infrastructure/` (adapter) + `lib/composition/layers.ts` (Effect Layer) |
| Add a validation rule | `lib/domain/validation/` (16 files) |
| Dashboard / visualization | `dashboard/` (React + R3F) + `lib/domain/` (flywheel modules) |
