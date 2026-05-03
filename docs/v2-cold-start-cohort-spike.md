# Cold-Start Cohort Spike — Public AUTs as a Clean-Room Forcing Function

> Status: research-spike proposal (2026-05-01). No code has landed
> against this proposal; the document exists so that subsequent
> sessions can reference its essence rather than rediscover it.
> Orthogonal to Z11g (substrate ladder) and Z11d (live reasoning
> adapter); composes with both. Reads on top of
> `docs/v2-substrate-ladder-plan.md`, `docs/v2-probe-ir-spike.md`,
> and the Generalization Gauge framing in `docs/dashboard-vision.md`
> (Part II, View 5, line 120) and `docs/moonshots.md §5`.

## 0. The verdict in one sentence

**Stand up a small set of publicly accessible web applications,
partition them once and irrevocably into a training side and a
held-out side, author hand-written ADO-shaped test cases against
each, run the product end-to-end under `--posture cold-start`, let
the training side feed the existing handoff → probe → activation
pipeline, and reserve the held-out side as a clean-room
generalization test that the canon-graduation pipeline never sees
until measurement time — so that "progressively ready to cold-start
a variety of AUTs" becomes the gap between training-side hit rate
and held-out hit rate, not a single number that conflates
memorization with learning.**

## 1. The framing — this is an ML-training ecosystem

The repo already names the analogy. `docs/dashboard-vision.md`
View 5 calls out a Generalization Gauge: "A system that scores 95%
on training and 60% on held-out is memorizing, not learning."
`docs/moonshots.md §5` warns that cross-app transfer must avoid
"overfitting to prompt lore or collapsing distinct business
semantics into generic UI cliches." The seven-visitor metric tree
already separates measurement from authorship. The trust-policy
gate already separates canon-graduation from canon-application.
The vocabulary is in place; this spike just operationalizes it.

The mapping is precise:

| ML training ecosystem | Tesseract analogue |
|---|---|
| Training set | AUTs the canon-graduation pipeline is allowed to see |
| Held-out / validation set | AUTs the canon-graduation pipeline must never see until measurement |
| Model weights | Activated canon (facets, matchers, intent phrases, patterns) |
| Training step | Cold-start run on a training AUT → handoff → probe → graduation |
| Memorization | Canon that only fires on the AUT that produced it |
| Generalization | Canon that fires on AUTs the system has never seen |
| Data leakage | Held-out AUT seen by the canon-graduation pipeline at any time before evaluation |
| Overfitting | Canon hit rate diverges: high on training, low on held-out |

The point of writing the analogy out is to inherit ML's hard-won
discipline about *what counts as honest measurement*. The
discipline that follows from "this is a training ecosystem":

- Training and held-out partitions are decided **once, in advance**,
  and crossing them is a methodological failure, not a tradeoff.
- Held-out evaluation is a **single-use measurement** per AUT: once
  the agent has cold-started against a held-out AUT, that AUT's
  evaluation result is consumed. Re-running it on the same canon
  state tells you the same thing; running it after canon has
  graduated against any of *its* surfaces tells you something
  contaminated.
- A held-out AUT that gets "promoted" to training is allowed, but
  it is **gone from held-out forever** once it crosses. Symmetric
  promotion (training → held-out) is forbidden.
- The cohort always has held-out room, even at small N. Spending
  all your AUTs on training leaves you with no honest evaluation.

## 2. The two questions this spike asks

The training-side question:

**When the agent confronts a real, foreign DOM with real chrome
entropy, real semantic ambiguity, and real ARIA imperfection,
under cold-start posture, where does it actually fail, and what
does the structure of those failures teach the canon?**

The held-out question:

**Once the canon has graduated from training-side AUTs, how much of
that canon transfers to AUTs the canon-graduation pipeline has
never seen?**

The first question is what the synthetic app cannot answer because
its surfaces source from the catalog (the answer key is in the
training data). The second question is what the training side
alone cannot answer because the AUT is in the training set. Both
are necessary; neither is sufficient.

## 3. The leverage mechanism — why this compounds

The compounding loop is already wired and unchanged. This spike
contributes one new training input source and one new held-out
measurement; it adds no new pipeline.

Training side:

1. The agent attempts a hand-authored ADO test case against a
   **training** AUT under `--posture cold-start`.
2. Every gap emits an `InterventionHandoff` per the CLAUDE.md
   doctrine.
3. Each handoff is a probe seed.
4. Probes that stay green graduate canon through the trust-policy
   gate at `product/application/policy/trust-policy.ts`.

Held-out side:

5. After canon graduates from training, the agent attempts the
   pre-authored ADO test cases for the **held-out** AUT under
   `--posture cold-start`.
6. The fraction resolved without intervention is the held-out hit
   rate.
7. The gap between training hit rate and held-out hit rate is the
   memorization-vs-learning signal that
   `docs/dashboard-vision.md` View 5 already prescribes.

Recurring gaps across training AUTs are generic-tier deficiencies
(highest-leverage probe seeds). Gaps unique to one training AUT
are specific-tier patterns. Held-out failures decompose the same
way and are the most honest source of "what the system has not yet
learned."

## 4. Design discipline

Four commitments make the spike honest. Three are operational; the
fourth is the clean-room rule.

### 4.1 Cold-start posture is the primary mode

`--posture cold-start` is non-negotiable for headline measurement.
Warm-start runs are diagnostics — useful for understanding what
canon would have helped, not for claiming progress. The whole
point is to test the discovery instruments without their training
wheels.

**What "cold-start" means today, precisely.** Cold-start has three
floors stacked one inside the next, and the cohort's signal level
is determined by the topmost floor that has been raised:

- **Floor A — heuristic classifier (Z11a.5, current).** The
  classifier accepts or rejects ADO step text without consulting
  any catalog or live reasoner. A `would-resolve` verdict here
  is a classifier-acceptance verdict, not a binding-success
  verdict. The TodoMVC journal
  (`docs/v2-cold-start-todomvc-journal.md` Entry 5) confirmed
  9/9 steps classify as `would-resolve` while exposing two
  generic-tier deficiencies (role flattening, `press`-as-`click`).
- **Floor B — real compile pipeline + deterministic reasoning +
  empty catalog.** The full parse → bind → emit path runs but
  the binder hits the 7th lookup slot (`needs-human`) for
  nearly any step because nothing in the lookup chain can
  resolve the prose. This is the floor the customer-backlog
  README (lines 24–37) names as "mostly zero confirmation rate
  under Z11a." Useful for measuring escalation correctness
  (`needs-human` corpus); the cohort's intended diagnostic
  signal sits above it.
- **Floor C — real compile pipeline + Z11d live reasoning + empty
  catalog.** This is the floor the spike's hypothesised first
  move depends on. The live reasoner can resolve "Identifier
  field" → the synthetic-app's `login-form` textbox; the
  cohort's handoff log becomes diagnostic rather than uniform.

The cohort can begin operating today against Floor A and produce
real evidence — about the classifier, not about the pipeline as a
whole. That evidence is downstream-useful: every probe seeded
under Floor A becomes a regression test under Floor C.

The headline metric (training hit rate, held-out hit rate,
generalization gap) is computed at whichever floor is currently
operative; receipts must carry the floor's identity
(`reasoningFloor: 'heuristic-z11a5' | 'deterministic-empty-catalog'
| 'live-empty-catalog'`) so cross-floor comparisons are not
silently performed.

### 4.2 Snapshot-once, replay-forever

The first pass against any AUT runs live. Every subsequent
benchmark run replays from a captured snapshot. Live re-fetches
are a deliberate refresh event with their own ledger entry, not
the default cadence.

This kills site drift as a noise source while preserving the
realism gain. It also means an AUT, once captured, becomes a
permanent rung-2 fixture — the cohort backfills the
fixture-replay corpus for free.

### 4.3 A diversity ladder, not a single site

Diversity is the leverage; size is not. Three AUTs in different
shapes teach you what generalizes. The cohort is therefore
defined by its variety axes (chrome density, ARIA quality,
state-machine complexity, framework substrate), not its count.

### 4.4 The clean-room rule

This is the spine of the whole memo. It has six corollaries.

**C1. Partition is declared before contact.** Each AUT enters the
cohort with a label (`training` or `held-out`) declared in a
manifest entry committed *before* the agent or the
canon-graduation pipeline observes the AUT in any way. The
operator may inspect the AUT to author ADO test cases; the
canon-graduation pipeline may not.

