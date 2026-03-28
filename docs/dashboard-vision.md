# The Tesseract Dashboard: A Vision for the Visual Intelligence Layer

*A sweeping, opinionated, reality-grounded vision for what the Tesseract dashboard is, what it should become, and what it would look like if we built the best version of it that we can imagine.*

---

## Preamble: What the Dashboard Already Is

Before dreaming, let's ground ourselves. As of today, the Tesseract dashboard is already far more than a status page:

- **A spatial visualization** powered by React 19 + react-three-fiber, with a Three.js scene that renders a live screen plane, bioluminescent selector glows, particle transport arcs, a frosted glass pane separating the DOM world from the knowledge world, and a crystallized knowledge observatory.
- ✅ **A real-time event-driven view** fed by an Effect-native server with PubSub event bus, SharedArrayBuffer ring buffer, and zero-dependency WebSocket broadcast. 22 event types stream from the pipeline fiber into the scene.
- ✅ **A human-in-the-loop decision surface** where the Effect fiber can pause, present a decision overlay in 3D space, and resume when the operator approves or skips — with particle burst animations that carry the decision result toward the knowledge side of the glass.
- ✅ **An MCP-integrated viewport** exposing structured tool endpoints so agents can observe the same data the visual layer consumes.
- ✅ **An atomic design system** with Tailwind v4 semantic governance tokens, 16 spatial components, convergence panels, pipeline progress, fitness cards, workbench panels, and queue visualizations.

This is not a dashboard bolted onto a test generator. This is the beginnings of a *visual consciousness* for an interface intelligence system. The fiber is the mind. The dashboard is the eyes.

---

## Part I: The Two Primary Purposes

### Purpose 1: The Autopilot Window (Observation Mode)

In its primary mode, the dashboard is a **window into an autonomous system**. Tesseract is running a speedrun, a dogfood loop, or a CI-batch pipeline. Nobody is intervening. The system is discovering, compiling, executing, proposing, approving within thresholds, and iterating toward convergence.

The dashboard shows this happening. Not as a log. Not as a progress bar. As a **living spatial narrative**: the DOM being probed, selectors glowing as they're found, knowledge particles streaming through the glass pane, the observatory growing denser and more iridescent with each iteration, convergence ribbons tightening, fitness gauges climbing.

This is the mode where the dashboard earns its most fundamental right to exist: **making the invisible visible**. Tesseract's recursive improvement loop produces dozens of artifacts per iteration across six concern lanes. Without a visual layer, an operator would need to `cat` twenty JSON files to understand what just happened. With the dashboard, they watch it happen in real-time, and they *feel* the system's confidence accumulating.

The autopilot window should feel like watching a time-lapse of a coral reef growing. Slow, deliberate, organic, and unmistakably alive.

### Purpose 2: The Remote Control (Intervention Mode)

In its second mode, the dashboard becomes a **command surface**. The Effect fiber has paused. A proposal exceeds auto-approval thresholds. A step hit `needs-human`. A structural drift was detected that the system cannot confidently repair.

Now the operator is not watching. They are *steering*.

The decision overlay floats in 3D space near the relevant element. The knowledge observatory highlights the gap. The convergence panel shows what happens to the fitness trajectory if this proposal is approved versus skipped. The operator clicks, and the decision burst carries the result through the glass pane — green particles crystallizing into new knowledge, or red particles scattering into the void.

The remote control mode should feel like operating a rover on another planet. You're not there. The system did the hard work of getting to this point. But this one decision requires your judgment, and the interface gives you exactly the context you need to make it well.

---

## Part II: The Core Views

### View 1: The Spatial Harvest — *"What is the system seeing right now?"*

**What it is**: The left side of the glass pane. A live rendering of the application under test, with the system's perception overlaid as spatial annotations.

**Current state**: ScreenPlane texture from screenshots, SelectorGlows with bioluminescent highlights, coordinate mapping from DOM to Three.js world space.

**Envisioned state**:

