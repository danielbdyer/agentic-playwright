# Tesseract: Next Capabilities Reference

Seven capabilities are now architecturally ready to build. Each one has its injection points, domain types, and Effect programs already in place. This document is the authoritative reference for building them.

---

## 1. Live Screen Observation via Playwright MCP

### What it does
The `ScreenObservationPort` (defined in `lib/application/ports.ts`) wraps Playwright capabilities for live DOM observation. The agent navigates to a screen's URL, batch-queries all known elements by their selectors, captures an ARIA snapshot, and compares observed state to expected knowledge.

### Architecture
```
ScreenGroupContext (unified screen model)
  → ScreenObservationPort.observe(url, elements[])
    → Navigate to screen URL
    → Capture ARIA snapshot (reuse lib/playwright/aria.ts:captureAriaYaml)
    → For each element: resolveLocator (reuse lib/runtime/locate.ts)
      → Record: found, visible, enabled, ariaLabel, locatorRung, strategy
    → Return ScreenObservationResult
```

### Injection point
- **Port**: `ScreenObservationPort` in `lib/application/ports.ts`
- **Effect tag**: `ScreenObserver` (Context.Tag)
- **Disabled adapter**: `DisabledScreenObserver` (returns empty, for CI/batch)
- **Composition**: `LocalServiceOptions.screenObserver` in `lib/composition/local-services.ts`
- **Consumer**: `processWorkItems` in `lib/application/agent-workbench.ts` — the `ScreenGroupDecider` receives observation results before deciding

### What to build
- `lib/infrastructure/observation/playwright-screen-observer.ts` — ~100 lines
  - `createPlaywrightScreenObserver(page: Page): ScreenObservationPort`
  - Reuses `resolveLocator()` from `lib/runtime/locate.ts` (locator strategy matching with rung tracking)
  - Reuses `captureAriaYaml()` from `lib/playwright/aria.ts` (full ARIA tree)
  - Reuses probe pattern from `lib/runtime/adapters/playwright-dom-resolver.ts` (recursive probing with backpressure)
  - Reuses `observeStateRefsOnPage()` from `lib/playwright/state-topology.ts` (batch state predicate evaluation)

### Performance budget
- 1 navigation + 1 ARIA snapshot + ~50 parallel element queries + 1 state batch = 5-10 API calls
- ~100-300ms per screen
- ~12-32K tokens per screen observation (vs ~50-100K for full DOM re-parsing)

### Existing code to reuse (660 lines)
| File | Function | What it does |
|------|----------|-------------|
| `lib/runtime/locate.ts` | `resolveLocator(page, element)` | Tries locator strategies in order, returns rung + degraded flag |
| `lib/runtime/locate.ts` | `locatorStrategies(element)` | Builds strategy list from element definition |
| `lib/playwright/aria.ts` | `captureAriaYaml(locator)` | Full ARIA tree as YAML string |
| `lib/playwright/state-topology.ts` | `observeStateRefsOnPage(input)` | Batch evaluate state predicates (visible, enabled, populated) |
| `lib/runtime/adapters/playwright-dom-resolver.ts` | `createPlaywrightDomResolver(page)` | Recursive probe pattern with evidence collection |

---

## 2. LLM-Backed Agent Interpretation (Session + Azure Foundry)

### What it does
The `session` and `llm-api` providers in `AgentInterpreterProvider` send the enriched `AgentInterpretationRequest` to an LLM for semantic interpretation. The LLM reads the step text, looks at available screens/elements/grounding/confidence hints, and returns a structured JSON resolution.

### Architecture
```
Resolution ladder rung 9 (resolution-stages.ts:465-520)
  → agentInterpreter.interpret(enrichedRequest)
    → session provider: routes to Claude Code / VSCode Copilot via createChatCompletion callback
    → llm-api provider: routes to Azure AI Foundry via HTTP
    → Response: { interpreted, target, confidence, rationale, suggestedAliases }
  → AgentInterpretedReceipt with proposalDrafts
  → Proposals activate → knowledge grows → future runs resolve deterministically
```

### Injection point
- **Provider**: `AgentInterpreterProvider` in `lib/application/agent-interpreter-provider.ts`
- **Kinds**: `disabled` | `heuristic` | `llm-api` | `session`
- **Config**: `AgentInterpreterConfig` with model, budget, fallback
- **Env var**: `TESSERACT_AGENT_PROVIDER=session` or `llm-api`
- **Composition**: `LocalServiceOptions.agentInterpreter` in `lib/composition/local-services.ts`
- **Factory**: `resolveAgentInterpreterProvider(config?, deps?)` — composite with fallback

