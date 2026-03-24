# Domain Audit Architecture Plan

> **Three Dragons, One Interpretation Surface**
>
> A first-principles re-derivation of the domain ontology, master architecture,
> and typed seam contracts — from the perspective of interface intelligence,
> agentic intervention, and recursive self-improvement.

---

## Table of Contents

1. [Philosophical Foundation](#1-philosophical-foundation)
2. [The Three Dragons](#2-the-three-dragons)
3. [Cross-Dragon Protocols](#3-cross-dragon-protocols)
4. [Dragon 1: Interface Intelligence](#4-dragon-1-interface-intelligence)
5. [Dragon 2: Agent Workbench](#5-dragon-2-agent-workbench)
6. [Dragon 3: Recursive Improvement](#6-dragon-3-recursive-improvement)
7. [Meta-Dragons: Domain Alignment & Engineering Delight](#7-meta-dragons)
8. [External Agent Model](#8-external-agent-model)
9. [Performance Hyper-Parameters](#9-performance-hyper-parameters)
10. [New Type Artifacts](#10-new-type-artifacts)
11. [Law Tests](#11-law-tests)
12. [Updated Seams & Invariants](#12-updated-seams-and-invariants)
13. [Implementation Sequencing](#13-implementation-sequencing)
14. [Theoretical Framing](#14-theoretical-framing)

---

## 1. Philosophical Foundation

### The Bet

If a manual test is clear enough for QA to infer behavior, then a system can:
harvest relevant application reality, preserve selectors and state knowledge once,
lower the case into a grounded task packet, emit a normal-looking test, execute
with provenance-rich receipts, and learn without silently mutating canon.

### The Durable Asset

The durable asset is NOT the emitted test file. It is the shared model of
interface topology, behavioral state, and provenance — queryable by humans,
agents, and the system's own improvement loop.

### Three Non-Negotiable Commitments

1. **Canonical artifacts are source of truth.** Derived artifacts are projections.
   Deterministic compiler derivations are auto-approved. Certification is a
   designation on canon, not an execution gate.

2. **Confidence ≠ Governance.** Confidence describes how a binding was produced
   (human, agent-verified, agent-proposed, compiler-derived, intent-only, unbound).
   Governance describes whether a path is executable (approved, review-required,
   blocked). These are orthogonal dimensions with independent lifecycles.

3. **Provenance is part of correctness.** Every output must explain its inputs,
   its exhaustion trail, and its governance derivation. An opaque success is a
   modeling failure.

### Why "Three Dragons"

The compiler-only framing is insufficient. The system has three co-equal
architectural concerns that share one interpretation surface:

- **Dragon 1 (Interface Intelligence)**: Models what the UI IS — structure,
  selectors, states, transitions, affordances.
- **Dragon 2 (Agent Workbench)**: Models what operators and agents DO — discover,
  resolve, execute, observe, propose, approve, rerun, benchmark.
- **Dragon 3 (Recursive Improvement)**: Models how the system IMPROVES ITSELF —
  evaluate fitness, search parameter space, accept/reject changes, checkpoint.

Each dragon is a functor from a category of inputs to a category of outputs.
The natural transformation between them is the **Interpretation Surface** — the
shared contract all three consume and produce.

---

## 2. The Three Dragons

### Formal Definitions

Each dragon has an **aggregate root**, an **input category**, an **output
category**, and a **lifecycle FSM**.

#### Dragon 1: Interface Intelligence

| Aspect | Value |
|--------|-------|
| Aggregate root | `ApplicationInterfaceGraph` |
| Input category | Canonical knowledge artifacts (surfaces, elements, postures, hints, patterns, snapshots) |
| Output category | Normalized graph of routes, screens, surfaces, targets, selectors, states, transitions |
| Primary types | `SurfaceGraph`, `ScreenElements`, `SelectorCanon`, `SelectorProbe`, `StateNode`, `EventSignature`, `StateTransition`, `CanonicalTargetRef` |
| Type files | `lib/domain/types/interface.ts`, `lib/domain/derived-graph.ts` |
| Lifecycle | harvest → normalize → derive graph → fingerprint → yield to Dragon 2 |

#### Dragon 2: Agent Workbench

| Aspect | Value |
|--------|-------|
| Aggregate root | `InterventionLedger` (session + receipts) |
| Input category | `InterpretationSurface` + `Participant` |
| Output category | `InterventionReceipt[]` + `RunRecord` + `ProposalBundle` |
| Primary types | `Participant`, `InterventionReceipt`, `InterventionEffect`, `AgentSession`, `AgentEvent`, `ResolutionReceipt`, `StepExecutionReceipt`, `RunRecord` |
| Type files | `lib/domain/types/intervention.ts`, `lib/domain/types/session.ts`, `lib/domain/types/execution.ts` |
| Lifecycle | orient → inspect → resolve → execute → observe → propose → yield to Dragon 3 |

#### Dragon 3: Recursive Improvement

| Aspect | Value |
|--------|-------|
| Aggregate root | `ImprovementRun` |
| Input category | `PipelineFitnessReport` + `PipelineConfig` |
| Output category | `PipelineConfig'` + `AcceptanceDecision` + `Checkpoint` |
| Primary types | `ImprovementRun`, `ObjectiveVector`, `PipelineFitnessReport`, `PipelineFailureClass` (8 variants), `CandidateIntervention`, `AcceptanceDecision`, `ParetoFrontier`, `PipelineConfig` (15 tunable parameters) |
| Type files | `lib/domain/types/improvement.ts`, `lib/domain/types/fitness.ts`, `lib/domain/types/pipeline-config.ts`, `lib/domain/types/architecture-fitness.ts` |
| Lifecycle | classify failures → search knobs → generate candidates → accept/reject → checkpoint → yield to Dragon 1 |

### The Feedback Loop

```
Dragon 1 (Interface Intelligence)
  │
  │  InterfaceSnapshot: graph + selectors + state
  ▼
Dragon 2 (Agent Workbench)
  │
  │  FitnessSignal: classified failures + objective vector
  ▼
Dragon 3 (Recursive Improvement)
  │
  │  ConfigUpdate: new pipeline config + acceptance decision
  ▼
Dragon 1 (Interface Intelligence)  ← cycle restarts
```

Dragon 3's output (better config) improves Dragon 1's graph derivation quality,
which improves Dragon 2's resolution hit rate, which reduces Dragon 3's error
signal. This is a discrete-time feedback controller with convergence guarantees
(see §14).

---

## 3. Cross-Dragon Protocols

### The Handoff Envelope

Every dragon-to-dragon communication is wrapped in a typed envelope that extends
the existing `WorkflowEnvelope` discipline:

```typescript
interface DragonHandoff<TPayload> {
  readonly kind: 'dragon-handoff'
  readonly version: 1
  readonly source: DragonKind          // which dragon emitted
  readonly target: DragonKind          // which dragon consumes
  readonly phase: DragonPhase          // source dragon's lifecycle phase
  readonly fingerprint: string         // content-addressable
  readonly lineage: readonly string[]  // source artifact refs
  readonly governance: Governance      // max of source governance
  readonly payload: TPayload
}
```

### The Three Handoff Points

| Handoff | Source → Target | Payload Type | Seam |
|---------|----------------|--------------|------|
| H1 | D1 → D2 | `InterfaceSnapshot` (graph + selectors + state graph) | Seam 2 (Knowledge → Resolution) |
| H2 | D2 → D3 | `FitnessSignal` (classified failures + objective vector) | Seam 4 (Execution → Projection) |
| H3 | D3 → D1 | `ConfigUpdate` (new pipeline config + acceptance decision) | Seam 5 (Projection → Knowledge) |

### Invariants on Handoffs

1. **Governance monotonicity**: Governance cannot loosen through a handoff.
   If source dragon is `review-required`, handoff is at least `review-required`.
2. **Fingerprint derivation**: Handoff fingerprint is deterministically derived
   from payload content (SHA256 of stable JSON stringify).
3. **Lineage completeness**: Every handoff carries refs to all source artifacts
   that contributed to the payload.
4. **Phase ordering**: Source dragon must be in `yielding` phase to emit.
5. **Functor law**: `mapHandoffPayload(id) === id` and
   `mapHandoffPayload(f . g) === mapHandoffPayload(f) . mapHandoffPayload(g)`.

---

## 4. Dragon 1: Interface Intelligence

### What Exists Today

The interface intelligence spine is the most mature. Key type infrastructure:

- **`lib/domain/types/interface.ts`**: `ApplicationInterfaceGraph` with 11
  `InterfaceGraphNodeKind` variants (route, route-variant, screen, section,
  surface, target, snapshot-anchor, harvest-run, state, event-signature,
  transition) and 7 `InterfaceGraphEdgeKind` variants.
- **`lib/domain/derived-graph.ts`**: `GraphAccumulator` (immutable value object
  pattern for building `DerivedGraph`), `GraphNode`, `GraphEdge` with
  `addNode`/`addEdge`/`merge` operations.
- **`lib/domain/types/knowledge.ts`**: `SurfaceGraph`, `ScreenElements`,
  `ScreenHints`, `ScreenPostures`, `PatternDocument`, `MergedPatterns`,
  `StateNode`, `StateTransition`, `EventSignature`.
- **`lib/domain/types/resolution.ts`**: `GroundedStep` with full `StepGrounding`
  (targetRefs, selectorRefs, fallbackSelectorRefs, routeVariantRefs,
  assertionAnchors, effectAssertions, requiredStateRefs, forbiddenStateRefs,
  eventSignatureRefs, expectedTransitionRefs, resultStateRefs).
- **`lib/domain/grammar.ts`**: `deriveCapabilities()` walks surface graph +
  element sigs to compute available operations (navigate, enter, invoke,
  observe-state, observe-structure).

### Primitives (First-Principles Derivation)

The interface intelligence primitives derive from one axiom:
**an application is a directed graph of interactive contexts connected by
navigable transitions, where each context contains spatial regions of
semantically-identified interactive elements with behavioral dispositions.**

From this axiom:

| Primitive | What it models | Identity | Canonical source |
|-----------|---------------|----------|-----------------|
| **Route** | Entry point into application | `RouteId` | `knowledge/surfaces/` |
| **Screen** | Distinct interactive context | `ScreenId` | `knowledge/surfaces/`, `knowledge/screens/` |
| **Section** | Structural subdivision | `SectionId` | `knowledge/surfaces/` |
| **Surface** | Spatial region within section | `SurfaceId` | `knowledge/surfaces/` |
| **Element** | Discrete interactive unit | `ElementId` | `knowledge/screens/*.elements.yaml` |
| **CanonicalTargetRef** | Single semantic identity for any interactable/assertable thing | Branded string | Derived from element + surface + screen |
| **Posture** | Named behavioral disposition (valid, invalid, empty, boundary) | `PostureId` | `knowledge/screens/*.postures.yaml` |
| **Hint** | Screen-local supplement mapping human phrasing → machine concepts | — | `knowledge/screens/*.hints.yaml` |
| **Pattern** | Promoted cross-screen abstraction | — | `knowledge/patterns/*.yaml` |
| **Snapshot** | ARIA tree template for structural assertions | `SnapshotTemplateId` | `knowledge/snapshots/` |
| **SelectorProbe** | Concrete candidate for finding a target in the DOM | — | Derived/discovered |
| **SelectorCanon** | Durable working set of ranked probes per target | — | `.tesseract/interface/` |
| **StateNode** | Named interface state with semantic predicate | `StateNodeRef` | `knowledge/surfaces/` |
| **EventSignature** | Canonical action/effect contract for a target in a state | `EventSignatureRef` | `knowledge/surfaces/` |
| **StateTransition** | Typed edge: event applied to state yields new state + effects | `TransitionRef` | `knowledge/surfaces/` |

### Aggregate: `ApplicationInterfaceGraph`

The graph is the **single source of truth** for "what depends on what" in the
application under test. It unifies:

- Routes → Screens (navigation topology)
- Screens → Sections → Surfaces → Elements (containment)
- Elements → SelectorProbes (locator strategies)
- Elements → StateNodes (behavioral state)
- StateNodes → EventSignatures → StateTransitions (behavioral dynamics)
- Elements → SnapshotAnchors (structural assertions)

Every scenario step grounds against this graph. A change to one element's
selector propagates to all scenarios that reference that element's
`CanonicalTargetRef`. This is the "50th test costs less than the 1st" guarantee.

### Harvesting Lifecycle

Three phases, each deepening the graph:

1. **Baseline App Harvest**: Recursive discovery before scenario work. Populates
   routes, screens, surfaces, element signatures. No scenario context needed.
2. **Scenario Deepening**: ADO scenarios deepen only the surfaces they exercise.
   Adds state nodes, transitions, event signatures observed during execution.
3. **Canonical Promotion**: Only reviewable, evidence-backed improvements from
   the derived layer promote to canonical knowledge. Trust policy gates all
   promotions.

### What This Audit Adds to Dragon 1

1. **Dragon lifecycle tracking**: Dragon 1 gets a typed `DragonState` that
   tracks which phase of harvesting is active (dormant → ingesting → processing
   → yielding → complete).
2. **Handoff H1**: A typed `DragonHandoff<InterfaceSnapshot>` envelope carries
   the graph + selectors + state to Dragon 2, replacing the implicit coupling
   through `WorkspaceCatalog`.
3. **Graph-as-provenance**: Every graph node carries `source: 'approved-knowledge'
   | 'discovery' | 'derived-working'` — this is already modeled but the ontology
   document doesn't derive it from first principles.

---

## 5. Dragon 2: Agent Workbench

### What Exists Today

- **`lib/domain/types/intervention.ts`**: 13 `InterventionKind` variants
  (orientation, artifact-inspection, discovery-request, resolution-attempt,
  execution-run, evidence-recording, proposal-generation, approval-decision,
  rejection-decision, rerun-request, benchmark-run, replay-run,
  self-improvement-action). 12 `InterventionEffectKind` variants.
  `Participant` with `ParticipantKind` (agent, operator, system,
  benchmark-runner, reviewer, optimizer). 12 `ParticipantCapability` values.
- **`lib/domain/types/session.ts`**: `AgentSession` with 11 `AgentEventType`
  variants. `AgentEvent` envelope with typed payload.
- **`lib/domain/types/execution.ts`**: `ResolutionReceipt` (per-step resolution
  provenance), `StepExecutionReceipt` (per-step execution provenance with full
  timing decomposition), `RunRecord` (scenario execution aggregate with
  translation and execution metrics).
- **`lib/application/state-machine.ts`**: Generic `StateMachine<S,E,R>` —
  15-line recursive Effect loop for pure state transitions.

### Primitives (First-Principles Derivation)

The workbench primitives derive from one axiom:
**verification is a collaborative activity where typed participants perform
governed interventions against a shared interpretation surface, producing
receipts with provenance.**

| Primitive | What it models | Identity | Canonical source |
|-----------|---------------|----------|-----------------|
| **Participant** | Typed actor with capabilities and provenance | `participantId` | Session registration |
| **AgentSession** | Durable session envelope tracking participant work | `sessionId` | `.tesseract/sessions/` |
| **AgentEvent** | Typed session event (11 variants) | `eventId` | Session log |
| **InterventionReceipt** | Typed record of one action against the codebase | `interventionId` | `.tesseract/sessions/` |
| **InterventionEffect** | Observable side-effect of an intervention | — | Within receipt |
| **Scenario** | Canonical representation of one ADO test case | `AdoId` | `scenarios/` |
| **Step** | One instruction in a scenario | index | Within scenario |
| **Evidence** | Record of what runtime observed/attempted/proposed | `evidenceId` | `.tesseract/evidence/` |
| **Widget Contract** | Behavioral contract for a class of interactive elements | widget type | `knowledge/components/` |
| **Confidence Overlay** | Derived working knowledge from run receipts | — | `.tesseract/confidence/` |
| **Translation Receipt** | Typed record of structured translation stage | — | Within resolution |
| **RunRecord** | Execution aggregate for one scenario run | `runId` | `.tesseract/runs/` |
| **ResolutionReceipt** | Per-step resolution provenance (mode, winning source, exhaustion) | — | Within run |

### The Resolution Ladder (Precedence Law)

The core behavioral contract of Dragon 2 is the resolution precedence law:

```
1. explicit scenario fields           (highest precedence)
2. controls/resolution/*.resolution.yaml
3. approved screen knowledge + screen hints
4. approved-equivalent confidence overlays
5. shared patterns
6. structured translation
7. live DOM exploration (runtime agentic)
8. safe degraded resolution
9. needs-human                        (lowest precedence)
```

This is a **total ordering** that short-circuits at first match. It is
law-tested in `tests/precedence.laws.spec.ts` using seeded Mulberry32 PRNG
across 75-150 seeds, proving permutation invariance and exhaustion completeness.

### What This Audit Adds to Dragon 2

1. **External agent participants**: Claude Code, GitHub Copilot, CI runners,
   and human operators modeled as distinct `ExternalAgentParticipant` subtypes
   with declared tool capabilities (see §8).

2. **Intervention sagas**: Multi-step agentic workflows modeled as a sequence
   of typed receipts with compensation. When Claude Code reads context →
   analyzes → plans → applies → verifies → commits → pushes, each step is a
   `SagaStep` linked to an `InterventionReceipt` (see §8).

3. **Operator-as-improver**: When a human or agent improves the system itself
   (edits `lib/application/knob-search.ts`, tunes pipeline config, adds new
   knowledge), that act is itself a typed `OperatorImprovementIntervention`
   with before/after fitness reports. This closes the meta-loop: recursive
   self-improvement of the recursive self-improvement system.

4. **Handoff H2**: A typed `DragonHandoff<FitnessSignal>` carries classified
   failures + objective vector from Dragon 2 to Dragon 3.

---

## 6. Dragon 3: Recursive Improvement

### What Exists Today

- **`lib/domain/types/improvement.ts`**: `ImprovementRun` (governed optimization
  aggregate with substrate context, iterations, objective vectors, decisions,
  checkpoints). `ObjectiveVector` (pipelineFitness, architectureFitness,
  operatorCost). `CandidateIntervention`. `AcceptanceDecision`.
  `ImprovementSignal` (5 signal kinds: failure-mode, objective-delta,
  architecture-fitness, governance-pressure, operator-cost).
- **`lib/domain/types/fitness.ts`**: `PipelineFitnessReport` with 8
  `PipelineFailureClass` variants (knowledge-miss, selector-stale,
  selector-missing, translation-miss, widget-miss, precondition-fail,
  postcondition-fail, timeout). `ParetoFrontier` for multi-objective acceptance.
- **`lib/domain/types/pipeline-config.ts`**: 15 tunable parameters
  (selectorHealthThreshold, minEvidenceCount, translationConfidenceFloor,
  overlayScoreFloor, overlayDecayRate, evidenceRecencyBias, etc.).
  `validatePipelineConfig` enforces weight-sum ≈ 1.0 and bounds.
- **`lib/domain/types/architecture-fitness.ts`**: `ArchitectureFitnessReport`
  with layer violation counts, visitor coverage ratios, purity metrics,
  information efficiency.
- **`lib/application/knob-search.ts`**: Maps `PipelineFailureClass` → tunable
  parameter perturbations. Generates `PipelineConfig` candidates.
- **`lib/application/dogfood.ts`**: `runDogfoodLoop` — recursive fold over
  improvement iterations with convergence detection (currently a simple
  `converged: boolean` + `convergenceReason: string`).

### Primitives (First-Principles Derivation)

The improvement primitives derive from one axiom:
**a system that evaluates its own output against multi-objective fitness
criteria and adjusts its parameters within governed bounds will converge
toward Pareto-optimal operation, provided its error signal is a sufficient
statistic and its parameter space is bounded.**

| Primitive | What it models | Identity |
|-----------|---------------|----------|
| **ImprovementRun** | Governed optimization aggregate | `improvementRunId` |
| **ObjectiveVector** | Multi-objective measurement point | — |
| **PipelineFitnessReport** | "Gradient signal" — classified failures as tunable dimensions | — |
| **PipelineFailureClass** | 8 failure categories (the error signal's components) | discriminant tag |
| **PipelineConfig** | Parameter space (15 tunable knobs) | — |
| **CandidateIntervention** | Proposed parameter change with rationale and expected delta | `candidateId` |
| **AcceptanceDecision** | Governed acceptance/rejection with objective comparison | `decisionId` |
| **ParetoFrontier** | Multi-objective acceptance surface | — |
| **KnobSearch** | Failure-to-parameter mapping (the "backward pass") | — |
| **PipelineScorecard** | Monotonic high-water-mark tracker (13 metrics) | — |
| **ArchitectureFitnessReport** | Code-structural health metrics | — |
| **ImprovementSignal** | Typed trigger for improvement investigation | `signalId` |
| **ImprovementLoopIteration** | One cycle of the improvement loop | iteration number |

### The Improvement Cycle

```
classify(RunRecord) → PipelineFitnessReport
       │
       ▼
searchKnobs(FitnessReport, Config) → CandidateIntervention[]
       │
       ▼
evaluate(Candidates, ParetoFrontier) → AcceptanceDecision[]
       │
       ▼
checkpoint(AcceptedConfig, ObjectiveVector) → Checkpoint
       │
       ▼
converged?(ObjectiveHistory) → boolean
       │
       ├─ yes → stop, emit final ImprovementRun
       └─ no  → loop with new Config
```

### What This Audit Adds to Dragon 3

1. **Convergence FSM**: Replace the boolean `converged` + string
   `convergenceReason` with a proper state machine:

   ```
   initial → exploring → narrowing → plateau → converged
                ↘                      ↗
                  diverging ──────────
   ```

   Six phases with pure transition function. The sliding window of recent
   improvement rates is the discrete derivative of the error signal. The
   `epsilon` parameter is the dead-band width. See §10 for types.

2. **Performance hyper-parameters**: Alongside the existing 15 accuracy
   parameters, add efficiency parameters: compilation latency budget,
   resolution timeout, memory ceiling for graph accumulation, incremental
   rebuild threshold, parallelism degree, cache policy. These are distinct
   from fitness parameters (which tune accuracy); performance parameters
   tune throughput. See §9 for details.

3. **Extended objective vector**: `ExtendedObjectiveVector` adds
   `compilationLatencyMs`, `peakMemoryMb`, `cacheHitRate` alongside the
   existing `pipelineFitness`, `architectureFitness`, `operatorCost`. Pareto
   dominance extends naturally to the higher-dimensional space.

4. **Operator-as-improver context**: When the improvement loop is driven by
   an external agent (Claude Code doing a domain audit, a human tuning
   parameters), that operator gets a typed `OperatorImproverContext` with
   budget limits, fitness baseline, and intervention cap.

5. **Handoff H3**: A typed `DragonHandoff<ConfigUpdate>` carries the new
   pipeline config + acceptance decision from Dragon 3 back to Dragon 1.

---

## 7. Meta-Dragons

### Meta-Dragon A: Domain Alignment

**Axiom**: The ontology communicates the territory. File paths, type names,
and package boundaries are part of the product — not incidental to it.

**Measurable properties**:

| Metric | Definition | Target |
|--------|-----------|--------|
| Ontology coverage | % of types in `lib/domain/types/` mentioned in `docs/domain-ontology.md` | 100% |
| Path correspondence | Type name matches file path (e.g. `ImprovementRun` in `improvement.ts`) | 100% |
| Concept density | Average LOC per domain primitive | < 50 |
| Layer purity | Zero imports from application/infrastructure/runtime in `lib/domain/` | 0 violations |
| Exhaustive branching | All discriminated unions have fold functions in `visitors.ts` | 100% |

**Why this matters**: A new contributor should be able to navigate from
`domain-ontology.md` to the exact type file to the exact fold function
without grep. The codebase IS the documentation.

### Meta-Dragon B: Engineering Delight

**Axiom**: Developing this system should be a joy, not a chore. The type
system should prevent mistakes at compile time. The test suite should prove
properties, not just check examples.

**Measurable properties** (from `ArchitectureFitnessReport`):

| Metric | Definition | Target |
|--------|-----------|--------|
| Purity rate | % of domain functions that are pure | > 95% |
| Visitor coverage | % of discriminated unions with exhaustive fold | 100% |
| Envelope discipline | % of cross-boundary artifacts with standard envelope | 100% |
| Parameter exposure | % of tunable knobs surfaced in `PipelineConfig` | > 90% |
| Law test coverage | % of deterministic invariants with property-based tests | > 80% |
| FP compliance | Zero `let`, `push`, `for` in `lib/domain/` (enforced by ESLint) | 0 violations |

**Why this matters**: `ArchitectureFitnessReport` is already a first-class
type in the system. Meta-Dragon B means the system measures its own
engineering health as part of the improvement loop — Dragon 3 can propose
refactoring interventions when architecture fitness degrades.

---

## 8. External Agent Model

### The Gap

The current `ParticipantKind` has 6 values: `agent`, `operator`, `system`,
`benchmark-runner`, `reviewer`, `optimizer`. But Claude Code, GitHub Copilot,
CI runners, and human operators are not distinguished at the type level.
They share the same `kind: 'agent'` tag despite having fundamentally different
tool capabilities, context windows, and interaction patterns.

### External Agent Participant

A refined subtype of `Participant` that models concrete external agents:

```typescript
type ExternalAgentKind =
  | 'claude-code'       // Claude Code CLI — file read/edit/write, bash, search
  | 'github-copilot'    // GitHub Copilot — code suggestions, PR review
  | 'ci-runner'         // CI pipeline — headless execution, reporting
  | 'human-operator'    // Human — full capability, slow, expensive
  | 'custom-agent'      // Extension point for future agents

interface ExternalAgentParticipant extends Participant {
  readonly kind: 'agent'
  readonly agentKind: ExternalAgentKind
  readonly toolCapabilities: readonly AgentToolCapability[]
  readonly sessionRef?: string | null
  readonly providerVersion?: string | null
}
```

### Tool Capabilities

```typescript
type AgentToolCapability =
  | 'read-file'        // read filesystem
  | 'edit-file'        // modify existing files
  | 'write-file'       // create new files
  | 'run-command'       // execute shell commands
  | 'search-codebase'  // glob/grep/semantic search
  | 'run-tests'        // execute test suite
  | 'create-commit'    // git commit
  | 'create-pr'        // create pull request
  | 'review-pr'        // review pull request
  | 'approve-proposal' // approve a trust-policy proposal
  | 'reject-proposal'  // reject a proposal
  | 'run-pipeline'     // trigger CI pipeline
  | 'inspect-artifact' // read and analyze artifacts
  | 'orient-workspace' // discover workspace structure
```

### Capability Profiles by Agent Kind

| Agent Kind | Key Capabilities | Constraints |
|-----------|-----------------|-------------|
| `claude-code` | read-file, edit-file, write-file, run-command, search-codebase, run-tests, create-commit, create-pr, inspect-artifact, orient-workspace | Context window bounded; no persistent memory between sessions |
| `github-copilot` | read-file, review-pr, inspect-artifact | Suggestion-only; cannot directly edit without human confirmation |
| `ci-runner` | run-command, run-tests, run-pipeline, inspect-artifact | Headless; no approval capability; no-write in batch mode |
| `human-operator` | ALL capabilities | Slow, expensive; should be last resort after machine paths exhausted |
| `custom-agent` | Declared per-instance | Validated against declared capabilities at intervention time |

### Intervention Sagas

When an external agent performs a multi-step workflow (e.g., Claude Code doing
this domain audit), the workflow is modeled as an **Intervention Saga** — a
governed sequence of typed steps with compensation on failure.

```typescript
type SagaStepKind =
  | 'read-context'      // orient, read files, understand state
  | 'analyze'           // reason about artifacts, identify gaps
  | 'plan-changes'      // plan what to modify
  | 'apply-changes'     // edit/write files
  | 'verify-changes'    // run tests, check types
  | 'commit'            // git commit
  | 'push'              // git push
  | 'create-pr'         // create pull request
  | 'await-review'      // wait for human/agent review
  | 'compensate'        // undo previous steps on failure

interface InterventionSaga {
  readonly kind: 'intervention-saga'
  readonly version: 1
  readonly sagaId: string
  readonly participantRef: ParticipantRef
  readonly agentKind: ExternalAgentKind
  readonly intent: string                          // human-readable goal
  readonly governance: Governance
  readonly steps: readonly SagaStep[]
  readonly currentStepIndex: number
  readonly status: 'running' | 'completed' | 'failed' | 'compensating'
  readonly interventionReceipts: readonly InterventionReceipt[]
  readonly startedAt: string
  readonly completedAt: string | null
}
```

Each `SagaStep` links to an `InterventionReceipt` via `interventionId`,
maintaining the existing receipt discipline. The saga follows the **Saga
pattern** from distributed systems: if step N fails, steps 0..N-1 that have
compensation steps are compensated in reverse order.

### Operator-as-Improver

The meta-loop closure: when a human or agent improves the system itself, that
act is typed as an `OperatorImprovementIntervention`:

```typescript
interface OperatorImprovementIntervention {
  readonly kind: 'operator-improvement'
  readonly version: 1
  readonly participantRef: ParticipantRef
  readonly agentKind: ExternalAgentKind
  readonly saga: InterventionSaga
  readonly improvementRunRef: string | null       // links to ImprovementRun
  readonly objectivesTargeted: readonly (keyof ObjectiveVector)[]
  readonly filesChanged: readonly string[]
  readonly testsRun: readonly string[]
  readonly fitnessReportBefore: PipelineFitnessReport | null
  readonly fitnessReportAfter: PipelineFitnessReport | null
}
```

This means: when Claude Code edits `lib/application/knob-search.ts` to improve
the pipeline's failure classification, that intervention is tracked with
before/after fitness reports. Dragon 3 can analyze the delta and learn which
kinds of operator interventions are most effective.

### Patterns Applied

- **Saga** (distributed systems): Multi-step workflow with compensation
- **Strategy** (GoF): `ExternalAgentKind` determines available tools; resolution
  of "how to apply a change" varies by agent kind
- **Visitor/Fold** (GoF): `foldExternalAgentKind`, `foldSagaStepKind`,
  `foldSagaStepStatus` — exhaustive case analysis
- **State Machine** (GoF): Saga lifecycle (running → completed | failed →
  compensating) as pure FSM, consumable by the generic `StateMachine<S,E,R>`
  in `lib/application/state-machine.ts`

---

## 9. Performance Hyper-Parameters

### The Gap

The existing `PipelineConfig` has 15 parameters — all tuning **accuracy**
(selector health, evidence counts, confidence thresholds, translation floors,
decay rates). There are zero parameters tuning **efficiency** (latency, memory,
parallelism, caching). This means Dragon 3 can optimize for quality but not
for speed.

### Performance Config

```typescript
interface PerformanceConfig {
  readonly compilationLatencyBudgetMs: number      // max ms for full compilation
  readonly resolutionTimeoutMs: number             // max ms per step resolution
  readonly graphAccumulationMemoryCeilingMb: number // max MB for graph building
  readonly incrementalRebuildThreshold: number     // min fingerprint diff ratio to trigger rebuild
  readonly effectParallelismDegree: number         // max concurrent Effect fibers
  readonly cacheEvictionPolicy: 'lru' | 'lfu' | 'ttl'
  readonly cacheMaxEntries: number
  readonly cacheTtlMs: number
}
```

### Defaults

```typescript
const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  compilationLatencyBudgetMs: 30_000,              // 30 seconds
  resolutionTimeoutMs: 5_000,                      // 5 seconds per step
  graphAccumulationMemoryCeilingMb: 512,           // 512 MB
  incrementalRebuildThreshold: 0.05,               // 5% fingerprint diff
  effectParallelismDegree: 4,                      // 4 concurrent fibers
  cacheEvictionPolicy: 'lru',                      // least recently used
  cacheMaxEntries: 1024,                           // 1K cache entries
  cacheTtlMs: 300_000,                             // 5 minutes TTL
}
```

### Extended Objective Vector

```typescript
interface ExtendedObjectiveVector extends ObjectiveVector {
  readonly compilationLatencyMs: number    // lower is better
  readonly peakMemoryMb: number            // lower is better
  readonly cacheHitRate: number            // higher is better (0..1)
}
```

This extends the existing `ObjectiveVector` (pipelineFitness,
architectureFitness, operatorCost) with three efficiency dimensions. Pareto
dominance extends naturally: candidate A dominates candidate B iff A is ≥ B on
all dimensions and strictly > on at least one.

### Validation

`validatePerformanceConfig(config: PerformanceConfig): readonly string[]`
follows the same pattern as `validatePipelineConfig`:

- All numeric fields must be positive
- `incrementalRebuildThreshold` must be in `[0, 1]`
- `cacheEvictionPolicy` must be one of the three valid values
- `effectParallelismDegree` must be ≥ 1

### Integration with Dragon 3

The knob search expands to consider performance parameters alongside accuracy
parameters. When the fitness report shows `timeout` failures, the knob search
can propose increasing `resolutionTimeoutMs`. When compilation latency exceeds
budget, it can propose increasing `effectParallelismDegree` or adjusting
`incrementalRebuildThreshold`.

---

## 10. New Type Artifacts

### Artifact 1: `lib/domain/types/dragon.ts` (NEW)

```typescript
// ── Dragon discriminant ──

export type DragonKind =
  | 'interface-intelligence'
  | 'agent-workbench'
  | 'recursive-improvement'

// ── Dragon lifecycle FSM ──

export type DragonPhase =
  | 'dormant'      // not yet activated for this run
  | 'ingesting'    // consuming inputs
  | 'processing'   // executing primary computation
  | 'yielding'     // producing outputs for other dragons
  | 'complete'     // done for this cycle

export interface DragonState {
  readonly dragon: DragonKind
  readonly phase: DragonPhase
  readonly cycleNumber: number
  readonly inputFingerprint: string | null
  readonly outputFingerprint: string | null
  readonly handoffsEmitted: number
  readonly handoffsConsumed: number
}

export type DragonTransition =
  | { readonly kind: 'activate'; readonly inputFingerprint: string }
  | { readonly kind: 'advance' }
  | { readonly kind: 'yield-output'; readonly outputFingerprint: string }
  | { readonly kind: 'complete' }

// Pure transition function — the FSM kernel
export function stepDragonPhase(
  state: DragonState,
  transition: DragonTransition
): DragonState {
  // ... deterministic, law-testable, no side effects
}

// ── Cross-dragon handoff ──

export interface DragonHandoff<TPayload> {
  readonly kind: 'dragon-handoff'
  readonly version: 1
  readonly source: DragonKind
  readonly target: DragonKind
  readonly phase: DragonPhase
  readonly fingerprint: string
  readonly lineage: readonly string[]
  readonly governance: Governance
  readonly payload: TPayload
}

export function mapHandoffPayload<A, B>(
  handoff: DragonHandoff<A>,
  f: (a: A) => B
): DragonHandoff<B> {
  // Preserves functor laws: map(id) === id, map(f . g) === map(f) . map(g)
}

// ── Fold functions (exhaustive case analysis) ──

export function foldDragonKind<R>(
  kind: DragonKind,
  cases: {
    readonly interfaceIntelligence: () => R
    readonly agentWorkbench: () => R
    readonly recursiveImprovement: () => R
  }
): R

export function foldDragonPhase<R>(
  phase: DragonPhase,
  cases: {
    readonly dormant: () => R
    readonly ingesting: () => R
    readonly processing: () => R
    readonly yielding: () => R
    readonly complete: () => R
  }
): R
```

### Artifact 2: `lib/domain/types/external-agent.ts` (NEW)

```typescript
export type ExternalAgentKind =
  | 'claude-code'
  | 'github-copilot'
  | 'ci-runner'
  | 'human-operator'
  | 'custom-agent'

export type AgentToolCapability =
  | 'read-file' | 'edit-file' | 'write-file'
  | 'run-command' | 'search-codebase' | 'run-tests'
  | 'create-commit' | 'create-pr' | 'review-pr'
  | 'approve-proposal' | 'reject-proposal'
  | 'run-pipeline' | 'inspect-artifact' | 'orient-workspace'

export interface ExternalAgentParticipant extends Participant {
  readonly kind: 'agent'
  readonly agentKind: ExternalAgentKind
  readonly toolCapabilities: readonly AgentToolCapability[]
  readonly sessionRef?: string | null
  readonly providerVersion?: string | null
}

export type SagaStepKind =
  | 'read-context' | 'analyze' | 'plan-changes'
  | 'apply-changes' | 'verify-changes' | 'commit'
  | 'push' | 'create-pr' | 'await-review' | 'compensate'

export type SagaStepStatus =
  | 'pending' | 'running' | 'completed' | 'failed' | 'compensated'

export interface SagaStep {
  readonly stepId: string
  readonly kind: SagaStepKind
  readonly status: SagaStepStatus
  readonly interventionId: string | null
  readonly toolsUsed: readonly AgentToolCapability[]
  readonly startedAt: string | null
  readonly completedAt: string | null
  readonly artifactPaths: readonly string[]
  readonly compensationStepId: string | null
}

export interface InterventionSaga {
  readonly kind: 'intervention-saga'
  readonly version: 1
  readonly sagaId: string
  readonly participantRef: ParticipantRef
  readonly agentKind: ExternalAgentKind
  readonly intent: string
  readonly governance: Governance
  readonly steps: readonly SagaStep[]
  readonly currentStepIndex: number
  readonly status: 'running' | 'completed' | 'failed' | 'compensating'
  readonly interventionReceipts: readonly InterventionReceipt[]
  readonly startedAt: string
  readonly completedAt: string | null
}

export interface OperatorImprovementIntervention {
  readonly kind: 'operator-improvement'
  readonly version: 1
  readonly participantRef: ParticipantRef
  readonly agentKind: ExternalAgentKind
  readonly saga: InterventionSaga
  readonly improvementRunRef: string | null
  readonly objectivesTargeted: readonly (keyof ObjectiveVector)[]
  readonly filesChanged: readonly string[]
  readonly testsRun: readonly string[]
  readonly fitnessReportBefore: PipelineFitnessReport | null
  readonly fitnessReportAfter: PipelineFitnessReport | null
}

// ── Fold functions ──

export function foldExternalAgentKind<R>(
  kind: ExternalAgentKind,
  cases: {
    readonly claudeCode: () => R
    readonly githubCopilot: () => R
    readonly ciRunner: () => R
    readonly humanOperator: () => R
    readonly customAgent: () => R
  }
): R

export function foldSagaStepKind<R>(kind: SagaStepKind, cases: { ... }): R
export function foldSagaStepStatus<R>(status: SagaStepStatus, cases: { ... }): R
```

### Artifact 3: Extensions to `lib/domain/types/improvement.ts`

New types added (backward-compatible, no breaking changes):

```typescript
// ── Convergence FSM ──

export type ConvergencePhase =
  | 'initial'       // no iterations yet
  | 'exploring'     // objective improving, not yet stable
  | 'narrowing'     // improvement rate decreasing
  | 'plateau'       // below epsilon for N consecutive iterations
  | 'converged'     // stable; further iterations unlikely to help
  | 'diverging'     // objective worsening

export interface ConvergenceState {
  readonly phase: ConvergencePhase
  readonly iterationsSinceLastImprovement: number
  readonly cumulativeImprovementRate: number
  readonly recentImprovementRates: readonly number[]  // sliding window
  readonly plateauLength: number
  readonly epsilon: number                             // convergence threshold
  readonly windowSize: number
}

export type ConvergenceEvent =
  | { readonly kind: 'iteration-completed'; readonly improvementRate: number }
  | { readonly kind: 'regression-detected'; readonly magnitude: number }
  | { readonly kind: 'budget-exhausted' }
  | { readonly kind: 'manual-stop' }

export function stepConvergence(
  state: ConvergenceState,
  event: ConvergenceEvent
): ConvergenceState {
  // Pure FSM transition — deterministic, law-testable
}

export function foldConvergencePhase<R>(
  phase: ConvergencePhase,
  cases: { ... }
): R

// ── Performance Config ──

export interface PerformanceConfig {
  readonly compilationLatencyBudgetMs: number
  readonly resolutionTimeoutMs: number
  readonly graphAccumulationMemoryCeilingMb: number
  readonly incrementalRebuildThreshold: number
  readonly effectParallelismDegree: number
  readonly cacheEvictionPolicy: 'lru' | 'lfu' | 'ttl'
  readonly cacheMaxEntries: number
  readonly cacheTtlMs: number
}

export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = { ... }

export function validatePerformanceConfig(
  config: PerformanceConfig
): readonly string[]

// ── Extended Objectives ──

export interface ExtendedObjectiveVector extends ObjectiveVector {
  readonly compilationLatencyMs: number
  readonly peakMemoryMb: number
  readonly cacheHitRate: number
}

// ── Operator-as-Improver ──

export interface OperatorImproverContext {
  readonly participantRef: ParticipantRef
  readonly agentKind: ExternalAgentKind
  readonly currentObjectiveVector: ObjectiveVector
  readonly targetObjectiveVector: Partial<ObjectiveVector>
  readonly interventionBudget: number
  readonly fitnessBaseline: PipelineFitnessReport
}
```

### Artifact 4: Extensions to `ImprovementRun`

Add optional fields (backward-compatible):

```typescript
interface ImprovementRun {
  // ... existing fields unchanged ...
  readonly performanceConfig?: PerformanceConfig
  readonly convergenceState?: ConvergenceState
  readonly operatorContext?: OperatorImproverContext
}
```

### Artifact 5: Extensions to `lib/domain/visitors.ts`

Add fold functions for all new discriminated unions:
- `foldDragonKind`
- `foldDragonPhase`
- `foldExternalAgentKind`
- `foldSagaStepKind`
- `foldSagaStepStatus`
- `foldConvergencePhase`

All follow the existing pattern: exhaustive case analysis via object-of-functions,
TypeScript compiler enforces completeness.

### Artifact 6: Extensions to `lib/domain/identity.ts`

New branded IDs:
- `SagaId` — branded string for saga identification
- `DragonHandoffId` — branded string for handoff identification

---

## 11. Law Tests

All law tests follow the established pattern in the codebase: seeded Mulberry32
PRNG, 75-150 seeds, proving properties for ALL valid inputs rather than spot
examples.

### Test File 1: `tests/dragon-interaction.laws.spec.ts`

**Pattern source**: `tests/precedence.laws.spec.ts`

| Law | Property | Seeds |
|-----|----------|-------|
| Dragon phase determinism | Same `(state, transition)` → same next state | 150 |
| Phase ordering | `dormant → ingesting → processing → yielding → complete` is the only valid forward path; no skipping | 100 |
| Handoff functor identity | `mapHandoffPayload(x, id) === x` | 100 |
| Handoff functor composition | `mapHandoffPayload(x, f ∘ g) === mapHandoffPayload(mapHandoffPayload(x, g), f)` | 100 |
| Governance monotonicity | Handoff governance is ≥ source governance (cannot loosen) | 150 |
| Cross-dragon fingerprint stability | Same inputs → same handoff fingerprint across all seeds | 150 |
| Cycle number monotonicity | `cycleNumber` never decreases through transitions | 100 |

### Test File 2: `tests/external-agent.laws.spec.ts`

**Pattern source**: `tests/visitors.laws.spec.ts`

| Law | Property | Seeds |
|-----|----------|-------|
| Saga step ordering | Steps execute in declared index order; no skipping unless prior step failed | 100 |
| Compensation completeness | Failed saga compensates all prior completed steps that have compensationStepId | 100 |
| Saga governance derivation | Saga governance = max governance of contained steps | 150 |
| Capability soundness | Agent cannot use tool not in its declared `toolCapabilities` | 100 |
| Fold exhaustiveness | `foldExternalAgentKind`, `foldSagaStepKind`, `foldSagaStepStatus` cover all variants | 50 |
| Operator improvement fitness consistency | If `fitnessReportAfter` dominates `fitnessReportBefore` on all objectives, verdict is `accepted` | 100 |

### Test File 3: `tests/convergence-fsm.laws.spec.ts`

**Pattern source**: `tests/pipeline-fitness.laws.spec.ts`

| Law | Property | Seeds |
|-----|----------|-------|
| Phase transition determinism | Same `(state, event)` → same next state | 150 |
| Phase reachability | Every phase is reachable from `initial` via some event sequence | 50 |
| Convergence absorbing | Once `converged`, no transition returns to `exploring` (absorbing state) | 100 |
| Divergence detection | Known regression sequences (negative improvement for windowSize iterations) always reach `diverging` | 100 |
| Sliding window size | Window maintains exactly `windowSize` entries after `windowSize` iterations | 100 |
| Plateau detection | If improvement rate < epsilon for plateauLength consecutive iterations, phase = `plateau` | 100 |
| Fold exhaustiveness | `foldConvergencePhase` covers all 6 variants | 50 |

### Test File 4: `tests/performance-config.laws.spec.ts`

**Pattern source**: `tests/pipeline-fitness.laws.spec.ts`

| Law | Property | Seeds |
|-----|----------|-------|
| Default config valid | `validatePerformanceConfig(DEFAULT_PERFORMANCE_CONFIG)` returns empty array | 1 |
| Scalar bounds | All numeric fields positive; threshold in [0,1]; parallelism ≥ 1 | 150 |
| Merge associativity | `merge(merge(a,b),c) === merge(a,merge(b,c))` if merge is defined | 100 |
| Extended Pareto consistency | If A dominates B on base `ObjectiveVector`, and A.perf === B.perf, then A dominates B on `ExtendedObjectiveVector` | 100 |
| Validation round-trip | `validate(validate(x))` returns same errors as `validate(x)` | 100 |

---

## 12. Updated Seams and Invariants

Three new seams added to the existing five in `docs/seams-and-invariants.md`.

### Seam 6: Dragon-to-Dragon Handoffs

**What crosses**: Dragon outputs wrapped in `DragonHandoff<TPayload>` envelopes.

**Contract types**:
- H1 (D1→D2): `DragonHandoff<InterfaceSnapshot>` — graph + selectors + state
- H2 (D2→D3): `DragonHandoff<FitnessSignal>` — classified failures + objective vector
- H3 (D3→D1): `DragonHandoff<ConfigUpdate>` — new config + acceptance decision

**Invariants**:
1. Governance monotonicity — handoff governance ≥ max(source, target) dragon governance
2. Fingerprint derivation — deterministic from payload (SHA256 of stable JSON)
3. Lineage completeness — every handoff carries refs to all contributing source artifacts
4. Phase ordering — source dragon must be in `yielding` phase to emit a handoff
5. Functor laws — `mapHandoffPayload` preserves identity and composition

**Effect pattern**: Handoffs are pure values. They are created in `lib/domain/`
and consumed in `lib/application/` via Effect-based orchestration.

**Law tests**: `tests/dragon-interaction.laws.spec.ts`

### Seam 7: External Agent Interventions

**What crosses**: `InterventionSaga` envelopes from external agents.

**Contract types**:
- Input: `ExternalAgentParticipant` + `InterventionSaga`
- Output: `InterventionReceipt[]` + `SagaStep[]` + filesystem mutations

**Invariants**:
1. Capability soundness — agent cannot use tools outside declared capability set
2. Compensation completeness — failed sagas compensate all prior completed steps
3. Receipt completeness — every completed saga step produces an `InterventionReceipt`
4. Governance derivation — saga governance is deterministic from step outcomes
5. Profile constraints — `ci-batch` agents cannot approve proposals; only `dogfood`
   and `interactive` profiles can exercise `approve-proposal` capability

**Effect pattern**: Saga execution uses the generic `StateMachine<S,E,R>` from
`lib/application/state-machine.ts`. Each step transition is a pure function;
the Effect layer handles filesystem and external I/O.

**Law tests**: `tests/external-agent.laws.spec.ts`

### Seam 8: Performance Tuning Surface

**What crosses**: `PerformanceConfig` alongside `PipelineConfig` in improvement runs.

**Contract types**:
- Input: `PerformanceConfig` + `PipelineConfig`
- Output: `ExtendedObjectiveVector` with performance metrics

**Invariants**:
1. Config validation — `validatePerformanceConfig` is round-trip safe
2. Config merge associativity — if merge is defined
3. Extended Pareto consistency — Pareto dominance on `ExtendedObjectiveVector`
   is consistent with base `ObjectiveVector` comparison
4. Budget enforcement — compilation latency exceeding budget triggers
   `timeout` failure class in fitness report

**Effect pattern**: Performance measurement wraps existing Effect-based
compilation/resolution with timing and memory instrumentation. No changes to
pure domain code.

**Law tests**: `tests/performance-config.laws.spec.ts`

---

## 13. Implementation Sequencing

### Phase A: Foundation Types (pure domain, no behavioral changes)

| Step | File | Action | Dependencies |
|------|------|--------|-------------|
| A1 | `lib/domain/types/dragon.ts` | Create: DragonKind, DragonPhase, DragonState, DragonTransition, DragonHandoff, stepDragonPhase, mapHandoffPayload, foldDragonKind, foldDragonPhase | None |
| A2 | `lib/domain/types/external-agent.ts` | Create: ExternalAgentKind, AgentToolCapability, ExternalAgentParticipant, SagaStep, InterventionSaga, OperatorImprovementIntervention, fold functions | `intervention.ts` (imports Participant, ParticipantRef) |
| A3 | `lib/domain/visitors.ts` | Add fold functions for new discriminated unions | A1, A2 |
| A4 | `lib/domain/identity.ts` | Add `SagaId`, `DragonHandoffId` branded types | None |

### Phase B: Extend Existing Types (backward-compatible additions)

| Step | File | Action | Dependencies |
|------|------|--------|-------------|
| B1 | `lib/domain/types/improvement.ts` | Add ConvergencePhase, ConvergenceState, ConvergenceEvent, stepConvergence, foldConvergencePhase, PerformanceConfig, DEFAULT_PERFORMANCE_CONFIG, validatePerformanceConfig, ExtendedObjectiveVector, OperatorImproverContext | A2 (imports ExternalAgentKind) |
| B2 | `lib/domain/types/improvement.ts` | Add optional fields to ImprovementRun (performanceConfig, convergenceState, operatorContext) | B1 |
| B3 | `lib/domain/types/index.ts` | Re-export new types from dragon.ts and external-agent.ts | A1, A2 |

### Phase C: Law Tests

| Step | File | Action | Dependencies |
|------|------|--------|-------------|
| C1 | `tests/dragon-interaction.laws.spec.ts` | Write 7 law tests for dragon lifecycle and handoff contracts | A1 |
| C2 | `tests/external-agent.laws.spec.ts` | Write 6 law tests for saga and capability contracts | A2 |
| C3 | `tests/convergence-fsm.laws.spec.ts` | Write 7 law tests for convergence FSM properties | B1 |
| C4 | `tests/performance-config.laws.spec.ts` | Write 5 law tests for performance config validation | B1 |

### Phase D: Documentation

| Step | File | Action | Dependencies |
|------|------|--------|-------------|
| D1 | `docs/domain-ontology.md` | Major rewrite: restructure into Three Dragons framing, re-derive all primitives from first principles, add cross-dragon concepts, add meta-dragons | A1-B3 (needs to reference new types) |
| D2 | `docs/master-architecture.md` | Add sections: The Three Dragons, Cross-Dragon Protocols, Meta-Dragons as NFRs, Performance Tuning Surface, reframe phased program | A1-B3 |
| D3 | `docs/seams-and-invariants.md` | Add Seams 6-8 (dragon handoffs, external agents, performance) | A1-B3, C1-C4 |

### Phase E: Application Layer Integration (future, after plan approval)

| Step | File | Action | Dependencies |
|------|------|--------|-------------|
| E1 | `lib/application/speedrun.ts` | Wire `DragonState` tracking into pipeline orchestration | A1, D1-D3 |
| E2 | `lib/application/improvement.ts` | Wire `ConvergenceState` FSM (replace boolean convergence) | B1-B2 |
| E3 | `lib/application/dogfood.ts` | Wire `InterventionSaga` execution and `OperatorImproverContext` | A2, B1-B2 |
| E4 | `lib/composition/layers.ts` | Add layer for `PerformanceConfig` service | B1 |

### Critical Path

```
A1 ──┬── A3 ── B3 ── D1, D2, D3
     │
A2 ──┤
     │
A4 ──┘

B1 ── B2 ── C3, C4

A1 ── C1
A2 ── C2

(D1-D3 can proceed in parallel once A1-B3 are done)
(C1-C4 can proceed in parallel once their respective type deps are done)
(E1-E4 are future work after approval)
```

### Estimated Artifact Count

| Category | Count |
|----------|-------|
| New type files | 2 (`dragon.ts`, `external-agent.ts`) |
| Modified type files | 2 (`improvement.ts`, `identity.ts`) |
| Modified support files | 2 (`visitors.ts`, `types/index.ts`) |
| New test files | 4 |
| Modified doc files | 3 (`domain-ontology.md`, `master-architecture.md`, `seams-and-invariants.md`) |
| **Total files touched** | **13** |

---

## 14. Theoretical Framing

### Category-Theoretic

Each dragon is a **functor** from its input category to its output category:

- D1: `Kn → Graph` (knowledge artifacts → interface graph)
- D2: `Graph × Part → Ledger` (graph + participant → intervention ledger)
- D3: `Ledger × Config → Config'` (ledger + config → better config)

The **natural transformation** between dragons is the `InterpretationSurface`:
the shared contract that makes `D2 ∘ D1` and `D3 ∘ D2 ∘ D1` coherent.

The `DragonHandoff` envelope is a **morphism** in the category of dragons.
The functor laws on `mapHandoffPayload` are law-testable:
- Identity: `map(id) = id`
- Composition: `map(f ∘ g) = map(f) ∘ map(g)`

### Information-Theoretic

- **Dragon 1** compresses: `|ApplicationInterfaceGraph| << |raw DOM|`
  The graph is a sufficient statistic for resolution — it preserves all
  information needed for scenario binding while discarding DOM noise.

- **Dragon 2** channels: Resolution path entropy =
  `-Σ p_rung × log(p_rung)` where `p_rung` is the fraction of steps won
  by each rung. A healthy system has low entropy (most steps resolved by
  deterministic rungs). High entropy means the system is guessing.

- **Dragon 3** minimizes: The fitness report is a sufficient statistic of
  pipeline performance. The knob search finds the minimum description length
  encoding of "what to change" — the smallest config perturbation that
  improves the objective vector.

### Control-Theoretic

Dragon 3 is a **discrete-time feedback controller**:

- **Plant**: the pipeline (takes config, produces fitness)
- **Sensor**: the fitness report (measures output quality)
- **Controller**: the knob search (maps error signal to parameter adjustment)
- **Reference**: the target objective vector
- **Error signal**: `ObjectiveVector_target - ObjectiveVector_actual`
- **Stability**: convergence = error signal magnitude bounded and monotonically
  decreasing (formalized by `ConvergencePhase` FSM)
- **Overshoot**: `diverging` phase = error signal increased after parameter change
- **Dead band**: `epsilon` parameter defines minimum detectable improvement
- **BIBO stability**: bounded input (finite scenarios) produces bounded output
  (finite fitness report with bounded metric values)

The `ConvergencePhase` type encodes the controller's operating regime:
- `initial` → system not yet characterized
- `exploring` → error signal decreasing, rate unknown
- `narrowing` → error signal decreasing, rate decreasing (approaching minimum)
- `plateau` → error signal stable within dead band
- `converged` → absorbing state, controller stops
- `diverging` → instability detected, controller backs off

### Game-Theoretic

Multi-agent interactions (Claude Code + human operator + CI runner) form a
**cooperative game** where:

- **Players**: external agents with private information (context window contents,
  tool capabilities, session state)
- **Objective**: maximize `ObjectiveVector` (shared, not adversarial)
- **Mechanism design**: Trust policy prevents unilateral canonical mutation.
  The saga model coordinates agent actions. Capability declarations prevent
  agents from exceeding their authority.
- **Information asymmetry**: Each agent sees different artifacts. The
  `InterventionReceipt` makes private observations public. The
  `OperatorImprovementIntervention` makes meta-level actions observable.

### Saga Composition (Distributed Systems)

The `InterventionSaga` follows the **Saga pattern** from distributed systems:

- Each step is a **local transaction** (read, analyze, apply, verify, commit)
- Each step has a **compensating transaction** (undo, revert, rollback)
- On failure, compensation runs in **reverse order** for all completed steps
- The saga is **eventually consistent** — intermediate states are visible but
  the end state is either fully completed or fully compensated

This maps naturally to how Claude Code operates:
1. Read context (compensation: none, read-only)
2. Analyze artifacts (compensation: none, read-only)
3. Plan changes (compensation: none, planning-only)
4. Apply changes (compensation: `git checkout -- <files>`)
5. Verify changes (compensation: none, read-only)
6. Commit (compensation: `git reset HEAD~1`)
7. Push (compensation: `git push --force-with-lease` to prior ref)
8. Create PR (compensation: close PR)

### GoF Pattern Inventory

| Pattern | Where Applied | Dragon |
|---------|--------------|--------|
| **Strategy** | Resolution ladder, pipeline phases, dragon projection | D2, D3 |
| **Visitor/Fold** | All discriminated unions (`foldDragonKind`, `foldConvergencePhase`, `foldExternalAgentKind`, etc.) | All |
| **Composite** | Scoring rules, validation rules, pipeline phases with `combine`/`contramap` | D3 |
| **State Machine** | Dragon lifecycle, saga lifecycle, convergence FSM — all consumed by generic `StateMachine<S,E,R>` | All |
| **Interpreter** | Compilation phases, resolution pipeline — each phase is pure input→output with provenance | D1, D2 |
| **Envelope** | `WorkflowEnvelope`, `DragonHandoff`, `InterventionSaga` — standard header discipline | All |
| **Saga** | `InterventionSaga` — multi-step workflow with compensation | D2 |
| **Functor** | `mapHandoffPayload`, `mapPayload` — structure-preserving payload transformation | All |

### FP Technique Inventory

| Technique | Where Applied |
|-----------|--------------|
| **Phantom branded types** | `Approved<T>`, `Blocked<T>`, `ReviewRequired<T>` — governance at type level |
| **Recursive folds** | `stepDragonPhase`, `stepConvergence`, `runDogfoodLoop` — immutable accumulation |
| **ReadonlyArray/readonly fields** | All interfaces — immutability enforced at type level |
| **Discriminated unions** | `DragonKind`, `DragonPhase`, `ExternalAgentKind`, `SagaStepKind`, `ConvergencePhase` |
| **Exhaustive case analysis** | All fold functions — TypeScript compiler enforces completeness |
| **Higher-order functions** | `mapHandoffPayload`, `mapPayload`, `foldGovernance` — behavior as parameters |
| **Pure transition functions** | `stepDragonPhase`, `stepConvergence` — no side effects, law-testable |
| **Effect.gen + yield*** | Application-layer orchestration (not in domain) |
| **Effect.all({})** | Structural parallelism for independent operations |
| **Context.Tag** | Service injection (FileSystem, AdoSource, RuntimeScenarioRunner) |

---

## Appendix A: Files Inventory

### Files to Create

| File | Purpose | LOC estimate |
|------|---------|-------------|
| `lib/domain/types/dragon.ts` | Dragon discriminant, lifecycle FSM, handoff envelope, fold functions | ~120 |
| `lib/domain/types/external-agent.ts` | External agent model, saga types, operator-as-improver, fold functions | ~180 |
| `tests/dragon-interaction.laws.spec.ts` | 7 property-based law tests | ~200 |
| `tests/external-agent.laws.spec.ts` | 6 property-based law tests | ~180 |
| `tests/convergence-fsm.laws.spec.ts` | 7 property-based law tests | ~200 |
| `tests/performance-config.laws.spec.ts` | 5 property-based law tests | ~150 |

### Files to Modify

| File | Change | LOC estimate |
|------|--------|-------------|
| `lib/domain/types/improvement.ts` | Add ConvergenceState FSM, PerformanceConfig, ExtendedObjectiveVector, OperatorImproverContext; extend ImprovementRun | ~150 added |
| `lib/domain/identity.ts` | Add SagaId, DragonHandoffId branded types | ~10 added |
| `lib/domain/visitors.ts` | Add 6 fold functions for new discriminated unions | ~80 added |
| `lib/domain/types/index.ts` | Re-export new modules | ~5 added |
| `docs/domain-ontology.md` | Major rewrite with Three Dragons framing | Full rewrite |
| `docs/master-architecture.md` | Add 4 new sections | ~300 added |
| `docs/seams-and-invariants.md` | Add 3 new seams | ~150 added |

### Files NOT Modified (Guardrail)

These files are explicitly out of scope for this plan:

- `lib/application/` — no application-layer changes (Phase E is future work)
- `lib/runtime/` — no runtime changes
- `lib/infrastructure/` — no infrastructure changes
- `lib/composition/` — no composition changes
- `dogfood/` — no training data changes
- `generated/` — no generated file changes
- `.tesseract/` — no derived artifact changes

---

## Appendix B: Glossary of New Terms

| Term | Definition | Dragon |
|------|-----------|--------|
| **Dragon** | One of three co-equal architectural concerns that share one interpretation surface | Meta |
| **DragonKind** | Discriminant type: `interface-intelligence`, `agent-workbench`, `recursive-improvement` | Meta |
| **DragonPhase** | Lifecycle FSM: dormant → ingesting → processing → yielding → complete | Meta |
| **DragonHandoff** | Typed envelope for dragon-to-dragon communication | Meta |
| **ExternalAgentKind** | Concrete agent subtype: claude-code, github-copilot, ci-runner, human-operator, custom-agent | D2 |
| **AgentToolCapability** | Declared tool a participant can exercise | D2 |
| **InterventionSaga** | Multi-step agentic workflow with compensation | D2 |
| **SagaStep** | One step in an intervention saga | D2 |
| **OperatorImprovementIntervention** | The meta-loop: system-improvement as a typed intervention | D2/D3 |
| **ConvergencePhase** | Improvement loop FSM: initial → exploring → narrowing → plateau → converged (or diverging) | D3 |
| **ConvergenceState** | Full state of the convergence controller (sliding window, epsilon, plateau length) | D3 |
| **PerformanceConfig** | Efficiency hyper-parameters (latency, memory, parallelism, caching) | D3 |
| **ExtendedObjectiveVector** | ObjectiveVector + performance metrics (latency, memory, cache hit rate) | D3 |
| **OperatorImproverContext** | Context for tracking who is improving the system and their budget | D3 |
| **Meta-Dragon A (Domain Alignment)** | The ontology communicates the territory; file paths are documentation | Meta |
| **Meta-Dragon B (Engineering Delight)** | Developing the system is a joy; measured by architecture fitness | Meta |