- **Live DOM Portal** (already scaffolded): The actual application rendered as an iframe behind the Three.js canvas, with transparent overlay showing the system's attention in real-time. No screenshot latency. The user sees the real app and the system's understanding simultaneously.
- **Attention Heatmap**: Beyond individual glows, a continuous heatmap showing where the system has spent resolution effort. Hot zones indicate complexity. Cold zones indicate either high confidence or unvisited territory. Both are operationally significant.
- **State Topology Overlay**: When the system discovers that clicking button A reveals panel B, that relationship should be visible as a ghosted arrow between the two DOM regions. The state transition graph rendered *on top of the DOM that produced it*.
- **Resolution Strategy Traces**: As the system walks the locator ladder (test-id → role-name → CSS → translation → live DOM → agent), show the walk visually. A probe fails at rung 1, glows red briefly, then tries rung 2 and glows brighter. The operator sees *how* the system found what it found, not just that it did.

**Why this view matters**: Because the gap between "the system executed a test" and "I understand what the system understood about the application" is the trust gap. This view closes it.

### View 2: The Knowledge Observatory — *"What has the system learned?"*

**What it is**: The right side of the glass pane. A spatial graph of accumulated knowledge — screens, elements, selectors, confidence scores, aliases, governance states — growing and reorganizing as the system learns.

**Current state**: KnowledgeObservatory with crystallized nodes colored by confidence, governance tints, actor-attribution particles.

**Envisioned state**:

- **Hierarchical Spatial Layout**: Screens as large translucent planes, elements as nodes within them, selectors as fine-grained branches. The observatory should feel like a city at night — the landmarks (screens) are always visible, the streets (elements) become visible as you approach, and the individual addresses (selectors) are legible only at close range.
- **Temporal Layering**: Knowledge nodes carry not just their current confidence, but their history. A node that was once `needs-human` and is now `approved` should visually show its journey — like geological strata. An iridescent core surrounded by the amber of its earlier states.
- **Governance Constellation**: Nodes in `approved` state form stable constellations. Nodes in `review-required` orbit slightly, pulsing. Nodes in `blocked` flicker at the periphery. The governance state of the entire knowledge base should be *felt* at a glance without reading a single label.
- **Gap Visualization**: Where the knowledge is thin — screens with few known elements, elements with no aliases, selectors with low health — the observatory should show *absence* as clearly as presence. Dark regions in the constellation. The system's ignorance is as important as its knowledge.

**Why this view matters**: Because knowledge is Tesseract's durable asset. The emitted tests are disposable object code. The knowledge is what compounds. If the operator cannot see, navigate, and intuit the knowledge layer, the most valuable part of the system remains invisible.

### View 3: The Pipeline Theater — *"What is happening right now in the improvement loop?"*

**What it is**: The temporal view of the recursive improvement pipeline — iterations, phases, convergence, calibration, and fitness evolution.

**Current state**: PipelineProgress with stage dots and lifecycle tracking, ConvergencePanel with rung shift history, IterationPulse with ambient light modulation, FitnessCard with high-water marks.

**Envisioned state**:

- **Iteration Timeline**: A horizontal timeline where each iteration is a column. Within each column, the phases (sync → parse → bind → emit → run → propose → approve → rerun) are stacked vertically. Completed phases glow. Active phases pulse. Failed phases turn amber. The operator sees the entire improvement history as a structured grid, not a scrolling log.
- **Convergence Landscape**: Instead of a simple ribbon, a topographic surface where the X axis is iteration, the Y axis is scenario index, and the Z axis (height/color) is confidence. The landscape should show where convergence is happening (plateaus forming), where it's stalling (ridges remaining), and where regression occurred (valleys deepening). This is the fitness landscape made spatial.
- **Calibration Drift Radar**: The existing CalibrationRadar molecule expanded to a full polar plot where each axis represents a scoring signal (knowledge hit rate, translation precision, convergence velocity, proposal yield, resolution rung distribution). As calibration drifts, the plot deforms, making it immediately obvious which signals are moving and in which direction.
- **Decision Economics**: For each iteration, show the cost of decisions: how many tokens were spent, how many steps required agent interpretation, how many proposals were generated versus accepted, how many reruns were triggered. Make the economic pressure visible so operators can tune trust-policy thresholds with real data.

