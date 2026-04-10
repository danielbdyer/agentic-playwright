# Canon and Derivation — The Persistence Doctrine

> Status: doctrine. Authoritative model for what the system reads as
> source of truth, what it produces and trusts, what it produces and
> discards, and how cold-start and warm-start operation interop over the
> same substrate. Read this before making any decision about whether a
> file belongs in git, what directory it lives in, what slot it occupies
> in the lookup chain, or how the pipeline reads/writes its state.

## Abstract

The system has **three** file populations, not two. Confusing the middle
category with either of the other two is the root cause of nearly every
recurring confusion about what to commit, what to regenerate, what
"cold-start" means, and how the discovery engine relates to the rest of
the pipeline.

The three populations are:

1. **Canonical sources** — what the operator (and the upstream world)
   tell the system. Inputs to the pipeline. Authored by humans, by
   external systems like Azure DevOps, or by the application under test
   itself. Committed and treated as ground truth.

2. **Canonical artifacts** — what the system has produced through a
   real provenance chain (an intervention receipt that passed the
   auto-approval gate, or a discovery run that passed a promotion
   gate) and is committed to using as ground truth until demoted.
   Two flavors: **deterministic observations** (produced by the
   discovery engine and promoted via a quality gate) and **agentic
   overrides** (produced by an agent forming a typed
   `InterventionReceipt` from runtime evidence and passing the
   auto-approval gate). Both are committed and both carry receipt
   lineage. A file that was hand-authored pre-gate is NOT a
   canonical artifact in this sense — see "reference canon" below.

3. **Derived output** — what the system produces ephemerally during a
   run that has not been promoted to canonical artifact status. Run
   records, fitness reports, live caches, candidate phase outputs that
   might become canonical artifacts on the next promotion cycle.
   Gitignored, regenerable, disposable.

Plus one **transitional** population that stands outside the trichotomy
during the current migration window:

- **Reference canon** — files the system reads as fallback ground
  truth during warm-start runs, but which were authored
  pre-promotion-gate (most of today's `dogfood/knowledge/`,
  `dogfood/benchmarks/`, `dogfood/controls/`). They have no
  intervention-receipt lineage and no discovery-gate provenance; they
  are the "past high water mark of learning" and they live in the
  lookup chain at their own dedicated slot (§ 6) below the two real
  canonical-artifact flavors. Reference canon is the demotion queue:
  each entry is a candidate for either (a) replacement by a fresh
  agentic override backed by a real receipt, or (b) replacement by a
  discovery-engine promotion, or (c) deletion once neither layer
  needs it. When reference canon is empty, the transitional layer is
  retired and the trichotomy stands alone.

The load-bearing claim here is that **reference canon is not a
canonical artifact**. It looks like one, it's used like one at runtime,
but it did not earn the name because no gate ever evaluated it.
Calling it a canonical artifact papers over the doctrinal debt the
system is working off; marking it as a separate transitional
population makes the debt legible and measurable.

The doctrine that follows is load-bearing for every directory layout
choice, every gitignore entry, every architecture-fitness lint, every
operator workflow, and the entire phase-output model the pipeline uses
to address derived state. The two parallel engines (the deterministic
discovery engine and the agentic intervention engine) are both governed
by this doctrine.

## Table of contents

1. The trichotomy (canonical sources, canonical artifacts, derived output)
2. Canonical sources — what the system reads
3. Canonical artifacts — what the system has earned the right to trust
   - 3.1 Deterministic observations
   - 3.2 Agentic overrides
   - 3.3 The hierarchy between the two flavors
   - 3.4 What canonical artifacts are NOT
   - **3.5 The interface model — three tiers of canonical artifact**
   - **3.6 Tier 1 — Atoms (per-primitive facts about the SUT)**
   - **3.7 Tier 2 — Compositions (higher-order patterns over atoms)**
   - **3.8 Tier 3 — Projections (constraints over the atom set)**
4. Derived output — what the system produces ephemerally
5. The phase output model
6. The lookup precedence chain
   - 6.1–6.4 Precedence justification
   - 6.5 Modes that change the precedence
   - **6.6 Qualifier-aware lookup (Tier 3 projections fold in)**
7. Promotion and demotion
8. Cold-start and warm-start interop
9. Two parallel engines
10. Directory layout convention
11. Classification table for the dogfood suite
12. Two metric trees
13. Operator workflows
14. Long-term vision
15. Glossary
16. **Existing seams in the codebase (Phase 0b implementation guide)**

---

## 1. The trichotomy (+ one transitional population)

| Population | Authorship | Trusted as ground truth? | Committed? | Wiped by `tesseract reset`? |
|---|---|---|---|---|
| **Canonical sources** | Operator, external upstream, the SUT itself | Yes — they ARE truth | Always | Never (would destroy the project) |
| **Canonical artifacts** | The system, via real promotion gate (discovery) or real intervention receipt (agent) | Yes — until demoted | Always | Only via deliberate `--demote` or `--reset-artifacts` |
| **Reference canon** *(transitional)* | Pre-gate hand/agent authoring, checked into `dogfood/knowledge`, `dogfood/benchmarks`, `dogfood/controls` | Fallback only — consulted when no canonical artifact exists at the same address | Always (during transition) | Via deliberate demotion as real canon supplants it |
| **Derived output** | The system, transient | No — they are candidates | Only when an operator deliberately checkpoints them | Yes, freely |

Canonical sources, canonical artifacts, and reference canon are all
committed. Derived output is gitignored. Reference canon is the only
committed population that the doctrine considers **second-class**:
its existence is a measurable debt against the canon store, and the
health of the migration is tracked by how fast it shrinks.

The load-bearing distinctions are:

1. **Canonical artifact vs. reference canon.** Both look the same on
   disk today — YAML files, committed, consulted at runtime. The
   difference is provenance: a canonical artifact was written by an
   intervention receipt passing the auto-approval gate, or by a
   discovery run passing a promotion gate. Reference canon was
   hand-typed or agent-typed at some earlier session with no such
   receipt. The pipeline tags resolutions by which slot they hit so
   the operator can see the split in any fitness report.

2. **Canonical artifact vs. derived output.** They are both produced
   by the system, but they have fundamentally different doctrinal
   status. A canonical artifact is what the pipeline READS at runtime;
   derived output is what the pipeline WRITES at runtime. The
   promotion mechanism (§7) is the bridge: derived output that passes
   a quality gate becomes a canonical artifact. Demotion (§7) is the
   inverse.

A common mistake is to call canonical artifacts "high-water-mark
caches" or "best-known snapshots." This is wrong. A canonical artifact
is not a cache. It is committed code-of-record that the pipeline
trusts and carries receipt lineage. The fact that it can be replaced
over time does not make it cache — it makes it versioned canon.
Caches are gitignored; canonical artifacts are not.

The other common mistake is to flatten canonical sources and canonical
artifacts into a single "canon" category. They differ in authorship
and in lifecycle. Canonical sources are AUTHORED by humans or arrive
from external systems and the system never produces them. Canonical
artifacts are PRODUCED by the system through a chain of derivations,
receipts, and promotions. Both are trusted; they have different
governance. The third mistake — the one this revision of the
doctrine exists to correct — is to treat reference canon as if it
were a canonical artifact just because it happens to live at a
canon-shaped path. It isn't. It's legacy seed data awaiting a real
provenance chain or deletion.

---

## 2. Canonical sources — what the system reads

Canonical sources are inputs to the pipeline. They are authored by
humans, by external systems, or by the application under test, and the
system treats them as ground truth without question. There are exactly
four kinds:

### 2.1 Pipeline code, doctrine, and tests

`lib/`, `scripts/`, `bin/`, `tests/`, `docs/`, and the project manifests.
The system itself. Trivially canonical sources because they ARE the
system. Authored by contributors, committed normally, governed by code
review.

### 2.2 The application under test (the SUT)

The thing being tested. In dogfood mode, the SUT is the hand-authored
HTML+JS harness at `dogfood/fixtures/demo-harness/`. In production mode,
the SUT is external (a real web application running somewhere) and the
repo only contains connection details.

The SUT is a canonical source because the system observes it, parses it,
runs scenarios against it, and treats whatever it observes as truth
about reality. The system does not produce the SUT; it discovers the
SUT.

### 2.3 The upstream test intent source

The Azure DevOps test cases the operator wants the system to automate.
In production this is the real ADO server (external) and the repo only
contains the persisted sync record at `{suiteRoot}/.ado-sync/snapshots/`.
In dogfood this is a hand-authored simulator at
`{suiteRoot}/fixtures/ado/{10001,10002,10010,10011}.json`.

The doctrinal status of this category is asymmetric between dogfood and
production:

- **In dogfood**, `fixtures/ado/{10001,10002,10010,10011}.json` is the
  canonical source (the operator wrote it as a stand-in for the
  upstream), and `.ado-sync/snapshots/` is a downstream cache of the
  simulator.
- **In production**, the real ADO server is the upstream, and
  `.ado-sync/snapshots/` is the persisted record of what the upstream
  served at the time of the most recent sync. The persisted record IS
  the canonical source as far as the rest of the pipeline is concerned,
  because the real upstream is external to the repo.

The pipeline code does not have to know which mode it is in. The
`LocalAdoSource` adapter abstracts the upstream, and the catalog walker
reads from `.ado-sync/snapshots/` regardless. The doctrinal asymmetry is
handled at the gitignore policy level, not in code.

### 2.4 Operator decisions captured in interactive sessions

This category is the structured record of decisions an operator makes
during interactive work with the system. It is reserved for inputs that
genuinely encode operator judgment and cannot be derived from any amount
of observation: which subset of test cases to run, which thresholds
constitute pass/fail, which scenarios matter for a particular release,
which drift modes the operator wants to exercise.

In the long-term vision, this category contains:

- **Project-level config** (which suite root, which ADO connection, which
  upstream credentials) — pure operator decision.
- **Threshold and gate definitions** (what counts as "good enough" for
  this project) — pure operator judgment.
- **Test-selection intent** (which ADO test cases the operator cares
  about right now, e.g., "all cases tagged 'regression'") — pure
  operator decision.
- **Demotion approvals** (the operator's decisions about which
  canonical artifacts to demote when the system proposes a demotion) —
  pure operator judgment, materialized as a small audit record.

In dogfood today, almost nothing actually lives in this category as
files. Most of what looks like "operator intent" in the current
`controls/` and `benchmarks/` directories is in fact agent-authored
content that BLENDS observable structure (canonical artifact territory)
with embedded operator judgment fragments. Those files are classified
as canonical artifacts (§3) — see §3.2 for the agentic-override
framing and the lifecycle analysis per directory.

The pure-intent fragments inside today's `controls/variance/` and
`benchmarks/` files (the "which drifts to test" choices, the
pass/fail thresholds, the flow selections) are the closest current
examples of true canonical sources at this layer. Long-term they
should be split out of the agentic-override files and given their own
structured home so the system can address them independently.

The instinct to call hand-authored YAML files "operator intent" is
strong but usually wrong. The right test is: **could a sufficiently
mature agent observing the SUT have written this file?** If yes, it
is a canonical artifact (§3) regardless of who authored it today. If
no, it is a canonical source.

---

## 3. Canonical artifacts — what the system has earned the right to trust

A canonical artifact is something the system produced *through a real
provenance chain* that has been elevated to ground-truth status
through a deliberate gate. Once a canonical artifact exists, the
pipeline READS from it at runtime and treats it as truth. Canonical
artifacts are committed to git because they have doctrinal weight:
they are not "convenience caches," they are the system's accumulated,
trusted understanding of the SUT.

"Real provenance chain" is the load-bearing phrase. There are exactly
two admissible chains:

- For **agentic overrides** (§ 3.2), the chain starts with runtime
  evidence (`InterventionEvidenceSlice`), passes through a typed
  `InterventionReceipt.handoff` carrying a `semanticCore`, and
  terminates at an auto-approval gate evaluation. The receipt
  lineage is committed alongside the artifact so later runs can ask
  "which intervention produced this override, what evidence backed
  it, and did accepting it actually move the attachment region's
  metrics?"
- For **deterministic observations** (§ 3.1), the chain starts with
  canonical sources, passes through a discovery runner
  (`DiscoveryRunOutput`), and terminates at a promotion gate
  evaluation. The gate's `PromotionEvaluation` is committed
  alongside the artifact so later runs can ask "what observation
  promoted this, what confidence interval did it pass, and has a
  later observation supplanted it?"

A file that was hand-authored (by a human or by an LLM-driven agent
session) with no such chain is **not** a canonical artifact — see
§ 3.2a for that population. This is the correction the current
revision of the doctrine exists to land: the dogfood YAMLs that look
canonical on disk today were written before either chain existed,
and treating them as canonical artifacts laundered training
scaffolding into the trusted layer.

There are two flavors of canonical artifact, with a defined hierarchy
between them. Both flavors are committed; both are addressable by the
phase output model (§5); both can be replaced or demoted via the
mechanisms in §7.

### 3.1 Deterministic observations

A deterministic observation is the canonical record of something the
**discovery engine** observed about the SUT (or about the test workload,
or about any input the engine processes deterministically). The engine
ran, produced a candidate phase output, the candidate passed a quality
gate, and the result was promoted to canonical artifact status.

Examples in the dogfood suite:

- A route map at `routes/demo` describing which URLs the demo harness
  serves and which screens they map to. The discovery engine eventually
  derives this by walking the harness; today it is hand-authored as an
  agentic override (§3.2) until discovery catches up.
- A surface declaration at `surfaces/policy-search` describing the
  widgets and labels visible on the policy search screen.
- A pattern at `patterns/policy-number-input` capturing a recurring
  alias/widget combination the system has learned to recognize.
- A snapshot at `snapshots/policy-detail-loaded` capturing a known-good
  ARIA tree the system uses to certify execution.

Deterministic observations are committed because they encode the
system's confident, reproducible understanding of the SUT. They are
replaced when the discovery engine produces a better candidate (one that
beats the current canonical artifact on the relevant quality metric).
They are not wiped by `tesseract reset --derived` because they are not
derived; they are canon.

### 3.2 Agentic overrides

An agentic override is the canonical record of a decision an agent (or
operator) made to fill a gap the discovery engine could not bridge. The
agent observed that the deterministic engine was failing or was
underconfident, authored an override, and the system uses the override
as ground truth from then on.

Examples:

- An operator-authored alias for a button the discovery engine kept
  resolving to the wrong widget.
- An agent-authored hint that "when the search results table appears,
  the first row is the canonical match" — captured because the
  deterministic engine could not infer canonicality from observation
  alone.
- A human-corrected pattern after the operator reviewed a proposal and
  said "this alias is wrong; here is the right one."

Agentic overrides are committed because they encode persistent operator
or agent decisions. They are doctrinally HIGHER than deterministic
observations: when both exist for the same phase output, the agentic
override wins, because the agent put it there explicitly to override
what the discovery engine produced.

