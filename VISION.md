# Tesseract Vision

Tesseract is not a compiler-only test generator.

It is an interface intelligence and agent workbench system that happens to emit Playwright **today**. Test emission is the wedge. The product is the substrate.

The authoritative architecture doctrine is `docs/master-architecture.md`. The authoritative persistence doctrine is `docs/canon-and-derivation.md`. The wall-mounted scoreboard is `docs/alignment-targets.md`. The formal model is `docs/temporal-epistemic-kernel.md`. This document stays intentionally shorter: it captures the product bet, the durable asset, the deeper vision that the three doctrinal docs serve, and the operator-visible promise.

## The product bet (near-term wedge)

If a manual test is written clearly enough for a QA to infer behavior from it, then Tesseract should be able to:

- harvest the relevant application reality
- preserve selectors and state knowledge once
- lower the case into a grounded task packet
- emit a normal-looking test
- execute it with provenance-rich receipts
- learn from the run without silently mutating canon

The source program is still the Azure DevOps manual test case. The emitted object code is still Playwright. The durable value sits between them: interface intelligence, intervention receipts, and governed improvement surfaces grounded in shared truth.

## The deeper vision (what the wedge is for)

Stand up the wedge and three longer-lived claims become reachable:

### 1. The canonical artifact store is the product; tests are a byproduct

Most test automation treats the application as a sequence of scripts to replay. Tesseract treats it as a **state machine whose semantics have to be learned and stored**. What accumulates over time is not a suite of tests; it is a **digital evidentiary interface model** of the application — a typed, provenance-rich, demotable belief structure answering "what IS this application, how is it DRIVEN, and who can see WHAT." The three-tier interface model (atoms / compositions / projections, `docs/canon-and-derivation.md` § 3.5) is the shape of that store. Tests are one projection over it. Review surfaces, impact analyses, cross-scenario graph queries, and provenance-tracked "why does the system believe X?" answers are others.

The asset that compounds across runs is the canonical artifact store. A single test case is a transient witness. A thousand test cases observed over time populate a substrate that any future test case pulls from in constant time.

### 2. Deterministic observation and agentic inference are braided, not averaged

Most systems either force consensus between deterministic signals and agent inference (lossy average) or keep them as parallel worldviews (no reconciliation). Tesseract does neither. It holds both lanes side by side and reconciles through the lookup chain, the promotion/demotion gates, and the receipt lineage (`docs/canon-and-derivation.md` §§ 6, 7, 9).

- Agentic overrides (slot 2) don't *overwrite* deterministic observations (slot 3); they *outrank* them until demoted.
- Deterministic observations don't *silence* agent hypotheses; they become demotion candidates when discovery catches up.
- Every atom carries its provenance — which lane contributed it, what evidence backed it, what gate passed it, what impact it had after acceptance.

This is unusually honest epistemics. It lets two kinds of truth coexist without collapsing into one, and it makes the system's beliefs interrogable. For any atom the operator can ask "why do you think this?" and receive an evidence slice, a receipt chain, a gate evaluation, and an impact measurement. The braid is what separates interface intelligence from scripted automation.

### 3. Agent contributions are measured, not trusted

Most agent tools assume the agent is right or ask a human to adjudicate each contribution. Tesseract asks the *next loop iteration* to adjudicate. Every `InterventionReceipt` is the agent saying "I saw this evidence, I hypothesize this, here's my attachment region — measure me." The before/after impact scheduler snapshots the attachment region pre-activation and re-measures it one loop iteration later, populating `InterventionTokenImpact.rungImprovement` with real data. The C6 scoreboard metric rolls those populated impacts into "what fraction of accepted agentic augmentations actually reduced ambiguity, suspension, or rung-score in their attachment region?"

An intervention that moved the needle earns its seat at the table. An intervention that did not is a demotion candidate. The adjudication is not a value judgment; it is a statistical fact rolled up through C6 against the scorecard floor (`docs/alignment-targets.md`).

This is the honest version of "AI in the loop." The agent is a first-class participant whose work is **measurable, demotable, and therefore trustworthy**. Claude is the first citizen of this loop today.

### 4. The system improves itself against its own loss function

The 15-knob parameter space (`docs/recursive-self-improvement.md`) plus the dual L4 metric tree (`docs/canon-and-derivation.md` § 12) plus M5 and C6 as the scoreboard (`docs/alignment-targets.md`) is a training loop for the pipeline's own source code. The forward pass is a clean-slate cold-start synthetic run. The loss function is the scorecard's Pareto frontier over M5 / C6 / effectiveHitRate. The backward pass is a targeted code change at the top failure mode. The checkpoint is a git commit.