**C2. The held-out partition is firewalled from canon graduation.**
Probes derived from a held-out AUT's handoffs MUST NOT graduate
canon. The simplest enforcement: held-out runs execute under a
sub-mode (`--cohort-role held-out`) that the trust-policy gate
recognizes as a no-write context. A held-out run produces only a
scorecard receipt; no canon entries, no probe activations.

**C3. Held-out AUTs are single-use per canon state.** Each
held-out evaluation produces one scorecard receipt tagged with
the canon's fingerprint at evaluation time. Re-running the same
held-out AUT against the same canon fingerprint is a no-op
(produces a duplicate receipt). Running it against a *new* canon
fingerprint is fine — that's the point.

**C4. Promotion is one-way.** Held-out AUTs may be reclassified
as training (and their snapshots fed into the canon-graduation
pipeline), but a training AUT may never become a held-out AUT.
Once the canon has been allowed to graduate against an AUT's
surfaces, that AUT's signal is forever contaminated for
generalization measurement.

**C5. Operator authoring of held-out tests is allowed but
disciplined.** A human inevitably inspects the held-out AUT to
author its ADO test cases. This is acceptable because the agent
is what we are measuring. The discipline:
- Held-out tests should be authored as a senior QA analyst would
  author them, blind to current canon contents.
