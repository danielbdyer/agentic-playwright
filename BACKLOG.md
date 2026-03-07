# Tesseract Backlog

## Active product backlog

### 1. Agent-first ARIA surface decomposition

Build a first-class pipeline that can ingest a whole-page ARIA snapshot, segment it into semantically meaningful testing surfaces, and persist those as descendant trees that map cleanly onto screen sections and element groups.

Success criteria:
- Start from one full-page ARIA capture.
- Deterministically partition it into interactable, assertion-oriented, and structural surface groups.
- Preserve provenance from page snapshot -> section tree -> generated knowledge artifacts.
- Keep the partitioning output machine-readable and reviewable.

### 2. Strongly typed agent-facing screen APIs

Generate or maintain strictly typed TypeScript APIs that mirror the approved knowledge layer so an agent gets immediate compiler feedback when it references invalid screens, elements, postures, or snapshot templates.

Success criteria:
- Screen ids, element ids, posture ids, and fixture ids become typed exports or generated types.
- Generated specs and agent-authored helpers fail at compile time when they drift from canonical knowledge.
- Type generation remains downstream of approved YAML, not a second source of truth.

### 3. DOM fuzzing and decomposition benchmarks

Create a synthetic DOM and accessibility-surface fuzzing harness that can generate randomized but semantically valid forms, tables, validation states, and grouped workflows to stress test Tesseract's decomposition and binding strategy.

Success criteria:
- Produce seeded synthetic pages with deterministic replay.
- Cover positive, negative, nested, and ambiguous accessibility trees.
- Measure bind accuracy, decomposition stability, and artifact churn under repeated randomized runs.
- Store benchmark results as reproducible reports rather than ad hoc observations.

### 4. Policy extraction from agentic DOM praxis

Make the implicit policy we are learning from the DOM explicit: which ARIA patterns imply sections, how interactables should be grouped, what should be treated as a posture boundary, and how assertion surfaces differ from interaction surfaces.

Success criteria:
- Write policy as versioned rules or contracts, not prompt lore.
- Keep rules inspectable and testable against captured or synthetic ARIA trees.
- Separate deterministic policy from any learned or optimized heuristics.

### 5. DSPy and GEPA evaluation track

Evaluate whether DSPy, GEPA, or similar optimization layers belong in the offline suggestion and evaluation loop for decomposition quality, locator repair quality, or proposal ranking.

Guardrails:
- Keep these tools outside the deterministic compiler path.
- Use them only for proposal generation, scoring, or benchmark optimization.
- Require evidence artifacts and human review before any canonical knowledge changes.

Potential evaluation targets:
- Section-boundary proposal quality.
- Element signature suggestion quality.
- Posture proposal ranking.
- Benchmark-driven improvement of decomposition heuristics.

### 6. QA readability: intent-labeled step functions in generated specs

Surface the semantic intent string from each scenario step as a visible `test.step()` label in the generated Playwright spec, so QAs can read the spec top to bottom and confirm 1:1 correspondence with the ADO test case without cross-referencing YAML.

Success criteria:
- Each generated step wraps its actions in `test.step('Navigate to Policy Search screen', ...)`.
- The intent string comes from the scenario YAML `intent` field, which originates from the ADO test case.
- QA review reduces to comparing ADO step text against spec step labels.

### 7. Locator strategy and fallback ladders

Extend element definitions to support an ordered locator strategy (testId → role+name → CSS) rather than flat fields. The runtime tries locators in ladder order. When an agent hardens a selector, it proposes an updated strategy and optionally retains the previous selector as a fallback rung.

Success criteria:
- Element YAML supports a `locatorStrategy` field with ordered entries.
- Runtime `locate.ts` tries the ladder in order and records which rung succeeded.
- Evidence records capture locator rung used, feeding confidence scoring.
- Backward compatible: existing flat `testId`/`role`/`name` fields desugar to a default ladder.

### 8. Pattern contracts for persistent escape-hatch overrides

Design a `knowledge/patterns/` schema where agent-discovered interaction patterns (combobox selection, date picker navigation, multi-step modals) are encoded as reusable pattern contracts. The compiler binds against pattern contracts instead of emitting custom escape hatches.

Success criteria:
- Pattern contract YAML defines interaction mechanics for a widget type.
- Compiler resolves `custom-escape-hatch` instructions against matching pattern contracts.
- Unresolved escape hatches remain classified as `semantic-gap`; resolved ones become normal capability-driven steps.
- Trust policy governs promotion of agent-proposed patterns.

### 9. Agent-driven selector hardening workflow

Build the end-to-end workflow: agent detects selector failure → re-snapshots affected section → proposes hardened selector with evidence → regenerates affected specs → reruns impacted tests → confirms fix.

Success criteria:
- CLI command (or agent workflow) to trigger selective re-snapshot after failure.
- Proposed element update carries evidence (before/after ARIA snapshots).
- Trust policy evaluates the proposal before promotion.
- Impact analysis identifies all scenarios affected by the changed element.
- Rerun confirms green before the proposal is finalized.

### 10. ADO-to-spec 1:1 traceability surface

Provide a CLI or report view where QAs can see, for any ADO test case ID, the exact mapping: ADO step text → scenario YAML step → generated spec step label → runtime execution result. This closes the loop from authoring to verification.

Success criteria:
- `npm run trace <adoId>` shows the full ADO → scenario → spec → result chain.
- Each link in the chain is navigable (file paths, line numbers).
- Unbound or escape-hatch steps are visibly flagged.
- Output is readable by non-developers (plain text or simple HTML report).

## Notes

- The current milestone remains the deterministic vertical slice plus agent-friendly command surface.
- Any future learned or optimized component must stay outside the compiler core and produce reviewable evidence.
- The product vision centers on QA teams working in ADO and interacting with agents through the CLI. Architectural decisions should be evaluated against whether they make that workflow more transparent, more trustworthy, and more self-healing.
