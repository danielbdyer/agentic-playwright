# Tesseract Upper Ontology

> Status: Draft — the structural invariants underneath the domain model

This document describes what Tesseract is made *of* — not its concepts (see `domain-model.md`), not its types (see `domain-ontology.md`), not its file layout (see `domain-class-decomposition.md`), but the recurring structural shapes that every concept is composed from.

The system tessellates. The same small set of shapes appears at every level: in the type system, in the runtime, in the improvement loop, in the dashboard. Understanding these shapes — and the formal structures that govern their combination — is understanding the system's actual character.

Three perspectives are combined here:

1. **Structural motifs**: the recurring data shapes (the amino acids)
2. **Formal algebras**: the mathematical structures that govern combination (the chemical bonds)
3. **Flow shapes**: the choreographic patterns that move data through time (the protein folding)

Every domain concept in Tesseract is a specific composition of motifs, assembled via algebras, choreographed through flows. There are no exceptions.

---

## Part I: Structural Motifs

These are the twelve recurring data shapes. Each is a reusable unit of structure that the system composes into larger concepts. They are listed not by importance but by the order in which they become necessary as the system attempts to close the gap between intent and reality.

### 1. The Rung

An ordered position in a finite sequence where position implies preference.

When the system must choose among alternatives — resolution strategies, confidence levels, degradation responses, escalation targets — it arranges them as rungs on a ladder and walks from top to bottom, taking the first adequate result.

The rung appears as:
- Resolution precedence: explicit → control → approved-knowledge → ... → needs-human (11 rungs)
- Confidence levels: human → agent-verified → agent-proposed → compiler-derived → intent-only → unbound
- Degradation tiers: 0 (full quality) → 1 → 2 → 3 → 4 (minimal rendering)
- Knowledge posture: production → warm-start → cold-start
- Approval equivalence: approved-equivalent → learning → needs-review
- Failure severity: error → warning → info
- Escalation: compiler → agent → human

The rung's essential property: higher is better, cheaper, or more trusted. Movement down is degradation; movement up is improvement. The system's health can be measured by *where on the ladder it typically lands*.

### 2. The Envelope

A payload wrapped in metadata that declares identity, ancestry, permission, and stage.

Everything the system produces is enveloped. The envelope ensures that no artifact is ever anonymous — it always knows who it is, where it came from, whether it's allowed to act, and what stage of processing it has reached.

The envelope appears as:
- `WorkflowEnvelope`: kind, version, stage, scope, ids, fingerprints, lineage, governance, payload
- Cache entries: kind, version, fingerprint, payload
- Dashboard events: kind, timestamp, actor, payload
- MCP resources: URI, mime, payload
- Proposal bundles: artifact type, confidence, evidence refs, patch

The envelope's essential property: the metadata is not optional and not separable. An unenveloped artifact is a bug, because it cannot participate in provenance or governance.

### 3. The Receipt

A structured record of what was attempted, what was observed, what was concluded, and what provenance attaches.

Every time the system acts — resolves a step, attempts recovery, translates intent, intervenes on knowledge — it produces a receipt. The receipt is not a log message. It is a typed, structured, provenance-bearing account that can be consumed by downstream processes.

The receipt appears as:
- `StepExecutionReceipt`: attempted action, observed result, timing, cost, failure class
- `RecoveryAttemptReceipt`: strategy tried, outcome, why it did or didn't help
- `TranslationReceipt`: translation attempted, candidates considered, winner, rationale
- `InterventionReceipt`: intervention planned, effects observed, status, lineage
- `ResolutionReceipt`: resolution attempted at each rung, exhaustion trail, winner
- `PlannedTransitionEdgeReceipt`: expected transition, actual transition

The receipt's essential property: it answers four questions — what did you try, what happened, what does it mean, and how can I verify that? Any process that acts without producing a receipt is opaque and cannot participate in learning.

### 4. The Exhaustion Trail

An ordered record of candidates tried, each annotated with why it was rejected, culminating in a winner or terminal failure.

The exhaustion trail is what distinguishes the system from a simple lookup. When resolution succeeds, the trail explains what was *also considered* and why it lost. When resolution fails, the trail explains everything that was tried before giving up. The trail makes the system's reasoning auditable.

The exhaustion trail appears in:
- Resolution exhaustion: each rung tried, outcome, rejection reason
- Recovery chains: each strategy tried, outcome, reason for failure
- Translation candidate scoring: each candidate scored, dominated candidates eliminated
- Interpretation attempts: heuristic first, then LLM, then needs-human
- The candidate lattice: multi-dimensional scoring with pruning record

The exhaustion trail's essential property: it records not just the answer but the *negative space* — everything that was considered and rejected. This negative space is often more informative than the answer itself, because it reveals where the system's knowledge is thin.

### 5. The Overlay

Derived working knowledge layered on top of canonical truth, without modifying the canon.

The system learns constantly — from evidence, from execution, from observation — but it must not silently mutate its source of truth. The overlay solves this: canonical knowledge stays immutable while accumulated observations layer on top, producing a working belief that is richer than either alone.

The overlay appears as:
- Confidence overlays: canonical elements + evidence-derived confidence scores
- Surface overlays: canonical surfaces + observation-derived enrichments
- Approval equivalence: canonical knowledge + threshold-crossing derived belief
- Semantic dictionary: canonical hints + runtime-accrued translation entries
- Proposal patches: canonical YAML + proposed deltas (before activation)

The overlay's essential property: it can only accumulate upward. Overlays join; they never retract. Retraction requires a different operation — proposal, governance review, canonical mutation — which is deliberately outside the overlay mechanism.

### 6. The Fold

A pure accumulation: walk over items, threading state, producing a result entirely determined by the input sequence and a combining function.

Whenever the system needs to derive a summary from a collection — build a graph from artifacts, compute a run record from step receipts, analyze convergence from iteration metrics — it folds. The fold guarantees determinism: same inputs, same result, regardless of when or where it runs.

