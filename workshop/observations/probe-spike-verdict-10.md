# Probe IR Spike — Verdict 10

**Date:** 2026-04-23
**Event:** The compounding engine graduates against real evidence.
Probe + scenario receipts flow to disk, probe coverage is derived
from the manifest (not vacuous), hypothesis receipts accumulate
across cycles, and `tesseract compounding-scoreboard` reports
`graduation: { state: 'holds', missingConditions: [] }` on the
third invocation of a fresh-clone reproduction sequence wrapped
in `scripts/graduate.ts`.

## The verdict, in one line

**The graduation gate holds.** The four conditions
(`probe-coverage-is-100`, `scenario-corpus-all-passes`,
`hypothesis-confirmation-rate-sustained`,
`no-ratchet-regressions`) are simultaneously satisfied against
the dry-harness probe substrate. The workshop now runs its own
feedback loop end-to-end from a clean tree in ~20 seconds with a
single `npm run graduate`.

## Phase ledger (Z10a → Z10f)

Verdict 09 shipped the compounding engine scaffolding (Z1–Z10).
Verdict 10 covers the wiring follow-ups that actually drove real
evidence through it.

| Phase | Commit | What |
|---|---|---|
| Z10a | `1cb6896` | `probe-spike` + `scenario-verify` write receipts (`--emit-receipts`, `--hypothesis-id`); probe-receipt / scenario-receipt emitter modules |
| Z10b | `893c662` | `deriveProbeTargets` walks the probe manifest and surfaces the (verb × facetKind × errorFamily) target set; `probeCoverageRatio` stops short-circuiting to 1 on empty targets |
| Z10c | `4e7f957` | `ReceiptStore.listHypothesisReceipts` returns prior cycles in ascending `computedAt` order; `computeScoreboard` folds them into `trajectories` so the sustained-rate gate can evaluate |
| Z10d | `60c4135` | `--input` + `--scenario-id` join the shared CLI flag descriptor table; `compounding-hypothesize` / `compounding-ratchet` finally parse under the registry |
| Z10e | `b0f7999` | `workshop/observations/fixtures/verdict-10-hypothesis.json` — the seed hypothesis the reproduction sequence authors |
| Z10f | `653d147` | `scripts/graduate.ts` + `npm run graduate` — the 7-command recipe wrapped as an exit-coded script |
| Z10g | (this) | Verdict 10 artifact |

**Tests**: 3,808 passing / 10 skipped at every Z10a–Z10g commit.
Seam laws green. Zero new `ALWAYS_ALLOWED_PRODUCT_PATHS`
entries. Zero `product/` imports from `workshop/compounding/`.

## Reproduction

```bash
rm -rf workshop/logs && git status
# working tree must be clean

npm run build
node dist/bin/tesseract.js compounding-hypothesize \
  --input workshop/observations/fixtures/verdict-10-hypothesis.json
node dist/bin/tesseract.js probe-spike --emit-receipts \
  --hypothesis-id h-observe-substantive
node dist/bin/tesseract.js scenario-verify --emit-receipts \
  --hypothesis-id h-observe-substantive
node dist/bin/tesseract.js compounding-scoreboard
node dist/bin/tesseract.js compounding-scoreboard
node dist/bin/tesseract.js compounding-scoreboard
```

Or, equivalently (the script checks exit code):

```bash
npm run graduate
```

Both produce, on the third `compounding-scoreboard`:

```json
{
  "state": "holds",
  "missingConditions": [],
  "conditions": [
    { "name": "probe-coverage-is-100",                   "held": true,
      "detail": "all manifest verbs have a passing probe receipt" },
    { "name": "scenario-corpus-all-passes",              "held": true,
      "detail": "scenario corpus 100% passing" },
    { "name": "hypothesis-confirmation-rate-sustained",  "held": true,
      "detail": "rolling rate 1.000 >= floor 0.8" },
    { "name": "no-ratchet-regressions",                  "held": true,
      "detail": "no active ratchet is currently broken" }
  ]
}
```

## Observed state at graduation

- **34 probe receipts** emitted across 18 manifest-derived
  `(verb × facetKind × errorFamily)` targets. Coverage is
  substantive, not vacuous — every declared triple has a passing
  receipt.
