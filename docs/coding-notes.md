# Coding Notes

These notes are opinionated. They exist because the master architecture is precise but dense, and an implementer mid-flight needs the *throughline*, not another index.

Read this before starting any phase. If something here contradicts `docs/master-architecture.md`, the master architecture wins.

---

## The Core Insight

Tesseract's entire design follows from one bet: **the application is knowable, and that knowledge is worth more than the tests it produces**.

Traditional test automation treats the DOM as a hostile surface you poke at with selectors and pray stays stable. Every test rediscovers the same buttons, the same fields, the same state transitions. The 50th test is as expensive as the 1st. At 200 tests the suite is a maintenance liability. At 2000 it's fiction.

Tesseract inverts this. You harvest the application into a shared model *once*. Every scenario is a projection through that model. The emitted Playwright file is disposable object code — like a `.o` file from a compiler. The durable assets are the interface graph, the selector canon, the state topology, and the provenance chain that explains how they were built.

This is not a metaphor. It is the literal implementation strategy, and every design decision follows from it.

---

## The Three Moves That Make Everything Work

### 1. Targets define selectors, not the other way around

This is the selector inversion, and it is the single most important structural decision in the system.

A `CanonicalTargetRef` is a semantic identity: "the policy number input on the policy-search screen." It exists whether or not we have a working selector for it. Selectors are `SelectorProbe` entries in `SelectorCanon` — they are *evidence* for how to find a target, ranked by health, ordered into ladders, and subject to drift detection.

When you're implementing, the test for whether you've internalized this: **if you're about to write a selector string anywhere other than knowledge YAML or `SelectorCanon`, stop.** Scenarios reference target refs. Emitted specs reference target refs. Receipts reference target refs. The selector is resolved at the last possible moment through the canon, and drift accumulates on the existing ref rather than spawning a duplicate.

This is how 2000 scenarios can reference the same control without 2000 copies of a selector. When that selector drifts, one canon update repairs them all.

### 2. Dynamic behavior is structure, not code

When field A reveals field B, the traditional approach is a runtime wait, a retry loop, or a recovery handler baked into the emitted test. That works for one test. It does not compose.

In Tesseract, that relationship is a `StateTransition` in the `StateTransitionGraph`: a typed edge from "advanced filters collapsed" to "advanced filters expanded," triggered by an `EventSignature` on the toggle, with observable effects on the target set. It is stored once, keyed, and referenced by ID from every scenario that depends on it.

The practical consequence: **when you model a new dynamic behavior, ask whether it should be a node in the state graph before reaching for a runtime workaround.** Visibility, enablement, validation gates, modal lifecycle, navigation state — these are all structural relationships that belong in the model, not procedural code that belongs in the emitted spec.

The emission pipeline consumes state transitions explicitly. The runtime enforces preconditions, dispatches events, observes effects, and records what actually happened. This is how the system learns and how receipts stay meaningful.

### 3. Learning is aggressive but governance is absolute

The system has two very different velocities, and keeping them separate is what makes the whole thing safe at scale.

**Fast lane (derived, ratchets automatically):** selector health, drift observations, observed state transitions, session artifacts, replay examples, training corpora, benchmark outcomes. These move on every run. No human in the loop.

**Slow lane (canonical, requires proposal + review):** new targets, changed semantic meaning, promoted patterns, approved screen knowledge edits, snapshot template changes, surface model changes. These move only through the trust-policy boundary.

The key insight: *the fast lane is what makes the system improve.* The slow lane is what keeps it honest. If you blur them — if derived knowledge silently mutates canon, or if canonical changes bypass review — the system becomes opaque and the governance promise is broken.

When implementing, the test: **can I explain what changed and why from the review surface?** If yes, you're on the right track. If a run silently changed approved truth, or if a new workflow can't explain itself through traces and proposals, the model is under-specified.

---

## The Interpretation Surface Is the Product

The six workflow lanes (intent, knowledge, control, resolution, execution, governance) tell you where a concern lives operationally. The three spines (interface, session, learning) tell you what the system is actually made of. But neither is the thing that ties them together.

The interpretation surface is. It is the single machine boundary that planning, runtime, emission, review, and learning all consume. When it works, every consumer agrees on what the application meant:

- The emitted spec says "click the save button on the policy-edit screen."
- The runtime receipt says "resolved target `surface:policy-edit/element:save-button` via selector probe `#save-btn` at rung 1, observed state transition `save-button:enabled → save-button:disabled` with governance `approved`."
- The review markdown shows the human what happened and why.
- The learning corpus records the grounded fragment for future decomposition training.

If those four surfaces disagree, something is wrong with the interpretation surface, not with any individual consumer.

---

## How to Stay in the Groove

### Before writing code, know which layer you're in

```
lib/domain/          pure values, validation, inference, codegen — NO side effects, NO I/O
lib/application/     orchestration via Effect — depends only on domain
lib/runtime/         Playwright execution, locator resolution — no application imports
lib/infrastructure/  ports and adapters — implements application ports
```

The most common violation is domain code that needs "just a little I/O." It doesn't. Model the data in domain, orchestrate the I/O in application, execute the effect in infrastructure. If that feels heavy for your change, the change might be simpler than you think.

### Before editing a file, know if it's canonical or derived

