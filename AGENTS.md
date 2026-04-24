# Tesseract Agent Guide

This repository is a QA-automation codebase that lets a single agent author a Playwright test suite against a customer's OutSystems application from a backlog of ADO test cases. It is currently reshaping from v1 (a single `lib/` tree with tightly-coupled product and workshop concerns) into v2 (three top-level folders with a manifest-mediated seam). **The v2 reshape is in active doc-revision phase; the compartmentalization commit has not yet landed in code. Until it does, the code lives under `lib/` as described in v1 docs; the v2 direction is authoritative for what's next.**

## North star in one sentence

**Build a product that lets an agent author QA-legible Playwright tests against a real customer backlog, with a workshop that consumes the product's own manifest to derive probes measuring whether the product is actually improving, and put the workshop out of a job as probe coverage saturates against a steady-state product surface.**

The three things v2's `product/` ships (details in `docs/v2-direction.md §1`):
- A **vocabulary manifest** the agent reads once per session.
- A **facet catalog** — memory of the SUT's semantic surfaces, provenance-threaded, queryable by intent phrase.
- **QA-legible tests** in Playwright that reference facets by name, not selectors.

The workshop's job (details in `docs/v2-direction.md §5` and `docs/v2-substrate.md §7`):
- Derive **probes** from the manifest, run them through the product's normal authoring flow, derive metrics over run records, gate proposal activation against the trust policy, and append hypothesis receipts to the workshop's log. Graduate when probe coverage = 100% and `metric-hypothesis-confirmation-rate` sustains above floor.

## If you're a fresh agent session, your next action is to read the post-Z11a handoff

**Status as of 2026-04-24.** Verdict-11 landed. The compounding engine now measures three cohorts (probe-surface, customer-compilation-resolvable, customer-compilation-needs-human) across two prediction kinds (confirmation-rate, intervention-fidelity). The pattern ladder slotted into the 11-rung resolution precedence at `'shared-patterns'` with six seed patterns + seven seed matchers. Graduation holds under both the Z10 single-cohort sequence and the full three-cohort drive-through. 3,890 tests green; ~165 compounding-family/pattern/customer-backlog laws.

**Start here**: [`workshop/observations/handoff-post-z11a.md`](workshop/observations/handoff-post-z11a.md) — comprehensive orientation doc covering what landed, what's exciting, three forward paths (Z11d / Z11b / Z11f) with leverage + effort estimates, read-order for orientation, seam map, invariants, honest limitations, and the "if you get stuck" playbook. ~15 minutes.

**Three forward paths, each independently scoped**:

1. **Z11d — Live Reasoning Adapter** (Claude-as-adapter via file-mediated record/fill/replay triad + autotelic hooks). Plan: [`docs/v2-live-adapter-plan.md`](docs/v2-live-adapter-plan.md). ~6 days. Highest-novelty + highest-leverage: replaces Z11a.5's heuristic classifier with real reasoning; activates semantic intervention-fidelity; makes customer-compilation resolvable trajectory meaningful.

2. **Z11b — Executed-Test Cohort** (stability-rate prediction kind over N-repeat Playwright runs). Plan: [`docs/v2-executed-test-cohort-plan.md`](docs/v2-executed-test-cohort-plan.md). ~4.5 days. Most mechanical; follows the established Z11a template; adds the third leg of the quality stool.

3. **Z11f — Substrate Study** (offline harvest of public OutSystems DOMs → distilled frequency tables → operator-gated matcher proposals). Plan: [`docs/v2-substrate-study-plan.md`](docs/v2-substrate-study-plan.md). ~8–12 days, blocked on Z11f.0 legal review. Grounds the OutSystems-generic pattern tier in real evidence.

If you're instead picking up a specific forcing-function remediation, the finished graduation ledger lives in `product/tests/architecture/seam-enforcement.laws.spec.ts` — the commented history at the top of RULE_1/2/3 narrates what's already landed.

**Reference: prior graduation milestones.**
- Verdict-10 (2026-04-23, commit `aea4f97`) — first compounding-engine graduation on the single probe-surface cohort. Structural-plus-narrow rubric classification.
- Verdict-11 (2026-04-24, commit `a721cd9`) — three-cohort multi-prediction graduation. Multi-cohort-synthetic rubric classification.
- Next verdict should be verdict-12, authored by whichever of Z11b/Z11d/Z11f completes next.