But agentic overrides can become stale. The SUT changes; the discovery
engine matures past the gap; the operator's original assumption no
longer holds. The system periodically dry-runs the deterministic path
even when an agentic override is in place, and surfaces a **demotion
proposal** to a human when it detects that the override is no longer
truthy. The demotion mechanism is the system's pressure valve for
releasing canon back to derivable status as the discovery engine catches
up. See §7 for the full promotion/demotion semantics.

### 3.2a Reference canon (transitional)

A **reference canon** entry is a committed file at a canon-shaped path
that was authored before the promotion-gate and intervention-receipt
infrastructure existed, or was authored after them but through a
direct hand-edit that bypassed the gates. Today's
`dogfood/knowledge/screens/*.elements.yaml`,
`dogfood/knowledge/screens/*.hints.yaml`,
`dogfood/knowledge/patterns/*.yaml`,
`dogfood/knowledge/routes/*.routes.yaml`,
`dogfood/knowledge/snapshots/**`,
`dogfood/controls/**`, and `dogfood/benchmarks/**` are all reference
canon. They were written over many prior sessions by agents or
operators getting the dogfood pipeline unstuck. None of them carries
a receipt; none of them passed a gate.

Reference canon is consulted at runtime because the warm-start path
needs *something* to return for addresses the two real canonical
artifact flavors do not yet cover. But the consultation is clearly
labeled: every lookup chain result includes the source slot
(§ 6), and a warm run's scorecard can report what fraction of hits
came from reference canon vs. real canon. That fraction is a direct
measurement of the migration debt.

Reference canon has three defined exits:

1. **Supersession by an agentic override.** During a live run, the
   agent observes evidence that the reference-canon entry is wrong
   or sub-optimal, forms a typed `InterventionReceipt`, passes the
   auto-approval gate, and writes an agentic override at the same
   address. The override now outranks the reference canon in the
   lookup chain; the reference canon entry is a demotion candidate.
2. **Supersession by a deterministic observation.** During a cold
   run (or a compare run), the discovery engine produces an output
   that passes the promotion gate and becomes a deterministic
   observation at the same address. The observation outranks
   reference canon; the reference canon entry is a demotion
   candidate.
3. **Direct demotion when no longer needed.** If both of the above
   happen, or if the reference canon entry refers to an atom the
   system no longer needs, the operator (or an automatic sweep)
   deletes it.

When `{suiteRoot}` has zero reference canon entries, the
transitional layer is retired. That is also the condition under
which the `dogfood/` folder can be deleted in good conscience —
see § 14 for the endgame.

**Reference canon is not a subtype of canonical artifact.** The
doctrine deliberately stops short of calling it one. The atom
envelope's `source` field (§ 3.6) has a distinct
`'reference-canon'` variant precisely so that promotion gates, C6
measurements, and cold-start-fidelity comparisons can exclude
reference-canon-sourced entries from their denominators. A C6 that
counted reference canon as "accepted agentic augmentations" would
measure the wrong thing; it would inflate the numerator with
historical authoring decisions that never flowed through a receipt.

**The dogfood YAMLs do not decompose into canonical artifacts via a
migration script.** The prior doctrine prescribed a
`scripts/decompose-canon.ts` one-shot migration that would split
hybrid compounds into per-atom files under
`.canonical-artifacts/`. That framing was wrong: it conflated "on
disk in per-atom shape" with "earned through a gate." The current
doctrine: the dogfood YAMLs stay exactly where they are, marked as
reference canon, and the `.canonical-artifacts/` tree starts
**greenfield** — populated only by real promotions through real
gates. Migration happens *one atom at a time*, through the live
loop, as agents and the discovery engine earn each address back.

### 3.3 The hierarchy between the two flavors

When the pipeline needs phase output X and both an agentic override and
a deterministic observation exist for X, the agentic override wins.
This is because:

- The agentic override is, by definition, an explicit decision by an
  agent or operator that the deterministic answer was insufficient.
- Until that decision is reversed via the demotion mechanism, the
  override stands.
- The deterministic observation continues to be tracked as a
  comparison target — if it eventually agrees with the override, the
  override can be demoted; if it eventually beats the override on
  quality metrics, the demotion is proposed automatically.

This hierarchy is not a precedence list of "better vs worse." It is a
governance statement: agentic overrides are *deliberate* decisions that
require *deliberate* removal. Deterministic observations are
*automatic* derivations that are continuously validated.

### 3.4 What canonical artifacts are NOT

Canonical artifacts are NOT:

- **Caches.** Caches are gitignored, evicted by staleness, and
  populated unconditionally. Canonical artifacts are committed,
  promoted via quality gate, and demoted via deliberate gesture.
- **Snapshots of the most recent run.** A canonical artifact is the
  best output the system has ever produced (or the override an agent
  decided was correct), not the most recent. The most recent run's
  output is derived (§4) and only becomes a canonical artifact via
  promotion.
- **High-water-marks in the casual sense of "best so far."** The term
  "high-water-mark" trivializes the doctrinal status of canonical
  artifacts. They are not just convenient defaults; they are what the
  pipeline trusts at runtime. Use the precise term.
- **Inputs to the pipeline.** Canonical artifacts are produced BY the
  pipeline (or by an agent acting in service of it). Inputs are
  canonical SOURCES (§2). The two should not be confused.

Canonical artifacts ARE:

- **Trusted at runtime.** The pipeline reads them and uses them as
  ground truth.
- **Committed.** They live in git and travel across machines and
  branches.
- **Versioned implicitly via promotion.** When a new candidate beats
  an existing canonical artifact, the new candidate replaces the old
  one and the change shows up in the diff.
- **Demotable.** When a canonical artifact is no longer truthy, a
  deliberate gesture removes it.

### 3.5 The interface model — three tiers of canonical artifact

Canonical artifacts are not a flat collection of files. They form a
**three-tier interface model** that mirrors the structure of the SUT
itself: atoms describe what the SUT IS, compositions describe how the
SUT is DRIVEN, and projections describe the CONSTRAINTS over who can
see and interact with which parts of it.

All three tiers live in the same canonical artifact store
(`{suiteRoot}/.canonical-artifacts/`), all three flow through the
same lookup precedence chain (§6), and all three participate in the
same promotion/demotion machinery (§7). The distinction is in their
shape and their addressing, not in their governance:

| Tier | Mirrors | Granularity | Addressing | Authorship |
|---|---|---|---|---|
| 1. Atoms | What the SUT *is* | Per-primitive fact | Keyed by SUT-primitive identity | Discovery engine, agents, operators |
| 2. Compositions | How the SUT is *driven* | Per-recipe / per-pattern | Keyed by composition identity, references atoms | Mostly agents and operators, sometimes deterministic discovery |
| 3. Projections | Who can see and interact with *what* | Per-constraint over an atom subset | Keyed by qualifier identity, filters atoms | Mostly agents (observed by running as a role / in a state), occasionally operators |

The three tiers together are the system's **digital twin** of the
SUT. The discovery engine builds Tier 1 by walking the application;
agents fill Tier 2 with patterns and recipes when the deterministic
path can't bridge the gap; agents fill Tier 3 by observing the SUT
from different vantage points (different roles, different wizard
stages, different permission contexts). Operators occasionally
override any tier when they have a hard requirement that must hold.

The umbrella name follows existing domain vocabulary: **interface
model**, the same name used by `ApplicationInterfaceGraph` in
`lib/domain/types/interface.ts` and the "Interface Intelligence"
spine in `docs/domain-ontology.md`. The doctrinal term is
"interface model" to keep continuity with the existing domain
documentation.

When an informal synonym is useful, prefer **digital evidentiary
interface model**: every tier of the model is populated by evidence
— atoms are observations or agent-authored bridges over observation
gaps, compositions reference atoms by identity, projections are
constraints derived from observed behavior under different
contexts. The informal phrase "digital twin" is acceptable but
understates the evidentiary nature: a twin is a mirror, and the
interface model is not a mirror — it is a typed, promoted,
demotable, provenance-carrying belief structure about the SUT that
happens to be addressable by primitive identity.

The distinction matters operationally: when an atom is wrong, the
remediation is to demote it and rebuild it from fresh evidence, not
to "sync" it against a source of truth that the system doesn't have.
The SUT is the only source of truth; the interface model is the
system's best evidence-backed understanding of what the SUT is.

#### Why three tiers, not two

A two-tier model (atoms + compositions) misses a real category of
canonical knowledge. Consider:

- "The submit button on the review-submit screen exists" — that's
  an atom (Tier 1).
- "To complete the policy creation flow, navigate through these
  six screens in this order" — that's a composition (Tier 2).
- "An underwriter sees the submit button; a broker does not" —
  that's neither. It's a constraint over which atoms are visible
  to which roles. It's a projection (Tier 3).

Projections are the third axis of the SUT's identity. Without them,
the system has no way to encode role-based visibility, wizard-state
visibility, posture availability conditions, or permission-group
rules. These are first-class features of any non-trivial application,
and they need first-class canonical artifact treatment.

#### Why three tiers, not more

The temptation is to add a fourth tier for "domain semantics" (the
business meaning of policies, accounts, claims), a fifth tier for
"temporal dynamics" (drift, churn), a sixth for "operator rituals"
(testing conventions, review checklists). Resist this. Domain
semantics are encoded as compositions (named flows) and projections
(role visibility) and atoms (entity-state facts). Temporal dynamics
are encoded as drift atoms and as the demotion mechanism. Operator
rituals are canonical sources (§2), not canonical artifacts.

The three-tier shape is the minimum that captures the SUT's
structural, behavioral, and contextual identity without sliding into
proliferation. Adding tiers later is allowed if a real fourth
category emerges that none of the three can hold; until then, three
is the answer.

#### Connection to the existing domain model

The three-tier interface model is not a new invention. It crystallizes
what the existing domain documentation already prefigures:

- **`docs/domain-model.md` § Target**: "The semantic identity of a
  thing in reality, prior to any means of finding it... This is the
  atom of the interface model. Screens, surfaces, and elements are
  organizational containers for targets... The interface graph is a
  graph *of* targets." — This is Tier 1, named.
- **`docs/domain-ontology.md` § Interface Intelligence**: "models
  what the UI *is*: routes, screens, surfaces, targets, selectors,
  states, transitions, affordances. Its aggregate is
  `ApplicationInterfaceGraph`." — This is the umbrella for Tier 1
  with hooks for Tier 2 (transitions) and Tier 3 (states).
- **`docs/domain-class-decomposition.md` § Target**: enumerates
  `CanonicalTargetRef`, `ElementSig`, `ScreenElements`,
  `SurfaceDefinition`, `SelectorProbe`, `RouteDefinition`,
  `RouteVariant`, `TransitionObservation`, `ElementAffordance`, etc.
  — These are the existing types that materialize Tier 1 atoms.

The doctrine here is the persistence and addressing model on top of
the existing domain types. The domain types describe the shapes;
this doctrine describes how to store them, look them up, promote
them, demote them, and reason about which tier each one belongs to.

#### Targets and Surfaces sit OUTSIDE the epistemological loop

A critical insight from `docs/domain-model.md` § The Epistemological
Loop:

> "**Target** and **Surface** sit outside the loop — they are the
> stable referents that the loop operates on. Targets are what the
> loop is *about*. Surfaces are *how* the loop perceives reality.
> Neither is consumed or produced by the loop; they are the ground
> it stands on."

The interface model (all three tiers) is the persistent realization
of these stable referents. The epistemological loop (Intent →
Resolution → Commitment → Evidence → Knowledge → ...) operates ON
the interface model but does not consume or produce it directly.
Iterate runs READ the interface model to resolve and execute steps;
the only way the interface model changes is via promotion (a
candidate from a derived output beats an existing canonical
artifact) or via deliberate operator gesture.

This is why the canonical artifact store is committed and the
derived output is gitignored: the stable referents must persist
across runs because they are the ground the loop stands on. Wiping
the canonical artifact store is the system equivalent of forgetting
what the SUT is — the loop becomes meaningless until the discovery
engine rebuilds the referents.

### 3.6 Tier 1 — Atoms (per-primitive facts about the SUT)

The atom tier is the structural backbone of the interface model.
Each atom describes ONE fact about ONE SUT primitive, addressed by
its semantic identity. Atoms are the unit of promotion, demotion,
and discovery: the deterministic discovery engine targets one atom
class at a time, agents fill gaps for atoms the engine cannot yet
produce, and operators occasionally override individual atoms.

The atomic principle: **every fact about the SUT's structure that
the pipeline relies on at runtime should be addressable as an
atom.** Compound files that bundle facts (today's `benchmarks/`,
`controls/datasets/`, etc.) are doctrinally wrong shapes — they
prevent per-fact promotion/demotion and they couple unrelated
lifecycles into a single change boundary. Compound files survive
during the migration but their long-term form is decomposed into
atoms.

#### Atom classes and their identities

Each atom class corresponds to a SUT primitive. The identity tuple
encodes everything needed to address the atom uniquely. New atom
classes are added when the discovery engine learns to derive a new
kind of fact; the doctrine should accommodate growth without
restructuring.

| Atom class | Identity tuple | What it describes | Existing domain type |
|---|---|---|---|
| Route | `RouteId` | A URL pattern that maps to a screen | `RouteDefinition`, `RouteVariant` |
| Route variant | `(RouteId, VariantId)` | A specific parameterization of a route | `RouteVariant`, `RoutePattern` |
| Screen | `ScreenId` | A distinct interactive context with a known root | `ScreenElements` (key) |
| Surface | `(ScreenId, SurfaceId)` | A spatial region within a screen | `SurfaceDefinition`, `SurfaceSection` |
| Element | `(ScreenId, ElementId)` | A discrete interactive widget | `ElementSig`, `ScreenElements` (entries) |
| Posture | `(ScreenId, ElementId, PostureName)` | A behavioral disposition (valid, invalid, empty, boundary) | `Posture` |
| Affordance | `(ScreenId, ElementId, AffordanceKind)` | What the element offers (clickable, typeable, etc.) | `ElementAffordance` |
| Selector | `(TargetRef, SelectorRung)` | A concrete locator candidate | `SelectorProbe`, `SelectorCanonEntry` |
| Pattern | `PatternId` | A promoted cross-screen abstraction | Pattern documents in `knowledge/patterns/` |
| Snapshot | `SnapshotTemplateId` | An ARIA tree template | `SnapshotTemplate` |
| Drift mode | `(ScreenId, ElementId, DriftKind)` | A way the element can change between runs | embedded in benchmark `driftEvents` today |
| Resolution override | `(ScreenId, IntentFingerprint)` | An operator/agent decision for an ambiguous resolution | `controls/resolution/` files today |
| Transition | `(FromScreenId, ToScreenId, TriggerRef)` + optional `reverseOf` linkage + optional `precondition: ObservationPredicateRef` | A known state transition between screens, possibly bidirectional under a condition | `TransitionObservation` |
| Observation predicate | `(ScreenId, PredicateId)` | A condition the SUT can be checked against | `ObservationPredicate` |
| Posture sample | `(ScreenId, ElementId, PostureName)` | Default values for the (element, posture) combination | embedded in `controls/datasets/` today |
| Runtime family | `RuntimeFamilyId` | The runtime substrate a target SUT is built on (e.g. `outsystems-reactive-11`), carrying a signature bundle used by per-family discovery specializers | new — Phase E of `docs/cold-start-convergence-plan.md` |

