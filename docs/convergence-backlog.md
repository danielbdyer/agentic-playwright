# Convergence Execution Backlog

> Status: Active — derived from `docs/convergence-roadmap.md`, sequenced for execution.

This backlog translates the convergence roadmap into concrete, ordered work items. Each item identifies the files to change, the invariants to hold, and the acceptance criteria to verify.

## Architectural Revision: Role-Derived Widget Affordances

The original roadmap (Workstream A) proposed hand-authoring widget handlers per widget type — `os-select.ts`, `os-checkbox.ts`, etc. This is the same alias treadmill that A1 (ADR collapse) eliminated for step text resolution. The correct approach is to derive widget affordances deterministically from ARIA role signatures.

**The insight:** The WAI-ARIA specification defines a closed set of roles with fixed interaction semantics. A `role="checkbox"` element has exactly two state-changing affordances: `check` and `uncheck`. A `role="combobox"` has: `fill`, `selectOption`. Playwright's API already mirrors these semantics — `locator.check()`, `locator.selectOption()`, `locator.fill()`. The mapping from ARIA role to legal Playwright interaction is a pure function over a fixed standard. It requires no learning, no proposals, and no operator authoring.

**What this replaces:** Instead of N hand-authored widget handler files and N hand-authored capability contracts, we build one role-affordance derivation table in the domain layer and one role-based dispatcher in the runtime layer. The existing `lib/runtime/widgets/` directory and `lib/domain/widgets/contracts.ts` become legacy — subsumed by the derivation.

**What this preserves:** The `WidgetCapabilityContract` interface remains useful as the *output type* of the derivation. The `interact()` function in `lib/runtime/interact.ts` remains the dispatch surface. The change is in how contracts and handlers are *produced* — derived from role, not authored per type.

---

## Phase 0: Test Suite Rehabilitation

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

## Sequencing Summary

```
Week 1          Week 2          Week 3          Week 4          Week 5+
────────        ────────        ────────        ────────        ────────

P0-1,P0-2       P1-1,P1-2       P1-4,P1-5       P3-3,P3-4       P4-3,P4-4
(test suite)    (role table +    (demo harness   (patch apply +   (wire entropy
                 dispatcher)      + seeds)        supplementary)   into speedrun)

                P2-1,P2-2       P1-3            P4-1,P4-2        P5-1,P5-2
                (route schema   (role in         (entropy         (briefing +
                 + writer)       resolution)      schema +         decay)
                                                 injector)

                P2-3,P2-4,P2-5  P3-1,P3-2                        P5-3
                (route wiring    (proposal                        (CI trigger)
                 + seeding)      enrichment)
```

**Critical path:** P0 → P1-1 → P1-2 → P1-3 → P3-1 → P3-2 → P3-3 → P4-2 → P4-3

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