**Why this view matters**: Because the recursive improvement loop is the thing that makes Tesseract more than a compiler. If the operator cannot see the loop working, they cannot trust it, tune it, or know when to intervene.

### View 4: The Workbench — *"What needs my attention?"*

**What it is**: The operator's action surface. Prioritized work items, proposals awaiting review, hotspots requiring investigation, and rerun plans needing approval.

**Current state**: WorkbenchPanel with work items, QueueVisualization with animated queue entries, CompletionsPanel with decision audit trail.

**Envisioned state**:

- **Triage Dashboard**: Work items grouped by urgency and type — approval-required proposals at the top, degraded-locator hotspots next, needs-human steps after, informational items at the bottom. Each item shows its evidence confidence, the cost of inaction (what happens if the operator ignores it), and a one-click path to resolution.
- **Contextual Deep-Dive**: Clicking any work item should smoothly transition the spatial view to focus on the relevant screen region (harvest view), the relevant knowledge node (observatory), and the relevant pipeline phase (timeline). The workbench is the *navigator* of the other three views.
- **Batch Operations**: Select multiple related proposals (e.g., all alias proposals for one screen) and approve or skip them as a batch. Show the projected impact on the next iteration's fitness before confirming.
- **Decision Replay**: Every decision the operator has made is recorded in the completions ledger. The workbench should show a replay surface: "You approved this alias on iteration 3. By iteration 5, it resolved 14 additional steps. Here's the impact chain." This turns the operator from a reviewer into a strategist.

**Why this view matters**: Because without it, the dashboard is a beautiful screensaver. The workbench is where observation becomes action. It's the difference between watching television and flying a plane.

### View 5: The Scorecard — *"Is the system actually getting better?"*

**What it is**: The aggregate fitness view. Benchmark scorecards, regression detection, generalization metrics, knowledge health indicators.

**Current state**: FitnessCard with high-water marks, ProgressCard with iteration metrics.

**Envisioned state**:

- **Multi-Run Comparison**: Side-by-side scorecards across runs, seeds, configurations, and postures. Show which changes produced which improvements. Make A/B comparison of trust-policy configurations visual and immediate.
- **Regression Canary**: A live indicator that compares the current run's trajectory against the best historical run. If the system is falling behind its own previous best, the canary turns amber. If it's beating its record, the canary turns green. Regression detection becomes ambient awareness, not a post-hoc report.
- **Knowledge ROI**: For each piece of approved knowledge (a hints file, a patterns file, a surface definition), show its contribution to resolution across all scenarios. Which knowledge is earning its keep? Which is dead weight? This turns knowledge maintenance from a chore into a strategic investment decision.
- **Generalization Gauge**: Using the held-out validation concept from the capabilities roadmap, show the gap between training-set performance and held-out performance. A system that scores 95% on training and 60% on held-out is memorizing, not learning. This gauge keeps everyone honest.

**Why this view matters**: Because improvement without measurement is hope, not engineering. The scorecard is the dashboard's conscience.

---

## Part III: What's In Scope, What's Out

### In Scope

1. **Everything that is a projection of pipeline artifacts.** The dashboard consumes JSON envelopes, WebSocket events, and REST endpoints. It never produces canonical truth. This is the fundamental architectural invariant and it must never break.

2. **Real-time visualization of the Effect fiber's execution.** The fiber is the source of truth. The dashboard is a viewport. Events flow freely. Decision gates are opt-in with timeout fallbacks.

3. **Human-in-the-loop decision surfaces.** Approval, skip, batch operations, and contextual investigation of proposals, hotspots, and needs-human items.

4. ✅ **Agent-equivalent access.** Every capability the dashboard provides to a human must also be accessible through the MCP tool endpoints. The dashboard is one consumer of the `DashboardPort` interface, not the only one. `DisabledDashboard`, `AgentDecider`, and `DualModeDecider` are equally valid.

5. **Progressive enhancement layers.** The dashboard adds capability without creating dependency. Toggling it on or off must never change pipeline behavior or output. Layer 0 (texture + glows + particles) through Layer 3 (convergence + proposals + aurora) compose cleanly and degrade gracefully.