This is not AGI; it is narrow, bounded, law-driven self-improvement inside a well-defined parameter space with a clean-slate invariant and a monotonic scorecard. But it is the real thing: when the scorecard goes up, the pipeline got better at a task the system can define precisely without ambient hand-waving. At the limit, you point an agent at this codebase with the scorecard as the objective function and it tunes its own source code against a convergence proof. The speedrun harness is the forward pass; the agent (Claude today) is the optimizer; the scorecard is the gradient.

## The four-axis envelope — the upper ontology

The behavioral claims above are only honest if the substrate enforces them. That enforcement comes from a single structural move that unifies the entire codebase: every artifact in Tesseract is a point in a **4-axis typed space**, and the pipeline is a typed path through that space.

```
Envelope<Stage, Source, Verdict><Payload: Fingerprint<Stage, Source>>
```

Four phantom-typed axes, each answering a different question about an artifact:

- **Stage** — *when in the forward progression are we?* — `preparation → resolution → execution → evidence → proposal → improvement`. The temporal axis. Declared via the `S` parameter on `WorkflowMetadata<S>` in `lib/domain/governance/workflow-types.ts`. Concrete envelope types extend `WorkflowMetadata<'stage'>` for their specific literal — `RunRecord extends WorkflowMetadata<'execution'>`, `ProposalBundle extends WorkflowMetadata<'proposal'>`. A function signature like `buildProposals(run: WorkflowEnvelope<'execution', _>): WorkflowEnvelope<'proposal', _>` is self-documenting protocol. **Answers: what comes next?**

- **Source** — *which slot of the 6-rung precedence ladder produced this?* — `operator-override → agentic-override → deterministic-observation → reference-canon → live-derivation → cold-derivation`. The epistemic axis. Declared via the `Src` parameter on `Atom<C, T, Src>`, `Composition<S, T, Src>`, `Projection<S, Src>` in `lib/domain/pipeline/{atom,composition,projection}.ts`. No default parameter — every call site declares source explicitly. Knowledge posture (`cold-start` / `warm-start` / `production`) is a bound on Source. **Answers: where did this come from?**

- **Verdict** — *what is governance's three-way decision about this right now?* — `Approved<T> | Suspended<T, I> | Blocked`. The normative axis. Declared via the `GovernanceVerdict<T, I>` ADT with `chainVerdict` as the monadic bind for gate composition. A blocked execution envelope is a distinct type from an approved execution envelope; downstream consumers can require approved-only input via type constraint. **Answers: can I use this?**

- **Fingerprint<Tag>** — *what does this identifier point at, and how do I not mix it up with other identifiers?* — branded string in `lib/domain/kernel/hash.ts` with a phantom tag. The identity-projection axis. Every fingerprint carries a phantom tag that identifies which slice of the 4D space it points at. `type TaskFingerprint = Fingerprint<'task'>`, `type KnowledgeFingerprint = Fingerprint<'knowledge'>`, `type AttachmentRegionFingerprint = Fingerprint<'attachment-region'>`. Passing a knowledge fingerprint where a task fingerprint is expected becomes a compile error. **Answers: is this the same thing as that other thing, and can the type system tell?**

The four axes are orthogonal. Every artifact in the codebase sits at a unique `(Stage, Source, Verdict, Fingerprint)` point. Every function restricts one or more axes in its signature. The forward progression of the pipeline becomes readable as a typed path:

```
(preparation, deterministic-observation, approved, <intent-fp>)
  → (resolution, agentic-override, approved, <task-fp>)
  → (execution, live-derivation, suspended, <run-fp>)
  → (evidence, live-derivation, approved, <evidence-fp>)
  → (proposal, agentic-override, suspended, <proposal-fp>)
  → (improvement, operator-override, approved, <ledger-fp>)
```

That sequence is the whole pipeline. Every step moves along at least one axis. Every step's precondition is a type constraint on the previous step's output. When this lands, a function signature like `reconcile(p: WorkflowEnvelope<'proposal', _>): WorkflowEnvelope<'improvement', _>` tells you where in the 4D space the function lives and what transition it embodies — without consulting prose.

### Why this IS the center target

