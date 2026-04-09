# Tesseract Domain Class Decomposition

> Status: Complete — all migration phases executed

This document bridges from the conceptual domain model (`domain-model.md`) to a concrete codebase structure. It maps every concept to a domain class, shows their relationships, and specifies the envisioned folder hierarchy.

## Dependency Topology

Before decomposing, the actual type dependency graph reveals the gravitational structure:

**Hub types** (most depended-upon):
1. `workflow` — 13 dependents. Defines governance brands, confidence levels, envelope protocol, pipeline stages. This is the shared vocabulary everything speaks.
2. `knowledge` — 6 dependents. Screen elements, hints, postures, surfaces, confidence overlays. The interface model's canonical representation.
3. `resolution` — 5 dependents. Translation, grounding, task packets, run plans. The pipeline's central handoff.
4. `intent` — 4 dependents. Scenarios, steps, value refs. The input model.
5. `interface` — 3 dependents. Interface graph, selectors, discovery. The structural model of reality.
6. `fitness` / `improvement` — 4 dependents each. The improvement loop's internal cluster.

**Leaf types** (consumed but not depended-upon):
- pipeline-config, route-knowledge, contradiction, affordance, architecture-fitness, convergence-proof, semantic-dictionary, dashboard, workbench, widgets, routes

**Two natural clusters** emerge:
- **Core pipeline**: workflow ↔ intent ↔ knowledge ↔ resolution ↔ execution ↔ interface (tightly coupled)
- **Improvement loop**: fitness → improvement → convergence-proof → experiment (loosely coupled to core via execution receipts)

---

## Class Decomposition by Primitive

Each primitive from the domain model maps to a set of domain classes (types/interfaces). The classes listed under each primitive are its gravitational well — the types that belong here conceptually, regardless of where they currently live in the codebase.

### Kernel (shared infrastructure)

Not a domain primitive — the foundation everything is built on.

| Class | Current location | Role |
|---|---|---|
| `Brand<T, Name>` | kernel/brand.ts | Phantom type branding utility |
| `*Id` types (AdoId, ScreenId, ElementId, ...) | kernel/ids.ts, kernel/identity.ts | Strongly-typed identity generation |
| `hash`, `stableStringify` | kernel/hash.ts | Content fingerprinting |
| `DomainError` variants | kernel/errors.ts | Typed error hierarchy |
| `Visitor` patterns | kernel/visitors.ts | AST traversal |
| `Monoid<T>`, `Lattice<T>` | algebra/monoid.ts, algebra/lattice.ts | Algebraic foundations |
| `ScoringRule<T>` | algebra/scoring.ts | Composable scoring |
| `chooseByPrecedence<T, Rung>` | resolution/precedence.ts | Generic precedence algebra |
| `EnvelopeMerger` | algebra/envelope-mergers.ts | Envelope composition |
| `SeededRng` | kernel/random.ts | Reproducible randomness |
| `Collections` utilities | kernel/collections.ts | Shared collection ops |
| `RefPath` | kernel/ref-path.ts | Fixture path references |

### Intent

| Class | Current location | Role |
|---|---|---|
| `ScenarioSource` | types/intent.ts | Raw ADO test case |
| `ScenarioMetadata` | types/intent.ts | Suite, ID, tags |
| `ScenarioPrecondition` | types/intent.ts | What must hold before |
| `ScenarioStatus` | types/workflow.ts | stub → ... → deprecated |
| `AdoStep`, `AdoParameter`, `AdoSnapshot` | types/intent.ts | Raw ADO step data |
| `StepAction` | types/workflow.ts | navigate, input, click, assert-snapshot, custom |
| `StepInstruction` variants | types/intent.ts | navigate, enter, invoke, observe-structure, custom-escape-hatch |
| `StepProgram` | types/intent.ts | Compiled instruction sequence |
| `ValueRef` variants | types/intent.ts | literal, fixture-path, posture-sample, parameter-row, generated-token |
| `WorkflowArchetype` | synthesis/workflow-archetype.ts | search-verify, detail-inspect, form-submit, etc. |
| `TranslationGap` vocabulary | synthesis/translation-gap.ts | Domain synonym space |
| `ScenarioPlan` | synthesis/scenario-plan.ts | Planning rules and constraints |
| Scenario tier classification | scenario/tier-projection.ts | fast / normal / slow |
| Scenario schemas | schemas/intent.ts | Zod codecs for intent types |
| Intent validators | validation/core/intent-validator.ts | Structural validation |

### Target

| Class | Current location | Role |
|---|---|---|
| `CanonicalTargetRef` | kernel/ids.ts | Semantic identity of a thing in reality |
| `ElementSig` | types/knowledge.ts | Element signature (name, role, strategy, widget) |
| `ScreenElements` | types/knowledge.ts | Elements on a screen |
| `SurfaceDefinition`, `SurfaceSection`, `SurfaceGraph` | types/knowledge.ts | Spatial regions |
| `SelectorProbe` | types/interface.ts | Concrete locator candidate |
| `SelectorCanon`, `SelectorCanonEntry` | types/interface.ts | Ranked probes per target |
| `ApplicationInterfaceGraph` | types/interface.ts | Graph of targets and relationships |
| `InterfaceGraphNode`, `InterfaceGraphEdge` | types/interface.ts | Graph primitives |
| `DiscoveryTarget`, `DiscoveryObservedElement` | types/interface.ts | First-encounter target data |
| `RouteDefinition`, `RouteVariant` | types/routes.ts | Navigation containers for targets |
| `RoutePattern`, `RouteVariantRanking` | types/route-knowledge.ts | Parameterized URL patterns |
| `TransitionObservation` | types/interface.ts | State change observations |
| `ObservationPredicate` | types/knowledge.ts | Affordance conditions |
| `ElementAffordance` | types/affordance.ts | clickable, typeable, selectable, ... |
| `WidgetAction`, `WidgetPrecondition`, `WidgetEffect` | types/widgets.ts | Widget contracts |
| Widget role-affordance map | widgets/role-affordances.ts | ARIA role → affordances |
| Interface schemas | schemas/interface.ts, schemas/knowledge.ts | Zod codecs |
| Interface validators | validation/core/knowledge-validator.ts | Structural validation |

### Knowledge

| Class | Current location | Role |
|---|---|---|
| `ScreenHints`, `ScreenElementHint` | types/knowledge.ts | Human phrasing → known concepts |
| `Posture`, `PostureId` | types/knowledge.ts | Behavioral dispositions |
| `Pattern` documents | knowledge/patterns.ts | Promoted cross-screen abstractions |
| `SnapshotTemplate` | types/knowledge.ts | ARIA tree templates |
| `SemanticDictionaryCatalog`, `SemanticDictionaryEntry` | types/semantic-dictionary.ts | TF-IDF indexed mapping |
| `ShingleIndex` | knowledge/shingles.ts | Token n-gram index |
| `ConfidenceOverlayCatalog`, `ArtifactConfidenceRecord` | types/knowledge.ts | Derived working knowledge |
| `ApprovalEquivalenceStatus` | types/knowledge.ts | learning / approved-equivalent / needs-review |
| `KnowledgePosture` | types/workflow.ts | cold-start / warm-start / production |
| `KnowledgeFreshness` | knowledge/knowledge-freshness.ts | Staleness tracking |
| `KnowledgeBottleneck`, `KnowledgeBottleneckReport` | types/learning.ts | Where knowledge is thin |
| `ScreenBundle` | knowledge/screen-bundle.ts | Bundled per-screen knowledge |
| `InterfaceResolutionContext` | types/knowledge.ts | Resolved knowledge for resolution |
| Knowledge inference | knowledge/inference.ts | Normalization and alias generation |
| Knowledge discovery | knowledge/discovery.ts | DOM discovery and extraction |
| Knowledge schemas | schemas/knowledge.ts | Zod codecs |

