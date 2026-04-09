# Envelope-Axis Refactor Plan

> Status: Active — structural prerequisite to
> `docs/cold-start-convergence-plan.md` Phases A–C. Treat this plan as
> **Phase 0** of the convergence work: it lands the typed envelope
> axes on which the substrate, discovery-fitness tree, and C6 braid
> all depend. When this plan conflicts with the convergence plan's
> sequencing, this plan wins for the axes it touches; the convergence
> plan still owns every phase after Phase 0 completes.

## TL;DR

Every artifact in this codebase is a point in a 4-axis typed space —
**`Envelope<Stage, Source, Verdict><Payload: Fingerprint<Stage, Source>>`**
— and the pipeline is a typed path through that space. Today only the
runtime shadow of each axis exists: `stage` as a string, `source` as a
string, `governance` as a string, fingerprints as bare strings. Four
phantom-typing lifts move each axis from runtime shadow to compile-time
invariant. After those four lifts the cold-start convergence plan's
Phase A (atom decomposition) lands on a scaffolding where every mint,
promotion, and lookup is self-documenting at the type level, rather
than on a scaffolding where every decomposer has to agree by convention.

The four lifts are sequenced by dependency: Stage first (every other
axis attaches to it), Source second (consolidates the two competing
precedence dispatchers), Fingerprint third (refines identity over the
Stage × Source product), Verdict fourth (the largest raw migration but
the smallest conceptual move once the phantoms exist).

Deferred indefinitely: the Lane axis (lanes do not exist in code
today; typing them would require introducing separation first),
the three-loop unification (two of the three "loops" are not loops),
and the composition→projection promotion path (that is a write, not a
refactor).

## 1. Why now — the cost curve

The argument for prioritizing this work over continuing feature
development on today's scaffolding is not aesthetic. It is economic.

The refactor has an **asymmetric cost curve** against time. Three
forces drive the curve:

1. **Envelope accretion.** Every new feature adds envelope types or
   extends existing ones. The cold-start convergence plan's Phase A
   will produce decomposers that mint atoms and compositions; the
   discovery-fitness tree of Phase B will produce visitor-output
   envelopes; the C6 braid of Phase C will produce intervention
   impact envelopes. Each of these materializes more call sites that
   pass `stage` as a string, `governance` as a string, and
   fingerprints as bare strings. The agent audit found 22
   `governance: Governance` fields today; every month of feature
   work adds more.

2. **Fingerprint threading sprawl.** The `ScenarioEnvelopeHeaderInput`
   I introduced one session ago already threads 9 fingerprint-shaped
   strings through a single interface with zero compile-time
   protection against transposition, and I already shipped the bug
   at `lib/application/catalog/envelope.ts:182` — a field literally
   named `task` assigned a value whose source is named `surface`.
   The moment I landed that helper, the codebase acquired a new
   surface to thread fingerprints through, and the refactor cost
   to protect it grew. Every new envelope-building helper repeats
   that acquisition.

3. **Test fixture ossification.** Today's tests construct envelopes
   directly with literal `governance: 'approved'` / `stage: 'execution'`
   strings. Each new test fixture that asserts on governance strings
   or stage strings is another site the Verdict migration has to
   update. Test code outgrows production code in raw line count in
   repos like this; the longer Verdict waits, the more tests break
   on the day it lands.

The numbers we have today:

- ~60 direct assignments of `'approved' | 'review-required' | 'blocked'`
  string literals across production code (agent audit, Audit A).
- 22 `governance: Governance` fields on envelope types.
- 11 distinct `*Fingerprint` / `*Hash` / `cacheKey` field names
  across the domain layer.
- 9 concrete envelope types carrying a runtime `stage` field.
- 4 precedence ladders using ad-hoc `dispatchByPrecedence`, 2 using
  `freeSearch`, 1 orthogonal gate chain.
- ~32 artifact loader call sites already using the spec-driven
  factory I landed last session (so the catalog layer is stable
  enough to be a reference point for the new phantoms).

Six months of feature work on today's scaffolding will roughly
double each of those numbers, plus add new entries for the
convergence plan's Phase A atoms, Phase B visitors, and Phase C
braid. The refactor currently touches ~150 call sites. In six
months it would touch ~300. In twelve months it would touch ~500
and would start to collide with every feature branch that ever
touches an envelope.

**The cost curve inverts the normal "ship features first, clean up
later" heuristic** precisely because the features being shipped are
envelope-shaped. Every feature that is not refactored first becomes
a new surface the refactor must later cover.

## 2. Relationship to existing plans

This plan sits **strictly before** the cold-start convergence plan's
Phase A and runs as its Phase 0. It is **not a substitute** for that
plan's six phases (A–F); it is the scaffolding those phases assume.

### 2.1 What changes in the convergence plan

The convergence plan at `docs/cold-start-convergence-plan.md` § 4
sequences six phases A–F. This plan inserts a Phase 0 (the four
axis lifts, 0a–0d) before Phase A. Phase 0 does not touch the
substrate, does not add new discovery code, does not add new metric
visitors. It only refines the types of what already exists so the
phases that follow can lean on compile-time invariants instead of
convention.

Reordered sequence:

| Order | Phase | What lands | Source of truth |
|---|---|---|---|
| 0a | Stage phantom | `WorkflowEnvelope<Stage, Payload>` | this doc § 4 |
| 0b | Source axis + precedence consolidation | `PrecedenceLadder<K, V>`, `Atom<C, T, Source>`, one retired dispatcher | this doc § 5 |
| 0c | Fingerprint<Tag> | Phantom-tagged identities | this doc § 6 |
| 0d | Verdict axis | `verdict: GovernanceVerdict<Payload, ReviewRequest>` pervasive | this doc § 7 |
| **Stabilization** | **Baseline + doc refresh** | **Tests green, CLAUDE.md aligned** | this doc § 8 |
| A | Atom decomposition | Unchanged from convergence plan | convergence plan § 4.A |
| B | Discovery-fitness L4 tree | Unchanged from convergence plan | convergence plan § 4.B |
| C | C6 braid wiring | Unchanged from convergence plan | convergence plan § 4.C |
| D | Confidence-interval promotion | Unchanged from convergence plan | convergence plan § 4.D |
| E | Runtime-family + OutSystems specialization | Unchanged from convergence plan | convergence plan § 4.E |
| F | Tier 3 projection authoring | Unchanged from convergence plan | convergence plan § 4.F |

Phases A–F are not edited. Their work items and acceptance criteria
stand. What changes is the **types they inherit from**: instead of
building decomposers that produce `Atom<C, T>` with string-typed
provenance, Phase A builds decomposers that produce
`Atom<C, T, Source, Stage>` where both the source slot and the
pipeline stage are phantom-checked at the call site. Instead of
building L4 visitors that fold over string-tagged governance states,
Phase B builds visitors whose signatures carry verdict refinement.
Instead of wiring a C6 braid that threads bare-string fingerprints
across intervention receipts, Phase C wires a braid whose lineage
edges are typed references.

### 2.2 Why this ordering is the cheap ordering

If Phase A–C land first on today's scaffolding, every decomposer,
visitor, and braid they produce becomes a new migration target for
the axis lifts. Phase 0 is ~150 call sites. Phase 0 deferred until
after Phase C is ~300–400 call sites and requires reworking code
that was correct-by-convention when it was written, which is the
worst kind of refactor — the kind that breaks recently-landed work
for no visible reason.

### 2.3 What this plan does not replace

- `docs/master-architecture.md` — doctrinal source. Unchanged by
  Phase 0; may grow an "axis vocabulary" subsection after 0d lands.
- `docs/canon-and-derivation.md` — doctrinal source for the three-tier
  interface model. Phase 0 makes the types it describes more
  enforceable; it does not change the model.
- `docs/alignment-targets.md` — the M5 and C6 scoreboard gates.
  Phase 0 does not touch them; it makes their eventual measurement
  code easier to write by typing the envelopes they read from.
- `BACKLOG.md` — the canonical execution backlog. Phase 0 gets
  referenced from BACKLOG.md as a prerequisite for Epics 1–5's
  envelope-touching work items, but does not replace any epic.

### 2.4 Traceability to the backlog epics

Every epic in BACKLOG.md has envelope-touching work items. The
refactor's leverage over each epic:

- **Epic 1 (Structural Surface Completion)** — receipts, proposals,
  and route knowledge all flow through envelopes. Phase 0a and 0c
  make the "task fingerprint vs surface fingerprint" confusion
  auditable.
- **Epic 2 (Continuation and Handoff Integrity)** — the handoff
  lineage is the envelope's lineage edges. Phase 0c types those
  edges. Phase 0d types the governance verdict that rides with the
  handoff.
- **Epic 3 (Economic Compounding and Measurement)** — M5 cohort
  trajectory and C6 intervention impact are visitor outputs over
  envelope streams. Phase 0a and 0d make the visitor signatures
  self-documenting.
- **Epic 4 (Drift and Recoverability Proof)** — drift profiles
  produce variance events with fingerprints and stage transitions.
  All four phases support this epic.
