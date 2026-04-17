# Backlog Annex

> Reference — extended backlog detail

This annex is the traceability ledger for [BACKLOG.md](../BACKLOG.md).

`BACKLOG.md` is the canonical execution order. This file exists to show how the order was derived, which sources were weighted most heavily, which duplicates were collapsed, and how the older lane-first backlog maps into the new stage-based program.

## Authority Tiers

| Tier | Meaning | Sources that belong here |
| --- | --- | --- |
| 1 | Present-state truth. If this disagrees with prose, this wins for current status. | Current code shape, command behavior, build output, inspection-command behavior |
| 2 | Non-negotiable doctrine and enduring constraints. | `AGENTS.md`, `README.md`, `docs/master-architecture.md`, `docs/domain-ontology.md`, `docs/authoring.md`, `docs/seams-and-invariants.md`, `.github/instructions/*.md` |
| 3 | Sequencing and proving guidance. | Old `BACKLOG.md`, `docs/closing-the-gap.md`, `docs/direction.md`, `docs/phase3-handoff.md`, `docs/operator-handbook.md`, `docs/coding-notes.md`, `docs/dogfooding-flywheel.md` |
| 4 | Research and refactor design input. | `docs/research/*.md`, `docs/adr-collapse-deterministic-parsing.md` |
| 5 | Horizon or speculative direction. | `docs/moonshots.md`, parts of `VISION.md` that go beyond the proven slice |
| X | Derived evidence or compatibility stubs. Informative, but not backlog authority. | `docs/agent-context.md`, `generated/**/*.md`, empty compatibility files |

## Current Code Reality Used in Ranking

| Reality signal | Evidence | Backlog consequence |
| --- | --- | --- |
| Build is currently red | `npm run build` fails around `GeneratedSpecImports.runtimeHandoff`, `SelectedRunContext`, and `runtime-handoff` shape mismatches | Stage 0 comes before any new expansion work |
| Inspection commands depend on build health | `tt-workflow` and `tt-paths` currently fail because they transitively call the red build | Stage 0 explicitly includes observability recovery |
| A runtime-surface refactor is partially in flight | Current type errors and uncommitted changes cluster around interpretation-surface and run-plan code | Stage 0 stabilizes the breakage; Stage 2 absorbs the full redesign |
| Working tree is dirty on non-doc files | `git status --short` shows unrelated application and test changes | Uncommitted changes are not treated as backlog authority by themselves |

## Source Inventory