- **4 scenario receipts** (form-success-recovery, landmark-
  navigation, observation-against-prefilled, role-alert-
  deduplication); all pass.
- **3 hypothesis-receipt entries** under
  `workshop/logs/hypothesis-receipts/`, one per scoreboard cycle.
  Each carries `confirmedCount: 38`, `refutedCount: 0`,
  `cycleRate: 1` for the `probe-surface:observe/element/none`
  cohort.
- **3 scoreboard snapshots** under
  `workshop/logs/scoreboard-snapshots/` with distinct
  `computedAt` values separated by ~5 seconds (subprocess startup
  dominates on typical hardware; millisecond collisions are not a
  concern at the spawn cadence `graduate.ts` produces).
- **1 trajectory** (`probe-surface:observe/element/none`,
  `deepestSampled: 3`, `rollingRate: 1.0`). The sustained-rate
  gate's floor is 0.8 over 3 cycles; 1.0 over 3 cycles clears it.

## Honesty rubric

Classify this graduation against the three-tier rubric:

1. **Structural** — mechanics only; any receipts hold it. The
   gate would fire on 3 zero-evidence cycles.
2. **Structural-plus-narrow** — real upstream flow, single cohort.
   Probes actually execute; scenarios actually run; receipts
   actually get written by the normal authoring path and filtered
   by hypothesis-id at evaluation time. One cohort, one
   hypothesis, one substrate.
3. **Substantive** — multiple cohorts + multiple hypotheses +
   cross-substrate parity. The gate holds across probe-surface AND
   scenario-trajectory cohorts, against at least two hypotheses
   with independent prediction kinds, under at least two
   harnesses (e.g., dry-harness + fixture-replay).

**This graduation is structural-plus-narrow.** Real probe and
scenario receipts flow through the engine's normal authoring path.
Real probe coverage is computed from manifest-derived targets.
Receipt-to-hypothesis binding is exercised end-to-end. But the
hypothesis ledger holds a single entry, the trajectory set
covers a single probe-surface cohort, no scenario-trajectory
hypothesis is authored, and the substrate is the dry-harness
alone — fixture-replay and playwright-live remain unexercised at
graduation time.

**To promote to substantive:**
- Author a second hypothesis under a scenario-trajectory cohort
  (e.g., "form-success-recovery stays passing for N cycles"),
  verify the gate still holds.
- Author a third hypothesis on a different probe surface
  (e.g., `observe/element/not-found`), verify.
- Run the graduation sequence under the fixture-replay harness
  (not just the dry-harness) and verify receipt parity.
- Exercise `compounding-ratchet` against a real scenario-id,
  then break it intentionally to verify `no-ratchet-regressions`
  fails as designed. (Today the gate holds vacuously — zero
  active ratchets means zero can be broken.)

## What the compounding engine now measures that it couldn't pre-Z10

With the Z10a–Z10e wiring shipped, three observations become
available that were structurally impossible before:

1. **Cross-cycle trajectory depth.** Pre-Z10c, `computeScoreboard`
   treated each invocation as a standalone cycle because the CLI
   never supplied `priorHypothesisReceipts`. The sustained-rate
   gate had nothing to integrate over. Z10c wired
   `listHypothesisReceipts()` on the receipt store and folded its
   output into the trajectory combine; now three scoreboard calls
   produce three trajectory entries for the same cohort, and the
   gate can distinguish "one lucky cycle" from "sustained rate."
2. **Substantive probe-coverage gaps.** Pre-Z10b, `probeTargets`
   passed empty; the coverage ratio short-circuited to 1 if any
   receipt existed. The gate was gaming itself. Z10b derived the
   18-element target set from the manifest and made
   `probe-coverage-is-100` answer "every declared target has a
   passing receipt this cycle" — a claim that can actually be
   false, and whose `detail` string now points at specific
   uncovered triples when it is.
3. **Hypothesis-bound evidence filtering.** Pre-Z10a, probe and
   scenario receipts had no on-disk presence at all — the
   `--emit-receipts` flag did not exist. The compounding engine's
   filter-evidence pass ran against an empty evidence log.
   Z10a+d wired per-receipt JSON emission plus the
   `--hypothesis-id` re-stamp, so the engine now evaluates
   authored hypotheses against evidence the normal authoring flow
   produced — not against hand-synthesized test fixtures.

