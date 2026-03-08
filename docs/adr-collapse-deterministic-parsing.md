# ADR: Collapse the Deterministic Parsing Edge

Status: proposed

## Context

The current inference pipeline (`lib/domain/inference.ts`) treats ADO step text as a source language that must be deterministically parsed into structured IR before execution. It does this through substring-matching step prose against hand-curated alias vocabularies in screen hints, element signatures, and shared patterns.

This design assumes that the text of manual test cases contains enough well-formed structure to deterministically lower into a contractual interface. In practice, manual tests are written for human testers who interpret them agentically and lossily — the same way an LLM agent would. They were never designed to be a parseable grammar.

The consequence is a growing **alias treadmill**: every novel phrasing, synonym, or ambiguous reference in an ADO case requires a new canonical knowledge edit (hint alias, pattern alias, screen alias) before the compiler can produce anything other than `unbound`. This scales linearly with phrasing diversity and inverts the VISION.md promise that "the 50th test costs less than the 1st."

## The deeper problem

The alias treadmill is a symptom. The real problem is a misplaced abstraction boundary.

Traditional Playwright and Cypress tests scatter three kinds of knowledge across every spec file:

1. **Selectors** — how to find a DOM node
2. **Data** — what values to enter or assert
3. **Intent** — what the test is trying to verify

When fifty tests reference the same search field, the selector appears fifty times. When the DOM changes, fifty tests break. The page-object model improves this by centralizing selectors behind a class, but it still localizes data and intent near each test, and the class itself is hand-authored without structural knowledge of the application.

Tesseract's knowledge layer solves this at the right level: element signatures centralize selectors, posture contracts centralize data dispositions, surface graphs centralize structural assertions. **The knowledge layer is an API surface for test authorship.** A selector change in one element signature ripples through every scenario that references that element — not because the tests were refactored, but because the compiler derives them from that single source of truth.

But the current parsing pipeline undermines this value. It forces a compile-time alias resolution step that sits between the knowledge layer and the scenarios, requiring a second kind of curation (phrase-to-concept dictionaries) that scales poorly and adds no durable structural value. The alias layer is not knowledge about the application; it is knowledge about how humans phrase instructions. That phrasing interpretation is exactly what an agent does well at runtime when grounded in the live DOM and the knowledge layer.

## What the knowledge layer should be

The knowledge layer is not a compile-time prerequisite. It is a **persistent, queryable API surface** that any agent session can consult before, during, and after execution.

Think of it this way:

- **Screen elements** are the nouns. They describe what interactive things exist, where they are, and how to find them.
- **Surfaces** are the spatial grammar. They describe how elements are grouped, nested, and related.
- **Postures** are the behavioral grammar. They describe what states elements can be in and what effects those states produce.
- **Hints** are the disambiguation layer. They map local phrasing to known concepts.
- **Patterns** are the promoted abstractions. They capture cross-screen regularities that have proven durable.
- **Snapshots** are the structural assertions. They capture what the DOM should look like in a known state.

When an agent encounters an instruction like "Enter policy number in search field," it should be able to:

1. **Read the knowledge layer first** — find the screen, find the element, find the posture, find the locator. This is cheap: token-efficient reads against approved artifacts with no DOM interaction.
2. **Fall back to live exploration only when knowledge is incomplete** — use Playwright MCP or direct DOM queries to resolve what the knowledge layer cannot. This is expensive but self-correcting.
3. **Propose knowledge additions from successful exploration** — when live resolution succeeds, the result flows back as a reviewable canonical proposal (new hint, new element signature, new surface entry).

This is the flywheel: every agent session either confirms the existing knowledge or improves it. The 50th test costs less because the first 49 built the API surface that the 50th can query.

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

### Seams that must remain deterministic

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

3. **The agent explores local-first.** Before touching the DOM, the agent reads the knowledge layer: screen elements, surface graphs, hints, postures, snapshots. This is the token-efficient path. The knowledge layer is a queryable persistent memory that makes the agent's first move cheap and grounded. Only when the knowledge layer is silent or stale does the agent reach for live Playwright MCP to gather additional context.

