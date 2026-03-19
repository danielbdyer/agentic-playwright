# Tesseract Agent Guide

This repository is an interface intelligence and agent workbench system built around a deterministic preparation pipeline, typed intervention receipts, and a governed recursive-improvement loop. Treat it that way.

## Start here

Read the doc that matches your task:

- fast repo brief: [docs/agent-context.md](docs/agent-context.md)
- operational overview: [README.md](README.md)
- authoritative architecture doctrine: [docs/master-architecture.md](docs/master-architecture.md)
- product model and QA workflow: [VISION.md](VISION.md)
- domain ontology and invariants: [docs/domain-ontology.md](docs/domain-ontology.md)
- authorship and knowledge design: [docs/authoring.md](docs/authoring.md)
- operator workflow and approvals: [docs/operator-handbook.md](docs/operator-handbook.md)
- planned work split by lane: [BACKLOG.md](BACKLOG.md)
- design direction and owner decisions: [docs/direction.md](docs/direction.md)
- implementation coding notes: [docs/coding-notes.md](docs/coding-notes.md)
- seams, invariants, and verification: [docs/seams-and-invariants.md](docs/seams-and-invariants.md)

Scoped instructions under `.github/instructions/` still apply for domain, knowledge, generated files, and tests.

The six public lanes remain the operating vocabulary. The deeper architectural spines now cut across them:

- `interface`
- `intervention`
- `improvement`

## Non-negotiable model

- Active canonical artifacts are the source of truth.
- Derived artifacts are projections.
- Deterministic compiler derivations are auto-approved.
- Certification is a designation on canon, not an execution gate.
- Generated specs are disposable object code.
- Provenance is part of correctness.

## Canonical vs derived

Canonical inputs (suite-scoped, under `dogfood/` for training or repo root for production):

Tier 1 — Problem statement (always loaded):

- `.ado-sync/`
- `benchmarks/`
- `controls/`
- `scenarios/`
- `fixtures/`
- `.tesseract/evidence/`
- `.tesseract/policy/`

Tier 2 — Learned knowledge (gated by knowledge posture):

- `knowledge/surfaces/`
- `knowledge/screens/`
- `knowledge/patterns/`
- `knowledge/snapshots/`
- `knowledge/components/`
- `knowledge/routes/`

Knowledge posture (`posture.yaml` at suite root or `--posture` CLI flag):

- `cold-start`: Tier 1 only — tests the system's ability to discover and learn from scratch.
- `warm-start`: Tier 1 + Tier 2 — tests the pipeline given pre-existing knowledge. Default.
- `production`: Same as warm-start + all output version-controlled.

Derived outputs. Do not hand-edit unless the task is specifically about the generator:

- `.tesseract/bound/`
- `.tesseract/benchmarks/`
- `.tesseract/inbox/`
- `.tesseract/interface/`
- `.tesseract/learning/`
- `.tesseract/sessions/`
- `.tesseract/tasks/`
- `.tesseract/runs/`
- `.tesseract/graph/`
- `generated/`
- `lib/generated/`

## Tracking rule: production vs dogfood

All training data — scenarios, knowledge, fixtures, controls, benchmarks, ADO sync artifacts — lives under a single `dogfood/` directory. This is the suite root.

**On main**: `dogfood/` and `lib/generated/` are gitignored. The recursive-improvement loop regenerates from scratch. Nothing it learns persists across clones.

**On training branches**: Remove or override the `dogfood/` gitignore line so content persists for continuity between runs. Never merge evolvable surfaces (knowledge, fixtures, generated output) back to main — only merge business logic improvements to the engine.

**When production arrives**: Production content lives at the repo root (or a named suite directory like `production/`) and is fully versioned. `lib/generated/` is tracked again. The `createProjectPaths(rootDir, suiteRoot)` function resolves content paths relative to the suite root, so the engine works identically with any suite location.

