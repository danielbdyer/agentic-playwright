# Coding Notes for Implementation Phases

Quick-reference notes distilled from `docs/master-architecture.md`, `CLAUDE.md`, `BACKLOG.md`, `docs/domain-ontology.md`, and `docs/direction.md`. Consult this before starting work on any phase.

## Current Implementation State

### Types that exist (`lib/domain/types/`)

| Contract | File | Status |
|---|---|---|
| `ApplicationInterfaceGraph` | `lib/domain/types/interface.ts:197` | Implemented (v1) |
| `SelectorCanon` | `lib/domain/types/interface.ts:181` | Implemented (v1) |
| `SelectorProbe` | `lib/domain/types/interface.ts:97` | Implemented |
| `CanonicalTargetRef` | `lib/domain/identity.ts` | Implemented (brand type) |
| `AgentSession` | `lib/domain/types/session.ts:43` | Implemented (v1) |
| `TrainingCorpusManifest` | `lib/domain/types/learning.ts:44` | Implemented |
| `GroundedSpecFragment` | `lib/domain/types/learning.ts:6` | Partial (learning-side only) |

### Types not yet implemented

| Contract | Master Architecture Section | Phase |
|---|---|---|
| `StateNode` | State and Event Topology | Phase 2 |
| `StateTransitionGraph` | State and Event Topology | Phase 2 |
| `StateTransition` | State and Event Topology | Phase 2 |
| `EventSignature` | State and Event Topology | Phase 2 |
| `ScenarioDecomposition` | Scenario Compilation | Phase 3 |
| `GroundedSpecFlow` | Readable Test Emission | Phase 4 |
| `LearningCorpus` (full) | Learning and Ratchet | Phase 6 |

## Layer Boundaries — Hard Rules

```
lib/domain/       → pure, no side effects, no I/O
lib/application/  → orchestration via Effect, depends only on domain
lib/runtime/      → Playwright execution and locator resolution, no application imports
lib/infrastructure/ → ports and adapters, implements application ports
```

Violations to watch for:
- Domain code importing `@playwright/test` or `fs`
- Runtime code importing application orchestration
- Infrastructure concerns leaking into domain types
- Side effects in domain functions (even logging)

## Canonical vs Derived — Decision Guide

Before creating or editing a file, ask: **is this canonical or derived?**

**Canonical** (hand-authored, source of truth):
- `knowledge/screens/*.elements.yaml` — element definitions
- `knowledge/screens/*.postures.yaml` — posture contracts
- `knowledge/screens/*.hints.yaml` — screen-local hints
- `knowledge/patterns/*.yaml` — promoted shared patterns
- `knowledge/surfaces/*.surface.yaml` — surface structure
- `knowledge/snapshots/` — ARIA snapshot templates
- `scenarios/` — scenario IR from ADO
- `controls/` — resolution controls, datasets, runbooks
- `.tesseract/evidence/` — evidence records
- `.tesseract/policy/` — trust policy

**Derived** (generated, do not hand-edit):
- `.tesseract/interface/` — interface graph + selector canon
- `.tesseract/tasks/` — resolution JSONs
- `.tesseract/graph/` — dependency graph
- `.tesseract/sessions/` — session ledgers
- `.tesseract/learning/` — training corpora
- `generated/` — emitted specs, traces, reviews
- `lib/generated/` — generated TypeScript

If you're tempted to hand-edit a derived file, you probably need to fix the generator instead.

## Resolution Precedence — Never Reorder Without Tests

```
1. explicit scenario fields
2. controls/resolution/*.resolution.yaml
3. approved screen knowledge + screen hints
4. shared patterns
5. prior evidence or run history
6. live DOM exploration (safe degraded resolution)
7. needs-human
```

Changing this order is changing compiler semantics. Update law tests in `tests/` before merging.

## Governance Vocabulary — Use Precisely

| Term | Meaning | Do NOT confuse with |
|---|---|---|
| `confidence` | How a binding was produced | governance |
| `compiler-derived` | Deterministic derivation from approved artifacts | approved |
| `intent-only` | Preserved intent awaiting runtime interpretation | unbound |
| `governance` | Whether a bound step is executable now | confidence |
| `approved` | Deterministic or already-approved path | compiler-derived |
| `review-required` | Depends on agent-proposed or unapproved knowledge | blocked |
| `blocked` | Do not execute | review-required |

