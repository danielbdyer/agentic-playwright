# The Design Calculus

> Status: Active — third document in the domain modeling trilogy

The domain model (`domain-model.md`) names the 22 primitives and their relationships — the **semantics**. The upper ontology (`upper-ontology.md`) names the 12 motifs, 12 algebras, and 8 flows that compose them — the **syntax**. This document names the **equational theory**: the set of meaning-preserving transformations on the implementation, whose fixed point is the system's telos.

## What This Document Is

After building the semantics and the syntax, a third space becomes visible. It is not about *what the system does* or *what it is made of*, but about **what the system wants to become** — the implementation it is converging toward under its own algebraic pressure.

This space contains:

- **Collapse points**: isomorphisms hiding in plain sight — things that look different but are provably the same
- **Absent abstractions**: recurring compositions that have no name — combinators the codebase uses everywhere but has never reified
- **Dualities**: adjunctions between pairs of concepts — where one side can be mechanically derived from the other
- **Free theorems**: laws the system obeys by construction but has never stated, tested, or exploited
- **The telos**: the fixed point of the refactoring endomorphism — the codebase that remains when every redundancy is collapsed, every recurrence is named, every duality is exploited, and every free theorem is verified

The design calculus is the algebra of these transformations. Each entry is an equation: *this* is equal to *that*, and the equality is meaning-preserving. Applying the equation simplifies the implementation without changing its behavior. The telos is the normal form — the irreducible expression that remains when no more equations apply.

---

## Part I: Collapse Points

An isomorphism `A ≅ B` means that `A` and `B` carry the same information — there exist maps `f : A → B` and `g : B → A` such that `f ∘ g = id` and `g ∘ f = id`. A collapse point is an isomorphism that the codebase hasn't noticed yet. Two types, two modules, two patterns of code that are the same thing wearing different costumes. Collapsing them eliminates redundancy without losing expressiveness.

### Collapse 1: The Four State Machines Are One

The codebase contains four indexed monads that each reinvent the same transition logic:

- **Convergence FSM**: `Exploring → Narrowing → Plateau → Converged`
- **Proposal lifecycle**: `Pending → Activated → Certified → Rejected`
- **Scenario lifecycle**: `Stub → Draft → Active → Disabled → Archived`
- **Pipeline staging**: `Preparation → Resolution → Execution → Complete`

Each has its own state type, its own transition function, its own validation logic. But the algebra is identical in every case: an indexed monad `m i j a` where the type indices `i`, `j` are drawn from a finite set of stages, and the transition function is a total map from each stage to its set of legal successors.

The generic `StateMachine<S, E, R>` exists in `lib/domain/types/state-machine.ts` — 15 lines that define `runStateMachine`. But the four instances don't use it. They each hand-roll their own state threading.

**The equation**: `ConvergenceFSM ≅ ProposalLifecycle ≅ ScenarioLifecycle ≅ PipelineStaging`, via the isomorphism that maps each to `IndexedStateMachine<States, Transitions, Payload>` parameterized by its specific state set.

**What collapsing buys**: one implementation of transition logic, transition validation, state history tracking, and lifecycle visualization. Four consumers that instantiate it with their specific types. The leaf files for each lifecycle reduce to type definitions — the behavioral code converges to one location.

### Collapse 2: Rung Provenance and Confidence Scale

The 11-rung resolution ladder (`explicit → control → approved-knowledge → ... → needs-human`) and the confidence scale (`human-verified → compiler-derived → agent-proposed → ...`) appear to be independent orderings. One says *where* a binding came from. The other says *how much* to trust it.

But they are connected by a **Galois connection** — a pair of monotone maps between two partially ordered sets that form an adjunction:

- `α : Rung → Confidence` — every rung determines a minimum confidence level. An `explicit` binding has at least `human-verified` confidence. A `live-dom` binding has at most `agent-proposed` confidence.
- `γ : Confidence → Set<Rung>` — every confidence level determines the set of rungs that could produce it. `compiler-derived` confidence comes from rungs `explicit`, `control`, or `approved-knowledge` only.

The Galois connection laws hold: `α(r) ≥ c ⟺ r ∈ γ(c)`. This means the two orderings are not independent — they are two views of a single structure, the **confidence-provenance lattice**.

**The equation**: `(Rung, ≤_rung) × (Confidence, ≤_confidence) ≅ ConfidenceProvenance` where `ConfidenceProvenance` is the sublattice of pairs `(r, c)` satisfying the Galois connection constraint `α(r) ≥ c`.

**What collapsing buys**: the ability to derive confidence from provenance automatically (no manual mapping), the ability to validate that a claimed confidence is *consistent* with its provenance (a binding cannot claim `human-verified` if it came from `live-dom`), and the elimination of the dual-maintenance burden where changes to the rung order must be manually mirrored in the confidence scale.

