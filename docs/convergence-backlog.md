# Convergence Execution Backlog

> Status: Active but **subordinate** to
> [`docs/cold-start-convergence-plan.md`](./cold-start-convergence-plan.md)
> and [`docs/canon-and-derivation.md`](./canon-and-derivation.md),
> which are the doctrinal spines for substrate convergence work and
> supersede this document for sequencing decisions.

## Doctrinal drift flags (2026-04-10)

The canon-and-derivation doctrine was revised on 2026-04-10 to
introduce the **reference canon** population (§ 3.2a) and the
**six-slot lookup chain** with reference canon at slot 4. Several
items below were written against the earlier "decompose hybrid
compounds into `.canonical-artifacts/`" framing and must be read
with that drift in mind:

- **P2-* (route knowledge persistence)** items that write to
  `dogfood/knowledge/routes/` are still valid, BUT the path is now
  reference canon (slot 4), not a canonical artifact (slot 2/3).
  Route proposals activated through the real trust-policy gate are
  agentic overrides and should land under
  `{suiteRoot}/.canonical-artifacts/agentic/atoms/routes/` once
  that tree is wired in Phase A of the cold-start plan. Until
  then, activated route proposals that edit `knowledge/routes/`
  are papering over the reference-canon → agentic-override
  transition.
- **P3-* (proposal enrichment)** items that write to
  `dogfood/knowledge/screens/*.hints.yaml` have the same drift:
  the write target is reference canon, not canonical artifact.
  `applyHintsPatch()` should eventually write to
  `{suiteRoot}/.canonical-artifacts/agentic/atoms/elements/**`
  backed by an `InterventionReceipt` reference; today it writes
  into reference canon directly.
- **P1-4 (demo harness expansion)** remains valid. Demo harness
  is canonical source (§ 2.2 in canon-and-derivation), not
  reference canon.
- **P5-2 (confidence decay)** is orthogonal to the reframe.
  Confidence decay applies uniformly to any slot's entries and
  does not depend on which slot they live in.

The appropriate mental model when reading the items below is:

1. The **structural pipeline improvements** (role-affordance
   derivation, dashboard event kinds, structural derivations) are
   unchanged and still valid.
2. The **write-target paths** need to be retargeted from
   `dogfood/knowledge/**` (reference canon) to
   `{suiteRoot}/.canonical-artifacts/agentic/**` (real agentic
   overrides backed by receipts) once Phase A of the cold-start
   plan wires the slot.
3. The **measurement gates** at the bottom of this file (Expected
   Hit Rate per phase) are still usable, but they should be read
   as "the mix of canonical artifacts + reference canon that the
   warm run resolved from," with the understanding that shifting
   reference canon hits into real agentic overrides is itself a
   C6 win independent of the hit rate.

Individual items below are NOT rewritten in this pass; this drift
section exists so a reader is warned before they start
implementing from the old text. Items that need real rework will
be folded into the cold-start convergence plan's Phase A–C work
as they come up.

---
>
> Read this document as **Surface 1/2 tactical inputs** (hyperparameter
> tuning, algorithm improvements, structural derivations) that execute
> *within* the substrate-migration phases of the cold-start plan. The
> items below remain accurate about *what* to do; the cold-start plan
> governs *when* relative to atom decomposition (Phase A), the dual L4
> metric tree (Phase B), intervention-receipt impact wiring (Phase C),
> confidence-interval promotion scoring (Phase D), runtime-family
> recognition (Phase E), and Tier 3 projection authoring (Phase F).
>
> The primary measurement axis is **cold-start efficacy** and
> **intervention marginal value** (M5 and C6 in
> `docs/alignment-targets.md`), not `knowledgeHitRate` alone. A
> backlog item that improves `knowledgeHitRate` but regresses M5 or
> C6 below its current-window floor cannot be accepted, per the
> Pareto gate in `docs/recursive-self-improvement.md` and the
> scorecard semantics in `docs/alignment-targets.md`.
>
> **Phase tags** (added 2026-04-08): every item is conceptually
> tagged as one of:
>
> - `substrate-migration` — load-bearing for the cold-start plan's
>   Phase A / Phase E work; do not defer.
> - `surface-1-tactic` — hyperparameter tuning; safe to run in
>   parallel with substrate work.
> - `surface-2-tactic` — algorithmic or structural improvements that
>   benefit compoundingly; prioritize over Surface 1.
> - `infrastructure-tactic` — test harness, operator surfaces, CI;
>   independent of substrate phases.
>
> Tags are applied per-item in the body below where the tag is
> non-obvious. When in doubt, Phase 1 (role-affordance derivation)
> items are `surface-2-tactic`, Phase 2 (route knowledge) items are
> `substrate-migration` because they land atoms, Phase 3 (proposal
> enrichment) items are `surface-2-tactic`, Phase 4 (structured
> entropy) items are `surface-1-tactic`, and Phase 5 (operational
> surface) items are `infrastructure-tactic`.

This backlog translates the convergence roadmap into concrete, ordered work items. Each item identifies the files to change, the invariants to hold, and the acceptance criteria to verify.

Use this with `docs/current-state.md` and
[`docs/cold-start-convergence-plan.md`](./cold-start-convergence-plan.md).
Several Phase 0-4 items are already implemented or partially
implemented in code, so these phases should be read as
finish-adoption, normalization, and hardening work rather than
introduction-from-zero.

## Architectural Revision: Role-Derived Widget Affordances

The original roadmap (Workstream A) proposed hand-authoring widget handlers per widget type — `os-select.ts`, `os-checkbox.ts`, etc. This is the same alias treadmill that A1 (ADR collapse) eliminated for step text resolution. The correct approach is to derive widget affordances deterministically from ARIA role signatures.

**The insight:** The WAI-ARIA specification defines a closed set of roles with fixed interaction semantics. A `role="checkbox"` element has exactly two state-changing affordances: `check` and `uncheck`. A `role="combobox"` has: `fill`, `selectOption`. Playwright's API already mirrors these semantics — `locator.check()`, `locator.selectOption()`, `locator.fill()`. The mapping from ARIA role to legal Playwright interaction is a pure function over a fixed standard. It requires no learning, no proposals, and no operator authoring.

**What this replaces:** Instead of N hand-authored widget handler files and N hand-authored capability contracts, we build one role-affordance derivation table in the domain layer and one role-based dispatcher in the runtime layer. The existing `lib/runtime/widgets/` directory and `lib/domain/widgets/contracts.ts` become legacy — subsumed by the derivation.

**What this preserves:** The `WidgetCapabilityContract` interface remains useful as the *output type* of the derivation. The `interact()` function in `lib/runtime/interact.ts` remains the dispatch surface. The change is in how contracts and handlers are *produced* — derived from role, not authored per type.

---

## Phase 0: Test Suite Rehabilitation

Current state note: the runner split is already implemented; remaining work here is verification and drift prevention.