- **Epic 5 (Operator and Projection Surfaces)** — projection
  surfaces consume the envelope and render it. Phase 0 guarantees
  the surfaces read a uniform shape rather than per-envelope
  variants.

## 3. The four axes

The claim is that every artifact in this codebase sits at a point
in a 4-axis space. Each axis answers a different question about
the artifact, and the axes are orthogonal: knowing the value of
one tells you nothing about the values of the others.

### 3.1 Stage — the temporal axis

**Question answered.** *Where in the forward progression is this
artifact?*

**Values.** `'preparation' | 'resolution' | 'execution' | 'evidence' | 'proposal' | 'projection'`.

**Runtime shadow today.** The `stage: WorkflowStage` field on every
envelope and receipt. Checked at runtime by
`lib/application/commitment/validate-step-results.ts:19`
(`assertInvariant(isResolution(receipt.stage), ...)`), by schema
validators in `lib/domain/validation/core/*`, and by a round-trip
assertion in `workflow-types.ts:228`.

**Compile-time lift.** `WorkflowEnvelope<TPayload, S extends WorkflowStage = WorkflowStage>`
carries `S` as a phantom type parameter with a default that
preserves back-compat for existing single-arg call sites.
`StagedEnvelope<T, Stage>` at `workflow-types.ts:66` is **dead
scaffolding** (zero call sites in `lib/`); Phase 0a deletes it and
the associated `brandByStage`, `PreparationEnvelope<T>`,
`ResolutionEnvelope<T>`, `ExecutionEnvelope<T>` aliases. The
generic-parameter version supersedes the brand-pattern version.

**What it unlocks.** Function signatures become protocol steps:
`buildProposals(run: WorkflowEnvelope<'execution', ExecutionPayload>): WorkflowEnvelope<'proposal', ProposalPayload>`
says "execution-stage input, proposal-stage output" without a
comment. Runtime asserts on stage become compile errors. The cold-
start convergence plan's Phase A decomposers produce atoms with
typed stage provenance.

### 3.2 Source — the epistemic axis

**Question answered.** *Which slot of the 5-rung precedence ladder
produced this artifact, and therefore how much does the system
trust its content?*

**Values.** `'operator-override' | 'agentic-override' | 'deterministic-observation' | 'live-derivation' | 'cold-derivation'`.

**Runtime shadow today.** The `source: PhaseOutputSource` field on
atoms, compositions, and projections. Already a mapped-type registry
at `lib/domain/pipeline/source.ts:26-118` with an exhaustive fold
(`foldPhaseOutputSource`) and a precedence comparator
(`compareSourcePrecedence`). The 5-rung ladder is resolved at
runtime by `pickHighestPrecedence` in
`lib/application/pipeline/lookup-chain-impl.ts:185-247`.

**Compile-time lift.** `Atom<C, T, Source extends PhaseOutputSource>`
carries the source as a phantom parameter. Functions that require
canonical provenance (e.g., promotion gate evaluators) constrain
`Source extends 'operator-override' | 'agentic-override' | 'deterministic-observation'`
to reject anything weaker. Posture becomes a bound on Source
(`cold-start` restricts to `'cold-derivation'`; `warm-start` opens
the full ladder; `production` adds `'operator-override'`).

**Precedence consolidation.** Two abstractions currently implement
the same algebra:

- `freeSearch` / `walkStrategyChainAsync` (async, trail-producing,
  used by the resolution ladder and the recovery strategy chain).
- `dispatchByPrecedence` in `lib/domain/resolution/precedence-policy.ts`
  (sync, map-indexed, used by the data ladder, run selection ladder,
  and phase output source ladder).

Phase 0b picks one (freeSearch — the trail-producing one) and
retires the other. The four ad-hoc ladders migrate to the unified
abstraction. Trust policy stays separate — it is a gate chain, not
a precedence ladder.

**What it unlocks.** The cold-start/warm-start distinction becomes
a type-level invariant. A function that wants to compute "effective
hit rate" can require `Source extends 'agentic-override' | 'deterministic-observation'`
in its signature and the compiler will catch any attempt to feed it
`'live-derivation'` data. The precedence consolidation eliminates
one of two abstractions that do the same thing and gives us one
shared provenance shape (`PrecedenceResult<Value, RungName>`).

### 3.3 Verdict — the normative axis

**Question answered.** *What is governance's three-way decision
about this artifact right now, and can computation proceed with
it?*

**Values.** `Approved<T> | Suspended<T, NeedsInput> | Blocked<T>`.

**Runtime shadow today.** The `governance: Governance` string field
(22 envelope types) and `GovernanceVerdict<T, I>` ADT (used in 3
files — `auto-approval.ts`, `agent-decider.ts`, `dashboard-decider.ts`).
The ADT is the proper algebra; the string is the degraded runtime
serialization.

**Compile-time lift.** Replace `governance: Governance` on envelope
types with `verdict: GovernanceVerdict<Payload, ReviewRequest>`.
Every check point uses `foldVerdict` or `runGateChain` instead of
ad-hoc `if`s. The verdict travels **with** the artifact — an
execution envelope's verdict refines the payload type: a blocked
execution envelope's payload is typed as non-consumable by downstream
functions that require approved input.

**Governance phantom brands.** `lib/domain/governance/workflow-types.ts`
already has `Approved<T>`, `ReviewRequired<T>`, `Blocked<T>` as phantom
brands plus a `foldGovernance` combinator. Phase 0d ties these to the
verdict ADT: an `Approved<T>` value is one that can be folded to an
`approved(value)` verdict without inspection.

**What it unlocks.** Every gate in the codebase composes the same
way. The 22 `governance: Governance` fields become one disciplined
migration. Trust policy's "collect-all-failures, any-deny-wins" gate
chain composes through `runGateChain` without bespoke dispatchers.
The convergence plan's Phase D (confidence-interval promotion) ends
up as yet another instance of the gate chain instead of a net-new
pattern.

### 3.4 Fingerprint<Tag> — the identity projection

**Question answered.** *What does this identifier point at, and
where in the Stage × Source product does the thing it points at
live?*

**Values.** `Fingerprint<Tag extends string>` as a branded string
with a phantom tag. Tag examples: `'task'`, `'knowledge'`,
`'controls'`, `'content'`, `'run'`, `'artifact'`, `'input'`,
`'surface'`, `'snapshot'`, `'rerun-plan'`, `'ado-content'`.

**Runtime shadow today.** Every `*Fingerprint`, `*Hash`, `cacheKey`
field is `string`. 11 distinct named fields, all mutually
interchangeable at the type level. The `WorkflowEnvelopeFingerprints`
interface has six slots (`artifact`, `content`, `task`, `knowledge`,
`controls`, `run`) that each accept a bare string. The agent audit
found that the `task` field is currently populated from a variable
called `surfaceFingerprint`, so the field name is already lying about
its content at `lib/application/catalog/envelope.ts:182` — code I
shipped last session.

**Compile-time lift.** Introduce `Fingerprint<Tag>` branded type.
Every fingerprint-producing helper returns a tagged variant.
`WorkflowEnvelopeFingerprints`'s slots each declare their expected
tag. `ScenarioEnvelopeHeaderInput`'s 9 loose strings become 9
distinct types that cannot be transposed.

**Relationship to the other axes.** A fingerprint is an address of
a point in the Stage × Source product, so its tag can be derived
from the point it identifies. A `Fingerprint<'execution-run-record'>`
points at a `WorkflowEnvelope<'execution', RunRecordPayload>`. The
lineage edge type becomes `readonly Fingerprint<any>[]` where `any`
is controlled by the envelope the lineage belongs to — which means
the `sources: readonly string[]` field that currently mixes
fingerprints and artifact paths can be split into typed variants.

**What it unlocks.** The envelope helpers I just shipped stop being
bug-prone. The trace artifact layer can emit typed lineage
references that operators can follow. The C6 braid of the convergence
plan's Phase C gets a typed ancestry chain instead of a bag of
strings.

### 3.5 The axes compose

The four axes are orthogonal but their composition describes every
artifact in the codebase. The "shape of the whole" is:

```
Envelope<Stage, Source, Verdict><Payload>
  where Payload carries Fingerprint<Tag>-typed identities for its
  references to other envelopes.
```

Every function signature in the codebase that takes an envelope is
today implicitly constraining (Stage, Source, Verdict) via
runtime checks, operator knowledge, or convention. The refactor
moves those constraints into signatures.

The forward progression of the pipeline becomes a typed path through
this space:

```
(preparation, deterministic-observation, approved)
  → (preparation, cold-derivation,       approved)
  → (resolution,  agentic-override,      approved)
  → (execution,   live-derivation,       suspended)
  → (evidence,    live-derivation,       approved)
  → (proposal,    agentic-override,      suspended)
  → (improvement, operator-override,     approved)
```

Each step moves along at least one axis. Each step's precondition
is a type constraint on the previous step's output. A function named
`reconcile(prop: WorkflowEnvelope<'proposal', Approved<_>, _>): WorkflowEnvelope<'improvement', Approved<_>, _>`
tells you exactly where in the 4D space the function lives.

## 4. Phase 0a — Stage phantom

