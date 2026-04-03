# V4: The Flagship Workbench

*A fourth execution plan for Tesseract. Same ambition as the prior plans, but with a new center of gravity: the dashboard UI, the end-user experience, and the agentic seams that should feel obvious to both operators and the codebase. March 27, 2026.*

---

## 0) Why a fourth plan

**V1** (`research-master-prioritization.md`) is forensic. It closes the implementation gap between the docs and the runtime.

**V2** (`research-master-prioritization-expanded.md`) is opportunity-driven. It asks what category-defining surfaces Tesseract could become.

**V3** (`research-master-prioritization-v3.md`) is generative. It treats the existing architecture as a set of composable primitives and invents from there.

**V4** asks a different question:

> *What if the flagship product surface was not just the compiler, not just the dogfood loop, and not just the artifact tree, but the workbench itself?*

The repo already has the bones of that answer:

- a typed dashboard event vocabulary in `lib/domain/types/dashboard.ts`
- a real-time `DashboardPort` and decision bridge in `lib/application/ports.ts` and `lib/application/dashboard-decider.ts`
- a `SharedArrayBuffer` event bus in `lib/infrastructure/dashboard/pipeline-event-bus.ts`
- a React shell with a spatial scene, optimistic decisions, and MCP capability discovery in `dashboard/src/app.tsx`
- a workbench projection with prioritized items and typed actions in `lib/domain/types/workbench.ts`
- an MCP server that exposes the same observables structurally in `lib/infrastructure/mcp/dashboard-mcp-server.ts`

But the current user experience still behaves like a promising prototype:

- the dashboard knows more than it explains
- the workbench holds richer action semantics than the UI exposes
- the agent can act, but its presence is not yet legible
- the live portal and zero-copy path exist architecturally, but not yet as the default felt experience
- the codebase has the right pieces, but the seams still feel like seams

This plan is exclusively about fixing that.

### Creative mandate

- Every item must improve either dashboard clarity, end-user experience, or agentic intuitiveness.
- Every item must anchor to a real type, file, port, or projection already in the repo.
- Every item must preserve the repo's governing law: **same truth, many projections**.
- No item is allowed to smuggle domain truth into the UI. The dashboard stays a projection surface.
- "Fun" is allowed, but only if it increases comprehension, confidence, or momentum.

### ID scheme

Items use `T4.{arc}.{seq}`.

---

## 1) Current diagnosis: the skeleton already exists

The most important thing about V4 is that it is not asking the repo to become something alien. The workbench already exists in latent form.

### What is already strong

1. **The event backbone is real.** The system already emits a meaningful event vocabulary across iteration, queue, escalation, proposals, calibration, confidence, and stage lifecycle.
2. **The dashboard is already more than a CRUD panel.** It has a spatial canvas, live capture support, workbench decisions, and a typed observer layer.
3. **The agent surface is already provider-agnostic.** The repo already models dashboards, MCP tools, session adapters, and deterministic fallbacks as projections over the same domain.
4. **The workbench already has richer semantics than the UI uses.** `AgentWorkItem` includes typed actions, evidence, linked proposals, hotspots, and bottlenecks.
5. **The architecture already supports progressive enhancement.** Screenshot texture, live DOM portal, and MCP projections are explicitly layered.

### What still feels under-formed

1. **The main dashboard layout is still a split-screen monitor, not a cockpit.**
2. **The current workbench view is still title + priority + approve/skip.**
3. **The decision flow is technically impressive but emotionally abrupt.**
4. **The agent is present in the system, but not yet socially present in the UI.**
5. **The codebase still spreads dashboard semantics across event maps, REST responses, hooks, MCP tools, and hand-built components.**

### Five design laws for V4

1. **Every live signal must answer three questions:** what changed, why it matters, and what can happen next.
2. **Every agent action must be visible before and after execution.** Hidden autonomy is not a UX strategy.
3. **Every decision surface must degrade gracefully.** No live DOM, no MCP, no active run, and no agent are all first-class states.
4. **Every dashboard capability must have a codebase seam that is equally intuitive.** If the UI becomes elegant while the underlying contracts remain scattered, drift will return.
5. **Every empty state must teach.** "No data" is not enough.

---

## 2) Companion design and leading UI plan

V4 now has two companion specs:

- the design spec: [dashboard-workbench-first-principles.md](/c/Users/danny/OneDrive/Documents/agentic-playwright/docs/dashboard-workbench-first-principles.md)
- the application architecture spec: [dashboard-workbench-application-architecture.md](/c/Users/danny/OneDrive/Documents/agentic-playwright/docs/dashboard-workbench-application-architecture.md)

Together they answer two different questions:

- what should the flagship workbench look like and how should it behave?
- how should the frontend be structured so that the design can actually survive implementation?

