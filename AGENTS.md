# Tesseract Agent Guide

This repository is an interface intelligence and agent workbench system built around a deterministic preparation pipeline, typed intervention receipts, and a governed recursive-improvement loop. Treat it that way.

## Start here

Read the doc that matches your task:

- operational overview: [README.md](README.md)
- authoritative architecture doctrine: [docs/master-architecture.md](docs/master-architecture.md)
- product model and QA workflow: [VISION.md](VISION.md)
- domain ontology and invariants: [docs/domain-ontology.md](docs/domain-ontology.md)
- authorship and knowledge design: [docs/authoring.md](docs/authoring.md)
- operator workflow and approvals: [docs/operator-handbook.md](docs/operator-handbook.md)
- planned work split by lane: [BACKLOG.md](BACKLOG.md)
- implementation coding notes: [docs/coding-notes.md](docs/coding-notes.md)
- seams, invariants, and verification: [docs/seams-and-invariants.md](docs/seams-and-invariants.md)
- code navigation (6-layer architecture): [lib/README.md](lib/README.md)
- auto-generated repo brief: [docs/agent-context.md](docs/agent-context.md) *(skip if you already read this file)*
- auto-generated module map: [docs/module-map.md](docs/module-map.md) *(or run `npm run map`)*
- auto-generated doctrine invariants: [docs/doctrine-invariants.md](docs/doctrine-invariants.md) *(consumed by compiler, not for direct reading)*

Every doc in `docs/` has a `> Status:` line after its heading — use it to decide whether to read or skip.
Historical research and assessments live in `docs/archive/` and can be ignored on first encounter.

Scoped instructions under `.github/instructions/` still apply for domain, knowledge, generated files, and tests.

The six public lanes remain the operating vocabulary. The deeper architectural spines now cut across them:

- `interface`
- `intervention`
- `improvement`

## Non-negotiable model

- Active canonical artifacts are the source of truth.
- Derived artifacts are projections.
- Deterministic compiler derivations are auto-approved.
- Certification is a designation on canon, not an execution gate.
- Generated specs are disposable object code.
- Provenance is part of correctness.

## Canonical vs derived

Canonical inputs (suite-scoped, under `dogfood/` for training or repo root for production):

Tier 1 — Problem statement (always loaded):

- `.ado-sync/`
- `benchmarks/`
- `controls/`
- `scenarios/`
- `fixtures/`
- `.tesseract/evidence/`
- `.tesseract/policy/`

Tier 2 — Learned knowledge (gated by knowledge posture):

- `knowledge/surfaces/`
- `knowledge/screens/`
- `knowledge/patterns/`
- `knowledge/snapshots/`
- `knowledge/components/`
- `knowledge/routes/`

Knowledge posture (`posture.yaml` at suite root or `--posture` CLI flag):

- `cold-start`: Tier 1 only — tests the system's ability to discover and learn from scratch.
- `warm-start`: Tier 1 + Tier 2 — tests the pipeline given pre-existing knowledge. Default.
- `production`: Same as warm-start + all output version-controlled.

Derived outputs. Do not hand-edit unless the task is specifically about the generator:

- `.tesseract/bound/`
- `.tesseract/benchmarks/`
- `.tesseract/inbox/`
- `.tesseract/interface/`
- `.tesseract/learning/`
- `.tesseract/sessions/`
- `.tesseract/tasks/`
- `.tesseract/runs/`
- `.tesseract/graph/`
- `generated/`
- `lib/generated/`

## Tracking rule: production vs dogfood

All training data — scenarios, knowledge, fixtures, controls, benchmarks, ADO sync artifacts — lives under a single `dogfood/` directory. This is the suite root.

**On main**: `dogfood/` and `lib/generated/` are gitignored. The recursive-improvement loop regenerates from scratch. Nothing it learns persists across clones.

**On training branches**: Remove or override the `dogfood/` gitignore line so content persists for continuity between runs. Never merge evolvable surfaces (knowledge, fixtures, generated output) back to main — only merge business logic improvements to the engine.

**When production arrives**: Production content lives at the repo root (or a named suite directory like `production/`) and is fully versioned. `lib/generated/` is tracked again. The `createProjectPaths(rootDir, suiteRoot)` function resolves content paths relative to the suite root, so the engine works identically with any suite location.

The `.tesseract/*` runtime engine directory is bulk-gitignored regardless of suite; only governance anchors (`trust-policy.yaml`, `scorecard.json`) survive.

