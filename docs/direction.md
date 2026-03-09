# Tesseract Direction

This document records design direction decisions that shape the system's evolution. It is a living record of owner intent — not a specification, but the reasoning behind the specifications. Read it alongside VISION.md and BACKLOG.md.

## Inference strategy: deterministic first, LLM-assisted second, agentic last

The system biases hard toward deterministic substrates:

- ADO connectivity as a closed, typed data source
- Closed ontological sets mapped against core library APIs (OutSystems widget families, Playwright locator strategies, ARIA roles)
- Playwright snapshots using direct function calls, never MCP intermediaries
- Locator ladders, posture contracts, and hint aliases as pre-resolved knowledge

Where deterministic resolution runs out, structured inline LLM calls may serve as a translation layer — converting novel ADO phrasing into known ontological terms. This is a bounded, scorable inference step, not open-ended generation.

Where LLM-assisted translation also falls short, the runtime agent receives the step as an inbox item with full problem context: the task packet, approved knowledge, prior evidence, and the live DOM. The agent should:

1. review the exhaustion trail to understand what was already tried
2. explore the DOM with knowledge priors as constraints
3. submit its best resolution (ideal selector, element mapping, or plugin specification) only after confirming no better option exists
4. score its own confidence and persist that signal
5. trend toward making the test succeed, even if degraded

The agent should be defensively strategic: bias toward submission of the ideal answer rather than rushing to the first plausible one, but never block forward progress. If confidence is low, record that and keep going.

### What this means for the codebase

- `lib/domain/inference.ts` stays thin — it handles closed-set alias matching, not open-ended NLU
- A future `lib/application/translate.ts` (or similar) may wrap structured LLM calls for phrase-to-ontology mapping, operating over the same knowledge catalog
- `lib/runtime/agent.ts` remains the last-resort resolution path, receiving rich context and producing typed receipts
- Novel phrasing should never require a canonical knowledge edit before the step can attempt execution

## Runtime architecture: observable Playwright, not MCP

The execution engine is always an observable Playwright Node.js module. MCP is never the execution path.

The runtime agent observes runs and can intervene by zooming into error logs. It does not drive Playwright through a tool-use protocol — it consumes execution receipts and proposes repairs.

Agents inherit provenance from prior agents. Snapshots, notes, and evidence recorded by previous sessions are available to future agents, so they do not re-spend tokens rediscovering the same surfaces or quirks. Once an agent has seen a snapshot for a screen, it has the necessary context to reason effectively about that screen in future sessions.

Execution performance is a first-class concern. The runtime path must not degrade observable test execution speed to accommodate agent introspection overhead.

## Knowledge auto-accrual: confidence grows through use

Knowledge does not require a human blessing to accrue confidence. Through repeat engagements and repeat runs, the system builds increasing statistical confidence in a snapshot's effectiveness, an element's locator stability, or a hint's disambiguation accuracy.

### When the agent flags the user

The agent requests approval only when it must make destructive changes to the leading hypothesis:

- A selector must be created or healed because the DOM changed
- A snapshot template must be updated because the UI structure shifted
- A posture contract must be revised because application behavior changed

In these cases, the agent returns the proposed change with proof it works (evidence from a successful run against the new state).

### When the agent keeps going

- Increasing confidence within a tolerance threshold is a signal to continue, not to pause
- A well-reasoned thesis from the runtime agent is inherently trustworthy agentically
- The system biases in the agent's favor as long as reporting keeps flowing

### Resolution mechanism

Confidence scores are tracked per artifact (element, hint, posture, snapshot) and accrue through:

- successful execution runs that exercise the artifact
- consistent resolution across multiple scenarios that reference the artifact
- absence of contradictory evidence (failed assertions, locator mismatches)

When confidence exceeds the trust-policy threshold for an artifact type, the artifact is treated as approved-equivalent for compilation purposes. When confidence drops below threshold (e.g., after a failed run), the artifact is flagged for review.

The trust-policy.yaml thresholds remain the tuning surface for this behavior.

## Scale context

The system is designed to be application-agnostic, but the immediate target environment shapes scaling assumptions:

- 15 screens
- 20-50 selectors per screen (300-750 elements total)
- 20 user roles
- ~300 entities and static entities
- ~15 specialized business logic flows with multi-role handoffs, approval/reject processes, in-app messaging, and virtual team assignments
- ~3000 scenarios

The implementation details reference OutSystems (widget families like `os-input`, `os-button`, `os-table`; OutSystems-specific DOM patterns and selector strategies), but the core domain model, compiler, and runtime are framework-agnostic.

### Scaling implications