6. **Operator ergonomics for the six concern lanes.** The dashboard should make it natural to think in terms of intent, knowledge, control, resolution, execution, and governance/projection — the same vocabulary the CLI and the architecture use.

### Out of Scope

1. **Canonical artifact mutation from the UI.** The dashboard does not write to `knowledge/`, `scenarios/`, `controls/`, or any canonical path. It sends decision events through the WebSocket, and the Effect fiber handles mutation. The dashboard is a viewport, never a command center that bypasses the pipeline.

2. **General-purpose project management.** The dashboard is not Jira. It does not track sprints, assign work, or manage backlogs beyond the pipeline's own workbench projection.

3. **Ad hoc query or REPL.** The dashboard is not a database console. It consumes structured projections with known schemas. If an operator needs to run arbitrary queries, they use the CLI.

4. **Third-party system integration.** The dashboard does not talk to Azure DevOps, OutSystems, or any external system directly. Those integrations live in `lib/infrastructure/` and feed the pipeline, which feeds the dashboard.

5. **Offline analytics and optimization.** DSPy, GEPA, and similar tooling belong in the offline evaluation lane, not in the dashboard. The dashboard may *display* optimization results, but it does not *run* them.

---

## Part IV: What I Love Most

### The Glass Pane

The frosted glass separator between the DOM world and the knowledge world is the single most inspired design decision in the current dashboard. It is simultaneously:

- A **visual metaphor** for the governance boundary: raw observation on the left, approved knowledge on the right, and the proposal gate in between.
- A **spatial organizer** that gives the scene depth and narrative direction: particles flow from discovery through review into crystallized knowledge.
- A **progressive enhancement surface**: proposals that pass through the glass become activated knowledge; proposals that are blocked reflect back. The ArtifactAurora flashes at the glass boundary when artifacts are written. The glass is where the system's governance *lives* visually.
- A **design constraint** that forces compositional thinking: everything to the left of the glass is about observation, everything to the right is about knowledge, and everything at the glass is about the decision boundary between them.

The glass pane is not a decoration. It is the visual embodiment of Tesseract's most important architectural principle: that derived observation and canonical knowledge are separated by a reviewable boundary, and that boundary is the source of trust.

### The Bioluminescent Selector Glows

The choice to render element probes as bioluminescent glows rather than bounding boxes or highlights is what elevates the dashboard from "useful" to "compelling." Bounding boxes say "I found this element." Bioluminescent glows say "I am *perceiving* this element, and my confidence in that perception has a shape and intensity." The glow's brightness maps to confidence, its color maps to the resolution rung, and in decision mode, the paused element pulses brighter to draw attention. This is data visualization that reads as *experience*.

### The Particle Transport

The arcing particles from DOM space to knowledge space are not eye candy. They are the visual representation of Tesseract's most important process: turning observation into knowledge. Every particle that crosses the glass pane represents a fact that the system has converted from ephemeral DOM structure into durable, reusable, governed knowledge. The trajectory of each particle — its arc, its color, its arrival point in the observatory — tells a story about what was learned and how.

---

## Part V: The Five Technically Brilliant Suggestions

These are the moonshots. Each one is technically challenging, architecturally grounded, and would be extraordinary if we pulled it off.

### 1. The Temporal Observatory: Time-Travel Through Knowledge Evolution

**What**: Add a temporal dimension to the knowledge observatory. Instead of showing the current state of knowledge, allow the operator to scrub through time — watching the observatory grow, reorganize, and crystallize across iterations and runs. Knowledge nodes would appear, brighten, and occasionally fade. Governance states would transition visually. The operator could pause at any moment and see what the system knew, what it didn't know, and what it was about to learn.

**Why it's technically hard**: The current observatory is a snapshot. Making it temporal requires indexing every knowledge state change by iteration and run, building a temporal graph that can be efficiently queried at any point in time, and rendering smooth interpolation between states in Three.js. The `WorkflowEnvelope.fingerprints` and lineage fields provide the raw materials, but turning them into a scrubbable timeline with spatial consistency (nodes shouldn't teleport between frames) requires sophisticated graph layout algorithms that preserve spatial identity across mutations.

