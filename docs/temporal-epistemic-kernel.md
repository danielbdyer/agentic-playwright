# Temporal-Epistemic Kernel

> Status: **Active doctrine** (promoted out of archive 2026-04-10).
> The formal model behind the alignment-targets wall and the
> cold-start convergence plan. K5, L2s, L2, M5, C6, and the H1–H20
> handoff properties are its labels; `docs/alignment-targets.md`
> operationalizes M5 and C6 as the top-of-wall scoreboard,
> `docs/canon-and-derivation.md` cites K5 and L2s as the formal
> proxies for the ROI plateau, and `docs/cold-start-convergence-plan.md`
> sequences the phases that move the K / L / S / A / C / M theorem
> groups from `proxy` to `direct` measurement.
>
> Originally authored 2026-04-05; moved out of
> `docs/archive/research/` on 2026-04-10 because it is load-bearing
> for every active alignment decision and "archived" was misleading.

A **pure first-order treatment** is too weak for three things that matter centrally in your system:

1. **time** — because suspension, deferral, continuation, and drift are temporal,
2. **status** — because observed truth, proposed overlay, task-local aid, review-required claims, and blocked claims are not interchangeable,
3. **economics** — because compounding is not a single-event invariant; it is a trend over cohorts.

So the most effective formalization is a **many-sorted temporal-epistemic specification with metric functions**. That sounds grand, but in practice it just means:

- we keep explicit types for the major kinds of things in the world,
- we time-index important predicates,
- we let governance/epistemic status be first-class,
- and we permit aggregate functions when we need to talk about compounding.

Below is a formalized rewrite of the addendum in that register.

---

## 1. Metalogical stance

This specification is written in a **many-sorted first-order language** with:

- a discrete or partially ordered time sort `τ ∈ Time`,
- explicit sorts for surface entities, episodes, interventions, and augmentations,
- epistemic/governance status as a typed domain,
- and a small number of real-valued measure functions for cohort-level and economic claims.

The intended distinction is:

- **logical invariants**: properties expected to hold pointwise,
- **typed existence claims**: properties about what must be preservable or producible,
- **empirical monotonicity claims**: properties expected to hold over cohorts, regions, or maturity stages.

This is the right level because the project is not merely a static ontology; it is a **temporal, participatory, governed process of resolution**.

---

## 2. Signature

### 2.1 Sorts

Let the universe be partitioned into the following sorts.

`Actor`
`Posture`
`Target`
`Affordance`
`Constraint`
`Transition`
`Evidence`
`Episode`
`Intervention`
`Augmentation`
`Scenario`
`Task`
`Goal`
`Role`
`DataCond`
`Phase`
`Path`
`Region`
`DriftEvent`
`DriftClass`
`Status`
`Outcome`
`Rung`
`Cohort`
`Time`

### 2.2 Distinguished status values

Assume distinguished status values:

`ObservedCanonical`
`ApprovedOverlay`
`ProposedCanonical`
`TaskLocalAid`
`ReviewRequired`
`Blocked`

These need not exhaust the lattice, but they are sufficient for the present formalization.

### 2.3 Core predicates and functions

I will introduce the notation compactly. Read all predicates extensionally and time-index them when relevant.

#### Surface predicates

`MateriallyDistinct(p,q)`
`Recurring(p)`
`Appears(t,p,τ)`
`Important(t)`
`Interactable(t,p,τ)`
`AmbiguousInIsolation(t,p,τ)`
`Neighborhood(n,t,p,τ)`
`Bounded(x)`
`Distinguishes(e,p,q,τ)`
`Identifies(e,t,p,τ)`
`Independent(e1,e2)`
`SupportsAffordance(e,t,p,a,τ)`
`SameBusinessMeaning(t,p1,τ1,p2,τ2)`
`CanonRef(t,p,τ)` — a function returning canonical identity token
`ConstraintActive(c,p,τ)`
`ConstraintOn(c,t,p,τ)`
`MeaningfulAction(α,p,τ)`
`OutcomeOf(p,α,τ) = o`
`LegiblyEncodes(e,o,τ)`
`Successor(p,α,p',τ)`
`EntryPath(λ,p,τ)`
`StableEntry(λ,p,τ)`
`RoleVariantOf(p1,p2,r1,r2,τ)`
`DataVariantOf(p1,p2,d1,d2,τ)`
`PhaseVariantOf(p1,p2,h1,h2,τ)`
`BaseOf(p,b,τ)`
`RoleOverlay(p,b,r,τ)`
`DataOverlay(p,b,d,τ)`
`PhaseOrdered(p1,p2,h1,h2,τ)`
`RelevantExternalArtifact(x,τ)`
`DerivedFrom(u,x,τ)`
`AttachesTo(u,ρ,τ)`
`AlignsToSurface(u,ρ,τ)`

#### Suspension / agency predicates