The fold appears as:
- `GraphAccumulator`: fold over artifacts to build the derived dependency graph
- `SceneStateAccumulator`: fold over steps and runs to build aggregate state
- `RunRecord` builder: fold over step receipts to build scenario evidence
- `ConvergenceFinale`: fold over iterations to build final convergence analysis
- Binding distribution: fold over knowledge to compute coverage
- Translation metrics: fold over step results to compute hit/miss rates
- Envelope mergers: fold over envelopes preserving lineage

The fold's essential property: it is referentially transparent. A fold is a proof of deterministic derivation — the result is a pure function of its inputs. The codebase calls these "compiler-derived" artifacts, and their determinism is what makes them auto-approved by governance.

### 7. The Staged Pipeline

Items flowing through named stages with typed handoffs, where each stage refines the item and the type system prevents regression.

The system processes everything through pipelines where each stage has a known input type, a known output type, and a typed boundary between them. The phantom brands on envelopes are the type-level proof of which stage an artifact has reached — you cannot pass a preparation-stage artifact to an execution-stage consumer.

The staged pipeline appears as:
- Preparation → Resolution → Execution (the core compilation pipeline)
- Pending → Activated → Certified (proposal lifecycle)
- Exploring → Narrowing → Plateau → Converged (convergence FSM)
- Stub → Draft → Active → Needs-repair → Blocked → Deprecated (scenario lifecycle)
- Approaching → Evaluating → Passing → Reflecting → Shattering → Dissolved (proposal cluster visualization)
- Acts 1-7 of the dashboard flywheel

The staged pipeline's essential property: stages are forward-only. The type system enforces this — there is no operation that takes a `ResolutionEnvelope` back to a `PreparationEnvelope`. Forward-only staging is what makes the pipeline a proof of progressive refinement rather than arbitrary state mutation.

### 8. The Candidate Set

Multiple options with scores, a selection mechanism, a winner (or none), and a record of why every alternative was eliminated.

Whenever the system faces a choice among alternatives — which selector to use, which translation to trust, which config perturbation to accept, which proposal to activate — it assembles a candidate set, scores every candidate, selects the best, and records the full evaluation. The candidate set is the exhaustion trail's twin: the trail records sequential search; the candidate set records parallel evaluation.

The candidate set appears in:
- Resolution candidates: multiple rungs produce options, lattice selects
- Translation candidates: multiple semantic matches, scoring selects
- Improvement candidates: config perturbations, Pareto frontier selects
- Proposal clusters: multiple proposals, quality scoring ranks
- Route variant ranking: multiple URL variants, composite score selects
- DOM element scoring: multiple elements found, weighted scoring selects

The candidate set's essential property: selection is justified. No candidate is chosen without a score, and no candidate is eliminated without a reason. The scored candidate set is the atom of *explainable choice*.

### 9. The Signal

A typed observation about system health carrying kind, magnitude, source, and directionality.

The system monitors itself constantly, and every monitoring observation takes the same shape: a named signal kind, a numeric magnitude, an identification of where in the system it was observed, and a direction (improving or degrading). Signals compose linearly: aggregate signals from multiple sources by weighted addition.

The signal appears as:
- Learning signals: timing-regression, selector-flakiness, recovery-efficiency, console-noise, cost-efficiency, rung-stability, component-maturity
- Bottleneck signals: thin-screen-coverage, repair-hotspot, low-provenance, high-unresolved, translation-fallback-dominant
- Improvement signals: the 8 failure mode classifications
- Drift signals: rung drift, interpretation drift, execution drift
- Convergence signals: hit-rate delta, proposal count, budget consumed

The signal's essential property: signals are the system's proprioception. They give the improvement loop a *direction* to move in. Without signals, the system can act but cannot adapt. Signals are the gradient of the gap.

### 10. The Projection

A derived read-only view of shared truth, shaped for a specific consumer.

The system maintains one underlying truth — the canonical knowledge, the evidence, the derived graph — but different actors need different views of it. The projection takes the shared truth and reshapes it without altering it, producing a view that is optimized for a particular audience or purpose.

The projection appears as:
- Scenario explanation: truth shaped for human QA review
- Dashboard events: truth shaped for real-time visualization
- Scorecard: truth shaped for improvement decisions
- Inbox items: truth shaped for operator action
- MCP resources: truth shaped for agent tool consumption
- Generated specs: truth shaped for Playwright execution
- Review markdown: truth shaped for pull request review
- Summary views: truth shaped for aggregate understanding

The projection's essential property: all projections of the same truth must be coherent. If the dashboard shows one thing and the inbox shows a contradictory thing, the system is broken — not because the data is wrong, but because a projection violated the coherence invariant.

### 11. The Branded Phantom

A compile-time tag that encodes invisible but enforced constraints, carried in the type system but erased at runtime.

The system uses phantom types to make certain guarantees uncheckable at runtime but unbypassable at compile time. A value branded `Approved<T>` is the same bytes as a plain `T`, but the type system proves it has passed through an approval gate. The only way to construct it is through the designated proof function.

The branded phantom appears as:
- `Approved<T>`, `ReviewRequired<T>`, `Blocked<T>`: governance brands
- `SourcedCandidate<T, Rung>`: resolution source brands
- `StagedEnvelope<T, Stage>`: pipeline stage brands
- Strong ID types (`AdoId`, `ScreenId`, `ElementId`): identity brands

The branded phantom's essential property: it turns runtime checks into compile-time proofs. Every `foldGovernance` call is proof by exhaustive case analysis. Every stage-branded envelope is proof of progress through the pipeline. The branded phantom is the system's mechanism for making governance *structural* rather than *procedural*.

### 12. The Slice

A focused subset of the whole, assembled for a specific task, containing exactly what is needed and nothing more.

The system's full state — all knowledge, all evidence, all configuration — is too large for any single operation to consume. The slice extracts the relevant subset, producing a bounded context that an operation can work with efficiently and without distraction.