Every behavioral claim in the sections above collapses to a compile-time property when the four axes are phantom-typed:

- **"Reference canon hits are clearly labeled in every lookup receipt"** = Source is phantom on `LookupResult`, so the tag is a type-level fact.
- **"Agentic overrides require a real `InterventionReceipt`"** = `Atom<C, T, 'agentic-override'>` requires a `receiptRef` field at the type level; any construction without it is a compile error.
- **"C6 measures the same attachment region before and after"** = the attachment region is a `Fingerprint<'attachment-region'>`, and the scheduler's snapshot/re-measure pair is a typed protocol that the compiler witnesses.
- **"Promotion gates per atom class"** = `PromotionGate<AtomClass, Src1, Src2>` is a typed transition from one Source rung to another, per atom class, with the confidence interval as part of the gate's contract.
- **"No file under `.canonical-artifacts/agentic/` exists without a receipt ref"** = law test backed by a type constraint, not a runtime sweep.
- **"The 50th test costs less than the 1st"** = the promotion/demotion machinery is a typed fold over the Source axis, so the migration-debt signal (reference-canon hit fraction) is a compile-time-addressable facet of any `Catalog`.

The behavioral vision and the structural upper ontology are the same thing. One is the "what it does," the other is the "what it is." Neither is honest without the other.

### The four axis lifts

The axes exist today as typed scaffolding but are not all enforced. The Stage axis has `StagedEnvelope<T, Stage>` half-built. The Source axis has `Atom<C, T, Src>` already phantom-parameterized but many call sites pass string literals without constraint. The Verdict axis has `GovernanceVerdict<T, I>` as an ADT but most envelopes still carry `governance: string` instead of a typed verdict. The Fingerprint axis has `Fingerprint<Tag>` branded but many fingerprints are still untyped strings.

**Finishing the four lifts is the structural substrate for synthetic feature completion.** The lifts are the spine; the scoreboard closures (C6 direct, M5 direct, promotion CIs, demotion sweep) are what hang off the spine. The full sequencing plan is `docs/synthetic-feature-completion-plan.md`; the mechanical work per axis lift is `docs/envelope-axis-refactor-plan.md`.

**Dependency order of the lifts:** Stage → Source → Fingerprint → Verdict. Stage first because every other axis is anchored to specific stages. Source second because `Atom`/`Composition`/`Projection` carry Stage implicitly through the pipeline phase they're produced in, so Source-axis enforcement only makes sense once Stage is phantom. Fingerprint third because typed fingerprint tags need Stage and Source to name the points they identify. Verdict last because it's the most mechanical — every envelope's `governance:` field becomes `verdict:` at once, and `foldVerdict` becomes the universal lens.

**Two axes are deferred past synthetic feature completion:**

- **Lane** (`intent | knowledge | control | resolution | execution | governance`) — already exists as a runtime taxonomy in the handshake array and in `docs/domain-ontology.md`. After the four lifts above, Lane may be over-determined by the `(Stage, Source, Fingerprint, Verdict)` combination — the Fingerprint tag typically names both the lane and the stage at once. Defer Lane-as-phantom until we find a concrete case where the over-determination fails.
- **Loops (A / B / C)** — Loop A produces a corpus; Loop B produces a substrate; Loop C produces a scored projection. The shape is `Loop<Seed, Product> >>= Loop<Product, Score>` — Kleisli composition of staged transitions, not a flat registry. Lifting Loops to types requires Stage to be phantom first (the Seed and Product types are stage-typed), so Loops naturally compose on top of the Stage lift. Defer until after synthetic feature completion; implement when the improvement cycle needs to be inspectable or composable as a typed value.

## What "feature complete" means for the synthetic loop

The current phase is **synthetic feature completion**: close the gap between "the doctrine describes a substrate" and "the substrate actually holds its claims on the synthetic workload." Concretely:

- Reference canon (slot 4) is wired and measurable, with warm-run hit receipts tagged by slot.
- `.canonical-artifacts/` exists as a greenfield tree populated only by real gates.
- M5 has graduated from `proxy` to `direct` — the trajectory primitive has ≥ 3 cohort-comparable history points and the slope is computed from real data.
- C6 has graduated from `proxy` to `direct` — the impact scheduler populates `InterventionTokenImpact.rungImprovement` from real before/after comparisons, and the C6 visitor folds populated impacts into a scoreboard value above its 2026-Q2 floor (50%).
- Promotion gates use Beta-posterior confidence intervals per atom class.
- Every file under `.canonical-artifacts/agentic/` is backed by an `InterventionReceipt` reference (law-tested).
- The discovery-fitness L4 tree is populated from real cold runs against the synthetic workload.
- The synthetic scorecard passes every 2026-Q2 alignment-targets floor.

