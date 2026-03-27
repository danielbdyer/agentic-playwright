# Research: Where Tesseract Should Go Next — Round 5 (Visionary)

*Four esoteric, future-looking, and meta-level research perspectives that could only emerge after 16 prior angles of investigation. March 2026.*

---

## Perspective 17: The Algebra Hiding in the Architecture

**Researcher focus**: The codebase has mathematical structure it doesn't name. Resolution is a prioritized coproduct, governance is a three-valued lattice, the dogfood loop is a fixed-point iteration, the 8 fold functions are catamorphisms. What algebraic structures are hiding in the code, and what would formalizing them unlock?

### Findings

#### Eight Major Algebraic Structures, All Unnamed

After reading every referenced file and tracing every structural pattern, this analysis identifies **8 algebraic structures** that the codebase implements without naming. The code is doing sophisticated mathematics. It just doesn't know it.

#### A. The Governance Lattice (Bounded, Three-Element, Phantom)

**Structure**: A bounded three-element lattice with phantom type enforcement that collapses at runtime.

**Where**: `lib/domain/types/workflow.ts:4-14`, `lib/domain/visitors.ts:33-42`, `lib/domain/binding.ts:76-84`

The governance type `{approved, review-required, blocked}` forms a **bounded distributive lattice**:

```
      approved        (top — least restrictive)
          |
   review-required    (middle)
          |
      blocked          (bottom — most restrictive)
```

The **meet** operation (more restrictive wins): `approved ∧ review-required = review-required`, `review-required ∧ blocked = blocked`. This operation is used implicitly in `governanceForBinding` (binding.ts:76-84) and in `validate-step-results.ts` but is never declared as a lattice operation. No `meet()` or `join()` function exists.

The phantom brands (`Approved<T>`, `Blocked<T>`, `ReviewRequired<T>`) are the type-level encoding of lattice elements. `foldGovernance` is the catamorphism over this lattice. Both have **0 production call sites**. The lattice exists at the type level but collapses to string comparison at runtime.

**What formalization unlocks**: A `mergeGovernance` function implementing lattice meet. Compile-time proof that governance can only flow downward (approved → review-required → blocked), never upward without explicit promotion. The `requireApproved` function (which exists but is never called) becomes a lattice-element assertion.

#### B. The Resolution Cascade as Prioritized Coproduct

**Structure**: A 10-rung prioritized sum type with a total order and a monotone valuation function.

**Where**: `lib/domain/precedence.ts:1-55`, `lib/domain/visitors.ts:99-135`

The resolution precedence law is a **coproduct** (disjoint sum) with an attached **total ordering**:

```
Resolution = Explicit | Control | ApprovedScreenKnowledge | ... | NeedsHuman
```

`chooseByPrecedence` (precedence.ts:33-45) is a **catamorphism** (fold) over the law array: given candidates tagged by rung, pick the first non-null value by precedence. `precedenceWeight` (precedence.ts:47-54) is a **monotone valuation**: `rung1 > rung2 ⟹ weight(rung1) > weight(rung2)`.

Neither the coproduct, the total order, nor the monotonicity property are named. The code calls it a "precedence law" — correct, but the mathematical structure (a well-ordered set with a monotone function to the naturals) is richer than the name suggests.

**What formalization unlocks**: Proof that `chooseByPrecedence` always picks the globally optimal candidate (by transitivity). Early-exit optimization when a weight exceeds a threshold. Composition of precedence laws via product orders.

#### C. Catamorphic Fold Functions (F-Algebras Without Awareness)

**Structure**: 8 textbook F-algebra catamorphisms over discriminated unions.

**Where**: `lib/domain/visitors.ts:1-273` (entire file)

| Function | Type | Variants |
|----------|------|----------|
| `foldValueRef` | `ValueRef` | 5 |
| `foldStepInstruction` | `StepInstruction` | 5 |
| `foldLocatorStrategy` | `LocatorStrategy` | 3 |
| `foldResolutionReceipt` | `ResolutionReceipt` | 4 |
| `foldResolutionOutcome` | `ResolutionReceipt` | 2 (ternary collapse) |
| `foldImprovementTarget` | `PipelineImprovementTarget` | 5 |
| `foldResolutionEvent` | `ResolutionEvent` | 5 |
| `foldPipelineFailureClass` | `PipelineFailureClass` | 8 |
| `foldStepWinningSource` | `StepWinningSource` | 14 |