## Envelope Header — Every Cross-Lane Artifact

Every artifact that crosses lane boundaries must carry:

```typescript
{
  kind: string;
  version: number;
  stage: string;
  scope: string;
  ids: Record<string, string>;
  fingerprints: Record<string, string>;
  lineage: { /* provenance chain */ };
  governance: { confidence: string; status: string };
  payload: { /* domain-specific content */ };
}
```

## Phase-by-Phase Implementation Notes

### Phase 1: Interface Graph and Selector Canon

**Goal**: Make `ApplicationInterfaceGraph` and `SelectorCanon` deterministic and law-tested.

Key files to modify:
- `lib/domain/types/interface.ts` — may need schema tightening
- `lib/application/interface-intelligence.ts` — projection orchestration
- `lib/domain/derived-graph.ts` — graph derivation logic

Rules:
- Selector duplication is forbidden by architecture. Every semantic target gets exactly one `CanonicalTargetRef`. Selector ladders attach only to `SelectorCanon`.
- Scenarios, emitted specs, and receipts reference target refs, never raw duplicated selectors.
- Drift evidence accumulates on the existing selector ref.
- Write law-style tests for determinism, round-trips, and normalization.

Output files:
- `.tesseract/interface/index.json` — the graph
- `.tesseract/interface/selectors.json` — the canon

### Phase 2: State and Event Modeling

**Goal**: Introduce `StateNode`, `StateTransitionGraph`, `StateTransition`, and `EventSignature`.

Where new types go:
- `lib/domain/types/interface.ts` — alongside existing interface types

Modeling rules:
- Visibility and enabled state → explicit `StateNode`
- Triggers → explicit `EventSignature`
- Effects → explicit `StateTransition`
- Each transition is keyed and referential so many scenarios reuse the same state knowledge
- Runtime receipts record observed transition IDs, not freeform notes

Behaviors to model:
- field A reveals field B
- selecting radio option C disables field D
- opening a modal changes the active surface
- saving moves the route to confirmation state
- validation creates visible error region and blocks submit

Test strategy: law-style tests proving transitions are stored once and reused across scenarios.

### Phase 3: Scenario Decomposition

**Goal**: Lower ADO cases into `ScenarioDecomposition`, bind to graph refs, selector refs, and state transitions.

Lowering path:
```
ADO text → ScenarioDecomposition → bind against graph/targets/transitions → GroundedSpecFlow
```

Every step target, assertion anchor, and fallback path must point to graph node IDs and selector refs explicitly. No ad-hoc re-derivation.

Key consideration: `ScenarioDecomposition` is a model type that goes in `lib/domain/types/`. The lowering logic that produces it belongs in `lib/application/`.

### Phase 4: Readable Emission

**Goal**: Emit QA-grade Playwright from `GroundedSpecFlow` through one canonical runtime event pipeline.

The emitted code should look like an experienced QA wrote it:
```typescript
test('scenario title', async ({ page }) => {
  await test.step('navigate to policy search', async () => { ... });
  await test.step('enter policy number', async () => { ... });
});
```

Under the surface, every helper maps to:
1. Resolve `CanonicalTargetRef`
2. Select best `SelectorProbe` from `SelectorCanon`
3. Enforce preconditions from current `StateNode`
4. Dispatch the `EventSignature`
5. Observe `StateTransition` effects
6. Record provenance-rich receipts

Use AST-backed code generation (`lib/domain/ts-ast.ts`, `lib/domain/spec-codegen.ts`), never source-string splicing.

### Phase 5: Agent Workbench

**Goal**: Standardize `AgentSessionLedger`, support provider-agnostic adapters.

Key files:
- `lib/application/agent-session-adapter.ts` — already exists
- `lib/application/agent-session-ledger.ts` — already exists
- `lib/domain/types/session.ts` — session types

Typed event vocabulary (all agents must support):
- orientation, artifact inspection, discovery request
- observation recorded, spec fragment proposed
- proposal approved/rejected, rerun requested
- execution reviewed, benchmark action, replay action

