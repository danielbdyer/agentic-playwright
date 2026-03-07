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

## Notes

- The current milestone remains the deterministic vertical slice plus agent-friendly command surface.
- Any future learned or optimized component must stay outside the compiler core and produce reviewable evidence.