This list is not closed. Each new SUT primitive that the discovery
engine learns to address adds a new atom class with its own identity
tuple. The lookup chain machinery treats them uniformly: every atom
has a stage (`Atom<ClassName>`), an identity, and an envelope.

#### Bidirectional transitions and reverse-of linkage

Real SUTs — especially enterprise wizard workflows — contain
transitions whose inverse is *also* a valid transition under a
different condition. An "approve" transition sends a policy from
`pending-review` to `approved`; a "reject" transition sends it back
from `pending-review` to `draft`; a "recall" transition sends it
from `approved` back to `pending-review`. The simplest model — a
directed edge per trigger — silently loses the semantic link
between the forward and reverse flows.

The Transition atom's `reverseOf` field is optional and, when
populated, carries the identity tuple of the reverse transition.
The runtime's state-transition planner uses `reverseOf` to compute
rollback paths for recovery and to recognize that a failed forward
attempt followed by a successful reverse is an observation of
*both* transitions, not one.

The `precondition` field references an `observation-predicate` atom
by address. The transition is only valid when the predicate holds.
A reject transition may have a precondition like "the reviewer has
recorded a rejection reason." The planner consults the predicate
before attempting the transition.

Both fields are optional. Pre-existing transitions without these
fields continue to work. Discovery engines that learn about
bidirectional flows populate them during promotion; agents can
author them explicitly via agentic override.

#### Runtime-family atoms

A `runtime-family` atom asserts that a specific runtime substrate
(OutSystems Reactive 11, a particular React design system, a
Servlet-based JSF stack, etc.) is the host for a set of screens or
surfaces. The identity is a `RuntimeFamilyId` brand; the content is
a typed **signature bundle** listing the DOM signals, class
prefixes, script globals, ARIA landmark patterns, and widget idiom
names that identify the family.

Runtime-family atoms are addressable through the same machinery as
every other atom class: they are loaded by the workspace catalog,
resolved through the lookup chain, gated by promotion policies, and
demotable when the family evolves (e.g. a platform version upgrade
changes the signature). They are agent-authored initially as
agentic overrides because no deterministic detector exists; the
detector runs as a discovery runner adapter at
`lib/application/discovery/runtime-family-detector.ts` (Phase E of
`docs/cold-start-convergence-plan.md`) and promotes deterministic
observations once the signature bundle passes a minimum
observation-count threshold.

The doctrinal point: family identity is *canon, not code*. No
particulars of OutSystems (or any other runtime) should appear in
`lib/application/` or `lib/runtime/` outside a per-family
specializer adapter keyed by the atom's identity. New family
coverage is added by promoting new atoms and registering a new
specializer, not by editing existing source.

#### Atom envelope shape

Every atom is wrapped in an envelope that carries the same metadata
the rest of the system uses for canonical artifacts:

```
Atom<TClass> {
  class: AtomClass;            // which atom class
  identity: AtomIdentity<TClass>;  // typed tuple per class
  content: AtomContent<TClass>;    // the actual fact
  source: PhaseOutputSource;       // operator-override | agentic-override |
                                   // deterministic-observation | reference-canon |
                                   // live-derivation | cold-derivation
  inputFingerprint: string;        // hash of inputs that produced this atom
  producedAt: string;              // ISO timestamp
  producedBy: string;              // engine + version that wrote it
  qualityScore?: number;           // optional, for promotion gating
  receiptRef?: InterventionReceiptRef;   // required when source = 'agentic-override'
  promotionEvalRef?: PromotionEvalRef;   // required when source = 'deterministic-observation'
}
```

The `receiptRef` and `promotionEvalRef` fields are the structural
enforcement of "real provenance chain" from § 3. An atom with
`source = 'agentic-override'` that has no `receiptRef` is a bug;
an atom with `source = 'deterministic-observation'` that has no
`promotionEvalRef` is a bug. An atom with
`source = 'reference-canon'` has neither — its provenance is "git
history, pre-gate" — and that is *how the doctrine distinguishes
it*.

The `class` and `identity` together form the atom's address. The
lookup chain reads atoms by address; the promotion/demotion
machinery operates on atoms one address at a time.

#### Atom lifecycle (per-class)

The lifecycle vocabulary is borrowed from
`docs/domain-model.md` § Lifecycle:

> Discovery lifecycle: crawled → observed → proposed → reviewed → canonical

Mapped onto the lookup chain:

| Stage | Where the atom lives | Promotion gate |
|---|---|---|
| **crawled** | nowhere yet (raw observation in run records) | n/a — not yet a candidate |
| **observed** | `.tesseract/cache/atoms/{class}/{identity}.yaml` | live cache, slot 4 |
| **proposed** | `.tesseract/cache/atoms/{class}/{identity}.yaml` + a proposal record | promotion candidate |
| **reviewed** | promoted to slot 3 (deterministic observation) or slot 2 (agentic override) | passed quality gate |
| **canonical** | committed at `.canonical-artifacts/{agentic|deterministic}/atoms/{class}/{identity}.yaml` | trusted at runtime |

The discovery engine for class C produces atoms in stage **observed**
on every run. The promotion machinery evaluates them against the
existing canonical artifact for the same address (if any) and either
promotes or discards. Atoms in stage **canonical** stay until a
better atom replaces them or the operator demotes them.

#### Per-atom-class lifecycle nuances

Different atom classes have different cadences and different
promotion criteria:

- **Routes**: rarely change. Promoted from a single confident
  observation; demoted only when the URL pattern stops matching
  the SUT.
- **Elements**: change with UI redesigns. Promoted from
  observations that meet a confidence threshold; demoted when the
  element no longer renders.
- **Postures**: change with validation rule updates. Promoted from
  successful posture exercises; demoted when the posture stops
  being applicable.
- **Patterns**: promoted only after recurrence across multiple
  screens (the supplement hierarchy from
  `docs/domain-ontology.md` § Supplement hierarchy). Demoted when
  the underlying pattern stops recurring.
- **Snapshots**: promoted when an ARIA tree is captured under a
  known-good condition. Demoted when the structure changes.
- **Drift modes**: promoted when an agent observes the SUT
  exhibiting a particular drift. Demoted when the drift no longer
  occurs.
- **Resolution overrides**: promoted when an agent or operator
  resolves an ambiguity. Demoted when the deterministic resolver
  becomes confident enough to handle the case unaided. This is
  the highest-cadence demotion target — the resolver improves
  often.

The doctrine does not enumerate every atom class's promotion
criteria here; that lives in per-class promotion gate definitions
in `lib/domain/pipeline/promotion-gates/{class}.ts`.

### 3.7 Tier 2 — Compositions (higher-order patterns over atoms)

The composition tier holds canonical artifacts that REFERENCE atoms
by identity and encode operator/agent intent about HOW atoms compose
into useful sequences, recipes, archetypes, or graphs. Compositions
are NOT atoms — they live at a different granularity and have a
different shape — but they are committed canonical artifacts under
the same governance (lookup chain, promotion, demotion).

The composition tier is what saves the doctrine from atomic
fundamentalism. Decomposing everything to atoms loses the patterns
operators and agents have learned about HOW the SUT is supposed to
be driven. Runbooks, flows, archetypes, and route graphs all encode
genuine higher-order knowledge that cannot be reconstructed from
atoms alone.

#### Composition sub-types

The composition tier has multiple sub-types, each with a distinct
shape and addressing scheme. Sub-types are added when a new kind of
higher-order pattern emerges; the doctrine should accommodate
growth.

| Sub-type | Identity | What it describes | Existing domain type |
|---|---|---|---|
| Workflow archetype | `ArchetypeId` | Abstract pattern of SUT interaction (search-verify, detail-inspect, form-submit, cross-screen-journey, read-only-audit) | `WorkflowArchetype` in `lib/domain/synthesis/workflow-archetype.ts` |
| Flow | `FlowId` | Concrete ordered sequence of screens/fields constituting a journey | embedded in benchmark `flows` today |
| Runbook | `RunbookId` | Operator/agent-authored execution recipe with branching logic | `controls/runbooks/*.runbook.yaml` |
| Route graph | `RouteGraphId` | Connected graph of routes describing navigation topology | embedded in `knowledge/routes/*.routes.yaml` |
| Expansion rule | `ExpansionRulesId` | Rule for deriving variant atoms from a primitive set | embedded in benchmark `expansionRules` |
| Surface composition | `(ScreenId, CompositionId)` | Multi-region surface descriptions that span surfaces | partially in `knowledge/surfaces/*.surface.yaml` |
| Recipe template | `RecipeTemplateId` | Parameterized runbook fragment for reuse | not yet in dogfood; future |

#### Composition envelope shape

```
Composition<TSubtype> {
  subtype: CompositionSubtype;
  identity: CompositionIdentity<TSubtype>;
  content: CompositionContent<TSubtype>;
  atomReferences: AtomReference[];     // typed references to Tier 1 atoms
  source: PhaseOutputSource;
  inputFingerprint: string;
  producedAt: string;
  producedBy: string;
}
```

The `atomReferences` field is the critical link: every composition
declares which atoms it depends on, and that dependency is part of
the composition's identity. When an atom changes (gets promoted to
a new version), every composition that references it is candidates
for re-evaluation. The relationship lets the system reason about
"if I demote this atom, which compositions break?"

#### Composition lifecycle

Compositions follow the same crawled → observed → proposed →
reviewed → canonical lifecycle as atoms, but with different
discovery patterns:

- **Workflow archetypes** are typically discovered statically by
  analyzing the existing scenario corpus. The discovery engine
  walks scenarios, recognizes recurring patterns, and proposes
  archetype candidates. Promoted when a pattern recurs across
  multiple scenarios.
- **Flows** are typically authored by agents observing the SUT.
  An agent walks a journey, captures the screen sequence, and
  proposes a flow. Promoted when the flow proves stable across
  multiple runs.
- **Runbooks** are typically authored by agents (or operators)
  when they figure out a non-trivial recipe. Promoted on
  authorship; demoted when the underlying flow changes such that
  the recipe steps stop applying.
- **Route graphs** are partly discoverable (by walking links from
  known routes) and partly agent-authored (when navigation paths
  involve non-link actions). Promoted from observation; demoted
  on URL pattern changes.
- **Expansion rules** are typically operator-authored, embedded in
  benchmark intent. They survive in compound files until splitting.
- **Surface compositions** are typically discoverable by analyzing
  multi-surface relationships. Promoted from observation.

#### Compositions reference atoms; atoms do not reference compositions

The dependency direction is one-way. A composition's `atomReferences`
field points DOWN the tier hierarchy. Atoms do not know which
compositions reference them — that's a derived view computed by the
catalog. This keeps atoms decoupled and reusable across many
compositions.

When the catalog loads canonical artifacts, it builds a reverse
index from atom identity to the compositions that reference each
atom. This reverse index is a derived projection (not committed,
recomputed on catalog load) that supports queries like "what
compositions depend on this element atom?"

### 3.8 Tier 3 — Projections (constraints over the atom set)

The projection tier holds canonical artifacts that ENCODE
CONSTRAINTS over the atom set: which atoms are visible to which
roles, which atoms are accessible in which wizard states, which
postures are exercisable under which conditions, which permission
groups can interact with which surfaces. Projections do NOT add new
atoms — they tag and filter existing atoms.

The projection tier is what makes the interface model work for
non-trivial applications. A real SUT has roles, permissions, wizard
flows, conditional features, and stateful UI elements that change
visibility based on context. Without projections, the system has no
way to answer questions like "what does an underwriter see on the
review-submit screen?" or "when this multi-step wizard is in the
'pending approval' state, which atoms are interactive?"

#### Projection sub-types

Each projection sub-type captures a different kind of constraint
over the atom set. Sub-types are added when a new contextual axis
emerges; the doctrine should accommodate growth.

| Sub-type | Identity | What it constrains | When it applies |
|---|---|---|---|
| Role visibility | `RoleId` | Which atoms are visible to a role | Per-role view of the SUT |
| Role interaction | `RoleId` | Which atoms a role can interact with (vs read-only) | Per-role interaction permissions |
| Wizard state | `(WizardId, StateId)` | Which atoms are visible/interactive in a wizard state | During multi-stage flow execution |
| Permission group | `PermissionGroupId` | A composite role definition (union/intersection of roles) | Cross-role visibility composition |
| Posture availability | `(ScreenId, ElementId, PostureName)` | Conditions under which a posture is exercisable | Posture-aware test generation |
| Process state | `(EntityKind, StateId)` | Which atoms are visible when a business entity is in a particular state | Domain-aware test selection |
| Feature flag | `FeatureFlagId` | Which atoms are gated behind a feature flag | A/B testing, gradual rollouts |

#### Projection envelope shape

```
Projection<TSubtype> {
  subtype: ProjectionSubtype;
  identity: ProjectionIdentity<TSubtype>;
  bindings: AtomBinding[];             // typed (atom, applicability) pairs
  source: PhaseOutputSource;
  inputFingerprint: string;
  producedAt: string;
  producedBy: string;
}
```

Where each `AtomBinding` has the shape:

```
AtomBinding {
  atomClass: AtomClass;
  atomIdentity: AtomIdentity<AtomClass>;
  applicability: 'visible' | 'interactive' | 'read-only' | 'hidden' | 'gated';
  conditions?: BindingCondition[];     // optional further refinement
}
```

A projection is essentially a typed list of "for atom X, applicability
is Y." When the lookup chain is queried with a role qualifier (or
wizard state, or feature flag), it consults the projection layer to
filter the atom set before returning.

#### Projection lifecycle

Projections follow the same lifecycle stages as atoms and
compositions, but with discovery patterns specific to context-aware
observation:

- **Role visibility** is discovered by running the SUT as a
  particular role and walking the same screens. The agent compares
  what's visible vs what's visible to other roles, infers the
  visibility binding, and proposes a projection. Promoted when the
  binding is observed consistently across multiple runs.
- **Role interaction** is discovered similarly but additionally
  attempts interaction (typing, clicking, submitting) and observes
  whether the action is permitted.
- **Wizard state** is discovered by walking a multi-stage flow,
  capturing the visible atoms at each state, and proposing per-state
  projections. Promoted when the state structure stabilizes.
- **Posture availability** is discovered by attempting posture
  exercises and observing which combinations succeed. Promoted from
  successful exercises.
