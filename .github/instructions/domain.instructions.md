---
applyTo: "lib/domain/**/*.ts"
---

# Domain instructions

This layer owns compiler semantics, provenance primitives, validation, inference rules, and AST-backed code generation.

## Hard boundaries

- No imports from `lib/application/`, `lib/infrastructure/`, or `lib/runtime/`.
- No filesystem, network, Playwright, or Effect dependencies.
- Keep functions pure and deterministic.
- Preserve exhaustive branching and ingress validation.

## What to protect

Treat these as core domain primitives:

- `SurfaceGraph`
- `StepProgram`
- `ValueRef`
- `DerivedGraph`
- provenance and governance fields on bound artifacts
- locator ladder and supplement vocabularies

## Current operating model

- `compiler-derived` means deterministic derivation from approved artifacts.
- `governance` is separate from confidence.
- screen hints and shared patterns are approved data grammars, not runtime hacks.
- graph and review projections must remain explainable from domain values alone.

## Functional programming style (enforced by ESLint)

These rules are enforced by `no-restricted-syntax` in `eslint.config.cjs` and will fail `npm run check`:

- **No `let`** — use `const` with ternaries, `reduce`, or destructuring. If you need loop state, model it as a recursive fold.
- **No `Array.push()`** — use `[...existing, newItem]`, `.concat()`, `.reduce()`, or `.flatMap()` to build arrays.
- **No `for` / `for...in`** — use `map`, `filter`, `reduce`, `flatMap`, or `for...of` (which is allowed).
- **Return `ReadonlyArray<T>`** from public functions, not `Array<T>`.
- **Extract predicates** as named pure functions (e.g., `const isBlocked = (step) => ...`) rather than inline conditionals.
- **Group/collect** via `reduce` over a `Map`/accumulator, not via mutable `Map` + imperative loop + `.push()`.

Existing baseline violations are marked with `// eslint-disable-line no-restricted-syntax -- baseline` and should be refactored when those modules are next touched.

## Preferences

- Prefer value objects and typed unions over raw strings.
- Prefer stable precedence rules over heuristic fallthrough.
- Prefer law-style tests for determinism, normalization, precedence, and round-trips.
- Prefer AST construction over string interpolation for parseable output.
- Prefer phantom branded types (`Approved<T>`, `Blocked<T>`) at governance boundaries over runtime-only checks.
- Prefer `foldGovernance` for exhaustive governance case analysis.

## Anti-patterns

Do not put in this layer:

- hidden policy decisions based on filesystem paths
- runtime-only conveniences masquerading as domain concepts
- opaque utility functions that bypass validation
- ad hoc confidence or governance logic scattered across modules
- mutable accumulation patterns (`let` + `push` + `for` loop) — use declarative alternatives