`Suspended(ep,τ)`
`InterventionFor(i,ep,τ)`
`PreservesIntent(i,ep)`
`PreservesAttemptHistory(i,ep)`
`PreservesEvidence(i,ep)`
`PreservesBlockageType(i,ep)`
`Delivered(i,a,τ)`
`SufficientForContribution(i,a,τ)`
`Synthetic(u)`
`StatusOf(u,τ) = s`
`DirectlyObserved(u)`
`Accepted(u,τ)`
`ProducedBy(u,a,τ)`
`ContentEquivalent(u1,u2)`
`GovernanceEquivalent(u1,u2,τ)`
`DownstreamEquivalent(u1,u2,τ)`
`Resume(ep2,ep1,u,τ)`
`ContinuationOf(ep2,ep1)`
`PreservesIntentAcross(ep2,ep1)`
`PreservesExhaustionAcross(ep2,ep1)`
`PreservesProvenanceAcross(ep2,ep1)`
`IntroducedForGoal(a,u,g,τ)`
`DeterministicallyPropagates(u,ρ,τ)`
`InInbox(i,τ)`
`ConsumedAs(i,u,τ)`
`Valuable(i)`
`RealizesImprovement(u,τ)`
`DerivedFromExternalDescription(u)`
`LocalAid(u)`
`ReusableOverlay(u)`
`CanonicalUpdateCandidate(u)`
`ObservedFact(u)`

#### Drift predicates

`ModerateDrift(δ,τ)`
`SemanticRedesign(δ,τ)`
`MeaningPreserving(δ,τ)`
`PrimarilyAffects(δ,ρ,τ)`
`RecoverableEquivalence(δ,τ)`
`NontrivialDrift(δ,τ)`
`DominantClass(δ,k,τ)`
`DriftCausesSuspension(δ,ep,τ)`
`BoundedRepairScope(i,δ)`

#### Rung / economics / cohort functions

`RegionOf(ep,τ) = ρ`
`KnownAt(x,τ)`
`MeanReuse(C,τ) ∈ ℝ`
`MeanNovelty(C,τ) ∈ ℝ`
`MeanTargetAccessCost(κ,C,τ) ∈ ℝ`
`MeanTransitionReuse(C,τ) ∈ ℝ`
`TransferValue(task1,task2,τ) ∈ ℝ`
`BootstrapCostSeeded(task,τ) ∈ ℝ`
`BootstrapCostBlank(task,τ) ∈ ℝ`
`AmbiguityRate(ρ,τ) ∈ ℝ`
`SuspensionRate(ρ,τ) ∈ ℝ`
`MeanRungScore(ρ,τ) ∈ ℝ`
`MemoryMaturity(τ) ∈ ℝ`
`LocalRepairCost(δ,τ) ∈ ℝ`
`RediscoveryCost(δ,τ) ∈ ℝ`
`RememberingBenefit(τ) ∈ ℝ`
`MemoryMaintenanceCost(τ) ∈ ℝ`

#### Cohort relations

`Comparable(C1,C2)`
`Later(C2,C1)` — cohort `C2` is later in system maturity than `C1`
`ComparableTargetContexts(κ,C1,C2)`
`Adjacent(task1,task2)`
`Overlap(task1,task2,τ)`

## Layer 3B — Inter-Actor Handoff Properties

### Framing note

A handoff is not merely a summary. It is a **continuation instrument**.
Its job is not to “contain the past.” Its job is to preserve exactly enough semantically typed structure that the receiving actor can make a disproportionately valuable next move.
So this layer tests five things:

1. **Sufficiency** — did the handoff preserve enough to act?
2. **Efficiency** — did it do so with a good token/attention-to-impact ratio?
3. **Epistemic integrity** — did status, provenance, and interpretive boundaries survive the crossing?
4. **Agency fit** — was it routed and shaped for the actual recipient?
5. **Temporal/compositional coherence** — can it survive delay and multi-actor chains without semantic drift?

For the formal statements below, introduce the following auxiliary functions/predicates:

- `Size(i) ∈ ℝ⁺` — representational burden of handoff `i`
- `Impact(i,τ) ∈ ℝ≥0` — downstream reduction in ambiguity, suspension, cost, or search burden caused by acting on `i`
- `RelevantContent(i,a,τ) ∈ ℝ≥0` — portion of `i` materially used by actor `a`
- `Contains(i,x,τ)` — handoff `i` contains item `x`
- `VisibleStatusTo(x,s,a,i,τ)` — actor `a` can recover status `s` of item `x` from handoff `i`
- `MateriallyUsedBy(x,a,τ)` — actor `a` materially relied on item `x`
- `RetrievableProvenance(x,π,a,τ)` — a bounded provenance chain `π` for `x` is recoverable by actor `a`
- `DistinctionVisible(i,a,S,τ)` — distinctions among semantic classes `S` are visible to actor `a`
- `RequiredCapability(i,τ)`, `CapabilitySet(a,τ)`
- `RequiredAuthority(i,τ)`, `AuthoritySet(a,τ)`
- `ExplicitMode(i,a,m,τ)` — requested participation mode `m` is explicit
- `ExplicitReversibilityClass(i,a,τ)` — reversibility / blast radius is explicit
- `Minimal(s,i,a,τ)` — `s` is a minimal sufficient slice of `i` for actor `a`
- `CompressedFrom(i_c,i_r,τ)`
- `SemanticLoss(i_r,i_c,a,τ) ∈ ℝ≥0`
- `InterventionClass(i)`
- `ContextFragment(c,i,τ)`
- `Included(c,i,τ)`
- `PositiveDecisionContribution(c,i,a,τ)`
- `EquivalentRenderings(i,r1,r2,τ)`
- `OperativeEquivalence(r1,r2,a,τ)`
- `Deferred(i,τ)`
- `RetainedInterpretability(i,a,τ,τ')`
- `NextMoveSet(i,a,M,τ)` where `M` is bounded and ordered
- `ExplicitStalenessSignal(i,a,τ)`
- `Chain(i0,i1,i2,i3,τ)` — multi-actor handoff chain
- `SemanticCorePreserved(i0,iN,τ)`
- `TranslatedChain(i0,iN,τ)`
- `DriftDetectable(i0,iN,τ)`
- `PreservedAsCompetingCandidates(u1,u2,ρ,τ)`
- `MarginalValue(i,a,τ) ∈ ℝ`
- `Cost(a,τ) ∈ ℝ`