Copilot is an adapter target, not the domain model.

### Phase 6: Learning and Evaluation

**Goal**: Emit replay and training corpora from real provenance.

Key file: `lib/domain/types/learning.ts` — already has `TrainingCorpusManifest` and `GroundedSpecFragment`.

Generative learning runtimes land in fixed order:
1. decomposition
2. repair-recovery
3. workflow

DSPy, GEPA, and similar tooling stay in the offline evaluation lane only. Never route them into the deterministic compiler core.

### Phase 7: Scale Operations

**Goal**: Support 2000+ scenarios through incremental recomputation.

Strategy:
- One shared interface model, many scenario projections
- Bounded incremental recomputation by affected graph fingerprints
- Selector and state knowledge reused across scenarios
- Discovery focused only on impacted or thin-knowledge surfaces

Metrics to surface:
- Interface graph drift
- Selector degradation
- State transition churn
- Scenario decomposition instability
- Knowledge bottlenecks by route, surface, and widget family

## Common Pitfalls

1. **Duplicating selectors**: If you find yourself writing a selector string in a scenario, spec, or receipt — stop. It belongs in `SelectorCanon` only.

2. **Hiding dynamic behavior in runtime code**: If a field toggle reveals another field, the relationship lives in `StateTransitionGraph`, not in emitted waits or recovery code.

3. **Overloading confidence with governance**: `confidence` describes production method; `governance` describes executability. Keep them separate.

4. **Hand-editing derived files**: If you change `generated/` or `.tesseract/tasks/`, you're working in the wrong place. Fix the generator.

5. **Leaking side effects into domain**: `lib/domain/` must stay pure. If you need I/O, use Effect in `lib/application/`.

6. **Source-string splicing for codegen**: Always use AST-backed generation via `lib/domain/ts-ast.ts`.

7. **Skipping provenance**: Every derived artifact must explain what inputs it used, which stage won, and what was exhausted.

8. **Breaking precedence order without tests**: The resolution precedence is compiler semantics. Law tests must cover any changes.

9. **Promoting patterns prematurely**: Land hints screen-locally first. Promote to `knowledge/patterns/` only after repetition or deliberate generalization.

10. **Adding optimization tooling to the compiler core**: DSPy, GEPA, and friends belong in the offline evaluation lane only.

## Command Cheat Sheet

```bash
npm run context     # print repo brief
npm run workflow    # inspect lane ownership, controls, precedence
npm run paths       # show canonical/derived paths for one scenario
npm run trace       # scenario-centric subgraph
npm run impact      # impacted subgraph for a node id
npm run surface     # inspect approved surface graph
npm run graph       # rebuild dependency/provenance graph
npm run run         # interpret → execute → evidence → proposals
npm run types       # regenerate lib/generated/tesseract-knowledge.ts
npm test            # compiler/runtime/documentation laws
npm run check       # build + typecheck + lint + test gate
npm run typecheck   # strict repo-wide typecheck
npm run lint        # typed lint over hand-authored sources
```

## Review Surface Contract

Every meaningful change should preserve or improve:

| Artifact | Path |
|---|---|
| Emitted spec | `generated/{suite}/{ado_id}.spec.ts` |
| Trace JSON | `generated/{suite}/{ado_id}.trace.json` |
| Review markdown | `generated/{suite}/{ado_id}.review.md` |
| Proposals | `generated/{suite}/{ado_id}.proposals.json` |
| Resolution | `.tesseract/tasks/{ado_id}.resolution.json` |
| Graph | `.tesseract/graph/index.json` |

If a new workflow cannot explain itself through these artifacts, it is under-modeled.

## Backlog Priority Quick Reference

| # | Item | Key Dependency |
|---|---|---|
| 1 | A1 — ADR collapse: runtime interpretation | — |
| 2 | A2 — Confidence-gated auto-approval | A1 |
| 3 | A3 — Dogfood orchestrator | A1, A2 |
| 4 | B1 — URL variant discovery | — |
| 5 | D1 — Structured entropy harness | A3, B1 |
| 6 | B3 — Confidence decay | — |
| 7 | E2 — VSCode extension surface | — |

A1 is the critical path. It unblocks A2, A3, D1, and F2.
