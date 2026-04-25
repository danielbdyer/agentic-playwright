# Glossary

> Canonical — term definitions

Quick-reference for Tesseract's domain vocabulary. Each term links to the authoritative section where it is defined.

---

## Core Types

| Term | Definition | Authoritative source |
|------|-----------|---------------------|
| **ApplicationInterfaceGraph** | The compiled graph of screens, elements, transitions, and selectors. The primary output of the interface spine. | `docs/master-architecture.md` § Interface Intelligence |
| **SelectorCanon** | Ranked locator strategies per element, compiled from knowledge and prior evidence. | `docs/master-architecture.md` § Selector Canon |
| **CanonicalTargetRef** | A typed reference to an element on a screen, e.g. `target:element:policy-search:searchButton`. | `lib/domain/identity.ts` |
| **StateTransitionGraph** | The graph of state nodes, events, and transitions for a screen, derived from behavior YAML. | `knowledge/screens/*.behavior.yaml` |

## Governance

| Term | Definition | Authoritative source |
|------|-----------|---------------------|
| **Confidence** | How a binding was produced: `compiler-derived`, `intent-only`, or `needs-human`. | `CLAUDE.md` § Governance vocabulary |
| **Governance** | Whether a bound step is executable now: `approved`, `review-required`, or `blocked`. | `CLAUDE.md` § Governance vocabulary |
| **Approved\<T\>** | Phantom branded type marking a value as approved for execution. | `lib/domain/governance/` |
| **Blocked\<T\>** | Phantom branded type marking a value as blocked pending review. | `lib/domain/governance/` |
| **foldGovernance** | Exhaustive case analysis over governance status. Forces callers to handle all variants. | `docs/coding-notes.md` § Governance |

## Resolution Ladder

The resolution pipeline applies strategies in precedence order (highest first):

| Rung | Strategy | Description |
|------|----------|-------------|
| 1 | Explicit scenario fields | Direct bindings authored in the scenario YAML |
| 2 | Resolution controls | `controls/resolution/*.resolution.yaml` |
| 3 | Screen knowledge | Approved screen hints, aliases, and element definitions |
| 4 | Shared patterns | Promoted patterns from `knowledge/patterns/` |
| 5 | Prior evidence | Historical run data and evidence from `.tesseract/evidence/` |
| 6 | Live DOM exploration | Runtime DOM fallback with safe degradation |
| 7 | needs-human | Human escalation — last resort after all non-human paths exhausted |

See `CLAUDE.md` § Deterministic precedence for the full precedence laws.

## Six Lanes

| Lane | Scope | Key directories |
|------|-------|----------------|
| **intent** | ADO sync and scenario definitions | `dogfood/.ado-sync/`, `dogfood/scenarios/` |
| **knowledge** | Surfaces, screens, patterns, snapshots | `dogfood/knowledge/` |
| **control** | Datasets, resolution controls, runbooks | `dogfood/controls/` |
| **resolution** | Task binding and interpretation receipts | `.tesseract/tasks/` |
| **execution** | Run records and execution receipts | `.tesseract/runs/` |
| **governance/projection** | Generated output, graph, trust policy | `generated/`, `.tesseract/graph/` |

## Three Spines

| Spine | Purpose |
|-------|---------|
| **Interface** | Compile knowledge into the ApplicationInterfaceGraph + SelectorCanon |
| **Intervention** | Agent workbench, proposals, operator approvals |
| **Improvement** | Recursive self-improvement loop, fitness scoring, convergence FSM |

## Artifacts

| Term | Definition |
|------|-----------|
| **Canonical** | Source-of-truth inputs: scenarios, knowledge, controls, fixtures. Hand-authored or operator-approved. |
| **Derived** | Projections computed from canonical inputs. Do not hand-edit. Includes `.tesseract/bound/`, `generated/`, `.tesseract/graph/`. |
| **Scorecard** | High-water-mark fitness record at `.tesseract/benchmarks/scorecard.json`. |
| **Improvement ledger** | History of improvement runs with objective vectors at `.tesseract/benchmarks/improvement-ledger.json`. |

## Pipeline Concepts

| Term | Definition |
|------|-----------|
| **Speedrun** | Multi-seed experiment loop: generate → compile → iterate → measure fitness. |
| **Posture** | Knowledge loading mode: `cold-start` (tier 1 only), `warm-start` (tier 1+2), `production`. |
| **Suite** | A scoped collection of scenarios, knowledge, and controls. `dogfood/` for training, repo root for production. |
| **Flywheel** | The recursive improvement cycle: run → observe failures → propose fixes → activate → rerun. |

## "Probe" disambiguation

The word *probe* names three distinct concepts in the codebase. They are
unrelated except by shared metaphor (each pokes at something to learn
something). When reading docs or naming new code, attend to which is meant:

| Universe | Type | Where | What it measures |
|---|---|---|---|
| **Workshop probe** | `Probe` (probe IR), `ProbeReceipt`, `ProbeDerivation` | `workshop/probe-derivation/` | Manifest-derived testbed probe that exercises `product/`'s normal authoring flow so the workshop can score whether the product is improving. The unit of probe-coverage that drives graduation. |
| **Selector probe** | `SelectorProbe` | `product/domain/target/interface-graph.ts` | A locator-strategy attempt against the live DOM during resolution rung-3. Outputs a candidate locator + its evidence. |
| **Probed element** | `list_probed_elements` MCP tool | `dashboard/server/mcp-tools.ts`, `dashboard/mcp/dashboard-mcp-server.ts` | Read-only inventory of elements the agent has previously observed (state-observation history). Dashboard projection only; no derivation. |

Style guidance:
- A bare "probe" defaults to the **workshop** sense (the most central / most
  load-bearing). New types named `Probe…` without qualifier should belong to
  `workshop/probe-derivation/` or be renamed.
- Selector-resolution code prefers `Locator…` or the explicit `Selector`
  prefix; reach for "probe" only when the rung-3 evidence-collection
  framing is the point.
- Dashboard projection types stick with `Probed…` (past-participle: "elements
  we have probed") to signal the *result* universe rather than the act.
| **Convergence FSM** | Finite state machine tracking whether the improvement loop is converging, diverging, or stalled. |