## Layer 1 — Kernel Properties

These are the irreducible backbone. If several of these fail, the stronger Tesseract thesis is probably false for the substrate.

| Formal statement | Plain-English gloss | Observable falsifier |
| --- | --- | --- |
| **K1. Posture separability**  `∀p∀q∀τ [MateriallyDistinct(p,q) → ∃e (Bounded(e) ∧ Distinguishes(e,p,q,τ))]` | Any two states of the app that matter in practice must be distinguishable from some bounded slice of evidence. | Across repeated runs, materially different states routinely look the same to the available surface evidence: same visible anchors, same target set, same action set, yet different legal actions or different hidden consequences. |
| **K2. Canonical target continuity**  `∀t∀p1∀p2∀τ1∀τ2 [(SameBusinessMeaning(t,p1,τ1,p2,τ2)) → CanonRef(t,p1,τ1)=CanonRef(t,p2,τ2)]` | If a target still means the same business thing, the system should be able to treat it as the same target even when its expression changes. | Small label, wrapper, or layout changes repeatedly force the system to create “new” semantic targets for what human users would regard as the same field or control. |
| **K3. Bounded successor structure**  `∀p∀α∀τ [Specified(p,α,τ) → BranchingDegree(p,α,τ) < ∞]` | From a sufficiently known state, an action’s possible next states must form a bounded family, not an open-ended chaos field. | The same action from the “same” state keeps producing semantically surprising next states with no bounded explanatory family. |
| **K4. Drift locality**  `∀δ∀τ [(ModerateDrift(δ,τ) ∧ ¬SemanticRedesign(δ,τ)) → ∃ρ (Bounded(ρ) ∧ PrimarilyAffects(δ,ρ,τ))]` | Moderate UI change should usually stay local. | Small, non-semantic UI changes regularly break wide swaths of unrelated targets, routes, or transitions. |
| **K5. Marginal discovery decay**  `∀C1∀C2∀τ1∀τ2 [(Comparable(C1,C2) ∧ Later(C2,C1) ∧ MemoryMaturity(τ2)>MemoryMaturity(τ1)) → MeanNovelty(C2,τ2) ≤ MeanNovelty(C1,τ1)]` | As memory matures, later comparable scenarios should require less fresh discovery. | After meaningful knowledge accumulation, later comparable scenarios still require the same or greater amounts of net-new target interpretation, posture discrimination, and transition discovery. |
| **K6. Suspension legibility**  `∀ep∀τ [Suspended(ep,τ) → ∃i (InterventionFor(i,ep,τ) ∧ PreservesIntent(i,ep) ∧ PreservesAttemptHistory(i,ep) ∧ PreservesEvidence(i,ep) ∧ PreservesBlockageType(i,ep))]` | When the system gets stuck, it must be able to pause in a way that preserves what was being attempted, what was tried, and what kind of help is needed. | Suspensions collapse into opaque failures, stack traces, or generic “needs human” markers that do not preserve semantic blockage type or actionable context. |
| **K7. Synthetic augmentation governability**  `∀u∀τ [(Synthetic(u) ∧ ¬DirectlyObserved(u)) → StatusOf(u,τ) ≠ ObservedCanonical]` | Externally contributed or LLM-derived structure can be useful without being mistaken for directly observed canonical truth. | Synthetic overlays, document-derived role maps, or LLM interpretations are silently treated as if they were runtime-observed facts. |

---

## Layer 2 — Structural Surface Properties

These are the deeper conditions that make the kernel properties possible rather than accidental.

### Legibility

| Formal statement | Plain-English gloss | Observable falsifier |
| --- | --- | --- |
| **L2. Target observability**  `∀t∀τ [Important(t) → ∃p∃e (Appears(t,p,τ) ∧ Bounded(e) ∧ Identifies(e,t,p,τ))]` | Every important target should expose at least one viable evidence path by which it can be identified. | A recurring class of critical targets can only be found by bespoke one-off selectors or full human gestalt interpretation, with no stable bounded evidence path. |
| **L2s. Strong target observability**  `∀t∀τ [Important(t) → StronglyObservable(t,τ)]` | The strongest case is when important targets are supported by more than one independent evidence channel. | Important targets systematically depend on exactly one brittle signal; when that signal drifts, no alternative evidence remains. |
| **L3. Outcome legibility**  `∀p∀α∀τ [MeaningfulAction(α,p,τ) → ∃e (Bounded(e) ∧ LegiblyEncodes(e,OutcomeOf(p,α,τ),τ))]` | After meaningful action, the application should make it visible what happened. | The system can often click or submit, but cannot reliably tell whether the action succeeded, failed, committed, or silently no-op’d. |
| **L4. Unresolvedness legibility**  `∀ep∀τ [Suspended(ep,τ) → ∃i (InterventionFor(i,ep,τ) ∧ Bounded(i) ∧ PreservesIntent(i,ep) ∧ PreservesAttemptHistory(i,ep) ∧ PreservesEvidence(i,ep) ∧ PreservesBlockageType(i,ep))]` | Not only outcomes, but also *incompletions* must be legible. | The system can tell that it failed, but cannot tell whether the failure was target ambiguity, unknown role gating, route uncertainty, constraint ambiguity, or missing external policy. |

