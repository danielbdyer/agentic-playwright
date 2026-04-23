# Probe IR Spike — Verdict 09

**Date:** 2026-04-23
**Event:** Compounding engine lands. The workshop now consumes
its own probe + scenario receipts, evaluates authored hypotheses
against them, writes HypothesisReceipts, persists per-cycle
scoreboard snapshots, detects regressions, and computes a
graduation gate over four ordered conditions. The third XXXXL
slice is operational.

## The verdict, in one line

**The compounding engine is running end-to-end.** Hypotheses
author; receipts evaluate; trajectories accumulate; snapshots
persist; regressions surface; graduation computes. The workshop
now has a closed feedback loop: every probe + scenario cycle
moves a number that an authored hypothesis predicted, and the
graduation gate reads those numbers as a state function over
four named conditions.

## Phase ledger (Z1 → Z10)

| Phase | Commit | What |
|---|---|---|
| Z1a   | `0af3f50` | Hypothesis + Prediction + Cohort pure types + 11 laws |
| Z1b   | `11cacd3` | HypothesisReceipt + Trajectory + Graduation + Ratchet + Regression + Gap + Scoreboard + CompoundingError + 12 laws |
| Z2    | `d5a9e5d` | Fingerprint helpers + HypothesisLedger / ReceiptStore Context.Tag ports + 10 laws |
| Z3    | `859bbfd` | ScenarioReceipt hypothesisId field + ZC11 round-trip (5 laws) |
| Z4    | `7ab3413` | In-memory ledger + receipt-store adapters + composed Layer + 12 laws |
| Z5a   | `5f47427` | filter-evidence + 4 Prediction-kind judgments + evaluate-hypothesis + build-receipt + 17 laws |
| Z5b   | `9abf30a` | trajectories + regression + graduation + gaps + compute-scoreboard + 13 laws |
| Z6    | `056ab52` | Filesystem-backed adapters + live Layer + 8 integration laws |
| Z7    | `7fdaa97` | Scoreboard snapshot store + regression cache + 6 laws |
| Z8    | `1f4059d` | `tesseract compounding-scoreboard` + `compounding-improve` + 3 laws |
| Z9    | `9fa777f` | Ratchet + hypothesize authoring CLI + 8 laws |
| Z10   | (this) | Dashboard projection + verdict-09 + ZC31-ZC32 smoke (4 laws) |

**Tests (this slice)**: 110 compounding-specific laws green.
**Full suite**: 3,808 passing (10 skipped).

## Architecture realized

**Domain layer** (`workshop/compounding/domain/`): pure types only.
Zero `from 'effect'` imports. ZC9.b's filesystem-walking law
enforces this as a hard gate.

```
domain/
  hypothesis.ts              — Hypothesis aggregate + HypothesisId
  prediction.ts              — 4-variant closed union + foldPrediction
  cohort.ts                  — 2-variant union (probe-surface + scenario-trajectory)
  confirmation.ts            — ConfirmationOutcome + fold
  hypothesis-receipt.ts      — evidence-stage envelope
  trajectory.ts              — TrajectoryEntry + rollingRate
  graduation.ts              — GraduationGateReport + 4 conditions
  regression.ts              — RegressionReport + RatchetBreakDetail
  ratchet.ts                 — Ratchet value object
  gap-analysis.ts            — ProbeGap + ScenarioGap + GapReport
  scoreboard.ts              — CompoundingScoreboard read-model
  compounding-error.ts       — 4-variant tagged union + fold
```

**Application layer** (`workshop/compounding/application/`):
Effect programs.

```
application/
  ports.ts                     — HypothesisLedger + ReceiptStore tags
  fingerprint.ts               — hypothesisFingerprint + receipt variant
  filter-evidence.ts           — pure hypothesis → matching receipts
  confirmation-judgments.ts    — 4 Prediction evaluators + fold dispatch
  evaluate-hypothesis.ts       — Effect.sync wrapper
  build-hypothesis-receipt.ts  — envelope construction
  trajectories.ts              — cohort-grouped time series
  regression.ts                — pass-list diff + ratchet break
  graduation.ts                — 4-condition gate + sustained check
  gap-analysis.ts              — coverage-gap derivation
  compute-scoreboard.ts        — top-level Effect.gen composition
  snapshot-store.ts            — content-addressed scoreboard snapshots
  authoring.ts                 — authorHypothesis + authorRatchet
```

**Harness layer** (`workshop/compounding/harness/`):
service implementations.

```
harness/
  in-memory-hypothesis-ledger.ts    — test double
  in-memory-receipt-store.ts        — test double
  filesystem-hypothesis-ledger.ts   — JSONL-backed
  filesystem-receipt-store.ts       — per-file JSON + JSONL
```