The `.tesseract/*` runtime engine directory is bulk-gitignored regardless of suite; only governance anchors (`trust-policy.yaml`, `scorecard.json`) survive.

## Six workflow lanes

Use this vocabulary consistently:

- `intent`: `dogfood/.ado-sync/` and `dogfood/scenarios/`
- `knowledge`: `dogfood/knowledge/surfaces/`, `dogfood/knowledge/screens/`, `dogfood/knowledge/patterns/`, `dogfood/knowledge/snapshots/`
- `control`: `dogfood/controls/datasets/`, `dogfood/controls/resolution/`, `dogfood/controls/runbooks/`
- `resolution`: `.tesseract/tasks/` plus interpretation receipts
- `execution`: execution receipts and run records
- `governance/projection`: generated outputs, graph surfaces, and trust policy

Every cross-lane handoff should expose the same envelope header: `kind`, `version`, `stage`, `scope`, `ids`, `fingerprints`, `lineage`, `governance`, and `payload`.

## Governance vocabulary

Use these terms consistently:

- `confidence`: how a binding was produced
- `compiler-derived`: deterministic derivation from approved artifacts
- `intent-only`: preserved intent awaiting runtime interpretation
- `governance`: whether a bound step is executable now or needs operator follow-up
- `approved`: deterministic or already-approved path, emit and run normally
- `review-required`: the system needs operator follow-up, but this is not synonymous with uncertified canon
- `blocked`: do not execute

Do not overload confidence with review state.

## Deterministic precedence

Keep precedence concern-specific:

Resolution:

1. explicit scenario fields
2. `controls/resolution/*.resolution.yaml`
3. approved screen knowledge and screen hints
4. shared patterns
5. prior evidence or run history
6. live DOM exploration and safe degraded resolution
7. `needs-human`

Data:

1. explicit scenario override
2. runbook dataset binding
3. dataset default
4. hint default value
5. posture sample
6. generated token

Run selection:

1. CLI flags
2. runbook
3. repo defaults

If you change these precedence laws, you are changing compiler semantics. Add or update tests accordingly.

## Supplement hierarchy

Screen-local first:

- `knowledge/screens/{screen}.hints.yaml`

Promoted shared layer second:

- `knowledge/patterns/*.yaml`

Promotion rule:

- prefer local supplements for first discovery
- promote only after repetition or deliberate generalization

Do not hide novel behavior in runtime code when it can be expressed as reviewed knowledge. Human escalation is last-resort only after the agent has exhausted the non-human path.

## What belongs where

Use data when the concept is declarative:

- aliases
- locator ladders
- default value refs
- snapshot aliases
- posture vocabularies
- widget affordances

Use code when the concept is genuinely procedural:

- widget choreography in `knowledge/components/*.ts`
- interpreter/runtime orchestration
- filesystem, ADO, and reporting adapters
- AST-backed emitters

## Architectural guardrails

- `lib/domain` must stay pure and side-effect free.
- `lib/application` owns orchestration through Effect.
- `lib/runtime` executes programs and resolves locators/widgets.
- `lib/infrastructure` owns ports and adapters.

When a concept starts to cross those boundaries, model the boundary explicitly instead of leaking strings or side effects.

## Strong preferences

Read `docs/coding-notes.md` thoroughly before writing code. It contains authoritative guidance on FP style, Effect patterns, design pattern vocabulary, and testability conventions that govern all contributions.

### Functional programming

- Prefer pure functions and immutable data. Return new objects instead of mutating parameters. Avoid `let`, `Array.push`, and mutable accumulation patterns.
- Prefer `const` bindings, ternary expressions, and higher-order functions (`map`, `filter`, `reduce`, `flatMap`) over imperative loops and mutable state.
- Prefer recursive folds over mutable accumulation with early return. When a sequential process short-circuits on success and accumulates events, model it as a recursive `step(remaining, priorEvents)` function. See `runStrategyChain`, `runPipelinePhases`, and `runDogfoodLoop`.
- Mark all exported interface fields as `readonly`. Use `ReadonlyArray<T>` and `readonly T[]` for array fields in public interfaces.