Synthetic feature completion is the precondition for running against a real enterprise target. Trying to run against a production OutSystems application before the braid, the scoreboard, and the promotion gates are honest would measure noise and lock in false positives. The synthetic loop is the laboratory; the real target is the field.

The step-by-step execution plan for synthetic feature completion is `docs/synthetic-feature-completion-plan.md`.

## The long-arc form

When synthetic feature completion lands, the next target is **transferable runtime-family atoms**. The atom envelope already carries `runtime-family` as a first-class primitive (`docs/canon-and-derivation.md` § 3.6). A runtime family is a typed signature bundle — DOM signals, class prefixes, script globals, ARIA landmark patterns, widget idiom names — that identifies a specific runtime substrate (OutSystems Reactive 11, React with a specific design system, a Servlet-based JSF stack). When the discovery engine can cheaply recognize a family, the canonical artifact store can say "I already know 80% of how this platform works; I only need to learn the customer-specific 20%." That is the mechanism behind the claim that the 50th customer costs less than the 1st.

At the long arc: a mature canonical artifact store for a widely-deployed enterprise platform is itself a transferable asset. You hand it the customer's ADO backlog and a URL, the discovery engine fingerprints the runtime family, the lookup chain serves canonical artifacts from the pre-populated store, test generation runs at near-zero marginal cost against the platform's stable 80%, and agentic interventions earn C6 credit in the customer-specific 20%. The dogfood scaffolding is training wheels on the path to that product. Test emission remains a byproduct; the shared, reconciled interface model is the asset being acquired.

## What remains stable

The six concern lanes remain the public operating vocabulary:

- `intent`
- `knowledge`
- `control`
- `resolution`
- `execution`
- `governance/projection`

The task packet remains the machine handshake for one scenario. The emitted spec remains the readable facade. `.tesseract/runs/{ado_id}/{run_id}/run.json` remains the durable explanation of what the runtime actually did.

## What changed

The old compiler-centered framing was incomplete.

The durable structural spine is now `Interface Intelligence`:

- interface graph
- canonical targets
- selector canon
- state and event topology
- discovery and provenance

The durable action spine is now `Agent Workbench`:

- participant and intervention ledgers
- provider-agnostic agent host adapters
- replay and review surfaces
- intervention and rerun workflows

The durable optimization spine is now `Recursive Improvement`:

- governed experiments and scorecards
- objective vectors and classified signals
- candidate interventions and acceptance decisions
- checkpointed lineage across iterations

All three share one interpretation surface. That is how a generated spec, a runtime receipt, a workbench intervention, and an improvement run can all agree on what the application meant.

## The operator promise

At scale, the system should feel like a machine that:

- understands the DOM instead of repeatedly poking at it
- remembers selector and state knowledge once
- exposes the bottleneck instead of hiding it
- makes review a governance boundary, not a routine tax
- stays readable enough that a QA can trust what was emitted
- explains its own beliefs with evidence, receipts, and measured impact
- demotes its own past decisions when they stop holding up

That is how Tesseract can realistically grow toward thousands of scenarios without multiplying brittle test logic, and how its canonical artifact store grows toward becoming an asset in its own right.

## Readable emission still matters

The emitted surface is standard Playwright with QA-grade narrative. It is not Gherkin and not a custom user-facing DSL.

Readable tests matter because they are the human inspection layer over the same shared interpretation surface used by runtime, intervention, and improvement surfaces. The spec should read like a strong authored test even when every helper ultimately resolves through one canonical event-driven implementation.

## Improvement stays governed

Derived layers may ratchet automatically:

- selector health
- observed transitions
- intervention and session artifacts
- replay, training, and evaluation corpora

Canonical truth still requires proposals and trust-policy review.

That boundary is what lets the system learn aggressively without becoming opaque.

## Optimization lane

The offline optimization and evaluation lane still matters.

DSPy, GEPA, and similar tooling belong there for:

- proposal ranking
- prompt and workflow tuning
- replay and benchmark analysis
- finding where the bottleneck still lives

They do not replace the deterministic compiler core or the shared interpretation surface.
