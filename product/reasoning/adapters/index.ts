/**
 * Reasoning adapter registry (v2 §3.6 + readiness §9.6).
 *
 * Re-exports every first-party `Reasoning` implementation. Callers
 * pick the right adapter at composition time via
 * `Layer.succeed(Reasoning, <adapter>)`. Adapter selection priority
 * (from §9.6): copilot-live → openai-live → deterministic fallback.
 *
 * First-party adapters:
 * - `createDeterministicReasoning()` — always-available, zero-cost.
 *   Use for `ci-batch` profile and integration tests.
 * - `createCompositeReasoning(deps)` — bridges v1 providers into the
 *   unified port during the 4b.B.* migration window. Retires when
 *   direct adapters (Copilot, Azure OpenAI) land.
 *
 * Direct adapters (copilot-live, openai-live) land in follow-up
 * commits as the token-accounting and prompt-fingerprint pipelines
 * they require come online.
 */

export { createCompositeReasoning, type CompositeReasoningDependencies } from './composite';
export { createDeterministicReasoning, deterministicReasoningProviderId } from './deterministic';
