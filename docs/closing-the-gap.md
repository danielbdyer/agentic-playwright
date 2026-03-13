# Closing the Gap: From Cathedral Drawings to a Standing Building

_Written March 2026 after a thorough codebase review._

This document is a concrete implementation plan. It identifies the smallest sequence of moves that turns Tesseract from a system that talks about a flywheel into a system that demonstrably runs one. Every move has a clear deliverable, a proof point, and a reason it comes before the next.

The diagnosis is honest: the architecture is excellent, the domain model is genuinely load-bearing, and the single demo scenario proves the pipeline end-to-end. But the gap between what the docs describe and what the code demonstrates is roughly two architectural generations. The system needs to close that gap through working artifacts, not more documentation.

---

## The honest state of play

### What's real and impressive

- **215 source files, ~29K LOC** with clean layer isolation enforced by architecture tests
- **Branded types** (`CanonicalTargetRef`, `ScreenId`, `SelectorRef`, etc.) that make ontology violations a compile error
- **Law tests** using seeded randomized property testing for resolution precedence, candidate lattice ranking, normalization idempotency, and collection determinism
- **Full pipeline for one scenario**: ADO sync, parse, bind, task packet, emission, review artifact, trace JSON, proposals — all working
- **State topology** (`policy-search.behavior.yaml`) with 6 state nodes, 2 event signatures, 4 transitions — a genuinely rich behavioral model
- **`lib/playwright/state-topology.ts`** with working predicate evaluation, transition observation, and recursive state priming against real Playwright pages
- **Runtime agent pipeline** with bounded working memory, staleness TTL, exhaustion chains, and the full resolution ladder
- **Learning projection** that actually writes decomposition, workflow, and repair-recovery fragments to disk
- **Confidence overlay scoring** from real run records with threshold-based status
- **Discovery tooling** that launches Chromium, captures ARIA snapshots, and scaffolds screen knowledge
- **Route harvesting** that walks the behavior model and observes transitions on live pages

### What's thin

| Area | State | What's missing |
|---|---|---|
| Screen breadth | 1 screen (`policy-search`) | No second screen to prove reuse, shared targets, or cross-screen resolution |
| Scenario breadth | 1 scenario (ADO 10001, 4 steps) | No second scenario to prove selector canon sharing, incremental recomputation, or knowledge hit rates under reuse |
| Interface graph on disk | Types and projection code exist | `.tesseract/interface/index.json` and `selectors.json` not materialized — the "shared interpretation surface" is code, not artifact |
| Live DOM resolution | `dom-fallback.ts` exists, `resolveFromDom()` is called | No LLM-backed exploration; the "agentic fallback" rung is structural placeholder |
| Translation bridge | Translation types and cache exist | Structured translation produces no real candidates today |
| Multi-engine resolution | Registry exists with one engine | Only `deterministic-runtime-step-agent` registered |
| Proposal → canon feedback | `activate-proposals.ts` works | Never triggered by a real run producing a real proposal that feeds back into a real recompile |
| Workspace portability | `npm test` fails (missing `node_modules`) | Cannot verify the 163 tests reported in Phase 3 handoff |

### The core gap in one sentence

**The flywheel has never turned once.** Discovery has never fed the interface graph which has never fed resolution which has never produced proposals which have never been activated which have never triggered a recompile that made the next run cheaper.

---

## The proving sequence

The goal is not to implement every phase from the master architecture. The goal is to make the flywheel turn once, visibly, with receipts. Then turn it again and show it got cheaper.

### Move 0: Make the repo buildable and green

**Deliverable:** `npm install && npm run check` passes in a fresh clone.

**Why first:** Nothing else matters if the tests can't run. The Phase 3 handoff reports 163 passing tests. A reviewer or contributor who clones and can't verify that has no reason to trust anything.

**Work:**
- Pin dependency versions in `package.json` (ensure `@playwright/test`, `typescript`, `effect`, `esbuild` are all resolvable)
- Verify `npm run types`, `npm run typecheck`, `npm test` all pass
- Add a `package-lock.json` if one doesn't exist
- Clean up the stray shell-artifact files at repo root (`sh-add -l`, `MISSINGn`, `PRESENT`, etc.)

**Proof point:** CI badge or a contributor can clone → install → `npm run check` → green.

---

### Move 1: Materialize the interface graph and selector canon