| Source | Last commit | Authority tier | Use in the new backlog | Disposition |
| --- | --- | --- | --- | --- |
| `AGENTS.md` | 2026-03-12 `c49e356` | 2 | Defines canonical vs derived, lane vocabulary, and required reading order | keep |
| `README.md` | 2026-03-12 `c49e356` | 2 | Defines product overview, command surface, precedence, and artifact map | keep |
| `BACKLOG.md` (old) | 2026-03-10 `35e8e93` | 3 | Supplies the legacy item inventory and lane vocabulary | superseded and remapped |
| `VISION.md` | 2026-03-11 `119cdbb` | 5 | Preserves product bet and stable promises | merge into constraints and horizon context |
| `docs/master-architecture.md` | 2026-03-11 `119cdbb` | 2 | Sets the authoritative doctrine and phased program | keep |
| `docs/direction.md` | 2026-03-11 `119cdbb` | 3 | Supplies transitional priorities and scale posture | merge |
| `docs/domain-ontology.md` | 2026-03-09 `bab23e8` | 2 | Defines primitives, precedence, and invariants | keep |
| `docs/authoring.md` | 2026-03-12 `c49e356` | 2 | Defines what belongs in canon and what stays derived | keep |
| `docs/operator-handbook.md` | 2026-03-09 `bab23e8` | 3 | Defines operator loop and review surfaces | merge |
| `docs/coding-notes.md` | 2026-03-12 `5e08020` | 3 | Supplies the A-lane critical path and implementation bias | merge |
| `docs/seams-and-invariants.md` | 2026-03-12 `6359c7a` | 2 | Defines law-test and seam obligations | keep |
| `docs/closing-the-gap.md` | 2026-03-13 `78e3f56` | 3 | Supplies the most recent proof-first proving sequence | keep and prioritize |
| `docs/dogfooding-flywheel.md` | 2026-03-07 `f53f53f` | 3 | Defines dogfood operating vocabulary and loop concepts | merge |
| `docs/adr-collapse-deterministic-parsing.md` | 2026-03-08 `12133ae` | 4 | Supplies the A1 motivation and boundary shift | merge |
| `docs/moonshots.md` | 2026-03-12 `c49e356` | 5 | Supplies horizon bets and a proving-sequence reminder | defer |
| `docs/phase3-handoff.md` | 2026-03-12 `c49e356` | 3 | Records a previously green checkpoint and paused benchmark work | merge, but override status claims with current code reality |
| `docs/research/README.md` | 2026-03-12 `c49e356` | 4 | Defines scope and reading order for the A1 research set | merge |
| `docs/research/a1-runtime-lifecycle-map.md` | 2026-03-10 `8268a00` | 4 | Maps the present runtime lifecycle and artifact seams | merge |
| `docs/research/agentic-scaffold-decisions.md` | 2026-03-10 `8268a00` | 4 | Recommends artifact-first, CLI-first IDE integration | merge |
| `docs/research/scenario-kernel-and-interpreters.md` | 2026-03-12 `c49e356` | 4 | Proposes the kernel and interpreter-family consolidation | merge |
| `docs/research/scenario-kernel-implementation-guide.md` | 2026-03-12 `4664fcc` | 4 | Gives the staged cutover and law-test plan for the kernel | merge |
| `.github/instructions/domain.instructions.md` | 2026-03-07 `f53f53f` | 2 | Protects domain purity and deterministic semantics | keep as constraint-only |
| `.github/instructions/knowledge.instructions.md` | 2026-03-12 `c49e356` | 2 | Protects canonical knowledge boundaries | keep as constraint-only |
| `.github/instructions/generated.instructions.md` | 2026-03-07 `f53f53f` | 2 | Prevents hand edits to derived surfaces | keep as constraint-only |
| `.github/instructions/tests.instructions.md` | 2026-03-07 `f53f53f` | 2 | Requires tests to protect semantics and artifact alignment | keep as constraint-only |
| `docs/agent-context.md` | generated | X | Useful orientation surface derived from source docs | exclude from authority, regenerate from sources |
| `generated/demo/policy-search/10001.review.md` | generated | X | Demonstration evidence of current slice quality | evidence-only |
| `generated/operator/inbox.md` | generated | X | Evidence of current projection surface | evidence-only |
| `CLAUDE.md` | empty | X | Empty compatibility stub | excluded |
| `CODEX.md` | empty | X | Empty compatibility stub | excluded |

## Contradictions Resolved by the New Backlog

| Contradiction | Evidence | Resolution in `BACKLOG.md` |
| --- | --- | --- |
| The old backlog says A1 is the top priority, but the newest proving doc says build trust first | Old `BACKLOG.md` vs `docs/closing-the-gap.md` | Stage 0 restores build and observability before the Stage 2 A1 program |
| The repo documents a previously green checkpoint, but the workspace is currently red | `docs/phase3-handoff.md` vs current `npm run build` behavior | Current code reality wins for status; the handoff remains useful only as historical context |
| The runtime handoff is treated as a fixed improvement in one doc and a duplication target in newer refactor docs | `docs/phase3-handoff.md` vs scenario-kernel research docs | Treat runtime handoff as a temporary seam: stabilize it in Stage 0, collapse it in Stage 2 |
| The backlog frames agent integration strongly around IDE surfaces, while research says the safest path is artifact-first and CLI-first | Old `BACKLOG.md` vs `docs/research/agentic-scaffold-decisions.md` | Stage 4 keeps IDE integration thin and artifact-backed |
| The README advertises interface artifacts, but the proof doc says the interface graph is not materially proven on disk | `README.md` vs `docs/closing-the-gap.md` | Stage 1 requires reliable production and downstream consumption, not mere path mention |
| The backlog treats `dogfood` as a profile, but research notes it is not yet first-class in current code | Old `BACKLOG.md` vs `docs/research/a1-runtime-lifecycle-map.md` | Stage 3 implements dogfood as explicit automation work, not as an assumed existing posture |