**Goal.** Make `stage` a phantom type parameter on `WorkflowEnvelope`
and on every envelope type that carries a runtime `stage` field.
Turn the runtime assertion at `validate-step-results.ts:19` into a
compile-time constraint.

### 4.1 Doctrinal seams

- `lib/domain/governance/workflow-types.ts:66` — `StagedEnvelope<T, Stage>`
  already exists and is uncalled. This is the load-bearing lift
  point. The type is there; Phase 0a is finishing it.
- `lib/domain/governance/workflow-types.ts` — `WorkflowEnvelope<T>`
  and `WorkflowMetadata` are the base types every envelope extends.
  They need a `<Stage extends WorkflowStage>` generic parameter.
- `lib/domain/commitment/pipeline-staging.ts:97-102` — the six
  stage predicates (`isPreparation`, `isResolution`, etc.). After
  Phase 0a these become type guards that also narrow the phantom.
- `lib/application/catalog/envelope.ts:115-180` — `createRunRecordEnvelope`
  and `createProposalBundleEnvelope` hardcode `stage: 'execution'`
  and `stage: 'proposal'`. They need generic stage parameters.
- `lib/application/catalog/envelope.ts:145-217` —
  `mintScenarioEnvelopeHeader` (the one I added last session) needs
  a stage parameter that flows into the result type.

### 4.2 Work items

1. **Lift `WorkflowMetadata` and `WorkflowEnvelope` to generic.**
   `WorkflowMetadata<S extends WorkflowStage>` replaces
   `WorkflowMetadata`, and the `stage: WorkflowStage` field becomes
   `stage: S`. `WorkflowEnvelope<S, P> = WorkflowMetadata<S> & { payload: P }`.
   `StagedEnvelope` becomes the canonical name (or we delete the
   empty shell and let `WorkflowEnvelope<S, P>` carry the name).

2. **Update the 9 concrete envelope types.** Each of these gains
   an explicit stage tag argument to its parent type:
   - `BoundScenario` → `WorkflowEnvelope<'preparation', ...>`
   - `ScenarioInterpretationSurface` → `WorkflowEnvelope<'preparation', ...>`
   - `ScenarioTaskPacket` → `WorkflowEnvelope<'preparation', ...>`
     (deprecated; consider removing in this phase)
   - `DiscoveryRun` → `WorkflowEnvelope<'preparation', ...>`
   - `ResolutionReceiptBase` → `WorkflowEnvelope<'resolution', ...>`
   - `ResolutionGraphRecord` → `WorkflowEnvelope<'resolution', ...>`
   - `InterpretationDriftRecord` → `WorkflowEnvelope<'resolution', ...>`
   - `StepExecutionReceipt` → `WorkflowEnvelope<'execution', ...>`
   - `RunRecord` → `WorkflowEnvelope<'execution', ...>`
   - `ProposalBundle` → `WorkflowEnvelope<'proposal', ...>`

3. **Update the constructor trio to generic signatures.**
   `createRunRecordEnvelope<S extends 'execution'>(...)` becomes
   redundant (S is always `'execution'`) but the point is that the
   factory's return type carries the tag. Cleaner: explicit
   `createRunRecordEnvelope(...): WorkflowEnvelope<'execution', RunPayload>`.
   Same for proposal bundle and the interpretation surface builder.
   `mintScenarioEnvelopeHeader` stays generic — it produces the
   ids/fingerprints/lineage trio, not the full envelope.

4. **Convert runtime stage assertions to type-level.** The
   assertion at `validate-step-results.ts:19` changes from
   `assertInvariant(isResolution(receipt.stage))` to
   `receipt: WorkflowEnvelope<'resolution', _>`. The predicate
   becomes a type guard for places that consume `WorkflowEnvelope<WorkflowStage, _>`
   (unknown-stage) and need to narrow.

5. **Update ~24 consumer call sites.** The files the agent audit
   identified: commitment builders, interpret/run orchestration,
   governance trust-policy evaluators, schema validators, catalog
   consumers. Each one needs either an explicit stage parameter in
   its signature or a type narrowing via one of the stage predicates.

6. **Update the handshakes census.** The `handshakes` array on
   lineage already respects stage ordering. Phase 0a does not
   enforce the ordering via type yet (that is Phase 0b+ territory
   through the precedence ladder algebra). But the type of each
   entry becomes `WorkflowStage` instead of `string` if it is not
   already.

### 4.3 Exit criteria

- `WorkflowEnvelope<Stage, Payload>` is the canonical type. Every
  type in `lib/domain/execution`, `lib/domain/evidence`,
  `lib/domain/resolution`, and `lib/domain/intent` that has a `stage`
  field has that field typed as a narrow literal (not the union).
- The runtime assertion at `validate-step-results.ts:19` is gone
  (replaced by a type-level constraint).
- `npm run build` is clean.
- `tsc --noEmit` reports no new errors beyond the 5 pre-existing
  ones (`fitness.ts`, `minting.ts`, `measurement-class.laws.spec.ts`,
  `design-calculus-abstractions.laws.spec.ts`,
  `canon-decomposition.laws.spec.ts`).
- The full test suite passes (3393 + whatever we add, minus the
  4 pre-existing unrelated failures).
- A new law test `tests/architecture/envelope-stage-phantom.laws.spec.ts`
  asserts that the 9 concrete envelope types carry distinct narrow
  stage parameters and that passing one where another is expected
  is a type error (verified via `// @ts-expect-error` annotations).

### 4.4 Off-ramp

If Phase 0a cannot complete — e.g., the generic lift cascades into
a thousand inference errors — the partial state is **still
valuable** if we stop at a natural checkpoint:

- **Minimum viable lift:** Only lift `WorkflowEnvelope`'s signature
  and thread stage through the constructor trio. Leave the 24
  consumer sites calling them with explicit stage arguments. This
  gives us `createRunRecordEnvelope(): WorkflowEnvelope<'execution', RunPayload>`
  at the constructor level, which catches the top-of-stack bugs.
  Consumer migration can be deferred.
- **Shutdown state:** Even at minimum viable, the Phase 0b, 0c, 0d
  work can proceed because they mostly touch other axes. Stage
  phantom being partial slows Phase 0c (which wants Stage × Source
  tags on fingerprints) but does not block it.

### 4.5 Risks

- **TypeScript generic inference quirks.** The lift from
  `WorkflowEnvelope` to `WorkflowEnvelope<S, P>` will fan out
  through tuple types, intersection types, and `Effect` generics.
  Expect 1-2 days of whack-a-mole at consumer sites where the
  compiler can't infer S from context.
- **Test fixture rewrites.** Many tests construct envelopes with
  literal stage strings. They'll need either type arguments or
  narrowed factory functions. Budget this as part of the phase.
- **The `ScenarioTaskPacket` deprecated type.** If Phase 0a
  accidentally lifts it into the generic tree, we're paying
  migration cost on dead code. Consider deleting it first.

### 4.6 Scope estimate

- **Files touched:** ~50-80 (the 9 envelope type declarations, the
  ~8 validation core files, the ~24 consumers, the constructor
  trio, ~10 tests).
- **Lines changed:** ~500-1000.
- **Effort profile:** This is the riskiest phase because generic
  lifts are inference-brittle. Expect multiple build-test-fix
  cycles. Budget 3-5 days of focused work; plan to carry the
  partial state on a branch that can be paused if higher-priority
  work interrupts.

## 5. Phase 0b — Source axis (scoped-down from original plan)

**Goal.** Make `source` a phantom type parameter on canonical
artifacts (`Atom`, `Composition`, `Projection`) so functions can
constrain the source slots they accept.

**Scope narrowing (executed 2026-04-09).** The original plan called
for also consolidating the four ad-hoc precedence dispatchers
(`dispatchByPrecedence` → `freeSearch` migration) and lifting
`KnowledgePosture` to a `Source` bound. Closer inspection during
Phase 0b execution showed that `dispatchByPrecedence` (static
candidate lookup) and `freeSearch` (strategy-chain walk with
inner computation) serve different purposes and forcibly unifying
them would make both worse. The precedence consolidation is
deferred to its own follow-up. Posture-as-bound is also deferred
so the source phantom can settle first. The Phase 0b work items
below have been revised to reflect what actually landed.

### 5.1 Doctrinal seams

- `lib/domain/pipeline/source.ts:26-118` — `PhaseOutputSource`
  mapped-type registry + `foldPhaseOutputSource` +
  `compareSourcePrecedence`. The source ladder's runtime algebra is
  already here; Phase 0b lifts it to the type level.
- `lib/domain/pipeline/atom.ts`, `composition.ts`, `projection.ts`
  — the three canonical envelope types already carry a `source:
  PhaseOutputSource` field. Phase 0b adds a phantom parameter.
- `lib/domain/algebra/free-forgetful.ts` — contains `freeSearch` /
  `freeSearchAsync`, the Kleisli iterator I consolidated last
  session. This is the winning abstraction for the precedence
  ladder algebra.
- `lib/domain/resolution/precedence-policy.ts` — contains
  `dispatchByPrecedence`, the losing abstraction. Four ladders use
  it today (data, run selection, phase output source, route
  selection). Phase 0b migrates them to `freeSearch` and deletes
  `dispatchByPrecedence`.
