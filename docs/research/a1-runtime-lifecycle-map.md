# A1 Runtime Lifecycle Map

_As of March 10, 2026._

## Summary

- A1 is already partially scaffolded in the current repo: raw ADO intent is preserved as `intent-only`, compile emits deferred task packets, and runtime execution produces typed receipts plus proposal drafts.
- The durable integration boundary is the artifact envelope on disk, not the specific agent host that happens to read or write it.
- `interactive` and `ci-batch` are first-class runtime postures today. `dogfood` is backlog vocabulary and artifact intent, but not yet a first-class `ExecutionProfile` enum in code.

## Current State Relative to A1

- `parseScenario` converts ADO steps into `custom` scenario steps with `confidence: intent-only` and no pre-resolved screen or element.
- `bindScenario` keeps those steps executable as `deferred` rather than treating them as hard failures.
- `buildTaskPacketProjection` projects runtime knowledge, controls, evidence refs, overlays, and explicit constraints into `.tesseract/tasks/{ado_id}.resolution.json`.
- `runScenario` writes interpretation, execution, evidence, proposal, run, confidence, inbox, and projection outputs from the same task packet.
- `runResolutionPipeline` already follows the intended ladder: explicit -> control -> approved knowledge -> overlays -> translation -> live DOM -> `needs-human`.

## Lifecycle Events

| Event | Producer | Consumer | Artifact / envelope | Governance state | Key decision point | Fallback / degradation | Profiles |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Snapshot intake | `syncSnapshots` | `parseScenario` | `.ado-sync/snapshots/{ado_id}.json` | Canonical input | Which ADO snapshot and revision enter the pipeline | Fixture-backed sync and archived snapshots keep intake deterministic when live ADO is absent | `ci-batch`, `interactive`, `dogfood` (planned) |
| Scenario parsing | `parseScenario` | `bindScenario`, `compileScenario` | `scenarios/{suite}/{ado_id}.scenario.yaml` | Approved compiler output from canonical input | Preserve raw wording as runtime intent instead of demanding compile-time alias resolution | Step stays `intent-only` with `action: custom` and null targets | `ci-batch`, `interactive`, `dogfood` (planned) |
| Binding | `bindScenario` | `buildTaskPacketProjection`, `emitScenario` | `.tesseract/bound/{ado_id}.json` | `approved`, `review-required`, or `blocked` per step binding | Whether the step is `bound`, `deferred`, or `unbound` | `deferred` steps continue toward runtime; only explicit contradictions remain `unbound` | `ci-batch`, `interactive`, `dogfood` (planned) |
| Runtime task projection | `buildTaskPacketProjection` | `selectRunContext`, runtime interpreter | `.tesseract/tasks/{ado_id}.resolution.json` | Inherits scenario governance | Which runtime knowledge, controls, overlays, and evidence refs are presented to the runtime | Missing deterministic knowledge still results in a complete task packet, not a stopped compile | `ci-batch`, `interactive`, `dogfood` (planned) |
| Run selection | `selectRunContext` inside `runScenario` | `executeSteps` | In-memory selected context plus task packet | Inherits scenario governance and execution posture | Which runbook, dataset, translation settings, interpreter mode, and posture apply | Baseline/no-write and `ci-batch` allow the same flow without approval/apply behavior | `ci-batch`, `interactive` |
| Runtime interpretation | `runResolutionPipeline` | `executeSteps`, run record, proposal builder | `.tesseract/runs/{ado_id}/{run_id}/interpretation.json` | `approved`, `review-required`, or `blocked` per step receipt | Which resolution rung wins and why | Falls through overlays, translation, and live DOM before emitting `needs-human` | `ci-batch`, `interactive`, `dogfood` (planned) |
| Runtime execution | `executeSteps` | Run record, review projection | `.tesseract/runs/{ado_id}/{run_id}/execution.json` | Mirrors interpretation plus execution outcome | Whether the resolved target can actually be interacted with safely | Degraded locator wins remain executable but reviewable; typed failure families replace raw timeouts | `ci-batch`, `interactive`, `dogfood` (planned) |
| Evidence persistence | `persistEvidence` | Proposal building, future runs, confidence overlays | `.tesseract/evidence/runs/{ado_id}/{run_id}/step-{n}-{m}.json` | Derived evidence | Which evidence drafts deserve durable recording | No evidence file is written if a step has no evidence drafts | `ci-batch`, `interactive`, `dogfood` (planned) |
| Proposal bundling | `buildProposals` | Inbox, approval, rerun planning, review surfaces | `generated/{suite}/{ado_id}.proposals.json` | `approved`, `review-required`, or `blocked` by trust policy | Whether a runtime-discovered supplement is safe, review-required, or denied | Empty bundle is still emitted so downstream surfaces stay aligned | `ci-batch`, `interactive`, `dogfood` (planned) |
| Operator inbox projection | `emitOperatorInbox` | Human operator, future VS Code surface, eventual Copilot veneer | `.tesseract/inbox/index.json`, `.tesseract/inbox/hotspots.json`, `generated/operator/inbox.md` | Derived operator surface | Which proposals, hotspots, degraded locators, and `needs-human` steps should be surfaced next | Read-only artifact view still works when no agent session is present | `interactive`, `ci-batch`, `dogfood` (planned) |
| Approval and rerun planning | `approveProposal`, `buildRerunPlan` | Canonical knowledge files, rerun workflow | Canonical target file patch, `.tesseract/policy/approvals/{proposal_id}.approval.json`, `.tesseract/inbox/{plan_id}.rerun-plan.json` | Explicit mutation lane, disabled in `ci-batch` | Whether a review-required proposal should mutate canon and what must rerun afterward | In `ci-batch`, approval is blocked; without approval the proposal remains only in inbox and generated bundle | `interactive`, `dogfood` (planned) |
| Projection refresh | `emitScenario`, `buildDerivedGraph`, `generateTypes`, confidence projector | Humans, agents, downstream tooling | `generated/*.spec.ts`, `generated/*.trace.json`, `generated/*.review.md`, `.tesseract/graph/index.json`, `lib/generated/*`, `.tesseract/confidence/index.json` | Derived outputs | Which latest run/proposal state becomes the readable review surface | Emits aligned placeholders when no run or proposal exists yet | `ci-batch`, `interactive`, `dogfood` (planned) |

