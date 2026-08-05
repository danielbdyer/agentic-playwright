# Domain Audit Architecture Plan

> **Five Surfaces, Three Spines, One Integration**
>
> A first-principles re-derivation of the domain ontology, master architecture,
> and typed seam contracts — organized around five measurable improvement
> surfaces, three architectural spines, and their integration into a coherent
> optimization trajectory.

---

## Table of Contents

1. [Philosophical Foundation](#1-philosophical-foundation)
2. [The Five Improvement Surfaces](#2-the-five-improvement-surfaces)
3. [Three Architectural Spines](#3-three-architectural-spines)
4. [Interface Intelligence (Spine)](#4-interface-intelligence)
5. [Agent Workbench (Spine)](#5-agent-workbench)
6. [Recursive Improvement (Spine)](#6-recursive-improvement)
7. [Meta-Concerns: Domain Alignment & Engineering Delight](#7-meta-concerns)
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

### Why Five Surfaces

The compiler-only framing is insufficient. The system improves along five
independent dimensions — each with its own granularity, feedback latency,
leverage, and overfitting risk. These are not metaphors; they are the concrete
tuning surfaces described in `docs/recursive-self-improvement.md`, derived from
the structural correspondence between Tesseract's speedrun loop and a machine
learning training loop.

The three architectural spines (interface intelligence, agent workbench,
recursive improvement) are the *machinery* that produces improvement. The five
surfaces are the *objectives* that improvement targets. This audit describes
how to **integrate** the derivatives of all five surfaces into a coherent
optimization trajectory — the accumulated area under all five improvement curves.

Each surface has a measurable rate of change (its derivative). The system
converges when all five derivatives approach zero simultaneously. The scorecard
high-water-mark is the running maximum of the integrated improvement signal.
The Pareto frontier enforces monotonicity: no surface regresses while another
advances.

---

## 2. The Five Improvement Surfaces

The recursive improvement loop described in `docs/recursive-self-improvement.md`
optimizes Surface 1 (hyperparameters) directly. But the full optimization
landscape has five surfaces. All five are in scope for the self-improvement
system and for this domain audit.

### Surface 1: Hyperparameters (weights and thresholds)

The 15 tunable constants in `PipelineConfig`. These are the traditional "model
parameters" — numeric values that control scoring, ranking, translation, and
convergence behavior without changing code structure. Tuning is fast (single
speedrun), reversible (restore the config), and measurable (scorecard delta).

**Derivative signal**: Scorecard delta per speedrun epoch — `dS₁/dt`.
**Feedback latency**: One speedrun cycle (seconds to minutes).
**Leverage**: Moderate — bounded by the expressiveness of the algorithms that
consume them.
**Overfitting risk**: High — mitigated by varying the scenario generator seed
across epochs and requiring improvement to hold across 3+ seeds.

### Surface 2: Code structure (algorithms, patterns, abstractions)

The resolution ladder stages, the candidate lattice algorithm, the harvest
algorithm, the strategy chain composition, the scoring rule combinators — the
*functions* that hyperparameters flow through. A better algorithm renders
parameter sensitivity moot: if the resolution ladder can skip directly to the
right rung because the information is preserved in a form that makes the answer
obvious, the individual rung weights don't matter.

Code structure improvements include:
- **Visitor pattern coverage**: replacing ad-hoc switch/if chains with exhaustive
  typed folds. Each fold call site is a compile-time contract that new union
  variants cannot be silently ignored.
- **Layer integrity**: maintaining `domain → application → runtime → infrastructure`
  dependency direction.
- **Composable abstractions**: `ScoringRule` with `combine`/`contramap`,
  `PipelinePhase` with fold, `StateMachine` with pure transitions.
- **Pure function ratio**: the percentage of domain-layer functions that are
  side-effect free.
- **Envelope discipline**: the percentage of cross-boundary artifacts with full
  `WorkflowEnvelope` headers.

**Derivative signal**: Architecture fitness report delta — `dS₂/dt`.
**Feedback latency**: One development cycle.
**Leverage**: High — structural improvements transfer to all future parameter
tuning and all future applications.
**Overfitting risk**: Low — architecture fitness metrics are application-independent.

### Surface 3: Knowledge representation (type surfaces, data schemas)

The type system itself is a compression scheme. `CanonicalTargetRef` compresses
"the policy number input on the policy-search screen" into a branded string.
`LocatorStrategy` compresses three families of DOM lookup into a three-variant
union. `ResolutionReceipt` compresses an entire resolution pipeline execution
into a typed envelope.

Type surface improvements include:
- **Discriminated union completeness**: are all possible states represented as
  variants, or are some hidden in string fields?
- **Phantom brand coverage**: are governance states carried at the type level,
  or only at runtime?
- **Schema evolution**: when a new concept emerges, does it compose with existing
  types or require parallel truth?
- **Readonly enforcement**: mutable fields are implicit state machines. Marking
  fields `readonly` compresses the state space.

**Derivative signal**: Type-check pass/fail + law test delta — `dS₃/dt`.
**Feedback latency**: One development cycle.
**Leverage**: Very high — type-level improvements propagate to every consumer
and every future extension.
**Overfitting risk**: Zero — type improvements are verified by the compiler,
not by runtime data. They cannot overfit.

### Surface 4: Documentation and authorial leverage

The CLAUDE.md, `docs/coding-notes.md`, `docs/master-architecture.md`, and
domain ontology are not passive references — they are *training data for agent
sessions*. An agent session that correctly applies the supplement hierarchy on
the first attempt (because `docs/coding-notes.md` explains it clearly) saves
an entire debug cycle.

Documentation improvements include:
- **Worked examples**: concrete before/after code samples for each convention.
- **Anti-pattern galleries**: explicit "do NOT do this" sections with the
  *specific* failure mode that results.
- **Decision records**: 3-sentence ADRs (context, decision, consequence).
- **Cross-reference completeness**: every concept reachable from CLAUDE.md
  within two hops.

**Derivative signal**: Agent session first-attempt success rate — `dS₄/dt`.
**Feedback latency**: One agent session.
**Leverage**: Multiplicative — documentation quality multiplies the effectiveness
of every agent session, every human review, and every onboarding. Highest
leverage for agent-developed systems.
**Overfitting risk**: Low — measurable across different task types.

### Surface 5: Information-theoretic efficiency (lossless compression of domain signal)

The meta-surface. Every code construct, type surface, algorithm, and
documentation artifact is a compression of domain reality. The question is:
how much signal survives the compression?

Information efficiency improvements include:
- **Translation loss rate**: what fraction of intent text meaning is destroyed
  by normalization?
- **Supplement reuse factor**: how often is a promoted pattern actually exercised
  across multiple screens?
- **Resolution path entropy**: how many different resolution paths lead to the
  same correct answer? (`-Σ p_rung × log(p_rung)`)
- **Alias redundancy rate**: what fraction of aliases are strict subsets of
  other aliases?
- **Algorithm tuning surface density**: how many independently tunable parameters
  per unit of output variance?

**Derivative signal**: Information efficiency metrics delta — `dS₅/dt`.
**Feedback latency**: Multiple speedrun cycles (statistical measurement).
**Leverage**: Foundational — information efficiency improvements make all other
surfaces more effective.
**Overfitting risk**: Moderate — mitigated by wide scenario generator phrasing
templates and multi-objective Pareto frontier.

### The Integration

The `ObjectiveVector` is the integral of the five surface derivatives over
iteration time:

```
ObjectiveVector(t) = ∫₀ᵗ (w₁·dS₁/dτ + w₂·dS₂/dτ + w₃·dS₃/dτ + w₄·dS₄/dτ + w₅·dS₅/dτ) dτ
```

Where:
- `t` is iteration count (epochs for Surface 1, development cycles for 2-4,
  speedrun batches for Surface 5)
- `wᵢ` are the surface weights (currently implicit; surfacing them is a goal
  of this audit)
- Convergence = all five `dSᵢ/dt → 0` simultaneously
- The scorecard high-water-mark is `max₀≤τ≤t ObjectiveVector(τ)`
- The Pareto frontier enforces monotonicity: no accepted change may cause any
  surface to regress (Pareto dominance across the 4 `ParetoObjectives`)

### The Overfitting Concern Across Surfaces

- **Surface 1** (parameters): Vary scenario generator seed. Require improvement
  across 3+ seeds.
- **Surface 2** (code): Architecture fitness metrics are application-independent.
- **Surface 3** (types): Type-level improvements are compiler-verified. Cannot overfit.
- **Surface 4** (docs): Measurable across different agent tasks.
- **Surface 5** (information): Requires large sample sizes; Pareto frontier
  (4 objectives) provides regularization.

**Key insight**: Surfaces 2-5 are inherently more robust to overfitting than
Surface 1 because they measure structural properties, not behavioral outcomes.

---

## 3. Three Architectural Spines

The system has three co-equal architectural concerns — the three spines — that
share one interpretation surface. Each spine is a functor from a category of
inputs to a category of outputs. The natural transformation between them is
the **Interpretation Surface**: the shared contract all three consume and produce.

### Formal Definitions

Each spine has an **aggregate root**, an **input category**, an **output
category**, and a **lifecycle**.

#### Spine 1: Interface Intelligence

| Aspect | Value |
|--------|-------|
| Aggregate root | `ApplicationInterfaceGraph` |
| Input category | Canonical knowledge artifacts (surfaces, elements, postures, hints, patterns, snapshots) |
| Output category | Normalized graph of routes, screens, surfaces, targets, selectors, states, transitions |
| Primary types | `SurfaceGraph`, `ScreenElements`, `SelectorCanon`, `SelectorProbe`, `StateNode`, `EventSignature`, `StateTransition`, `CanonicalTargetRef` |
| Type files | `lib/domain/types/interface.ts`, `lib/domain/derived-graph.ts` |
| Surfaces served | **S2** (code structure via graph algorithms), **S3** (type surfaces via graph schema), **S5** (information efficiency via compression ratio) |
| Lifecycle | harvest → normalize → derive graph → fingerprint → yield to Spine 2 |

#### Spine 2: Agent Workbench

| Aspect | Value |
|--------|-------|
| Aggregate root | `InterventionLedger` (session + receipts) |
| Input category | `InterpretationSurface` + `Participant` |
| Output category | `InterventionReceipt[]` + `RunRecord` + `ProposalBundle` |
| Primary types | `Participant`, `InterventionReceipt`, `InterventionEffect`, `AgentSession`, `AgentEvent`, `ResolutionReceipt`, `StepExecutionReceipt`, `RunRecord` |
| Type files | `lib/domain/types/intervention.ts`, `lib/domain/types/session.ts`, `lib/domain/types/execution.ts` |
| Surfaces served | **S2** (code structure via resolution algorithms), **S4** (documentation leverage via agent sessions) |
| Lifecycle | orient → inspect → resolve → execute → observe → propose → yield to Spine 3 |

#### Spine 3: Recursive Improvement

| Aspect | Value |
|--------|-------|
| Aggregate root | `ImprovementRun` |
| Input category | `PipelineFitnessReport` + `PipelineConfig` |
| Output category | `PipelineConfig'` + `AcceptanceDecision` + `Checkpoint` |
| Primary types | `ImprovementRun`, `ObjectiveVector`, `PipelineFitnessReport`, `PipelineFailureClass` (8 variants), `CandidateIntervention`, `AcceptanceDecision`, `ParetoFrontier`, `PipelineConfig` (15 tunable parameters) |
| Type files | `lib/domain/types/improvement.ts`, `lib/domain/types/fitness.ts`, `lib/domain/types/pipeline-config.ts`, `lib/domain/types/architecture-fitness.ts` |
| Surfaces served | **S1** (hyperparameters — primary), orchestrates measurement for **all five** |
| Lifecycle | classify failures → search knobs → generate candidates → accept/reject → checkpoint → yield to Spine 1 |

### The Feedback Loop

```
Spine 1 (Interface Intelligence)
  │
  │  InterfaceSnapshot: graph + selectors + state
  ▼
Spine 2 (Agent Workbench)
  │
  │  FitnessSignal: classified failures + objective vector
  ▼
Spine 3 (Recursive Improvement)
  │
  │  ConfigUpdate: new pipeline config + acceptance decision
  ▼
Spine 1 (Interface Intelligence)  ← cycle restarts
```

Spine 3's output (better config) improves Spine 1's graph derivation quality,
which improves Spine 2's resolution hit rate, which reduces Spine 3's error
signal. This is a discrete-time feedback controller with convergence guarantees
(see §14).

### The Spine-to-Surface Mapping

Each spine serves multiple surfaces. Each surface is served by multiple spines.
The mapping is:

| Surface | Spine 1 (Interface) | Spine 2 (Workbench) | Spine 3 (Improvement) |
|---------|:------------------:|:-------------------:|:--------------------:|
| S1: Hyperparameters | — | — | **primary** |
| S2: Code structure | graph algorithms | resolution algorithms | knob search |
| S3: Type surfaces | graph schema | receipt types | fitness types |
| S4: Documentation | — | agent session leverage | — |
| S5: Information efficiency | compression ratio | resolution entropy | metric minimization |

This is the key structural insight: the three spines are not independent
pipelines — they are three perspectives on the same five improvement objectives.
The integration across surfaces is what makes improvement coherent rather than
local.

### Cross-Spine Protocols

Every spine-to-spine communication is wrapped in the existing `WorkflowEnvelope`
discipline:

```typescript
interface WorkflowEnvelope<TPayload> {
  readonly kind: string
  readonly version: number
  readonly stage: string
  readonly scope: string
  readonly ids: Record<string, string>
  readonly fingerprints: Record<string, string>
  readonly lineage: readonly string[]
  readonly governance: Governance
  readonly payload: TPayload
}
```

The three handoff points:

| Handoff | Source → Target | Payload Type | Existing Seam |
|---------|----------------|--------------|---------------|
| H1 | Spine 1 → Spine 2 | `InterfaceSnapshot` (graph + selectors + state) | Seam 2 (Knowledge → Resolution) |
| H2 | Spine 2 → Spine 3 | `FitnessSignal` (classified failures + objective vector) | Seam 4 (Execution → Projection) |
| H3 | Spine 3 → Spine 1 | `ConfigUpdate` (new pipeline config + acceptance decision) | Seam 5 (Projection → Knowledge) |

### Invariants on Cross-Spine Communication

1. **Governance monotonicity**: Governance cannot loosen through a handoff.
   If source spine is `review-required`, the handoff is at least `review-required`.
2. **Fingerprint derivation**: Handoff fingerprint is deterministically derived
   from payload content (SHA256 of stable JSON stringify).
3. **Lineage completeness**: Every handoff carries refs to all source artifacts
   that contributed to the payload.
4. **Functor law**: `mapPayload(envelope, id) === id` and
   `mapPayload(envelope, f . g) === mapPayload(envelope, f) . mapPayload(envelope, g)`.

---

## 4. Interface Intelligence

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

### What This Audit Adds to Spine 1

1. **Surface mapping**: Spine 1 explicitly tracks which surfaces it serves —
   **S2** (code structure via graph derivation algorithms), **S3** (type
   surfaces via the graph schema itself), and **S5** (information efficiency
   via the compression ratio of graph vs raw DOM).

2. **Cross-spine handoff H1**: A `WorkflowEnvelope<InterfaceSnapshot>` carries
   the graph + selectors + state to Spine 2, replacing implicit coupling
   through `WorkspaceCatalog`.

3. **Graph-as-provenance**: Every graph node carries `source: 'approved-knowledge'
   | 'discovery' | 'derived-working'` — already modeled but the ontology
   document doesn't derive it from first principles. This audit closes that gap.

---

## 5. Agent Workbench

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

The core behavioral contract of Spine 2 is the resolution precedence law:

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

### What This Audit Adds to Spine 2

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

4. **Surface mapping**: Spine 2 explicitly tracks which surfaces it serves —
   **S2** (code structure via resolution algorithms), **S4** (documentation
   leverage, because agent sessions consume docs and their effectiveness
   measures documentation quality).

---

## 6. Recursive Improvement

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
  improvement iterations with convergence detection. Four convergence branches:
  `no-proposals`, `threshold-met`, `budget-exhausted`, `max-iterations`.

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

### Convergence (Simple, Not Over-Engineered)

The actual convergence logic in `dogfood.ts` has four branches — and that is
the right level of complexity for a system with one actor and one experiment
at a time:

1. **`no-proposals`**: No proposals were generated in the last iteration.
   The system has nothing left to try. Stop.
2. **`threshold-met`**: The improvement delta between consecutive iterations
   fell below the convergence threshold. The system is in a local optimum. Stop.
3. **`budget-exhausted`**: The cumulative instruction count exceeded the
   instruction budget. Stop to prevent runaway.
4. **`max-iterations`**: The iteration limit was reached. Stop as a safety net.

This audit enriches the convergence signal with one addition: `'regression-detected'`
as a fifth `ImprovementConvergenceReason`. This covers the case where the
objective vector *worsens* after a parameter change — the system should stop
and roll back, not continue iterating. This is a simple discriminant extension,
not a full FSM.

### What This Audit Adds to Spine 3

1. **Convergence enrichment**: Add `'regression-detected'` to the existing
   `ImprovementConvergenceReason` union. No FSM, no sliding windows, no epsilon
   dead-bands — just a fifth reason alongside the existing four.

2. **Performance hyper-parameters**: Alongside the 15 accuracy parameters, add
   efficiency parameters for throughput tuning. See §9.

3. **Extended objective vector**: `ExtendedObjectiveVector` adds efficiency
   dimensions alongside accuracy dimensions. See §9.

4. **Operator-as-improver context**: When the improvement loop is driven by
   an external agent, that operator gets a typed `OperatorImproverContext` with
   fitness baseline and target objectives.

5. **Surface mapping**: Spine 3 is the primary driver of **S1** (hyperparameters),
   and orchestrates measurement for all five surfaces through the
   `PipelineFitnessReport` (S1, S5), `ArchitectureFitnessReport` (S2, S3),
   and agent session effectiveness tracking (S4).

---

## 7. Meta-Concerns

### Meta-Concern A: Domain Alignment

**Axiom**: The ontology communicates the territory. File paths, type names,
and package boundaries are part of the product — not incidental to it.

**Measurable properties**:

| Metric | Definition | Target | Surface |
|--------|-----------|--------|---------|
| Ontology coverage | % of types in `lib/domain/types/` mentioned in `docs/domain-ontology.md` | 100% | S3 |
| Path correspondence | Type name matches file path (e.g. `ImprovementRun` in `improvement.ts`) | 100% | S3 |
| Concept density | Average LOC per domain primitive | < 50 | S2 |
| Layer purity | Zero imports from application/infrastructure/runtime in `lib/domain/` | 0 violations | S2 |
| Exhaustive branching | All discriminated unions have fold functions in `visitors.ts` | 100% | S2 |

**Why this matters**: A new contributor should be able to navigate from
`domain-ontology.md` to the exact type file to the exact fold function
without grep. The codebase IS the documentation. This maps directly to
**Surface 3** (type surfaces) and **Surface 4** (documentation leverage).

### Meta-Concern B: Engineering Delight

**Axiom**: Developing this system should be a joy, not a chore. The type
system should prevent mistakes at compile time. The test suite should prove
properties, not just check examples.

**Measurable properties** (from `ArchitectureFitnessReport`):

| Metric | Definition | Target | Surface |
|--------|-----------|--------|---------|
| Purity rate | % of domain functions that are pure | > 95% | S2 |
| Visitor coverage | % of discriminated unions with exhaustive fold | 100% | S2 |
| Envelope discipline | % of cross-boundary artifacts with standard envelope | 100% | S5 |
| Parameter exposure | % of tunable knobs surfaced in `PipelineConfig` | > 90% | S1 |
| Law test coverage | % of deterministic invariants with property-based tests | > 80% | S2 |
| FP compliance | Zero `let`, `push`, `for` in `lib/domain/` (enforced by ESLint) | 0 violations | S2 |

**Why this matters**: `ArchitectureFitnessReport` is already a first-class
type in the system. Meta-Concern B means the system measures its own
engineering health as part of the improvement loop — Spine 3 can propose
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
before/after fitness reports. The improvement spine can analyze the delta and
learn which kinds of operator interventions are most effective — this is the
actor that drives integration across all five surfaces.

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
parallelism, caching). This means the improvement spine can optimize for
quality but not for speed.

This section is a **Surface 1 extension**: adding efficiency knobs alongside
the existing accuracy knobs, widening the hyperparameter surface that the
knob search can explore.

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

### Integration with the Improvement Spine

The knob search expands to consider performance parameters alongside accuracy
parameters. When the fitness report shows `timeout` failures, the knob search
can propose increasing `resolutionTimeoutMs`. When compilation latency exceeds
budget, it can propose increasing `effectParallelismDegree` or adjusting
`incrementalRebuildThreshold`.

This is a natural extension of Surface 1: the hyperparameter space grows from
15 accuracy knobs to 15 + 8 = 23 total knobs, with the same failure-to-parameter
mapping discipline applied to both.

---

## 10. New Type Artifacts

### Artifact 1: `lib/domain/types/external-agent.ts` (NEW)

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

### Artifact 2: Extensions to `lib/domain/types/improvement.ts`

New types added (backward-compatible, no breaking changes):

```typescript
// ── Convergence reason enrichment ──

// Extend existing ImprovementConvergenceReason with regression detection:
export type ImprovementConvergenceReason =
  | 'no-proposals'
  | 'threshold-met'
  | 'budget-exhausted'
  | 'max-iterations'
  | 'regression-detected'   // NEW: objective vector worsened
  | null;

// ── Performance Config (Surface 1 extension) ──

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

// ── Extended Objectives (Surface 1 efficiency dimensions) ──

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
  readonly fitnessBaseline: PipelineFitnessReport
}
```

### Artifact 3: Extensions to `ImprovementRun`

Add optional fields (backward-compatible):

```typescript
interface ImprovementRun {
  // ... existing fields unchanged ...
  readonly performanceConfig?: PerformanceConfig
  readonly operatorContext?: OperatorImproverContext
}
```

### Artifact 4: Extensions to `lib/domain/visitors.ts`

Add fold functions for new discriminated unions:
- `foldExternalAgentKind`
- `foldSagaStepKind`
- `foldSagaStepStatus`

All follow the existing pattern: exhaustive case analysis via object-of-functions,
TypeScript compiler enforces completeness.

### Artifact 5: Extensions to `lib/domain/identity.ts`

New branded ID:
- `SagaId` — branded string for saga identification

---

## 11. Law Tests

All law tests follow the established pattern in the codebase: seeded Mulberry32
PRNG, 75-150 seeds, proving properties for ALL valid inputs rather than spot
examples.

### Test File 1: `tests/external-agent.laws.spec.ts`

**Pattern source**: `tests/visitors.laws.spec.ts`

| Law | Property | Seeds |
|-----|----------|-------|
| Saga step ordering | Steps execute in declared index order; no skipping unless prior step failed | 100 |
| Compensation completeness | Failed saga compensates all prior completed steps that have compensationStepId | 100 |
| Saga governance derivation | Saga governance = max governance of contained steps | 150 |
| Capability soundness | Agent cannot use tool not in its declared `toolCapabilities` | 100 |
| Fold exhaustiveness | `foldExternalAgentKind`, `foldSagaStepKind`, `foldSagaStepStatus` cover all variants | 50 |
| Operator improvement fitness consistency | If `fitnessReportAfter` dominates `fitnessReportBefore` on all objectives, verdict is `accepted` | 100 |

### Test File 2: `tests/performance-config.laws.spec.ts`

**Pattern source**: `tests/pipeline-fitness.laws.spec.ts`

| Law | Property | Seeds |
|-----|----------|-------|
| Default config valid | `validatePerformanceConfig(DEFAULT_PERFORMANCE_CONFIG)` returns empty array | 1 |
| Scalar bounds | All numeric fields positive; threshold in [0,1]; parallelism ≥ 1 | 150 |
| Merge associativity | `merge(merge(a,b),c) === merge(a,merge(b,c))` if merge is defined | 100 |
| Extended Pareto consistency | If A dominates B on base `ObjectiveVector`, and A.perf === B.perf, then A dominates B on `ExtendedObjectiveVector` | 100 |
| Validation round-trip | `validate(validate(x))` returns same errors as `validate(x)` | 100 |

### Test File 3: `tests/surface-integration.laws.spec.ts` (NEW)

**Pattern source**: `tests/pipeline-fitness.laws.spec.ts`

| Law | Property | Seeds |
|-----|----------|-------|
| Monotonicity across surfaces | An accepted change must not cause any of the 5 surface metrics to regress (Pareto dominance) | 150 |
| Integration additivity | ObjectiveVector(t₁+t₂) = ObjectiveVector(t₁) + ∫ₜ₁ᵗ¹⁺ᵗ² dS/dτ dτ | 100 |
| Convergence detection | If all five surface derivatives are below epsilon for N consecutive epochs, convergence is declared | 100 |
| High-water-mark monotonicity | The scorecard high-water-mark never decreases | 100 |
| Surface weight positivity | All surface weights in the integration formula are positive | 50 |

---

## 12. Updated Seams and Invariants

Two new seams added to the existing five in `docs/seams-and-invariants.md`.

### Seam 6: External Agent Interventions

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

### Seam 7: Performance Tuning Surface

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

### Seam 8: Surface Integration

**What crosses**: Five surface derivative measurements combine into the
`ObjectiveVector` trajectory.

**Contract types**:
- Input: Per-surface metric deltas (dS₁/dt through dS₅/dt)
- Output: Integrated `ObjectiveVector`, convergence signal, scorecard update

**Invariants**:
1. Monotonicity — no accepted change may cause any surface to regress
2. Additivity — integration is additive over disjoint time intervals
3. Convergence consistency — all five derivatives below epsilon implies convergence
4. High-water-mark monotonicity — scorecard max never decreases
5. Weight positivity — all surface weights are strictly positive

**Effect pattern**: Surface measurement is pure aggregation in `lib/domain/`.
The integration formula is a fold over the five derivative signals.

**Law tests**: `tests/surface-integration.laws.spec.ts`

---

## 13. Implementation Sequencing

### Phase A: Foundation Types (pure domain, no behavioral changes)

| Step | File | Action | Dependencies |
|------|------|--------|-------------|
| A1 | `lib/domain/types/external-agent.ts` | Create: ExternalAgentKind, AgentToolCapability, ExternalAgentParticipant, SagaStep, InterventionSaga, OperatorImprovementIntervention, fold functions | `intervention.ts` (imports Participant, ParticipantRef) |
| A2 | `lib/domain/visitors.ts` | Add fold functions for new discriminated unions | A1 |
| A3 | `lib/domain/identity.ts` | Add `SagaId` branded type | None |

### Phase B: Extend Existing Types (backward-compatible additions)

| Step | File | Action | Dependencies |
|------|------|--------|-------------|
| B1 | `lib/domain/types/improvement.ts` | Add `'regression-detected'` to `ImprovementConvergenceReason`, add PerformanceConfig, DEFAULT_PERFORMANCE_CONFIG, validatePerformanceConfig, ExtendedObjectiveVector, OperatorImproverContext | A1 (imports ExternalAgentKind) |
| B2 | `lib/domain/types/improvement.ts` | Add optional fields to ImprovementRun (performanceConfig, operatorContext) | B1 |
| B3 | `lib/domain/types/index.ts` | Re-export new types from external-agent.ts | A1 |

### Phase C: Law Tests

| Step | File | Action | Dependencies |
|------|------|--------|-------------|
| C1 | `tests/external-agent.laws.spec.ts` | Write 6 law tests for saga and capability contracts | A1 |
| C2 | `tests/performance-config.laws.spec.ts` | Write 5 law tests for performance config validation | B1 |
| C3 | `tests/surface-integration.laws.spec.ts` | Write 5 law tests for surface integration invariants | B1 |

### Phase D: Documentation

| Step | File | Action | Dependencies |
|------|------|--------|-------------|
| D1 | `docs/domain-ontology.md` | Major rewrite: restructure into five-surfaces/three-spines framing, re-derive all primitives from first principles | A1-B3 (needs to reference new types) |
| D2 | `docs/master-architecture.md` | Add sections: Three Spines, Cross-Spine Protocols, Meta-Concerns as NFRs, Performance Tuning Surface | A1-B3 |
| D3 | `docs/seams-and-invariants.md` | Add Seams 6-8 (external agents, performance, surface integration) | A1-B3, C1-C3 |

### Phase E: Application Layer Integration (future, after plan approval)

| Step | File | Action | Dependencies |
|------|------|--------|-------------|
| E1 | `lib/application/dogfood.ts` | Add `'regression-detected'` convergence branch | B1 |
| E2 | `lib/application/dogfood.ts` | Wire `InterventionSaga` execution and `OperatorImproverContext` | A1, B1-B2 |
| E3 | `lib/composition/layers.ts` | Add layer for `PerformanceConfig` service | B1 |

### Critical Path

```
A1 ──┬── A2 ── B3 ── D1, D2, D3
     │
A3 ──┘

B1 ── B2 ── C2, C3

A1 ── C1

(D1-D3 can proceed in parallel once A1-B3 are done)
(C1-C3 can proceed in parallel once their respective type deps are done)
(E1-E3 are future work after approval)
```

### Estimated Artifact Count

| Category | Count |
|----------|-------|
| New type files | 1 (`external-agent.ts`) |
| Modified type files | 2 (`improvement.ts`, `identity.ts`) |
| Modified support files | 2 (`visitors.ts`, `types/index.ts`) |
| New test files | 3 |
| Modified doc files | 3 (`domain-ontology.md`, `master-architecture.md`, `seams-and-invariants.md`) |
| **Total files touched** | **11** |

---

## 14. Theoretical Framing

### Category-Theoretic

Each spine is a **functor** from its input category to its output category:

- Spine 1: `Kn → Graph` (knowledge artifacts → interface graph)
- Spine 2: `Graph × Part → Ledger` (graph + participant → intervention ledger)
- Spine 3: `Ledger × Config → Config'` (ledger + config → better config)

The **natural transformation** between spines is the `InterpretationSurface`:
the shared contract that makes `Spine2 ∘ Spine1` and `Spine3 ∘ Spine2 ∘ Spine1`
coherent.

The `WorkflowEnvelope` is a **morphism** in the category of spines.
The functor laws on `mapPayload` are law-testable:
- Identity: `map(id) = id`
- Composition: `map(f ∘ g) = map(f) ∘ map(g)`

### Information-Theoretic (Surface 5)

- **Spine 1** compresses: `|ApplicationInterfaceGraph| << |raw DOM|`
  The graph is a sufficient statistic for resolution — it preserves all
  information needed for scenario binding while discarding DOM noise.

- **Spine 2** channels: Resolution path entropy =
  `-Σ p_rung × log(p_rung)` where `p_rung` is the fraction of steps won
  by each rung. A healthy system has low entropy (most steps resolved by
  deterministic rungs). High entropy means the system is guessing.

- **Spine 3** minimizes: The fitness report is a sufficient statistic of
  pipeline performance. The knob search finds the minimum description length
  encoding of "what to change" — the smallest config perturbation that
  improves the objective vector.

### Control-Theoretic (Simplified)

Spine 3 is a **discrete-time feedback controller**:

- **Plant**: the pipeline (takes config, produces fitness)
- **Sensor**: the fitness report (measures output quality)
- **Controller**: the knob search (maps error signal to parameter adjustment)
- **Reference**: the target objective vector
- **Error signal**: `ObjectiveVector_target - ObjectiveVector_actual`

The actual convergence logic in `dogfood.ts` implements four simple branches
(now five with `regression-detected`). This is the right level of complexity
for a system with one actor and one experiment at a time. The controller
operates in discrete epochs; each epoch is a full speedrun cycle.

### Calculus-Theoretic (The Integration)

The five surfaces define a 5-dimensional improvement manifold. Each surface
has a measurable derivative — its rate of improvement per epoch:

- `dS₁/dt` — scorecard delta (hyperparameters)
- `dS₂/dt` — architecture fitness delta (code structure)
- `dS₃/dt` — type-check + law test delta (knowledge representation)
- `dS₄/dt` — agent first-attempt success rate delta (documentation)
- `dS₅/dt` — information efficiency metrics delta

The `ObjectiveVector` at time `t` is the integral:

```
OV(t) = ∫₀ᵗ (w₁·dS₁/dτ + w₂·dS₂/dτ + w₃·dS₃/dτ + w₄·dS₄/dτ + w₅·dS₅/dτ) dτ
```

**Convergence** = all five derivatives approach zero simultaneously. The system
has found a local optimum on every surface.

**The scorecard high-water-mark** = `max₀≤τ≤t OV(τ)` — the running maximum of
the integral. This is monotone by construction; it can only improve.

**The Pareto frontier** enforces that integration is monotone *per surface*:
no accepted change may cause any surface to regress. This prevents
"improvement" on one surface at the expense of another.

**Convergence rate** = `‖(dS₁/dt, ..., dS₅/dt)‖` — the L2 norm of the
derivative vector. When this falls below epsilon, the system declares
convergence. The norm captures whether *any* surface is still improving.

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

| Pattern | Where Applied | Spine |
|---------|--------------|-------|
| **Strategy** | Resolution ladder, pipeline phases, spine projection | Spine 2, Spine 3 |
| **Visitor/Fold** | All discriminated unions (`foldExternalAgentKind`, `foldSagaStepKind`, etc.) | All |
| **Composite** | Scoring rules, validation rules, pipeline phases with `combine`/`contramap` | Spine 3 |
| **State Machine** | Saga lifecycle, convergence detection — consumed by generic `StateMachine<S,E,R>` | All |
| **Interpreter** | Compilation phases, resolution pipeline — each phase is pure input→output with provenance | Spine 1, Spine 2 |
| **Envelope** | `WorkflowEnvelope`, `InterventionSaga` — standard header discipline | All |
| **Saga** | `InterventionSaga` — multi-step workflow with compensation | Spine 2 |
| **Functor** | `mapPayload` — structure-preserving payload transformation | All |

### FP Technique Inventory

| Technique | Where Applied |
|-----------|--------------|
| **Phantom branded types** | `Approved<T>`, `Blocked<T>`, `ReviewRequired<T>` — governance at type level |
| **Recursive folds** | `runDogfoodLoop`, `stepConvergence` — immutable accumulation |
| **ReadonlyArray/readonly fields** | All interfaces — immutability enforced at type level |
| **Discriminated unions** | `ExternalAgentKind`, `SagaStepKind`, `ImprovementConvergenceReason` |
| **Exhaustive case analysis** | All fold functions — TypeScript compiler enforces completeness |
| **Higher-order functions** | `mapPayload`, `foldGovernance` — behavior as parameters |
| **Pure transition functions** | Saga step transitions, convergence detection — no side effects, law-testable |
| **Effect.gen + yield*** | Application-layer orchestration (not in domain) |
| **Effect.all({})** | Structural parallelism for independent operations |
| **Context.Tag** | Service injection (FileSystem, AdoSource, RuntimeScenarioRunner) |

---

## Appendix A: Files Inventory

### Files to Create

| File | Purpose | LOC estimate |
|------|---------|-------------|
| `lib/domain/types/external-agent.ts` | External agent model, saga types, operator-as-improver, fold functions | ~180 |
| `tests/external-agent.laws.spec.ts` | 6 property-based law tests | ~180 |
| `tests/performance-config.laws.spec.ts` | 5 property-based law tests | ~150 |
| `tests/surface-integration.laws.spec.ts` | 5 property-based law tests | ~150 |

### Files to Modify

| File | Change | LOC estimate |
|------|--------|-------------|
| `lib/domain/types/improvement.ts` | Add `'regression-detected'`, PerformanceConfig, ExtendedObjectiveVector, OperatorImproverContext; extend ImprovementRun | ~120 added |
| `lib/domain/identity.ts` | Add SagaId branded type | ~5 added |
| `lib/domain/visitors.ts` | Add 3 fold functions for new discriminated unions | ~50 added |
| `lib/domain/types/index.ts` | Re-export new modules | ~5 added |
| `docs/domain-ontology.md` | Major rewrite with five-surfaces/three-spines framing | Full rewrite |
| `docs/master-architecture.md` | Add 3 new sections | ~250 added |
| `docs/seams-and-invariants.md` | Add 3 new seams | ~120 added |

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

## Appendix B: Glossary

| Term | Definition | Spine / Surface |
|------|-----------|-----------------|
| **Surface 1** | Hyperparameters — the 15+ tunable constants in PipelineConfig and PerformanceConfig | S1 |
| **Surface 2** | Code structure — algorithms, patterns, abstractions; measured by architecture fitness | S2 |
| **Surface 3** | Knowledge representation — type surfaces, data schemas; measured by compiler + law tests | S3 |
| **Surface 4** | Documentation and authorial leverage; measured by agent session effectiveness | S4 |
| **Surface 5** | Information-theoretic efficiency — lossless compression of domain signal | S5 |
| **Integration** | The accumulation of improvement across all five surfaces into a coherent ObjectiveVector trajectory | Meta |
| **Spine** | One of three co-equal architectural concerns sharing one interpretation surface | Meta |
| **ExternalAgentKind** | Concrete agent subtype: claude-code, github-copilot, ci-runner, human-operator, custom-agent | Spine 2 |
| **AgentToolCapability** | Declared tool a participant can exercise | Spine 2 |
| **InterventionSaga** | Multi-step agentic workflow with compensation | Spine 2 |
| **SagaStep** | One step in an intervention saga | Spine 2 |
| **OperatorImprovementIntervention** | The meta-loop: system-improvement as a typed intervention | Spine 2/3 |
| **PerformanceConfig** | Efficiency hyper-parameters (latency, memory, parallelism, caching) | S1, Spine 3 |
| **ExtendedObjectiveVector** | ObjectiveVector + performance metrics (latency, memory, cache hit rate) | S1, Spine 3 |
| **OperatorImproverContext** | Context for tracking who is improving the system and their fitness baseline | Spine 3 |
| **Meta-Concern A (Domain Alignment)** | The ontology communicates the territory; file paths are documentation | S3, S4 |
| **Meta-Concern B (Engineering Delight)** | Developing the system is a joy; measured by architecture fitness | S2 |