### Observation

| Class | Current location | Role |
|---|---|---|
| `DiscoveryRun`, `DiscoveryIndex`, `DiscoveryIndexEntry` | types/interface.ts | Systematic crawl records |
| `DiscoveryObservedSurface` | types/interface.ts | What was seen during discovery |
| `ScreenCapturedEvent` | types/dashboard.ts | Screenshot capture event |
| `ElementProbedEvent` | types/dashboard.ts | Element probing event with BoundingBox |
| `ObservationPredicate`, `StatePredicateSemantics` | types/knowledge.ts | Conditions to check |
| `CausalLink` | types/resolution.ts | Expected transitions for subsequent steps |
| `ObservedStateSession*` | types/resolution.ts | Pre/post-execution state observations |
| `ConsoleEntry` | types/execution.ts | Captured console output |
| `ExecutionObservation` | types/execution.ts | What was observed during execution |
| ARIA snapshot capture | knowledge/aria-snapshot.ts | Accessibility tree capture |
| Screen identification signals | runtime/screen-identification.ts | DOM-to-screen matching |

### Interpretation

| Class | Current location | Role |
|---|---|---|
| `TranslationRequest` | types/resolution.ts | Structured interpretation input |
| `TranslationReceipt` | types/resolution.ts | Interpretation result with provenance |
| `TranslationCandidate` | types/resolution.ts | A possible interpretation |
| `TranslationDecomposition` | types/resolution.ts | Verb/target/data extraction |
| `SemanticDictionaryMatch`, `SemanticDictionaryMatchScoring` | types/semantic-dictionary.ts | TF-IDF match result |
| `SemanticRetrievalContext` | types/semantic-dictionary.ts | What's available for matching |
| `SemanticDictionaryAccrualInput` | types/semantic-dictionary.ts | Learning from successful interpretation |
| `IntentInterpretation` | runtime/agent/types.ts | Agent interpretation result |
| `InterpretationDriftRecord`, `InterpretationDriftStep` | types/execution.ts | Interpretation quality over time |
| `ExhaustionEntry` (in resolution types) | types/resolution.ts | What was tried and why it failed |
| Candidate lattice | runtime/agent/candidate-lattice.ts | Multi-dimensional ranking |
| Alias matching, text normalization | runtime/agent/shared.ts | Canonicalization for comparison |

### Confidence

| Class | Current location | Role |
|---|---|---|
| `Confidence` type | types/workflow.ts | human / agent-verified / agent-proposed / compiler-derived / intent-only / unbound |
| `ArtifactConfidenceRecord` | types/knowledge.ts | Per-artifact confidence with lineage |
| `ConfidenceOverlayCatalog` | types/knowledge.ts | Collection of confidence records |
| `ConfidenceScaling` | types/pipeline-config.ts | Growth/decay tuning parameters |
| `ProposalConfidenceValues` | types/pipeline-config.ts | Thresholds for proposing |
| `ScoringRule<T>` | algebra/scoring.ts | Semigroup/monoid composition |
| Signal maturation curve | application/signal-maturation.ts | Dampening early signals |
| Approval equivalence threshold | types/knowledge.ts | When belief becomes actionable |

### Provenance

| Class | Current location | Role |
|---|---|---|
| `WorkflowEnvelopeLineage` | types/workflow.ts | Sources, parents, handshakes |
| `WorkflowEnvelopeFingerprints` | types/workflow.ts | SHA-256 content hashes |
| `StepProvenanceKind` | types/workflow.ts | explicit / approved-knowledge / live-exploration / agent-interpreted / unresolved |
| `SourcedCandidate<T, Rung>` | types/workflow.ts | Phantom type branding resolution source |
| `StagedEnvelope<T, Stage>` | types/workflow.ts | Phantom type branding pipeline stage |
| `ProvenanceKind` | governance/provenance.ts | Provenance classification |
| `ReasonChain` | resolution/reason-chain.ts | Ordered rejection record |
| Graph edge kinds: derived-from, references, uses, observed-by | types/projection.ts | Lineage in the dependency graph |

### Evidence

| Class | Current location | Role |
|---|---|---|
| `StepExecutionReceipt` | types/execution.ts | What happened at each step |
| `RecoveryAttemptReceipt` | types/execution.ts | Recovery attempt record |
| `PlannedExecutionStepReceipt` | types/execution.ts | Planned vs actual |
| `ResolutionGraphStepRecord`, `ResolutionGraphRecord` | types/execution.ts | Which resolution path was chosen |
| `ResolutionGraphDriftDelta` | types/execution.ts | Resolution graph changes |
| `ExecutionDiagnostic` | types/execution.ts | What went wrong |
| `TranslationRunMetrics` | types/execution.ts | Translation performance |
| `PlannedTransitionEdgeReceipt`, `PlannedTransitionPathStepReceipt` | types/execution.ts | State transition observations |
| `RunRecord` (in execution types) | types/execution.ts | Aggregate scenario evidence |
| `ReplayExample` | types/learning.ts | Evidence packaged for training |
| `GroundedSpecFragment` | types/learning.ts | Runtime evidence fragment |
| Execution schemas | schemas/execution.ts | Zod codecs for receipts |
| Execution validators | validation/core/execution-validator.ts | Receipt validation |

### Resolution

| Class | Current location | Role |
|---|---|---|
| `ResolutionPrecedenceRung`, `DataResolutionPrecedenceRung`, `RunSelectionPrecedenceRung` | resolution/precedence-policy.ts | Rung definitions per concern |
| `StepGrounding`, `GroundedStep` | types/resolution.ts | Fully resolved step |
| `ScenarioInterpretationSurface` | types/resolution.ts | Machine contract for one scenario |
| `ScenarioRunPlan` | types/resolution.ts | What will be executed and how |
| `ScenarioKnowledgeSlice` | types/resolution.ts | Subset of knowledge for resolution |
| `ResolutionEngineCapabilities` | types/resolution.ts | What the engine can do |
| `TaskArtifactRef` | types/resolution.ts | Reference to resolution artifact |
| Pipeline DAG | resolution/pipeline-dag.ts | Resolution as directed acyclic graph |
| Comparison rules | resolution/comparison-rules.ts | Candidate comparison |
| Execution planner | resolution/execution-planner.ts | State transition planning |
| Resolution model | resolution/model.ts | Core resolution types |

### Commitment