**Deliverable:** `npm run refresh` writes `.tesseract/interface/index.json`, `.tesseract/interface/selectors.json`, and `.tesseract/interface/state-graph.json` to disk. They are queryable, fingerprinted, and consumed by the demo scenario's resolution.

**Why now:** The "shared interpretation surface" is the system's central claim. If it exists only as code that builds objects in memory but never writes them, consumers can't inspect it, agents can't query it, and the review artifacts can't reference it with integrity. The projection code in `interface-intelligence.ts` (1,374 lines) is already substantial — this is about connecting it to the filesystem and threading the output into the task packet builder.

**Work:**
1. Ensure `projectInterfaceIntelligence()` runs during `npm run refresh` and writes all three artifacts
2. Include fingerprints in the graph and canon so downstream consumers can detect changes
3. Thread `interfaceGraph` and `selectorCanon` into `buildScenarioInterpretationSurface()` so the task packet references graph node IDs and selector refs
4. Update the review markdown to include interface graph and selector canon fingerprints (already partially there — `sha256:d953...` appears in the existing review)
5. Add a test that proves: same knowledge inputs → same graph → same fingerprints (determinism law)
6. Add a test that proves: graph nodes reference exactly the targets in `policy-search.elements.yaml` (no orphans, no duplicates)

**Proof point:** `cat .tesseract/interface/index.json | jq '.nodes | length'` returns a nonzero number. The review artifact's interface graph fingerprint matches the on-disk file. A contributor can `npm run surface` and see the graph.

---

### Move 2: Add a second screen

**Deliverable:** A `policy-detail` screen with its own elements, surfaces, behavior, postures, and hints — plus at least one scenario (ADO 10002) that navigates from `policy-search` to `policy-detail`.

**Why now:** This is the single most important move in the entire sequence. Every scale claim — selector canon sharing, incremental recomputation, cross-screen state transitions, knowledge reuse — is currently demonstrated by n=1. A second screen with a cross-screen navigation makes n=2 and proves the architecture is load-bearing, not just type-bearing.

**What the second screen proves:**
- `CanonicalTargetRef` namespacing works across screens (`target:element:policy-search:searchButton` vs `target:element:policy-detail:policyNumber`)
- The selector canon holds entries from multiple screens without duplication
- A scenario that spans two screens references targets from both, and both resolve through the same interpretation surface
- The interface graph contains route edges between screens
- State transitions can model cross-screen navigation (the `results-visible` → `navigate-to-detail` transition)
- Incremental recomputation: changing `policy-detail.elements.yaml` recompiles scenario 10002 but not 10001

**Work:**
1. Create `fixtures/demo-harness/policy-detail.html` — a minimal page with a policy number display, status field, claims table, and back-to-search link
2. Author knowledge:
   - `knowledge/screens/policy-detail.elements.yaml` (4-6 elements)
   - `knowledge/screens/policy-detail.postures.yaml` (loaded, empty, error)
   - `knowledge/screens/policy-detail.hints.yaml`
   - `knowledge/screens/policy-detail.behavior.yaml` (state nodes for loaded/empty/error, transitions for navigation)
   - `knowledge/surfaces/policy-detail.surface.yaml`
3. Add route variant to `knowledge/routes/demo.routes.yaml` (policy-detail with entity context)
4. Author scenario:
   - `scenarios/demo/policy-detail/10002.scenario.yaml` — search for policy, click result row, verify detail screen loads with correct policy number
5. Run `npm run refresh` — both scenarios compile, both contribute to the interface graph, the selector canon holds entries from both screens
6. Add tests:
   - Interface graph contains nodes from both screens
   - Selector canon has entries for both screens' targets
   - Changing `policy-detail.elements.yaml` marks only 10002 for recompilation (fingerprint change detection)

**Proof point:** `npm run refresh` produces two specs, two reviews, two trace JSONs. `npm run graph` shows edges between the two screens. The selector canon JSON has entries from both screens. The review for 10002 shows cross-screen state transition refs.

---

### Move 3: Run discovery against the demo harness and prove it feeds the graph

**Deliverable:** `npm run discover -- --url fixtures/demo-harness/policy-search.html` produces a discovery run that enriches the interface graph with `source: 'discovery'` nodes. A second refresh shows those discovery nodes alongside the `approved-knowledge` nodes.