- A held-out test should be authored to exercise a *capability*
  ("the system should be able to fill a labelled form"), not a
  *known-canon shortcut* ("the system already has a `text-input`
  facet for this exact role-name combination").
- The aspiration (not required for this spike): a different
  operator authors held-out tests than the one curating canon.

**C6. The clean-room is recoverable, not preserved.** Operators
will make mistakes. If a held-out AUT leaks into canon
graduation by accident, the response is: log the contamination
event, demote the AUT to training, refuse to report a held-out
hit rate that includes it, and acquire a new held-out AUT to
replace it. Pretending the leak didn't happen is the only
unrecoverable failure.

## 5. The diversity ladder, partitioned

The minimum viable cohort is **two training AUTs + one held-out
AUT**. Smaller than that, the generalization gauge has no
denominator. The proposed first cohort:

Training side (canon may graduate from these):

- **TodoMVC**. Originally framed in this doc as the trivial sanity
  rung; the journal at
  `docs/v2-cold-start-todomvc-journal.md` Entries 3 + 27 corrected
  that framing on two passes. TodoMVC is small but **not** clean
  and **not** trivial:
  - Four real ARIA imperfections (anonymous destroy buttons with
    no accessible name, per-todo `<label>` elements with no `for`
    attribute, no `aria-current` on the selected filter, no
    explicit landmark roles).
  - **Multi-state semantics** — most test cases presuppose ≥1
    todo exists, but TodoMVC hides the toggle-all checkbox and
    the footer (filter links + clear-completed) via CSS when no
    todos exist. The cohort spike's runner discovered this only
    after six cycles of trying to probe initial-state surfaces;
    Probe Seed 8 (Phase B) exists because of TodoMVC.
  - **Empirically harder than the held-out httpbin form** for
    this cohort's stack. Cycle 5+6 measurements showed TodoMVC
    plateaus at ~56% match rate while httpbin reaches ~89%; the
    diversity-ladder ordering should not be assumed by app-shape.
  TodoMVC is a forcing function, not a sanity check; the cohort's
  hardest training-side blockers (Probe Seeds 1, 2, 7, 8) all
  surfaced from it.
- **Swagger Petstore** or **Postman Echo**. Multi-screen, real
  validation, real asynchrony, but still author-friendly chrome.

Held-out side (canon must NOT graduate from this until promoted):

- **A public OutSystems Reactive demo.** OutSystems publishes
  several. Reserving this rung as held-out has two effects: it
  bridges the cohort to Z11g rung-4 work without contaminating
  the rung-4 evaluation, *and* it puts the highest-signal AUT
  (real Reactive substrate) on the side of the firewall that
  produces the most informative generalization measurement.

Optional fourth (decision deferred):

- **A deliberately messy real-world site.** Initial classification:
  held-out. The decision to keep it held-out vs. promote to
  training is downstream of the first cohort's evidence.

The partition above is a proposal, not a decree. The operator's
final partition decision lands in the cohort manifest before any
agent contact with any AUT.

## 6. The metrics — two numbers, one gauge

The cohort's headline is not "% test cases passed" or "% probes
green." Those are diagnostic. The headline is the pair, and the
gap between them.

**Training hit rate.** For the AUTs the canon-graduation pipeline
has been allowed to see, what fraction of cold-start ADO test
cases resolve without an `InterventionHandoff`?

**Held-out hit rate.** For the AUTs the canon-graduation pipeline
has not been allowed to see, what fraction of cold-start ADO
test cases resolve without an `InterventionHandoff`?

**Generalization gap.** `training_hit_rate − held_out_hit_rate`,
reported alongside both numbers. This is the operationalization
of `docs/dashboard-vision.md` View 5's Generalization Gauge.

A floor and a target:
- Floor: held-out hit rate above zero (the system can resolve
  *something* on an AUT it's never seen).
- Direction: held-out hit rate trends up as training cohort
  grows, while the gap stays bounded. A growing gap is a
  memorization signal.
- Threshold-setting: deferred to the trust policy after the first
  three-AUT cohort produces real numbers. Picking a threshold
  before measuring is theatre.

These two numbers compose with the existing seven-visitor metric
tree. M5 (memory-worthiness ratio) measured across the AUT axis
*is* the held-out hit rate. The cohort doesn't add a new metric
visitor; it adds a new cohort key the existing visitors can
group by.

## 7. Where this fits the active plan

This is a horizontal axis (AUT diversity) crossing the substrate
ladder's vertical axis (substrate fidelity).

- **Z11g (substrate ladder).** The cohort's rungs sit at the
  rung-2 / rung-3 junction: every captured AUT becomes a rung-2
  fixture; the live first-pass run is a rung-3 execution against
  a foreign substrate. Reserving the public OutSystems demo as
  held-out means it can later inform Z11g rung-4 *evaluation*
  without contaminating Z11g rung-4 *training*.
- **Z11d (live reasoning adapter).** Orthogonal. The cohort
  benefits from live reasoning but does not require it.
- **Z11f (substrate study).** The cohort's training side feeds
  Z11f with real-OutSystems handoffs cheaply, *only if the
  OutSystems AUT is on the training side*. If it remains
  held-out (the proposal above), Z11f sources its evidence
  elsewhere and the held-out AUT continues to serve evaluation.
- **Customer-backlog** (`workshop/customer-backlog/`) already
  accepts arbitrary `AdoSnapshot`/`AdoStep` shapes. The cohort
  extends this with a third cohort directory:
  `workshop/customer-backlog/public-aut/<aut-name>/` holding the
  cohort manifest entry (with the partition label),  the
  ADO-shaped fixtures, captured DOM, scorecard, and the
  recurring-gap log.
- **Dashboard.** The Generalization Gauge in
  `docs/dashboard-vision.md` View 5 has its inputs once this
  spike lands. The dashboard widget is downstream of the
  scorecard producing the two numbers.

## 8. The smallest concrete first move

Before the cohort exists as a structure, one experiment runs
against one training AUT and reports back. The held-out side is
**designated but untouched**. The experiment's only job is to
discover what the recurring-gap log actually looks like.

The experiment:

1. **Designate the partition** in a one-line cohort manifest
   stub (committed before any agent contact):
   - Training: TodoMVC.
   - Held-out: a public OutSystems Reactive demo (specific URL
     to be agreed with the operator).
2. **Author 3 ADO-shaped test cases by hand** for TodoMVC, of
   escalating ambition (add a todo, mark complete, filter
   active). Author 3 ADO-shaped test cases by hand for the
   held-out OutSystems demo, *but do not run them*. Authoring
   them now under operator inspection seeds the held-out
   measurement with no leak — because operator inspection is C5,
   and the agent / canon-graduation pipeline still has not seen
   the AUT.
3. **Run cold-start against TodoMVC** (training side) at whichever
   cold-start floor (§4.1) is currently operative. Capture
   classifier verdicts under Floor A; capture
   `InterventionHandoff`s + `ReasoningReceipt`s + full
   resolution-receipt log under Floor B/C. The journal at
   `docs/v2-cold-start-todomvc-journal.md` Entries 5–6 executes
   this step under Floor A and reports the result: 9/9
   classifier-acceptance verdicts, two named generic-tier probe
   seeds (role flattening, `press`-as-`click`), zero
   `InterventionHandoff`s emitted because the heuristic
   classifier never reaches the binder.
4. **Do not run held-out yet.** Held-out evaluation is reserved
   for *after* the cohort has at least two training AUTs that
   have produced graduated canon, and *after* at least Floor C
   is operative. With one training AUT under Floor A, the
   held-out measurement has nothing to generalize from.
5. **Report**, in a single memo:
   - what the agent succeeded at without canon
   - what it failed at, classified by handoff family
   - which failures look generic-tier vs. specific-tier
   - what shape the recurring-gap log will need to take
   - whether snapshot-once-replay-forever is mechanically possible
     with the current Playwright bridge, or whether new
     instrumentation is needed
   - whether the cohort manifest needs additional fields beyond
     `{name, url, partition, snapshot-fingerprint}`

The experiment does **not** activate any held-out evaluation,
modify the trust policy, or commit anything beyond the cohort
manifest stub and the experiment's report. Its product is
evidence, not infrastructure. Infrastructure follows once we know
what the evidence actually contains.

## 9. What success looks like for the spike itself

The spike succeeds if it produces, in order of importance:

1. A handoff log from a real training AUT, classified well enough
   that the gap structure is legible.
2. A clear statement of which existing pipeline pieces held up
   under real entropy and which broke or required workarounds.
3. A revised cohort design — the present §4 / §5 are hypotheses;
   the spike's evidence either confirms them or names what's
   wrong with them.
4. A first cut at a recurring-gap taxonomy, named precisely
   enough to be probe seeds.
5. A confirmation that the clean-room rule (§4.4) is mechanically
   implementable: can `--cohort-role held-out` actually be
   plumbed as a no-write context, or do new architecture-law
   tests need to land first?

The spike fails if any of: cold-start cannot run end-to-end
against a foreign DOM at all; handoffs aren't emitted where they
should be; the resolution-receipt log is unreadable; the
ADO-shaped fixture format is too rigid for hand-authoring against
a real site; or the held-out firewall cannot be implemented
without disturbing the canon-graduation pipeline. Each of these
failures is itself a high-value finding.

## 10. What this spike explicitly does not solve

- **Replacing rung-4.** The cohort does not displace
  Reactive-OutSystems distillation. A public OutSystems demo as
  held-out is a *generalization probe*, not a substitute for a
  customer DOM with customer widgets and customer telemetry.
- **The generalization-gap threshold.** The spike does not pick
  the policy threshold at which the gap is "small enough." That
  number lives downstream of the first three AUTs landing.
- **Held-out replenishment.** The spike does not specify how new
  held-out AUTs enter the cohort once existing ones get promoted
  or burn down. That governance question has answers, but they
  are downstream of evidence.
- **TOS / robots.txt / scraping ethics.** Site selection prefers
  apps explicitly intended for testing or demonstration
  (TodoMVC, Petstore, Postman Echo, OutSystems-published demos).
  This is a constraint on cohort membership.
- **Operator-authorship leakage.** §4.4 C5 names the discipline
  but does not formally enforce blind authorship. The
  enforcement aspiration is downstream; the spike accepts
  honest-effort blindness.
- **Cross-canon contamination.** The spike measures one canon
  state at one point in time. Comparing held-out scores across
  canon evolutions is downstream once the metric tree's cohort
  axis is wired.

## 11. The journal-revision-code cycle as the nascent self-improvement loop

The TodoMVC experiment + this revision is itself an instance of
the workshop's self-referential feedback loop, executed manually
with a human-in-the-loop instead of the automated machinery the
compounding engine plan describes.

`docs/v2-compounding-engine-plan.md §1.1` enumerates the eight
behaviours the workshop will exhibit once the engine lands:

1. Treats every change as a hypothesis with predicted
   receipt-space movement.
2. Tags receipts with `hypothesisId`.
3. Computes confirmation via `metric-hypothesis-confirmation-rate`.
4. Persists the trajectory append-only.
5. Detects regressions per receipt.
6. Ratchets customer incidents.
7. Computes graduation against four conditions.
8. Auto-identifies gaps.

The CLAUDE.md north-star paragraph names this loop in a single
sentence: "Derive **probes** from the manifest, run them through
the product's normal authoring flow, derive metrics over run
records, gate proposal activation against the trust policy, and
append hypothesis receipts to the workshop's log. Graduate when
probe coverage = 100% and `metric-hypothesis-confirmation-rate`
sustains above floor."

The TodoMVC cycle was an isomorphic, manual rehearsal of the
same shape:

| Compounding-engine step | Manual analogue executed in this cycle |
|---|---|
| Mint a hypothesis | The spike's §0 verdict + §3 leverage claim |
| Tag receipts | The journal entries 0–6, each one a tagged observation |
| Compute confirmation | Entry 6's "what held up / what broke" synthesis |
| Persist trajectory | The journal is append-only; later entries cite earlier ones |
| Detect regressions | Entry 3 corrected the spike's "trivial sanity rung" framing — a regression on the spike's prior model |
| Auto-identify gaps | Entry 5's two probe seeds (role flattening, `press`-as-`click`) and Entry 4's missing-`targetAut` finding |
| Graduate | This revision: the spike's §4.1 / §5 / §8 update because the journal's evidence justified them |

The point of writing this isomorphism out is not to claim the
manual cycle is sufficient — it isn't, and the compounding engine
exists precisely to automate it. The point is to recognize that
the cycle is **already running**, in low-throughput,
human-mediated form, and that the journal-revision-code triple
is the rehearsal substrate the engine will eventually subsume.
Three implications:

1. **Journal entries are receipts.** Each entry's "What I tried /
   What I saw / What I want to improve" structure is the
   manual analogue of the receipt's
   `{predicted, observed, confirmed, missingContext}` shape.
   When the compounding engine's `HypothesisReceipt` lands, the
   journal entries are the vocabulary it inherits, not a
   parallel format.
2. **Spike-doc revisions are graduation events.** A revision
   of §4.1 / §5 / §8 happens only because the trajectory of
   evidence justified it. This is the same shape as the
   compounding engine's graduation gate firing because all four
   conditions held over N consecutive cycles. The cohort spike
   is the workshop's own substrate-ladder; revisions are
   verdicts.
3. **The cohort itself is a hypothesis-generation engine.**
   Every public AUT the cohort acquires generates new
   hypotheses about the product's behaviour under foreign
   substrate. Every revision of the spike under journal evidence
   is a graduation event in miniature. As public-AUT throughput
   grows, the manual cycle's bandwidth becomes the bottleneck;
   that's the call to automate, which is the compounding
   engine's job.

This section exists so that future agents reading the spike
doc — and especially future agents working the compounding
engine — recognize the cohort as part of the same loop. The
cohort doesn't need its own measurement substrate; it needs to
hand its receipts to the engine. The cohort doesn't need its
own graduation gate; it needs to surface its hypotheses through
the engine's existing one. When the engine lands, the manual
journal-revision discipline migrates to receipt-emission and
hypothesis-tagging discipline; the cycle's shape is preserved,
its throughput multiplied.

## 12. Hand-off to the next session

If you are picking up this spike from cold:

1. Read CLAUDE.md and `docs/v2-substrate-ladder-plan.md §§0–4`
   for context on the substrate ladder.
2. Read `docs/dashboard-vision.md` Part II View 5 (the
   Generalization Gauge) and `docs/moonshots.md §5` (cross-app
   transfer) for the ML-training framing this spike inherits.
3. Read this memo §§0–6, with §4.4 (the clean-room rule) as the
   spine.
4. Confirm with the operator: the training AUT, the held-out
   AUT, and the three ADO-shaped test cases for each. Commit
   the cohort manifest stub *before* any agent contact.
5. Run the experiment per §8. Report per §8.5. Do not run
   held-out evaluation yet. Do not commit cohort infrastructure
   beyond the manifest stub.

The cohort's permanent home (`workshop/customer-backlog/public-aut/`
or equivalent) is named in §7 but not built. Building it — and
plumbing the `--cohort-role held-out` no-write context — is a
follow-up commit, scoped after the experiment's report lands.