**Why it's brilliant**: Because it would let an operator *see* the system learning. Not "the system learned" (past tense, report). Not "the system is learning" (present tense, dashboard). But "here is the *shape* of the system's learning over time" — the acceleration, the plateaus, the breakthroughs, the regressions. This would be the first time anyone has ever watched a knowledge graph evolve in spatial time-lapse. It would make Tesseract's recursive improvement loop not just measurable, but *viscerally understandable*.

**Architectural anchor**: Arc 1 (Temporal Intelligence) from the V3 roadmap — specifically T3.1.1 (Run Archaeology Index), T3.1.4 (Time-Travel Trace Comparator), and T3.1.6 (Knowledge Half-Life Calculator). The temporal index feeds the visualization. The half-life calculator determines which nodes are fading. The trace comparator powers the side-by-side divergence view.

### 2. The Semantic Drift Radar: A Living Topographic Map of Application Change

**What**: Replace the flat convergence ribbon with a true topographic landscape. The X axis is the application's route/screen space. The Y axis is time (runs/iterations). The Z axis is confidence — how well the system's knowledge matches the application's reality. When the application drifts (a label changes, a widget is swapped, a validation flow is restructured), the landscape deforms: a confidence valley appears at the affected coordinates. When the system repairs the drift (through proposal activation or knowledge update), the valley fills back in. The operator sees drift as *terrain*, not as a failure count.

**Why it's technically hard**: Mapping a multi-dimensional confidence space onto a 2D heightfield that is simultaneously readable, navigable, and aesthetically coherent is a genuine data visualization challenge. The confidence data comes from many sources (selector health, resolution receipts, overlay lineage) that need to be aggregated into a single spatial metric without losing the ability to drill down. The Three.js heightfield needs to update smoothly as new data arrives, and the color mapping needs to encode multiple dimensions (confidence level, drift velocity, repair status) without becoming a visual mess.

**Why it's brilliant**: Because it would turn UI drift — the single most expensive maintenance burden in enterprise test automation — into something you can *see approaching*. A team running 2000 scenarios against a changing application would see the terrain deforming in real-time after a deployment, immediately identify which screens are affected, and watch the system's repair mechanisms fill the valleys back in. If the valleys persist, that's where human attention is needed. This is not a dashboard widget. It is a *weather map for software change*.

**Architectural anchor**: Moonshot #3 (Semantic Drift Radar and Repair Autopilot) already defined in `docs/moonshots.md`. The selector canon provides per-target health. The confidence overlay catalog provides per-artifact trust. The interface graph provides the spatial coordinates. The improvement ledger provides the temporal axis.

### 3. The Decision Theater: Collaborative Human-Agent Governance in Shared 3D Space

**What**: Extend the current decision overlay into a full collaborative governance surface. When a proposal requires review, both the human operator and the agent (through MCP) can simultaneously view the same 3D scene. The agent's analysis appears as structured annotations in the scene — its confidence assessment, its risk evaluation, its recommended action — while the human sees the same element context, the same knowledge gap, the same governance state. The human can approve the agent's recommendation, override it, or request more evidence. The decision is recorded as a multi-participant intervention receipt with full provenance.

**Why it's technically hard**: This requires synchronizing scene state between the Three.js frontend and the MCP tool endpoints in real-time, representing agent reasoning as spatial annotations that are meaningful alongside human-targeted visual elements, and designing an interaction model where human and agent decisions compose rather than conflict. The `DualModeDecider` already exists as a code concept, but turning it into a visual experience where both participants' perspectives are *visible* is a UX and rendering challenge of the highest order.

**Why it's brilliant**: Because it would be the first time anyone has built a system where a human and an AI agent make governance decisions in a *shared visual space* with mutual visibility. Today, agent + human collaboration is sequential (the agent proposes, the human reviews). This would make it concurrent and spatial (both see the same thing, both contribute annotations, the decision emerges from their combined perspective). It would turn the `DashboardPort` interface's four implementations — `DisabledDashboard`, `WsDashboardAdapter`, `AgentDecider`, `DualModeDecider` — from an architectural abstraction into a living, visible collaboration.

