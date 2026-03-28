# The First-Day Intake Flywheel Visualization: Comprehensive Requirements

*A complete requirements specification for Tesseract's most ambitious visual experience — watching the system bootstrap itself on a new application from blank slate to first green tests, rendered as a continuous spatial narrative.*

---

## Preamble: Why This Document Exists

The First-Day Intake Flywheel Visualization is moonshot #5 from `docs/dashboard-vision.md`. It was described there in three paragraphs. This document expands those three paragraphs into a complete requirements specification: not to solve for the implementation, but to describe the visualization in sufficient detail that its possibility becomes structurally apparent.

The premise is simple. Tesseract's most compelling story is this: you point it at a brand-new enterprise application and a brand-new Azure DevOps test suite of roughly 1000 manual tests, and it builds its own on-ramp. It discovers the application's structure, prioritizes a valuable runnable slice, compiles executable tests, runs them, learns from failures, proposes knowledge improvements, gates those improvements through trust policy, and iterates until convergence — all without prior knowledge of the application.

Today, that story is told through JSON artifacts and terminal output. The flywheel visualization tells it as a *spatial narrative*: the system arrives in unknown territory, probes the landscape, builds a map, tries to navigate, stumbles, learns from the stumble, tries again more confidently, and eventually moves through the application with fluency.

This document describes what that narrative looks like, what data feeds it, what events drive it, what transitions connect its scenes, what controls the operator has, what the time-lapse mode requires, and what architectural constraints it must respect.

---

## Part I: The Seven Acts

The flywheel visualization is structured as seven sequential acts, each corresponding to one stage of the dogfooding flywheel defined in `docs/dogfooding-flywheel.md`. Each act has a dominant spatial view, a characteristic visual language, a set of driving events, and a transition into the next act. Together they form one continuous cinematic experience.

The seven acts are:

| Act | Flywheel Stage | Dominant View | Visual Character | Duration (real-time) |
|-----|---------------|---------------|------------------|---------------------|
| 1 | Context Intake | Formation view | Crystallization from void | 5–30 seconds |
| 2 | ARIA-First Capture | Spatial Harvest | Bioluminescent discovery | 30–120 seconds |
| 3 | Suite Slicing | Pipeline Theater | Prioritization cascade | 10–30 seconds |
| 4 | Deterministic Generation | Split: Harvest + Observatory | Compilation lattice | 20–60 seconds |
| 5 | Execution & Failure | Spatial Harvest | Run theater with failure flashes | 60–300 seconds |
| 6 | Hardening & Trust Gating | Glass Pane + Observatory | Proposal flow and governance | 30–120 seconds |
| 7 | Meta-Measurement & Iteration | Pipeline Theater + Scorecard | Convergence landscape | 10–30 seconds |

After Act 7, the visualization loops back to Act 4 for the next iteration, with the knowledge observatory now visibly richer than before. The loop continues until convergence or budget exhaustion.

Total first-iteration real-time duration: approximately 3–12 minutes depending on suite size and application complexity. Subsequent iterations are shorter because the knowledge base is non-empty.

---

### Act 1: Context Intake — *"The system receives its mission"*

#### Narrative

The scene opens on emptiness. The Three.js canvas is dark — no screen plane, no knowledge observatory, no glass pane. Just ambient void with a faint directional light.

Then the Context Pack begins to form. As the ADO suite is ingested, scenario cards materialize one by one in a loose cloud at the center of the scene. Each card is a thin translucent plane bearing the scenario's ADO ID and title. They appear with a soft fade-in and gentle drift, like documents settling onto a desk.

As scenarios accumulate, the cloud self-organizes. Scenarios that share screen references cluster together. Scenarios with overlapping step text drift toward each other. The clustering is not random — it is driven by the same affinity signals that will later drive Suite Slice selection. The operator is seeing the system's first read of the suite's structure, before any compilation has occurred.

Simultaneously, at the edges of the scene, the seed routes provided by the operator appear as faint pathway lines — URLs rendered as luminous threads extending from the left edge toward where the screen plane will eventually appear. These are the entry points the system will use to begin harvesting.

The act concludes when all scenarios have been ingested and the Context Pack is complete. The scenario cloud pulses once — a brief, unified glow — and the scene transitions.

#### Driving Events

| Event Kind | Source | Payload Used | Visual Effect |
|-----------|--------|--------------|---------------|
| `stage-lifecycle` | Pipeline fiber | `stage: 'sync', phase: 'start'` | Scene transition from void to intake |
| `item-pending` | ADO sync | `WorkItem` with scenario metadata | Scenario card materialization |
| `progress` | Speedrun fiber | `phase: 'generate'`, scenario count | Cloud density and organization |
| `stage-lifecycle` | Pipeline fiber | `stage: 'sync', phase: 'complete'` | Context Pack pulse, transition trigger |

#### Spatial Layout

- Camera position: `[0, 0, 6]` — pulled back to see the full cloud
- Scenario cards: centered at `[0, 0, 0]`, spread radius 2.0
- Seed route lines: originate at `[-3, y, 0]` extending toward `[-1.8, y, 0]`
- No screen plane, glass pane, or observatory visible yet

#### Transition to Act 2

The scenario cloud compresses toward the left side of the scene and fades to a ghosted background layer. The camera dollies forward to `[0, 0, 4]` (the standard operating position). The screen plane fades in at `x = -1.8`. The seed route lines brighten and connect to the screen plane. The system is ready to harvest.

---

### Act 2: ARIA-First Capture — *"The system opens its eyes"*

#### Narrative

This is the act where the dashboard earns its most primal emotional response: the feeling of watching a system *see* for the first time.

The screen plane is now visible on the left. The system navigates to the first seed route. The application appears as a live texture (or iframe via the LiveDomPortal when available). For a moment, the application is just an image — the system has no understanding of it.

Then the ARIA capture begins. The system reads the accessibility tree, and as it does, structural annotations begin to bloom across the screen plane. Surface regions — headers, navigation bars, form sections, result grids — appear as faintly glowing rectangular outlines overlaid on the application texture. Each region is labeled with its ARIA landmark role.

Within each region, individual elements begin to glow. The bioluminescent selector glows that already exist in the dashboard light up one by one as the system probes each element. But in the first-day context, these glows carry special significance: this is the *first time* the system has ever seen these elements. The glows should feel tentative — lower intensity, slightly wider spread, as if the system is reaching out carefully rather than confidently grasping.

As each element is probed, a small data card floats briefly near the glow: the element's accessible name, its ARIA role, and the locator rung at which it was found. These cards fade after 2-3 seconds but leave behind a persistent glow at the probe location.

The system then navigates to the next seed route, and the process repeats. Each new screen produces a fresh wave of discovery glows. The operator watches the system methodically working through the application's accessible surface.

Throughout this act, the knowledge observatory on the right side begins to populate. Each discovered screen appears as a new node — initially dim, with few child elements. As elements are found within each screen, child nodes materialize around the screen node. The observatory is sparse and tentative — a constellation just beginning to form.

#### Driving Events

| Event Kind | Source | Payload Used | Visual Effect |
|-----------|--------|--------------|---------------|
| `screen-captured` | Screen observer | `imageBase64`, `url`, `width`, `height` | Screen plane texture update |
| `element-probed` | Resolution pipeline | Full `ElementProbedEvent` payload | Bioluminescent glow spawn |
| `stage-lifecycle` | Pipeline fiber | `stage: 'capture', phase: 'start'` | ARIA overlay activation |
| `knowledge-updated` (new) | Knowledge writer | Screen/element creation events | Observatory node spawn |
| `progress` | Speedrun fiber | Phase metrics | Discovery progress indicators |

#### New Event Requirements

Act 2 requires events not currently in the `DashboardEventKind` vocabulary:

1. **`surface-discovered`**: Emitted when a new surface region is identified from ARIA landmarks. Payload: `{ screen: string, region: string, role: string, boundingBox: BoundingBox, childCount: number }`. Drives the surface region overlay on the screen plane.

2. **`route-navigated`**: Emitted when the system navigates to a new URL. Payload: `{ url: string, screenId: string | null, isSeeded: boolean }`. Drives the seed route line activation and screen plane URL indicator.

3. **`aria-tree-captured`**: Emitted when a full ARIA snapshot is captured for a screen. Payload: `{ screen: string, nodeCount: number, landmarkCount: number, interactableCount: number }`. Drives the ARIA structure bloom effect — a brief pulse of structural light across the screen plane.

#### Spatial Layout

- Camera: standard position `[0, 0, 4]`, fov 50
- Screen plane: `[-1.8, 0, 0]`, 3×2.2
- Surface region overlays: positioned on screen plane at `z = 0.005` (in front of texture)
- Element glows: positioned at DOM-to-world-mapped bounding box centers
- Data cards: floating at `z = 0.03` near their element, with 3-second fade
- Observatory: `[1.8, 0, 0]`, beginning to populate
- Glass pane: `[-0.1, 0, 0.05]`, visible but fully transparent (no frosting yet — nothing to gate)

#### Visual Language: First-Time Discovery

The visual treatment during Act 2 is deliberately different from steady-state operation. In steady state, element probes are confident — bright, focused glows. During first-time discovery, probes should feel exploratory:

- **Glow radius**: 1.5× normal (wider, less focused)
- **Glow intensity**: 0.6× normal (tentative, not confident)
- **Glow color**: Shifted toward blue-white (curiosity) rather than green (confidence)
- **Pulse frequency**: Slower (0.5 Hz vs 2 Hz in steady state)
- **Particle emission**: Fewer particles per probe, slower arc toward observatory

This visual distinction communicates that the system is *learning*, not *executing*. The operator should feel the difference between "the system knows this element" and "the system just met this element."

#### Transition to Act 2→3

The screen plane dims slightly (opacity 0.7). The scenario cloud — ghosted in the background since Act 1 — drifts forward and reorganizes into a ranked vertical list on the left side of the scene. The system is about to choose which scenarios to run first. The camera widens slightly to accommodate both the scenario list and the pipeline view.

---

### Act 3: Suite Slicing — *"The system chooses its battles"*

#### Narrative

The scenario cloud has reorganized into a ranked list. Now the system performs its most strategically important first-day decision: which scenarios to run first.

The Suite Slice selection is visualized as a prioritization cascade. Scenarios at the top of the list glow brighter — they share knowledge with many other scenarios, they exercise high-value screens, they have clear step decomposition paths. Scenarios lower in the list are dimmer — they are isolated, exercise unknown screens, or have ambiguous step text.

A selection boundary — a horizontal luminous line — sweeps down the list. Everything above the line is the Suite Slice: the scenarios that will run in the first iteration. Everything below the line is deferred. The line's position is determined by the system's cost budget and learning-value estimates.

As the line settles, the selected scenarios pulse green. Deferred scenarios fade to a ghosted state. The selected count, estimated coverage, and shared-knowledge density appear as floating metrics near the list.

The act is brief — slicing is a computation, not a discovery process. But it is visually important because it establishes the *scope* of what the operator is about to watch. A 1000-scenario suite being narrowed to a 47-scenario first slice is a dramatic moment. The visualization should make that narrowing feel deliberate and intelligent, not arbitrary.

#### Driving Events

| Event Kind | Source | Payload Used | Visual Effect |
|-----------|--------|--------------|---------------|
| `progress` | Speedrun fiber | `phase: 'compile'`, `scenarioCount` | Slice size indicator |
| `stage-lifecycle` | Pipeline | `stage: 'slice'` | Selection cascade activation |

#### New Event Requirements

1. **`suite-slice-selected`**: Emitted when the Suite Slice is finalized. Payload: `{ selectedCount: number, totalCount: number, estimatedCoverage: number, topScreens: readonly string[], sharedKnowledgeDensity: number, costBudget: number }`. Drives the selection boundary animation and metric display.

2. **`scenario-prioritized`**: Emitted for each scenario as its priority is computed. Payload: `{ adoId: string, priority: number, rank: number, inSlice: boolean, sharedScreens: number, sharedElements: number, decompositionConfidence: number }`. Drives individual scenario card brightness and position in the ranked list.

#### Spatial Layout

- Scenario list: left side, `x = -2.5` to `x = -1.5`, vertical stack
- Selection boundary: horizontal line at variable `y`, animating downward
- Metric cards: floating at `x = -1.0`, showing slice statistics
- Screen plane: dimmed at `x = -1.8`, still showing last captured screen
- Observatory: `x = 1.8`, unchanged from Act 2

#### Transition to Act 3→4

The deferred scenarios dissolve. The selected scenarios compress into a tight queue at the top-left. The screen plane brightens back to full opacity. The pipeline timeline appears at the bottom of the scene — a horizontal track showing compilation phases. The system is about to compile the first slice.

---

### Act 4: Deterministic Generation — *"The system writes its first tests"*

#### Narrative

The compilation phase is the system's first attempt to convert intent into executable code. It is also the phase where the gap between knowledge and ambition becomes starkly visible.

