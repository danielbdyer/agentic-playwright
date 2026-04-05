# The Activation Conditions

> Status: Draft — fourth document in the domain modeling series

The domain model (`domain-model.md`) names the 22 primitives — the **semantics**. The upper ontology (`upper-ontology.md`) names the 12 motifs, 12 algebras, and 8 flows — the **syntax**. The design calculus (`design-calculus.md`) names the 16 meaning-preserving transformations — the **equational theory**. This document names the **coherence conditions**: the laws that govern how the algebras compose when the system's combinatorial demand finally loads them.

## What This Document Is

The design calculus achieved its stated goal. All 16 transformations are implemented, wired, and law-tested. The telos — one generic FSM, one product fold, one envelope-receipt adjunction, one confidence-provenance lattice — exists in code. The absent abstractions have names. The dualities generate. The free theorems are verified.

But a new observation has become visible. The algebras were designed and tested in isolation. Each satisfies its own laws. The Galois connection verifies its adjunction. The governance lattice verifies its meet. The observation collapse verifies its monoid homomorphism. Individually, they are correct.

The question this document addresses: **do they compose?**

When the governance lattice meets the confidence-provenance Galois connection at the proposal activation boundary — when a `GovernanceVerdict<T, I>` must round-trip through a file-based decision bridge and return as a typed resumption — when the observation-aggregate-compare variant needs context that the base `ObservationCollapse` signature doesn't carry — the system's algebraic structures must interact. These interaction points are where correctness is most at risk, because they are where the laws of one algebra constrain the behavior of another.

The issue is not that the algebras are wrong. It is that they have never been *composed under load*. A bridge that has passed every materials test can still fail at a resonance frequency that no individual test excited. The activation conditions are the resonance frequencies of the algebraic architecture.

Five composition points are currently idle — structurally present but not load-bearing. Each section below names the enjambment, states what would activate it, and specifies the coherence law that must hold when it does. Part VI identifies the shared structural cause underneath all five, and the single architectural move that would resolve most of them simultaneously.

---

## Part I: The Governance Lossy Projection

### The enjambment

The governance lattice (`lib/domain/algebra/lattice.ts`) defines three values: `blocked ⊑ review-required ⊑ approved`. The proposal lifecycle FSM (`lib/domain/proposal/lifecycle.ts`) correctly generates all three — when `transitionProposal` receives a `trust-policy-review` event, it produces `review-required`. The phantom branded types (`Approved<T>`, `ReviewRequired<T>`, `Blocked<T>`) and the exhaustive `foldGovernance` enforce three-valued reasoning at the type level.

But at `activate-proposals.ts:104–109`, the three-valued lattice is projected to two:

```typescript
const proposalGovernances = proposals.map((p) =>
  isBlocked(p.activation) ? 'blocked' as const : 'approved' as const,
);
```

The `review-required` state evaporates. The lattice meet operates on a degenerate sublattice where it reduces to `min()`. The Galois connection between rung and confidence — whose `review-required` image is the set of rungs producing uncertain-but-usable bindings — never composes with governance because the intermediate value is discarded before composition occurs.

The bypass is correct for dogfood mode, where auto-approval thresholds are permissive and the distinction between "approved" and "approved-but-uncertified" is operationally irrelevant. It is not a bug. It is unused capacity.

### Activation condition

The algebra becomes load-bearing when production execution profiles gate activation on certification status, or when the Galois connection composes with governance to *derive* review obligations from resolution provenance (`β ∘ α : Rung → Governance` monotone) rather than relying on explicit trust-policy evaluation.

### Coherence laws

**C1.1 — Lattice homomorphism**: The projection from `ProposalActivation` to `Governance` must preserve meet: `project(meet(a, b)) = meet(project(a), project(b))`. The current binary projection satisfies this trivially. A three-valued projection that preserves `review-required` must also satisfy it.

**C1.2 — Galois-governance monotonicity**: `rung₁ ≤ rung₂ ⟹ β(α(rung₁)) ⊑ β(α(rung₂))`. Higher rungs (more trusted provenance) must map to governance at least as permissive as lower rungs. Three algebras composing through two monotone maps.

**C1.3 — Verdict round-trip**: A `GovernanceVerdict<T, I>` that suspends with `needs: ReviewRequest` must, when the decision arrives, close with the *same typed payload* `T` — not a reconstructed approximation.

