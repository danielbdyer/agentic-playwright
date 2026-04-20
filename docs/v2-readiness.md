# v2.1 Readiness Pack

> Status: pre-flight execution artifacts. Read before Step 0. Sibling to `v2-transmogrification.md` — the plan doc says *what* to do; this doc says *how to walk in Monday and start doing it*.

The plan described in `v2-direction.md §6` and `v2-transmogrification.md §3` is sound at the shape level. This doc is the ground-truth preprocessing that an agent or engineer needs in order to execute without re-deriving. Each section below answers a question an executor will stumble on if it isn't preprocessed.

**Contents:**

1. [Step 0 execution playbook](#1-step-0-execution-playbook) — day-by-day order of operations for the compartmentalization commit.
2. [Seam-enforcement test design](#2-seam-enforcement-test-design) — concrete implementation choice for the cross-folder import check.
3. [Per-folder README stubs](#3-per-folder-readme-stubs) — initial content for `product/`, `workshop/`, `dashboard/`.
4. [Probe IR fixture grammar](#4-probe-ir-fixture-grammar) — draft YAML shape for `*.probe.yaml` files.
5. [Transitional probe set scope](#5-transitional-probe-set-scope) — the 5–10 v1 surfaces Step 1's inline probes exercise.
6. [Customer-reality probe checklist](#6-customer-reality-probe-checklist) — operational plan for Step 1.5.
7. [Branch + rollback strategy](#7-branch--rollback-strategy) — what branch Step 0 lands on, how rollback works.
8. [Step 0 test-import rewrite plan](#8-step-0-test-import-rewrite-plan) — concrete surface-area audit from the 2026-04-18 investigation.
9. [Reasoning port retrofit plan](#9-reasoning-port-retrofit-plan) — file-by-file migration for Step 4b.
10. [M5 cohort re-key plan](#10-m5-cohort-re-key-plan) — design for the probe-surface cohort re-key at Step 1.

---

## 1. Step 0 execution playbook

Step 0 is an atomic tree reshape: every v1 file moves from `lib/` into `product/`, `workshop/`, or `dashboard/` per §12.0 of the transmog doc. No behavior changes. The definition of done says `npm test` passes.

In practice Step 0 takes one engineer-day if executed in the right order. Here's that order.

### 1.1 Preconditions (before the commit session starts)

- [ ] §12.0 of `v2-transmogrification.md` read end-to-end. Destination for every `lib/` subfolder is clear.
- [ ] Customer-reality probe memo (Step 1.5) NOT required for Step 0 — it's parallel.
- [ ] The branch Step 0 will land on is named (see §7 of this doc for branch strategy).
- [ ] `git status` clean on working tree.
- [ ] `npm test` green on the starting baseline.
- [ ] A snapshot of the pre-Step-0 test count (267 `.spec.ts` files per §8 below) captured for post-move validation.

### 1.2 The day, in order

**Hour 0–1: Destination dry-run.**
Read `v2-transmogrification.md §12.0` line by line. For each `lib/<path>` entry, verify its destination is unambiguous. Flag any `lib/application/<x>` entries where the destination depends on a downstream monolith split (§8 audit calls these out). Produce a written move-plan document: `docs/v2-readiness-artifacts/step-0-move-plan.md` with one line per file: `<src> -> <dst>`.

**Hour 1–2: Create the folder structure.**
```bash
mkdir -p product/{domain,application,runtime,instruments,catalog,intelligence,graph,reasoning,composition,generated,tests,cli,build,logs}
mkdir -p workshop/{orchestration,metrics,scorecard,convergence,policy,ledger,probe-derivation,logs,observations}
mkdir -p dashboard/{mcp,bridges,projections}
```
Create stub `README.md` files in each top-level folder with content from §3 of this doc. Commit: `Step 0.1 — folder structure scaffolded`.

**Hour 2–3: Move files (git mv, scripted from the move-plan).**
Execute the move-plan as a shell script. Use `git mv` for every move so git tracks the rename. Do NOT edit import paths yet. Commit: `Step 0.2 — file moves (imports not yet updated; build broken)`. This commit is intentionally broken at the type-check level; the next commits fix it.

**Hour 3–4: Straightforward sed-based import rewrites.**
Per §8 of this doc, ~80% of broken imports fall into safe patterns. Apply bulk `sed` rewrites for `lib/domain/` → `product/domain/`, `lib/runtime/` → `product/runtime/`, `lib/composition/` → `product/composition/`, `lib/application/improvement/` → `workshop/`, `lib/infrastructure/mcp/` → `dashboard/mcp/`. Commit: `Step 0.3 — bulk sed rewrites (80% of imports)`.

**Hour 4–6: Per-cluster manual rewrites for `lib/application/*`.**
The ambiguous cases — `lib/application/resolution/`, `lib/application/agency/`, `lib/application/catalog/`, `lib/application/governance/` — each map to different destinations depending on the submodule. Work one submodule at a time; grep, review against §12.0, apply targeted edits, commit per cluster. Expect 4–6 small commits.

**Hour 6–7: Run `npm test`, iterate on TS2307 errors.**
Most remaining errors cluster — one missed mapping causes 10-20 errors. Fix each cluster. Expect 2–3 iterations.

**Hour 7–8: Seam-enforcement test + aggregate commit.**
Author `product/tests/architecture/seam-enforcement.laws.spec.ts` per §2 of this doc. Run it — expect it to go green because no imports cross the seam yet (the allowed list is empty pre-Step-2; enforcement rules 1 & 2 are vacuous; rule 3 is non-vacuous). Run the full test suite. All 267 tests pass. Commit: `Step 0.4 — seam-enforcement test + final green build`.

### 1.3 Risks by hour

- **Hour 2–3** (file moves): git's rename-detection threshold is ~50% similarity. If `git mv` fails to preserve history for some moves, the blame trail breaks. Mitigation: keep individual file content identical in the move commit; only change the path.
- **Hour 4–6** (ambiguous imports): easy to introduce silent miscompiles if a `from '../../lib/application/resolution/X'` gets rewritten to the wrong destination. Mitigation: for each submodule, verify the fix by running `grep "from.*<old-path>"` and confirming no matches remain before moving to the next submodule.
- **Hour 6–7** (test iteration): the temptation to "fix the tests" by editing test logic when the failure is actually an import-path bug. Mitigation: if a test's assertions changed, revert the change — the test was green before Step 0 and should be green after with only imports adjusted.

### 1.4 If Step 0 takes longer than 8 hours

Realistic reasons: (a) `lib/application/*` is more tangled than §8's estimate, (b) `npm test` surfaces real behavioral regressions (not just import errors), (c) the seam-enforcement test reveals import cycles that didn't exist before.

- (a) add a half-day. The rewrite is still tractable; more grep + review loops.
- (b) the move wasn't behavior-preserving. Stop, investigate the difference (often a `scenario-context.ts` kind of facade that resolves differently under new paths), fix, retry. This is the risk Step 0 is supposed to avoid; if it hits, the move-plan was wrong for at least one file.
- (c) expected in a couple of cases. Resolve by extracting shared types into `product/domain/` or introducing a manifest-declared public interface.

---

## 2. Seam-enforcement test design

The architecture test at `product/tests/architecture/seam-enforcement.laws.spec.ts` is the compile-time enforcement of the three-folder seam. An import from `workshop/` or `dashboard/` that reaches into `product/` (except through manifest-declared verbs) must fail the build.

### 2.1 What the test checks

The test enforces three rules:

1. **No import from `workshop/*` references a path inside `product/*` unless the path ends in `manifest.json` or a manifest-declared verb module.** After Step 2 the allowed paths are enumerated by reading `product/manifest/manifest.json`; before Step 2 the rule is vacuous (workshop doesn't import anything from product yet).
2. **No import from `dashboard/*` references a path inside `product/*` unless it goes through the same manifest-declared allowlist.** Symmetric rule.
3. **No import from `product/*` references any path inside `workshop/*` or `dashboard/*`.** Product cannot reach upstream. This rule is non-vacuous from Step 0 forward.

### 2.2 Implementation — no new library, plain test file

Use the existing test runner (node's built-in `node --test` or whatever is already in use) with `glob` + filesystem walking. No new dependency.

Sketch:
```ts
// product/tests/architecture/seam-enforcement.laws.spec.ts
import { readFileSync, existsSync } from 'node:fs';
import { glob } from 'glob';
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';

const IMPORT_REGEX = /^\s*import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/gm;
// ALSO matches: import X from '...'; import * as X from '...'; dynamic import('...')
const DYNAMIC_IMPORT_REGEX = /import\(['"]([^'"]+)['"]\)/g;

function extractImports(source: string): string[] {
  const hits: string[] = [];
  for (const m of source.matchAll(IMPORT_REGEX)) hits.push(m[1]);
  for (const m of source.matchAll(DYNAMIC_IMPORT_REGEX)) hits.push(m[1]);
  return hits;
}

function resolvesTo(importerFile: string, importSpec: string, targetFolder: string): boolean {
  // Relative imports: resolve against importerFile's directory
  // Absolute imports: check if spec starts with targetFolder/
  // Return true if the resolved path is inside targetFolder/
  // ...
}

describe('seam enforcement: import topology across the three folders', () => {
  const MANIFEST_ALLOWLIST: string[] = (() => {
    if (!existsSync('product/manifest/manifest.json')) return []; // pre-Step 2: no manifest yet
    const manifest = JSON.parse(readFileSync('product/manifest/manifest.json', 'utf8'));
    return manifest.verbs.map((v: { declaredIn: string }) => v.declaredIn);
  })();

  test('no file under workshop/ imports from product/ except through manifest verbs', async () => {
    const files = await glob('workshop/**/*.ts', { ignore: '**/*.d.ts' });
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const spec of extractImports(src)) {
        if (resolvesTo(file, spec, 'product')) {
          const allowed = MANIFEST_ALLOWLIST.some(v => resolvesTo(file, spec, v));
          assert.ok(allowed, `${file}: forbidden import of "${spec}" (not in manifest allowlist)`);
        }
      }
    }
  });

  test('no file under dashboard/ imports from product/ except through manifest verbs', async () => {
    // symmetric to above
  });

  test('no file under product/ imports from workshop/ or dashboard/', async () => {
    const files = await glob('product/**/*.ts', { ignore: '**/*.d.ts' });
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const spec of extractImports(src)) {
        assert.ok(!resolvesTo(file, spec, 'workshop'),
          `${file}: product/ cannot import from workshop/ ("${spec}")`);
        assert.ok(!resolvesTo(file, spec, 'dashboard'),
          `${file}: product/ cannot import from dashboard/ ("${spec}")`);
      }
    }
  });
});
```

### 2.3 What the test does NOT catch

- **Transitive imports through a shared module.** If `product/domain/X.ts` re-exports from `workshop/Y.ts` (which it shouldn't), the chain goes through product's public API and the test doesn't notice. Mitigation: rule 3 (no product→workshop imports) catches this at the `product/domain/X.ts` file itself.
- **Runtime `require()` calls.** Not common in a TypeScript+Effect codebase, but if a dynamic require sneaks in, the test wouldn't catch it. Mitigation: an ESLint rule banning `require()` in favor of `import()` can supplement; low priority since the existing codebase uses ESM.
- **Indirect reference via file system paths.** If workshop code reads a `product/` source file as text (e.g., to parse it for introspection), that's not an import and the test won't see it. In practice this is rare and out of scope.

### 2.4 CI integration

The test runs as part of `npm test`. No special CI configuration beyond what `npm test` already has. The test lives under `product/tests/architecture/` because architecture law 8 (the governance-verdict law) already lives there; the seam-enforcement test joins it.

**Pre-commit hook (optional):** a lightweight pre-commit hook that runs just the architecture test suite (not the full `npm test`) can catch violations before they reach CI. Implement as `.husky/pre-commit` running `node --test product/tests/architecture/*.spec.ts` if the team wants it. Not required for Step 0; can land later.

### 2.5 Bootstrap order — test first, moves second

The test goes into the repo **before** the file moves in Step 0. The sequence:

1. Commit the test (skipped or passing vacuously when folders don't exist yet).
2. Create folders.
3. Move files.
4. Fix imports.
5. Test runs green.

If we move files first and author the test after, we lose the ability to verify that the move itself didn't introduce seam violations.

---

## 3. Per-folder README stubs

The three `README.md` files land at Step 0 and become the canonical entry point for any contributor working inside that folder.

### 3.1 `product/README.md`

```markdown
# product/

The packageable core of the codebase. What ships to customers.

## Single responsibility

`product/` lets a single agent author a Playwright test suite against a customer's OutSystems application from a backlog of ADO test cases. The surface it exposes to the customer is three things:

- A **vocabulary manifest** (`product/manifest/manifest.json`) the agent reads on every session.
- A **facet catalog** (`product/catalog/`) — memory of the SUT's semantic surfaces.
- **QA-legible tests** in Playwright that reference facets by name.

## What lives here

- `product/domain/` — pure, side-effect-free domain types (envelope-axis substrate, governance brands, fingerprints, handshake shapes).
- `product/application/` — Effect programs orchestrating domain types.
- `product/runtime/` — executes Effect programs against the live SUT.
- `product/instruments/` — adapters (ADO, Playwright, codegen, Reasoning port adapters, handshake bridges).
- `product/catalog/` — facet catalog YAML + confidence derivation + evidence log.
- `product/manifest/` — manifest generator + fluency test harness.
- `product/intelligence/` — interface-graph + selector-canon + state-transition projections.
- `product/graph/` — graph builder + conditional-edge composition + evidence-lineage.
- `product/reasoning/` — the unified Reasoning port with adapters.
- `product/composition/` — AppLayer + entry point.
- `product/logs/` — append-only logs (evidence, drift).
- `product/tests/` — tests for product code, including architecture tests.
- `product/cli/` — customer-facing CLI (`author`, `evaluate`, etc.).
- `product/build/` — build-time scripts (manifest generator, drift check).
- `product/generated/` — emitted test artifacts (not hand-edited).

## What this folder cannot do

- It cannot import anything from `workshop/` or `dashboard/`. The seam-enforcement test fails the build on violations.
- It cannot ship to a customer with `workshop/` infrastructure coupled to it. `product/` graduates as a standalone npm package when its shipping-claim curve sustains (see `v2-transmogrification.md §6.2`).

## When working here

Read `docs/v2-direction.md §1` and `docs/coding-notes.md` before touching code. If your change adds a new verb, new handshake, or new level, walk the full descent protocol in `docs/v2-transmogrification.md §11`. If your change is local (bug fix, refactor, test), apply the light discipline in §11.4a.
```

### 3.2 `workshop/README.md`

```markdown
# workshop/

The measurement consumer. Reads `product/`'s manifest; derives probes; runs them through `product/`'s normal authoring flow; produces metrics, scorecards, receipts.

## Single responsibility

`workshop/` answers "is `product/` getting better?" It does this by:

1. Reading `product/manifest/manifest.json` to learn what verbs, facet kinds, and error families `product/` declares.
2. Synthesizing probes (per-verb fixture + manifest → `Probe[]`) under `workshop/probe-derivation/`.
3. Running those probes through `product/`'s normal authoring flow.
4. Computing metrics over the run-record log.
5. Appending scorecard entries, hypothesis receipts, and verification receipts to its append-only logs.

`workshop/` is a first-class observer sibling to `product/`, not a dependent. It does not ship to customers. It puts itself out of a job when probe coverage = 100% and the batting average sustains above its floor (see `v2-transmogrification.md §6.3`).

## What lives here

- `workshop/orchestration/` — the speedrun four-verb pipeline (`corpus`, `iterate`, `fitness`, `score`, `baseline`).
- `workshop/metrics/` — the seven-visitor metric tree (audit in `docs/v2-substrate.md §8a`).
- `workshop/scorecard/` — scorecard JSON + history.
- `workshop/convergence/` — the hylomorphic convergence-proof harness.
- `workshop/policy/` — trust-policy YAML + evaluator.
- `workshop/ledger/` — improvement ledger (v1 name; may be retired as probe receipts replace it).
- `workshop/probe-derivation/` — the manifest→probe module (+ `transitional.ts` for Step 1's pre-manifest stopgap).
- `workshop/logs/` — receipts, metric-compute records, evaluation summaries.
- `workshop/observations/` — customer-reality probe memos and other durable human observations.

## What this folder can and cannot do

- Can read `product/manifest/manifest.json` and the shared append-only log set.
- Can declare metric verbs in the manifest (subject to the manifest's frozen-signature discipline).
- **Cannot import any `product/` internal type** except those exported via manifest-declared verbs and public domain types. The seam-enforcement test catches violations.
- Cannot write to `product/`'s catalog, logs, or generated artifacts. All effects on `product/` go through proposal-gated reversibility (see `v2-transmogrification.md §6`).

## When working here

Read `docs/v2-direction.md §5` (measurement substrate) and `docs/v2-substrate.md §7 + §8a` (measurement stance + per-visitor audit). New metric verbs go through the same proposal-gated discipline as any other manifest addition.
```

### 3.3 `dashboard/README.md`

```markdown
# dashboard/

The read-only observer. Projects both `product/` and `workshop/` into a human view through manifest-declared verbs. Writes nothing.

## Single responsibility

`dashboard/` answers "what's the state of the system right now?" — for humans. It renders:

- The proposal queue (pending / approved / rejected).
- The scorecard trend + graduation-curve progress.
- The receipt log (hypothesis vs. actual-delta).
- The drift event log.
- The suggested-action ranking (what's the most useful next move?).

`dashboard/` writes nothing to either `product/` or `workshop/`. Every dashboard-initiated action (approve a proposal, resolve a handoff) routes through a manifest-declared verb that product or workshop owns; the dashboard's role is to surface the action, not to perform it.

## What lives here

- `dashboard/mcp/` — MCP server surface. Tool implementations route through manifest-declared verbs (not direct imports from product).
- `dashboard/bridges/` — file-backed decision-bridge watcher (cross-process transport for agent decisions).
- `dashboard/projections/` — static read-only views (HTML, CLI tables, whatever rendering the team adds).

## What this folder can and cannot do

- Can read `product/manifest/manifest.json` and the shared append-only log set.
- Can read scorecard JSON, receipt logs, drift logs, proposal logs.
- **Cannot import any `product/` or `workshop/` internal type** except those exported via manifest-declared verbs. The seam-enforcement test catches violations.
- Cannot write back to product's catalog, workshop's scorecard, or any append-only log.

## When working here

Every tool handler is a thin projection over a manifest-declared verb. If you need data the manifest doesn't expose, the fix is to declare a new verb in `product/` or `workshop/`, not to reach into their internals. Dashboards are eyes, not hands.
```

---



Step 0 is an atomic tree reshape: every v1 file moves from `lib/` into `product/`, `workshop/`, or `dashboard/` per §12.0 of the transmog doc. No behavior changes. The definition of done says `npm test` passes.

In practice Step 0 takes one engineer-day if executed in the right order. Here's that order.

### 1.1 Preconditions (before the commit session starts)

- [ ] §12.0 of `v2-transmogrification.md` read end-to-end. Destination for every `lib/` subfolder is clear.
- [ ] Customer-reality probe memo (Step 1.5) NOT required for Step 0 — it's parallel.
- [ ] The branch Step 0 will land on is named: `claude/step-0-compartmentalization` off current `main` (or the equivalent per §7 below).
- [ ] `git status` clean on working tree.
- [ ] `npm test` green on the starting baseline.
- [ ] A snapshot of the pre-Step-0 test count (should be 267 `.spec.ts` files per §8 below) captured for post-move validation.

### 1.2 The day, in order

**Hour 0–1: Destination dry-run.**
Read `v2-transmogrification.md §12.0` line by line. For each `lib/<path>` entry, verify its destination is unambiguous. Flag any `lib/application/<x>` entries where the destination depends on a downstream monolith split (§8 audit calls these out) — those moves may land at Step 4a, not Step 0. Produce a written move-plan document: `docs/v2-readiness-artifacts/step-0-move-plan.md` with one line per file: `<src> -> <dst>`.

**Hour 1–2: Create the folder structure.**
```bash
mkdir -p product/{domain,application,runtime,instruments,catalog,intelligence,graph,reasoning,composition,generated,tests,cli,build,logs}
mkdir -p workshop/{orchestration,metrics,scorecard,convergence,policy,ledger,probe-derivation,logs}
mkdir -p dashboard/{mcp,bridges,projections}
```

Create stub `README.md` files in each top-level folder with content from §3 of this doc. Commit: `Step 0.1 — folder structure scaffolded`.

**Hour 2–3: Move files (git mv, scripted from the move-plan).**
Execute the move-plan as a shell script. Use `git mv` for every move so git tracks the rename. Do NOT edit import paths yet. Commit: `Step 0.2 — file moves (imports not yet updated; build broken)`. This commit is intentionally broken at the type-check level; the next commits fix it.

**Hour 3–4: Straightforward sed-based import rewrites.**
Per §8 of this doc, ~80% of broken imports fall into safe patterns:
```bash
# product/ destinations
find . -name "*.ts" -not -path "./node_modules/*" | xargs sed -i \
  -e "s|from '\\(.*\\)\\.\\./lib/domain/|from '\\1../product/domain/|g" \
  -e "s|from '\\(.*\\)\\.\\./lib/runtime/|from '\\1../product/runtime/|g" \
  -e "s|from '\\(.*\\)\\.\\./lib/composition/|from '\\1../product/composition/|g" \
  -e "s|from '\\(.*\\)\\.\\./lib/playwright/|from '\\1../product/instruments/observation/|g"

# workshop/ destinations
find . -name "*.ts" -not -path "./node_modules/*" | xargs sed -i \
  -e "s|from '\\(.*\\)\\.\\./lib/application/improvement/|from '\\1../workshop/|g"

# dashboard/ destinations
find . -name "*.ts" -not -path "./node_modules/*" | xargs sed -i \
  -e "s|from '\\(.*\\)\\.\\./lib/infrastructure/mcp/|from '\\1../dashboard/mcp/|g"
```
Commit: `Step 0.3 — bulk sed rewrites (80% of imports)`.

**Hour 4–6: Per-cluster manual rewrites for `lib/application/*`.**
The ambiguous cases (per §8) — `lib/application/resolution/`, `lib/application/agency/`, `lib/application/catalog/`, `lib/application/governance/` — each map to different destinations depending on the submodule. Work one submodule at a time:
```bash
# Find all tests/source that import from the submodule
grep -rn "from.*lib/application/resolution/" --include="*.ts"
# Review the destination per §12.0, apply targeted sed or manual edit
# Commit per cluster
```
Expect 4–6 small commits in this window. Each commit is bounded to one `lib/application/*` submodule.

**Hour 6–7: Run `npm test`, iterate on TS2307 errors.**
Most remaining errors cluster — one missed mapping causes 10-20 errors. Fix each cluster. Expect 2–3 iterations. Commit each cluster's fix separately so the git log reads as a sequence of "fix imports in <module>" commits.

**Hour 7–8: Seam-enforcement test + aggregate commit.**
Author `product/tests/architecture/seam-enforcement.laws.spec.ts` per §2 of this doc. Run it — expect it to go green because the only imports from `workshop/` or `dashboard/` that reach `product/` should be through manifest-declared verbs (which don't exist yet at Step 0; the test passes vacuously until Step 2 lands the manifest).

Run the full test suite one final time. All 267 tests should pass. Commit: `Step 0.4 — seam-enforcement test + final green build`.

Squash-merge (or not, per §7) onto `main`.

### 1.3 Risks by hour

- **Hour 2–3** (file moves): git's rename-detection threshold is ~50% similarity. If `git mv` fails to preserve history for some moves, the blame trail breaks for those files. Mitigation: keep individual file content identical in the move commit; only change the path.
- **Hour 4–6** (ambiguous imports): easy to introduce silent miscompiles if a `from '../../lib/application/resolution/X'` gets rewritten to the wrong destination. Mitigation: for each submodule, verify the fix by running `grep "from.*<old-path>"` and confirming no matches remain before moving to the next submodule.
- **Hour 6–7** (test iteration): the temptation to "fix the tests" by editing test logic when the failure is actually an import-path bug. Mitigation: if a test's assertions changed, revert the change — the test was green before Step 0 and should be green after with only imports adjusted.

### 1.4 If Step 0 takes longer than 8 hours

Realistic reasons: (a) `lib/application/*` is more tangled than §8's estimate, (b) `npm test` surfaces real behavioral regressions (not just import errors), (c) the seam-enforcement test reveals import cycles that didn't exist before. For each:

- (a): add a half-day to the estimate. The rewrite is still tractable; it's just more grep + review loops.
- (b): this means the move wasn't behavior-preserving. Stop, investigate, find the difference (often a `scenario-context.ts` kind of facade that resolves differently under the new paths), fix, retry. This is the risk Step 0 is supposed to avoid; if it hits, it means the move-plan was wrong for at least one file.
- (c): expected in a couple of cases. Resolve by extracting shared types into `product/domain/` or by introducing a manifest-declared public interface for the type.

---

## 4. Probe IR fixture grammar

The probe IR derives probes from `product/manifest/manifest.json` plus per-verb fixture specifications. The fixture spec is a small YAML file living alongside the verb declaration. The grammar below is the **draft** that Step 5's spike validates; Step 5's definition of done either accepts this grammar or names the shape gaps.

### 4.1 Fixture specification shape

```yaml
# product/instruments/observation/observe.probe.yaml
verb: observe
schemaVersion: 1

fixtures:
  - name: simple-element-on-customer-home
    description: |
      Observe a visible element on a known customer-home surface.
      Exercises the role-first locator ladder's top rung.
    input:
      surface:
        screen: customer-home
        facet-kind: element
      target:
        role: button
        name: "Save"
    expected:
      classification: matched
      error-family: null
    exercises:
      - rung: role
      - error-family: null

  - name: not-visible-on-disabled-surface
    description: |
      Observation should fail with not-visible when the target is hidden.
    input:
      surface:
        screen: customer-home
        facet-kind: element
      target:
        role: button
        name: "Advanced Options"
      world-setup:
        hide-target: true
    expected:
      classification: failed
      error-family: not-visible
    exercises:
      - error-family: not-visible
```

### 4.2 Required and optional fields

- `verb` (required) — must match a verb declared in `product/manifest/manifest.json`. The manifest build-time check validates this.
- `schemaVersion` (required) — currently `1`. Bumped when the fixture-spec grammar changes in a non-additive way.
- `fixtures[]` (required, ≥1 entry) — the list of named probe seeds for this verb.
- `fixtures[].name` (required) — slug unique within this file; composed probe ID is `probe:<verb>:<fixture-name>`.
- `fixtures[].description` (required) — prose explaining what the fixture exercises. Read by humans reviewing coverage; read by the agent to understand intent.
- `fixtures[].input` (required) — the parsed-intent shape the verb expects. Validated against the verb's declared input schema in the manifest at probe-derivation time.
- `fixtures[].world-setup` (optional) — pre-conditions the probe expects before the verb runs. In Step 5's spike this may be omitted; later, it hooks into fixture-app state.
- `fixtures[].expected.classification` — `matched | failed | ambiguous`.
- `fixtures[].expected.error-family` — one of the named error families, or `null` for success paths.
- `fixtures[].exercises[]` (optional, recommended) — tags for coverage reporting. Used by the workshop's probe-coverage metric.

### 4.3 Co-location discipline

Fixtures live next to their verb declaration:
- `product/instruments/observation/observe.ts` — the verb declaration.
- `product/instruments/observation/observe.probe.yaml` — the fixture spec.

Every new-verb PR is expected to ship its fixture spec alongside the declaration. The pre-commit checklist in `v2-transmogrification.md §11.4a` names this: "If the PR adds a capability (new verb), it ships a fixture spec or explicitly flags why a fixture is deferred."

### 4.4 Unfixturable verbs

Some verbs are hard to fixture mechanically — e.g., `Reasoning.synthesize` against an open-ended prompt. For these, the fixture spec declares `synthetic-input: true` and the workshop skips probe synthesis for that verb. Unfixturable verbs appear in the coverage report under a distinct "unfixturable" bucket; they don't count against the "100% coverage" graduation gate, but they count as a risk surface in §5.3 cascade risks.

---

## 5. Transitional probe set scope

Step 1 commits `workshop/probe-derivation/transitional.ts` — an inline-encoded probe set that bridges the dogfood retirement (Step 1) and the manifest-derived probe IR (Step 5). It exists so the workshop's scorecard doesn't go dark for the four-to-six-week Phase 2 window.

### 5.1 Seven probes covering v1's running surfaces

| # | Surface probed | Verb (pre-manifest) | Facet-kind | Error-family | Expected classification |
|---|---|---|---|---|---|
| 1 | Known customer-home button observation | observe | element | null | matched |
| 2 | Account-detail state observation | observe | state | null | matched |
| 3 | Hidden-target observation | observe | element | not-visible | failed |
| 4 | Navigate to policy-search URL | navigate | route | null | matched |
| 5 | Facet query by intent phrase | facet-query | element | null | matched |
| 6 | Test-compose of simple 3-step work item | test-compose | element | null | matched |
| 7 | Drift emit on changed name attribute | drift-emit | element | name-changed | matched (drift event emitted) |

### 5.2 Why these seven

- Cover all four facet-kinds (element, state, route, with vocabulary implicit in probe 7's drift classification).
- Cover the primary error families v1's visitors care about (not-visible at least once; name-changed drift at least once).
- Cover verbs v1 already has running code for — no probes reference yet-to-be-built verbs.
- Stay under 10 so the transitional set is a bridging asset, not a parallel corpus.

### 5.3 Retirement at Step 5

When the real probe IR lands at Step 5, the transitional set is deleted in the same commit that lands the first three verb fixture YAMLs. Commit message: *"Step 5: retire transitional probe set; manifest-derived probes take over for observe, test-compose, facet-query."* The scorecard history shows a labeled transition at this boundary (alongside the Step 1 transition).

---

## 6. Customer-reality probe checklist

Step 1.5 authors one real customer work item through v1's existing pipeline and banks the observation. This section names the operational details.

### 6.1 Preconditions

- [ ] Customer ADO tenant access configured (PAT, tenant URL, project).
- [ ] Customer OutSystems application reachable from the dev environment (URL, test-user credentials).
- [ ] Customer QA reviewer identified — a human who will look at the emitted test and give an acceptance verdict.
- [ ] v1's pipeline (`npx tsx scripts/speedrun.ts iterate --source=ado:<id>`) is known to run against the customer's tenant.

### 6.2 Session protocol

One session, roughly 90 minutes to 3 hours:

1. **Select the work item.** Pick an ADO item of moderate complexity — not the simplest, not the hardest. 3–6 steps, uses one or two surfaces the customer team treats as routine. Log the ADO ID.
2. **Agent session.** The agent runs v1's authoring flow against that work item. The full session transcript is captured under `workshop/observations/customer-probe-01/session-transcript.md` (or `.jsonl` if the agent harness emits structured events).
3. **Run record.** The emitted test executes or attempts to; the run record is captured under `workshop/observations/customer-probe-01/run-record.json`.
4. **QA review.** The customer QA reviewer reads the emitted test. Their verdict (accept / reject + rationale) is captured in `workshop/observations/customer-probe-01/qa-verdict.md`.
5. **Observation memo.** A team member (or the agent, or both together) reads all three artifacts and authors `workshop/observations/customer-probe-01/memo.md` — see §6.3 for the shape.

### 6.3 The observation memo

The memo is the artifact that feeds Phase 2 design. It's short (1–2 pages) and structured:

```markdown
# Customer-reality probe — observation memo

**Date:** YYYY-MM-DD
**Work item:** ADO #<id> — <title>
**Complexity:** <3-6 steps / surfaces exercised>
**Outcome:** <accepted / rejected / partially accepted>

## What the agent did well

- <concrete bullet, e.g., "resolved the 'Save' affordance via role-first ladder on the first try">

## What the agent struggled with

- <concrete bullet, e.g., "the customer's 'suspend account' button uses a role v1's ladder doesn't know; took 3 Reasoning-port retries">

## Named design constraints for Phase 2

### For Step 3 facet schema
- <e.g., "customer uses a role value 'link-button' that we don't currently anticipate; the schema's `role` field should be a string, not an enum">

### For Step 4a monolith splits
- <e.g., "the customer's 'suspend account' state has a 24-hour lag we observe twice but don't catch in the state graph; `derived-graph.ts` split should keep state-lag as a first-class concern">

### For Step 4b L0 shape adjustments
- <e.g., "the four-family error classification handled the failures we saw; no named gaps here">

### For Step 4c dashboard
- <e.g., "the customer's operator would want to see 'which Reasoning provider made this decision' — the MCP tool surface should expose it">

### For Step 5 probe IR
- <e.g., "the customer's domain has at least 12 distinct verb-ish surfaces; the spike's three representative verbs should include one like 'suspend account'">

## What we verified (no material surprises)

- <bullets for things that worked as the plan expected — these are signals the plan's forcing functions are correctly specified>

## What we deferred

- <bullets for things we noticed but don't need to design around until later>
```

### 6.4 If the probe can't be run (no customer contracted)

Per `v2-transmogrification.md §6.0`, if no customer is contracted when Phase 2 starts, the alternatives are:

- **Sibling-team proxy.** Another team inside the organization acts as a customer stand-in. Same protocol; "customer" becomes "sibling team."
- **Synthetic acceptance proxy.** A hand-curated "golden set" of work items with known-good expected output. Weaker than real QA but useful at very-early Phase 2.

Name the proxy in the memo (`Complexity` line above becomes e.g., "sibling-team proxy, 5 steps") so the memo's constraints are readable under the right assumption.

---

## 7. Branch + rollback strategy

Step 0 is one atomic reshape. Even when executed methodically (§1), the risk of a partially-broken commit is non-zero. This section names the branch strategy and the rollback mechanics.

### 7.1 Branch strategy

**Step 0 lands on its own feature branch.** Create `claude/step-0-compartmentalization` off current `main` at the start of the Step 0 session. The day's work lands as a sequence of ~6–8 small commits (per §1.2 of this doc); the final commit on the branch is `Step 0.4 — seam-enforcement test + final green build` with `npm test` green.

Merge to `main` via PR. The PR description carries the move-plan artifact link and a short narrative of what was moved where; the reviewer's checklist is:

- [ ] `npm run build` and `npm test` green on the PR branch.
- [ ] Seam-enforcement test runs green.
- [ ] `git diff main..HEAD --stat` shows only file moves + import-path edits (no semantic changes).
- [ ] The move-plan artifact exists under `docs/v2-readiness-artifacts/step-0-move-plan.md` and matches the diff.

**Why a feature branch and not direct-to-main:** Step 0 is a 500+ file reshape. Direct-to-main is reckless. A feature branch gives one-shot reviewability and a clean revert path.

**Why merge as-is (not squash) is preferred:** the 6–8 small commits tell the story of the day. Squashing compresses that into one diff that's harder to bisect later. Individual revert-able commits are worth keeping.

### 7.2 Subsequent steps land per-step on their own branches

- Step 1 lands on `claude/step-1-reference-canon-retirement`.
- Step 1.5 observation memo lands on `claude/step-1.5-customer-reality-probe` (may be a short-lived branch since it's documentation, not code).
- Step 2 on `claude/step-2-manifest-fluency`.
- etc.

Each merges to `main` when its DoD is satisfied. Phase-level DoD checks (§7 of the transmog doc) happen as the last step in a phase merges.

### 7.3 Rollback — Step 0 specifically

If Step 0 lands on main and a regression is discovered post-merge, the rollback is a git revert of the entire merge commit:

```bash
git revert -m 1 <merge-commit-sha>
```

This restores `lib/` and deletes `product/` / `workshop/` / `dashboard/`. All subsequent commits that depend on the new structure break, but at Step 0 there are no dependents yet — this is the cheapest rollback in the plan.

**Why Step 0 is the cheapest rollback point:** no Phase 2 work has landed. No customer ship has happened. No probes have been defined against the new folder layout. The only thing that changes under revert is paths; no behavior was changing anyway.

### 7.4 Rollback — later steps

For Step 1 through Step 4c, revert-per-commit is also cheap because each step is bounded. The risk rises at Step 5 (probe IR) and beyond because the workshop's measurement input shifts; reverting Step 5 may leave the workshop with no probe set to run. Mitigation: Step 5's commit sequence (§3 Step 5 in the transmog doc) should land the new IR in the same commit that retires the transitional probes, so revert is a single operation.

### 7.5 The pre-Step-0 rollback — reverting to "no reshape started"

This is a trivially safe state and always reachable by checking out `main` at the pre-Step-0 SHA. Tag `pre-compartmentalization` at that SHA as the Step 0 session starts so the rollback target is stable.

---

## 8. Step 0 test-import rewrite plan

Audit conducted 2026-04-18. Full surface area mapped. This section incorporates the concrete findings so a Step 0 executor can walk in with a plan, not an estimate.

### 8.1 Surface area

- **267 `.spec.ts` files** across `tests/`. No `.test.ts` files.
- **~56,913 lines of test code** total.
- **227 of 267 test files (85%) have at least one `lib/` import.** The remaining 40 files are self-contained (fixture-only, no production-code imports).
- **No path-alias imports.** `tsconfig.json` has no `paths:` section; all imports are relative.

### 8.2 Import distribution

| Source `lib/` folder | Import count | Destination |
|---|---:|---|
| `lib/domain/` | 523 | `product/domain/` (straightforward) |
| `lib/application/` | 209 | **mixed** — `product/` or `workshop/` or `dashboard/` per submodule |
| `lib/runtime/` | 46 | `product/runtime/` |
| `lib/infrastructure/` | 31 | split — MCP → `dashboard/`, other → `product/` |
| `lib/composition/` | 25 | `product/composition/` |
| `lib/playwright/` | 1 | `product/instruments/observation/` |
| `lib/generated/` | 1 | `product/generated/` |

### 8.3 Effort breakdown

| Task | Estimate | Notes |
|------|---|---|
| Move files (git mv) + folder structure | 0.5 h | automated; per §12.0 |
| Bulk sed rewrites (domain/, runtime/, composition/) | 1 h | ~380 imports; one regex pass |
| `lib/application/*` disambiguation + rewrite | 3–4 h | grep + review + per-cluster edit |
| `lib/infrastructure/*` split rewrites | 1 h | mainly MCP + file-bridge cases |
| `npm test` iteration, TS2307 fixes | 1–2 h | 2–3 rounds typical |
| Seam-enforcement test tuning | 0.5 h | new tsconfig paths, architecture law config |
| **Total** | **6–8 hours (1 engineer-day)** | |

### 8.4 High-burden test files (15+ imports)

Nine test files will need concentrated attention:

| File | Import count | Destinations spanned |
|---|---:|---|
| `compiler-pipeline.spec.ts` | 20 | product + workshop |
| `validator-registry-characterization.spec.ts` | 13 | product |
| `domain.spec.ts` | 13 | product |
| `canon-source-phantom.laws.spec.ts` | 13 | product |
| `pipeline-domain.laws.spec.ts` | 12 | product |
| `pipeline-application.laws.spec.ts` | 12 | product + workshop |
| `execution-stages.spec.ts` | 11 | product |
| `canon-decomposition.laws.spec.ts` | 11 | product |
| `compiler-intelligence.spec.ts` | 10 | product |

`compiler-pipeline.spec.ts` is the largest cross-folder reference — it imports from improvement/ (→ workshop) *and* graph/ (→ product/graph) *and* agency/ (→ product/application). This one gets reviewed by a human; the sed pass won't catch it correctly.

### 8.5 Risk summary

- **Highest risk:** `lib/application/resolution/*` ambiguity. Some paths map to `product/reasoning/`, some to `product/runtime/resolution/`, some to `product/application/`. Cross-check every import against §12.0 before moving files; move the whole folder as one unit.
- **Medium risk:** tests with cross-folder logic (like `compiler-pipeline.spec.ts`) will need imports from both `product/` and `workshop/`. Sed handles this correctly if each pattern targets one destination, but the post-move test failure has to be diagnosed carefully — what looks like "broken import" might be "correct import of a type that moved to a different destination than expected."
- **Low risk:** barrel exports (`lib/domain/index.ts` style). Tests importing through intermediate barrels need verification but rarely fail silently; the compiler catches them.

### 8.6 Recommended path (from the audit)

1. Read §12.0 entirely (1 hour). Mark each `lib/application/*` submodule with its Step 0 destination in a scratch file.
2. Stage files for move in git; verify the move list against §12.0 (0.5 hours).
3. Execute git mv per §12.0, scripted (0.5 hours).
4. Apply sed substitutions for domain/, runtime/, composition/ (1 hour).
5. Group `lib/application/*` imports by test file; apply manual updates per-cluster (3–4 hours; parallelizable if two engineers available).
6. `npm test`; iterate on TS2307 errors (1–2 hours).
7. Verify seam-enforcement test (0.5 hours).

**Do not parallelize file moves with test runs.** Move files first, rewrite imports second, validate once.

---

## 9. Reasoning port retrofit plan

Investigation conducted 2026-04-18. This section is the concrete file-level plan for Step 4b's Reasoning port consolidation.

### 9.1 What collapses into what

v1 has **two proto-Reasoning ports**: `TranslationProvider` (Rung 5, structured-translation) and `AgentInterpreter` (Rung 9, agent judgment). They follow identical patterns — strategy interface + Effect monad + callback DI + deterministic fallback + composite hybrid. Zero direct SDK imports. The ports collapse into one `Reasoning.Tag` with three operations:

- `select(SelectRequest) → SelectedCandidate` — from Translation's structured-match role.
- `interpret(InterpretRequest) → StructuredIntent` — from AgentInterpreter's rung-9 role.
- `synthesize(SynthesisRequest) → StructuredOutput` — new, for forward extensions; initially no-op.

### 9.2 LOC estimate (refined from the audit)

| Component | LOC |
|---|---:|
| Port declaration (unified interface) | 40 |
| Unified receipt (`ReasoningReceipt<Op>` generic) | 80 |
| Error union (5 families: rate-limited / context-exceeded / malformed-response / unavailable / unclassified) | 60 |
| Adapter refactor (deterministic / llm-api / session / heuristic / timeout / composite) | 320 |
| Callsite migrations (~5 files, all mechanical) | 15 |
| Cleanup + deprecation markers | 10 |
| **Total** | **~515** |

The earlier audit's "~320 LOC" was adapter code only. Full consolidation including types, errors, and callsites is ~515 LOC.

### 9.3 Callsites (all mechanical)

Five callsites migrate with simple renames:

1. `lib/composition/local-runtime-scenario-runner.ts:46` — `provider.translate(request)` → `provider.select(request)`.
2. `lib/composition/local-runtime-scenario-runner.ts:133` — resolver bridge update.
3. `lib/runtime/resolution/resolution-stages.ts` (rung 9 dispatch) — `agentInterpreter.interpret(...)` → `reasoningInterpreter.interpret(...)` (method name unchanged, context tag changes).
4. `lib/composition/local-services.ts` — dependency injection update.
5. `lib/infrastructure/runtime/local-runtime-environment.ts` — bridge function signature.

**Zero logic rewrites.** Every callsite already routes through the strategy interface. The migration is pure renaming.

### 9.4 Commit sequence for Step 4b (five commits)

1. **4b.1: Port declaration + types** (~80 LOC). Create `product/reasoning/reasoning.ts`. Add generic `ReasoningReceipt<Op>`. No runtime changes.
2. **4b.2: Error union consolidation** (~60 LOC). Merge the two error hierarchies into one five-family `ReasoningError` discriminated union. Legacy error classes stay as live throwables through the composite-bridge window; they are not deprecated aliases (per `docs/coding-notes.md §17–26`: no deprecated-alias window — either actively in use or deleted).
3. **4b.3: Adapter extraction** (~320 LOC). Move adapter factories into `product/reasoning/adapters/`. Merge retry logic from Translation + AgentInterpreter. Golden tests verify each adapter produces identical output to pre-move.
4. **4b.4: Callsite migrations** (~15 LOC). Rename `provider.translate` → `provider.select`, update imports. Pure diff; zero logic change. Regression test: run full resolution pipeline, verify receipts match.
5. **4b.5: Documentation** (~10 LOC). CLAUDE.md Reasoning-port doctrine + retirement-path commentary. No `@deprecated` markers anywhere (per `docs/coding-notes.md §17–26`). The v1 interfaces survive this commit as live dependencies of the composite adapter; their actual retirement is a future deletion commit that migrates their factory logic into direct adapters.

Each commit has green tests before the next starts. If any commit fails CI, revert individually.

### 9.5 Risk surface — low

- **Zero direct SDK imports.** Audit verified no `anthropic`, `openai`, or direct HTTP calls to LLM providers exist outside the provider abstraction. The "no direct SDK imports" claim holds.
- **All callsites route through strategy interfaces.** No bypass paths. No hidden LLM calls that would need to migrate.
- **Backward compat is achievable.** Deprecated aliases let external consumers (if any) migrate on their own schedule.

Concrete diff example for `local-runtime-scenario-runner.ts` migration is in the audit output; the PR author can lift it directly.

### 9.6 Provider choice and design principles

Set by the project owner 2026-04-19. The Reasoning port supports multiple adapters; the ordering below is the expected provisioning priority, not a constraint on what the port can hold.

**Primary adapter: VSCode GitHub Copilot (VSCode extension surface).** Strong preference. Most agent cognition flows through Copilot when v2 runs inside the editor. The `copilot-live` adapter under `product/reasoning/adapters/` is the first-citizen implementation. Its ergonomics (in-editor interaction, no separate process, no API-key management in production usage) are what the agent experience optimizes for.

**Secondary adapter: Azure AI Foundry → OpenAI models (o3, GPT-4o).** Medium confidence. Serves the programmatic and synchronous integration lane — batch evaluations, CI-driven probe runs, the workshop's metric-compute passes, anything that needs deterministic provider invocation outside a live editor session. The `openai-live` adapter wraps Azure Foundry's chat-completions endpoint; `o3` for harder reasoning, `4o` for faster/cheaper paths.

**Secondary considerations (lower priority, keep the port shape open for):** direct Anthropic API (useful for comparison runs), MCP-brokered adapters (useful for future providers the team hasn't committed to), local-model adapters (useful for offline development).

**Design principles binding on every adapter:**

- **Token-conscientiousness is a first-class concern.** Every `ReasoningReceipt<Op>` carries `tokens: { prompt, completion, total }` and `estimatedCostUsd` (where derivable). The workshop's metrics catalog gains a `metric-reasoning-token-consumption-p50` derivation in Step 4b's commit sequence so token usage is a tracked metric from the moment the port is consolidated.
- **Batching over per-call invocation.** Where the operation admits it (especially `Reasoning.interpret` against multiple structurally-similar work items), adapters expose a batched variant that submits multiple inputs in one API call with structured separators. The unified `Reasoning.Tag` declares both `select(request)` and `selectBatch(requests)` (same for `interpret` and `synthesize`); saga code picks the right shape based on whether it's processing one item or N.
- **Structured output is non-negotiable.** Every adapter enforces structured output on the provider side (tool-use / function-calling / JSON-schema) and validates the response with `Schema.decode` before returning to the saga. Free-text responses that can't decode fail fast with `ReasoningError.malformed-response`; the saga branches on the typed error, not on parse heuristics.
- **Prompts are fingerprinted.** The `ReasoningReceipt` carries `promptFingerprint = sha256(stableStringify(promptStructure))` so the receipt log is queryable by prompt shape. This feeds prompt-optimization experiments (later phases) and lets the batting-average metric stratify by prompt version.

**What this implies for Step 4b's commit sequence:**

- Commit 4b.3 (adapter extraction) lands the `copilot-live` adapter first, `openai-live` second (same commit), and stubs or TODOs the others. Test adapter (`test-live`) also lands at 4b.3 for integration-test use.
- Commit 4b.3 also adds the token-accounting and prompt-fingerprint fields to `ReasoningReceipt<Op>` (these are types, not adapter logic, but they're needed before adapters can populate them).
- The `workshop/metrics/` additions for token consumption land alongside 4b.3 as part of the same PR (estimated +40 LOC on top of the §9.2 total, raising Step 4b to ~555 LOC).

**Risk that follows from provider choice:**

- Copilot's rate limits and availability are external; the adapter needs a graceful degradation path to `openai-live` when Copilot is unavailable. The composite/hybrid adapter pattern (already in v1) handles this; Step 4b's test surface includes a Copilot-unavailable scenario.
- VSCode Copilot operates through an editor-extension protocol that may require v2 sessions to run inside VSCode. Non-editor sessions (CI, command-line) default to the Azure OpenAI adapter. The composition layer (`product/composition/app-layer.ts`) reads an env var or config flag to pick the default provider per invocation context.

---

## 10. M5 cohort re-key plan

Investigation conducted 2026-04-18. This section is the concrete design for Step 1's M5 cohort re-key from scenario-ID to probe-surface triple.

### 10.1 What changes (and what doesn't)

**Unchanged:** the M5 visitor (`memory-worthiness-ratio.ts`) and the trajectory algebra (`memory-maturity-trajectory.ts`). `isComparableAt(a, b)` remains `a.cohortId === b.cohortId` — string identity. The slope-over-cohort logic and the MIN_TRAJECTORY_POINTS=3 gate are both preserved.

**Changed:** the *interpretation* of `cohortId`. Instead of a scenario-ID-derived string, it becomes a probe-surface triple `(verb, facetKind, errorFamily)` serialized as `"verb:<verb>|facet-kind:<kind>|error-family:<family>"`.

**The denominator (maintenance overhead)** stays as-is. M5 divides slope by maintenance overhead; where that overhead value comes from is upstream of M5 and unaffected by the cohort key.

### 10.2 History: clean reset with epoch marker

The scorecard at `tests/fixtures/scorecards/baseline.json` has **4 runs** of history. Those runs don't carry probe-IR metadata (no verb, facetKind, or errorFamily fields) and can't be losslessly mapped to the new cohort format. **Recommendation: clean reset.**

At Step 1:
- The scorecard's `history` array clears.
- A new field `cohortKeyEra: 'scenario-id' | 'probe-surface'` marks the epoch boundary.
- The scorecard's `highWaterMark` resets to null or a sentinel "baseline prior to probe era" marker.
- Commit message explicitly names the reset: *"Step 1: M5 cohort re-key from scenario-ID to probe-surface triple; scorecard history reset; epoch marker added."*
- A human memo lands at `workshop/observations/step-1-cohort-reset.md` explaining the discontinuity to future readers.

**Why reset is acceptable:** the dogfood scenarios retire anyway; the old cohort space has no post-Step-1 continuity. A reset signals the measurement epoch boundary honestly.

### 10.3 Files that land in Step 1's M5-re-key commit

1. **New: `lib/domain/fitness/probe-surface-cohort.ts`** (~50 LOC) — types and factory:
   ```ts
   export interface ProbeSurfaceCohort {
     readonly verb: string;
     readonly facetKind: 'element' | 'state' | 'vocabulary' | 'route';
     readonly errorFamily: 'not-visible' | 'not-enabled' | 'timeout' | 'assertion-like' | 'unclassified';
   }
   export function probeSurfaceCohortKey(c: ProbeSurfaceCohort): string;
   export function parseProbeSurfaceCohort(id: string): ProbeSurfaceCohort | null;
   ```
2. **Updated: `lib/domain/fitness/types.ts`** (~20 LOC) — `ScorecardHistoryEntry` + `PipelineScorecard` gain optional `cohortKeyEra?: 'scenario-id' | 'probe-surface'`.
3. **Updated: `tests/fitness/memory-maturity-trajectory.laws.spec.ts`** (~40 LOC) — helper `makePoint()` uses new cohortId format; add Law 12 asserting probe-surface identity.
4. **Updated: `tests/fixtures/scorecards/baseline.json`** — history array cleared; `cohortKeyEra: 'probe-surface'` added.
5. **Updated: cohortId constructors at ~5–8 callsites** (~30 LOC total) — search for any `"scenario-" + scenarioId` pattern and replace with `probeSurfaceCohortKey(...)`.
6. **New: `workshop/probe-derivation/transitional.ts`** (~100 LOC) — inline transitional probe set (per §5 of this doc), each probe carrying its probe-surface cohort triple in metadata.

### 10.4 Effort

~240 LOC total across ~7 files. Engineer-hours: 6–7. Single commit at Step 1.

### 10.5 Risk surface

- **Probe IR produces inconsistent triples across runs.** M5 silently fails to group comparable runs. Mitigation: Step 5's spike protocol asserts probe-surface triples are stable across repeated runs of the same fixture.
- **Error-family set changes between runs** (a new error family lands at Step 7 or later). Old trajectory points stop being comparable to new ones for that verb. Mitigation: accept this as a natural consequence of verb evolution; the old trajectory stays queryable as history.
- **Underspecified probe metadata.** M5's MIN_TRAJECTORY_POINTS=3 gate is the safety valve — underspecified runs that fail to accumulate 3 cohort points return M5=0. The trust-policy gate can additionally reject runs with malformed probe metadata as untrusted.

### 10.6 Verification

After the Step 1 commit lands:
- `npm test` green, including the new Law 12 (probe-surface identity).
- Run the transitional probe set; M5 visitor returns 0 (fewer than 3 points per cohort is expected with only 7 probes spread across cohorts). This is correct behavior — M5 is gated.
- After 3+ runs of the transitional set (accumulated across Phase 1 and Phase 2), M5 begins returning non-zero values. Confirmation that the re-key works end-to-end lands naturally at that point.

---

## 11. Closing — why this doc exists

A plan that says "move 550 files into three folders and run `npm test`" is not executable. An agent walking into Step 0 needs to know: which 550 files, in what order, using which tool, with what risk, under what branch, with what rollback path, validated against which checklist.

This doc is the preprocessing that turns the plan from a specification into a walkthrough. If you're picking up Step 0 or Step 1, read §§1, 2, 3, 7, 8 before you start. If you're picking up Step 1.5, read §6. If you're picking up Step 4b, read §9. If you're picking up Step 5, read §4.

Each section is bounded. No section points at "TBD" or "deferred" without naming the downstream step that resolves it. The goal is that a fresh agent session can walk in, read the relevant sections, and start executing without re-deriving the design.

Where the plan's operating framing (in `v2-direction.md` + `v2-transmogrification.md`) and this doc diverge on details, **this doc wins for execution mechanics**; the plan doc wins for direction. If a genuine contradiction appears, the plan is at fault and should be amended before executing.

---

## 12. V1 harvest — findings, risks, and inheritance

Three parallel investigations conducted 2026-04-19 crawled `docs/v1-reference/` (20 v1-era docs) and surfaced ~80 findings across four buckets: **ENRICH** (absorb into v2.1), **NARRATIVE** (preserve as framing language), **RETIRE** (obsolete under v2.1 — name so future agents don't re-import), and **RISK / LATENT** (things v1 was solving that v2.1 hasn't explicitly addressed).

This section is the durable record. The highest-impact findings have been landed inline in `docs/v2-transmogrification.md` §5.3 (cascade risks), §8 (deferred items), and specific Step DoDs per §3. Lower-leverage findings remain here as reference for a future agent who wants to audit the integration or re-consider a retirement.

### 12.1 ENRICH — inherited by v2.1

Findings that bind to specific v2.1 artifacts. Each row names the v2.1 home where it has been or should be absorbed.

| Finding (source) | v2.1 home |
|---|---|
| **Selector canonicality at the type level** — `CanonicalTargetRef` identity is load-bearing for the compounding claim; duplication must fail the build, not be cleaned up post-hoc. (arch, A2) | Step 3 facet schema DoD (type-level constraint); architecture law addition. |
| **K5 monotonicity law** — repeat-authoring shortens discovery time, not just raises confidence. (theorems, A1) | Step 7 acceptance criterion + `workshop/convergence/` rolling-window monotonicity law. |
| **A3 continuation integrity** — facet evidence carries `attempt_count` + `last_blockage_kind` so resumed sessions don't re-tread. (theorems, A4) | Step 7 evidence log schema. |
| **L2s strong-target observability** — facet confidence carries `evidenceStreams: number`; DOM-less authoring gates more conservatively when backing is single. (theorems, A5) | Step 7 facet confidence schema. |
| **R2/R3 drift classification into three tiers** — expression-only / affordance-shift / semantic redesign; only tier 3 triggers confidence decay. (theorems, A7) | Step 9 drift-emit classifier + Step 10 revision-proposal filters. |
| **M4 suspension-handoff minimum** — every `Suspended` verdict produces a handoff with ≥3 next-move candidates. (theorems, A6) | `product/tests/architecture/` handoff-validation law. |
| **Enrichment discipline on handoffs** — bare `{screen, element, alias}` is not enough; intervention receipts must thread `locatorHints`, `widgetAffordance`, `inferredAction`, `semanticCore`, `evidenceSlice`. v1 measured this empirically as the richness-gap culprit for alias-only resolutions. (operational) | Step 7 intervention-receipt schema; `product/domain/handshake/intervention.ts` reshape. |
| **Widget coverage is the load-bearing bottleneck** — proposal quality and entropy are multipliers within that ceiling; no improvement above widget ceiling is possible. v1 current state: ~40% (4 actions); target 70% with P0 widgets; ultimate 100%. (operational) | Step 1.5 customer-reality probe memo MUST report observed widget coverage against customer app; Phase 2 design uses this baseline. |
| **Observation-collapse pattern** (extract → aggregate → derive) — every learning metric should pattern-match this, not invent its own fold. (arch, A5) | `workshop/metrics/` visitor template + Step 7/9/10 metric authoring guidance. |
| **Yanking axiom justifies graduation** — traced-monoidal `Tr(σ) = id` proves the workshop convergence condition ("probes cover 100% + batting average ≥ floor") is formally grounded, not engineering heuristic. (arch, A8) | `v2-transmogrification.md §6.3` narrative justification. |
| **Translation overlap threshold = 0.34** as v1's empirically-tuned default; v2.1 starting default. (operational, 15-knob #1) | `product/reasoning/adapters/` starting config; Step 4b DoD. |
| **Trust policy confidence floors (0.90 hints / 0.95 elements-postures-patterns / 0.98 snapshots)** as v1's empirical gates. (operational, 15-knob #11) | `workshop/policy/trust-policy.yaml` starting values; recalibrated under probe evidence per Phase 3. |
| **Staleness TTL dynamic formula** — `min(10, max(3, round(stepCount * 0.3)))` for memory-carry TTL; `0.25`/`0.30`/`0.35` confidence floors for complex/medium/simple state graphs. (operational, 15-knob #4) | Step 9 runtime context carry defaults. |
| **Semantic dictionary promotion trajectory** — initial 0.5, +0.12 per reuse, promote at 0.8 after 3+ reuses. (operational, 15-knob #15) | Step 7 evidence accumulation formula default. |


### 12.2 NARRATIVE — preserved as framing language

Concepts that retire as enforcement but survive as reading-only language. Useful when a future agent (or human) needs the *why* behind v2.1's primitives; not load-bearing for execution.

- **The epistemological loop** — Intent → Resolution → Commitment → Evidence → Knowledge → Intent. One cycle at every rhythm (step, scenario, iteration, session). The system exists to close the Gap. Useful as an organizing frame for `v2-direction.md §1` and for orienting newcomers to "why is there a manifest, why does memory compound."
- **The three architectural spines** — Interface Intelligence, Agent Workbench, Recursive Improvement. In v1 these cut across six workflow lanes; in v2.1 they map cleanly onto the three folders (`product/`, `dashboard/`, `workshop/` respectively). Reading v1's spine docs through the v2.1 lens is a useful way to understand why the folder split is not arbitrary.
- **The interpretation surface as a single machine boundary** — shared by planning, runtime, review, intervention, improvement. In v2.1 the manifest + facet catalog + append-only log set *are* the interpretation surface; projections read through it, never beside it.
- **Theorem groups K / L / S / V / D / R / A / C / M / H as architectural narrative lens** — retired as a proof-obligation matrix, survives as a reading lens. Each group maps to a v2.1 subsystem: K (kernel legibility) → `product/domain/`; L (structural surface) → `product/intelligence/`; S (semantic persistence) → `product/catalog/`; D (dynamic topology) → `product/runtime/`; V (structured variance) → `workshop/probe-derivation/`; R (drift/recoverability) → `product/observation/drift-emit.ts` + Step 9; A (agency) → `product/reasoning/`; C (compounding economics) → `workshop/metrics/`; M (meta-properties) → `workshop/convergence/`; H (handoff properties) → `product/domain/handshake/`. Useful when future work benefits from formalism language.
- **Confidence vs. governance as orthogonal axes** — belief is distinct from permission. An overlay can be `approved-equivalent` and remain derived working knowledge rather than canon. Preserve in `product/domain/README.md` (stubbed at Step 0 per §3 of this doc) so operators understand why high-confidence work sometimes still requires review.
- **Scope-of-effect / blast-radius** — some drift is local (one element), some regional (a screen), some wholesale (vocabulary shift). The narrative survives as the rationale for Step 9's three-tier drift classification (R2/R3 finding).
- **Surface 1 vs Surface 2 leverage** — Surface 1 is tunable parameters (the 15-knob space); Surface 2 is code architecture. v1 observed that Surface 2 has higher leverage. v2.1's decision to retire the 15-knob loop and invest in probe-IR is Surface-2 investment; preserve this language in architecture-decision conversations.
- **"Converged verdicts are not synonymous with good verdicts"** — v1 empirical: system hit 4–9% cold-start acceptance and declared convergence because delta fell below 1%. But 4–9% is mechanically bad. Preserve this phrase as a warning in `workshop/convergence/` — convergence-proof output must be read alongside absolute-value metrics, not in isolation.

### 12.3 RETIRE — explicit confirmation of obsolete items

Listed so future agents reading `docs/v1-reference/` don't accidentally re-import them. Most are already flagged in `v2-direction.md §4B` and `v2-transmogrification.md §6.5`; this consolidation confirms.

- **15-knob parameter-tuning loop + speedrun.ts gradient computation** — retired. v2.1's probe IR + workshop graduation replace the self-improvement machinery. Six of the 15 parameters have their tuned defaults inherited as starting values (§12.1 table); the gradient loop does not.
- **Hand-authored widget handlers per OutSystems type** (os-button, os-input, os-select, etc.) — retired. Role-affordance derivation already landed in v1; v2.1 inherits the ARIA role → affordance lookup table.
- **Demo harness expansion as a convergence bottleneck** — retired. Real customer applications provide widget diversity naturally; synthetic variance-injection is no longer needed.
- **Entropy harness variance profiles** (phrasing-diversity, structural-variance) — retired alongside demo-harness expansion.
- **ADR collapse pattern and semantic-dictionary-driven step-text resolution** — retired as learning surface. v2.1's probe IR encodes these patterns as first-class semantic forms; verb → action mapping is structural, not learned.
- **Convergence proof as doctrinal acceptance gate** — retired. v2.1 gates on M5/C6-derived metrics (product acceptance curve per §6.2; workshop calibration per §6.3) instead of convergence-proof output.
- **Proof-obligation matrix (K1–K7, L2–L4, S2–S4, D1–D4, V1–V4, R2–R4, A1–A8, C1–C6, M1–M5, H1–H20)** — retired as a formal system. v2.1's trust-but-verify loop catches failures in deployed code, not in design proofs. Narrative structure survives per §12.2.
- **Six-slot lookup chain + reference-canon transitional slot** — retired at Step 1 (type-level surgical edit on `source.ts`; PhaseOutputSource contracts from six to five variants).
- **Dogfood scenario partition (10000-series legacy, 20000-series generated)** — retired at Step 1 alongside reference canon.
- **Calendar-based floor targets** (Q2 2026 = M5 ≥ 1.0, etc.) — retired. v2.1 graduates on sustained-condition, not calendar. Specific M5 floor replacement proposed in §12.5 (Step 7 DoD).
- **Scenario-lifecycle FSM as a separate type hierarchy** — retired via architectural collapse into one generic `StateMachine<S, E>` (per v1's design-calculus Collapse 1, already in-flight in v1 code).


### 12.4 RISK / LATENT — things v1 was solving that v2.1 hasn't explicitly addressed

Highest-leverage risks have been absorbed inline into `v2-transmogrification.md §5.3` (cascade risks) and §8 (deferred items). The full list is retained here for audit.

**Absorbed into §5.3 cascade risks:**
- Confidence-overlay schema not specified for L3 (Step 9 authoring policy gates on confidence but the derivation formula is undefined). Mitigation: pre-Step-9 spike validating the formula against real customer runs.
- Facet relation grammar not specified at Step 3 (how to express "this affordance belongs to this screen's vocabulary"). Mitigation: Step 3 schema spike validates that the relation grammar doesn't bloat storage or query complexity.
- Operator input attribution and revocability unspecified for Step 8 (L2 dialog + document ingest). Mitigation: Step 8 ships with an explicit protocol for attribution + revocation + consent location.
- Five-error-family ↔ eight-pipeline-failure-class mapping unresolved. Both survive under v2.1; relationship between them (map / independent / layered?) needs an explicit table so improvement proposals route correctly.
- Reasoning port batching policy undefined. §9.6 names `selectBatch` / `interpretBatch` variants but doesn't specify *which* sagas must batch or what failure semantics apply to one-request-in-batch failures.
- Premature convergence termination (v1 empirical: system hit `max-iterations` and declared converged before true plateau). Step 10 convergence-proof logic must measure plateau separately from budget exhaustion.
- Alias-only proposals stall (v1 empirical: bare `{screen, element, alias}` handoffs "resolve" at rung 3 but cost is unchanged because downstream still falls to rung 9 DOM). Step 7 intervention-receipt schema must include `locatorHints`, `widgetAffordance`, `inferredAction`, `semanticCore`, `evidenceSlice`.
- Memory carry stale references across screen transitions (v1 parameter: `stalenessTtl=5` with dynamic override formula). Step 9 runtime context should inherit the formula; defer full multi-step memory carry until runtime-family recognition (v1 Phase E, carried forward) lands.

**Absorbed into §8 deferred items:**
- M5 floor ≥ 0.8 at Step 7 acceptance (v1 locked 1.0 at 2026-Q2; v2.1 has no explicit floor until Step 7 ships).
- C6 window size deferred until Step 6 customer-work impact data arrives (v1 locked N=1 loop iteration; v2.1's equivalent window is TBD).
- `metric-source-distribution` visitor — tracks whether the catalog is drifting toward more agentic overrides vs. deterministic observations (a workshop-detectable drift signal per v1 Commit 1b intent).
- Failure-classification threshold derivation — replace v1's hand-authored `0.15 < score < 0.34` bounds with Wilson score / Beta posterior derivations at Phase D (v1 plan, carried forward).

**Latent / not-yet-absorbed (lower leverage):**
- Hylomorphism deforestation untested at customer scale (v1 design-calculus Duality 1; theoretical, not yet load-bearing). Post-Step-6, run a side-by-side collected-vs-streamed convergence proof with real customer data.
- v4 dashboard arcs (44-item Cockpit Clarity / Decision UX / Agent Presence / Live Interface Presence roadmap from v1's research-master-prioritization-v4). Post-Step-6 Phase 3 continuation.
- Impact scheduler / C6-direct measurement (v1 Commit 2; latent). Wire at Step 8 when intervention receipts produce impact data.
- Beta-posterior promotion gates with confidence intervals (v1 Commit 4; contingency). Activate if `metric-hypothesis-confirmation-rate` drops below floor after Step 10 ships.
- Demotion sweep for stale facet variants (v1 Commit 5; contingency). Activate at Step 10 if L4 self-refinement begins producing facet rewrites.

### 12.5 15-knob parameter inheritance table

v1's 15-knob parameter space retires as a tuning loop but specific tuned values inherit as v2.1 starting defaults. Six parameters are load-bearing; three should NOT be inherited; the rest inherit with caveats. Agents picking up Phase 2 or Phase 3 lanes should consult this table before rolling any new parameter.

| # | Parameter | Load-bearing? | v1 tuned value | v2.1 disposition |
|---|---|---|---|---|
| 1 | Translation overlap threshold | yes | 0.34 | Inherit as starting default; `product/reasoning/` may derive dynamically post-Step-4b. |
| 2 | Bottleneck scoring weights | medium | 0.30/0.25/0.25/0.20 | **Do not inherit.** v2.1 should compute from real impact traces; correlation data was placeholder zeros in v1. |
| 3 | Proposal ranking weights | medium | 0.30/0.30/0.20/0.20 | **Do not inherit.** v2.1's graduated intervention replaces proposal ranking. |
| 4 | Staleness TTL (memory carry) | yes | 5 steps; dynamic `min(10, max(3, round(stepCount * 0.3)))` | Inherit formula; refine per customer app structure at Step 9. |
| 5 | Screen confidence floor | yes | 0.35 (dynamic: 0.25 complex / 0.30 medium / 0.35 simple) | Inherit; workshop-graduation refines per runtime-family. |
| 6 | Max active refs | medium | 8 (dynamic 8–32) | Inherit formula; may not apply if v2.1 memory model shifts. |
| 7 | DOM scoring weights | medium | 0.35/0.25/0.20/0.20 | Inherit with caution; visibility may be over-weighted; v2.1 probes may have different DOM signal types. |
| 8 | Element/screen confidence thresholds | yes | 6 / 4 | Inherit; threshold-pair semantics survive. |
| 9 | Precedence weight base | low | 1 | **Do not inherit.** v2.1 has different strategy chain. |
| 10 | Confidence scaling (compiler / verified / proposed) | medium | 1.0 / 0.8 / 0.65 | Inherit principle (discount agent-proposed); v2.1 may adjust specific factors. |
| 11 | Trust policy confidence floors (per artifact type) | yes | 0.90 hints / 0.95 elements/postures/patterns / 0.98 snapshots | Inherit as `workshop/policy/trust-policy.yaml` starting values; recalibrate under probe evidence. |
| 12 | Proposal confidence assignments | yes | 0.85 translation / 0.9 DOM / 0.5 fallback | Inherit; v2.1's probe-IR assigns per atom class. |
| 13 | Convergence threshold (% improvement) | medium | 0.01 (1%) | **Do not inherit.** v2.1 uses M5/C6-derived graduation gates. |
| 14 | Overlay confidence thresholds (semantic-dict) | medium | Jaccard+TF-IDF @ 0.45, combined @ 0.35 | Inherit; v2.1 may use different matching strategy post-Step 8. |
| 15 | Semantic dictionary promotion floor | yes | initial 0.5, +0.12 per reuse, promote at 0.8 after 3+ reuses | Inherit confidence trajectory; may be reshaped at Step 8 L2 operator-dialog ingestion. |

**Verdict:** 6 load-bearing (1, 4, 5, 8, 11, 15); 3 do-not-inherit (2, 3, 13); 6 inherit with caveats. The do-not-inherit three are artifacts of v1's retired self-improvement machinery; inheriting them would re-import the tuning loop by the back door.

### 12.6 Top 5 cross-report insights worth naming in execution

Consolidated from the three parallel harvests' "top 3" lists.

1. **Selector canonicality is load-bearing for the compounding claim.** If v2.1 allows ad-hoc selector duplication in scenarios or generated code, the facet catalog's value stalls — every scenario rediscovers. The "50th test costs less than the 1st" claim depends entirely on `CanonicalTargetRef` identity being a type-level constraint, not a convention. (Architecture harvest, top-3 #2.)

2. **Widget coverage is the load-bearing bottleneck; proposal quality and entropy are multipliers within the ceiling.** No richness improvement escapes widget coverage limits. Step 1.5's customer-reality probe memo must report observed widget coverage as its top-line baseline. (Operational harvest, top-3 #1.)

3. **Converged verdicts are not synonymous with good verdicts.** v1 hit 4–9% cold-start acceptance and declared convergence. Workshop graduation's calibration-test third clause (§6.3 of the transmog doc) exists to guard against this failure mode — without it, the graduation gate is gameable. (Operational harvest, top-3 #2.)

4. **Enriched proposals compound; bare proposals stall.** Alias-only handoffs are a richness-gap failure mode v1 measured empirically. v2.1's Step 7 intervention-receipt schema MUST include locator hints, widget affordance, inferred action, semantic core, and evidence slice — not just alias. (Operational harvest, top-3 #3.)

5. **Probes must derive from the manifest to avoid drift between testbed and product reality.** Hand-authored dogfood silently forks from customer applications. Manifest-derived probes are authoritative because they exercise what product declares it can do. Step 5's spike is the only validation gate; if >20% need hand-tuning, the seam isn't where the design claims. (Architecture harvest, top-3 #3.)

---
