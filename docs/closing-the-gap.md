# Closing the Gap: From Cathedral Drawings to a Standing Building

_Written March 2026 after a thorough codebase review. Updated March 2026 with verified implementation findings._

This document is a concrete implementation plan. It identifies the smallest sequence of moves that turns Tesseract from a system that talks about a flywheel into a system that demonstrably runs one. Every move has a clear deliverable, a proof point, and a reason it comes before the next.

The diagnosis is honest: the architecture is excellent, the domain model is genuinely load-bearing, and the single demo scenario proves the pipeline end-to-end. But the gap between what the docs describe and what the code demonstrates is roughly two architectural generations. The system needs to close that gap through working artifacts, not more documentation.

**Key finding from thorough codebase review:** The codebase is significantly more mature than its artifact footprint suggests. Much of what was originally scoped as "new work" already exists as implemented, tested code. The second screen knowledge is authored, the dogfood loop is coded, discovery integration is wired, and the proposal lifecycle is complete. The primary work is: unblock the build, fix one runbook selector, create one benchmark YAML, set up one degraded locator scenario, and verify each stage feeds the next.

---

## The honest state of play

### What's real and impressive

- **226 source files, ~29K LOC** with clean layer isolation enforced by architecture tests
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
- **Complete policy-detail screen knowledge** — elements, hints, postures, behavior, surfaces, and two scenarios (10010, 10011) already authored
- **Full dogfood loop** at `lib/application/dogfood.ts` with recursive fold, convergence detection, auto-approval, and ledger output
- **Proposal lifecycle** fully coded: `build-proposals.ts` creates bundles, `activate-proposals.ts` patches knowledge, trust policy governs auto-approval
- **Interface graph projection** at `lib/application/interface-intelligence.ts` (1,374 lines) already wired to write three artifacts during compilation
- **Discovery-to-graph integration** already coded — `projectInterfaceIntelligence` loads discovery runs and merges them with `source: 'discovery'` attribution

### What's thin

| Area | State | What's actually missing |
|---|---|---|
| Build reproducibility | `node_modules` not committed | `npm install && npm run check` not verified on fresh clone |
| Interface graph on disk | Projection code complete, writes during `compileScenario` | `.tesseract/interface/` directory never materialized — compilation hasn't run |
| Runbook coverage | `demo-smoke` runbook selector has `suites: [demo/policy-search]` | Policy-detail scenarios (suite `demo/policy-detail`) are **excluded** from all runbook-driven execution |
| Proposal feedback proof | `activate-proposals.ts` works, trust policy exists | Never triggered by a real run producing a real proposal that feeds back into a real recompile |
| Benchmark targeting | `flagship-policy-journey.benchmark.yaml` exists | References screens (`account-intake`, `insured-profile`, etc.) that don't match demo screens — no benchmark covers `policy-search` or `policy-detail` |
| Dogfood execution | `lib/application/dogfood.ts` fully implemented with CLI command | Never actually run — no materialized artifacts for it to consume |
| Live DOM resolution | `dom-fallback.ts` exists, `resolveFromDom()` is called | No LLM-backed exploration; the "agentic fallback" rung is structural placeholder |
| Translation bridge | Translation types and cache exist | Structured translation produces no real candidates today |
| Multi-engine resolution | Registry exists with one engine | Only `deterministic-runtime-step-agent` registered |

### The core gap in one sentence

**The flywheel has never turned once.** Discovery has never fed the interface graph which has never fed resolution which has never produced proposals which have never been activated which have never triggered a recompile that made the next run cheaper.

### The core gap in one fix

The **single most impactful change** is one line in the runbook selector. Without it, the second screen's scenarios cannot participate in any runbook-driven execution path, blocking Moves 2, 4, 5, and 6.

---

## The proving sequence

The goal is not to implement every phase from the master architecture. The goal is to make the flywheel turn once, visibly, with receipts. Then turn it again and show it got cheaper.

**Total new/modified canonical files: 3.** The flywheel proof is almost entirely about exercising existing code, not writing new code.

### Move 0: Make the repo buildable and green

**Deliverable:** `npm install && npm run check` passes in a fresh clone.

**Why first:** Nothing else matters if the tests can't run. The Phase 3 handoff reports 163 passing tests. A reviewer or contributor who clones and can't verify that has no reason to trust anything.

