# Tesseract Agent Guide

This repository is an interface intelligence and agent workbench system built around a deterministic preparation pipeline and an active canonical knowledge loop. Treat it that way.

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
- `session`
- `learning`

## Non-negotiable model

- Active canonical artifacts are the source of truth.
- Derived artifacts are projections.
- Deterministic compiler derivations are auto-approved.
- Certification is a designation on canon, not an execution gate.
- Generated specs are disposable object code.
- Provenance is part of correctness.

## Canonical vs derived

Canonical inputs:

- `.ado-sync/`
- `benchmarks/`
- `controls/`
- `scenarios/`
- `knowledge/surfaces/`
- `knowledge/screens/`
- `knowledge/patterns/`
- `knowledge/snapshots/`
- `.tesseract/evidence/`
- `.tesseract/policy/`

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

## Six workflow lanes

Use this vocabulary consistently:

- `intent`: `.ado-sync/` and `scenarios/`
- `knowledge`: `knowledge/surfaces/`, `knowledge/screens/`, `knowledge/patterns/`, `knowledge/snapshots/`
- `control`: `controls/datasets/`, `controls/resolution/`, `controls/runbooks/`
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
