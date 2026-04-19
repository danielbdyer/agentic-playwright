# workshop/

The measurement consumer. Reads `product/`'s manifest; derives probes; runs them through `product/`'s normal authoring flow; produces metrics, scorecards, receipts.

## Single responsibility

`workshop/` answers "is `product/` getting better?" It does this by:

1. Reading `product/manifest/manifest.json` to learn what verbs, facet kinds, and error families `product/` declares.
2. Synthesizing probes (per-verb fixture + manifest → `Probe[]`) under `workshop/probe-derivation/`.
3. Running those probes through `product/`'s normal authoring flow.
4. Computing metrics over the run-record log.
5. Appending scorecard entries, hypothesis receipts, and verification receipts to its append-only logs.

`workshop/` is a first-class observer sibling to `product/`, not a dependent. It does not ship to customers. It puts itself out of a job when probe coverage = 100% and the batting average sustains above its floor (see `docs/v2-transmogrification.md §6.3`).

## What lives here

- `workshop/orchestration/` — the speedrun four-verb pipeline (`corpus`, `iterate`, `fitness`, `score`, `baseline`).
- `workshop/metrics/` — the seven-visitor metric tree (audit in `docs/v2-substrate.md §8a`).
- `workshop/scorecard/` — scorecard JSON + history.
- `workshop/convergence/` — the hylomorphic convergence-proof harness.
- `workshop/policy/` — trust-policy YAML + evaluator.
- `workshop/ledger/` — improvement ledger (v1 name; may be retired as probe receipts replace it).
- `workshop/probe-derivation/` — the manifest→probe module (+ `transitional.ts` for Step 1's pre-manifest stopgap).
- `workshop/logs/` — receipts, metric-compute records, evaluation summaries.
- `workshop/observations/` — customer-reality probe memos and other durable human observations.

## What this folder can and cannot do

- Can read `product/manifest/manifest.json` and the shared append-only log set.
- Can declare metric verbs in the manifest (subject to the manifest's frozen-signature discipline).
- **Cannot import any `product/` internal type** except those exported via manifest-declared verbs and public domain types. The seam-enforcement test catches violations.
- Cannot write to `product/`'s catalog, logs, or generated artifacts. All effects on `product/` go through proposal-gated reversibility (see `docs/v2-transmogrification.md §6`).

## When working here

Read `docs/v2-direction.md §5` (measurement substrate) and `docs/v2-substrate.md §7 + §8a` (measurement stance + per-visitor audit). New metric verbs go through the same proposal-gated discipline as any other manifest addition.
