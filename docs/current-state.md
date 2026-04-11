# Current State

> Status: Active — implementation-truth snapshot for the roadmap transition.

This document is the fast reality check for the current Tesseract substrate. Use it with [README.md](../README.md) and [docs/convergence-backlog.md](./convergence-backlog.md) so roadmap work is aimed at live gaps instead of already-closed ones.

## Active doctrinal reframes

- **Reference-canon reframe (2026-04-10).** The dogfood YAMLs under `dogfood/knowledge/`, `dogfood/benchmarks/`, and non-intent `dogfood/controls/` are reclassified as **reference canon** — a transitional population that lives at lookup-chain slot 4, below real canonical artifacts. `.canonical-artifacts/` is greenfield and is populated only by real promotions through real gates (intervention receipts for slot 2, discovery promotions for slot 3). The prior one-shot migration script (`scripts/decompose-canon.ts`) is deleted. See [`docs/canon-and-derivation.md`](./canon-and-derivation.md) §§ 3.2a, 6, 11, 14.0 and [`docs/cold-start-convergence-plan.md`](./cold-start-convergence-plan.md) Phase A.
- **Single-corpus direction (2026-04-10).** The 20000-series reference cohort is the go-forward scenario corpus. The 10000-series golden scenarios remain only until their unit-test pins migrate to `tests/fixtures/`. See [`docs/scenario-partition.md`](./scenario-partition.md).
- **Temporal-epistemic kernel promotion (2026-04-10).** The formal K/L/S/V/D/R/A/C/M/H theorem groups moved out of archive to [`docs/temporal-epistemic-kernel.md`](./temporal-epistemic-kernel.md) and are now active doctrine for the alignment-targets wall.
- **M5/C6 operational definitions locked (2026-04-10).** M5 denominator = wall-clock + agentic-override maintenance. C6 N-window = one full loop iteration (harvest → scenario run → agentic intervention → fitness → demotion sweep). Cohort-comparable = same scenario IDs. See [`docs/alignment-targets.md`](./alignment-targets.md).
- **Four-axis envelope framing (2026-04-11).** Every artifact is a point in `Envelope<Stage, Source, Verdict><Payload: Fingerprint<Stage, Source>>` space. The four axis lifts (Stage/Source/Fingerprint/Verdict phantom types) have **landed** per `docs/envelope-axis-refactor-plan.md` Phase 0. The structural substrate is ready; what remains is the five scoreboard closures in `docs/synthetic-feature-completion-plan.md`. See [`VISION.md`](../VISION.md) § "The four-axis envelope — the upper ontology" for the full framing.
- **Synthetic feature completion plan (2026-04-11).** The executable sequence for driving the synthetic dogfood suite to feature completion is [`docs/synthetic-feature-completion-plan.md`](./synthetic-feature-completion-plan.md) — five commits: Source-axis extension (add `reference-canon` variant in code), C6 direct, M5 direct, promotion CIs, demotion sweep. When all five land, M5 and C6 are both `direct` above their 2026-Q2 floors and the system is ready for Phase E (runtime-family recognition against a real target).

## Status Matrix

