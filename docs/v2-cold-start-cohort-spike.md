# Cold-Start Cohort Spike — Public AUTs as a Forcing Function

> Status: research-spike proposal (2026-05-01). No code has landed
> against this proposal; the document exists so that subsequent
> sessions can reference its essence rather than rediscover it.
> Orthogonal to Z11g (substrate ladder) and Z11d (live reasoning
> adapter); composes with both. Reads on top of
> `docs/v2-substrate-ladder-plan.md` and `docs/v2-probe-ir-spike.md`.

## 0. The verdict in one sentence

**Stand up a small, ordered ladder of publicly accessible web
applications, author hand-written ADO-shaped test cases against
each, run the product end-to-end under `--posture cold-start`, and
treat every `InterventionHandoff` the run emits as a probe seed —
so that real-world entropy compounds into the canon through the
machinery that already exists, and "progressively ready to
cold-start a variety of AUTs" becomes a measurable curve rather
than an aspiration.**

## 1. The question this spike asks

The product is, by inspection and architectural intent, almost
entirely substrate-agnostic. OutSystems-specific knowledge is
epidermal — confined to a variant classifier in
`workshop/substrate-study/` and the rung-4 distillation effort.
The probe IR, the manifest verbs, the Playwright bridge, and the
customer-backlog ADO-snapshot shape all accept any DOM. The
existing test infrastructure already exercises the agnostic
surface against synthetic React (rung 3) with controlled chrome.

The question is not "does the agnostic surface work?" — fixture
replay and the synthetic-app rung already answer that. The
question is:

**When the agent confronts a real, foreign DOM with real chrome
entropy, real semantic ambiguity, and real ARIA imperfection,
under cold-start posture (no prior canon), where does it actually
fail, and what does the structure of those failures teach the
canon?**

The synthetic app cannot answer this. By construction it generates
its surfaces from `product/catalog/` — the answer key is in the
training data. A public AUT has no such alignment. Its DOM exists
for its own reasons.

This is not a benchmark in the dashboard-metric sense. It is a
forcing function. The site supplies entropy; the system's existing
handoff → probe → activation pipeline metabolizes that entropy
into canon.

## 2. The leverage mechanism — why this compounds

The compounding loop is already wired. This spike contributes one
new input (real-world AUTs) and one new output (cross-AUT
generalization). It adds no new pipeline.

1. The agent attempts a hand-authored ADO test case against a
   public AUT under `--posture cold-start`.
2. Every gap — missing facet, ambiguous intent phrase, unmatched
   widget, unresolved locator — emits an `InterventionHandoff`.
   This contract is non-negotiable per the CLAUDE.md doctrine
   ("every agentic decision produces an `InterventionHandoff`").
3. Each handoff is a probe seed: workshop derives a probe that
   measures whether the gap closes on the next run.
4. Probes that stay green across N runs graduate canon through
   the trust-policy gate at
   `product/application/policy/trust-policy.ts`.
5. Canon graduations carry forward to the *next* AUT the cohort
   acquires — and that's where the leverage lives.

The leverage is in step 5. With one AUT, you learn the AUT. With
three AUTs in different shapes, you learn what generalizes.

**Recurring gaps across AUTs are generic-tier deficiencies.**
They tell you which W3C/ARIA matchers, intent classifiers, or
facet kinds are under-specified independently of any platform.
These are the highest-leverage probes to author.

**Gaps unique to a single AUT are specific-tier patterns.** They
are exactly the kind of artifact the catalog's pattern tier is
built to hold, but in proportion to the AUT's idiosyncrasy, not
the system's deficiency.

The metric tree already separates these — see
`docs/v2-substrate.md §8a` on the per-visitor metric audit. This
spike just feeds the separation real signal.

## 3. Design discipline

Three commitments make the spike honest.

### 3.1 Cold-start posture is the primary mode

`--posture cold-start` is non-negotiable for headline measurement.
Warm-start runs are diagnostics — useful for understanding what
canon would have helped, not for claiming progress. The whole
point is to test the discovery instruments without their training
wheels. If cold-start works, the system genuinely cold-starts; if
warm-start is the only mode that works, the system retrieves
canon, which is a different and weaker claim.

