# Tesseract Direction

`docs/master-architecture.md` is now the authoritative architecture specification.

This document remains as a shorter owner-direction note: it captures transition decisions, sequencing, and non-negotiable implementation bias while the repo moves toward the master architecture.

## Directional shift

The most important change is conceptual:

- compiler-only framing is no longer sufficient
- `Interface Intelligence` is the durable structural spine
- `Agent Workbench` is the durable intervention spine
- `Recursive Improvement` is the durable optimization spine
- all three must share one interpretation surface

That shift should drive future design decisions even when older implementation names still exist in code.

## Transition guardrails

As the repo moves toward the master doctrine, preserve these rules:

- deterministic first, structured translation second, agentic last
- observable Playwright runtime, never MCP-driven execution
- approved artifacts remain canonical truth
- derived learning layers may ratchet without mutating canon
- selectors and dynamic state knowledge must converge toward single-source representations

## Near-term owner priorities

The current implementation program is:

1. make the interface graph and selector canon deterministic and reviewable
2. model dynamic state and event topology explicitly instead of rediscovering it ad hoc
3. lower ADO scenarios into grounded decomposition before emission
4. keep emitted tests readable while routing behavior through one canonical runtime interface
5. standardize provider-agnostic intervention/session ledgers and workbench event vocabularies
6. use replay, evaluation, and recursive-improvement corpora to improve the system without weakening governance

## Composition direction

The codebase is moving toward richer use of its Effect and functional composition tools. The direction is:

- **Structural parallelism over sequential chains.** Independent operations should be expressed with `Effect.all` so the type system documents independence. This applies to file walks, artifact loads, and any batch of operations that don't depend on each other's results.
- **Effect-native error recovery over JS try/catch.** Synchronous throws should be lifted into the Effect error channel via `trySync`. Recovery should use `Effect.catchTag` for discriminated error handling or `Effect.catchAll` for uniform fallback — not `try/catch` blocks inside `Effect.gen`.
- **Composable phase and scoring abstractions.** Multi-phase pipelines should be expressed as `PipelinePhase[]` arrays consumed by a generic fold, not as inline code blocks. Scoring formulas should be expressed as composable `ScoringRule` semigroups with `combine`/`contramap`, not as hardcoded arithmetic.
- **Phantom governance at type boundaries.** Functions that require a specific governance state should express it through phantom branded types (`Approved<T>`, `Blocked<T>`) in their signatures. The `foldGovernance` combinator should be used for exhaustive case analysis.
- **Recursive folds over mutable accumulation.** Sequential processes that accumulate results and short-circuit on success should be expressed as recursive `step(remaining, prior)` functions, not `for` loops with `.push()` and early `return`.

These are not aspirational. The patterns are implemented in the codebase today and should be extended to new code naturally.

## Scale posture

The immediate system target is thousands of scenarios against a shared application model.

That means the architecture must bias toward:

- bounded incremental recomputation
- reuse of target, selector, and state knowledge
- explicit change detection and bottleneck visibility
- clear promotion boundaries between derived knowledge and approved canon

If a design increases scenario count by duplicating selectors, rediscovering DOM structure, or smuggling dynamic behavior into emitted code, it is moving in the wrong direction.
