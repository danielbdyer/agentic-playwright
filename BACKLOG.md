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

## Done in this slice

- deterministic auto-approval for `compiler-derived` steps
- separate `governance` state on bound steps
- screen-local hints and promoted pattern artifacts
- emitted `.spec.ts`, `.trace.json`, and `.review.md` outputs
- graph nodes for hints, patterns, trace, review, evidence, and policy decisions
- runtime affordance plumbing and degraded locator outcome signal
