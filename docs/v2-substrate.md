# v2 Substrate

> Status: v2 planning — the substrate as a set of primitives, invariants, and levels. Read alongside `v2-direction.md` which names the three-folder compartmentalization (`product/` / `workshop/` / `dashboard/`) this substrate lives under.

This document describes what v2 is as a set of primitives, levels, artifacts, and invariants. It is intentionally concise at the primitive level; the `v2-direction.md` and `v2-transmogrification.md` documents name where each primitive lands in the three-folder structure and how v1 compartmentalizes into v2.

Earlier drafts positioned this document as codebase-agnostic and treated v1 as a thing to salvage from after v2 had working code. That framing is retired: v2 is v1 reshaped in place under the three-folder seam, so the primitives described here are already partly implemented in v1. What this document defends is the primitive set — what must be true of the system's spine regardless of which folder a given module lives in.

## 1) The bet, in one paragraph

A QA automation codebase can be built as an API for an agent, such that a single agent — given a backlog of Azure DevOps test cases and tools to reach both the application under test and the backlog — authors tests a professional QA team would call professionally-authored, and does so faster than a human would. The codebase's compounding asset is not its runner, its type system, or its scripts, but a memory of the application under test's semantic facets — roles, states, affordances, outcomes, and the business vocabulary that binds them — that grows from discovery, from operator dialog, and from operator-shared documents. Every increment of the system must ship value against a real customer backlog; nothing is built against hypothetical future scale.

## 2) The five primitives

### 2.1 Agent

The active element. Every meaningful decision in the system is the agent's. The codebase is *for* the agent — its structures, its verbs, its surfaces all exist so that an agent can act competently with them. The agent reads intent, queries memory, reaches into the world through instruments, and produces artifacts. It is expected to remain fluent at all times: at any moment it knows the full set of verbs available to it and uses them correctly without operator coaching. A fresh session reaches fluency quickly because the codebase ships its vocabulary as a first-class manifest (§4).

### 2.2 Intent source

A stream of underspecified desires about how the application should behave. In v0 the channel is Azure DevOps work items. Intent is underspecified by construction — that is why the agent must interpret, not execute. Over time the intent channels broaden: operator chat, shared documents, and inline corrections are all intent, routed into the same interpretation path. The primitive is the concept; the channel is interchangeable.

### 2.3 World

The application under test. In v0, a large OutSystems application that already has a substantial backlog of test cases waiting to be authored. The world is surprising by construction — it evolves, it responds differently to different roles, its affordances emit domain state the DOM cannot always reveal. The world is the thing the tests are *about*; every other primitive exists to model it or interact with it.

### 2.4 Instruments

