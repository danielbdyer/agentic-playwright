# Tesseract Domain Model

> Status: Draft — conceptual domain model derived from codebase analysis

This document describes what Tesseract *is* at the conceptual level. It is not an architecture doc (see `master-architecture.md`), not a file map (see `module-map.md`), and not an ontology of types (see `domain-ontology.md`). It is the model underneath all of those — the primitives, their relationships, and the gravitational wells that organize everything else.

## The Generative Primitive: The Gap

Tesseract exists because intent and reality are never perfectly aligned.

A human writes "verify that the policy number field accepts valid input." The application has an actual DOM with an actual input element in an actual state. Between the human's words and the browser's reality lies a gap — semantic, structural, temporal. Closing that gap is the system's entire purpose.

Every concept in the system is either a gap, a mechanism for closing one, a measurement of one's size, or an observation about whether gaps are shrinking over time.

The gaps are plural and concurrent:

- **Intent ↔ Reality**: the primary gap. Resolution closes it.
- **Knowledge ↔ Reality**: drift widens it, discovery and observation close it.
- **Observation ↔ Truth**: interpretation bridges it, confidence measures it.
- **Proposed ↔ Approved**: governance manages it.
- **Current ↔ Desired performance**: fitness measures it, improvement closes it.
- **Individual ↔ Shared knowledge**: promotion bridges it, contradiction detects inconsistency.

---

## Ontological Primitives

These describe what exists in the system's world.

### Intent

What someone wants verified. Before it becomes a scenario, before it's YAML, before it's a step program — there is a human's statement of what should be true about the software. Everything downstream is a response to this.

Intent enters the system as ADO manual test cases. It is lowered through scenario parsing, step decomposition, instruction compilation, and data binding into forms the system can act on. But the original human statement remains the source of authority. When the system can't resolve a step, it's because intent outstripped the system's understanding — not because intent was wrong.

**Gravitational well:**
- ScenarioSource, ScenarioMetadata, AdoStep — the raw input
- StepAction, StepInstruction, StepProgram — the lowered forms
- ValueRef (literal, fixture-path, posture-sample, parameter-row, generated-token) — data intent
- Fixtures, parameters, preconditions, postconditions — the context of intent
- ScenarioDecomposition, GroundedSpecFlow — intent lowered into executable form
- Workflow archetypes (search-verify, detail-inspect, form-submit, etc.) — patterns of intent
- Translation gap vocabulary — the domain synonym space where intent lives
- Synthetic scenario generation — manufacturing intent for training
- Scenario tier classification (fast/normal/slow) — the weight of intent
- Intent normalization, alias generation — canonicalizing human phrasing

### Reality

What the application actually is. The DOM exists, the routes exist, the states and transitions exist — independent of anyone's intent to test them. Reality can be observed but never fully known. It is stateful (the same screen behaves differently depending on prior actions) and it changes (deployments, redesigns, feature flags).

Reality is not modeled directly — it is modeled through targets, surfaces, and observations. The system never holds "reality" as a data structure. It holds beliefs about reality (knowledge) derived from partial observations of reality through lossy surfaces.

### Target

The semantic identity of a thing in reality, prior to any means of finding it. "The policy number input" is a target before it has a selector, before it has an ARIA role, before anyone writes a test that mentions it. Targets persist; selectors are ephemeral probes.

This is the atom of the interface model. Screens, surfaces, and elements are organizational containers for targets. State nodes and transitions are relationships between targets. Selectors are paths to targets. The interface graph is a graph *of* targets.

**Gravitational well:**
- CanonicalTargetRef — the single semantic identity
- ElementSig — element signature (name, role, locator strategy, widget type)
- The identity types: ElementId, ScreenId, SurfaceId, PostureId, SnapshotTemplateId, RouteId
- Widget type and ARIA role — what kind of thing this is
- Affordances — what the target offers (clickable, typeable, selectable, toggleable...)
- Constraints — what limits the target (disabled, readonly, hidden, required...)
- SelectorProbe — a concrete candidate for reaching a target
- SelectorCanon — the durable working set of ranked probes per target
- Selector rung health (healthy/degraded/unverified) — probe quality
- Locator ladder — ordered selector strategies keyed by target ref
- Screen bundles — the package of knowledge about targets on one screen
- Surface membership — which region of the screen a target belongs to
- Routes and route variants — navigation containers for targets
- The principle: "selectors don't define a target; the target defines the selectors"