**Ephemeral artifact confusion?** Read the authoritative artifact lifecycle table in [docs/recursive-self-improvement.md § Ephemeral Artifact Management](docs/recursive-self-improvement.md#ephemeral-artifact-management). TL;DR: speedrun outputs are ephemeral — only pipeline code and the scorecard persist. If you see 100+ files in `dogfood/scenarios/synthetic/`, they are safe to delete.

## Six workflow lanes

Use this vocabulary consistently:

- `intent`: `dogfood/.ado-sync/` and `dogfood/scenarios/`
- `knowledge`: `dogfood/knowledge/surfaces/`, `dogfood/knowledge/screens/`, `dogfood/knowledge/patterns/`, `dogfood/knowledge/snapshots/`
- `control`: `dogfood/controls/datasets/`, `dogfood/controls/resolution/`, `dogfood/controls/runbooks/`
- `resolution`: `.tesseract/tasks/` plus interpretation receipts
- `execution`: execution receipts and run records
- `governance/projection`: generated outputs, graph surfaces, and trust policy

Every cross-lane handoff should expose the same envelope header: `kind`, `version`, `stage`, `scope`, `ids`, `fingerprints`, `lineage`, `governance`, and `payload`.

## Governance vocabulary

Use these terms consistently:

- `confidence`: how a binding was produced
- `compiler-derived`: deterministic derivation from approved artifacts
- `intent-only`: preserved intent awaiting runtime interpretation
- `governance`: whether a bound step is executable now or needs operator follow-up
- `approved`: deterministic or already-approved path, emit and run normally
- `review-required`: the system needs operator follow-up, but this is not synonymous with uncertified canon
- `blocked`: do not execute

Do not overload confidence with review state.

## Deterministic precedence

Keep precedence concern-specific:

Resolution:

1. explicit scenario fields
2. `controls/resolution/*.resolution.yaml`
3. approved screen knowledge and screen hints
4. shared patterns
5. prior evidence or run history
6. live DOM exploration and safe degraded resolution
7. `needs-human`

Data:

1. explicit scenario override
2. runbook dataset binding
3. dataset default
4. hint default value
5. posture sample
6. generated token

Run selection:

1. CLI flags
2. runbook
3. repo defaults

If you change these precedence laws, you are changing compiler semantics. Add or update tests accordingly.

## Supplement hierarchy

Screen-local first:

- `knowledge/screens/{screen}.hints.yaml`

Promoted shared layer second:

- `knowledge/patterns/*.yaml`

Promotion rule:

- prefer local supplements for first discovery
- promote only after repetition or deliberate generalization

Do not hide novel behavior in runtime code when it can be expressed as reviewed knowledge. Human escalation is last-resort only after the agent has exhausted the non-human path.

## What belongs where

Use data when the concept is declarative:

- aliases
- locator ladders
- default value refs
- snapshot aliases
- posture vocabularies
- widget affordances

Use code when the concept is genuinely procedural:

- widget choreography in `knowledge/components/*.ts`
- interpreter/runtime orchestration
- filesystem, ADO, and reporting adapters
- AST-backed emitters

## Architectural guardrails

- `lib/domain` must stay pure and side-effect free.
- `lib/application` owns orchestration through Effect.
- `lib/runtime` executes programs and resolves locators/widgets.
- `lib/infrastructure` owns ports and adapters.

When a concept starts to cross those boundaries, model the boundary explicitly instead of leaking strings or side effects.

## Strong preferences

Read [`docs/coding-notes.md`](docs/coding-notes.md) thoroughly before writing code. It is the authoritative source for FP style, Effect patterns, design pattern vocabulary (GoF), and testability conventions. Do not deviate.

Key principles (detail and examples in coding-notes.md):

- **Functional programming**: pure functions, immutable data, `const` bindings, recursive folds over mutable accumulation, `readonly` on all exported interface fields.
- **Effect-forward orchestration**: `Effect.gen` with `yield*`, `Effect.all` for independent operations, `Effect.catchTag` over manual discrimination, no `runPromise`/`runSync` outside `lib/composition/`.
- **Design patterns**: Strategy (resolution ladder), Visitor/Fold (exhaustive case analysis), Composite (scoring rules), State Machine (convergence), Interpreter (compilation phases), Envelope (`mapPayload`).
- **Governance**: phantom branded types (`Approved<T>`, `Blocked<T>`), `foldGovernance` for exhaustive analysis, value objects over protocol strings.
- **Testing**: law-style tests for determinism, precedence, normalization, and round-trips. Provenance-rich outputs over opaque success paths.
- **Code generation**: AST-backed emission over source-string splicing. Pure derivations over parallel truth.

## Scoped guidance

Lane-specific instructions live in `.github/instructions/`:

- `domain.instructions.md` — domain modeling rules and type conventions
- `knowledge.instructions.md` — knowledge authoring and screen/surface/hint rules
- `tests.instructions.md` — test structure, naming, and property-based testing patterns
- `scripts.instructions.md` — CLI scripts, build, and automation
- `generated.instructions.md` — generated artifact handling
- `dogfood.instructions.md` — dogfood content and training data

## Review surface contract

Every meaningful change should preserve or improve these outputs:

- `generated/{suite}/{ado_id}.spec.ts`
- `generated/{suite}/{ado_id}.trace.json`
- `generated/{suite}/{ado_id}.review.md`
- `generated/{suite}/{ado_id}.proposals.json`
- `.tesseract/tasks/{ado_id}.resolution.json`
- `.tesseract/graph/index.json`

If a new workflow cannot explain itself through those artifacts, it is under-modeled.

## Agent workflow

Prefer this command sequence when orienting:

```powershell
npm run context
npm run workflow
npm run paths
npm run trace
npm run impact
npm run surface
npm run graph
npm run run
npm run types
npm test
```

An agent should be able to discover:

- which files are canonical
- which controls are active for a scenario or runbook
- which artifacts were derived
- which knowledge and prior evidence the runtime agent will receive
- which supplements were used
- where certification or operator follow-up is needed
- where the bottleneck is

without relying on repo lore.

## MCP tool workflow

When the Tesseract MCP server is connected (via `.mcp.json`), prefer MCP tools over CLI commands:

```
get_learning_summary          # Orient — first call in any session
list_proposals                # Review pending/activated proposals
activate_proposal             # Approve a specific proposal by ID
get_convergence_proof         # Check if the learning loop converges
get_fitness_metrics           # Scorecard: hit rate, precision, velocity
get_suggested_action          # Ranked next actions based on system state
start_speedrun                # Launch the improvement loop
get_loop_status               # Monitor running loop
get_queue_items               # See pending decisions
get_decision_context          # Rich context for a decision
approve_work_item             # Approve and resume fiber
suggest_hint                  # Contribute knowledge directly
get_contribution_impact       # See if contributions helped
```

### MCP fallback: direct tool bridge

If the MCP server fails to connect (common in web sessions or non-desktop environments), use the bridge script as a fallback. It calls the same tool handlers directly, bypassing stdio transport:

```bash
# Orient
npx tsx scripts/mcp-call.ts get_learning_summary

# List tools
npx tsx scripts/mcp-call.ts

# Call any tool with JSON args
npx tsx scripts/mcp-call.ts list_proposals '{"status":"activated"}'
npx tsx scripts/mcp-call.ts get_convergence_proof
npx tsx scripts/mcp-call.ts activate_proposal '{"proposalId":"abc123"}'
npx tsx scripts/mcp-call.ts get_fitness_metrics
npx tsx scripts/mcp-call.ts list_screens
npx tsx scripts/mcp-call.ts get_suggested_action
```

The bridge script (`scripts/mcp-call.ts`) supports all tools including host-mode tools like `activate_proposal` and `suggest_hint`. It reads from `.tesseract/` artifacts and writes to `dogfood/knowledge/` — the same paths the MCP server uses.

### Agent-in-the-loop: real-time proposal approval

Run the speedrun with `--mcp-decisions` so the loop pauses at iteration boundaries waiting for agent decisions. The bridge script writes decision files that the running loop picks up:

```bash
# Terminal 1: Start speedrun with MCP decision mode (pauses for agent approval)
npx tsx scripts/speedrun.ts iterate --mcp-decisions --max-iterations 4 --decision-timeout 300000

# Terminal 2 (agent): List pending work items
npx tsx scripts/mcp-call.ts get_queue_items '{"status":"pending"}'

# Terminal 2 (agent): Approve a pending proposal (resumes the paused fiber)
npx tsx scripts/mcp-call.ts approve_work_item '{"workItemId":"<id>","rationale":"Agent approved"}'

# Terminal 2 (agent): Skip a work item
npx tsx scripts/mcp-call.ts skip_work_item '{"workItemId":"<id>","rationale":"Low confidence"}'
```

The file-backed decision bridge (`lib/infrastructure/dashboard/file-decision-bridge.ts`) uses atomic temp-file + rename writes to `.tesseract/workbench/decisions/`. The running speedrun watches this directory with `fs.watch` and resumes the paused fiber when a decision arrives.

### Speedrun via CLI (when MCP start_speedrun is unavailable)

```bash
# Warm-start speedrun (uses existing knowledge)
npx tsx scripts/speedrun.ts --count 10 --max-iterations 3

# Cold-start convergence proof (wipes knowledge each trial)
npx tsx scripts/convergence-proof.ts --trials 2 --count 10 --max-iterations 4

# Diagnostic mode (no Playwright, faster)
npx tsx scripts/convergence-proof.ts --trials 2 --count 5 --max-iterations 3 --mode diagnostic
```

### Learning loop health checks

After any speedrun, verify the learning chain:

1. `get_convergence_proof` — does the loop converge? Look for `converges: true` and decreasing proposal counts.
2. `get_fitness_metrics` — is hit rate improving? `resolutionByRung` shows where steps resolve.
3. `list_proposals` — are proposals being generated AND activated? Both counts should be non-zero.
4. `get_learning_summary` — holistic view with `actionRequired` priorities.

If proposals show `generated > 0` but `activated = 0`, the activation pipeline may be broken. Check that `lib/application/activate-proposals.ts` uses `paths.suiteRoot` (not `rootDir`) for knowledge file writes.

## Trust policy boundary

Trust policy evaluates certification for canonical changes such as:

- elements
- postures
- hints
- patterns
- surfaces
- snapshot templates

Trust policy does not block compiler output that was derived from existing canon, and it does not prevent activation of schema-valid runtime-acquired canon.

## Optimization lane

DSPy, GEPA, and similar tooling are welcome in the offline evaluation lane only.

Use them for:

- ranking proposals
- tuning agent prompts
- measuring trace and evidence quality
- improving benchmark outcomes

Do not route them into the deterministic compiler core.