**Architectural anchor**: Phase 6 (Human-in-the-Loop) from `docs/spatial-dashboard.md`, the `AgentWorkbench` spine from `docs/master-architecture.md`, and the multi-participant intervention model from the `InterventionLedger` contract. The workbench event vocabulary (orientation, artifact inspection, proposal approval, execution review) is already typed. The breakthrough is rendering it spatially.

### 4. The Execution Déjà Vu: Predictive Run Trajectory with Early Warning

**What**: During a live run, render the current sequence of resolution outcomes as a trajectory through an abstract state space. Simultaneously render the trajectories of previous runs that started similarly. When the current run's trajectory begins to converge toward a previously-observed failure trajectory, the scene shifts: the ambient light dims, the convergent historical trajectory glows red, and a warning annotation appears showing the predicted failure point and the historical failure mode. The operator can then intervene early — adjusting parameters, approving a pending proposal, or pausing the run — before the failure materializes.

**Why it's technically hard**: This requires real-time edit-distance computation over resolution receipt sequences (comparing the live sequence against a library of historical sequences), a meaningful embedding of resolution outcomes into a navigable low-dimensional space (the "abstract state space" needs to actually *mean something* visually), and predictive trajectory extrapolation that is honest about its uncertainty. The T3.1.7 (Execution Déjà Vu) concept from the V3 roadmap provides the algorithmic skeleton, but rendering it as a spatial experience that is both accurate and comprehensible is a visualization research problem.

**Why it's brilliant**: Because it would give the system *intuition*. Not in a hand-wavy AI sense. In a precise, evidence-backed, visually-grounded sense: "this run looks like that run, and that run failed at step 14." The dashboard would not just show what is happening. It would show what is *about to happen*, with a quantified confidence and a visual explanation of why. This is the difference between a rearview mirror and a heads-up display. It would make operators feel like they're working with a system that *knows its own patterns*.

**Architectural anchor**: T3.1.7 (Execution Déjà Vu) from the V3 roadmap, the temporal index from T3.1.1, and the resolution receipt sequences from the execution spine. The speedrun statistics module (`lib/domain/speedrun-statistics.ts`) already implements regression detection with z-scores and timing baselines. The breakthrough is making that statistical machinery *visible and spatial* during the run itself.

### 5. The First-Day Intake Flywheel Visualization: Watch the System Bootstrap Itself