The tools the agent calls. Each instrument is independently enableable. Adding one is an increment; removing one degrades gracefully. The v0 set: Playwright (to reach the world), Azure DevOps (to reach intent), memory read, memory write, run-a-test, compare-runs, and reasoning (to reach the agent's own cognition). Later instruments: operator dialog capture, document ingestion. Each instrument exposes a named verb. The union of verbs is the codebase's public API — stable, well-named, and versioned.

Reasoning is named as an instrument deliberately. Every "agent interprets," "agent chooses," "agent synthesizes" referenced in the levels below is a call through this instrument, not a property of the agent. The instrument is provider-polymorphic: a hosted LLM (Anthropic, OpenAI), an MCP-brokered model, a VSCode Copilot bridge, or a local model are interchangeable at the adapter boundary. Treating reasoning as an instrument rather than a built-in property keeps the substrate honest — provider choice is configuration, not structure, and no saga is coupled to a specific model family.

### 2.5 Memory — the facet catalog

The compounding asset. Not a page object model: not organized by pages, not rooted in selectors, not hand-authored. A catalog of semantic facets — roles, states, affordances, outcomes, and the business vocabulary that binds them. Each facet entry is self-describing (confidence, last-seen, provenance, sources) and queryable by intent phrase ("the save affordance on the customer-detail screen for a service agent"). At L0 and L1 the binding to the world runs through locators, and locators carry tracked health; DOM-lessness (§5, L3) is a confidence-gated policy that activates when memory is rich enough to author without re-observation, not a property of the memory primitive itself. Provenance is minting-threaded: it is created where a facet is born, travels with it forward, and cannot be added retroactively without losing correctness — the system decides at the moment of minting what any later drift check will be able to see. Memory is the only primitive whose value grows monotonically over time if the system works, and the only primitive whose quality is the direct object of the self-refinement loop.

## 3) Artifacts

The agent produces three kinds of artifact. Primitives are what the system is made of; artifacts are what it emits.

### 3.1 Facet entries

Machine-first structured records. The agent reads and writes them as it authors. Each entry carries its own provenance (what observed it, when, with what confidence, from which instrument), its links to other facets (this affordance belongs to this screen's vocabulary; this role sees these states), and its business-layer naming ("save" not "btn-save-1"; "suspended account" not "state=3"). Facet entries are not test fixtures and not documentation; they are *the domain model of the application as the agent understands it*. They are the only thing the system accrues persistently — everything else is derivable from them plus the world.

### 3.2 Test cases

Human-first artifacts. A professional QA reading a generated test should recognize it as professional work: business-vocabulary step descriptions, readable assertions, sensible sequencing, no leaked selectors in the body. Tests reference facets by the same names a QA analyst would use, and they run. Legibility is judged at least as strictly as passing; an illegible green test is a failure of the system.

Extensibility has a handoff boundary the system must honor. Tests are the *visible* artifact — the surface QA reads, critiques, and trusts — but they are also agent-authored and may be regenerated when memory or intent changes. Durable extensions therefore do not land in the test file; they land in the intent or memory layer, where they survive regeneration. The system makes this split explicit to QA, and regeneration preserves the partition — a QA-authored intent or memory entry is never silently discarded on the agent's next pass. A test that invites edits at the wrong layer is a credibility trap; QA teams do not long tolerate tools that silently discard their work, so the system must not ship one.

### 3.3 Run records

Evidence of execution. Every run produces a record of what the agent did, what the world said back, and which facets were touched. Run records are how drift is detected, how the self-refinement loop reads feedback, and how an operator distinguishes a real bug from memory staleness. They are not the product, but they are load-bearing for L3 and L4.

## 4) Agent fluency as a first-class property

The codebase's single most important ergonomic target is that *the agent is always expert*. Three operational commitments fall out.

**Vocabulary manifests.** The codebase ships a structured description of its verbs (instrument calls, memory operations, test authoring primitives) and its nouns (facet types, artifact kinds) in a form an agent ingests on every session start. The manifest is not "tips for an agent"; it is the API surface, kept in sync with the code by construction rather than by convention. An agent that has read the manifest knows what it can do.

**Verb discipline.** Every agent-facing capability is a named verb with specified inputs, outputs, and error modes. New capability means new verb, or a composition of existing verbs — not expansion of an existing verb's behavior in place, because in-place expansion silently obsoletes agent knowledge. Removed capability earns deprecation, not deletion.

**Fluency checks.** The codebase runs checks — not tests of the application under test, tests of the agent-facing interface — that confirm an agent reaches canonical fluency after reading the manifest. If a change breaks agent fluency, that is a regression at the same severity as breaking a passing product test. Fluency is measured; it does not float.

The downstream effect: operators talk to the agent in natural language, the agent translates into verbs, the verbs are stable and well-named. The operator never has to learn the vocabulary. The agent always has to.

## 5) Level spine

Each level adds one capability delta, ships one falsifiable claim, and is measurable against the real customer backlog. Claims are product-level, not substrate-level. Every level either ships value a customer would adopt or it is not worth building.

### Level 0 — Agent, Playwright, ADO, no memory

**Adds**: the two instruments sufficient to be useful. Playwright to reach the application, Azure DevOps to reach the backlog. The agent reads one work item, observes the application, authors one test.

**Claim shipped**: Given a real ADO work item and the live OutSystems application, the agent authors a QA-legible test faster than a human would, and a professional QA reviewing the test accepts it into the suite.

**Exit measurement**: human-reviewed time-to-green-test per work item, baselined against manual authoring; acceptance rate from the reviewing QA.

**Deliberately absent**: memory. Every test is authored from scratch. That is acceptable at L0; the point is to prove the agent can do the authoring at all, against a real backlog.

### Level 1 — Memory: facet catalog from discovery

**Adds**: a persistent store the agent writes to during discovery and reads from during authoring. Observations become reusable. No new intent or world instruments.

**Claim shipped**: A second test against a previously-seen surface is measurably faster and uses consistent vocabulary across authoring passes. A QA reviewer calls the vocabulary "house style," not "AI idiosyncrasy."

**Exit measurement**: authoring time on a repeat surface vs. the L0 baseline on the same surface; a vocabulary-drift score across tests that touch the same facet.

**Deliberately absent**: operator-supplied knowledge. Memory contains only what the agent could discover on its own by exercising the application.

### Level 2 — Operator dialog and document ingestion

**Adds**: two new instruments writing into the same memory. A dialog instrument captures operator clarifications ("that's called 'suspend', not 'pause'"; "service agents can't see the audit log"). A document instrument ingests shared materials (requirements, style guides, internal wiki exports) and extracts facet candidates for review.

**Claim shipped**: Memory reflects vocabulary and constraints not observable in the DOM, and tests use them. A business analyst reading a generated test recognizes the domain language as their own.

**Exit measurement**: fraction of generated tests whose step language the operator calls vocabulary-accurate; the share of memory sourced from non-DOM inputs.

**Deliberately absent**: DOM-less authoring. Even with dialog and documents enriching memory, the agent still observes the live world before authoring.

### Level 3 — DOM-less authoring on known-enough surfaces

**Adds**: no new instrument; a policy. When memory confidence about a surface exceeds a threshold, the agent authors without fresh DOM observation. If memory proves wrong at runtime, a drift event is raised and the offending facets lose confidence.

**Claim shipped**: For a meaningful fraction of the backlog, new tests are authored without re-observing the application. Authoring throughput grows disproportionately to observation cost.

**Exit measurement**: fraction of tests authored DOM-lessly; drift event rate against those tests; throughput delta vs. L2.

**Deliberately absent**: autonomous memory revision. The agent flags drift; it does not silently patch memory in response.

### Level 4 — Self-refinement

**Adds**: memory becomes an active participant. Run records flow back into the catalog; stale entries age; drift events lower confidence automatically; corroboration raises it. The agent proposes memory revisions between authoring passes, subject to operator oversight appropriate to the customer's governance needs.

**Claim shipped**: Memory quality improves between explicit authoring work. Tests stay green or flag cleanly; false greens and false reds both trend down.

**Exit measurement**: stale-facet decay rate; drift events per authoring pass over time; steady-state authoring throughput vs. L3.

**Deliberately absent**: an operator-less future. Humans remain in the loop. What gets automated is *memory quality*, not authority.

## 6) The anti-scaffolding gate

One decision rule applies to anything proposed for inclusion in the codebase, at any level:

> *Does this make the agent's job easier, at scale, across many ADO items, for a real customer?*

If no, it is cost, and cost needs an explicit justification tied to a specific level's claim. The rule applies to abstractions, configuration surfaces, schema elaborations, optional features, convenience layers, and introspection tools. It applies with particular force to anything that *feels like good architecture* without a named agent-ergonomic payoff — that category is the one most likely to bloat the system under its own momentum.

What the gate does not reject: anything a measured fluency or throughput regression would catch. If a proposal is speculative, the discipline is to defer it to the level whose claim it would help ship, not to build it now against hypothetical scale.

What the gate does reject: parallel abstractions, dual-master designs (serving agent ergonomics and operator introspection through the same mechanism), and "future flexibility" disconnected from a specific shipping claim. Three patterns in particular slip past a gate stated only positively and deserve naming:

- **Unbounded migration scaffolding.** Tooling that retires an old layer or bridges a transition is acceptable only with an explicit exit condition any developer can check locally, kept current over time. Migration scaffolding without a checked exit silts indefinitely.
- **Dual-master mechanisms without a narrow contract.** A surface serving both the agent and operator introspection needs a narrow, read-only contract at the boundary; shared mutable orchestration through a single surface blurs ownership and forces every change to negotiate two constituencies.
- **Contingent schema without a forcing scenario.** Optional fields, variant layers, and branching abstractions require either a real scenario forcing the fork now, or a named level whose shipping claim depends on the fork existing. "It might be useful if we ever need it" is the exact shape the gate exists to reject.

Determinism, typing, and architectural hygiene remain valuable tools in v2. They are not the organizing principle. The organizing principle is agent ergonomics in service of shipping tests a real customer QA team uses.

## 6a) Testable surfaces and the probe IR — the spike protocol

Before the probe IR becomes load-bearing in the construction order (see `v2-direction.md §5` Step 5), a **spike** validates whether manifest-derived probes can exercise real verb surfaces meaningfully. The spike is the discipline that keeps the IR honest; if the spike fails for a verb, that verb needs a hand-lifted schema instead, and the gap is named before any downstream step depends on the IR's authority.

**What a probe is.** A `Probe` is a synthetic work item whose shape derives from a `TestableSurface` — a tuple of `(verb, inputShape, outputShape, errorFamilies, compositionPath)`. `TestableSurface[]` is computed by walking the manifest: every declared verb, every declared facet kind, every declared saga composition. Each `TestableSurface` maps to one or more probes through a per-verb **fixture specification** — a tiny YAML living alongside the verb declaration that says "when this verb is probed, here's a minimal valid input."

**The spike protocol.**

1. Pick three representative verbs across the difficulty spectrum: one simple (`observe`), one composite (`test-compose`), one reactive (`drift-emit` or `facet-query`).
2. Author fixture specifications for each. Aim for ≤ 30 lines of YAML per verb; if a fixture needs more, that's a signal.
3. Have `workshop/` synthesize probes from those fixtures and run them through `product/`'s normal authoring flow.
4. Measure: for each (verb, fixture) pair, did the probe complete? Did it produce a run record of the expected shape? Did the expected outcome assert correctly?
5. Produce a one-page verdict: what fraction of probes derive mechanically; which verbs needed fixture-schema additions; what gaps remain.

**Pass condition.** ≥ 80% of probes derive from fixture + manifest with no hand-tuning; the remaining 20% are named with specific shape gaps that become fixture-schema proposals.

**Fail condition.** > 20% of probes require bespoke handwritten work items, OR the fixture specifications grow past 30 lines for typical verbs, OR the probe set fails to exercise material parts of the verb's error-family surface. In this case, the IR concept stays but the spike's gap list becomes a set of named fixture-schema investments before the IR becomes authoritative.

**Why this matters at the substrate level.** The probe IR is the mechanism by which `workshop/` and `product/` exchange testability without leaking internals. If the IR cannot be validated cheaply against three verbs, the seam is not yet where the design claims it is — and the next steps land on sand. The spike is small by design so the answer arrives fast.

## 7) Measurement stance

`workshop/` measures `product/` by reading `product/`'s manifest, deriving probes from the declared verb × facet-kind × error-family combinations, running those probes through `product/`'s normal authoring flow, and deriving metrics over the run-record log. No parallel apparatus. No hand-authored testbed corpus. No dual mastery between scoreboard and product. The primitives from §2 do not need extension for measurement; the seam does the work.

The substrate does not prescribe specific metrics. Metrics earn their way in through the proposal-gated mechanism everything else uses (§6). The workshop inherits the seven-visitor metric tree that already exists (`extraction-ratio`, `handshake-density`, `rung-distribution`, `intervention-cost`, `compounding-economics`, `memory-worthiness-ratio`, `intervention-marginal-value`) subject to audit (see `v2-substrate.md §8` and the audit table in `v2-direction.md §3.5`); new product-claim metrics (acceptance rate, authoring time, hypothesis confirmation rate) land alongside.

The probe set grows as `product/` declares new verbs. Each new verb carries a fixture specification (a minimal YAML of "when probed, here's valid input") that lets `workshop/` synthesize probes for it automatically. The probe IR replaces the handwritten testbed-version sequence earlier drafts proposed; verisimilitude becomes a coverage metric against the product's declared surface, not a corpus of handwritten scenarios.

Measurement ships with the codebase under `workshop/`, not to customers. The team and the agent are the audience. The operating frame is **trust, but verify**: every code change carries a hypothesis, the next evaluation either corroborates or contradicts it, the receipt log is append-only, and the batting average is itself a derivation the agent can query. Small bets, reviewed, measured, receipted.

`workshop/` has an explicit graduation condition. When probes cover every manifest-declared verb × facet-kind × error-family combination (coverage = 100%) and the batting average sustains above its floor across a rolling window, the workshop's active role is complete. What remains is a passive alarm that runs the same probes, posts scorecard updates, and flags regressions — but does not propose new measurements against a surface that is already fully measured. This is how the workshop puts itself out of a job, and it is how `product/` eventually packages for customer distribution without carrying the workshop's active cadence.

The aesthetic win is that measurement becomes structural: the seam between `product/` and `workshop/` is the manifest plus the log set, and the probe IR is the mechanical projection that makes the seam measurable. The substrate is thin because the primitives are good; the measurement is thin because the seam does the work.

## 8) Deliberately deferred

These decisions are out of scope for this document and are expected to resolve as shipping pressure forces the choices. Each is a committed follow-up, not an open question.

- **Facet schema concrete fields.** Field list, the facet-type taxonomy, and the relationship grammar between facets. Resolved at the compartmentalization Step 3 (`v2-direction.md §6`) by consolidating v1's split-across-two-files pattern into a single record, with the exact kind extensions (element / state / vocabulary / route) finalized as real customer work surfaces the requirements.
- **Verb taxonomy.** The concrete list of agent-facing verbs and their signatures. Resolved at Step 2 (manifest + fluency harness) by the minimum agent-to-instrument API sufficient to ship a first test; extended per level as new instruments land.
- **Test output format.** Language, framework, file layout of generated tests. Resolved at Step 6 (L0 ship) by what the customer's QA team recognizes as house style for OutSystems testing.
- **Manifest format.** The concrete shape of the agent fluency manifest and how it stays in sync with the code. Resolved at Step 2 when the first agent has to read it to do its job.
- **Drift semantics.** How confidence is computed, what thresholds gate the L3 policy, and how refinement logic works. Resolved at Steps 9–10 (L3 + L4).
- **Operator interaction model.** The chat, dialog, and document channels; how operator input is attributed, reviewable, and revocable; where consent lives. Resolved incrementally at Step 8 (L2).
- **Metric visitor audit outcomes.** Which of the seven inherited visitors (`extraction-ratio`, `handshake-density`, `rung-distribution`, `intervention-cost`, `compounding-economics`, `memory-worthiness-ratio`, `intervention-marginal-value`) port forward unchanged, which need denominator recalibration against the probe IR, and which retire. Resolved after the metric-visitor audit lands as an appendix to this doc (see `v2-direction.md §3.5`).
- **Probe IR verdicts for additional verbs.** The spike protocol (§6a) covers three representative verbs. The per-verb fixture specifications for the remaining declared verbs get authored as those verbs ship; the IR's authority extends verb by verb as fixtures land.