For each scenario in the Suite Slice, the pipeline runs: sync → parse → bind → emit → graph → types. The existing `StageLifecycleEvent` stream drives the pipeline progress visualization at the bottom of the scene. Each stage lights up as it begins and dims when it completes.

But the dramatic tension of Act 4 is not in the pipeline stages — it is in the *binding outcomes*. Each scenario step either binds (the system found a deterministic path from intent to executable action) or defers (the system preserved the raw intent for runtime interpretation). On the first day, with minimal knowledge, many steps will defer.

The visualization shows this as a dual-column effect:

**Left column (screen plane)**: As each scenario is compiled, its steps are overlaid on the screen plane in sequence. Steps that bind deterministically glow green at their target element location. Steps that defer glow amber — they are placed at their best-guess element location but with a wider, more diffuse glow indicating uncertainty. Steps that fail to bind at all flash red briefly.

**Right column (observatory)**: Each successful binding strengthens the corresponding knowledge node. The node brightens, its edges sharpen, and its confidence rises. Each deferred step creates a faint, ghosted node — a placeholder that marks where knowledge is needed but not yet present.

The glass pane between them is now lightly frosted — not fully opaque, but beginning to show the governance boundary. The first proposals begin to form as artifacts in the pipeline, though they will not flow through the glass until Act 6.

#### Driving Events

| Event Kind | Source | Payload Used | Visual Effect |
|-----------|--------|--------------|---------------|
| `stage-lifecycle` | Pipeline | Per-scenario stage transitions | Pipeline progress animation |
| `element-probed` | Binding pipeline | Binding probe results | Green/amber/red glows on screen plane |
| `artifact-written` | Emitter | Spec and trace file writes | Aurora flash at glass pane |
| `progress` | Speedrun fiber | Compilation metrics | Bound/deferred/failed step counts |

#### New Event Requirements

1. **`step-bound`**: Emitted for each scenario step as binding completes. Payload: `{ adoId: string, stepIndex: number, stepText: string, bindingKind: 'bound' | 'deferred' | 'unbound', confidence: number, targetRef: string | null, screen: string | null, element: string | null, resolutionRung: number | null }`. Drives the step overlay on the screen plane and the knowledge strengthening in the observatory.

2. **`scenario-compiled`**: Emitted when an entire scenario completes compilation. Payload: `{ adoId: string, totalSteps: number, boundSteps: number, deferredSteps: number, unboundSteps: number, specPath: string, tracePath: string }`. Drives the per-scenario summary card and triggers the scenario's transition from the queue to the "compiled" state.

#### Visual Language: Binding Confidence

The binding visualization uses a three-tier color language that will persist throughout the remaining acts:

| Binding Kind | Color | Glow Style | Meaning |
|-------------|-------|-----------|---------|
| `bound` (compiler-derived) | Green `#3fb950` | Solid, focused | Deterministic path from intent to action |
| `deferred` (intent-only) | Amber `#d29922` | Diffuse, pulsing | Intent preserved, awaiting runtime interpretation |
| `unbound` (failed) | Red `#f85149` | Brief flash, fading | Explicit structure contradicts approved knowledge |

This color language maps directly to the existing `RUNG_COLORS` in `dashboard/src/spatial/types.ts` and the governance vocabulary.

#### Spatial Layout

- Scenario queue: top-left, `x = -2.5`, scenarios dequeue as compiled
- Screen plane: full brightness, step overlays at `z = 0.01`
- Pipeline timeline: bottom, `y = -1.3`, horizontal stage progression
- Glass pane: lightly frosted (transmission 0.7)
- Observatory: nodes brightening with each successful binding
- Compilation metrics: floating at `x = 0.5, y = 1.2`

#### Transition to Act 4→5

The pipeline timeline dims. The scenario queue is depleted — all scenarios are compiled. The screen plane clears its step overlays. A "Run" indicator pulses at the screen plane's top edge. The system is about to execute its first tests. The camera tightens slightly toward the screen plane — the focus is shifting from compilation to execution.

---

### Act 5: Execution & Failure — *"The system tries, and stumbles, and tries again"*

#### Narrative

This is the longest and most emotionally complex act. The system is now executing its compiled tests against the live application. Some will pass. Many, on the first day, will fail. The visualization must make both outcomes legible without making failure feel like defeat.

The screen plane becomes the primary focus. As each scenario executes, the application responds — pages navigate, forms fill, buttons click, validations fire. The screen texture updates in real-time (at 10fps via `ScreenCapturedEvent`, or live via the iframe portal). The operator watches the actual application being driven.

Overlaid on the screen plane, the resolution ladder becomes visible for each step. When the runtime interpreter encounters a deferred step, it walks the resolution ladder:

1. **Rung 1-3** (deterministic): Quick flashes of green at the target element — the system checks its approved knowledge and either succeeds immediately or moves on.
2. **Rung 4-6** (confidence overlays, prior evidence): Amber probes — the system is consulting learned overlays and prior run evidence. If it finds a match, the amber glow brightens and the step proceeds.
3. **Rung 7** (structured translation): A distinctive visual — a brief shimmer at the glass pane as the system invokes the bounded translation bridge. Translation probes appear with a golden hue.
4. **Rung 8-9** (live DOM, agent interpretation): Blue-purple probes appear, wider and more exploratory. The system is reaching into the live DOM or invoking agentic interpretation. These probes feel fundamentally different from deterministic resolution — they carry visible uncertainty.
5. **Rung 10** (needs-human): A red pulse at the element location. The step has exhausted all non-human paths. If the dashboard is in intervention mode, the fiber pauses and the decision overlay appears.

When a step succeeds, the element glow solidifies and a particle arcs toward the observatory — carrying the resolution evidence. When a step fails, the glow flashes red, shatters into fading fragments, and the failure is recorded as a pending hardening proposal.

The execution act produces the most information-dense visualization. Multiple scenarios may execute concurrently (depending on the runbook configuration). The ingestion queue staggering (60ms for probes, 80ms for escalations) ensures the visual flow remains legible even under high event throughput.

#### Driving Events

| Event Kind | Source | Payload Used | Visual Effect |
|-----------|--------|--------------|---------------|
| `screen-captured` | Playwright observer | Screenshot data | Live screen texture updates |
| `element-probed` | Resolution pipeline | Full probe payload with rung, strategy, confidence | Resolution ladder visualization |
| `element-escalated` | Resolution pipeline | Actor transition details | Escalation indicator (color shift) |
| `rung-shift` | Iteration metrics | Rung distribution after step | Real-time rung distribution update |
| `item-pending` | Workbench | Failure-generated work items | Failure indicator at element |
| `item-processing` | Workbench | Active work item | Processing highlight |
| `item-completed` | Workbench | Resolution of work item | Completion animation |
| `fiber-paused` | Decision gate | Pause context (element, screen) | Decision overlay activation |
| `fiber-resumed` | Decision gate | Decision result | Decision burst animation |
| `calibration-update` | Calibration system | Weight drift, correlations | Calibration radar update |

#### New Event Requirements

1. **`step-executing`**: Emitted as each scenario step begins runtime execution. Payload: `{ adoId: string, stepIndex: number, stepText: string, screen: string, element: string | null, resolutionMode: 'deterministic' | 'translation' | 'agentic', estimatedRung: number }`. Drives the step-level focus indicator on the screen plane.

2. **`step-resolved`**: Emitted when a step completes execution (success or failure). Payload: `{ adoId: string, stepIndex: number, success: boolean, actualRung: number, durationMs: number, failureClass: PipelineFailureClass | null, proposalDrafted: boolean, evidenceRecorded: boolean }`. Drives the success/failure animation and the evidence particle toward the observatory.

3. **`scenario-executed`**: Emitted when an entire scenario completes execution. Payload: `{ adoId: string, passed: boolean, totalSteps: number, passedSteps: number, failedSteps: number, durationMs: number, resolutionDistribution: readonly RungRate[] }`. Drives the scenario-level summary and the execution receipt particle.

#### Visual Language: The Resolution Ladder Walk

The most novel visual element of Act 5 is the *visible resolution ladder walk*. When a deferred step is being resolved at runtime, the walk is rendered as a sequence of concentric probe rings emanating from the target element's position on the screen plane:

- Each ring represents one rung attempt
- Ring color follows `RUNG_COLORS` from `dashboard/src/spatial/types.ts`
- Ring radius increases with each successive rung (wider search = wider ring)
- A successful rung stops the sequence and solidifies into a focused glow
- Failed rungs leave fading ring ghosts behind
- The final ring (success or needs-human) determines the element's persistent glow color

This visual metaphor communicates the system's resolution strategy without text. An operator watching the visualization learns to read the rings: tight green rings mean deterministic success. Wide amber-to-purple rings mean the system had to work hard. A final red ring means the system gave up.

#### Spatial Layout

- Screen plane: full brightness, primary focus
- Resolution probe rings: centered on element positions, `z = 0.02`
- Evidence particles: arcing from screen plane to observatory on success
- Failure fragments: scattering from element position on failure, fading over 1 second
- Pipeline timeline: showing per-scenario execution progress
- Decision overlay: floating near paused element when fiber pauses
- Calibration radar: corner widget showing weight drift in real-time

#### Transition to Act 5→6

Execution completes. The screen plane dims slightly. The accumulated failure fragments — which have been scattering and fading throughout the act — coalesce into a visible cluster near the glass pane. These represent the hardening proposals that the system has drafted from its failures. The glass pane begins to frost more heavily, preparing for the governance evaluation. The camera shifts slightly rightward — the focus is moving from "what happened" to "what should change."

---

### Act 6: Hardening & Trust-Policy Gating — *"The system proposes, and governance decides"*

#### Narrative

The glass pane becomes the center of attention. The proposal cluster — coalesced from execution failures — approaches the glass from the left. Each proposal is a distinct particle with metadata encoded in its visual properties:

- **Color**: Maps to the proposal's artifact type (selector repair = cyan, alias addition = blue, hint creation = green, pattern promotion = amber, surface decomposition fix = magenta)
- **Size**: Maps to confidence score (larger = higher confidence, more evidence)
- **Pulse rate**: Maps to governance prediction (steady = likely approved, fast pulse = likely review-required)

One by one, proposals encounter the glass pane. The trust-policy evaluator assesses each proposal against the configured thresholds (confidence floors per artifact class, from the `ScorecardHighWaterMark` and trust-policy YAML).

Proposals that pass the trust-policy threshold *pass through the glass*. They emerge on the knowledge side with a brief aurora flash (the existing `ArtifactAurora` effect) and arc toward their destination node in the observatory. On arrival, the knowledge node brightens — its confidence increases, new aliases appear as floating text, its governance tint shifts from amber toward green.

Proposals that do not pass the threshold *reflect off the glass*. They bounce back toward the left side and drift to the workbench queue at the bottom, where they appear as pending work items for the operator. If the dashboard is in intervention mode and the fiber has paused for this decision, the decision overlay appears.

Proposals that are actively blocked by trust policy *shatter against the glass*. Their fragments scatter in red and fade — the system cannot automatically activate this knowledge, and the operator is notified.

This act is where the governance boundary becomes viscerally real. The operator watches the system's proposals being evaluated not by an opaque algorithm but by a visible, physical gate. They can *see* which proposals the system is confident enough to self-approve and which require human judgment.

#### Driving Events

| Event Kind | Source | Payload Used | Visual Effect |
|-----------|--------|--------------|---------------|
| `proposal-activated` | Trust policy evaluator | `proposalId`, `status`, `confidence`, `artifactType` | Particle pass-through or reflection |
| `artifact-written` | Knowledge writer | `path`, artifact type | Aurora flash at glass pane |
| `confidence-crossed` | Confidence tracker | Threshold crossing details | Knowledge node governance tint shift |
| `item-pending` | Workbench | Rejected proposals as work items | Workbench queue population |
| `fiber-paused` | Decision gate | Proposal requiring human decision | Decision overlay at glass pane |
| `fiber-resumed` | Decision gate | Human decision result | Decision burst animation |

#### New Event Requirements

1. **`trust-policy-evaluated`**: Emitted for each proposal as the trust policy evaluates it. Payload: `{ proposalId: string, artifactType: string, confidence: number, threshold: number, decision: 'approved' | 'review-required' | 'blocked', reasons: readonly string[], trustPolicyRule: string }`. Drives the glass-pane interaction animation (pass, reflect, or shatter).

2. **`knowledge-activated`**: Emitted when a proposal successfully activates into canonical knowledge. Payload: `{ proposalId: string, screen: string, element: string | null, artifactPath: string, previousConfidence: number, newConfidence: number, activatedAliases: readonly string[] }`. Drives the knowledge node brightening and alias text appearance.

#### Glass Pane Physics

The glass pane interaction requires a simple particle physics model:

- **Pass-through**: Particle decelerates as it approaches the glass (0.5× speed at contact), passes through with a brief distortion effect (the glass shimmers at the contact point), then accelerates toward the observatory target.
- **Reflection**: Particle decelerates, contacts the glass, and bounces back with an elastic coefficient of 0.7. The glass emits a brief amber pulse at the contact point. The reflected particle drifts downward toward the workbench queue.
- **Shatter**: Particle decelerates, contacts the glass, and fragments into 5-8 smaller particles that scatter in random directions with red coloring and 1-second fade. The glass emits a brief red pulse.

These physics are purely visual — they have no effect on the pipeline's actual behavior. The physics model should be implemented as a pure function in the spatial layer.

#### Spatial Layout

- Glass pane: `[-0.1, 0, 0.05]`, fully frosted (transmission 0.3), primary focus
- Proposal cluster: approaching from `x = -0.5` toward glass
- Knowledge observatory: `[1.8, 0, 0]`, receiving activated proposals
- Workbench queue: bottom of scene, `y = -1.5`, receiving reflected proposals
- Decision overlay: centered on glass pane when fiber pauses
- Aurora effect: at glass pane surface, brief emissive flashes

#### Transition to Act 6→7

The glass pane returns to a semi-transparent state. The camera pulls back to a wider view. The pipeline timeline reappears, now showing iteration-level metrics rather than stage-level progress. Fitness gauges materialize — knowledge hit rate, convergence velocity, proposal yield. The system is about to assess what it learned.

---

### Act 7: Meta-Measurement & Iteration — *"The system measures what it learned"*

#### Narrative

The final act of each iteration is the assessment: what improved, what still blocks progress, and whether convergence is approaching.

The Pipeline Theater view takes center stage. The iteration timeline — previously showing per-scenario details — now shows the iteration-level summary. A new column appears in the timeline for this iteration, containing:

- **Knowledge hit rate**: The percentage of steps resolved through approved knowledge. Rendered as a vertical bar, green portion = knowledge hits, amber = translation, red = unresolved. On the first iteration, this bar will be mostly amber and red. On subsequent iterations, the green portion grows visibly.
- **Convergence velocity**: How quickly the hit rate is changing. Rendered as an arrow above the bar — pointing up means improving, horizontal means stalling, down means regressing.
- **Proposal yield**: How many proposals were generated versus activated. Rendered as a small ratio indicator.

Below the timeline, the Benchmark Scorecard materializes as a floating panel showing the nine scorecard categories from `docs/dogfooding-flywheel.md`:

| Metric | Visual Encoding |
|--------|----------------|
| Intake latency | Clock icon + duration |
| Bind coverage | Percentage bar (green/amber/red) |
| Runnable-slice yield | Fraction indicator |
| Pass rate | Percentage with trend arrow |
| Failure-class mix | Stacked bar by failure class |
| Repair loops | Counter with iteration trend |
| Knowledge churn | Volatility indicator |
| Evidence sufficiency | Threshold proximity gauge |
| Time & token cost | Cumulative cost counter |

The scorecard is not just data — it is the system's honest self-assessment. The visualization should make the scorecard feel like a report card: clear, legible, and consequential. If the system is struggling, the scorecard should make that visible. If the system is improving, the scorecard should make that feel earned.

#### Convergence Decision

At the end of Act 7, the system makes a convergence decision. The `ImprovementLoopConvergenceReason` enum determines what happens next:

- **`null`** (not converged): The visualization loops back to Act 4 for the next iteration. The transition is a brief "reset" animation — the screen plane refreshes, the pipeline timeline advances to the next column, and the scenario queue repopulates with the re-prioritized slice.
- **`'threshold-met'`**: Convergence achieved. A distinctive visual moment — the entire scene pulses with a slow, deep green glow. The observatory crystallizes (nodes stop pulsing and become solid). The glass pane becomes fully transparent. The system has learned enough.
- **`'no-proposals'`**: No more proposals to activate. Similar to threshold-met but with an amber tint — the system has done what it can.
- **`'budget-exhausted'`**: Time or iteration budget exhausted. The scene transitions to a summary view with amber tinting — the system ran out of runway.
- **`'max-iterations'`**: Similar to budget-exhausted but with iteration count emphasis.

#### Driving Events

| Event Kind | Source | Payload Used | Visual Effect |
|-----------|--------|--------------|---------------|
| `progress` | Speedrun fiber | Full `SpeedrunProgressEvent` | Scorecard and timeline update |
| `rung-shift` | Iteration metrics | Per-iteration rung distribution | Hit rate bar rendering |
| `calibration-update` | Calibration | Weight drift, correlations | Convergence velocity indicator |
| `iteration-complete` | Speedrun fiber | Iteration boundary marker | Timeline column completion |
| `iteration-start` | Speedrun fiber | Next iteration boundary | Loop-back transition trigger |
| `fitness-updated` | Fitness evaluator | Full scorecard update | Scorecard panel refresh |

#### New Event Requirements

1. **`convergence-evaluated`**: Emitted when the convergence check completes. Payload: `{ iteration: number, converged: boolean, reason: ImprovementLoopConvergenceReason, knowledgeHitRate: number, previousHitRate: number, delta: number, proposalsRemaining: number, budgetRemaining: { iterations: number, tokens: number | null } }`. Drives the convergence decision animation.

2. **`iteration-summary`**: Emitted at the end of each iteration with aggregate metrics. Payload: `{ iteration: number, scenariosExecuted: number, scenariosPassed: number, scenariosFailed: number, stepsResolved: number, stepsDeferred: number, stepsUnresolved: number, proposalsGenerated: number, proposalsActivated: number, proposalsBlocked: number, knowledgeNodesCreated: number, knowledgeNodesUpdated: number, wallClockMs: number, tokenEstimate: number | null }`. Drives the scorecard panel population.

#### The Iteration Loop Transition

When the system does not converge, the transition from Act 7 back to Act 4 is the most narratively important moment in the flywheel visualization. This is where the operator sees the *feedback loop closing*. The transition should communicate:

1. The knowledge observatory is now richer than it was at the start of the previous iteration. Nodes that were dim are now brighter. New nodes have appeared. The constellation is denser.
2. The scenario slice may have changed. New scenarios may be prioritized because newly activated knowledge makes them resolvable. Previously-failing scenarios may be re-queued with higher confidence.
3. The system's overall confidence is higher. The ambient light is slightly brighter. The glows are slightly more intense. The particles move slightly faster.

This accumulation effect is critical. Each iteration should feel like *progress*, even if the pass rate only improved by 3%. The visualization must make small gains visible and emotionally satisfying.

---

## Part II: The Event Architecture

The flywheel visualization consumes events from the pipeline and transforms them into spatial animations. This section specifies the complete event contract.

### Existing Events Consumed

The following events from the current `DashboardEventKind` vocabulary (defined in `lib/domain/types/dashboard.ts`) are consumed by the flywheel visualization without modification:

| Event Kind | Acts | Usage |
|-----------|------|-------|
| `stage-lifecycle` | 1, 2, 3, 4, 7 | Phase transitions drive act boundaries |
| `element-probed` | 2, 4, 5 | Element discovery and resolution probes |
| `screen-captured` | 2, 5 | Live screen texture updates |
| `element-escalated` | 5 | Actor transitions during resolution |
| `rung-shift` | 5, 7 | Resolution rung distribution per iteration |
| `calibration-update` | 5, 7 | Weight drift and signal correlations |
| `proposal-activated` | 6 | Proposal pass-through/reflection at glass pane |
| `confidence-crossed` | 6 | Knowledge node governance transitions |
| `artifact-written` | 4, 6 | Aurora flash at glass pane on file writes |
| `item-pending` | 5, 6 | Work item creation from failures/rejected proposals |
| `item-processing` | 5 | Active work item highlight |
| `item-completed` | 5, 6 | Work item resolution |
| `fiber-paused` | 5, 6 | Decision overlay activation |
| `fiber-resumed` | 5, 6 | Decision burst animation |
| `progress` | 1, 2, 3, 4, 5, 7 | Phase-level progress metrics |
| `iteration-start` | 7 | Iteration boundary, loop-back trigger |
| `iteration-complete` | 7 | Iteration boundary, timeline column completion |
| `workbench-updated` | 5, 6 | Workbench panel refresh |
| `fitness-updated` | 7 | Scorecard panel refresh |

### New Events Required

The flywheel visualization requires 11 new event kinds that do not exist in the current vocabulary. These events are additive — they extend `DashboardEventKind` without modifying existing events.

| New Event Kind | Act | Payload Summary | Purpose |
|---------------|-----|----------------|---------|
| `surface-discovered` | 2 | screen, region, role, boundingBox, childCount | Surface region overlay on screen plane |
| `route-navigated` | 2 | url, screenId, isSeeded | Seed route activation and URL indicator |
| `aria-tree-captured` | 2 | screen, nodeCount, landmarkCount, interactableCount | ARIA structure bloom effect |
| `suite-slice-selected` | 3 | selectedCount, totalCount, coverage, topScreens | Selection boundary animation |
| `scenario-prioritized` | 3 | adoId, priority, rank, inSlice, sharedScreens | Scenario card brightness and position |
| `step-bound` | 4 | adoId, stepIndex, bindingKind, confidence, targetRef | Step overlay on screen plane |
| `scenario-compiled` | 4 | adoId, totalSteps, boundSteps, deferredSteps | Per-scenario compilation summary |
| `step-executing` | 5 | adoId, stepIndex, screen, element, resolutionMode | Step-level focus during execution |
| `step-resolved` | 5 | adoId, stepIndex, success, actualRung, failureClass | Success/failure animation per step |
| `scenario-executed` | 5 | adoId, passed, resolutionDistribution | Scenario-level execution summary |
| `trust-policy-evaluated` | 6 | proposalId, decision, confidence, threshold | Glass pane interaction animation |
| `knowledge-activated` | 6 | proposalId, screen, element, newConfidence | Knowledge node brightening |
| `convergence-evaluated` | 7 | converged, reason, hitRate, delta | Convergence decision animation |
| `iteration-summary` | 7 | Full iteration aggregate metrics | Scorecard panel population |

### Event Emission Contract

All new events follow the same contract as existing dashboard events:

```typescript
interface DashboardEvent {
  readonly type: DashboardEventKind;
  readonly timestamp: string;  // ISO 8601
  readonly data: unknown;      // typed per event kind
}
```

New events are emitted through the same `DashboardPort.emit()` interface. They are fire-and-forget — they never block the Effect fiber. They flow through the same `PipelineEventBus` (Effect.PubSub → SharedArrayBuffer ring → WebSocket broadcast) as existing events.

The `DisabledDashboard` implementation silently drops all events, preserving the architectural invariant that the dashboard is a projection, never a dependency.

### Event Throughput Estimates

During the first-day flywheel, event throughput varies dramatically by act:

| Act | Events/sec (estimated) | Bottleneck | Mitigation |
|-----|----------------------|-----------|------------|
| 1 (Intake) | 10-50 | Scenario card materialization | Batch ingestion, stagger at 100ms |
| 2 (Capture) | 50-200 | Element probes per screen | Existing 60ms stagger for probes |
| 3 (Slicing) | 5-20 | One event per scenario prioritized | No staggering needed |
| 4 (Generation) | 100-500 | Step bindings across scenarios | Stagger at 40ms, batch per scenario |
| 5 (Execution) | 200-1000 | Resolution ladder walks (multiple probes per step) | Existing ingestion queues |
| 6 (Gating) | 10-100 | Proposals evaluated | Stagger at 100ms for visual clarity |
| 7 (Measurement) | 5-10 | Iteration-level summaries | No staggering needed |

The existing `useIngestionQueue` hook with configurable `staggerMs` and `maxBuffer` handles the high-throughput acts. The flywheel visualization may need to configure multiple ingestion queues with act-specific stagger rates.

---

## Part III: The Time-Lapse and Recording System

The flywheel visualization has two temporal modes: **live mode** (events arrive in real-time from the pipeline fiber) and **time-lapse mode** (recorded events are replayed at variable speed). Both modes must render through the same spatial components — the only difference is the event source and playback rate.

### Why Time-Lapse Matters

A first-day intake can take 30 minutes to several hours depending on suite size, application complexity, and iteration count. No operator will watch the full process in real-time. But watching a 2-hour bootstrap compressed into a 3-minute time-lapse — with the knowledge observatory visibly growing from empty to dense, the pass rate climbing from 0% to 87%, and the convergence landscape forming its plateau — is one of the most compelling demonstrations of Tesseract's value. The time-lapse is not a convenience feature. It is potentially the primary consumption mode of the flywheel visualization.

### Recording Infrastructure

#### Event Journal

Every `DashboardEvent` emitted during a flywheel run must be persisted to an append-only journal file with precise timestamps. This journal is the recording medium for time-lapse playback.

```
Path: .tesseract/runs/{runId}/dashboard-events.jsonl
Format: JSON Lines (one DashboardEvent per line)
Ordering: Strictly chronological by emission timestamp
Size estimate: 50-200 KB per iteration (mostly element-probed and step-resolved events)
Total for 5-iteration run: 250 KB - 1 MB
```