Each fold has the form: `cata : (F-algebra<R>) → (μF → R)` — an F-algebra (a record of handlers per variant) applied to a fixed-point type (the union). TypeScript enforces exhaustiveness at compile time.

Critically, `WINNING_SOURCE_TO_RUNG` (visitors.ts:257-272) is a **second fold function** disguised as a record lookup — it maps `StepWinningSource → ResolutionPrecedenceRung` but isn't written using `foldStepWinningSource`. It could be.

**What formalization unlocks**: Automatic derivation of folds from type definitions. Catamorphism fusion (composing consecutive folds into a single pass). Detection of "union type consumed without exhaustive fold" as a compile-time warning.

#### D. The Pipeline as Kleisli Composition

**Structure**: Pipeline stages form Kleisli arrows in the Effect monad, composed via `yield*` (monadic bind).

**Where**: `lib/application/pipeline/stage.ts:21-84`, `lib/application/pipeline/incremental.ts:67-141`, `lib/application/dogfood.ts:504-605`

Each `PipelineStage<D, C, P, E, R>` is a Kleisli arrow: `D → Effect<C, E, R>`. The `runPipelineStage` function chains `loadDependencies → compute → persist` via `yield*`, which IS Kleisli bind (`>>=`). The `runIncrementalStage` wrapper is a **natural transformation** (monad transformer) lifting caching semantics onto Effect.

The dogfood loop's `step: (state: LoopState) → Effect<LoopState>` is a **Kleisli state monad** — Kleisli composition of state transitions: `(s₀ → M<s₁>) ∘ (s₁ → M<s₂>) ∘ ... ∘ (sₙ₋₁ → M<sₙ>)`.

**What formalization unlocks**: Formal Kleisli laws (left/right identity, associativity) stated and verifiable. Proof that stage composition respects error handling and resource cleanup. Stage fusion optimization.

#### E. The Convergence Loop as Fixed-Point Iteration

**Structure**: The dogfood loop is a fixed-point iteration on a partially ordered metric space, with ad hoc convergence detection that could be formalized as a Lyapunov function.

**Where**: `lib/application/dogfood.ts:206-231` (convergence), `lib/application/dogfood.ts:533-549` (self-calibration), `lib/domain/speedrun-statistics.ts:1-256`

The iteration `state(n+1) = F(state(n))` embeds: run scenarios → activate proposals → recalibrate weights. Convergence is declared when: no proposals activated (local minimum), hit rate delta < threshold (diminishing returns), budget exhausted, or max iterations.

The self-calibrating bottleneck weights (learning-bottlenecks.ts:69-101) are a **contractive mapping** on the unit simplex: `|calibrated - base| ≤ learningRate × max(|correlations|)`, with normalization ensuring weights sum to 1. This is equivalent to **projected gradient descent** with learning rate 0.1.

**What formalization unlocks**: A Lyapunov function `Φ(state) = -knowledgeHitRate` proving convergence (Φ decreases monotonically until it stagnates). Termination bounds (how many iterations until `Φ(s) ≤ ε`). Adaptive learning rates for the calibration step.

#### F. The Trust Policy as Galois Connection

**Structure**: The relationship between `ProposedChangeMetadata` and `TrustPolicyDecision` is a Galois connection between two ordered sets.

**Where**: `lib/domain/trust-policy.ts:62-83` (evaluation), `lib/domain/trust-policy.ts:108-154` (auto-approval)

Two ordered sets: `P = ProposedChangeMetadata` (ordered by confidence) and `D = TrustPolicyDecision` (ordered `allow > review > deny`). The evaluation function is the **lower adjoint** `f: P → D`. The auto-approval function applies the connection in reverse: given a decision, verify all gates pass.

The `decisionForReasons` function (trust-policy.ts:50-60) is a **monotone function**: more reasons → stricter decision. The 6-gate auto-approval chain is composition of proof obligations in the Galois adjunction.

**What formalization unlocks**: Formal verification of the adjunction property: `f(x) ⊑ y ⟺ x ⊑ g(y)`. Optimization by using adjoint properties to reduce redundant gate checks.

#### G. Bottleneck Weights as Commutative Monoid on the Unit Simplex

**Structure**: The weight system is a commutative monoid under normalized addition on Δ³ (the 4-dimensional unit simplex).

