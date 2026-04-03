# Dashboard Workbench Design

*First-principles information architecture, overlay geometry, and agentic flow design for Tesseract's flagship dashboard/workbench surface. March 27, 2026.*

---

## 0) Purpose

This document answers a narrower and more practical question than the roadmap:

> *If Tesseract's flagship product surface is the dashboard/workbench, what should it actually look like, how should information flow through it, and how should it behave under real runtime conditions?*

It exists because the repo now has enough real capability to deserve a purpose-built design, not just a list of future features.

This design is grounded in the dashboard/event/workbench seams that already exist:

- `DashboardPort` and `awaitDecision` in [ports.ts](/c/Users/danny/OneDrive/Documents/agentic-playwright/lib/application/ports.ts)
- the event bus and SAB ring in [pipeline-event-bus.ts](/c/Users/danny/OneDrive/Documents/agentic-playwright/lib/infrastructure/dashboard/pipeline-event-bus.ts)
- the dashboard observer and React shell in [app.tsx](/c/Users/danny/OneDrive/Documents/agentic-playwright/dashboard/src/app.tsx)
- the spatial coordinate helpers in [types.ts](/c/Users/danny/OneDrive/Documents/agentic-playwright/dashboard/src/spatial/types.ts)
- the workbench projection and screen-grouped act loop in [agent-workbench.ts](/c/Users/danny/OneDrive/Documents/agentic-playwright/lib/application/agent-workbench.ts)
- the browser bridge and screen observer in [playwright-mcp-bridge.ts](/c/Users/danny/OneDrive/Documents/agentic-playwright/lib/infrastructure/mcp/playwright-mcp-bridge.ts) and [playwright-screen-observer.ts](/c/Users/danny/OneDrive/Documents/agentic-playwright/lib/infrastructure/observation/playwright-screen-observer.ts)

This document is the design companion to [research-master-prioritization-v4.md](/c/Users/danny/OneDrive/Documents/agentic-playwright/docs/research-master-prioritization-v4.md).

The application architecture companion is [dashboard-workbench-application-architecture.md](/c/Users/danny/OneDrive/Documents/agentic-playwright/docs/dashboard-workbench-application-architecture.md).

---

## 1) Core thesis

The dashboard should not be a pile of panels.

It should be a **flagship workbench** organized around four questions:

1. **What is happening right now?**
2. **What needs action next?**
3. **Why does the system believe what it believes?**
4. **Who is acting: system, agent, or operator?**

Everything on screen should serve one of those questions.

### Non-negotiable invariants

1. The dashboard is a projection, never a source of durable truth.
2. The same workbench semantics must project to UI, MCP, and session adapters.
3. The default experience must degrade gracefully when live DOM, MCP, or headed mode are absent.
4. The current run should feel live, but historical understanding must be one click away.
5. Motion is only allowed when it explains state, ownership, urgency, or causality.

---

## 2) What data we already have, but do not use well enough

The opportunity is not speculative. The dashboard already has or can cheaply obtain far more structured data than it currently presents.

### 2.1 Current data inventory

| Surface | Data | Availability | Current use | Better presentation |
|---|---|---|---|---|
| Live progress | phase, iteration, maxIterations, elapsed, convergenceReason, proposalsActivated, unresolvedSteps, calibration topCorrelation | Available now via `progress` | Small cards and status bar | Storyline rail, Now card, digest, narration |
| Stage lifecycle | stage, phase, durationMs, adoId, cacheStatus, rewrittenFiles | Available now via `stage-lifecycle` | Dot pipeline only | Timeline rows, cache audit, artifact impact inspector |
| Workbench summary | total, pending, completed, byKind, topPriority | Available now via workbench projection | Minimal header counts | Resolve lane summary, batching hints, next-best-action |
| Work item detail | actions, adoId, exhaustionTrail, evidence, linked proposals/hotspots/bottlenecks | Available now in `AgentWorkItem` | Largely unused | Expandable reason card + inspector |
| Completions | status, rationale, completedAt, artifactsWritten | Available now | Simple completions panel | Decision journal and undo lane |
| Lineage | proposalId, workItemId, completionStatus, artifactsWritten, timestamp | Available now in `.tesseract/workbench/lineage.json` | Not surfaced | Feedback graph and replay trail |
| Queue urgency | blocking vs queued semantics | Available now in inbox events and pause flow | Not clearly separated | Dedicated `Awaiting Human` lane vs review backlog |
| Knowledge state | nodes, aliases, confidence, governance, lastActor | Available now | 3D observatory only | Atlas, inspector, confidence timeline |
| Confidence crossings | previous/new status, threshold, score | Available now | Cache update only | Threshold change log, trust explainer |
| Element escalation | fromActor, toActor, reason, governance | Available now | Queue only, not rendered in main IA | Ownership handoff lane and narrative timeline |
| Screen group context | screen aliases, route refs, knowledge refs, elements | Available now through `screen-group-start` and workbench grouping | Not surfaced | Batch triage shell by screen |
| Capabilities | screenshot stream, portal, MCP, Playwright bridge | Available now | Small checks only | Presence bar + mode explainer |
| Browser bridge | screenshot, query boundingBox, aria snapshot, click/fill/navigate | Available now in headed mode | Not integrated into the flagship UX | Inspector actions and overlay reconciliation |