### What to build
- **For Azure Foundry**: Provide `AgentLlmApiDependencies.createChatCompletion` with Azure endpoint, API key, model name. The prompt engineering (`buildAgentSystemPrompt`, `buildAgentUserMessage`) and response parsing (`parseAgentResponse`) are already implemented.
- **For Claude Code session**: The `createChatCompletion` callback needs to route through the CLI session's tool system. This requires a bridge between the Effect program and the interactive session.
- **For VSCode Copilot**: The callback routes through `vscode.lm.selectChatModels()`. The extension host injects at composition time.

### Enriched context available to the LLM (Gap 1)
The `AgentInterpretationRequest` now carries (defined at `agent-interpreter-provider.ts:33-101`):
- `topCandidates` — top-3 ranked screens/elements with scores from prior rungs
- `grounding` — targetRefs, requiredStateRefs, forbiddenStateRefs, allowedActions
- `observedState` — currentScreen, activeStateRefs, lastSuccessfulLocatorRung
- `confidenceHints` — per-artifact approval status and confidence scores

### Token budget
- System prompt: ~1.5K tokens (screen descriptions + exhaustion trail)
- User message: ~0.5K tokens (step text + DOM snapshot excerpt)
- Enriched context: ~1K tokens (candidates + grounding + state + confidence)
- Total: ~3K tokens input, ~0.5K output
- Response: structured JSON parsed by `parseAgentResponse`

---

## 3. Held-Out Validation Suite

### What it does
A train/test split for scenarios — train the dogfood loop on a subset, evaluate on held-out scenarios that were never seen during training. This measures generalization, not memorization.

### Architecture
```
dogfood/knowledge/ (canonical, shared)
  ├── scenarios used for training (adoIds 10001-10011, 20000-20055)
  └── scenarios held out for validation (new adoIds, different phrasings)

Training: dogfood loop iterates on training set → knowledge grows
Validation: run held-out scenarios against grown knowledge → measure hit rate
Generalization gap: training KHR - held-out KHR (should be < 0.30)
```

### What to build
1. **Held-out scenarios** — New scenario YAML files with different vocabulary than the knowledge base. The synthetic generator already supports `--perturb` for vocabulary variation. Generate held-out scenarios with high perturbation rate.

2. **Held-out benchmark** — New benchmark YAML that selects only held-out scenario IDs. Reuses existing `projectBenchmarkScorecard` in `lib/application/benchmark.ts`.

3. **Generalization metrics** — New type in `lib/domain/types/fitness.ts`:
   ```typescript
   interface GeneralizationMetrics {
     trainingKhr: number;
     heldOutKhr: number;
     generalizationGap: number;
     transferLearningRate: number;
   }
   ```

4. **Validation test** — `tests/validation-held-out.spec.ts` that runs training, then evaluates on held-out set. Asserts `generalizationGap < 0.30`.

5. **CLI command** — `tesseract validate --held-out` that runs the full validation pipeline.

### Existing infrastructure to reuse
- `lib/application/synthesis/scenario-generator.ts` — `PerturbationConfig` with 4 orthogonal modes
- `lib/application/benchmark.ts` — `projectBenchmarkScorecard` for metrics computation
- `lib/application/fitness.ts` — `buildFitnessReport` for step-level outcome analysis
- `scripts/benchmark-series.sh` — Pattern for running multiple configs and comparing results

---

## 4. React Dashboard MVP

### What it does
A frontend that consumes the structured JSON artifacts the pipeline already produces. Real-time progress visualization, human approval surface, and intervention dashboard.

### Architecture
```
.tesseract/workbench/index.json     → Work item list (prioritized, scored)
.tesseract/workbench/completions.json → Completion audit trail (envelope)
.tesseract/workbench/lineage.json   → Cross-iteration feedback arcs (envelope)
.tesseract/inbox/index.json         → Operator inbox (proposals, hotspots)
.tesseract/benchmarks/scorecard.json → Scorecard with fitness metrics
.tesseract/runs/speedrun-progress.jsonl → Real-time progress events
.tesseract/confidence/overlay-catalog.json → Confidence scores per artifact
```

### What to build
1. **Artifact reader** — React hooks that poll or watch the `.tesseract/` directory for changes. Each artifact has a `kind` + `version` envelope for schema validation.

2. **Work item list view** — Renders `AgentWorkbenchProjection.items` sorted by priority. Each item shows kind badge, title, screen context, actions, evidence confidence.

3. **Approval surface** — For `approve-proposal` items: shows the proposal patch (diff), target artifact, evidence sources. "Approve" button calls `tesseract approve --proposal-id`.

4. **Progress timeline** — Reads `speedrun-progress.jsonl` and renders iteration-by-iteration metrics: hit rate, convergence, calibration drift, rung distribution.

5. **Screen observation view** — When `ScreenObservationResult` is available, shows element-by-element comparison: expected vs observed, with locator health indicators.