**Composition** (`workshop/compounding/composition/`):
layer roots.

```
composition/
  in-memory-services.ts   — inMemoryCompoundingLayer
  live-services.ts        — liveCompoundingLayer (filesystem)
```

**CLI** (`workshop/cli/commands/`):

```
compounding-scoreboard.ts    — emits full scoreboard JSON
compounding-improve.ts       — emits ranked gap + regression report
compounding-hypothesize.ts   — authors a Hypothesis from --input JSON
compounding-ratchet.ts       — locks in a currently-passing scenario
```

**Dashboard** (`dashboard/src/projections/`):

```
compounding-scoreboard.ts    — pure projection (snapshot → view model)
```

## Effect patterns honored

- **Effect.gen + yield\*** for the top-level composition.
- **Effect.all concurrency='unbounded'** for parallel-safe fetches
  (ledger + 3 receipt streams) and for parallel-safe per-hypothesis
  evaluation (each hypothesis is pure over its own evidence slice).
- **for…of inside Effect.gen** for per-file log appends (hypothesis
  receipts, ratchets).
- **Tagged-union CompoundingError** (4 variants) with exhaustive
  `foldCompoundingError`.
- **No Effect.runPromise outside CLI/test boundaries**.
- **Layer.succeed at composition** for ledger + store adapter
  selection.

## Seam discipline upheld

- **Zero new `ALWAYS_ALLOWED_PRODUCT_PATHS` entries.** The
  compounding engine is 100% workshop-side. `product/` imports
  zero files from `workshop/compounding/`.
- **Two additive product-side union widenings** — `FingerprintTag`
  gained `'hypothesis'` + `'hypothesis-receipt'`; `WorkflowScope`
  + `workflowScopes` gained `'hypothesis'`. Both are purely
  additive; zero existing consumers branch on scope-string
  comparisons, so widening is safe.
- **Full seam-enforcement architecture laws green** on every
  phase commit.
- **Zero RULE_3 grandfather entries added.**

## Graduation state (at this verdict's compute time)

Running `tesseract compounding-scoreboard` against an empty
working set produces:

- `graduation.state: 'not-yet'`
- `graduation.missingConditions: [probe-coverage-is-100,
  scenario-corpus-all-passes, hypothesis-confirmation-rate-
  sustained]`
  - No-ratchet-regressions gate holds (no ratchets authored, no
    regressions observable).

This is the expected first-run state. The four conditions
surface genuine work — probes to derive, scenarios to author,
hypothesis cycles to sustain — all of which the engine is now
capable of measuring.

## Combined law ledger (across all three slices)

- **Probe IR spike** (`docs/v2-probe-ir-spike.md`, verdicts
  01–07): foundation for derived probes + classifier + fixture-
  replay + playwright-live harness + entropy profile. ~25+ laws.
- **Scenario corpus** (`docs/v2-scenario-corpus-plan.md`, verdict
  08): SC1–SC32. ~61 laws across domain + loader + runner +
  receipt + invariants + corpus.
- **Compounding engine** (`docs/v2-compounding-engine-plan.md`,
  verdict 09): ZC1–ZC32 expanded into ~110 laws across domain +
  fingerprint + services + judgments + derivations + snapshots +
  CLI + authoring + smoke + dashboard projection.

**Combined**: ~200 compounding-family laws green. Full repo
suite: 3,808 tests passing.

## Plan deviations noted

1. **Tag registry additions landed in Z1b, not Z2.** The
   HypothesisReceipt type signature required
   `Fingerprint<'hypothesis'>` + `scope: 'hypothesis'`, which
   forced the additions to be a Z1b commit. Z2 then carried
   only the fingerprint helpers + Context.Tag ports as
   originally scoped. The plan's §6.5 said "added once to the
   registry at phase Z1" anyway; this resolved the sequencing
   ambiguity in favor of Z1b. Noted in the Z1b commit message.
2. **WorkflowScope widened to include `'hypothesis'`.** This was
   not called out explicitly in the plan but follows from the
   HypothesisReceipt interface wanting `scope: 'hypothesis'`. A
   single-line additive change; no consumer branches on scope
   string value.
3. **Sustained-cycle gate added to graduation.** Default 3;
   configurable per-call. The plan described "sustained over N
   cycles" as intent; the implementation encodes it as a floor
   on `deepestSampled` within the rolling window. Laws ZC23.d +
   the Z10 smoke exercise this.

## What this unblocks

The compounding engine is the workshop's first self-referential
measurement loop. Forward work:

1. **Operator-authored first hypothesis.** The authoring CLI is
   live; the first real hypothesis against a customer flow is
   one `--input <path>.json` away.