### 2.2 Data that is architecturally supported but under-plumbed

| Data | Current status | Why it matters | Needed work |
|---|---|---|---|
| Bounding boxes on `element-probed` during real runs | Type supports it; `run.ts` emits `null` today | Enables trustworthy overlays and responsive hit regions | Carry locator box through runtime probe events |
| Bounding boxes on escalations | Type supports it; currently `null` | Lets human see the exact object that changed owner | Derive from resolved locator or browser query |
| Full screenshot/capture stream from the live runtime | Supported in headed harness and bridge | Needed for faithful replay and overlay anchoring | Wire capture events from headed runner into dashboard stream |
| Screen observation detail: visible, enabled, ariaLabel, locatorStrategy | Available in `ScreenObservationResult` | Great for inspector truth and agent clarification UI | Project observer data into workbench view models |
| ARIA snapshots | Available in screen observer and browser bridge | Critical for semantic diffing and accessibility-first reasoning | Add inspector and compare view |
| Browser URL and frame context | Available | Useful for route/state narration and portal trust | Add to presence bar and inspector |
| Cache hit/miss and rewrite file lists | Available in stage lifecycle | Explains pipeline speed and side effects | Surface in timeline and artifact drawer |

### 2.3 Answer to the coordinate question

Yes.

We can take DOM node coordinates from the original capture surface and map them responsively to any browser size, as long as we treat the original capture space as canonical and render overlays from normalized ratios instead of fixed pixels.

The repo already contains the essential ingredients:

- capture width and height are stored on `screen-captured`
- DOM rectangles use `BoundingBox { x, y, width, height }`
- the dashboard already converts those into normalized/device-independent space in [types.ts](/c/Users/danny/OneDrive/Documents/agentic-playwright/dashboard/src/spatial/types.ts)
- the live portal design already assumes overlays come from Playwright probe coordinates, not from querying the iframe DOM directly

The right next step is not "can we do it?" The right next step is to formalize the geometry contract so every overlay system uses the same math.

---

## 3) Information architecture from first principles

The dashboard should have one default desktop composition and a few intentional alternate modes. The default should optimize for active work, not for maximal simultaneous visibility.

### 3.1 Default desktop layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Presence Bar                                                                │
│ Run / Host / Capabilities / Actor ownership / Current mode / Alerts         │
├───────────────────────────────────────────────┬──────────────────────────────┤
│ Surface Stage                                 │ Resolve Lane                 │
│ Live portal or screenshot + overlays          │ Now / Next / Blocked / Queue │
│                                               │ Agent plan / Human decision  │
│                                               │ Workbench clusters by screen │
├───────────────────────────────────────────────┴──────────────────────────────┤
│ Storyline Rail                                                               │
│ Timeline of stages, probes, escalations, approvals, artifacts, convergence  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Inspector Drawer                                                             │
│ Selected element / work item / proposal / screen / trust explainer          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 The five primary zones

#### 1. Presence Bar

Persistent, compact, always visible.

It answers:

- which run are we looking at?
- who is active right now?
- what capabilities are available?
- are we in live mode, replay mode, or audit mode?
- is the system paused, converging, blocked, or idle?

#### 2. Surface Stage

The stage is the living face of the app under test.

It should contain:

- live portal or screenshot plane
- semantic overlays
- ownership markers
- interaction glows
- optional ambient spatial effects

It should not contain:

- dense textual explanations
- long lists
- policy details

Those belong in the inspector and resolve lane.