> Unblocks: all subsequent phases (cannot validate changes without passing tests)

### P0-1. Add vitest and split test runners

**Problem:** 11 spec files import from `vitest` but the sole runner is Playwright Test. `npm test` fails immediately.

**Files to change:**
- `package.json` — add `vitest` dev dependency, add `test:unit` and `test:integration` scripts, update `test` to run both
- `vitest.config.ts` (new) — include `tests/**/*.laws.spec.ts` and `tests/**/*.spec.ts`, exclude `tests/playwright-*.spec.ts`
- `playwright.config.ts` — ensure it only matches `tests/playwright-*.spec.ts`

**Acceptance:**
- `npm run test:unit` passes (vitest, law-style tests)
- `npm run test:integration` passes (playwright, browser tests)
- `npm test` runs both sequentially and exits 0
- `npm run check` still passes

### P0-2. Verify existing law tests pass under vitest

**Problem:** Tests may have latent failures masked by the broken runner.

**Files to read:** All `tests/*.laws.spec.ts` and `tests/*.spec.ts` files.

**Acceptance:**
- Every existing test file either passes or is marked with a documented skip reason
- No test is silently dropped from the runner

---

## Phase 1: Role-Derived Widget Affordances

Current state note: the role-affordance table exists; the remaining work is widening adoption so runtime, synthesis, and contracts all derive from it consistently.

> Unblocks: demo harness expansion, proposal enrichment, convergence acceleration
>
> Key principle: the ARIA spec is the canonical source of widget semantics.
> Derivation replaces authorship. The role-affordance table is a compile-time
> constant, not a runtime discovery.

### P1-1. Define the role-affordance table (domain layer)

**Concept:** A pure, constant mapping from ARIA role to the set of legal interactions and their Playwright method names. This is the single source of truth for "what can you do with this element?"

**New file:** `lib/domain/widgets/role-affordances.ts`

**Content sketch:**

```typescript
export interface RoleAffordance {
  readonly action: string;           // 'click', 'fill', 'check', 'select', etc.
  readonly method: string;           // Playwright Locator method name
  readonly args?: 'value' | 'none';  // whether the method takes a value argument
  readonly effectCategory: WidgetEffectCategory;
  readonly preconditions: readonly WidgetPrecondition[];
}

// The ARIA role → affordance mapping. Closed set derived from WAI-ARIA spec.
export const ROLE_AFFORDANCES: Readonly<Record<string, readonly RoleAffordance[]>> = {
  button:     [
    { action: 'click',     method: 'click',        args: 'none',  effectCategory: 'mutation',    preconditions: ['visible', 'enabled'] },
    { action: 'get-value', method: 'innerText',    args: 'none',  effectCategory: 'observation', preconditions: ['visible'] },
  ],
  link:       [
    { action: 'click',     method: 'click',        args: 'none',  effectCategory: 'navigation',  preconditions: ['visible'] },
    { action: 'get-value', method: 'innerText',    args: 'none',  effectCategory: 'observation', preconditions: ['visible'] },
  ],
  textbox:    [
    { action: 'fill',      method: 'fill',         args: 'value', effectCategory: 'mutation',    preconditions: ['visible', 'enabled', 'editable'] },
    { action: 'clear',     method: 'clear',        args: 'none',  effectCategory: 'mutation',    preconditions: ['visible', 'enabled', 'editable'] },
    { action: 'get-value', method: 'inputValue',   args: 'none',  effectCategory: 'observation', preconditions: ['visible'] },
  ],
  checkbox:   [
    { action: 'check',     method: 'check',        args: 'none',  effectCategory: 'mutation',    preconditions: ['visible', 'enabled'] },
    { action: 'uncheck',   method: 'uncheck',      args: 'none',  effectCategory: 'mutation',    preconditions: ['visible', 'enabled'] },
    { action: 'get-value', method: 'isChecked',    args: 'none',  effectCategory: 'observation', preconditions: ['visible'] },
  ],
  radio:      [
    { action: 'check',     method: 'check',        args: 'none',  effectCategory: 'mutation',    preconditions: ['visible', 'enabled'] },
    { action: 'get-value', method: 'isChecked',    args: 'none',  effectCategory: 'observation', preconditions: ['visible'] },
  ],
  combobox:   [
    { action: 'fill',      method: 'fill',         args: 'value', effectCategory: 'mutation',    preconditions: ['visible', 'enabled'] },
    { action: 'select',    method: 'selectOption',  args: 'value', effectCategory: 'mutation',    preconditions: ['visible', 'enabled'] },
    { action: 'get-value', method: 'inputValue',   args: 'none',  effectCategory: 'observation', preconditions: ['visible'] },
  ],
  listbox:    [
    { action: 'select',    method: 'selectOption',  args: 'value', effectCategory: 'mutation',    preconditions: ['visible', 'enabled'] },
    { action: 'get-value', method: 'innerText',    args: 'none',  effectCategory: 'observation', preconditions: ['visible'] },
  ],
  tab:        [
    { action: 'click',     method: 'click',        args: 'none',  effectCategory: 'focus',       preconditions: ['visible'] },
  ],
  slider:     [
    { action: 'fill',      method: 'fill',         args: 'value', effectCategory: 'mutation',    preconditions: ['visible', 'enabled'] },
    { action: 'get-value', method: 'inputValue',   args: 'none',  effectCategory: 'observation', preconditions: ['visible'] },
  ],
  spinbutton: [
    { action: 'fill',      method: 'fill',         args: 'value', effectCategory: 'mutation',    preconditions: ['visible', 'enabled'] },
    { action: 'get-value', method: 'inputValue',   args: 'none',  effectCategory: 'observation', preconditions: ['visible'] },
  ],
  table:      [
    { action: 'get-value', method: 'innerText',    args: 'none',  effectCategory: 'observation', preconditions: ['visible'] },
  ],
  grid:       [
    { action: 'get-value', method: 'innerText',    args: 'none',  effectCategory: 'observation', preconditions: ['visible'] },
  ],
  dialog:     [
    { action: 'get-value', method: 'innerText',    args: 'none',  effectCategory: 'observation', preconditions: ['visible'] },
  ],
};
```

**Also add:** HTML tag → implicit role mapping (for elements without explicit `role` attribute):

```typescript
export const TAG_IMPLICIT_ROLE: Readonly<Record<string, string>> = {
  button: 'button', a: 'link', select: 'combobox', textarea: 'textbox',
  table: 'table', input: 'textbox', // refined by INPUT_TYPE_ROLE below
};

export const INPUT_TYPE_ROLE: Readonly<Record<string, string>> = {
  checkbox: 'checkbox', radio: 'radio', text: 'textbox', email: 'textbox',
  password: 'textbox', search: 'textbox', tel: 'textbox', url: 'textbox',
  number: 'spinbutton', range: 'slider', date: 'textbox', time: 'textbox',
};
```

