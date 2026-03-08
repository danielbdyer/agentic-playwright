# Tesseract Backlog

## Current framing

The work is intentionally split into three lanes:

1. deterministic compiler core
2. agentic supplement and review loop
3. offline optimization and evaluation

The first lane ships trust. The second lane grows coverage. The third lane tunes the interface without contaminating the compiler core.

## Deterministic compiler lane

### 1. Real Azure DevOps adapter behind `AdoSource`

Goal:

- keep the local fixture adapter for development and tests
- add the live ADO adapter as a replaceable infrastructure port

Success criteria:

- `sync` can pull real test cases deterministically
- local tests still run without network access
- snapshot content hashes remain stable across adapters

### 2. Inference coverage expansion

Goal:

- increase the proportion of `compiler-derived` bound steps without adding prompt-only behavior

Success criteria:

- broader action phrase coverage
- more deterministic screen and element disambiguation
- stable precedence laws for hints, patterns, and heuristics
- explicit unbound diagnostics when coverage runs out

### 3. Richer graph and trace projection

Goal:

- keep graph, trace JSON, and review Markdown aligned as provenance surfaces

Success criteria:

- step -> knowledge edges
- step -> hint and pattern edges
- emitted trace/review artifact nodes
- policy and evidence linkage for canonical proposals

### 4. Locator degradation surfacing

Goal:

- turn fallback-locator success into visible system signal

Success criteria:

- ladder resolution remains deterministic
- degraded locator use appears in execution outcomes
- review and graph surfaces can point to brittle-green scenarios
- future evidence capture can build on the same signal without redesign

### 5. Negative posture expansion

Goal:

- extend posture coverage from happy-path defaults into reusable negative verification

Success criteria:

- required data-bearing fields have meaningful invalid and empty partitions
- effect chains remain flat, scoped, and reviewable
- generated negative suites can reuse posture knowledge rather than handwritten assertions

## Agentic supplement and review lane

### 6. Local supplement proposal workflow

Goal:

- make screen hints the default first stop for inference gaps

Success criteria:

- proposal templates for aliases, default value refs, snapshot aliases, and affordances
- evidence written before canonical change proposals
- review surface clearly marks which deterministic steps depended on local hints

### 7. Pattern promotion workflow

Goal:

- promote repeated local supplements into shared patterns deliberately, not accidentally

Success criteria:

- provenance links from promoted patterns back to source screens and evidence
- promotion criteria documented and testable
- graph exposes which scenarios now depend on promoted patterns

### 8. Selector hardening loop

Goal:

- let agents repair a broken selector once and confirm the fix across impacted scenarios

Success criteria:

- selective re-snapshot of affected sections
- ladder repair proposal with before/after evidence
- impact query drives targeted rerun set
- canonical update remains review-gated

### 9. Review inbox quality

Goal:

- make `.review.md` the primary QA and agent collaboration surface for one scenario

Success criteria:

- every step explains ADO text, normalized intent, program, provenance kind, governance state, and unresolved gaps
- review output stays aligned with trace JSON and generated spec
- bottlenecks are visible without reading runtime code

## Offline optimization and evaluation lane

### 10. DSPy / GEPA proposal-evaluation track

Guardrails:

- outside the deterministic compiler path
- no direct canonical mutation
- must operate over stored trace and evidence corpora

Potential targets:

- phrase-to-element suggestion ranking
- locator repair ranking
- supplement proposal ranking
- benchmark-driven prompt tuning for bounded agent tasks

### 11. Synthetic benchmark harness

Goal:

- stress the inference and supplement model with seeded, reproducible UI surfaces

Success criteria:

- deterministic replayable benchmark pages or artifact sets
- measurable bind accuracy and artifact churn
- repeatable comparisons between prompt, heuristic, and proposal strategies

### 12. Bottleneck analytics

Goal:

- quantify where the system is still spending human review or agent proposal effort

Success criteria:

- counts of compiler-derived vs hint-backed vs pattern-backed vs unbound steps
- common missing-knowledge classes
- proposal acceptance and churn metrics over time

## Added after scaling review

### 13. Projection framework consolidation

Lane:

- deterministic compiler core

Goal:

- make every derived artifact builder conform to one projection contract instead of duplicating cache, manifest, and rewrite logic per module