#### 3. Resolve Lane

This is the core operational inbox, but purpose-built.

It is not a flat queue. It is a staged lane with:

- `Now`: the item currently being processed or blocking the fiber
- `Agent`: what the agent is actively resolving
- `Queued`: grouped by screen or concern family
- `Needs Human`: items that truly require human intervention
- `Resolved`: recent decisions and their consequences

This is where the workbench becomes a workbench instead of a list.

#### 4. Storyline Rail

The rail is the memory of the current run.

It should unify:

- stage lifecycle
- progress milestones
- screen group transitions
- escalations
- proposal activations
- artifact writes
- confidence crossings
- pause/resume moments

The operator should be able to scrub it and rehydrate the rest of the UI from any point.

#### 5. Inspector Drawer

The drawer is contextual, never primary.

Selecting anything in the stage, lane, or timeline should populate it with:

- why this thing exists
- what evidence supports it
- how it was resolved
- which actor touched it
- what actions are available now

---

## 4) The responsive overlay system

The overlay system is the hardest design problem and the highest leverage one.

We should solve it once, generically, for both CSS and WebGL consumers.

### 4.1 Canonical coordinate model

Every overlay should anchor to a **surface snapshot space**, not to the browser viewport directly.

Proposed conceptual model:

```ts
interface SurfaceSnapshot {
  readonly surfaceId: string;
  readonly url: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly capturedAt: string;
  readonly mode: 'screenshot' | 'live-portal';
}

interface OverlayAnchor {
  readonly targetId: string;
  readonly surfaceId: string;
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

interface OverlayRatios {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}
```

The rules:

1. `rect` is always expressed in the source capture space.
2. `OverlayRatios` are computed as `rect / source dimensions`.
3. Renderers map those ratios onto the current displayed surface rectangle.

This makes overlays responsive across:

- browser resize
- split-pane resize
- DPR differences
- CSS scaling
- live portal vs screenshot rendering

### 4.2 Mapping algorithm

#### Source -> ratios

```ts
left = rect.x / sourceWidth
top = rect.y / sourceHeight
width = rect.width / sourceWidth
height = rect.height / sourceHeight
```

#### Ratios -> current display pixels

Given the rendered stage rectangle:

```ts
displayLeft = stageRect.left + ratios.left * stageRect.width
displayTop = stageRect.top + ratios.top * stageRect.height
displayWidth = ratios.width * stageRect.width
displayHeight = ratios.height * stageRect.height
```

#### Ratios -> Three.js world

This is already effectively what [types.ts](/c/Users/danny/OneDrive/Documents/agentic-playwright/dashboard/src/spatial/types.ts) does through `domToNdc` and `domToWorld`.

The missing abstraction is not the math. It is the shared geometry contract.

### 4.3 Why both CSS and WebGL overlays matter

We should explicitly support two overlay consumers:

1. **WebGL overlays**
   - glows
   - particles
   - ownership halos
   - ambient confidence or governance effects

2. **CSS overlays**
   - hit regions
   - labels
   - keyboard focus rings
   - tooltips
   - human decision affordances

WebGL is beautiful. CSS is precise and accessible.

The same `OverlayAnchor` should drive both.

### 4.4 Edge cases that matter

#### Letterboxing

If the screenshot aspect ratio does not match the rendered stage, the UI must compute the true displayed content rect inside the container before positioning overlays.

#### Scroll offset

If captures are viewport-relative, overlays must carry the scroll position from the moment of capture.

#### Live portal drift

If the iframe has navigated or reflowed since the last probe, overlays should visibly mark themselves as stale instead of pretending precision.

#### Null geometry

When bounding boxes are absent, the UI should downgrade gracefully to:

- screen-level markers
- lane cards
- inspector detail

Never fake a precise overlay without geometry.

### 4.5 Recommended geometry work

#### Immediate

1. Extend runtime probe emission in [run.ts](/c/Users/danny/OneDrive/Documents/agentic-playwright/lib/application/run.ts) to carry real bounding boxes when a headed bridge or observer is available.
2. Add source viewport metadata to `screen-captured` and any geometry-bearing events.
3. Build one shared overlay mapper for both CSS and R3F consumers.

#### Shortly after

1. Add stale-geometry detection between capture time and current portal state.
2. Support screen-level and element-level overlay anchors.
3. Support replay-time geometry reconstruction from event history.

---

## 5) How the agent should feel in the design