- Element signatures must support namespacing or screen-scoping to avoid collision at 750 elements
- The knowledge graph becomes the primary navigation tool at scale — impact queries replace manual grep
- Incremental compilation (BACKLOG #14) becomes critical: recompiling 3000 scenarios on every hint change is not viable
- Pattern promotion (BACKLOG #7) becomes a quality lever: repeated local hints across 15 screens should converge into shared patterns
- Bottleneck analytics (BACKLOG #12) becomes a planning tool: which of the 15 screens has the thinnest knowledge coverage?

## CI integration: webhook-triggered test runs, reporting for later consumption

The system will auto-run tests triggered by OutSystems Lifetime API webhooks when modules are published. This is batch execution with deferred reporting — no realtime agentic intervention in CI.

The full agentic supplement loop (agent observation, proposal generation, knowledge repair) runs outside CI, either in developer sessions or scheduled maintenance windows.

### What this means for the codebase

- The runtime must support a headless, non-interactive execution mode that produces clean exit codes and machine-readable reports
- Proposal generation can happen during CI runs but proposals are never auto-applied in CI
- Evidence and run receipts accumulate in `.tesseract/runs/` and `.tesseract/evidence/` for later agent consumption
- The reporter infrastructure (`lib/infrastructure/reporting/`) must emit structured output suitable for dashboard aggregation

## Multi-application awareness

The design should accommodate multiple distinct applications under the same Tesseract installation. This is not an immediate priority, but the knowledge namespace (`knowledge/screens/{screen}`, `scenarios/{suite}/`) already supports it through suite and screen path segmentation.

Future considerations:

- Shared patterns that apply across applications vs. application-scoped patterns
- Cross-application entity references (shared data, shared authentication)
- Independent confidence tracking per application

## Widget system and DOM contracts

### What widgets are

Widgets are the bridge between structural knowledge (what an element is) and behavioral knowledge (what you can do with it). They are the system's answer to the question: "Given an element of type X, what actions are legal, what preconditions must hold, and what effects should the system expect?"

### The three layers

**1. Widget capability contracts** (`lib/domain/widgets/contracts.ts`)

Pure domain knowledge. Each contract declares:
- `supportedActions`: what the widget can do (`click`, `fill`, `clear`, `get-value`)
- `requiredPreconditions`: what must be true first (`visible`, `enabled`, `editable`)
- `sideEffects`: what each action produces (`mutation` vs. `observation`)

Current contracts: `os-button`, `os-input`, `os-table`. These are OutSystems-flavored names but the contract shape is framework-agnostic.

Example: `os-input` supports `fill`, `clear`, `get-value`; requires `editable`, `enabled`, `visible`; `fill` is a `mutation`, `get-value` is an `observation`.

**2. Widget action handlers** (`lib/runtime/widgets/*.ts`)

Procedural Playwright calls — the actual browser interaction. Each handler maps a contract action to a Playwright API call:
- `os-input.fill` → `locator.fill(value)`
- `os-button.click` → `locator.click()`
- `os-table.get-value` → `locator.innerText()`

These are thin. The contract enforces preconditions; the handler just does the Playwright call.

**3. Grammar and capability derivation** (`lib/domain/grammar.ts`)

The grammar module derives what capabilities a screen, surface, or element exposes by combining:
- The element's ARIA role (e.g., `textbox` → `enter` + `observe-state`)
- The element's widget contract (e.g., `os-input` → `fill`, `clear`, `get-value`)

This feeds the graph and the runtime: "this screen can navigate, this surface can observe-structure, this element can enter values."

### How the layers connect in a runtime step

When the runtime executes a resolved step:

1. **Agent resolves** the step to a target: action=`input`, element=`policyNumberInput`, widget=`os-input`
2. **Locator resolution** (`lib/runtime/locate.ts`) walks the element's locator ladder (test-id → role-name → css) against the live DOM, tracking whether it degraded to a fallback rung
3. **Interaction dispatch** (`lib/runtime/interact.ts`) looks up the widget contract, asserts all preconditions (visible? enabled? editable?), then calls the handler
4. **Handler execution** (`lib/runtime/widgets/os-input.ts`) calls `locator.fill(value)` — a direct Playwright call, never MCP

If step 2 degrades (test-id missing, role-name succeeds), the execution is still green but the degradation signal flows into the run receipt and review surface.

If step 3 fails a precondition (element not editable), a typed runtime error is returned — not a Playwright timeout — so the agent can reason about the failure.

### Where widgets meet intent inference

The widget type on an element determines what step actions are compatible with it:
- `isElementCompatible` in `lib/runtime/agent.ts` checks: if action is `input`, the widget must include 'input'; if action is `click`, the widget must include 'button' or the role must be 'button'
- This is the DOM contract: the widget type constrains what the agent can propose

When the agent falls back to DOM exploration, it filters candidates by widget compatibility before probing visibility. This is how the widget system reduces the search space from "all elements on the screen" to "elements whose contracts support the intended action."

### Extending the widget system

To add a new widget family (e.g., `os-dropdown`, `os-datepicker`, `os-checkbox`):

1. Add the contract to `lib/domain/widgets/contracts.ts` — declare supported actions, preconditions, side effects
2. Add the handler to `lib/runtime/widgets/` — implement the Playwright calls
3. Register in `lib/runtime/widgets/index.ts` and the contract registry
4. Update `lib/domain/grammar.ts` role capabilities if the widget has a novel ARIA role
5. Add element signatures in `knowledge/screens/` that reference the new widget type
6. Run `npm run types` to regenerate the knowledge type surface

The contract is the durable knowledge. The handler is the disposable procedural implementation.
