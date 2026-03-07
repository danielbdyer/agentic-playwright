# Tesseract

Deterministic compiler: Azure DevOps manual test cases -> Playwright specs for OutSystems.

## Context routing

Read the file that matches your task:

| Task | File |
|------|------|
| Writing or modifying code | [docs/authoring.md](docs/authoring.md) |
| Understanding the product and QA workflow | [VISION.md](VISION.md) |
| Checking planned or in-progress work | [BACKLOG.md](BACKLOG.md) |

Scoped guidance is applied automatically when working in specific directories (via `.github/instructions/`):

| Scope | File |
|-------|------|
| `lib/domain/**/*.ts` | [.github/instructions/domain.instructions.md](.github/instructions/domain.instructions.md) |
| `knowledge/**`, `scenarios/**` | [.github/instructions/knowledge.instructions.md](.github/instructions/knowledge.instructions.md) |
| `tests/**` | [.github/instructions/tests.instructions.md](.github/instructions/tests.instructions.md) |
| `generated/**`, `lib/generated/**` | [.github/instructions/generated.instructions.md](.github/instructions/generated.instructions.md) |

## Essential facts

- **Canonical inputs**: `.ado-sync/`, `scenarios/`, `knowledge/`, `.tesseract/evidence/`, `.tesseract/policy/`
- **Derived outputs** (never hand-edit): `generated/`, `lib/generated/`, `.tesseract/bound/`, `.tesseract/graph/`
- **Layer rules**: domain has no deps; application depends on domain only; runtime is isolated
- **Enforced by**: `tests/architecture.spec.ts`

## CLI

```
npm run refresh    # Full recompile
npm run surface    # Inspect screen knowledge
npm run trace      # Trace scenario references
npm run impact     # Analyze change impact
npm run capture    # Re-snapshot from live page
npm run test       # Run all tests
```

## Principles

- Approved artifacts are the source of truth. Everything else is a projection.
- Generated code is disposable object code built via TypeScript AST, not string interpolation.
- Every artifact carries provenance: source, revision, content hash, confidence.
- Escape hatches feed back into the knowledge layer as pattern contracts.
- Trust policy governs what agents can promote to approved knowledge.