### Effect-forward orchestration

- Prefer `Effect.gen` with `yield*` for sequential orchestration. Never use `Effect.runPromise`/`Effect.runSync` outside `lib/composition/`.
- Prefer `Effect.all({...})` over sequential `yield*` chains for structurally independent operations. This makes independence explicit at the type level even without runtime concurrency. See `loadWorkspaceCatalog`.
- Prefer `Effect.catchTag` over `Effect.either` + manual `_tag` discrimination. Use `Effect.catchAll` when recovering uniformly from any failure.
- Thread immutable state through recursive Effect steps rather than mutating closed-over `let` bindings. See `docs/coding-notes.md` § Effect-Forward Patterns.
- Use `Effect.succeed`/`Effect.fail` for pure lifts. Never throw inside `Effect.gen`.

### Design patterns (Gang of Four vocabulary)

- **Strategy**: resolution ladder, pipeline phase chains. New behaviors compose as new strategies, not as branches in existing strategies.
- **Visitor/Fold**: exhaustive case analysis for discriminated unions. Use typed switch or `foldGovernance` — never unchecked `if` chains.
- **Composite**: scoring rules, validation rules, pipeline phases. Use `combine`/`contramap`. Small semigroups compose; hardcoded formulas don't.
- **State Machine**: convergence detection, lifecycle management. Pure state transitions separate from loop bodies.
- **Interpreter**: compilation phases, resolution pipeline. Each phase is a pure function from typed input to typed output with provenance.
- **Envelope**: every cross-boundary artifact carries a standard envelope. Use `mapPayload(envelope, f)` — never manual spread-and-reassemble.

### Other strong preferences

- Prefer phantom branded types (`Approved<T>`, `Blocked<T>`) at governance boundaries over runtime-only checks. Type guards (`isApproved`, `isBlocked`) and assertions (`requireApproved`) narrow at the type level. Use `foldGovernance` for exhaustive case analysis.
- Prefer value objects over protocol strings.
- Prefer pure derivations over storing parallel truth.
- Prefer AST-backed code generation over source-string splicing.
- Prefer law-style tests for determinism, precedence, normalization, and round-trips.
- Prefer provenance-rich outputs over opaque success paths.

## Review surface contract

Every meaningful change should preserve or improve these outputs:

- `generated/{suite}/{ado_id}.spec.ts`
- `generated/{suite}/{ado_id}.trace.json`
- `generated/{suite}/{ado_id}.review.md`
- `generated/{suite}/{ado_id}.proposals.json`
- `.tesseract/tasks/{ado_id}.resolution.json`
- `.tesseract/graph/index.json`

If a new workflow cannot explain itself through those artifacts, it is under-modeled.

## Agent workflow

Prefer this command sequence when orienting:

```powershell
npm run context
npm run workflow
npm run paths
npm run trace
npm run impact
npm run surface
npm run graph
npm run run
npm run types
npm test
```

An agent should be able to discover:

- which files are canonical
- which controls are active for a scenario or runbook
- which artifacts were derived
- which knowledge and prior evidence the runtime agent will receive
- which supplements were used
- where certification or operator follow-up is needed
- where the bottleneck is

without relying on repo lore.

## Trust policy boundary

Trust policy evaluates certification for canonical changes such as:

- elements
- postures
- hints
- patterns
- surfaces
- snapshot templates

Trust policy does not block compiler output that was derived from existing canon, and it does not prevent activation of schema-valid runtime-acquired canon.

## Optimization lane

DSPy, GEPA, and similar tooling are welcome in the offline evaluation lane only.

Use them for:

- ranking proposals
- tuning agent prompts
- measuring trace and evidence quality
- improving benchmark outcomes

Do not route them into the deterministic compiler core.
