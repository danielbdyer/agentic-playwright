# Tesseract Agent Guide

This repository is a compiler plus a reviewable knowledge system. Treat it that way.

## Start here

Read the doc that matches your task:

- fast repo brief: [docs/agent-context.md](docs/agent-context.md)
- operational overview: [README.md](README.md)
- product model and QA workflow: [VISION.md](VISION.md)
- domain ontology and invariants: [docs/domain-ontology.md](docs/domain-ontology.md)
- authorship and knowledge design: [docs/authoring.md](docs/authoring.md)
- planned work split by lane: [BACKLOG.md](BACKLOG.md)

Scoped instructions under `.github/instructions/` still apply for domain, knowledge, generated files, and tests.

## Non-negotiable model

- Approved artifacts are the source of truth.
- Derived artifacts are projections.
- Deterministic compiler derivations are auto-approved.
- Only proposed canonical changes require trust-policy review.
- Generated specs are disposable object code.
- Provenance is part of correctness.

## Canonical vs derived

Canonical inputs:

- `.ado-sync/`
- `scenarios/`
- `knowledge/surfaces/`
- `knowledge/screens/`
- `knowledge/patterns/`
- `knowledge/snapshots/`
- `.tesseract/evidence/`
- `.tesseract/policy/`

Derived outputs. Do not hand-edit unless the task is specifically about the generator:

- `.tesseract/bound/`
- `.tesseract/graph/`
- `generated/`
- `lib/generated/`

## Governance vocabulary

Use these terms consistently:

- `confidence`: how a binding was produced
- `compiler-derived`: deterministic derivation from approved artifacts
- `governance`: whether a bound step is executable now or needs review
- `approved`: deterministic or already-approved path, emit and run normally
- `review-required`: depends on agent-proposed or otherwise unapproved canonical knowledge
- `blocked`: do not execute

Do not overload confidence with review state.

## Deterministic precedence

The inference and bind path is ordered:

1. explicit scenario fields
2. screen hints
3. shared patterns
4. deterministic heuristics
5. `unbound`

If you change this precedence, you are changing compiler semantics. Add or update tests accordingly.

## Supplement hierarchy

Screen-local first:

- `knowledge/screens/{screen}.hints.yaml`

Promoted shared layer second:

- `knowledge/patterns/*.yaml`

Promotion rule:

- prefer local supplements for first discovery
- promote only after repetition or deliberate generalization

Do not hide novel behavior in runtime code when it can be expressed as reviewed knowledge.

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
- `.tesseract/graph/index.json`

If a new workflow cannot explain itself through those artifacts, it is under-modeled.

## Agent workflow

Prefer this command sequence when orienting:

```powershell
npm run context
npm run paths
npm run trace
npm run impact
npm run surface
npm run graph
npm run types
npm test
```

An agent should be able to discover:

- which files are canonical
- which artifacts were derived
- which supplements were used
- where review is required
- where the bottleneck is

without relying on repo lore.

## Trust policy boundary

Trust policy governs proposed canonical changes such as:

- elements
- postures
- hints
- patterns
- surfaces
- snapshot templates

Trust policy does not block compiler output that was derived from already approved artifacts.

## Optimization lane

DSPy, GEPA, and similar tooling are welcome in the offline evaluation lane only.

Use them for:

- ranking proposals
- tuning agent prompts
- measuring trace and evidence quality
- improving benchmark outcomes

Do not route them into the deterministic compiler core.