The slice appears as:
- `ScenarioKnowledgeSlice`: knowledge relevant to one scenario
- `InterfaceResolutionContext`: knowledge available for one resolution
- `SemanticRetrievalContext`: dictionary state for one matching operation
- Execution context (`FiberRef`): adoId, runId, stage, iteration for one fiber
- `SubstrateContext`: synthetic/production/hybrid for one experiment
- `ScreenGroupContext`: targets and knowledge for one screen group

The slice's essential property: it is a *faithful* subset — everything in the slice is also in the whole, with no transformation or distortion. The slice is a monomorphism (injection) back into the full state. This faithfulness is what allows operations on slices to be composed into operations on the whole.

---

## Part II: Formal Algebras

Each motif has a mathematical structure that governs how instances of that motif combine, compose, and interact. These are the chemical bonds — the rules that determine which compositions are valid and which are nonsensical.

### Total Order (governs: Rung)

The Rung is a **finite totally ordered set** (a chain). Every pair of rungs is comparable — given any two, one is definitively above the other. The operations are `min`, `max`, and the ordering relation `≤`.

But the Rung carries more than order. There is a **monotone quality function** `q : Rung → Quality` where higher rungs map to higher quality (more trust, less cost, less ambiguity). The system's fundamental strategy — walk from top to bottom, take the first adequate result — is `findFirst : (Rung → Maybe a) → Chain → Maybe a`. This operation is the same whether resolving a step, selecting a data source, or escalating agency.

The Rung also participates in a **Galois connection** between the lattice of evidence and the chain of rungs. There is an abstraction function `α : Evidence → Rung` (this evidence places us at this rung) and a concretization `γ : Rung → Set<Evidence>` (this rung implies this class of evidence). The pair `(α, γ)` satisfies the Galois condition: `α(e) ≤ r ⟺ e ∈ γ(r)`. This is what makes rung-drift meaningful — it measures movement in the abstract lattice that the Galois connection defines.

### Join-Semilattice (governs: Overlay)

The Overlay is a **join-semilattice**: a set with a binary operation `⊔` (join) that is associative, commutative, and idempotent.

- Associative: `(a ⊔ b) ⊔ c = a ⊔ (b ⊔ c)` — grouping observations differently gives the same working belief
- Commutative: `a ⊔ b = b ⊔ a` — order of observation doesn't matter for final state
- Idempotent: `a ⊔ a = a` — observing the same thing twice changes nothing

Canonical truth is the **bottom element** `⊥`. Every overlay satisfies `⊥ ⊔ a = a` — overlaying on nothing gives the observation itself. The critical constraint: **there is no meet** in the overlay algebra. You can join (accumulate) but you cannot meet (retract). Retraction lives outside the semilattice, in the governance domain, where it requires a different kind of operation (proposal → review → canonical mutation).

The governance layer, by contrast, *does* form a full **lattice** with both join and meet: `Approved ⊓ Blocked = Blocked` (the stricter permission wins). This is the formal reason governance and confidence are different: confidence is a semilattice (join-only); governance is a lattice (join and meet).

### Catamorphism / F-Algebra (governs: Fold)

The Fold is a **catamorphism** — the unique arrow from an initial algebra to any carrier algebra, guaranteed to exist by Lambek's lemma.

Given:
- A functor `F` describing the shape of one step (e.g., one step receipt, one graph delta)
- An initial algebra `μF` (the recursive structure, e.g., a list of step receipts)
- A carrier algebra `φ : F(A) → A` (the combining function, e.g., accumulate timing + cost + hit/miss)

The catamorphism `cata(φ) : μF → A` is the unique structure-preserving map. It is the *only* function from the structure to the result that respects the algebra.

This uniqueness is the formal backing of "deterministic derivation." The codebase calls catamorphism outputs `compiler-derived` and auto-approves them through governance. The justification is algebraic: a catamorphism is deterministic by construction. Same inputs, same combining function, same result — always.

The codebase also exploits **catamorphism fusion**: `f ∘ cata(φ) = cata(ψ)` when `f ∘ φ = ψ ∘ F(f)`. This law lets two sequential folds merge into a single pass, which is how the system can derive graph + metrics + evidence + proposals in one traversal of the step results.

### Comonad / Env w (governs: Envelope)

The Envelope is a **comonad** — specifically the `Env w` (environment/coreader) comonad, where `w` is the metadata type and the wrapped value is the payload.

A comonad provides three operations:
- `extract : W a → a` — pull the payload out of the envelope
- `duplicate : W a → W (W a)` — nest the envelope inside itself, making the context available as data
- `extend : (W a → b) → W a → W b` — apply a context-dependent function while preserving the envelope structure

In Tesseract, `extract` is reading the payload. `duplicate` is what happens when an envelope is wrapped in a higher-level envelope (a `WorkflowEnvelope` containing step envelopes, each of which contains its own metadata). `extend` is the operation of transforming a payload while threading the metadata forward — `mapPayload` in the codebase.

The comonadic laws guarantee that metadata propagation is coherent:
- `extract ∘ duplicate = id` — unwrapping a duplicated envelope gives you back the original
- `fmap extract ∘ duplicate = id` — extracting from the inner layer of a duplicated envelope gives the original
- `duplicate ∘ duplicate = fmap duplicate ∘ duplicate` — nesting is associative

This associativity is the formal reason that lineage composition works: enveloping an envelope that was already enveloped produces the same provenance chain regardless of how the nesting was performed. The codebase relies on this when it threads `lineage` arrays through multi-stage processing — the result is the same whether you compose lineage at each stage or batch-compose at the end.

### Writer Monad / Free Monoid (governs: Receipt)

The Receipt is a **writer monad** — a computation that produces a value while accumulating a log in a monoid.

The writer monad `Writer w a` provides:
- `tell : w → Writer w ()` — append an observation to the log
- `listen : Writer w a → Writer w (a, w)` — expose the accumulated log alongside the result
- `pass : Writer w (a, w → w) → Writer w a` — post-process the log