6. **Intervention lineage graph** — Renders `InterventionLineageEnvelope.entries` as a directed graph: proposal → activation → completion → rerun → resolution improvement.

### Existing artifacts consumed (all JSON with standard envelopes)
| Artifact | Path | Type | Purpose |
|----------|------|------|---------|
| Workbench | `.tesseract/workbench/index.json` | `AgentWorkbenchProjection` | Prioritized work items |
| Completions | `.tesseract/workbench/completions.json` | `WorkbenchCompletionsEnvelope` | Audit trail |
| Lineage | `.tesseract/workbench/lineage.json` | `InterventionLineageEnvelope` | Feedback arcs |
| Inbox | `.tesseract/inbox/index.json` | `OperatorInboxProjection` | Proposals, hotspots |
| Scorecard | `.tesseract/benchmarks/scorecard.json` | `ScorecardProjection` | Fitness metrics |
| Progress | `.tesseract/runs/speedrun-progress.jsonl` | `SpeedrunProgressEvent` (JSONL) | Real-time |
| Confidence | `.tesseract/confidence/overlay-catalog.json` | `ConfidenceOverlayCatalog` | Per-artifact trust |
| Graph | `.tesseract/graph/index.json` | `DerivedGraph` | Interface graph |

---

## 5. Autonomous Knob Search Wiring

### What it does
Closes the backward pass of the recursive improvement loop. After a speedrun's fitness report classifies failures, the knob-search mechanism maps each failure class to specific parameters, generates candidate configs, tests them, and accepts the best that beats the Pareto frontier.

### Architecture
```
Speedrun → Fitness Report → Failure Classification
  → knob-search.ts: mappingForFailureClass(topFailure) → implicated parameters
  → knob-search.ts: generateCandidates(baseline, mapping) → candidate configs
  → For each candidate: speedrunProgram(candidate) → fitness report
  → scorecard.ts: Pareto frontier comparison → accept/reject
  → evolve.ts: repeat for maxEpochs
```

### What's already built
- `lib/application/knob-search.ts` — `mappingForFailureClass`, `generateCandidates` (maps 8 failure classes to 15 parameters)
- `lib/application/evolve.ts` — `evolveProgram` (multi-epoch orchestration)
- `lib/application/fitness.ts` — 8 failure classes, improvement targets, Pareto frontier
- `lib/domain/speedrun-statistics.ts` — Timing baselines, regression detection
- `tesseract evolve` CLI command — Already registered

### What to build
1. **Wire into speedrun orchestrator** — After `speedrunProgram` completes, optionally invoke `evolveProgram` if `--auto-evolve` flag is set. The speedrun's fitness report feeds directly into the evolve loop.

2. **Sensitivity-guided candidate generation** — Feed `sensitivity.ts` rankings into `generateCandidates` to focus perturbations on high-sensitivity parameters. Currently sensitivity analysis is a separate script; should become an Effect program callable from the evolve loop.

3. **Budget-aware evolution** — Track cumulative token/time cost across epochs. Stop evolution when budget is exhausted, not just when no candidates beat the mark.

### Existing functions to wire
| Function | File | What it does |
|----------|------|-------------|
| `evolveProgram(input)` | `lib/application/evolve.ts` | Multi-epoch knob search |
| `mappingForFailureClass(failure)` | `lib/application/knob-search.ts` | Maps failure → parameters |
| `generateCandidates(baseline, mapping)` | `lib/application/knob-search.ts` | Perturbs parameters |
| `buildFitnessReport(data)` | `lib/application/fitness.ts` | Classifies failures |
| `compareToScorecard(report, scorecard)` | `lib/application/fitness.ts` | Pareto frontier check |

---

## 6. VSCode Copilot Integration

### What it does
Surfaces the workbench, proposals, and hotspots as VSCode-native experiences. The agent discovers work through the same artifact surface as the CLI — no special API needed.

### Architecture
```
VSCode Extension Host
  → Injects createChatCompletion via vscode.lm.selectChatModels()
  → runWithLocalServices(speedrunProgram, rootDir, { agentInterpreter })
  → Same Effect programs, same artifacts, Copilot-native UI
```

### Injection points (all already defined)
- **Agent interpreter**: `LocalServiceOptions.agentInterpreter` — inject Copilot's LLM as the `session` provider
- **Screen observer**: `LocalServiceOptions.screenObserver` — inject Copilot's browser preview
- **Composition**: `createLocalServiceContext(rootDir, options)` → provides all Effect services

### What to build
1. **Task provider** — Map `AgentWorkbenchProjection.items` to VSCode tasks. Each work item kind gets a task type: `tesseract.approve-proposal`, `tesseract.interpret-step`, etc.

2. **Problem matcher** — Map proposals and hotspots to file positions. A proposal targeting `knowledge/screens/policy-search.hints.yaml` → problem at that file. A degraded locator → problem at the element definition.