- `lib/application/pipeline/lookup-chain-impl.ts:185-247` —
  `pickHighestPrecedence`. Rewritten on top of the unified ladder.

### 5.2 Work items

1. **Introduce `PrecedenceLadder<RungName, Value>` as a typed
   alias.** This is not a new abstraction — it is a named
   specialization of `freeSearch` where each candidate is a rung
   and each match returns a `PrecedenceResult<Value, RungName>`.
   Lives in `lib/domain/algebra/precedence.ts` or as a named
   section within the free-forgetful module.

2. **Migrate the four ad-hoc ladders to `PrecedenceLadder`.**
   - **Data ladder** (6 slots) — `lib/runtime/resolution/select-controls.ts`
   - **Run selection ladder** (3 slots) — same file
   - **Phase output source ladder** (5 slots) —
     `lib/application/pipeline/lookup-chain-impl.ts`
   - **Route selection ladder** (4 slots) —
     `lib/domain/resolution/precedence.ts` (currently policy-only,
     not wired; Phase 0b wires it through the unified abstraction
     as the template for the migration).

3. **Delete `dispatchByPrecedence`.** After the four migrations,
   the helper has zero call sites. Delete it. Update
   `precedence-policy.ts` to re-export types from the unified
   abstraction.

4. **Lift the canonical envelope types to carry Source as phantom.**
   `Atom<C extends AtomClass, T, Src extends PhaseOutputSource = PhaseOutputSource>`,
   same for `Composition` and `Projection`. The default parameter
   means existing consumers that don't care about provenance
   constraints continue to work; consumers that care can constrain.

5. **Add source bounds at key consumer sites.** The cleanest first
   win: the promotion gate evaluators in
   `lib/domain/pipeline/promotion-gate.ts` constrain their input to
   `Atom<C, T, 'cold-derivation' | 'live-derivation'>` (the only
   sources eligible for promotion to canon). This makes the
   "don't promote what's already canon" invariant type-enforced.

6. **Lift `KnowledgePosture` to a Source bound.** `KnowledgePosture`
   becomes a phantom-refined view over Source:
   - `cold-start` → allows `'cold-derivation'` only
   - `warm-start` → allows `'agentic-override' | 'deterministic-observation' | 'live-derivation' | 'cold-derivation'`
   - `production` → allows the full 5-rung set
   The catalog loaders emit `CatalogInPosture<'cold-start'>` /
   `CatalogInPosture<'warm-start'>` / `CatalogInPosture<'production'>`
   which are type aliases refining the atom/composition/projection
   arrays by source bound.

### 5.3 Exit criteria

- `PrecedenceLadder<K, V>` exists as a named alias; `freeSearch` is
  the underlying implementation.
- Zero call sites of `dispatchByPrecedence` remain; the helper is
  deleted.
- Atoms, compositions, and projections carry a default-parameterized
  Source phantom.
- `promotion-gate.ts` constrains its input to sources eligible for
  promotion.
- `CatalogInPosture<Posture>` exists and is the return type of the
  workspace catalog loader. The existing `loadWorkspaceCatalog`
  signature refines to `(options: LoadCatalogOptions): Effect<CatalogInPosture<Posture>>`
  where `Posture` is derived from `options.knowledgePosture`.
- Law tests: precedence ladder winner deterministically wins the
  highest-ranked rung (carries over from existing tests); posture
  bound refinement is exercised by
  `tests/architecture/posture-source-bound.laws.spec.ts` (new).

### 5.4 Off-ramp

- **Minimum viable lift:** Just unify the four precedence ladders
  under `PrecedenceLadder<K, V>` and delete `dispatchByPrecedence`.
  Leave the Source phantom for a later pass. This still pays off:
  one abstraction, one provenance shape, one place to add new
  ladders. The Source phantom lift is smaller without the ladder
  unification than with it, so deferring the phantom is cheap.
- **Shutdown state:** With only the ladder consolidation done,
  Phase 0c (Fingerprint<Tag>) can still proceed because it mostly
  depends on Phase 0a (Stage phantom) rather than on Source.

### 5.5 Risks

- **Precedence migration subtleties.** Each of the four ladders
  has its own rung naming and its own "what does a win look like"
  shape. Expect to spend time reconciling these into the unified
  `PrecedenceResult<V, K>` type. One of the four (route selection)
  is policy-only and not wired — treat it as the template that
  defines the canonical shape, not as a migration target.
- **Default parameter fallout.** Adding `Src extends PhaseOutputSource
  = PhaseOutputSource` to `Atom<C, T>` can have subtle implications
  for sites that pattern-match on atoms via `extends` clauses. The
  default parameter usually protects against breakage, but watch
  for inference errors at sites that use `Atom<any, any>` as a
  wildcard.
- **Posture bound correctness.** The cold-start/warm-start
  refinement is load-bearing for the cold-start convergence plan.
  A wrong bound would let cold-start code accidentally touch warm-
  start data. The bound needs a dedicated law test and ideally a
  `@ts-expect-error` suite demonstrating which operations compile
  and which don't for each posture.

### 5.6 Scope estimate

- **Files touched:** ~20-35 (4 precedence ladder migrations, 3
  canonical envelope type lifts, ~8 consumer sites that constrain
  by source, ~5 tests, the unified precedence module itself).
- **Lines changed:** ~300-600.
- **Effort profile:** Lower risk than Phase 0a because the
  abstractions (`freeSearch`, `PhaseOutputSource`) already exist.
  This is mostly call-site migration and phantom parameter
  threading. Budget 2-3 days.

## 6. Phase 0c — Fingerprint<Tag>

**Goal.** Introduce `Fingerprint<Tag extends string>` as a branded
string type and migrate every fingerprint-producing helper, every
fingerprint field, and every fingerprint-threading interface to use
tagged variants. Make fingerprint transposition a compile error.

### 6.1 Doctrinal seams

- `lib/domain/kernel/hash.ts` — already contains `contentFingerprint`
  and `taggedContentFingerprint` (from an earlier refactor). Phase
  0c extends them with a phantom tag parameter:
  `contentFingerprint<Tag extends string>(tag: Tag, value: unknown): Fingerprint<Tag>`.
- `lib/domain/governance/workflow-types.ts` — `WorkflowEnvelopeFingerprints`
  has six string slots (`artifact`, `content`, `task`, `knowledge`,
  `controls`, `run`). Each gets a typed variant.
- `lib/application/catalog/envelope.ts:136-217` —
  `ScenarioEnvelopeHeaderInput` threads 9 fingerprint-shaped
  strings. Each becomes a typed variant. This is the site with the
  current `task: input.surfaceFingerprint ?? null` bug (line 182);
  Phase 0c makes that line stop compiling.
- `lib/domain/pipeline/atom.ts`, `composition.ts`, `projection.ts`
  — `inputFingerprint: string` field on each. Becomes
  `inputFingerprint: Fingerprint<'atom-input'> | Fingerprint<'composition-input'> | Fingerprint<'projection-input'>`.
- Every cache module in `lib/application/agency/*-cache.ts`,
  `lib/application/resolution/translation/translation-cache.ts`,
  `lib/application/projections/cache.ts` — cache key helpers
  return tagged fingerprints.

### 6.2 Work items

1. **Introduce the `Fingerprint<Tag>` brand.** In `lib/domain/kernel/hash.ts`:

   ```typescript
   declare const FingerprintBrand: unique symbol;
   export type Fingerprint<Tag extends string> = string & {
     readonly [FingerprintBrand]: Tag;
   };
   ```

   Plus a type-level tag registry so tags are documented:
   `FingerprintTag = 'task' | 'knowledge' | 'controls' | 'content' | 'run' | 'artifact' | 'atom-input' | 'composition-input' | 'projection-input' | 'surface' | 'ado-content' | 'rerun-plan' | ...`.

2. **Lift `contentFingerprint` and `taggedContentFingerprint` to
   tagged variants.**

   ```typescript
   export function contentFingerprint<Tag extends FingerprintTag>(
     tag: Tag, value: unknown,
   ): Fingerprint<Tag> { ... }

   export function taggedContentFingerprint<Tag extends FingerprintTag>(
     tag: Tag, value: unknown,
   ): Fingerprint<Tag> { ... }
   ```

   The runtime behavior is unchanged — they still return
   `sha256(stableStringify(value))`. The tag is phantom.

3. **Type `WorkflowEnvelopeFingerprints`'s six slots.**

   ```typescript
   interface WorkflowEnvelopeFingerprints {
     readonly artifact: Fingerprint<'artifact'>;
     readonly content: Fingerprint<'content'> | null;
     readonly task: Fingerprint<'task'> | null;
     readonly knowledge: Fingerprint<'knowledge'> | null;
     readonly controls: Fingerprint<'controls'> | null;
     readonly run: Fingerprint<'run'>;
   }
   ```

   This is the refinement that catches the `task: surfaceFingerprint`
   bug: if `surfaceFingerprint` is typed `Fingerprint<'surface'>`,
   assigning it to a `Fingerprint<'task'>` slot is a type error.