The monoid `w` for receipts is the **free monoid** (a list): receipt entries append sequentially, with `[]` as identity and `++` as the combining operation.

In the codebase, every process that acts produces receipt entries as side-output: `StepExecutionReceipt`, `RecoveryAttemptReceipt`, `TranslationReceipt`. These accumulate in order, and no entry is ever retracted or modified after emission. The free monoid structure guarantees:
- Associativity: `(a ++ b) ++ c = a ++ (b ++ c)` — grouping receipt batches differently doesn't change the trail
- Identity: `[] ++ a = a = a ++ []` — a process that observes nothing contributes nothing

The writer structure is what makes receipts *composable across process boundaries*. When a resolution receipt includes recovery attempt sub-receipts, this is `censor` (the dual of `pass`) — the sub-process's log is embedded inside the parent's log. The nested structure is a tree of writers, which is itself a writer on the free monad of trees.

### Free Monad (governs: Exhaustion Trail)

The Exhaustion Trail is a **free monad** over the functor of "try one candidate and decide whether to continue."

Given a functor `F` describing one step of a search:
```
F x = Candidate × (Outcome → x | Done)
```

The free monad `Free F a` is the recursive unfolding of this functor — a tree of attempts where each node is a candidate tried, each branch is an outcome observed, and each leaf is either a winner or terminal failure.

The free monad provides:
- `Pure a` — search terminated with result `a` (winner found)
- `Free (F (Free F a))` — one more candidate to try, with the continuation depending on its outcome

The key property is that the free monad **separates the description of the search from its execution**. The exhaustion trail is not just a log of what happened — it is a replayable program that could be re-executed with different interpreters (a testing interpreter that replays recorded outcomes, an analysis interpreter that computes coverage, a visualization interpreter that renders the decision tree).

In the codebase, the resolution pipeline walks rungs top-to-bottom, trying each one and recording the outcome. The exhaustion trail it produces is the free monad's trace: each node says "tried rung N, observed outcome O, decided to continue/stop." The trail can be interpreted by:
- The learning system (to identify which rungs are thin)
- The dashboard (to visualize the resolution waterfall)
- The improvement loop (to propose interventions at weak rungs)

### Indexed Monad (governs: Staged Pipeline)

The Staged Pipeline is an **indexed monad** — a monad parameterized by two type indices representing the *pre-state* and *post-state* of a computation.

An indexed monad `IxMonad m` provides:
- `ireturn : a → m i i a` — a computation that starts and ends at the same stage
- `ibind : m i j a → (a → m j k b) → m i k b` — sequencing where the post-state of the first must equal the pre-state of the second

The indices `i`, `j`, `k` are the pipeline stages: `Preparation`, `Resolution`, `Execution`. The type system enforces that you cannot compose a `m Preparation Resolution a` with a `m Execution Done b` — the indices don't align. Stages are forward-only because the indexed monad's sequencing operator *requires* the handoff point to match.

In the codebase, this appears as phantom-branded envelopes: a `StagedEnvelope<T, 'preparation'>` can only be consumed by the resolution phase, which produces a `StagedEnvelope<T, 'resolution'>`, which can only be consumed by execution. The branded phantom (motif 11) is the *runtime encoding* of the indexed monad's type indices. The `ibind` is the pipeline's stage-to-stage handoff function.

The indexed monad also governs the proposal lifecycle (`Pending → Activated → Certified`), the convergence FSM (`Exploring → Narrowing → Plateau → Converged`), and the scenario lifecycle (`Stub → Draft → Active → ...`). Each is a different instantiation of the same algebraic structure: a monad whose type indices enforce forward-only progression.

### Graded Monoid / Tropical Semiring (governs: Signal)

The Signal is governed by a **graded monoid** — a monoid where each element carries a *grade* (kind + magnitude) and composition respects the grading.

A graded monoid `(M, ⊕, ε, grade)` satisfies:
- `grade(a ⊕ b) = grade(a) + grade(b)` — combining signals combines their grades
- `grade(ε) = 0` — no signal contributes zero

But Tesseract's signals live in a richer structure: the **tropical semiring** `(ℝ ∪ {∞}, min, +, ∞, 0)`. In the tropical semiring, "addition" is `min` (the most urgent signal wins) and "multiplication" is `+` (costs accumulate). This is exactly the algebra of bottleneck detection:

- When multiple signals compete for attention, the system takes the `min` — the worst bottleneck
- When signals compose along a path (a chain of degradations), costs `+` accumulate
- The identity for `min` is `∞` (no bottleneck) and the identity for `+` is `0` (no cost)

The tropical semiring is why the scorecard can compute "where is the bottleneck?" as a shortest-path problem. Each signal is an edge weight. The bottleneck is the shortest tropical path from "current state" to "needs attention." The 8 failure mode classifications, the 7 learning signal types, the drift signals — all compose in this algebra to produce a single ranked priority list for the improvement loop.

### Natural Transformation (governs: Projection)

The Projection is a **natural transformation** — a family of morphisms `η_X : F(X) → G(X)` that commutes with every morphism in the source category.

Given two functors `F` and `G` from truth to views:
- `F` = the shared truth (knowledge + evidence + graph)
- `G` = a consumer-specific view (dashboard, inbox, scorecard, generated spec)

A natural transformation `η : F ⇒ G` satisfies the naturality square: for every morphism `f : X → Y` in the source, `G(f) ∘ η_X = η_Y ∘ F(f)`. In plain terms: it doesn't matter whether you first update the truth and then project, or first project and then update the view — the result is the same.

This naturality condition is precisely the **coherence invariant** stated in the Projection motif: "all projections of the same truth must be coherent." If the dashboard projection and the inbox projection are both natural transformations from the same functor, then they automatically agree on any change to the underlying truth. Incoherence between views is a naturality violation — a bug in the transformation, not in the data.

The codebase has multiple projections: scenario explanation, dashboard events, scorecard, inbox items, MCP resources, generated specs, review markdown. Each is a different natural transformation from the same source functor. The coherence guarantee is not checked at runtime — it is a design invariant enforced by the constraint that every projection reads from the same derived graph and evidence, never from a private copy.

