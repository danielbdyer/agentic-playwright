# Probe IR Spike — Verdict 11

**Date:** 2026-04-24
**Event:** The customer-compilation cohort lands. The compounding
engine now measures three cohorts — probe-surface,
scenario-trajectory, and customer-compilation — across two
corpuses (resolvable + needs-human), evaluating five prediction
kinds including the real intervention-fidelity judgment.
Graduation holds under the full three-cohort drive-through.

## The verdict, in one line

**The graduation gate now holds across three cohorts and two
prediction kinds.** The workshop measures not only whether
probes and scenarios pass, but whether customer-backlog ADO cases
resolve under the product's compile path and whether escalations
carry valid intervention handoffs when resolution fails. The
measurement surface grew from verdict-10's single-cohort
structural-plus-narrow to a three-cohort multi-prediction
landscape with adapter-invariant and adapter-sensitive
trajectories simultaneously exercised.

## Phase ledger (Z11a.1 → Z11a.7)

| Phase | Commit | What |
|---|---|---|
| Z11a.1 | `59460b1` | Domain types: `customer-compilation` cohort, `intervention-fidelity` prediction, `CompilationReceipt` envelope, `FingerprintTag` + `WorkflowScope` widenings |
| Z11a.2 | `db15c4a` | Resolvable corpus (8 ADO cases) + `docs/v2-synthetic-app-surface-backlog.md` |
| Z11a.3 | `f960d7f` | Needs-human corpus (14 ADO cases, 1:1 with backlog-doc rows) |
| Z11a.4a | `eb906f1` | Pattern-rung kernel + `firstMatchWins` orchestrator + 3 seed matchers + `formSubmissionPattern` |
| Z11a.4b | `9de625a` | `PatternRegistry` + intent classifier + `patternResolutionStrategy` at `'shared-patterns'` rung |
| Z11a.4c | `f927a6c` | Five more seed patterns (locator-by-role-and-name, nav-link, field-input, dialog-confirmation, observation) in specific→generic registry order |
| Z11f plan | `2bc840e` | Substrate-study architectural design doc (`docs/v2-substrate-study-plan.md`) — informs OutSystems-generic matchers from real public DOMs; sequences post-verdict-11 |
| Z11a.5 | `f7e16d1` | `tesseract compile-corpus` + CompilationReceipt emitter + heuristic Z11a.4b-classifier-based step outcome estimator |
| Z11a.6 | `2415118` | ReceiptStore widening (CompilationReceiptLike, compilation-cohort read methods) + real intervention-fidelity evaluator replacing Z11a.1 stub + confirmation-rate extended over compilation receipts |
| Z11a.7 | (this) | Two seed hypothesis fixtures (resolvable + needs-human) + verdict-11 |

**Tests (this slice + verdict)**: 3,890 passing / 10 skipped.
165 compounding-family + pattern + customer-backlog laws green.
Build ok; seam laws green; `npm run graduate` holds the Z10
single-cohort gate; full three-cohort drive-through (probe +
scenario + compile-corpus) also produces `graduation: holds`.

## Reproduction — three-cohort drive-through

```bash
rm -rf workshop/logs && git status   # working tree clean

npm run build

# Author all three hypotheses.
node dist/bin/tesseract.js compounding-hypothesize \
  --input workshop/observations/fixtures/verdict-10-hypothesis.json
node dist/bin/tesseract.js compounding-hypothesize \
  --input workshop/observations/fixtures/verdict-11-resolvable-hypothesis.json
node dist/bin/tesseract.js compounding-hypothesize \
  --input workshop/observations/fixtures/verdict-11-needs-human-hypothesis.json

# Emit evidence for each cohort.
node dist/bin/tesseract.js probe-spike --emit-receipts \
  --hypothesis-id h-observe-substantive
node dist/bin/tesseract.js scenario-verify --emit-receipts \
  --hypothesis-id h-observe-substantive
node dist/bin/tesseract.js compile-corpus --corpus resolvable \
  --hypothesis-id h-customer-compilation-resolvable
node dist/bin/tesseract.js compile-corpus --corpus needs-human \
  --hypothesis-id h-customer-compilation-needs-human

# Three scoreboard cycles (sustained-rate gate needs depth >= 3).
node dist/bin/tesseract.js compounding-scoreboard
node dist/bin/tesseract.js compounding-scoreboard
node dist/bin/tesseract.js compounding-scoreboard
# → graduation: { state: 'holds', missingConditions: [] }
```