**Why now:** Discovery is the input side of the flywheel. The tooling in `discover-screen.ts` and `harvest-routes.ts` already works. But discovery output has never been consumed by `projectInterfaceIntelligence()` and merged into the graph. This move connects the two.

**Work:**
1. Run discovery, write output to `.tesseract/evidence/discovery/`
2. Make `projectInterfaceIntelligence()` load discovery runs from evidence and merge them into the graph (with `source: 'discovery'` attribution)
3. Discovery-sourced nodes should carry lower confidence than `approved-knowledge` nodes
4. The interface graph should show which targets were discovered vs which were authored
5. Add a test: discovery enriches the graph without duplicating approved-knowledge targets

**Proof point:** The interface graph JSON has nodes with `"source": "discovery"` alongside nodes with `"source": "approved-knowledge"`. `npm run surface` shows both.

---

### Move 4: Make one end-to-end run produce a real proposal that feeds back

**Deliverable:** Run scenario 10002 against the demo harness. The runtime encounters a target that doesn't have full selector health (simulated via a missing or degraded probe). It produces a `ProposalEntry`. The proposal is activated. The affected scenario recompiles with the improved knowledge. The second run resolves at a higher rung.

**Why now:** This is the flywheel turning once. Every piece of the machinery exists in isolation: execution produces receipts, receipts produce proposals, proposals can be activated, activation rewrites knowledge, recompilation picks up changes. But these pieces have never been connected in sequence with real data flowing through.

**Work:**
1. Set up a scenario step that resolves through translation or degraded locator (not rung 1)
2. Ensure `buildProposals()` produces a `ProposalEntry` with a concrete patch (e.g., add a hint alias, update a selector probe)
3. Run `npm run approve -- --proposal-id {id}` — the proposal activates, the knowledge file is patched
4. Run `npm run refresh` — the affected scenario recompiles with the patched knowledge
5. Run the scenario again — the step now resolves at a higher rung
6. The review markdown for the second run should show improved resolution statistics
7. The confidence overlay should show the formerly-degraded target with improved health

**Proof point:** Two run records exist. The second run's trace JSON shows a higher `knowledgeHitRate` than the first. The review markdown explains: "Step 2 resolved at rung 1 (approved-knowledge) — improved from rung 3 (degraded) after proposal `{id}` was activated." The flywheel turned once.

---

### Move 5: Make the scorecard measure the improvement

**Deliverable:** `npm run scorecard` produces a `BenchmarkScorecard` comparing the two runs. The scorecard shows: resolution quality improved, knowledge coverage increased, translation dependency decreased.

**Why now:** The flywheel turned in Move 4, but only the review markdown narrated the improvement. The scorecard makes it statistical. This is the surface that would eventually drive self-tuning — but even now, it gives an operator a single artifact that answers "is the system getting better?"

**Work:**
1. Ensure `projectBenchmarkScorecard()` consumes multiple run records
2. Score the delta: `firstPassResolutionRate` (should increase), `translationHitRate` (should decrease), `degradedLocatorRate` (should decrease), `knowledgeChurn` (should show one proposal activation)
3. Write scorecard to `.tesseract/benchmarks/`
4. Add a test: scorecard from two runs with one proposal activation shows measurable improvement

**Proof point:** `npm run scorecard` prints a JSON artifact showing resolution quality improved between run 1 and run 2. An operator or agent can read this artifact and decide whether to continue the loop.

---

### Move 6: Wire the dogfood loop as a thin orchestrator

**Deliverable:** `npm run dogfood -- --max-iterations 2` runs the full loop: compile → run → propose → activate → recompile → rerun → scorecard. It produces a `DogfoodRun` ledger explaining what happened.

**Why now:** Moves 0-5 proved every piece individually. This move connects them into the self-hardening loop that the backlog (A3) describes. It's a thin orchestration layer over existing commands — the hard work was proving each stage.

**Work:**
1. Create `lib/application/dogfood.ts` — a loop that chains: `compileAll()` → `runScenarioSelection()` → `activateProposalBundle()` → `compileAll()` → `runScenarioSelection()` → `projectBenchmarkScorecard()`
2. Budget controls: `--max-iterations`, `--convergence-threshold` (stop when scorecard delta < threshold)
3. Produce `DogfoodRun` ledger: iterations, proposals activated, scorecard deltas, remaining inbox items
4. Add CLI command `dogfood` to the registry