### Semantic persistence

| Formal statement | Plain-English gloss | Observable falsifier |
| --- | --- | --- |
| **S2. Neighborhood sufficiency**  `∀t∀p∀τ [AmbiguousInIsolation(t,p,τ) → ∃n (Neighborhood(n,t,p,τ) ∧ Bounded(n) ∧ Disambiguates(n,t,p,τ))]` | Ambiguous targets should usually become unambiguous once local context is considered. | Repeated controls remain semantically ambiguous even after section headings, row identity, tab context, and nearby labels are taken into account. |
| **S3. Affordance recoverability**  `∀t∀p∀τ [Interactable(t,p,τ) → ∃a∃e (Bounded(e) ∧ SupportsAffordance(e,t,p,a,τ))]` | The system should not only know *which* thing this is, but *what kind of thing* it is. | Targets are findable, but the system repeatedly misclassifies how to interact with them: typing into comboboxes, clicking labels for stateful widgets, treating grid editors as plain fields, and so on. |
| **S4. Constraint family persistence**  `∀c1∀c2∀τ1∀τ2 [(ConstraintFamily(c1)=ConstraintFamily(c2)) → FamilyRecognizable(c1,c2,τ1,τ2)]` | Repeated kinds of business constraint should feel like recurring families, not unrelated accidents. | Requiredness, permission gating, dependency failures, and phase restrictions show up each time as bespoke anomalies with no recurring semantic pattern. |

### Dynamic topology

| Formal statement | Plain-English gloss | Observable falsifier |
| --- | --- | --- |
| **D1. Transition learnability**  `∀p∀α∀τ [Specified(p,α,τ) → BranchingDegree(p,α,τ) < ∞ ∧ ∀p' (Successor(p,α,p',τ) → ∃k SuccessorClass(k,p,α,p',τ))]` | Actions should lead to bounded, classifiable next-state families. | Successors are not only numerous but semantically unclassifiable; no stable successor families emerge. |
| **D2. Constraint manifestation**  `∀c∀p∀τ [ConstraintActive(c,p,τ) → ∃e (Bounded(e) ∧ ObservableConstraintEffect(e,c,p,τ))]` | If a rule or limitation is active, it should leave some observable trace. | Important constraints routinely act only through invisible or unlocalizable side effects. |
| **D3. Route/entry coherence**  `∀p∀τ [Recurring(p) → ∃λ (EntryPath(λ,p,τ) ∧ StableEntry(λ,p,τ))]` | Reusable states should be economically revisitable, not just recognizable once reached. | The system repeatedly rediscovers how to get back to known states because no stable route/entry relation can be learned. |
| **D4. Suspension localization**  `∀ep∀τ [Suspended(ep,τ) → ∃ρ (Bounded(ρ) ∧ RegionOf(ep,τ)=ρ)]` | When progress halts, the blockage should usually live in some bounded region of the surface graph. | One ambiguous or failing step routinely makes the surrounding workflow globally unintelligible rather than locally uncertain. |

### Structured variance

| Formal statement | Plain-English gloss | Observable falsifier |
| --- | --- | --- |
| **V1. Role overlay factorability**  `∀p1∀p2∀r1∀r2∀τ [RoleVariantOf(p1,p2,r1,r2,τ) → ∃b (BaseOf(p1,b,τ) ∧ BaseOf(p2,b,τ) ∧ RoleOverlay(p1,b,r1,τ) ∧ RoleOverlay(p2,b,r2,τ))]` | Role differences should mostly be overlays on a shared base, not separate universes. | Each role behaves like a different application with weak target, route, and transition reuse across roles. |
| **V2. Data condition factorability**  `∀p1∀p2∀d1∀d2∀τ [DataVariantOf(p1,p2,d1,d2,τ) → ∃b (BaseOf(p1,b,τ) ∧ BaseOf(p2,b,τ) ∧ DataOverlay(p1,b,d1,τ) ∧ DataOverlay(p2,b,d2,τ))]` | Data-driven variation should be parameterizable rather than explosively bespoke. | New data conditions keep creating semantically novel states that do not map cleanly onto known posture families. |
| **V3. Workflow phase factorability**  `∀p1∀p2∀h1∀h2∀τ [PhaseVariantOf(p1,p2,h1,h2,τ) → PhaseOrdered(p1,p2,h1,h2,τ)]` | Draft/review/approval/correction/terminal phases should form a coherent ordered family. | Multi-phase workflows behave like disconnected screens rather than a semantically ordered lifecycle. |
| **V4. External policy ingestibility**  `∀x∀τ [RelevantExternalArtifact(x,τ) → ∃u∃ρ (DerivedFrom(u,x,τ) ∧ Synthetic(u) ∧ AttachesTo(u,ρ,τ) ∧ AlignsToSurface(u,ρ,τ))]` | External documents like role maps and authorization matrices should be mappable onto the actual surface model. | Rich external policy documents can be read by humans or LLMs, but their claims cannot be attached to bounded targets, postures, constraints, or transitions in the app. |