## New-session orientation (read in this order)

If you've just opened the repo, read this exact sequence before touching any code:

1. [`docs/v2-direction.md`](docs/v2-direction.md) — primary strategy document. §§1–2 name the three folders and the seam discipline; §3 names what ports where; §4 names what reshapes vs. retires; §5 introduces the probe IR; §6 is the in-place construction order — thirteen steps grouped into three phases (Phase 1: Reshape, Phase 2: Unstitching, Phase 3: Compounding).
2. [`docs/v2-substrate.md`](docs/v2-substrate.md) — primitives, invariants, and measurement stance. §2 the five primitives; §5 the level spine; §6 the anti-scaffolding gate; §6a the probe IR spike protocol; §7 the measurement stance; §8a the per-visitor metric audit.
3. [`docs/v2-transmogrification.md`](docs/v2-transmogrification.md) §§1–8 — execution plan. §§1–2 the compartmentalization mechanics; §3 the thirteen-step three-phase plan with per-step execution detail; §4 the DAG + parallelization + §4.6 lighting-up matrix; §5 forcing functions + cascade risks; §6 graduation (product curve + workshop calibration); §7 phase-boundary definition of done; §8 deferred items. §§9–10 are operational detail (saga gallery, runtime composition); §11 is the descent protocol with a light-discipline track for local changes; §12.0 is the authoritative per-file destination summary; §§12.1–12.7 the per-lane audit.
4. [`docs/v2-delta-audit.md`](docs/v2-delta-audit.md) — handshake-by-handshake v1→v2 verdicts. Read when you need to decide whether a specific handshake is Aligned, Partial, Shape-different, or Absent.
5. [`docs/feature-ontology-v2.md`](docs/feature-ontology-v2.md) — the per-feature contracts: handshakes, technical paths, agent-engagement flows, invariants, reversibility classes. Read when you are about to design or implement a specific handshake.
6. [`docs/v2-readiness.md`](docs/v2-readiness.md) — **execution preprocessing pack**. Read before Step 0. Contains: the day-by-day Step 0 playbook (§1), seam-enforcement test design (§2), per-folder README stubs (§3), probe IR fixture grammar (§4), transitional probe set scope (§5), customer-reality probe checklist (§6), branch + rollback strategy (§7), test-import rewrite audit (§8), Reasoning port retrofit file plan (§9), M5 cohort re-key plan (§10). If you're picking up Step 0, start here after reading §§1–2 of the direction doc.
7. [`docs/v2-synthetic-workshop-dogfood.md`](docs/v2-synthetic-workshop-dogfood.md) — **post Step-4c design memo**. The workshop's measurement substrate after the hand-authored scenario corpus retires. Read before Step 5's probe IR spike. ~10 minutes.
8. [`docs/v2-probe-ir-spike.md`](docs/v2-probe-ir-spike.md) — **primary Step 5 document**. Postdoctoral design memo for the Probe IR spike: ontological claim (§1), atomic/compositional/longitudinal claims (§§2–3), FP/Effect/DDD praxis with file:line references (§4), executable spike protocol (§5), substrate-backed harness specs (§6), graduation metrics (§7), first-principles defense of synthetic→production prediction + substrate ladder + customer-incident ratchet + substrate-drift detection (§8), hand-off playbook for the next agent (§9). Read in full before touching probe code. ~30 minutes.

**The three folders v2 compartmentalizes `lib/` into:**

- **`product/`** — packageable core. Agent-facing surface. Manifest, facet catalog, instruments (intent-fetch, observe, interact, test-compose, test-execute, Reasoning), runtime resolution, facet schema, append-only log set. What ships to customers.
- **`workshop/`** — measurement consumer. Imports `product/`'s manifest; derives probes; runs them through `product/`'s normal authoring flow; owns the seven-visitor metric tree, scorecard history, convergence-proof harness, trust-policy gate, hypothesis-receipt discipline. Can read `product/`; `product/` cannot read it. Puts itself out of a job when probe coverage = 100%.
- **`dashboard/`** — read-only observer. Projects both upstreams through manifest-declared verbs. Writes nothing. Replaceable without touching either upstream.