## Artifact Handoffs

| Handoff | Producer | Consumer | Artifact / envelope | Governance state | Key decision point | Fallback / degradation | Profiles |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ADO snapshot -> scenario IR | `parseScenario` | `bindScenario` | Snapshot JSON -> scenario YAML | Canonical -> derived | Preserve human wording versus forcing deterministic parsing | Raw intent is kept even when nothing is resolved yet | `ci-batch`, `interactive`, `dogfood` (planned) |
| Scenario IR -> bound envelope | `bindScenario` | `task`, `emit`, `trace` | Scenario YAML -> bound JSON | Step-level governance carried forward | Is the step `bound`, `deferred`, or `unbound` | `deferred` is the intended A1 seam | `ci-batch`, `interactive`, `dogfood` (planned) |
| Bound envelope + catalog -> task packet | `buildTaskPacketProjection` | Runtime interpreter | Bound JSON + knowledge/control/evidence/confidence catalog -> scenario task packet | Scenario governance | Which runtime knowledge priors are exposed | Task packet exists even when knowledge is thin | `ci-batch`, `interactive`, `dogfood` (planned) |
| Task packet -> interpretation receipt | Runtime interpreter | Execution stage, run record, review projection | Step task -> typed resolution receipt | Receipt-level governance | Which resolution rung wins: deterministic, translation, or agentic/live DOM | `needs-human` is emitted as a structured receipt rather than a compiler stop | `ci-batch`, `interactive`, `dogfood` (planned) |
| Interpretation -> execution receipt | Execution runtime | Run record, scorecard, review projection | Resolved target -> typed execution receipt | Mirrors step governance | Whether runtime interaction succeeds under widget and locator constraints | Degraded locator success remains visible as brittle-but-green | `ci-batch`, `interactive`, `dogfood` (planned) |
| Interpretation -> evidence files | `persistEvidence` | Proposal builder, future overlays | Evidence drafts -> evidence JSON records | Derived evidence | Which observations deserve durable lineage | No-op when no evidence draft exists | `ci-batch`, `interactive`, `dogfood` (planned) |
| Evidence + proposal drafts -> proposal bundle | `buildProposals` | Inbox, approval, rerun planning | Proposal bundle envelope | Trust-policy governed | Allow, review, or deny per artifact type | Empty bundle preserves downstream contract | `ci-batch`, `interactive`, `dogfood` (planned) |
| Proposal bundle + run record -> inbox/hotspots | `emitOperatorInbox` | Human or agent operator | Operator inbox index and hotspot index | Derived | Which items are actionable now | Artifacts can sit idle on disk until a human or agent picks them up | `interactive`, `ci-batch`, `dogfood` (planned) |
| Proposal -> canonical mutation | `approveProposal` | Canonical knowledge + approval receipt | Patch to knowledge file plus approval receipt | Explicitly user-mediated today | Whether to mutate canon | Disabled outright in `ci-batch` | `interactive`, `dogfood` (planned) |
| Approval -> rerun plan | `buildRerunPlan` | Operator, future extension task surface | Rerun plan JSON | Derived from changed lineage | Which scenarios, runbooks, projections, and confidence records are impacted | No mutation needed to inspect rerun scope first | `interactive`, `dogfood` (planned) |
| Latest run/proposal -> readable surfaces | `emitScenario` and projections | Humans, future VS Code UX, future agents | Review/trace/spec/graph/confidence outputs | Derived | Which latest run and proposal state is projected | Placeholder proposal bundle and pending runtime state keep surfaces aligned before first run | `ci-batch`, `interactive`, `dogfood` (planned) |

