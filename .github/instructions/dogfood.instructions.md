# Dogfood Content Instructions

Applies to: `dogfood/**`

## Directory Structure

```
dogfood/
├── .ado-sync/          # Simulated ADO work items (intent lane)
├── scenarios/          # Test scenario definitions
│   ├── demo/           # Hand-authored demo scenarios
│   └── synthetic/      # Generated scenarios (ephemeral, safe to delete)
├── knowledge/          # Learned knowledge (tier 2)
│   ├── screens/        # Per-screen elements, hints, postures, behavior
│   ├── surfaces/       # Surface layout definitions
│   ├── patterns/       # Promoted shared patterns
│   ├── snapshots/      # ARIA snapshot templates
│   └── components/     # Widget choreography (TypeScript)
├── controls/           # Datasets, resolution controls, runbooks
├── benchmarks/         # Benchmark definitions
├── fixtures/           # Demo harness HTML/JS
└── generated/          # Compiled specs, traces, reviews (derived)
```

## Rules

1. **Scenarios** under `demo/` are hand-authored and canonical. Do not auto-generate into this directory.
2. **Synthetic scenarios** under `synthetic/` are ephemeral speedrun output. Safe to delete between runs.
3. **Knowledge files** follow the naming convention `{screen}.{type}.yaml` where type is one of: `elements`, `hints`, `postures`, `behavior`.
4. **Surface files** follow `{screen}.surface.yaml` with section and surface definitions.
5. **Snapshot templates** are YAML files containing expected ARIA tree structures.
6. **Generated output** in `dogfood/generated/` is derived — do not hand-edit.
7. **On main branch**: `dogfood/` is gitignored. The improvement loop regenerates from scratch.
8. **On training branches**: Override the gitignore so content persists between runs.
9. **Never merge** evolvable surfaces (knowledge, fixtures, generated output) back to main — only merge engine improvements.

## Adding a New Screen

To add a new screen to the dogfood domain:

1. Create `knowledge/screens/{screen}.elements.yaml` — element definitions with role, name, testId, surface, widget
2. Create `knowledge/screens/{screen}.hints.yaml` — aliases, locator ladders, default values
3. Create `knowledge/surfaces/{screen}.surface.yaml` — section and surface layout
4. Optionally create `knowledge/screens/{screen}.behavior.yaml` — state nodes, events, transitions
5. Optionally create `knowledge/screens/{screen}.postures.yaml` — posture variations
6. Add scenario YAML files under `scenarios/demo/{screen}/`
7. Add a fixture section to `fixtures/demo-harness/` if the screen needs a harness page
8. Run `npm run compile` to verify the new screen integrates with the pipeline

## ADO Sync

Files in `.ado-sync/` simulate Azure DevOps work items. Each file is a YAML document with:
- `ado_id`: unique identifier (10000-series for demo)
- `title`: test case title
- `steps`: array of step objects with `action_text` and `expected_text`

The `sync` command parses these into scenario YAML.
