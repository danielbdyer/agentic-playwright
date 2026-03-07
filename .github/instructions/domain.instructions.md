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

## Preferences

- Prefer value objects and typed unions over raw strings.
- Prefer stable precedence rules over heuristic fallthrough.
- Prefer law-style tests for determinism, normalization, precedence, and round-trips.
- Prefer AST construction over string interpolation for parseable output.

## Anti-patterns

Do not put in this layer:

- hidden policy decisions based on filesystem paths
- runtime-only conveniences masquerading as domain concepts
- opaque utility functions that bypass validation
- ad hoc confidence or governance logic scattered across modules
