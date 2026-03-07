---
applyTo: "knowledge/**/*.yaml,knowledge/**/*.ts,scenarios/**/*.yaml"
---

# Knowledge and scenario artifacts

These are canonical, hand-authored or agent-proposed inputs to the compiler. They are the source of truth.

## Artifact types

- `knowledge/surfaces/*.surface.yaml` — Screen decomposition into sections and surfaces.
- `knowledge/screens/*.elements.yaml` — Element definitions (role, name, testId, widget, surface membership).
- `knowledge/screens/*.postures.yaml` — Element state variations and effects.
- `knowledge/snapshots/**/*.yaml` — ARIA snapshot templates for structural assertions.
- `knowledge/components/*.ts` — Widget capability contracts (supported actions, preconditions, side effects).
- `scenarios/**/*.scenario.yaml` — Parsed ADO test cases with steps, intent, and data references.

## Rules

- Every field must be semantically meaningful. No placeholder values.
- Element `widget` fields must reference a registered widget contract in `knowledge/components/`.
- Posture effects must reference valid elements or surfaces on the same screen.
- Snapshot templates must exist at the referenced path.
- Scenario `intent` fields carry the human-readable step description from ADO — preserve them exactly.
- The `confidence` field tracks provenance: `human` > `agent-verified` > `agent-proposed` > `unbound`.

## Validation

All knowledge artifacts are validated at ingress by `lib/domain/validation.ts`. Invalid artifacts fail the compiler pipeline immediately with a `SchemaError`.