The journal is written by a new `PipelineEventBus` subscriber — a `JournalWriter` fiber that consumes events from the PubSub and appends them to the JSONL file. This subscriber is architecturally identical to the existing `SharedArrayBuffer` writer and `WebSocket` broadcaster subscribers.

```typescript
// New subscriber added to PipelineEventBus
interface JournalWriterConfig {
  readonly journalPath: string;
  readonly flushIntervalMs: number;  // default: 1000 (batch writes for performance)
  readonly maxFileSizeBytes: number; // default: 10MB (safety cap)
}
```

The journal writer batches events and flushes periodically rather than writing per-event, to avoid filesystem overhead during high-throughput acts (Act 5 can produce 1000+ events/second).

#### Event Journal Schema

Each line in the journal is a self-contained `DashboardEvent`:

```typescript
interface JournaledEvent {
  readonly type: DashboardEventKind;
  readonly timestamp: string;           // ISO 8601 — original emission time
  readonly sequenceNumber: number;      // monotonic counter for ordering stability
  readonly iteration: number;           // which flywheel iteration produced this event
  readonly act: FlyWheelAct;            // which act this event belongs to (derived)
  readonly data: unknown;               // typed per event kind
}

type FlyWheelAct = 1 | 2 | 3 | 4 | 5 | 6 | 7;
```

The `act` field is derived at journal-write time from the event type and pipeline phase. It enables efficient seeking during time-lapse playback (jump to Act 3 of iteration 2).

#### Journal Index

A companion index file enables efficient random access into the journal:

```
Path: .tesseract/runs/{runId}/dashboard-events.index.json
```

```typescript
interface JournalIndex {
  readonly kind: 'dashboard-event-journal-index';
  readonly version: 1;
  readonly runId: string;
  readonly totalEvents: number;
  readonly totalDurationMs: number;
  readonly iterations: readonly {
    readonly iteration: number;
    readonly startOffset: number;      // byte offset in JSONL
    readonly endOffset: number;
    readonly startTimestamp: string;
    readonly endTimestamp: string;
    readonly eventCount: number;
    readonly acts: readonly {
      readonly act: FlyWheelAct;
      readonly startOffset: number;
      readonly endOffset: number;
      readonly startTimestamp: string;
      readonly endTimestamp: string;
      readonly eventCount: number;
    }[];
  }[];
}
```

The index is written once at the end of the run (or updated incrementally if the journal is still being written). It enables the playback system to seek to any iteration/act boundary without scanning the full journal.

### Playback System

#### Playback Controller

The playback system is a React hook that reads from the journal and emits events through the same dispatch pathway as the live WebSocket connection:

```typescript
interface PlaybackController {
  /** Current playback state */
  readonly state: 'idle' | 'playing' | 'paused' | 'seeking' | 'complete';
  
  /** Current playback speed (1.0 = real-time) */
  readonly speed: number;
  
  /** Current playback position as fraction of total duration [0, 1] */
  readonly position: number;
  
  /** Current iteration and act */
  readonly currentIteration: number;
  readonly currentAct: FlyWheelAct;
  
  /** Total duration of the recorded run */
  readonly totalDurationMs: number;
  
  /** Controls */
  readonly play: () => void;
  readonly pause: () => void;
  readonly setSpeed: (speed: number) => void;    // 0.5x to 100x
  readonly seekToPosition: (fraction: number) => void;
  readonly seekToIteration: (iteration: number) => void;
  readonly seekToAct: (iteration: number, act: FlyWheelAct) => void;
  readonly stepForward: () => void;               // advance one event
  readonly stepBackward: () => void;              // rewind one event
}
```

#### Playback Speed Tiers

The time-lapse mode supports predefined speed tiers optimized for different viewing intentions:

| Speed | Label | Use Case | Event Processing |
|-------|-------|----------|-----------------|
| 0.5× | Slow motion | Detailed analysis of specific moments | Full stagger timing preserved |
| 1× | Real-time | Reliving the actual experience | Normal event timing |
| 5× | Quick review | Watching one iteration at 1/5 time | Stagger timing compressed 5× |
| 10× | Summary | Watching full run in ~6-12 minutes | Stagger timing compressed, minor events batched |
| 25× | Overview | Watching full run in ~2-5 minutes | Most events batched, only act transitions rendered individually |
| 50× | Fast-forward | Scanning for specific moments | Only iteration boundaries and scorecard updates rendered |
| 100× | Sprint | Maximum compression | Only convergence events and final scorecard rendered |

At high playback speeds (25×+), the visualization must batch events rather than rendering each one individually. The batching strategy:

1. **Below 10×**: All events rendered individually with compressed stagger timing
2. **10×–25×**: `element-probed` events batched per screen (one composite glow per screen per batch). `step-resolved` events batched per scenario. All other events rendered individually.
3. **25×–50×**: Only act-transition events, `iteration-summary`, `convergence-evaluated`, and `fitness-updated` rendered individually. All probe/step/proposal events contribute to aggregate visual state but are not animated individually.
4. **Above 50×**: Only iteration boundaries rendered. The observatory and scorecard update in discrete jumps per iteration. Particle transport is disabled. The visualization becomes a slide show of iteration snapshots with smooth interpolation between them.

#### Scrubber UI

The playback UI is a horizontal timeline control docked at the bottom of the viewport:

```
┌─────────────────────────────────────────────────────────────────────┐
│ ◀◀  ▶  ▶▶  │ 0:23 / 47:12  │  ════════●══════════════  │  10×  ▼ │
│             │               │  ↑ Act markers + iteration │         │
│             │               │    boundaries visible      │         │
└─────────────────────────────────────────────────────────────────────┘
```

- **Scrub bar**: Shows the full timeline with act markers (colored segments) and iteration boundaries (vertical lines)
- **Act markers**: Each act segment is colored according to its dominant visual character (blue for capture, green for generation, red-amber for execution, gold for gating, white for measurement)
- **Iteration boundaries**: Vertical lines with iteration number labels
- **Hover preview**: Hovering over the scrub bar shows a tooltip with the iteration, act, timestamp, and key metric at that point (knowledge hit rate)
- **Click-to-seek**: Clicking anywhere on the scrub bar seeks to that position
- **Keyboard shortcuts**: Space = play/pause, Left/Right = step, Shift+Left/Right = seek to previous/next act boundary, Up/Down = speed tier

### Bookmark System

The time-lapse mode includes a bookmark system for marking and returning to significant moments:

#### Auto-Bookmarks

The system automatically bookmarks these moments during recording:

| Moment | Trigger | Label |
|--------|---------|-------|
| First element discovered | First `element-probed` event | "First discovery" |
| First scenario compiled | First `scenario-compiled` event | "First compilation" |
| First test passed | First `scenario-executed` with `passed: true` | "First green test" |
| First proposal activated | First `proposal-activated` with `status: 'activated'` | "First knowledge activation" |
| First human decision | First `fiber-paused` event | "First human intervention" |
| Each iteration boundary | Each `iteration-start` event | "Iteration N start" |
| Convergence achieved | `convergence-evaluated` with `converged: true` | "Convergence" |
| Largest hit-rate jump | Iteration with max `delta` in `convergence-evaluated` | "Biggest improvement" |

#### Manual Bookmarks

The operator can create manual bookmarks during live or playback viewing by pressing `B` or clicking a bookmark button. Each bookmark stores the current position, a user-provided label, and the current scene state snapshot (camera position, active probes, knowledge node count).

### Recording as Artifact

The event journal and index are standard Tesseract artifacts. They are:

- Written to `.tesseract/runs/{runId}/` alongside other run artifacts
- Included in the `DogfoodRun` ledger reference
- Available for replay through the dashboard server's REST API
- Consumable by the same MCP tool endpoints that serve live data

The dashboard server exposes a playback API:

```
GET /api/runs                              → list available recorded runs
GET /api/runs/{runId}/journal              → stream journal JSONL
GET /api/runs/{runId}/journal/index        → get journal index
GET /api/runs/{runId}/journal/seek?offset= → seek to byte offset
```

This enables the playback controller to load journals on demand without pre-loading the entire file into memory.

---

## Part IV: Camera Choreography and Scene Transitions

The flywheel visualization is a continuous spatial narrative. The camera is the narrator's eye. Its position, field of view, and movement determine what the operator sees at each moment and how the seven acts flow into each other.

### Camera States

The camera operates in seven named states, each associated with one or more acts:

| State | Position | FOV | Target | Acts | Character |
|-------|----------|-----|--------|------|-----------|
| `void` | `[0, 0, 6]` | 40 | `[0, 0, 0]` | 1 (start) | Pulled back, wide view of forming context |
| `harvest` | `[0, 0, 4]` | 50 | `[-1.8, 0, 0]` | 2, 5 | Standard position, focused on screen plane |
| `slice` | `[-0.5, 0, 4.5]` | 55 | `[-2, 0, 0]` | 3 | Shifted left to see scenario list + screen |
| `compile` | `[0, 0, 4]` | 50 | `[0, 0, 0]` | 4 | Centered, seeing both screen and observatory |
| `gate` | `[0.3, 0, 3.5]` | 45 | `[-0.1, 0, 0]` | 6 | Shifted right and closer to glass pane |
| `measure` | `[0, 0.3, 4.5]` | 55 | `[0, -0.5, 0]` | 7 | Pulled back + up, seeing full scene + timeline |
| `summary` | `[0, 0, 5]` | 50 | `[0, 0, 0]` | Final | Centered, balanced view of complete scene |

### Transition Choreography

Each act transition involves a camera move plus scene element changes. Transitions should take 1.5–3 seconds and use cubic ease-in-out interpolation for both position and FOV.

#### Transition 1→2: Void to Harvest

```
Duration: 2.5 seconds
Camera: [0,0,6] → [0,0,4], FOV 40 → 50
Scene:
  - Scenario cloud compresses to left, fades to 20% opacity
  - Screen plane fades in from 0% to 100% opacity
  - Seed route lines brighten and connect to screen plane
  - Glass pane appears at 90% transparency
  - Observatory space becomes visible (empty)
```

#### Transition 2→3: Harvest to Slice

```
Duration: 1.5 seconds
Camera: [0,0,4] → [-0.5,0,4.5], FOV 50 → 55
Scene:
  - Screen plane dims to 70% opacity
  - Scenario cloud drifts forward from background
  - Scenarios reorganize into ranked vertical list at x=-2.5
  - Selection boundary line appears at top of list
```

#### Transition 3→4: Slice to Compile

```
Duration: 2 seconds
Camera: [-0.5,0,4.5] → [0,0,4], FOV 55 → 50
Scene:
  - Deferred scenarios dissolve
  - Selected scenarios compress into queue at top-left
  - Screen plane brightens to 100% opacity
  - Pipeline timeline fades in at bottom
  - Glass pane frosts slightly (transmission 0.7)
```

#### Transition 4→5: Compile to Execute

```
Duration: 1.5 seconds
Camera: [0,0,4] → [0,0,4] (no move, slight zoom via FOV 50 → 48)
Scene:
  - Pipeline timeline shifts to execution mode
  - Step overlays clear from screen plane
  - "Run" indicator pulses at screen plane top edge
  - Calibration radar appears in corner
```

#### Transition 5→6: Execute to Gate

```
Duration: 2 seconds
Camera: [0,0,4] → [0.3,0,3.5], FOV 48 → 45
Scene:
  - Screen plane dims to 60% opacity
  - Failure fragments coalesce near glass pane
  - Glass pane frosts heavily (transmission 0.3)
  - Proposal cluster forms at x=-0.5
  - Workbench queue appears at bottom
```

#### Transition 6→7: Gate to Measure

```
Duration: 2 seconds
Camera: [0.3,0,3.5] → [0,0.3,4.5], FOV 45 → 55
Scene:
  - Glass pane returns to semi-transparent (transmission 0.6)
  - Pipeline timeline shifts to iteration mode
  - Scorecard panel materializes at center-bottom
  - Fitness gauges appear
  - Observatory settles (node positions stabilize)
```

#### Transition 7→4 (Loop): Measure to Compile (next iteration)

```
Duration: 2.5 seconds
Camera: [0,0.3,4.5] → [0,0,4], FOV 55 → 50
Scene:
  - Scorecard panel shrinks to a compact form and docks at top-right
  - Iteration timeline advances (new column appears)
  - Observatory nodes pulse once (acknowledging new knowledge)
  - Scenario queue repopulates with re-prioritized slice
  - Screen plane brightens to 100%
  - Ambient light intensity increases by 5% (cumulative per iteration)
  - Glass pane frosts slightly
```

#### Convergence Finale

