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

1. **4b.1: Port declaration + types** (~80 LOC). Create `product/reasoning/reasoning.ts`. Add generic `ReasoningReceipt<Op>`. Backward-compat aliases for `TranslationReceipt`. No runtime changes.
2. **4b.2: Error union consolidation** (~60 LOC). Merge the two error hierarchies into one five-family `ReasoningError` discriminated union. Legacy error classes remain as deprecated wrappers.
3. **4b.3: Adapter extraction** (~320 LOC). Move adapter factories into `product/reasoning/adapters/`. Merge retry logic from Translation + AgentInterpreter. Golden tests verify each adapter produces identical output to pre-move.
4. **4b.4: Callsite migrations** (~15 LOC). Rename `provider.translate` → `provider.select`, update imports. Pure diff; zero logic change. Regression test: run full resolution pipeline, verify receipts match.
5. **4b.5: Cleanup + deprecation** (~10 LOC). Mark old types as `@deprecated`; keep exports for backward compat. Update CLAUDE.md migration note.

Each commit has green tests before the next starts. If any commit fails CI, revert individually.

### 9.5 Risk surface — low

- **Zero direct SDK imports.** Audit verified no `anthropic`, `openai`, or direct HTTP calls to LLM providers exist outside the provider abstraction. The "no direct SDK imports" claim holds.
- **All callsites route through strategy interfaces.** No bypass paths. No hidden LLM calls that would need to migrate.
- **Backward compat is achievable.** Deprecated aliases let external consumers (if any) migrate on their own schedule.

Concrete diff example for `local-runtime-scenario-runner.ts` migration is in the audit output; the PR author can lift it directly.

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