**Also add:** A pure derivation function:

```typescript
export function deriveRoleFromSignature(signature: {
  readonly role?: string;
  readonly tag?: string;
  readonly inputType?: string;
}): string | null {
  if (signature.role && ROLE_AFFORDANCES[signature.role]) return signature.role;
  if (signature.tag === 'input' && signature.inputType) {
    const refined = INPUT_TYPE_ROLE[signature.inputType];
    if (refined) return refined;
  }
  if (signature.tag) return TAG_IMPLICIT_ROLE[signature.tag] ?? null;
  return null;
}

export function affordancesForRole(role: string): readonly RoleAffordance[] {
  return ROLE_AFFORDANCES[role] ?? [];
}
```

**Invariants:**
- Pure module, no side effects, no imports from application/infrastructure/runtime layers
- The table is a compile-time constant — no filesystem reads, no network calls
- `deriveRoleFromSignature` is a total function (always returns `string | null`, never throws)
- Explicit `role` attribute always takes precedence over tag-inferred role

**Acceptance:**
- Law test: every ARIA role in the table maps to at least one affordance
- Law test: `deriveRoleFromSignature({ role: 'checkbox' })` returns `'checkbox'`
- Law test: `deriveRoleFromSignature({ tag: 'select' })` returns `'combobox'`
- Law test: `deriveRoleFromSignature({ tag: 'input', inputType: 'checkbox' })` returns `'checkbox'`
- Law test: `deriveRoleFromSignature({})` returns `null`

### P1-2. Build the role-based runtime dispatcher

**Concept:** Replace the hand-authored `widgetActionHandlers` registry with a single dispatcher that resolves role → affordance → Playwright method call.

**File to change:** `lib/runtime/interact.ts`

**Current flow:**
```
interact(locator, widget='os-button', action='click')
  → widgetCapabilityContracts['os-button']     // hand-authored contract
  → widgetActionHandlers['os-button']['click']  // hand-authored handler
  → handler(locator)                            // execute
```

**New flow:**
```
interact(locator, role='button', action='click')
  → affordancesForRole('button')               // derived from ARIA spec
  → find affordance where action === 'click'   // pure lookup
  → assertPreconditions(locator, affordance.preconditions)
  → locator[affordance.method](...args)        // dynamic Playwright dispatch
```

**Key change:** The `interact()` function no longer looks up a pre-authored handler function. It derives the Playwright method name from the affordance table and calls it dynamically via `locator[method]()`. This is safe because the method names are compile-time constants from the affordance table — there is no user-controlled string reaching `locator[x]()`.

**Backward compatibility:** The existing `widget` parameter (e.g., `'os-button'`) must map to a role. Add a `WIDGET_TO_ROLE` bridge during migration:

```typescript
const WIDGET_TO_ROLE: Record<string, string> = {
  'os-button': 'button',
  'os-input': 'textbox',
  'os-table': 'table',
};
```

This bridge is temporary — once all callers pass roles directly, it can be removed.

**Acceptance:**
- `interact(locator, 'button', 'click')` calls `locator.click()`
- `interact(locator, 'checkbox', 'check')` calls `locator.check()`
- `interact(locator, 'combobox', 'select', 'option1')` calls `locator.selectOption('option1')`
- `interact(locator, 'os-button', 'click')` still works (backward compat bridge)
- `interact(locator, 'unknown-role', 'click')` returns `runtimeErr`

### P1-3. Wire role inference into the resolution pipeline

**Concept:** When the resolution ladder identifies an element, infer its ARIA role from the DOM signature so that the runtime knows which affordances are legal — without prior knowledge authoring.

**Files to change:**
- `lib/runtime/agent/resolution-stages.ts` — after resolving an element's locator, query the DOM for its ARIA role/tag/type and attach it to the resolution receipt
- `lib/runtime/agent/rung8-llm-dom.ts` — the signal extractors already detect `role-match`; extend them to return the matched role string as structured data

**Acceptance:**
- Resolution receipts for resolved elements include `{ role: 'checkbox' }` (or equivalent)
- The runtime can execute any element whose ARIA role is in the affordance table, with zero prior widget knowledge

### P1-4. Expand the demo harness with role-diverse elements

**Files to change:**
- `dogfood/fixtures/demo-harness/policy-search.html` — add `<select>` for status filter, `<input type="checkbox">` for "Active only" toggle
- `dogfood/fixtures/demo-harness/policy-detail.html` — add tab navigation (claims/coverage/history), `<input type="radio">` for view mode
- `dogfood/fixtures/demo-harness/policy-amendment.html` — add `<input type="date">` for effective date, `<select>` for amendment type

**Invariant:** All new elements use standard HTML tags with implicit ARIA roles. No `role` attribute override needed — the tag-to-role derivation handles it.

**Acceptance:**
- Demo harness contains at least: button, link, textbox, select, checkbox, radio, date input, table
- `npm run discover` against the demo harness detects all new elements
- Cold-start speedrun generates scenarios that exercise the new element types

### P1-5. Update seed templates for new element types

**Files to change:** Seed templates under `dogfood/scenarios/` or the scenario generator in `lib/application/`.

**Acceptance:**
- Synthetic scenarios include phrases that map to `select`, `check`, `uncheck`, and date-entry actions
- Speedrun iteration 1 generates proposals for the new element types

---

## Phase 2: Route Knowledge Persistence

Current state note: route schema, ranking, runtime selection, discovery proposals, and a checked-in demo route file already exist; the remaining work is canon hardening and persistence polish.

> Unblocks: navigation step resolution, screen-state-specific testing
>
> The domain model (`lib/domain/knowledge/route-knowledge.ts`) and runtime
> wiring (`lib/runtime/scenario.ts:215-223`) already exist. The gap is a
> canonical persistence path from discovery to reviewed YAML.

### P2-1. Define the route knowledge YAML schema

**New file:** `lib/domain/schemas/route-knowledge-schema.ts` (Zod/Effect schema for validation)

**Canonical format:**

```yaml
kind: route-knowledge
version: 1
app: demo
routes:
  - screen: policy-search
    pattern: /search
    variants:
      - name: default
        url: /search
        params: {}
      - name: results-with-policy
        url: /search?policyNumber={policyId}
        params:
          policyNumber: { kind: entity-id, source: dataset }
```

**Acceptance:**
- Schema validates the example above
- Schema rejects missing `screen` or `pattern` fields
- Round-trip: parse → serialize → parse produces identical output

### P2-2. Write the route knowledge persistence adapter

**New file:** `lib/infrastructure/knowledge/route-writer.ts`

**Follows pattern of:** `lib/infrastructure/knowledge/hints-writer.ts`

**Behavior:** Takes `RouteKnowledgeProposal` (already generated by `discovery-proposal-bridge.ts:182`), reads existing `knowledge/routes/{app}.routes.yaml`, merges new route variants (dedup by name), writes back.