```
Duration: 4 seconds
Camera: current → [0,0,5], FOV → 50
Scene:
  - Green pulse radiates outward from observatory center
  - All knowledge nodes solidify (stop pulsing)
  - Glass pane becomes fully transparent
  - Particle transport ceases (no more flow needed)
  - Scorecard expands to full-size summary panel
  - Ambient light reaches maximum brightness
  - Bloom intensity increases to 1.2 (everything glows slightly)
```

### Camera Override: Operator Control

During both live and playback modes, the operator can override the automated camera choreography:

- **Mouse drag**: Orbit camera around the scene center
- **Scroll wheel**: Zoom in/out (FOV adjustment)
- **Double-click on element**: Snap camera to focus on that element's position
- **Double-click on knowledge node**: Snap camera to focus on observatory region
- **Press `Home`**: Return to automated choreography position for current act
- **Press `1`–`7`**: Jump camera to the named state for that act number

When the operator overrides the camera, automated choreography pauses. It resumes when the operator presses `Home` or when an act transition occurs (with a smooth blend from the operator's current position to the transition target).

---

## Part V: The Narration Layer

The flywheel visualization tells a story. The spatial scene provides the visual narrative. The narration layer provides the textual companion — brief, contextual captions that explain what the operator is seeing without being intrusive.

### Design Principles for Narration

1. **Show, don't tell, whenever possible.** If the visual is clear, the caption is unnecessary. Narration fills gaps that the spatial scene cannot communicate alone — motivations, statistics, and strategy.

2. **No scrolling text walls.** Every caption is a single sentence or a short metric cluster. If it takes more than 3 seconds to read, it is too long.

3. **Contextual, not instructional.** Captions describe what the system is doing and why, not what the operator should do. The operator is an observer (in autopilot mode) or a decision-maker (in intervention mode), never a student being lectured.

4. **Fade, don't persist.** Captions appear, remain for 4–6 seconds, and fade. They do not accumulate. The scene is the persistent visual — captions are ephemeral annotations.

5. **Narration is optional.** The visualization must be fully comprehensible without narration for experienced operators. A toggle (`N` key or settings) disables all captions.

### Caption Catalog

#### Act 1: Context Intake

| Trigger | Caption | Position | Duration |
|---------|---------|----------|----------|
| First scenario card appears | "Ingesting {count} scenarios from Azure DevOps" | Top center | 5s |
| Scenario clustering begins | "Organizing by shared screen affinity" | Center | 4s |
| Seed routes appear | "{count} seed routes provided" | Left edge | 4s |
| Context Pack complete | "Context Pack ready — {count} scenarios, {screenCount} screens referenced" | Center | 5s |

#### Act 2: ARIA-First Capture

| Trigger | Caption | Position | Duration |
|---------|---------|----------|----------|
| First screen navigation | "Navigating to {url}" | Screen plane top | 4s |
| ARIA tree captured | "ARIA tree: {nodeCount} nodes, {landmarkCount} landmarks" | Screen plane bottom | 4s |
| Element probe wave begins | "Discovering elements on {screen}" | Screen plane center | 3s |
| Each screen complete | "{screen}: {elementCount} elements found" | Observatory near new node | 4s |
| All screens captured | "Baseline harvest complete — {totalElements} elements across {screenCount} screens" | Center | 5s |

#### Act 3: Suite Slicing

| Trigger | Caption | Position | Duration |
|---------|---------|----------|----------|
| Prioritization begins | "Prioritizing {totalCount} scenarios by learning value" | Top center | 4s |
| Selection boundary settles | "Suite Slice: {selectedCount} of {totalCount} scenarios selected" | Near boundary line | 5s |
| Top screen revealed | "Top screens: {topScreens.join(', ')}" | Near scenario list | 4s |

#### Act 4: Deterministic Generation

| Trigger | Caption | Position | Duration |
|---------|---------|----------|----------|
| First scenario compiling | "Compiling first scenario: {title}" | Pipeline timeline | 4s |
| High bind rate | "{boundSteps}/{totalSteps} steps bound deterministically" | Screen plane corner | 4s |
| Many deferrals | "{deferredSteps} steps deferred to runtime interpretation" | Screen plane corner | 4s |
| All scenarios compiled | "Compilation complete — {boundRate}% bound, {deferredRate}% deferred" | Center | 5s |

#### Act 5: Execution & Failure

| Trigger | Caption | Position | Duration |
|---------|---------|----------|----------|
| First scenario executing | "Executing: {title}" | Screen plane top | 4s |
| First resolution ladder walk | "Resolving deferred step via {strategy}" | Near element | 3s |
| First test passes | "✓ First green test: {title}" | Center (larger font) | 6s |
| First test fails | "✗ {title} — {failureClass}" | Near failure location | 4s |
| Needs-human escalation | "Awaiting human decision: {reason}" | Near decision overlay | Persistent until resolved |
| Execution complete | "{passedCount}/{totalCount} scenarios passed" | Center | 5s |

#### Act 6: Hardening & Gating

| Trigger | Caption | Position | Duration |
|---------|---------|----------|----------|
| Proposals approaching glass | "{proposalCount} proposals generated from failures" | Near proposal cluster | 4s |
| First proposal passes through | "Knowledge activated: {description}" | Near glass pane | 4s |
| Proposal reflected | "Review required: {description}" | Near workbench queue | 4s |
| Proposal blocked | "Blocked by trust policy: {reason}" | Near glass pane | 4s |
| Gating complete | "{activatedCount} activated, {reviewCount} need review, {blockedCount} blocked" | Center | 5s |

#### Act 7: Meta-Measurement

| Trigger | Caption | Position | Duration |
|---------|---------|----------|----------|
| Scorecard appears | "Iteration {n} complete" | Scorecard panel top | 4s |
| Hit rate reported | "Knowledge hit rate: {rate}% (Δ{delta}%)" | Scorecard panel | 5s |
| Convergence not met | "Not converged — iterating. {budgetRemaining} iterations remaining" | Center | 4s |
| Convergence achieved | "Converged at iteration {n} — {hitRate}% knowledge hit rate" | Center (larger font) | 8s |

### Narration Rendering

Captions are rendered as HTML overlays positioned absolutely over the Three.js canvas. They are not part of the Three.js scene — they exist in the DOM layer above the WebGL context. This avoids the complexity and performance cost of 3D text rendering while keeping captions crisp at any resolution.

```typescript
interface NarrationCaption {
  readonly id: string;
  readonly text: string;
  readonly position: 'top-center' | 'center' | 'bottom-center' 
    | 'screen-plane-top' | 'screen-plane-bottom' | 'screen-plane-center'
    | 'observatory' | 'glass-pane' | 'pipeline-timeline' | 'workbench';
  readonly durationMs: number;
  readonly emphasis: 'normal' | 'highlight' | 'milestone';
  readonly fadeInMs: number;   // default: 300
  readonly fadeOutMs: number;  // default: 500
}
```

Milestone captions (first green test, convergence achieved) use a larger font, longer duration, and subtle glow effect. Normal captions use a standard font with a semi-transparent dark background for readability against the Three.js scene.

---

## Part VI: Operator Controls and Interaction Model

The flywheel visualization supports two interaction modes: **autopilot** (observation) and **intervention** (steering). The operator can switch between them at any time. The visualization adapts its behavior but never changes the underlying pipeline — it is always a projection.

### Autopilot Mode (Default)

In autopilot mode, the operator watches. The camera follows the automated choreography. Narration captions provide context. The pipeline runs without pausing for human decisions — the `DisabledDashboard` or `AgentDecider` handles all decision gates automatically.

#### Controls Available in Autopilot Mode

| Control | Input | Effect |
|---------|-------|--------|
| Camera orbit | Mouse drag | Override automated camera position |
| Zoom | Scroll wheel | Adjust FOV |
| Reset camera | `Home` key | Return to automated choreography |
| Jump to act camera | `1`–`7` keys | Snap to named camera state |
| Toggle narration | `N` key | Show/hide narration captions |
| Toggle scorecard | `S` key | Show/hide persistent scorecard panel |
| Toggle pipeline timeline | `T` key | Show/hide pipeline stage visualization |
| Focus element | Double-click on glow | Zoom to element, show detail card |
| Focus knowledge node | Double-click on observatory node | Zoom to node, show knowledge detail |
| Open workbench | `W` key | Open workbench panel (read-only in autopilot) |
| Screenshot | `P` key | Capture current viewport as PNG |
| Toggle bloom | `B` key | Enable/disable bloom postprocessing |
| Toggle glass pane | `G` key | Show/hide glass pane for clearer view |

#### Playback Controls (Time-Lapse Mode Only)

| Control | Input | Effect |
|---------|-------|--------|
| Play/pause | `Space` | Toggle playback |
| Speed up | `]` or `+` | Next speed tier |
| Speed down | `[` or `-` | Previous speed tier |
| Step forward | `Right arrow` | Advance one event |
| Step backward | `Left arrow` | Rewind one event |
| Next act | `Shift+Right` | Seek to next act boundary |
| Previous act | `Shift+Left` | Seek to previous act boundary |
| Next iteration | `Ctrl+Right` | Seek to next iteration boundary |
| Previous iteration | `Ctrl+Left` | Seek to previous iteration boundary |
| Seek | Click on scrub bar | Jump to position |
| Bookmark | `M` key | Create bookmark at current position |
| Go to bookmark | `Ctrl+1`–`Ctrl+9` | Jump to bookmark N |

### Intervention Mode

In intervention mode, the operator can make decisions that affect the pipeline. This requires the `WsDashboardAdapter` or `DualModeDecider` implementation of `DashboardPort` — the Effect fiber actually pauses and waits for the operator's response.

#### Decision Overlay

When the fiber pauses for a decision, the flywheel visualization activates the decision overlay:

1. The camera smoothly transitions to focus on the relevant element or knowledge node
2. The relevant element's glow intensifies (2× normal brightness, slower pulse)
3. The decision overlay appears as a floating panel near the element with:
   - The work item title and rationale
   - The evidence confidence score and sources
   - The proposed action and its expected impact
   - **Approve** button (green) and **Skip** button (red)
4. The narration layer shows a persistent caption: "Awaiting human decision: {reason}"
5. All other animations continue but at 50% speed (the scene feels "held in suspension")

When the operator clicks Approve or Skip:

1. The decision burst animation fires (green particles toward observatory for approve, red scatter for skip)
2. The camera returns to the automated choreography position
3. The fiber resumes
4. The narration caption updates: "Decision: {approved/skipped} — {rationale}"

#### Batch Decision Surface

During Act 6 (Hardening & Gating), multiple proposals may require human review. The workbench panel can operate in batch mode:

1. All pending work items are listed with priority, confidence, and type
2. The operator can select multiple items and approve/skip them as a batch
3. Each batch decision triggers a rapid sequence of decision burst animations
4. The narration layer summarizes: "Batch decision: {approvedCount} approved, {skippedCount} skipped"

#### Impact Preview (Future Enhancement)

Before making a decision, the operator can preview the projected impact:

- **Approve preview**: "If approved, {N} additional steps will resolve in the next iteration. Estimated hit-rate improvement: +{delta}%."
- **Skip preview**: "If skipped, {N} steps remain deferred. No immediate impact on hit rate."

This preview is computed by the pipeline's fitness projector (which already exists in `lib/application/fitness.ts`) and displayed as a tooltip on the Approve/Skip buttons.

### Settings Panel

A settings panel (toggled by `Esc` or gear icon) allows the operator to configure:

| Setting | Default | Range | Effect |
|---------|---------|-------|--------|
| Narration enabled | `true` | boolean | Show/hide narration captions |
| Narration verbosity | `normal` | `minimal` / `normal` / `verbose` | Caption frequency and detail |
| Bloom intensity | `0.8` | 0.0–2.0 | Postprocessing glow strength |
| Particle density | `1.0` | 0.25–2.0 | Multiplier on particle count (for performance) |
| Glass pane visible | `true` | boolean | Show/hide glass pane |
| Ambient brightness | `0.3` | 0.1–1.0 | Base ambient light intensity |
| Camera speed | `1.0` | 0.5–3.0 | Transition animation speed multiplier |
| Auto-camera | `true` | boolean | Enable/disable automated choreography |
| Decision timeout | `0` (infinite) | 0–300 seconds | Auto-skip decisions after timeout |
| Time-lapse speed | `10×` | 0.5×–100× | Default playback speed tier |

---

## Part VII: Architectural Constraints and Performance Budget

The flywheel visualization is the most demanding mode of the Tesseract dashboard. It renders more scene elements, processes more events per second, and maintains more visual state than steady-state operation. Yet it must respect every architectural constraint that governs the dashboard.

### Non-Negotiable Architectural Invariants

These invariants are inherited from `docs/dashboard-vision.md` and `docs/spatial-dashboard.md`. They apply without exception:

#### 1. Projection, Never Dependency

The flywheel visualization observes the pipeline. It never drives it. Specifically:

- `DashboardPort.emit()` is fire-and-forget. If the visualization is slow, events are dropped by the ingestion queue — they never create backpressure on the Effect fiber.
- `DashboardPort.awaitDecision()` always has a timeout fallback. If the operator does not respond within the configured timeout (or if the dashboard is not connected), the decision auto-skips.
- Toggling the flywheel visualization on or off, switching between live and time-lapse mode, or adjusting any visual setting never changes the pipeline's behavior, output artifacts, or convergence characteristics.
- The event journal writer (`JournalWriter` fiber) is a PubSub subscriber — it cannot block event production. If it falls behind, events are dropped from the subscriber's queue, not from the PubSub.

**Test**: Run the same speedrun with `--speedrun` and without `--speedrun` (the dashboard flag). The resulting `.tesseract/` artifacts, `generated/` files, and scorecard must be bit-identical (modulo timestamps).

#### 2. Event Vocabulary Discipline

All new events follow the existing `DashboardEvent` contract: `{ type: DashboardEventKind, timestamp: string, data: unknown }`. New event kinds are added to the `DashboardEventKind` union type in `lib/domain/types/dashboard.ts`. Each new event kind has a corresponding typed payload interface in the same file.

New events must not duplicate information that existing events already carry. For example, `step-bound` carries binding outcome per step — it does not re-carry the full `ElementProbedEvent` data, which arrives through the separate `element-probed` event.

**Test**: Every event kind in `DashboardEventKind` has a corresponding Zod schema (or equivalent) that validates its payload. The journal writer validates events before writing. Invalid events are dropped with a diagnostic.

#### 3. Progressive Enhancement

The flywheel visualization composes as layers on top of the existing dashboard. It does not replace or break existing components:

- Layer 0 (base): ScreenPlane + SelectorGlows + ParticleTransport + GlassPane — unchanged
- Layer 1 (live portal): LiveDomPortal replaces ScreenPlane texture — unchanged
- Layer 2 (MCP): MCP tool endpoints — unchanged
- Layer 3 (convergence): ConvergencePanel + ProposalGate + ArtifactAurora — unchanged
- **Layer 4 (flywheel)**: Act choreography + camera automation + narration + time-lapse — NEW

Layer 4 can be enabled/disabled independently. When disabled, the dashboard operates in its existing steady-state mode with no behavioral changes.

#### 4. Same Data, Multiple Consumers

The flywheel visualization consumes the same events and REST data as the existing dashboard components. It introduces new React hooks and components but does not modify existing ones. The MCP tool endpoints serve the same data to agents as the visualization consumes from the WebSocket.

### Performance Budget

The dashboard targets 60fps on a mid-range laptop GPU (Intel Iris or equivalent). The existing performance budget from `docs/spatial-dashboard.md` allocates approximately 15ms per frame. The flywheel visualization must fit within this budget.

#### Per-Frame Budget Allocation

| Component | Budget (ms) | Notes |
|-----------|------------|-------|
| InstancedMesh (particles + nodes) | 1.5 | Up to 8K instances across particles, glows, knowledge nodes |
| Texture update (screen plane) | 5.0 | Base64 decode happens outside render loop; swap is O(1) |
| Bloom postprocessing | 5.0 | UnrealBloomPass with mipmapBlur |
| Glass pane transmission | 1.0 | MeshPhysicalMaterial with transmission |
| Resolution probe rings | 1.0 | InstancedMesh with animated radius |
| Narration overlay (DOM) | 0.5 | CSS transitions, not Three.js |
| Camera interpolation | 0.2 | Lerp on position, FOV |
| React reconciliation | 1.0 | Minimal — most state is in Three.js buffers |
| **Total** | **15.2** | Just within 16.67ms budget |

#### High-Throughput Mitigations

During Act 5 (Execution), event throughput can reach 1000+ events/second. The following mitigations prevent frame drops:

1. **Ingestion queue staggering**: Events are buffered and released at configurable rates (40-100ms per event type). The render loop never processes more than ~15 events per frame.

2. **Particle pooling**: The `ParticleTransport` and `DecisionBurst` components use a fixed-size particle pool (InstancedMesh with pre-allocated capacity). New particles reuse expired slots rather than allocating. Pool sizes:
   - Probe particles: 500 slots
   - Transport particles: 200 slots
   - Decision burst particles: 100 slots
   - Resolution ring instances: 50 slots

3. **Knowledge node LOD**: The KnowledgeObservatory uses level-of-detail rendering. Nodes beyond 2.0 world units from the camera are rendered as simple points (no mesh geometry, no labels). Nodes within 1.0 units are rendered with full geometry and floating text labels.

4. **Event batching at high playback speeds**: In time-lapse mode above 10×, events are batched per frame rather than individually animated. See Part III for batching strategy by speed tier.

5. **Narration throttling**: No more than 2 captions are visible simultaneously. If a new caption would exceed this limit, the oldest caption fades immediately.

#### Memory Budget

| Resource | Allocation | Notes |
|----------|-----------|-------|
| Three.js scene graph | ~20 MB | Meshes, materials, textures |
| Screen plane texture | ~5 MB | Single 1280×720 or 1920×1080 RGBA texture |
| InstancedMesh buffers | ~3 MB | Float32 attribute arrays for all particle pools |
| Event journal (if recording) | ~1 MB per iteration | JSONL on disk, streamed via REST for playback |
| React state | ~2 MB | Ingestion queues, convergence history, stage tracker |
| WebSocket buffer | ~100 KB | In-flight events |
| **Total** | **~31 MB** | Well within browser tab limits |

### Graceful Degradation

If the visualization cannot maintain 60fps, it degrades gracefully:

1. **First degradation** (below 45fps): Disable bloom postprocessing. Saves ~5ms per frame.
2. **Second degradation** (below 30fps): Reduce particle pool sizes by 50%. Increase ingestion stagger by 2×.
3. **Third degradation** (below 20fps): Disable glass pane transmission effect. Replace with simple semi-transparent mesh.
4. **Fourth degradation** (below 15fps): Switch to 2D fallback mode — flat panels instead of 3D scene. This preserves all data but abandons the spatial narrative.

The degradation controller monitors `requestAnimationFrame` timing and applies these thresholds automatically. The operator can also force a degradation level through the settings panel.

---

## Part VIII: Component Inventory and Data Flow

This section provides a complete inventory of the React components and hooks required by the flywheel visualization, categorized by new (must be built) versus existing (reused from the current dashboard).

### Existing Components (Reused Without Modification)

These components form the spatial foundation. The flywheel visualization composes on top of them:

| Component | Path | Role in Flywheel |
|-----------|------|-----------------|
| `SpatialCanvas` | `spatial/canvas.tsx` | Root R3F scene — hosts all spatial content |
| `ScreenPlane` | `spatial/screen-plane.tsx` | Live application texture (Acts 2, 4, 5) |
| `SelectorGlows` | `spatial/selector-glows.tsx` | Bioluminescent element highlights (Acts 2, 4, 5) |
| `ParticleTransport` | `spatial/particle-transport.tsx` | Particles from DOM to observatory (Acts 2, 4, 5, 6) |
| `GlassPane` | `spatial/glass-pane.tsx` | Governance boundary (Acts 4, 5, 6) |
| `KnowledgeObservatory` | `spatial/knowledge-observatory.tsx` | Knowledge graph (Acts 2–7) |
| `ProposalGate` | `spatial/proposal-gate.tsx` | Proposal flow at glass (Act 6) |
| `ArtifactAurora` | `spatial/artifact-aurora.tsx` | Write-flash effect (Acts 4, 6) |
| `IterationPulse` | `spatial/iteration-pulse.tsx` | Ambient light modulation (Acts 5, 7) |
| `DecisionOverlay` | `spatial/decision-overlay.tsx` | Human decision UI (Acts 5, 6) |
| `DecisionBurst` | `spatial/decision-burst.tsx` | Decision animation (Acts 5, 6) |
| `LiveDomPortal` | `spatial/live-dom-portal.tsx` | Iframe portal (Act 2, 5 when available) |
| `StatusBar` | `molecules/status-bar.tsx` | Connection and progress status |
| `FitnessCard` | `molecules/fitness-card.tsx` | Scorecard high-water marks (Act 7) |
| `ProgressCard` | `molecules/progress-card.tsx` | Iteration progress metrics (Acts 4–7) |
| `ConvergencePanel` | `organisms/convergence-panel.tsx` | Rung history and convergence (Acts 5, 7) |
| `PipelineProgress` | `organisms/pipeline-progress.tsx` | Stage lifecycle (Acts 4, 5) |
| `QueueVisualization` | `organisms/queue-visualization.tsx` | Work item queue (Acts 5, 6) |
| `WorkbenchPanel` | `organisms/workbench-panel.tsx` | Work items for decisions (Acts 5, 6) |
| `CompletionsPanel` | `organisms/completions-panel.tsx` | Decision audit trail (Acts 5, 6, 7) |
| `SceneErrorBoundary` | `atoms/error-boundary.tsx` | Graceful WebGL error recovery |

### Existing Hooks (Reused Without Modification)

| Hook | Path | Role in Flywheel |
|------|------|-----------------|
| `useWebSocket` | `hooks/use-web-socket.ts` | WebSocket connection lifecycle |
| `useIngestionQueue` | `hooks/use-ingestion-queue.ts` | Staggered event playback |
| `useConvergenceState` | `hooks/use-convergence-state.ts` | Rung and calibration tracking |
| `useStageTracker` | `hooks/use-stage-tracker.ts` | Pipeline stage lifecycle |
| `useIterationPulse` | `hooks/use-iteration-pulse.ts` | Ambient light modulation |
| `useWebMcpCapabilities` | `hooks/use-mcp-capabilities.ts` | MCP feature detection |
| `useParticleSimulation` | `hooks/use-particle-simulation.ts` | Particle physics for transport |

### New Components (Must Be Built)

#### Spatial Components

| Component | Proposed Path | Act(s) | Description |
|-----------|--------------|--------|-------------|
| `ScenarioCloud` | `spatial/scenario-cloud.tsx` | 1, 3 | 3D cloud of scenario cards with affinity clustering and ranked list mode |
| `SurfaceOverlay` | `spatial/surface-overlay.tsx` | 2 | ARIA landmark region outlines overlaid on screen plane |
| `ProbeDataCard` | `spatial/probe-data-card.tsx` | 2 | Floating element metadata card near probed elements |
| `ResolutionRings` | `spatial/resolution-rings.tsx` | 5 | Concentric rings visualizing resolution ladder walk |
| `FailureFragments` | `spatial/failure-fragments.tsx` | 5, 6 | Shattered particles from failed steps, coalescing into proposal cluster |
| `ProposalCluster` | `spatial/proposal-cluster.tsx` | 6 | Particle cluster approaching glass pane with proposal metadata |
| `ConvergenceFinale` | `spatial/convergence-finale.tsx` | 7 | Green pulse radiating from observatory on convergence |
| `ScorecardPanel3D` | `spatial/scorecard-panel.tsx` | 7 | Floating 3D panel showing iteration scorecard metrics |

#### Organism Components

| Component | Proposed Path | Description |
|-----------|--------------|-------------|
| `FlywheelChoreographer` | `organisms/flywheel-choreographer.tsx` | Act sequencing, transition triggers, camera state machine |
| `PlaybackControls` | `organisms/playback-controls.tsx` | Scrubber, speed selector, bookmark navigation |
| `NarrationOverlay` | `organisms/narration-overlay.tsx` | Caption rendering and lifecycle management |
| `IterationTimeline` | `organisms/iteration-timeline.tsx` | Multi-iteration horizontal timeline with act segments |
| `BatchDecisionPanel` | `organisms/batch-decision-panel.tsx` | Multi-select work item approval (Act 6 intervention) |
| `DegradationController` | `organisms/degradation-controller.tsx` | FPS monitor and automatic quality reduction |

#### Molecule Components

| Component | Proposed Path | Description |
|-----------|--------------|-------------|
| `ActIndicator` | `molecules/act-indicator.tsx` | Current act number and name badge |
| `SliceMetrics` | `molecules/slice-metrics.tsx` | Suite Slice selection summary |
| `BindingDistribution` | `molecules/binding-distribution.tsx` | Stacked bar for bound/deferred/unbound steps |
| `ConvergenceArrow` | `molecules/convergence-arrow.tsx` | Trend arrow (up/horizontal/down) for hit-rate velocity |
| `SpeedTierSelector` | `molecules/speed-tier-selector.tsx` | Playback speed dropdown/selector |
| `BookmarkChip` | `molecules/bookmark-chip.tsx` | Individual bookmark indicator on timeline |

### New Hooks (Must Be Built)

| Hook | Proposed Path | Description |
|------|--------------|-------------|
| `useFlywheelAct` | `hooks/use-flywheel-act.ts` | Tracks current act based on stage-lifecycle events. Returns `{ act, actName, iteration, transitionProgress }` |
| `usePlaybackController` | `hooks/use-playback-controller.ts` | Journal loading, seek, speed, play/pause. Returns `PlaybackController` interface |
| `useCameraChoreography` | `hooks/use-camera-choreography.ts` | Automated camera position interpolation. Returns `{ position, fov, target, overrideActive }` |
| `useNarrationQueue` | `hooks/use-narration-queue.ts` | Caption lifecycle management. Returns `{ activeCaption, queueCaption }` |
| `useActTransition` | `hooks/use-act-transition.ts` | Transition animation state. Returns `{ transitioning, fromAct, toAct, progress }` |
| `useDegradation` | `hooks/use-degradation.ts` | FPS monitoring and quality tier. Returns `{ tier, bloomEnabled, particleDensity }` |
| `useEventJournal` | `hooks/use-event-journal.ts` | Journal write subscription (live mode) and read stream (playback mode) |

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Effect Fiber                                │
│  (speedrun/dogfood loop with DashboardPort.emit() calls)            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ DashboardEvent
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      PipelineEventBus                               │
│  Effect.PubSub → SharedArrayBuffer ring + WebSocket broadcast       │
│                                  + JournalWriter (NEW)              │
└───────┬──────────────┬──────────────────┬───────────────────────────┘
        │              │                  │
        ▼              ▼                  ▼
  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐
  │ WS Broad │  │ Buffer Ring  │  │ Event Journal      │
  │ (remote) │  │ (in-process) │  │ (.jsonl on disk)   │
  └────┬─────┘  └──────────────┘  └────────┬──────────┘
       │                                    │
       ▼                                    ▼
┌──────────────────┐              ┌───────────────────────┐
│  useWebSocket()  │              │  usePlaybackController │
│  (live events)   │              │  (recorded events)     │
└────────┬─────────┘              └────────┬──────────────┘
         │                                 │
         ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Dispatch Handlers                                 │
│  dispatchProgress, dispatchProbe, dispatchCapture, ...              │
│  + NEW: dispatchStepBound, dispatchSurfaceDiscovered, ...           │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
  ┌──────────────┐   ┌──────────────────┐   ┌──────────────────────┐
  │ Ingestion    │   │ useFlywheelAct() │   │ useCameraChoreography│
  │ Queues       │   │ Act tracking     │   │ Camera interpolation │
  │ (staggered)  │   │ + transitions    │   │ + override state     │
  └──────┬───────┘   └────────┬─────────┘   └────────┬────────────┘
         │                    │                       │
         ▼                    ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FlywheelChoreographer                          │
│  Composes all spatial and DOM components based on act state         │
│  Orchestrates transitions, narration, camera, degradation           │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
    ┌───────────┬───────────┬───┴────────┬───────────┬───────────┐
    ▼           ▼           ▼            ▼           ▼           ▼
 Spatial     Spatial    Organisms    Molecules   Narration   Playback
 (R3F)       (new)     (existing    (new)       Overlay     Controls
 existing    comps      + new)
```

---

## Part IX: The Convergence Finale and Summary View

The most emotionally important moment in the flywheel visualization is convergence — the moment the system has learned enough to stop iterating. This section describes the finale in detail, because getting it right is the difference between "the visualization ended" and "the visualization *landed*."

### The Convergence Moment

Convergence is detected when the `convergence-evaluated` event arrives with `converged: true`. The convergence reason determines the visual character:

#### `threshold-met` — The Best Case

The system achieved its target knowledge hit rate. This is a triumph.

1. **The Observatory Crystallizes** (0–2 seconds): All knowledge nodes stop pulsing and solidify. Their governance tints shift to full green. The node positions lock — no more force-directed layout drift. The observatory looks *permanent*, like a completed constellation chart.

2. **The Glass Pane Dissolves** (1–3 seconds): The glass pane's transmission increases from its current value to 1.0 (fully transparent). It then fades in opacity from 1.0 to 0.0. The governance boundary disappears — the system's knowledge is now trusted. The space between harvest and observatory becomes unified.

3. **The Green Wave** (2–4 seconds): A radial pulse of green light originates from the observatory center and radiates outward, passing through the dissolved glass pane and across the screen plane. Every element on the screen plane glows green briefly as the wave passes. This visualizes the reach of the system's understanding — it has *touched every part of the application*.

4. **The Ambient Crescendo** (2–5 seconds): The ambient light intensity smoothly increases to 1.5× its current value. The bloom intensity increases to 1.2. The entire scene becomes brighter and warmer. The system has moved from the darkness of ignorance to the light of understanding.

5. **The Narration Milestone**: A centered, large-font caption appears: "Converged at iteration {n}. {hitRate}% knowledge hit rate. {passedScenarios}/{totalScenarios} scenarios green." Duration: 8 seconds. Emphasis: `milestone`.

#### `no-proposals` — Graceful Completion

The system activated everything it could. No more proposals remain. This is satisfactory but not a triumph.

1. Steps 1–4 from `threshold-met`, but with amber tinting instead of green
2. The glass pane thins but does not fully dissolve (transmission 0.8)
3. The narration reads: "No further proposals. {hitRate}% knowledge hit rate. {remainingGaps} knowledge gaps remain."

#### `budget-exhausted` or `max-iterations` — Honest Stopping

The system ran out of time or iterations. This is informational, not celebratory.

1. The observatory stabilizes but does not crystallize (nodes still pulse gently)
2. The glass pane remains at its current frost level
3. The ambient light does not change
4. The narration reads: "Budget exhausted after {n} iterations. {hitRate}% knowledge hit rate. {proposalsPending} proposals still pending."

### The Summary View

After the convergence moment (regardless of reason), the visualization transitions to a persistent summary view. This is the view an operator will screenshot, share with colleagues, and use to evaluate whether the first-day intake was successful.

#### Summary Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Summary View                                 │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │            Iteration Timeline (full width)                   │    │
│  │  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐                      │    │
│  │  │ 1 │ │ 2 │ │ 3 │ │ 4 │ │ 5 │ │ ✓ │  Hit Rate Curve     │    │
│  │  │   │ │   │ │   │ │   │ │   │ │   │  ────────────────    │    │
│  │  │47%│ │62%│ │71%│ │79%│ │85%│ │89%│  ___________/¯¯¯    │    │
│  │  └───┘ └───┘ └───┘ └───┘ └───┘ └───┘                      │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌───────────────────────┐  ┌───────────────────────────────────┐  │
│  │   Final Scorecard     │  │   Knowledge Observatory            │  │
│  │                       │  │   (miniaturized, interactive)      │  │
│  │  Hit Rate:     89%    │  │                                    │  │
│  │  Pass Rate:    84%    │  │   ○ policy-search (0.94)           │  │
│  │  Bind Coverage: 91%   │  │   ○ claims-review (0.87)          │  │
│  │  Proposals:    47     │  │   ○ eligibility-check (0.78)      │  │
│  │  Activated:    38     │  │   ○ enrollment (0.65)              │  │
│  │  Blocked:       2     │  │                                    │  │
│  │  Iterations:    6     │  │   [Click screen to expand]         │  │
│  │  Duration:   47:12    │  │                                    │  │
│  │  Human Decisions: 4   │  │                                    │  │
│  └───────────────────────┘  └───────────────────────────────────┘  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │   Resolution Distribution (stacked bar)                      │    │
│  │   ██████████████░░░░░▓▓▓▓░░                                 │    │
│  │   ▲ explicit  ▲ knowledge  ▲ translation  ▲ deferred        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │   Remaining Gaps                                             │    │
│  │   • 7 steps needs-human across 3 scenarios                  │    │
│  │   • 2 proposals blocked by trust policy                     │    │
│  │   • 4 screens with < 70% element coverage                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  [ Replay ▶ ]  [ Export PDF ]  [ Open Workbench ]  [ New Run ]     │
└─────────────────────────────────────────────────────────────────────┘
```

#### Summary Interactions

- **Click on iteration column**: Seek to that iteration in time-lapse mode
- **Click on observatory screen node**: Expand to show per-element knowledge detail
- **Click on remaining gap**: Navigate to the relevant work item in the workbench
- **Replay button**: Enter time-lapse mode from the beginning
- **Export PDF**: Generate a static report (future capability — uses the same scorecard data)
- **Open Workbench**: Switch to the standard workbench view for manual work
- **New Run**: Start a fresh flywheel run (navigates to run configuration)

### The "Before and After" Comparison

The summary view includes a powerful comparison feature: the "Before and After" toggle. When activated, the view splits:

- **Left half**: The knowledge observatory as it appeared at the start of iteration 1 (empty or near-empty)
- **Right half**: The knowledge observatory in its final converged state

The operator sees the full journey compressed into a single frame: darkness on the left, crystallized understanding on the right. This is the image that communicates Tesseract's value in a single screenshot.

The comparison state is computed from the event journal — the first and last `knowledge-updated` events for each node provide the "before" and "after" snapshots.

---

## Part X: What Makes This Hard

This section is deliberately honest about the technical and design challenges. The flywheel visualization is a moonshot because each of these challenges is individually manageable but their *composition* is formidable.

### Challenge 1: Seven Visual Languages in One Scene

Each act has its own dominant visual metaphor: crystallization (Act 1), bioluminescent discovery (Act 2), prioritization cascade (Act 3), compilation lattice (Act 4), resolution ladder walk (Act 5), governance gate (Act 6), convergence landscape (Act 7). Individually, each is a well-understood visualization pattern. Together, they must feel like one continuous experience rather than seven slide decks stapled together.

**What makes it hard**: The transitions. A smooth camera move is easy. Making the scene elements morph coherently — scenario cards becoming queue entries, probe glows becoming transport particles, failure fragments becoming proposal clusters — requires each visual element to have a *lifecycle* that spans multiple acts. Elements cannot simply appear and disappear at act boundaries; they must transform.

**Mitigation path**: Design a unified particle system where all visual elements (scenario cards, probe glows, transport particles, proposal clusters, failure fragments) are instances of a common `FlywheelEntity` with phase-dependent visual properties. The entity's appearance changes based on the current act, but its identity (which scenario? which element? which proposal?) persists across transitions.

### Challenge 2: Time-Lapse Event Batching

At 100× playback speed, a 2-hour run compresses into ~72 seconds. That is approximately 50,000-100,000 events replayed in slightly over a minute — around 1,000 events per second of playback time. Even with batching, each frame must process ~60 events and update the scene state accordingly.

**What makes it hard**: The batching must be semantically aware. You cannot simply skip events — the scene state must be consistent at every frame. Skipping an `element-probed` event means the knowledge node it would have brightened stays dim. Skipping a `proposal-activated` event means the knowledge state is wrong. Every event must either be rendered or its effect must be applied as a state delta without animation.

**Mitigation path**: Implement a `SceneStateAccumulator` that processes events in two modes: *animated* (each event triggers a visual) and *accumulated* (each event updates a state snapshot but does not trigger a visual). At high playback speeds, events within a batching window are accumulated, and a single frame renders the accumulated state delta. The accumulator must handle every event kind and produce a consistent scene state snapshot.

### Challenge 3: Scene State Consistency During Seek

When the operator scrubs the timeline to a specific position, the visualization must reconstruct the scene state at that moment. This means: which knowledge nodes exist, what are their confidence levels, what is the current iteration, which scenarios have been compiled, which have been executed, what is the pass rate, what proposals are pending.

**What makes it hard**: The event journal is a forward-only append log. Reconstructing state at an arbitrary position requires replaying all events from the beginning of the journal up to the seek target. For a 100,000-event journal, this could take several seconds.

**Mitigation path**: The journal index includes periodic state snapshots (every 1,000 events or at every iteration boundary). A snapshot captures the full `SceneState`: knowledge node list with confidence levels, iteration count, cumulative metrics, proposal status map, scenario compilation/execution status. Seeking to a position first loads the nearest preceding snapshot, then replays only the events between the snapshot and the target position.

```typescript
interface SceneStateSnapshot {
  readonly sequenceNumber: number;
  readonly timestamp: string;
  readonly iteration: number;
  readonly act: FlyWheelAct;
  readonly knowledgeNodes: readonly KnowledgeNodeProjection[];
  readonly metrics: {
    readonly knowledgeHitRate: number;
    readonly passRate: number;
    readonly proposalsActivated: number;
    readonly proposalsPending: number;
  };
  readonly scenarioStatus: ReadonlyMap<string, 'pending' | 'compiled' | 'executed' | 'passed' | 'failed'>;
  readonly activeProposals: readonly string[];
  readonly cumulativeTokens: number | null;
  readonly wallClockMs: number;
}
```

### Challenge 4: The First-Time Discovery Visual Language

Act 2 introduces a visual distinction between "the system just met this element" (first-day capture) and "the system knows this element" (steady-state probing). This distinction must be subtle enough to not look like a bug, but clear enough that an experienced operator can instantly tell whether they are watching a first encounter or a re-visit.

**What makes it hard**: The distinction relies on the *temporal context* of each probe event, not just its payload. A probe event for element X on screen Y during the first-ever visit to that screen should look different from the same probe event during iteration 3 when the system has already seen that element twice. But the probe event's payload is identical in both cases — the temporal context lives in the scene state, not the event.

**Mitigation path**: The `FlywheelChoreographer` maintains a `SeenElements` set. When an `element-probed` event arrives, the choreographer checks whether `(screen, element)` is in the set. If not, it is a first encounter — the probe is rendered with the first-time visual language (wider glow, lower intensity, blue-white shift). After rendering, the element is added to the set. On subsequent encounters (including in later iterations), the standard visual language applies.

### Challenge 5: Emotional Pacing

The flywheel visualization is not a data visualization. It is a *narrative*. Narratives have pacing — moments of tension, release, discovery, and triumph. The seven acts have natural emotional arcs (curiosity in Act 2, tension in Act 5, relief in Act 6, satisfaction in Act 7), but making those arcs *felt* requires careful control of animation timing, ambient light, sound design (if audio is ever added), and narration.

**What makes it hard**: Pacing is subjective and depends on the operator's familiarity with the system. A first-time viewer needs more narration, slower transitions, and more explicit visual guidance. An experienced operator wants faster pacing and minimal narration. The same visualization must serve both audiences.

**Mitigation path**: The narration verbosity setting (`minimal` / `normal` / `verbose`) controls not just the text content but the entire pacing profile:

| Setting | Transition duration | Narration frequency | Ambient ramp rate | Target audience |
|---------|-------------------|--------------------|--------------------|----------------|
| `minimal` | 1.0 second | Milestones only | Fast | Experienced operators |
| `normal` | 2.0 seconds | Per-act + milestones | Medium | Regular use |
| `verbose` | 3.0 seconds | Per-act + per-phase + milestones | Slow | First-time viewers, demos |

### Challenge 6: Multi-Screen Application Discovery

During Act 2, the system navigates to multiple screens. Each screen navigation replaces the screen plane texture and triggers a new wave of discovery glows. But the *previous* screen's discoveries are now invisible — they exist only in the knowledge observatory.

**What makes it hard**: The operator loses context when the screen plane changes. They saw elements being discovered on Screen A, but now they are looking at Screen B. When a later step references an element on Screen A, the operator has to mentally reconstruct which screen that element was on.

**Mitigation path**: Two complementary approaches:

1. **Screen thumbnail strip**: A horizontal strip of miniature screen thumbnails at the bottom of the screen plane. Each thumbnail shows a previously-visited screen with its discovery glows baked in. Clicking a thumbnail replaces the main screen plane texture with that screen's capture. This provides spatial memory across screen transitions.

2. **Observatory-anchored screen cards**: In the knowledge observatory, each screen node doubles as a miniature reference card. Hovering over a screen node in the observatory shows a tooltip with the screen's thumbnail and its key metrics (element count, confidence range, last visit time).

### Challenge 7: Composing with Existing Dashboard State

The flywheel visualization must compose cleanly with the existing dashboard architecture. The `App` component in `dashboard/src/app.tsx` currently orchestrates all hooks, state, and component composition. The flywheel visualization adds significant new state (act tracking, camera choreography, narration queue, playback controller, event journal) and new components (8 spatial, 6 organism, 6 molecule).

**What makes it hard**: The existing `App` component is already a complex composition shell with 15+ hooks and 10+ components. Adding the flywheel layer without making `App` unwieldy requires careful decomposition. The flywheel components need access to the same shared state (progress, probes, convergence, workbench) as existing components, plus their own flywheel-specific state.

**Mitigation path**: Introduce a `FlywheelProvider` context that wraps the flywheel-specific hooks (`useFlywheelAct`, `useCameraChoreography`, `useNarrationQueue`, `usePlaybackController`). The `FlywheelChoreographer` organism consumes this context and conditionally renders flywheel-specific components. The existing `App` component gains a single `<FlywheelProvider>` wrapper and a `<FlywheelChoreographer>` child — no other changes needed.

```typescript
// New composition pattern
function App() {
  // ... existing hooks unchanged ...
  
  return (
    <FlywheelProvider enabled={flywheelMode} journalUrl={journalUrl}>
      <div className="dashboard-layout">
        {/* Existing spatial viewport — unchanged */}
        <div className="spatial-viewport">
          <FlywheelChoreographer>
            {/* Choreographer wraps SpatialCanvas and adds flywheel layers */}
            <SpatialCanvas {...existingProps} />
          </FlywheelChoreographer>
        </div>
        {/* Existing control panel — unchanged */}
        <div className="control-panel">
          {/* ... existing panels ... */}
          <PlaybackControls />  {/* Only visible in time-lapse mode */}
        </div>
      </div>
    </FlywheelProvider>
  );
}
```

---

## Part XI: Open Questions and Future Extensions

These are decisions that cannot be resolved in a requirements document. They require prototyping, user testing, and architectural experimentation.

### Open Questions

**Q1: Should the flywheel visualization be a separate route or a mode of the main dashboard?**

Option A: Separate route (`/flywheel`). Clean separation of concerns. Flywheel components are loaded lazily. No risk of impacting the main dashboard.

Option B: Mode of the main dashboard (toggle switch). Unified experience. The operator can switch between steady-state monitoring and flywheel replay without navigating. More complex composition.

Recommendation: Start with Option A for isolation. Migrate to Option B once the flywheel components are stable and the composition pattern is proven.

**Q2: How should the flywheel visualization handle multiple concurrent scenarios in Act 5?**

If the runbook configures parallel scenario execution (e.g., 4 concurrent browsers), Act 5 receives interleaved events from multiple scenarios. The screen plane can only show one application view at a time.

Option A: Show one scenario at a time, with a selector to switch between concurrent scenarios. Simple but loses the "parallel progress" narrative.

Option B: Split the screen plane into quadrants, each showing one concurrent scenario. Visually dense but communicates parallelism.

Option C: Show one scenario on the screen plane and indicate the others as small status badges (pass/fail indicators with scenario ID) floating near the top edge.

Recommendation: Option C for the initial implementation. It preserves the screen plane's visual clarity while communicating parallelism. Option B could be a future enhancement for operators who want full parallel visibility.

**Q3: Should the time-lapse mode support backward playback?**

Backward playback (scrubbing backward through the timeline) requires reversing event effects on the scene state. Some effects are reversible (knowledge node confidence can be decremented). Some are not (particle animations cannot be meaningfully reversed).

Recommendation: Support backward seeking (jump to a previous position via snapshot + replay) but not backward playback (smooth reverse animation). The seek approach is simpler and meets the same use case — reviewing a specific moment.

**Q4: What should the flywheel visualization do when there is no convergence?**

Some first-day intakes will not converge. The application is too complex, the test suite is too large, or the knowledge layer is too thin. The visualization must handle this gracefully.

Recommendation: After the maximum iteration count, show the summary view with honest metrics. No green wave. No crystallization. The narration reads: "Maximum iterations reached. {hitRate}% knowledge hit rate. {gapsRemaining} knowledge gaps remain. Consider manual knowledge authoring or a focused re-run."

**Q5: Should the flywheel visualization integrate with the DSPy/GEPA offline optimization lane?**

The offline optimization lane (from `docs/dogfooding-flywheel.md`) produces proposal rankings and sensitivity analyses. These could inform the flywheel visualization — e.g., highlighting which proposals have the highest predicted impact according to the optimization model.

Recommendation: Out of scope for the initial implementation. The flywheel visualization should be a pure consumer of pipeline events, not a consumer of offline optimization outputs. Integration with the optimization lane is a future enhancement that would require defining a stable interface between the optimization lane and the visualization.

### Future Extensions

**F1: Audio Design**

The flywheel visualization is a narrative. Narratives benefit from audio. Ambient generative audio — low tones during capture, rising tones during convergence, a clear chime on first green test — would deepen the emotional impact. This is a significant design and implementation effort (Web Audio API, generative synthesis) but would be transformative for demo contexts.

**F2: Multi-Run Comparison Flywheel**

Instead of watching one first-day intake, watch two side-by-side: the same suite against the same application, but with different configurations (different trust-policy thresholds, different iteration budgets, different knowledge postures). The operator sees which configuration converges faster, produces more proposals, or achieves higher hit rates. This extends the flywheel visualization from a narrative tool to an A/B testing surface.

**F3: Collaborative Viewing**

Multiple operators watch the same flywheel visualization simultaneously — each with their own camera position but sharing the same event stream and decision surface. When one operator makes a decision, all viewers see the decision burst. This requires WebSocket-based cursor and camera synchronization — a significant infrastructure extension.

**F4: Presentation Mode**

A curated version of the flywheel visualization designed for non-technical audiences: slower transitions, more narration, simplified metrics, larger text, no keyboard shortcuts. Optimized for projector display and conference presentation. This is a styling and pacing variant, not a functional variant — the same components, different configuration.

**F5: Exportable Recording**

Export the event journal plus the Three.js scene as a standalone HTML file that can be opened in any browser without a running server. This would use an embedded playback controller and a bundled Three.js scene. The exported file would be shareable — a self-contained demonstration of the system's first-day intake. Implementation requires serializing the scene graph and embedding the event journal as an inline data block.

---

## Part XII: Relationship to Other Dashboard Moonshots

The flywheel visualization does not exist in isolation. It connects to and benefits from the four other moonshots described in `docs/dashboard-vision.md`:

### Moonshot #1: The Temporal Observatory (Time-Travel Through Knowledge Evolution)

The flywheel visualization's time-lapse mode is a simpler form of temporal navigation. If the Temporal Observatory is built first (scrubbable knowledge state across iterations), the flywheel visualization reuses its temporal indexing and state reconstruction infrastructure. Conversely, if the flywheel visualization is built first, its event journal and `SceneStateSnapshot` system become the foundation for the Temporal Observatory.

**Dependency**: Shared infrastructure. Build order is flexible.

### Moonshot #2: The Semantic Drift Radar (Topographic Confidence Map)

The flywheel visualization's Act 7 scorecard shows flat metrics. The Drift Radar would replace the flat scorecard with a topographic confidence landscape — a 3D heightfield where the X axis is the application's screen space, the Y axis is iteration time, and the Z axis is confidence. This landscape would appear during Act 7 and persist into the summary view, giving the operator a spatial understanding of where confidence is high and where gaps remain.

**Dependency**: The Drift Radar is an enhancement to Act 7 and the summary view. It does not affect Acts 1–6.

### Moonshot #3: The Decision Theater (Collaborative Human-Agent Governance)

The flywheel visualization's intervention mode (decision overlay with approve/skip) is a single-participant version of the Decision Theater. If the Decision Theater is built — with the agent's analysis visible as spatial annotations alongside the human's decision UI — the flywheel visualization would inherit that richer decision surface for Acts 5 and 6.

**Dependency**: The Decision Theater is an enhancement to the intervention mode. It does not affect autopilot mode.

### Moonshot #4: Execution Déjà Vu (Predictive Run Trajectory)

The flywheel visualization's Act 5 shows execution in real-time. Déjà Vu would add a predictive layer — showing the current run's trajectory alongside historical trajectories, with early warning when the current run is converging toward a known failure pattern. This would appear as ghosted trajectory lines in the Pipeline Theater view during Act 5.

**Dependency**: Déjà Vu requires a temporal index of historical runs. The flywheel visualization's event journal provides the raw material for building that index. If Déjà Vu is built, the flywheel visualization gains a powerful predictive layer for Act 5.

---

## Epilogue: What This Document Makes Possible

This document does not solve for the implementation of the First-Day Intake Flywheel Visualization. It describes it in sufficient detail that:

1. **A builder knows what to build.** The seven acts, the event contracts, the component inventory, the camera choreography, the narration catalog, the performance budget, and the data flow diagram provide a complete specification.

2. **An architect knows what constraints to respect.** The non-negotiable invariants (projection-never-dependency, event vocabulary discipline, progressive enhancement, same-data-multiple-consumers) define the boundary between what is allowed and what is forbidden.

3. **A designer knows what it should feel like.** The visual language descriptions (first-time discovery glows, resolution ladder rings, glass pane physics, convergence finale) define the aesthetic intent without prescribing pixel-level details.

4. **A product owner knows what it achieves.** The summary view, the before-and-after comparison, the time-lapse mode, and the narration layer define the value delivered to operators, stakeholders, and demo audiences.

5. **A pragmatist knows what is hard.** The seven technical challenges, the open questions, and the mitigation paths define where the risk is and what the escape hatches look like.

The flywheel visualization is a moonshot. But it is a moonshot with a detailed flight plan — the trajectory is plotted, the waypoints are named, the fuel budget is calculated, and the landing zone is identified. The only thing left is to build the rocket.

---

*This document is a companion to `docs/dashboard-vision.md`. It expands moonshot #5 into a complete requirements specification. For the broader dashboard vision, see that document. For the dogfooding flywheel operating model, see `docs/dogfooding-flywheel.md`. For the first-day autopilot moonshot, see `docs/moonshots.md` § 2.*
