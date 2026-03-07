---
applyTo: "lib/domain/**/*.ts"
---

# Domain layer rules

This is the innermost layer of a clean architecture compiler. Code here must be pure and self-contained.

## Hard constraints

- No imports from `lib/application/`, `lib/infrastructure/`, or `lib/runtime/`.
- No filesystem, network, Playwright, or Effect-TS dependencies.
- All functions should be pure: same input, same output, no side effects.
- Enforced by `tests/architecture.spec.ts`.

## Style

- Prefer branded identity types (`ScreenId`, `ElementId`, `PostureId`) over raw strings.
- Use smart constructors with validation at ingress boundaries.
- Prefer exhaustive pattern matching over fallback logic.
- Write law-style tests for determinism, validation, and round-trips.

## Protected primitives

Extend these carefully — they are the core domain algebra:

`RefPath`, `SurfaceGraph`, `StepProgram`, `ValueRef`, `DerivedCapability`, `DerivedGraph`

## Code generation

Files `spec-codegen.ts`, `typegen.ts`, and `ts-ast.ts` produce generated TypeScript via AST construction. Never use string interpolation for generated code. Build with `ts.factory.*` helpers and `printModule()`.
