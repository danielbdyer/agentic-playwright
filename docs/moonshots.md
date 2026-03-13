# Tesseract Moonshots: The Big Swings That Might Actually Work

Tesseract's biggest opportunity is not better Playwright generation. That is the current proving ground, not the end state. The bigger prize is a trusted memory and control plane for agents operating real enterprise UIs: a system that remembers what an application is, how it changes state, how it can be safely driven, what evidence supports that belief, and which changes still require human governance.

The reason this is a credible moonshot from this repo, rather than generic AI optimism, is that the substrate already exists in partial form. The doctrine is explicit in [master-architecture](./master-architecture.md), the runtime interpretation pivot is explicit in the [ADR collapsing deterministic parsing](./adr-collapse-deterministic-parsing.md), and the operating model is explicit in the [dogfooding flywheel](./dogfooding-flywheel.md). On disk today there is already an application interface graph, a selector canon, route variants, confidence overlays, session ledgers, a learning manifest, and an operator inbox. The repo is not imagining those nouns. It is already emitting them.

This memo argues for one flagship moonshot and four adjacent bets. All five would require expert implementation across runtime, provenance, governance, graph modeling, and operator surfaces. None are easy. But each one is close enough to the current architecture that success would feel like a dramatic extension of what Tesseract is already becoming, not a reinvention.

## Why Now

Three things make this a live moment rather than a vague someday aspiration.

First, the architecture has already moved beyond compiler-only thinking. The shared interpretation surface in [master-architecture](./master-architecture.md) positions planning, runtime resolution, emitted tests, review artifacts, and learning systems as projections over the same model. That is the right abstraction if the system is ever going to become more than a test generator.

Second, the repo now has enough real artifacts to support compounding loops. `.tesseract/interface/index.json` already carries route refs, route variants, target refs, state refs, event signatures, and transitions. `.tesseract/interface/selectors.json` already behaves like an embryonic `SelectorCanon`, with ranked probes, health, rung order, state validity, and lineage. `.tesseract/learning/manifest.json` already tracks decomposition, repair-recovery, and workflow corpora, plus replay examples across runs. `.tesseract/sessions/` already holds `AgentSessionLedger`-style records. `generated/demo/policy-search/10001.review.md` already reads like a scenario report that knows about governance, runtime failure families, state preconditions, overlays, and next commands.

Third, the repo already exposes the tension that matters. The operator inbox shows both `needs-human` items and approved-equivalent wins. The confidence overlay catalog shows learned aliases climbing toward trust thresholds. The interface graph already references route variants such as `route-variant:demo:policy-search:default` and `route-variant:demo:policy-search:results-with-policy`. That means Tesseract is already somewhere interesting: not a finished autonomous system, but no longer just compiling text into tests either.

The maturity caveat matters. The current branch is not a finished platform. The live CLI inspection path currently hits build-time type breakage around `runtimeHandoff` and incomplete `ProposalEntry` shapes. That should lower confidence in near-term polish, not in the direction. The substrate is powerful but partial.

## Comparison At A Glance

| Rank | Bet | Wow factor | Implementation difficulty | Dependency on current architecture | Time-to-first-proof | Strategic upside |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Reviewable Application Memory for UI Agents | Extreme | Extreme | Very high | Medium | Transformational |
| 2 | First-Day Autopilot for a New App + 1000-Test Suite | Extreme | Extreme | High | Long | Transformational |
| 3 | Semantic Drift Radar and Repair Autopilot | Very high | High | Very high | Short-medium | Very high |
| 4 | State-Space Scenario Synthesis | Very high | Extreme | High | Medium | Very high |
| 5 | Cross-App Transfer Learning for Enterprise UI Workflows | Very high | Extreme | Medium | Long | Huge if real |

## 1. Flagship: Reviewable Application Memory for UI Agents

### What it is

