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

2. **Canonical artifacts** — what the system has produced and is
   committed to using as ground truth until a better artifact replaces
   it. Two flavors with a defined relationship: **deterministic
   observations** (produced by the discovery engine and promoted via a
   quality gate) and **agentic overrides** (produced by an agent or
   operator to bridge a gap the deterministic engine cannot bridge).
   Both are committed and have doctrinal weight.

3. **Derived output** — what the system produces ephemerally during a
   run that has not been promoted to canonical artifact status. Run
   records, fitness reports, live caches, candidate phase outputs that
   might become canonical artifacts on the next promotion cycle.
   Gitignored, regenerable, disposable.

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
4. Derived output — what the system produces ephemerally
5. The phase output model
6. The lookup precedence chain
7. Promotion and demotion
8. Cold-start and warm-start interop
9. Two parallel engines
10. Directory layout convention
11. Classification table for the dogfood suite
12. Two metric trees
13. Operator workflows
14. Long-term vision
15. Glossary

---

## 1. The trichotomy

| Population | Authorship | Trusted as ground truth? | Committed? | Wiped by `tesseract reset`? |
|---|---|---|---|---|
| **Canonical sources** | Operator, external upstream, the SUT itself | Yes — they ARE truth | Always | Never (would destroy the project) |
| **Canonical artifacts** | The system, then promoted via quality gate or operator/agent decree | Yes — until something better replaces them | Always | Only via deliberate `--demote` or `--reset-artifacts` |
| **Derived output** | The system, transient | No — they are candidates | Only when an operator deliberately checkpoints them | Yes, freely |

The first two populations are committed. The third is gitignored. That
is the rule and there are no exceptions.

The load-bearing distinction is between **canonical artifacts** and
**derived output**. They are both produced by the system, but they have
fundamentally different doctrinal status. A canonical artifact is what
the pipeline READS at runtime; derived output is what the pipeline
WRITES at runtime. The promotion mechanism (§7) is the bridge: derived
output that passes a quality gate becomes a canonical artifact. The
demotion mechanism is the inverse: a canonical artifact that has been
supplanted by a better one (or that has become stale) is removed.

A common mistake is to call canonical artifacts "high-water-mark caches"
or "best-known snapshots." This is wrong. A canonical artifact is not a
cache. It is committed code-of-record that the pipeline trusts. The fact
that it can be replaced over time does not make it cache — it makes it
versioned canon. Caches are gitignored; canonical artifacts are not.

The other common mistake is to flatten canonical sources and canonical
artifacts into a single "canon" category. They differ in authorship and
in lifecycle. Canonical sources are AUTHORED by humans or arrive from
external systems and the system never produces them. Canonical artifacts
are PRODUCED by the system through a chain of derivations and
promotions. Both are trusted, but they have different governance:
canonical sources change only when a human edits them or an upstream
sync arrives; canonical artifacts change when the system produces a
better candidate and promotes it.

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

A canonical artifact is something the system produced that has been
elevated to ground-truth status through a deliberate gate (a quality
metric, a human review, an automated promotion rule). Once a canonical
artifact exists, the pipeline READS from it at runtime and treats it as
truth. Canonical artifacts are committed to git because they have
doctrinal weight: they are not "convenience caches," they are the
system's accumulated, trusted understanding of the SUT.

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
  source: PhaseOutputSource;     // operator-override | agent-override |
                                 // deterministic-observation | live-derivation | cold-derivation
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
| `{suiteRoot}/controls/<phase>/<name>` | Canonical source (operator answers about intent) | Operator override |
| `{suiteRoot}/.canonical-artifacts/agentic/<phase>/<name>` | Canonical artifact (agentic flavor) | Agentic override |
| `{suiteRoot}/.canonical-artifacts/deterministic/<phase>/<name>` | Canonical artifact (deterministic flavor) | Deterministic observation |
| `.tesseract/cache/<phase>/<name>` | Derived output (live cache) | Live derivation |
| (in-process) | Derived output (cold derivation) | Cold derivation |

The `.canonical-artifacts/` directory is committed. Its two
subdirectories (`agentic/` and `deterministic/`) make the doctrinal
flavor visible at the path level: an operator looking at git can tell
at a glance which artifacts are agent-authored vs which were promoted
from deterministic derivations.

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
has five slots, organized by population:

| Slot | Population | Source | Where it lives | Lifecycle |
|---|---|---|---|---|
| 1 | canonical source | Operator override | `{suiteRoot}/controls/<phase>/<name>` | Forever, until operator deletes |
| 2 | canonical artifact | Agentic override | `{suiteRoot}/.canonical-artifacts/agentic/<phase>/<name>` | Until demoted via human review |
| 3 | canonical artifact | Deterministic observation | `{suiteRoot}/.canonical-artifacts/deterministic/<phase>/<name>` | Until replaced by a better promotion |
| 4 | derived output | Live derivation | `.tesseract/cache/<phase>/<name>` | Per-run, regenerated on demand |
| 5 | derived output | Cold derivation | (in-process) | Per-invocation, never persisted |

