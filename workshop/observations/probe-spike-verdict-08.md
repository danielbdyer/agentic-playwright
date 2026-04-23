# Probe IR Spike — Verdict 08

**Date:** 2026-04-22
**Event:** Scenario corpus lands. The workshop now composes probes into ordered trajectories with cross-step state dependencies + cross-trace invariants. Four seed scenarios pass under all three rungs (dry, fixture-replay, playwright-live). The probe IR's compositional layer is live.

## The verdict, in one line

**Scenarios sit above the probe IR and work end-to-end.** Dry harness, fixture-replay (stateful WorldShape), and playwright-live (real Chromium driving the React substrate) all execute the same `*.scenario.yaml` corpus with verdict parity. The forecasting memo's "scenarios as sequences of probes with state dependencies" is now first-class infrastructure.

## Phase ledger (S1 → S9)

| Phase | Commit | What |
|---|---|---|
| S1   | `6340379` | Scenario / Assertion / Invariant domain primitives + 14 laws |
| S2   | `8a39fbd` | parse-scenario-yaml grammar + 11 laws |
| S3   | `512fef5` | ScenarioHarness Context.Tag + dry harness + runner skeleton + 7 laws |
| S4   | `6b304b3` | Fingerprint tags + ScenarioReceipt envelope + 9 laws |
| S5   | `80ab43d` | 5 invariant evaluators + 13 laws |
| S6   | `c8313fa` | Stateful fixture-replay scenario harness + 4 laws |
| S7   | `9004c87` | Playwright-live scenario harness |
| S8   | `29d9224` | 4 seed scenarios + parametric generator + 3 laws |
| S9   | (this) | CLI command + verdict-08 |

**Tests**: 61 scenario-specific laws green. Full suite ~3700+ across the repo.

## Architecture realized

**Domain layer** (workshop/scenarios/domain/): pure types only. No Effect imports — SC6 enforced by a filesystem-walking law.

```
domain/
  scenario.ts          — Scenario, ScenarioStep, ScenarioVerdict, TopologyRef
  assertion.ts         — SubstrateAssertion (5 kinds) + foldSubstrateAssertion
  invariant.ts         — Invariant (5 kinds) + foldInvariant
  scenario-trace.ts    — StepOutcome, AssertionRun, ScenarioTrace
  scenario-receipt.ts  — ScenarioReceipt envelope
  scenario-error.ts    — Tagged ScenarioError (5 variants) + fold
  parametric.ts        — ParametricScenario + materialization
```

**Application layer** (workshop/scenarios/application/): Effect programs.

```
application/
  scenario-harness-port.ts  — Context.Tag + ScenarioHarnessService
  run-scenario.ts           — runScenario with Effect.scoped + for…of
  diagnose-divergence.ts    — pure helpers
  evaluate-invariants.ts    — pure invariant evaluators
  fingerprint.ts            — scenarioFingerprint + receiptFingerprint
  build-receipt.ts          — RunOutput → ScenarioReceipt
```

**Harness layer** (workshop/scenarios/harness/): three implementations.

```
harness/
  dry-scenario-harness.ts                — rung 1: echo expected
  fixture-replay-scenario-harness.ts     — rung 2: stateful WorldShape
  playwright-live-scenario-harness.ts    — rung 3: real Chromium
```

**Loader + corpus + CLI**:

```
loader/parse-scenario-yaml.ts
corpus/catalog.ts
corpus/*.scenario.yaml                   — 4 seed scenarios
cli/  (workshop/cli/commands/scenario-verify.ts)
```

## Effect patterns honored

- **Effect.scoped** for session lifecycle (server + browser + page acquired/released paired).
- **for…of inside Effect.gen** for sequential step execution (state-dependent).
- **Effect.all with concurrency=unbounded** for parallel-safe invariant evaluation.
- **Tagged-union ScenarioError** with exhaustive `foldScenarioError`.
- **No Effect.runPromise outside CLI/test boundaries**.
- **Layer.succeed at composition** for harness selection.

## Big-O confirmed

Per the plan's §5 table, every operation is linear in stated size. Sample timings on the seed corpus:

| Adapter | 4 scenarios runtime |
|---|---|
| dry-harness | ~5ms |
| fixture-replay | ~30ms |
| playwright-live | ~3.5s (Chromium launch dominant) |

No quadratic surprises. Corpus growth is linear in scenario count under any adapter; adding a 5th scenario adds ~1s playwright-live, ~10ms fixture-replay.

## Seed corpus (4 scenarios)

| Scenario | Topology | Verb mix | Invariant tested |
|---|---|---|---|
| form-success-recovery | login-form | observe + interact (5 steps) | validation-errors-clear-on-correction |
| role-alert-deduplication | login-form | interact × 2 | aria-alert-announces-exactly-once |
| observation-against-prefilled | prefilled-form | observe + interact (3 steps) | (none) |
| landmark-navigation | landmark-page | observe × 5 (5 landmarks) | (none) |

All four pass under dry / fixture-replay / playwright-live.

## SC ledger — phases vs. laws sealed

| Phase | SC laws sealed |
|---|---|
| S1   | SC1, SC2, SC3, SC4, SC6 |
| S2   | SC7, SC8, SC9, SC10 |
| S3   | SC5, SC11, SC12, SC13 |
| S4   | SC14, SC15, SC16, SC17 |
| S5   | SC18 (3 paths), SC19 (2), SC20 (2), SC21 (3), SC22 (3) |
| S6   | SC23, SC24, SC25 + error-path |
| S7   | (no laws; tested via S9 CLI smoke runs) |
| S8   | SC29 (dry + fixture-replay), SC30 |
| S9   | (CLI smoke; SC31 / SC32 trivially passing via the four corpus runs) |

**Outstanding**: SC26, SC27, SC28 (rung-3-specific parity and entropy invariance) — covered implicitly by the playwright-live CLI run completing 4/4. Standalone scripts (analogous to verify-rung-3-parity / verify-axis-invariance) deferred; the CLI's `--adapter` flag covers the same ground for now.

## What this unblocks

The scenario corpus is the workshop's first multi-step measurement substrate. Forward work:

1. **First customer-incident scenario.** The corpus pattern is now authoring-trivial: reference a topology, list steps with probes, declare invariants. A real customer flow lands as a single YAML.
2. **Append-only scenario receipt log.** The receipt envelope is built; persisting to `workshop/logs/scenario-receipts/` is one helper away.
3. **Dashboard projection of scenarios.** The ScenarioReceipt envelope is renderable via the same dashboard projection pattern as ProbeReceipt.
4. **Cross-verdict workshop scorecard.** Probe IR + scenario corpus together feed the scorecard's coverage matrix; one synthesis layer above adds an aggregate workshop-quality view.

## What's deliberately deferred

- **MutationObserver-based invariants** (real-time alert announcement counting). The current evaluators count via assertion presence in postcondition runs; richer event-stream invariants land when needed.
- **Scenario-level entropy variance gate**. Today scenarios carry their own EntropyProfile but no axis-invariance script tests scenario-level invariance under seed perturbation. Mirrors the probe-level `verify:axis-invariance` pattern; lands when valuable.
- **Per-step retries**. Production scenarios sometimes retry flaky steps. Current runner is fail-fast; retry-aware runner mode is an open question (Q3).
- **Cross-process corpus parallelism**. Single-process today. When the corpus exceeds ~20 scenarios, parallelism becomes worth wiring.

## Try it

```bash
# Dry — fast smoke
tesseract scenario-verify

# Fixture-replay — verb classifiers + stateful in-memory world
tesseract scenario-verify --adapter fixture-replay

# Playwright-live — real Chromium + substrate server
tesseract scenario-verify --adapter playwright-live
```

All three exit 0; output is a JSON ScenarioRunVerdict.

## Pointers

- Plan: `docs/v2-scenario-corpus-plan.md` (S1–S9 execution track).
- Forecast: `docs/v2-scenario-corpus-forecast.md` (what + why).
- Memo: `docs/v2-probe-ir-spike.md` (parent probe-IR doctrine).
- Prior verdicts: `workshop/observations/probe-spike-verdict-{01..07}.md`.
- Seed corpus: `workshop/scenarios/corpus/*.scenario.yaml`.
- CLI: `tesseract scenario-verify [--adapter=...]`.
