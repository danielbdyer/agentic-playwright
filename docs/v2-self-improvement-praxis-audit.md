# Self-Improvement Praxis Audit — What the Instruments Can and Cannot Measure

> Status: audit (2026-06-12, post cycle 10). Commissioned by the
> operator as the last step before operator-designated held-out
> evaluation begins (journal Entry 33 protocol). Read alongside
> `docs/v2-cold-start-cohort-brief.md` (what the system does) and
> `docs/v2-substrate.md §7` (what measurement is supposed to be).
> Every claim carries a file:line reference; the prescriptions at
> the end are ordered against the operator's held-out plan.

## 0. The verdict in one sentence

**The repo contains a genuinely mechanized self-improvement engine
(hypothesis receipts, confirmation judgments, graduation gates,
parity laws, seeded-entropy reproducibility) and a genuinely
empirical measurement wing (the cold-start cohort against real
websites) — and the two never meet: every number about reality is
computed artisanally, measured once, on an unreproducible live
substrate, gated by prose, and invisible to the engine whose whole
purpose is to adjudicate whether the system improved.**

A held-out evaluation introduced today would land as one
non-replayable number interpreted in journal prose. The
prescriptions below are what it takes for that number to instead
land as a registered prediction, mechanically confirmed or
refuted, on a frozen substrate that can be re-analyzed forever
without re-contacting the site.

## 1. The praxis as doctrine defines it

`docs/v2-substrate.md §7` commits the operating frame: *"every
code change carries a hypothesis, the next evaluation either
corroborates or contradicts it, the receipt log is append-only,
and the batting average is itself a derivation the agent can
query."* It also commits *"No parallel apparatus. No hand-authored
testbed corpus"* — with the cold-start cohort spike
(`docs/v2-cold-start-cohort-spike.md`) as a deliberate, scoped
exception whose consolidation is deferred (spike §12).

## 2. What is real and mechanized (credit where due)

The synthetic wing is not scaffolding theater. Verified working:

- **Prediction kinds are a closed union** of five
  (`workshop/compounding/domain/prediction.ts:33–89`):
  confirmation-rate, receipt-family-shift, coverage-growth,
  regression-freedom, intervention-fidelity.
- **Confirmation is computed, not asserted.** Five pure
  evaluators at
  `workshop/compounding/application/confirmation-judgments.ts:45–297`
  fold over receipts; `confirmed` is arithmetic
  (`cycleRate >= prediction.atLeast`), never agent judgment.
- **Graduation is computed.**
  `workshop/compounding/application/graduation.ts:55–142` derives
  `metric-hypothesis-confirmation-rate` over a rolling window —
  this is C6 in probe-IR language, exactly as `v2-substrate.md
  §8a` promised.
- **Baselines and diffs are mechanized** —
  `workshop/measurement/baseline-store.ts:57–76`,
  `workshop/measurement/score.ts:170–200` (`diffMetricTrees` +
  `deltaVerdict`).
- **Reproducibility is law-tested** on the probe ladder:
  `invariantContent` fingerprints over invariant-band axes
  (`workshop/probe-derivation/probe-receipt.ts:98–142`), rung
  parity (`check-rung-parity.ts:51–100`), byte-identical receipts
  across consecutive runs
  (`tests/probe-derivation/substrate-parity.laws.spec.ts`, P3).
- **Synthetic substrate entropy is seeded** — seven perturbation
  axes on a linear-congruential RNG
  (`workshop/synthetic-app/.../entropy-profile.ts:92–114`), so
  chrome-invariance exercises are byte-reproducible.
- **The convergence proof is a real N-trial statistical harness**
  with a mechanized exit code
  (`scripts/convergence-proof.ts`).

This is the standard the empirical wing should be held to — and
is not.

## 3. The gaps

Each gap: evidence → consequence → prescription → effort.
Ordered by leverage, not by ease.

### G1. The empirical wing is invisible to the compounding engine

**Evidence.** The cohort kind union is closed at three:
`probe-surface`, `scenario-trajectory`, `customer-compilation`
(`workshop/compounding/domain/cohort.ts:42–72`). The scoreboard
reads `latestProbeReceipts() / latestScenarioReceipts() /
latestCompilationReceipts()`
(`workshop/compounding/application/compute-scoreboard.ts:80–82`);
grep for `public-aut` across `workshop/compounding/` and
`workshop/orchestration/` returns zero matches. The cohort
receipts are also absent from the append-only log registry
(`product/domain/logs/log-registry.ts:84–184` — ten logs, none
for public-AUT), and the registry's architecture law only checks
registry-internal invariants — "every writer is registered" is an
explicitly deferred sweep
(`tests/architecture/log-registry.laws.spec.ts:5–8`).