### Refinement Type / Proof Term (governs: Branded Phantom)

The Branded Phantom is a **refinement type** — a type `{ x : T | P(x) }` where `P` is a predicate that has been proven to hold, and the proof is witnessed by the type's construction.

In a dependently-typed language, `Approved<T>` would be `Σ(t : T). approved(t)` — a pair of the value and a proof that it has passed governance. In TypeScript, the proof is simulated via phantom branding: the only way to construct an `Approved<T>` is through `foldGovernance`, which performs exhaustive case analysis on the governance state. The brand is the *proof term* — its existence in the type is evidence that the check occurred.

The refinement type algebra has two key operations:
- **Introduction**: constructing a refined value requires exhibiting a proof. `foldGovernance` is the introduction rule for governance brands. The resolution pipeline's rung-tagging functions are the introduction rules for source brands.
- **Elimination**: consuming a refined value may rely on the predicate. A function that accepts `Approved<T>` can skip the governance check — the type *is* the check.

The critical algebraic property: refinement types form a **preorder** under implication. `Approved<T>` implies `ReviewRequired<T>` (anything approved also passes review), but not vice versa. `Blocked<T>` implies nothing useful. This preorder is what `foldGovernance` exhaustively traverses — it is proof by cases over a finite preorder.

### Pullback / Fiber (governs: Slice)

The Slice is a **pullback** — a categorical limit that extracts the fiber over a point.

Given:
- A total state `S` (all knowledge, all evidence, all configuration)
- A focus function `f : S → Index` (e.g., map state to scenario ID)
- A point `i : Index` (one specific scenario)

The pullback (fiber) is `f⁻¹(i) = { s ∈ S | f(s) = i }` — the subset of total state that maps to the chosen index. The slice `ScenarioKnowledgeSlice` is `f⁻¹(adoId)`: all knowledge whose index is this scenario.

The pullback satisfies the **universal property**: for any other object `X` with maps to both `S` and `Index` that agree, there is a unique map from `X` to the pullback. This universality is the formal backing of the slice's "faithfulness" property — the slice is the *largest* faithful subset. There is no larger subset of `S` that is still indexed by exactly `i`.

The pullback also composes: slicing by scenario and then by screen is the same as slicing by the product index `(scenario, screen)`. This composition is what allows `InterfaceResolutionContext` (sliced by scenario + screen + element) to be built incrementally from larger slices — each narrowing is a further pullback, and pullbacks compose.

### Modal Logic (governs: Candidate Set + Governance cross-cutting)

The Candidate Set and the governance system jointly inhabit a **multi-modal logic** combining epistemic, deontic, temporal, and linear modalities.

**Epistemic** (knowledge modality, `K`): `K_agent(φ)` means "the agent knows φ." The confidence ladder is a graded epistemic modality — `human-verified` is `K_human(φ)`, `agent-proposed` is `B_agent(φ)` (belief, not knowledge), `compiler-derived` is `□φ` (necessary truth, derived from axioms). The resolution pipeline's rung selection is an epistemic descent: try the strongest knowledge first, fall back to weaker belief.

**Deontic** (permission modality, `O`, `P`): `O(review)` means "review is obligatory." The governance brands encode deontic modalities — `Approved` is `P(execute)` (permitted to execute), `Blocked` is `¬P(execute)` (forbidden), `ReviewRequired` is `O(review) ∧ ¬P(execute)` (obligated to review before permission). `foldGovernance` is case analysis over deontic states.

**Temporal** (stage modality, `◇`, `□`): `◇converged` means "eventually converges." The convergence FSM's states are temporal modalities — `Exploring` is `◇narrowing` (will eventually narrow), `Plateau` is `□¬improving ∧ ◇converged` (stably not improving but will eventually converge). The improvement loop's termination condition is the temporal formula `□(proposals = 0) → converged`.

**Linear** (resource modality): `A ⊸ B` means "consuming A produces B exactly once." The proposal lifecycle is linear — activating a proposal consumes it (it cannot be activated twice). The budget in the improvement loop is a linear resource — each iteration consumes budget, and when budget is exhausted, the loop must terminate. Linear types prevent the double-spend of proposals and the over-consumption of improvement budget.

These four modalities interleave throughout the system. A single decision — "should this proposal be activated?" — simultaneously involves epistemic judgment (is the evidence sufficient?), deontic permission (does governance allow it?), temporal reasoning (is now the right time?), and linear resource management (do we have budget?). The candidate set's scoring mechanism is the decision procedure for this multi-modal logic.

---

## Part III: Flow Shapes

These are the eight choreographic patterns that move data through time. If motifs are the amino acids and algebras are the chemical bonds, flow shapes are the protein folding — the dynamic three-dimensional structure that emerges when static pieces are composed under force.

### 1. The Kleisli Chain

A sequence of effectful computations where each step's output feeds the next step's input, threaded through a monad.

The Kleisli chain is the system's bread and butter: `a → M b → M c → M d` where `M` is `Effect<A, E, R>`. Every pipeline — preparation, resolution, execution, improvement — is a Kleisli chain. The monad handles the plumbing (errors, dependencies, concurrency) while the chain handles the logic.

The Kleisli chain appears as:
- The compilation pipeline: parse scenario → resolve bindings → generate task packet → emit spec
- The resolution waterfall: try rung 1 → try rung 2 → ... → try rung N → needs-human
- The recovery chain: detect failure → classify → select strategy → attempt → assess
- The translation chain: extract intent → match semantics → score candidates → select winner

The Kleisli chain's essential flow property: **composition is invisible**. `f >=> g >=> h` looks like a pipeline of pure functions but carries effects. This invisibility is why the codebase reads as straightforward sequential logic despite threading Effect throughout — the Kleisli composition hides the monadic plumbing behind `yield*` in `Effect.gen`.