**The seam between folders is a compile error, not a convention.** An architecture test in `product/tests/architecture/seam-enforcement.laws.spec.ts` forbids `workshop/` or `dashboard/` from importing `product/` except through the **shared-contract set** (manifest, logs, ports, manifest invoker, errors, resilience, observation/dashboard, fitness, improvement, projection, proposal, handshake, governance, and the CLI contract). The shared-contract set is the compile-time half of the seam; the manifest verb registry is the runtime half. `product/` imports zero files from workshop or dashboard — the RULE_3 grandfather list is empty as of Step 4c.

**v1 lifecycle state (post Step 4c).** The `lib/` tree is gone; `product/`, `workshop/`, and `dashboard/` are the three compartments. The synthetic feature completion plan (v1-reference) folded into Steps 1–4c. Reference-canon retired at Step 1; the Reasoning port unified at Step 4b; the manifest-driven MCP tool catalog landed at Step 4c; the CLI split into `product/cli/ + workshop/cli/` with a merged registry at `bin/cli-registry.ts` at step-4c.cli-split. The last RULE_3 entry (headed-harness factory) graduated at step-4c.headed-harness-graduate by moving the Playwright bridge factory into `product/instruments/tooling/playwright-bridge.ts`.

## Additional docs (read when the task calls for them)

Active doctrine (post-reshape):
- operational overview: [README.md](README.md) *(note: some sections reference v1 paths; cross-reference `v2-direction.md §3` for v2 destinations)*
- implementation coding notes: [docs/coding-notes.md](docs/coding-notes.md) — FP style, Effect patterns, design patterns, testability conventions. Authoritative for how to write code; unchanged by the v2 reshape.
- seams, invariants, and verification: [docs/seams-and-invariants.md](docs/seams-and-invariants.md) — the architecture-level seams and their guard tests.
- auto-generated repo brief: [docs/agent-context.md](docs/agent-context.md) *(skip if you already read CLAUDE.md)*
- auto-generated module map: [docs/module-map.md](docs/module-map.md) *(or run `npm run map`)*

v1 reference (historical — useful when you need to understand current code under `lib/`):
- [docs/v1-reference/master-architecture.md](docs/v1-reference/master-architecture.md) — v1's architectural doctrine.
- [docs/v1-reference/alignment-targets.md](docs/v1-reference/alignment-targets.md) — M5 and C6 definitions in v1's operational terms. The M5 and C6 *concepts* port forward per `v2-substrate.md §8a`; their v1 denominators (scenario-ID cohort key, InterventionTokenImpact ledger) do not.
- [docs/v1-reference/canon-and-derivation.md](docs/v1-reference/canon-and-derivation.md) — the six-slot lookup chain and reference-canon doctrine. Retires with the Step 1 type-level surgical edit on `source.ts`.
- [docs/v1-reference/synthetic-feature-completion-plan.md](docs/v1-reference/synthetic-feature-completion-plan.md) — the stalled 5-commit sequence; its remaining work folds into the v2 construction order.
- [docs/v1-reference/temporal-epistemic-kernel.md](docs/v1-reference/temporal-epistemic-kernel.md) — v1's K/L/S/V/D/R/A/C/M/H theorem groups. Retires as a proof-obligation matrix; the ideas survive as narrative framing.
- [docs/v1-reference/envelope-axis-refactor-plan.md](docs/v1-reference/envelope-axis-refactor-plan.md) — Phase 0a/b/c/d complete; lives in v1-reference for historical context of how the substrate got to its current state.
- Other v1 docs (`cold-start-convergence-plan`, `convergence-backlog`, `convergence-roadmap`, `current-state`, `research-master-prioritization-v4`, `recursive-self-improvement`, `scenario-partition`, etc.) live under `docs/v1-reference/` as reference.

Every doc in `docs/` has a `> Status:` line after its heading — use it to decide whether to read or skip.
Historical research and assessments live in `docs/archive/` and can be ignored on first encounter.

Scoped instructions under `.github/instructions/` still apply per-concern and are updated incrementally as the reshape lands.

## Non-negotiable model (post-reshape, heading into Step 0)