- **Process state** is harder — it requires the agent to know what
  business state the SUT is in, which is partly observable (via UI
  cues) and partly inferred. Often agent-authored or operator-authored
  rather than deterministically discoverable.
- **Feature flags** are typically operator-authored (the operator
  declares which flags exist) but the BINDINGS to specific atoms
  can be discovered by running with each flag setting.

#### Worked example — OutSystems Reactive 11 wizard workflow

An enterprise OutSystems Reactive 11 application with role-based
field-level authorization is the canonical worked example. Consider
a policy amendment wizard with four roles (`broker`, `underwriter`,
`reviewer`, `auditor`), three wizard steps
(`enter-amendment`, `review-premium`, `submit-for-approval`), and a
process-state machine (`draft → pending-review → approved | rejected`)
with bidirectional `approve` and `reject` transitions. The interface
model for this application, expressed as projections, looks like
this:

- **Role visibility**: a `role-visibility` projection keyed by
  `broker` binds the `premium-override` element atom on the
  `review-premium` screen with applicability `hidden`. The same
  projection binds the `amendment-reason` element on the
  `enter-amendment` screen with applicability `interactive`. The
  `auditor` role's `role-visibility` projection binds every
  element on every screen with applicability `read-only` —
  auditors see everything, change nothing.
- **Wizard state**: a `wizard-state` projection keyed by
  `(amendment-wizard, review-premium)` binds the
  `edit-amendment` button atom on the `enter-amendment` screen
  with applicability `gated` — the button still exists but is
  disabled because the wizard has advanced past its step.
- **Process state**: a `process-state` projection keyed by
  `(policy-entity, pending-review)` binds the `premium` field with
  applicability `read-only` for the `broker` role and
  `interactive` for the `underwriter` role. When both a role
  projection and a process-state projection apply to the same
  atom, the lookup chain composes them via
  `intersectApplicability` (Monoid meet) — `read-only ∧ interactive
  → read-only`, so the broker cannot edit the premium while the
  policy is pending review.
- **Bidirectional transitions**: the `approve` and `reject`
  transition atoms both point between `pending-review` and either
  `approved` or `draft`. The Transition atom's `reverseOf` field
  links them so the runtime's planner understands that a reject is
  the reverse of a prior submit. The precondition on `reject` is
  an observation predicate "the reviewer has recorded a rejection
  reason."

An agent generating a test case for "the broker attempts to
override the premium on a pending-review policy and verifies the
system rejects the action" now has a deterministic path from
scenario intent to resolved atoms: the resolver calls the lookup
chain with `QualifierBag({ role: 'broker', processState: (policy, pending-review) })`,
the projections compose to mark the `premium` field `read-only`,
and the generated test asserts that attempting to type into it is
blocked. No live DOM consultation is needed beyond the initial
discovery pass — the interface model carries the authorization
knowledge as canon.

Without the projection tier, this test cannot be generated
deterministically. The resolver would either find the `premium`
element and treat it as interactive (producing a test that fails
in practice) or would fall through to `needs-human` (blocking the
generation pipeline on human intervention). Projections are what
make role-aware enterprise applications first-class targets rather
than second-class exceptions.

#### Projection lookup semantics

Projections change how the lookup chain answers queries. When the
caller asks "give me element atom (policy-search, submitButton)",
the chain returns the atom directly. But when the caller asks "give
me element atom (policy-search, submitButton) AS SEEN BY role
underwriter", the chain:

1. Looks up the atom (Tier 1) via the normal precedence chain.
2. Looks up the role-visibility projection for `underwriter`
   (Tier 3).
3. Filters the atom through the projection's applicability
   binding.
4. Returns the atom annotated with applicability, OR returns null
   if the projection says the atom is hidden for that role.

The same pattern applies to wizard state, feature flag, and
process state qualifiers. The lookup chain takes a list of
"qualifiers" alongside the atom address and applies all relevant
projections before returning.

#### Why projections are not deferrable

Projections cannot be retrofitted later without restructuring the
lookup chain interface. Every consumer of the lookup chain has to
pass qualifiers; every promotion gate has to know about projection
filters; every cache layer has to be aware that the same atom can
have different "visible state" depending on context. Adding the
projection slot AFTER atoms and compositions are wired through the
codebase would require touching every callsite.

The doctrine accommodates projections from day one. The Phase 0b
implementation includes the projection slot in the lookup chain
typed interface (even if the initial discovery engines for
projections are stubs). Projection-aware queries are part of the
typed surface from the start. When real role-modeling discovery is
built later, it slots into an existing seam rather than requiring
a refactor.

---

## 4. Derived output — what the system produces ephemerally

Derived output is everything the pipeline produces that has not been
promoted to canonical artifact status. It is the output of running the
pipeline once, against the current canonical sources and canonical
artifacts. It exists on disk while a run is in progress (and after, if
the operator wants to inspect it), but it is gitignored and may be
wiped at any time without consequence.

Derived output includes:

- **Run records** at `.tesseract/runs/`. Per-step traces of what
  happened during a single iterate run.
- **Sessions** at `.tesseract/sessions/`. Per-session execution
  traces.
- **Bound artifacts** at `.tesseract/bound/`. Compiled scenarios ready
  to run.
- **Fitness reports** at `.tesseract/benchmarks/runs/{ts}.fitness.json`.
  Per-run efficacy snapshots.
- **L4 baselines** at `.tesseract/baselines/{label}.baseline.json`.
  Per-developer-per-commit gradient baselines.
- **Live phase output cache** at `.tesseract/cache/{phase}/{name}`.
  The most recent output of each phase, ready to be promoted to a
  canonical artifact if it beats the existing one.
- **Generated specs** at `{suiteRoot}/generated/`. Playwright spec
  emission output, regenerated from canonical sources and canonical
  artifacts on every run.
- **Substrate scratch** at `.tesseract/scratch/substrate/`. The
  substrate state during an in-progress iterate run, before its
  contents are evaluated for promotion.

Derived output is the candidate pool for promotion. After every run,
the system has the option to promote candidates to canonical artifact
status (§7). What does not get promoted stays as derived and is
eventually wiped.

The mental model: **derived output is the flow; canonical artifacts
are the river bed.** The flow is constantly changing; the river bed
changes only when sediment accumulates enough to alter the channel.

### 4.1 Why derived output exists at all if it's not committed

Derived output exists because:

1. **The pipeline needs working memory.** It cannot derive everything
   in-process every time it needs it; it has to write intermediate
   state to disk and read it back.
2. **Operators need to inspect intermediate state.** When debugging a
   failure, the operator wants to see what the bound artifacts looked
   like, what the run records say, what the fitness report contained.
3. **The promotion mechanism needs candidates.** A derived output is
   exactly the candidate that gets evaluated for promotion to canonical
   artifact status. Without the derived layer, there is nothing to
   promote.
4. **Cold-start needs scratch space.** When the operator runs cold,
   the discovery engine writes its outputs to derived locations and
   the system compares them against the existing canonical artifacts
   for promotion or regression detection.

### 4.2 When derived output should be checkpointed

There are two legitimate reasons to checkpoint derived output into a
committed location:

- **Integration test fixtures.** When a derived output is being used
  as the input to a test, the test needs the fixture to be stable
  across machines and over time. The operator runs
  `tesseract checkpoint --label foo --include scenarios,fitness` and
  the named subset is copied to `tests/fixtures/checkpoints/foo/`,
  where it lives as committed test data (NOT as canonical artifacts —
  it's test data, a separate concern).
- **Promotion to canonical artifact.** When a derived phase output
  beats the current canonical artifact for that phase output, the
  promotion mechanism (§7) moves it from `.tesseract/cache/` to the
  canonical artifact store and commits it.

These are the only two legitimate paths from derived to committed.
Operators MUST NOT manually copy files from `.tesseract/` into
`{suiteRoot}/` to "preserve" them. If something needs to be
preserved, it should be promoted (canonical artifact) or checkpointed
(test fixture). The committed locations have specific governance and
lookup semantics; ad-hoc copies break those.

---

## 5. The phase output model

The pipeline is a sequence of phases. Each phase consumes the output of
prior phases (and canonical sources, and canonical artifacts) and
produces typed output of its own. Phase outputs are first-class
addressable artifacts: each one has a phase identifier, a name, a
typed content, a source-of-record (which slot of the lookup chain it
came from), and an input fingerprint.

### 5.1 The phases

| Phase | Consumes | Produces |
|---|---|---|
| **sync** | external upstream (real ADO or `fixtures/ado/`) | `.ado-sync/snapshots/` + manifest |
| **parse** | `.ado-sync/snapshots/` | scenarios |
| **discovery** | scenarios + SUT | route, surface, component, posture sub-phase outputs |
| **bind** | scenarios + discovery outputs + canonical sources (controls) | bound artifacts |
| **iterate** | bound artifacts + substrate (canonical artifacts) | run records, proposals, candidate substrate updates |
| **fitness** | run records + ledger | fitness reports |
| **score** | fitness reports + L4 baselines | metric trees + deltas |
| **emit** | bound artifacts | playwright spec files |

The discovery phase is composed of sub-phases that mirror the
canonical artifact taxonomy: route discovery, surface discovery,
component discovery, posture discovery, screen-knowledge discovery,
pattern discovery, snapshot discovery. Each sub-phase produces typed
phase outputs that flow through the same lookup-precedence and
promotion machinery.

### 5.2 Phase output envelope

Every phase output is wrapped in an envelope:

```
PhaseOutput<TStage> {
  stage: PipelineStage;        // which phase produced this
  name: string;                  // identifier within the stage (e.g., "demo" for routes)
  content: unknown;              // the actual derived artifact
  source: PhaseOutputSource;     // operator-override | agentic-override |
                                 // deterministic-observation | reference-canon |
                                 // live-derivation | cold-derivation
  inputFingerprint: string;      // hash of all inputs that produced this
  producedAt: string;            // ISO timestamp
  producedBy: string;            // pipeline version + sub-engine identifier
  qualityScore?: number;         // optional, used for promotion gating
}
```

The `source` field tells consumers exactly which slot of the lookup
chain the output came from, which determines how to interpret it. The
`inputFingerprint` is the cache key — two outputs with the same
fingerprint were produced from the same inputs and are interchangeable.
The `qualityScore` is consulted by the promotion mechanism (§7).

### 5.3 Where phase outputs live on disk

Each storage location corresponds to a slot in the lookup precedence
(§6) and is rooted in the doctrine from §1-§4:

| Storage location | Population | Slot |
|---|---|---|
| `{suiteRoot}/controls/<phase>/<name>` (pure operator intent only) | Canonical source (operator answers about intent) | Operator override |
| `{suiteRoot}/.canonical-artifacts/agentic/<phase>/<name>` | Canonical artifact (agentic flavor) | Agentic override |
| `{suiteRoot}/.canonical-artifacts/deterministic/<phase>/<name>` | Canonical artifact (deterministic flavor) | Deterministic observation |
| `{suiteRoot}/knowledge/**`, `{suiteRoot}/benchmarks/**`, `{suiteRoot}/controls/**` (pre-gate content) | Reference canon (transitional) | Reference canon |
| `.tesseract/cache/<phase>/<name>` | Derived output (live cache) | Live derivation |
| (in-process) | Derived output (cold derivation) | Cold derivation |

The `.canonical-artifacts/` directory is committed and **greenfield**:
it is populated only by real promotions through real gates. Its two
subdirectories (`agentic/` and `deterministic/`) make the doctrinal
flavor visible at the path level: an operator looking at git can tell
at a glance which artifacts came from a receipt lineage vs. a
discovery promotion.

The reference-canon paths (today's `dogfood/knowledge/`,
`dogfood/benchmarks/`, `dogfood/controls/`) are committed but are
marked as transitional in § 11's classification table. They are
consulted at runtime at a lower precedence than the two real
canonical-artifact flavors; a fitness report shows what fraction of
warm-run hits landed in reference canon, which is the measurable
form of the migration debt.

The `.tesseract/cache/` directory is gitignored. It is per-developer
per-machine state, used as a fast path between runs.

The cold derivation slot has no on-disk location — it runs the
discovery engine in-process and returns the result directly. If the
operator wants to inspect the result, the live cache slot captures it
on the next run.

---

## 6. The lookup precedence chain

When the pipeline needs phase output X, it consults the lookup chain
in order. The first slot that returns a valid output wins. The chain
has six slots during the reference-canon transition; it collapses
back to five once reference canon is empty.

| Slot | Population | Source | Where it lives | Lifecycle |
|---|---|---|---|---|
| 1 | canonical source | Operator override | `{suiteRoot}/controls/<phase>/<name>` (pure-intent files only) | Forever, until operator deletes |
| 2 | canonical artifact | Agentic override | `{suiteRoot}/.canonical-artifacts/agentic/<phase>/<name>` | Until demoted via operator review |
| 3 | canonical artifact | Deterministic observation | `{suiteRoot}/.canonical-artifacts/deterministic/<phase>/<name>` | Until replaced by a better promotion |
| **4** | **reference canon** *(transitional)* | **Reference canon** | **`{suiteRoot}/knowledge/**`, `{suiteRoot}/benchmarks/**`, `{suiteRoot}/controls/**` (pre-gate content)** | **Until superseded by slots 2–3 or deleted** |
| 5 | derived output | Live derivation | `.tesseract/cache/<phase>/<name>` | Per-run, regenerated on demand |
| 6 | derived output | Cold derivation | (in-process) | Per-invocation, never persisted |

The doctrinal partition: slot 1 is a canonical SOURCE; slots 2–3 are
canonical ARTIFACTS; slot 4 is the transitional REFERENCE CANON
layer; slots 5–6 are DERIVED. The pipeline trusts slots 1–3 as
ground truth at runtime, trusts slot 4 as a best-available fallback
clearly labeled in every receipt, and treats slots 5–6 as promotion
candidates.

**Slot 4 is the measurable form of the migration debt.** Every time
a warm run hits slot 4, that is one more address where the real
canon store has not yet caught up. The `score` command's rung
distribution reports slot-4 hits as their own bucket so the operator
can see the fraction shrinking cycle-over-cycle. When slot 4's hit
rate is zero for a full cohort pass, slot 4 is empty in practice
and the underlying files can be deleted.

### 6.1 Why operator overrides outrank agentic overrides

Slot 1 (canonical source) outranks slot 2 (canonical artifact, agentic
flavor) because operator-authored intent is forever and cannot be
demoted. Operators write `controls/` files when they have a hard
requirement that must hold regardless of what the system observes or
infers. Agents write override files when they observe a gap and want
to bridge it; those bridges are subject to demotion when the gap is
closed.

In practice, an operator override and an agentic override for the same
phase output should be rare. When it happens, the operator's word wins
and the agent's intervention should probably be removed.

### 6.2 Why agentic overrides outrank deterministic observations

Slot 2 outranks slot 3 because the agentic override is, by definition,
an explicit decision that the deterministic answer was insufficient.
Until the demotion mechanism reverses that decision, the override
stands.

The system continues to track the deterministic observation in the
background as a comparison target. When the deterministic observation
matches the agentic override (or beats it on quality metrics), the
system surfaces a demotion proposal to a human (§7).

### 6.3 Why deterministic observations outrank reference canon

Slot 3 outranks slot 4 because deterministic observations carry a
real promotion-gate evaluation. They were produced by a discovery
run whose quality was measured against a per-class confidence gate.
Reference canon carries only git history as its provenance — no
evaluation, no gate, no confidence interval. A deterministic
observation that has passed the gate is, by construction, at least
as trustworthy as a reference canon entry at the same address, and
usually more so because the gate scored it.

### 6.4 Why reference canon outranks derived output

Slot 4 outranks slot 5 because reference canon is committed
code-of-record that the operator has, at some point, looked at and
not removed. It's not a gate-qualified artifact, but it's also not
ephemeral. If the real canon flavors have nothing at an address and
the pipeline must fall back, reference canon is a higher-fidelity
answer than re-running discovery from scratch every warm run.

This ranking is the *reason* reference canon exists as a slot at
all, rather than being ignored at runtime. Without it, warm-start
collapses into cold-start every time `.canonical-artifacts/` is
sparse, and the convergence signal becomes meaningless noise. With
it, warm-start works and the split between "hit real canon" vs.
"hit reference canon" is a clean, honest measurement.

### 6.4a Why live derivation outranks cold derivation

Slot 5 outranks slot 6 because the live cache is faster than running
the discovery engine. If the live cache is present and its
`inputFingerprint` matches the current inputs, it is byte-equivalent
to what cold derivation would produce, and there is no reason to
recompute.

### 6.5 Modes that change the precedence

The default precedence (1 → 2 → 3 → 4 → 5 → 6) can be adjusted by
mode flags:

- **`--mode warm`** (default): walk the full chain in order.
- **`--mode cold`**: skip slots 3, 4, and 5. Run cold derivation
  while still respecting operator overrides (slot 1) and agentic
  overrides (slot 2). Used to challenge the discovery engine without
  throwing away operator intent, and WITHOUT leaning on reference
  canon (which would defeat the purpose of the cold challenge).
- **`--mode compare`**: walk the chain to load slot 3 (deterministic
  observation), then ALSO run cold derivation, then report the
  diff. When slot 3 is empty for an address, the comparison target
  becomes slot 4 (reference canon) so the cold engine can still be
  measured against *something* during the transition. The compare
  report tags each diff with which target slot it used.
- **`--no-reference-canon`**: also skip slot 4. The strongest
  measurement of "how much of the canon store is real" — any
  address that has no real canon falls straight through to
  derivation. A warm run under this flag with non-trivial hit rate
  is the signal that the migration is actually finished for that
  workload.
- **`--no-overrides`**: also skip slots 1 and 2. Used in extreme
  cold-start runs that test whether the discovery engine alone is
  sufficient. The combination `--mode cold --no-overrides
  --no-reference-canon` is the strongest cold-start test. It
  measures how close the discovery engine is to the real canonical
  artifact store with ZERO safety nets: no operator intent, no
  agentic overrides, no reference canon. A warm-equivalent pass
  rate under that combination is the north-star signal for the
  discovery engine.

### 6.6 Qualifier-aware lookup (Tier 3 projections fold in)

The six-slot precedence chain is the answer to "give me artifact
X." But the interface model has a third tier (projections, §3.8)
that filters and qualifies which atoms are visible under different
contexts: which role is querying, which wizard state is active,
which feature flag is set, which business process state the SUT
is in.

When the caller invokes the lookup chain with **qualifiers**, the
chain's behavior extends:

```
lookup(address, qualifiers?) → resolved
```

Where `qualifiers` is an optional bag of contextual filters:

```
QualifierBag {
  role?: RoleId;
  wizardState?: (WizardId, StateId);
  processState?: (EntityKind, StateId);
  featureFlags?: FeatureFlagId[];
  permissionGroups?: PermissionGroupId[];
}
```

The lookup with qualifiers proceeds in two passes:

1. **Pass 1 — atom resolution.** Walk the six-slot chain to
   resolve the atom at `address`. This is unchanged from the
   non-qualified case.
2. **Pass 2 — projection application.** For each qualifier in the
   bag, look up the corresponding projection (Tier 3) via its own
   six-slot chain. Apply the projection to the resolved atom. The
   atom may be returned annotated with applicability (visible /
   interactive / read-only / hidden / gated), or it may be filtered
   out entirely if the projection says the atom is hidden in this
   context.

The two-pass model means projections live in slots 1-5 the same way
atoms and compositions do. The promotion/demotion machinery applies
to projections identically. The mode flags (`--mode warm|cold|compare`,
`--no-overrides`) apply to both passes uniformly.

#### Why qualifier-aware lookup is part of the lookup chain interface

The alternative is to expose qualifiers as a separate "filtering
layer" that consumers apply after looking up atoms. That would push
projection knowledge to every callsite and create N filtering paths
for N consumer types. Folding qualifiers into the lookup chain
interface keeps the projection layer hidden behind a single seam:
the lookup chain takes a `(address, qualifiers?)` pair and returns
the qualified result. Consumers don't need to know that projections
exist as a tier; they just pass their context.

#### Qualifier-aware lookup is wired from day one

The Phase 0b implementation includes the qualifier parameter in the
lookup chain's typed interface, even if the initial projection
discovery engines are stubs. This is the load-bearing reason the
projection tier is not deferrable: every consumer of the lookup
chain that we wire today will pass the qualifier (or omit it
explicitly), and adding the qualifier later would require touching
every callsite.

The doctrine: **the lookup chain takes qualifiers from day one,
even when there are no projections to apply.** The seam exists; the
implementation grows into it.

---

## 7. Promotion and demotion

Promotion is the mechanism that turns a derived output into a
canonical artifact. Demotion is the inverse: it removes a canonical
artifact when it has been supplanted or has become stale. Together
they are how the canon set evolves.

### 7.1 Promotion

A derived phase output is a candidate for promotion when:

1. The discovery engine produced it (slot 5, the cold-derivation
   path), or it was computed during a normal warm run and stored in
   slot 4 (live cache), AND
2. There is either no existing canonical artifact for the same
   `(stage, name)` tuple, OR there is one and the new candidate beats
   it on the relevant quality metric.

The "relevant quality metric" depends on the phase:

- For route discovery: completeness (number of routes correctly
  identified) plus precision (no spurious routes).
- For surface discovery: alignment with the SUT's actual widget tree
  plus stability across runs.
- For component discovery: a combination of correctness and reuse
  potential.
- For substrate (screens, patterns, snapshots): the L4 metric tree's
  knowledge-hit-rate and rung distribution.

When the gate passes, the promotion mechanism:

1. Copies the derived output from the live cache (slot 4) to the
   canonical artifact store (slot 3).
2. Updates the input fingerprint and producer metadata.
3. Records the promotion event in `.tesseract/promotion-log.jsonl`
   (gitignored, for operator inspection).
4. Includes the canonical artifact change in the next git commit (the
   operator sees it in `git status` and chooses whether to commit).

Promotion is **automatic** by default. The operator does not have to
opt in to each promotion; the system promotes whenever the gate
passes. If an operator wants to gate promotion behind manual review,
they can run with `--no-auto-promote` and inspect the candidates
before deciding.

### 7.1a Confidence-interval scoring on promotion gates

The "relevant quality metric" bullets above describe the *direction*
of the gate ("more routes = better") but not the *threshold* ("how
many observations do we need before we believe the cold derivation?").
A naive threshold is a scalar — "beats the existing by > 0.05" — and
fails in two ways: a single flaky observation can promote a bad atom,
and a consistently-improving-but-still-uncertain observation either
over-promotes or under-promotes depending on where the scalar sits.

The doctrinal gate uses a **dynamic confidence interval** over
observation counts. Each promotion-eligible atom address accumulates
an observation series — every cold derivation either agrees with
the existing canonical artifact (a success) or disagrees (a
failure). The gate models this as a Beta posterior
`Beta(α, β)` where `α = successes + 1` and `β = failures + 1`, and
derives a confidence interval at a per-atom-class significance
level (e.g. 90% CI, α = 0.10).

The promotion verdict depends on three quantities, not one:

1. **Sample count** (`successes + failures`). Below a per-class
   minimum floor, the verdict is `needs-review` — the gate declines
   to decide automatically because the sample is too small to
   distinguish signal from noise.
2. **Lower bound of the CI.** Above a per-class quality floor, the
   candidate is considered reliable. Below the floor, the verdict
   is `insufficient-quality` regardless of point estimate.
3. **Margin over the existing artifact's CI.** The candidate's
   lower bound must exceed the existing artifact's upper bound by
   a per-class margin before the verdict is `promote`. This
   prevents flip-flopping between two nearly-equivalent candidates.

The per-class policy lives in
`lib/domain/pipeline/promotion-policies.ts` (Phase D of
`docs/cold-start-convergence-plan.md`) as a compile-time-exhaustive
`Record<AtomClass, PromotionConfidencePolicy>`. Routes get
conservative policies (rare changes, small sample counts should
still allow promotion); elements get moderate policies;
resolution overrides get the tightest because they are the
highest-cadence demotion target and the cost of a wrong
resolution override is runtime-visible.

The Beta posterior is combined via conjugate-prior addition, which
is a Monoid (`combinePosteriors(a, b)` with identity
`{ successes: 0, failures: 0 }`). The Monoid composition lets the
gate accumulate observations across cohorts without losing
statistical validity, and the Monoid laws are tested by
`tests/promotion-confidence.laws.spec.ts` (Phase D).

Demotion (§7.2) uses the same confidence-interval machinery with
symmetric semantics: a canonical artifact is a demotion candidate
when its observation series has accumulated enough failures that
the CI's upper bound has fallen below the per-class quality floor.
Because demotion is always deliberate, the gate's output is a
proposal, not an action — but the statistical basis for the
proposal is the same Beta posterior as promotion.

This replaces the optional scalar `scores` field on
`PromotionEvaluation` with a richer
`confidence?: ConfidenceInterval` field. Existing gates that only
populate the scalar continue to work (the gate falls back to scalar
comparison when no CI is available); new gates populate both.

### 7.2 Demotion

A canonical artifact is a candidate for demotion when:

- For agentic overrides (slot 2): the deterministic engine produces
  an observation that matches or beats the agentic override on
  quality metrics. This means "the gap the agent was bridging has
  been closed by the discovery engine."
- For deterministic observations (slot 3): a fresh cold derivation
  with the same inputs produces a different output, AND the
  difference is not explainable by input changes (input fingerprint
  matches). This means "the canonical artifact is stale or
  incorrect."

When a demotion candidate is detected, the system surfaces a
**demotion proposal** to the operator. A demotion proposal includes:

- The phase output identifier (`stage`, `name`)
- The current canonical artifact and its provenance
- The challenger output and its provenance
- The quality scores of both
- A confidence assessment ("the system is N% confident this
  demotion is correct")
- The recommended action (demote, keep, or escalate for review)

The operator reviews and approves or rejects. Approved demotions
remove the canonical artifact and the challenger takes its place
(either as a new deterministic observation, or — if the challenger
was a cold derivation — by writing it back to the live cache and
re-running the promotion gate).

Demotion is **deliberate** by default. The system never silently
removes a canonical artifact. Even when the deterministic engine
clearly outperforms an agentic override, the human gets the final
call.

### 7.3 The promotion/demotion loop is the system's improvement engine

Promotion and demotion together form the loop that lets the canon
set evolve over time:

1. The discovery engine improves and produces better phase outputs.
2. Promotion captures the improvements as new canonical artifacts.
3. Some of those new canonical artifacts (deterministic observations)
   match or beat existing agentic overrides.
4. Demotion proposals surface for the obsolete agentic overrides.
5. The operator approves the demotions and the agentic override is
   removed.
6. The canon set is now smaller, the discovery engine is doing more
   work, and the system has graduated.

This is how the long-term vision (no `dogfood/` folder, no hand-curated
canonical artifacts, just the operator's intent and the discovery
engine doing its job) is reached: incrementally, one demotion at a
time, governed by the promotion/demotion gates.

---

## 8. Cold-start and warm-start interop

The lookup precedence chain is the mechanism that lets the same
pipeline run in cold or warm mode without code branching. Both modes
call the same phase functions; they only differ in which slots of the
chain are consulted.

This is a deliberate design choice. Cold and warm are not separate
code paths or separate substrates. They are **different lookup
policies over the same canonical artifact store**. The pipeline does
not know what mode it is in — it asks the lookup chain for phase
output X and receives the answer. The mode determines whether the
canonical artifact slots (2 and 3) are consulted, but the calling
code is identical.

### 8.1 The interop contract

A cold run and a warm run that consume the same canonical sources
should produce equivalent system state. "Equivalent" is measured by:

1. The L4 metric tree from `score` matches within tolerance.
2. The discovery fitness metric tree (§12) shows the cold-derived
   outputs match the canonical artifact outputs within tolerance.
3. The downstream artifacts (bound, generated specs, run records) are
   functionally interchangeable.

When the contract holds, the cold run is implicitly validating the
canonical artifacts that the warm run is using. When the contract
breaks, the discrepancy points at one of:

- A bug in the discovery engine (cold derives incorrectly).
- Staleness in a canonical artifact (a deterministic observation that
  used to be true but isn't anymore — candidate for demotion).
- A missing operator answer (the gap is real and needs an override
  or intervention to land in slot 1 or slot 2).

Each of these has a defined remediation path through promotion or
demotion. The interop contract is the system's tripwire for catching
silent regressions.

### 8.2 Why interop matters

Without interop, cold-start and warm-start become different products.
Cold-start becomes a ceremonial regression test that nobody actually
runs because it always fails for irrelevant reasons. Warm-start
accumulates state the cold-start engine cannot reproduce, and the
canonical artifact store ossifies into "stuff we don't dare delete."

With interop, they are two views of the same product. Every cold run
that beats a canonical artifact triggers a promotion. Every warm run
that diverges from a fresh cold derivation triggers a demotion
proposal. The canon set evolves continuously, and "cold-start works"
is a verifiable, daily fact instead of an aspirational claim.

### 8.3 The cadence of cold-start runs

Cold-start runs should be at least as frequent as warm-start runs.
Both are first-class outcomes the system optimizes around. In CI, the
default should be that every commit triggers both: a warm-start run
to validate the L4 pipeline efficacy gradient, and a cold-start run
(possibly on a smaller corpus to keep CI time bounded) to validate
the discovery fitness gradient.

A discovery engine that is challenged regularly is one that improves
regularly. A discovery engine that is challenged only when an operator
remembers to run `--mode cold` is one that quietly rots while everyone
trusts the canonical artifacts.

---

## 9. Two parallel engines

The system contains two engines that improve along orthogonal axes.
They share the same canonical artifact store but they optimize
different things, and the doctrine should make their independence
visible.

### 9.1 The discovery engine (deterministic observation)

The discovery engine takes canonical sources and produces phase
outputs from cold. It is judged by the **discovery fitness** metric
tree (§12): how close are its cold-derived outputs to the current
canonical artifacts?

A good discovery engine eventually eliminates the need for
hand-curated canonical artifacts. As it matures, the demotion
mechanism removes agentic overrides one at a time, and the canon set
shrinks toward "operator intent + the SUT" alone.

The discovery engine code lives in `lib/application/discovery/` (or
wherever the discovery namespace lands during the lib restructuring).
It is the cold-start arm of the self-improvement loop.

### 9.2 The agentic intervention engine (braided inference ↔ evidence)

The agentic intervention engine handles the gaps the discovery engine
cannot bridge, but its output is not "an operator answer." Its
output is a **braid**: the agent forms a hypothesis from runtime
evidence, the hypothesis becomes a typed `InterventionReceipt` with
a populated `handoff.semanticCore`, the receipt writes an agentic
override to slot 2 of the canon store, and subsequent runs weave
runtime evidence back through the same receipt lineage to measure
whether the inference paid off.

Inference and evidence are not alternating layers; they are twisted
together per intervention receipt. An intervention that cannot show
its evidence ancestry cannot participate in the C6 measurement
(§12.2). An evidence record that cannot show which intervention it
is counting against cannot either.

The substrate for the braid already exists in
`lib/domain/handshake/intervention.ts`:

- **`InterventionHandoff.evidenceSlice`** — the bounded evidence
  the agent had at the moment of inference (pre-hypothesis).
- **`InterventionHandoff.semanticCore`** — the typed semantic
  fingerprint of the hypothesis the agent committed to.
- **`InterventionHandoffChain.previousSemanticToken`** and
  **`driftAcknowledgedBy`** — the per-receipt lineage that lets
  subsequent runs detect whether the hypothesis has drifted from
  observed reality and whether that drift was acknowledged.
- **`InterventionTokenImpact`** — the populated-post-hoc record of
  downstream effect: ambiguity reduced, suspensions avoided, rung
  improvement, activation quality. Fields are optional because the
  scheduler that populates them (from before/after runs in the
  attachment region) is the missing piece.

A good intervention engine is judged by:

- **C6 — Intervention-Adjusted Economics**: fraction of accepted
  augmentations whose `InterventionTokenImpact` shows positive
  `ambiguityReduction | suspensionAvoided | rungImprovement`
  within a rolling N-run window. This is the primary scoreboard
  metric for the engine, per `docs/alignment-targets.md`. Direct
  measurement requires the impact scheduler, which is Phase C of
  `docs/cold-start-convergence-plan.md`.
- **Intervention longevity**: how long does an intervention stay
  relevant before the discovery engine catches up and a demotion
  proposal surfaces? Longer is better (the intervention was
  bridging a real gap, not a momentary blip).
- **Semantic-core preservation**: across a multi-step receipt
  chain, does the semantic token survive actor handoffs without
  silent drift? The `InterventionHandoffChain.semanticCorePreserved`
  and `driftAcknowledgedBy` fields must be truthful per receipt.
- **Operator burden** (operator-intervention-density in the L4
  tree). Lower is better.
- **Question quality**: when the engine escalates to a human,
  are the questions specific and answerable?
- **Demotion accuracy**: when the engine proposes a demotion, is
  it correct?

The intervention engine code lives in `lib/application/agency/`
(or wherever the agency namespace lands). Its measurement pipeline
lives in `lib/application/intervention/impact-scheduler.ts` (new in
Phase C of the cold-start convergence plan). It is the warm-start
arm of the self-improvement loop — but it is not "the human in the
loop." It is the typed substrate for turning agent hypotheses into
measurable, demotable, evidence-anchored canonical artifacts.

### 9.3 Why both engines matter

Discovery is bounded by what is observable from canonical sources
alone. Even a perfect discovery engine cannot infer "the operator
wants to test this scenario under this particular drift configuration"
— that's intent, and it requires a human or an agent acting on the
human's behalf.

The right ratio of discovery to intervention varies by project and
over time:

- **Greenfield project, day one**: mostly intervention. The operator
  is teaching the system. Few canonical artifacts exist. Most lookups
  hit slot 5 (cold derivation, often failing) and the system asks for
  help.
- **Mature project, year two**: mostly discovery. The system has
  observed the SUT enough that the canonical artifact store covers
  most phase outputs. Interventions are rare and reserved for novel
  test intent.
- **Forever**: operator overrides (slot 1) remain canonical sources
  no matter how mature the discovery engine becomes. The operator's
  intent cannot be discovered.

Both engines write to the canonical artifact store via the same
promotion mechanism. Both can be challenged by cold-start runs. Both
contribute to the canonical set over time.

---

## 10. Directory layout convention

The system has one configurable root: `{suiteRoot}`. It is the
directory containing all project-specific state — canonical sources,
canonical artifacts, and the cache scratch space for derived output.
The pipeline accesses it via `paths.suiteRoot` and never hardcodes
the literal name.

### 10.1 Naming

- **Dogfood mode**: `{suiteRoot}` is `dogfood/`. The name documents
  that this is the system's self-test environment.
- **Production mode**: `{suiteRoot}` defaults to `project/`.
  Operators may override the convention per project (e.g.,
  `acme-insurance/`, `contoso-banking/`), and the pipeline reads the
  choice from a top-level config.
- The literal string `dogfood` should not appear in pipeline code,
  doctrine prose, or operator-facing commands. Use `{suiteRoot}` in
  docs and `paths.suiteRoot` in code.

### 10.2 Canonical paths under `{suiteRoot}/`

These are committed. The canonical-artifact store
(`.canonical-artifacts/`) is **greenfield**: it starts empty and is
populated one atom at a time by real promotion gates (for
deterministic observations) and real intervention receipts (for
agentic overrides). The reference-canon paths (`knowledge/`,
`benchmarks/`, `controls/`) are committed-but-transitional: they are
the pre-gate high-water mark of learning and are consulted at
runtime at a lower precedence than the two real canonical-artifact
flavors (see § 6, slot 4).

The `.canonical-artifacts/` tree is structured as the three-tier
interface model (§3.5/3.6/3.7/3.8) — atoms keyed by SUT-primitive
identity, compositions keyed by recipe identity, projections keyed
by qualifier identity. Each tier has its own subdirectory and within
each tier the agentic-vs-deterministic source flavor is encoded at
the path level so operators can tell at a glance which artifacts
came from a receipt lineage vs. a discovery-engine promotion.

```
{suiteRoot}/
  fixtures/
    ado/                              # canonical source: simulated upstream (dogfood)
                                      # — in production this directory does not exist; the
                                      # canonical source is the .ado-sync/ persisted record below
      <hand-curated IDs>.json
    demo-harness/                     # canonical source: the SUT in dogfood mode
                                      # (absent in production — SUT is external)

  # ── Reference canon (slot 4, transitional) ─────────────────────
  # These paths are the pre-gate high-water mark of learning.
  # They are consulted at runtime but are NOT canonical artifacts.
  # Every atom in here is a demotion candidate: it either gets
  # superseded by a real agentic override (slot 2) backed by an
  # intervention receipt, or by a real deterministic observation
  # (slot 3) promoted through the discovery gate, or it gets
  # deleted when no longer needed. When these directories are
  # empty, slot 4 retires and the `dogfood/` folder itself can be
  # deleted.

  knowledge/                          # reference canon: pre-gate
    screens/                          #   - *.elements.yaml, *.hints.yaml, *.postures.yaml
    surfaces/                         #   - *.surface.yaml
    routes/                           #   - *.routes.yaml
    patterns/                         #   - *.yaml (promoted cross-screen abstractions)
    snapshots/                        #   - ARIA tree templates
    components/                       #   - *.ts widget choreography (long-term: moves to lib/runtime/widgets/)

  controls/                           # reference canon: pre-gate (MOSTLY)
                                      # Pure-intent fragments (operator thresholds, variance
                                      # selections) are canonical sources; the rest is
                                      # reference canon awaiting demotion.
    resolution/
    runbooks/
    datasets/
    variance/

  benchmarks/                         # reference canon: pre-gate
                                      # Hybrid compound files mixing element facts, flow
                                      # compositions, and operator intent. Stays here
                                      # verbatim; not decomposed into .canonical-artifacts/.

  # ── Canonical artifacts (slots 2–3, greenfield) ────────────────
  # Only populated by real promotions. Every file here carries
  # either a receipt reference (agentic/) or a promotion evaluation
  # reference (deterministic/). No hand-copies, no migration
  # scripts, no laundering reference canon into this tree.

  .canonical-artifacts/               # canonical artifacts (committed, doctrinal weight)
    atoms/                            # TIER 1: per-primitive facts
      agentic/                        # — agent-authored (slot 2)
        routes/
        route-variants/
        screens/
        surfaces/
        elements/
        postures/
        affordances/
        selectors/
        patterns/
        snapshots/
        drifts/
        transitions/                  # includes reverseOf linkage + optional precondition
        observation-predicates/
        resolution-overrides/
        posture-samples/
        runtime-family/               # signature bundles per runtime family
      deterministic/                  # — promoted from discovery (slot 3)
        routes/
        route-variants/
        screens/
        surfaces/
        elements/
        postures/
        affordances/
        selectors/
        patterns/
        snapshots/
        drifts/
        transitions/
        observation-predicates/
        resolution-overrides/
        posture-samples/
        runtime-family/
    compositions/                     # TIER 2: higher-order patterns over atoms
      agentic/                        # — agent-authored
        archetypes/                   # WorkflowArchetype instances
        flows/                        # ordered field/screen sequences
        runbooks/                     # execution recipes
        route-graphs/                 # navigation topology
        expansion-rules/              # variant derivation rules
        surface-compositions/         # multi-surface descriptions
        recipe-templates/             # parameterized runbook fragments
      deterministic/
        archetypes/
        flows/
        runbooks/
        route-graphs/
        expansion-rules/
        surface-compositions/
        recipe-templates/
    projections/                      # TIER 3: constraints over the atom set
      agentic/                        # — agent-authored
        role-visibility/              # which atoms a role can see
        role-interaction/             # which atoms a role can interact with
        wizard-state/                 # which atoms are accessible per wizard state
        permission-groups/            # composite role definitions
        posture-availability/         # when each posture is exercisable
        process-state/                # business-state-aware visibility
        feature-flags/                # flag-gated atom visibility
      deterministic/
        role-visibility/
        role-interaction/
        wizard-state/
        permission-groups/
        posture-availability/
        process-state/
        feature-flags/

  .ado-sync/                          # in production: canonical source (persisted upstream)
    snapshots/                        # in dogfood: derived (cache of fixtures/ado/)
                                      # the doctrinal status flips between modes; gitignored in dogfood
```

### 10.3 Derived paths under `{suiteRoot}/`

These exist on disk during a run and after, but are gitignored. They
are regenerable from canonical sources plus pipeline code:

```
{suiteRoot}/
  scenarios/                          # parse phase output (cache)
    demo/
    reference/
  generated/                          # spec emission output (cache)
```

### 10.4 Runtime paths outside `{suiteRoot}/`

```
.tesseract/
  cache/                              # live phase output cache (slot 4)
    <phase>/<name>.<ext>
  runs/                               # per-run records
  sessions/                           # per-session traces
  bound/                              # bound artifact cache
  inbox/                              # handshake inbox
  scratch/
    substrate/                        # in-progress substrate during iterate runs
  benchmarks/
    runs/<ts>.fitness.json            # fitness reports per run
    scorecard.json                    # local high-water-mark per developer
  baselines/
    <label>.baseline.json             # L4 metric tree baselines per developer
  promotion-log.jsonl                 # log of promotions and demotions
```

All of `.tesseract/` is gitignored except for explicit governance
anchors (scorecard policy files). It is per-developer per-machine
state.

### 10.5 Test fixture checkpoints

```
tests/
  fixtures/
    checkpoints/
      <label>/                        # explicitly captured derived state
                                      # for use as integration test data
```

The checkpoint store is committed because it is test data, not
because it is canonical. Its lifecycle is governed by the test suite:
checkpoints are added when a test needs stable input, and they are
deleted when the test that depends on them is removed.

---

## 11. Classification table for the dogfood suite

Authoritative classification for every path that currently exists
under `dogfood/`. Each row maps a path to its population (canonical
source / canonical artifact / reference canon / derived output) and
its exit path out of the current state.

**Key reframe (2026-04-10).** The previous revision of this table had
a "DECOMPOSE" column that prescribed a one-shot migration script
(`scripts/decompose-canon.ts`) converting hybrid compound YAMLs into
per-atom files under `.canonical-artifacts/`. That framing was
retired because it conflated two unrelated operations:

1. **Putting atoms in the right on-disk shape.** That's a structural
   concern solved by the typed address types at
   `lib/domain/pipeline/{atom,composition,projection}-address.ts`.
   Still a good idea.
2. **Earning canonical-artifact status.** That requires a real
   provenance chain (intervention receipt → auto-approval gate, or
   discovery run → promotion gate). Copying pre-gate YAMLs into the
   per-atom tree *does not* do that; it launders training
   scaffolding into the canon store without the gate ever firing.

The two operations were fused under "DECOMPOSE," which meant that
running the migration script would populate `.canonical-artifacts/`
with hundreds of files tagged as `agentic-override` or
`deterministic-observation` that had never earned either tag. The C6
scoreboard and the discovery-fitness metric would both silently
ingest those false positives.

The current doctrine: **dogfood YAMLs stay where they are, marked as
reference canon (§ 3.2a), and `.canonical-artifacts/` starts
greenfield.** Migration happens one atom at a time through the live
loop — an agent observes evidence, forms a receipt, passes the gate,
writes a real agentic override at the same address; or the discovery
engine observes, passes the promotion gate, writes a real
deterministic observation at the same address. The reference canon
entry then becomes a demotion candidate and the operator (or an
automatic sweep) removes it.

| Path | Population | Exit path |
|---|---|---|
| `dogfood/fixtures/ado/{10001,10002,10010,10011}.json` | canonical source | stays committed; operator's stand-in upstream |
| `dogfood/fixtures/ado/{2xxxx}.json` | derived | gitignore in place; cohort generator output |
| `dogfood/fixtures/demo-harness/**` | canonical source | stays committed; the SUT in dogfood mode |
| `dogfood/.ado-sync/snapshots/{10001,10002,10010,10011}.json` | derived (in dogfood) | gitignore in dogfood; in production this becomes canonical source |
| `dogfood/.ado-sync/snapshots/{2xxxx}.json` | derived | gitignore; cohort sync cache |
| `dogfood/.ado-sync/archive/{10001,10002,10010,10011}/N.json` | canonical source | stays committed; simulator revision history |
| `dogfood/.ado-sync/archive/{2xxxx}/N.json` | derived | gitignore; synthetic cohort revision history |
| `dogfood/.ado-sync/manifest.json` | derived | gitignore; auto-maintained sync metadata |
| `dogfood/benchmarks/*.benchmark.yaml` | reference canon | consulted at slot 4; demoted as agentic overrides + deterministic observations land at the same addresses |
| `dogfood/controls/datasets/*.dataset.yaml` | reference canon | consulted at slot 4; per-(screen, element, posture) defaults awaiting a real receipt or promotion |
| `dogfood/controls/resolution/*.resolution.yaml` | reference canon | consulted at slot 4; per-(screen, intent) decisions awaiting a real receipt |
| `dogfood/controls/runbooks/*.runbook.yaml` | reference canon | consulted at slot 4; recipes awaiting promotion as Tier 2 compositions |
| `dogfood/controls/variance/*.variance.yaml` | mixed | drift configs are reference canon (slot 4); the pure selection-intent fragments inside are canonical sources |
| `dogfood/scenarios/demo/**` | derived (after parser migration) | gitignore after the parser migration lands; until then treat as reference corpus for unit-test pinning per `scenario-partition.md` |
| `dogfood/scenarios/reference/**` | derived | gitignore; cohort generator output |
| `dogfood/knowledge/screens/*.elements.yaml` | reference canon | consulted at slot 4; element atoms awaiting real receipts / promotions |
| `dogfood/knowledge/screens/*.hints.yaml` | reference canon | consulted at slot 4; mix of alias and resolution-override content |
| `dogfood/knowledge/screens/*.postures.yaml` | reference canon | consulted at slot 4; posture atoms awaiting real receipts / promotions |
| `dogfood/knowledge/patterns/*.yaml` | reference canon | consulted at slot 4; cross-screen abstractions awaiting re-promotion |
| `dogfood/knowledge/snapshots/**` | reference canon | consulted at slot 4; ARIA tree templates awaiting re-promotion |
| `dogfood/knowledge/routes/demo.routes.yaml` | reference canon | consulted at slot 4; route atoms + graph composition awaiting re-promotion |
| `dogfood/knowledge/surfaces/*.surface.yaml` | reference canon | consulted at slot 4; surface atoms + compositions awaiting re-promotion |
| `dogfood/knowledge/components/*.ts` | canonical source (code) | long-term moves to `lib/runtime/widgets/`; near-term stays committed |
| `dogfood/generated/**` | derived | gitignore; playwright spec emission |
| `dogfood/posture.yaml` | (does not exist) | the `postureConfigPath` concept has been deleted |
| `dogfood/.canonical-artifacts/` | canonical artifact (empty / greenfield) | **populated only by real promotions through real gates** — no migration script seeds this |

The Tier 3 projection layer (role-visibility, wizard-state,
process-state, feature-flag, etc.) has NO existing files in dogfood
today, reference canon or otherwise. It is built greenfield as the
agent intervention engine learns to capture role visibility,
wizard-state visibility, posture availability, and permission-group
bindings. The projection slot in the lookup chain exists from day
one (Phase 0b) so consumers don't have to retrofit. Per the active
cold-start convergence plan, Tier 3 authoring does not land until
Phase F and the dogfood suite runs with zero-role projections until
then.

### 11.1 What happened to the decomposition work

The `lib/application/canon/decompose-*.ts` pure functions (per-class
decomposers: screen-elements, screen-hints, screen-postures,
screen-surfaces, route-knowledge, patterns, snapshots) are **kept**.
They are useful independent of the migration: the discovery engine
may need them to turn fat observation surfaces into per-atom
envelopes at runtime, and they serve as the reference implementation
for how a hybrid shape maps to atom addresses. What they lose is
their role as a one-shot migration target.

The `scripts/decompose-canon.ts` one-shot migration script is
**deprecated**. It will not be run. A deprecation header on the
script points at this section. It may be deleted in a later commit
once we confirm no CI or tooling invokes it.

The `tests/canon-decomposition.laws.spec.ts` equivalence law test
(the "migration tripwire") is either deleted or repurposed as a
pure-function law test for the decomposer modules themselves
(asserting they produce the shapes they claim), *not* as a
migration equivalence assertion.

---

## 12. Two metric trees

The system tracks pipeline efficacy on two orthogonal axes, each with
its own L4 metric tree consumed by the `score` command.

### 12.1 L4 pipeline efficacy tree (existing)

The existing L4 metric tree from the fifth-kind loop. It measures how
well the pipeline runs the workload given the current canonical
artifacts. Root metrics:

- `extraction-ratio` (higher is better)
- `handshake-density` (lower is better)
- `rung-distribution` (composite)
- `intervention-cost` (lower is better)
- `compounding-economics` (higher is better)

It answers: **how well does the pipeline run the test workload, given
the canon it has access to?** It is the gradient signal for changes to
the runtime, the resolver, the proposal generator, and the substrate
growth loop.

### 12.2 Discovery fitness tree (new)

A parallel L4 tree that measures how well the discovery engine derives
phase outputs from cold. Implementation lives under
`lib/domain/fitness/metric/visitors-discovery/` with its own
compile-time-exhaustive registry
`DISCOVERY_L4_VISITORS: { readonly [K in DiscoveryL4MetricKind]: MetricVisitor<DiscoveryL4VisitorInput, K> }`
mirroring the existing pipeline-efficacy registry at
`lib/domain/fitness/metric/visitors/index.ts:42-50` (the pattern is
identical — only the input shape differs). Root metrics (initial
set):

- `discovery-route-fidelity` — how close are cold-derived routes to
  the canonical artifact? (higher is better)
- `discovery-surface-fidelity` — same for surfaces
- `discovery-element-fidelity` — same for elements
- `discovery-posture-fidelity` — same for postures
- `discovery-selector-fidelity` — same for selectors
- `discovery-substrate-fidelity` — how close is cold-derived substrate
  (after iterate convergence) to the canonical artifact substrate?
- `discovery-coverage` — what fraction of canonical artifacts does the
  discovery engine produce at all? (higher is better)
- `discovery-family-recognition-rate` — for targets with a known
  runtime family, what fraction of screens produce a matching
  `runtime-family` atom? (higher is better; flat is fine once the
  family is stable, spikes after a platform upgrade)
- `intervention-graduation-rate` — what fraction of agentic overrides
  has been demoted because the deterministic engine caught up?
  (higher is better, but should be slow and steady)

And two metrics that live in the **pipeline-efficacy tree** (not the
discovery-fitness tree) but that depend on substrate maturity to be
computable at all:

- `memory-worthiness-ratio` — M5 per `docs/alignment-targets.md`.
  Cohort-trajectory slope of `effectiveHitRate` over
  `MemoryMaturity(τ)` divided by per-iteration scorecard maintenance
  overhead. Requires the trajectory primitive at
  `lib/domain/fitness/memory-maturity-trajectory.ts` to accumulate
  at least three cohort-comparable history points.
- `intervention-marginal-value` — C6 per
  `docs/alignment-targets.md`. Rolling-window fraction of accepted
  agentic augmentations with positive
  `InterventionTokenImpact.ambiguityReduction | suspensionAvoided | rungImprovement`.
  Requires the before/after impact scheduler at
  `lib/application/intervention/impact-scheduler.ts` to populate
  the fields (Phase C of `docs/cold-start-convergence-plan.md`).

It answers: **how close is cold-start to warm-start, and are the
interventions that bridge the gap actually earning their seat at the
table?** It is the gradient signal for changes to the discovery
engine and to the agentic intervention system.

### 12.3 Why two trees instead of one

The two trees measure different things and should not be conflated:

- A change that improves L4 pipeline efficacy without improving
  discovery fitness means the runtime is better at using the cached
  canonical artifacts, but the cold-start engine has not progressed.
- A change that improves discovery fitness without improving L4
  pipeline efficacy means the cold-start engine has caught up to the
  canonical artifacts, but the runtime is no faster.
- A change that improves both is the best kind of change.
- A change that regresses one and improves the other is a tradeoff
  that needs explicit operator review.

The score command surfaces both trees side by side and lets the
operator read each independently.

---

## 13. Operator workflows

The day-to-day operator does not think about the trichotomy. They
run commands. The commands respect the doctrine internally so the
operator's mental model can stay simple.

### 13.1 Day-to-day warm-start workflow

```
tesseract iterate                       # warm: walk full lookup chain, use canonical artifacts
tesseract fitness                       # produce fitness report from run records
tesseract score                         # build L4 + discovery fitness trees
tesseract baseline --label pre-edit     # snapshot for gradient measurement
# (edit pipeline code)
tesseract iterate
tesseract fitness
tesseract score --baseline pre-edit     # gradient signal
git status                              # clean (canonical artifacts unchanged unless promoted)
```

### 13.2 Cold-start challenge workflow

```
tesseract iterate --mode cold           # cold: skip slots 3 and 4, run discovery
tesseract fitness
tesseract score --discovery-fitness     # how close is cold to canonical?
```

### 13.3 Promotion workflow (mostly automatic)

```
tesseract iterate                       # may automatically promote candidates
git status                              # shows promoted canonical artifact diffs
git commit -m "Promote routes/demo to deterministic observation"
```

### 13.4 Demotion workflow (deliberate)

```
tesseract demote --review               # surfaces pending demotion proposals
# operator reviews each, accepts or rejects
git status                              # shows removed canonical artifacts
git commit -m "Demote agentic override for routes/policy-search"
```

### 13.5 Reset workflows

```
tesseract reset --derived               # wipes .tesseract/cache/, runs, sessions
tesseract reset --canonical-artifacts   # wipes .canonical-artifacts/ entirely
                                        # (extreme; for verifying the discovery
                                        # engine can rebuild the canon set)
```

### 13.6 Canonical artifact inspection

```
tesseract canon list                    # list all canonical artifacts by phase
tesseract canon show routes/demo        # show the current artifact for a phase output
tesseract canon history routes/demo     # show the promotion/demotion history
```

---

## 14. Long-term vision

The doctrine is designed to support a north-star end state where:

1. The `dogfood/` folder does not exist.
2. The pipeline points at a real Azure DevOps project (via real
   credentials and the real `tesseract sync` flow) and at a real
   web application (via a real fixture server or staging URL).
3. The canonical sources are: pipeline code, doctrine, operator
   intent (`controls/` pure-intent fragments), and the `.ado-sync/`
   persisted upstream record. No simulator.
4. The canonical artifacts are populated entirely by the discovery
   engine (deterministic observations) and a small set of agentic
   overrides for genuinely novel intent, each backed by an
   intervention receipt that passed the auto-approval gate.
5. **Reference canon is empty.** The transitional slot 4 retires.
   The lookup chain collapses back to five slots.
6. The operator's day-to-day experience is: edit pipeline code,
   run iterate against real ADO + real SUT, watch the canonical
   artifact store evolve as the system learns.

The trichotomy survives this transition unchanged. What changes is:
- The SOURCE of the canonical sources (real ADO instead of
  simulator).
- The SIZE and SHAPE of the canonical artifact store (populated
  through gates, not hand-authoring).
- The ABSENCE of the transitional reference-canon slot.

The dogfood mode is the system's training environment. The
trichotomy must hold in dogfood for it to hold in production. Every
doctrinal correctness fix that lands during dogfood development is
a free correctness fix for the production deployment.

### 14.0 Graduation condition for retiring `dogfood/`

The `dogfood/` folder can be deleted in good conscience when all of
the following hold:

1. `{suiteRoot}/knowledge/`, `{suiteRoot}/benchmarks/`, and the
   non-intent portions of `{suiteRoot}/controls/` are empty — every
   reference canon entry has been either superseded by a real
   agentic override, superseded by a real deterministic observation,
   or demoted as no-longer-needed.
2. A warm run with `--no-reference-canon` has ≥ 95% of the hit rate
   of a default warm run. (This is the structural proof that the
   system no longer depends on reference canon; the small gap
   covers edge cases the demotion sweep hasn't yet reached.)
3. The reference cohort corpus (`{suiteRoot}/scenarios/reference/`)
   runs green under `--no-reference-canon` with discovery-fitness
   and C6 above their current-window floors.
4. The unit tests that pin against `dogfood/scenarios/demo/**`
   (the 10000-series) have been migrated to their own fixture
   location under `tests/fixtures/` or replaced by property-based
   generators. See `docs/scenario-partition.md` for the
   single-corpus direction.

At that point, the directory is deleted, `CLAUDE.md`'s dogfood-
specific sections are retired, and the system pivots to production
operation.

### 14.1 The ROI shape

The end-state ROI target is a **token-cost trend-line that plateaus
to a linear floor** as the canonical artifact store matures. Pointed
at a mature enterprise application and a mature ADO backlog of
thousands of test cases, the cost of generating test case `N+1`
should approach a near-constant floor — not because the resolver
has become cleverer, but because the substrate bears the weight
the resolver used to carry. Non-novel steps resolve from canon
without consulting live DOM at all.

This is the emergent consequence of two properties holding
simultaneously:

- **K5 (marginal discovery decay)** from the temporal-epistemic
  addendum: as `MemoryMaturity(τ)` grows across comparable
  cohorts, `MeanNovelty(C,τ)` monotonically decreases.
- **L2s (strong target observability)**: the substrate contains
  enough atoms that every important target has at least one
  bounded evidence path resolvable without live DOM.

If K5 is flat the plateau never arrives; the substrate keeps
growing without the resolver offloading work to it. If L2s is
local instead of strong, the resolver keeps falling back to live
DOM on non-novel steps and per-case cost grows. Both must hold;
both are measured by the two metric trees in §12. The token-cost
plateau is *observed indirectly* through M5's cohort trajectory
and C6's marginal-value accounting, not via a standalone "token
accountant" visitor.

### 14.2 The concrete target

The first production target is an enterprise OutSystems Reactive 11
application with:

- Wizard-style multi-step workflows with per-step visibility
  constraints (Tier 3 `wizard-state` projections).
- Role-based field-level authorization where the dominant
  observable is visible vs hidden vs read-only per role
  (Tier 3 `role-visibility` and `role-interaction` projections).
- Multi-party collaborative flows where entities (policies,
  projects, claims) transition through process states by way of
  approvals and rejects, with reject transitions that return the
  entity to a prior state (bidirectional `Transition` atoms with
  `reverseOf` linkage).
- A detectable runtime substrate (`runtime-family: outsystems-reactive-11`)
  whose signature bundle can be hand-authored once and promoted
  to canonical artifact status for recognition across many
  deployed applications of the same platform.

The demo harness at `dogfood/fixtures/demo-harness/` exists to
exercise these concerns in a controlled, self-contained way. It
should grow toward the target's structural profile — wizard flows,
role-based visibility, bidirectional transitions — without
hardcoding any OutSystems particulars into `lib/`. Every
OutSystems-specific behavior lives in canonical artifacts (runtime
family signatures, role projections, transition atoms) or in a
per-family specializer adapter keyed by runtime-family identity.
New runtime family coverage — a different OutSystems version, a
different platform altogether — is added by promoting new atoms
and registering a new adapter, not by editing existing source.

The cold-start ROI target implies a measurement discipline: when
the system is pointed at a fresh OutSystems application, the
discovery-fitness tree should show recognition happening within
the first cohort, the M5 cohort trajectory should show positive
slope within three comparable cohorts, and the C6 marginal-value
metric should show accepted agentic interventions earning their
seat at the table within the rolling N-run window. All three must
hold for the ROI claim to be measurable — and all three are
directly-measurable in the dual L4 metric tree from §12.

---

## 15. Glossary

- **Canon** — shorthand for "canonical sources OR canonical artifacts."
  When the doctrine says "canon," it means committed, trusted ground
  truth, regardless of which subcategory.
- **Canonical source** — an input to the pipeline. Authored by humans
  or arrived from external systems. Never produced by the pipeline.
  Forever canonical.
- **Canonical artifact** — an output the pipeline has produced and
  trusts as ground truth at runtime. Two flavors: deterministic
  observations (promoted via quality gate) and agentic overrides
  (produced via a typed `InterventionReceipt` that passed the
  auto-approval gate). Demotable when supplanted or stale. A
  pre-gate hand-authored YAML is NOT a canonical artifact — see
  "reference canon."
- **Reference canon** — the transitional population of committed
  files that are consulted at runtime as fallback ground truth but
  were authored before the gates existed. Today's
  `dogfood/knowledge/`, `dogfood/benchmarks/`, and most of
  `dogfood/controls/`. Lives in the lookup chain at slot 4, below
  both canonical-artifact flavors. Demoted one atom at a time as
  real agentic overrides and deterministic observations supplant
  it. When empty, slot 4 retires.
- **Derived output** — a candidate for promotion. Produced by a
  pipeline run, lives in `.tesseract/cache/` until promoted or wiped.
  Gitignored.
- **Phase** — a step of the pipeline (sync, parse, discovery, bind,
  iterate, fitness, score, emit). Each phase consumes typed inputs
  and produces typed outputs.
- **Phase output** — the typed artifact a phase produces. Addressable
  by `(stage, name)`. Stored at one of five lookup-chain slots.
- **Lookup chain** — the precedence order the pipeline walks when
  it needs a phase output. Slots 1-3 are committed canon; slots 4-5
  are derived.
- **Promotion** — moving a derived output (slot 4 or 5) into the
  canonical artifact store (slot 3, deterministic) when it beats the
  current canonical artifact on a quality gate.
- **Demotion** — removing a canonical artifact when it has been
  supplanted by a better one or has become stale. Always deliberate
  (operator approval required).
- **Discovery engine** — the deterministic system that derives phase
  outputs from canonical sources alone. Produces deterministic
  observations.
- **Intervention engine** — the agentic system that captures
  operator/agent answers when discovery cannot bridge a gap. Produces
  agentic overrides.
- **Cold-start mode** — `--mode cold`. Skip slots 3 and 4, run cold
  derivation. Used to challenge the discovery engine.
- **Warm-start mode** — `--mode warm` (default). Walk the full
  lookup chain, use canonical artifacts as ground truth.
- **Compare mode** — `--mode compare`. Walk the chain to load slot 3,
  then also run cold derivation, then report the diff.
- **Suite root** — the configurable directory containing all
  project-specific state. `dogfood/` in dogfood mode, `project/` (or
  a project-specific name) in production. Accessed via
  `paths.suiteRoot` in code; never hardcoded.
- **`{suiteRoot}`** — the placeholder used in this document and in
  architecture-fitness lints to refer to the suite root path.

---

## 16. Existing seams in the codebase (Phase 0b implementation guide)

This section captures the existing pipeline-stage and catalog
infrastructure that the Phase 0b implementation MUST plug into
rather than replace. It is here to prevent future sessions from
re-investigating the same surface and inventing parallel concepts
that duplicate work that already exists. This is a high-water-mark
intel snapshot — verify the file paths still hold before relying on
them.

### 16.1 The PipelineStage interface already exists

`lib/application/pipeline/stage.ts` defines a generic `PipelineStage<>`
interface with fingerprinting and persistence hooks:

```
PipelineStage<TInput, TOutput, TPersisted> {
  name: string;
  fingerprintInput?: (input: TInput) => string;
  fingerprintOutput?: (output: TOutput) => string;
  persist?: (output: TOutput) => Effect<{ result: TPersisted; rewritten: boolean }>;
}
```

`PipelineStageRunResult<>` wraps the dependencies, computed value,
persisted value, rewritten flag, and fingerprints. The Phase 0b
implementation EXTENDS this with:

- A `source` field (the `PhaseOutputSource` discriminated union)
- An `address` field (the typed `(stage, identity)` tuple from §3.6)
- The atom/composition/projection tier classification
- Hooks for the lookup chain to consult before computing

It does NOT replace this interface. Any new code that wants to
participate in the canonical artifact store routes through
`PipelineStage<>` extended with the new fields.

### 16.2 The WorkspaceCatalog is the multi-artifact indexer

`lib/application/catalog/types.ts` defines `ArtifactEnvelope<T>`:

```
ArtifactEnvelope<T> {
  artifact: T;
  artifactPath: string;
  absolutePath: string;
  fingerprint: string;
}
```

And `WorkspaceCatalog` (lines 65-103) is the loaded state of all
artifacts in the suite, indexed by ~30 artifact types (scenarios,
screen elements, screen postures, screen hints, snapshots, patterns,
routes, surfaces, controls, runbooks, datasets, benchmarks, etc.).

The Phase 0b implementation:

- Adds new artifact-envelope entries to `WorkspaceCatalog` for
  Tier 1 atoms, Tier 2 compositions, and Tier 3 projections.
- Reuses the existing `walkFiles` and catalog loading machinery
  (`workspace-catalog.ts:245-265`) rather than building parallel
  walkers.
- Adds reverse-index projections for atom-to-composition references
  and qualifier-to-projection lookups.

The catalog is loaded at the start of every iterate run. The lookup
chain consults the catalog as its slot 2/3 layer (canonical
artifacts come from the catalog). Slot 4 (live cache) is `.tesseract/cache/`
managed separately. Slot 5 (cold derivation) runs the discovery
engine in-process.

### 16.3 The phase functions in speedrun.ts are the existing phase enumeration

`lib/application/improvement/speedrun.ts` exports five phase
functions (lines 423-673):

- `generatePhase` (line 423)
- `compilePhase` (line 457)
- `iteratePhase` (line 512)
- `fitnessPhase` (line 541)
- `reportPhase` (line 614)

These are the de facto pipeline phases, even though there's no
explicit `PipelineStage` enum. The `SpeedrunProgressEvent` type
includes a `phase: 'generate' | 'compile' | 'iterate' | 'fitness' | 'complete'`
field that confirms the enumeration.

The Phase 0b implementation creates an explicit `PipelineStage` enum
that includes these five phases plus the discovery sub-phases (route,
surface, element, posture, pattern, snapshot, etc.) plus the score
and emit phases. The existing phase functions are reframed as
implementations of `PipelineStage<>` instances.

### 16.4 Discovery code is scattered, not consolidated

There is no `lib/application/discovery/` directory. Discovery code
lives in:

- `lib/application/cli/commands/discover.ts` — CLI entry point
- `lib/application/cli/commands/harvest.ts` — route harvesting
- `lib/domain/knowledge/discovery.ts` — domain types
  (`DiscoveryInput`, `DiscoverySectionArtifact`, `DiscoveryReviewNote`)
- `lib/infrastructure/tooling/discover-screen.ts` — Playwright
  screen discovery
- `lib/infrastructure/tooling/harvest-routes.ts` — route harvesting

The Phase 0b implementation establishes `lib/application/discovery/`
as the consolidation seam. Existing discovery code stays where it
is for now; new discovery sub-phase implementations land under
`lib/application/discovery/{atom-class}/` and the existing scattered
code is migrated incrementally in Phase 3.

### 16.5 No promote/demote concept exists yet

The closest existing analogue is the proposal lifecycle FSM at
`lib/domain/proposal/lifecycle.ts`:

- States: `pending`, `activated`, `blocked`
- `CertificationStatus`: `certified` | `uncertified`

Plus the auto-approval flow at
`lib/application/governance/auto-approval.ts` and
`tryActivateProposal` in `lib/application/governance/activate-proposals.ts`.

The Phase 0b implementation introduces a NEW `PromotionGate` concept
and a NEW `demote` verb. The proposal lifecycle is left intact (it
serves a different concern: what happens to a proposal once it's
been generated). The promotion machinery is its own state space,
operating on canonical artifact addresses, with its own gates per
atom class / composition sub-type / projection sub-type.

### 16.6 Path constants under {suiteRoot}/

`lib/application/paths/factory.ts` (lines 73-163) creates all
`ProjectPaths`. Notable existing paths under `{suiteRoot}/`:

- `routesDir` → `knowledge/routes/`
- `surfacesDir` → `knowledge/surfaces/`
- `patternsDir` → `knowledge/patterns/`
- `controlsDir`, `datasetsDir`, `resolutionControlsDir`, `runbooksDir`
- `benchmarksDir`
- `snapshotDir` → `.ado-sync/snapshots/`
- `archiveDir` → `.ado-sync/archive/`

The Phase 0b implementation ADDS new path constants for the
three-tier canonical artifact store layout from §10.2:

- `canonicalArtifactsDir` → `{suiteRoot}/.canonical-artifacts/`
- `atomsDir` → `{suiteRoot}/.canonical-artifacts/atoms/`
- `compositionsDir` → `{suiteRoot}/.canonical-artifacts/compositions/`
- `projectionsDir` → `{suiteRoot}/.canonical-artifacts/projections/`
- Per-tier sub-paths for agentic vs deterministic flavors
- Per-atom-class sub-paths

The existing `routesDir`, `surfacesDir`, etc. stay during the
transition. After Phase 2, the path layer routes them to the new
locations.

### 16.7 Already-existing types that map to atoms

These domain types are the actual atoms — they should NOT be
reinvented. The canonical artifact store stores instances of these
types, not parallel concepts.

| Atom class | Existing domain type | Where defined |
|---|---|---|
| Route | `RouteDefinition`, `RouteVariant`, `RoutePattern`, `RouteVariantRanking` | `lib/domain/types/routes.ts`, `lib/domain/types/route-knowledge.ts` |
| Screen | `ScreenElements` (key), `ScreenId` | `lib/domain/types/knowledge.ts`, `lib/domain/kernel/identity.ts` |
| Surface | `SurfaceDefinition`, `SurfaceSection`, `SurfaceGraph` | `lib/domain/types/knowledge.ts` |
| Element | `ElementSig`, `ScreenElements` (entries), `CanonicalTargetRef` | `lib/domain/types/knowledge.ts`, `lib/domain/kernel/ids.ts` |
| Posture | `Posture`, `PostureId` | `lib/domain/types/knowledge.ts` |
| Affordance | `ElementAffordance` | `lib/domain/types/affordance.ts` |
| Selector | `SelectorProbe`, `SelectorCanonEntry`, `SelectorCanon` | `lib/domain/types/interface.ts` |
| Pattern | Pattern documents (Zod-validated) | `lib/domain/knowledge/patterns.ts` |
| Snapshot | `SnapshotTemplate` | `lib/domain/types/knowledge.ts` |
| Transition | `TransitionObservation` | `lib/domain/types/interface.ts` |
| Observation predicate | `ObservationPredicate`, `StatePredicateSemantics` | `lib/domain/types/knowledge.ts` |
| Drift mode | (currently embedded in benchmark `driftEvents`) | new domain type needed |
| Resolution override | (currently in `controls/resolution/*.resolution.yaml`) | new domain type needed |

The Phase 0b implementation references these types directly — it
defines the atom envelope as `Atom<T>` where T is one of the
existing types, and the atom store loads existing files into typed
envelopes without reshaping the underlying content.

### 16.8 Already-existing types that map to compositions

| Composition sub-type | Existing domain type | Where defined |
|---|---|---|
| Workflow archetype | `WorkflowArchetype` | `lib/domain/synthesis/workflow-archetype.ts` |
| Flow | (embedded in benchmark `flows` blocks) | new domain type needed |
| Runbook | (loaded from `controls/runbooks/*.runbook.yaml`) | existing schema, new typed wrapper |
| Route graph | `ApplicationInterfaceGraph` (for the SUT-wide graph) | `lib/domain/types/interface.ts` |
| Expansion rule | (embedded in benchmark `expansionRules`) | new domain type needed |
| Surface composition | `SurfaceGraph` (multi-surface relationships) | `lib/domain/types/knowledge.ts` |
| Recipe template | (does not exist) | new, future |

### 16.9 Already-existing types that map to projections

The projection tier is the most greenfield. Existing types are
limited:

| Projection sub-type | Existing domain type | Where defined |
|---|---|---|
| Role visibility | (does not exist) | new |
| Role interaction | (does not exist) | new |
| Wizard state | (partially: `StatePredicateSemantics`, observation predicates) | partial |
| Permission group | (does not exist) | new |
| Posture availability | (does not exist) | new |
| Process state | (does not exist) | new |
| Feature flag | (does not exist) | new |

The Phase 0b implementation defines the projection envelope shape
and the qualifier-aware lookup chain interface, but the actual
projection authoring/discovery is mostly stub. Real projection
discovery comes in later phases when the agency layer learns how
to run the SUT under different qualifier contexts.

### 16.10 The hub types from the dependency topology

From `docs/domain-class-decomposition.md`:

- `workflow` (13 dependents) — defines governance brands, confidence
  levels, envelope protocol, pipeline stages. The shared vocabulary.
- `knowledge` (6 dependents) — screen elements, hints, postures,
  surfaces, confidence overlays.
- `resolution` (5 dependents) — translation, grounding, task packets,
  run plans.
- `intent` (4 dependents) — scenarios, steps, value refs.
- `interface` (3 dependents) — interface graph, selectors, discovery.

The Phase 0b implementation adds new types under `lib/domain/pipeline/`
that depend on `workflow` (for envelope and source brands), `knowledge`
(for atom content types), and `interface` (for the route/selector atom
content). This places `pipeline` as a NEW hub at roughly the same
dependency level as `resolution` — it depends on the shared vocabulary
and on the structural domain types but is upstream of execution and
improvement.

---

*End of doctrine. This document is the authoritative reference for
the canon/derivation model. When in doubt, consult this document
before acting. When this document is in doubt, edit it deliberately
and commit the change with the implementation that motivated it.*

*High-water-mark note: the §16 implementation guide is a snapshot
of the codebase intel as of the doctrine's authorship. Verify file
paths and type names still hold before relying on them — the
codebase moves under the doctrine's feet, and rewriting §16 to
match new realities is a normal maintenance task.*