**Consequence.** Cycles 1–10's improvement claims (including
cycle 10's 0/3 → 2/3) exist only as journal prose plus gitignored
JSON. The batting average the doctrine promises *the agent can
query* excludes every measurement ever taken against reality. A
held-out result cannot be registered as a prediction, cannot be
confirmed mechanically, and cannot move
`metric-hypothesis-confirmation-rate`.

**Prescription.**
1. Widen the cohort union with a `public-aut` kind keyed by
   `(autName, partition, substrateVersion)`.
2. An evidence adapter that lifts a cohort receipt
   (schemaVersion 5) into the judgment evaluators' evidence shape
   — the existing `confirmation-rate` and `regression-freedom`
   prediction kinds then apply unchanged. A cycle's improvement
   claim becomes, e.g., *"regression-freedom over todomvc
   DOM-target steps"* + *"confirmation-rate ≥ 2/3 over
   outsystems-com"* — registered before the change, judged after.
3. Register `public-aut-receipts` in `LOG_REGISTRY`.

**Effort.** ~1–2 days. No new concepts; pure wiring into seams
built for exactly this.

### G2. No committed baseline, no regression gate

**Evidence.** Receipts are gitignored; baselines under
`.tesseract/baselines/` are deliberately machine-local
(`workshop/measurement/baseline-store.ts:9–14`); no test anywhere
consumes cohort numbers (grep across `tests/` for public-aut
regression: zero). The training trajectory (7/9 → … → 12/15)
lives only in journal tables.

**Consequence.** A change that silently regresses TodoMVC from
7/9 to 5/9 fails nothing. The only regression detector is an
agent choosing to re-run and compare by hand — the definition of
artisanal.

**Prescription.** Commit a per-(aut, substrateVersion) summary
record in-repo (e.g.
`workshop/customer-backlog/public-aut/baselines/<aut>.json`
holding domTargetSteps, matched, verified, falsePositives,
matchesByRung) and add a ratchet law: a cohort run's summary must
be ≥ baseline on matched/verified and ≤ on falsePositives;
improving runs update the baseline explicitly (snapshot-test
semantics). Live-network in CI is unacceptable — which is why
this gate becomes real only with G3.

**Effort.** ~0.5 day for the committed-baseline shape + law;
depends on G3 for CI-grade enforcement.

### G3. The empirical substrate is unreproducible — capture-and-replay is missing

**Evidence.** The cohort manifest reserves `snapshotFingerprint`
and every entry carries `null`; the field is read nowhere and
written nowhere
(`workshop/customer-backlog/application/load-public-aut-cohort.ts:31`
is its only code reference). The runner navigates live
(`public-aut-runner.ts` `page.goto(autUrl …)`) with no offline
mode. Meanwhile the capture half already exists elsewhere:
`captureAriaYaml`
(`product/instruments/observation/aria.ts:8`), canonical
normalization + hashing
(`product/domain/knowledge/aria-snapshot.ts:129–144`), and the
fixture-replay pattern for probes
(`workshop/probe-derivation/fixture-replay-harness.ts`).

**Consequence.** Every measurement is hostage to marketing-page
drift, cookie banners, and network weather. Before/after
comparisons of a code change are confounded by substrate change.
No bisection, no ablation, no N-trial without N live contacts —
and for a held-out, every extra contact spends the asset.

**Prescription.** Capture a normalized ARIA snapshot per case
visit (stamping `snapshotFingerprint` at last), store under a
registered log, and add a replay harness that answers
getByRole/getByText-shaped queries over the stored tree — the
rung-3 inventory harvest in the runner is already 30% of that
query engine. **Crucially: capture during the held-out evaluation
itself.** The single permitted contact then yields a frozen
substrate that can be re-analyzed, re-measured, and used for
ablations forever without re-contacting the site — the
contamination calculus changes categorically.

**Known limit.** Snapshots freeze state; narrative-execute
sequences (fill → press → observe new state) need either live
designation or scripted state transitions. Resolution/observe
steps — the majority — replay cleanly.

**Effort.** ~2–3 days (independent estimate from the
infrastructure survey).

### G4. The headline numbers are denominator-dishonest and variance-blind

**Evidence.** `stepsMatched` counts `skipped-navigate` gimmes
(`public-aut-runner.ts` step loop); cycle 9's "3/6 matched" was
entirely navigates. Every journal entry hand-derives the honest
DOM-target denominator. Every cycle's number is a single trial;
the N-trial machinery exists but is hardcoded to the synthetic
pipeline (`scripts/convergence-proof.ts` →
`DEFAULT_PIPELINE_CONFIG`; it cannot run the cohort).

**Consequence.** A ±1-step delta on a 15-step corpus measured
once is statistically uninterpretable, and the headline metric
overstates capability by construction.