## Dedupe and Merge Decisions

| Merged canonical item | Inputs collapsed into it | Why they were merged |
| --- | --- | --- |
| `S0.1` Restore fresh-clone build trust | `docs/closing-the-gap.md` Move 0, `docs/phase3-handoff.md` green-state claims, current build failures | All three describe repo trust, just from different time perspectives |
| `S1.1` Materialize interface artifacts | `docs/master-architecture.md` Phase 1, `docs/closing-the-gap.md` Move 1, README interface artifact promises | Same core need: make the shared interpretation surface durable and inspectable |
| `S1.2` Add a second screen and cross-screen scenario | `docs/closing-the-gap.md` Move 2, master-architecture scale claims | This is the smallest proof of reuse and cross-screen identity |
| `S1.4` Proposal activation improves the next run | `docs/closing-the-gap.md` Move 4, operator handbook approval loop, current backlog approval semantics | All are the same flywheel turn, viewed from different angles |
| `S2.1` One scenario kernel and run plan | A1 research set, scenario-kernel docs, ADR collapse, coding-notes A-lane critical path | These are variants of the same contract-consolidation problem |
| `S2.6` Translation and widget hardening | Old backlog `C1` and `C2` | Both are runtime-capability hardening after the kernel is stable |
| `S3.1` Auto-approval | Old backlog `A2`, dogfooding doc, trust-policy doctrine | One governed automation item, not separate governance and dogfood tracks |
| `S3.2` Dogfood orchestrator | Old backlog `A3`, `docs/closing-the-gap.md` Move 6, dogfooding doc | Same orchestration loop, with proving-doc sequencing now applied |
| `S4.3` Operator cockpit | Old backlog `E1`, operator handbook, existing projection surfaces | One operator-surface consolidation item |
| `S5.1` Structured entropy | Old backlog `D1`, dogfooding doc drift-event vocabulary | Same variance program expressed operationally and conceptually |

## Normalized Claim Inventory

