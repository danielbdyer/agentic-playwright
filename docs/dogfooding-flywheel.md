# Tesseract Dogfooding Flywheel

> Active design — dogfood loop specification

This document describes the long-horizon operating model for using Tesseract on itself: expose the system to new contexts, observe where it slows down or fails, harden the knowledge layer, and keep the entire loop legible enough for an agent and a human reviewer to reason about.

Use this document for the operating model. Use `VISION.md` for product intent and `BACKLOG.md` for execution order.

## North-star scenario

The target state is not "one demo slice works." The target state is:

- Tesseract is pointed at a brand-new site plus a brand-new Azure DevOps manual suite of roughly 1000 tests.
- It ingests the incoming context quickly enough to build useful structure instead of drowning in novelty.
- It captures ARIA structure first, bootstraps screen knowledge, generates scenarios, tests, and fixtures, and prioritizes a valuable runnable slice.
- It loops toward passing outcomes by turning failures into evidence-backed hardening proposals.
- It emits a legible report of what took the most time, tokens, retries, and churn so the codebase can improve where it is weakest.

The point of dogfooding is not only to produce tests. It is to measure Tesseract's ability to become effective in unfamiliar informational substrates while keeping its decisions inspectable.

## Legibility contract

The dogfooding loop only counts if the agent surface remains reviewable. Three layers must stay explicit:

- The codebase layer must continue to revolve around canonical nouns such as snapshots, scenarios, surfaces, elements, postures, evidence, policy decisions, and graph projections.
- The agent layer must stay command-first and artifact-first. An agent should be able to inspect a context through known artifacts and CLI surfaces rather than hidden repo lore.
- The evaluation layer must write reviewable outputs instead of hidden dashboards or prompt folklore. Every score, ranking, or proposal should be backed by files, evidence, and provenance.

This is also the boundary for DSPy, GEPA, or similar tooling. They may help generate proposals, rankings, or offline evaluations, but they must remain outside the deterministic compiler path and produce reviewable evidence before any canonical knowledge changes.

## Flywheel stages

### 1. Context intake

New contexts enter the system as a site plus a test suite, not as a pile of ad hoc prompts. The intake step should normalize enough information to start deterministic work.

Current anchors:

- `.ado-sync/` snapshots
- `scenarios/`
- `knowledge/`
- `.tesseract/policy/`
- `.tesseract/evidence/`

Planned output:

- A proposed `Context Pack` that identifies the imported site, suite, seed routes, fixture hints, trust-policy inputs, and provenance needed for reproducible runs.

### 2. ARIA-first capture

Tesseract should learn new contexts through accessible structure before resorting to brittle DOM trivia. Whole-page and section-level ARIA capture should feed surface decomposition, snapshot templates, and early binding hints.

Current anchors:

- `knowledge/surfaces/`
- `knowledge/snapshots/`
- `npm run capture`
- `npm run surface`

### 3. Suite slicing and prioritization

A large imported suite should not be treated as an undifferentiated queue. Tesseract should quickly identify a `Suite Slice`: a prioritized subset of scenarios that maximizes runnable coverage, business leverage, and learning value.

Current anchors:

- scenario YAML in `scenarios/`
- `npm run trace`
- `npm run impact`
- generated trace and review artifacts

Planned output:

- Slice selection that explains why particular scenarios run first, what knowledge they share, and what later slices depend on them.

### 4. Deterministic generation

Once a slice is selected, the compiler path stays deterministic: sync, parse, bind, emit, graph, types. Novelty should be isolated to approved artifacts and reviewable proposals, not smuggled into generated code.

Current anchors:

- `.tesseract/bound/`
- `generated/`
- `.tesseract/graph/`
- `lib/generated/`

### 5. Failure-driven hardening

When runtime or structural failures appear, the system should convert them into explicit hardening work rather than scattered manual repair.

Examples:

- selector ladder hardening
- surface decomposition fixes
- snapshot template updates
- pattern contract proposals
- fixture or posture enrichment

Current anchors:

- evidence records under `.tesseract/evidence/`
- generated review and trace artifacts
- trust-policy evaluation
- graph nodes for evidence and policy decisions

### 6. Trust-policy gating

Agents may propose freely. Promotion remains evidence-governed. The trust policy decides whether a proposed change is allowed, review-required, or blocked, and that decision should remain legible inside the graph and surrounding evidence artifacts.