If you're about to hand-edit something under `.tesseract/tasks/`, `.tesseract/interface/`, `.tesseract/graph/`, `generated/`, or `lib/generated/` — you're in the wrong place. Fix the generator that produces it.

If you're editing under `knowledge/`, `scenarios/`, `controls/`, or `.tesseract/policy/` — you're editing source of truth. Treat it with the same care as production code.

### The resolution precedence is compiler semantics

```
1. explicit scenario fields
2. resolution controls
3. approved screen knowledge + hints
4. shared patterns
5. prior evidence or run history
6. live DOM exploration (degraded resolution)
7. needs-human
```

If you reorder this, add a tier, or skip a tier, you are changing what the compiler produces. Write a law test first. This is non-negotiable.

### Use AST-backed generation, always

`lib/domain/ts-ast.ts` and `lib/domain/spec-codegen.ts` exist precisely so we never splice source strings. Template literals, string concatenation, and manual indentation management in codegen are bugs waiting to happen. The AST approach composes, the string approach doesn't.

### Provenance is not optional metadata

Every derived artifact must carry: what inputs it consumed, which resolution stage won, what was exhausted before the winner, and enough lineage to reconstruct the derivation. This is part of correctness, not part of logging.

The envelope header (`kind`, `version`, `stage`, `scope`, `ids`, `fingerprints`, `lineage`, `governance`, `payload`) exists for exactly this reason. If your new artifact doesn't carry it, ask why.

---

## The Phased Program — What Each Phase Actually Unlocks

The phases aren't just a checklist. Each one opens a capability that the next one depends on.

**Phase 1 (Interface Graph + Selector Canon)** establishes the shared model. Without it, every scenario is an island. With it, 2000 scenarios share one picture of the application. The unlock: selectors stop being a per-test concern.

**Phase 2 (State + Event Topology)** makes dynamic behavior explicit. Without it, field reveals, validation gates, and modal lifecycles are runtime surprises. With it, they're typed edges in a reusable graph. The unlock: the system can reason about preconditions and effects instead of guessing.

**Phase 3 (Scenario Decomposition)** grounds ADO prose in the shared model. Without it, the lowering from human intent to executable steps is ad-hoc. With it, every step target, assertion anchor, and fallback path points to a graph node. The unlock: scenarios become projections, not programs.

**Phase 4 (Readable Emission)** produces QA-grade Playwright through one canonical event pipeline. Without it, readability and machine truth diverge. With it, the spec reads like a human wrote it while every helper resolves through target refs, selector probes, state checks, event dispatch, and provenance-rich receipts. The unlock: trust. A QA can read the spec and a machine can audit the receipt, and they agree.

**Phase 5 (Agent Workbench)** standardizes how agents and operators interact with the system. Without it, every agent integration is a snowflake. With it, Copilot, Claude Code, a CI bot, and a human operator all speak the same typed event vocabulary against the same shared truth. The unlock: the system works the same way regardless of who or what is driving it.

**Phase 6 (Learning + Evaluation)** closes the improvement loop. Without it, knowledge grows only through human authoring. With it, decomposition, repair, and workflow corpora accumulate from real provenance and get evaluated offline. The unlock: the system gets materially better with use.

**Phase 7 (Scale Operations)** makes incremental recomputation bounded. Without it, a change to one screen recompiles everything. With it, fingerprint-based change detection ensures only affected scenarios recompute. The unlock: thousands of scenarios stay fast.

---

## The Backlog Critical Path

A1 (runtime interpretation) is the bottleneck. It unblocks A2 (auto-approval), which unblocks A3 (dogfood orchestrator), which enables D1 (structured entropy). Everything else can proceed in parallel, but the A-lane is the spine.

The deep reason A1 matters: it breaks the alias treadmill. Today, novel ADO phrasing requires knowledge edits before execution. After A1, the runtime interpreter resolves intent against the live DOM and knowledge priors, and the knowledge system grows from execution rather than from human synonym curation. This is the transition from "human authors tests faster" to "system understands applications."

---

## Signals You're Doing It Right

- You added a new screen and it became available to future scenarios by entering the shared model once — no scenario-local patches required.
- You changed a selector in one place and 40 scenarios picked up the fix.
- A dynamic behavior is modeled as a state transition and three scenarios reuse it without knowing about each other.
- The emitted test reads like a human wrote it, but the trace JSON explains exactly which resolution stage won every step.
- A run failed, and the receipt tells you *why* it failed with enough specificity to know whether the app changed or the knowledge is stale.
- The 50th test was cheaper to produce than the 1st.

## Signals You're Drifting

- You wrote a selector string in a scenario, a spec, or a receipt instead of referencing a target ref.
- You added a `waitForSelector` or retry loop in emitted code to handle a field reveal that should be a state transition.
- You confused `confidence` (how a binding was produced) with `governance` (whether it's allowed to execute).
- You hand-edited a file under `generated/` or `.tesseract/tasks/`.
- A new workflow produces results that can't be explained through the existing review artifacts.
- You put I/O in `lib/domain/` because "it's just one call."
- You promoted a pattern to `knowledge/patterns/` before it proved itself screen-locally.
- You spliced source strings instead of using the AST codegen.
- You added optimization tooling (DSPy, GEPA) to the compiler core instead of the offline evaluation lane.