4. **Type `ScenarioEnvelopeHeaderInput`'s 9 loose strings.** Each
   parameter gets its appropriate tag. The helper I shipped
   becomes:

   ```typescript
   interface ScenarioEnvelopeHeaderInput {
     readonly adoId: AdoId;
     readonly suite: string;
     readonly runId: Fingerprint<'run'>;
     readonly contentHash: Fingerprint<'content'>;
     readonly knowledgeFingerprint?: Fingerprint<'knowledge'> | null;
     readonly controlsFingerprint?: Fingerprint<'controls'> | null;
     readonly surfaceFingerprint?: Fingerprint<'surface'> | null;
     readonly artifactFingerprint: Fingerprint<'artifact'>;
     readonly parents: readonly Fingerprint<FingerprintTag>[];
     readonly handshakes: WorkflowEnvelopeLineage['handshakes'];
   }
   ```

   And the bug line is fixed by either (a) renaming the field to
   `task: input.surfaceFingerprint` → `surface: input.surfaceFingerprint`
   at the envelope level, or (b) computing a surface-to-task mapping
   explicitly where the confusion lives. Either is a deliberate
   choice; a type error forces the choice.

5. **Lift `inputFingerprint` on atoms, compositions, projections.**
   Each tier uses its own tag: `Fingerprint<'atom-input'>`,
   `Fingerprint<'composition-input'>`, `Fingerprint<'projection-input'>`.
   `mintAtom` returns an atom with the correct-tag fingerprint.

6. **Migrate the cache modules.** Each cache module computes a
   cache key from fingerprint inputs. The modules I migrated in
   an earlier refactor (projections/cache.ts, translation-cache.ts,
   agent-interpretation-cache.ts, operator.ts, confidence.ts)
   each get tag refinement. A translation cache key is
   `Fingerprint<'translation-cache-key'>`; an agent interpretation
   cache key is `Fingerprint<'agent-interp-cache-key'>`; etc.

7. **Type the lineage edges.** `WorkflowEnvelopeLineage.sources`
   and `.parents` split into `readonly Fingerprint<FingerprintTag>[]`
   (the typed variant for the fingerprint entries) and a separate
   field for artifact path entries. This fixes the current mixing
   at `createEnvelopeLineage` where `sources` holds both
   fingerprints and filesystem paths under a single `string[]`.

### 6.3 Exit criteria

- `Fingerprint<Tag>` exists and is used at every fingerprint
  producer and every fingerprint consumer.
- The `task: input.surfaceFingerprint` bug in
  `lib/application/catalog/envelope.ts:182` is explicitly resolved
  (either by fixing the semantic mismatch or by documenting the
  surface-to-task mapping).
- `WorkflowEnvelopeLineage` splits fingerprint entries from
  artifact path entries into distinct fields.
- Compilation fails for any call site that tries to pass a
  `Fingerprint<'surface'>` where a `Fingerprint<'task'>` is
  expected.
- Law tests: a new `tests/architecture/fingerprint-tags.laws.spec.ts`
  asserts tag discrimination via `@ts-expect-error` annotations.
- `npm run build` clean, full test suite passes.

### 6.4 Off-ramp

- **Minimum viable lift:** Introduce `Fingerprint<Tag>` and lift
  only the `contentFingerprint` / `taggedContentFingerprint`
  helpers. Leave consumers on bare strings. This creates the
  *vocabulary* without forcing immediate adoption. Phase 0c can
  then migrate consumers opportunistically over multiple sessions
  while the vocabulary is available for any new code.
- **Shutdown state:** Phase 0c can be partial without blocking
  Phase 0d. The Verdict migration does not depend on fingerprint
  tags.

### 6.5 Risks

- **Migration ordering matters.** Migrate producers first (helpers
  that compute fingerprints), then consumers (places that receive
  fingerprints). Doing it the other way creates a flood of type
  errors at sites that can't produce the right-tagged variant yet.
- **Lineage edge split is a breaking change.** Splitting
  `sources: string[]` into distinct fingerprint and path fields
  changes the serialization shape of every envelope's lineage.
  Tests that assert on envelope JSON shape will break. This is
  the cost of the fix; budget it.
- **Surface vs task semantic.** The current `task` envelope slot
  receives a surface fingerprint because the codebase's task-vs-
  surface distinction is fuzzy. Phase 0c does not resolve the
  semantic question; it just forces the choice. Whoever ships the
  phase has to decide whether to rename the slot or to add an
  explicit derivation. Allocate product thinking time.

### 6.6 Scope estimate

- **Files touched:** ~30-50 (hash.ts, workflow-types.ts, envelope.ts,
  atom.ts, composition.ts, projection.ts, the 5 cache modules, the
  commitment builders, tests).
- **Lines changed:** ~400-700.
- **Effort profile:** Moderate risk. Producers-first discipline
  keeps the error flood bounded. Budget 2-3 days of focused work.

## 7. Phase 0d — Verdict axis

**Goal.** Replace the `governance: Governance` string field on
envelope types with `verdict: GovernanceVerdict<Payload, ReviewRequest>`.
Every gate in the codebase composes through `runGateChain` /
`foldVerdict`. The 22 `governance: Governance` fields become one
disciplined migration.

### 7.1 Doctrinal seams

- `lib/domain/kernel/governed-suspension.ts` — `GovernanceVerdict<T, I>`,
  `approved`, `suspended`, `blocked`, `foldVerdict`, `chainVerdict`,
  `runGateChain`, `runGateChainFrom`. This module is already complete
  and tested. Phase 0d is adoption, not invention.
- `lib/domain/governance/workflow-types.ts` — `Governance` type,
  `foldGovernance`, `mintApproved`, phantom brands (`Approved<T>`,
  `ReviewRequired<T>`, `Blocked<T>`). These get reconciled with the
  verdict ADT.
- `lib/application/governance/auto-approval.ts` —
  `autoApprovalVerdict` is the canonical worked example. Every
  other gate chain should end up structured the same way.
- `lib/application/governance/trust-policy.ts` — trust policy's
  gate-chain pattern (collect-all-failures, any-deny-wins) becomes
  a variant of `runGateChain` where the short-circuit rule differs.

### 7.2 Work items

1. **Reconcile `Governance` and `GovernanceVerdict<T, I>`.** The
   string type stays for runtime serialization (JSON emission,
   backward compat with stored artifacts). The ADT becomes the
   in-memory representation. Conversion functions:

   ```typescript
   function verdictToGovernance<T, I>(
     v: GovernanceVerdict<T, I>,
   ): Governance { ... }

   function governanceToVerdict<T>(
     g: Governance,
     value: T,
   ): GovernanceVerdict<T, unknown> { ... }
   ```

   Envelopes serialize with `governance` strings on disk; they
   deserialize to verdicts in memory. The persistence layer is
   the one place the conversion happens.

2. **Lift envelope types to carry verdict.** Each of the 22
   `governance: Governance` fields becomes
   `verdict: GovernanceVerdict<Payload, ReviewRequest>`. This
   cascades through: `RunRecord`, `ProposalBundle`,
   `ScenarioInterpretationSurface`, `InterpretationDriftRecord`,
   `ResolutionGraphRecord`, `DiscoveryRun` (once envelope-
   compliant), `InterventionReceipt`, `ApprovalReceipt`, etc.

3. **Migrate the constructor trio.** `createRunRecordEnvelope`,
   `createProposalBundleEnvelope`, `mintScenarioEnvelopeHeader`
   all stop taking `governance: Governance` and start taking
   `verdict: GovernanceVerdict<Payload, ReviewRequest>`. The
   derived `governance` string is computed inside the constructor
   via `verdictToGovernance`.

4. **Migrate gate chains.** Trust policy's collect-all-failures
   pattern becomes a `runGateChain` variant. The handoff gate
   chain becomes a `runGateChain`. The promotion gate evaluator
   (once Phase 0b lands) becomes a `runGateChain`. Every gate
   that was ad-hoc `if`s becomes a verdict composition.

5. **Migrate consumers.** ~60 direct assignments of governance
   string literals across production code. Each is replaced with
   `approved(value)`, `suspended(needs, reason)`, or
   `blocked(reason)`. Every consumer that reads `governance`
   switches to `foldVerdict`.

6. **Update tests.** Test fixtures that construct envelopes with
   literal governance strings update to verdict constructors.
   Assertions that check `.governance === 'approved'` become
   `foldVerdict(e.verdict, {...})` or
   `isApproved(e.verdict)`. Budget significant test migration.

### 7.3 Exit criteria

- Every envelope type in `lib/domain/` that carried a
  `governance: Governance` field now carries
  `verdict: GovernanceVerdict<Payload, ReviewRequest>`.
- Trust policy evaluation uses `runGateChain` with a collect-all
  variant.
- Zero direct assignments of governance string literals in
  `lib/` (scripts and tests still allowed but discouraged).
- `foldVerdict` / `runGateChain` is used at every check point that
  was previously ad-hoc.
- Serialization round-trip: write envelope to JSON, read it back,
  verdict is preserved byte-equivalently.
- Law tests: verdict round-trip invariant, verdict composition
  laws (associativity, identity), verdict constructor laws.

### 7.4 Off-ramp

