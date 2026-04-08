# Current State

> Status: Active — implementation-truth snapshot for the roadmap transition.

This document is the fast reality check for the current Tesseract substrate. Use it with [README.md](../README.md) and [docs/convergence-backlog.md](./convergence-backlog.md) so roadmap work is aimed at live gaps instead of already-closed ones.

## Status Matrix

| Workstream | Status | Notes |
|---|---|---|
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