### Collapse 3: Envelope and Receipt as Adjoint Pair

The Envelope (comonad, wraps metadata around payload) and the Receipt (writer monad, accumulates observations alongside computation) are defined independently throughout the codebase. `WorkflowEnvelope`, `StepEnvelope`, `ScenarioEnvelope` each have hand-written counterparts: `StepExecutionReceipt`, `RecoveryAttemptReceipt`, `TranslationReceipt`.

But comonads and writer monads are **adjoint functors**: the comonad `Env w` is right adjoint to the writer monad `Writer w`. The adjunction means:

- For every envelope type `Env<M, T>` (metadata `M`, payload `T`), there is a *canonical* receipt type `Writer<M, T>` (log `M`, result `T`).
- The unit of the adjunction `η : T → Env<M, Writer<M, T>>` wraps a writer computation inside an envelope — which is exactly what "execute a step and record both its result and its observations inside a workflow envelope" does.
- The counit `ε : Writer<M, Env<M, T>> → T` extracts the final result from a writer that produced enveloped values — which is exactly what "collect all step receipts and extract the final workflow result" does.

**The equation**: `Envelope<M, T> ⊣ Receipt<M, T>` (adjunction). Every envelope type *generates* its receipt type and vice versa.

**What collapsing buys**: you define the envelope, and the receipt type, its accumulation logic, and its extraction logic are derived. Half of the type definitions in the receipt family become generated code. The adjunction also yields a free distributive law between envelopes and receipts, which is the formal backing for "you can always extract the receipt from inside an envelope without losing the envelope's metadata."

### Collapse 4: The Three Catamorphisms Are One Product Fold

After a batch of scenarios executes, the system traverses the step receipts three times:

1. **Metrics fold**: step receipts → `{ hitRate, timing, cost, coverage }`
2. **Evidence fold**: step receipts → `{ observations, signals, failureModes }`
3. **Proposal fold**: step receipts → `{ proposedHints, proposedPatterns, proposedOverlays }`

Each is a catamorphism: `cata(φ) : List<StepReceipt> → A`. The catamorphism fusion law states that when three folds traverse the same structure, they can be fused into a single fold with a product carrier:

```
cata(φ₁) △ cata(φ₂) △ cata(φ₃) = cata(φ₁ △ φ₂ △ φ₃)
```

where `△` is the product (fan-out). One traversal. Three results. Same answers.

**The equation**: `(metricsOf ∘ foldReceipts, evidenceOf ∘ foldReceipts, proposalsOf ∘ foldReceipts) ≅ foldReceipts ∘ (metricsOf △ evidenceOf △ proposalsOf)`

**What collapsing buys**: a single pass over the (potentially large) receipt list instead of three. But more importantly, it makes the *relationship* between metrics, evidence, and proposals explicit — they are three projections of a single derivation. Changing the fold algebra in one place changes all three consistently. The fused fold becomes the single source of truth for "what did this batch of executions tell us?"

---

## Part II: Absent Abstractions

An absent abstraction is a combinator that the codebase uses repeatedly but has never named. The code is there — duplicated across call sites — but the *concept* isn't. Naming it creates a vocabulary entry that makes the pattern recognizable, composable, and testable in isolation.

### Abstraction 1: Precedence-Governed Dispatch

**The pattern**: Walk a ranked list of sources in priority order. At each source, attempt resolution. On the first success, wrap the result in provenance metadata indicating which source produced it. On total failure, escalate.

**Where it recurs**:
- Resolution pipeline: walk rungs top-to-bottom, take the first hit, tag with the winning rung
- Data binding: explicit override → runbook → dataset → hint default → posture sample → generated token
- Run selection: CLI flag → runbook → repo default
- Supplement lookup: screen-local hints → promoted shared patterns

**The combinator**:
```typescript
type RankedSource<T> = {
  readonly rank: number
  readonly label: string
  readonly resolve: () => Effect<Option<T>, E, R>
}

declare const dispatchByPrecedence: <T>(
  sources: ReadonlyArray<RankedSource<T>>
) => Effect<Enveloped<T, { source: string; rank: number }>, Exhausted, R>
```

**What naming buys**: every precedence law stated in CLAUDE.md (resolution precedence, data precedence, run selection precedence) becomes a *test* — instantiate `dispatchByPrecedence` with the specific sources and verify the order. Currently, the precedence laws are prose comments. With the combinator, they are executable specifications.

### Abstraction 2: Observation Collapse

**The pattern**: Accumulate receipts from a process, fold them into an aggregate structure, extract a signal from the aggregate.