**Prescription.** First-class `domTargetSteps` /
`domTargetMatched` fields in summary and receipts; a
`--trials N` flag on `compile-public-aut` reporting per-trial
variance (free on replayed snapshots once G3 lands).

**Effort.** ~0.5–1 day.

### G5. The clean-room is prose, not mechanism

**Evidence.** `assertCanonWritesAllowed`
(`workshop/customer-backlog/application/cohort-trust-guard.ts:39–68`)
throws correctly — and is invoked at zero execution sites. The
trust-policy gate is partition-blind
(`product/domain/governance/trust-policy.ts:62–83` — no cohort
concept). Nothing prevents any session from running the runner
against a held-out AUT; contact tracking does not exist; receipts
record `cohortRole` for post-hoc audit only. Spike §4.4: C1 and
C4's structure are law-pinned (ZC38), C2/C3/C5/C6 are prose. C3
("single-use per canon state") is uncheckable — receipts carry no
fingerprint of the resolver/canon state that produced them.

**Consequence.** The held-out asset the operator is about to
create is protected by good intentions. Cycles 5–7 already
demonstrated how quietly contamination happens under prose-only
discipline.

**Prescription.**
1. The runner refuses `--aut <held-out>` unless an explicit
   `--evaluation-handoff` flag (or token) is supplied.
2. Every execution against any held-out AUT appends to a
   **committed contact ledger** (who, when, mode, receipt
   fingerprints) — contamination becomes auditable data.
3. Stamp receipts with a resolver fingerprint (hash of classifier
   + ladder source and any consulted catalog state) so C3's
   "single evaluation per canon state" is mechanically checkable.
4. Thread `cohortRole` into the trust-policy evaluation context
   now, while there are no canon-write paths to retrofit later.

**Effort.** ~1 day. Highest urgency relative to the operator's
plan — it should land **before** the next held-out is designated.

### G6. No synthetic ground-truth corpus for the resolution ladder

**Evidence.** The synthetic substrate renders 27 closed
`SurfaceRole`s with seeded entropy
(`workshop/substrate/surface-spec.ts:41–69`,
`workshop/synthetic-app/catalog-projection.ts`), and ground-truth
targets are structurally present (role, name, visibility,
enabled). Step-text generation exists but is a template/synonym
fuzzer for the insurance demo vocabulary
(`product/domain/synthesis/translation-gap.ts`), aimed at the old
compile pipeline — nothing generates
(English step, rendered world, expectedTarget) triples for the
classifier + ladder under test.

**Consequence.** The ladder's operating characteristics are
unknown. `DOMINANCE_THRESHOLD = 0.75` and `DOMINANCE_MARGIN =
0.15` are admitted first-principles guesses
(`product/domain/resolution/patterns/degraded-resolution.ts:60–72`);
precision/recall per rung has never been measured; the 15-step
live corpus is the entire evaluation universe. The held-out is
being asked to do a job (characterize generalization) that a
synthetic corpus should do at scale, leaving the held-out to do
the only job it's uniquely fit for: catching what synthesis
can't imagine.

**Prescription.** A corpus generator over the existing synthetic
app: sample world-shapes from the 27-role vocabulary, emit step
text along controlled difficulty axes — phrase-name divergence
(exact / reducible / reworded / zero-overlap), target visibility
(visible / a11y-hidden), ambiguity multiplicity (0/1/2+ rivals),
role correctness — with the ground-truth expectedTarget attached.
Run the cohort pipeline against it N-thousand times (in-process
server, no network); emit precision/recall per rung and a
threshold-sweep calibration receipt. Template expansion is data
work (~1 day for 80% of the value); LLM-generated phrasing
diversity can come later via the Reasoning port.

**Effort.** ~2–3 days for generator + calibration harness.

### G7. The measured pipeline is not the shipped pipeline (parallel apparatus)

**Evidence.** The runner calls `classifyIntent` directly and
implements its own resolution ladder; the product's own
pattern/matcher architecture (`registry.ts:36–47`,
`rung-kernel.ts` `MatcherContext`/`SurfaceIndex`) never executes
against a real page because `surfaceIndexFromStage()` returns
`EMPTY_SURFACE_INDEX`
(`product/runtime/resolution/patterns/surface-index-from-stage.ts:65`)
and `createPlaywrightDomResolver`
(`product/runtime/adapters/playwright-dom-resolver.ts`) is
disconnected. The doctrine's own anti-scaffolding gate names this
shape (`v2-substrate.md §6–7`: "No parallel apparatus"); the
spike acknowledges and defers it (spike §12).

**Consequence.** Improvements measured by the cohort are
improvements to a surrogate. The product's 11-rung resolution
ladder — the thing that ships — accrues zero evidence from every
cohort cycle. Conversely, cycle-10's ladder logic lives where the
product pipeline can't use it yet.