### 2. The Recursive State Machine (coalgebra / anamorphism)

A state that unfolds into observations and a next state, running until a termination condition is met.

Where the fold (catamorphism) collapses structure into a value, the recursive state machine (anamorphism) *generates* structure from a seed. It is the dual: `unfold : (S → F S) → S → νF`. Given a state and a transition function, it produces a potentially infinite stream of observations.

The recursive state machine appears as:
- The convergence FSM: `LoopState → (signals, LoopState)` iterated until converged or budget-exhausted
- The improvement loop: `(Knowledge × Config) → (proposals, Knowledge' × Config')` iterated until stable
- The scenario lifecycle: `ScenarioState → (events, ScenarioState')` driven by execution outcomes
- The degradation cascade: `DegradationTier → (rendering, DegradationTier')` driven by failure signals

The recursive state machine's essential flow property: **it is productive**. Each step must produce at least one observable output before requesting the next state. This productivity guarantee is what makes the convergence FSM well-defined — every iteration produces a scorecard delta, even if the system hasn't converged. The system never goes silent; it always tells you what it's doing, even when what it's doing is waiting.

### 3. The Braid (product of indexed monads)

Multiple indexed monads running in parallel, with typed synchronization points where their states must agree.

The Braid is what happens when the system's concern lanes — intent, knowledge, control, resolution, execution, governance — each have their own staged pipeline (indexed monad) but must synchronize at cross-lane handoffs. The braid is the *product* of these indexed monads, with synchronization constraints enforced at the type level.

The braid appears as:
- The six-lane architecture: intent processing ‖ knowledge loading ‖ control binding ‖ resolution ‖ execution ‖ governance, braided at the `WorkflowEnvelope` handoff points
- Preparation × Resolution × Execution: three stages running with typed handoffs, where preparation's output type must match resolution's input type
- The improvement loop's parallel tracks: evidence collection ‖ signal analysis ‖ proposal generation ‖ activation decisions, synchronized at iteration boundaries
- Dashboard event streaming ‖ inbox item generation ‖ scorecard computation: three projection streams from the same truth, braided by coherence

The braid's essential flow property: **synchronization points are typed**. The product of indexed monads `m₁ i₁ j₁ a × m₂ i₂ j₂ b` can only synchronize when a compatibility relation holds between `j₁` and `i₂` (or vice versa). The `WorkflowEnvelope`'s stage brands are the synchronization types — they ensure that lane A's output is compatible with lane B's input at every braid crossing. A mismatched braid is a type error, not a runtime failure.

### 4. The Closed Circuit (endomorphism on Knowledge × Config)

A function from the system's state back to itself, forming a loop that converges toward a fixed point.

The Closed Circuit is the shape of the improvement loop at its most abstract: `f : (Knowledge × Config) → (Knowledge × Config)`. The system takes its current knowledge and configuration, runs a batch of scenarios, observes what happened, generates proposals, activates the good ones, and produces updated knowledge and configuration. Then it does it again.

The closed circuit appears as:
- The speedrun loop: `(Knowledge, Config, Budget) → (Knowledge', Config', Budget')` iterated until convergence
- The dogfood loop: the speedrun loop wrapped in trial-level iteration with cross-trial learning
- Knowledge refinement: `Knowledge → Evidence → Knowledge'` where evidence updates confidence overlays
- Config perturbation: `Config → Signals → Config'` where signals drive parameter adjustment

The closed circuit's essential flow property: **it has a fixed point**. The Banach fixed-point theorem applies when the endomorphism is a contraction — each iteration moves the state closer to the fixed point by a bounded factor. The convergence FSM monitors this: when the delta between iterations drops below threshold (`Plateau`), the system is approaching the fixed point. When proposals reach zero (`Converged`), it has arrived. The formal guarantee is that a contracting endomorphism on a complete metric space converges — the system's convergence is not hoped for but *proven by the algebra of the circuit*.

### 5. The Saga (choreographic compensation)

A long-running distributed computation where each step has a compensating action, and failure at any point triggers reverse compensation of all completed steps.

The Saga is the shape of recovery. When a scenario execution fails partway through, the system doesn't just report failure — it unwinds: reverting state changes, recording what was attempted, cleaning up partial artifacts. Each step in the execution has an implicit or explicit compensator, and the saga orchestrator knows how to run them in reverse order.

The saga appears as:
- Recovery chains: each recovery strategy is a saga step; if the chosen strategy fails, it compensates (restores pre-recovery state) before trying the next
- The degradation cascade: each degradation tier is a saga step; if a degradation proves insufficient, the system compensates (restores the higher-tier rendering) before stepping down further
- Proposal activation: activating a proposal is a saga — write knowledge file, update overlay, recompute graph. If any step fails, compensate by rolling back the partial writes
- The improvement iteration: each iteration is a saga step in the speedrun. If an iteration produces a regression (hit rate drops), the compensator reverts the knowledge changes from that iteration

The saga's essential flow property: **partial failure is handled, not hidden**. The saga ensures that the system never ends up in a half-mutated state. Either all steps succeed and the saga commits, or compensation restores a known-good state. The `RecoveryAttemptReceipt` is the saga's compensation log — it records not just what was tried but what was undone.

### 6. Fiber Suspension (algebraic effects with resumable handlers)

A computation that can suspend at typed effect boundaries, yielding control to a handler that may inspect, modify, or resume the computation.

Fiber Suspension is the shape of the system's interaction with humans and agents. When the resolution pipeline reaches `needs-human`, it doesn't crash — it *suspends*. The fiber yields an effect (`NeedsHumanInput`) that a handler can catch. The handler might prompt an operator, consult an agent, or queue an inbox item. When the answer arrives, the fiber *resumes* exactly where it left off.