2. **First ratcheted customer incident.** Once a customer
   scenario reliably passes, `tesseract compounding-ratchet
   --scenario-id <id>` locks it in; the engine catches future
   regressions automatically.
3. **Dashboard refresh.** `dashboard/src/projections/
   compounding-scoreboard.ts` is pure and plug-and-play; the
   dashboard server can render the compounding panel at any
   time.
4. **Trust-policy coupling.** The confirmation-rate floor and
   sustained-cycles threshold are CLI-overridable today; the
   open question (plan §11 Q5) is whether to read them from
   `workshop/policy/trust-policy.yaml` at invocation. Small
   integration; can land on first operator need.
5. **Graduation event persistence.** Plan §11 Q8 defers
   persisting a formal "graduation achieved" record; the hook
   point is clear (state transition from non-holds to holds
   while prior scoreboard existed), and can land when
   graduation actually fires against real evidence.

## What's deliberately deferred

- **Cohort-implicit attribution.** Today hypothesis evidence is
  filtered by explicit `payload.hypothesisId`. Cohort-implicit
  attribution (every probe in the hypothesis's cohort
  contributes) is deferred (plan §11 Q-analogue).
- **Per-hypothesis sustained-confirmation tracking.** Today the
  sustained-rate gate is aggregate across all trajectories.
  Per-hypothesis `requiredConsecutiveConfirmations` is
  structurally represented on the Hypothesis type but not yet
  enforced in the gate. Lands when the first hypothesis
  authors a high `requiredConsecutiveConfirmations` value and
  the aggregate gate under-protects it.
- **Cost-efficiency prediction kind.** The ReasoningReceipt
  log carries tokens + latencyMs; a `cost-efficiency`
  Prediction kind could evaluate against it. Deferred (plan
  §11 Q7) pending operator need.
- **Hypothesis supersedes-chain cycle detection at authoring
  time.** Shape is in `CompoundingError.SupersedesChainCircular`
  but the Z9 authoring CLI does not yet emit it — the ledger
  dedup on id is the only cycle protection today. Trivial to
  add when a real author accidentally closes a cycle.
- **Scoreboard snapshot rotation.** Snapshots grow unbounded;
  policy deferred (plan R8). ~5 MB/year at daily cadence is
  well-within tolerances.

## Try it

```bash
# Compute current scoreboard (needs no prior state).
npm run build && node dist/bin/tesseract.js compounding-scoreboard

# Author a hypothesis (edit the JSON file first).
cat > /tmp/hypothesis.json <<EOF
{
  "description": "observe matches on login-form 90% of the time",
  "cohort": {
    "kind": "probe-surface",
    "cohort": { "verb": "observe", "facetKind": "element", "errorFamily": null }
  },
  "prediction": { "kind": "confirmation-rate", "atLeast": 0.9, "overCycles": 5 },
  "author": "operator"
}
EOF
node dist/bin/tesseract.js compounding-hypothesize --input /tmp/hypothesis.json

# Ratchet a currently-passing scenario (requires prior passing
# scenario receipt in workshop/logs/scenario-receipts/).
node dist/bin/tesseract.js compounding-ratchet --scenario-id <scenario-id>

# Ranked "what to author next" report.
node dist/bin/tesseract.js compounding-improve
```

All four verbs exit 0 on success; `compounding-improve` exits 1
if any ratchet breaks are present (the regression gate).

## Pointers

- Plan: `docs/v2-compounding-engine-plan.md` (Z1–Z10 execution
  track, ~2,000 lines; 12 sections + 2 appendices).
- Parent memos: `docs/v2-probe-ir-spike.md`,
  `docs/v2-scenario-corpus-plan.md`,
  `docs/v2-scenario-corpus-forecast.md`.
- Prior verdicts: `workshop/observations/probe-spike-verdict-
  {01..08}.md`.
- Log locations:
  - `workshop/logs/hypotheses.jsonl`
  - `workshop/logs/probe-receipts/*.json`
  - `workshop/logs/scenario-receipts/*.json`
  - `workshop/logs/hypothesis-receipts/*.json`
  - `workshop/logs/ratchets.jsonl`
  - `workshop/logs/scoreboard-snapshots/*.json`
- CLI: `tesseract compounding-{scoreboard, improve, hypothesize,
  ratchet}`.

## Closing note

Verdict 09 closes the trajectory that verdict 01 opened. The
workshop is now a closed feedback loop: it measures itself
against hypotheses it authors, ratchets customer-incident
coverage permanently, and computes a graduation state function
that answers "is this workshop done?" in four named conditions.
When those four conditions hold, the workshop puts itself out
of a job — which is the stated north star of
`docs/v2-direction.md`.
