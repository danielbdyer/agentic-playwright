# Cold-Start Convergence Plan

> Status: Active — doctrinal spine for the substrate convergence work.
> Supersedes `docs/convergence-backlog.md` and `docs/convergence-roadmap.md`
> as the sequencing source of truth; those documents are now read as
> Surface 1/2 tactical inputs that execute *within* this plan's phases.
> When this document conflicts with them, this document wins.

## TL;DR

The north-star question this plan makes measurable is:

> *Given a mature enterprise application and a mature ADO backlog,
> can the system cold-start from a blank canonical-artifact store and
> arrive at a return-on-investment trend-line where per-test-case
> token cost decays toward a linear floor as `MeanNovelty(C,τ)`
> decays per K5?*

Two engines converge on that question, sharing one canonical-artifact
store via the lookup chain:

1. **The deterministic discovery engine** (cold-derivation, slot 5 of
   the lookup chain) — judged by the **discovery-fitness** L4 tree
   (does not yet exist; a parallel peer to the existing
   pipeline-efficacy tree at `lib/domain/fitness/metric/visitors/`).
2. **The agentic intervention engine** — judged by the **C6
   intervention-adjusted economics** floor in `alignment-targets.md`,
   operationalized as a new L4 visitor over the already-existing
   `InterventionTokenImpact` and `InterventionHandoffChain` fields in
   `lib/domain/handshake/intervention.ts:162-192`.

Neither engine exists in its final form yet. The substrate they both
write to — the three-tier interface model at
`lib/domain/pipeline/` — landed in Phases 0b–0d but has no
decomposed canonical artifacts on disk, no promotion-gate scoring
model, and no runtime-family awareness to specialize discovery on
a real target. This plan sequences the six phases that close those
gaps, with each phase grounded in a specific existing seam and
gated by a concrete metric movement.

**The load-bearing reframe**: the convergence-backlog's measurement
axis is `knowledgeHitRate` against a synthetic workload. That is a
Surface 1 tuning signal. It is not the doctrinal gradient. The
doctrinal gradient is *cold-start efficacy* (how close is cold to
warm under `--mode compare`?) and *intervention marginal value* (did
accepting this agentic augmentation reduce ambiguity / suspension /
rung-score in its attachment region within N runs?). Both are in
`docs/alignment-targets.md`'s top-of-wall scoreboard (M5, C6); neither
has a live L4 visitor today.

## Table of contents