The roadmap should now assume both documents as its front-loaded operating shape.

### Default flagship layout

The default workbench should organize around five persistent zones:

1. **Presence Bar**: run identity, host, capabilities, actor ownership, and current mode.
2. **Surface Stage**: the live portal or screenshot surface with semantic overlays.
3. **Resolve Lane**: `Now`, `Needs Human`, `Agent Queue`, and `Recently Resolved`.
4. **Storyline Rail**: the chronological memory of the run, scrub-capable and filterable.
5. **Inspector Drawer**: contextual explanation, evidence, actions, and impact.

That is the intended information architecture. The dashboard should stop behaving like a set of equally weighted cards.

### Leading application architecture plan

The architecture doc sharpens the implementation shape in four important ways:

1. **The code tree should mirror the workbench zones**: `presence-bar`, `surface-stage`, `resolve-lane`, `storyline-rail`, `inspector-drawer`, plus one `workbench-runtime` feature for live orchestration.
2. **The dashboard needs a pure projection layer**: event metadata, queue lifecycle, timeline compilation, inspector shaping, and geometry normalization should live outside React.
3. **The current stream shell should be broken apart**: `app.tsx` should become a thin shell over runtime hooks, feature containers, and pure view-model compilers.
4. **Typecheck and boundaries need to become real**: the dashboard source tree should join first-class typechecking and gain machine-enforced import rules before the big feature wave lands.

This is the most important technical-design shift in V4. The roadmap is no longer "invent a better dashboard". It is "invent a better dashboard on top of a frontend architecture that makes the right implementation path obvious."

### Underused data that should become first-class

| Data already available or nearly available | Current state | Should live in |
|---|---|---|
| `WorkItemAction[]`, exhaustion trails, linked proposals/hotspots/bottlenecks | Mostly hidden | Resolve Lane + Inspector |
| `summary.byKind` and `topPriority` | Barely surfaced | Presence Bar + queue cluster headers |
| stage duration, cache hit/miss, rewritten files | Underused | Storyline Rail + artifact drawer |
| `InboxUrgency` and pause vs queued review semantics | Not explicit enough | Dedicated blocking lane vs review backlog |
| confidence threshold crossings and threshold values | Hidden behind cache updates | Trust explainer + change log |
| `screen-group-start` and shared screen context | Not surfaced | Batch triage shell and agent focus |
| screen observation detail: visible, enabled, ariaLabel, locator strategy | Not presented | Inspector evidence tab |
| workbench lineage and written artifacts | Minimal | Resolved journal + replay + review reel |

### Leading overlay plan

The design doc makes the responsive overlay answer explicit: **yes, we should anchor overlays to source capture coordinates, normalize them to ratios, and map those ratios onto the current rendered surface rect**.

That means:

- source screenshot or live-surface geometry is canonical
- CSS overlays and WebGL overlays share one anchor contract
- resize, DPR shifts, and layout changes do not invalidate the mapping model
- stale or missing geometry degrades to screen-level explanation rather than fake precision

### Leading agentic flow plan

The queue should be treated as a flow, not a stack:

`Detected -> grouped -> ready -> claimed-by-system/agent -> awaiting-human -> resolved -> learned`

The user experience should therefore present:

- one `Now` item or screen group
- one clearly separated blocking human lane
- one visible agent working set
- one resolved journal with consequences

That is the experience we are designing for in the arcs below.

---

## 3) Seven arcs of reinvention

| Arc | Theme | Items | Character |
|-----|-------|-------|-----------|
| **Arc 1** | Cockpit Clarity | 6 | Turn scattered telemetry into one comprehensible operating surface |
| **Arc 2** | Decision UX and Trust | 6 | Make intervention fast, safe, and reversible |
| **Arc 3** | Agent Presence and Collaboration | 6 | Make the agent feel like a legible teammate |
| **Arc 4** | Live Interface Presence | 6 | Make the dashboard feel attached to the running app |
| **Arc 5** | Intuitive Codebase Surfaces | 6 | Make the implementation seams obvious and composable |
| **Arc 6** | Delight, Onboarding, and Fun | 6 | Reduce anxiety and make long-running work pleasant |
| **Arc 7** | Moonshot Workbench Lab | 8 | Experiments that could redefine the product surface |

**44 items total.** This is a dashboard-first roadmap, not a generic product wishlist.

---

## Arc 1 - Cockpit Clarity (make the dashboard explain itself)

**Thesis**: Tesseract already emits enough truth to tell a coherent story. The dashboard's first job is not to be visually clever. Its first job is to make that story legible at a glance.