| Class | Current location | Role |
|---|---|---|
| `StepProgram`, `StepInstruction` | types/intent.ts | Executable instruction sequence |
| Program compilation | execution/program.ts | Instruction trace, capability derivation |
| Execution grammar | execution/grammar.ts | Instruction semantics |
| `RecoveryPolicy` | execution/recovery-policy.ts | Recovery strategy definitions |
| `GroundedFlow` | execution/grounded-flow.ts | Flow with precondition validation |
| Telemetry types | execution/telemetry.ts | Timing, cost measurement |
| Status aggregation | execution/status.ts | Confidence from step outcomes |
| Widget handler contracts | widgets/contracts.ts | Action/precondition/effect per widget |
| Widget handlers (os-button, os-input, os-table) | runtime/widgets/ | Concrete widget implementations |
| Interpreter modes (playwright, dry-run, diagnostic) | runtime/interpreters/ | Execution mode dispatch |
| Navigation strategy | runtime/navigation-strategy.ts | SPA vs. traditional |
| Parallel step analysis | runtime/parallel-steps.ts | Dependency analysis for safe parallelism |

### Attention

| Class | Current location | Role |
|---|---|---|
| `MemoryCapacityConfig` | types/pipeline-config.ts | Working context limits |
| `CandidateLimits` | types/pipeline-config.ts | Per-rung candidate limits |
| `BottleneckWeights` | types/pipeline-config.ts | Repair density, translation rate, etc. |
| `RankingWeights` | types/pipeline-config.ts | Scenario impact, bottleneck reduction, etc. |
| `DomScoringWeights` | types/pipeline-config.ts | Visibility, role-name match, locator quality |
| `IntentThresholds` | types/pipeline-config.ts | Intent parsing tuning |
| `PipelineConfig` | types/pipeline-config.ts | Unified tunable parameter space |
| Speed tier batcher | projection/speed-tier-batcher.ts | Prioritizing by execution speed |
| Hotspot detection | application/hotspots.ts | Finding where attention is most needed |
| Sensitivity analysis | scripts/sensitivity.ts | Ranking knob impact |
| Scenario prioritization | (implicit in speedrun) | Which scenarios to run first |

### Agency

| Class | Current location | Role |
|---|---|---|
| `ParticipantKind` | types/intervention.ts | agent / operator / system / benchmark-runner / reviewer / optimizer |
| `ParticipantCapability` | types/intervention.ts | orient, inspect, discover, propose, approve, ... |
| `ParticipantRef`, `Participant` | types/intervention.ts | Specific actor instance |
| `AgentInterpreterPort` | types/agent-interpreter.ts | Agent interpretation contract |
| Agent session adapter types | application/agent-session-adapter.ts | Provider-agnostic interface |
| Agent decider | application/agent-decider.ts | Routing work to agent vs. human |
| Provider registry | application/provider-registry.ts | Pluggable backends |
| A/B testing | application/agent-ab-testing.ts | Agent provider comparison |
| Agent-in-the-loop protocol | infrastructure/dashboard/file-decision-bridge.ts | Real-time approval during speedruns |

### Handshake

| Class | Current location | Role |
|---|---|---|
| `WorkflowEnvelope` | types/workflow.ts | Universal handshake format |
| `WorkflowEnvelopeIds` | types/workflow.ts | Envelope identity fields |
| `WorkflowEnvelopeFingerprints` | types/workflow.ts | Content hashes |
| `WorkflowEnvelopeLineage` | types/workflow.ts | Sources, parents, handshakes |
| `PreparationEnvelope<T>`, `ResolutionEnvelope<T>`, `ExecutionEnvelope<T>` | types/workflow.ts | Stage-typed envelopes |
| `AgentWorkItem` | types/workbench.ts | Agent-to-human handshake |
| `WorkItemAction`, `WorkItemCompletion` | types/workbench.ts | Work item protocol |
| `InboxUrgency` | types/dashboard.ts | blocking / queued |
| `AgentEvent`, `AgentEventType` | types/session.ts | Session event vocabulary |
| `AgentSession` | types/session.ts | Session record |
| `DashboardEvent`, `DashboardEventKind` | types/dashboard.ts | System-to-visualization events |
| `WorkItemDecision` | types/dashboard.ts | Decision record |
| `FiberPauseEvent`, `FiberResumeEvent` | types/dashboard.ts | Cross-process handshake events |
| MCP tool definitions | infrastructure/mcp/dashboard-mcp-server.ts | Agent protocol surface |
| MCP resource provider | infrastructure/mcp/resource-provider.ts | tesseract:// URI scheme |
| Envelope factory | application/catalog/envelope.ts | Envelope construction |

### Governance

| Class | Current location | Role |
|---|---|---|
| `Governance` type | types/workflow.ts | approved / review-required / blocked |
| `Approved<T>`, `ReviewRequired<T>`, `Blocked<T>` | types/workflow.ts | Phantom branded governance |
| `Governed<T, G>` | types/workflow.ts | Generic governance brand |
| `CertificationStatus` | types/workflow.ts | uncertified / certifying / certified |
| `TrustPolicy` evaluation | governance/trust-policy.ts | Per-artifact rules |
| `PostureContract` | governance/posture-contract.ts | Compatibility constraints |
| `ContradictionReport`, `KnowledgeContradiction` | types/contradiction.ts | Conflict types |
| Contradiction detector | governance/contradiction-detector.ts | Detection logic |
| Governance binding | governance/binding.ts | Element binding governance |
| Governance diagnostics | governance/diagnostics.ts | Diagnostic messages |
| Governance workflow facade | governance/workflow-facade.ts | Simplified state queries |
| Governance effect targets | governance/effect-target.ts | Self / element / surface |
| Governance validators | validation/core/governance-validator.ts | Policy evaluation validation |

### Proposal (derivative of Evidence + Governance)

| Class | Current location | Role |
|---|---|---|
| Proposal types | (embedded in workflow/governance) | Proposal bundle, patch, rationale |
| `ProposalCluster` | governance/proposal-cluster.ts | Grouping related proposals |
| `ProposalQuality` metrics | governance/proposal-quality.ts | Coverage, consistency, risk |
| `BatchDecision` | governance/batch-decision.ts | Grouped governance decisions |
| `FailureFragments` | governance/failure-fragments.ts | Failure classification for proposals |
| Proposal activation logic | application/activate-proposals.ts | Pending → activated → certified |
| Proposal patches | application/proposal-patches.ts | Applying patches to knowledge |
| Proposal intelligence | application/proposal-intelligence.ts | Correlation with bottlenecks |
| Auto-approval policy | application/auto-approval.ts | Bypass conditions |

### Fitness (derivative of Evidence → Convergence)

| Class | Current location | Role |
|---|---|---|
| `PipelineFailureClass` | types/fitness.ts | 8 failure mode classifications |
| `PipelineFailureMode` | types/fitness.ts | Failure mode with target |
| `PipelineFitnessMetrics`, `PipelineFitnessReport` | types/fitness.ts | Aggregate metrics |
| `PipelineScorecard` | types/fitness.ts | Scorecard with history |
| `ParetoObjectives`, `ParetoFrontierEntry` | types/fitness.ts | Multi-objective surface |
| `ScorecardHighWaterMark`, `ScorecardHistoryEntry` | types/fitness.ts | Trend tracking |
| `GeneralizationMetrics` | types/fitness.ts | Beyond-training generalization |
| `RungRate` | types/fitness.ts | Resolution by rung |
| Knob search | application/knob-search.ts | Failure class → parameter mapping |
| Fitness computation | application/fitness.ts | Classification and aggregation |

### Convergence