### Drift and recoverability

| Formal statement | Plain-English gloss | Observable falsifier |
| --- | --- | --- |
| **R2. Semantic drift recoverability**  `∀δ∀τ [MeaningPreserving(δ,τ) → RecoverableEquivalence(δ,τ)]` | If meaning stayed the same, there should usually be enough continuity to reconnect old understanding to new expression. | Meaning-preserving UI changes regularly destroy recognizability so thoroughly that prior knowledge is no better than blank rediscovery. |
| **R3. Drift classification distinguishability**  `∀δ∀τ [NontrivialDrift(δ,τ) → ∃k DominantClass(δ,k,τ)]` | Most breakage should be analyzable in layers: expression, affordance, posture, transition, constraint, or true semantic change. | Drift episodes routinely appear as undifferentiated breakage with no stable dominant class. |
| **R4. Deferred drift repairability**  `∀δ∀ep∀τ [(DriftCausesSuspension(δ,ep,τ)) → ∃i (InterventionFor(i,ep,τ) ∧ BoundedRepairScope(i,δ))]` | If drift cannot be fixed now, it should still be deferrable as bounded future repair. | Drift-triggered suspensions regularly require full workflow reconstruction later rather than localized continuation. |

---

## Layer 3 — Participatory Agency Properties

This is the most distinctive part of the v2 worldview. These properties determine whether the system can make unresolvedness *participatory* without making it incoherent.

| Formal statement | Plain-English gloss | Observable falsifier |
| --- | --- | --- |
| **A1. Handoff sufficiency**  `∀i∀a∀τ [Delivered(i,a,τ) → SufficientForContribution(i,a,τ)]` | A later actor should receive enough context to help meaningfully without replaying the entire past. | Human or LLM recipients repeatedly need to reconstruct the entire execution history from raw logs or wide-context transcripts before they can act. |
| **A2. Synthetic augmentation governability**  `∀u∀τ [Synthetic(u) → ∃s (StatusOf(u,τ)=s)]` and `∀u∀τ [(Synthetic(u) ∧ ¬DirectlyObserved(u)) → StatusOf(u,τ) ≠ ObservedCanonical]` | Synthetic contributions must always enter under explicit status, and non-observed claims must never masquerade as observed fact. | LLM-authored or document-derived addenda enter the system with ambiguous status or are treated as direct observation. |
| **A3. Continuation integrity**  `∀ep1∀ep2∀u∀τ [Resume(ep2,ep1,u,τ) → ContinuationOf(ep2,ep1) ∧ PreservesIntentAcross(ep2,ep1) ∧ PreservesExhaustionAcross(ep2,ep1) ∧ PreservesProvenanceAcross(ep2,ep1)]` | Resuming later should continue the same epistemic story, not start a new unrelated one. | Resumed runs lose prior blockage history, duplicate prior failed attempts, or cannot explain how the new augmentation relates to the old suspension. |
| **A4. Cross-actor substitutability**  `∀u1∀u2∀a1∀a2∀τ [(ProducedBy(u1,a1,τ) ∧ ProducedBy(u2,a2,τ) ∧ ContentEquivalent(u1,u2) ∧ GovernanceEquivalent(u1,u2,τ)) → DownstreamEquivalent(u1,u2,τ)]` | What matters downstream should be content and status, not whether the contributor was human or LLM. | Equivalent contributions get materially different downstream treatment purely because of actor type rather than status/provenance/content. |
| **A5. Goal-conditioned deterministic leverage**  `∀a∀u∀g∀τ [(IntroducedForGoal(a,u,g,τ) ∧ Accepted(u,τ)) → ∃ρ (AttachesTo(u,ρ,τ) ∧ DeterministicallyPropagates(u,ρ,τ))]` | An actor should be able to solve the ambiguous frontier and let the deterministic substrate carry the consequences. | Even after a bounded augmentation is accepted, the same actor must manually intervene again and again because the deterministic layer fails to amplify the contribution. |
| **A6. Deferred enhancement realization**  `∀i∀τ [InInbox(i,τ) ∧ Valuable(i) → ∃τ'∃u (τ' > τ ∧ ConsumedAs(i,u,τ') ∧ RealizesImprovement(u,τ'))]` | Deferred unresolvedness should be able to become later improvement, not just archival residue. | Inboxes fill with semantically meaningful unresolved items that are later consumed only as documentation, never as actual reduction in ambiguity or future cost. |
| **A7. Augmentation-to-surface alignment**  `∀u∀τ [(Synthetic(u) ∧ DerivedFromExternalDescription(u)) → ∃ρ (AttachesTo(u,ρ,τ) ∧ AlignsToSurface(u,ρ,τ))]` | External descriptive knowledge must land on real surface regions. | Role maps, authorization docs, and workflow narratives remain globally informative but cannot be attached to particular targets, postures, constraints, or transitions. |
| **A8. Intervention boundary discipline**  `∀u∀τ [Accepted(u,τ) → ExactlyOne(LocalAid(u), ReusableOverlay(u), CanonicalUpdateCandidate(u), ObservedFact(u))]` | Task-local workarounds, reusable overlays, canonical candidates, and observed facts must remain distinguishable. | Present-goal interventions routinely bleed into long-term truth with no clear status boundary. |