The agent should be legible as an actor, not a hidden helper thread.

That does not necessarily mean a humanoid avatar or overtly visual gimmicks.

It means the UI should make five things obvious:

1. **what the agent is looking at**
2. **what the agent is trying to do**
3. **why the agent believes it is safe**
4. **when the agent is blocked or uncertain**
5. **what changed because of the agent**

### 5.1 The agent is a lane, not a modal

The core mistake would be to hide agent activity inside popovers or logs.

Instead, the default Resolve Lane should have an explicit agent section:

- current screen group
- current work item
- current plan or next action
- active evidence being consulted
- confidence / governance posture
- whether the agent can continue autonomously

### 5.2 Queue lifecycle from first principles

The queue should be modeled as a flow, not as a stack.

```text
Detected
  -> grouped
  -> ready
  -> claimed-by-system | claimed-by-agent | awaiting-human
  -> resolved | skipped | blocked
  -> learned
```

This is more faithful to the codebase than a flat "pending/completed" UI because the system already distinguishes:

- grouped screen batches in `processWorkItems`
- blocking human pauses via `awaitDecision`
- autonomous/default decisions
- completion ledgers
- lineage back into later iterations

### 5.3 Concrete event-to-experience mapping

| Runtime/data event | User experience treatment |
|---|---|
| `workbench-updated` | Recompile queue clusters and summary counts |
| `screen-group-start` | Promote one screen cluster into active focus |
| `item-processing` | Move the item into `Now` with clear actor ownership |
| `fiber-paused` | Freeze the `Now` card and open human decision surface |
| `fiber-resumed` | Clear pause state, append decision journal entry |
| `element-escalated` | Animate ownership handoff system -> agent -> operator |
| `item-completed` | Move item into resolved journal with outcome and written artifacts |
| `confidence-crossed` | Show what crystallized, and why it matters |
| `proposal-activated` | Show whether it passed through or rebounded off trust policy |

### 5.4 Plan, act, confirm, learn

The agent flow should be presented in four verbs:

1. **Plan**
   - what it intends to do next
   - why this order makes sense
   - what could force fallback

2. **Act**
   - which work item or screen group is active
   - which tools or surfaces it is using
   - what ownership it currently has

3. **Confirm**
   - what evidence indicates success or ambiguity
   - whether trust policy or human review is required

4. **Learn**
   - what artifact or confidence state changed
   - what future work became cheaper or disappeared

This gives the product an intelligible rhythm.

### 5.5 Animation with semantic meaning

If motion is used, it should have one of five meanings:

| Motion | Meaning |
|---|---|
| Spawn / pulse | new work or new evidence arrived |
| Handoff arc | ownership moved from one actor to another |
| Gate pass / rebound | trust policy allowed or blocked a proposal |
| Freeze / spotlight | the fiber is paused for human review |
| Dissolve / crystallize | ephemeral observation became stable knowledge |

Anything beyond that is ornament.

---

## 6) How the data should actually be presented

This is the section v4 was missing most acutely: a concrete plan for what goes where.

### 6.1 Presence Bar

Should contain:

- run id or benchmark label
- current phase and iteration
- execution profile (`interactive`, `ci-batch`, `dogfood`)
- active host (`headless`, dashboard human, session agent, Copilot, Claude Code, etc.)
- capability chips: `Portal`, `MCP`, `Playwright`, `Replay`
- urgency chip: `Live`, `Paused`, `Review`, `Idle`

Should not contain:

- raw metrics that belong in the storyline or lane
- verbose error strings

### 6.2 Surface Stage

The stage should present exactly three overlay layers:

1. **Target layer**
   - bounding boxes
   - labels
   - selector or target identity

2. **Ownership layer**
   - actor tint
   - escalation arrows
   - paused target spotlight

3. **Outcome layer**
   - approved / review-required / blocked treatment
   - successful resolution vs degraded / ambiguous

Everything else belongs in the drawer.

### 6.3 Resolve Lane

The lane should be vertically ordered by decision relevance:

#### Now

- the active screen group or active work item
- current actor
- current plan
- current evidence and risk
- one primary action row

#### Needs Human

- only truly blocking items
- one card at a time expanded
- rationale and safe next actions always visible

#### Agent Queue

- grouped by screen
- collapsed by default
- shows count, urgency, and top reason

#### Recently Resolved

- compact journal
- includes artifacts written and reversible window if still active