- **Minimum viable lift:** Migrate only the constructor trio's
  signature to accept a verdict instead of a governance string.
  Consumers keep reading `envelope.governance`. This lets the new
  code be written verdict-first while old code continues to work.
  Progressive adoption.
- **Shutdown state:** Phase 0d partial still pays off because the
  constructor-level verdict discipline prevents new `governance:
  'approved'` fields from landing on new envelope types.

### 7.5 Risks

- **Largest raw migration.** 22 fields, ~60 assignments, and
  tests on top. Expect 3-4 days of mostly mechanical migration
  with occasional surprises at sites that do non-trivial
  governance logic.
- **Serialization compatibility.** Envelopes stored on disk use
  the string form. The migration must not break reading existing
  stored envelopes. Run the full integration suite against a
  fixture corpus that predates the migration.
- **Verdict payload inference.** `GovernanceVerdict<T, I>` is
  generic over the payload type. Getting TypeScript to infer `T`
  correctly at every use site can be fiddly. Expect some
  explicit type annotations at constructor sites.

### 7.6 Scope estimate

- **Files touched:** ~50-70 (22 envelope type declarations, ~60
  assignment sites, ~15 gate chains, ~20 test files).
- **Lines changed:** ~600-1100.
- **Effort profile:** Moderate risk, high volume. This is the
  largest phase by raw lines but lower cognitive cost than
  Phase 0a because the abstraction (`GovernanceVerdict`) is
  complete. Budget 3-5 days.

## 8. Stabilization checkpoint

After Phases 0a–0d land, we stop and stabilize. This is not
optional. It is the hinge between "structural refactor" and
"feature work can resume on the new scaffolding."

### 8.1 Stabilization tasks

1. **Full test suite sweep.** Run `npm test` end to end. Any
   failure that is not one of the 4 known pre-existing failures
   (flywheel-server-integration, generated-types, state-topology,
   scoring-algebra flake) is a migration regression and must be
   fixed before proceeding.

2. **Integration fixture replay.** If there is a stored corpus of
   envelopes (`.tesseract/runs/*`, `dogfood/generated/*`), load
   every one and assert it parses under the new types. Any parse
   failure means a backward-compatibility gap in the migration.
   Fix or document the breakage.

3. **Build the doctrine map.** Add an "Envelope Axis Vocabulary"
   section to `docs/master-architecture.md` that names the four
   axes and references the canonical type definitions. Update
   `docs/coding-notes.md` with the 4-axis idiom: how to declare
   a new envelope type, how to thread verdict through a builder,
   how to constrain source at a gate site.

4. **Law test census.** Write a single law test file
   `tests/architecture/envelope-axis-invariants.laws.spec.ts`
   that asserts:
   - Every envelope type in `lib/domain/` has a narrow Stage
     phantom parameter (not the union).
   - Every fingerprint-producing helper returns a tagged variant.
   - Every check point uses `foldVerdict` or a verdict constructor.
   - The four axes are independently addressable (each test
     validates one axis in isolation).

5. **Re-baseline `CLAUDE.md`.** The "Architectural guardrails" and
   "What belongs where" sections need updates reflecting the
   phantom-typed envelopes. The "Governance vocabulary" section
   stays but gains a note that `GovernanceVerdict` is the
   in-memory representation.

6. **Update the cold-start convergence plan.** Walk through
   `docs/cold-start-convergence-plan.md` and adjust any code
   sample or type signature that assumes string-typed stages,
   bare fingerprints, or `governance: Governance` fields. The
   plan's Phase A work items already reference the canonical
   envelope types; those references need no change, only the
   assumed shape of the types.

7. **Run the full build pipeline under production posture.**
   Execute a speedrun end-to-end with a fresh cold-start posture
   against a known corpus. Verify the output is byte-equivalent
   to a pre-refactor baseline (modulo the expected changes to
   serialization shape where we chose to fix them in Phase 0c).

### 8.2 Stabilization exit criteria

- `npm run build` clean.
- `tsc --noEmit` reports no new errors beyond the documented 5
  pre-existing ones.
- All 3393+ tests pass (minus the 4 documented pre-existing
  failures).
- The architecture law test file exists and all its laws hold.
- `CLAUDE.md`, `docs/master-architecture.md`, `docs/coding-notes.md`,
  and `docs/cold-start-convergence-plan.md` are refreshed to
  reflect the new types.
- One full speedrun has been run successfully under each posture
  (cold-start, warm-start).

### 8.3 What stabilization gives us

After stabilization, Phase A of the cold-start convergence plan
can begin. Its decomposers inherit phantom-typed envelopes. Its
equivalence law tests can express their invariants in the 4-axis
vocabulary. Its promotion gate wiring (Phase D) becomes a
`runGateChain` instance, not a new pattern.

Feature work on the backlog resumes. Every new envelope built in
Epic 1–5 work uses the typed vocabulary by default.

### 8.4 Scope estimate

- **Effort profile:** 2-3 days. This is the polish and alignment
  phase. Most of the work is documentation updates, law test
  writing, and running the full pipeline to confirm stability.
- **Risk:** Low if the preceding phases were done carefully.
  High if any phase was cut short — the off-ramps are valuable
  but they leave known gaps that stabilization has to explicitly
  enumerate.

## 9. Deferred work (explicitly not in Phase 0)

Several refactors that looked top-level in the initial synthesis
are deferred after the agent-cohort audit revealed they are either
not rooted in existing structure or would fight the codebase.
This section documents what's deferred and why, so future sessions
don't accidentally start them inside Phase 0.

### 9.1 Lane axis and handshake protocol

**Deferred rationale.** The six-lane doctrine exists in CLAUDE.md
but not in the code layout. The agent audit found **zero direct
cross-lane import violations** — because there are no lanes to
violate. `lib/` is organized by the 6-layer architecture
(domain/application/runtime/infrastructure/...), not by the 6
workflow lanes (intent/knowledge/control/resolution/execution/
governance-projection). The `handshakes` array on envelope
lineage respects stage ordering, but the ordering is hand-written
inline at 48 different assignment sites.

Landing a Lane phantom and a typed `Handshake<From, To>` protocol
would mean **first introducing lane separation that does not
exist**, then typing that separation. That is net-new architecture,
not de-duplication of existing structure. It is valuable, but it
sits outside the "lift what exists" discipline of Phase 0.

**When to revisit.** After Phase 0 stabilizes and after the
convergence plan's Phase A lands, re-audit the cross-lane
import map. If the new Phase A decomposers have created natural
lane boundaries (e.g., application/canon/ as its own coherent
subsystem), the Lane refactor becomes cheaper. Until then, leave
the six lanes as coordination vocabulary only.

### 9.2 Three-loop unification (A/B/C)

**Deferred rationale.** The agent audit confirmed what the
initial reflection suspected: Loop A (corpus freeze) is
idempotent corpus generation, Loop C (score into L4 metric tree)
is a metric projection visitor. Neither is iterative. Only Loop B
(substrate iterate) has iteration semantics. Trying to unify
three things where two are not members of the same abstraction
would require inventing a shared interface that distorts both.

The docs' "three loops" framing is doctrinal shorthand for "three
phases of the recursive improvement flow" — it is a narrative
about the flow, not a claim about three structurally equivalent
computations.

**When to revisit.** If Loop C becomes iterative (e.g., a cohort
replay that re-scores across iterations) or Loop A becomes
iterative (e.g., a corpus regeneration loop), the unification
argument becomes live. Today it is not.

### 9.3 Composition → Projection promotion

**Deferred rationale.** The agent audit revealed that **there is
no Composition → Projection promotion code in the codebase**.
The `projection()` constructor at
`lib/domain/pipeline/projection.ts:88` is dead code with zero
call sites. The `PromotionGate` types are declared at all three
tiers but implemented at zero.

The initial synthesis saw "three separate migration stories with
identical shape" and proposed unifying them under a
`Promotion<Lower, Higher>` interface. In reality, there is one
migration story (Atom → Composition) and one nothing. Unifying
"something" and "nothing" is not a refactor — it is a write.

**When to revisit.** The convergence plan's Phase F is "Tier 3
projection authoring." When that phase begins, the writer of
Phase F should consider extracting a `Promotion<Lower, Higher>`
interface as they go — born unified instead of refactored. This
plan explicitly does not hold Phase F hostage to a refactor of
code that does not yet exist.

### 9.4 CanonProducer generalization

**Deferred rationale.** The initial synthesis considered
generalizing `CanonProducer` (the reader environment for canon
mint operations) into a general `PipelineProducer<Stage>`
reader for every envelope construction. The agent audit showed
that `CanonProducer` is used by 7 canon decomposers and nothing
else — there are no other "producer context" types waiting to
be generalized. The pattern is isolated to one subsystem.

**When to revisit.** If a second subsystem (e.g., the L4 visitor
tree of Phase B, or the discovery runner of Phase A) grows a
similar "who/when/which-slot" context bag, the generalization
becomes worth doing. Today, `CanonProducer` alone does not
justify a generic lift.

### 9.5 `ScenarioTaskPacket` removal