**Work:**
- Run `npm install` to restore `node_modules/`
- Run `npx playwright install chromium` if browser binaries are missing
- Run `npm run check` (build → typecheck → lint → test via `scripts/check.cjs`)
- Pin dependency versions in `package.json` if needed
- Verify `npm run types`, `npm run typecheck`, `npm test` all pass

**Proof point:** CI badge or a contributor can clone → install → `npm run check` → green.

**Classification:** Verify existing code works | **Complexity:** Low | **Files to modify:** 0–1

---

### Move 1: Materialize the interface graph and selector canon

**Deliverable:** `npm run refresh` writes `.tesseract/interface/index.json`, `.tesseract/interface/selectors.json`, and `.tesseract/interface/state-graph.json` to disk. They are queryable, fingerprinted, and consumed by the demo scenario's resolution.

**Why now:** The "shared interpretation surface" is the system's central claim. If it exists only as code that builds objects in memory but never writes them, consumers can't inspect it, agents can't query it, and the review artifacts can't reference it with integrity.

**What already exists:** The projection code in `interface-intelligence.ts` is complete. `projectInterfaceIntelligence()` at line 1297 is called during `compileScenario()` at `lib/application/compile.ts:43`. The `runProjection` wrapper handles directory creation via its `buildAndWrite` path. Lines 1338–1359 write all three files. The `.tesseract/interface/` directory simply doesn't exist yet because compilation hasn't run against a workspace with materialized dependencies.

**Work:**
1. Run `npm run build && node dist/bin/tesseract.js refresh --ado-id 10001`
2. Verify all three interface artifacts exist on disk
3. Inspect content: graph should have screen nodes for `policy-search`, selector canon should have locator entries for all elements
4. Add a law test: same knowledge inputs → same graph → same fingerprints (determinism)
5. Add a law test: graph nodes reference exactly the targets in `policy-search.elements.yaml` (no orphans, no duplicates)

**Proof point:** `cat .tesseract/interface/index.json | jq '.nodes | length'` returns a nonzero number. The review artifact's interface graph fingerprint matches the on-disk file.

**Classification:** Verify existing code works | **Complexity:** Low | **Files to modify:** 0

---

### Move 2: Prove the second screen (policy-detail)

**Deliverable:** Both `policy-search` and `policy-detail` screens contribute to the interface graph. Three scenarios (10001, 10010, 10011) compile and produce specs, reviews, and traces.

**Why now:** This is the single most important move in the entire sequence. Every scale claim — selector canon sharing, incremental recomputation, cross-screen state transitions, knowledge reuse — is currently demonstrated by n=1. A second screen with cross-screen navigation makes n=2 and proves the architecture is load-bearing, not just type-bearing.

**What already exists:** All canonical knowledge for `policy-detail` is authored and present:
- Elements: `knowledge/screens/policy-detail.elements.yaml` (6 elements: policyNumber, policyStatus, effectiveDate, claimsTable, backToSearch, errorPanel)
- Hints: `knowledge/screens/policy-detail.hints.yaml` (aliases for all 6 elements)
- Postures: `knowledge/screens/policy-detail.postures.yaml`
- Behavior: `knowledge/screens/policy-detail.behavior.yaml` (state nodes, events, transitions)
- Surface: `knowledge/surfaces/policy-detail.surface.yaml` (4 surfaces across 3 sections)
- Scenarios: `scenarios/demo/policy-detail/10010.scenario.yaml` and `10011.scenario.yaml`
- ADO snapshots: `.ado-sync/snapshots/10010.json` and `10011.json`
- HTML fixture: `fixtures/demo-harness/policy-detail.html`
- Knowledge snapshots: `knowledge/snapshots/policy-detail/` directory exists

**What's missing — the critical fix:** The `demo-smoke` runbook at `controls/runbooks/demo-smoke.runbook.yaml` has `suites: [demo/policy-search]`. The `selectorMatchesScenario` function at `lib/application/controls.ts:20` checks `scenario.metadata.suite.startsWith(suite)`, so `demo/policy-detail` does **not** match `demo/policy-search`. The policy-detail scenarios are excluded from all runbook-driven execution.

**Work:**
1. **Edit `controls/runbooks/demo-smoke.runbook.yaml`** — change `suites` to `[demo/policy-search, demo/policy-detail]`
2. Refresh all three scenarios:
   ```bash
   node dist/bin/tesseract.js refresh --ado-id 10001
   node dist/bin/tesseract.js refresh --ado-id 10010
   node dist/bin/tesseract.js refresh --ado-id 10011
   ```