**Where it recurs**:
- Step receipts → evidence → learning signals
- Execution receipts → scorecard → bottleneck signal
- Recovery receipts → failure classification → degradation signal
- Translation attempts → translation evidence → confidence signal

**The combinator**:
```typescript
declare const collapseObservations: <R, A, S>(
  fold: (receipts: ReadonlyArray<R>) => A,
  signal: (aggregate: A) => S
) => (receipts: ReadonlyArray<R>) => S
```

This is just function composition (`signal ∘ fold`), but naming it makes the three-step shape visible: observe, aggregate, signal. Every instance of this pattern shares the same testable properties: the fold is a monoid homomorphism (preserves the receipt monoid's associativity), and the signal extraction is monotone (more evidence never produces a weaker signal).

### Abstraction 3: Contextual Lattice Merge

**The pattern**: Slice the relevant subset of a knowledge base by index. Overlay with local additions. Join using the lattice's merge operation, respecting confidence ordering.

**Where it recurs**:
- Screen knowledge: slice by screen ID → overlay with screen-local hints → join
- Pattern knowledge: slice by pattern name → overlay with scenario-specific patterns → join
- Prior evidence: slice by scenario → overlay with current run's evidence → join
- Surface overlays: slice by surface → overlay with runtime observations → join

**The combinator**:
```typescript
declare const latticeSliceMerge: <K, V>(
  lattice: JoinSemilattice<V>,
  index: (v: V) => K
) => (base: ReadonlyArray<V>, overlay: ReadonlyArray<V>, key: K) => V
```

**What naming buys**: the lattice merge is the single most repeated structural pattern in the knowledge system. Naming it makes the join-semilattice laws testable at the combinator level (idempotent, commutative, associative) rather than re-testing them at every call site. It also makes the knowledge system's architecture self-documenting: every knowledge composition is a `latticeSliceMerge` with a specific lattice and index.

### Abstraction 4: Governed Suspension

**The pattern**: Advance through typed stages. At certain stages, check governance. If approved, continue. If review-required, suspend the fiber pending external input. If blocked, terminate with explanation.

**Where it recurs**:
- Resolution pipeline: reaches `needs-human` → suspends for operator input
- MCP decision mode: iteration boundary → suspends for agent approval
- Proposal activation: proposal reviewed → suspends for certification
- Dashboard control: operator pause command → suspends speedrun fiber

**The combinator**:
```typescript
declare const governedSuspension: <Pre, Post, Input>(
  check: (state: Pre) => GovernanceVerdict<Post, Input>
) => Effect<Post, Suspended<Input> | Blocked, R>

type GovernanceVerdict<Post, Input> =
  | { readonly _tag: 'Approved'; readonly value: Post }
  | { readonly _tag: 'Suspended'; readonly needs: Input }
  | { readonly _tag: 'Blocked'; readonly reason: string }
```

**What naming buys**: every human-in-the-loop interaction point shares identical plumbing — fiber suspension, inbox item creation, decision file writing, fiber resumption. Currently each call site rebuilds this plumbing. The combinator extracts it, and the governance modality (deontic logic from the upper ontology) becomes a first-class runtime concept rather than ad-hoc branching.

### Abstraction 5: Strategy Chain Walker (discovered during implementation)

**The pattern**: Walk a list of rung strategies in precedence order, try each, record an exhaustion trail step per attempt, and short-circuit on the first success. Return both the result and the full trail.

**Where it recurs**:
- Resolution pipeline: each rung's strategy is tried in order, producing `ResolutionExhaustionEntry[]`
- Recovery chain: each recovery strategy is tried, producing `RecoveryAttemptReceipt[]`
- Translation candidates: each candidate is scored, producing a ranked trail
- Route resolution: each route source is tried, producing navigation reasoning

**The combinator**: This is `freeSearch` (Duality 2) specialized to the resolution domain. It bridges the abstract `SearchTrail<C, O, R>` with the concrete `ResolutionExhaustionEntry[]`, producing both simultaneously. The `exhaustionEntry()` helper is the manual version of what the walker does generically.

**What naming buys**: every rung walk in `resolution-stages.ts` manually constructs exhaustion entries with `exhaustionEntry(rung, outcome, reason)` at 20+ call sites. The walker does this automatically. More importantly, the trail is now a `SearchTrail` — it can be replayed, analyzed for coverage, and interpreted by the learning system without domain-specific parsing.

---

## Part III: Dualities

A duality is a pair of concepts that are mirror images of each other — formally, an adjunction `F ⊣ G` where knowing one side lets you mechanically derive the other. Dualities are generation opportunities: write one side, get the other for free.

### Duality 1: Fold / Unfold (hylomorphism)

The improvement loop is simultaneously:
- An **anamorphism** (unfold): seed state → iteration 1 → iteration 2 → ... → termination. Each iteration *produces* structure from a state.
- A **catamorphism** (fold): all iteration results → accumulated evidence → final scorecard. Each accumulation *consumes* structure into a value.

Composed, this is a **hylomorphism**: `hylo(φ, ψ) = cata(φ) ∘ ana(ψ)`. The intermediate structure — the list of iteration results — is produced by the unfold only to be immediately consumed by the fold.

The hylomorphism law says the intermediate structure can be **deforested** — eliminated entirely:

```
hylo(φ, ψ)(s) = φ(F(hylo(φ, ψ))(ψ(s)))
```

Instead of generating all iteration results and then folding them, the system can fold each iteration's result into the accumulator as it's produced. No intermediate list. No memory pressure from retaining completed iterations.

**What the duality generates**: the streaming version of the improvement loop. Currently `speedrun.ts` collects all iteration results into an array, then folds them into the final scorecard. The hylomorphism refactoring folds on the fly, which is both more memory-efficient and more architecturally honest — the loop's *meaning* is "converge to a fixed point," not "collect a list and summarize it."

### Duality 2: Free / Forgetful (exhaustion trail and final binding)

The exhaustion trail (free monad) remembers every candidate tried and every outcome observed. The final binding (the resolution result) forgets all of that and keeps only the winner.

These form the **free-forgetful adjunction**: `Free F ⊣ Forget`. The free functor lifts a shape `F` into the richest possible monad (remembering everything). The forgetful functor extracts just the value (forgetting the structure).

The adjunction gives a canonical factorization of resolution:

```
resolve = forget ∘ freeResolve
```

First, compute the full free monad (the exhaustion trail with all branches, all outcomes, all decisions). Then, forget the trail and extract the winner. The factorization guarantees that `freeResolve` is *lossless* — the exhaustion trail contains everything needed to reconstruct the resolution decision — and `forget` is *deterministic* — the winner is uniquely determined by the trail.

**What the duality generates**: from any resolution function, you get the exhaustion trail for free by lifting it into the free monad. You don't need to instrument the resolution pipeline with logging — the free monad *is* the log. Conversely, from any exhaustion trail, you get the final binding by applying the forgetful functor. The trail and the binding are not independent artifacts; they are adjoint views of the same computation.

### Duality 3: Slice / Projection (pullback / pushforward contravariance)

Slice (pullback) narrows the state space: given total state `S` and an index `i`, produce the fiber `f⁻¹(i) ⊆ S`.

Projection (natural transformation) expands the view space: given truth `T`, produce a consumer-specific view `η(T)`.

These are **contravariant** — they go in opposite directions through the same structure. The contravariance yields a **coherence equation**:

```
project(slice(S, i)) = slice(project(S), i)
```

Slicing and then projecting must give the same result as projecting and then slicing. This is a naturality condition: the projection is a natural transformation, and natural transformations commute with pullbacks.

**What the duality generates**: the ability to compute views *lazily*. Instead of projecting the entire truth into a dashboard view and then slicing by scenario, you can slice by scenario first (cheap — just a key lookup) and then project only the relevant slice (proportional to one scenario, not all scenarios). The coherence equation guarantees the result is identical. This is a real performance optimization for the dashboard, which currently projects everything and then filters.

---

## Part IV: Free Theorems

A free theorem is a property that a system gets *for free* from its algebraic structure — a law that holds by construction, not by testing. The system already obeys these laws. But because they've never been stated, they can't be tested, can't be relied on explicitly, and can't guide future design decisions. Making them explicit turns implicit correctness into verified correctness.

### Free Theorem 1: Knowledge Overlays Form a Heyting Algebra

The knowledge overlay system uses a join-semilattice: overlays merge via `⊔` (join), the merge is idempotent, commutative, and associative. Combined with the confidence ordering (a total order on trust levels), the overlay system satisfies the axioms of a **Heyting algebra** — an intuitionistic logic.

The Heyting implication `a ⇒ b` is defined as the largest element `c` such that `a ⊔ c ≤ b`. In the knowledge system, this means: "given that we know `a` with confidence `cₐ`, what is the strongest thing we can conclude about `b`?" The answer is determined by the lattice structure — it doesn't need to be computed or stored; it *falls out* of the algebra.

**What this means concretely**: the knowledge base supports logical queries, not just key lookups. You can ask "if this surface pattern holds, what must be true about that screen's elements?" and the Heyting algebra gives a sound answer. The intuitionistic flavor is correct — the system's knowledge is constructive (it can only assert what it has evidence for, not what it hasn't refuted), and the Heyting algebra is the logic of constructive assertion.