---

## Layer 4 — Economic and Meta-Properties

These are the highest-order tests. They ask whether the whole thing is paying off.

### Compounding economics

| Formal statement | Plain-English gloss | Observable falsifier |
| --- | --- | --- |
| **C1. Reuse ascent**  `∀C1∀C2∀τ1∀τ2 [(Comparable(C1,C2) ∧ Later(C2,C1) ∧ MemoryMaturity(τ2)>MemoryMaturity(τ1)) → MeanReuse(C2,τ2) ≥ MeanReuse(C1,τ1)]` | Later comparable work should reuse more prior understanding. | As the system matures, reuse share does not rise across comparable later cohorts. |
| **C2. Marginal discovery decay**  `∀C1∀C2∀τ1∀τ2 [(Comparable(C1,C2) ∧ Later(C2,C1) ∧ MemoryMaturity(τ2)>MemoryMaturity(τ1)) → MeanNovelty(C2,τ2) ≤ MeanNovelty(C1,τ1)]` | Later comparable work should need less novelty. | Net-new interpretation burden remains flat or rises despite meaningful accumulated memory. |
| **C3. Known-target access compression**  `∀κ∀C1∀C2∀τ1∀τ2 [(KnownAt(κ,τ1) ∧ ComparableTargetContexts(κ,C1,C2) ∧ Later(C2,C1) ∧ τ2>τ1) → MeanTargetAccessCost(κ,C2,τ2) ≤ MeanTargetAccessCost(κ,C1,τ1)]` | Known targets should become cheaper to reacquire and use. | Even highly familiar targets continue to cost the same interpretive effort each time they reappear. |
| **C4. Transition reuse**  `∀C1∀C2∀τ1∀τ2 [(Comparable(C1,C2) ∧ Later(C2,C1) ∧ MemoryMaturity(τ2)>MemoryMaturity(τ1)) → MeanTransitionReuse(C2,τ2) ≥ MeanTransitionReuse(C1,τ1)]` | Behavioral knowledge should compound, not just object identification. | Later scenarios still reconstruct action consequences from scratch even when traversing familiar workflow motifs. |
| **C5. Adjacency transfer**  `∀task1∀task2∀τ [(Adjacent(task1,task2) ∧ Overlap(task1,task2,τ)) → TransferValue(task1,task2,τ) > 0]` and `BootstrapCostSeeded(task,τ) < BootstrapCostBlank(task,τ)` | Memory should help not only the original task class, but adjacent ones. | An adjacent task over overlapping UI regions gets little or no advantage from prior surface memory, or seeded bootstrap is no cheaper than blank bootstrap. |
| **C6. Intervention-adjusted economics**  `∀u∀ρ∀τ [(Accepted(u,τ) ∧ AttachesTo(u,ρ,τ)) → ∃τ' (τ'>τ ∧ (AmbiguityRate(ρ,τ')<AmbiguityRate(ρ,τ) ∨ SuspensionRate(ρ,τ')<SuspensionRate(ρ,τ) ∨ MeanRungScore(ρ,τ')>MeanRungScore(ρ,τ)))]` | Accepted augmentations should improve later economics where they attach. | Useful-looking addenda enter the system but future ambiguity, suspension frequency, and rung profile in that region do not improve. |

### Meta-properties

| Formal statement | Plain-English gloss | Observable falsifier |
| --- | --- | --- |
| **M1. Surface compressibility**  `∀τ1∀τ2 [(τ2>τ1 ∧ MemoryMaturity(τ2)>MemoryMaturity(τ1)) → ExplainedShare(τ2) ≥ ExplainedShare(τ1)]` | A bounded conceptual basis should explain more of the app over time. | As the system matures, the fraction of encountered behavior explainable by known posture/target/affordance/constraint/transition families does not increase. |
| **M2. Surface predictability**  `∀p∀α∀τ [Specified(p,α,τ) → ForecastEntropy(p,α,τ) ≤ K(p,α)]` | The app should be predictable enough to plan against. | Even in well-specified contexts, next-state entropy remains effectively unbounded or wildly unstable. |
| **M3. Surface repairability**  `∀δ∀τ [(ModerateDrift(δ,τ) ∧ ¬SemanticRedesign(δ,τ)) → LocalRepairCost(δ,τ) < RediscoveryCost(δ,τ)]` | For moderate non-semantic change, repair should beat rediscovery. | In practice, local repair repeatedly costs as much as or more than full rediscovery. |
| **M4. Participatory repairability**  `∀ep∀τ [Suspended(ep,τ) → ∃i∃a∃τ' (τ'>τ ∧ InterventionFor(i,ep,τ) ∧ Delivered(i,a,τ') ∧ SufficientForContribution(i,a,τ') ∧ ∃u ResumePossibleVia(i,u,τ'))]` | When the system cannot finish now, it should still be able to become a good future continuation site. | Suspended episodes are technically stored, but later actors cannot actually continue them in a bounded, meaningful way. |
| **M5. Memory worthiness**  `∀τ [MemoryWorthy(τ) ↔ RememberingBenefit(τ) > MemoryMaintenanceCost(τ)]` | The whole architecture is justified only if remembering beats forgetting economically. | Across meaningful maturity intervals, the maintenance burden of memory meets or exceeds the value of reduced rediscovery, repair, transfer, and augmentation leverage. |

## Addendum