**What**: Build a dedicated visualization mode for the first-day autopilot scenario (Moonshot #2 from `docs/moonshots.md`). When Tesseract is pointed at a completely new application and test suite, the dashboard shows the entire bootstrap process as a spatial narrative: the Context Pack forming as the suite is ingested, the ARIA-first capture discovering screens and surfaces, the Suite Slice being selected with prioritization rationale visible, the first deterministic generation producing initial specs, the first run encountering failures, the failure-driven hardening proposals accumulating, the trust-policy gates evaluating them, and the second iteration starting from a richer knowledge base. The entire process — from blank slate to first green tests — is visible as one continuous, narrated spatial sequence. Time-lapse mode lets the operator replay it at 10x-100x speed.

**Why it's technically hard**: This requires choreographing every phase of the dogfooding flywheel into a single coherent visual narrative with smooth transitions between spatial views (the harvest view during capture, the observatory during knowledge formation, the pipeline theater during compilation and execution, the workbench during proposal review, and back to the harvest for the next iteration). Each phase needs its own visual language, but the transitions need to feel like one continuous story, not a slide deck. The time-lapse mode requires recording every event with precise timestamps and replaying them at variable speed without losing spatial coherence. The narration layer needs to summarize what's happening in human-readable terms without being annoying or patronizing.

**Why it's brilliant**: Because watching a system teach itself a new application from scratch would be one of the most compelling technology demonstrations anyone has ever seen. Today, the narrative of "we pointed it at a new app and it figured things out" is told through JSON artifacts and terminal output. With this visualization, it would be told as a *spatial story*: the system arrives in an unknown territory, probes the landscape, builds a map, tries to navigate, stumbles, learns from the stumble, tries again more confidently, and eventually moves through the application with fluency. This is the difference between reading a trip report and watching a nature documentary. It would make Tesseract's value proposition not just intellectually understood, but *emotionally felt*.

**Architectural anchor**: The dogfooding flywheel stages from `docs/dogfooding-flywheel.md` (Context Pack → ARIA-first capture → Suite Slice → Deterministic generation → Failure-driven hardening → Trust-policy gating → Meta-level measurement), the first-day autopilot moonshot from `docs/moonshots.md`, and the speedrun progress events that already stream through the dashboard. The improvement loop ledger provides the iteration structure. The dashboard event bus provides the real-time feed. The breakthrough is weaving them into a single cinematic experience.

---

## Part VI: Design Principles for the Mastered Dashboard

1. **Projection, never dependency.** The dashboard observes the pipeline. It never drives it. Turning the dashboard off must never change the pipeline's behavior or output. This is not a constraint. It is the reason the dashboard can be trusted.

2. **Spatial over textual.** When a fact can be shown as a spatial relationship (position, color, size, trajectory, proximity), it should be. Text is the fallback for what space cannot express. The dashboard's competitive advantage over a terminal is that it can show structure, not just sequence.

3. **Governance is visible.** The three governance states — approved, review-required, blocked — should be ambient and persistent, not buried in details panels. Every element in the scene should silently communicate its governance state through its visual treatment (solid, pulsing, flickering). An operator should be able to glance at the scene and *feel* whether the system is confident or uncertain.

4. **Time is a first-class dimension.** The dashboard should not only show what is happening now, but what happened before and what is likely to happen next. Temporal awareness is what turns observation into intelligence.

5. ✅ **Decisions are events, not buttons.** Every operator action in the dashboard produces a typed event that enters the same event vocabulary as system events and agent events. The workbench panel is not a separate UI. It is a view into the intervention ledger that happens to include action affordances.

6. **Aesthetic quality is a feature.** The bioluminescent glows, the particle transport arcs, the glass pane, the bloom postprocessing — these are not decorations. They are what make the dashboard *compelling enough to watch*. A system that needs to be monitored for hours should be beautiful. Beauty is a feature of sustained attention.

---

## Part VII: The Feeling of the Mastered Dashboard

When Tesseract's visual layer is fully realized, this is what operating it should feel like:

You open the dashboard and see the application — a complex enterprise insurance portal — rendered as a live plane in 3D space. The system is running a dogfood loop. You watch selectors light up across the policy search screen as elements are probed. Green glows for high-confidence test-id matches. Amber for fallback CSS selectors. A brief red flash where something wasn't found, immediately followed by a probe cascade trying alternative strategies.

Particles arc from the DOM through the glass pane into the knowledge observatory on the right. Each particle carries the color of its resolution rung and the brightness of its confidence. The observatory is dense in the center — the well-known screens — and sparse at the edges — the screens the system is still learning. You can see, at a glance, which parts of the application the system understands deeply and which it's still exploring.

The pipeline timeline at the bottom shows iteration 4 of 8. The convergence landscape is forming a plateau — hit rate is stabilizing around 87%. But there's a ridge on the left side: the claims screen, where a recent UI change introduced a new validation flow the knowledge layer hasn't absorbed yet.

A work item pulses in the triage panel: "Approve alias 'policy inception date' → 'effective date' for element policy-search/inception-date." The evidence confidence is 0.91. You click it. The decision burst sends green particles through the glass pane, and you watch the corresponding knowledge node in the observatory shift from pulsing amber to solid green. The system immediately starts iteration 5 with the new knowledge. The ridge in the convergence landscape begins to fill.

An hour later, you scrub the temporal observatory back to iteration 1 and watch the whole thing again at 50x speed. You see the system go from darkness to light — from a blank observatory to a dense, confident, crystallized knowledge base. You see the three moments where your decisions made the biggest difference. You see the exact point where the system's drift radar detected the validation flow change and began proposing repairs. You see the trajectory where the system's own intuition (the déjà vu system) warned it away from a failure path it had seen before.

This is what it looks like when a system understands an application. Not as a screenshot. Not as a DOM tree. Not as a test report. As a living, breathing, *visual intelligence*.

---

*This document is a compass, not a specification. The architectural anchors are real. The design principles are non-negotiable. The moonshots are ambitious. But the feeling — the feeling of watching a system learn — that's the north star.*