3. Verify interface graph has nodes for both screens
4. Verify selector canon has entries from both screens' targets
5. Run `node dist/bin/tesseract.js graph` and verify `.tesseract/graph/index.json`
6. Add a law test: refreshing two screens from different suites produces a graph with nodes for both
7. Add a law test: runbook selector with both suites matches both `demo/policy-search` and `demo/policy-detail`

**What the second screen proves:**
- `CanonicalTargetRef` namespacing works across screens (`target:element:policy-search:searchButton` vs `target:element:policy-detail:policyNumber`)
- The selector canon holds entries from multiple screens without duplication
- A scenario that spans two screens references targets from both, and both resolve through the same interpretation surface
- The interface graph contains route edges between screens
- State transitions can model cross-screen navigation

**Proof point:** `npm run refresh` produces three specs, three reviews, three trace JSONs. `npm run graph` shows edges between the two screens. The selector canon JSON has entries from both screens.

**Classification:** One critical data fix + verify | **Complexity:** Medium | **Files to modify:** 1 (`controls/runbooks/demo-smoke.runbook.yaml`)

---

### Move 3: Run discovery against the demo harness and prove it feeds the graph

**Deliverable:** `npm run discover` produces discovery runs that enrich the interface graph with `source: 'discovery'` nodes. A subsequent refresh shows discovery nodes alongside `approved-knowledge` nodes.

**Why now:** Discovery is the input side of the flywheel. The tooling already works and the integration path is already coded.

**What already exists:** The full pipeline is wired:
1. `discover-screen.ts` (`discoverScreenScaffold`) launches Chromium, navigates to URL, captures ARIA snapshot, evaluates DOM
2. `discovery.ts` (`buildDiscoveryArtifacts`) builds typed `DiscoveryRun` with targets, selector probes, and scaffolds
3. `projectInterfaceIntelligence` at line 1302 already loads discovery runs and merges them into the graph
4. Lines 442–484 show `targetDescriptors` merges discovery targets with knowledge targets, setting `source: 'discovery'` on new targets
5. Lines 934–970 produce `harvest-run` nodes with `discovered-by` edges

No new merge code needs to be written.

**Work:**
1. Start demo harness: `node fixtures/demo-harness/server.cjs &`
2. Run discovery against both fixtures:
   ```bash
   node dist/bin/tesseract.js discover --screen policy-search --url http://127.0.0.1:3100/policy-search.html
   node dist/bin/tesseract.js discover --screen policy-detail --url "http://127.0.0.1:3100/policy-detail.html?id=POL-001"
   ```
3. Re-refresh any scenario to trigger interface graph rebuild with discovery data
4. Verify interface graph has nodes with `source: 'discovery'` and `harvest-run` kind nodes
5. Add a law test: discovery enriches the graph without duplicating approved-knowledge targets

**Proof point:** The interface graph JSON has nodes with `"source": "discovery"` alongside nodes with `"source": "approved-knowledge"`.

**Classification:** Verify existing code works | **Complexity:** Medium | **Files to modify:** 0

---

### Move 4: Make one end-to-end run produce a real proposal that feeds back

**Deliverable:** Run a scenario against the demo harness. The runtime encounters a degraded locator. It produces a `ProposalEntry`. The proposal is activated. The affected scenario recompiles with improved knowledge. The second run resolves at a higher rung.

**Why now:** This is the flywheel turning once. Every piece of the machinery exists in isolation: execution produces receipts, receipts produce proposals, proposals can be activated, activation rewrites knowledge, recompilation picks up changes. But these pieces have never been connected in sequence with real data flowing through.

**What already exists:**
- `build-proposals.ts` creates `ProposalBundle` from step results that have `proposalDrafts`
- `activate-proposals.ts` applies proposal patches to knowledge files
- `auto-approve-eligible-proposals` handles dogfood auto-approval
- Trust policy at `.tesseract/policy/trust-policy.yaml` governs which proposals can auto-approve
- The runtime interpreter already generates `proposalDrafts` when it resolves at a degraded rung

**Work:**
1. **Create a degraded locator scenario:** In `knowledge/screens/policy-detail.elements.yaml`, temporarily remove the `testId` from `policyNumber` (keeping only the role and name). This forces the runtime to resolve at a lower rung.
2. Run the scenario in diagnostic mode:
   ```bash
   node dist/bin/tesseract.js run --ado-id 10011 --interpreter-mode diagnostic
   ```
3. Verify proposal bundle written to `.tesseract/runs/` with a `ProposalEntry` suggesting the `testId` locator
4. Activate the proposal:
   ```bash
   node dist/bin/tesseract.js approve
   ```