| Class | Current location | Role |
|---|---|---|
| `ConvergenceTrialResult` | types/convergence-proof.ts | Per-trial metrics |
| `ConvergenceVerdict` | types/convergence-proof.ts | Confidence level |
| `ConvergenceProofResult` | types/convergence-proof.ts | Multi-trial statistical verdict |
| Convergence FSM | projection/convergence-fsm.ts | exploring → narrowing → plateau → converged |
| Convergence bounds | projection/convergence-bounds.ts | Mathematical confidence intervals |
| Convergence finale | projection/convergence-finale.ts | End-of-loop analysis |

### Improvement Loop (composite of Fitness + Proposal + Convergence)

| Class | Current location | Role |
|---|---|---|
| `ImprovementLoopLedger` | types/improvement.ts | Append-only iteration record |
| `ImprovementLoopIteration` | types/improvement.ts | Single iteration data |
| `ImprovementSignal`, `ImprovementSignalKind` | types/improvement.ts | Learning signals |
| `LearningSignalsSummary` | types/improvement.ts | Aggregated signal summary |
| `ObjectiveVector` | types/improvement.ts | Multi-dimensional fitness |
| `CandidateIntervention` | types/improvement.ts | Proposed config change |
| `AcceptanceDecision`, `AcceptanceVerdict` | types/improvement.ts | Pareto accept/reject |
| `SubstrateContext`, `ExperimentSubstrate` | types/improvement.ts | Synthetic / production / hybrid |
| `SpeedrunProgressEvent` | types/improvement.ts | Phase progress events |
| `ExperimentRecord` | types/experiment.ts | Experiment registry entry |
| `PipelineConfig` | types/pipeline-config.ts | Tunable parameter space |
| Speedrun orchestration | application/speedrun.ts | Full improvement loop |
| Dogfood orchestration | application/dogfood.ts | Training data loop |
| Improvement intelligence | application/improvement-intelligence.ts | Correlating fitness with hotspots |
| Iteration journal | application/iteration-journal.ts | Anti-churn memory |

### Learning (derivative of Evidence → Knowledge)

| Class | Current location | Role |
|---|---|---|
| `TrainingCorpusManifest`, `TrainingCorpusRuntimeManifest` | types/learning.ts | Corpus structure |
| `ReplayExample`, `GroundedSpecFragment` | types/learning.ts | Training data |
| `CorpusHealthReport` | types/learning.ts | Coverage and completeness |
| `ReplayEvaluationResult`, `ReplayEvaluationSummary` | types/learning.ts | Replay quality |
| `BottleneckSignal` | types/learning.ts | Where learning is needed |
| `LearningRuntime` | types/learning.ts | decomposition / repair-recovery / workflow |
| Learning state aggregation | application/learning-state.ts | Integrating 7+ signal modules |
| Learning health | application/learning-health.ts | Corpus coverage |
| Learning bottlenecks | application/learning-bottlenecks.ts | Repair density, thin coverage |
| Learning rankings | application/learning-rankings.ts | Proposal impact scoring |

### Drift & Coherence

| Class | Current location | Role |
|---|---|---|
| `InterpretationDriftRecord`, `InterpretationDriftChange` | types/execution.ts | Interpretation quality change |
| Rung drift detection | application/rung-drift.ts | Resolution falling to lower rungs |
| Execution coherence | application/execution-coherence.ts | Correlating drift signals per screen |
| Interpretation coherence | application/interpretation-coherence.ts | Intent-to-resolution consistency |
| Selector health tracking | application/selector-health.ts | Success rate, flakiness, trend |
| Dirty tracking | application/dirty-tracking.ts | Fingerprint-based staleness |
| Console intelligence | application/console-intelligence.ts | Noise pattern detection |
| Timing baseline | application/timing-baseline.ts | Performance regression detection |
| Recovery effectiveness | application/recovery-effectiveness.ts | Strategy success rate |
| Execution cost | application/execution-cost.ts | Cost anomaly detection |

### Graph (derivative of Provenance)

| Class | Current location | Role |
|---|---|---|
| `GraphNodeKind`, `GraphEdgeKind` | types/projection.ts | Node and edge taxonomies |
| `GraphNode`, `GraphEdge` | types/projection.ts | Graph primitives |
| `DerivedGraph` (GraphAccumulator) | codegen/derived-graph.ts | Universal derived graph |
| Graph query | codegen/graph-query.ts | Reachability, path-finding |
| Impact analysis | application/impact.ts | Dependency subgraph |
| Trace collection | application/trace.ts | Scenario subgraph |
| Concurrent graph builder | application/concurrent-graph-builder.ts | Parallel construction |

### Projection (derivative of Evidence + Convergence)

| Class | Current location | Role |
|---|---|---|
| `ScenarioExplanation` (in projection types) | types/projection.ts | Step-level provenance surface |
| `BenchmarkScorecard`, `BenchmarkContext` | types/projection.ts | Benchmark reporting |
| `ImprovementProjectionSummary` | types/projection.ts | Improvement summary |
| `DogfoodRun` | types/projection.ts | Dogfood execution projection |
| `MappedMcpResource` | types/projection.ts | MCP resource mapping |
| Scene state accumulator | projection/scene-state-accumulator.ts | State across steps and runs |
| Summary view | projection/summary-view.ts | Aggregated scorecard |
| Speed tier batcher | projection/speed-tier-batcher.ts | Scenario batching |
| Speedrun statistics | projection/speedrun-statistics.ts | Iteration metrics |
| Iteration timeline | projection/iteration-timeline.ts | Timeline projection |
| Binding distribution | projection/binding-distribution.ts | Knowledge coverage distribution |
| Act indicator | projection/act-indicator.ts | Execution health indicators |
| Component maturation | projection/component-maturation.ts | Widget maturity tracking |
| Surface overlay | projection/surface-overlay.ts | Confidence composition |

### Codegen (derivative of Resolution → Playwright)

| Class | Current location | Role |
|---|---|---|
| Spec emission | codegen/spec-codegen.ts | Generating Playwright tests |
| TypeScript AST | codegen/ts-ast.ts | AST manipulation |
| Type generation | codegen/typegen.ts | TypeScript type emission |
| Method naming | codegen/method-name.ts | Name generation from metadata |

### Dashboard & Visualization (projection into human perception)

| Class | Current location | Role |
|---|---|---|
| `DashboardEventKind` (30+ event kinds) | types/dashboard.ts | Event taxonomy |
| `DashboardEvent` | types/dashboard.ts | Event envelope |
| `KnowledgeNodeProjection`, `KnowledgeNodeStatus` | types/dashboard.ts | Knowledge state for UI |
| `BoundingBox` | types/dashboard.ts | Spatial element observation |
| `ActorKind` | types/dashboard.ts | system / agent / operator |
| Flywheel acts 1-7 | dashboard/src/hooks/ | Visual stage metaphor |
| Proposal cluster phases | dashboard/src/hooks/ | approaching → dissolved |
| Degradation controller (tiers 0-4) | dashboard/src/organisms/ | FPS-based quality tiers |
| Camera choreography | dashboard/src/hooks/ | Pan/zoom animation |
| Particle simulation | dashboard/src/hooks/ | Visual effects |
| SAB zero-copy bridge | dashboard/src/hooks/ | SharedArrayBuffer transport |
| Pipeline event bus | infrastructure/dashboard/pipeline-event-bus.ts | Effect PubSub + ring buffer |
| WebSocket adapter | infrastructure/dashboard/ws-dashboard-adapter.ts | Real-time broadcast |
| CDP screencast | infrastructure/dashboard/cdp-screencast.ts | Video streaming |
| Journal writer | infrastructure/dashboard/journal-writer.ts | Event logging |