| ID | Initiative | Effort | Anchor | Outcome |
|----|------------|--------|--------|---------|
| T4.1.1 | **Scenario Focus Mode** - Add a primary narrative lane that follows one scenario or one screen group at a time: active stage, current screen, latest capture, top work item, last winning rung, and next safe action in one place | M | `dashboard/src/app.tsx`, `.tesseract/tasks/*.resolution.json`, `generated/*.review.md` | An operator can answer "what is happening right now?" in under 5 seconds |
| T4.1.2 | **Run Storyline Timeline** - Collapse `progress`, `stage-lifecycle`, `item-*`, `proposal-activated`, `artifact-written`, and `iteration-*` into one chronological timeline with filters and scrub points | M | `DashboardEventKind`, `dashboard/src/hooks/dashboard-event-observer.ts`, `lib/application/pipeline/stage.ts` | The run becomes one understandable narrative instead of many disconnected widgets |
| T4.1.3 | **Reason Card Compiler** - Render every work item as a standard card with rationale, evidence, exhaustion trail, linked proposals, impacted artifacts, and recommended actions | M | `AgentWorkItem`, `WorkItemAction[]`, `context.exhaustionTrail`, `linkedHotspots` | Queue items become decision surfaces, not labels |
| T4.1.4 | **Bottleneck Atlas** - Add a screen and element heatmap that combines scorecard hotspots, workbench pressure, confidence crossings, and degraded locators into one atlas | L | `.tesseract/graph/index.json`, `.tesseract/workbench/index.json`, `.tesseract/confidence/index.json`, scorecard projections | Operators see where effort will pay off fastest |
| T4.1.5 | **View Mode Matrix** - Introduce `operator`, `spatial`, `audit`, and `presentation` modes over the same state tree instead of one fixed split layout | M | `dashboard/src/app.tsx`, `dashboard/index.html`, `dashboard/src/styles/globals.css` | The workbench adapts to different jobs without forking the product |
| T4.1.6 | **Intelligent Empty States** - Replace terse placeholders with capability-aware guidance: why nothing is visible, what artifact is missing, and which exact command or posture would populate it | S | `progress-card.tsx`, `fitness-card.tsx`, `workbench-panel.tsx`, `status-bar.tsx`, `/api/capabilities` | New users stop bouncing off the dashboard when the system is idle |

### Arc 1 "done means"

- [ ] A single focused view can explain the current run without cross-referencing three panels
- [ ] The event timeline is the authoritative human-readable view of run history
- [ ] Every visible work item can expand into rationale, evidence, and next actions
- [ ] Empty states explain both absence and recovery path

---

## Arc 2 - Decision UX and Trust (make intervention humane)

**Thesis**: The current dashboard can technically collect a decision. V4 wants it to help a human make a good one, quickly, with confidence, and without fear of losing context.

| ID | Initiative | Effort | Anchor | Outcome |
|----|------------|--------|--------|---------|
| T4.2.1 | **Action Surface Parity** - Expose all `WorkItemActionKind` verbs through the dashboard and MCP surfaces instead of hard-coding everything into approve/skip | M | `WorkItemActionKind`, `AgentWorkItem.actions`, `workbench-panel.tsx`, `dashboard-mcp-server.ts` | The UI finally reflects the real action model already present in the domain |
| T4.2.2 | **Screen-Scoped Batch Triage** - Use `ScreenGroupContext` to review many related items together inside the Resolve Lane, share rationale across them, and preview the blast radius before acting | M | `ScreenGroupContext`, `processWorkItems`, `screen-group-start`, `agent-workbench.ts` | Repeated screen-local work stops feeling repetitive |
| T4.2.3 | **Trust Explainer Sidebar** - Show governance state, confidence thresholds, source evidence, trust-policy class, and why a proposal activated, blocked, or stayed review-required | M | `ProposalActivatedEvent`, `ConfidenceCrossedEvent`, trust policy surfaces, scorecard projections | "Why does the system think this is safe?" becomes answerable in one click |
| T4.2.4 | **Decision Journal and Undo Window** - Add an immediate, typed decision journal with a small rollback window before the action settles into the durable completion ledger | M | `WorkbenchCompletionsEnvelope`, `InterventionLineageEnvelope`, `dashboard.awaitDecision`, `useWorkbenchDecisions` | The dashboard feels forgiving instead of brittle |
| T4.2.5 | **Urgency-Split Review Lanes** - Render `blocking` pause states separately from `queued` inbox review so humans can distinguish "the fiber is waiting" from "this can wait" | S | `InboxUrgency`, `fiber-paused`, `fiber-resumed`, `inbox-item-arrived` | Operators stop treating all review items as equally urgent |
| T4.2.6 | **Comparative Proposal Review** - For proposal-heavy items, render side-by-side before/after patch context, related screenshot context, and affected rerun-plan footprint | L | `.tesseract/inbox/index.json`, proposal artifacts, `tesseract rerun-plan`, review projections | Approvals become contextual judgment, not blind trust |