5. Verify the knowledge file was patched (the `testId` was restored/added by the proposal)
6. Re-refresh and re-run the same scenario
7. Compare two run records: second run should resolve the step at a higher rung
8. Add a law test: a step resolved at rung N > 1 produces a proposal. After activation and recompile, the same step resolves at rung 1.

**Proof point:** Two run records exist. The second run's trace JSON shows a higher `knowledgeHitRate` than the first. The review markdown explains the improvement. The flywheel turned once.

**Classification:** Setup degraded locator + verify | **Complexity:** High | **Files to modify:** 1 (`knowledge/screens/policy-detail.elements.yaml` — temporary degradation, then restored by proposal activation)

---

### Move 5: Make the scorecard measure the improvement

**Deliverable:** `npm run scorecard` produces a `BenchmarkScorecard` comparing the runs. The scorecard shows: resolution quality improved, knowledge coverage increased, degraded locator rate decreased.

**Why now:** The flywheel turned in Move 4, but only the review markdown narrated the improvement. The scorecard makes it statistical.

**What already exists:** `projectBenchmarkScorecard()` in `lib/application/benchmark.ts` is complete and consumes run records. The CLI command is registered.

**What's missing:** The existing `flagship-policy-journey.benchmark.yaml` references screens (`account-intake`, `insured-profile`, `address-details`, `coverage-details`, `payment-setup`, `review-submit`) that don't exist in the demo. No benchmark covers the `policy-search` and `policy-detail` screens we actually have knowledge for.

**Work:**
1. **Create `benchmarks/closing-the-gap.benchmark.yaml`** with:
   - Field catalog entries for `policy-search` and `policy-detail` elements
   - Reference to `demo-smoke` runbook (which by now covers both suites per Move 2)
   - Reasonable thresholds (e.g., `minFirstPassElementResolutionRate: 0.6`, `maxDegradedLocatorRate: 0.2`)
2. Run: `node dist/bin/tesseract.js benchmark --benchmark closing-the-gap`
3. View: `node dist/bin/tesseract.js scorecard --benchmark closing-the-gap`
4. Verify scorecard shows improvement between the Move 4 before/after runs
5. Add a law test: scorecard from runs with degraded steps reports `degradedLocatorRate > 0`; after proposal activation and re-run, `degradedLocatorRate` decreases

**Proof point:** `npm run scorecard` prints a JSON artifact showing resolution quality improved between run 1 and run 2.

**Classification:** Create benchmark YAML + verify | **Complexity:** Medium | **Files to create:** 1 (`benchmarks/closing-the-gap.benchmark.yaml`)

---

### Move 6: Wire the dogfood loop as a thin orchestrator

**Deliverable:** `npm run dogfood -- --max-iterations 2` runs the full loop: compile → run → propose → activate → recompile → rerun → scorecard. It produces a `DogfoodRun` ledger explaining what happened.

**Why now:** Moves 0–5 proved every piece individually. This move connects them into the self-hardening loop.

**What already exists:** Everything. The dogfood loop at `lib/application/dogfood.ts` is fully implemented:
- Recursive fold pattern via `step()` function (line 219–253)
- Convergence detection: `no-proposals`, `threshold-met`, `budget-exhausted`, `max-iterations` (line 108–133)
- Auto-approval via `accumulateProposalTotals` (line 135–164)
- Ledger output to `.tesseract/runs/dogfood-ledger.json` (line 281)
- CLI command at `lib/application/cli/registry.ts:677` accepting `--max-iterations`, `--convergence-threshold`, `--max-cost`, `--tag`, `--runbook`, `--interpreter-mode`

**Work:**
1. Run the dogfood loop:
   ```bash
   npm run build && node dist/bin/tesseract.js dogfood --max-iterations 2 --interpreter-mode diagnostic
   ```
2. Verify `.tesseract/runs/dogfood-ledger.json` exists with:
   - `kind: 'dogfood-ledger'`
   - `completedIterations >= 1`
   - `converged: true`
   - `knowledgeHitRateDelta >= 0`
3. If the loop converged in 2 iterations with `convergenceReason: 'no-proposals'`, the flywheel has stabilized
4. If `knowledgeHitRateDelta > 0`, the flywheel produced measurable improvement
5. Either outcome proves the loop works
6. Add an integration smoke test that runs the CLI command and checks the ledger JSON