- **The seam is compile-enforced.** `workshop/` and `dashboard/` cannot import `product/` except through manifest-declared verbs and the shared append-only log set. An architecture test fails the build on violations.
- **The manifest is the contract.** `product/manifest/manifest.json` is generated from code at build time; a build check fails on non-additive drift. Verbs have frozen signatures from the moment they're published.
- **Every agentic decision produces an `InterventionHandoff`.** The shape is required, not optional. No silent escalation; no `throw` as escape.
- **Every reasoning call produces a `ReasoningReceipt<Op>`.** Provider-specific errors classify into the five named families (`rate-limited`, `context-exceeded`, `malformed-response`, `unavailable`, `unclassified`).
- **Every proposal activation passes through the trust-policy gate.** The YAML-authored thresholds in `workshop/policy/trust-policy.yaml` are actively enforced; no receipt = no override; no threshold satisfaction = no activation.
- **Every log is append-only.** The adapter refuses in-place updates; confidence derives on read from the evidence log; contradictions never overwrite.
- **Every envelope carries the four phantom axes.** Stage × Source × Verdict × Fingerprint<Tag>; misuse is a compile error.
- **Provenance is minted at the event, not reconstructed later.**
- **Generated tests are disposable object code;** the facet catalog is the durable asset.

## Lookup chain (contracts to five slots at Step 1)

The reference-canon transitional slot retires at Step 1 of the construction order (`v2-direction.md §6`). After the retirement sweep runs, `PhaseOutputSource` has five variants:

| Slot | Source | Where |
|---|---|---|
| 1 | `operator-override` | `product/catalog/overrides/` (pure-intent fragments) |
| 2 | `agentic-override` | `product/catalog/agentic/` (receipt-backed) |
| 3 | `deterministic-observation` | `product/catalog/deterministic/` (gate-promoted) |
| 4 | `live-derivation` | `.tesseract/cache/` (ephemeral) |
| 5 | `cold-derivation` | in-process |

Until Step 1 lands, slot 4 is still `reference-canon` and slots 5–6 are `live-derivation` / `cold-derivation`; consult `docs/v1-reference/canon-and-derivation.md` for the transitional six-slot behavior currently in code.

## Knowledge posture (`--posture` CLI flag)

- `cold-start`: runs against no prior canon; tests the product's ability to discover from scratch.
- `warm-start`: default; consults all committed canon.
- `production`: same as warm-start + all output version-controlled.

## Probe IR — the testbed seam

Workshop does not maintain a hand-authored scenario corpus. It derives probes from `product/`'s manifest plus per-verb **fixture specifications** (tiny YAML files alongside each verb declaration). See `v2-substrate.md §6a` for the spike protocol that validates the IR before it becomes authoritative.

**This replaces the v1 dogfood corpus.** The 10000/20000 scenario partition retires with the reference-canon content; `dogfood/scenarios/` does not port forward to any folder.

## Envelope discipline

Every cross-seam handoff carries a `WorkflowEnvelope<Payload, Stage>` with the four phantom axes. Envelope types declare their pipeline stage as a narrow literal via `extends WorkflowMetadata<'stage'>` — for example, `RunRecord extends WorkflowMetadata<'execution'>`. Do NOT inline the envelope header fields when declaring a new type; they come from the base.

The four axes:
- **Stage** — pipeline phase (`preparation` | `resolution` | `execution` | `evidence` | `proposal` | `projection`).
- **Source** — lookup-chain slot that produced the artifact (see the five-slot table above).
- **Verdict** — governance outcome (`Approved` | `ReviewRequired` | `Blocked`); dispatch exclusively through `foldGovernance`.
- **Fingerprint<Tag>** — content-addressed identity with a phantom tag from the closed 30+ tag registry in `product/domain/kernel/hash.ts`.

All four axes are phantom-typed. Misuse is a compile error, not a runtime bug. Architecture law 8 (in `product/tests/architecture/`) forbids ad-hoc governance string comparisons.

## Governance vocabulary

Use these terms consistently:

- `confidence`: how a binding was produced
- `compiler-derived`: deterministic derivation from approved artifacts
- `intent-only`: preserved intent awaiting runtime interpretation
- `governance`: whether a bound step is executable now or needs operator follow-up
- `approved`: deterministic or already-approved path, emit and run normally
- `review-required`: the system needs operator follow-up, but this is not synonymous with uncertified canon
- `blocked`: do not execute