The third scoreboard holds the gate with three trajectories of
depth 3 and rate 1.0:

```
cohort: probe-surface:verb:observe|facet-kind:element|error-family:none
  depth: 3  latest rate: 1
cohort: customer-compilation:corpus:resolvable
  depth: 3  latest rate: 1
cohort: customer-compilation:corpus:needs-human
  depth: 3  latest rate: 1
```

## Observed state at graduation

- **34 probe receipts** across 18 manifest-derived
  `(verb × facetKind × errorFamily)` targets; all pass.
- **4 scenario receipts**; all pass.
- **22 compilation receipts** (8 resolvable + 14 needs-human), one
  per ADO case, all carrying `substrateVersion: 'heuristic-z11a5'`
  to mark them as heuristic-classifier-derived.
- **9 hypothesis-receipt entries** (3 cohorts × 3 cycles), each
  carrying cohort-specific cycle rates.
- **3 trajectories** — one probe-surface, two customer-compilation;
  all at `deepestSampled: 3` and `rollingRate: 1.0`.
- **Two prediction kinds exercised**: `confirmation-rate` on the
  probe-surface + customer-compilation resolvable cohorts;
  `intervention-fidelity` on the customer-compilation needs-human
  cohort.
- **All 4 graduation conditions hold**:
  - `probe-coverage-is-100` — 18/18 targets covered.
  - `scenario-corpus-all-passes` — 4/4 scenarios passing.
  - `hypothesis-confirmation-rate-sustained` — rolling rate 1.000 over
    9 trajectory entries (3 cohorts × 3 cycles).
  - `no-ratchet-regressions` — no active ratchets, vacuous hold.

## Honesty rubric

Verdict-10 named the three-tier rubric: structural /
structural-plus-narrow / substantive. Z11a extends the rubric
with a fourth tier motivated by the Z11f plan's orthogonal axis:

| Tier | Description | What it proves |
|---|---|---|
| Structural | Mechanics only; any receipts hold the gate | Plumbing works |
| Structural-plus-narrow | Real upstream flow, single cohort | Pipeline joins up |
| **Multi-cohort-synthetic** | Multiple cohorts + multiple prediction kinds, all synthetic | Measurement surface is multi-dimensional; no real-world grounding |
| Grounded | Evidence includes distilled real-OutSystems data (Z11f) | OutSystems-generic priors reflect production reality |
| Customer-real | Real customer ADO → real customer SUT | Product works for a customer |

**This graduation is multi-cohort-synthetic.** Compared to
verdict-10's structural-plus-narrow:

**What improved:**
- Three cohorts exercised, not one. Probe-surface, customer-
  compilation-resolvable, customer-compilation-needs-human all
  carry trajectories simultaneously.
- Two prediction kinds exercised, not one. Confirmation-rate AND
  intervention-fidelity both fire across the cycles.
- The customer-compilation cohort is adapter-invariant on one
  side (needs-human always escalates regardless of reasoner) and
  adapter-sensitive on the other (resolvable's confirmation rate
  will vary under Z11d vs the heuristic).

**What's still synthetic:**
- ADO cases are fabricated to exercise substrate presets, not
  harvested from a real customer backlog.
- CompilationReceipts are produced by Z11a.4b intent classifier
  heuristic, NOT the real compile pipeline. `substrateVersion:
  'heuristic-z11a5'` marks this.
- The pattern ladder's `outsystems-generic` matchers are
  hand-guessed from public documentation; Z11f's distillation
  against Common Crawl + Wayback + showcase is the next rung up.
- No LLM reasoning. `Reasoning.select` adapter is Z11d's work.

**To promote to grounded:** run Z11f's harvest → distill →
propose pipeline against a real public OutSystems corpus (Common
Crawl snapshot + Wayback + showcase seeds). Merge 3–5 operator-
approved matcher proposals into `product/domain/resolution/
patterns/matchers/outsystems-generic/`. The generic matcher
baseline is then informed by evidence rather than guesswork.

**To promote to customer-real:** a single customer deployment
compiling real ADO test cases against their real SUT, with
CompilationReceipts + ResolutionReceipts flowing into a
customer-specific compounding scoreboard. That's a product
milestone, not a verdict; the infrastructure is in place.

## What Z11a measures that Z10 couldn't

Four new observations the engine can now make:

1. **Per-corpus resolution rate under the compile path.** Z10
   measured whether probes and scenarios pass against the
   synthetic substrate. Z11a measures whether the compile
   pipeline's binder can resolve ADO text — a distinct
   capability. Resolvable-corpus confirmation rate is a direct
   signal for adapter capability + catalog coverage.

2. **Intervention fidelity.** Z10 had no notion of "did the
   pipeline escalate *well*?" — escalation was binary.
   Intervention-fidelity measures whether emitted handoffs carry
   valid missingContext payloads, adapter-invariantly. The
   judgment is mechanical under Z11a; semantic under Z11d.

3. **Cohort-split adapter sensitivity.** The needs-human cohort
   MUST hit needs-human under any adapter (surface absence is
   invariant); the resolvable cohort's behavior varies with
   adapter capability. Having both trajectories in the same
   scoreboard makes "adapter improved" vs "catalog grew" vs
   "pipeline regressed" distinguishable.

4. **Pattern-rung attribution.** Z11a.4b wires pattern-strategy
   resolution into the `'shared-patterns'` precedence rung.
   When a match fires, the resolution observation carries
   `patternId` + `matcherId` + `matcherIndex`. `compounding-
   improve` can aggregate these to report "which patterns carry
   the load; which deep-rung matches would benefit from customer-
   specific matchers at M-1" — the cognitive-cost-per-resolution
   signal. (Not yet materialized in the scoreboard; Z11a.5
   emitter doesn't run the real resolution pipeline; Z11d
   activates this signal.)

## Seam discipline

- **Two additive widenings at Z11a.1**: `FingerprintTag` gained
  `'compilation-receipt'`; `WorkflowScope` gained `'compilation'`.
  Both are pure registry additions.
- **Two additive widenings at Z11a.5**: `ALWAYS_ALLOWED_PRODUCT_PATHS`
  gained `'product/domain/intent'` (AdoSnapshot is shared contract
  between product-authors-the-schema and workshop-reads-the-
  fixtures) and `'product/domain/resolution/patterns'` (pattern
  ladder kernel + intent classifier are generic primitives both
  layers consume). These are the first allowlist additions since
  step-4c's graduation. The rationale matches the existing
  `product/domain/governance` + `product/domain/kernel/hash`
  justifications: shared-contract, not an ad-hoc escape hatch.
- **Zero `product/` imports from `workshop/`**. The compounding
  engine + customer-backlog lane + pattern ladder remain
  workshop-side; product reads nothing from them.
- **Zero RULE_3 grandfather entries added**.
- **All seam-enforcement architecture laws green** at every Z11a
  commit.

## Plan deviations

1. **Full compile-pipeline integration deferred to Z11d.** Z11a.5
   ships a heuristic classifier instead of running the real parse
   → bind → resolve path. The substrateVersion marker
   (`heuristic-z11a5`) and the drift-detection infrastructure
   make this cleanly upgradeable without reshaping downstream
   receipts.
2. **`ResolutionStrategy` Promise → Effect migration deferred.**
   Earlier scope check surfaced ~40 touch-point ripple across
   `RuntimeStepAgent`, scenario runner, execute program, resolve
   index, environment, resolution engine, and ~30 test call
   sites. Out-of-scope for Z11a; filed as a dedicated refactor
   epic. The pattern-resolution strategy implements the existing
   Promise interface with sync-only internals — no Promise/Effect
   hybrid introduced.
3. **Customer-compilation cohort's full compile integration
   deferred.** The infrastructure exists (receipts, evaluators,
   ReceiptStore methods, scoreboard wiring); Z11d will swap the
   Z11a.5 heuristic for real compile runs producing real
   ResolutionReceipt → CompilationReceipt aggregation.

## Forward queue

Six concrete next-agent tasks, ordered by dependency:

1. **Author a coverage-growth hypothesis against the pattern-
   ladder.** With Z11a.4c's 6 patterns registered at the
   `'shared-patterns'` rung, any compile run that hits a pattern
   records `patternId` + `matcherId` in the resolution
   observation. A new hypothesis like
   `coverage-growth: form-submission from 0.0 to 0.5` could
   track how often form-submission fires, quarter over quarter.
   Prerequisite: real compile integration (Z11d).

2. **Implement Z11d — the live-adapter ladder.** Record / fill /
   replay triad + `/reasoning-fill` slash command + autotelic
   hooks + claude-code-session provider tag. Unblocks Z11d.x
   (Reasoning.select for intent classification), which lets the
   customer-compilation cohort's resolvable trajectory diverge
   meaningfully from 1.0 under the heuristic.