**Proof point:** `npm run dogfood -- --max-iterations 2` completes. The ledger shows: iteration 1 produced N proposals, M were activated, iteration 2 showed improved scorecard metrics, no new proposals generated, convergence reached.

---

## What this sequence deliberately skips

These are important but not on the critical path to proving the flywheel:

| Deferred | Why |
|---|---|
| LLM-backed DOM exploration (A1 full) | The dogfood loop can turn with deterministic + degraded resolution alone. LLM exploration makes it richer but isn't required for the first proof. |
| Copilot/VSCode integration (E2) | The flywheel proof is CLI-first. Agent adapters can come after the loop works. |
| Cross-app transfer learning (moonshot 5) | Requires at least two real apps. The demo harness is enough for now. |
| Structured entropy (D1) | Requires a working dogfood loop first. Sequence it after Move 6. |
| 2000-scenario scale test (Phase 7) | Two screens and two scenarios prove the architecture. Scale comes from repeating the pattern, not from a separate engineering effort. |
| Offline optimization (DSPy/GEPA) | Requires a statistical surface (scorecard) with enough data. Move 5 creates the surface; optimization tooling can follow. |

---

## What the demo harness needs

The existing `fixtures/demo-harness/policy-search.html` is the foundation. Moves 1-4 require:

1. **`policy-search.html` enhancements** (if not already there):
   - Working search form that accepts a policy number
   - Results table that shows/hides based on search input
   - Validation summary that shows/hides mutually exclusively with results
   - A clickable result row that navigates to policy-detail

2. **`policy-detail.html`** (new):
   - Displays policy number, status, effective date
   - Claims table (initially empty, populated on load if policy has claims)
   - Back-to-search link
   - Error state when policy is not found

These are static HTML fixtures, not a real app. They exist so that `npm run test:generated:headed` opens a browser and the emitted specs actually interact with something. The fixtures should be minimal — just enough to exercise the knowledge model and state topology.

---

## Implementation size estimates

These are rough scope indicators, not time predictions:

| Move | New files | Modified files | New tests | Net new LOC |
|---|---|---|---|---|
| 0: Build hygiene | 1-2 | 3-5 | 0 | ~50 |
| 1: Interface graph on disk | 0-1 | 4-6 | 2-3 | ~200 |
| 2: Second screen | 8-10 | 3-5 | 3-5 | ~600 |
| 3: Discovery → graph | 0-1 | 2-3 | 1-2 | ~150 |
| 4: Proposal feedback loop | 0-1 | 3-5 | 2-3 | ~300 |
| 5: Scorecard comparison | 0-1 | 2-3 | 1-2 | ~200 |
| 6: Dogfood orchestrator | 1-2 | 2-3 | 1-2 | ~300 |
| **Total** | **~15** | **~25** | **~12** | **~1,800** |

~1,800 lines of new code to prove the flywheel. That's smaller than `interface-intelligence.ts` alone. The architecture already did the hard work — this is about connecting the pieces and producing evidence.

---

## The narrative arc

After these six moves, the repo tells a different story:

- **Before:** "Here's an architecture that could scale to 2000 scenarios if the flywheel works." One screen, one scenario, no feedback loop, no artifacts on disk for the shared interpretation surface.

- **After:** "Here's a working flywheel. Two screens, two scenarios, a materialized interface graph, discovery that feeds the graph, execution that produces proposals, proposals that improve resolution, a scorecard that measures improvement, and a dogfood command that runs the whole loop. The 50th scenario against these screens will be cheaper than the 5th because the knowledge layer is already rich."

That's the difference between a cathedral with blueprints and a cathedral with a standing nave. The blueprints are already excellent. The standing nave is what's needed now.

---

## Success criteria

The sequence is done when all of the following are true:

1. `npm install && npm run check` passes on a fresh clone
2. `.tesseract/interface/index.json` exists on disk with nodes from two screens
3. `.tesseract/interface/selectors.json` exists with entries from both screens' targets
4. Two scenarios compile, emit specs, and produce trace/review artifacts
5. Discovery runs enrich the interface graph with `source: 'discovery'` nodes
6. At least one proposal has been activated and the affected scenario's resolution improved
7. The scorecard shows measurable improvement between runs
8. `npm run dogfood -- --max-iterations 2` completes with a legible ledger

None of these require LLM integration, external APIs, or a real enterprise app. They all work against the local demo harness with deterministic fixtures. That's by design — the first proof should be reproducible by anyone who clones the repo.
