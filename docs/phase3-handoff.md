# Phase 3 Handoff

## Current stopping point

The repo is back at a stable checkpoint after the interrupted benchmark refactor.

Verified at pause:

- `lib/application/benchmark.ts` has been restored and is present again.
- `npm run types` passes.
- `tests/operator-workbench.spec.ts` benchmark scorecard test passes.

## Completed in this session

### Runtime closure

- Added a real derived runtime handoff artifact at `.tesseract/tasks/{ado_id}.runtime.json`.
- Generated specs now consume the runtime handoff instead of fabricating partial runtime handshake state.
- Moved runtime-handoff file loading out of `lib/runtime` so the architecture seam stays clean.
- `npm run test:generated` was fixed and passed after the handoff work.

### Active canon

- Proposal activation now applies schema-valid canonical patches immediately.
- Activated canon carries inline certification/lineage metadata.
- `resolved-with-proposals` is treated as executable now instead of being automatically execution-gated.
- Operator/certification flow was updated so certification acts as designation, not execution unblocking.

### Test and docs cleanup

- The previously red suite was driven back to green.
- Docs and repo guidance were updated to reflect active-canon semantics.
- Before the benchmark refactor was started, the full suite passed at `163` tests.

## What was intentionally not left half-done

The benchmark/schema expansion work was started, then paused and reverted before this handoff so the repo would stop in a coherent state.

Not implemented yet:

- richer benchmark schema for roles, approval states, drift profiles, seed defaults, and case caps
- benchmark CLI scope flags such as `--role`, `--state`, `--seed-count`, `--drift-profile`, and `--max-cases`
- expanded 18-screen policy dogfood harness
- crawl-and-map benchmark planning/output
- ratchet scorecard metrics for deterministic hit rate, active-canon hit rate, certification backlog, role/state coverage, and drift recovery

## Next recommended slice

Resume with the benchmark lane only, without touching the already-green runtime/active-canon path:

1. Extend `BenchmarkContext`, `BenchmarkScorecard`, and `DogfoodRun` types plus validators.
2. Add benchmark CLI scope flags and thread them into `projectBenchmarkScorecard`.
3. Build a deterministic matrix generator capped at 2,000 cases.
4. Add a new policy dogfood harness route/model with 15-20 screens, role variance, approval-state variance, and seeded drift.
5. Add dedicated tests for matrix determinism, role/state visibility, seeded drift reproducibility, and scorecard metrics.
6. Re-run:
   - `npm run types`
   - `npm test`
   - `npm run benchmark`
   - `npm run scorecard`

## Useful reminders

- The last verified green state for the runtime/active-canon work already exists in the current workspace.
- The benchmark refactor should be resumed from a clean additive branch of work, not from the interrupted half-step.
- If resuming soon, start by reading:
  - `lib/application/benchmark.ts`
  - `lib/domain/types/projection.ts`
  - `lib/domain/validation/core.ts`
  - `tests/operator-workbench.spec.ts`
  - `tests/policy-journey-harness.spec.ts`