3. **Run Z11f.0 legal review.** Draft the
   `scraping-policy.yaml`, get sign-off, open the Z11f
   implementation track. Unblocks the harvest → distill →
   propose pipeline that informs OutSystems-generic matchers
   with real distributional evidence.

4. **Implement Z11b — executed-test cohort.** The third missing
   cohort from the Z11 plan: `tesseract test-execute --emit-compounding-receipt`
   batches spec runs, emits per-spec receipts, wires into a
   `stability-rate` prediction kind. Adds post-compile quality
   measurement to the scoreboard.

5. **Wire trust-policy thresholds to the sustained-rate gate.**
   Plan §11 Q5: move `confirmationRateFloor` + `minSustainedCycles`
   defaults from CLI flags into
   `workshop/policy/trust-policy.yaml`. Lets operators tune
   graduation thresholds through the same proposal-gated
   discipline the policy already enforces.

6. **Address ResolutionStrategy Promise → Effect migration.**
   The deferred refactor epic. Bring the strategy interface in
   line with the rest of the codebase's Effect-forward doctrine.
   Low-risk mechanical refactor; ~40 touch-points across strategy
   callers + tests. Cleans up the last surviving Promise seam in
   the resolution pipeline.

## Pointers

- Plan: `docs/v2-compounding-engine-plan.md` (Z1–Z10) +
  `docs/v2-substrate-study-plan.md` (Z11f).
- Script: `scripts/graduate.ts` + `npm run graduate`.
- Fixtures: `workshop/observations/fixtures/verdict-{10,11-resolvable,11-needs-human}-hypothesis.json`.
- Prior verdicts: `workshop/observations/probe-spike-verdict-{01..10}.md`.
- Commit trail (this slice):
  - `59460b1` Z11a.1 domain types
  - `db15c4a` Z11a.2 resolvable corpus + surface backlog
  - `f960d7f` Z11a.3 needs-human corpus × 14
  - `eb906f1` Z11a.4a rung kernel + form-submission
  - `9de625a` Z11a.4b PatternRegistry + intent classifier + strategy
  - `f927a6c` Z11a.4c 5 more seed patterns
  - `2bc840e` Z11f plan doc (architectural design)
  - `f7e16d1` Z11a.5 compile-corpus CLI + emitter + heuristic classifier
  - `2415118` Z11a.6 real evaluators + ReceiptStore widening
  - (this commit) Z11a.7 seed hypotheses + verdict-11
- Log locations:
  - `workshop/logs/hypotheses.jsonl`
  - `workshop/logs/probe-receipts/*.json`
  - `workshop/logs/scenario-receipts/*.json`
  - `workshop/logs/compilation-receipts/*.json`  *(NEW in Z11a.5)*
  - `workshop/logs/hypothesis-receipts/*.json`
  - `workshop/logs/ratchets.jsonl`
  - `workshop/logs/scoreboard-snapshots/*.json`
- CLI verbs (workshop-lane):
  - `tesseract compounding-{scoreboard, improve, hypothesize, ratchet}`
  - `tesseract probe-spike --emit-receipts`
  - `tesseract scenario-verify --emit-receipts`
  - `tesseract compile-corpus --corpus {resolvable|needs-human|both}`  *(NEW in Z11a.5)*

## Closing note

Verdict-10 asked: is the compounding engine measuring product
efficacy, or is it measuring plumbing? The answer then was
"plumbing, with a single narrow cohort." The answer now, under
Z11a, is "three cohorts, two prediction kinds, all synthetic but
with one cohort held adapter-invariant by construction."

The measurement surface has grown substantially — but the
grounding has not. The corpus remains fabricated; the compile
path remains heuristic; the pattern-ladder's OutSystems-generic
tier remains hand-guessed. Verdict-11's honesty rubric names
these limits explicitly and puts Z11d (real reasoning) and Z11f
(real OutSystems grounding) on the forward queue as the next
rungs of the epistemic ladder.

What the engine now measures that it couldn't pre-Z11a is real
and load-bearing: per-cohort adapter sensitivity, intervention
fidelity as a first-class prediction kind, and the infrastructure
for the full cognitive-cost-per-resolution signal that will
activate under Z11d. The graduation gate holds on synthetic
substrate with the multi-cohort measurement surface genuinely
exercised — a necessary step before real grounding becomes
measurable, not a substitute for it.
