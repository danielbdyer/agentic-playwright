---
applyTo: "knowledge/**/*.yaml,knowledge/**/*.ts,scenarios/**/*.yaml"
---

# Knowledge and scenario instructions

These files are canonical. They define the facts the compiler is allowed to trust.

## Canonical artifact types

- `knowledge/surfaces/*.surface.yaml`: screen structure and section boundaries
- `knowledge/screens/*.elements.yaml`: element identity and locator ladders
- `knowledge/screens/*.postures.yaml`: behavior partitions and effect chains
- `knowledge/screens/*.hints.yaml`: screen-local supplement layer
- `knowledge/patterns/*.yaml`: promoted shared supplement layer
- `knowledge/snapshots/**/*.yaml`: ARIA assertion templates
- `knowledge/components/*.ts`: procedural widget interpreters only
- `scenarios/**/*.scenario.yaml`: canonical scenario IR

## Governance rule

- deterministic compiler output from approved artifacts is auto-approved
- changes to these canonical files are review-gated

When in doubt, ask whether the fact should persist across future scenarios. If yes, encode it here. If no, keep it derived.

## Authoring rules

- Preserve ADO step `intent` text exactly in scenarios.
- Keep element identity separate from behavior.
- Prefer screen-local hints before promoting shared patterns.
- Promote shared patterns only when they are intentionally global or cross-screen, not because a demo or single-site proof needs a YAML file.
- Keep affordances declarative and small.
- Keep postures reusable, not scenario-specific.
- Keep snapshot aliases and locator ladders explicit.
- Keep test-only or synthetic knowledge under `tests/fixtures/`, not under `knowledge/`.

## Anti-patterns

Do not encode:

- hidden runtime scripts in YAML
- one-off scenario hacks in shared patterns
- site-specific experimental scaffolding in `knowledge/patterns/`
- test-only synthetic artifacts in `knowledge/`
- duplicate truths across hints, patterns, and elements
- placeholders that do not reflect approved knowledge