Fiber suspension appears as:
- `needs-human` resolution: the compilation fiber suspends, yielding a request for human input; the inbox handler catches it, creates an inbox item, and resumes when the operator responds
- MCP decision mode: the improvement loop fiber suspends at iteration boundaries, yielding a `NeedsDecision` effect; the file-backed decision bridge watches for decision files and resumes the fiber
- Agent intervention: the execution fiber suspends when it encounters an unresolvable step, yielding an `AgentIntervention` effect; the agent host adapter handles it and resumes
- Dashboard pause/resume: the speedrun fiber can be suspended by operator command and resumed later

The fiber suspension's essential flow property: **suspension is typed and the continuation is preserved**. The suspended fiber carries its full continuation — all local state, all pending operations, the exact point of suspension. This is not a callback or a promise; it is a first-class delimited continuation. Effect's `FiberRef` and `yield*` are the runtime encoding of algebraic effect handlers. The system can suspend arbitrarily deep in a call stack and resume cleanly because the continuation is a value, not a control flow state.

### 7. Nested Recursion (mutual recursion across abstraction levels)

Multiple recursive loops nested inside each other, where the inner loop's termination feeds the outer loop's state transition.

The system has three levels of recursion, each nested inside the next:
- **Innermost**: scenario execution — run one scenario, retry failed steps, produce a run record
- **Middle**: speedrun iteration — run all scenarios in a batch, collect evidence, generate proposals, activate, update knowledge, repeat
- **Outermost**: dogfood/convergence trial — run a full speedrun from scratch, measure convergence, compare across trials

Each level's output is the next level's input signal. Scenario run records feed iteration-level evidence. Iteration evidence feeds trial-level convergence metrics. Trial convergence feeds cross-trial learning signals.

Nested recursion appears as:
- `dogfood.ts` → `speedrun.ts` → `run-scenario.ts`: three nested `Effect.gen` loops with distinct termination conditions
- Convergence proof: outer loop (trials) × middle loop (iterations) × inner loop (scenarios) = three levels of recursive state machines composed
- Recovery within execution: inner retry loop nested inside the scenario execution loop
- Knowledge accumulation: iteration-level overlays compose into trial-level overlays compose into cross-trial canonical updates

The nested recursion's essential flow property: **each level has its own clock and its own convergence criterion**. The inner loop converges when a scenario passes. The middle loop converges when proposals reach zero. The outer loop converges when cross-trial variance drops below threshold. These clocks are independent but nested — the inner clock ticks many times per middle tick, the middle ticks many times per outer tick. The system's total behavior is the product of these nested temporal rhythms.

### 8. Structured Concurrency (dependency DAG with bounded parallelism)

A computation DAG where independent branches run concurrently, dependent branches wait, and the parent scope owns all child lifetimes.

Structured concurrency is the shape of batch execution: when the system has N scenarios to run, it doesn't run them sequentially or unboundedly parallel. It builds a dependency graph (which scenarios share fixtures? which share knowledge? which are independent?), schedules independent scenarios concurrently up to a parallelism bound, and ensures that all child fibers are owned by the parent scope — if the parent is cancelled, all children are cancelled.

Structured concurrency appears as:
- Batch scenario execution: `Effect.forEach` with `{ concurrency: N }` over independent scenarios
- The preparation pipeline: parse all scenarios concurrently, then resolve all bindings concurrently (where independent), then emit all specs
- Graph derivation: fold over artifacts where independent sub-graphs can be computed concurrently and merged
- Dashboard event fan-out: multiple projection computations running concurrently from the same evidence stream
- MCP tool handlers: concurrent tool invocations bounded by the server's capacity

The structured concurrency's essential flow property: **lifetime is scoped**. Every concurrent fiber exists within a scope, and the scope's termination guarantees cleanup of all fibers within it. There are no orphaned fibers, no leaked resources, no zombie processes. Effect's `Scope` and `forkScoped` are the runtime encoding. This structural guarantee is what allows the system to run aggressive parallelism without fear — the worst that can happen is that a scope closes early and its children are cleanly interrupted.

---

## Part IV: The Composition Table

Every domain primitive from the domain model (`domain-model.md`) is a specific composition of motifs, algebras, and flows. This table makes the composition explicit.

| Domain Primitive | Primary Motifs | Primary Algebras | Primary Flows |
|---|---|---|---|
| **Intent** | Envelope, Slice | Comonad | Kleisli Chain |
| **Reality** | Signal, Projection | Natural Transformation | Recursive State Machine |
| **Target** | Branded Phantom, Rung | Refinement Type, Total Order | Kleisli Chain |
| **Surface** | Overlay, Projection | Join-Semilattice, Natural Transformation | Structured Concurrency |
| **Knowledge** | Overlay, Slice, Envelope | Join-Semilattice, Comonad | Closed Circuit |
| **Observation** | Receipt, Signal | Writer Monad, Graded Monoid | Kleisli Chain |
| **Interpretation** | Candidate Set, Exhaustion Trail | Free Monad, Graded Monoid | Kleisli Chain, Fiber Suspension |
| **Confidence** | Rung, Branded Phantom | Total Order, Refinement Type | — |
| **Provenance** | Envelope, Receipt | Comonad, Writer Monad | — |
| **Evidence** | Receipt, Overlay, Fold | Writer Monad, Catamorphism, Join-Semilattice | Recursive State Machine |
| **Resolution** | Rung, Exhaustion Trail, Candidate Set | Total Order, Free Monad, Modal Logic | Kleisli Chain, Fiber Suspension |
| **Commitment** | Staged Pipeline, Branded Phantom | Indexed Monad, Refinement Type | Saga |
| **Attention** | Slice, Signal | Pullback, Graded Monoid | Structured Concurrency |
| **Agency** | Staged Pipeline, Receipt | Indexed Monad, Writer Monad | Fiber Suspension, Saga |
| **Handshake** | Envelope, Staged Pipeline | Comonad, Indexed Monad | Braid |
| **Governance** | Branded Phantom, Candidate Set | Refinement Type, Modal Logic | Fiber Suspension |
| **Lifecycle** | Staged Pipeline, Signal | Indexed Monad, Graded Monoid | Recursive State Machine |
| **Rhythm** | Fold, Signal | Catamorphism, Graded Monoid | Nested Recursion |
| **Drift** | Signal, Overlay | Graded Monoid, Join-Semilattice | Recursive State Machine |
| **Churn** | Signal, Exhaustion Trail | Graded Monoid, Free Monad | Closed Circuit |
| **Convergence** | Fold, Signal, Staged Pipeline | Catamorphism, Graded Monoid, Indexed Monad | Closed Circuit, Nested Recursion |
| **The Gap** | Signal, Projection, Rung | Graded Monoid, Natural Transformation, Total Order | Closed Circuit |

