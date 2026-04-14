# v2 Substrate

> Status: v2 planning — codebase-agnostic substrate, not a migration plan.

This document describes what a second version of this system is, stated from first principles without reference to how the present codebase is organized. It is a planning artifact for a rewrite that ships product value against a real customer backlog from day one, and grows only under the pressure of shipping more.

It does not describe a migration from the current codebase. It does not map present modules to future ones. It does not defend or indict prior choices. It proposes a substrate; selection of what to salvage happens after v2 has working code.

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

The tools the agent calls. Each instrument is independently enableable. Adding one is an increment; removing one degrades gracefully. The v0 set: Playwright (to reach the world), Azure DevOps (to reach intent), memory read, memory write, run-a-test, compare-runs. Later instruments: operator dialog capture, document ingestion. Each instrument exposes a named verb. The union of verbs is the codebase's public API — stable, well-named, and versioned.

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

## 7) Deliberately deferred

These decisions are out of scope for this document and are expected to resolve as shipping L0 and L1 forces the choices. Each is a committed follow-up, not an open question.

- **Facet schema.** Concrete fields on a facet entry, the facet-type taxonomy, and the relationship grammar between facets. Resolved at L0–L1 by what the agent actually needs to read and write to author working tests.
- **Verb taxonomy.** The concrete list of agent-facing verbs and their signatures. Resolved at L0 by the minimum agent-to-instrument API sufficient to ship a first test; extended per level as new instruments are added.
- **Test output format.** Language, framework, file layout of generated tests. Resolved at L0 by what the customer's QA team recognizes as house style for OutSystems testing.
- **Manifest format.** The concrete shape of the agent fluency manifest and how it stays in sync with the code. Resolved at L0 when the first agent has to read it to do its job.
- **Drift semantics.** How confidence is computed, what thresholds gate the L3 policy, and how refinement logic works. Resolved at L3 and L4.
- **Operator interaction model.** The chat, dialog, and document channels; how operator input is attributed, reviewable, and revocable; where consent lives. Resolved incrementally at L2.
- **Salvage from the previous codebase.** Not decided in this document. If and when salvage happens, it happens after v2 has working code at some level at or above L1, and never in a way that reintroduces v1's organizing principles as v2's default.
