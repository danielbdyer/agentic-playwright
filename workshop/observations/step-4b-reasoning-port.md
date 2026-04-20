# Step 4b reasoning-port observation memo

**Date:** 2026-04-20
**Event:** L0 shape adjustments (locator ladder reorder, navigation idempotence, four-family error classification on interact, pre-generated facade emitter) + Reasoning port consolidation. Two proto-Reasoning ports (`TranslationProvider`, `AgentInterpreterPort`) collapse into one `Reasoning.Tag` with three operations (`select` / `interpret` / `synthesize`). Errors consolidate into five families (`rate-limited` / `context-exceeded` / `malformed-response` / `unavailable` / `unclassified`).

## Hypotheses (with predicted metric directions)

Step 4b does not directly bind a verified metric receipt; no runtime consumer yet invokes `yield* Reasoning` in production. What changes is the *shape* of the measurement surface. When direct adapters land (copilot-live, openai-live) and sagas migrate off the composite bridge, the following deltas become measurable:

- **`metric-reasoning-token-consumption-p50` — `stable` then `decrease` once batching lands.** The first port-emitting adapter produces this metric with token counts populated from provider responses. Batching (per readiness §9.6) amortizes prompt-prefix cost across multiple requests; p50 should decrease when the first saga adopts `selectBatch` / `interpretBatch`.
- **`metric-reasoning-latency-p95` — `stable` then `decrease` once the idempotent navigation wrapper (4b.A.2) short-circuits repeat pre-navs.** Today's pre-navigation re-issues `page.goto` on the URL the page is already at; idempotent skip costs zero network time. p95 latency on scenarios with ≥2 same-screen steps should drop.
- **`metric-hypothesis-confirmation-rate` — `stable`.** This receipt itself is a hypothesis; its confirmation is the above two metrics moving as predicted when their respective predicates are satisfied.

## Why this is a proposal, not a retirement

The v1 `TranslationProvider` and `AgentInterpreterPort` interfaces remain exported through the 4b.B.* window as live dependencies of the composite adapter (`product/reasoning/adapters/composite.ts`). They are NOT deprecated aliases — per `docs/coding-notes.md §17–26`, this codebase does not use `@deprecated` JSDoc markers or alias windows. A type is either actively in use or it is deleted.

Callsites at the Step 4b.B.4 rename boundary — `local-runtime-scenario-runner.ts:46` and the test surfaces — call `provider.select(...)` on the v1 provider object (method renamed on the v1 interface); only the verb name flips, the interface remains v1-shaped.

The v1 interfaces retire in a future deletion commit that migrates their factory logic (`createDeterministicProvider`, `createLlmApiProvider`, `createCopilotProvider`, `createHybridProvider`, and the agent-interpreter equivalents) directly into the `product/reasoning/adapters/` surface as `ReasoningService` implementations. That commit is a pure deletion-plus-migration, not a marker-then-remove sequence.

## Seam graduation

`product/reasoning/translation-provider.ts` and `product/reasoning/agent-interpreter-provider.ts` graduated off `RULE_3_GRANDFATHERED` in `product/tests/architecture/seam-enforcement.laws.spec.ts` at this commit. The v1 files no longer reach cross-seam; the new adapter layer lives entirely within `product/reasoning/adapters/`.

## What to expect next

- A `product/reasoning/adapters/copilot-live.ts` commit adds the VSCode Copilot adapter with token accounting + prompt fingerprint population. This is the first adapter that actually emits non-zero telemetry on `ReasoningReceipt<Op>.tokens` and `promptFingerprint`.
- A `product/reasoning/adapters/openai-live.ts` commit adds the Azure AI Foundry adapter (same telemetry surface).
- A `workshop/metrics/` visitor for `metric-reasoning-token-consumption-p50` lights up when the first live adapter emits a receipt with populated token counts.
- The composite bridge retires when the above two adapters cover the full saga surface.

## Pointers

- Port declaration: `product/reasoning/reasoning.ts`.
- Error union: `product/domain/kernel/errors.ts` (ReasoningError + foldReasoningError + classifyReasoningError).
- Adapters: `product/reasoning/adapters/{composite,deterministic}.ts` + index.
- Composition wiring: `product/composition/local-services.ts` (LocalServiceOptions.reasoning + Layer.succeed(Reasoning, ...)).
- CLAUDE.md Reasoning port doctrine — authoritative for post-Step-4b saga authoring.
- Retrofit plan: `docs/v2-readiness.md §9`.