**Not deferred — flagged for Phase 0a.** `ScenarioTaskPacket` is a
deprecated envelope type at `lib/domain/resolution/types.ts:243`.
Phase 0a should delete it rather than migrate it, if the audit
confirms it has no live consumers. Carrying it through the
phantom lift is pure cost with zero benefit.

## 10. Hard pivots being made

Phase 0 is not a neutral reorganization. It commits to several
stances that reshape how new work gets done. Listing them
explicitly so nobody is surprised mid-refactor.

### 10.1 `freeSearch` wins; `dispatchByPrecedence` loses

The two competing precedence dispatchers cannot coexist. Phase 0b
picks `freeSearch` (the Kleisli iterator, async-capable,
trail-producing) and retires `dispatchByPrecedence`. Any new
precedence ladder added after Phase 0b uses `freeSearch` or the
named `PrecedenceLadder<K, V>` alias over it. This is a
deliberate narrowing of the pattern vocabulary: one abstraction,
one provenance shape, one mental model.

### 10.2 `GovernanceVerdict<T, I>` is the in-memory representation

The `Governance` string type does not go away — it stays for
persistence. But in-memory, every envelope carries a
`GovernanceVerdict`. Code that reads an envelope and branches on
its governance state uses `foldVerdict`. Code that constructs an
envelope starts with a verdict and lets the serializer derive the
string. This is a deliberate shift away from string-typed
branching.

### 10.3 Posture is a refinement of Source, not a separate axis

`KnowledgePosture = 'cold-start' | 'warm-start' | 'production'`
becomes a bound on the Source phantom, not a standalone phantom.
The refactor explicitly rejects the earlier sketch of "Posture as
its own graded modality." Posture is the user-facing vocabulary;
Source is the typed mechanism. They are the same concept at two
levels of abstraction.

### 10.4 Lanes stay in docs until they exist in code

The six workflow lanes (intent/knowledge/control/resolution/
execution/governance-projection) remain coordination vocabulary.
They do **not** become types in Phase 0. Any future "lanes as
phantoms" refactor is conditional on lane separation emerging
organically in the directory layout.

### 10.5 Tier 3 projection is a write, not a refactor

The composition → projection promotion story is Phase F of the
convergence plan, not part of Phase 0. Phase 0 provides the
typed scaffolding for Phase F; Phase F writes the code that uses
that scaffolding. Any impulse to "unify promotion across tiers"
during Phase 0 is a mistake — unify nothing is not a refactor.

### 10.6 The refactor lives on a dedicated branch

Phase 0 runs on `refactor/envelope-axis` (or equivalent). It
does not rebase from main during its own phases. After each
phase completes, the branch is merged to main through a
checkpoint PR, and the branch is reset from main for the next
phase. This keeps each phase's diff bounded and each merge's
blast radius contained.

### 10.7 No feature work during Phase 0a

Phase 0a is the Stage phantom lift. It touches ~50–80 files and
is inference-brittle. During Phase 0a, feature work that adds
new envelope types is paused (or done on other branches that
will rebase after 0a lands). This is not a preference — it is
a necessity. New envelope types added during 0a will block the
generic lift from completing.

After 0a merges, feature work resumes on the phantom scaffolding.
Phases 0b, 0c, 0d are narrower and can coexist with feature work
on parallel branches, as long as the feature branches use the
typed vocabulary.

## 11. Risk register

Consolidated risks across all four phases, with mitigations.

| Risk | Phase | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Generic inference cascade in Phase 0a | 0a | Medium | High | Per-file migration, build after each file, prefer explicit type arguments at call sites to let inference catch up |
| Test fixture breakage from governance string migration | 0d | High | Medium | Budget test migration as part of phase work; run test suite after every ~10 envelope type migrations |
| Serialization round-trip regression | 0c, 0d | Medium | High | Integration fixture replay before merge; snapshot tests for envelope JSON shape; run full speedrun under known corpus before checkpoint PR |
| Precedence ladder rung reconciliation | 0b | Low | Medium | Define `PrecedenceResult<V, K>` shape first; migrate route selection ladder first as template; then the three wired ladders |
| Surface-vs-task semantic resolution | 0c | Medium | Low | Force a product decision by making the type error hard-fail at `envelope.ts:182`; decide: rename the slot or add a derivation |
| Dead code `ScenarioTaskPacket` inflating migration | 0a | Low | Low | Delete first, migrate second; audit consumers before Phase 0a starts |
| Feature work collision during Phase 0a | 0a | High | Medium | Declare Phase 0a a no-feature-work window; communicate clearly; run on dedicated branch |
| Convergence plan Phase A starting before Phase 0 completes | any | Medium | High | Update convergence plan doc to reference Phase 0 as a prerequisite; add a check in Phase A's acceptance criteria |
| Pre-existing tsc errors masking new ones | any | Low | Medium | Baseline the 5 known errors explicitly; any sixth error is a regression |
| Merge conflict storm on long-running branch | all | Medium | High | Merge to main after each phase via checkpoint PR; reset branch from main between phases; do not let the branch live longer than 1 phase |

## 12. Phase 0 first moves — week one

The plan is tractable only if Week 1 produces concrete, merged
progress. Here is a specific sequence for the first five working
days of Phase 0a.

### Day 1 — Audit and baseline

1. **Baseline the test suite.** Run `npm test` with output
   captured to a file. Document every failure. Confirm the 4
   known pre-existing failures. Any other failures are either
   flakes (re-run) or pre-existing issues we need to know about
   before touching anything.
2. **Baseline `tsc --noEmit`.** Capture the 5 known pre-existing
   errors. Confirm no others.
3. **Audit `ScenarioTaskPacket`.** Find every consumer. If none,
   delete it in a standalone commit before Phase 0a proper
   begins.
4. **Create the refactor branch.** `refactor/envelope-axis-0a-stage-phantom`.
5. **Write the phase plan as a commit-by-commit checklist.** Use
   the Phase 0a work items (§ 4.2) as the checklist. Each work
   item becomes one or more commits.

### Day 2 — Lift `WorkflowMetadata` and `WorkflowEnvelope`

1. Edit `lib/domain/governance/workflow-types.ts`:
   `WorkflowMetadata<S extends WorkflowStage>`,
   `WorkflowEnvelope<S extends WorkflowStage, P> extends WorkflowMetadata<S>`.
2. `npm run build` → expect a cascade of errors at every
   envelope declaration. Log the error count.
3. Fix the envelope declarations one by one. Start with the
   simplest types (`BoundScenario`, `DiscoveryRun`) and work
   toward the complex ones (`RunRecord`, `ProposalBundle`).
4. Commit after each envelope type successfully builds.
5. End of day: all 9 envelope types compile with explicit
   phantom stage parameters.

### Day 3 — Migrate the constructor trio

1. `createRunRecordEnvelope` return type becomes
   `WorkflowEnvelope<'execution', RunPayload>`. Update internal
   `stage: 'execution'` assignment.
2. Same for `createProposalBundleEnvelope`.
3. `mintScenarioEnvelopeHeader` gets a stage parameter flowing
   through to the returned header trio.
4. Build and run the targeted test subset: commitment builder
   tests, catalog envelope tests.
5. Commit.

### Day 4 — Migrate consumers

1. Walk the ~24 consumer sites the agent audit identified.
2. For each, either (a) add explicit stage type argument where
   the consumer creates or receives an envelope, or (b) use a
   type narrowing guard if the consumer handles multiple stages.
3. `validate-step-results.ts:19` is the headline win — the
   runtime assertion becomes a compile-time constraint. Commit
   this change separately and reference the assertion's
   elimination in the commit message.
4. Build after each consumer migration.
5. End of day: all 24 consumers compile.

### Day 5 — Tests and law check

1. Write the new
   `tests/architecture/envelope-stage-phantom.laws.spec.ts`.
   Assert stage-tag discrimination via `// @ts-expect-error`.
2. Run the full test suite. Fix any breakage from the phantom
   lift.
3. Run `tsc --noEmit`. Confirm only the 5 pre-existing errors.
4. Run one cold-start speedrun end-to-end.
5. Self-review the branch diff.
6. Open the checkpoint PR for Phase 0a.

**If the branch cannot merge at end of Day 5,** invoke the
off-ramp: the minimum viable lift (§ 4.4) and document what's
left for a follow-up PR.

## 13. Backlog positioning

This plan claims priority over the current sequencing in
`BACKLOG.md` § "Cross-lane priority order". The proposed new
order:

| Order | Item | Why |
|---|---|---|
| **0** | **Phase 0 (this plan) — envelope-axis refactor** | **Scaffolds everything below. Unblocks clean Phase A landing.** |
| 1 | Phase A of convergence plan — atom decomposition | Inherits Phase 0 types; decomposers produce stage/source-tagged envelopes. |
| 2 | Phase B of convergence plan — discovery-fitness L4 tree | Visitor signatures use verdict refinement and fingerprint tags. |
| 3 | A2 + A3 hardening (auto-approval + dogfood loop) | Uses `runGateChain` pervasively after 0d lands. |
| 4 | B1 + F2 finishing (route knowledge + deterministic coverage) | Benefits from typed fingerprint lineage. |
| 5 | D1 + D1.5 expansion (structured entropy + progress reporting) | Envelope-heavy; benefits from 0a + 0c. |
| 6 | B3 + C3 (confidence decay + cost budgets) | Confidence thresholds become gate chain instances after 0d. |
| 7 | E1 + E2 (operator cockpit + VSCode) | Projection layer consumes the typed envelopes. |
| 8 | D2 + D3 (benchmarks + synthetic harness) | Envelope-heavy; benefits from all four phases. |
| 9 | E3 + F1 (offline optimization + CI webhooks) | Can proceed independently; benefits from 0d at least. |

