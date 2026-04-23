# Synthetic-App Surface Backlog

> Status: active — Step 11 Z11a. Living document tracking substrate surfaces needed for customer-realistic ADO coverage but not yet supported by `workshop/synthetic-app/server.ts`.

## Purpose

The synthetic-app substrate is the closest-to-production surface
the compounding engine has access to without a real customer
OutSystems app. Every gap between what the substrate renders
and what a customer backlog typically references is a gap
between the workshop's measurement surface and the real product
problem. This doc names those gaps honestly so:

1. **The `needs-human/` ADO corpus** can exercise real missing
   surfaces (not fabricated ones), making the intervention-
   fidelity judgment adapter-invariant.
2. **Substrate work** can be prioritized against actual customer
   coverage gaps rather than internal test convenience.
3. **The "structural-plus-narrow → substantive" ladder** in
   verdict-10 gains a concrete axis: surface coverage parity
   with customer reality.

## Surface inventory today

Landed in Step 6 (per `workshop/observations/probe-spike-verdict-06.md`
+ `workshop/observations/probe-spike-verdict-07.md`):

- 27 `SurfaceRole` variants (`workshop/substrate/surface-spec.ts:39`).
- 6 preset topologies (`login-form`, `validation-error-form`,
  `prefilled-form`, `tabbed-interface`, `paginatedGrid`,
  `landmark-page`).
- Entropy axes: `wrapperDepth`, `chromeTone`, `spacingDensity`,
  `siblingJitter`, `surfaceOrder`, `calloutShuffle`, `badgeSubset`.
- Form axes: `submitReveal`, `required`, `invalid`, `describedBy`,
  `initialValue`.
- 4 input backings: `native-input`, `native-textarea`,
  `div-with-role`, `contenteditable`.
- 30 probe fixtures across 9 manifest verbs.

## Surface gaps ranked by customer-reality weight

Importance rubric:
- **high** — blocks authoring coverage for >20% of a typical
  OutSystems backlog's scenarios.
- **medium** — blocks coverage for 5–20% of scenarios; common in
  specific verticals (forms-heavy, data-heavy).
- **low** — rare but named for completeness.

| Gap | Importance | Customer-reality shape | Sketch of substrate work |
|---|---|---|---|
| **Modal dialog** (`dialog` / `alertdialog` roles) | high | Confirmation modals, error lightboxes, form modals — ubiquitous in OutSystems patterns | Add `'dialog'` + `'alertdialog'` to `SurfaceRole`; new preset `modal-confirm` with backdrop + focus-trap semantics; modal-reveal axis |
| **Date picker** | high | Core form widget; most customer forms have at least one date field | Add `'date-picker'` composite surface (input + trigger button + calendar grid); new preset `date-input-form`; new input backing `date-input` |
| **Filterable/sortable table** | high | Data grids with column sort + text filter are the canonical OutSystems Reactive pattern | Extend `paginatedGrid` with sort-button row headers + a `filter-textbox` search region; add a `sorted-state` preset axis |
| **File upload** | medium | Document upload is a common customer flow (policy attachments, evidence, etc.) | Add `'file-upload'` to `SurfaceRole`; new input backing `file-input`; preset `single-file-upload` |
| **Multi-select picker** | medium | Check-all dropdowns, tag pickers, multi-entity selectors | Add `'multiselect'` composite (combobox + listbox with multiple selectable items); extend `combobox` preset; selection-state axis |
| **Wizard with progress bar** | medium | Stepwise onboarding, claim filing, approval workflows — any multi-step form lives here | New preset `wizard-3-step` with `meter` / `progressbar` role + step-N visibility axis; requires lightweight client-side state-transition mechanism (currently URL-driven only) |
| **Error banner distinct from field-level error** | medium | Form-scoped errors (e.g., "save failed: network timeout") distinct from per-field validation | Add `error-banner-preset` with separate form-level `alert` landmark + per-field `describedBy`; dual-scope rendering axis |
| **Loading / skeleton state** | medium | Progressive disclosure; async data fetches with placeholder UI | New preset `deferred-content` with `status` role + skeleton DOM + `detachAfterMs` axis; probe would assert skeleton-then-populated transition |
| **Read-only vs editable toggle** | low | Edit-mode toggles on detail screens | Extend form presets with `readOnlyMode` boolean axis; disabled→enabled mutation |
| **Role-only surfaces (no accessible name)** | low | Current substrate names nearly every surface; role-only queries exercise the locator ladder's fallback path | Add `name-suppressed` axis to existing presets — do not emit aria-labels, force role-only disambiguation |
| **Duplicate-name disambiguation** | medium | Three "Save" buttons at different scopes; must pick the right one | New preset `duplicate-name-buttons` with 3 buttons identical role+name but distinct `surfaceId`s; tests locator ladder's surfaceId-fallback slot |
| **Dynamic content injection** | medium | Live-updating content (toast notifications, incoming messages, status pushes) | `detachAfterMs` axis already supports transient content; needs a `status-push` preset that spawns an alert after N ms |
| **Keyboard-only navigation surfaces** | low | Tab order, focus trap, access keys | Focus-order axis per surface; preset `keyboard-nav-form` with explicit `tabindex` values |
| **Conditional render based on prior input** | medium | "If country = US, show state dropdown" — cross-field dependencies | Needs client-side state tracking between form fields; requires substrate runtime to evolve beyond URL-to-DOM |