| Canonical item | Source docs | Recency | Authority | Claim type | Current code evidence | Depends on | Proof artifact | Complexity | Risk | Final disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Restore build and command trust | `docs/closing-the-gap.md`, `docs/phase3-handoff.md`, current command behavior | newest 2026-03-13 | 1 + 3 | work item | build and inspection commands are currently broken | none | green `npm run check`, working `tt-*` commands | medium | high | keep as `S0.1` and `S0.2` |
| Stabilize the in-flight runtime-surface cutover | current build errors, scenario-kernel docs | newest 2026-03-12 | 1 + 4 | work item | type breakage clusters around run-plan and runtime-handoff seams | `S0.1` | coherent build and runtime surface | medium | high | keep as `S0.3` |
| Materialize interface graph and selector canon | `docs/master-architecture.md`, `docs/closing-the-gap.md`, README | newest 2026-03-13 | 2 + 3 | work item | interface artifact paths exist in docs, but proof is still thin | `S0.1`, `S0.2` | `.tesseract/interface/*.json`, matching review fingerprints | medium | medium | keep as `S1.1` |
| Add a second screen and scenario | `docs/closing-the-gap.md`, master architecture scale posture | newest 2026-03-13 | 2 + 3 | work item | current slice is still effectively `n=1` | `S1.1` | two emitted scenario slices, cross-screen graph edges | high | medium | keep as `S1.2` |
| Discovery must feed durable knowledge | `docs/closing-the-gap.md`, README discoverability claims | newest 2026-03-13 | 3 | work item | discovery exists, but proof of graph uptake is still weak | `S1.1`, `S1.2` | graph delta after discovery | medium | medium | keep as `S1.3` |
| Proposal activation must improve later runs | `docs/closing-the-gap.md`, operator handbook | newest 2026-03-13 | 3 | goal | approval path exists, but flywheel proof is still incomplete | `S1.2`, `S1.3` | proposal bundle, approval receipt, rerun delta | medium | medium | keep as `S1.4` |
| Scorecards must show improvement, not just existence | `docs/closing-the-gap.md`, old backlog `A3`/`D2` | newest 2026-03-13 | 3 | goal | scorecard surface exists, improvement proof is not yet the center | `S1.4` | comparable scorecards across runs | medium | low | keep as `S1.5` |
| A1 should become runtime interpretation, but not as one giant cut | ADR collapse, coding notes, lifecycle map, scenario-kernel docs | newest 2026-03-12 | 3 + 4 | work item | present runtime is partway there, but contract duplication remains | `S1.5`, `S2.1`, `S2.4` | cheaper repeated runs and fewer alias edits | high | high | keep as staged `S2.1`-`S2.5` |
| The scenario kernel should replace duplicate preparation and run-plan rebuilding | scenario-kernel docs | 2026-03-12 | 4 | work item | type names already exist; cutover is incomplete | `S1.5` | agreement laws, simpler execution path | high | high | keep as `S2.1` |
| Runtime handoff should disappear eventually | scenario-kernel docs, phase3 handoff | 2026-03-12 | 3 + 4 | work item | current docs disagree on whether it is the fix or the duplication | `S2.1` | one machine contract across emission and execution | medium | medium | merge into `S2.2` |
| Shared run fold should replace repeated summary assembly | scenario-kernel implementation guide, seams doc | 2026-03-12 | 2 + 4 | work item | repeated summary logic still exists across projections | `S2.1` | fold agreement laws | medium | medium | keep as `S2.3` |
| Resolution ladder should be explicit data | README precedence rules, implementation guide | 2026-03-12 | 2 + 4 | work item | precedence exists, but stage structure is still too implicit | `S2.1` | stage-isolation laws and inspectable stage data | medium | medium | keep as `S2.4` |
| Translation must stay bounded and comparable | old backlog `C1`, coding notes | 2026-03-12 | 3 | constraint plus work item | translation surface exists, but hardening is incomplete | `S2.1` | cache and failure-class metrics | medium | medium | keep as `S2.6` |
| Widget coverage should grow through contracts | old backlog `C2`, authoring doctrine | 2026-03-12 | 2 + 3 | work item | runtime capability expansion is still selective | `S2.1` | comparable execution receipts across widget families | medium | medium | merge into `S2.6` |
| Auto-approval should exist only inside trust-policy boundaries | old backlog `A2`, trust-policy doctrine | 2026-03-10 | 2 + 3 | work item | approval is explicit today; automation is still planned | `S1.5`, `S2.5` | approval receipts and safe rerun plans | medium | high | keep as `S3.1` |
| Dogfood should be one thin orchestrator over the same seams | old backlog `A3`, dogfooding doc, closing-the-gap Move 6 | newest 2026-03-13 | 3 | work item | no single loop command exists yet | `S3.1` | `DogfoodRun` ledger and convergence output | medium | medium | keep as `S3.2` |
| Route knowledge should be canonicalized | old backlog `B1`, master architecture route focus | 2026-03-10 | 2 + 3 | work item | route ideas exist, but not as a mature knowledge artifact | `S1.2` | route knowledge files and route-aware runs | medium | medium | keep as `S4.1` |
| Thin-screen ergonomics should lower authoring cost | old backlog `B2`, authoring guide | 2026-03-10 | 2 + 3 | work item | hotspot-to-authoring path is still too manual | `S1.5` | workflow and inbox diagnostics that point to exact gaps | low | low | keep as `S4.2` |
| Operator surfaces should feel like one cockpit | old backlog `E1`, operator handbook | 2026-03-10 | 3 | work item | multiple projections exist, but coherence is still partial | `S1.5` | aligned inbox, workflow, trace, graph, scorecard | medium | medium | keep as `S4.3` |
| VS Code integration should be thin and artifact-first | old backlog `E2`, scaffold decisions research | 2026-03-10 | 3 + 4 | work item | no thin IDE surface exists yet | `S4.3` | task and problem-matcher flow over existing artifacts | medium | medium | keep as `S4.4` |
| Confidence decay and runtime taxonomy should lower operator load safely | old backlog `B3` and `C3` | 2026-03-10 | 3 | work item | overlays and receipts exist, but tuning surfaces are still weak | `S2.6`, `S1.5` | scorecard metrics and inspectable thresholds | medium | low | merge into `S4.5` |
| Structured entropy should come after the dogfood loop works | old backlog `D1`, dogfooding doc | 2026-03-10 | 3 | work item | drift-event vocabulary exists, but loop proof is earlier | `S3.2`, `S4.1` | replayable variance profiles and measurable deltas | high | medium | keep as `S5.1` |
| Benchmark breadth should follow benchmark trust | old backlog `D2`, phase3 handoff | 2026-03-12 | 3 | work item | benchmark ambitions exceed current proof | `S3.2` | comparable multi-run scorecards | medium | medium | keep as `S5.2` |
| Synthetic drift composer is valuable but not core | old backlog `D3`, dogfooding doc | 2026-03-10 | 3 | work item | currently only conceptual | `S5.2` | replayable drift harness | high | medium | keep as `S5.3` |
| Offline optimization must stay outside the deterministic core | README, old backlog `E3` | 2026-03-12 | 2 + 3 | constraint plus work item | evaluation lane exists only conceptually | `S3.2` | ranking outputs over stored corpora only | medium | low | keep as `S5.4` |
| CI webhook automation must preserve `ci-batch` semantics | old backlog `F1`, README | 2026-03-10 | 2 + 3 | work item | not started | `S0.1` | CI-triggered runs with proposals but no auto-apply | medium | low | keep as `S5.5` |
| Deterministic coverage should mean better knowledge leverage, not more alias sprawl | old backlog `F2`, coding notes, ADR collapse | 2026-03-12 | 3 + 4 | work item | current framing needs the A1 rewrite | `S2.5` | knowledge coverage metrics and explicit exhaustion diagnostics | medium | low | keep as `S5.6` |
| Moonshots should stay visible but explicitly downstream | `docs/moonshots.md` | 2026-03-12 | 5 | horizon bet | no proof foundation yet for the largest claims | `S5.2` | convincing flagship memory loop first | very high | high | defer as `S5.7` |