### 3.2 Snapshot-once, replay-forever

The first pass against any AUT runs live: real network, real DOM,
real entropy. The handoffs from that run are authoritative.

Every subsequent benchmark run against the same AUT replays from a
captured snapshot — DOM, network responses, frozen clock. Live
re-fetches are a deliberate refresh event with their own ledger
entry, not the default cadence.

This kills site drift as a noise source while preserving the
realism gain. It also means an AUT, once captured, becomes a
permanent rung-2 fixture — the cohort backfills the
fixture-replay corpus for free.

### 3.3 A diversity ladder, not a single site

One AUT teaches you that AUT. Three AUTs in different shapes teach
you what generalizes. The cohort's value is monotonic in
diversity, not size.

The ordering proposed — small enough to start, broad enough to
matter:

1. **TodoMVC** (or equivalent canonical demo). Trivial DOM,
   clean ARIA, single-screen state. The sanity rung: if
   cold-start fails here, the generic tier is broken and that
   discovery itself is the spike's first product.
2. **Swagger Petstore** or **Postman Echo** or another
   forms-and-lists demo app. Multi-screen, real validation, real
   asynchrony, but still author-friendly chrome.
3. **A public OutSystems Reactive demo.** OutSystems publishes
   several. This rung bridges the cohort to Z11g rung-4 work
   without requiring a customer engagement: `osui-*` classes
   appear, the variant classifier fires, the Reactive matcher
   tier gets exercised, and the cohort starts producing evidence
   the substrate-study can consume.
4. **Optional fourth, deliberately messy.** A site with
   imperfect ARIA, inconsistent landmarks, real-world chrome.
   This rung probes the failure-mode envelope — what does the
   system do when the substrate is *wrong* in interesting ways?

The first three are the minimum viable cohort. The fourth waits
until the first three's recurring-gap log is stable.

## 4. The headline metric — cross-AUT generalization rate

The cohort's headline is not "% test cases passed" or "% probes
green." Those are diagnostic. The headline is:

**When AUT-N+1 lands, what fraction of canon accumulated from
AUTs 1..N transfers without modification?**

Operationalized: run AUT-N+1 cold-start, count facets / matchers
/ intent phrases that resolve without an `InterventionHandoff`.
Divide by the count of distinct surfaces AUT-N+1 exposes. The
ratio is the system's *generalization rate* at cohort size N.

This is the precise meaning of "progressively ready to cold-start
a variety of AUTs." It composes with the metric tree's existing
M5 (memory-worthiness ratio) — generalization is M5 measured
across the AUT axis instead of the within-AUT cohort axis.

A floor and a target:
- Floor: at cohort size 1, generalization is undefined; at
  cohort size 2, it is the baseline. We want it to stay above
  zero.
- Target: at cohort size 3+, sustained generalization above some
  policy-set threshold (precise number is downstream of the
  spike's first results — picking a threshold before measuring
  is theatre).

## 5. Where this fits the active plan

This is a horizontal axis (AUT diversity) crossing the substrate
ladder's vertical axis (substrate fidelity).

- **Z11g (substrate ladder)** is rung-1 / rung-2 / rung-3 /
  rung-4 — fidelity ascending from dry through Reactive
  distillation. The cohort's rungs sit at the rung-2 / rung-3
  junction: every AUT, once captured, becomes a rung-2 fixture;
  the live first-pass run is a rung-3 (real Playwright on real
  DOM) execution that happens to be against a foreign substrate.
- **Z11d (live reasoning adapter)** swaps in real reasoning where
  the deterministic adapter sits today. The cohort is orthogonal:
  it doesn't care whether reasoning is deterministic or live, but
  it benefits from live — real reasoning on real DOM is the
  highest-signal configuration the cohort can produce.
- **Z11f (substrate study)** harvests public OutSystems DOMs to
  distill matcher patterns. The cohort's rung-3 (public Reactive
  demo) feeds Z11f: it produces real-OutSystems handoffs and
  receipts that the substrate study can consume *without* a
  customer engagement.
- **Customer-backlog** (`workshop/customer-backlog/`) already
  accepts arbitrary `AdoSnapshot`/`AdoStep` shapes. The cohort
  extends this with a third cohort directory:
  `workshop/customer-backlog/public-aut/<aut-name>/` holding
  fixtures, captured DOM, scorecard, and the recurring-gap log.