### Arc 2 "done means"

- [ ] The dashboard supports the full workbench action vocabulary
- [ ] Blocking work and queued work are visually and semantically distinct
- [ ] Trust-policy reasoning is visible without opening source files
- [ ] A human can reverse an accidental dashboard decision quickly and safely

---

## Arc 3 - Agent Presence and Collaboration (make the agent legible)

**Thesis**: Tesseract already has agents, but the current experience still treats them more like hidden transport than visible collaborators. V4 makes the agent socially present, inspectable, and easy to hand off to or override.

| ID | Initiative | Effort | Anchor | Outcome |
|----|------------|--------|--------|---------|
| T4.3.1 | **Participant Presence Strip** - Add a live strip for `system`, `agent`, and `operator` showing active host, current responsibility, execution profile, and approval posture | M | `ActorKind`, `Participant`, `ExecutionPosture`, `agent-session-adapter.ts` | The dashboard clearly shows who is doing what |
| T4.3.2 | **Conversation-Linked Receipts** - Attach session events, chat rationale, artifact inspections, and execution-reviewed events directly to workbench cards and run timeline nodes | M | `.tesseract/sessions/{sessionId}/`, `InterventionLedger`, `agent-session-adapter.ts` | Agent reasoning becomes traceable, not folkloric |
| T4.3.3 | **Clarification Protocol UI** - When runtime resolution is ambiguous, show structured clarifications with ranked options instead of collapsing straight to generic `needs-human` | M | `ResolutionReceipt`, `needs-human` pathway, agent interpreter request/response types | Human help becomes low-friction and knowledge-creating |
| T4.3.4 | **Handoff Pack Generator** - Generate compact, host-neutral handoff bundles that include active work items, relevant artifacts, rationale, and next-safe commands for Claude Code, Copilot, or future adapters | M | `AgentWorkbenchProjection`, MCP tools, `workbench` CLI, session adapters | Switching hosts no longer costs context |
| T4.3.5 | **Plan-First Agent Mode** - Before an agent executes a sequence of actions, project the plan, risks, estimated artifact writes, and fallback path into the UI for optional approval | L | `WorkItemDecider`, `dashboard-decider.ts`, `InterventionReceipt`, `ImprovementSignal` | Agent autonomy becomes inspectable before it acts |
| T4.3.6 | **Host Capability Matrix** - Render which capabilities each host has today: MCP tools, live DOM, decisioning, artifact writes, dry-run only, or full execution | S | `DashboardCapabilities`, `/api/capabilities`, `LocalServiceOptions`, host adapters | Users stop guessing why one host can do something another cannot |

### Arc 3 "done means"

- [ ] The current actor and host are visible at all times
- [ ] Agent reasoning and human reasoning both appear in the same intervention story
- [ ] Clarifications are structured and reusable, not ad hoc interruptions
- [ ] Host switching preserves workbench continuity

---

## Arc 4 - Live Interface Presence (make the app feel present)

**Thesis**: The dashboard should feel attached to the app under test, not adjacent to it. The system already has the architecture for that. V4 makes it the default felt experience.

| ID | Initiative | Effort | Anchor | Outcome |
|----|------------|--------|--------|---------|
| T4.4.1 | **Live DOM Portal Realization** - Turn the portal path into a first-class capability when headed mode is available, including capability negotiation, portal health, and graceful fallback to screenshot texture | M | `LiveDomPortal`, `use-mcp-capabilities.ts`, `/api/capabilities`, `dashboardCapabilities()` | The dashboard becomes a live window into the app when the runtime allows it |
| T4.4.2 | **Zero-Copy Visualization Path** - Actually wire `usePipelineBuffer` into the React and Three.js hot path so WebSocket JSON becomes the compatibility layer, not the primary local path | M | `usePipelineBuffer`, `pipeline-event-bus.ts`, `createPipelineEventBus()`, `app.tsx` | High-frequency visuals feel immediate and cheap |
| T4.4.3 | **Semantic Overlay Layers + Shared Geometry Contract** - Render target identity, governance tint, actor provenance, state markers, and winning rung directly over the live DOM or screenshot plane using one normalized capture-space geometry model for both CSS and WebGL overlays | L | `CanonicalTargetRef`, `ElementProbedEvent`, `ElementEscalatedEvent`, spatial scene types, `domToWorld` | The UI shows not just where the element is, but what it means |
| T4.4.4 | **Replay Theatre and Time Scrubber** - Add a scrubber that freezes the dashboard at any event index and replays capture, queue, stage, and knowledge state coherently | L | `DashboardEvent`, run artifacts, `screen-captured`, `progress`, event timeline | Postmortems become cinematic and exact |
| T4.4.5 | **Bidirectional MCP Bridge** - Let operators click a visual object and fire the corresponding MCP query or workbench action, then render the tool result back into the same scene | M | `dashboard-mcp-server.ts`, `dashboardMcpTools`, spatial components, action router | Human and agent views finally stop diverging |
| T4.4.6 | **Accessible Responsive Shell** - Make the dashboard keyboard-first, reduced-motion aware, color-contrast safe, and useful on laptop and tablet form factors | M | `dashboard/index.html`, `globals.css`, `decision-overlay.tsx`, component hierarchy | The flagship workbench becomes inclusive and practical beyond a demo monitor |

