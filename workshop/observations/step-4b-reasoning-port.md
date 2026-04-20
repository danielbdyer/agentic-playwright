# Step 4b reasoning-port observation memo

**Date:** 2026-04-20
**Event:** L0 shape adjustments (locator ladder reorder, navigation idempotence, four-family error classification on interact, pre-generated facade emitter) + Reasoning port consolidation. Two proto-Reasoning ports (`TranslationProvider`, `AgentInterpreterPort`) collapse into one `Reasoning.Tag` with three operations (`select` / `interpret` / `synthesize`). Errors consolidate into five families (`rate-limited` / `context-exceeded` / `malformed-response` / `unavailable` / `unclassified`).

## Hypotheses (with predicted metric directions)

Step 4b does not directly bind a verified metric receipt; no runtime consumer yet invokes `yield* Reasoning` in production. What changes is the *shape* of the measurement surface. When direct adapters land (copilot-live, openai-live) that populate `tokens` and `promptFingerprint` from provider telemetry, the following deltas become measurable:

- **`metric-reasoning-token-consumption-p50` — `stable` then `decrease` once batching lands.** The first token-reporting adapter produces this metric with counts populated from provider responses. Batching (per readiness §9.6) amortizes prompt-prefix cost across multiple requests; p50 should decrease when the first saga adopts `selectBatch` / `interpretBatch`.
- **`metric-reasoning-latency-p95` — `stable` then `decrease` once the idempotent navigation wrapper (4b.A.2) short-circuits repeat pre-navs.** Today's pre-navigation re-issues `page.goto` on the URL the page is already at; idempotent skip costs zero network time. p95 latency on scenarios with ≥2 same-screen steps should drop.
- **`metric-hypothesis-confirmation-rate` — `stable`.** This receipt itself is a hypothesis; its confirmation is the above two metrics moving as predicted when their respective predicates are satisfied.

## Retirement status

The v1 `TranslationProvider` / `AgentInterpreterPort` files retired at the step-4b.retirement commit. Their factory logic migrated into `product/reasoning/adapters/{translation-backends,agent-backends}.ts` as internal backend strategies. The two interface shapes survive as implementation-detail contracts shared between the two backend files via `adapters/index.ts`, not as public APIs.

The composite bridge at `product/reasoning/adapters/composite.ts` deleted; `createReasoning({ translation, agent })` at `adapters/index.ts` replaces it with the same shape.

The six v1 error classes (`TranslationProviderError`, `TranslationProviderTimeoutError`, `TranslationProviderParseError`, `AgentInterpreterProviderError`, `AgentInterpreterTimeoutError`, `AgentInterpreterParseError`) and their factory functions deleted. Internal backends throw `ReasoningError` subclasses directly; `classifyReasoningError` simplified to inspect raw `Error` causes only.

Per `docs/coding-notes.md §17–26`, this codebase does not use `@deprecated` JSDoc markers or alias windows. A type is either actively in use or it is deleted.

## Seam graduation

`product/reasoning/translation-provider.ts` and `product/reasoning/agent-interpreter-provider.ts` graduated off `RULE_3_GRANDFATHERED` in `product/tests/architecture/seam-enforcement.laws.spec.ts` at this commit. The v1 files no longer reach cross-seam; the new adapter layer lives entirely within `product/reasoning/adapters/`.

## What to expect next

- A `product/reasoning/adapters/copilot-live.ts` commit adds the VSCode Copilot adapter with token accounting + prompt fingerprint population. This is the first adapter that actually emits non-zero telemetry on `ReasoningReceipt<Op>.tokens` and `promptFingerprint`.
- A `product/reasoning/adapters/openai-live.ts` commit adds the Azure AI Foundry adapter (same telemetry surface).
- A `workshop/metrics/` visitor for `metric-reasoning-token-consumption-p50` lights up when the first live adapter emits a receipt with populated token counts.
- The per-adapter token-consumption receipts let the workshop's metric visitor produce its first non-zero measurement.

## Pointers

- Port declaration: `product/reasoning/reasoning.ts`.
- Error union: `product/domain/kernel/errors.ts` (ReasoningError + foldReasoningError + classifyReasoningError).
- Adapters: `product/reasoning/adapters/{composite,deterministic}.ts` + index.
- Composition wiring: `product/composition/local-services.ts` (LocalServiceOptions.reasoning + Layer.succeed(Reasoning, ...)).
- CLAUDE.md Reasoning port doctrine — authoritative for post-Step-4b saga authoring.
- Retrofit plan: `docs/v2-readiness.md §9`.
