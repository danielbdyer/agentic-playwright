# Code Quality Backlog

Deferred items from the dogfood clean-room review. These are real violations of the codebase's FP/Effect/DDD conventions that were noted during the suite-root restructuring but are out of scope for that branch.

## CQ1. Effect-forward translation provider interface

**File:** `lib/composition/local-runtime-scenario-runner.ts`

Both `buildCachedTranslator` and `buildDefaultTranslator` use `Effect.runPromise` inside `Effect.gen` — breaking out of the Effect pipeline to satisfy a `() => Promise<T>` interface boundary. This is not at the composition root; it's called from within an already-effectful scenario runner.

Goal:

- refactor the translator interface from `(request: TranslationRequest) => Promise<TranslationReceipt>` to `(request: TranslationRequest) => Effect.Effect<TranslationReceipt, ...>`
- integrate translation into the parent Effect pipeline so there is no `runPromise` escape hatch inside `Effect.gen`
- keep the composition root (`scenario-context.ts`, generated specs) as the only place that bridges Effect to Promise

Why it matters:

- `Effect.runPromise` inside `Effect.gen` defeats error channel tracking and makes the fiber model opaque
- the current pattern masks translation failures behind untyped promise rejections

## CQ2. Mutable accumulation in scenario generator and interface fuzzer

**Files:** `lib/application/synthesis/scenario-generator.ts`, `lib/application/synthesis/interface-fuzzer.ts`

Both files use imperative `let` + `push` accumulation patterns where the codebase conventions prefer `map`, `reduce`, `flatMap`, or recursive folds.

Specific instances:

- `generateSingleScreenScenario`: `const steps: SyntheticStep[] = []` with `steps.push(...)` and `let stepIndex`
- `generateCrossScreenScenario`: same pattern
- `scenarioToYaml`: `const lines: string[] = [...]` with `lines.push(...)` — should be `flatMap` or template literal
- `generateSyntheticScenarios`: `const files: string[] = []` accumulating in a `for` loop — should use `Effect.forEach`
- `interface-fuzzer.ts`: `events: DriftEvent[] = []` and `modifiedFiles: string[] = []` with `.push()` throughout

Goal:

- refactor accumulation to immutable pipelines
- use `Effect.forEach` / `Effect.all` for effectful collection building
- extract `hashSeed` and `createRng` (duplicated between both files) into a shared `lib/domain/random.ts` module

## CQ3. Fix `listFiles` bug in interface fuzzer

**File:** `lib/application/synthesis/interface-fuzzer.ts`, line 106

`fs.listFiles(...)` is called but `FileSystemPort` defines `listDir`, not `listFiles`. This is a latent runtime error that would surface when the fuzzer attempts to list hints files.

Goal:

- replace `fs.listFiles` with `fs.listDir`
- add a test that exercises the fuzzer's hints-file discovery path

## CQ4. Exhaustive switch on drift kind in interface fuzzer

**File:** `lib/application/synthesis/interface-fuzzer.ts`, lines 114-197

An `if`/`else if`/`else` chain discriminates on `driftKind` (`'alias-drift' | 'structure-drift' | 'phrasing-drift'`). Per coding-notes.md, discriminated unions should use exhaustive `switch` with a `default: never` assertion.

Goal:

- replace the `if` chain with `switch (driftKind)` and a `default: { const _: never = driftKind; return _; }` guard
- ensures new drift kinds added to the union cause a compile error rather than falling through silently

## CQ5. Readonly audit on pre-existing exported interfaces

**Files:** `lib/application/ports.ts`, `lib/application/cli/registry.ts`

Several pre-existing exported interfaces are missing `readonly` on their fields:

- `FileSystemPort` (7 method fields)
- `AdoSourcePort` (2 method fields)
- `ExecutionContextPort` (`posture` field)
- `CommandExecution` (5 fields including `command`, `execute`)

The branch fixed `ProjectPaths`, `RuntimeScenarioStepResult`, `LocalServiceOptions`, `LocalServiceContext`, and `RunWithLocalServicesResult`. These remaining interfaces predate the branch but should be brought into compliance.

Goal:

- add `readonly` to all exported interface fields in these files
- use `ReadonlyArray<T>` for array-typed fields in public interfaces per coding-notes.md

## CQ6. CLI flag parser mutation pattern

**File:** `lib/application/cli/registry.ts`

Every `flagReaders` entry mutates the `flags` parameter in place (`flags.all = true`). The coding notes say "Return new objects instead of mutating parameters."

Additionally, the `harvest` command mutates `execution.environment` after object construction (line ~537).

Goal:

- refactor flag readers to return new flags objects (or use a fold over tokens)
- construct command executions with environment already set, not mutated after creation
- this is a lower priority since the parser is contained and well-tested

## Priority order

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 1 | CQ3 — Fix `listFiles` bug | Small | High — latent runtime error |
| 2 | CQ4 — Exhaustive switch on drift kind | Small | Medium — type safety |
| 3 | CQ1 — Effect-forward translation | Medium | High — architectural alignment |
| 4 | CQ2 — Mutable accumulation cleanup | Medium | Medium — convention compliance |
| 5 | CQ5 — Readonly audit | Small | Medium — convention compliance |
| 6 | CQ6 — CLI parser mutation | Large | Low — contained, well-tested |