**Acceptance:**
- Writing a new route variant to an empty file creates valid YAML
- Writing a duplicate variant is idempotent
- Writing to an existing file preserves hand-authored entries

### P2-3. Wire discovery proposals to route persistence

**File to change:** `lib/application/discovery-proposal-bridge.ts`

**Current state:** Discovery generates `route-knowledge` proposals (line 182-187) but they are not persisted to `knowledge/routes/`.

**Change:** After proposal generation, if auto-approval passes, call `routeWriter.write()` to persist the route knowledge.

**Acceptance:**
- `npm run discover --url http://localhost:3100/search` writes to `dogfood/knowledge/routes/demo.routes.yaml`
- Route variants are queryable via workspace session loading

### P2-4. Seed demo route knowledge

**New file:** `dogfood/knowledge/routes/demo.routes.yaml`

**Content:** Hand-author the three demo screens with their known URL patterns and query parameter semantics.

**Acceptance:**
- `lib/runtime/scenario.ts` resolves navigation at rung `route-knowledge` for all demo screens
- Cold-start speedrun navigation steps resolve without falling to `needs-human`

### P2-5. Extend workspace session loading

**File to change:** `lib/application/workspace-session.ts`

**Change:** Load from `knowledge/routes/*.routes.yaml` in addition to harvest manifests. Authored routes take precedence over transient harvest data.

**Acceptance:**
- Workspace session `routeKnowledge` Map includes entries from both harvest manifests and authored YAML
- Authored route knowledge overrides transient harvest data for the same screen

---

## Phase 3: Proposal Enrichment

Current state note: enrichment already exists in the proposal/runtime path; the remaining work is contract normalization, non-destructive semantics, and reporting.

> Unblocks: high-quality knowledge accumulation, effective hit rate improvement
>
> Depends on: Phase 1 (role derivation provides widget type for enrichment)
>
> Core problem: proposals currently produce `{ screen, element, alias }` — an
> alias-only hint. The activation loop closes, but the knowledge is too sparse
> to shift resolution from rung 11 to rung 3.

### P3-1. Extend the proposal patch schema

**File to change:** `lib/runtime/agent/proposals.ts`

**Current patch:** `{ screen, element, alias }`

**Enriched patch:**
```typescript
{
  screen: string;
  element: string;
  alias: string;
  // Enrichment (all optional, set-if-absent semantics):
  locatorHints?: Array<{ kind: string; value: string }>;
  inferredRole?: string;        // ARIA role from Phase 1 derivation
  inferredAction?: string;      // 'fill', 'click', 'check', etc.
  defaultValue?: string;        // from dataset binding or evidence
}
```

**Invariant:** The `{ screen, element, alias }` triple remains the minimum valid patch. Enrichment fields are additive — never required, never overwrite hand-authored knowledge.

**Acceptance:**
- Existing proposals still activate correctly (backward compat)
- New proposals carry `locatorHints` when DOM signal data is available
- New proposals carry `inferredRole` when the resolution pipeline resolved a role

### P3-2. Populate enrichment fields at proposal generation time

**File to change:** `lib/runtime/agent/proposals.ts` — `proposalsForNeedsHuman()` and `proposalsForResolutionGap()`

**Data sources available at generation time:**
- `StepTaskElementCandidate.evidence` — carries `locatorStrategy` and `selector` from the resolution pipeline
- Rung 8 DOM signals — `aria-label-match`, `role-match`, `text-content-match` with associated selectors
- `deriveRoleFromSignature()` from Phase 1 — infers role from tag/type/role attribute
- `task.actionText` — the original intent phrase, from which action type can be inferred

**Acceptance:**
- A proposal for a `<select>` element includes `inferredRole: 'combobox'`
- A proposal for a `<input type="checkbox">` includes `inferredRole: 'checkbox'`
- A proposal for an element found via `role="textbox"` includes `locatorHints: [{ kind: 'role-name', value: 'textbox' }]`

### P3-3. Extend `applyHintsPatch()` to consume enrichment

**File to change:** `lib/application/proposal-patches.ts`

**Current behavior (lines 50-68):** Only writes `aliases` and `acquired` metadata to the element entry.

**New behavior:** When enrichment fields are present *and* the element entry does not already have the corresponding field, merge them in:

```typescript
const updatedEntry = {
  ...elementEntry,
  aliases: withAlias(existingAliases, alias),
  // Set-if-absent: never overwrite hand-authored knowledge
  ...(locatorHints && !elementEntry.locatorLadder
    ? { locatorLadder: locatorHints } : {}),
  ...(inferredRole && !elementEntry.widgetAffordance
    ? { widgetAffordance: inferredRole } : {}),
  acquired: { ... },
};
```

**Invariant:** `set-if-absent` (`??`) semantics on all enrichment fields. An operator who hand-authors a `locatorLadder` will never have it overwritten by a proposal.

**Acceptance:**
- Activating an enriched proposal produces a hints entry with `aliases` + `locatorLadder` + `widgetAffordance`
- Activating a second proposal for the same element with different `locatorHints` does NOT overwrite the first
- Hand-authored `locatorLadder` survives proposal activation

### P3-4. Generate supplementary proposals for partially-resolved steps

**File to change:** `lib/runtime/agent/proposals.ts`

**Current behavior:** Proposals are only generated when a step falls to `needs-human` (rung 11).

**New behavior:** Also generate *supplementary* proposals when a step resolves at rung 8–9 (structured translation or live-DOM). These proposals capture the successful resolution's locator and role for elements that may already have an alias but lack locator knowledge.

**Invariant:** Supplementary proposals have lower confidence than `needs-human` proposals. They enrich existing knowledge; they do not create new element entries.