The "Cross-lane priority order" in `BACKLOG.md` gets a prepended
row for Phase 0 and a note explaining that the ordering of 1–9
assumes Phase 0 has completed.

## 14. Decisions (locked)

The decisions below are locked for Phase 0 execution. If any of
them needs revisiting mid-phase, it is a replan event, not an
improvisation. Each decision records the alternatives that were
considered and the reason the locked choice won.

### D1. Surface vs task semantic — RENAME `task` → `surface`

**Locked.** The `WorkflowEnvelopeFingerprints.task` slot is
renamed to `surface`. Every call site that populates the slot
from a variable called `surfaceFingerprint` stops lying about
what it holds. Every call site that reads
`envelope.fingerprints.task` migrates to
`envelope.fingerprints.surface`.

**Alternatives considered.**

- Keep the name `task` and add an explicit derivation function
  `taskFingerprintFromSurface(surface: SurfaceFingerprint): TaskFingerprint`.
  Rejected: preserves the lie by documenting it rather than
  fixing it. The "task" concept in the current codebase is
  structurally identical to the resolved surface at the
  fingerprint level, so the derivation would be the identity
  function.
- Introduce both `task` and `surface` slots and populate them
  identically until a true task-as-intent concept emerges.
  Rejected: doubles the field count without type-level benefit.

**Implication for future work.** If/when the codebase grows a
task-as-intent concept distinct from the resolved surface (e.g.,
a scenario content hash computed before surface resolution),
that concept gets a new slot — it does not reuse the slot
whose name we just fixed.

### D2. FingerprintTag registry — CLOSED

**Locked.** `FingerprintTag` is a closed union of specific
string literals enumerated in a single canonical location
(`lib/domain/kernel/hash.ts`). Adding a new fingerprint kind
requires editing the registry. Law test: every registered tag
has at least one producer function in the codebase.

**Alternatives considered.**

- Open tags (`Fingerprint<T extends string>` with any string).
  Rejected: inconsistent with the mapped-type registry discipline
  the codebase already uses for `L4_VISITORS`,
  `AtomPromotionGateRegistry`, `foldPhaseOutputSource`, and the
  atom/composition/projection sub-type enumerations. No
  third-party extension use case justifies opening the tag space.

**Starting registry** (subject to extension during Phase 0c):

```typescript
export type FingerprintTag =
  | 'artifact'
  | 'content'
  | 'surface'        // replaces 'task' per D1
  | 'knowledge'
  | 'controls'
  | 'run'
  | 'atom-input'
  | 'composition-input'
  | 'projection-input'
  | 'ado-content'
  | 'rerun-plan'
  | 'translation-cache-key'
  | 'agent-interp-cache-key'
  | 'proposal-cache-key'
  | 'snapshot'
  | 'node'           // graph node
  | 'edge'           // graph edge
  | 'manifest'       // route manifest, learning manifest
  | 'ledger'         // improvement ledger
  | 'discovery-run';
```

### D3. Verdict payload location — PAYLOAD LIVES INSIDE THE VERDICT

**Locked.** Envelope types carry their payload inside the
verdict, not alongside it:

```typescript
interface RunRecord extends WorkflowMetadata<'execution'> {
  readonly verdict: GovernanceVerdict<RunRecordPayload, ReviewRequest>;
  // no separate `payload` field
}
```

Reading an envelope's payload is only possible through
`foldVerdict` or an explicit type guard. The compiler cannot
skip the non-approved case. A blocked or suspended envelope's
payload is not silently consumable.

**Alternatives considered.**

- **(a) Self-referential**:
  `verdict: GovernanceVerdict<RunRecord, ReviewRequest>`.
  Rejected: circular and wasteful; the verdict would wrap the
  envelope that contains the verdict.
- **(c) Verdict as marker**: `RunRecord = { ..., payload: RunRecordPayload, verdict: GovernanceVerdict<void, ReviewRequest> }`.
  Rejected: lets the verdict float alongside the payload as
  decoration. A blocked envelope's payload is still accessible
  via `envelope.payload`, so the verdict lift has no teeth. This
  option costs less to migrate but provides no correctness
  guarantee, which defeats the purpose of Phase 0d.

**Migration cost acknowledged.** Every site that currently reads
`envelope.payload` becomes `foldVerdict(envelope.verdict, {...})`.
Dozens of sites. This is exactly where we want the compiler to
force the question "what do you do if this isn't approved?" and
the cost is the point of the lift, not a side effect.

**Helper discipline.** A convenience type guard
`approvedPayload<T>(verdict: GovernanceVerdict<T, _>): T | null`
is available, but it is explicitly **not** the recommended access
pattern. Prefer `foldVerdict` for the common case because it
forces case analysis at the call site.

### D4. `ScenarioTaskPacket` — DELETE AS DAY 0 CLEANUP

**Locked.** `ScenarioTaskPacket` at
`lib/domain/resolution/types.ts:243` is deleted before Phase 0a
begins. If the audit surfaces live consumers, those consumers
are migrated off first as part of Day 0, then the type is
deleted.

**Alternatives considered.**

- Migrate it through Phase 0a alongside the other envelope types.
  Rejected: deprecated code that costs migration effort through
  a refactor is strictly worse than deprecated code that is
  deleted. The refactor is the forcing function for the cleanup.

### D5. Speedrun policy during Phase 0a — PIN TO MAIN

**Locked.** Main stays frozen at the pre-Phase-0a commit until
Phase 0a's checkpoint PR merges. Speedruns continue to run
against main exactly as they would with no refactor happening.
After the merge, speedruns resume against the new main.

**Alternatives considered.**

- Pause speedrun scheduling entirely during Phase 0a. Rejected:
  unnecessary; normal git hygiene already provides the isolation.
- Run speedruns against the refactor branch to catch envelope
  breakage early. Rejected: the refactor branch will have
  transient inconsistencies during per-file migration; running
  speedruns against it would produce false negatives.

### D6. Branch strategy — PHASE-PER-PR

**Locked.** 5 PRs total: one per phase (0a, 0b, 0c, 0d) plus one
for stabilization. Each PR merges to main before the next phase
begins. The branch for the next phase is cut from the merged main.

**Alternatives considered.**

- Single branch for all four phases, merged at the end.
  Rejected: makes the "one bad day" problem (an inference
  cascade in 0a that propagates to 0b decisions) significantly
  worse. Bad decisions get compounded before anyone reviews
  them. Each PR being reviewable in isolation is load-bearing.

**PR sizing target.** Each phase PR should be 500-1500 lines of
production diff (excluding test migration, which can double the
count). If a phase PR exceeds 2000 lines of production diff, the
phase is split into sub-phases with intermediate merges.

### D7. Governance brand reconciliation — UNIFY IN PHASE 0D

**Locked.** The three existing governance representations are
unified during Phase 0d:

1. `Governance` string union — stays as the persistence format
   (JSON serialization of the verdict's tag).
2. `GovernanceVerdict<T, I>` ADT — becomes the canonical
   in-memory representation.
3. `Approved<T>` / `ReviewRequired<T>` / `Blocked<T>` phantom
   brands in `workflow-types.ts` — become type aliases over
   verdict states. `Approved<T>` is a verdict value where
   `_tag === 'Approved'`; same for the others.

`foldGovernance` becomes a thin alias over `foldVerdict`.
`mintApproved<T>(value)` becomes `approved(value)`. The codebase
has one algebra, one set of combinators, one persistence format.

**Alternatives considered.**

- Leave the phantom brands and the verdict ADT as parallel
  representations. Rejected: leaving two representations of the
  same concept would undercut Phase 0d's premise. Consistency is
  the point.

**Scope implication.** Phase 0d grows slightly to include the
phantom brand migration. This adds ~10 files to its scope but
does not change the phase's risk profile — the phantom brands are
already adjacent to the verdict ADT and the migration is
mechanical.

## 15. Success signals

Phase 0 is done when:

- All four axes (Stage, Source, Verdict, Fingerprint) are
  phantom-typed at the envelope and constructor level.
- One envelope type declared with a wrong axis value is a
  compile error.
- The convergence plan Phase A can proceed with decomposers
  that inherit the typed vocabulary.
- The `CLAUDE.md` and `docs/master-architecture.md` updates
  have landed.
- Stabilization § 8 is complete.
- One speedrun runs end-to-end on the new scaffolding without
  regression.
- A follow-up session can read a function signature in the
  commitment builder and know, without a comment, which stage
  its input is at, what source precedence it requires, what
  verdict it expects, and which tagged fingerprints it threads.

The last one is the observable proof that the forward
progression has become visible.

