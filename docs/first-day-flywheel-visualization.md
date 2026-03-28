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