Do not overload confidence with review state.

## Reasoning port (post Step 4b)

Every agent-cognition callsite routes through the unified `Reasoning` port at `product/reasoning/reasoning.ts`. Three operations:

- `select(SelectRequest) → ReasoningReceipt<'select'>` — rung-5 structured match (v1 `TranslationProvider.translate`, renamed to `.select` per v2 §3.6).
- `interpret(InterpretRequest) → ReasoningReceipt<'interpret'>` — rung-9 semantic judgment (v1 `AgentInterpreterPort.interpret`, method name unchanged, service tag changes).
- `synthesize(SynthesisRequest) → ReasoningReceipt<'synthesize'>` — open-ended generation; port shape fixed, first production adapter pending.

Every call produces a `ReasoningReceipt<Op>` carrying `{ provider, model, tokens, latencyMs, promptFingerprint, payload }`. The receipt log joins `product/`'s append-only log set; workshop reads it for cost / batting-average / token-consumption metrics.

Errors classify into one of five families via `ReasoningError`: `rate-limited | context-exceeded | malformed-response | unavailable | unclassified`. `foldReasoningError(err, cases)` dispatches exhaustively; `classifyReasoningError(cause, provider?)` reconciles raw causes (and legacy v1 errors) into the unified surface.

Adapter selection is a `Layer.succeed(Reasoning, <adapter>)` composition decision in `product/composition/local-services.ts`. Adapter priority:

1. Explicit `LocalServiceOptions.reasoning` injection (for copilot-live, openai-live, test doubles).
2. `ci-batch` profile → `createDeterministicReasoning()` (zero-cost).
3. Default → `createCompositeReasoning({ translation, agent })` wrapping the legacy v1 providers.

Note on retirement: v1 `TranslationProvider` and `AgentInterpreterPort` remain internal as the composite bridge's dependencies through the 4b.B.* window, but they are not deprecated aliases — they are the bridge's operands. Per `docs/coding-notes.md §17–26` ("adopt the new path forward fully and delete the old one; no deprecated-alias window"), retirement is a deletion commit that migrates their logic into direct Reasoning adapters, not a marker-then-remove sequence.

## Deterministic precedence

Keep precedence concern-specific:

Resolution:

1. explicit scenario fields
2. operator override (`product/catalog/overrides/`)
3. approved knowledge (`product/catalog/` facet records)
4. shared patterns
5. prior evidence or run history
6. live DOM exploration and safe degraded resolution
7. `needs-human` (emits InterventionHandoff)

Data:

1. explicit scenario override
2. runbook dataset binding
3. dataset default
4. facet kind default value
5. posture sample
6. generated token

Run selection:

1. CLI flags
2. runbook
3. repo defaults

If you change these precedence laws, you are changing compiler semantics. Add or update tests accordingly.

## What belongs where (across the three folders)

Use **data** under `product/catalog/` when the concept is declarative — aliases, locator ladders, default value refs, posture vocabularies, widget affordances, per-screen facet records.

Use **code** when the concept is genuinely procedural:
- widget choreography in `product/widgets/`
- runtime orchestration in `product/runtime/`
- filesystem, ADO, Playwright, and Reasoning adapters in `product/instruments/`
- AST-backed emitters in `product/instruments/codegen/`

Measurement, tuning, and evaluation code belongs in **`workshop/`** — never in `product/`. Observation-only read surfaces (MCP tools, HTTP bridges, projection views) belong in **`dashboard/`** — never in `product/` or `workshop/`.

## Architectural guardrails (per folder)

Inside each folder, the layered dependency rule holds:

- `product/domain/` — pure, side-effect free. Imports only other `product/domain/` modules.
- `product/application/` (if needed for orchestration) — Effect programs. Imports `product/domain/`.
- `product/runtime/` — executes programs, resolves locators/widgets. Imports `product/domain/` and `product/instruments/`.
- `product/instruments/` — adapters (ADO, Playwright, Reasoning, facet store). Imports `product/domain/`.
- `workshop/` — imports `product/domain/` types and reads through the manifest/log seam. Does not import `product/application/` or `product/runtime/` internals.
- `dashboard/` — imports `product/domain/` types only. Reads through manifest-declared verbs.