The doctrinal partition aligns with the slot numbering: slot 1 is a
canonical SOURCE; slots 2-3 are canonical ARTIFACTS; slots 4-5 are
DERIVED. The pipeline trusts slots 1-3 as ground truth at runtime;
slots 4-5 are candidates for promotion.

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

### 6.3 Why deterministic observations outrank live derivation

Slot 3 outranks slot 4 because deterministic observations have passed
a quality gate and have been promoted to canonical artifact status.
Live derivations are candidates that have not yet been evaluated for
promotion. Trusting an unevaluated candidate over a promoted artifact
would be a regression.

### 6.4 Why live derivation outranks cold derivation

Slot 4 outranks slot 5 because the live cache is faster than running
the discovery engine. If the live cache is present and its
`inputFingerprint` matches the current inputs, it is byte-equivalent
to what cold derivation would produce, and there is no reason to
recompute.

### 6.5 Modes that change the precedence

The default precedence (1 → 2 → 3 → 4 → 5) can be adjusted by mode
flags:

- **`--mode warm`** (default): walk the full chain in order.
- **`--mode cold`**: skip slots 3 and 4. Run cold derivation while
  still respecting operator overrides (slot 1) and agentic overrides
  (slot 2). Used to challenge the discovery engine without throwing
  away operator intent.
- **`--mode compare`**: walk the chain to load slot 3 (deterministic
  observation), then ALSO run cold derivation, then report the diff.
  Does not promote anything. Used to measure how close the discovery
  engine is to the current canonical artifact.
- **`--no-overrides`**: also skip slots 1 and 2. Used in extreme
  cold-start runs that test whether the discovery engine alone is
  sufficient. The combination `--mode cold --no-overrides` is the
  strongest cold-start test.

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

### 9.2 The agentic intervention engine (agentic override authoring)

The agentic intervention engine handles the gaps the discovery engine
cannot bridge. When discovery fails, an agent is asked to provide a
hint, override, or insight. The agent's answer is captured as either
an operator override (slot 1, canonical source) or an agentic
override (slot 2, canonical artifact, demotable).

A good intervention engine asks the operator the right questions at
the right times, captures answers in the right slot, and proposes
demotions when interventions become stale. It is judged by:

- **Operator burden** (operator-intervention-density in the L4 tree).
  Lower is better.
- **Question quality**: are the questions specific and answerable?
- **Demotion accuracy**: when it proposes a demotion, is it correct?
- **Intervention longevity**: how long does an intervention stay
  relevant before being demoted? Longer is better.

The intervention engine code lives in `lib/application/agency/` (or
wherever the agency namespace lands). It is the warm-start arm of the
self-improvement loop.

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

These are committed and treated as canon:

```
{suiteRoot}/
  fixtures/
    ado/                              # canonical source: simulated upstream (dogfood)
                                      # — in production this directory does not exist; the
                                      # canonical source is the .ado-sync/ persisted record below
      <hand-curated IDs>.json
    demo-harness/                     # canonical source: the SUT in dogfood mode
                                      # (absent in production — SUT is external)

  controls/                           # canonical source: operator answers about intent
    resolution/
    runbooks/
    datasets/
    variance/

  benchmarks/                         # canonical source: labeled measurement targets

  .canonical-artifacts/               # canonical artifacts (committed, doctrinal weight)
    agentic/                          # — agentic overrides (slot 2)
      routes/
      surfaces/
      components/
      posture/
      screens/
      patterns/
      snapshots/
    deterministic/                    # — deterministic observations (slot 3)
      routes/
      surfaces/
      components/
      posture/
      screens/
      patterns/
      snapshots/

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
under `dogfood/`. Each row maps a path to its trichotomy population
and notes the migration action (if any) needed to bring the current
state into doctrinal alignment.

| Path | Population | Verdict | Migration |
|---|---|---|---|
| `dogfood/fixtures/ado/{10001,10002,10010,10011}.json` | canonical source | the operator's stand-in upstream | stays committed |
| `dogfood/fixtures/ado/{2xxxx}.json` | derived | cohort generator output | move to `.tesseract/cache/` or gitignore in place |
| `dogfood/fixtures/demo-harness/**` | canonical source | the SUT in dogfood mode | stays committed |
| `dogfood/.ado-sync/snapshots/{10001,10002,10010,10011}.json` | derived (in dogfood) | cache of `fixtures/ado/` | gitignore in dogfood; in production this becomes canonical source |
| `dogfood/.ado-sync/snapshots/{2xxxx}.json` | derived | cohort sync cache | gitignore |
| `dogfood/.ado-sync/archive/{10001,10002,10010,10011}/N.json` | canonical source | revision history of the operator-authored simulator | stays committed |
| `dogfood/.ado-sync/archive/{2xxxx}/N.json` | derived | synthetic cohort revision history | gitignore |
| `dogfood/.ado-sync/manifest.json` | derived | auto-maintained sync metadata | gitignore |
| `dogfood/benchmarks/*.benchmark.yaml` | canonical source | operator-authored measurement targets | stays committed |
| `dogfood/controls/datasets/*` | canonical source | operator-authored data values | stays committed |
| `dogfood/controls/resolution/*` | canonical source | operator-authored resolution overrides | stays committed |
| `dogfood/controls/runbooks/*` | canonical source | operator-authored execution recipes | stays committed |
| `dogfood/controls/variance/*` | canonical source | operator-authored stress configs | stays committed |
| `dogfood/scenarios/demo/**` | derived | should be derivable from `.ado-sync/snapshots/{10001,10002,10010,10011}.json` via parse phase | gitignore (after parser migration) |
| `dogfood/scenarios/reference/**` | derived | cohort generator output | gitignore |
| `dogfood/knowledge/screens/**` | canonical artifact (transitional) | substrate currently entangling agentic overrides and deterministic observations | move to `.canonical-artifacts/{agentic,deterministic}/screens/` after a one-time per-file split |
| `dogfood/knowledge/patterns/**` | canonical artifact (transitional) | same | move similarly |
| `dogfood/knowledge/snapshots/**` | canonical artifact (transitional) | same | move similarly |
| `dogfood/knowledge/routes/demo.routes.yaml` | canonical artifact (agentic, transitional) | currently hand-authored; eventually a deterministic observation when route discovery matures | move to `.canonical-artifacts/agentic/routes/demo.json` |
| `dogfood/knowledge/surfaces/*.surface.yaml` | canonical artifact (agentic, transitional) | same | move to `.canonical-artifacts/agentic/surfaces/` |
| `dogfood/knowledge/components/*.ts` | canonical source | TypeScript widget choreography code | long-term moves to `lib/`; near-term stays committed |
| `dogfood/generated/**` | derived | playwright spec emission | gitignore |
| `dogfood/posture.yaml` | (does not exist) | the `postureConfigPath` concept is being deleted | replace with CLI flag |

The transitional canonical artifact rows are the load-bearing
migration: today they are committed at `dogfood/knowledge/{routes,surfaces,...}/`,
but they belong in `dogfood/.canonical-artifacts/{agentic,deterministic}/`
once Phase 2 lands. The pipeline path layer routes them to the new
location and the lookup chain treats them as the doctrinal slot 2 or
slot 3 artifact they actually are.

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
phase outputs from cold. Root metrics (initial set):

- `discovery-route-fidelity` — how close are cold-derived routes to
  the canonical artifact? (higher is better)
- `discovery-surface-fidelity` — same for surfaces
- `discovery-component-fidelity` — same for components
- `discovery-substrate-fidelity` — how close is cold-derived substrate
  (after iterate convergence) to the canonical artifact substrate?
- `discovery-coverage` — what fraction of canonical artifacts does the
  discovery engine produce at all? (higher is better)
- `intervention-graduation-rate` — what fraction of agentic overrides
  has been demoted because the deterministic engine caught up?
  (higher is better, but should be slow and steady)

It answers: **how close is cold-start to warm-start?** It is the
gradient signal for changes to the discovery engine and to the
agentic intervention system.

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
3. The canonical sources are: pipeline code, doctrine, controls,
   benchmarks, and the `.ado-sync/` persisted upstream record. No
   simulator.
4. The canonical artifacts are populated entirely by the discovery
   engine (deterministic observations) and a small set of agentic
   overrides for genuinely novel intent.
5. The operator's day-to-day experience is: edit pipeline code,
   run iterate against real ADO + real SUT, watch the canonical
   artifact store evolve as the system learns.

The trichotomy survives this transition unchanged. The names of
files, the locations of directories, and the verbs operators run
all remain the same. What changes is the SOURCE of the canonical
sources (real ADO instead of simulator) and the SIZE of the canonical
artifact store (smaller, because real upstream means more discovery
opportunities).

The dogfood mode is the system's training environment. The trichotomy
must hold in dogfood for it to hold in production. Every doctrinal
correctness fix that lands during dogfood development is a free
correctness fix for the production deployment.

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
  (authored by an agent or operator). Demotable when supplanted or
  stale.
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

*End of doctrine. This document is the authoritative reference for
the canon/derivation model. When in doubt, consult this document
before acting. When this document is in doubt, edit it deliberately
and commit the change with the implementation that motivated it.*