**The free test**: for any three overlays `a`, `b`, `c`: `(a ⊔ b) ⇒ c = (a ⇒ c) ⊓ (b ⇒ c)`. This distributive law should hold by construction. Testing it verifies the lattice implementation.

### Free Theorem 2: Tropical Bottleneck as Shortest Path

The signal composition in the scorecard operates over the tropical semiring `(ℝ ∪ {∞}, min, +, ∞, 0)`. This means that bottleneck detection is formally a **shortest path problem** in a weighted graph where:

- Nodes are system components (scenarios, screens, elements, rungs)
- Edge weights are signal magnitudes (failure severity, drift magnitude, churn rate)
- "Addition" is `min` (the most urgent signal wins among alternatives)
- "Multiplication" is `+` (costs accumulate along a path)

The shortest tropical path from "system state" to any component is that component's priority score. **Kleene's algorithm** computes all shortest paths simultaneously by iterating the tropical matrix until it stabilizes — which is exactly the convergence criterion the system already uses.

**What this means concretely**: the scorecard's priority ranking, currently computed by ad-hoc sorting of signal weights, is actually an instance of tropical matrix-vector multiplication. The all-pairs computation gives not just the ranking but the *critical path* — the chain of degradations from root cause to observed failure. This is diagnostic information the system currently doesn't surface but could, for free, by reading the tropical shortest-path tree.