1. [The measurement reframe](#1-the-measurement-reframe)
2. [The two loops, made explicit](#2-the-two-loops-made-explicit)
3. [Codebase reality check](#3-codebase-reality-check)
4. [Critical path — six phases](#4-critical-path--six-phases)
5. [Scalability guardrails](#5-scalability-guardrails)
6. [Acceptance gates per phase](#6-acceptance-gates-per-phase)
7. [Risks and tripwires](#7-risks-and-tripwires)
8. [Relationship to existing documents](#8-relationship-to-existing-documents)
9. [Glossary](#9-glossary)

---

## 1. The measurement reframe

### 1.1 What we are actually measuring

`docs/recursive-self-improvement.md` § The Loss Function frames the
improvement loop around eight metrics computed by
`lib/application/improvement/fitness.ts`, with `knowledgeHitRate` as
the primary gate. That framing is tactically useful and we keep it
— but it is *the pipeline-efficacy question*, not *the convergence
question*.

The convergence question is about the substrate: does the canonical
artifact store grow toward a state where most phase outputs come from
slots 2–3 of the lookup chain (canonical artifacts) and fewer need
slot 4–5 (live or cold derivation)? Does the discovery engine's
cold-derivation output match canon closely enough that the operator
could throw away `{suiteRoot}/.canonical-artifacts/agentic/` and
rebuild it from the deterministic engine? Does the intervention
engine's agentic overrides pay off on a timeline that justifies
their maintenance cost?

The existing L4 metric tree at
`lib/domain/fitness/metric/visitors/index.ts:42-50` has five visitors
that all read from the same input shape (`L4VisitorInput`, lines
32-35) — a `PipelineFitnessMetrics` snapshot. None of them see the
canonical artifact store's shape, the cold-vs-canon delta, or the
intervention receipt ledger. The visitors are *pipeline-efficacy
visitors*; we need peers that read the substrate.

### 1.2 The two scoreboard metrics the substrate serves

From `docs/alignment-targets.md`:

- **M5 — Memory Worthiness Ratio**:
  `RememberingBenefit(τ) / MemoryMaintenanceCost(τ)`, operationalized
  as the cohort-trajectory slope of `effectiveHitRate` over
  `MemoryMaturity(τ)` divided by per-iteration scorecard maintenance
  overhead. `MemoryMaturity` exists as a branded scalar in
  `lib/domain/fitness/memory-maturity.ts:27-93`, computed as
  `log2(1 + approvedElements + promotedPatterns + approvedRouteVariants)`.
  The *trajectory* does not exist — there is no
  `MemoryMaturityTrajectory` type accumulating history points, and no
  cohort-indexed hit-rate series.

- **C6 — Intervention-Adjusted Economics**: % of accepted
  augmentations that reduce ambiguity, suspension, or rung-score in
  their attachment region within N runs. The underlying substrate
  exists: `InterventionTokenImpact` at
  `lib/domain/handshake/intervention.ts:162-169` carries
  `ambiguityReduction`, `suspensionAvoided`, `rungImprovement`,
  `activationQuality` as optional numeric fields. What's missing is
  (a) the before/after pairing that populates these from runtime
  evidence, (b) an L4 visitor that folds the per-intervention
  impacts into a C6 scoreboard value, and (c) the "within N runs"
  window bookkeeping.

These are not decorations. Per the alignment-targets wall (lines
9-47), M5 and C6 *are the scoreboard*; everything else is diagnostic.
A scorecard improvement is accepted iff no target metric regresses
below its floor for the current window. If M5 and C6 have no direct
measurement, the acceptance gate runs on proxies — which is the
Phase 3 veto condition the wall was built to prevent.

### 1.3 "Token cost plateaus to linear" as an emergent property

The user frames the ROI target as "token cost per test case has a
trend-line that quickly plateaus to a linear amount." This is not a
new metric. It is the emergent consequence of two things holding
simultaneously:

- **K5 (marginal discovery decay)** from the temporal-epistemic
  addendum: as `MemoryMaturity(τ)` grows across comparable cohorts,
  `MeanNovelty(C,τ)` monotonically decreases. Each new test case in
  a mature cohort pulls from canon more than it discovers from
  scratch.
- **L2s (strong target observability)**: the substrate contains
  enough atoms that every important target has at least one bounded
  evidence path resolvable without live DOM. Resolution stops
  consulting live DOM for non-novel steps.

If both hold, the token cost of generating the N-th test case
approaches a constant because the canonical artifact store bears the
weight the resolver used to carry. If either fails — if K5 is flat
or L2s is local instead of strong — token cost keeps growing
sub-linearly but without a plateau.

The plateau is therefore *observed indirectly* through M5's cohort
trajectory and C6's marginal-value accounting. We do not need a
separate "token accountant" visitor. We do need the
cohort-trajectory and intervention-marginal-value primitives to
exist, which they currently do not.

---

## 2. The two loops, made explicit

`docs/canon-and-derivation.md` § 9 names two engines: the
deterministic discovery engine (cold-derivation, slot 5) and the
agentic intervention engine (agentic overrides, slot 2). Both write
to the same canonical artifact store via promotion gates
(`lib/domain/pipeline/promotion-gate.ts:30-135`). They optimize
orthogonal axes and their independence must be visible at the metric
level.

### 2.1 The discovery engine loop (cold-arm)

```
canonical sources (§2)
  → discovery runner (lib/application/discovery/discovery-runner.ts:88-92)
  → DiscoveryRunOutput with manifest + producedClasses
  → decomposer (lib/application/discovery/decompose-discovery-run.ts)
  → per-atom envelopes (slot 5, cold-derivation)
  → promotion gate evaluate()
  → either promote to slot 3 (deterministic observation) or discard
```

The gradient signal for improving this loop is the **discovery
fitness tree** (doctrinal, not yet implemented). For each atom class
it asks: how close is the cold-derived atom to the current canonical
artifact for the same address? The answer decomposes per-class
(route-fidelity, surface-fidelity, element-fidelity, ...) and per
cohort (recognition rate on a first-encounter screen vs. a mature
one). When this tree is green and stable, discovery has "caught up"
to the hand-authored canon; demotion proposals naturally flow.

### 2.2 The intervention engine loop (warm-arm, braided)

```
runtime evidence (InterventionEvidenceSlice)
  ↔ agent inference (IntentInterpretation + hypothesis)
  → InterventionReceipt.handoff (lib/domain/handshake/intervention.ts:194-210)
    with semanticCore, requestedParticipation, tokenImpact
  → agent decision captured as agentic override (slot 2)
  → next N runs observed; before/after rung scores compared
  → InterventionTokenImpact.rungImprovement populated from evidence
  → C6 visitor folds populated impacts into a scoreboard value
  → if impact is positive, promotion/demotion logic leaves it alone
  → if impact is zero after the window, intervention is a demotion candidate
```

The key doctrinal move that `recursive-self-improvement.md` currently
misses: the intervention engine is not "operator answers a
question." It is a **braid**: the agent forms a hypothesis from
evidence, the hypothesis becomes a typed intervention receipt with
`handoff.semanticCore` and `handoff.tokenImpact` fields, the receipt
writes an agentic override to the canon store, and subsequent runs
*weave runtime evidence back through the same receipt lineage* to
measure whether the inference paid off. The handoff chain at
`lib/domain/handshake/intervention.ts:181-192` already carries the
lineage slot (`previousSemanticToken`, `semanticCorePreserved`,
`driftAcknowledgedBy`); what's missing is the visitor that folds
those into C6 and the scheduler that runs the before/after comparison.

"Braided" is the operative word: inference and evidence are not
alternating layers, they are twisted together per intervention
receipt. An intervention that cannot show its evidence ancestry
cannot participate in the C6 measurement. An evidence record that
cannot show which intervention it is counting against cannot either.
The substrate for the braid exists; the measurement over it does
not.

### 2.3 Why both must be measured independently

A change that improves the pipeline-efficacy tree without improving
the discovery-fitness tree means the runtime got better at *using*
the cached canon but the cold-start engine did not progress. A
change that improves discovery fitness without improving C6 means
the discovery engine caught up but the intervention layer is
freeloading — agentic overrides that should be demoted are not
being demoted because the measurement isn't in place. A change that
improves both, and hits its floors in alignment-targets, is the
only kind of change that compounds.

`docs/canon-and-derivation.md` § 12.3 states this explicitly ("a
change that regresses one and improves the other is a tradeoff that
needs explicit operator review"). The `score` command today surfaces
one tree; after Phase B of this plan it surfaces both.

---

## 3. Codebase reality check

Before sequencing phases, an audit of what exists and what does not.
Every row cites a concrete file so future sessions can verify the
state hasn't drifted.

### 3.1 What exists

| Concern | Realized by | Location |
|---|---|---|
| 15 typed atom classes + address stringification | `ATOM_CLASSES` const tuple + per-class `*AtomAddress` interfaces + `atomAddressToPath` fold | `lib/domain/pipeline/atom-address.ts:32-210` |
| 7 typed composition sub-types + addresses | `COMPOSITION_SUB_TYPES` const tuple + per-sub-type addresses | `lib/domain/pipeline/composition-address.ts:35-127` |
| 7 typed projection sub-types + addresses | `PROJECTION_SUB_TYPES` const tuple + per-sub-type addresses | `lib/domain/pipeline/projection-address.ts:39-133` |
| Phase output source classifier (5 slots) with exhaustive fold | `PhaseOutputSource` + `foldPhaseOutputSource` + `compareSourcePrecedence` | `lib/domain/pipeline/source.ts:26-118` |
| Qualifier bag with projection applicability monoid | `QualifierBag`, `AtomApplicability` union, `intersectApplicability` meet, `APPLICABILITY_IDENTITY` | `lib/domain/pipeline/qualifier.ts:30-103` |
| Lookup chain typed interface (warm/cold/compare/no-overrides modes, qualifier-aware) | `LookupChain`, `LookupResult`, `LookupMode` | `lib/domain/pipeline/lookup-chain.ts` |
| Promotion + demotion gate interfaces (Strategy pattern per class/sub-type) with compile-time-exhaustive registries | `AtomPromotionGate<C>`, `AtomDemotionGate<C>`, `PromotionVerdict`, `DemotionProposal`, `AtomPromotionGateRegistry` (mapped type) | `lib/domain/pipeline/promotion-gate.ts:30-135` |
| Discovery runner interface with Effect-parameterized contract and per-atom-class registry | `DiscoveryRunner`, `DiscoveryRunnerRegistry`, `createDiscoveryRunnerRegistry`, 5-variant `DiscoverySurfaceKind` | `lib/application/discovery/discovery-runner.ts:48-137` |
| Discovery run decomposer (fat-surface → per-atom envelopes) | `decompose-discovery-run.ts` | `lib/application/discovery/decompose-discovery-run.ts` |
| L4 metric visitor typeclass with phantom-branded kind | `MetricVisitor<Input, Kind>` | `lib/domain/fitness/metric/visitor.ts:27-40` |
| L4 metric catalogue (5 kinds) + polarity map | `L4_METRIC_KINDS` const tuple, polarity mapping | `lib/domain/fitness/metric/catalogue.ts:19-46` |
| L4 visitor registry (compile-time-exhaustive `Record<L4MetricKind, MetricVisitor<...>>`) | `L4_VISITORS` + `buildL4MetricTree` | `lib/domain/fitness/metric/visitors/index.ts:42-83` |
| L4 visitor exhaustiveness law test | `tests/fitness/metric-visitors.laws.spec.ts:71-80` (every `L4_METRIC_KINDS` entry must have a visitor and vice versa) | `tests/fitness/metric-visitors.laws.spec.ts` |
| Memory maturity branded scalar with log-scale formula | `MemoryMaturity` brand, `computeMemoryMaturity`, `maturityDelta`, `ZERO_MATURITY` | `lib/domain/fitness/memory-maturity.ts:27-93` |
| Cohort definition + manifest primitives (12 reference cohorts) | `CohortDefinition`, `CohortManifestEntry`, reference-cohorts.ts | `lib/domain/synthesis/cohort-plan.ts:50-100` |
| Intervention receipt with handoff, semantic core, token impact, handoff chain with drift acknowledgement | `InterventionReceipt`, `InterventionHandoff`, `InterventionTokenImpact`, `InterventionHandoffChain`, `DriftAcknowledgement` | `lib/domain/handshake/intervention.ts:162-226` |
| Proposal lifecycle FSM (pending → activated \| blocked, 6 transition events, terminal absorption) with generic `FSMDefinition` instance | `transitionProposal`, `proposalLifecycleFSM`, `ProposalTransitionEvent` | `lib/domain/proposal/lifecycle.ts:30-182` |
| Auto-approval gate expressed both imperatively and as a `GovernanceVerdict` chain (monadic bind via `chainVerdict`) | `applyAutoApproval`, `autoApprovalVerdict` | `lib/application/governance/auto-approval.ts:43-177` |
| Workspace catalog slots for the three tiers | `tier1Atoms`, `tier2Compositions`, `tier3Projections` fields on `WorkspaceCatalog` | `lib/application/catalog/types.ts:109-123` |
| Nine exhaustive folds in the kernel visitor module | `foldValueRef`, `foldStepInstruction`, `foldLocatorStrategy`, `foldResolutionReceipt`, `foldResolutionOutcome`, `foldImprovementTarget`, `foldResolutionEvent`, `foldPipelineFailureClass` + `WINNING_SOURCE_TO_RUNG` | `lib/domain/kernel/visitors.ts:13-321` |
| Governance phantom brands + exhaustive fold | `Approved<T>`, `ReviewRequired<T>`, `Blocked<T>`, `foldGovernance`, `mapPayload` | `lib/domain/governance/workflow-types.ts` |
| Epistemic phantom brands with 6-way fold and audited mints | `Observed<T>` / `Interpreted<T>` / `ReviewRequired<T>` / `Approved<T>` / `Blocked<T>` / `Informational<T>`, `foldEpistemicStatus`, gated mints | `lib/domain/handshake/epistemic-brand.ts:24-125` |
| Architecture-fitness laws enforcing the scalability pattern (domain purity, 8 fold functions, `foldGovernance`, `mapPayload`) | 4 laws in the test file | `tests/fitness/architecture-fitness.laws.spec.ts:1-150` |
| Auto-generated doctrine invariants consumed by the architecture-fitness compiler | 4 invariant sections | `docs/doctrine-invariants.md` |

### 3.2 What does not exist (the gap set)

| Gap | Why it matters for this plan | Phase that closes it |
|---|---|---|
| No `.canonical-artifacts/{atoms,compositions,projections}/{agentic,deterministic}/` tree on disk under any suite root | The lookup chain's slot 2/3 has nothing to walk; every warm run effectively falls through to slot 4/5. Hybrid compounds (`controls/*`, `benchmarks/*`, `knowledge/screens/*.{elements,hints,postures}.yaml`, `knowledge/routes/demo.routes.yaml`, `knowledge/surfaces/*.surface.yaml`) are still in `{suiteRoot}/` per the canon-and-derivation § 11 classification table. | **A** |
| No atom/composition decomposition from hybrid compounds to per-atom files | Promotion and demotion are defined per-address. As long as atoms live inside compound YAML files, per-fact promotion cannot fire and the canon substrate cannot evolve at atom granularity. | **A** |
| No discovery-fitness L4 metric tree | Without a parallel tree, the `score` command only tells us how well the runtime *uses* canon, not how well the discovery engine *derives* canon. The cold-start gradient has no scoreboard. | **B** |
| No C6 (intervention marginal value) L4 visitor | `InterventionTokenImpact` fields exist but no visitor folds them into the scoreboard. C6 is the C-group direct measurement target per alignment-targets and is currently `proxy` at best. | **B/C** |
| No `MemoryMaturityTrajectory` / cohort-indexed history point series | M5 is defined as a cohort-trajectory slope. With only point-in-time `MemoryMaturity` and no history accumulator, M5 cannot be computed at all. | **B** |
| No before/after wiring from intervention receipts to next-N-run evidence | `InterventionTokenImpact.rungImprovement` / `ambiguityReduction` fields are optional and unpopulated because nothing compares the rung distribution in the attachment region across runs. The braid is typed but not closed. | **C** |
| No confidence-interval scoring on promotion gates | `PromotionEvaluation.scores` is an optional `{candidate, existing}` scalar pair (`promotion-gate.ts:43-46`). Dynamic confidence-interval scoring (Wilson score / Beta posterior) over observation success/failure counts does not exist anywhere in `lib/`. Without it, a single flaky cold-derivation can promote a bad atom. | **D** |
| No `runtime-family` atom class or OutSystems-specific discovery signatures | The target SUT is an OutSystems Reactive 11 enterprise app. Zero hits across `lib/` for `outsystems`, `runtime-family`, or equivalent. Every discovery-phase improvement will either overfit to the demo harness or specialize the wrong layer. | **E** |
| No `reverseOf` / `precondition` fields on `TransitionAtomAddress` | Real SUTs (especially wizard workflows) have approval/reject transitions that send the entity back to a prior state under a condition. Currently `TransitionAtomAddress` is `(fromScreen, toScreen, trigger)` — no reverse linkage, no predicate gate. Promotable, but modeling the OutSystems target will require it. | **E** (schema extension) |
| Tier 3 projection authoring (role-visibility / wizard-state / process-state) | The lookup chain already takes qualifiers and the Monoid composition for applicability exists; the projection store is empty on disk and no discoverer populates it. The doctrinal point (canon-and-derivation § 3.8) is that the seam must be wired from day one — which it is — but consumers will start needing it as soon as the SUT has roles, which is as soon as Phase E bites. | **F** |

### 3.3 What already respects the pattern language

The scalability guardrails (§ 5 of this plan) aren't aspirational;
they are already the dominant pattern. Every new type we add follows
the same template:

- **Discriminated union + exhaustive fold** is how atoms, compositions,
  projections, and phase-output sources already work. The TypeScript
  compiler enforces exhaustiveness at every fold call site.
- **Mapped type registries** enforce "every variant has a
  handler." `L4_VISITORS: { readonly [K in L4MetricKind]: MetricVisitor<L4VisitorInput, K> }`
  (`lib/domain/fitness/metric/visitors/index.ts:42-50`) and
  `AtomPromotionGateRegistry = { readonly [C in AtomClass]: AtomPromotionGate<C> }`
  (`lib/domain/pipeline/promotion-gate.ts:120-122`) are the two
  worked examples. Adding an `L4MetricKind` without a registered
  visitor is a compile error, not a runtime bug.
- **Law-style exhaustiveness tests** back the mapped-type registries.
  `tests/fitness/metric-visitors.laws.spec.ts:71-80` is the template.
- **Monoid composition** is how projection applicability composes
  across qualifiers (`intersectApplicability` at
  `lib/domain/pipeline/qualifier.ts:84-98`). Any new compositional
  operation on canonical artifacts should have the same shape.
- **Governed suspension / monadic bind** is how gate chains compose
  without sacrificing exhaustiveness. `autoApprovalVerdict` at
  `lib/application/governance/auto-approval.ts:135-177` is the
  worked example — each gate is a
  `T → GovernanceVerdict<T, ReviewRequest>` and `chainVerdict` is
  the monadic bind. A new gate is added by extending the chain,
  not by editing the existing gates.

This plan does not invent new patterns. It adds concrete instances
atop the existing ones.

---

## 4. Critical path — six phases

The phases are sequenced so each one closes a specific gap from § 3.2
and earns a specific metric movement from
`docs/alignment-targets.md`. Phases A and B are the load-bearing
substrate work; C through F compound on them. Phases can overlap but
their acceptance gates are independent.

Every phase below includes:

- **Goal** — the specific gap from § 3.2 it closes.
- **Doctrinal seams** — which existing `lib/` types/files it extends.
- **Work items** — concrete implementable units, each naming its
  target file (or the file it creates).
- **Scalability pattern** — which existing design pattern template
  the work item follows (Visitor, Strategy, Monoid, mapped-type
  registry, fold, phantom brand).
- **Exit criteria** — what has to hold before the phase is "done."
- **Metric movement** — which L4 tree node (pipeline-efficacy,
  discovery-fitness, or C6) is expected to move, and by how much.
- **Law tests** — which existing law test must be extended or what
  new law test must be added.

### Phase A — Atom decomposition (hybrid compounds → per-atom files)

**Goal.** Close the top row of § 3.2: materialize
`{suiteRoot}/.canonical-artifacts/{atoms,compositions}/{agentic,deterministic}/`
on disk and decompose the hybrid compounds listed in
`docs/canon-and-derivation.md` § 11 into per-atom files keyed by
their `atomAddressToPath` string
(`lib/domain/pipeline/atom-address.ts:177-210`). Until this lands,
the lookup chain's slot 2/3 has nothing to read, promotion is
scalar-at-best, and M5 / C6 cannot be computed because the cohort
trajectory needs per-fact lineage.

**Doctrinal seams.**

- `lib/domain/pipeline/atom-address.ts` — the 15-class enumeration
  and path-stringification function are the one-and-only mapping
  from addresses to on-disk locations.
- `lib/domain/pipeline/composition-address.ts` — the 7-sub-type
  enumeration and `compositionAddressToPath`
  (`lib/domain/pipeline/composition-address.ts:103-120`).
- `lib/application/catalog/types.ts:109-123` — the `tier1Atoms`,
  `tier2Compositions`, `tier3Projections` slots on
  `WorkspaceCatalog` already exist; they need loader implementations
  that walk the new directory tree and produce
  `ArtifactEnvelope<Atom<C, unknown>>` / `ArtifactEnvelope<Composition<S, unknown>>` values.
- `lib/application/discovery/decompose-discovery-run.ts` — the fat
  surface → per-atom envelope converter. Phase A extends it to also
  decompose *existing hybrid files* (a one-shot migration), not only
  fresh discovery runs.

**Work items.**

1. **`dogfood/.canonical-artifacts/` tree creation (one-shot
   migration script).** A new `scripts/decompose-canon.ts` reads
   each row of the § 11 classification table, loads the existing
   hybrid YAML, and emits per-atom / per-composition files under
   the new tree. The script is idempotent: re-running against a
   decomposed tree produces no changes. The source files stay on
   disk during the transition; Phase A does *not* delete them
   until the law tests confirm equivalence.
2. **Extend the workspace catalog loader to walk
   `.canonical-artifacts/`.** New loader functions in
   `lib/application/catalog/loaders/` that walk
   `atoms/{agentic,deterministic}/{class}/...` and
   `compositions/{agentic,deterministic}/{sub-type}/...` and
   populate `WorkspaceCatalog.tier1Atoms` /
   `.tier2Compositions`. The loader must attach the correct
   `PhaseOutputSource` (slot 2 for `agentic/`, slot 3 for
   `deterministic/`) from the path prefix.
3. **Equivalence law test.** A new
   `tests/canon-decomposition.laws.spec.ts` that loads the
   un-decomposed catalog and the decomposed catalog and asserts
   that the set of atoms is bit-equivalent (address-normalized).
   This is the migration tripwire: we cannot delete a hybrid
   file until this law passes for it.
4. **Per-class decomposers.** The decomposer dispatches per atom
   class (a fold over `AtomClass`). Each decomposer is a pure
   function `(hybrid: HybridFile, source: PhaseOutputSource) → readonly Atom<C, unknown>[]`.
   The compile-time-exhaustive registry `Record<AtomClass, Decomposer>`
   enforces that every atom class has one, matching the existing
   `L4_VISITORS` and `AtomPromotionGateRegistry` pattern.
5. **Transition atom schema extension.** Before decomposing
   transitions out of hybrid compounds, extend
   `TransitionAtomAddress`
   (`lib/domain/pipeline/atom-address.ts:113-118`) with optional
   `reverseOf?: { fromScreen: ScreenId; toScreen: ScreenId; trigger: string }`
   and update `atomAddressToPath` for the new shape (paths stay
   backward-compatible because the field is optional). The
   `precondition: ObservationPredicate` linkage can be an
   `observation-predicate` atom cross-reference rather than an
   inlined field. See Phase E work items for the runtime wiring;
   the schema extension belongs in Phase A because transitions
   decompose here.

**Scalability pattern.**

- **Mapped-type decomposer registry** (same template as
  `L4_VISITORS` at `lib/domain/fitness/metric/visitors/index.ts:42-50`).
- **Compile-time-exhaustive fold** over `AtomClass` (template at
  `lib/domain/pipeline/atom-address.ts:177-210`'s switch on `address.class`).
- **Pure functions** — the decomposer is a domain-layer function
  with no IO. The script in `scripts/` runs it, reads from disk,
  writes to disk. Domain purity law (architecture-fitness law 1 at
  `tests/fitness/architecture-fitness.laws.spec.ts:58-87`) stays
  green.

**Exit criteria.**

- Every hybrid compound in § 11 has either been decomposed or
  been added to a short-list with a migration reason.
- `tests/canon-decomposition.laws.spec.ts` is green for every
  decomposed file.
- `WorkspaceCatalog.tier1Atoms.size > 0` after loading the dogfood
  suite.
- An `npm run iterate` warm run that previously hit slot 4 for
  element atoms now hits slot 3 for at least one atom class (the
  lookup chain result's `winningSource` field at
  `lib/domain/pipeline/lookup-chain.ts:57-73` is
  `'deterministic-observation'`).
- Architecture-fitness laws remain green. If Phase A adds new
  folds, architecture-fitness law 3 at
  `tests/fitness/architecture-fitness.laws.spec.ts:116-134`
  (currently expecting 8 fold functions in `visitors.ts`) must be
  updated to reflect the new count.

**Metric movement.**

- Pipeline-efficacy L4 tree: `extraction-ratio` and
  `rung-distribution` shift toward higher-precedence rungs as the
  lookup chain actually has canon to return. Magnitude depends on
  how much of the hybrid content was hit by the existing resolver.
- Discovery-fitness tree: not yet built, so no movement here until
  Phase B.
- M5: still uncomputable until Phase B adds the trajectory
  primitive; but Phase A is the precondition because the cohort
  trajectory needs per-atom provenance to build.

**Law tests added.**

- `tests/canon-decomposition.laws.spec.ts` — equivalence between
  hybrid and decomposed forms per atom class.
- Extension to `tests/fitness/architecture-fitness.laws.spec.ts`
  law 3 if new folds land.

### Phase B — Dual L4 metric tree (discovery-fitness peer) + trajectory primitives

**Goal.** Stand up the discovery-fitness L4 tree alongside the
existing pipeline-efficacy tree, and introduce the cohort-trajectory
primitives M5 needs to be computable. Close the middle three rows
of § 3.2.

**Doctrinal seams.**

- `lib/domain/fitness/metric/visitor.ts:27-40` — the `MetricVisitor<Input, Kind>`
  typeclass is the template. Any new visitor implements this
  interface, no exceptions.
- `lib/domain/fitness/metric/catalogue.ts:19-46` — the
  `L4_METRIC_KINDS` const tuple. New kinds are added here first;
  the `L4_VISITORS` mapped type then forces registration.
- `lib/domain/fitness/metric/visitors/index.ts:42-83` — the
  `L4_VISITORS` registry and `buildL4MetricTree` aggregator.
  Extended in Phase B to build a *second* tree; see work item B1.
- `lib/domain/fitness/memory-maturity.ts:27-93` — the
  `MemoryMaturity` brand + `computeMemoryMaturity` +
  `maturityDelta`. The trajectory primitive composes these with a
  history-point series.
- `lib/domain/synthesis/cohort-plan.ts:50-100` — `CohortDefinition`
  and `CohortManifestEntry` already exist; Phase B adds a cohort
  *trajectory* type that indexes maturity values by cohort
  identity over time.

**Work items.**

1. **New file: `lib/domain/fitness/metric/catalogue-discovery.ts`**
   introducing a parallel `DISCOVERY_FITNESS_METRIC_KINDS` const
   tuple. Initial set, each justified by a direct-observation
   question:
   - `'discovery-route-fidelity'` — cold-derived routes ≈ canonical
     route atoms? (Jaccard over addresses plus content equivalence.)
   - `'discovery-surface-fidelity'` — same for surfaces.
   - `'discovery-element-fidelity'` — same for elements.
   - `'discovery-posture-fidelity'` — same for postures.
   - `'discovery-selector-fidelity'` — same for selectors.
   - `'discovery-coverage'` — what fraction of canonical artifact
     addresses the cold run produced *anything* for.
   - `'intervention-graduation-rate'` — rolling fraction of agentic
     overrides that have been demoted this window. Slow-and-steady
     is the healthy direction; a spike means the engine is
     catching up.
   - `'discovery-family-recognition-rate'` — placeholder metric
     added in Phase E; declared in Phase B as a stub visitor that
     returns a zero proxy, so the registry is future-proof.
2. **New directory: `lib/domain/fitness/metric/visitors-discovery/`**
   with one file per visitor, plus an `index.ts` that mirrors the
   existing `visitors/index.ts`:
   - `DISCOVERY_L4_VISITORS` — compile-time-exhaustive mapped type
     `{ readonly [K in DiscoveryL4MetricKind]: MetricVisitor<DiscoveryL4VisitorInput, K> }`.
   - `buildDiscoveryL4MetricTree(input)` — same shape as
     `buildL4MetricTree` at lines 62-83, building a tree rooted at
     a synthetic `'discovery-l4-root'` node.
   - `DiscoveryL4VisitorInput` — a value object carrying the cold
     derivation manifest (the `DiscoveryRunOutput` from the
     discovery runner at
     `lib/application/discovery/discovery-runner.ts:79-82`), the
     snapshot of the canonical artifact store (the relevant slice
     of `WorkspaceCatalog.tier1Atoms`), and `computedAt`.
3. **New file: `lib/domain/fitness/memory-maturity-trajectory.ts`**.
   A pure type + constructor. Shape (sketch):
   ```typescript
   export interface MemoryMaturityPoint {
     readonly cohortId: CohortId;
     readonly maturity: MemoryMaturity;
     readonly effectiveHitRate: number;
     readonly computedAt: string;
     readonly scorecardCommit: string; // pipeline version for provenance
   }

   export interface MemoryMaturityTrajectory {
     readonly points: readonly MemoryMaturityPoint[]; // ordered by computedAt
   }

   export function appendTrajectoryPoint(
     trajectory: MemoryMaturityTrajectory,
     point: MemoryMaturityPoint,
   ): MemoryMaturityTrajectory { /* pure, returns new value */ }

   export function trajectorySlope(
     trajectory: MemoryMaturityTrajectory,
     window: number,
   ): number { /* linear regression over the last N comparable points */ }

   export function isComparableAt(
     a: MemoryMaturityPoint,
     b: MemoryMaturityPoint,
   ): boolean { /* cohort comparability predicate */ }
   ```
   The trajectory type is a pure data structure; application-layer
   code accumulates points across improvement runs and stores the
   trajectory in the improvement ledger at
   `.tesseract/benchmarks/improvement-ledger.json`.
4. **New L4 visitor: `memory-worthiness-ratio.ts`** in the
   pipeline-efficacy tree (not the discovery tree). Implements M5
   by reading a `MemoryMaturityTrajectory` from the input shape,
   computing `trajectorySlope` over the configured window, dividing
   by scorecard maintenance overhead from the improvement ledger,
   and emitting a single `metric()` node with provenance. The
   existing `L4_VISITORS` registry gains a new entry; this is a
   *breaking change* to the mapped type that the TypeScript
   compiler will enforce.
5. **New L4 visitor: `intervention-marginal-value.ts`** in the
   pipeline-efficacy tree (or its own shared-branch tree — see
   Phase C for the data-wiring dependency). Implements C6 by
   folding populated `InterventionTokenImpact` records over the
   rolling window. Gated on Phase C for real measurement; in
   Phase B it lands as a stub visitor that returns a zero proxy
   and marks its theorem-group status as `proxy`.
6. **`score` command updated** — in the application layer, the
   command that today builds the single L4 tree now builds both
   trees and emits them side-by-side, tagged by tree identity.
   Baseline diffing applies independently per tree.
7. **Extend architecture-fitness law 3** to include the new
   visitor module(s) in its expected fold count, OR add a new law
   for the second registry's exhaustiveness.
8. **Law test for the trajectory primitive.** A new
   `tests/memory-maturity-trajectory.laws.spec.ts` asserting:
   determinism (same point sequence → same slope), empty
   trajectory slope = 0, single-point slope = 0, monotone positive
   input → positive slope, monotone negative input → negative
   slope.

**Scalability pattern.**

- **Two separate mapped-type registries**, each independently
  exhaustive. Adding a new pipeline-efficacy kind still requires
  updating `L4_VISITORS`; adding a new discovery-fitness kind
  requires updating `DISCOVERY_L4_VISITORS`. The two trees do
  *not* share a flat registry because their input shapes are
  different.
- **MetricVisitor typeclass reuse** — both trees use the same
  `MetricVisitor<Input, Kind>` typeclass from
  `lib/domain/fitness/metric/visitor.ts`, parameterized on a
  different Input. No parallel typeclass, no copy-paste.
- **Value-object trajectory** — the trajectory is a readonly
  record, not a mutable accumulator. Appending returns a new
  value; `trajectorySlope` is pure.

**Exit criteria.**

- `buildDiscoveryL4MetricTree` returns a tree with ≥ 5 child
  nodes, each populated from a non-trivial
  `DiscoveryL4VisitorInput`.
- `score --discovery-fitness` produces a readable report.
- `M5` has at least one directly-computed (not proxy) value in a
  fitness report, gated on the trajectory having ≥ 3 comparable
  cohort points.
- `tests/memory-maturity-trajectory.laws.spec.ts` is green.
- The architecture-fitness report continues to pass; the fold
  count law has been updated to reflect the new visitor folds.
- `DISCOVERY_L4_VISITORS` passes its exhaustiveness law test (new
  test file mirroring `tests/fitness/metric-visitors.laws.spec.ts`).

**Metric movement.**

- Discovery-fitness tree: first non-zero values observed. Initial
  numbers likely low for the dogfood suite because the discovery
  engine currently only covers screen scaffolds and route harvest;
  the low numbers are honest and tracked against cohort trajectory.
- M5: graduates from `proxy` to `direct` per the
  alignment-targets.md per-theorem-group floors table. Per the
  2026-Q2 floor (1.0, rising), M5 should be computable and above
  1.0 after Phase B for the dogfood cohorts.
- C6: stays `proxy` (the visitor lands but the data is not wired
  until Phase C).

**Law tests added.**

- `tests/fitness/metric-visitors-discovery.laws.spec.ts` —
  exhaustiveness of `DISCOVERY_L4_VISITORS`.
- `tests/memory-maturity-trajectory.laws.spec.ts` — trajectory
  algebra.
- Updates to the fold-count law in
  `tests/fitness/architecture-fitness.laws.spec.ts`.

### Phase C — Intervention receipt braid closure (C6 direct measurement)

**Goal.** Close the loop that turns the existing
`InterventionTokenImpact` optional fields into a populated,
measured C6 scoreboard value. This is where the intervention
engine stops being "operator answers a question" and starts being
a braid — the typed lineage from agent hypothesis through
intervention receipt through promoted canon through downstream
rung-improvement is measured and surfaced per alignment-targets C6.

**Doctrinal seams.**

- `lib/domain/handshake/intervention.ts:162-226` — the
  `InterventionTokenImpact`, `InterventionHandoffChain`,
  `InterventionHandoff`, and `InterventionReceipt` types already
  carry every field the braid needs. `tokenImpact` is optional
  because nothing populates it today; Phase C's job is to populate
  it from evidence.
- `lib/domain/handshake/intervention.ts:174-179` —
  `DriftAcknowledgement` is the explicit drift-recording type H19
  (drift detectability) expects. Phase C's before/after measurement
  populates it when inference has drifted from evidence.
- `lib/application/governance/auto-approval.ts:135-177` — the
  `autoApprovalVerdict` monadic-bind chain is the template for
  composing C6's measurement gates. Each check in the "did this
  intervention pay off?" evaluation is a
  `InterventionReceipt → GovernanceVerdict<_, MeasurementIssue>`
  function chained with `chainVerdict`.
- `lib/application/improvement/` — the improvement ledger is
  where the rolling window of measurements lives.

**Work items.**

1. **New file: `lib/domain/handshake/intervention-impact.ts`** —
   pure functions for computing `InterventionTokenImpact` from
   a before/after pair. Signature sketch:
   ```typescript
   export interface InterventionRegion {
     readonly screens: readonly ScreenId[];
     readonly elements: readonly (readonly [ScreenId, ElementId])[];
     readonly runbookRefs: readonly string[];
   }

   export interface RegionSnapshot {
     readonly rungDistribution: ReadonlyMap<ResolutionPrecedenceRung, number>;
     readonly ambiguityCount: number;
     readonly suspensionCount: number;
     readonly capturedAt: string;
     readonly runIds: readonly string[];
   }

   export function computeImpact(input: {
     readonly before: RegionSnapshot;
     readonly after: RegionSnapshot;
     readonly estimatedReadTokens: number;
     readonly payloadSizeBytes: number;
   }): InterventionTokenImpact;
   ```
   Pure domain module — no Effect, no IO, no application imports.
2. **New file:
   `lib/application/intervention/impact-scheduler.ts`** — the
   application-layer scheduler that, for each new
   `InterventionReceipt` produced during an iterate run:
   - Captures the `before` snapshot of the receipt's
     `attachmentRegion` (a new field on the handoff; see work
     item 3) *at receipt creation time*.
   - Waits for the next N runs (configurable, default 3) that
     touch the region.
   - Computes the `after` snapshot.
   - Calls `computeImpact` and rewrites the receipt's
     `handoff.tokenImpact` field via the Envelope `mapPayload`
     pattern from the architecture-fitness invariants.
3. **Extension to `InterventionHandoff`**: add
   `attachmentRegion: InterventionRegion` (non-optional for new
   handoffs; backward-compatible read for old ones via migration).
   The region is what the agent says the intervention is *about* —
   without it, "the region it attached to" in the C6 definition
   has no referent.
4. **Wire `intervention-marginal-value.ts` (the stub from Phase B)
   to real data.** The visitor now reads populated
   `InterventionTokenImpact` records from the improvement ledger
   and computes the rolling-window fraction of interventions
   where `ambiguityReduction > 0 ∨ suspensionAvoided ∨ rungImprovement > 0`.
   The C6 direct measurement gate in alignment-targets graduates
   from `proxy` to `direct`.
5. **Drift acknowledgement wiring.** When the before/after
   comparison detects semantic drift (the `after` snapshot has a
   rung distribution incompatible with the receipt's hypothesis),
   the scheduler populates
   `InterventionHandoffChain.driftAcknowledgedBy` with a typed
   `DriftAcknowledgement`. Silent drift becomes impossible — H19
   obligation is satisfied by construction.
6. **A law test for the braid**:
   `tests/intervention-impact.laws.spec.ts` asserting
   determinism (same before/after → same impact), monotonicity
   (more rung improvement → strictly higher impact score),
   identity (before == after → zero impact), and that the
   impact computation never returns undefined for populated
   inputs.

**Scalability pattern.**

- **Pure impact computation** — the `computeImpact` function is
  pure domain and testable in isolation. The scheduler is Effect
  but its core logic is a thin wrapper around the pure function.
- **Envelope discipline** — populating `tokenImpact` on an
  existing receipt goes through `mapPayload` (from
  `docs/doctrine-invariants.md` § Preferred Patterns), never
  in-place mutation. The receipt is a handoff envelope; the
  envelope discipline law at architecture-fitness law 4
  (`tests/fitness/architecture-fitness.laws.spec.ts:138-150`)
  stays green.
- **GovernanceVerdict chain** for the measurement decision —
  "should this impact count for C6?" runs as a
  `chainVerdict` composition mirroring `autoApprovalVerdict`.

**Exit criteria.**

- At least one iterate run produces an `InterventionReceipt`
  whose `handoff.tokenImpact` is populated from real before/after
  evidence.
- C6 graduates from `proxy` to `direct` in the scorecard.
- The C6 visitor's output is non-zero for the dogfood cohorts
  and consistent across repeated runs of the same seed.
- `tests/intervention-impact.laws.spec.ts` is green.
- A synthetic negative test — a deliberately-bad agentic
  intervention — produces an impact score of zero or negative
  and triggers a demotion proposal candidate.

**Metric movement.**

- C6: `proxy → direct`, at or above the 2026-Q2 floor (50%
  rising per alignment-targets).
- M5: unchanged mechanism, but the trajectory signal becomes
  more reliable because acceptance is no longer blind to
  intervention value.

**Law tests added.**

- `tests/intervention-impact.laws.spec.ts`.

### Phase D — Promotion gate confidence-interval scoring

**Goal.** Replace optional scalar scores on promotion gates with a
dynamic, observation-count-aware confidence interval. A single
flaky cold observation can no longer promote a bad atom; a
consistently good cold observation promotes quickly; a
consistently-improving-but-still-uncertain observation surfaces
`needs-review` instead of silently promoting.

**Doctrinal seams.**

- `lib/domain/pipeline/promotion-gate.ts:30-135` — the gate
  interfaces are Strategy pattern per atom class, with
  `PromotionEvaluation.scores` as an optional
  `{ candidate: number; existing: number | null }` pair. Phase D
  extends the evaluation shape with a confidence-interval
  component; existing gates keep their scalar scores as the
  point estimate.
- `lib/domain/algebra/scoring.ts:1-42` — `ScoringRule<T>` +
  Monoid instances are the composable-score template. A
  confidence-interval score is a different algebraic structure
  (Beta posterior, not additive) and gets its own module.

**Work items.**

1. **New file: `lib/domain/pipeline/promotion-confidence.ts`** —
   pure domain module providing:
   ```typescript
   export interface BetaPosterior {
     readonly successes: number; // α - 1
     readonly failures: number;  // β - 1
   }

   export interface ConfidenceInterval {
     readonly pointEstimate: number;    // mean of the posterior
     readonly lowerBound: number;       // e.g. 5th percentile
     readonly upperBound: number;       // e.g. 95th percentile
     readonly sampleCount: number;      // successes + failures
   }

   export function betaPosteriorFromObservations(
     successes: number,
     failures: number,
   ): BetaPosterior;

   export function confidenceInterval(
     posterior: BetaPosterior,
     alpha: number, // e.g. 0.05 for a 90% CI
   ): ConfidenceInterval;

   export function combinePosteriors(
     a: BetaPosterior,
     b: BetaPosterior,
   ): BetaPosterior; // Monoid instance — conjugate-prior addition
   ```
   Pure math, domain-local. No external stats library; the
   implementation is a closed-form Beta distribution with numeric
   quantile approximation sufficient for α ∈ [0.01, 0.20].
2. **Extension to `PromotionEvaluation`**: add
   `confidence?: ConfidenceInterval`. Existing consumers ignore
   the field; new consumers read it. The verdict decision
   function gets a helper:
   ```typescript
   export function verdictFromConfidence(
     candidateCI: ConfidenceInterval,
     existingCI: ConfidenceInterval | null,
     policy: {
       readonly minimumSampleCount: number;
       readonly minimumLowerBound: number;
       readonly minimumMarginOverExisting: number;
     },
   ): PromotionVerdict;
   ```
   This is where "automatic promotion with dynamic confidence
   intervals" (per your Q5 answer) lives. Low sample count →
   `needs-review`. High sample count, lower bound above floor,
   margin over existing → `promote`. High sample count, lower
   bound below floor → `insufficient-quality`. No hardcoded
   thresholds: the policy is a data record per atom class.
3. **Per-atom-class policy table.** A new
   `lib/domain/pipeline/promotion-policies.ts` with a
   compile-time-exhaustive `Record<AtomClass, PromotionConfidencePolicy>`
   analogous to `AtomPromotionGateRegistry`. Routes get
   conservative policies (they rarely change, fewer observations
   should still allow promotion); elements get laxer policies;
   resolution overrides get the tightest because they're the
   highest-cadence demotion target.
4. **Wire promotion policies into the existing per-class gates.**
   The application-layer promotion machinery reads the policy,
   computes the candidate / existing confidence intervals from
   the observation counts the discovery runner already tracks,
   and returns the verdict via `verdictFromConfidence`. No gate
   loses its existing scalar score fallback — it remains for
   debugging and for gates that don't have enough observations
   to use the CI method yet.
5. **Law tests.** `tests/promotion-confidence.laws.spec.ts`
   asserting: `combinePosteriors` is a Monoid (associative,
   identity element is `{successes: 0, failures: 0}`);
   `betaPosteriorFromObservations` is deterministic;
   `confidenceInterval.lowerBound ≤ pointEstimate ≤ upperBound`;
   adding a success to a posterior shifts the point estimate
   strictly upward; sample-count-monotonicity (more observations
   with the same success rate shrinks the interval width).
6. **Demotion gate symmetry.** `AtomDemotionGate.evaluate` at
   `lib/domain/pipeline/promotion-gate.ts:107-113` gets the
   same confidence-interval treatment. Demotion is always
   deliberate per § 7.2, but the gate's recommended action
   should be backed by the same statistical machinery as
   promotion.

**Scalability pattern.**

- **Monoid composition** — Beta posteriors combine by additive
  conjugate-prior update, which is a Monoid. The existing
  `lib/domain/algebra/monoid.ts` lineage is the template.
- **Mapped-type policy registry** — `Record<AtomClass, PromotionConfidencePolicy>`
  enforces per-class policy coverage at compile time.
- **Fold over atom class** — the verdict helper dispatches on
  atom class to pick the right policy, matching the existing
  fold template.

**Exit criteria.**

- At least one promotion event in the dogfood loop uses the
  confidence-interval path end-to-end.
- A synthetic test where a flaky cold derivation produces a
  success-then-failure-then-success sequence does *not*
  promote on the first success; it waits for the sample count
  policy to clear.
- `tests/promotion-confidence.laws.spec.ts` is green.
- Architecture-fitness law tests remain green; the new Monoid
  instance is discoverable by any law that scans for them.

**Metric movement.**

- Pipeline-efficacy tree: no direct change.
- Discovery-fitness tree: `intervention-graduation-rate` becomes
  more stable (fewer oscillating demotions because the
  confidence interval smooths across flaky observations).
- M5: unchanged mechanism; numerator/denominator become less
  noisy.

**Law tests added.**

- `tests/promotion-confidence.laws.spec.ts` — Beta posterior
  Monoid laws + verdict helper behavior.

### Phase E — Runtime-family recognition (OutSystems Reactive 11)

**Goal.** Specialize the discovery engine for the target SUT family
without hardcoding target particulars into application logic. The
target is an OutSystems Reactive 11 enterprise app with wizard-style
flows, role-based field-level authorization, and bidirectional
approval/reject transitions. The doctrinal move: introduce a
`runtime-family` atom class so the family membership is a
*discoverable, canonical* fact, then specialize discovery strategies
per family via an existing-pattern Strategy registry.

**Doctrinal seams.**

- `lib/domain/pipeline/atom-address.ts:32-48` — the `ATOM_CLASSES`
  const tuple. Phase E adds `'runtime-family'` to the tuple and a
  new `RuntimeFamilyAtomAddress` variant to the address union,
  matching the existing 15 classes. Adding the entry is a
  compile-breaking change that the promotion-gate registry, the
  decomposer registry (Phase A), and the discovery runner registry
  will all catch.
- `lib/application/discovery/discovery-runner.ts:48-53` — the
  `DiscoverySurfaceKind` enum gains a `'runtime-family-signature'`
  variant. Adding it is a compile-breaking change that forces a
  corresponding adapter file under `lib/application/discovery/`.
- `lib/domain/widgets/role-affordances.ts` — the role-affordance
  table (per `docs/convergence-backlog.md` P1-1, already
  implemented per `docs/current-state.md`). Phase E does *not*
  edit this file; it introduces a per-family specializer that
  applies on top of the base table (see work item E4).

**Work items.**

1. **Extend `ATOM_CLASSES` with `'runtime-family'`.** Add
   `RuntimeFamilyAtomAddress` (keyed by a new
   `RuntimeFamilyId` brand), extend `atomAddressToPath` with the
   new case, and ship the corresponding promotion gate (it can
   start as a scalar gate in Phase E and get CI scoring in a
   follow-up). The decomposer registry from Phase A gains a
   decomposer for runtime-family atoms that reads from the
   application's canonical source (see work item E3).
2. **New file: `lib/domain/target/runtime-family.ts`** — a pure
   domain module declaring `RuntimeFamilyId`, a
   `RuntimeFamilySignature` shape (a set of DOM signals,
   class prefixes, script globals, ARIA landmark patterns that
   identify the family), and a *content* type for the
   runtime-family atom. This content should be extensible —
   new families add their own signatures without editing the
   module per family.
3. **New file: `dogfood/.canonical-artifacts/agentic/atoms/runtime-family/outsystems-reactive-11.yaml`**
   — the first runtime-family atom, agent-authored as an
   agentic override until the discovery engine can produce it
   deterministically. The content is a signature bundle we
   hand-author based on observing known OutSystems Reactive 11
   sites (publicly accessible, OutSystems customers only for
   recognition signatures, not for full content). The point:
   the signature bundle is canon, not code. Anyone observing a
   new OutSystems app can validate the signature without
   editing `lib/`.
4. **New adapter:
   `lib/application/discovery/runtime-family-specializer.ts`**
   — a Strategy that takes a `DiscoveryRunInput` and a resolved
   runtime-family atom (via the lookup chain's normal slot walk)
   and returns an augmented `DiscoveryRunOutput` where
   family-specific selector ladder priors, widget idiom
   mappings, and role-affordance overrides have been applied.
   The specializer is per-family; a
   `Record<RuntimeFamilyId, DiscoverySpecializer>` registry in
   the application layer enforces that every known family has
   a specializer. Families without a specializer get the
   generic discovery path — no silent fallback to the demo
   harness.
5. **New adapter:
   `lib/application/discovery/runtime-family-detector.ts`** —
   a new discovery runner implementing the
   `'runtime-family-signature'` surface. The detector reads a
   fresh page snapshot, walks every registered
   `RuntimeFamilySignature`, and emits a runtime-family atom
   with confidence. The atom then flows through the normal
   promotion machinery.
6. **Transition atom `reverseOf` usage.** Now that Phase A
   extended `TransitionAtomAddress` with an optional
   `reverseOf` linkage, Phase E populates it for OutSystems
   approval/reject transitions. The specializer knows that
   certain form submit buttons in OutSystems wizard flows emit
   transitions with implicit `reverseOf` counterparts; the
   detector produces pairs of transition atoms with the
   bidirectional linkage. The runtime's state-transition
   planner uses `reverseOf` when computing rollback paths for
   recovery.
7. **Wire `discovery-family-recognition-rate`** (stub from
   Phase B) to real data. The visitor now reads the count of
   screens for which a runtime-family atom exists divided by
   the total number of screens in the canonical artifact store.
   Graduates from `proxy` to `direct`.
8. **Law tests.**
   - `tests/runtime-family.laws.spec.ts`: signature matching is
     deterministic; a non-OutSystems page produces no
     OutSystems atom; two independently-authored OutSystems
     pages produce atoms with identical family identity.
   - Extension to the `ATOM_CLASSES` coverage tests to include
     the new class.

**Scalability pattern.**

- **Strategy registry per family** — the per-family specializer
  registry is a `Record<RuntimeFamilyId, DiscoverySpecializer>`
  mirroring `AtomPromotionGateRegistry`. Adding a new family is
  a new row in the registry and a new adapter file, not an edit
  to existing code. This is the structural answer to "do not
  hardcode particulars into application logic" — every OutSystems
  specialization lives in exactly one adapter.
- **Extension of existing `AtomClass` enum** — the new class
  doesn't invent a parallel taxonomy. It lives inside the
  existing 15-class universe and inherits all the fold, promote,
  lookup, and catalog machinery for free.
- **Signature as data** — the runtime family is canonical, not
  code. Discovering a new OutSystems customer app is a matter
  of promoting observations, not editing the source tree.

**Exit criteria.**

- The demo harness (which is *not* OutSystems) produces no
  OutSystems-family atom when run through the detector.
- A public OutSystems demo page produces the OutSystems atom
  with the hand-authored signature.
- Discovery runs against the demo harness produce the same
  output as before Phase E (no regression in the non-family
  case).
- Discovery runs against an OutSystems page produce
  family-specialized atoms for at least one atom class (e.g.
  selector atoms with OutSystems-specific locator ladder
  priors).
- `discovery-family-recognition-rate` graduates from `proxy` to
  `direct`.
- Architecture-fitness laws remain green.

**Metric movement.**

- Discovery-fitness tree: `discovery-family-recognition-rate`
  goes non-zero. Other fidelity metrics unchanged against the
  demo harness, but the tree now meaningfully reports on the
  production target.
- M5: unchanged on dogfood; becomes measurable for the first
  time against an OutSystems target.
- C6: measurable against an OutSystems target because
  interventions on role-based visibility (Phase F's territory)
  can now be anchored to real role atoms.

**Law tests added.**

- `tests/runtime-family.laws.spec.ts`.

### Phase F — Tier 3 projections go live

**Goal.** Seed Tier 3 projections in the canonical artifact store
— specifically role-visibility, role-interaction, wizard-state,
and process-state — so the lookup chain's qualifier-aware path
has real content to filter. Phase F comes *after* Phase E because
role visibility on OutSystems is meaningless without
runtime-family recognition; the role atoms only make sense inside
a family-specialized discovery pass.

**Doctrinal seams.**

- `lib/domain/pipeline/projection-address.ts:39-133` — the
  seven projection sub-types are already enumerated. Phase F
  populates their content, not their structure.
- `lib/domain/pipeline/qualifier.ts:30-103` — `QualifierBag`
  and `intersectApplicability` are already wired. Phase F's
  downstream effect: consumers start passing non-empty
  qualifier bags through the lookup chain, and
  `intersectApplicability` starts doing real work.
- `lib/application/pipeline/lookup-chain-impl.ts` — the
  qualifier-aware lookup path already exists. Phase F's job is
  to ensure its tests have non-trivial inputs.

**Work items.**

1. **Seed `role-visibility` projections against the
   OutSystems-specialized discovery output.** The discovery
   runner from Phase E produces role-visibility observations
   when it sees field-level authorization signals in
   OutSystems (hidden fields for roles without permission,
   read-only fields for roles with read-only, interactive for
   authors). These observations flow into the promotion
   machinery and become Tier 3 projection atoms.
2. **Seed `wizard-state` projections.** The detector
   recognizes OutSystems wizard steps (a well-known widget
   pattern) and emits wizard-state atoms per step. The
   resulting projection atoms allow the lookup chain to
   answer questions like "which form fields are interactive
   in step 3 of the amendment wizard?"
3. **Add the `process-state` projection content type.** A
   `process-state` projection describes which atoms are
   visible/interactive when a business entity is in a
   particular state (e.g., "when a policy is
   `pending-underwriter-review`, the premium field is
   read-only to the broker role"). Agent-authored initially,
   potentially discoverable after Phase E stabilizes.
4. **Wire qualifier-bag passing into the runtime resolution
   pipeline.** Today the resolver calls the lookup chain
   without qualifiers because none exist. Phase F's runtime
   side: when a scenario step runs inside a role context (from
   the scenario's metadata) and the current wizard state is
   known from observed evidence, the resolver passes the
   corresponding `QualifierBag` so the projection tier filters
   the candidate atoms before scoring.
5. **Law tests.**
   - `tests/projection-applicability.laws.spec.ts`: given a
     fixture atom set and a fixture projection set, the
     qualifier-aware lookup returns the expected filtered
     results. Monoid laws on `intersectApplicability` (already
     exist presumably but should be verified for completeness).
   - Extension to the `PROJECTION_SUB_TYPES` coverage test to
     assert that every sub-type has at least one content
     example somewhere in the dogfood or test fixtures.

**Scalability pattern.**

- **Monoid applicability composition** — `intersectApplicability`
  is the Monoid; the identity is `'interactive'`. Phase F's
  runtime consumers compose via `reduce` over the qualifier
  bag, never via if/else chains.
- **Per-sub-type promotion gates** already exist via
  `ProjectionPromotionGateRegistry`. No new pattern, just new
  instances.

**Exit criteria.**

- At least one iterate run against an OutSystems target
  resolves a step where the qualifier-filtered atom set is
  strictly smaller than the unfiltered atom set (i.e., the
  projection tier materially affected resolution).
- `tests/projection-applicability.laws.spec.ts` is green.
- The alignment-targets M5 direction remains monotonic
  up — projections do not accidentally suppress atoms that
  should remain visible.

**Metric movement.**

- Discovery-fitness tree: `discovery-coverage` includes
  projection atoms for the first time.
- C6: interventions on role visibility now have a real
  measurement substrate (the before/after comparison includes
  qualifier-aware lookups).
- M5: cohort trajectory improves as mature cohorts
  increasingly resolve via canon without live DOM
  consultation.

**Law tests added.**

- `tests/projection-applicability.laws.spec.ts`.

---

## 5. Scalability guardrails

Every phase in § 4 is required to preserve the existing pattern
language. This section enumerates the specific guardrails and
cites the seam that enforces each one. If a phase's implementation
requires violating a guardrail, that is a signal the phase is
mis-scoped and should be refined before landing.

### 5.1 Visitors for metric collection (never ad-hoc reduction)

Every new metric goes through a `MetricVisitor<Input, Kind>`
(`lib/domain/fitness/metric/visitor.ts:27-40`). The visitor is
registered in a mapped-type registry so the TypeScript compiler
enforces that every kind has a visitor. Adding a new metric without
registering it in the appropriate registry is a compile error, not
a runtime drift.

- **Pipeline-efficacy tree registry**:
  `L4_VISITORS: { readonly [K in L4MetricKind]: MetricVisitor<L4VisitorInput, K> }`
  at `lib/domain/fitness/metric/visitors/index.ts:42-50`.
- **Discovery-fitness tree registry** (added in Phase B):
  `DISCOVERY_L4_VISITORS: { readonly [K in DiscoveryL4MetricKind]: MetricVisitor<DiscoveryL4VisitorInput, K> }`.
- **Law**: `tests/fitness/metric-visitors.laws.spec.ts:71-80`
  asserts exhaustiveness of both registries.

**Violation test.** If someone writes
`runRecords.reduce((acc, r) => ({ ... ad-hoc field ... }))` in
`lib/application/improvement/fitness.ts` to compute a new metric
without a visitor, the architecture-fitness laws at
`tests/fitness/architecture-fitness.laws.spec.ts:116-134` start
failing when the fold count drifts.

### 5.2 Strategy for gates (promotion, demotion, discovery specialization)

Gates dispatch per typed discriminator (atom class, composition
sub-type, projection sub-type, runtime family). Each gate is a
record implementing a typed interface, not a class hierarchy. The
registries are compile-time-exhaustive mapped types.

- **Promotion**: `AtomPromotionGateRegistry` at
  `lib/domain/pipeline/promotion-gate.ts:120-122`.
- **Demotion**: `AtomDemotionGateRegistry` at
  `lib/domain/pipeline/promotion-gate.ts:132-134`.
- **Discovery specializer** (added in Phase E):
  `Record<RuntimeFamilyId, DiscoverySpecializer>`.
- **Decomposer** (added in Phase A):
  `Record<AtomClass, Decomposer>`.

**Violation test.** A switch statement in application code that
dispatches on atom class *without* going through a registry is a
code smell; the review for any Phase-A-through-F work should reject
it and require the switch be rewritten as a registry lookup.

### 5.3 Monoid composition for scoring and applicability

Composable scoring and applicability compose via Monoid instances.
This is the existing pattern at `lib/domain/algebra/monoid.ts` and
`lib/domain/algebra/scoring.ts`.

- **Applicability composition**: `intersectApplicability` at
  `lib/domain/pipeline/qualifier.ts:84-98`. Identity element
  `APPLICABILITY_IDENTITY` at line 102.
- **Scoring**: `ScoringRule<T>` semigroup + Monoid at
  `lib/domain/algebra/scoring.ts:1-42`.
- **Beta posterior combination** (added in Phase D): a new Monoid
  instance in `lib/domain/pipeline/promotion-confidence.ts` where
  `combinePosteriors` is the associative operation and
  `{ successes: 0, failures: 0 }` is the identity.

**Violation test.** A confidence combination implemented with
`let acc = ...; for (const x of xs) acc += x.success;` in domain
code fails the purity law at
`tests/fitness/architecture-fitness.laws.spec.ts:91-112`.

### 5.4 Exhaustive fold for case analysis

Discriminated unions get folded by a pure `fold*` function that
the TypeScript compiler checks exhaustively. The kernel visitor
module at `lib/domain/kernel/visitors.ts:13-321` contains nine
existing folds. The architecture-fitness law at lines 116-134
expects a specific set of fold functions to exist; adding folds
as part of Phase A/E/F updates this expected set.

- **Source fold**: `foldPhaseOutputSource` at
  `lib/domain/pipeline/source.ts:85-107`.
- **Atom class fold**: the switch inside `atomAddressToPath` at
  `lib/domain/pipeline/atom-address.ts:177-210` is a fold in
  inline form. Phase A's decomposer extracts this into a named
  `foldAtomClass` if it grows past a few use sites.
- **Governance fold**: `foldGovernance` at
  `lib/domain/governance/workflow-types.ts`.
- **Epistemic fold**: `foldEpistemicStatus` at
  `lib/domain/handshake/epistemic-brand.ts:72-91`.

**Violation test.** Ad-hoc `if (address.class === 'route') { ... }
else if (address.class === 'element') { ... }` chains in
application code are a code smell. The registry or fold should be
used instead. When in doubt, ask: "if we add a new atom class,
will the TypeScript compiler catch my forgetting to handle it
here?" If no, use the registry.

### 5.5 Phantom brands at governance and provenance boundaries

Phantom brands carry epistemic status at the type level.
`Approved<T>`, `ReviewRequired<T>`, `Blocked<T>` already exist;
`SourcedCandidate<T, Rung>` already carries resolution provenance;
`StagedEnvelope<T, Stage>` already carries pipeline-stage lineage;
`MemoryMaturity` already carries the temporal-epistemic maturity
scalar.

Phase D's `ConfidenceInterval` is *not* a phantom brand — it's a
value object because its content needs to be read and compared,
not just checked. That is a deliberate distinction: phantom brands
carry invariants the type system enforces invisibly; value objects
carry numeric content the consumer must inspect.

**Violation test.** A new function that accepts a raw
`number` where a `MemoryMaturity` is semantically required fails
the architecture-fitness law at law 4 (`foldGovernance` and
`mapPayload` required functions) only if the review catches it.
This is a reviewer-enforced guardrail, not a compile-time one.

### 5.6 Pure domain, Effect-forward application

Architecture-fitness law 1
(`tests/fitness/architecture-fitness.laws.spec.ts:58-87`) forbids
domain imports from application / runtime / infrastructure /
composition / playwright. Every phase in § 4 is constructed so
that the pure computation lives in `lib/domain/` and the Effect
orchestration lives in `lib/application/`.

- Phase A's decomposer is pure (`lib/domain/`); the migration
  script is Effect + IO (`scripts/`).
- Phase B's visitors and trajectory algebra are pure; the
  application scheduler is Effect.
- Phase C's `computeImpact` is pure; the scheduler is Effect.
- Phase D's Beta posterior math is pure; the gate integration is
  Effect.
- Phase E's runtime-family signature matching is pure; the
  detector is Effect.
- Phase F's projection filtering is pure (via Monoid); the
  qualifier-bag construction is Effect.

**Violation test.** Law 1 is the automated tripwire.

### 5.7 Envelope discipline

Every cross-boundary artifact carries a `WorkflowEnvelope`-shaped
header (`kind`, `version`, `stage`, `scope`, `ids`, `fingerprints`,
`lineage`, `governance`, `payload`). Transformations on envelope
payloads go through `mapPayload`, not via destructuring and
reconstruction. The existing example is `autoApprovalVerdict` at
`lib/application/governance/auto-approval.ts:135-177`, which uses
`chainVerdict` for gate composition.

**Violation test.** Architecture-fitness law 4
(`tests/fitness/architecture-fitness.laws.spec.ts:138-150`) asserts
that `mapPayload` exists and is used. Phase C's `tokenImpact`
population goes through `mapPayload` specifically to stay under
this law.

### 5.8 Law tests co-located with doctrine

Every new fold, visitor, registry, or Monoid instance lands with
a law test. The law tests are the mechanism by which the doctrine
stays anchored to the code — if someone deletes `foldGovernance`
or removes a visitor from the registry, the law test fails before
the change can merge.

Phases A–F each declare their own law tests in their work-items
lists above. The law tests are not optional.

---

## 6. Acceptance gates per phase

A phase is complete when:

1. Its exit criteria (listed per-phase in § 4) are all green.
2. The target metric movement (listed per-phase in § 4) is
   observable in the scorecard history across at least 3 seeds
   (per `docs/recursive-self-improvement.md` § Step 6's
   multi-seed rule).
3. No target metric in `docs/alignment-targets.md` regresses
   below its current-window floor.
4. All new law tests are green and the architecture-fitness laws
   remain green.
5. The phase's doctrinal edits (if any) to
   `docs/canon-and-derivation.md` have landed and are cross-linked.

| Phase | Primary gate | Alignment-targets movement |
|---|---|---|
| A | `tests/canon-decomposition.laws.spec.ts` + at least one warm run hitting slot 3 | No direct movement; unblocks B |
| B | `buildDiscoveryL4MetricTree` non-trivial output + M5 computable + ≥ 3 comparable cohort points | M5 `proxy → direct`, ≥ 1.0 floor (Q2) |
| C | C6 visitor reads populated `InterventionTokenImpact` from improvement ledger | C6 `proxy → direct`, ≥ 50% floor (Q2) |
| D | Synthetic flaky-observation test does not prematurely promote | `intervention-graduation-rate` stabilizes |
| E | OutSystems public page produces family atom; demo harness does not | `discovery-family-recognition-rate` `proxy → direct` |
| F | Qualifier-aware lookup materially filters resolver candidates in ≥ 1 run | Theorem group K `proxy → direct` (alignment-targets Q3) |

**Pareto acceptance rule.** Per
`docs/alignment-targets.md` § Acceptance gate semantics, a
scorecard improvement is accepted iff the candidate is not
Pareto-dominated and no target metric regresses below its floor.
Every phase above is evaluated against the full floor set, not
just its primary gate. A phase that hits its primary gate but
regresses C6 cannot be accepted until C6 is restored.

---

## 7. Risks and tripwires

Each risk has a detection signal and a remediation. Losing any
one of these tripwires means the plan is advancing blindly.

### 7.1 Overfitting to the demo harness

**Risk.** The demo harness at `dogfood/fixtures/demo-harness/` is
small, well-known, and easy to resolve. Phase-A-through-D work is
evaluated against it. A change that only improves metrics on the
demo harness but does not generalize is invisible until an
OutSystems target is introduced in Phase E.

**Detection.** The multi-seed rule from
`docs/recursive-self-improvement.md` § Step 6 — improvements must
hold across 3+ seeds. Phase B introduces a stricter version: the
cohort-trajectory slope must remain non-negative when computed
over *disjoint* cohort subsets. If a seed 42 run shows rising M5
but seed 137 shows falling M5, overfit is suspected.

**Remediation.** Delay Phase E if demo-harness overfit is detected
in A–D; adjust the scenario generator's variance profile to
stress the overfit dimensions.

### 7.2 Discovery-fitness tree drifts from pipeline-efficacy tree

**Risk.** Two independent registries means two places where a
metric can be added. A contributor adds a discovery-fitness metric
but doesn't add the matching pipeline-efficacy cross-reference,
and the `score` command's side-by-side view becomes misleading.

**Detection.** A new law test in Phase B:
`tests/dual-tree-coherence.laws.spec.ts` asserting that the two
trees are consistently surfaced by the `score` command and that
their metric namespaces are disjoint (no metric appears in both
registries).

**Remediation.** If drift is detected, rewrite the offending
addition to live in exactly one tree. A metric that feels like it
belongs in both is a signal the metric is under-factored; split
it into two semantically distinct metrics.

### 7.3 Intervention engine "pretending to braid"

**Risk.** Phase C's impact scheduler populates
`InterventionTokenImpact` fields, but the population is noisy
— the before/after comparison picks up unrelated changes in the
attachment region and attributes them to the intervention. C6
looks healthy but the intervention engine is actually
freeloading.

**Detection.** A synthetic negative-control test in Phase C: an
"intervention" that is a no-op (same content as existing canon)
should produce zero impact. If the impact is non-zero, the
before/after comparison is contaminated.

**Remediation.** Tighten the attachment region definition on
the handoff; require stricter temporal locality in the
before/after window; require the region to include only atoms
whose addresses the intervention explicitly names.

### 7.4 Confidence intervals widen indefinitely

**Risk.** Phase D's Beta posterior Monoid is only associative if
both operands represent independent observations. If the same
observation is double-counted because of a bug in the application
layer, the posterior under-estimates variance and the confidence
interval becomes falsely narrow, or conversely widens because
contradictory observations accumulate.

**Detection.** A law test in Phase D asserting that the interval
width is a monotone function of sample count for fixed success
rate: as `n` grows, the 90% CI width strictly shrinks. A
violation points at either a math bug or double-counting.

**Remediation.** Trace observations back to their run records;
de-duplicate by run identifier; tighten the invariant that each
`(run, address)` pair contributes exactly one observation.

### 7.5 Runtime-family signature authorship drift

**Risk.** Phase E relies on a hand-authored signature bundle for
OutSystems Reactive 11. If OutSystems ships a platform update
that changes the signatures (class prefix rename, new wrapper
element), the detector silently stops recognizing OutSystems
pages. Every downstream metric that depends on family
recognition regresses.

**Detection.** A smoke test in Phase E that runs the detector
against a small pinned set of known-OutSystems public pages and
asserts family recognition. The smoke test runs in CI and
surfaces drift within one run.

**Remediation.** Update the signature bundle as an agentic
override; the promotion gate for runtime-family atoms is
agent-authorable per the plan. Drift is expected; the detection
window is the constraint.

### 7.6 Tier 3 projection over-suppression

**Risk.** Phase F's qualifier-aware filtering can hide atoms that
should remain visible if a projection is authored too
restrictively. The resolver then falls through to live DOM or
`needs-human` when it shouldn't.

**Detection.** The L4 pipeline-efficacy tree's `rung-distribution`
metric should not shift toward lower rungs after Phase F ships.
If it does, the projection layer is over-filtering.

**Remediation.** Projection demotion. Phase F's projection
promotion gates use the same confidence-interval machinery from
Phase D; a projection that produces too many `hidden` verdicts
compared to ground-truth evidence becomes a demotion candidate.

### 7.7 Phase A leaves hybrid files on disk past their lifetime

**Risk.** Phase A's migration is idempotent and leaves the
original hybrid files on disk during transition. If the transition
never completes, the canon store has two sources of truth and the
lookup chain's behavior becomes ambiguous (which slot wins when
both `{suiteRoot}/knowledge/screens/policy-search.elements.yaml`
and `{suiteRoot}/.canonical-artifacts/deterministic/atoms/elements/policy-search/**`
exist?).

**Detection.** The equivalence law test
`tests/canon-decomposition.laws.spec.ts` runs for every hybrid
file; once it passes, that hybrid file becomes deletion-eligible.
A follow-up CI law asserts that any file listed in the § 11
classification table as `DECOMPOSE` which has a green equivalence
test has also been deleted.

**Remediation.** Delete the hybrid files on the same commit as
the equivalence test goes green for them, not "later."

### 7.8 The fold-count law becomes load-bearing in an unexpected way

**Risk.** `tests/fitness/architecture-fitness.laws.spec.ts`
law 3 at lines 116-134 expects a specific set of fold functions
in `visitors.ts`. Several phases in this plan introduce new
folds. If the law becomes a strict count-match instead of a
contains-match, adding a fold without updating the law is a
spurious CI failure.

**Detection.** Read the law's actual implementation before
Phase A's first fold lands. If it is strict (`expect(folds).toEqual([...])`),
loosen it to a contains check. If it is already a contains
check, proceed.

**Remediation.** Update the law's expected set in the same
commit as the fold addition. Never merge a fold without a law
update.

---

## 8. Relationship to existing documents

This plan sits atop `docs/canon-and-derivation.md` and inherits
its vocabulary. Other planning documents become subordinate.

| Document | Status after this plan | How to read it |
|---|---|---|
| `docs/canon-and-derivation.md` | Unchanged primary doctrine | The authoritative substrate model. This plan extends it with the specific edits listed in the corresponding doctrine-edit commit. |
| `docs/alignment-targets.md` | Unchanged wall, preamble added | The scoreboard. Every phase's metric movement is measured against the floors here. |
| `docs/recursive-self-improvement.md` | Unchanged parameter space, relationship section added | The Level-1 loop. This plan explicitly relates its Surface 1 parameter tuning to the substrate work here. The 15-knob parameter space is a Surface 1 tactic that runs *within* the phases, not in lieu of them. |
| `docs/convergence-roadmap.md` | Subordinate; banner added | Read as the tactical diagnosis of the convergence bottlenecks. The four-bottleneck model (widget coverage, route knowledge, proposal sparsity, demo harness) remains accurate but under-scoped. |
| `docs/convergence-backlog.md` | Subordinate; banner + phase retag added | Read as Surface 1/2 tactics that execute within the substrate migration. Each item retagged as `substrate-migration`, `surface-1-tactic`, `surface-2-tactic`, or `infrastructure-tactic`. |
| `docs/archive/research/temporal-epistemic-specification-addendum.md` | Unchanged | The formal model behind the alignment-targets wall. K5, L2s, L2, M5, C6 are its labels. |
| `docs/domain-model.md`, `docs/domain-ontology.md`, `docs/domain-class-decomposition.md` | Unchanged | Domain docs remain the ontological baseline. This plan extends them only by adding the `runtime-family` atom class and the `reverseOf` field on transitions — both of which slot into existing sections rather than inventing new ones. |
| `docs/seams-and-invariants.md` | Unchanged | The architectural guardrails. § 5 of this plan cross-references them. |
| `docs/coding-notes.md` | Unchanged | The FP/Effect/pattern language. Every work item in § 4 complies with it. |

---

## 9. Glossary

Terms introduced or reinforced by this plan. Canonical definitions
for terms already in `docs/canon-and-derivation.md` are not
repeated here — only the additions.

- **Braided intervention** — the inference↔evidence loop of the
  agentic intervention engine. A hypothesis becomes a typed
  intervention receipt with `handoff.semanticCore`; the receipt
  writes an agentic override to canon; subsequent runs weave
  runtime evidence back through the same receipt lineage to
  measure whether the inference paid off via
  `InterventionTokenImpact` population; C6 folds those impacts
  into a scoreboard value. An intervention that cannot show its
  evidence ancestry cannot participate in the braid.
- **Cold-start efficacy** — the gradient signal for the
  deterministic discovery engine: how close is cold-derived
  output to the canonical artifact store under `--mode compare`?
  Measured by the discovery-fitness L4 tree introduced in Phase B.
- **Dual L4 tree** — the two-tree scoreboard (pipeline-efficacy
  + discovery-fitness) introduced in Phase B. The `score`
  command emits both side-by-side.
- **Digital evidentiary interface model** — the preferred
  informal synonym for the three-tier interface model in
  `docs/canon-and-derivation.md` § 3.5. "Digital twin" is an
  acceptable synonym but understates that every atom is
  evidence-backed rather than mirror-backed. Introduced by user
  framing; adopted in the Phase-A doctrine edits.
- **Memory maturity trajectory** — a cohort-indexed, time-ordered
  series of `MemoryMaturity` points plus the corresponding
  `effectiveHitRate`. Introduced in Phase B as
  `lib/domain/fitness/memory-maturity-trajectory.ts`. M5's slope
  is computed over this trajectory.
- **Runtime family** — a new Tier 1 atom class introduced in
  Phase E. Identifies the runtime substrate a target SUT is
  built on (e.g., `outsystems-reactive-11`) via a signature
  bundle. Used by per-family discovery specializers to apply
  selector ladder priors, widget idioms, and role-affordance
  overrides without hardcoding family particulars into
  application logic.
- **Intervention marginal value** — the C6 scoreboard quantity:
  fraction of accepted agentic augmentations that reduced
  ambiguity, suspension, or rung-score in their attachment
  region within N runs. Introduced as a direct measurement in
  Phase C via the intervention-impact scheduler.
- **Attachment region** — a field on `InterventionHandoff` added
  in Phase C describing which screens, elements, and runbook
  references the intervention is *about*. Without it, "the
  region it attached to" in the C6 definition has no referent.
- **Confidence-interval promotion scoring** — the Phase D
  replacement for scalar promotion scores. Beta posterior over
  observation success/failure counts; the verdict depends on
  sample count, lower bound, and margin-over-existing rather
  than a point estimate.

---

*End of plan. This document is the active spine for substrate
convergence work. When it conflicts with
`docs/convergence-roadmap.md` or `docs/convergence-backlog.md`,
this document wins. When it conflicts with
`docs/canon-and-derivation.md`, canon-and-derivation wins.*