---

## Envisioned Folder Hierarchy

The six-layer architecture (domain → application → runtime → infrastructure → composition → playwright) is retained — it encodes dependency direction, which is an invariant. Within each layer, directories are reorganized by domain primitive rather than technical concern.

### `lib/domain/` — Pure types, validation, deterministic logic

```
domain/
  kernel/                          # Shared infrastructure primitives
    identity.ts                    #   ID types and generation
    brand.ts                       #   Phantom branding utility
    hash.ts                        #   SHA-256 fingerprinting
    errors.ts                      #   Typed error hierarchy
    visitors.ts                    #   AST traversal patterns
    collections.ts                 #   Shared collection utilities
    random.ts                      #   Seeded RNG
    ref-path.ts                    #   Fixture path references
    algebra/                       #   Algebraic foundations
      monoid.ts                    #     Monoid operations
      lattice.ts                   #     Lattice merge operations
      scoring.ts                   #     Composable scoring rules
      precedence.ts                #     Generic chooseByPrecedence<T, Rung>
      envelope-mergers.ts          #     Envelope composition

  intent/                          # What someone wants verified
    scenario.ts                    #   ScenarioSource, metadata, status, preconditions
    step.ts                        #   StepAction, StepInstruction, StepProgram
    value-ref.ts                   #   ValueRef variants (literal, fixture, posture, param, token)
    archetype.ts                   #   Workflow archetypes (search-verify, form-submit, ...)
    translation-gap.ts             #   Domain synonym vocabulary
    scenario-plan.ts               #   Planning rules and constraints
    tier.ts                        #   Scenario speed tier classification
    schemas.ts                     #   Zod codecs for intent types
    validation.ts                  #   Intent structural validators

  target/                          # Semantic identity of things in reality
    canonical-ref.ts               #   CanonicalTargetRef
    element.ts                     #   ElementSig, ElementId
    screen.ts                      #   ScreenId, screen types
    surface.ts                     #   SurfaceDefinition, SurfaceSection, SurfaceGraph
    selector.ts                    #   SelectorProbe, SelectorCanon, rung health
    affordance.ts                  #   Interaction capabilities and constraints
    widget.ts                      #   Widget contracts, role-affordance mapping
    route.ts                       #   RouteDefinition, RouteVariant, RoutePattern
    state.ts                       #   StateNode, StateTransition, EventSignature
    interface-graph.ts             #   ApplicationInterfaceGraph, node/edge types
    discovery.ts                   #   DiscoveryTarget, DiscoveryRun, DiscoveryIndex
    schemas.ts                     #   Zod codecs for target/interface types
    validation.ts                  #   Target/interface structural validators

  knowledge/                       # Accumulated beliefs about reality
    screen-bundle.ts               #   ScreenElements, ScreenHints, Postures per screen
    patterns.ts                    #   Promoted cross-screen abstractions
    snapshots.ts                   #   ARIA snapshot templates
    semantic-dictionary.ts         #   TF-IDF indexed intent-to-target mapping
    shingles.ts                    #   Token n-gram index for fuzzy matching
    confidence-overlay.ts          #   Derived working knowledge from evidence
    freshness.ts                   #   Staleness tracking
    posture.ts                     #   Knowledge posture (cold/warm/production)
    inference.ts                   #   Normalization and alias generation
    supplement-hierarchy.ts        #   Local hints → promoted patterns
    schemas.ts                     #   Zod codecs for knowledge types
    validation.ts                  #   Knowledge structural validators

  observation/                     # Perceiving reality through surfaces
    discovery.ts                   #   Discovery run contracts, observed surfaces
    screen-identification.ts       #   DOM-to-screen signal matching
    aria-snapshot.ts               #   ARIA tree capture and normalization
    predicates.ts                  #   Observation predicates, state semantics
    causal-links.ts                #   Expected transitions for subsequent steps

  interpretation/                  # Making meaning from observation
    translation.ts                 #   TranslationRequest, Receipt, Candidate
    decomposition.ts               #   Verb/target/data extraction
    candidate-lattice.ts           #   Multi-dimensional ranking
    exhaustion.ts                  #   ExhaustionEntry, reason chains
    semantic-matching.ts           #   Retrieval context, match scoring
    schemas.ts                     #   Zod codecs for interpretation types

  confidence/                      # Trust in interpretations
    levels.ts                      #   Confidence enum and type
    overlay.ts                     #   ArtifactConfidenceRecord, OverlayCatalog
    scaling.ts                     #   Growth/decay parameters
    approval-equivalence.ts        #   Threshold crossing logic

  provenance/                      # Ancestry of derived things
    lineage.ts                     #   Sources, parents, handshakes
    fingerprint.ts                 #   SHA-256 content hashing
    source-brand.ts                #   SourcedCandidate<T, Rung> phantom type
    stage-brand.ts                 #   StagedEnvelope<T, Stage> phantom type
    reason-chain.ts                #   Ordered rejection record

  evidence/                        # Structured records of what happened
    step-receipt.ts                #   StepExecutionReceipt
    recovery-receipt.ts            #   RecoveryAttemptReceipt
    run-record.ts                  #   RunRecord aggregate
    diagnostics.ts                 #   ExecutionDiagnostic
    failure-classification.ts      #   Failure families
    transition-receipt.ts          #   State transition observation records
    resolution-graph.ts            #   ResolutionGraphRecord, drift deltas
    replay.ts                      #   ReplayExample, GroundedSpecFragment
    schemas.ts                     #   Zod codecs for evidence types
    validation.ts                  #   Evidence structural validators

  resolution/                      # Connecting intent to reality
    precedence-policy.ts           #   Rung orderings per concern
    grounding.ts                   #   StepGrounding, GroundedStep
    run-plan.ts                    #   ScenarioRunPlan
    knowledge-slice.ts             #   ScenarioKnowledgeSlice
    interpretation-surface.ts      #   ScenarioInterpretationSurface
    pipeline-dag.ts                #   Resolution as DAG of rungs
    comparison.ts                  #   Candidate comparison rules
    execution-planner.ts           #   State transition planning

  commitment/                      # Irreversible action on a resolution
    program.ts                     #   Step program compilation
    grammar.ts                     #   Instruction semantics
    recovery-policy.ts             #   Recovery strategy definitions
    grounded-flow.ts               #   Flow with precondition validation
    telemetry.ts                   #   Timing, cost measurement
    budget.ts                      #   Execution budget constraints
    status.ts                      #   Confidence from step outcomes

  attention/                       # Finite capacity allocation
    pipeline-config.ts             #   PipelineConfig (unified parameter space)
    capacity.ts                    #   MemoryCapacityConfig
    weights.ts                     #   Bottleneck, ranking, DOM scoring weights
    candidate-limits.ts            #   Per-rung candidate limits

  agency/                          # Who acts, with what capabilities
    participant.ts                 #   ParticipantKind, capabilities, refs
    interpreter.ts                 #   AgentInterpreterPort contract
    intervention.ts                #   InterventionKind, effects, receipts, commands

  handshake/                       # Context transfer between actors/phases
    envelope.ts                    #   WorkflowEnvelope, ids, fingerprints, lineage
    stage-envelopes.ts             #   Preparation/Resolution/Execution envelopes
    work-item.ts                   #   AgentWorkItem, actions, completions
    inbox.ts                       #   Inbox types, urgency
    session.ts                     #   AgentSession, AgentEvent, event types
    dashboard-event.ts             #   DashboardEventKind, DashboardEvent (30+ kinds)

  governance/                      # Who decides what's allowed
    branded-types.ts               #   Approved<T>, Blocked<T>, Governed<T, G>
    trust-policy.ts                #   Policy rules and evaluation
    certification.ts               #   CertificationStatus
    contradiction.ts               #   KnowledgeContradiction, detection
    posture-contract.ts            #   Compatibility constraints
    binding.ts                     #   Element binding governance
    effect-target.ts               #   Self / element / surface

  proposal/                        # Suggested changes to knowledge
    types.ts                       #   Proposal bundle, patch, rationale
    cluster.ts                     #   Proposal clustering
    quality.ts                     #   Coverage, consistency, risk metrics
    batch-decision.ts              #   Grouped governance decisions
    failure-fragments.ts           #   Failure classification for proposals

  fitness/                         # Measuring the gap
    failure-modes.ts               #   8 failure mode classifications
    metrics.ts                     #   PipelineFitnessMetrics, report
    scorecard.ts                   #   PipelineScorecard, history, high-water marks
    pareto.ts                      #   ParetoObjectives, frontier entries
    generalization.ts              #   Beyond-training generalization metrics

  convergence/                     # Whether the system improves over time
    proof.ts                       #   TrialResult, Verdict, ProofResult
    bounds.ts                      #   Mathematical confidence intervals
    fsm.ts                         #   exploring → narrowing → plateau → converged

  improvement/                     # The self-improvement loop
    ledger.ts                      #   ImprovementLoopLedger, iterations
    signals.ts                     #   ImprovementSignal, LearningSignalsSummary
    objective.ts                   #   ObjectiveVector, candidate interventions
    acceptance.ts                  #   AcceptanceDecision, verdict
    substrate.ts                   #   SubstrateContext, ExperimentSubstrate
    experiment.ts                  #   ExperimentRecord

  learning/                        # Training data and corpus management
    corpus.ts                      #   TrainingCorpusManifest, runtime manifest
    replay.ts                      #   ReplayExample, evaluation results
    health.ts                      #   CorpusHealthReport, coverage
    bottleneck.ts                  #   BottleneckSignal, KnowledgeBottleneckReport

  drift/                           # Knowledge diverging from reality
    types.ts                       #   InterpretationDriftRecord, drift changes
    coherence.ts                   #   Execution/interpretation coherence types
    selector-health.ts             #   Success rate, flakiness types

  graph/                           # Derived dependency graph
    derived-graph.ts               #   Node/edge types, GraphAccumulator
    query.ts                       #   Reachability, path-finding

  projection/                      # How the system explains itself
    scenario-explanation.ts        #   Step-level provenance surface
    summary.ts                     #   Aggregated views
    timeline.ts                    #   Iteration timeline
    statistics.ts                  #   Speedrun statistics
    binding-distribution.ts        #   Knowledge coverage distribution
    scene-state.ts                 #   State accumulation across runs
    act-indicator.ts               #   Execution health indicators
    maturation.ts                  #   Component maturity tracking
    surface-overlay.ts             #   Confidence composition from evidence

  codegen/                         # Projecting to Playwright
    spec-emission.ts               #   Test generation
    ts-ast.ts                      #   AST manipulation
    typegen.ts                     #   TypeScript type emission
    method-name.ts                 #   Name generation from metadata

  synthesis/                       # Generating scenarios for training
    archetype.ts                   #   Workflow archetypes
    scenario-generator.ts          #   Synthetic scenario generation
    fuzzer.ts                      #   Interface drift variants
```