**The free test**: tropical matrix multiplication is associative. `(A ⊗ B) ⊗ C = A ⊗ (B ⊗ C)` where `⊗` is the tropical product. Testing this on the actual signal matrices verifies the composition logic.

### Free Theorem 3: The Traced Monoidal Feedback Law

The six-lane architecture with its feedback loop (improvement loop feeds knowledge back into the resolution pipeline) forms a **traced monoidal category**. The trace operator `Tr : Hom(A ⊗ U, B ⊗ U) → Hom(A, B)` takes a morphism with a "feedback wire" `U` and produces a morphism without it — by connecting the output `U` back to the input `U`.

The traced monoidal category satisfies the **yanking axiom**: `Tr(σ) = id`, where `σ` is the symmetry (swap). In plain terms: if the feedback loop does nothing but pass its output back as input, the traced system is the identity. This is exactly the convergence condition — when the improvement loop produces no new proposals, the feedback wire carries no information, and the system is at its fixed point.

**What this means concretely**: the improvement loop's termination condition (`proposals = 0 → converged`) is not an engineering heuristic — it is the yanking axiom of the traced monoidal category. It is *the* correct termination condition, derivable from the algebra.

**The free test**: the vanishing axiom: `Tr_{U⊗V}(f) = Tr_U(Tr_V(f))`. Tracing over a product of feedback wires can be decomposed into nested traces. For the system: the three-level nested recursion (dogfood → speedrun → scenario) should produce the same fixed point whether computed as one large trace or three nested traces. Testing this verifies that the nesting is algebraically correct.

### Free Theorem 4: The Bekic Decomposition of Nested Recursion

The three-level nested recursion (dogfood loop → speedrun loop → scenario execution) is mutual recursion over a product domain `(TrialState × IterationState × ScenarioState)`. The **Bekic lemma** states that mutual recursion over a product can be decomposed into sequential fixed points:

```
fix(f, g, h) = let x = fix(λa. f(a, fix(λb. g(a, b, fix(λc. h(a, b, c))))))
```

The outermost fixed point finds the trial-level equilibrium. Given a trial state, the middle fixed point finds the iteration-level equilibrium. Given both, the innermost fixed point finds the scenario-level equilibrium.

**What this means concretely**: the three loops can be understood, tested, and optimized *independently*. The scenario loop's convergence is testable without running speedrun iterations. The speedrun loop's convergence is testable without running dogfood trials. The decomposition is meaning-preserving by the Bekic lemma — the sequential fixed point equals the simultaneous fixed point.

**The free test**: running the three loops simultaneously (as the system does now) should produce the same final state as running them sequentially (inner to outer). Any discrepancy is a bug in the loop's state threading, not a property of the recursion itself.

---

## Part V: The Telos

The four preceding sections describe different kinds of simplifying transformations:

| Kind | Count | Effect |
|---|---|---|
| Collapse points | 4 | Eliminate isomorphic duplicates → fewer types, fewer modules |
| Absent abstractions | 5 (+1 discovered) | Name recurring compositions → fewer lines, richer vocabulary |
| Dualities | 3 | Derive one side from the other → less hand-written code, more generation |
| Free theorems | 4 | State implicit laws → more tests, stronger guarantees, new capabilities |

Each transformation is **meaning-preserving** — the system's behavior doesn't change. What changes is its *form*: simpler, smaller, more expressive, more verifiable.