Success criteria:

- shared projection runner for scenario emit, graph, types, and future review surfaces
- projection manifests include compiler/projection revision so code changes invalidate stale caches deterministically
- changed-input and rewritten-output reporting stays structurally aligned across projections
- adding a new projection requires modeling inputs and outputs, not copy-pasting cache code

### 14. Targeted incremental compile planner

Lane:

- deterministic compiler core

Goal:

- move from "rebuild everything after each refresh" toward impact-aware projection planning over the workspace session and graph

Success criteria:

- compile path can determine which projections are affected by a changed snapshot, scenario, hint, pattern, or element signature
- scenario-local work can stop short of unrelated graph or type rewrites when safe
- graph impact queries and projection invalidation use the same provenance model
- performance wins remain explainable and testable, not heuristic lore

### 15. Hermetic runtime environment injection

Lane:

- deterministic compiler core

Goal:

- replace global loader configuration with explicit runtime environments so generated specs and interpreters are parallel-safe, composable, and easier to fuzz

Success criteria:

- `runStepProgram` and generated specs receive screen and snapshot loaders explicitly
- fixture setup no longer mutates process-global runtime state
- multiple harnesses can execute in one process without hidden cross-talk
- runtime tests can instantiate isolated environments without repo-root side effects

### 16. Domain schema and graph package decomposition

Lane:

- deterministic compiler core

Goal:

- finish splitting monolithic domain files into cohesive packages around scenario schema, approved knowledge schema, graph derivation, and trust policy

Success criteria:

- `types.ts`, `validation.ts`, and `derived-graph.ts` no longer act as catch-all modules
- each package has law-style tests around determinism, normalization, and round-trips
- public barrels are stable while internal modules stay small and navigable
- future contributors can change one semantic area without opening a thousand-line file

### 17. Proposal bundle generation for review-required knowledge

Lane:

- agentic supplement and review loop

Goal:

- emit machine-readable proposal bundles alongside `.review.md` so agents and humans can collaborate over concrete canonical changes instead of prose-only diagnosis

Success criteria:

- review-required steps can produce typed proposal payloads for hints, patterns, locator repairs, and snapshot updates
- proposal bundles include evidence references, impacted scenarios, trust-policy evaluation, and suggested canonical patch targets
- QA can review the proposal artifact without reading runtime internals
- future agent workflows can consume the same bundle format for ranking, batching, and promotion

## Proposed architectural changes

### 18. Collapse deterministic parsing edge

Lane:

- cross-cutting (compiler core + agentic supplement loop)

Goal:

- stop treating ADO step text as a parseable grammar and move intent interpretation to the runtime agent, where it can be grounded in the live DOM

Motivation:

- the current inference layer (`lib/domain/inference.ts`) uses substring alias matching to pre-resolve step text at compile time
- every novel phrasing requires a canonical knowledge edit (hint alias, pattern alias) before the step can bind
- this scales linearly with phrasing diversity and inverts the promise that "the 50th test costs less than the 1st"
- manual test prose was written for human testers who interpret agentically and lossily — it will never be a well-formed contractual interface

Key principle:

- identify which seams must be deterministic (schema, locators, postures, governance, provenance, codegen) and which should not be (prose interpretation, screen identification from DOM, element resolution from instruction + DOM)
- the knowledge system remains the durable asset but becomes a runtime resource rather than a compile-time prerequisite
- coverage should scale with agent execution, not with vocabulary curation

Full proposal: [docs/adr-collapse-deterministic-parsing.md](docs/adr-collapse-deterministic-parsing.md)

Success criteria:

- novel ADO test cases produce executable (if degraded) runs without requiring alias authoring first
- the knowledge system grows from agent execution, not from human synonym curation
- the deterministic core (schema, governance, provenance, codegen) remains testable and reproducible
- the review surface explains runtime interpretation with the same fidelity it currently explains compile-time inference

## Done in this slice

- deterministic auto-approval for `compiler-derived` steps
- separate `governance` state on bound steps
- screen-local hints and promoted pattern artifacts
- emitted `.spec.ts`, `.trace.json`, and `.review.md` outputs
- graph nodes for hints, patterns, trace, review, evidence, and policy decisions
- runtime affordance plumbing and degraded locator outcome signal