### Surface

A boundary through which reality can be perceived. Not the domain type `SurfaceDefinition` (that's a region of a screen) — the epistemological concept: any interface through which the system can observe the application.

Each surface offers a partial, lossy projection of reality with its own fidelity, cost, latency, and failure characteristics:

- **DOM inspection** — sees structure, sees nothing about intent
- **ARIA tree** — sees accessibility semantics, misses visual layout
- **Screenshots** — sees pixels, misses structure
- **Console** — sees errors, misses their cause
- **Network/HAR** — sees traffic, misses UI state
- **State topology** — infers possible transitions, can't confirm them without commitment

Surfaces also have depth. The DOM shows what's present *now*. State topology infers what *could happen*. HAR shows what the *server thinks happened*. These aren't just different data — they're different epistemological depths of the same reality.

**Gravitational well:**
- DOM element discovery, ARIA snapshot capture, screenshot capture
- Console monitoring (console-sentinel), HAR/network capture
- State topology inference, CDP screencast
- Screen identification — inferring which screen from DOM signals
- Element probing — locator resolution as surface inspection
- BoundingBox — spatial position on the visual surface
- The observation that the same target appears differently through different surfaces

### Knowledge

Accumulated interpreted beliefs about reality. Knowledge is always partial, always potentially stale. Some is authored by humans (approved), some observed by agents (proposed), some inferred (derived). Knowledge mediates between intent and reality, and it's never perfect.

The fundamental tension: knowledge must be durable enough to avoid rediscovering the same thing every run, but honest enough to admit when it's wrong.

**Gravitational well:**
- ScreenElements, ScreenHints, Postures, Patterns, Snapshots, Surfaces — the canonical artifacts
- Routes and route knowledge — navigation graph beliefs
- Widget contracts — behavioral contracts for element classes
- Semantic dictionary — TF-IDF indexed intent-to-target mapping
- Shingle index — token n-gram index for fuzzy matching
- Confidence overlays — derived working knowledge from run evidence
- ApprovalEquivalenceStatus (learning/approved-equivalent/needs-review)
- Knowledge posture (cold-start/warm-start/production) — how much to trust
- Knowledge freshness — staleness tracking
- Knowledge dependencies — reverse index of scenario-to-knowledge usage
- Knowledge bottlenecks — where knowledge is thin or unreliable
- Supplement hierarchy — screen-local hints first, promoted patterns second
- The canonical/derived split — the fundamental governance boundary
- Component maturation — tracking knowledge completeness over time
- The principle: "one change should propagate to many scenarios"

---

## Epistemological Primitives

These describe how the system knows what it knows.

### Observation

The act of perceiving reality through a surface. Observation is not evidence — it is the looking, not the record. Each observation mode has its own fidelity, cost, and failure characteristics. A selector confirmed by ARIA snapshot carries different epistemic weight than one found by CSS probing. An element present in a screenshot but absent from the ARIA tree tells a different story than one present in both.

The system's reliability depends on knowing *how* something was observed, not just *what* was observed. The observation mode is part of the evidence's meaning.

**Gravitational well:**
- DOM element discovery, ARIA snapshot capture, screenshot capture
- Console message capture (size-bounded, error/warn filtered)
- State node observation, transition detection, route navigation observation
- Screen identification from DOM signals
- Discovery runs — systematic crawling of the application
- Harvest — extracting knowledge from discovered screens
- Parallel harvest — concurrent observation of multiple screens
- Observation predicates (StatePredicateSemantics) — conditions to check
- Pre/post-execution observation — state before and after commitment
- Causal links — expected transitions tracked for subsequent steps
- Deferred screenshot — batch encoding with priority-based pruning
- Screenshot policy — selective capture (failure, drift, agent, hot screen, health)
- The observation that observation itself has cost (attention budget, execution budget)

### Interpretation

Making meaning from observation. When the system sees a DOM node with `role="textbox"` and `aria-label="Policy Number"`, interpretation is what says "this is the policy number input target." When a human writes "enter the policy number," interpretation is what says "enter means fill, policy number is a target identity."

Interpretation is where the system makes ontological claims — assertions about what things are. Every other concept either feeds interpretation (observation, knowledge, surfaces) or consumes its output (resolution, evidence, proposals). The system's confidence levels are fundamentally about interpretation quality: `compiler-derived` means "interpreted through deterministic rules," `agent-verified` means "interpreted by an agent and confirmed," `agent-proposed` means "interpreted but unconfirmed."

**Gravitational well:**
- Intent interpretation — step text → verb + target + data
- TranslationDecomposition — verb/target/data extraction
- TranslationRequest, TranslationReceipt, TranslationCandidate — structured interpretation
- Semantic dictionary matching — TF-IDF lookup against known translations
- DOM scoring — visibility, role-name match, locator quality weights
- Agent interpretation — heuristic + LLM hybrid with confidence levels
- Candidate lattice — multi-dimensional ranking
- Interpretation exhaustion — what was tried and why it failed (ExhaustionEntry)
- InterpretationDriftRecord — how interpretation quality changes over time
- Translation provider strategy — deterministic, llm-api, copilot (pluggable)
- Heuristic intent parser (pure token-overlap)
- LLM-assisted DOM analysis (Rung 8), agent-interpreted (Rung 9)
- Alias matching, text normalization, affordance matching
- "needs-human" — the terminal interpretation failure

### Confidence

How much the system trusts an interpretation. Confidence is epistemological — it's about belief, not permission. Governance is about permission. A high-confidence interpretation can still be governance-blocked. A low-confidence interpretation can still be governance-approved if a human says so.

**Gravitational well:**
- Confidence levels: human, agent-verified, agent-proposed, compiler-derived, intent-only, unbound
- Confidence overlays — per-artifact confidence built from evidence
- Confidence scaling — tunable growth and decay parameters
- ArtifactConfidenceRecord — score, threshold, lineage, learned aliases
- Signal maturation — dampening early signals via saturation curve
- Consecutive failure tracking — confidence decay on repeated failures
- Scoring algebra — semigroup/monoid composition with identity (0) and annihilator (-∞)
- The two-layer model: initial confidence (ProposedChangeMetadata) vs. empirical confidence (ApprovedEquivalentOverlay)
- Confidence threshold for approval equivalence
- The principle: "confidence is not governance"

### Provenance

The ancestry of any derived thing. Every derived artifact must explain what inputs it used, which stage won, and what was exhausted before the winning path was chosen. Provenance is not metadata — it is part of correctness. A resolution without provenance is unverifiable.

**Gravitational well:**
- WorkflowEnvelopeLineage — sources, parents, handshakes
- Provenance kinds: explicit, approved-knowledge, live-exploration, agent-interpreted, unresolved
- Fingerprints — SHA-256 content hashes for identity and change detection
- Lineage graph — parent-child relationships between artifacts
- Resolution source branding — SourcedCandidate<T, Rung> phantom type
- Pipeline stage branding — StagedEnvelope<T, Stage> phantom type
- Exhaustion trail — what was tried before the winner
- Reason chains — ordered record of why each candidate was rejected
- Graph edges: derived-from, references, uses, observed-by, proposed-change-for, governs, learns-from
- Catamorphism fusion, Galois connections — algebraic composition preserving provenance

### Evidence

The structured record of what happened when the system committed to an interpretation and acted. Evidence is observation *after* interpretation — it carries claims ("I saw element X at selector Y in state Z") that can be right or wrong.

Evidence is the empirical ground truth that knowledge lacks. Every execution produces evidence; evidence is what lets the system learn.

**Gravitational well:**
- StepExecutionReceipt — what happened at each step
- RecoveryAttemptReceipt — what happened during recovery
- ResolutionGraphRecord — which resolution path was chosen and why
- ExecutionDiagnostic, ExecutionObservation, ConsoleEntry — what was observed
- RunRecord — aggregate evidence for a scenario execution
- TranslationRunMetrics — how translation performed
- Timing data, cost data, budget breach detection
- Failure classification: precondition-failure, locator-degradation-failure, environment-runtime-failure
- Evidence persistence — writing to .tesseract/evidence/
- Prior evidence as resolution input — evidence feeding back into the next cycle
- Replay examples — evidence packaged for training

---

## Action Primitives

These describe how the system acts on what it knows.

### Resolution

Connecting intent to reality through knowledge. Resolution is where ambiguity lives — "the user said 'enter policy number,' what does that actually mean in the DOM right now?" The entire precedence ladder exists because resolution has many possible strategies with different confidence, cost, and fidelity.

Resolution is not a single act. It is a search through a prioritized space of strategies, where each strategy consults different knowledge at different cost, and the first adequate result wins.

**Gravitational well:**
- The 11-rung precedence ladder: explicit → control → approved-screen-knowledge → shared-patterns → prior-evidence → semantic-dictionary → approved-equivalent-overlay → structured-translation → live-dom → agent-interpreted → needs-human
- chooseByPrecedence<T, Rung> — the generic precedence algebra
- Precedence policies for resolution, data, run-selection, route-selection
- StepGrounding, GroundedStep — a fully resolved step
- ScenarioInterpretationSurface — the machine contract for one scenario
- ScenarioRunPlan — complete resolution for execution
- ScenarioKnowledgeSlice — the subset of knowledge available
- Resolution engine — registry and selection of strategies
- Resolution exhaustion — ordered record of what was tried at each rung
- Strategy registry — mapping rungs to implementations
- Pipeline DAG — resolution as a directed acyclic graph of rungs
- Comparison rules, candidate selection — choosing among alternatives
- The principle: "changing precedence is changing compiler semantics"

### Commitment

Irreversibly acting on a resolution. Before commitment, everything is reversible — you can re-resolve, re-interpret, choose a different candidate. After commitment, the application state has changed. You can't un-click.

Commitment is where the system meets reality with consequences. It is why governance concentrates at this boundary, why recovery strategies exist, and why execution receipts matter.

**Gravitational well:**
- Program execution — interpreting instructions via Playwright
- Widget dispatch — executing through widget contracts (click, fill, clear, check, select)
- Navigation execution, assertion execution
- Precondition enforcement — checking state before committing
- Recovery strategies — verify prerequisites, force alternate locators, snapshot-guided reresolution, bounded retry
- Execution modes: playwright, dry-run, diagnostic
- Execution budget — time and cost constraints
- Engagement orchestration — filling values, validating effects, checking postures
- Interaction dispatch — precondition validation, affordance execution, role-based fallback
- Parallel step analysis — dependency analysis for safe parallel commitment
- Navigation strategy — SPA vs. traditional, waitUntil variants
- The execution receipt as commitment record

### Attention

Where the system allocates its finite capacity to observe, interpret, and act. The system can't do everything at once. Every decision about what to look at, how long to try, how many candidates to consider, and which scenarios to run first is an attention decision.

The precedence ladder is partly an attention structure — check cheap sources before expensive ones. The improvement loop's bottleneck detection is fundamentally attention direction — "look here, this is where the gap is widest."

**Gravitational well:**
- Memory capacity config — how many targets/candidates/observations fit in working context
- Execution budget — time and cost limits
- Candidate limits — how many candidates per rung
- Bottleneck weights, ranking weights, DOM scoring weights — tunable attention allocation
- Screenshot policy — when to spend attention on visual capture
- Parallelism/concurrency — how many things to observe simultaneously
- Speed tier batching — prioritizing fast scenarios over slow
- Hotspot detection — finding where attention is most needed
- Knowledge freshness as attention signal — stale knowledge deserves re-observation
- Sensitivity analysis — which knobs most deserve tuning attention
- The principle: "expose the bottleneck instead of hiding it"

---

## Agency Primitives

These describe who acts and how control passes between actors.

### Agency

What kind of actor is available, with what capabilities, at what cost. The system has multiple actor types — human operators, AI agents, the deterministic compiler, the runtime executor — and they are not interchangeable. Each has different capabilities, trust levels, latencies, and costs.

Every decision point in the system has an agency question: who should handle this? The resolution ladder is partly an agency ladder: the compiler handles rungs 1-5, the agent handles 6-9, the human handles 10. The system's effectiveness depends on routing decisions to the right kind of agency at the right moment.

**Gravitational well:**
- ParticipantKind: agent, operator, system, benchmark-runner, reviewer, optimizer
- ParticipantCapability: orient, inspect, discover, record, propose, approve, reject, request-rerun, review, benchmark, replay, optimize
- Agent interpreter — heuristic or LLM-backed
- Agent session adapter — provider-agnostic interface (deterministic, copilot-vscode-chat)
- Agent workbench — the structured work surface agents operate on
- Agent decider — routing work items to agent vs. human
- The deterministic compiler — fastest, cheapest, most trusted agent
- A/B testing — comparing agent providers
- Provider registry — pluggable backends
- MCP tool surface — the protocol through which agents receive and act
- Copilot participant — VSCode integration surface
- The escalation chain: compiler → agent → human
- The cost/trust tradeoff — cheaper agents have narrower scope
- Agent-in-the-loop — real-time proposal approval during speedruns
- Browser pool — shared resource across agent activities

### Handshake

Structured context transfer between actors or phases. Every time control passes — between the compiler and runtime, between the system and an agent, between an agent and a human — there is a handshake: one party offers structured context, another accepts it and acts.

The quality of handshakes — their *fidelity* — determines system effectiveness. A work item that reaches a human without sufficient context wastes human attention. An interpretation request without an exhaustion trail forces the agent to re-derive what was already tried.

**Gravitational well:**
- WorkflowEnvelope — the universal handshake format (kind, version, stage, scope, ids, fingerprints, lineage, governance, payload)
- mapPayload — transforming contents while preserving metadata
- Stage-typed envelopes: PreparationEnvelope, ResolutionEnvelope, ExecutionEnvelope
- Task packet — compiler-to-runtime handshake
- Interpretation request — runtime-to-agent handshake
- Work item — agent-to-human handshake
- Proposal bundle — improvement-to-governance handshake
- Inbox — queue of pending human handshakes
- MCP tool invocation and resource expansion — agent handshake protocol
- Dashboard events — system-to-visualization handshakes
- WebSocket broadcast — real-time handshake delivery
- File decision bridge — cross-process handshake (MCP ↔ speedrun via filesystem)
- Review surface (review.md, proposals.json) — proposal-to-human handshake
- Intervention receipt — governance-to-system handshake
- Rerun plan — governance-to-execution handshake
- Session event vocabulary: orientation, artifact-inspection, discovery-request, observation-recorded, spec-fragment-proposed, proposal-approved/rejected, rerun-requested, execution-reviewed
- The fidelity question: does the recipient have what they need to act?

### Governance

Who decides what's allowed. Governance is the constraint surface over the entire system — it intersects every point in the epistemological loop but doesn't flow through it. Governance is political, not epistemological. It's about authority and permission, not belief and confidence.

**Gravitational well:**
- Governance states: approved, review-required, blocked
- Phantom branded types: Approved<T>, ReviewRequired<T>, Blocked<T>, Governed<T, G>
- foldGovernance — exhaustive case analysis
- Trust policy — per-artifact rules (min confidence, required evidence, forbidden auto-heal classes)
- Auto-approval policy — conditions for bypassing human review
- CertificationStatus: uncertified, certifying, certified
- Proposal activation: pending → activated → certified
- Batch decisions — grouped governance for coherent activation
- Proposal quality (coverage, consistency, risk), proposal clustering
- Contradiction detection — conflicting proposals or knowledge
- The canonical/derived split — canonical truth never self-mutates
- Promotion boundary — derived layers ratchet automatically, canonical changes require review
- Approval equivalence — derived confidence approaching (but not becoming) canonical
- Proposal quarantine — blocking toxic proposals
- The governance/confidence distinction: permission vs. belief

---

## Temporal Primitives

These describe how things change over time.

### Lifecycle

The trajectory of any concept through time. Nothing in the system is static. Targets are discovered, confirmed, tracked, and eventually go stale. Selectors start as probes, build confidence, degrade, and get replaced. Proposals are pending, then activated, then certified or rejected. Knowledge ages.

Every primitive described above has a lifecycle, and understanding the system means understanding not just what things are but where they are in their trajectory.

**Gravitational well:**
- ScenarioStatus: stub → draft → active → needs-repair → blocked → deprecated
- Selector lifecycle: probe → confirmed → stable → degraded → replaced
- Target lifecycle: discovered → confirmed → tracked → stale → lost
- Knowledge lifecycle: cold-start → warm-start → production
- Proposal lifecycle: pending → activated → certified (or rejected/quarantined)
- Confidence lifecycle: unbound → agent-proposed → agent-verified → compiler-derived → human
- Run lifecycle: planned → executing → completed → evidenced
- Discovery lifecycle: crawled → observed → proposed → reviewed → canonical
- Session lifecycle: started → accumulating → intervening → ended
- Improvement run lifecycle: substrate setup → iterations → convergence → checkpointed
- Convergence FSM: exploring → narrowing → plateau → converged
- Component maturation — tracking knowledge completeness over time
- Knowledge freshness — time since last confirmed observation
- Proposal cluster phases: approaching → evaluating → passing → reflecting → shattering → dissolved
- Dashboard flywheel acts 1-7: ground/capture → surface discovery → routing → binding → compilation → execution → evaluation
- The principle: everything ages and nothing persists without maintenance

### Rhythm

The nested timescales at which the system operates. The system doesn't run at one speed — it operates at many speeds simultaneously, and the interplay between rhythms is where much of the system's complexity lives.

**Gravitational well:**
- Step-level: observe → interpret → resolve → commit → record (ms to seconds)
- Scenario-level: compile → execute steps → receipts → proposals (seconds to minutes)
- Iteration-level: run N scenarios → classify fitness → search knobs → accept/reject (minutes)
- Speedrun-level: run M iterations → detect convergence → report (minutes to hours)
- Session-level: open inbox → review → approve → trigger reruns (hours to days)
- Knowledge-level: accumulate → drift → repair → stabilize (days to weeks)
- Pipeline stages: preparation → resolution → execution (within-scenario rhythm)
- Improvement phases: generate → compile → iterate → fitness → report
- Pipeline buffer windows — sliding metrics at specific rhythms
- Backpressure — flow control when rhythms misalign
- Ingestion queue — buffering events between rhythm boundaries
- Signal maturation — dampening signals that haven't had enough cycles
- The speedrun as rhythm compression — simulating natural timescales in minutes
- The convergence proof as rhythm validation — does compressed rhythm produce the same qualitative result?

### Drift

Knowledge diverging from changing reality. Drift is the fundamental enemy — the silent force that degrades everything the system has learned. Reality changes (deployments, redesigns, data changes) and knowledge doesn't update itself. The asymmetry: drift is silent; discovery is active. The system must actively look for drift; it doesn't announce itself.

**Gravitational well:**
- Selector drift — locators stop finding targets
- Rung drift — resolution falling to lower rungs over time
- Interpretation drift — agent interpretation quality degrading
- Execution drift — actual execution deviating from planned
- Interface graph drift — structural changes in the application
- Route drift, state transition churn — behavioral changes
- Knowledge staleness — time since last confirmation
- Dirty tracking — fingerprint-based staleness for pipeline stages
- Drift detection: rung-drift, execution-coherence, interpretation-coherence
- Drift mutations (interface fuzzer) — synthetic drift for testing robustness
- Selector health tracking — success rate, flakiness, trend
- Rung stability as inverse of drift
- Degradation controller — performance tier drift in the dashboard itself (meta-drift)

### Churn

The system working against itself. Churn is not drift — drift is reality changing underneath knowledge. Churn is the system changing its own knowledge without reality changing: thrashing, oscillating, generating and reverting proposals, re-resolving things that were already resolved.

Churn is the dark twin of convergence. Convergence asks "are the gaps shrinking?" Churn asks "is the system creating new gaps while closing old ones?"

**Gravitational well:**
- Proposal thrashing — generating and reverting the same proposals
- Iteration journal as anti-churn — memory of rejected proposals
- Pareto frontier acceptance — candidates must dominate, not just differ
- Signal maturation — dampening early signals to prevent overreaction
- Convergence stall — improvement stops but gaps remain
- Contradiction detection — proposals conflicting with each other
- Trust-policy-over-block — governance being too restrictive
- Recovery-strategy-miss — recovery that doesn't help but consumes budget
- Scoring weight mismatch — optimization pushing in the wrong direction
- Auto-approval limits — preventing runaway autonomous changes
- Batch decision coherence — ensuring grouped proposals don't contradict

### Convergence

Whether the system is getting better over time. Not any single gap — the aggregate. Convergence is the meta-question about whether the gap-closing machine itself works.

Convergence is statistical, not deterministic. It's about trajectories, not snapshots — direction matters more than position. The system may not converge, and knowing that it doesn't is as important as knowing that it does.

**Gravitational well:**
- ConvergenceTrialResult, ConvergenceVerdict, ConvergenceProofResult — the measurement apparatus
- Convergence FSM: exploring → narrowing → plateau → converged
- Convergence bounds — mathematical confidence intervals
- Convergence finale — end-of-loop analysis
- Convergence arrow — monotonic improvement direction
- Hit-rate trajectory — the primary signal
- Pareto frontier — multi-objective acceptance surface
- Objective vectors — multi-dimensional fitness
- PipelineScorecard, scorecard comparison, scorecard history
- Generalization metrics — does improvement generalize beyond training?
- Cold-start convergence proof — does the system converge from zero?
- Speedrun statistics — iteration-level metrics feeding convergence
- Binding distribution — convergence of knowledge coverage
- The convergence question as meta-question: is the gap-closing machine working?

---

## The Epistemological Loop

The primitives above are not a list — they form a loop. The system's fundamental cycle is:

```
Intent → Resolution → Commitment → Evidence → Knowledge
  ↑                                              |
  └──────────────────────────────────────────────┘
```

Every concept in the system is either:
1. **A node in this loop** — Intent, Resolution, Commitment, Evidence, Knowledge
2. **A mechanism operating on the loop** — Interpretation, Observation, Attention, Agency
3. **A constraint over the loop** — Governance
4. **An observation about the loop's behavior** — Confidence, Fitness, Drift, Churn, Convergence
5. **A record of the loop's history** — Provenance, Evidence, Lifecycle
6. **A protocol for the loop's handoffs** — Handshake, Envelope

The loop runs at every rhythm simultaneously. At the step level, it's a single resolution-commitment-evidence cycle. At the iteration level, it's many scenarios producing aggregate evidence that updates knowledge. At the speedrun level, it's many iterations producing convergence data that updates the system's own parameters.

**Target** and **Surface** sit outside the loop — they are the stable referents that the loop operates on. Targets are what the loop is *about*. Surfaces are *how* the loop perceives reality. Neither is consumed or produced by the loop; they are the ground it stands on.

**The Gap** generates the loop. If intent and reality were perfectly aligned, there would be no need for resolution, no need for knowledge, no need for any of this. The loop exists to close the gap, and the gap exists because intent and reality are different things.

---

## Derivative Concepts

Not everything in the system is a primitive. Many concepts are derivatives — they arise from the interaction of primitives and serve the loop without being foundational themselves. Recognizing what is derivative prevents elevating mechanisms to the status of concepts.

### Fitness

A measurement of how well the gap-closing is working. Fitness classifies step outcomes into failure modes (threshold-miss, normalization-gap, alias-coverage-gap, rung-skip, scoring-weight-mismatch, recovery-strategy-miss, convergence-stall, trust-policy-over-block) and computes aggregate metrics. It is the gradient of the improvement loop — without fitness, the system can execute but not improve.

Fitness is derivative of Evidence (it's computed from execution results) and serves Convergence (it feeds trajectory analysis).

### Proposal

A suggested change to knowledge, generated from evidence. Proposals are the primary learning mechanism — the bridge from "I observed something" to "we should update what we believe." They exist in the space between Evidence and Governance.

Proposals are derivative of Evidence (they're generated from execution results), mediated by Governance (which decides whether to activate them), and consumed by Knowledge (which they update when activated).

### Translation

A specific mechanism within Interpretation that maps natural language intent to structural reality using semantic matching. Translation is where the hardest ambiguity lives, but it's a mechanism, not a concept — it serves Interpretation.

### Codegen

The projection of resolved scenarios into executable Playwright code. Codegen is derivative of Resolution (it consumes grounded flows) and produces the readable test surface. It is a projection mechanism, not a domain concept.

### Graph

The dependency graph connecting canonical knowledge, derived projections, evidence, and confidence overlays. The graph is a derived projection of Provenance — it makes lineage queryable. It answers: what depends on this? Which evidence taught this overlay? Which scenarios should rerun after a change?

### Projection & Reporting

The mechanisms by which the system explains itself — scenario explanations, convergence timelines, binding distributions, summary views, scorecard rendering. These are derivative of Evidence and Convergence, projected into forms humans and agents can consume. The dashboard flywheel, the MCP resource surface, the review markdown — all projections.

### Serialization & Validation

The codification of domain concepts into schemas (Zod), validators, and persistence formats. This is infrastructure that serves all primitives without being one. It ensures artifacts are well-formed, but the concepts exist independent of their serialization.

### Kernel

The shared infrastructure underneath everything — identity generation, phantom branding, hashing, visitors, errors, collections, seeded RNG. These are the tools the primitives are built with, not primitives themselves.

---

## How to Use This Model

When adding a concept to the system, ask:

1. **Which primitive does it serve?** Every concept should gravitationally belong to one (or at most two) primitives. If it doesn't clearly belong anywhere, the concept may be under-specified.

2. **Where does it sit relative to the loop?** Is it a node, a mechanism, a constraint, an observation, a record, or a protocol? This determines its architectural placement.

3. **What gap does it address?** If a concept doesn't help close, measure, or manage a gap, it may not be necessary.

4. **What is its lifecycle?** How is it born, how does it mature, how does it degrade, how does it die? If it has no lifecycle, it may be a constant rather than a concept.

5. **At what rhythm does it operate?** Step-level? Scenario-level? Iteration-level? Session-level? Knowledge-level? This determines its governance requirements and attention budget.

6. **What agency does it require?** Can the compiler handle it? Does it need an agent? Does it need a human? This determines where in the escalation chain it lives.

When the answer to any of these questions is unclear, the concept needs more modeling — not more code.

---

## Implementation Status

The following domain primitives now have algebraic infrastructure backing them:

- **Confidence / Provenance**: Galois connection between rungs and confidence — `lib/domain/resolution/confidence-provenance.ts`
- **Resolution**: Free search trails with coverage analysis — `lib/domain/algebra/free-forgetful.ts`; strategy chain walker bridging search to runtime — `lib/runtime/agent/strategy-chain-walker.ts`
- **Governance**: Typed verdicts with fold/map/chain combinators — `lib/domain/kernel/governed-suspension.ts`
- **Convergence**: FSM definition with monotone traces and absorption verification — `lib/domain/kernel/finite-state-machine.ts`; first consumer in `lib/domain/projection/convergence-fsm.ts`
- **Observation**: Observation collapse algebra (multi-surface to single action) — `lib/domain/kernel/observation-collapse.ts`
- **Evidence / Fold**: Product folds with contramap and filter — `lib/domain/algebra/product-fold.ts`; hylomorphisms for recursive unfold-then-fold — `lib/domain/algebra/hylomorphism.ts`
- **Knowledge / Overlay**: Contextual merge from bounded lattices — `lib/domain/algebra/contextual-merge.ts`
- **Projection**: Naturality verification for slice projections — `lib/domain/algebra/slice-projection.ts`
- **Handshake**: Shared `WorkflowMetadata` base for envelopes and receipts — `lib/domain/types/workflow.ts`
