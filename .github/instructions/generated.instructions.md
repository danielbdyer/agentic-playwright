---
applyTo: "product/generated/**/*.ts,product/generated/**/*.json,product/generated/**/*.md"
---

# Generated artifact instructions

These files are derived outputs. Do not hand-edit them unless the task is explicitly about the generator.

Generated surfaces include:

- Playwright specs under `product/generated/**/*.spec.ts`
- trace artifacts under `product/generated/**/*.trace.json`
- QA review artifacts under `product/generated/**/*.review.md`
- generated type surfaces under `product/generated/**/*.ts`

To change them, update:

- canonical knowledge in `product/catalog/` (overrides, agentic, deterministic) or fixture specifications alongside verb declarations
- bind or emit logic in `product/runtime/` and `product/instruments/codegen/`
- AST-backed generators in `product/domain/`

Then rerun the pipeline and verify the regenerated outputs stay aligned.