The telos is the normal form: the codebase that remains when no more transformations apply. We can characterize it precisely.

### The irreducible core

After all collapse points are resolved, the system has:

- **One** generic indexed state machine, instantiated for convergence, proposals, scenarios, and pipeline stages
- **One** confidence-provenance lattice, with rung and confidence as projections
- **One** envelope/receipt adjunction, with receipts generated from envelope definitions
- **One** product fold over step results, producing metrics × evidence × proposals in a single pass

After all absent abstractions are named, the system has:

- **Precedence-governed dispatch** as a first-class combinator used by resolution, data binding, run selection, and supplement lookup
- **Observation collapse** as a first-class combinator used by evidence, scorecard, failure classification, and translation
- **Contextual lattice merge** as a first-class combinator used by every knowledge composition point
- **Governed suspension** as a first-class combinator used by every human-in-the-loop interaction

After all dualities are exploited, the system has:

- **Streaming improvement loops** via hylomorphism deforestation
- **Automatic exhaustion trails** via the free-forgetful adjunction
- **Lazy view computation** via the slice-projection contravariance

After all free theorems are stated, the system has:

- **Logical queries over knowledge** via the Heyting algebra
- **Critical path diagnostics** via the tropical shortest-path tree
- **Algebraically correct termination** via the traced monoidal yanking axiom
- **Independently testable recursion levels** via the Bekic decomposition

### The leaf node problem, dissolved

The original observation that motivated this trilogy was that the codebase has too many leaf nodes — too many small files without visible trunks. The design calculus explains *why*:

Each leaf file is an **instantiation** of one of the absent abstractions, applied to specific types. The resolution pipeline is precedence-governed dispatch over resolution rungs. The data binding pipeline is precedence-governed dispatch over data sources. The scorecard is observation collapse over execution receipts. The learning signals are observation collapse over step receipts.

The leaves look different because the combinator they instantiate has no name. Without the name, each call site must spell out the full pattern — its own rung type, its own traversal, its own accumulator, its own signal extraction. This creates the illusion of diversity where there is actually repetition.

Naming the combinators causes the leaves to **visibly cluster** around the trunks they always belonged to. The 90+ flat files in `lib/application/` redistribute into ~15 directories, each organized around a named combinator or a domain primitive. The file count may not change dramatically, but the *navigability* does — because the organizational principle is now explicit.

### The self-similar recursion

There is a final observation that earns its own heading.

The design calculus describes transformations on the codebase. But the codebase *itself* describes transformations on test suites. The improvement loop takes a test suite, applies meaning-preserving transformations (add knowledge, refine hints, adjust overlays), and converges toward a fixed point where all tests pass with minimal human intervention.

The design calculus is the improvement loop applied to itself.

The same algebra operates at three levels:

1. **The test suite level**: the improvement loop transforms test state → test state, converging via the closed circuit.
2. **The codebase level**: the design calculus transforms implementation → implementation, converging via collapse, naming, duality, and free theorems.
3. **The conceptual level**: the trilogy transforms understanding → understanding, converging via domain modeling, upper ontology, and design calculus.

Each level uses the same motifs (fold, envelope, staged pipeline), the same algebras (catamorphism, indexed monad, fixed point), and the same flows (closed circuit, nested recursion). The system is self-similar. The design calculus is not just a description of the codebase — it is an instance of the codebase's own pattern, applied to a different carrier type.

This self-similarity is not a metaphor. It is a formal property: the system is a **fixed point of its own endofunctor**. The functor maps a domain to its improvement loop. The fixed point is the domain whose improvement loop is isomorphic to itself. Tesseract, at its telos, is that fixed point — a system whose own structure is the best description of how to improve its own structure.

---

## Part VI: Implementation Status

### Implemented Transformations

All 16 transformations from Parts I–IV have been implemented as executable TypeScript modules with law-style tests (56 new tests, all passing).