## A1 Implications

- The current scaffold already supports A1's core contract: steps can stay `intent-only`, compilation continues, and runtime interpretation becomes the decision-heavy stage.
- The task packet is the right long-lived handoff for any future agent host because it already packages knowledge refs, supplements, controls, evidence refs, overlays, and stable fingerprints.
- The first extension scaffold should read and act on the same task, run, proposal, and inbox artifacts instead of inventing an extension-only task model.
- Approval should remain a separate explicit mutation lane even if future dogfood flows auto-approve within trust policy, because that keeps `interactive` and `ci-batch` behavior legible.

## Important Gaps and Open Questions

- `dogfood` is described in [BACKLOG.md](../BACKLOG.md) as a third execution profile, but the current `ExecutionProfile` type only exposes `interactive | ci-batch`. That gap should be treated as real implementation work, not as an already-landed feature.
- The current runtime interpreter is structurally close to the backlog goal, but it is still embedded in the local runtime path. A future scaffold may still want a thinner host-agnostic boundary around artifact readers and action invokers.
- `problemMatcher`-friendly locations do not yet exist for every inbox or hotspot item. Some future extension affordances may require more stable file/line projection than the current JSON indexes provide.
- Approval currently mutates canon through the CLI/application layer. A future extension needs to decide whether it shells out to `tesseract approve`, links against library code, or exposes a narrower action wrapper.

## Repo Sources Used

- [BACKLOG.md](../BACKLOG.md)
- [README.md](../README.md)
- [docs/adr-collapse-deterministic-parsing.md](../adr-collapse-deterministic-parsing.md)
- [lib/application/parse.ts](../../lib/application/parse.ts)
- [lib/application/bind.ts](../../lib/application/bind.ts)
- [lib/application/task.ts](../../lib/application/task.ts)
- [lib/application/run.ts](../../lib/application/run.ts)
- [lib/application/execution/persist-evidence.ts](../../lib/application/execution/persist-evidence.ts)
- [lib/application/execution/build-proposals.ts](../../lib/application/execution/build-proposals.ts)
- [lib/application/approve.ts](../../lib/application/approve.ts)
- [lib/application/rerun-plan.ts](../../lib/application/rerun-plan.ts)
- [lib/application/emit.ts](../../lib/application/emit.ts)
- [lib/application/paths.ts](../../lib/application/paths.ts)
- [lib/runtime/agent/index.ts](../../lib/runtime/agent/index.ts)
- [lib/domain/types/workflow.ts](../../lib/domain/types/workflow.ts)
- [generated/demo/policy-search/10001.review.md](../../generated/demo/policy-search/10001.review.md)