### Reading the table

Each row is a recipe. To understand **Resolution**, for instance:

- **Motifs**: It uses Rungs (the 11-level precedence ladder), Exhaustion Trails (recording what was tried at each rung), and Candidate Sets (scoring alternatives within a rung).
- **Algebras**: The Rungs form a Total Order (walk top-to-bottom). The trail is a Free Monad (replayable search). The candidate scoring uses Modal Logic (epistemic confidence + deontic permission).
- **Flows**: The resolution pipeline is a Kleisli Chain (each rung feeds the next). When it reaches `needs-human`, it uses Fiber Suspension (pause and resume when the human responds).

No primitive uses all 12 motifs or all 12 algebras. Each is a *selective* composition — the minimum set of structural pieces needed to express that concept. The table reveals which motifs are most fundamental (Envelope and Signal appear in the most rows) and which flows are most pervasive (Kleisli Chain and Recursive State Machine touch the most primitives).

---

## Part V: Tessellation Patterns

The table in Part IV shows that the 22 primitives are not 22 independent inventions. They are 22 different ways of composing the same small vocabulary. But the composition is not random — it follows deeper patterns.

### Pattern 1: The Epistemic Gradient

Six primitives form a chain of increasing epistemic certainty:

```
Intent → Interpretation → Observation → Evidence → Knowledge → Confidence
```

Each step adds structure: Intent is an ungrounded wish (Envelope + Slice). Interpretation grounds it against reality (adds Candidate Set + Free Monad). Observation records what happened (adds Receipt + Writer Monad). Evidence accumulates observations (adds Fold + Catamorphism). Knowledge overlays evidence onto canon (adds Overlay + Join-Semilattice). Confidence distills knowledge into a single trust level (adds Rung + Total Order).

The gradient is the system's epistemology reified as a composition of increasingly constrained algebras. Each step narrows the space of possible meanings until a single confidence level remains.

### Pattern 2: The Governance Diamond

Four primitives form a diamond of mutual constraint:

```
        Governance
       /          \
  Confidence    Commitment
       \          /
       Resolution
```

Resolution produces candidates (Candidate Set). Confidence scores them (Total Order). Commitment binds the winner (Indexed Monad + Refinement Type). Governance audits the binding (Modal Logic). The diamond is closed: governance's output (approved/blocked/review-required) feeds back into what resolution is allowed to attempt next time.

The diamond's algebra is a **fixed point of a functor on the product category** of epistemic and deontic modalities. The system finds the unique assignment of confidence levels and governance states that is self-consistent — where what the system knows and what the system is allowed to do are in equilibrium.

### Pattern 3: The Temporal Helix

Five primitives form a helix that winds through time:

```
Lifecycle → Rhythm → Drift → Churn → Convergence → (next Lifecycle)
```

Lifecycle defines the stages (Indexed Monad). Rhythm measures the tempo of transitions (Catamorphism + Nested Recursion). Drift detects when the tempo changes (Graded Monoid). Churn measures the total displacement (Free Monad + Closed Circuit). Convergence determines whether the displacement is shrinking (Closed Circuit + Nested Recursion).

The helix is the system's relationship with time. It spirals: each convergence creates a new lifecycle baseline, which creates a new rhythm, which may exhibit new drift. The helix never truly terminates — it stabilizes at fixed points, but the fixed points themselves shift as the application under test evolves.

### Pattern 4: The Agency Braid

Four primitives braid together into the system's model of who acts:

```
Agency ⟺ Attention ⟺ Handshake ⟺ The Gap
```

Agency determines who is responsible (Fiber Suspension — human, agent, or compiler). Attention determines what they see (Pullback — the slice of reality relevant to the actor). Handshake determines how they communicate (Braid — typed synchronization between actors). The Gap measures how far their actions fall short (Closed Circuit — the endomorphism that the improvement loop is trying to shrink).

The braid is the system's theory of action. Every action in Tesseract passes through this braid: an agent (Agency) focuses on a subset of reality (Attention), communicates its intent through a typed protocol (Handshake), and the distance between intent and reality (The Gap) drives the next cycle.

---

## Coda: Why It Tessellates

The system is called Tesseract. It tessellates.

A tessellation is a covering of a plane by shapes that fit together without gaps or overlaps. The upper ontology explains *why* this is possible: the 12 motifs are the tile shapes, the 12 algebras are the fitting rules, and the 8 flows are the placement strategies. Any domain concept can be tiled by selecting motifs, verifying that their algebras are compatible, and choreographing them through flows.

The four tessellation patterns — Epistemic Gradient, Governance Diamond, Temporal Helix, Agency Braid — are the four *symmetry groups* of the tiling. Every concept in the system belongs to at least one of these groups, and many belong to two or three. Resolution, for instance, sits at the intersection of the Epistemic Gradient (it transforms interpretation into commitment) and the Governance Diamond (it produces candidates that governance must audit). Convergence sits at the intersection of the Temporal Helix (it measures temporal stability) and the Agency Braid (its fixed point determines when agents should stop acting).

The upper ontology is complete when every concept can be located in the composition table (Part IV) and assigned to at least one tessellation pattern (Part V). There are no orphans — no concept that exists outside the tiling. This is not an accident. It is the design constraint that makes the system's complexity manageable: everything is made of the same pieces, assembled by the same rules, flowing through the same shapes.

The system tessellates because it was built to tessellate. The upper ontology is the proof.
