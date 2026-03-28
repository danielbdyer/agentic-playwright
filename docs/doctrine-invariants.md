# Doctrine Invariants

*Structured invariants extracted from CLAUDE.md and master architecture. Consumed by the doctrine compiler (`lib/domain/doctrine-compiler.ts`) to auto-generate verification tests.*

---

## File Purity Constraints

- `lib/domain` must stay pure and side-effect free.
- `lib/domain/algebra` must not import from `lib/runtime` or `lib/infrastructure`.
- `lib/application` must not import from `lib/runtime` directly (orchestration through Effect only).

## Function Existence Requirements

- `mintApproved()`: must exist — centralized governance minting
- `foldGovernance()`: must exist — exhaustive governance case analysis
- `mergeGovernance()`: must exist — lattice meet operation
- `mapPayload()`: must exist — envelope payload transformation

## Type Field Requirements

Every cross-lane handoff should expose the same envelope header: `kind`, `version`, `stage`, `scope`, `ids`, `fingerprints`, `lineage`, `governance`, and `payload`.

## Directory Structure

- `lib/domain` owns the pure domain model
- `lib/application` owns orchestration through Effect
- `lib/runtime` executes programs and resolves locators/widgets
- `lib/infrastructure` owns ports and adapters

## Preferred Patterns

Prefer `foldGovernance` over raw `if (governance === ...)` checks.
Prefer `mapPayload(envelope, f)` over manual spread-and-reassemble.
Prefer `readonly` fields on all exported interfaces.

## Prohibited Patterns

**`Effect.runPromise` in domain** — Domain layer must remain pure; Effect execution belongs in `lib/composition/` only.
**`governance: 'approved'` string literals** — Use `mintApproved()` from `lib/domain/types/workflow.ts`.
**Mutable `let` + `push` accumulation** — Prefer `reduce`/`map`/`flatMap` per coding-notes.md.