The cohort is therefore not a new pipeline; it is a new input
source feeding existing pipelines, and one new metric
(generalization rate) projected from the existing metric tree.

## 6. The smallest concrete first move

Before the cohort exists as a structure, one experiment runs
against one AUT and reports back. Its only job is to discover
what the recurring-gap log actually looks like — so the cohort's
real shape is informed by real evidence, not by guessing.

The experiment:

1. **Pick TodoMVC** (or the simplest equivalent the operator
   prefers). The criteria are: stable URL, clean ARIA, no auth,
   small enough to enumerate completely.
2. **Author 3 ADO-shaped test cases by hand**, of escalating
   ambition: add a todo; mark a todo complete; filter to active
   todos. Shape them as the customer-backlog already accepts.
3. **Run cold-start** against the live site. Capture every
   `InterventionHandoff`, every `ReasoningReceipt`, the full
   resolution-receipt log, and the generated test artifacts (or
   the reasons no artifact was generated).
4. **Report**, in a single memo:
   - what the agent succeeded at without canon
   - what it failed at, classified by handoff family
   - which failures look generic-tier (likely to recur on other
     AUTs) vs. specific-tier (TodoMVC-shaped)
   - what shape the recurring-gap log will need to take when the
     cohort has more than one AUT
   - whether the snapshot-once-replay-forever discipline is
     mechanically possible with the current Playwright bridge,
     or whether new instrumentation is needed first

The experiment does **not** activate canon, modify the trust
policy, or commit anything to the cohort. Its product is
evidence, not infrastructure. Infrastructure follows once we
know what the evidence actually contains.

## 7. What success looks like for the spike itself

The spike succeeds if it produces, in order of importance:

1. A handoff log from a real AUT, classified well enough that
   the gap structure is legible.
2. A clear statement of which existing pipeline pieces held up
   under real entropy and which broke or required workarounds.
3. A revised cohort design — the present §3 is a hypothesis; the
   spike's evidence either confirms it or names what's wrong
   with it.
4. A first cut at a recurring-gap taxonomy: the families of gap
   we expect to see across AUTs, named precisely enough to be
   probe seeds.

The spike fails if any of: the cold-start posture cannot run
end-to-end against a foreign DOM at all; handoffs aren't emitted
where they should be; the resolution-receipt log is unreadable;
or the ADO-shaped fixture format proves too rigid for
hand-authoring against a real site. Each of these failures is
itself a high-value finding — the spike's worst case is still
informative.

## 8. What this spike explicitly does not solve

- **Replacing rung-4.** The cohort does not displace
  Reactive-OutSystems distillation. A public OutSystems demo is
  not a substitute for a real customer DOM with real customer
  widgets and real customer telemetry. The cohort *feeds* rung-4
  by producing real-OutSystems handoffs cheaply; it does not
  *replace* the rung.
- **The generalization-rate threshold.** The spike does not pick
  the policy threshold at which generalization is "enough."
  That number lives downstream of the first three AUTs landing.
- **Cohort governance.** The spike does not specify how AUTs
  enter the cohort, get refreshed, or retire. Those questions
  have answers, but they are downstream of evidence the spike
  produces.
- **TOS / robots.txt / scraping ethics.** Site selection must
  prefer apps explicitly intended for testing or demonstration
  (TodoMVC, Petstore, Postman Echo, OutSystems-published demos).
  This is a constraint on cohort membership, not an artifact of
  the spike itself.

## 9. Hand-off to the next session

If you are picking up this spike from cold:

1. Read CLAUDE.md and `docs/v2-substrate-ladder-plan.md §§0–4`
   for context on the substrate ladder and where this spike
   sits relative to it.
2. Read this memo §§0–6.
3. Confirm with the operator that the AUT and three ADO-shaped
   test cases are agreed.
4. Run the experiment per §6. Report per §6.4. Do not commit
   cohort infrastructure yet.

The cohort's permanent home (`workshop/customer-backlog/public-aut/`
or equivalent) is named in §5 but not built. Building it is a
follow-up commit, scoped after the experiment's report lands.