**Acceptance:**
- A step that resolves at rung 9 (live-DOM) generates a supplementary proposal with the locator it found
- Supplementary proposals activate into existing element entries only (they fail silently if the element doesn't exist in hints)
- After 2 iterations, elements that were initially alias-only gain locator hints from supplementary proposals

---

## Phase 4: Structured Entropy

> Unblocks: convergence acceleration, learning rate improvement
>
> Depends on: Phases 1–3 (richer proposals to measure, more widgets to exercise)

### P4-1. Define variance profile schema

**New file:** `lib/domain/schemas/variance-profile.ts`

**Canonical format:**
```yaml
kind: variance-profile
version: 1
name: phrasing-diversity
dimensions:
  input:
    synonymInjection: { enabled: true, rate: 0.3 }
    passiveVoice: { enabled: true, rate: 0.15 }
    abbreviation: { enabled: true, rate: 0.10 }
  structural:
    ariaLabelSalt: { enabled: false }
  execution:
    interpreterModes: [diagnostic]
```

**Acceptance:** Schema validates the structure, rejects unknown dimension keys.

### P4-2. Build the deterministic entropy injector

**New file:** `lib/domain/entropy/variance-injector.ts`

**Signature:**
```typescript
function applyVarianceProfile(
  scenario: ScenarioIR,
  profile: VarianceProfile,
  rng: SeededRandom,
): readonly ScenarioIR[]
```

**Key properties:**
- Pure function — deterministic given a seed, no side effects
- Produces N mutated variants of a single scenario
- Each variant carries a `varianceTag` in metadata for scorecard partitioning
- Synonym injection draws from `knowledge/patterns/core.patterns.yaml` aliases when available

**Acceptance:**
- Law test: same seed produces identical variants
- Law test: `rate: 0` produces zero mutations
- Law test: `rate: 1.0` mutates every eligible phrase
- Variants are valid `ScenarioIR` (pass schema validation)

### P4-3. Wire variance into the speedrun pipeline

**File to change:** `lib/application/speedrun.ts` — `iteratePhase()`

**Change:** Accept optional `varianceProfile`. When present, expand each scenario into N variants before compilation.

**Acceptance:**
- `npx tsx scripts/speedrun.ts iterate --variance phrasing-diversity --max-iterations 3`
- Scorecard metrics can be partitioned by `varianceTag`
- More diverse phrasings produce measurably more dictionary entries per iteration

### P4-4. Seed a default variance profile

**New file:** `dogfood/variance/phrasing-diversity.variance.yaml`

**Acceptance:**
- Default profile exercises synonym injection at 30% rate
- Speedrun with variance profile produces 2x+ alias diversity vs without

---

## Phase 5: Operational Surface

> Independent of Phases 1–4 — can proceed in parallel

### P5-1. Add `get_operator_briefing` MCP tool

**File to change:** `lib/infrastructure/mcp/dashboard-mcp-server.ts`

**Concept:** Composition tool that synthesizes `get_loop_status`, `get_fitness_metrics`, `get_convergence_proof`, `list_proposals` (top 5), `get_queue_items` (top 5 hotspots), and `get_learning_summary` into a single structured briefing.

**Acceptance:**
- `npx tsx scripts/mcp-call.ts get_operator_briefing` returns a coherent JSON briefing
- Briefing includes: phase, iteration, fitness, convergence, top proposals, top hotspots, action required

### P5-2. Implement confidence decay

**Files to change:**
- `lib/domain/governance/trust-policy.ts` — add `decayConfidence(confidence, lastVerifiedAt, now, halfLifeDays)` pure function
- `.tesseract/policy/trust-policy.yaml` — add `decayPolicy` config section (disabled by default)
- `lib/application/catalog.ts` — apply decay during overlay loading

**Acceptance:**
- Law test: `decayConfidence(1.0, 90daysAgo, now, 90)` returns `0.5`
- Law test: `decayConfidence(1.0, 0daysAgo, now, 90)` returns `1.0`
- Decay is off by default (`enabled: false`)
- When enabled, overlays below `minimumConfidence` are evicted from the catalog

### P5-3. CI trigger script (OutSystems Lifetime)

**New file:** `scripts/ci-trigger.ts`

**Behavior:** Parse Lifetime webhook payload → map modules to affected screens → invoke `ci-batch` pipeline → write structured reports.

**Invariant:** `ci-batch` mode never auto-approves. Proposals accumulate for later review.

**Acceptance:**
- Script accepts a webhook JSON payload and produces a run report
- Exit code 0 on success, non-zero on pipeline failure
- No approval or knowledge mutation occurs

---

---

## Structural Derivation Audit

> Added 2026-04-03: Audit of the backlog for additional places where hand-authorship
> can be replaced with structural derivation, following the same principle as the
> role-affordance revision in Phase 1.

Three additional derivation opportunities were identified. Each eliminates a
category of hand-authored mapping by deriving it from the role-affordance table
(P1-1), the same way the widget handler registry was eliminated.

### Derivation 1: Action Resolution (constrains P3-2)

**Current antipattern:** When a scenario says "Select the Active Only checkbox", the
resolution pipeline must figure out that "select" means `check` (not `selectOption`).
This disambiguation is currently learned through alias matching and the semantic
dictionary — the same verb maps to different Playwright calls depending on context.

**Structural derivation:** Once you know the target element's ARIA role (from Phase 1),
the legal actions are a closed set. A `role="checkbox"` has exactly two state-changing
affordances: `check` and `uncheck`. The verb "select" applied to a checkbox can ONLY
mean `check`. The role constrains the action space — no disambiguation needed.

The derivation is:
```
(intent verb, target role) → affordancesForRole(role)
                           → find affordance whose action best matches the verb
                           → exactly one result (or error if no match)
```

This replaces learned verb→action mappings with a deterministic lookup. The
`core.patterns.yaml` action aliases (`click: [press, tap, select, hit]`) become
derivable from the role-affordance table rather than hand-authored:

| Canonical Action | ARIA Roles Where Legal | Natural Synonyms |
|-----------------|----------------------|------------------|
| `click` | button, link, tab | press, tap, hit, activate |
| `fill` | textbox, combobox, spinbutton, slider | enter, type, input, key in, provide |
| `check` | checkbox, radio | select, enable, tick, mark |
| `select` (option) | combobox, listbox | choose, pick, set to, change to |
| `get-value` | (all roles) | verify, check, confirm, see, read |

The synonym sets are linguistic constants — they don't change per application.
They can be declared alongside the role-affordance table in `lib/domain/widgets/role-affordances.ts`.

**Impact on backlog:**
- P3-2 (populate `inferredAction`) becomes a pure lookup instead of text inference
- `core.patterns.yaml` action aliases become derivable (can be generated or validated against the table)
- Resolution pipeline verb disambiguation is eliminated for any element with a known role

### Derivation 2: Scenario Generation Vocabulary (replaces P1-5, simplifies P4-2)

**Current antipattern:** `lib/domain/synthesis/translation-gap.ts:35-42` hand-authors
`AFFORDANCE_VERBS` per `os-*` widget type:

```typescript
const AFFORDANCE_VERBS = {
  'os-input': ['type in', 'enter', 'fill in', ...],
  'os-button': ['click', 'press', 'hit', ...],
  'os-select': ['choose', 'pick', 'select', ...],
};
```

And `lib/domain/synthesis/workflow-archetype.ts:43-49` hand-classifies elements:

```typescript
const classifyElements = (elements) => ({
  inputs: elements.filter(e => e.widget === 'os-input'),
  buttons: elements.filter(e => e.widget === 'os-button'),
  ...
});
```

Both are keyed by hand-authored `os-*` widget strings. Both are treadmills.

**Structural derivation:** With the role-affordance table and its synonym sets
(from Derivation 1), both become derivable:

```typescript
// Classification: derived from role, not widget string
const classifyElements = (elements) => {
  const byRole = groupBy(elements, e => deriveRoleFromSignature(e));
  return {
    fillable:   byRole.textbox ?? [],
    clickable:  [...(byRole.button ?? []), ...(byRole.link ?? [])],
    checkable:  [...(byRole.checkbox ?? []), ...(byRole.radio ?? [])],
    selectable: [...(byRole.combobox ?? []), ...(byRole.listbox ?? [])],
    readable:   byRole.table ?? [],
  };
};

// Verb selection: derived from role affordances + synonym table
const verbsForRole = (role: string): readonly string[] => {
  const affordances = affordancesForRole(role);
  return affordances.flatMap(a => ACTION_SYNONYMS[a.action] ?? [a.action]);
};
```

**Impact on backlog:**
- P1-5 ("Update seed templates for new element types") is **eliminated** — new
  element types automatically get correct verb vocabulary from their role
- P4-2 (entropy injector synonym injection) uses the same derivation instead of
  reading from `core.patterns.yaml` — the synonym source is structural, not authored
- P4-4 ("Seed a default variance profile") simplifies — the injector's synonym
  vocabulary is built-in, not configured
- Adding a new element type to the demo harness (e.g., `<input type="range">`)
  immediately produces correct scenario phrases without any template changes

### Derivation 3: Element Classification in Workflow Archetypes (constrains P1-4)

**Current antipattern:** The five workflow archetypes (`search-verify`,
`detail-inspect`, `form-submit`, `read-only-audit`, `cross-screen-journey`)
compose steps by classifying elements into `inputs`, `buttons`, `readOnly`,
`tables`, `selects` — each checked against an `os-*` widget string.

When we add `<input type="checkbox">` to the demo harness, the archetype
composer won't know what to do with it. It doesn't match any classification.
The element is invisible to scenario generation.

**Structural derivation:** Replace the widget-string classification with
a role-based classification using affordance categories:

```typescript
type ElementRole =
  | 'fillable'      // textbox, spinbutton, slider — affordance includes 'fill'
  | 'clickable'     // button, link, tab — affordance includes 'click'
  | 'checkable'     // checkbox, radio — affordance includes 'check'
  | 'selectable'    // combobox, listbox — affordance includes 'select'
  | 'readable'      // table, grid — affordance includes only 'get-value'
  | 'container';    // dialog — no direct interaction

function classifyByAffordance(role: string): ElementRole {
  const affordances = affordancesForRole(role);
  const actions = new Set(affordances.map(a => a.action));
  if (actions.has('fill'))   return 'fillable';
  if (actions.has('check'))  return 'checkable';
  if (actions.has('select')) return 'selectable';
  if (actions.has('click'))  return 'clickable';
  return 'readable';
}
```

The archetypes then compose over these role-derived categories:

- `search-verify`: navigate → fill `fillable` → click `clickable` → verify `readable`
- `form-submit`: navigate → fill `fillable` → check `checkable` → select `selectable` → click `clickable`
- etc.

**Impact on backlog:**
- P1-4 (demo harness expansion) automatically produces correctly-classified elements
  without updating archetype code
- New archetypes (e.g., `form-with-checkboxes`) become possible without code changes
- The `ScreenElementPlanInput.widget` field evolves from a hand-authored string to
  a role-derived classification

---

### Derivation 4: Winning Source → Rung Mapping (eliminates duplicate)

**Current antipattern:** Two identical hand-authored `Record<string, string>` mappings exist:

- `lib/domain/kernel/visitors.ts:295-311` — `WINNING_SOURCE_TO_RUNG` (15 entries)
- `lib/application/fitness.ts:141-153` — `sourceToRung` (11 entries, **subset** of the above)

Both map `StepWinningSource` strings like `'scenario-explicit'` to resolution rung names
like `'explicit'`. This is a single-source-of-truth violation — the fitness module maintains
its own copy that can drift from the canonical mapping.

**Structural derivation:** The resolution pipeline's `StrategyRegistry` already declares
which rungs each strategy owns. Each `ResolutionStrategy` produces receipts tagged with
a `winningSource`. The mapping from source to rung is implicit in the strategy
registration — it just isn't surfaced as a queryable function.

```typescript
// Derived from strategy metadata, not hand-authored:
function rungForWinningSource(source: StepWinningSource): ResolutionPrecedenceRung {
  return strategyRegistry.rungOf(source);  // single source of truth
}
```

**Impact:** Eliminates the duplicate mapping, prevents drift, and makes the relationship
between winning sources and rungs machine-verifiable. New strategies automatically register
their source-to-rung mapping.

### Derivation 5: Failure Classification from Receipt Structure

**Current antipattern:** `lib/application/fitness.ts:54-83` classifies step failures
using a hand-authored `classifyFailure()` function with explicit string matching on
`winningSource` and numeric thresholds on `translationScore`:

```typescript
if (winningSource === 'none' && translationScore > 0.15 && translationScore < 0.34)
  return 'translation-threshold-miss';
if (winningSource === 'structured-translation')
  return 'translation-fallback-dominant';
```

Lines 141-199 then map these failure classes to bottleneck signal names via another
hand-authored `FAILURE_TO_SIGNAL` record, with manually assigned weights (0.3, 0.25, etc.).

**Structural derivation:** Resolution receipts already carry structured provenance:
- `receipt.resolutionRung` — which rung resolved (or didn't)
- `receipt.translationReceipt.failureClass` — already a typed enum: `'no-candidate'`,
  `'runtime-disabled'`, `'cache-miss'`, `'low-confidence'`
- `receipt.evidenceCount` — number of prior evidence entries consulted
- `receipt.rungs` — the complete rung traversal trace

The failure class is derivable from the rung traversal pattern:

```typescript
function classifyFromReceipt(receipt: StepResolutionReceipt): FailureClass {
  const lastRung = receipt.rungs[receipt.rungs.length - 1];
  if (lastRung === 'needs-human') return 'unresolved';
  if (lastRung === 'structured-translation') return 'translation-dependent';
  if (receipt.translationReceipt?.failureClass) return receipt.translationReceipt.failureClass;
  // ...derived from receipt structure, not from ad-hoc thresholds
}
```

Bottleneck weights are already computed dynamically by `computeBottleneckCorrelations()` —
the hand-authored weights are redundant.

**Impact:** Eliminates magic threshold constants, eliminates the `FAILURE_TO_SIGNAL` mapping,
and makes failure classification adapt automatically as new resolution strategies are added.

### Derivation 6: Auto-Heal Class from Proposal Provenance

**Current antipattern:** `lib/domain/governance/trust-policy.ts:39-48` defines
`forbiddenAutoHealClasses` as a string array, and proposals carry a hand-assigned
`autoHealClass` string (e.g., `'runtime-intent-cutover'` in `activate-proposals.ts:305`).

The auto-approval gate checks `forbiddenAutoHealClasses.includes(proposal.autoHealClass)`.

**Structural derivation:** A proposal's risk category is determined by two things
already present in its structure:
1. `artifactType` — what kind of knowledge it modifies (`'hints'`, `'patterns'`, `'surfaces'`)
2. `provenanceKind` — where it came from (`'live-dom'`, `'translation'`, `'evidence'`)

The `autoHealClass` is a projection of `(artifactType, provenanceKind)`:

```typescript
function deriveAutoHealClass(
  artifactType: ProposalArtifactType,
  provenanceKind: ProvenanceKind,
): AutoHealClass {
  if (provenanceKind === 'live-dom') return 'runtime-intent-cutover';
  if (artifactType === 'surfaces') return 'structural-mutation';
  return 'knowledge-refinement';
}
```

**Impact:** Eliminates hand-assigned `autoHealClass` strings on proposals. New artifact types
or provenance kinds automatically get the correct heal class via the derivation. The
`forbiddenAutoHealClasses` gate operates on derived values instead of hand-matched strings.

### Derivation 7: Dashboard Event Kinds from Pipeline Stage + Operation

**Current antipattern:** `lib/domain/types/dashboard.ts:47-88` defines `DashboardEventKind`
as a 40+ member union of hand-authored string literals:

```typescript
type DashboardEventKind =
  | 'iteration-start' | 'iteration-end'
  | 'item-pending' | 'item-processing' | 'item-completed'
  | 'element-probed' | 'stage-lifecycle'
  | 'proposal-activated' | 'proposal-blocked'
  // ...40+ more
```

Many follow a `{noun}-{verb}` pattern that encodes two dimensions: the pipeline concept
and the lifecycle operation.

**Structural derivation:** These events are the Cartesian product of a small set of
pipeline concepts and lifecycle operations:

```typescript
type PipelineConcept = 'iteration' | 'item' | 'element' | 'stage' | 'proposal'
  | 'knowledge' | 'convergence' | 'browser' | 'fiber' | 'workbench';
type LifecycleOp = 'start' | 'end' | 'pending' | 'processing' | 'completed'
  | 'activated' | 'blocked' | 'probed' | 'captured' | 'updated';

// Generated event kind:
type DashboardEventKind = `${PipelineConcept}-${LifecycleOp}`;
```

Not all combinations are valid (you don't `probe` an `iteration`), so the valid subset
is declared as a const assertion, but the *naming convention* is derived from the
two constituent dimensions rather than hand-enumerated.

**Impact:** Adding a new pipeline concept (e.g., `'route'`) automatically generates
a family of events (`route-start`, `route-completed`, `route-updated`) without editing
the union. Consumers can match on concept or operation independently.

### Derivation 8: Screen Identification from URL + ARIA Landmarks

**Current state:** `lib/runtime/screen-identification.ts:166-174` uses hand-authored
signal weights:

```typescript
const weight = signal.startsWith('title:') ? 2.0
  : signal.startsWith('testid:') || signal.startsWith('aria-label:') ? 1.5
  : 1.0;
```

**Structural derivation:** These weights reflect the reliability hierarchy of HTML/ARIA
signals — `<title>` is page-level and highly specific, `[data-testid]` is developer-intended,
`aria-label` is accessibility-authored, and other signals are incidental. This hierarchy
is a fixed property of the HTML specification:

```typescript
const SIGNAL_RELIABILITY: Record<string, number> = {
  'title': 2.0,        // HTML spec: one per page, explicit page identity
  'testid': 1.5,       // Convention: developer-intended stable identifier
  'aria-label': 1.5,   // ARIA spec: authored accessible name
  'aria-labelledby': 1.5,
  'heading': 1.2,      // HTML spec: document outline hierarchy
  'landmark': 1.2,     // ARIA spec: page region semantics
  'url-pattern': 1.0,  // Derived from route knowledge
};
```

This is already somewhat derived (signal type → weight) but could be formalized as a
companion to the role-affordance table — a `SIGNAL_RELIABILITY` table in the domain
layer that codifies HTML/ARIA signal semantics.

**Impact:** Screen identification weights become a reviewable, testable constant
instead of inline magic numbers. New signal types (e.g., from route knowledge) get
correct weights automatically.

### Derivation 9: Execution Profile Capabilities from Posture

**Current antipattern:** `lib/domain/governance/trust-policy.ts:87-91`:

```typescript
const PROFILE_AUTO_APPROVAL: Record<ExecutionProfile, boolean> = {
  'ci-batch': false,
  'interactive': false,
  'dogfood': true,
};
```

**Structural derivation:** The execution profile is already part of `ExecutionPosture`.
Whether a profile can auto-approve is derivable from its capability set — `ci-batch`
can't because it's non-interactive, `interactive` can't because it requires explicit
human approval, `dogfood` can because it's the self-hardening loop.

This can be modeled as a capability derivation:

```typescript
interface ProfileCapabilities {
  readonly canAutoApprove: boolean;
  readonly canWriteKnowledge: boolean;
  readonly canExecute: boolean;
  readonly requiresHumanPresence: boolean;
}

function deriveCapabilities(profile: ExecutionProfile): ProfileCapabilities {
  return {
    canAutoApprove: profile === 'dogfood',
    canWriteKnowledge: profile !== 'ci-batch',
    canExecute: true,
    requiresHumanPresence: profile === 'interactive',
  };
}
```

**Impact:** New execution profiles automatically declare their capabilities rather than
requiring updates to multiple `Record<ExecutionProfile, boolean>` maps scattered across
the codebase.

### Revised Backlog Items After Full Audit

Items **eliminated** by structural derivation:
- ~~P1-5 ("Update seed templates for new element types")~~ — verb vocabulary derived from role
- ~~P4-4 ("Seed a default variance profile")~~ — synonym source is structural, not configured

Items **simplified:**
- P3-2 (`inferredAction`) — becomes a pure lookup on (verb, role) instead of text inference
- P4-2 (entropy injector) — synonym injection uses role-derived vocabulary, no external config needed
- P1-4 (demo harness) — new elements auto-classify, no archetype code changes

Items **added from initial audit:**
- P1-1 extended: `ACTION_SYNONYMS` table alongside `ROLE_AFFORDANCES` in same module
- P1-6 (new): Refactor `classifyElements()` and `AFFORDANCE_VERBS` to derive from role table

Items **added from deep codebase audit:**
- P1-7 (new): Consolidate `sourceToRung` — eliminate duplicate in `fitness.ts`, derive from strategy metadata
- P1-8 (new): Derive failure classification from receipt rung traversal, eliminate `classifyFailure()` thresholds
- P1-9 (new): Derive `autoHealClass` from `(artifactType, provenanceKind)` tuple
- P1-10 (new): Formalize `SIGNAL_RELIABILITY` table for screen identification weights
- P1-11 (new): Derive execution profile capabilities from posture, eliminate scattered boolean records
- P5-4 (new): Refactor `DashboardEventKind` to template literal type from concept × operation

### New Backlog Items Detail

#### P1-7. Consolidate winning-source-to-rung mapping

**Problem:** `WINNING_SOURCE_TO_RUNG` (15 entries) in `lib/domain/kernel/visitors.ts:295-311`
is duplicated as `sourceToRung` (11 entries) in `lib/application/fitness.ts:141-153`.
The fitness copy is a subset that can drift.

**Fix:** Delete the fitness copy. Export the canonical mapping from `visitors.ts` (or better,
derive it from the strategy registry's rung declarations). All consumers use the single source.

**Files:** `lib/domain/kernel/visitors.ts`, `lib/application/fitness.ts`

**Acceptance:**
- Law test: every `StepWinningSource` value maps to exactly one `ResolutionPrecedenceRung`
- No duplicate mapping exists anywhere in the codebase
- `grep -r 'sourceToRung' lib/` returns exactly one definition

#### P1-8. Derive failure classification from receipt structure

**Problem:** `classifyFailure()` in `lib/application/fitness.ts:54-83` uses magic numeric
thresholds (`0.15`, `0.34`) and string matching on `winningSource` to classify failures.
`FAILURE_TO_SIGNAL` (lines 182-199) maps these classes to bottleneck signals with
hand-authored weights.

**Fix:** Replace with a derivation over the resolution receipt's rung traversal trace
and the already-typed `TranslationReceipt.failureClass` enum. Bottleneck weights are
already computed by `computeBottleneckCorrelations()` — remove the hand-authored ones.

**Files:** `lib/application/fitness.ts`

**Acceptance:**
- No magic numeric thresholds in failure classification
- Failure class is derived from receipt fields, not ad-hoc string matching
- Adding a new resolution strategy does not require updating failure classification

#### P1-9. Derive auto-heal class from proposal provenance

**Problem:** Proposals carry a hand-assigned `autoHealClass` string. The trust policy
checks this against `forbiddenAutoHealClasses`. The mapping from proposal → heal class
is implicit and scattered.

**Fix:** Add `deriveAutoHealClass(artifactType, provenanceKind)` pure function. Remove
hand-assigned `autoHealClass` fields from proposal construction sites.

**Files:** `lib/domain/governance/trust-policy.ts`, `lib/application/activate-proposals.ts`

**Acceptance:**
- No hand-assigned `autoHealClass` strings in proposal construction
- `deriveAutoHealClass` is a pure function with exhaustive pattern match
- Law test: `('hints', 'live-dom')` → `'runtime-intent-cutover'`

#### P1-10. Formalize signal reliability table for screen identification

**Problem:** `lib/runtime/screen-identification.ts:166-174` uses inline magic numbers
for signal weighting (`2.0`, `1.5`, `1.0`).

**Fix:** Extract to a `SIGNAL_RELIABILITY` constant in the domain layer, alongside the
role-affordance table. Codifies the HTML/ARIA signal reliability hierarchy.

**Files:** `lib/domain/widgets/role-affordances.ts` (or new `signal-reliability.ts`),
`lib/runtime/screen-identification.ts`

**Acceptance:**
- No inline weight constants in screen identification
- Signal weights are a reviewable, testable domain constant
- Law test: `'title'` weight > `'heading'` weight > default weight

#### P1-11. Derive execution profile capabilities

**Problem:** `PROFILE_AUTO_APPROVAL` in `trust-policy.ts:87-91` is a hand-authored
`Record<ExecutionProfile, boolean>`. Similar per-profile boolean maps may exist elsewhere.

**Fix:** Define `ProfileCapabilities` interface and `deriveCapabilities(profile)` function.
All profile-specific behavior queries this derivation instead of maintaining separate maps.

**Files:** `lib/domain/governance/trust-policy.ts`, `lib/domain/types/workflow.ts`

**Acceptance:**
- `PROFILE_AUTO_APPROVAL` record eliminated
- `deriveCapabilities('dogfood').canAutoApprove === true`
- Adding a new execution profile requires updating exactly one function

#### P5-4. Refactor dashboard event kinds to template literal type

**Problem:** `DashboardEventKind` is a 40+ member hand-enumerated string union.

**Fix:** Refactor to template literal type: `${PipelineConcept}-${LifecycleOp}`.
Declare valid combinations as a const assertion. Consumers can match on concept or
operation independently.

**Files:** `lib/domain/types/dashboard.ts`, all `dashboardEvent()` call sites

**Acceptance:**
- `DashboardEventKind` is generated from concept × operation, not hand-listed
- Adding a new concept generates a family of events automatically
- Existing event string values are preserved (backward compat)

---

## Sequencing Summary

```
Week 1          Week 2          Week 3          Week 4          Week 5+
────────        ────────        ────────        ────────        ────────

P0-1,P0-2       P1-1,P1-2       P1-4,P1-6       P3-3,P3-4       P4-3
(test suite)    (role table +    (demo harness   (patch apply +   (wire entropy
                 dispatcher +     + archetype     supplementary)   into speedrun)
                 synonyms)        refactor)

                P2-1,P2-2       P1-3            P4-1,P4-2        P5-1,P5-2
                (route schema   (role in         (entropy         (briefing +
                 + writer)       resolution)      schema +         decay)
                                                 injector)

                P2-3,P2-4,P2-5  P3-1,P3-2                        P5-3
                (route wiring    (proposal                        (CI trigger)
                 + seeding)      enrichment)
```

**Critical path:** P0 → P1-1 → P1-2 → P1-3 → P3-1 → P3-2 → P3-3 → P4-2 → P4-3

**Eliminated items (subsumed by structural derivation):**
- ~~P1-5~~ — seed template updates derived from role-affordance synonym table
- ~~P4-4~~ — default variance profile unnecessary when synonyms are structural

**Added items:**
- P1-6 — refactor `classifyElements()` and `AFFORDANCE_VERBS` to derive from role table

**Parallel tracks:**
- Route knowledge (P2-*) is independent of role derivation and can start in Week 2
- Operational surface (P5-*) is fully independent and can proceed anytime

## Measurement Gates

After each phase, run the convergence proof and compare:

```bash
npx tsx scripts/convergence-proof.ts --trials 2 --count 50 --max-iterations 5 --mode diagnostic
```

| Gate | Expected Hit Rate | Key Metric Change |
|------|------------------|-------------------|
| Post-Phase 0 | 4–9% (baseline, unchanged) | Tests pass |
| Post-Phase 1 | 12–18% | Widget coverage ratio doubles; new element types resolve |
| Post-Phase 2 | 15–22% | Navigation steps resolve at rung 3 instead of rung 11 |
| Post-Phase 3 | 25–35% | Effective hit rate (resolve AND execute) approaches raw hit rate |
| Post-Phase 4 | 35–45% | Per-iteration learning rate doubles with variance injection |

The vision target of 40%+ hit rate is achievable by the end of Phase 4 if each phase delivers its expected improvement. The compounding effect of wider widget coverage, richer proposals, and higher entropy means the combined impact exceeds the sum of individual contributions.