### `lib/application/` — Effect orchestration, pipelines, CLI

Application files are grouped by the primitive they orchestrate, eliminating the flat 90-file problem.

```
application/
  intent/                          # Intent intake and preparation
    parse.ts                       #   YAML snapshot → Scenario
    sync.ts                        #   Snapshot synchronization from ADO
    compile-snapshot.ts            #   Immutable snapshot carrier
    refresh.ts                     #   Sync + recompile without regen

  resolution/                      # Resolution orchestration
    compile.ts                     #   Parallel parse → bind → emit
    bind.ts                        #   Scenario → bound scenario
    task.ts                        #   Scenario → grounded execution task
    resolution-engine.ts           #   Engine registry and selection
    interface-resolution.ts        #   Build resolution context from graph + knowledge
    controls.ts                    #   Dataset, runbook, resolution control selection
    translate.ts                   #   Token-overlap translation heuristic
    translation-provider.ts        #   Strategy pattern for backends
    translation-cache.ts           #   Cache for translation requests

  commitment/                      # Execution orchestration
    run.ts                         #   Scenario execution coordination
    emit.ts                        #   Project scenario → spec/trace/review
    execution/                     #   Step-level execution
      interpret.ts                 #     Resolution engine invocation
      fold.ts                      #     Merge interpretation + execution → receipt
      execute-steps.ts             #     Step execution orchestration
      build-proposals.ts           #     Extract proposals from resolutions
      build-run-record.ts          #     Assemble run record
      select-run-context.ts        #     Load surface, runbook, dataset
      persist-evidence.ts          #     Write evidence artifacts
      planner.ts                   #     Execution planning
      validate-step-results.ts     #     Result validation

  knowledge/                       # Knowledge management orchestration
    activate-proposals.ts          #   Proposal activation pipeline
    approve.ts                     #   Single proposal approval
    proposal-patches.ts            #   Apply patches to knowledge artifacts
    confidence.ts                  #   Project confidence overlays
    knowledge-posture.ts           #   Resolve posture from config
    knowledge-dependencies.ts      #   Reverse index: artifact → scenarios
    inference.ts                   #   Load inference knowledge from catalog
    semantic-translation-dict.ts   #   Persist and re-export dictionary API
    discovery-proposal-bridge.ts   #   Discovery observations → proposal bundles

  observation/                     # Discovery and harvesting orchestration
    interface-intelligence.ts      #   Build comprehensive index from discovery
    parallel-harvest.ts            #   Concurrent screen harvesting

  agency/                          # Agent and operator orchestration
    agent-workbench.ts             #   Project work items, screen grouping
    agent-session-adapter.ts       #   Provider-agnostic session interface
    agent-session-ledger.ts        #   Session ledger persistence
    agent-interpreter-provider.ts  #   Agent interpretation backends
    agent-interpretation-cache.ts  #   Cache for interpretation results
    agent-decider.ts               #   Route work to agent vs. human
    agent-ab-testing.ts            #   Agent provider traffic splitting
    dashboard-decider.ts           #   WorkItemDecider backed by dashboard
    operator.ts                    #   Operator inbox items, proposal finding
    inbox.ts                       #   Build operator inbox, markdown render
    workspace-session.ts           #   Workspace session management

  governance/                      # Governance orchestration
    trust-policy.ts                #   Load and evaluate trust policy
    auto-approval.ts               #   Auto-approval policy logic
    governance-intelligence.ts     #   Unify contradiction, fitness, policy
    intervention-kernel.ts         #   Execute approved interventions

  improvement/                     # Improvement loop orchestration
    speedrun.ts                    #   Full improvement loop
    dogfood.ts                     #   Dogfood improvement iterations
    dogfood-orchestrator.ts        #   Plan generator, convergence predicates
    improvement.ts                 #   Build improvement runs, compare scorecards
    improvement-intelligence.ts    #   Correlate fitness with hotspots
    convergence-proof.ts           #   Multi-trial statistical validation
    evolve.ts                      #   Knob-search loop
    fitness.ts                     #   Classify outcomes, compute metrics
    knob-search.ts                 #   Failure class → parameter mapping
    benchmark.ts                   #   Build benchmark context, compute scorecard
    experiment-registry.ts         #   Compatibility projection of ledger
    iteration-journal.ts           #   Cross-iteration anti-churn memory
    strategic-intelligence.ts      #   Unified proposal + improvement intelligence
    proposal-intelligence.ts       #   Proposal-bottleneck correlation
    scorecard.ts                   #   Render benchmark scorecard

  learning/                        # Learning signal orchestration
    learning.ts                    #   Build training corpus manifests
    learning-state.ts              #   Integrate all signal modules
    learning-health.ts             #   Corpus coverage and completeness
    learning-bottlenecks.ts        #   Bottleneck identification
    learning-rankings.ts           #   Proposal impact scoring
    learning-shared.ts             #   Shared scoring utilities
    signal-maturation.ts           #   Dampening early-iteration signals
    replay-evaluation.ts           #   Compare original vs replay
    replay-interpretation.ts       #   Run scenarios in replay mode

  drift/                           # Drift detection orchestration
    rung-drift.ts                  #   Resolution rung degradation
    execution-coherence.ts         #   Per-screen health correlation
    interpretation-coherence.ts    #   Intent-to-resolution consistency
    selector-health.ts             #   Selector success rate, flakiness
    console-intelligence.ts        #   Console noise pattern detection
    timing-baseline.ts             #   Performance regression detection
    execution-cost.ts              #   Cost anomaly detection
    recovery-effectiveness.ts      #   Recovery strategy success rate
    dirty-tracking.ts              #   Fingerprint-based staleness
    drift.ts                       #   Apply drift mutations to knowledge

  graph/                           # Graph orchestration
    graph.ts                       #   Build derived graph, validate
    impact.ts                      #   Impact subgraph collection
    trace.ts                       #   Scenario subgraph collection
    concurrent-graph-builder.ts    #   Parallel construction

  projection/                      # Projection orchestration
    types.ts                       #   Generate TypeScript type definitions
    surface.ts                     #   Surface capability inspection
    inspect.ts                     #   Scenario path inspection
    workflow.ts                    #   Workflow lane inspection
    diff.ts                        #   Snapshot drift detection
    progress-reporting.ts          #   Progress event formatting
    hotspots.ts                    #   Recurring resolution patterns
    rerun-plan.ts                  #   Compute affected scenarios for re-execution

  catalog/                         # Workspace loading
    workspace-catalog.ts           #   Load all artifacts by type
    envelope.ts                    #   Envelope construction
    screen-bundles.ts              #   Index screens by surface/elements
    loaders.ts                     #   Individual artifact loaders
    read-models.ts                 #   Read-model projections
    types.ts                       #   Catalog type definitions

  pipeline/                        # Pipeline infrastructure
    stage.ts                       #   Pipeline stage abstraction
    incremental.ts                 #   Incremental caching logic

  paths/                           #   Path resolution per concern
    factory.ts                     #   Create ProjectPaths from root dir
    intent.ts                      #   Snapshot/scenario paths
    control.ts                     #   Dataset/runbook paths
    knowledge.ts                   #   Elements/hints/postures paths
    resolution.ts                  #   Bound/task/approval paths
    execution.ts                   #   Run/evidence/learning paths
    governance.ts                  #   Policy/evidence/proposal paths
    types.ts                       #   Path type definitions

  infrastructure/                  # Application-level infra utilities
    ports.ts                       #   Port interfaces (FileSystem, etc.)
    effect.ts                      #   Try-catch wrappers for Effect
    concurrency.ts                 #   CPU-aware concurrency resolution
    browser-pool.ts                #   Playwright page reuse
    state-machine.ts               #   Generic state machine loop
    clean-slate.ts                 #   Wipe transient artifacts
    artifacts.ts                   #   File walking utilities
    provider-registry.ts           #   Pluggable backend registry

  cache/                           # Caching infrastructure
    file-cache.ts                  #   Generic JSON cache envelope

  projections/                     # Projection caching
    runner.ts                      #   Incremental projection stage
    cache.ts                       #   Build manifest, invalidation
    review.ts                      #   Proposal review markdown

  resilience/                      # Retry policies
    schedules.ts                   #   Named retry policies, Effect schedules

  cli/                             # CLI command wrappers
    commands/                      #   31 thin wrappers with arg parsing
```

