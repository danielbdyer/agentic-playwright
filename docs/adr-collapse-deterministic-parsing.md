# ADR: Collapse the Deterministic Parsing Edge

Status: proposed

## Context

The current inference pipeline (`lib/domain/inference.ts`) treats ADO step text as a source language that must be deterministically parsed into structured IR before execution. It does this through substring-matching step prose against hand-curated alias vocabularies in screen hints, element signatures, and shared patterns.

This design assumes that the text of manual test cases contains enough well-formed structure to deterministically lower into a contractual interface. In practice, manual tests are written for human testers who interpret them agentically and lossily — the same way an LLM agent would. They were never designed to be a parseable grammar.

The consequence is a growing **alias treadmill**: every novel phrasing, synonym, or ambiguous reference in an ADO case requires a new canonical knowledge edit (hint alias, pattern alias, screen alias) before the compiler can produce anything other than `unbound`. This scales linearly with phrasing diversity and inverts the VISION.md promise that "the 50th test costs less than the 1st."

## The problem in code

`inferScenarioSteps()` performs four resolution passes over normalized step text:

1. **Action resolution** — substring-match against `core.patterns.yaml` action aliases
2. **Screen resolution** — substring-match against screen aliases and hint `screenAliases`
3. **Element resolution** — substring-match against element names and hint `aliases`
4. **Posture/override/snapshot resolution** — substring-match against posture aliases and snapshot aliases

Each pass uses `bestAliasMatch()`, which finds the longest matching alias substring in the normalized step text. If no alias matches, the field stays `null` and the step becomes `unbound`.

This is ~387 lines of deterministic text matching that produces two kinds of output:
- `compiler-derived` steps (all fields resolved) → auto-approved
- `unbound` steps (one or more fields missing) → blocked, requires knowledge authoring

The binding layer (`binding.ts`, ~174 lines) then validates the inferred references against schema, adding further `unbound` reasons if referenced elements or surfaces don't exist.

## What should change

### Seams that should remain deterministic

These are structural facts about the application, not interpretations of prose:

| Concern | Why deterministic |
|---|---|
| Knowledge schema (what a screen/element/surface/posture is) | Structural identity, not prose interpretation |
| Locator ladders (how to find a known element in the DOM) | Ordered fallback strategy, testable |
| Posture contracts (what valid/invalid/empty means for a field) | Behavioral partitions, reusable across scenarios |
| Capability derivation (what operations a surface supports) | Derived from element roles and widget contracts |
| Governance (which knowledge is approved vs proposed) | Trust boundary, must be deterministic |
| Provenance tracking | Traceability, must be deterministic |
| Code generation from bound programs | AST-backed, reproducible |

### Seams that should not be deterministic

These are interpretation acts that belong at runtime, grounded in the live DOM:

| Concern | Why agentic |
|---|---|
| Step text → intent interpretation | Prose is inherently ambiguous; alias dictionaries can't cover the long tail |
| Screen identification | The agent is looking at the DOM; it knows what screen it's on |
| Element resolution from instruction + DOM | Given an instruction and a visible DOM, the agent can find the element |
| "What did the QA mean by this step?" | Semantic interpretation, not substring matching |
| Generating supplemental artifacts from runtime discovery | Knowledge should grow from execution, not precede it |

### The new model

1. **The inference layer stops trying to pre-resolve step text.** The scenario IR preserves the raw ADO intent without requiring deterministic alias matching to produce a complete program. Steps carry their prose intent forward to the runtime.

2. **The knowledge system becomes a runtime resource, not a compile-time prerequisite.** Screen elements, surfaces, and locator ladders are available to the agent at execution time to accelerate DOM interpretation. If they exist, they constrain and speed up the search. If they don't, the agent works from the DOM directly — less reliably, but still functional.

3. **The agent creates the interpretation layer at runtime.** Given the instruction "Enter policy number in search field" and the live DOM, the agent finds the element. When knowledge artifacts exist (locator ladders, element signatures), they serve as strong priors. When they don't, degraded resolution is the signal for authoring new knowledge.

4. **Supplemental artifacts become agent output, not agent input prerequisite.** When an agent successfully resolves a novel instruction, it proposes a hint/pattern/element signature as a result of execution, not as a precondition for compilation.

5. **The compiler becomes thinner.** It handles: schema validation, governance, provenance, capability derivation, code generation from bound programs, and review surface emission. It no longer needs to be a text parser.

## What stays

- The knowledge schema and all canonical artifact types remain unchanged.
- Locator ladders, posture contracts, and capability derivation remain deterministic.
- The governance model (approved / review-required / blocked) remains unchanged.
- The provenance graph and review surface contract remain unchanged.
- The trust policy boundary remains unchanged.
- Evidence-based proposals remain the mechanism for growing knowledge.

## What changes

- `lib/domain/inference.ts` — the alias-matching inference pipeline shrinks or is replaced. Steps can be emitted as `intent-only` (carrying prose but no pre-resolved screen/element) without being treated as failures.
- `lib/domain/binding.ts` — binding validates resolved programs but no longer requires compile-time alias resolution as a precondition.
- `lib/application/parse.ts` — parsing preserves ADO intent without forcing resolution.
- Scenario IR gains a step confidence level that distinguishes "not yet interpreted" from "interpretation failed."
- The runtime interpreter gains responsibility for intent → DOM resolution, consulting knowledge artifacts as available priors.
- A new proposal pathway lets the runtime emit supplemental knowledge from successful executions.

## What this does not change

- The knowledge system is still the durable asset. The agent's job is to grow it.
- The governance model still gates canonical changes through review.
- The generated specs, traces, and review surfaces still explain every step.
- The compiler core still produces deterministic output from deterministic input — it just stops pretending that alias-matching over prose is deterministic input.

## Risks

- **Loss of offline explainability.** Today a QA can inspect a review artifact without running any tests. If interpretation moves to runtime, the review surface reflects what the agent *did*, not what the compiler *predicted*. Mitigation: the review surface already includes provenance and can capture runtime interpretations just as well.
- **Non-deterministic test programs.** Different agent runs might interpret the same step differently. Mitigation: once an interpretation succeeds and is approved, it becomes knowledge — the system ratchets toward determinism through execution, not through pre-authored aliases.
- **Larger runtime surface.** The runtime interpreter becomes more complex. Mitigation: the runtime is already 5,900+ lines (vs ~560 lines for the parsing pipeline). The complexity exists; it just moves from pre-compilation to execution where it can be grounded in the actual DOM.

## Success criteria

- Novel ADO test cases produce executable (if degraded) runs without requiring alias authoring first.
- The knowledge system grows from agent execution, not from human synonym curation.
- The deterministic core (schema, governance, provenance, codegen) remains testable and reproducible.
- The review surface explains runtime interpretation with the same fidelity it currently explains compile-time inference.
- The alias treadmill is broken: coverage scales with execution, not with vocabulary curation.

## Relation to existing backlog

This subsumes or reframes:
- **Item 2 (Inference coverage expansion)** — coverage expands through runtime interpretation, not broader alias matching.
- **Item 6 (Local supplement proposal workflow)** — supplements are proposed by the agent after execution, not authored in advance.
- **Item 7 (Pattern promotion workflow)** — promotion is based on repeated successful runtime interpretation, not manual observation.

This does not affect:
- **Item 1 (Real ADO adapter)** — unchanged.
- **Items 3, 4, 5** — graph, locator degradation, and posture expansion remain deterministic concerns.
- **Items 10–12** — offline optimization lane is unaffected.
- **Items 13–17** — infrastructure consolidation items are unaffected.