Turn Tesseract into the reviewable memory layer that a UI agent consults before it acts, during action, and after execution. QA would remain the proving ground, but the real product would be broader: a system that accumulates reusable knowledge of an application's routes, targets, selectors, state transitions, event signatures, recovery policies, and prior evidence so that any future agent session starts from structured memory instead of a blank browser tab.

This is the most moonshot but just-might-work idea because it reframes the durable asset. The durable asset is not emitted specs. It is a governed application memory model that lets agents do high-context UI work with receipts.

The boundary has to remain the current one: derived memory can ratchet aggressively, but canonical truth still lives in approved artifacts and any semantic promotion still flows through proposals and trust-policy review.

In that model:

- `ApplicationInterfaceGraph` is the semantic map of the app.
- `SelectorCanon` is the ranked working memory of how to reliably touch the app.
- `StateTransitionGraph` is the reusable model of what changes after which actions.
- `AgentSessionLedger` is the operational memory of what the agent inspected, tried, and learned.
- `LearningCorpus` is the replay and training surface for improving future behavior without silently mutating canon.

The breakthrough use case is not merely "generate a test from ADO." It is "give a UI agent a governed memory substrate so it can execute, explain, repair, and improve work inside a complex enterprise application without rediscovering the whole interface every time."

### Why Tesseract is unusually positioned

Most agent systems that touch UIs still treat the DOM as the primary source of truth and the prompt as the primary memory. Tesseract is unusual because it is already building durable artifacts in between. The master architecture already defines the interpretation surface as the shared contract for planning, runtime, review, and learning. The parsing ADR already argues that the knowledge layer should be a runtime resource, not only a compile-time prerequisite. The dogfooding model already assumes the system should accumulate reusable structure and cost signals across runs.

The current repo artifacts show the beginnings of that memory layer in concrete form:

- `.tesseract/interface/index.json` already contains target refs, state refs, event signatures, transitions, and route variants.
- `.tesseract/interface/selectors.json` already contains ordered selector probes, rung health, provenance, and usage counts.
- `.tesseract/sessions/` already records agent-session metadata and event types such as orientation, artifact inspection, and execution review.
- `.tesseract/learning/manifest.json` already accumulates corpora and replay examples across multiple runs.
- `.tesseract/confidence/index.json` already captures approved-equivalent overlays that act like derived working memory under governance.
- `.tesseract/inbox/index.json` already exposes the control-plane problem: what still needs human review, what recovered, and what reruns matter.

That combination is rare. Plenty of systems can execute. Plenty can propose. Very few are even trying to preserve application memory, operational memory, and governance memory in one reviewable plane.

### What makes it expert-only

This only works if several hard problems are solved at once.

The hardest obstacle is not raw agent intelligence. It is keeping the memory layer semantically stable while the app, the tests, and the runtime all change underneath it. `CanonicalTargetRef`, selector probes, route variants, state nodes, and transitions have to remain durable enough that memory can compound instead of fragmenting into duplicates. That means hard work in ontology design, graph identity, fingerprinting, ratchet rules, decay policy, and proposal governance.

The second hard obstacle is making runtime interpretation consume this memory without reintroducing prompt folklore. If the system becomes "load a giant blob of semi-structured memory and hope the model uses it well," the advantage disappears. The interpretation surface has to stay bounded, typed, and intentionally queryable.

The third hard obstacle is operator trust. A memory layer is only useful if humans can tell why it believes what it believes. That means every memory update has to stay provenance-rich, every derived overlay needs lineage, and every canonical mutation has to stay behind trust-policy review or clearly-defined confidence thresholds.

### What first proof would look like

The first credible proof is not a general-purpose UI copilot. It is narrower and sharper:

1. Run Tesseract against one unfamiliar but structurally rich enterprise app.
2. Ingest a sizeable manual suite and a small set of seeded routes.
3. Have the runtime consult interface, selector, state, and session artifacts before live exploration.
4. Show that later runs use materially fewer live DOM queries, fewer retries, and fewer human interventions because the memory layer improved.
5. Show that the review surfaces still explain each success, recovery, and proposal without collapsing into opaque model behavior.

