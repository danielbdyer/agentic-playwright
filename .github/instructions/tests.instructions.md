---
applyTo: "tests/**/*.ts,tests/**/*.spec.ts"
---

# Test instructions

Tests in this repo protect compiler semantics, provenance, and artifact alignment.

## What new work should prove

- deterministic inference and precedence
- separation of confidence from governance
- supplement provenance through hints and patterns
- alignment across spec, trace JSON, review Markdown, and graph outputs
- runtime affordance plumbing and degraded locator signaling
- documentation vocabulary staying in sync with the implementation

## Preferences

- Favor law-style tests for pure domain logic.
- Keep filesystem and runtime boundary tests narrow and explicit.
- When adding a new artifact class, add at least one test that proves where it appears in projections.
- When changing docs or agent workflow vocabulary, add or update a smoke test so that guidance does not silently drift.
