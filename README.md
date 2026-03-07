# Tesseract

Tesseract is a deterministic compiler that turns Azure DevOps manual test cases into disposable Playwright specs.

## Operating model

The repo is built around laminar grammars and derived projections:

1. `ADO snapshot -> scenario IR`
2. `ARIA baselines + SurfaceGraph -> approved screen structure`
3. `SurfaceGraph + element signatures + postures -> capability/effect model`
4. `Approved artifacts -> derived graph + generated types + generated specs`

Canonical reviewed inputs are intentionally small:

- `.ado-sync`
- `scenarios`
- `knowledge/surfaces`
- `knowledge/screens`
- `knowledge/snapshots`
- `.tesseract/evidence`

Derived artifacts live in:

- `generated`
- `.tesseract/bound`
- `.tesseract/graph`
- `lib/generated`

## Agent-first workflow

The repo is intentionally command-first. An agent should not need repo lore to refresh artifacts, inspect impacts, or discover canonical files.

### Refresh one scenario end to end

```powershell
npm run refresh
```

This runs:

1. `sync`
2. `parse`
3. `bind`
4. `emit`
5. `graph`
6. `types`

### Discover the canonical files for one scenario

```powershell
npm run paths
```

This prints the exact snapshot, scenario, bound artifact, generated spec, graph, generated-type module, and knowledge files an agent should inspect or update.

### Inspect approved surface structure and derived capabilities

```powershell
npm run surface
npm run graph
npm run trace
npm run impact
npm run types
```

These commands expose the read-oriented agent surface:

- `surface`: approved `SurfaceGraph` plus derived capabilities for one screen
- `graph`: regenerates `.tesseract/graph/index.json`
- `trace`: returns the scenario-centric subgraph for one ADO case
- `impact`: returns the impacted subgraph for one node id
- `types`: regenerates `lib/generated/tesseract-knowledge.ts`

### Individual stages

```powershell
npm run sync
npm run parse
npm run bind
npm run emit
npm run capture
```

## Architecture

- `lib/domain`: pure types, validation, graph derivation, structured references, and TypeScript AST emitters
- `lib/application`: Effect-based application services and orchestration only
- `lib/infrastructure`: file system and ADO fixture ports
- `lib/runtime`: Playwright-facing locator, interaction, data, and snapshot helpers
- `lib/infrastructure/tooling`: shell adapters such as snapshot capture
- `lib/generated`: generated type-safe knowledge surface and agent DSL

The current directory layout is still pragmatic rather than fully extracted into `domain/application/infrastructure` packages, but the dependency rule is already enforced in tests:

- domain does not depend on application, infrastructure, or runtime
- application depends on domain and application-local support modules, not infrastructure or runtime
- runtime does not depend on application or infrastructure orchestration

## SurfaceGraph

Each screen now has an approved structural artifact at `knowledge/surfaces/{screen}.surface.yaml`.

`SurfaceGraph` owns:

- section boundaries
- first-class surface ids
- surface hierarchy
- structural assertions
- the approved decomposition between ARIA capture and screen knowledge

Element signatures remain flat and reference a `surface` id. Postures remain the behavior layer and may target either elements or surfaces.

## Unit-testability bias

The codebase is intentionally split so the highest-entropy logic sits in pure functions:

- graph derivation is pure in `lib/domain/derived-graph.ts`
- capability/action collapse is pure in `lib/domain/grammar.ts`
- generated TypeScript rendering is pure and AST-backed in `lib/domain/typegen.ts` and `lib/domain/spec-codegen.ts`
- structured reference composition is centralized in `lib/domain/ref-path.ts`

The compiler shell is then limited to reading approved artifacts, validating them, and persisting projections.

## Structured references

Executable surfaces no longer rely on dotted fixture-path protocol strings at runtime. A fixture reference now lowers into a structured `RefPath` with explicit `segments`, and only the scenario parser still interprets `{{fixture.path}}` syntax from upstream IR.

Raw repository strings are also collapsed into branded domain identities at ingress. AdoId, ScreenId, ElementId, SurfaceId, PostureId, FixtureId, and SnapshotTemplateId now enter the system through validation or CLI parsing instead of flowing through the compiler as untyped strings.

## Demo slice

The seeded vertical slice uses ADO case `10001` and the `policy-search` screen.

- Source fixture: `fixtures/ado/10001.json`
- Surface graph: `knowledge/surfaces/policy-search.surface.yaml`
- Screen knowledge: `knowledge/screens/policy-search.*.yaml`
- Derived graph: `.tesseract/graph/index.json`
- Generated type surface: `lib/generated/tesseract-knowledge.ts`
- Generated spec: `generated/demo/policy-search/10001.spec.ts`

## Environment note

This machine is on Node 16. The latest Playwright ARIA snapshot APIs require Node 18+, so the repo currently uses a compatibility layer in `lib/runtime/aria.ts` for snapshot capture and comparison. The compiler, knowledge layout, and generated spec shape remain aligned with the intended architecture.