If that works, Tesseract stops looking like "a smart test generator" and starts looking like "a governed operating memory for UI agents."

### Why it would be incredibly cool if it works

If this works, enterprise UI automation stops being mostly stateless imitation. A new agent session would inherit structured memory of the app the way a strong engineer inherits architecture docs, prior incidents, and runbooks. QA would be the first domain where that matters, but not the only one. The same memory layer could plausibly support guided support operations, structured back-office tasks, regression triage, migration verification, or agent-assisted operator workflows. That is a fantastically cool outcome because it takes the most brittle surface in software, the browser UI, and gives it a durable, governed memory model.

## 2. First-Day Autopilot for a New App + 1000-Test Suite

### What it is

Point Tesseract at a new enterprise app plus an imported Azure DevOps suite of roughly 1000 manual tests and have it establish a useful runnable slice on day one: intake context, harvest ARIA-first structure, discover seeded routes, prioritize a `Suite Slice`, execute the most leverage-heavy scenarios, and turn failures into reviewable hardening proposals.

This is the dogfooding north star made real.

### Why Tesseract is unusually positioned

The [dogfooding flywheel](./dogfooding-flywheel.md) already names the relevant vocabulary: `Context Pack`, `Suite Slice`, `Dogfood Run`, hardening proposals, benchmark scorecards, and drift events. The interface graph already understands route variants. The inbox and rerun-plan model already support an operator loop rather than one-shot runs. The backlog already describes a `dogfood` execution profile and a confidence-gated approval model.

That means the repo already has the right nouns for "first-day autopilot." It mainly lacks the orchestration thickness.

### What makes it expert-only

The hardest obstacle is prioritization under novelty. New apps are informationally hostile. The system has to decide which routes, states, and scenarios maximize future learning while staying inside cost and governance bounds. That is a search, scheduling, and evidence problem, not just a runtime one.

### What first proof would look like

Use one real imported suite plus a handful of known entry routes. Measure whether Tesseract can produce a `Suite Slice` that gets to meaningful green coverage faster than a naive first-50-scenarios strategy, while leaving a legible `Dogfood Run` ledger of what it learned and what still blocks progress.

### Why it would be incredibly cool if it works

Because it would feel like handing Tesseract a giant unfamiliar QA estate and watching it build its own on-ramp instead of waiting for months of manual knowledge authoring first.

## 3. Semantic Drift Radar and Repair Autopilot

### What it is

Build a system that does not just fail when a UI changes, but classifies the drift, maps it onto known targets and state transitions, proposes the smallest safe repair, and routes only the unresolved remainder to humans.

The goal is a drift radar, not just flaky-test suppression.

### Why Tesseract is unusually positioned

This bet depends directly on artifacts that already exist: selector ladders in the `SelectorCanon`, overlay lineage in `.tesseract/confidence/index.json`, route variants in the interface graph, runtime failure families and preconditions in generated review artifacts, and operator inbox / rerun-plan surfaces that already turn failures into work items.

The repo is already preserving the things a drift radar needs: what used to work, what alternative probes exist, what states were expected, and where governance boundaries sit.

### What makes it expert-only

The hardest obstacle is distinguishing semantic drift from structural noise. If the label changes but the task is the same, the repair should be small. If the state topology changes, the repair might be unsafe to automate. Getting that distinction right requires mature target identity, state modeling, failure taxonomy, and trust-policy thresholds.

### What first proof would look like

Seed controlled drift into the demo harness or a benchmark lane: rename accessible names, change result-grid structure, reorder tabs, or swap widget implementations while preserving user intent. Then show that Tesseract can classify the change, prefer selector or hint repairs when safe, and compute the smallest rerun surface afterward.

### Why it would be incredibly cool if it works

Because it turns UI change from a brittle break/fix event into an observable adaptation loop with receipts. That would feel qualitatively different from today's automation maintenance burden.