### Arc 4 "done means"

- [ ] The live portal is real when capability allows it and gracefully absent when it does not
- [ ] SharedArrayBuffer powers the local hot path
- [ ] Replay can reconstruct a run's visual and semantic state at an arbitrary moment
- [ ] Accessibility is a product property, not a cleanup task

---

## Arc 5 - Intuitive Codebase Surfaces (make the implementation feel as good as the UI)

**Thesis**: Dashboard quality will not stick unless the codebase stops scattering semantics across hooks, endpoints, and duplicate mappings. V4 treats implementation clarity as a user-experience problem for future maintainers and agents.

| ID | Initiative | Effort | Anchor | Outcome |
|----|------------|--------|--------|---------|
| T4.5.1 | **Dashboard ViewModel Compiler** - Move ad hoc shaping logic out of components and hooks into a pure projection layer that maps artifacts and events into stable view models | M | `dashboard/src/app.tsx`, `dashboard/src/types.ts`, artifact readers, event observer | UI code becomes about rendering, not incidental projection logic |
| T4.5.2 | **Event Metadata Registry** - Create one registry for event labels, severity, timeline grouping, hot-path encoding status, and compatible views instead of spreading those concerns across observer code, buffer ordinals, and components | M | `DashboardEventKind`, `EVENT_TYPE_ORDINALS`, observer dispatch tables, timeline UI | Event semantics become discoverable and exhaustive |
| T4.5.3 | **Decision and Queue State Machine** - Formalize the full lifecycle of a queue item and decision: detected, grouped, ready, paused, optimistic, committed, timed out, reverted, replayed, and learned | M | `awaitDecision`, `pendingDecisions`, REST completion path, MCP approve/skip, `fiber-*` events, workbench projections | The most delicate flow in the dashboard becomes explicit and testable |
| T4.5.4 | **Capability Negotiation Contract** - Replace scattered booleans and heuristics with one typed capability contract shared by the server, dashboard, MCP bridge, portal logic, replay mode, and geometry availability | S | `/api/capabilities`, `DashboardCapabilities`, `useWebMcpCapabilities`, domain dashboard types | "Can I do this right now?" becomes deterministic in both code and UI |
| T4.5.5 | **Workbench Action Router** - Route UI affordances, MCP actions, and future agent commands from `WorkItemAction[]` through one renderer/executor pipeline | M | `AgentWorkItem.actions`, `WorkItemActionKind`, dashboard action buttons, MCP tool handlers | Adding a new action stops requiring parallel rewrites across surfaces |
| T4.5.6 | **Projection Symmetry Test Suite** - Add contract and law tests proving that dashboard cards, MCP tools, and session adapters expose the same action semantics and governance meanings | M | dashboard tests, MCP server, session adapters, workbench projections | The workbench becomes one product surface with multiple projections, not three half-similar ones |

### Arc 5 "done means"

- [ ] Components consume stable view models instead of shaping domain data on the fly
- [ ] Event meaning lives in one registry
- [ ] Decision flow is modeled as a first-class state machine
- [ ] New workbench actions can be added once and projected everywhere

---

## Arc 6 - Delight, Onboarding, and Fun (make long sessions feel good)

**Thesis**: The workbench is a tool people may stare at for hours. V4 deliberately invests in reducing anxiety, rewarding comprehension, and making the product easier to teach.