| Formal statement | Plain-English gloss | Observable falsifier |
| --- | --- | --- |
| **H1. Minimal sufficient slice**  `∀i∀a∀τ [Delivered(i,a,τ) → ∃s (Minimal(s,i,a,τ) ∧ SufficientForContribution(s,a,τ))]` | Every handoff should have a smallest coherent version that still lets the recipient act well. | Recipients repeatedly need either substantially more context than provided, or only a tiny fraction of what was provided, indicating chronic underpacking or overpacking. |
| **H2. Translation efficiency**  `∀i∀τ [Valuable(i) → Impact(i,τ)/Size(i) > θ]` | A good handoff buys a lot of downstream leverage per unit of token, attention, or cognitive burden. | Large intervention packets routinely yield only tiny, local, or redundant downstream improvement. |
| **H3. Semantic density**  `∀i∀a∀τ [Delivered(i,a,τ) → RelevantContent(i,a,τ)/Size(i) ≥ δ]` | Most of what the recipient receives should matter to the requested intervention. | Actors consistently ignore, discard, or mentally strip away large portions of handoff content because it is scenic rather than operative. |
| **H4. Loss-bounded compression**  `∀i_r∀i_c∀a∀τ [(CompressedFrom(i_c,i_r,τ) ∧ Delivered(i_c,a,τ)) → SemanticLoss(i_r,i_c,a,τ) ≤ ε(a,InterventionClass(i_c))]` | Compression is good only if it does not erase distinctions needed for the next move. | Shortened handoffs are elegant but repeatedly omit the exact posture, status, provenance, or ambiguity distinctions needed for correct action. |
| **H5. Nondecorative context packaging**  `∀c∀i∀a∀τ [(ContextFragment(c,i,τ) ∧ Included(c,i,τ)) → PositiveDecisionContribution(c,i,a,τ)]` | Extra context should earn its place. | Large classes of included context show no evidence of improving downstream contribution quality. |

---

## 3B.2 Epistemic Shape Preservation

| Formal statement | Plain-English gloss | Observable falsifier |
| --- | --- | --- |
| **H6. Status preservation**  `∀x∀i∀a∀τ [(Contains(i,x,τ) ∧ StatusOf(x,τ)=s) → VisibleStatusTo(x,s,a,i,τ)]` | The receiving actor should be able to see what kind of thing each important claim is: observed fact, approved overlay, proposal, local aid, blocked item, and so on. | Recipients repeatedly act as though all handoff contents are equally real, equally tentative, or equally actionable. |
| **H7. Provenance retention across handoff**  `∀x∀i∀a∀τ [(Contains(i,x,τ) ∧ MateriallyUsedBy(x,a,τ)) → ∃π RetrievableProvenance(x,π,a,τ)]` | If the recipient is going to rely on a claim, they should be able to recover where it came from without reconstructing the whole universe. | Important downstream decisions repeatedly depend on claims whose origin is irretrievable without replaying raw history. |
| **H8. Interpretive boundary preservation**  `∀i∀a∀τ [Delivered(i,a,τ) → DistinctionVisible(i,a,{Observation,Interpretation,Recommendation,ActionRequest,Unresolvedness},τ)]` | The recipient should know whether they are looking at evidence, a conclusion, a suggestion, a request, or an unresolved question. | Actors repeatedly confuse “the system saw X” with “the system thinks X,” or “the system recommends Y” with “Y has already been approved.” |
| **H9. Cross-representation invariance**  `∀i∀r1∀r2∀a∀τ [EquivalentRenderings(i,r1,r2,τ) → OperativeEquivalence(r1,r2,a,τ)]` | The same issue may be rendered as prose, a candidate set, a graph slice, or a receipt trail, but the actionable meaning should remain stable. | The same underlying unresolvedness produces materially different downstream action depending on representation format alone. |

---

## 3B.3 Capability, Authority, and Participation Fit

| Formal statement | Plain-English gloss | Observable falsifier |
| --- | --- | --- |
| **H10. Capability matching**  `∀i∀a∀τ [Delivered(i,a,τ) → RequiredCapability(i,τ) ⊆ CapabilitySet(a,τ)]` | The handoff should ask the recipient to do the kind of work they are actually capable of doing. | Humans are repeatedly handed low-level mechanical repair they should not need to perform, or LLMs are repeatedly handed underdetermined organizational conflicts requiring external authority. |
| **H11. Authority matching**  `∀i∀a∀τ [Delivered(i,a,τ) → RequiredAuthority(i,τ) ⊆ AuthoritySet(a,τ)]` | The handoff should not ask a recipient to authorize what they can only interpret, or to interpret what they are only formally empowered to approve. | Decision-bearing objects routinely land on actors who can think about them but cannot ratify them, or vice versa. |
| **H12. Obligation clarity**  `∀i∀a∀τ [Delivered(i,a,τ) → ∃m ExplicitMode(i,a,m,τ)]` | The recipient should know whether they are being asked to inspect, interpret, verify, choose, approve, enrich, or merely observe. | Actors repeatedly respond in the wrong mode because the handoff did not specify the requested kind of participation. |
| **H13. Reversibility clarity**  `∀i∀a∀τ [Delivered(i,a,τ) → ExplicitReversibilityClass(i,a,τ)]` | The recipient should know whether their contribution is reversible, local, review-bound, globally activating, or effectively final. | Actors become overly timid or dangerously casual because they cannot tell the blast radius of intervening. |
| **H14. Differential attention routing**  `∀i∀a∀τ [Delivered(i,a,τ) → MarginalValue(i,a,τ) > Cost(a,τ)]` | More expensive actors should be invoked only when their incremental value exceeds their routing cost. | Humans are repeatedly asked to resolve routine cases that deterministic or LLM layers could handle, or expensive model effort is spent where a typed rule would suffice. |

