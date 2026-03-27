# Research: Where Tesseract Should Go Next — Round 5 (Visionary)

*Four esoteric, future-looking, and meta-level research perspectives that could only emerge after 16 prior angles of investigation. March 2026.*

---

## Perspective 17: The Algebra Hiding in the Architecture

**Researcher focus**: The codebase has mathematical structure it doesn't name. Resolution is a prioritized coproduct, governance is a three-valued lattice, the dogfood loop is a fixed-point iteration, the 8 fold functions are catamorphisms. What algebraic structures are hiding in the code, and what would formalizing them unlock?

### Findings

*Awaiting research...*

---

## Perspective 18: The Self-Verifying Compiler

**Researcher focus**: Tesseract compiles human intent into executable tests and declares architectural doctrine in CLAUDE.md. But the gap between "declared invariant" and "tested invariant" is vast. What if Tesseract could compile its own doctrine into self-verification tests? What's the delta between the current law tests and full self-verification?

### Findings

*Awaiting research...*

---

## Perspective 19: The Invisible Architecture (What the Gaps Between Perspectives Reveal)

**Researcher focus**: After 16 perspectives, the same structural tension appears from every angle: designed-but-unconnected subsystems. The governance types exist but aren't enforced. The observation surface is richer than what consumes it. The interface graph and derived graph never validate consistency. What is the "negative space" architecture — the system that would exist if every accidental gap were closed?

### Findings

This perspective required synthesizing all 16 prior angles of investigation. The question: after examining every subsystem individually, what architecture emerges from the *spaces between* them?

#### The Gap Taxonomy

After tracing every cross-subsystem boundary, the gaps fall into three distinct categories:

**Category A: Load-Bearing Gaps (Intentional Separation — Do Not Close)**

These are designed decouplings where closing the gap would collapse important architectural properties.

| Gap | Between | Why It's Intentional |
|-----|---------|---------------------|
| **ApplicationInterfaceGraph ↔ DerivedGraph** | Interface intelligence ↔ Projection | Different type systems (11 vs 24 node kinds), different questions (structure vs behavior), different lifecycles. Merging would create a God-object. |
| **DisabledDashboard ↔ PipelineEventBus** | CI/batch ↔ Interactive | The pipeline MUST run identically headless. The `Disabled*` variants are the proof. Coupling observation to execution would break CI. |
| **Domain layer ↔ Effect** | Pure FP ↔ Effectful orchestration | 33 pure domain files with zero Effect imports. This purity enables law testing, deterministic compilation, and safe refactoring. The boundary is the codebase's most valuable architectural property. |
| **Compile-time binding ↔ Runtime resolution** | `bindScenarioStep` ↔ Resolution ladder | Binding is deterministic (compile-time). Resolution is environment-dependent (runtime). Merging them would destroy the compiler's determinism guarantee. |