---

## Part II: The Envelope-Receipt Adjunction

### The enjambment

The design calculus (Collapse 3) proved that `Envelope<M, T> ⊣ Receipt<M, T>` — envelopes (comonad) and receipts (writer monad) are adjoint functors. The implementation provides `extractMetadata`, `liftToEnvelope`, and `verifyEnvelopeReceiptAdjunction` in `lib/domain/governance/workflow-types.ts`. The round-trip law holds in tests.

In production, receipts are built by extending `WorkflowMetadata` directly — structural inheritance, not adjunction invocation. `extractMetadata` and `liftToEnvelope` have zero call sites outside tests. The theory says "define the envelope, derive the receipt." The practice says "define both independently; they happen to share a base type."

This works because the system currently has a fixed set of receipt types. When a new envelope type is introduced, the developer manually creates the corresponding receipt type by extending the same base. The adjunction is satisfied by convention, not by construction.

### Activation condition

The algebra becomes load-bearing when the receipt set is no longer fixed — when user-defined scenario extensions, plugin-contributed resolution strategies, or externally-authored widget contracts need to produce receipts whose metadata structure is not known at compile time. At that point, deriving the receipt type from the envelope definition (the adjunction's `η : T → Env<M, Writer<M, T>>`) eliminates an entire class of metadata-mismatch bugs that manual definition allows.

### Coherence laws

**C2.1 — Adjunction naturality**: For any envelope transformation `f : Env<M, A> → Env<M, B>`, the induced receipt transformation `f* : Receipt<M, A> → Receipt<M, B>` must commute with extraction: `extract(f(env)) = f*(extract(env))`. Currently untested because `f*` is never computed — it would be derived from `f` by the adjunction.

**C2.2 — Distributive law**: `Writer<M, Env<M, T>> → Env<M, Writer<M, T>>` (distributing writer over envelope) must preserve both the writer's log and the envelope's metadata. This is the law that backs "you can always extract the receipt from inside an envelope without losing the envelope's metadata" — stated in the design calculus but never tested as a composition.

---

## Part III: The Suspension Bridge

### The enjambment

`GovernanceVerdict<T, I>` (`lib/domain/kernel/governed-suspension.ts`) is a proper typed ADT with three cases and monadic combinators (`mapVerdict`, `chainVerdict`, `foldVerdict`). The `Suspended` case carries `needs: I` — a parameterized type describing what input is required to resume.

The file-based decision bridge (`lib/infrastructure/dashboard/file-decision-bridge.ts`) returns `WorkItemDecision` — a record with `status: 'approved' | 'rejected' | 'skipped' | 'escalated'` and `rationale: string`. Between the verdict and the decision, the type parameter `I` collapses to `unknown`:

```typescript
export function fromGovernance<T>(
  governance: Governance,
  value: T,
  suspensionContext?: { readonly needs: unknown; readonly reason: string },
): GovernanceVerdict<T, unknown>
```

The round-trip is: typed verdict → `unknown` → Promise → file system → file watch → JSON parse → string status → manual interpretation. The algebraic return path that would close the fiber with type safety does not exist.

### Activation condition

The algebra becomes load-bearing when more than one kind of suspension exists simultaneously — when the system must distinguish a trust-policy review suspension from an operator content review from a resource-unavailable pause from a human-escalation request. Currently all suspensions funnel through the same `WorkItemDecision` shape, and the `rationale` string carries the distinction informally. Multiple concurrent suspension kinds with different resumption types require `I` to be instantiated as a discriminated union that the decision bridge can serialize, deserialize, and route.

### Coherence laws

**C3.1 — Suspension-resumption adjunction**: For every `Suspended<I>` there exists a canonical `Resume<I> → Approved<T>` that recovers the original payload. The composition `suspend ∘ resume = id` must hold — suspending and then resuming with the correct input must produce exactly the value that was suspended, not a re-derived approximation.

**C3.2 — Serialization naturality**: The encoding `I → JSON → I` must be a natural transformation — it must commute with any transformation on `I`. In practice: if the suspension context is refined (e.g., adding a `requiredEvidence` field to a review request), the serialization must propagate the refinement without the bridge code changing.

---

## Part IV: The Contextual Merge and the Heyting Ghost

### The enjambment

`contextualMerge` (`lib/domain/algebra/contextual-merge.ts`) implements the design calculus's Abstraction 3: slice a knowledge base by index, overlay with local additions, join via lattice. The Heyting algebra (Free Theorem 1) extends this — knowledge overlays support not just join but logical implication, enabling queries like "if this surface pattern holds, what must be true about that screen's elements?"

Neither is used in production. Knowledge merging uses nullable coalescing (`??`) and `Object.fromEntries` iteration in `lib/domain/knowledge/screen-bundle.ts`. The lattice join that the upper ontology says governs overlay composition is, in the running system, a null check.

The bypass is correct because the current knowledge model is *flat* — screen hints override element defaults, period. There is no multi-level overlay where the lattice join's associativity and commutativity matter. There is no case where two overlays conflict and the join must resolve them. The null check is the correct degenerate case of lattice join when one operand is always bottom.

### Activation condition

The algebra becomes load-bearing when knowledge overlays conflict — when two proposals modify the same element's hints with incompatible values, or when screen-local hints contradict promoted shared patterns. The current system avoids this by processing proposals sequentially and last-write-wins. When parallel proposal activation is needed (multiple agents, concurrent speedruns), the lattice join determines the merge, and the Heyting implication determines what can be safely concluded from the merged result.

### Coherence laws

**C4.1 — Overlay idempotency**: `merge(k, k) = k`. Merging knowledge with itself must be a no-op. The null-coalescing bypass satisfies this trivially. A lattice join must satisfy it algebraically.

**C4.2 — Overlay commutativity**: `merge(a, b) = merge(b, a)`. The order in which overlays are applied must not matter. Sequential last-write-wins violates this. Lattice join satisfies it by construction. This is the coherence condition that activation demands — the move from sequential to parallel requires commutativity.

**C4.3 — Heyting distributivity**: `(a ⊔ b) ⇒ c = (a ⇒ c) ⊓ (b ⇒ c)`. If the Heyting algebra is activated for knowledge queries, this distributive law must hold. It constrains how the knowledge base responds to composite overlay inputs — the implication of a join must equal the meet of individual implications. Testing this on actual knowledge structures verifies that the lattice implementation supports logical reasoning, not just value merging.

---

## Part V: The Tropical Phantom

### The enjambment

The design calculus (Free Theorem 2) claimed that bottleneck detection is a shortest-path problem in the tropical semiring `(ℝ ∪ {∞}, min, +)`. The actual scoring uses an additive monoid — weighted sums via `combineScoringRules()` in `lib/domain/algebra/scoring.ts`. There is no `min` operation. No critical-path extraction. The "tropical" structure exists only in law tests.

The additive monoid is correct for *ranking* — assigning a single priority score to each bottleneck. But ranking is not diagnosis. "Screen X has the highest bottleneck score" does not explain *why*. The tropical semiring would answer that: the shortest tropical path from system state to screen X is the causal chain of degradations that makes X the bottleneck. The critical path is the diagnosis.

### Activation condition

The algebra becomes load-bearing when the system needs to explain its bottleneck rankings — when an operator asks "why is this screen the top priority?" and the system must produce a chain of contributing factors rather than a single number. The tropical matrix `A` (where `A[i][j]` is the signal magnitude from component `i` to component `j`) supports transitive closure via `A* = I ⊕ A ⊕ A² ⊕ ...` in the tropical semiring. Each entry in `A*` is the shortest path — the minimum-cost causal chain.

### Coherence laws

**C5.1 — Tropical associativity**: `(A ⊗ B) ⊗ C = A ⊗ (B ⊗ C)` where `⊗` is tropical matrix multiplication. The composition of signal propagation must be associative — the path cost from A through B to C must equal the path cost from A to the composition of B-through-C.

**C5.2 — Additive-tropical consistency**: The existing additive scoring and the tropical scoring must agree on ranking: if `score_additive(X) > score_additive(Y)`, then the tropical shortest path to X must have lower cost than the tropical shortest path to Y. The two algebras produce the same ordering — the tropical structure strictly *enriches* the additive structure with path information, but must not contradict it.

---

## Part VI: The Shared Cause

The five enjambments have the same shape. In each case:

1. An algebra was designed at a higher level of generality than the current system demands.
2. The production code took a correct degenerate-case shortcut.
3. The shortcut is not tested for compatibility with the full algebra.
4. The activation condition is a specific increase in *combinatorial demand* — more governance states, more receipt types, more suspension kinds, more concurrent overlays, more causal paths.

This is not an accident. It is a consequence of the system's development trajectory. The algebras were designed from the upper ontology downward — from the most general structural motifs to the specific domain instantiations. The production code was built from the domain upward — from the simplest working implementation to the generality needed. The two trajectories met in the middle, and the residue of their meeting is idle capacity.

The shared structural cause is: **the system's type-level generality exceeds its value-level demand**. The types permit three governance values; the values use two. The types permit parameterized suspension contexts; the values pass `unknown`. The types permit lattice join; the values use null-coalescing. In each case, the type system describes a richer algebra than the runtime exercises.

This gap is not a defect. It is *preparation*. The type-level generality is the architectural surface area that absorbs future complexity without structural change. But preparation without verification is assumption. The coherence laws in Parts I–V are the verification conditions — the tests that confirm the full algebras compose correctly before the combinatorial demand arrives.

### The single architectural move

There is one change that would activate most of the idle algebras simultaneously: **introducing a second execution profile**.

The current system operates exclusively in `dogfood` profile. Adding a `ci-batch` or `production` profile — one that enforces certification, distinguishes review-required from approved, routes suspensions by kind, processes overlays concurrently, and explains its bottleneck rankings — would load every idle algebra at once. Not because the profile itself is complex, but because the *transition between profiles* is where the coherence conditions bind. The same pipeline, the same knowledge base, the same proposals must flow through both profiles and produce consistent results. That consistency requirement is exactly what the coherence laws formalize.

The recommended verification sequence:

1. **C1.1–C1.3** (governance): Introduce `review-required` propagation. Test lattice homomorphism. This is the smallest change with the most diagnostic value — if the three-valued lattice doesn't compose with the FSM and the Galois connection, the other coherence conditions won't either.

2. **C3.1–C3.2** (suspension): Type the `I` parameter in `GovernanceVerdict`. This forces the decision bridge to handle structured resumption, which tests the round-trip.

3. **C4.1–C4.2** (overlays): Enable concurrent proposal activation. Test commutativity. This is the change most likely to surface latent ordering dependencies.

4. **C2.1–C2.2** (envelope-receipt): Defer until plugin or extension architecture demands dynamic receipt types.

5. **C5.1–C5.2** (tropical): Defer until operator-facing diagnostics require causal explanations.

The first three form a natural unit of work. The last two are preparation for capabilities the system hasn't yet promised. The coherence laws for all five should be written as law tests now, even if the production code doesn't activate them yet — because the laws constrain future implementation, and constraints are cheapest to express before the code exists.

---

## Appendix: Coherence Law Summary

| ID | Law | Algebras Composed | Status |
|---|---|---|---|
| C1.1 | Lattice homomorphism of activation→governance projection | Governance lattice × Proposal FSM | Idle |
| C1.2 | Galois-governance monotonicity (`β ∘ α` monotone) | Galois connection × Governance lattice | Idle |
| C1.3 | Verdict round-trip (suspend/resume preserves payload) | Governed suspension × Governance lattice | Idle |
| C2.1 | Adjunction naturality (envelope transforms induce receipt transforms) | Envelope comonad × Receipt writer | Idle |
| C2.2 | Distributive law (writer distributes over envelope) | Envelope comonad × Receipt writer | Idle |
| C3.1 | Suspension-resumption adjunction (`suspend ∘ resume = id`) | Governed suspension × Decision bridge | Idle |
| C3.2 | Serialization naturality (encoding commutes with refinement) | Governed suspension × File bridge | Idle |
| C4.1 | Overlay idempotency (`merge(k, k) = k`) | Contextual merge × Knowledge overlays | Trivially satisfied |
| C4.2 | Overlay commutativity (`merge(a, b) = merge(b, a)`) | Contextual merge × Knowledge overlays | Violated by sequential processing |
| C4.3 | Heyting distributivity | Heyting algebra × Contextual merge | Idle |
| C5.1 | Tropical matrix associativity | Tropical semiring × Signal composition | Idle |
| C5.2 | Additive-tropical ranking consistency | Scoring monoid × Tropical semiring | Idle |