Taken together, these three measurements are what make the
graduation gate a *state function over real evidence* rather than
a static set of booleans over an empty log.

## Forward queue

Three concrete next-agent tasks:

1. **Author a scenario-trajectory hypothesis.** Today the
   hypothesis ledger is probe-surface only. Cohort-kind coverage
   expands to both union arms by authoring, e.g.,
   `{ kind: 'scenario-trajectory', scenarioId:
   'form-success-recovery' }` with a
   `{ kind: 'no-regression', sinceTimestamp }` prediction.
   Verifies the gate holds across both cohort kinds; closes the
   structural-plus-narrow → substantive gap on cohort diversity.
2. **Run the graduation sequence under fixture-replay.** The
   dry-harness is one substrate. `workshop/probe-derivation/
   probe-harness.ts` supports a fixture-replay mode that
   re-animates past run traces as probes. Wrap `graduate.ts` with
   a `--harness fixture-replay` flag, point it at a checked-in
   trace corpus, and check whether the gate holds with identical
   confirmation rate. Cross-substrate parity is the leading
   indicator of substantive graduation.
3. **Wire trust-policy confirmation floor.** Plan §11 Q5 left
   `confirmationRateFloor` + `minSustainedCycles` as
   CLI-overridable constants. Move them into
   `workshop/policy/trust-policy.yaml` so operators can tune the
   gate through the same proposal-gated discipline the policy
   already enforces on catalog writes. Hook point:
   `workshop/compounding/application/graduation.ts` — replace the
   literal `0.8` / `3` defaults with a `TrustPolicy`-derived
   pair. Small integration; unblocks per-customer calibration.

## Seam discipline

- **Zero new `ALWAYS_ALLOWED_PRODUCT_PATHS` entries** across
  Z10a–Z10g. The graduate script is a workshop-lane drive-
  through; it invokes the compiled CLI rather than importing
  across the seam.
- **Two additive product-side surface widenings** (inherited from
  verdict 09): `FingerprintTag` and `WorkflowScope` gained
  `'hypothesis'` + `'hypothesis-receipt'`. No new widenings in
  this slice.
- **Zero RULE_3 grandfather entries.** Seam-enforcement laws
  green on every Z10a–Z10g commit.
- **`product/cli/shared.ts` gained two flag descriptors** at
  Z10a (`--emit-receipts`, `--hypothesis-id`) and two at Z10d
  (`--input`, `--scenario-id`). All four are pure table entries
  in the shared CLI contract — the seam half that workshop is
  already permitted to ride through. Zero product-side code
  branches on them.

## Plan deviations

None beyond what verdict 09 already recorded. The Z10a–Z10g slice
is a faithful execution of the wiring described in the Z10
commit message trail; no surprise findings.

## Pointers

- Plan: `docs/v2-compounding-engine-plan.md` §12 (success
  criteria), §11 (open questions).
- Script: `scripts/graduate.ts`; alias `npm run graduate`.
- Fixture: `workshop/observations/fixtures/verdict-10-hypothesis.json`.
- Prior verdict: `workshop/observations/probe-spike-verdict-09.md`.
- Commit trail: `1cb6896` → `893c662` → `4e7f957` → `60c4135` →
  `b0f7999` → `653d147` → (this commit).
- Log locations:
  - `workshop/logs/hypotheses.jsonl`
  - `workshop/logs/probe-receipts/*.json`
  - `workshop/logs/scenario-receipts/*.json`
  - `workshop/logs/hypothesis-receipts/*.json`
  - `workshop/logs/scoreboard-snapshots/*.json`

## Closing note

Verdict 09 named the state function; verdict 10 drove real
evidence through it and watched it fire. The honest classification
is *structural-plus-narrow* — single cohort, single hypothesis,
single substrate. The forward queue names what it takes to reach
*substantive*: cohort diversity, hypothesis diversity, substrate
parity. Each of those is now a well-defined follow-up rather than
a structural unknown, which is the concrete signal the engine's
measurement surface works.