| ID | Initiative | Effort | Anchor | Outcome |
|----|------------|--------|--------|---------|
| T4.6.1 | **Guided First-Run Simulator** - Add a demo mode that replays canned events and artifacts so new users can learn the dashboard without waiting for a real speedrun | M | dashboard shell, event observer, sample artifact fixtures | Onboarding becomes fast, scripted, and confidence-building |
| T4.6.2 | **Scenario Narrator** - Generate a concise natural-language summary of the current run: what the system tried, where it succeeded, what it is waiting on, and why | M | `ResolutionReceipt`, progress events, workbench view models, review artifacts | The dashboard gains a human-friendly voice without inventing new truth |
| T4.6.3 | **Workbench Command Palette** - Add a keyboard-driven command palette for filtering, approving, skipping, opening artifacts, toggling views, and launching CLI-equivalent actions | S | view models, action router, routing state | Power users move faster and new users discover affordances more easily |
| T4.6.4 | **Saved Perspectives** - Allow users to save named layouts and filters such as "triage", "presentation", "graph-heavy", or "calibration audit" | S | view mode matrix, dashboard state store | Operators stop rebuilding the same visual context over and over |
| T4.6.5 | **Shareable Review Reels** - Export a compact replay with timeline, screenshots, key proposals, and linked artifacts for PRs, docs, or async team review | M | replay theatre, review projections, event timeline | The dashboard becomes a communication surface, not just an inspection tool |
| T4.6.6 | **Daily Digest and Next Moves** - Generate a calm summary of what changed since the last session, what improved, what regressed, and the top three recommended next actions | M | scorecards, workbench summary, confidence crossings, bottleneck atlas | Returning to the system feels like resuming a story, not starting cold |

### Arc 6 "done means"

- [ ] A new teammate can learn the dashboard from a simulator instead of tribal knowledge
- [ ] Power users can drive the workbench without hunting through panels
- [ ] Async stakeholders can consume a run without opening the full repo
- [ ] Returning users get a crisp "where we are now" digest

---

## Arc 7 - Moonshot Workbench Lab (high-risk, high-wonder)

**Thesis**: If the dashboard really becomes the flagship workbench, it can attempt product experiences that ordinary QA tools cannot support because they do not have Tesseract's typed receipts, governance model, and multi-projection architecture.

| ID | Moonshot | Effort | Risk | Anchor | Why it could be extraordinary |
|----|----------|--------|------|--------|-------------------------------|
| T4.7.1 | **Conversational Cockpit** - Ask the dashboard questions like "why did the claim flow stall?" or "show only screen-local trust issues", then jump directly to the relevant view state | XL | High | timeline, view models, workbench artifacts, MCP tools | Turns the dashboard into a queryable operating system |
| T4.7.2 | **Repair Rehearsal Twin** - Before applying a proposal, simulate its likely impact on queue shape, rerun scope, and trust posture, then show the projected future as a preview branch | XL | High | proposal artifacts, rerun-plan, confidence overlays, decision state machine | Makes risky approvals feel safe enough to attempt |
| T4.7.3 | **Run Cinema** - Auto-edit a semantic highlight reel of a run: screen transitions, agent pauses, proposal activations, blocked moments, and recovery wins, all narrated from receipts | L | Medium | replay theatre, captures, event registry, narrator | Makes the product demo itself and explain itself |
| T4.7.4 | **Collaborative Swarm Review** - Let multiple agents and humans annotate the same workbench session live, with conflict-aware action locking and deterministic merge of decisions | XL | High | `InterventionLedger`, action router, decision state machine, session adapters | Brings genuinely collaborative incident handling into the workbench |
| T4.7.5 | **Shape-Shifting Dashboard** - Infer whether the operator is debugging, approving, presenting, authoring knowledge, or teaching someone else, then recompose the layout around that intent | L | Medium | view mode matrix, command palette, actor state, saved perspectives | The interface becomes contextually helpful instead of static |
| T4.7.6 | **Explain-This-Pixel Lens** - Click any visible region and trace all the way back to target identity, selector probes, confidence overlays, related proposals, and recent failures | L | Medium | semantic overlays, graph, selector canon, confidence catalogs | Collapses a huge amount of repo knowledge into one delightful interaction |
| T4.7.7 | **Ghost Operator / Apprenticeship Mode** - Learn from an individual operator's decisions and begin suggesting macros, likely next actions, and preferred evidence views without auto-mutating canon | L | Medium | decision journal, intervention lineage, session adapters | The dashboard gets better at helping a specific human over time |
| T4.7.8 | **Invisible Workbench** - Run as a calm background companion that stays mostly collapsed until urgency, trust pressure, or confidence drift crosses thresholds, then blooms into full cockpit mode | L | Medium | urgency split queue, event bus, capability negotiation, digest engine | Reframes the dashboard from constant visual load to ambient intelligence |

### Moonshot guardrails

- Every moonshot remains a projection-only feature until explicitly promoted
- No moonshot may bypass trust policy or write directly to canon
- Every moonshot must degrade to the normal workbench without data loss
- Moonshots that do not improve orientation, speed, or decision quality get archived

---

## 4) Novel use cases unlocked by V4