### 6.4 Storyline Rail

The rail should be filterable by:

- actor
- event family
- screen
- severity
- governance impact

Each timeline node should reveal:

- what changed
- why it matters
- related artifacts
- "inspect" and "jump stage" actions

### 6.5 Inspector Drawer

The drawer should support four tabs:

1. **Why**
   - rationale
   - exhaustion trail
   - event lineage

2. **Evidence**
   - sources
   - ARIA snapshot excerpt
   - screen observation status

3. **Actions**
   - workbench actions
   - browser bridge actions when safe

4. **Impact**
   - linked proposals
   - linked hotspots
   - artifacts written
   - rerun implications

### 6.6 Data points that deserve explicit UI treatment

These are available or nearly available and should not stay hidden:

| Data point | Best home |
|---|---|
| `context.exhaustionTrail` | `Why` tab and timeline tooltip |
| `actions[]` | Action row on cards and drawer |
| `evidence.sources` | Evidence tab and decision journal |
| `linkedProposals` / `linkedHotspots` / `linkedBottlenecks` | Impact tab |
| `summary.byKind` | Queue cluster header |
| `summary.topPriority` | Presence bar + `Now` seed |
| `stage.durationMs` and `cacheStatus` | Storyline rail and pipeline audit |
| `rewrittenFiles` | Artifact subpanel |
| `calibration.topCorrelation` | Convergence insight chip, not just drift scalar |
| `InboxUrgency` | Hard split between blocking and queued |
| `artifactsWritten` | Resolved journal and shareable reel |

---

## 7) Responsive modes

The same IA should compress intentionally, not collapse randomly.

### Desktop

- full stage + lane + timeline + drawer
- default operator mode

### Laptop

- timeline compresses to a horizontal scrub strip
- drawer becomes a right-side sheet
- queue clusters collapse more aggressively

### Tablet

- stage first
- resolve lane becomes bottom sheet
- timeline and drawer become segmented tabs

### Mobile or narrow width

The product should not try to be fully spatial-first here.

The correct fallback is:

- presence bar
- `Now` card
- queue
- timeline
- optional miniature capture view

The spatial stage becomes an enhancement, not a dependency.

---

## 8) Implementation plan for the design

### Phase A - Normalize the truth

1. Formalize the geometry contract shared by screenshot, portal, CSS overlay, and R3F.
2. Formalize the capability contract shared by server, UI, and MCP bridge.
3. Formalize the decision state machine.

### Phase B - Build the default IA

1. Presence Bar
2. Surface Stage
3. Resolve Lane
4. Storyline Rail
5. Inspector Drawer

### Phase C - Wire the underused data

1. Render work item actions and evidence
2. Surface stage durations and cache hits
3. Render screen-group transitions
4. Add confidence and escalation narratives

### Phase D - Make overlays real

1. Emit real bounding boxes from runtime/headed flows
2. Add CSS overlay layer
3. Add stale geometry treatment
4. Add replay-time geometry restoration

### Phase E - Make the agent legible

1. Participant strip
2. Plan-first agent lane
3. Clarification UI
4. Handoff bundles and host capability matrix

### Phase F - Make it teachable and shareable

1. Simulator
2. Narrator
3. Saved perspectives
4. Review reels

---

## 9) Open design concerns

1. **How much of the surface should be spatial by default?**
   My answer: the stage should stay visual, but the decision lane and drawer must remain text-first.

2. **Should the agent ever act directly from the stage?**
   Yes, but only through the same action router and with visible ownership/fallback.

3. **How much geometry precision do we promise?**
   Only as much as the capture contract can guarantee. Stale overlays must be marked stale.

4. **Do we let the portal become interactive?**
   Only deliberately, and only when the system is paused or in a controlled observation mode.

5. **Can the workbench be calm by default?**
   Yes. It should trend toward ambient when there is no urgent work.

---

## 10) Final recommendation

The right path is:

1. treat the dashboard as the flagship workbench
2. organize it around presence, stage, resolve lane, storyline, and inspector
3. unify all overlay geometry around capture-space ratios
4. make the agent a visible operating participant
5. use animation only to communicate causality, urgency, and ownership

The most important concrete move is to stop thinking of the dashboard as "panels plus a canvas" and instead think of it as:

**one active stage, one active lane of work, one memory rail, and one explanation drawer**

That is the shape that best fits the data Tesseract already has.