### `lib/runtime/` — Playwright execution, agent resolution, widgets

```
runtime/
  resolution/                      # Resolution pipeline (the 11 rungs)
    index.ts                       #   Pipeline coordinator, precedence enforcement
    types.ts                       #   RuntimeStepAgentContext, stage effects
    interpret-intent.ts            #   Heuristic + LLM intent interpretation
    strategy-registry.ts           #   Rung → implementation mapping
    strategy.ts                    #   Strategy pattern interface
    candidate-lattice.ts           #   Multi-dimensional candidate ranking
    resolve-target.ts              #   Screen, element, posture resolution
    resolve-action.ts              #   Action resolution with fallbacks
    select-controls.ts             #   Runbook/dataset/control selection
    translation.ts                 #   Confidence overlay matching
    dom-fallback.ts                #   Live DOM scoring and exploration
    rung8-llm-dom.ts              #   LLM-assisted DOM analysis
    resolution-stages.ts           #   Agent-interpreted resolution (Rung 9)
    proposals.ts                   #   Proposal generation from resolutions
    receipt.ts                     #   ResolutionReceipt generation
    aria-snapshot-cache.ts         #   Step-scoped DOM cache
    semantic-dict-cache.ts         #   Scenario-scoped dictionary cache
    shared.ts                      #   Text normalization, alias matching
    mcp-bridge.ts                  #   MCP tool → agent tool mapping

  commitment/                      # Execution of resolved steps
    program.ts                     #   StepProgram instruction interpreter
    scenario.ts                    #   Multi-step scenario orchestration
    engage.ts                      #   Element interaction orchestration
    interact.ts                    #   Widget-level action dispatch
    recovery-strategies.ts         #   Composable recovery chain
    data.ts                        #   Fixture/literal/parameter value resolution
    snapshots.ts                   #   Snapshot template loading
    result.ts                      #   RuntimeResult union type, error codes
    console-sentinel.ts            #   Browser console message capture
    navigation-strategy.ts         #   SPA vs. traditional navigation
    parallel-steps.ts              #   Dependency analysis for safe parallelism
    screen-identification.ts       #   DOM-to-screen matching

  observation/                     # State and transition observation
    observe.ts                     #   State ref observation, transition inference
    pre-post.ts                    #   Pre/post-execution observation

  widgets/                         # Widget action handlers
    index.ts                       #   Handler registry
    os-button.ts                   #   Click handling
    os-input.ts                    #   Fill/clear handling
    os-table.ts                    #   Table interaction

  interpreters/                    # Multi-mode execution
    types.ts                       #   Mode union (playwright | dry-run | diagnostic)
    execute.ts                     #   Mode selection and environment creation
    evaluator.ts                   #   Generic instruction dispatch
    dry-run.ts                     #   Simulated execution
    diagnostic.ts                  #   Detailed diagnostics

  adapters/                        # Platform adapters
    playwright-dom-resolver.ts     #   DOM element discovery and scoring
```