When a concept starts to cross those boundaries, model the boundary explicitly instead of leaking strings or side effects.

## Strong preferences

Read [`docs/coding-notes.md`](docs/coding-notes.md) thoroughly before writing code. It is the authoritative source for FP style, Effect patterns, design pattern vocabulary (GoF), and testability conventions. Do not deviate.

Key principles (detail and examples in coding-notes.md):

- **Functional programming**: pure functions, immutable data, `const` bindings, recursive folds over mutable accumulation, `readonly` on all exported interface fields.
- **Effect-forward orchestration**: `Effect.gen` with `yield*`, `Effect.all` for independent operations, `Effect.catchTag` over manual discrimination, no `runPromise`/`runSync` outside `lib/composition/`.
- **Design patterns**: Strategy (resolution ladder), Visitor/Fold (exhaustive case analysis), Composite (scoring rules), State Machine (convergence), Interpreter (compilation phases), Envelope (`mapPayload`).
- **Governance**: phantom branded types (`Approved<T>`, `Blocked<T>`), `foldGovernance` for exhaustive analysis, value objects over protocol strings.
- **Testing**: law-style tests for determinism, precedence, normalization, and round-trips. Provenance-rich outputs over opaque success paths.
- **Code generation**: AST-backed emission over source-string splicing. Pure derivations over parallel truth.

## Scoped guidance

Folder-specific instructions live in `.github/instructions/`:

- `domain.instructions.md` — domain modeling rules and type conventions (applies within `product/domain/`).
- `knowledge.instructions.md` — facet catalog authoring (applies within `product/catalog/`).
- `tests.instructions.md` — test structure, naming, and property-based testing patterns (applies across all three folders).
- `scripts.instructions.md` — CLI scripts, build, and automation.
- `generated.instructions.md` — generated artifact handling.
- `dogfood.instructions.md` — retires with the dogfood tree; do not edit under the current reshape.

Per-folder `README.md` stubs land at Step 0 of the reshape and take precedence over this document for anything folder-specific.

## Review surface contract

Every meaningful change should preserve or improve these outputs. Paths below reflect the post-reshape destinations; the v1 paths currently in use are in the v1-reference docs.

- `product/generated/{suite}/{ado_id}.spec.ts` — the emitted Playwright test.
- `product/generated/{suite}/{ado_id}.trace.json` — the authoring trace.
- `product/generated/{suite}/{ado_id}.review.md` — the human-legible review surface.
- `product/generated/{suite}/{ado_id}.proposals.json` — the proposal bundle for operator review.
- `product/logs/tasks/{ado_id}.resolution.json` — the task resolution receipt.
- `workshop/scorecard/scorecard.json` — the loss curve with history + Pareto frontier.
- `workshop/logs/receipts/` — hypothesis receipts (append-only).

If a new workflow cannot explain itself through those artifacts, it is under-modeled.

## Agent workflow

When orienting a fresh session:

1. Read CLAUDE.md (this doc) and `docs/v2-direction.md §§1–2` — that's the three-folder shape and the seam.
2. Read the `README.md` of the folder your task lives in (landing at Step 0).
3. Run `npm run map` and `npm run context` for auto-generated navigation.
4. Read the specific v2 doc section your task references (direction, substrate, transmogrification, delta audit, or feature ontology).

When working in code:

```bash
npm run build          # full build across all folders
npm run build:product  # product/ only (after Step 0)
npm run build:workshop # workshop/ only (after Step 0)
npm run build:dashboard # dashboard/ only (after Step 0)
npm test               # full test suite
```

Until Step 0 lands, all code lives under `lib/` and the old commands (`npm run workflow`, `npm run paths`, `npm run trace`, etc.) continue to work as v1-documented.

## MCP and workshop CLI

The MCP server and its read tools land in `dashboard/mcp/` after Step 0 of the reshape. Until then they live at `lib/infrastructure/mcp/`. The observe-side tools (`get_learning_summary`, `list_proposals`, `get_fitness_metrics`, `get_queue_items`, etc.) continue to work unchanged through both phases.

### MCP fallback: direct tool bridge

If the MCP server fails to connect, use the bridge script:

```bash
npx tsx scripts/mcp-call.ts                          # list tools
npx tsx scripts/mcp-call.ts get_learning_summary     # orient
npx tsx scripts/mcp-call.ts list_proposals '{"status":"activated"}'
npx tsx scripts/mcp-call.ts get_fitness_metrics
npx tsx scripts/mcp-call.ts get_suggested_action
```

The bridge calls the same tool handlers directly, bypassing stdio transport. Paths resolve to `.tesseract/` today and to `workshop/` after Step 0.

### Agent-in-the-loop: real-time proposal approval

The workshop's speedrun can pause at iteration boundaries waiting for agent decisions:

```bash
# Terminal 1: start the iterate phase in MCP decision mode
npx tsx scripts/speedrun.ts iterate --mcp-decisions --max-iterations 4 --decision-timeout 300000

# Terminal 2: agent approves from the bridge
npx tsx scripts/mcp-call.ts get_queue_items '{"status":"pending"}'
npx tsx scripts/mcp-call.ts approve_work_item '{"workItemId":"<id>","rationale":"Agent approved"}'
```

The file-backed decision bridge uses atomic temp-rename writes to the decision directory; the running speedrun watches with `fs.watch` and resumes the paused fiber when a decision arrives. Writer side moves to `product/instruments/handshake/`; watcher stays with `dashboard/bridges/`.

### Workshop CLI — the four-verb orchestration

```bash
# Produce the reference workload (post-reshape: probes derived from manifest replace this step)
npx tsx scripts/speedrun.ts corpus --seed warm-v1

# Substrate growth on the current workload
npx tsx scripts/speedrun.ts iterate --max-iterations 3 --posture warm-start

# Compute the fitness report from run records
npx tsx scripts/speedrun.ts fitness

# Project into the metric tree and optionally diff a baseline
npx tsx scripts/speedrun.ts score --baseline latest

# Snapshot the metric tree as a labeled baseline for future diffs
npx tsx scripts/speedrun.ts baseline --label pre-edit

# N-trial convergence proof (hylomorphic statistical harness)
npx tsx scripts/convergence-proof.ts --trials 2 --count 10 --max-iterations 4
```

### Workshop health checks

After any workshop run, verify:

1. `get_fitness_metrics` — is the knowledge hit rate / effective hit rate improving? `resolutionByRung` shows where steps resolve.
2. `list_proposals` — are proposals being generated AND activated? Both counts should be non-zero.
3. `get_convergence_proof` — does the loop converge? Look for `converges: true`.
4. `get_learning_summary` — holistic view with `actionRequired` priorities.

If proposals show `generated > 0` but `activated = 0`, the activation pipeline may be broken.

## Trust policy boundary

Trust policy lives in `workshop/policy/` (`workshop/policy/trust-policy.yaml` + `workshop/policy/evaluate.ts`). It evaluates activation of canonical changes — elements, postures, hints, patterns, surfaces, snapshot templates, routes — against confidence thresholds and evidence requirements. Active enforcement: every proposal activation passes through it.

Trust policy does not block `product/` compiler output derived from existing canon; it does not block runtime-acquired canon that satisfies its thresholds. Numeric thresholds recalibrate as probes derived from the manifest surface real evidence — threshold changes land through the same proposal-gated discipline the policy already enforces on catalog writes.

## Optimization lane

DSPy, GEPA, and similar tooling are welcome in `workshop/optimization/` only — the offline evaluation lane.

Use them for:

- ranking proposals
- tuning agent prompts (the `Reasoning` port's prompt structure)
- measuring trace and evidence quality
- improving probe coverage and batting average

Do not route them into `product/` or into runtime-resolution paths.

---

**Where this document is canonical and where it is transitional:** the three-folder compartmentalization, the seam discipline, the probe IR, the metric visitor audit, and the graduation condition are current v2 doctrine. The specific folder paths (`product/runtime/`, `workshop/metrics/`, etc.) are authoritative for *what the code will look like after Step 0 lands*. Today's code still lives at `lib/...` paths; the mapping between `lib/` and `product/` / `workshop/` / `dashboard/` is enumerated in `docs/v2-transmogrification.md §13.0`. When a `lib/...` path and a `product/...` path disagree, the former is where the code currently is; the latter is where it is going.