## Legacy Backlog Mapping

| Legacy item | New canonical item | Mapping note |
| --- | --- | --- |
| `A1` ADR collapse | `S2.1`-`S2.5` | Reframed from monolith to staged post-proof program |
| `A2` Confidence-gated auto-approval | `S3.1` | Kept intact, but sequenced after proof and kernel stabilization |
| `A3` Dogfood orchestrator command | `S3.2` | Kept intact, but only after `S3.1` |
| `B1` URL variant discovery and route knowledge | `S4.1` | Kept intact |
| `B2` Knowledge authoring ergonomics for thin screens | `S4.2` | Kept intact |
| `B3` Confidence threshold tuning and decay policy | `S4.5` | Merged with runtime taxonomy and operator-facing tuning ergonomics |
| `C1` Translation cache and evaluation harness | `S2.6` | Merged into runtime-capability hardening |
| `C2` Widget family coverage expansion | `S2.6` | Merged into runtime-capability hardening |
| `C3` Runtime cost budgets and failure taxonomy | `S4.5` | Moved later, after the loop is proven |
| `D1` Structured entropy harness | `S5.1` | Deferred until after dogfood automation exists |
| `D2` Benchmark expansion beyond the flagship slice | `S5.2` | Deferred until scorecard trust is higher |
| `D3` Synthetic React app composer with salted drift | `S5.3` | Deferred horizon benchmark work |
| `E1` Operator cockpit over existing artifacts | `S4.3` | Kept intact |
| `E2` VS Code extension integration surface | `S4.4` | Kept intact, but explicitly artifact-first |
| `E3` Proposal ranking in the offline optimization lane | `S5.4` | Kept intact with the same guardrail |
| `F1` CI webhook integration | `S5.5` | Kept intact |
| `F2` Deterministic coverage expansion | `S5.6` | Reframed toward knowledge leverage after A1 |

## Explicit Exclusions

- `docs/agent-context.md` is derived and should always be regenerated from sources.
- `generated/**/*.md` files are evidence and review surfaces, not backlog authority.
- Empty compatibility files such as `CLAUDE.md` and `CODEX.md` are not meaningful backlog sources.
- Uncommitted changes in runtime and test files are useful signals of present instability, but they do not outrank committed doctrine or current command behavior.