Current anchors:

- `.tesseract/policy/trust-policy.yaml`
- policy-decision graph nodes
- evidence sufficiency and confidence thresholds

### 7. Meta-level measurement

The outer loop is the actual dogfooding value. Each exposure to a new context should tell us where Tesseract is slow, blind, expensive, or unstable.

Planned output:

- A `Dogfood Run` ledger for each benchmark execution
- A `Benchmark Scorecard` that compares runs across contexts, slices, and drift events
- Bottleneck views that show where time, tokens, retries, and change churn accumulate

## Proposed operating vocabulary

The terms below are proposed operating-model vocabulary. They are intentionally not code APIs yet.

| Term | Meaning | Current artifact anchors | Status |
|------|---------|--------------------------|--------|
| `Context Pack` | Reviewable bundle describing one imported site and test-suite context | `.ado-sync/`, `scenarios/`, `knowledge/`, `.tesseract/policy/`, `.tesseract/evidence/` | Proposed composite artifact |
| `Dogfood Run` | One end-to-end exposure of Tesseract to a context over a bounded run | generated trace/review files, evidence records, graph outputs, Playwright results | Proposed report envelope |
| `Suite Slice` | Prioritized subset of a larger imported suite chosen to maximize runnable progress and learning | scenario YAML, `trace`, `impact`, generated review/trace artifacts | Proposed prioritization unit |
| `Hardening Proposal` | Evidence-backed proposal to change selectors, surfaces, patterns, snapshots, fixtures, or postures | evidence records, knowledge files, policy decisions, graph edges | Partially present today |
| `Benchmark Scorecard` | Legible report of benchmark outcomes and costs for one run or lane | graph outputs, evidence records, generated review/trace artifacts | Proposed score surface |
| `Drift Event` | Deliberate or observed change in the site or suite used to measure resilience over time | updated captures, evidence records, changed graph fingerprints, changed knowledge artifacts | Proposed benchmark concept |

## Benchmark lanes

The dogfooding flywheel should draw from three benchmark lanes so the system does not overfit to one shape of novelty.

### Real imported sites and suites

This is the highest-value lane. A new site plus a real ADO suite tests whether the system can intake unfamiliar context, prioritize slices sensibly, and harden itself against authentic volatility.

### Seeded synthetic accessibility surfaces

This lane stress-tests decomposition and binding against deterministic, replayable forms, tables, validation regions, and ambiguous accessibility trees. It is the fastest way to expose ontology gaps and decomposition instability.

### Synthetic React app composer with salted drift

This is a future benchmark harness, not a core product dependency. The purpose is to compose discoverable application contexts on demand, then inject replayable change over time so Tesseract can be measured against controlled `Drift Events`.

Examples of salted drift:

- accessible-name changes
- layout changes without semantic changes
- widget swaps that preserve user intent
- validation-flow changes
- result-grid shape changes

## Benchmark scorecards

Every benchmark lane should eventually report the same categories so runs remain comparable.

- Intake latency: time from raw context arrival to the first usable bound slice
- Bind coverage: percentage of steps and scenarios bound without unresolved semantic gaps
- Runnable-slice yield: how much of a large suite becomes executable after prioritization
- Pass rate: green scenarios per slice and per full run
- Failure-class mix: runtime-domain, semantic-gap, structural-mismatch, assertion-mismatch, and related classes
- Repair loops per green scenario: how many hardening attempts are needed before a slice stabilizes
- Knowledge and pattern churn: how often approved artifacts change and where churn concentrates
- Evidence sufficiency: how often proposals meet trust-policy thresholds without manual patching
- Time and token cost: elapsed time, agent effort, and token usage or estimates by stage where available

The scorecard must remain reviewable. If a metric cannot be explained through files, evidence, provenance, or graph edges, it is under-modeled.

## Roadmap implications

This operating model implies a roadmap beyond the current vertical slice:

- benchmark corpus and context-pack intake
- prioritized large-suite slice runner
- dogfood run ledger and benchmark scorecards
- synthetic React app composer with drift salting
- agent-economics and churn telemetry

Existing backlog items on decomposition, synthetic DOM fuzzing, DSPy and GEPA evaluation, locator hardening, pattern contracts, selector repair, and traceability are part of this same flywheel rather than separate side quests.

See `BACKLOG.md` for execution order.