## 4. State-Space Scenario Synthesis

### What it is

Use the interface graph, event signatures, and transition topology to synthesize high-value scenarios that were never explicitly authored: not random fuzzing, but graph-grounded scenario discovery over meaningful state transitions, risky validation paths, and under-covered route variants.

This would make Tesseract not only a consumer of manual intent, but a generator of plausible new intent.

### Why Tesseract is unusually positioned

The architecture already treats state and event topology as first-class contracts. `.tesseract/interface/index.json` already names state refs and transition refs. The learning manifest already has decomposition and workflow corpora. The doctrine already insists that emitted tests stay readable and that runtime and review surfaces share the same interpretation substrate.

That combination is a strong base for scenario synthesis because the raw materials are semantic, not just DOM-level.

### What makes it expert-only

The hardest obstacle is avoiding garbage exploration. Without strong constraints, synthesis produces combinatorial nonsense. The system would need to use route knowledge, state guards, posture contracts, benchmark outcomes, and business-priority signals to generate only scenarios that are plausible, reviewable, and worth running.

### What first proof would look like

Take one well-modeled screen, enumerate its transition graph, and synthesize a small number of novel but legible scenarios that expose gaps not already present in the manual suite. Success means the scenarios look like something a senior QA would actually have written after inspecting the app.

### Why it would be incredibly cool if it works

Because the system would stop being limited by what humans happened to author first. It could surface latent negative cases, cross-state regressions, and transition-path bugs hiding between manual cases.

## 5. Cross-App Transfer Learning for Enterprise UI Workflows

### What it is

Let Tesseract transfer durable workflow knowledge across applications without pretending all apps are the same. The bet is that enterprise UIs repeat deep structural patterns: search forms, review flows, eligibility gates, wizard progressions, result grids, validation summaries, approval steps. Tesseract could learn reusable workflow priors that accelerate interpretation and authoring in a new app while still grounding execution in local knowledge and live evidence.

### Why Tesseract is unusually positioned

The repo already separates local screen knowledge from promoted shared patterns. That is exactly the right promotion boundary for transfer learning. The learning corpus and benchmark lanes are also already part of the design, and the parsing ADR explicitly frames the knowledge layer as an API surface that future agent sessions should query before touching the DOM.

In other words, the architecture already has a place where local discoveries become promoted abstractions when repetition justifies it.

### What makes it expert-only

The hardest obstacle is learning the right abstractions without overfitting to prompt lore or collapsing distinct business semantics into generic UI cliches. Transfer has to stay constrained enough that it helps with search-form or review-flow structure while never overriding local ground truth, governance, or app-specific meaning.

### What first proof would look like

Pick two different applications with similar workflow shapes, such as search-and-results or multi-step review. Show that patterns learned in the first app improve route discovery, target resolution, or scenario decomposition in the second without requiring unsafe canonical shortcuts.

### Why it would be incredibly cool if it works

Because the "50th test costs less than the 1st" story would expand into "the second enterprise app costs less than the first." That would be a step-change in platform leverage.

## Best Next Proving Sequence

The right proving sequence is not to chase all five bets at once. It is to validate the flagship through the smallest sequence that compounds.

1. Stabilize the current substrate first: fix the `runtimeHandoff` and `ProposalEntry` branch breakage so the inspection and runtime surfaces are trustworthy again.
2. Harden the flagship memory loop on one app: make runtime interpretation visibly consume interface, selector, state, overlay, and session artifacts before live exploration.
3. Build semantic drift radar next: it is the fastest proof that the memory layer is doing real work rather than just storing history.
4. Wrap the loop in a `Dogfood Run` and `Suite Slice` orchestration path for a new-app intake trial.
5. Only then push into state-space synthesis and cross-app transfer, because both depend on the memory layer being coherent enough to generalize safely.

If Tesseract can prove the first two steps convincingly, the rest stop sounding like science fiction and start looking like an unusually disciplined roadmap.