**Proof point:** `npm run dogfood -- --max-iterations 2` completes with a legible ledger showing convergence.

**Classification:** Verify existing code works | **Complexity:** Medium | **Files to modify:** 0

---

## Dependency chain

```
Move 0 (build green)
  │
  ▼
Move 1 (materialize interface graph)
  │
  ▼
Move 2 (second screen + runbook fix) ──depends on──▶ Move 1 (graph must exist)
  │
  ├──▶ Move 3 (discovery feeds graph) ──depends on──▶ Move 0 (Playwright browsers)
  │
  ▼
Move 4 (proposal feedback loop) ──depends on──▶ Move 2 (second screen for degraded scenario)
  │                                               Move 3 (optional but enriches graph)
  ├──▶ Move 5 (scorecard) ──depends on──▶ Move 4 (run records needed)
  │
  ▼
Move 6 (dogfood loop) ──depends on──▶ Move 2 (runbook covers both screens)
                                       Move 4 (proposal machinery verified)
```

---

## What this sequence deliberately skips

These are important but not on the critical path to proving the flywheel:

| Deferred | Why |
|---|---|
| LLM-backed DOM exploration (A1 full) | The dogfood loop can turn with deterministic + degraded resolution alone. LLM exploration makes it richer but isn't required for the first proof. |
| Copilot/VSCode integration (E2) | The flywheel proof is CLI-first. Agent adapters can come after the loop works. |
| Cross-app transfer learning (moonshot 5) | Requires at least two real apps. The demo harness is enough for now. |
| Structured entropy (D1) | Requires a working dogfood loop first. Sequence it after Move 6. |
| 2000-scenario scale test (Phase 7) | Two screens and three scenarios prove the architecture. Scale comes from repeating the pattern, not from a separate engineering effort. |
| Offline optimization (DSPy/GEPA) | Requires a statistical surface (scorecard) with enough data. Move 5 creates the surface; optimization tooling can follow. |

---

## Implementation summary

| Move | Primary nature | New code | Data fix | Key file | Complexity |
|------|---------------|----------|----------|----------|------------|
| 0 | Verify | None | None | `package.json` | Low |
| 1 | Verify | None | None | `lib/application/interface-intelligence.ts` | Low |
| 2 | Verify + Fix | Optional resolution control | **Runbook selector** | `controls/runbooks/demo-smoke.runbook.yaml` | Medium |
| 3 | Verify | None | None | `lib/infrastructure/tooling/discover-screen.ts` | Medium |
| 4 | Verify + Setup | None | **Degraded locator** | `knowledge/screens/policy-detail.elements.yaml` | High |
| 5 | Verify + Create | **Benchmark YAML** | None | `benchmarks/closing-the-gap.benchmark.yaml` | Medium |
| 6 | Verify | None | None | `lib/application/dogfood.ts` | Medium |

**Total new/modified canonical files: 3.** The flywheel proof is almost entirely about exercising existing code.

---

## The narrative arc

After these six moves, the repo tells a different story:

- **Before:** "Here's an architecture that could scale to 2000 scenarios if the flywheel works." One screen exercised, three scenarios authored but only one reachable through the runbook, no feedback loop, no artifacts on disk for the shared interpretation surface, no benchmark covering the demo screens.

- **After:** "Here's a working flywheel. Two screens, three scenarios, a materialized interface graph, discovery that feeds the graph, execution that produces proposals, proposals that improve resolution, a scorecard that measures improvement, and a dogfood command that runs the whole loop. The 50th scenario against these screens will be cheaper than the 5th because the knowledge layer is already rich."

That's the difference between a cathedral with blueprints and a cathedral with a standing nave. The blueprints are already excellent. The standing nave is what's needed now.

---

## Success criteria

The sequence is done when all of the following are true:

1. `npm install && npm run check` passes on a fresh clone
2. `.tesseract/interface/index.json` exists on disk with nodes from two screens
3. `.tesseract/interface/selectors.json` exists with entries from both screens' targets
4. Three scenarios compile, emit specs, and produce trace/review artifacts
5. Discovery runs enrich the interface graph with `source: 'discovery'` nodes
6. At least one proposal has been activated and the affected scenario's resolution improved
7. The scorecard shows measurable improvement between runs
8. `npm run dogfood -- --max-iterations 2` completes with a legible ledger

None of these require LLM integration, external APIs, or a real enterprise app. They all work against the local demo harness with deterministic fixtures. That's by design — the first proof should be reproducible by anyone who clones the repo.