1. **Five-minute failure briefings**: a lead opens the dashboard, hits the replay scrubber, and gets the whole story without reading three artifacts and a test trace.
2. **Agent handoff without context loss**: a CI batch run becomes a dashboard session, then a Claude Code handoff, then a Copilot follow-up, all through the same workbench bundle.
3. **Presentation mode for stakeholders**: the same live system can explain a run to engineers, QA, or leadership without switching tools.
4. **Fast screen-local repair loops**: an operator reviews a whole screen's worth of hotspots in one batch instead of approving them one by one.
5. **Safe plan-first autonomy**: an agent proposes what it wants to do, the human approves the plan, and the workbench shows the exact consequences.
6. **Instant onboarding**: a new teammate learns the workbench from a simulator instead of waiting for a failing run.
7. **Postmortems that people actually watch**: review reels and run cinema make the evidence easy to share asynchronously.
8. **Ambient operations**: the system can stay quiet until something truly needs attention, then bloom into the exact right context.

---

## 5) Elegant refactors that pay for themselves

V4 is not only a surface roadmap. Several refactors dramatically simplify the dashboard code while unlocking the bigger UX moves.

### Refactor A - Event Metadata Registry (T4.5.2)

- **Current cost**: event meaning is split across domain event kinds, buffer ordinals, observer tables, and ad hoc UI labels.
- **After**: one registry declares label, severity, hot-path encoding, timeline lane, and compatible views.
- **Unlocked capability**: timeline, replay theatre, and explain-this-pixel all build on the same event semantics instead of each inventing their own mapping.

### Refactor B - Dashboard ViewModel Compiler (T4.5.1)

- **Current cost**: components and hooks shape data locally, which makes the UI harder to reason about and easy to drift.
- **After**: pure projection functions compile domain artifacts and live events into stable view models.
- **Unlocked capability**: saved perspectives, command palette, narrator, and shareable reels all reuse the same compiled UI truth.

### Refactor C - Decision State Machine (T4.5.3)

- **Current cost**: pause, optimistic update, REST completion, MCP decision, and timeout behavior are coordinated by convention.
- **After**: one explicit state machine models the entire lifecycle.
- **Unlocked capability**: undo windows, replayable decisions, collaborative review, and invisible workbench mode all become tractable.

### Refactor D - Capability Negotiation Contract (T4.5.4)

- **Current cost**: capability checks are scattered through `use-mcp-capabilities`, server responses, and UI conditions.
- **After**: one contract describes portal availability, MCP presence, headed state, local-only features, and degraded fallbacks.
- **Unlocked capability**: the dashboard can confidently switch between screenshot, portal, remote-only, and ambient modes.

### Refactor E - Workbench Action Router (T4.5.5)

- **Current cost**: UI actions, MCP tools, and decision buttons are partially duplicated and partly hard-coded.
- **After**: every work item action is rendered and executed from the same routed action definition.
- **Unlocked capability**: adding `author`, `inspect`, `rerun`, `defer`, or future actions stops requiring synchronized rewrites across surfaces.

---

## 6) Suggested sequencing

V4 should not be built in visual-first order. It should be built in **confidence-first** order.

### Phase 0 - Lock the architecture shape (technical design)

**Inputs**: the first-principles design doc and the application architecture doc

This is the current phase. Its goal is to prevent V4 from collapsing back into panel-by-panel implementation.

**Architectural commitments**:

- adopt the five-zone workbench layout as the primary frontend topology
- introduce the pure projection layer as a first-class concept
- define the geometry and capability contracts before richer overlay work begins
- plan the breakup of `dashboard/src/app.tsx` into shell, runtime, and feature containers
- add dashboard typecheck and boundary enforcement to the implementation plan

**Exit criteria**:

- the design and architecture docs agree on information flow and zone ownership
- the folder structure, dependency law, and migration path are explicit
- Arc 5 work can begin as enabling architecture instead of deferred cleanup

### Phase I - Make the dashboard legible (weeks 1-2)

**Items**: T4.1.1, T4.1.2, T4.1.3, T4.1.6, T4.5.1, T4.5.2

This phase turns the current dashboard from "promising if you already know the repo" into "understandable on first sight". It also lays the projection and event foundations everything else will reuse.

**Exit criteria**:

- a focused cockpit view exists
- the run timeline is real
- work items render with rationale and evidence
- event semantics live in one place

### Phase II - Make decisions humane (weeks 2-4)

**Items**: T4.2.1, T4.2.2, T4.2.3, T4.2.4, T4.2.5, T4.2.6, T4.5.3, T4.5.5

This phase upgrades the intervention loop itself. The point is not visual polish. The point is to reduce the cognitive and emotional cost of deciding.

**Exit criteria**:

- full action vocabulary visible in the UI
- blocking versus queued work clearly separated
- trust explainer shipped
- decision journal and undo path available