**Where**: `lib/application/learning-bottlenecks.ts:38-101`, `lib/application/learning-shared.ts:18-34`

`BottleneckWeights ≅ Δ³ = {(r,t,u,i) ∈ ℝ⁴ : r+t+u+i=1, all ≥ 0}`. The `combineScoringRules` function (learning-shared.ts:18-34) forms monoid homomorphisms: each `ScoringRule<T>` is `T → ℝ`, combined via direct sum, scaled by simplex weights. The final score is `Σᵢ(wᵢ × ruleᵢ(input))` — a linear functional parameterized by a monoid element.

**What formalization unlocks**: Equational reasoning about weight combination. Proof that calibration preserves the simplex invariant. Convergence analysis of online learning on the simplex.

#### H. Hidden Monoids Across the Codebase

Three additional implicit monoids detected:

1. **Resolution receipt accumulation**: Multiple receipts could combine via a semigroup where `needs-human` absorbs everything (like `blocked` in the governance lattice)
2. **Fitness metrics averaging**: `reduce((sum, m) => sum + m.knowledgeHitRate, 0) / length` is a normalized monoid operation
3. **Workflow envelope lineage**: `sources`, `parents`, `handshakes` combine via array concatenation — a free monoid

#### The Meta-Insight

The codebase is **saturated with algebraic structure** — lattices, coproducts, catamorphisms, Kleisli arrows, fixed-point iterations, Galois connections, monoids. None are named. The code implements the algebra correctly but without awareness. Formalizing these structures would unlock:

- **Stronger type safety** (phantom types with enforcement, lattice-aware merging)
- **Automated verification** (lattice laws, fixed-point convergence, Galois properties)
- **Optimization** (catamorphism fusion, Kleisli simplification, early-exit via monotonicity)
- **Self-documentation** (algebraic names carry proof obligations that English names don't)

---

## Perspective 18: The Self-Verifying Compiler

**Researcher focus**: Tesseract compiles human intent into executable tests and declares architectural doctrine in CLAUDE.md. But the gap between "declared invariant" and "tested invariant" is vast. What if Tesseract could compile its own doctrine into self-verification tests? What's the delta between the current law tests and full self-verification?

### Findings

*Awaiting research...*

---

## Perspective 19: The Invisible Architecture (What the Gaps Between Perspectives Reveal)

**Researcher focus**: After 16 perspectives, the same structural tension appears from every angle: designed-but-unconnected subsystems. The governance types exist but aren't enforced. The observation surface is richer than what consumes it. The interface graph and derived graph never validate consistency. What is the "negative space" architecture — the system that would exist if every accidental gap were closed?

### Findings

This perspective required synthesizing all 16 prior angles of investigation. The question: after examining every subsystem individually, what architecture emerges from the *spaces between* them?

#### The Gap Taxonomy

After tracing every cross-subsystem boundary, the gaps fall into three distinct categories:

**Category A: Load-Bearing Gaps (Intentional Separation — Do Not Close)**

These are designed decouplings where closing the gap would collapse important architectural properties.

| Gap | Between | Why It's Intentional |
|-----|---------|---------------------|
| **ApplicationInterfaceGraph ↔ DerivedGraph** | Interface intelligence ↔ Projection | Different type systems (11 vs 24 node kinds), different questions (structure vs behavior), different lifecycles. Merging would create a God-object. |
| **DisabledDashboard ↔ PipelineEventBus** | CI/batch ↔ Interactive | The pipeline MUST run identically headless. The `Disabled*` variants are the proof. Coupling observation to execution would break CI. |
| **Domain layer ↔ Effect** | Pure FP ↔ Effectful orchestration | 33 pure domain files with zero Effect imports. This purity enables law testing, deterministic compilation, and safe refactoring. The boundary is the codebase's most valuable architectural property. |
| **Compile-time binding ↔ Runtime resolution** | `bindScenarioStep` ↔ Resolution ladder | Binding is deterministic (compile-time). Resolution is environment-dependent (runtime). Merging them would destroy the compiler's determinism guarantee. |

**Category B: Accidental Gaps (Should Be Connected But Aren't)**

These are places where subsystems were designed to work together but the wiring was never completed.

| Gap | Between | Evidence | Impact |
|-----|---------|----------|--------|
| **1. Governance types ↔ Governance enforcement** | `Approved<T>`/`Blocked<T>` phantom brands ↔ Production code | Types defined in `workflow.ts:8-42`. `foldGovernance` defined in `workflow.ts:33-42`. `requireApproved` defined in `workflow.ts:27-31`. **Only 1 production call site** (`validate-step-results.ts:22-27`). 35 sites mint `governance: 'approved'` as plain strings. | Any code can forge governance status. The type system cannot prevent `governance: 'approved'` on an unapproved artifact. The entire approval flow is honor-system. |
| **2. Agent DOM snapshot ↔ Agent prompt** | `domSnapshot` field in `AgentInterpretationRequest` ↔ Always `null` at invocation | Field declared in types. Prompt template handles it (`line 431: domSnapshot.slice(0, 2000)`). Never populated in `resolution-stages.ts:491`. | Agent at Rung 9 cannot see the page. It must interpret intent purely from text descriptions and exhaustion trails. DOM-layout-dependent intents (e.g., "click the third button in the header") are unresolvable. |
| **3. Interface graph ↔ Derived graph consistency** | `buildApplicationInterfaceGraph` ↔ `buildDerivedGraph` | Zero cross-references between builder functions. No shared validation. grep for `interfaceGraph.*derivedGraph` returns 0 results. | If the interface graph says a screen has element X but the derived graph doesn't, the inconsistency is silent. No build-time or runtime check validates cross-graph coherence. |
| **4. Dashboard event richness ↔ Dashboard event consumption** | 22 event kinds emitted ↔ Subset consumed by React | `element-probed` emitted in `run.ts:124`. `element-escalated` in `run.ts:149`. `rung-shift` in `dogfood.ts:587`. `calibration-update` in `dogfood.ts:596`. `confidence-crossed` in `confidence.ts:282`. But dispatch handlers in React only route: `progress`, `element-probed`, `screen-captured`, `item-pending`, `item-processing`, `item-completed`, `fiber-paused`, `fiber-resumed`, `element-escalated`, `stage-lifecycle`. | 12 of 22 event kinds are consumed. **10 event kinds are emitted but never consumed**: `rung-shift`, `calibration-update`, `proposal-activated`, `confidence-crossed`, `artifact-written`, `iteration-start`, `iteration-complete`, `workbench-updated`, `fitness-updated`, `inbox-item-arrived`. The observation surface is richer than what any consumer uses. |
| **5. SharedArrayBuffer ↔ React visualization** | Zero-copy ring buffer with atomic writes ↔ React reads via WS JSON | The PipelineBuffer exists, `readSlot` is exported. `usePipelineBuffer` hook exists. But the primary consumption path is WS JSON events through `useWebSocket`. | The zero-copy path — the most technically sophisticated piece of the observation surface — may not be exercised in production. The React dashboard routes events through JSON serialization over WebSocket, not through the SharedArrayBuffer. |
| **6. MCP tools ↔ Agent interpreter** | 15 MCP tools in `dashboard-mcp-server.ts` ↔ Agent interpreter at Rung 9 | Agent interpreter receives a flat prompt. MCP tools expose structured observation. But the agent interpreter never invokes MCP tools — it receives a pre-packaged context. | The MCP surface is designed for external agents (Claude Code, Copilot) but isn't used by the *internal* agent interpreter. The agent that most needs structured DOM access doesn't have it. |
| **7. Pipeline stage fingerprints ↔ Cross-stage dirty tracking** | Per-stage `fingerprintInput`/`fingerprintOutput` ↔ No inter-stage awareness | `runIncrementalStage` tracks manifests per projection. But `emit` doesn't know if `bind` already ran. The dogfood loop calls stages sequentially without checking prior stage outputs. | Running `npm run emit` after `npm run bind` rebuilds even if bind already ran. No cross-stage cache. Each command is an independent Effect program. |

**Category C: Emergent Gaps (Visible Only Through Cross-Perspective Analysis)**

These are tensions that no single-file reader would notice — they emerge from the interaction of multiple architectural decisions.

##### C1: The Governance Paradox

The governance model exhibits a striking paradox visible only after examining it from 4 perspectives:

- **Round 2 (Perspective 7)**: Discovered phantom branded types exist but are unenforced
- **Round 3 (Perspective 10)**: Found 14 sites mint governance as plain strings
- **Round 4 (Perspective 13)**: Confirmed the domain layer is pure — governance types are correctly defined
- **Round 4 (Perspective 14)**: Found the agent interpreter produces `governance: 'review-required'` — correctly

The paradox: the *agent* respects governance more faithfully than the *deterministic pipeline*. The LLM integration surface (Rung 9) correctly marks its output as `review-required`. But the deterministic rungs (1-6) hardcode `governance: 'approved'` in `resolution-stages.ts:213,255,315,427` without passing through any governance validation. The one place that DOES use `foldResolutionReceipt` with `isApproved` assertions is `validate-step-results.ts` — but this runs AFTER execution, not before emission.

**The invisible architecture**: governance should be a pre-emission gate (you can't emit what isn't approved), but it's actually a post-execution assertion (we check after the fact). The phantom types were designed for the former. The code implements the latter.

##### C2: The Observation Asymmetry

The observation surface has a striking asymmetry:

- **Emitter side** (Effect pipeline): 26 `dashboardEvent()` calls across 11 files. Rich, typed events with actor provenance, governance state, bounding boxes, confidence scores, bottleneck weights.
- **Consumer side** (React dashboard): Dispatches 10 of 22 event kinds. Has beautiful 3D visualization (selector glows, particle transport, knowledge observatory, decision burst, proposal gate) but many of these spatial components don't have data flowing to them yet.
- **MCP side** (structured access): 15 tools defined, 8 tool handlers implemented. But the internal agent doesn't use them.

The invisible architecture: the observation surface was designed as a *complete* system — the types are there, the encoding is there, the spatial visualization components exist. But the wiring is incomplete. It's like a building with every room furnished but some hallways unfinished.

##### C3: The Knowledge-Resolution Feedback Discontinuity

The resolution ladder produces rich information at every rung:
- Exhaustion entries (what failed and why)
- Top candidates (with scores)
- Proposals (alias suggestions)
- Evidence (what worked in prior runs)

The dogfood loop consumes this:
- Proposals are activated by confidence overlay
- Scorecard tracks hit rates and convergence
- Bottleneck weights self-calibrate

But there's a discontinuity: the **per-step** resolution information (exhaustion trail, candidates, scores) is summarized into **per-scenario** aggregates (hit rate, resolution rate) before reaching the improvement engine. Individual step-level learning signals are lost in aggregation. A step that narrowly fails at Rung 5 and one that fails catastrophically at Rung 1 both count as "unresolved" in the scorecard.

#### The Single Unifying Insight

After mapping all three categories, a single architectural observation emerges:

**The codebase has a consistent pattern of designing complete type-level contracts and then implementing partial runtime wiring.**

- Governance types: complete at type level, partial at runtime
- Dashboard events: complete taxonomy, partial consumption
- MCP tools: complete catalog, partial integration
- Graph models: complete node/edge types, no cross-validation
- Agent context: complete request schema, partial population (DOM = null)

This is not a flaw — it's a *strategy*. The type-level contracts are the *specification*. The partial runtime wiring is the *current implementation*. The gap between them is the *backlog*, encoded in the type system itself.

#### The Invisible Architecture, Revealed

If every accidental gap were closed — governance enforced via phantom brands, DOM snapshot populated, graph consistency validated, all 22 events consumed, SharedArrayBuffer wired to visualization, MCP tools available to the internal agent, cross-stage dirty tracking implemented — the system would be:

1. **Self-certifying**: Governance phantom brands prevent emission of unapproved artifacts at compile time
2. **Fully observable**: Every event emitted is consumed and visualized
3. **Informationally complete**: The agent sees the DOM, the graphs validate each other, the pipeline knows what's dirty
4. **Agent-symmetric**: Internal and external agents have the same MCP tool access

The current system is perhaps 60% of this invisible architecture. The type system is 90% there. The runtime wiring is 40% there. The gap is the work.

---

## Perspective 20: Information-Theoretic Limits of the Agent's Context Window

**Researcher focus**: The agent at Rung 9 receives a 9-section system prompt. But is this the right information? What's the minimum context for correct interpretation? Is the resolution ladder an information funnel — does each rung reduce entropy in a measurable way? Could a "minimum viable context" achieve the same accuracy at half the token budget?

### Findings

*Awaiting research...*

---

## Cross-cutting synthesis

*To be written after all four perspectives complete.*