| Transformation | Module | Status |
|---|---|---|
| Collapse 1: Generic FSM | `lib/domain/kernel/finite-state-machine.ts` | Implemented; convergence FSM migrated |
| Collapse 2: Galois Connection | `lib/domain/resolution/confidence-provenance.ts` | Implemented; candidate-lattice wired |
| Collapse 3: Envelope-Receipt Adjunction | `lib/domain/types/workflow.ts` (WorkflowMetadata) | Implemented; resolution + execution receipts unified |
| Collapse 4: Product Fold | `lib/domain/algebra/product-fold.ts` | Implemented; execution/fold.ts monoids wired |
| Abstraction 1: Precedence Dispatch | `lib/domain/resolution/precedence.ts` (dispatchByPrecedence) | Fully wired — all consumers upgraded |
| Abstraction 2: Observation Collapse | `lib/domain/kernel/observation-collapse.ts` | Fully wired — 9 instances across 2 carrier types |
| Abstraction 3: Contextual Merge | `lib/domain/algebra/contextual-merge.ts` | Implemented; deepMergeLattice in proposal-patches |
| Abstraction 4: Governed Suspension | `lib/domain/kernel/governed-suspension.ts` | Fully wired — 4 consumers |
| Abstraction 5: Strategy Chain Walker | `lib/runtime/agent/strategy-chain-walker.ts` | Implemented (discovered during wiring) |
| Duality 1: Hylomorphism | `lib/domain/algebra/hylomorphism.ts` | Implemented; async variant added |
| Duality 2: Free/Forgetful | `lib/domain/algebra/free-forgetful.ts` | Implemented |
| Duality 3: Slice/Projection | `lib/domain/algebra/slice-projection.ts` | Implemented |
| Free Theorem 1: Heyting Algebra | Tests only | Verified |
| Free Theorem 2: Tropical Semiring | Tests only | Verified |
| Free Theorem 3: Traced Monoidal | Tests only | Verified |
| Free Theorem 4: Bekic Lemma | Tests only | Verified |

### Observation Collapse Instances

Nine concrete modules wired as `ObservationCollapse<R,O,A,S>` instances across two carrier types:

**Over StepExecutionReceipt (learning pipeline):**

| Module | O (Observation) | A (Aggregate) | S (Signal) |
|---|---|---|---|
| `selector-health.ts` | SelectorObservation | SelectorHealthIndex | SelectorHealthMetrics[] |
| `recovery-effectiveness.ts` | RecoveryAttempt | RecoveryEffectivenessIndex | number (efficiency) |
| `rung-drift.ts` | RungObservation | RungHistoryIndex | number (stability) |
| `execution-cost.ts` | CostObservation | CostBaselineIndex | number (efficiency) |
| `console-intelligence.ts` | ConsoleObservation | ConsolePatternIndex | number (max correlation) |
| `timing-baseline.ts` | TimingObservation | TimingBaselineIndex | number (coverage) |

All six invoked via `collapseObservations()` in `learning-state.ts` (`aggregateLearningState`).

**Over domain-specific carrier types (intelligence pipeline):**

| Module | R (Receipt) | O (Observation) | A (Aggregate) | S (Signal) |
|---|---|---|---|---|
| `governance-intelligence.ts` | GovernanceIntelligenceInput | GovernanceFrictionPoint | GovernanceIntelligenceReport | number (health) |
| `execution-coherence.ts` | ExecutionCoherenceInput | ScreenHealthProfile | ExecutionCoherenceReport | number (composite) |
| `interpretation-coherence.ts` | InterpretationCoherenceInput | IntentCoherenceProfile | InterpretationCoherenceReport | number (coherence) |

### Discovered Pattern Variation: Observation-Aggregate-Compare

During wiring, a structural variation of ObservationCollapse was discovered. Two modules (`timing-baseline.ts`, `console-intelligence.ts`) have signal functions with shape `(R[], A) → S` rather than `A → S` — they compare new observations against the aggregate to detect anomalies (regressions, noise).

This is the **Observation-Aggregate-Compare** pattern:

```
extract:   R[] → O[]
aggregate: (O[], A | null) → A
compare:   (R[], A) → S       ← needs both the raw input AND the aggregate
```

Where ObservationCollapse has `signal: A → S` (the aggregate alone determines the signal), the Compare variant needs the context of the current observations to produce its signal. This is strictly more expressive — it corresponds to the comonad extract that remembers its context, vs the algebra homomorphism that forgets it.

### Precedence Dispatch Consumers

All `chooseByPrecedence` call sites upgraded to `dispatchByPrecedence` (value + rung + rank provenance):

| Module | Call Sites | Precedence Law |
|---|---|---|
| `select-run-context.ts` | mode, providerId | `runSelectionPrecedenceLaw` |
| `select-controls.ts` | runbook, controlResolution, dataset | `runSelection`, `resolution`, `dataResolution` |
| `controls.ts` | controlResolution, findRunbook, activeDataset | `runSelectionPrecedencePolicy` |

### Governed Suspension Consumers

Four consumers bridged to `GovernanceVerdict<T, I>`:

| Module | Function | Verdict Shape |
|---|---|---|
| `auto-approval.ts` | `autoApprovalVerdict` | 4-gate `chainVerdict` chain → Approved / Suspended(ReviewRequest) |
| `activate-proposals.ts` | `proposalGovernanceVerdict` | `fromGovernance` bridge → Approved / Suspended / Blocked |
| `dashboard-decider.ts` | `dashboardDecisionVerdict` | auto-decidable → Approved, else → Suspended(AgentWorkItem) |
| `agent-decider.ts` | `escalationVerdict` | heuristic → Approved (agent), Suspended (human escalation) |