### Phase III - Make the agent a visible teammate (weeks 4-5)

**Items**: T4.3.1, T4.3.2, T4.3.3, T4.3.4, T4.3.5, T4.3.6, T4.5.4, T4.5.6

The workbench becomes truly agentic here. The goal is not more hidden automation. The goal is legible collaboration.

**Exit criteria**:

- participant strip visible
- conversation-linked receipts working
- clarification protocol replaces generic ambiguity handling
- host capability matrix explains the current operating envelope

### Phase IV - Make the app feel present (weeks 5-7)

**Items**: T4.4.1, T4.4.2, T4.4.3, T4.4.4, T4.4.5, T4.4.6

Only after the workbench is understandable and safe should it become more immersive. Otherwise the repo risks shipping beautiful opacity.

**Exit criteria**:

- live portal available when headed
- SAB powers the local hot path
- replay theatre works
- accessibility and responsive polish are not optional

### Phase V - Make it lovable and shareable (weeks 7-8)

**Items**: T4.1.5, T4.6.1, T4.6.2, T4.6.3, T4.6.4, T4.6.5, T4.6.6

This phase turns the dashboard into a product people want open all day instead of tolerate.

**Exit criteria**:

- simulator and narrator exist
- command palette and saved perspectives exist
- shareable reels and daily digest are useful in real workflows

### Phase Omega - Moonshot evaluation (ongoing)

**Items**: T4.7.1 through T4.7.8

Moonshots should be staffed only after the first four phases make the flagship workbench trustworthy.

---

## 7) Metrics that matter in V4

V4 should be judged by operator experience, not by how many panels it renders.

| Metric | Why it matters | Target direction |
|--------|----------------|------------------|
| **Time to orient** | How long it takes a user to answer "what is happening?" after opening the dashboard | Down |
| **Time to confident decision** | Human latency from item visibility to action with trust explainer available | Down |
| **Decision reversal rate** | Whether the workbench is making people act too quickly or with too little context | Down |
| **Clarification salvage rate** | Percentage of ambiguous steps resolved through structured clarification instead of falling to generic review | Up |
| **Host-switch handoff loss** | Context lost when moving from dashboard to another agent host | Down |
| **Portal attachment rate** | How often the system can provide true live presence when capability allows it | Up |
| **Zero-copy coverage** | Share of hot-path visuals powered by the SAB path instead of JSON WS | Up |
| **Action vocabulary coverage** | Percentage of domain workbench actions directly available in the dashboard and MCP | Up toward 100% |
| **New-user activation time** | Time for a first-time user to complete a useful task using the simulator and empty-state guidance | Down |
| **Async comprehension rate** | Whether exported reels and digests let teammates understand a run without opening the full repo | Up |

---

## 8) Risk posture and controls

### Primary risks

1. **Beautiful opacity** - a richer spatial UI could make the system feel more magical and less understandable.
2. **Projection drift** - dashboard, MCP, and session adapters could slowly diverge in meaning.
3. **UI-owned truth** - it would be easy to sneak domain logic into the front end while building rich explanations.
4. **Accessibility debt** - immersive visuals could quietly punish keyboard and reduced-motion users.
5. **Agent overreach** - plan-first and collaborative agent features could accidentally hide or blur governance boundaries.

### Controls

1. Keep the dashboard projection-only. All durable truth remains in typed artifacts, receipts, and policies.
2. Ship `Projection Symmetry` tests before the bigger collaboration features.
3. Treat accessibility and degraded states as phase-level completion criteria, not stretch goals.
4. Prefer capability negotiation over capability guessing.
5. Require every agentic feature to show its reasoning, scope, and fallback path.

---

## 9) Final call: build the workbench people want to leave open

The repo does not need a generic "better dashboard". It needs a flagship workbench that makes Tesseract's unique strengths felt:

- typed, explainable runtime reasoning
- governed intervention
- provider-agnostic agent collaboration
- live attachment to the interface under test
- durable artifacts that tell one story across CLI, UI, and agents

V1 makes the system real.  
V2 makes the ambition larger.  
V3 makes the architecture inventive.  
**V4 makes the product usable, lovable, and intuitively agentic.**

If V4 succeeds, the dashboard stops being a nice add-on for demos and becomes the natural place where interface intelligence, agent workbench, and recursive improvement are actually experienced.

---

### Document lineage

- V1: `docs/research-master-prioritization.md`
- V2: `docs/research-master-prioritization-expanded.md`
- V3: `docs/research-master-prioritization-v3.md`
- V4: this document, focused exclusively on dashboard UI, end-user experience, and intuitive agentic surfaces
- Companion design spec: `docs/dashboard-workbench-first-principles.md`
