# JSDoc Annotation Blast Radius Assessment

This document analyzes what it would take to require JSDoc annotations across the codebase,
and the scale of work involved. **This is an assessment only — no enforcement is active yet.**

## Current State

| Layer | Files | Exports | JSDoc Blocks | Files with Zero JSDoc | JSDoc Density |
| --- | --- | --- | --- | --- | --- |
| **domain** | 176 | ~1,646 | ~534 | 103 (58%) | 41% |
| **application** | 145 | ~618 | ~227 | 94 (64%) | 35% |
| **runtime** | 46 | ~193 | ~63 | 34 (73%) | 26% |
| **infrastructure** | 28 | ~90 | ~103 | 12 (42%) | 57% |
| **composition** | 6 | ~24 | ~14 | 2 (33%) | 66% |
| **playwright** | 3 | ~15 | 0 | 3 (100%) | 0% |
| **TOTAL** | **404** | **~2,586** | **~941** | **248 (61%)** | **38%** |

**Summary**: ~64% of exports across the codebase lack JSDoc annotations. 248 of 404 files (61%)
have zero JSDoc comments at all.

## What Enforcement Would Look Like

An ESLint rule like `jsdoc/require-jsdoc` could enforce JSDoc on:

- `export function` declarations
- `export const` arrow functions
- `export interface` and `export type` declarations
- `export class` declarations

**Recommended scope**: Enforce on exported symbols only — internal helpers don't need JSDoc
for agent comprehension.

## Blast Radius by Priority

### Tier 1 — Smallest blast, highest value (3 files)

The `lib/playwright/` layer has **zero JSDoc** across all 3 files (15 exports). This is the
smallest self-contained unit to bring to 100%.

### Tier 2 — High-value types (11 files)

11 type definition files in `lib/domain/types/` lack JSDoc. These are the most important files
for agent comprehension since they define the vocabulary of the entire system. Largest gap:
`learning.ts` (19 exports, 0 JSDoc).

### Tier 3 — Runtime agent logic (34 files)

The runtime layer has the lowest JSDoc density (26%). Key files like
`agent/candidate-lattice.ts` (15 exports) and `scenario.ts` (8 exports) have zero coverage.

### Tier 4 — Application orchestration (94 files)

The application layer has 94 files with zero JSDoc. Largest gap: `cli/shared.ts` (21 exports).

### Tier 5 — Domain modules (103 files)

The domain layer has the largest absolute number of undocumented files but also the highest
export count per file (9.4 average), meaning each file touched yields more documented surface.

## Well-Documented Files (Examples of Target Pattern)

These files already demonstrate the expected JSDoc style:

- `lib/application/agent-ab-testing.ts` — module-level JSDoc, per-function/interface docs
- `lib/domain/act-indicator.ts` — 94% export coverage
- `lib/domain/knowledge-freshness.ts` — 100% export coverage
- `lib/infrastructure/dashboard/journal-writer.ts` — comprehensive adapter documentation
- `lib/domain/types/dashboard.ts` — 30 JSDoc blocks across type definitions

## Worst Offenders (Largest Undocumented Surfaces)

| File | Exports | JSDoc |
| --- | --- | --- |
| `lib/application/cli/shared.ts` | 21 | 0 |
| `lib/domain/types/learning.ts` | 19 | 0 |
| `lib/runtime/agent/candidate-lattice.ts` | 15 | 0 |
| `lib/domain/types/route-knowledge.ts` | 7 | 0 |
| `lib/playwright/state-topology.ts` | 8 | 0 |

## Recommended Rollout

1. **Phase 0 (now)**: No enforcement. This assessment is the starting point.
2. **Phase 1**: Enforce JSDoc on `lib/playwright/` (3 files) and `lib/domain/types/` (11 files without JSDoc). ~14 files, ~100 exports.
3. **Phase 2**: Enforce on `lib/runtime/` (34 files needing JSDoc). ~34 files, ~130 exports.
4. **Phase 3**: Enforce on `lib/infrastructure/` and `lib/composition/` (14 files). ~14 files, ~50 exports.
5. **Phase 4**: Enforce on `lib/application/` (94 files). ~94 files, ~400 exports.
6. **Phase 5**: Enforce on `lib/domain/` root modules (103 files). ~103 files, ~1,100 exports.

**Total effort**: ~248 files, ~1,645 exports needing JSDoc annotations.

## ESLint Configuration (When Ready)

```javascript
// Add to eslint.config.cjs when enforcement begins
{
  plugins: { jsdoc: require('eslint-plugin-jsdoc') },
  rules: {
    'jsdoc/require-jsdoc': ['warn', {
      require: {
        FunctionDeclaration: true,
        ArrowFunctionExpression: true,
        ClassDeclaration: true,
      },
      contexts: [
        'ExportNamedDeclaration > TSTypeAliasDeclaration',
        'ExportNamedDeclaration > TSInterfaceDeclaration',
      ],
      checkGetters: false,
      checkSetters: false,
    }],
  },
}
```

Start with `warn` level, promote to `error` after each phase is complete.