### `lib/infrastructure/` — Ports, adapters, external systems

```
infrastructure/
  mcp/                             # Model Context Protocol surface
    dashboard-mcp-server.ts        #   Structured tool access
    playwright-mcp-bridge.ts       #   Live browser interaction protocol
    resource-provider.ts           #   tesseract:// URI scheme

  dashboard/                       # Dashboard infrastructure
    pipeline-event-bus.ts          #   Effect PubSub + SAB ring buffer
    file-decision-bridge.ts        #   Cross-process decision handoff
    ws-dashboard-adapter.ts        #   WebSocket real-time broadcast
    cdp-screencast.ts              #   CDP video streaming
    journal-writer.ts              #   Event logging
    file-dashboard-port.ts         #   File-backed dashboard persistence
    runtime-boundary.ts            #   Effect fork boundary

  observation/                     # Live observation adapters
    playwright-screen-observer.ts  #   Live DOM observation

  fs/                              # Filesystem adapters
    local-fs.ts                    #   FileSystem port implementation
    recording-fs.ts                #   Instrumented FS for audit trails

  repositories/                    # Persistence adapters
    local-application-interface-graph-repository.ts
    local-improvement-run-repository.ts
    local-intervention-ledger-repository.ts

  knowledge/                       # Knowledge persistence
    hints-writer.ts                #   Hint YAML creation and modification

  snapshots/                       # Snapshot loading
    local-snapshot-template-loader.ts

  screen-registry/                 # Screen registry loading
    local-screen-registry-loader.ts

  tooling/                         # CLI tooling adapters
    browser-options.ts             #   Headless/channel resolution
    capture-screen.ts              #   Screenshot and ARIA capture
    discover-screen.ts             #   Screen scaffold discovery
    harvest-routes.ts              #   Route enumeration
    local-version-control.ts       #   Git integration

  ado/                             # Azure DevOps adapters
    local-ado-source.ts            #   Local test definition loading
    live-ado-source.ts             #   Remote ADO integration

  runtime/                         # Runtime environment
    local-runtime-environment.ts   #   Agent interpreter, dictionary, fixtures

  reporting/                       # Report generation
    tesseract-reporter.ts          #   Test report generation

  vscode/                          # VSCode extension adapters
    copilot-participant.ts         #   Copilot interface
    problem-matcher.ts             #   Error reporting
    task-provider.ts               #   Task automation
    types.ts                       #   Shared type definitions

  browser/                         # Browser lifecycle
    playwright-browser-pool.ts     #   Page reuse across runs
    fixture-server.ts              #   Demo-harness HTTP server
    headed-harness.ts              #   Browser launch with DevTools
```

### `lib/composition/` — DI wiring (unchanged)

```
composition/
  layers.ts                        #   Effect Layer factories
  local-services.ts                #   Service composition
  load-run-plan.ts                 #   Test scenario loading
  local-runtime-scenario-runner.ts #   Runner implementation
  scenario-context.ts              #   Context propagation
  env.ts                           #   Environment variable resolution
```

### `lib/playwright/` — Playwright utilities (unchanged)

```
playwright/
  locate.ts                        #   Strategy application, degradation tracking
  aria.ts                          #   ARIA tree capture and normalization
  state-topology.ts                #   State node observation, transition detection
```

### `dashboard/` — React visualization application

```
dashboard/
  src/
    hooks/                         #   27 React hooks organized by concern:
      flywheel/                    #     Act transitions, journal, dispatch
      playback/                    #     Playback controller, screencast
      observation/                 #     Dashboard observations, probes, events
      convergence/                 #     Convergence state, iteration pulse
      workbench/                   #     Decisions, intervention mode
      transport/                   #     WebSocket, SAB bridge, buffer
      input/                       #     Keyboard shortcuts, camera
      narration/                   #     Narration queue
    organisms/                     #   Complex UI components
      degradation-controller.ts    #     FPS-based tier system
    features/                      #   Feature modules
```

### `tests/` — Test organization by primitive

```
tests/
  intent/                          #   Scenario parsing, step compilation
  target/                          #   Interface graph, selector, element
  knowledge/                       #   Knowledge promotion, freshness, posture
  resolution/                      #   Precedence, pipeline, translation
  commitment/                      #   Execution stages, runtime agent, errors
  evidence/                        #   Receipt validation, run records
  governance/                      #   Auto-approval, trust policy, contradiction
  proposal/                        #   Cluster, quality, intelligence
  fitness/                         #   Failure modes, scorecard
  convergence/                     #   Bounds, FSM, finale, arrow
  improvement/                     #   Dogfood, speedrun, learning invariants
  drift/                           #   Execution coherence, rung drift, selector health
  graph/                           #   Graph topology, impact
  projection/                      #   Dashboard, binding distribution
  integration/                     #   Agentic loop, end-to-end pipeline
  architecture/                    #   Architecture fitness, domain stability, barrel
  dashboard/                       #   Flywheel, degradation, overlay geometry
```

---

## Migration Notes

This hierarchy reorganized ~738 TypeScript files. All phases are complete:

1. **Phase 0**: ~~Adopt the hierarchy as the target in documentation.~~ Done.
2. **Phase 1**: ~~Move `domain/types/` contents into primitive-specific directories.~~ Done — 33 flat files replaced with 31 bounded-context directories under `lib/domain/`.
3. **Phase 2**: ~~Group `application/` top-level files into primitive-specific subdirectories.~~ Done — 90+ flat files organized into 20 directories (agency, cache, catalog, cli, commitment, drift, governance, graph, improvement, intent, knowledge, learning, observation, paths, pipeline, projections, resilience, resolution, runtime-support, synthesis).
4. **Phase 3**: ~~Restructure `runtime/agent/` into `runtime/resolution/`.~~ Done — flattened intent/, resolution/, cache/ subdirs; renamed agent/ → resolution/ (22 files, flat).
5. **Phase 4**: ~~Reorganize tests by primitive.~~ Done — 143 flat test files moved into 20 domain-primitive subdirectories.
6. **Phase 5**: ~~Eliminate pure re-export stubs.~~ Done — all zero-consumer stubs deleted (domain/execution/index.ts, application/inspection/, application/intake/, application/preparation/, application/execution/). Kept runtime/resolve/, runtime/execute/, runtime/observe/ as legitimate bounded-context façades.
7. **Phase 6**: ~~Collapse single-export barrels and merge context stub files.~~ Complete — no single-export barrels remain; all barrels are bounded-context entry points with 2+ exports.

Build baseline: 88 pre-existing TS errors (unchanged). Test baseline: 2960 passing, 63 pre-existing failures (unchanged).