### Product Fold Consumers

| Module | Fold Values | Description |
|---|---|---|
| `execution/fold.ts` | `timingFold`, `costFold` | Timing and cost monoids as `Fold<StepEntry, T>` values |

### Contextual Merge Consumers

| Module | Instance | Lattice |
|---|---|---|
| `proposal-patches.ts` | `deepMergeLattice` | Right-biased deep merge with subset-of-keys order |

### Consumer Wiring Summary

**Product fold fusion** — `learning-state.ts`: All 6 step-receipt ObservationCollapse instances invoked over the same stream.

**Async hylomorphism** — `hylomorphism.ts` (`runHyloAsync`): Ready for dogfood.ts and convergence-proof.ts deforestation.

### Assessed and Deferred Opportunities

These were assessed during wiring and deferred with rationale:

| Opportunity | Rationale for deferral |
|---|---|
| `learning-health.ts` → ObservationCollapse | Three independent coverage computations over `GroundedSpecFragment[]` + `TrainingCorpusManifest`; not a single extract→aggregate→signal pipeline but three parallel ones. Already well-structured. |
| `learning-rankings.ts` → ObservationCollapse | Already uses composable `ScoringRule<T>` abstraction via `combineScoringRules`. Adding ObservationCollapse would be redundant naming. |
| `learning-bottlenecks.ts` → ObservationCollapse | Input is `GroundedSpecFragment[] + RunStepSummary[]` from two sources; the heterogeneous input doesn't fit a single-carrier ObservationCollapse cleanly. |
| `improvement-intelligence.ts` → ObservationCollapse | Correlates two different observation types (`PipelineFailureMode` and `WorkflowHotspot`); the dual-source pattern doesn't fit the single-carrier combinator. |
| `signal-maturation.ts` → ObservationCollapse | Utility functions (dampening, threshold checks) with scalar inputs, not an observation stream pattern. |
| `dogfood.ts` → `runHyloAsync` | The unfold step is deeply interleaved with Effect (Playwright, file system, convergence FSM updates). Requires factoring out a pure fold step from the `buildLedger` function. Infrastructure (`runHyloAsync`) is in place; refactoring is a standalone task. |
| `convergence-proof.ts` → `runHyloAsync` | Same as dogfood.ts — the trial loop is recursive with Effect I/O. Infrastructure ready. |
| Proposal lifecycle FSM | Activation states (`pending → activated \| blocked`) are checked across 5+ files via `activation.status` string matching. Formalizing as FSM would require extracting the lifecycle from distributed checks — a significant refactoring. |
| Dashboard lazy view (Slice/Projection) | Dashboard currently projects everything then filters. Lazy computation via `verifyNaturality` would require rearchitecting the view pipeline — a performance optimization, not a correctness improvement. |
| Resolution exhaustion trail → `SearchTrail` | Manual `exhaustionEntry()` construction at 20+ call sites in `resolution-stages.ts`. `strategy-chain-walker.ts` already bridges `freeSearch` with the resolution domain for the outer walk. Inner rung-level exhaustion would need per-rung refactoring. |
| Knowledge overlay → `ContextualMerge` | `select-controls.ts` overlays multiple control sources but uses precedence selection (winner-take-all), not lattice merge. The two patterns are distinct: precedence selects one value, merge combines all values. |

---

## Coda: The Trilogy as Compilation

The three documents form a compilation pipeline:

1. **Domain model** (source): the 22 primitives and their relationships — the high-level language
2. **Upper ontology** (intermediate representation): the 12 motifs, 12 algebras, 8 flows — the instruction set
3. **Design calculus** (optimization passes): collapses, namings, dualities, free theorems — the transformation rules

The telos is the **optimized output**: the implementation that results from applying all valid transformations to the source program until no more apply.

This is not an analogy. It is a homomorphism from the system's own compilation pipeline (scenario → bound steps → generated spec) to its meta-description (domain model → upper ontology → design calculus). The homomorphism preserves structure: deterministic derivations in the compiler correspond to collapse points in the calculus. Governance in the compiler corresponds to dualities in the calculus (write one side, derive the other — but only if the adjunction is verified). Learning signals in the compiler correspond to free theorems in the calculus (properties that hold by construction but are worth testing to catch implementation errors).

The trilogy is complete. The system can now be understood at any level of abstraction — from the raw metrics of file counts, through the conceptual primitives, through the structural motifs and their algebras, to the transformation laws that govern its evolution — and at every level, the same shapes recur, the same laws hold, and the same telos beckons.

The implementation is the map. The map is the territory. The territory tessellates.