**Category B: Accidental Gaps (Should Be Connected But Aren't)**

These are places where subsystems were designed to work together but the wiring was never completed.

| Gap | Between | Evidence | Impact |
|-----|---------|----------|--------|
| **1. Governance types ↔ Governance enforcement** | `Approved<T>`/`Blocked<T>` phantom brands ↔ Production code | Types defined in `workflow.ts:8-42`. `foldGovernance` defined in `workflow.ts:33-42`. `requireApproved` defined in `workflow.ts:27-31`. **Only 1 production call site** (`validate-step-results.ts:22-27`). 35 sites mint `governance: 'approved'` as plain strings. | Any code can forge governance status. The type system cannot prevent `governance: 'approved'` on an unapproved artifact. The entire approval flow is honor-system. |
| **2. Agent DOM snapshot ↔ Agent prompt** | `domSnapshot` field in `AgentInterpretationRequest` ↔ Always `null` at invocation | Field declared in types. Prompt template handles it (`line 431: domSnapshot.slice(0, 2000)`). Never populated in `resolution-stages.ts:491`. | Agent at Rung 9 cannot see the page. It must interpret intent purely from text descriptions and exhaustion trails. DOM-layout-dependent intents (e.g., "click the third button in the header") are unresolvable. |
| **3. Interface graph ↔ Derived graph consistency** | `buildApplicationInterfaceGraph` ↔ `buildDerivedGraph` | Zero cross-references between builder functions. No shared validation. grep for `interfaceGraph.*derivedGraph` returns 0 results. | If the interface graph says a screen has element X but the derived graph doesn't, the inconsistency is silent. No build-time or runtime check validates cross-graph coherence. |
| **4. Dashboard event richness ↔ Dashboard event consumption** | 22 event kinds emitted ↔ Subset consumed by React | `element-probed` emitted in `run.ts:124`. `element-escalated` in `run.ts:149`. `rung-shift` in `dogfood.ts:587`. `calibration-update` in `dogfood.ts:596`. `confidence-crossed` in `confidence.ts:282`. But dispatch handlers in React only route: `progress`, `element-probed`, `screen-captured`, `item-pending`, `item-processing`, `item-completed`, `fiber-paused`, `fiber-resumed`, `element-escalated`, `stage-lifecycle`. | 12 of 22 event kinds are consumed. **10 event kinds are emitted but never consumed**: `rung-shift`, `calibration-update`, `proposal-activated`, `confidence-crossed`, `artifact-written`, `iteration-start`, `iteration-complete`, `workbench-updated`, `fitness-updated`, `inbox-item-arrived`. The observation surface is richer than what any consumer uses. |
| **5. SharedArrayBuffer ↔ React visualization** | Zero-copy ring buffer with atomic writes ↔ React reads via WS JSON | The PipelineBuffer exists, `readSlot` is exported. `usePipelineBuffer` hook exists. But the primary consumption path is WS JSON events through `useWebSocket`. | The zero-copy path — the most technically sophisticated piece of the observation surface — may not be exercised in production. The React dashboard routes events through JSON serialization over WebSocket, not through the SharedArrayBuffer. |
| **6. MCP tools ↔ Agent interpreter** | 15 MCP tools in `dashboard-mcp-server.ts` ↔ Agent interpreter at Rung 9 | Agent interpreter receives a flat prompt. MCP tools expose structured observation. But the agent interpreter never invokes MCP tools — it receives a pre-packaged context. | The MCP surface is designed for external agents (Claude Code, Copilot) but isn't used by the *internal* agent interpreter. The agent that most needs structured DOM access doesn't have it. |
| **7. Pipeline stage fingerprints ↔ Cross-stage dirty tracking** | Per-stage `fingerprintInput`/`fingerprintOutput` ↔ No inter-stage awareness | `runIncrementalStage` tracks manifests per projection. But `emit` doesn't know if `bind` already ran. The dogfood loop calls stages sequentially without checking prior stage outputs. | Running `npm run emit` after `npm run bind` rebuilds even if bind already ran. No cross-stage cache. Each command is an independent Effect program. |

**Category C: Emergent Gaps (Visible Only Through Cross-Perspective Analysis)**

These are tensions that no single-file reader would notice — they emerge from the interaction of multiple architectural decisions.

##### C1: The Governance Paradox

The governance model exhibits a striking paradox visible only after examining it from 4 perspectives:

- **Round 2 (Perspective 7)**: Discovered phantom branded types exist but are unenforced
- **Round 3 (Perspective 10)**: Found 14 sites mint governance as plain strings
- **Round 4 (Perspective 13)**: Confirmed the domain layer is pure — governance types are correctly defined
- **Round 4 (Perspective 14)**: Found the agent interpreter produces `governance: 'review-required'` — correctly

The paradox: the *agent* respects governance more faithfully than the *deterministic pipeline*. The LLM integration surface (Rung 9) correctly marks its output as `review-required`. But the deterministic rungs (1-6) hardcode `governance: 'approved'` in `resolution-stages.ts:213,255,315,427` without passing through any governance validation. The one place that DOES use `foldResolutionReceipt` with `isApproved` assertions is `validate-step-results.ts` — but this runs AFTER execution, not before emission.

**The invisible architecture**: governance should be a pre-emission gate (you can't emit what isn't approved), but it's actually a post-execution assertion (we check after the fact). The phantom types were designed for the former. The code implements the latter.

##### C2: The Observation Asymmetry

The observation surface has a striking asymmetry:

- **Emitter side** (Effect pipeline): 26 `dashboardEvent()` calls across 11 files. Rich, typed events with actor provenance, governance state, bounding boxes, confidence scores, bottleneck weights.
- **Consumer side** (React dashboard): Dispatches 10 of 22 event kinds. Has beautiful 3D visualization (selector glows, particle transport, knowledge observatory, decision burst, proposal gate) but many of these spatial components don't have data flowing to them yet.
- **MCP side** (structured access): 15 tools defined, 8 tool handlers implemented. But the internal agent doesn't use them.

The invisible architecture: the observation surface was designed as a *complete* system — the types are there, the encoding is there, the spatial visualization components exist. But the wiring is incomplete. It's like a building with every room furnished but some hallways unfinished.

##### C3: The Knowledge-Resolution Feedback Discontinuity

The resolution ladder produces rich information at every rung:
- Exhaustion entries (what failed and why)
- Top candidates (with scores)
- Proposals (alias suggestions)
- Evidence (what worked in prior runs)

The dogfood loop consumes this:
- Proposals are activated by confidence overlay
- Scorecard tracks hit rates and convergence
- Bottleneck weights self-calibrate

But there's a discontinuity: the **per-step** resolution information (exhaustion trail, candidates, scores) is summarized into **per-scenario** aggregates (hit rate, resolution rate) before reaching the improvement engine. Individual step-level learning signals are lost in aggregation. A step that narrowly fails at Rung 5 and one that fails catastrophically at Rung 1 both count as "unresolved" in the scorecard.

#### The Single Unifying Insight

After mapping all three categories, a single architectural observation emerges:

**The codebase has a consistent pattern of designing complete type-level contracts and then implementing partial runtime wiring.**

- Governance types: complete at type level, partial at runtime
- Dashboard events: complete taxonomy, partial consumption
- MCP tools: complete catalog, partial integration
- Graph models: complete node/edge types, no cross-validation
- Agent context: complete request schema, partial population (DOM = null)

This is not a flaw — it's a *strategy*. The type-level contracts are the *specification*. The partial runtime wiring is the *current implementation*. The gap between them is the *backlog*, encoded in the type system itself.

#### The Invisible Architecture, Revealed

If every accidental gap were closed — governance enforced via phantom brands, DOM snapshot populated, graph consistency validated, all 22 events consumed, SharedArrayBuffer wired to visualization, MCP tools available to the internal agent, cross-stage dirty tracking implemented — the system would be:

1. **Self-certifying**: Governance phantom brands prevent emission of unapproved artifacts at compile time
2. **Fully observable**: Every event emitted is consumed and visualized
3. **Informationally complete**: The agent sees the DOM, the graphs validate each other, the pipeline knows what's dirty
4. **Agent-symmetric**: Internal and external agents have the same MCP tool access

The current system is perhaps 60% of this invisible architecture. The type system is 90% there. The runtime wiring is 40% there. The gap is the work.

---

## Perspective 20: Information-Theoretic Limits of the Agent's Context Window

**Researcher focus**: The agent at Rung 9 receives a 9-section system prompt. But is this the right information? What's the minimum context for correct interpretation? Is the resolution ladder an information funnel — does each rung reduce entropy in a measurable way? Could a "minimum viable context" achieve the same accuracy at half the token budget?

### Findings

*Awaiting research...*

---

## Cross-cutting synthesis

*To be written after all four perspectives complete.*