---

## 3B.4 Temporal Handoff Coherence

| Formal statement | Plain-English gloss | Observable falsifier |
| --- | --- | --- |
| **H15. Deferred comprehensibility**  `∀i∀a∀τ∀τ' [(Delivered(i,a,τ) ∧ τ' > τ) → RetainedInterpretability(i,a,τ,τ')]` | A handoff should still make sense later, not only in the heat of the original run. | Deferred inbox items repeatedly become inscrutable after modest delay because they depended too heavily on ephemeral mental context. |
| **H16. Continuation gradient preservation**  `∀i∀ep∀a∀τ [InterventionFor(i,ep,τ) → ∃M NextMoveSet(i,a,M,τ)]` | The recipient should not only understand the blockage; they should be able to see the next few meaningful moves. | Recipients understand the problem after reading the handoff, but still do not know how to intervene without additional orchestration. |
| **H17. Staleness visibility**  `∀i∀a∀τ [Deferred(i,τ) → ExplicitStalenessSignal(i,a,τ)]` | A later actor should know whether the handoff still describes live uncertainty or historical residue. | Actors repeatedly spend effort resolving old intervention objects whose relevant surface conditions have already changed or been superseded. |

---

## 3B.5 Multi-Actor Translation Coherence

| Formal statement | Plain-English gloss | Observable falsifier |
| --- | --- | --- |
| **H18. Compositional handoff coherence**  `∀i0∀i1∀i2∀i3∀τ [Chain(i0,i1,i2,i3,τ) → SemanticCorePreserved(i0,i3,τ)]` | If unresolvedness passes through system → LLM → human → system, the decisive semantic core should survive the chain. | By the end of a multi-actor chain, the final object addresses a subtly different problem than the one originally suspended. |
| **H19. Translation drift detectability**  `∀i0∀iN∀τ [(TranslatedChain(i0,iN,τ) ∧ ¬SemanticCorePreserved(i0,iN,τ)) → DriftDetectable(i0,iN,τ)]` | If meaning does drift across handoffs, the system should be able to notice that drift rather than absorb it silently. | Multi-actor handoffs repeatedly introduce silent reinterpretation, scope shift, or answer-substitution with no mechanism for noticing. |
| **H20. Conflict-ready convergence**  `∀u1∀u2∀ρ∀τ [(AttachesTo(u1,ρ,τ) ∧ AttachesTo(u2,ρ,τ) ∧ ¬ContentEquivalent(u1,u2)) → PreservedAsCompetingCandidates(u1,u2,ρ,τ)]` | If two actors give different augmentations for the same region, disagreement should become a structured candidate set, not accidental overwrite. | Later contributions silently replace earlier materially different ones without preserving the fact of unresolved conflict. |

---

## Condensed reading of the whole document

There is a very clean way to read this entire layered spec:

The substrate must satisfy four simultaneous conditions.

First, **the application must be structurally legible**: its states, targets, constraints, affordances, and outcomes must show up clearly enough to be modeled.

Second, **that structure must persist enough to matter**: targets must endure across expression drift, variation must factor into overlays, and change must remain local enough to repair.

Third, **the unresolved parts must themselves be structured**: when the system cannot continue, it must be able to pause coherently, hand off meaningfully, accept synthetic augmentation under correct status, and resume as a continuation rather than a restart.

Fourth, **all of that must bend the economics**: later work must reuse more, discover less, repair locally, transfer across adjacent tasks, and benefit from accepted intervention.

That is the full shape.

---

## The sharpest observable falsifiers overall

If I had to collapse all of this into a small set of field-level counter-patterns that would seriously threaten the thesis, they would be these:

The first is **semantic non-persistence**: if small UI changes repeatedly destroy target continuity, no canonical memory will compound.

The second is **behavioral non-boundedness**: if actions from known states keep producing semantically unclassifiable next states, transition memory will not densify.

The third is **variance explosion**: if roles, data conditions, and workflow phases behave like different applications, reuse will fragment.

The fourth is **opaque suspension**: if the system can stop but cannot say what kind of help it needs, participatory enhancement collapses into generic fallback.

The fifth is **status collapse**: if synthetic augmentation and observed truth are not reliably distinguished, the memory layer becomes epistemically muddy.

The sixth is **economic flatness**: if later comparable cohorts do not require less novelty, the architecture is not compounding even if it is sophisticated.

The seventh is **inert intervention**: if accepted addenda do not reduce future ambiguity, suspension, or resolution cost, the agent-participatory layer is ornamental rather than structural.

---

## One sentence version

Here is the entire document in one sentence:

> The substrate is suitable only if it presents semantically persistent objects inside distinguishable states, behaves like a bounded transition field, varies in factorizable ways, drifts locally, turns unresolvedness into coherent handoff objects, admits synthetic augmentation without epistemic confusion, and rewards all of this with declining novelty burden over time.

That is the real theorem-shaped center.
