# Operator Handbook

This is the primary operator surface for Tesseract. Use it when you need to baseline a run, inspect a repair queue, approve canonical knowledge updates, or evaluate the synthetic benchmark lane.

## Core loop

1. Start with a baseline run when you want a zero-write sanity pass.
2. Inspect `workflow`, `review`, and `inbox` to see which lane won and what still needs intervention.
3. Approve a proposal from the inbox when the suggested canonical patch is correct.
4. Read the rerun plan and execute only the impacted scenarios or runbooks.
5. Use `benchmark` and `scorecard` to measure field-awareness, drift tolerance, and repair cost over the flagship synthetic benchmark.

## Baseline and no-write

Use these flags on mutating commands such as `refresh`, `run`, `graph`, `types`, `benchmark`, `approve`, and `inbox`:

- `--no-write`: compute the same derived artifacts, but keep writes in the `wouldWrite` ledger instead of persisting to the repo seams.
- `--baseline`: alias for `--no-write --interpreter-mode dry-run`.

Example:

```powershell
tesseract refresh --ado-id 10001 --baseline
tesseract run --runbook demo-smoke --baseline
```

The CLI result always includes:

- `executionPosture`
- `wouldWrite`

Use that ledger to compare baseline output with a persisted run before you touch canon.

## Reading workflow and review surfaces

`workflow` is the lane map. It tells you:

- which control surfaces are active
- the precedence stacks that applied
- current fingerprints
- benchmark surfaces in the workspace
- inbox items for the selected scenario

`generated/{suite}/{ado_id}.review.md` is the readable scenario report. It shows:

- stage metrics
- handshakes crossed by each step
- winning concern and winning source
- inbox item ids
- canonical next commands

Recommended inspection sequence:

```powershell
tesseract workflow --ado-id 10001
tesseract inbox --ado-id 10001
tesseract paths --ado-id 10001
tesseract trace --ado-id 10001
```

## Inbox

Project the operator inbox with:

```powershell
tesseract inbox
tesseract inbox --ado-id 10001
tesseract inbox --kind proposal
tesseract inbox --status actionable
```

The inbox aggregates:

- review-required proposals
- degraded locator hotspots
- needs-human steps
- blocked trust-policy decisions

Each item includes:

- stable inbox id
- stable proposal id when relevant
- winning concern and winning source
- next commands

Derived inbox artifacts:

- `.tesseract/inbox/index.json`
- `generated/operator/inbox.md`

## Approvals and rerun plans

Approve a proposal directly from its stable id:

```powershell
tesseract approve --proposal-id proposal-...
```

That command:

1. applies the canonical patch
2. writes `.tesseract/policy/approvals/{proposal_id}.approval.json`
3. emits a rerun plan
4. refreshes the inbox view for the affected scenario

Inspect the rerun plan without approving:

```powershell
tesseract rerun-plan --proposal-id proposal-...
```

The rerun plan reports:

- impacted scenarios
- impacted runbooks
- impacted projections
- why each item was selected

## Benchmark and scorecard

The flagship synthetic benchmark lives in `benchmarks/flagship-policy-journey.benchmark.yaml`.

Run it:

```powershell
tesseract benchmark --benchmark flagship-policy-journey
```

Reproject the scorecard without executing scenarios again:

```powershell
tesseract scorecard --benchmark flagship-policy-journey
```

Derived benchmark artifacts:

- `.tesseract/benchmarks/{benchmark}/{run_id}.dogfood-run.json`
- `generated/benchmarks/{benchmark}.scorecard.json`
- `generated/benchmarks/{benchmark}.scorecard.md`
- `generated/benchmarks/{benchmark}.variants.spec.ts`
- `generated/benchmarks/{benchmark}.variants.trace.json`
- `generated/benchmarks/{benchmark}.variants.review.md`

The scorecard tracks:

- unique field-awareness count
- first-pass screen resolution rate
- first-pass element resolution rate
- degraded locator rate
- review-required count
- repair-loop count
- operator-touch count
- knowledge churn by artifact type

## Next-command recipes

Use these when moving through the operator loop:

```powershell
tesseract run --runbook demo-smoke --baseline
tesseract inbox --status actionable
tesseract approve --proposal-id proposal-...
tesseract rerun-plan --proposal-id proposal-...
tesseract benchmark --benchmark flagship-policy-journey
tesseract scorecard --benchmark flagship-policy-journey
```