## Fundamental substrate constraints

Some gaps are not "missing presets" but reflect architectural
choices in the substrate:

- **URL-driven re-render model.** Every state change is a URL
  change. Real SPA patterns (client-side routing, in-place state
  mutation, optimistic UI) are not representable. Wizards,
  filters, and dynamic tables all hit this ceiling.
- **No browser-runtime-only verbs.** The substrate exercises
  rungs 1–3 (DOM + role + name-based location); verbs that
  require Playwright-live behavior (retries, network hooks, real
  timers) live in the integration harness, not the substrate.
- **No stateful backend.** The substrate has no database, no
  session, no auth. Form submits that "require the user's
  previous input" can't be modeled beyond single-session reveals.

These are intentional for substrate-drift isolation (see
`docs/v2-probe-ir-spike.md §8.4`). Upgrading them is a substrate-
epoch decision, not a preset addition.

## Priorities for next substrate work

Based on frequency in typical customer backlogs:

1. **Modal dialog** — unblocks confirm-action, error-modal,
   form-in-modal scenarios. ~1–2 days substrate work + 2 new
   `needs-human/` ADO cases that *become* resolvable.
2. **Filterable/sortable table** — unblocks data-grid scenarios
   which are a major customer pattern. ~2–3 days substrate work
   (requires state mutation or URL-encoded filter params).
3. **Date picker** — unblocks temporal form fields. ~1 day
   substrate (with URL-encoded date as the simplest path).
4. **Multi-step wizard** — requires substrate runtime evolution
   to support state transitions between steps. ~1 week; defer
   until the substrate's URL-re-render ceiling is formally
   revisited.

Each promotion from `needs-human/` to `resolvable/` is a concrete
compounding-engine forward step: substrate coverage rises, the
needs-human trajectory's denominator shrinks, and the resolvable
trajectory's numerator rises. Neither gate is faked; both move
based on real substrate capability.

## Relationship to the compounding engine

This backlog is the **downstream reading** of what the
compounding engine's gap analysis should eventually surface
automatically. Today, `compounding-improve` ranks probe-coverage
gaps and scenario-corpus failures; it does not yet project
missing substrate surfaces. When the customer-compilation cohort
begins producing receipts with populated `reason` fields on
needs-human outcomes, `compounding-improve` can aggregate those
reasons into a "surface gap rollup" that mirrors this doc
semi-automatically. Deferred until the cohort has accumulated
enough receipts to cluster.

## Update cadence

This doc is curated — substrate PRs that close a gap should
delete the row here in the same commit. The `Surface gaps`
table is append-only for new gaps; gap closures are deletions.
