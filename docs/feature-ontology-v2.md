# Feature Ontology (v2)

> Status: v2 planning — prospective feature decomposition implied by [`v2-substrate.md`](v2-substrate.md). Not an inventory of existing code; a map of features the substrate's level spine will force into existence.

This document is a companion to `docs/v2-substrate.md`. The substrate names the five primitives (agent, intent source, world, instruments, memory) and the five-level spine (L0 → L4). This ontology decomposes each level into the specific agent-facing features that level's shipping claim forces into existence. The goal is not to catalog everything v2 might have; it is to give anyone proposing a feature a cheap way to decide whether it belongs, where it belongs, and when.

Three uses:

1. **Feature-placement check.** A proposed feature maps to a level and to the primitive it operates on. If it cannot, it is scaffolding, not a feature; route it through substrate §6 before adopting it.
2. **Level-claim protection.** Each level has a narrow shipping claim (substrate §5). A feature that does not help that claim, and does not directly enable a later-level claim, defers.
3. **Ontology discipline.** A feature ontology grows with the system. Early levels specify features concretely; later levels are sketched. Complexity emerges; it is not legislated.

## 1) The map — primitives × levels

Every feature in v2 is a triple: *(level, primitive, claim)*. That triple is enough to decide membership.

| Level | Primitives exercised | What's new at this level |
| --- | --- | --- |
| L0 | Agent, Intent, World, Instruments (Playwright, ADO, test runner) | Two instruments sufficient to ship a first test. No memory. Tests composed from live observation. |
| L1 | + Memory | Facet catalog, populated from discovery, read during authoring. |
| L2 | + Instruments (Dialog, Document) | Operator-supplied semantics enter memory; vocabulary aligns with the business. |
| L3 | (no new primitive; policy on Memory) | Memory confidence gates DOM-less authoring; drift detection surfaces as a runtime signal. |
| L4 | (no new primitive; process on Memory) | Memory aging, corroboration, revision proposals; self-refinement between authoring passes. |

Features are always anchored to a level. A feature introduced "for later use" at an earlier level is scaffolding.

## 2) Level 0 — the shipping-from-day-one feature surface

L0's claim: the agent authors a QA-legible test against a real ADO work item and the live application, faster than a human would, and a professional QA accepts it into the suite.

Features L0 forces into existence:

- **Intent fetch.** The agent retrieves an ADO work item by ID and extracts its preconditions, actions, and expected outcomes in the terms the work item uses.
- **World exploration.** The agent navigates and observes the application through Playwright. Observations are per-session and ephemeral at L0.
- **Test composition.** The agent produces a Playwright test from the intent and the observation — one test per work item, step descriptions in the business vocabulary implied by the work item.
- **Test execution.** The agent runs the test it authored; the test returns pass/fail plus structured evidence.
- **Review handoff.** The test surfaces to QA in a form a professional reviewer recognizes as professional work. Durable QA extensions land in the intent source (the work item), not the test file, because there is no memory layer at L0 (substrate §3.2).
- **Verb introspection.** The agent reads the vocabulary manifest on session start and becomes fluent in the current verbs before acting. Manifest drift that breaks fluency is a regression (substrate §4).

What is **not** at L0: any facet store, any operator dialog channel, any document ingestion, any drift detection, any self-refinement. L0 is a single-shot authoring loop; its only persistent artifact is the test file.

## 3) Level 1 — the first memory

L1's claim: repeat authoring on a surface the agent has already seen is measurably faster, and uses vocabulary consistent across authoring passes.

Features added:

- **Facet write.** An observation becomes a catalog entry. The entry is self-describing — what was observed, when, by which instrument, with what confidence. Provenance is threaded at minting and travels forward with the facet (substrate §2.5).
- **Facet read.** The agent queries the catalog by intent phrase — not by page or selector. Queries return facets scoped by role, state, affordance, outcome, and vocabulary.
- **Locator health.** Each locator strategy attached to a facet records success and failure outcomes over time. Health is written at L1; it is only *consumed* at L3. Writing it at L1 is required because provenance of this kind cannot be added retroactively.
- **Memory-backed authoring.** Test composition consults memory before reaching for live observation. When memory is sufficient, observation is skipped; when not, observation fills in and writes new entries.

What is **not** at L1: operator-supplied memory, DOM-less authoring policy, drift detection, self-refinement. L1's memory contains only what the agent observed on its own by exercising the application.

## 4) Level 2 — operator semantics enter memory

L2's claim: memory reflects vocabulary and constraints not visible in the DOM, and tests use them; a business analyst recognizes the language as their own.

Features added:

- **Dialog capture.** An instrument records operator clarifications from chat ("that's called 'suspend', not 'pause'"; "service agents can't see the audit log") and converts them into candidate facets.
- **Document ingestion.** An instrument extracts facet candidates from operator-shared materials (requirements, style guides, internal wikis).
- **Candidate review.** Candidate facets surface for operator review before entering memory. Review is lightweight and operator-initiated; the default is human-in-the-loop before dialog or document entries become authoritative.
- **Vocabulary alignment.** Memory's surface vocabulary converges on the operator's terms, and test composition reads the aligned vocabulary when authoring. Generated tests read in the language a BA/PO would use.

Candidate review here is the minimum viable operator oversight. Heavier governance concerns (authority tiers, explicit veto semantics, constituency ordering) are deferred to the level that forces them.

## 5) Level 3 — DOM-less authoring on known-enough surfaces

L3's claim: for a meaningful fraction of the backlog, new tests are authored without re-observing the application, and authoring throughput grows disproportionately to observation cost.

Features added (all policies on memory; no new primitives):

- **Confidence-gated authoring.** When memory confidence about a surface exceeds a threshold, the agent authors without fresh observation. The threshold is set per capability (navigate, click, fill) as the level ships.
- **Runtime drift detection.** When a memory-authored step fails at runtime in a way that indicates memory was wrong about the world, a drift event fires. Locator health (written since L1) is a primary drift signal.
- **Drift event surfacing.** Drift events are visible to the agent (for immediate recovery on the authoring pass) and to the operator (for review). Memory is not silently patched; drift reduces confidence and flags the facet.

What is **not** at L3: autonomous memory revision. Drift is flagged, not fixed.

## 6) Level 4 — self-refinement

L4's claim: memory quality improves between explicit authoring work; false greens and false reds both trend down.

Features added:

- **Confidence aging.** Unused facets decay in confidence over time; their value as authoring sources degrades toward expired.
- **Corroboration.** Facets referenced in passing tests gain confidence. Successful runs are positive evidence.
- **Revision proposal.** The agent proposes memory revisions between authoring passes, drawing on drift events, decay, and corroboration.
- **Revision review.** Proposals surface for human oversight appropriate to the customer's governance. Nothing autonomous modifies memory without review at L4.

Self-refinement here is bounded: it improves quality, not authority.

## 7) Cross-cutting disciplines

Three disciplines are present at every level and are not features themselves. Every feature must also respect them.

- **Agent fluency.** The vocabulary manifest stays in sync with the instrument and memory verbs by construction, not by convention. Fluency checks run alongside product tests; a change that breaks agent fluency is a regression at the same severity as a broken product test. (Substrate §4.)
- **Handoff boundary.** Tests are visible artifacts but are agent-authored and regeneration-susceptible. Durable QA work lands at the intent or memory layer, and regeneration preserves that partition. (Substrate §3.2.)
- **Anti-scaffolding gate.** Every proposed feature passes "does this help the agent at scale, across many ADO items, for a real customer?" The three patterns that slip a positively-stated gate — unbounded migration scaffolding, dual-master mechanisms, contingent schema without a forcing scenario — are rejected by name. (Substrate §6.)

## 8) Using the ontology to evaluate a proposed feature

Ask, in order:

1. **Which primitive does this feature operate on?** If none — if the feature reshapes the system's internal structure without touching agent behavior on one of the five primitives — it is scaffolding, not a feature. Route to substrate §6.
2. **Which level's claim does this feature help ship?** If the answer is "a level we have not started building," the feature is premature. Defer.
3. **What breaks at its level if this feature is missing?** If nothing breaks — if the level's claim is still shippable without it — the feature is optional. Optional features are acceptable, but only when they earn their place through observed need at the level.
4. **Can this feature be named as a verb the agent calls, with stable inputs and outputs?** If not, the feature is under-specified; name the verb before committing.

If all four questions have answers, the feature belongs. If any does not, the feature is not ready for the ontology — which is the same as saying it is not ready for the codebase.

## 9) Deliberately not here

The following are intentionally absent and are expected to emerge from shipping, not from planning:

- **Exact verb signatures.** The manifest learns them as levels ship.
- **Exact facet schema.** Fields emerge from what L0 and L1 authoring actually need.
- **Exact confidence semantics.** Confidence is written at L1 and consumed at L3; the shape of its order and the threshold values emerge at L3 under the pressure to ship DOM-less authoring, not before.
- **Exact governance for operator oversight.** Lightweight candidate review at L2; revision review at L4; deeper governance emerges only under customer-driven pressure.
- **Fixed feature counts.** The feature lists above name what shipping each level forces into existence. Features accrue only when a level's claim demands them.

Complexity emerges from simpler systems. This ontology maps what the substrate forces into being — nothing more.
