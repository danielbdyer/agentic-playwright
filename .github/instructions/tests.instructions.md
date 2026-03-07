---
applyTo: "tests/**/*.ts,tests/**/*.spec.ts"
---

# Test conventions

Tests use Playwright Test as a runner but most are not browser tests — they test compiler logic, domain invariants, and architecture rules.

## Test categories

- `domain.spec.ts` — Domain law tests: determinism, validation, round-trips. No side effects.
- `compiler.spec.ts` — Integration tests for the full pipeline (parse → bind → emit → graph → types).
- `architecture.spec.ts` — Enforces layer dependency rules. Fails if forbidden imports appear.
- `interpreters.spec.ts` — Verifies structural trace equivalence across interpreter modes.
- `runtime-errors.spec.ts` — Error code stability and classification.
- `runtime-load.spec.ts` — Screen knowledge loading and posture validation.
- `path-security.spec.ts` — Path traversal rejection.
- `generated-types.spec.ts` — Generated API contract verification.
- `reporter.spec.ts` — Reporter integration and failure classification.

## Rules

- New domain primitives need law-style tests (determinism, validation edge cases, invariants).
- Tests must not depend on filesystem layout, network, or browser unless they specifically test that boundary.
- Prefer in-memory fixtures over reading files where possible.
- Test names should describe the invariant being verified, not the mechanism.