3. **Copilot Chat participant** — Register a `@tesseract` chat participant that can:
   - `@tesseract workbench` → list pending items
   - `@tesseract approve <id>` → approve a proposal
   - `@tesseract interpret <step>` → interpret a needs-human step
   - `@tesseract status` → show iteration progress and convergence

4. **CodeLens** — On `.hints.yaml` and `.elements.yaml` files, show CodeLens annotations for:
   - Elements with proposals pending: "Approve alias 'inception date'"
   - Elements with hotspots: "Recovery pattern (12x) — investigate"
   - Elements with degraded selectors: "Locator rung 3 — update"

### Artifact consumption
Same JSON artifacts as the dashboard (see capability 4). The extension reads from `.tesseract/workbench/index.json` and `.tesseract/inbox/index.json`.

---

## 7. Vocabulary Robustness and Regression CI

### What it does
Prevents improvements from being benchmark artifacts. Uses the perturbation framework to inject controlled vocabulary/structural variance, measures degradation, and gates PRs on generalization thresholds.

### Architecture
```
PR submitted
  → CI runs tiered validation:
    Tier 1: Law tests (5 min) — invariants, contracts
    Tier 2: Benchmark (15 min) — dogfood loop on training set
    Tier 3: Held-out validation (10 min) — generalization gap < 0.30
    Tier 4: Stress tests (15 min) — complexity + vocabulary robustness
    Tier 5: Regression detection — compare to baseline scorecard
  → All tiers pass → PR accepted
```

### What's already built
- `PerturbationConfig` with 4 modes: `vocab`, `aliasGap`, `crossScreen`, `coverageGap`
- CLI flags: `--perturb-vocab`, `--perturb-alias-gap`, `--perturb-cross-screen`, `--perturb-coverage-gap`
- `scripts/benchmark-series.sh` — Multi-config benchmark runner
- `lib/domain/speedrun-statistics.ts` — Timing baselines, z-score regression detection
- 3-screen fixture with deliberate cross-screen ambiguity
- 39 law tests (25 calibration + 14 workbench)

### What to build
1. **Vocabulary perturbation test** — `tests/vocabulary-robustness.spec.ts`
   - Run baseline → run with each perturbation type → measure degradation per type
   - Assert: degradation < 15% per perturbation type
   - Uses existing `PerturbationConfig` and `generateSyntheticScenarios`

2. **Screen complexity stress test** — `tests/screen-complexity-stress.spec.ts`
   - Add 10+ screens with 50+ elements and 20% alias overlap
   - Run resolution pipeline → measure accuracy
   - Assert: accuracy > 0.65 on complex fixture

3. **Regression detection CI** — `.github/workflows/validation-ci.yml`
   - Tiered test suite with parallel execution
   - Fail PR if: generalization gap > 0.30, stress accuracy < 0.65, vocab degradation > 15%
   - Compare scorecard to baseline stored in repo

4. **Validation scorecard** — New type in `lib/application/validation-scorecard.ts`:
   ```typescript
   interface ValidationScorecard {
     dogfood: { knowledgeHitRate, translationPrecision, convergenceVelocity };
     heldOut: { knowledgeHitRate, generalizationGap, transferLearningRate };
     complexity: { stressTestAccuracy, elementsPerScreen, screenCount };
     vocabulary: { robustnessScore, synonymDegradation, wordReorderingDegradation };
     verdicts: { acceptanceRecommended, regressionDetected, reason };
   }
   ```

---

## Cross-Cutting Dependencies

```
Capability 1 (Playwright observer)
  └─ enables Capability 4 (dashboard screen view)
  └─ enables Capability 6 (Copilot browser preview)

Capability 2 (LLM session)
  └─ enables Capability 6 (Copilot chat participant)
  └─ improves Capability 7 (better cold-start baseline)

Capability 3 (held-out validation)
  └─ enables Capability 7 (CI regression gates)

Capability 5 (knob search)
  └─ improves Capability 7 (automated parameter optimization)

Independent: Capability 4 (dashboard) can be built standalone from JSON artifacts
```

## Recommended Build Order

| Priority | Capability | Effort | Why first |
|----------|-----------|--------|-----------|
| 1 | Playwright screen observer | 1-2 days | Unlocks live observation for all downstream |
| 2 | LLM session provider | 1 day | Real semantic interpretation, huge cold-start improvement |
| 3 | Held-out validation | 2-3 days | Proves improvements are genuine before building more |
| 4 | Vocabulary robustness CI | 2 days | Prevents regression as we iterate |
| 5 | Knob search wiring | 1-2 days | Fully autonomous parameter loop |
| 6 | React dashboard | 3-5 days | Human approval + visualization |
| 7 | VSCode Copilot | 3-5 days | IDE-native agent experience |