4. **The agent creates the interpretation layer at runtime.** Given the instruction "Enter policy number in search field" and the live DOM, the agent finds the element. When knowledge artifacts exist (locator ladders, element signatures), they serve as strong priors. When they don't, degraded resolution is the signal for authoring new knowledge.

5. **Supplemental artifacts become agent output, not agent input prerequisite.** When an agent successfully resolves a novel instruction, it proposes a hint/pattern/element signature as a result of execution, not as a precondition for compilation. The agent is not just consuming the knowledge layer — it is the primary author of it.

6. **The compiler becomes thinner.** It handles: schema validation, governance, provenance, capability derivation, code generation from bound programs, and review surface emission. It no longer needs to be a text parser.

## The agentic responsibility model

This ADR does not just move parsing to runtime. It establishes a model where the agent is responsible for the quality of its own working environment.

### Self-assessment as a first-class activity

The agent should notice where and how well the codebase interacts with the knowledge layer. After authoring or executing a test, the agent should be able to assess:

- **How easily was I able to resolve this step?** If the knowledge layer had the element, the locator, and the posture — resolution was cheap. If it didn't, the agent had to explore, and the cost was higher.
- **How legible was the knowledge to my benefit?** Were the hints sufficient? Were the surface boundaries well-drawn? Did the posture contract cover the case? Were the snapshot templates aligned with what I observed?
- **What would make the next session cheaper?** What hint, pattern, element, or surface entry would have saved the exploration I just performed?

This self-assessment is not a meta-cognitive exercise. It is a measurable signal: the number of live DOM queries per step, the number of unresolved references, the number of novel proposals generated, the token cost of resolution. These signals flow into the same review and trace surfaces that already exist.

### Persistent memory as an API surface

The knowledge layer is more than a data store. It is an API surface that the agent calls. The quality of that API — its coverage, its specificity, its accuracy — directly determines the token cost and reliability of every future agent session.

This is the same principle as good programming fundamentals applied to agentic work:

- **One selector change fixes fifty tests** because the locator lives in the element signature, not in fifty spec files.
- **One posture contract serves every negative scenario** because the behavioral partition is modeled once and referenced everywhere.
- **One surface graph tells the agent where to look** before it ever opens a browser.

The difference from traditional page-object models is that this layer is **inspectable, reviewable, and self-improving**. When the agent proposes a new screen hint, you can see exactly which test steps it unblocks, which alias it matched, and whether it conflicts with existing patterns — before it ever executes.

### Codebase as a signal to future agents

The codebase itself is a communication surface for future agentic partners. Its structure, naming, documentation, and conventions are not just for human readability — they are teleological signals that guide agent behavior.

When an agent opens this repository, it should encounter:

- **Domain primitives that make the ontology transparent.** `ScreenId`, `ElementId`, `PostureId`, `SurfaceId` — these are not implementation details, they are the vocabulary of the domain. An agent that reads these types understands what the system cares about.
- **File paths that encode the knowledge hierarchy.** `knowledge/screens/policy-search.hints.yaml` tells the agent exactly what this file is, what screen it belongs to, and what kind of knowledge it contains — without reading a single line of content.
- **Review artifacts that explain every decision.** The trace JSON, the review Markdown, and the graph tell the agent what was derived, what was assumed, what needs review, and what is still missing.
- **Working directives that align agent behavior to goals.** CLAUDE.md, VISION.md, the authoring guide, and this ADR are not just documentation. They are durable instructions that shape how future agents interact with the system, what they prioritize, and how they measure success.

The agent should be inspired by the codebase to persist good practices — not because it was told to, but because the structure of the codebase makes good practices the natural path. This is the design goal: **align the substrate so that the teleologically valuable action is also the easiest action.**

### The knowledge flywheel

The complete model is:

1. **Agent reads knowledge layer** — cheap, token-efficient, local-first
2. **Agent executes with knowledge as priors** — constrained, grounded, faster
3. **Agent encounters gaps** — knowledge is incomplete or stale
4. **Agent explores live DOM** — expensive but self-correcting
5. **Agent proposes knowledge additions** — new hint, new element, new pattern
6. **Review gates the proposal** — governance ensures quality
7. **Knowledge layer improves** — next session is cheaper
8. **Agent assesses its own experience** — measures legibility, cost, coverage
9. **Agent proposes codebase improvements** — adjusts its own working directives, knowledge structure, or business logic
10. **The 50th test costs less than the 1st** — the flywheel compounds

This is the ratchet. Every agent session either confirms the existing scaffolding or improves it. The system converges toward a state where most steps resolve from persistent memory and only genuinely novel situations require live exploration.

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
- The review surface captures runtime interpretation provenance with the same fidelity it currently captures compile-time inference provenance.

## What this does not change

- The knowledge system is still the durable asset. The agent's job is to grow it.
- The governance model still gates canonical changes through review.
- The generated specs, traces, and review surfaces still explain every step.
- The compiler core still produces deterministic output from deterministic input — it just stops pretending that alias-matching over prose is deterministic input.

## Risks

- **Loss of offline explainability.** Today a QA can inspect a review artifact without running any tests. If interpretation moves to runtime, the review surface reflects what the agent *did*, not what the compiler *predicted*. Mitigation: the review surface already includes provenance and can capture runtime interpretations just as well. Once an interpretation is approved, it becomes compile-time knowledge for all subsequent runs.
- **Non-deterministic test programs.** Different agent runs might interpret the same step differently. Mitigation: once an interpretation succeeds and is approved, it becomes knowledge — the system ratchets toward determinism through execution, not through pre-authored aliases. Non-determinism is temporary; knowledge accumulation is permanent.
- **Larger runtime surface.** The runtime interpreter becomes more complex. Mitigation: the runtime is already 5,900+ lines (vs ~560 lines for the parsing pipeline). The complexity exists; it just moves from pre-compilation to execution where it can be grounded in the actual DOM.
- **Agent quality variance.** Different agents or models may produce different quality interpretations. Mitigation: the knowledge layer acts as a strong prior that constrains interpretation. As it grows, the space for agent variance shrinks. The review surface captures what the agent decided and why, so variance is visible and correctable.

## Success criteria

- Novel ADO test cases produce executable (if degraded) runs without requiring alias authoring first.
- The knowledge system grows from agent execution, not from human synonym curation.
- The deterministic core (schema, governance, provenance, codegen) remains testable and reproducible.
- The review surface explains runtime interpretation with the same fidelity it currently explains compile-time inference.
- The alias treadmill is broken: coverage scales with execution, not with vocabulary curation.
- Agent sessions become measurably cheaper over time as the knowledge layer matures.
- The codebase structure itself communicates the domain ontology transparently enough that a new agent session can orient without repo lore.

## Relation to existing backlog

This subsumes or reframes:
- **Item 2 (Inference coverage expansion)** — coverage expands through runtime interpretation, not broader alias matching.
- **Item 6 (Local supplement proposal workflow)** — supplements are proposed by the agent after execution, not authored in advance.
- **Item 7 (Pattern promotion workflow)** — promotion is based on repeated successful runtime interpretation, not manual observation.

This reinforces:
- **Item 8 (Selector hardening loop)** — the agent uses locator ladders as priors and proposes repairs from runtime evidence, exactly the flywheel described here.
- **Item 9 (Review inbox quality)** — runtime interpretation provenance flows into the same review surface.
- **Item 17 (Proposal bundle generation)** — runtime proposals need the same typed bundle format.

This does not affect:
- **Item 1 (Real ADO adapter)** — unchanged.
- **Items 3, 4, 5** — graph, locator degradation, and posture expansion remain deterministic concerns.
- **Items 10–12** — offline optimization lane is unaffected.
- **Items 13–17** — infrastructure consolidation items are unaffected.

## Relation to domain ontology

See [docs/domain-ontology.md](domain-ontology.md) for the complete North Star reference of domain primitives, invariants, architecture seams, and the commitments that this ADR preserves and extends.
