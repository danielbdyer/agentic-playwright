---
applyTo: "generated/**/*.ts,generated/**/*.json,generated/**/*.md,lib/generated/**/*.ts"
---

# Generated artifact instructions

These files are derived outputs. Do not hand-edit them unless the task is explicitly about the generator.

Generated surfaces include:

- Playwright specs under `generated/**/*.spec.ts`
- trace artifacts under `generated/**/*.trace.json`
- QA review artifacts under `generated/**/*.review.md`
- generated type surfaces under `lib/generated/**/*.ts`

To change them, update:

- canonical knowledge in `knowledge/` or `scenarios/`
- bind or emit logic in `lib/application/`
- AST-backed generators in `lib/domain/`

Then rerun the pipeline and verify the regenerated outputs stay aligned.