**Prescription (sequenced, not pre-held-out).** Populate
`SurfaceIndex` from a live page (or a G3 snapshot — same query
engine), run cohort steps through the pattern registry, migrate
the ladder rungs into matchers, and delete the runner's private
ladder per the spike's own exit condition. Until then, treat every
cohort cycle as growing the divergence debt.

**Effort.** ~1 week; the right moment is immediately after the
first clean held-out cycle under the new instruments.

### G8. The classifier has no offline golden corpus

**Evidence.** `classifyIntent` is evaluated only end-to-end
through a browser; its laws (ZC37) pin a handful of anecdotes.

**Prescription.** A labeled corpus of (action text →
expected verb/role/phrase) pairs — including every phrasing the
cohort fixtures ever used — run as a millisecond-fast law.
Classifier regressions then surface without Playwright.

**Effort.** ~0.5 day, grows organically.

### G9. The improvement ledger's decision fields are prose

**Evidence.** `ImprovementRun` mixes mechanized vectors with
author-asserted `rationale`/`plannedChanges`
(`product/domain/improvement/types.ts:231–256`;
`workshop/orchestration/improvement.ts:349–369` — verdict
mechanized, rationale prose). Nothing ties an acceptance decision
to the hypothesis IDs it should have been predicated on.

**Prescription.** Add `hypothesisIds` to acceptance decisions so
the ledger and the receipt log form one auditable chain. Low
urgency; do it when G1's cohort wiring touches the same types.

### G10 (forward-looking). Reasoning will arrive unmetered

**Evidence.** The Reasoning port has no runtime callers
(`product/reasoning/reasoning.ts:35–37`), no registered receipt
log, and the runner doesn't route through it. When Z11d adds
semantic bridging (the 日本語 gap), its cost and batting average
will be invisible unless the receipt log and a cost visitor land
with it.

**Prescription.** A landing requirement on Z11d, not work to do
now: route the runner's classify/bridge calls through the port,
register `reasoning-receipts`, and extend the cohort summary with
token cost — the journal already reserved the slot ("when we add
a real LLM... token cost becomes the third number").

## 4. Sequencing against the operator's held-out plan

**Before designating the next held-out** (order matters):

1. **G5** — contact ledger + handoff-token refusal. Protects the
   asset before it exists. (~1 day)
2. **G4** — honest denominators + `--trials`. Makes the number
   interpretable. (~0.5–1 day)
3. **G3** — capture-and-replay, capturing during the evaluation
   itself. Turns the one permitted contact into a permanent,
   re-analyzable substrate. (~2–3 days)
4. **G1 + G2** — cohort kind + evidence adapter + committed
   baseline ratchet. The held-out result lands as a registered,
   mechanically judged prediction. (~2 days)

**In parallel, any time:** G6 (synthetic corpus + threshold
calibration) — it makes the held-out *smaller*: scale questions
move to synthesis; the held-out answers only validity.

**After the first clean cycle under the new instruments:** G7
(unify the apparatus), G8, G9. G10 lands with Z11d.

Total pre-held-out engineering: roughly one focused week.

## 5. What is NOT missing (deliberate non-findings)

- **The journal being prose** is correct — it is the narrative
  layer. The defect was numbers living *only* there; G1/G2 fix
  that without bureaucratizing the journal.
- **The dominance thresholds being guesses** is honest
  engineering — they are named constants with laws. G6 gives them
  evidence; do not hand-tune them before it exists.
- **The dogfood capture harness's missing `server.cjs`**
  (`playwright.capture.config.ts` references a server that does
  not exist) is a retired path. Do not resurrect it; G3 supersedes
  it.
- **The spike bypassing parse/bind** was a legitimate
  spike-scoped choice the spike itself documents. The finding is
  not that it was built — it is that nothing yet forces its exit
  condition (G7).
- **Five prediction kinds** are sufficient; G1 needs no new kind,
  only a new cohort key and evidence adapter.

## 6. The one-paragraph synthesis

The system's self-improvement praxis is a well-built engine
running on a closed synthetic world, and a hand-operated
expedition into the real one. The doctrine — hypothesis before
change, receipt after, batting average as a queryable derivation,
no parallel apparatus, reproducible substrate — is fully
implemented on exactly the side that doesn't touch reality. What
needs to happen in the codebase is not new doctrine and not new
measurement ideas: it is plumbing the empirical wing into the
engine that already exists (G1/G2), freezing reality so it can be
measured more than once (G3/G4), converting the clean-room from
etiquette into mechanism (G5), and building the synthetic
ground-truth corpus that lets the held-out site do only the job
nothing else can do (G6). After that, the held-out evaluation the
operator introduces will not produce a number in a journal — it
will produce a confirmed-or-refuted prediction on a permanent
substrate, which is what this codebase has been promising itself
since the first receipt was minted.
