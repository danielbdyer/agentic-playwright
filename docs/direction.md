# Tesseract Direction

This document records design direction decisions that shape the system's evolution. It is a living record of owner intent, not a specification, but the reasoning behind the specifications. Read it alongside `VISION.md` and `BACKLOG.md`.

## Resolution strategy: deterministic first, translation second, agentic last

The system biases hard toward deterministic substrates:

- ADO connectivity as a closed, typed data source
- closed ontological sets mapped against core library APIs
- Playwright snapshots using direct function calls, never MCP intermediaries
- locator ladders, posture contracts, hint aliases, and resolution controls as pre-resolved knowledge

Where deterministic resolution runs out, structured translation converts novel ADO phrasing into known ontological terms. This is a bounded, scorable inference step, not open-ended generation.

Where structured translation also falls short, the runtime agent receives the step with full problem context: the task packet, approved knowledge, confidence overlays, prior evidence, and the live DOM. The agent should:

1. review the exhaustion trail to understand what was already tried
2. explore the DOM with knowledge priors and widget contracts as constraints
3. submit its best resolution only after confirming no better option exists
4. score its own confidence and persist that signal
5. trend toward making the test succeed, even if degraded

The agent should be defensively strategic: bias toward the best answer rather than the first plausible answer, but never hide uncertainty or block forward progress.

### What this means for the codebase

- `lib/domain/inference.ts` stays thin and closed-set
- `lib/application/translate.ts` is the bounded translation stage
- `lib/runtime/agent.ts` remains the last-resort resolution path, receiving rich context and producing typed receipts
- novel phrasing should never require a canonical knowledge edit before the step can attempt execution

## Runtime architecture: observable Playwright, not MCP

The execution engine is always an observable Playwright Node.js module. MCP is never the execution path.

The runtime agent observes runs and can intervene by inspecting typed receipts, traces, and evidence. It does not drive Playwright through a tool-use protocol.

Agents inherit provenance from prior runs. Snapshots, notes, evidence, and confidence overlays recorded by previous sessions are available to future agents so they do not re-spend tokens rediscovering the same surfaces or quirks.

Execution performance is a first-class concern. The runtime path must not degrade observable test execution speed to accommodate introspection overhead.

## Knowledge auto-accrual: confidence grows through use

Knowledge does not require human blessing to accrue confidence. Through repeat engagements and repeat runs, the system builds increasing statistical confidence in a snapshot's effectiveness, an element's locator stability, or a hint's disambiguation accuracy.

### When the agent flags the user

The agent requests approval only when it must make destructive changes to the leading hypothesis:

- a selector must be created or healed because the DOM changed
- a snapshot template must be updated because the UI structure shifted
- a posture contract must be revised because application behavior changed

In these cases, the agent returns the proposed change with proof it works.

### When the agent keeps going

- increasing confidence within threshold is a signal to continue, not to pause
- approved-equivalent overlays are derived working knowledge, not canon
- the system biases in the agent's favor as long as reporting and lineage stay explicit

### Resolution mechanism

Confidence scores are tracked per artifact and accrue through:

- successful execution runs that exercise the artifact
- consistent resolution across multiple scenarios that reference the artifact
- absence of contradictory evidence

When confidence exceeds the trust-policy threshold for an artifact type, the overlay is treated as approved-equivalent for resolution purposes. When confidence drops below threshold, the overlay is flagged for review or demoted back to learning.

The trust policy thresholds remain the tuning surface for this behavior.

## Scale context

The system is designed to be application-agnostic, but the immediate target environment shapes scaling assumptions:

- 15 screens
- 20-50 selectors per screen
- 20 user roles with variant authorization
- about 300 entities and static entities
- about 20 specialized business flows
- about 3000 scenarios

The implementation details reference OutSystems, but the core domain model, compiler, and runtime seams are framework-agnostic.

### Scaling implications

- element signatures need strong screen scoping and stable ids
- the graph becomes the primary navigation tool at scale
- incremental compilation and rerun planning become mandatory
- pattern promotion remains a quality lever, not a shortcut around local knowledge
- bottleneck analytics must identify thin-knowledge screens, degraded-locator hotspots, translation dependence, and overlay churn

## CI integration: batch execution, reporting for later consumption

The system will auto-run tests from OutSystems Lifetime API webhooks when modules are published. This is `ci-batch` execution with deferred reporting and no realtime approval loop.

### What this means for the codebase

- the runtime must support a headless, non-interactive execution profile with clean exit codes
- proposal generation can happen during CI runs but proposals are never auto-applied in CI
- evidence, run receipts, and confidence overlays accumulate for later operator consumption
- structured reporting must be suitable for dashboard aggregation

## Widget system and DOM contracts

Widgets are the bridge between structural knowledge and behavioral knowledge. They answer: given an element of type X, what actions are legal, what preconditions must hold, and what effects should the system expect?

### The three layers

1. Widget capability contracts in `lib/domain/widgets/contracts.ts`
2. Thin Playwright handlers in `lib/runtime/widgets/`
3. Capability derivation and reporting in `lib/domain/grammar.ts` and runtime receipts

### Runtime consequence

When a step executes:

1. the agent resolves a target and its widget contract
2. locator resolution walks the locator ladder and records the rung used
3. interaction dispatch checks the widget contract preconditions
4. the handler issues the direct Playwright call

If the locator degrades to a fallback rung, the run can stay green while still surfacing brittleness. If a precondition fails, the receipt should carry a typed failure rather than a raw browser timeout.

### Extension rule

To add a widget family:

1. add the contract first
2. add the thin handler second
3. register it in the runtime
4. extend grammar only if the capability surface changes
5. reference it from approved knowledge

The contract is the durable seam. The handler is the disposable implementation.