| Workstream | Status | Notes |
|---|---|---|
| Reference-canon slot in lookup chain | `planned` | Phase A of cold-start plan. Adds `'reference-canon'` as a 6th `PhaseOutputSource` variant and wires slot 4 between `deterministic-observation` and `live-derivation`. The catalog loader tags entries by source so fitness reports can break down warm-run hits by slot. |
| `.canonical-artifacts/` greenfield tree | `planned` | Phase A of cold-start plan. Empty `agentic/` and `deterministic/` trees under each tier, populated only through real gates. No migration script. |
| `scripts/decompose-canon.ts` retirement | `implemented` | Script deleted 2026-04-10 as part of the reference-canon reframe. The per-class decomposer functions under `lib/application/canon/decompose-*.ts` are KEPT as runtime utilities (the discovery engine may use them to convert fat observation surfaces into per-atom envelopes at runtime); only the one-shot migration target was retired. |
| Four-axis envelope (Phase 0) | `implemented` | Stage, Source, Fingerprint, and Verdict are all phantom-typed per `docs/envelope-axis-refactor-plan.md`. The structural substrate is ready. Every new commit that adds envelope types gets the axis enforcement for free. |
| Synthetic feature completion — Commit 1: Source axis extension | `planned` | Add `'reference-canon'` to the `PhaseOutputSource` union; extend `foldPhaseOutputSource` and `compareSourcePrecedence`; tag catalog loader entries by source; add `--no-reference-canon` mode flag. See [`docs/synthetic-feature-completion-plan.md`](./synthetic-feature-completion-plan.md#commit-1--source-axis-extension-add-reference-canon). |
| Synthetic feature completion — Commit 2: C6 direct | `planned` | Impact scheduler wired into speedrun; `InterventionTokenImpact.rungImprovement` populated from real before/after comparisons; C6 visitor graduates from `proxy` to `direct`. |
| Synthetic feature completion — Commit 3: M5 direct | `planned` | `MemoryMaturityTrajectory` accumulates per-cohort points in the improvement ledger; M5 visitor graduates from `proxy` to `direct` once ≥3 comparable points exist. |
| Synthetic feature completion — Commit 4: Promotion CIs | `planned` | Beta-posterior confidence intervals on `PromotionEvaluation`; per-class `PromotionConfidencePolicy` registry; minimum sample floor + CI threshold. |
| Synthetic feature completion — Commit 5: Demotion sweep | `planned` | Automatic demotion proposals when real agentic overrides or deterministic observations supplant reference canon entries; reference-canon-hit trend report in the score command. |
| Vitest split and runner separation | `implemented` | `package.json` splits `test:unit` and `test:integration`; `vitest.config.ts` is live; unit typecheck/test flows now run against the Vitest lane. |
| Role-affordance table | `implemented` | `lib/domain/widgets/role-affordances.ts` is the canonical role-to-affordance table, including widget bridge mappings and step-action derivation helpers. |
| Runtime role-based dispatch | `implemented` | Runtime interaction now resolves role affordances first and uses legacy widget handlers as compatibility fallback only. |
| Derived widget contracts | `implemented` | `lib/domain/widgets/contracts.ts` now derives contracts from role affordances instead of maintaining a separate three-widget truth table. |
| Affordance-driven synthesis | `implemented` | Translation-gap vocabulary, workflow-archetype classification, and scenario interaction verbs now derive from role-affordance families instead of widget-era verb tables. |
| Route knowledge lane | `partially implemented` | Route schema, validation, ranking, workspace loading, runtime route selection, checked-in demo route knowledge, and MCP route-entry projections are real; broader projection/reporting hardening is still being tightened. |
| Demo route knowledge | `implemented` | `dogfood/knowledge/routes/demo.routes.yaml` is checked in as governed route knowledge for the demo harness. |
| Proposal enrichment | `partially implemented` | Proposal drafts and bundle entries now carry normalized enrichment metadata; proposal-category reporting is present in the payload but broader reporting surfaces still need expansion. |
| Non-destructive hints activation | `implemented` | `applyHintsPatch()` now appends aliases, merges locator ladders, and only fills absent semantic fields. |
| Route proposal activation | `implemented` | Route proposals now merge into `knowledge/routes/*.routes.yaml` under route-aware patch semantics instead of generic deep merge. |
| Intervention receipts with handoff | `partially implemented` | `InterventionReceipt` and inbox items now carry a typed `handoff` section with requested participation, evidence slice, semantic core, token-impact scaffolding, chain metadata, and richer MCP/operator surfacing. |
| Translation-drift detection | `partially implemented` | Semantic-core tokens now drive preserved-vs-drifted status for fresh handoffs and replayed intervention actions; broader multi-actor chain analysis is still a follow-on hardening task. |
| Effective hit rate scorecard gate | `implemented` | The scorecard gate now uses `effectiveHitRate` when the scorecard carries it, while `knowledgeHitRate` remains available for informational and diagnostic use. |
| Knowledge hit rate | `implemented` | Still preserved as an informational metric across reporting, convergence, and historical analysis surfaces. |
| Logical proof measurement | `implemented` | Fitness reports, benchmark scorecards, scorecard high-water marks, scorecard history, improvement-intelligence trends, and MCP summaries now emit measured proof-obligation summaries tied to the temporal-epistemic model, plus theorem-baseline coverage classified as `direct`, `proxy`, or `missing`. Dedicated direct obligations now cover target observability, posture separability, affordance recoverability, variance-factorability, recoverability, actor-chain coherence, and the full `M` family (`surface-compressibility`, `surface-predictability`, `surface-repairability`, `participatory-repairability`, `memory-worthiness`) where those surfaces have honest evidence, and theorem-baseline graduation is tracked across cohorts instead of only as a latest-snapshot summary. |

## Reading Guide

- `implemented`: shipped and relied on by the current codebase
- `partially implemented`: live and useful, but not yet the only or final path
- `planned`: not shipped yet
- `superseded`: replaced by a better architectural approach

## Backlog Interpretation

Read Epics 0-4 in the convergence backlog as:

- finish adoption
- normalize contracts
- harden persistence and handoffs
- remove residual doctrine drift

Do not read them as “introduce the idea from zero.” The central architecture already exists; the remaining work is to widen coverage and make every canonical and executable surface tell the same truth.
