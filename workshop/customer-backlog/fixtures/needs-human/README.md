# Needs-Human ADO Corpus

Every case in this directory intentionally references surfaces,
widgets, or behaviors the synthetic-app substrate
(`workshop/synthetic-app/server.ts`) does **not** render. Under
**any** reasoning adapter — deterministic, live-API, or
claude-code-session — these cases cannot resolve because the
surface isn't there to bind to. The compile pipeline must emit
a well-formed `InterventionHandoff` for each unresolvable step.

That property makes this corpus the **adapter-invariant** probe
of the escalation path. Resolvable-corpus confirmation rates
rise and fall with adapter capability; needs-human confirmation
rates isolate "does the pipeline escalate correctly when it
can't resolve?" from "does the adapter know how to resolve?"

## One case per substrate gap

Each case corresponds to a row in
`docs/v2-synthetic-app-surface-backlog.md`. As substrate work
closes a gap, the corresponding case promotes from `needs-human/`
to `resolvable/` — the deletion of the row in the backlog doc,
the move of the JSON file, and the commit that lands the
substrate surface all happen together.

| ADO id | Backlog row | Substrate gap | Importance |
|---|---|---|---|
| 90101 | Modal dialog | `dialog` / `alertdialog` roles absent from SurfaceRole union | high |
| 90102 | Date picker | No composite date widget; no calendar grid render | high |
| 90103 | Filterable / sortable table | paginatedGrid is static links; no sort or filter state | high |
| 90104 | File upload | No `file-upload` role; no file-input backing | medium |
| 90105 | Multi-select picker | combobox is single-select only | medium |
| 90106 | Wizard with progress bar | No progressbar role; no multi-step state machine | medium |
| 90107 | Error banner vs field error | No dual-scope rendering axis | medium |
| 90108 | Loading / skeleton state | `detachAfterMs` exists but no `status` skeleton preset | medium |
| 90109 | Read-only vs editable toggle | Static disabled; no state mutation | low |
| 90110 | Role-only disambiguation | Every substrate surface is named | low |
| 90111 | Duplicate-name buttons | Distinct surfaceIds exist but no fixture exercises the 3×same-name pattern | medium |
| 90112 | Dynamic content injection | `detachAfterMs` is spec'd; no toast-style preset renders transient alerts | medium |
| 90113 | Keyboard-only navigation | No focus-order axis per surface | low |
| 90114 | Conditional field reveal | URL-driven re-render model; no cross-field state dependency | medium |

14 cases × 3–4 steps = 46 steps total.

## Why every case is expected to emit a handoff

The compile pipeline's binder walks the 7-slot lookup chain:

1. explicit scenario fields
2. operator override
3. approved knowledge (catalog)
4. shared patterns
5. prior evidence or run history
6. live DOM exploration
7. **needs-human**

For a resolvable case, some slot 1–6 resolves and the step
produces a `ResolvedReceipt`. For a needs-human case here, every
slot misses:

- Slot 1 (explicit): no scenario-level binding; the ADO is raw
  text.
- Slot 2 (override): no operator override for non-existent
  surfaces.
- Slot 3 (catalog): no approved canon for surfaces the substrate
  can't render.
- Slot 4 (patterns): no shared pattern matches "date picker" or
  "file upload" because those shapes aren't in the pattern
  library.
- Slot 5 (evidence): no prior run records reference surfaces
  the substrate hasn't rendered.
- Slot 6 (live DOM): under dry/diagnostic mode, no browser;
  under playwright-live, the substrate's DOM lacks the target.
- **Slot 7 (needs-human)**: fires; an `InterventionHandoff` is
  emitted.

The intervention-fidelity judgment evaluates whether the handoff
carries a mechanically-valid `missingContext` payload (Z11a) or
semantically names the right ambiguity (Z11d upgrade).

## Promoting a case to resolvable/

When substrate work renders a gap's surface:

1. Confirm the case's action text resolves end-to-end against
   the new preset.
2. Delete the row in `docs/v2-synthetic-app-surface-backlog.md`.
3. Move the JSON file from `needs-human/` to `resolvable/` and
   renumber it into the 90001–90099 range (pick the next free
   id).
4. Update both corpus READMEs' coverage tables.
5. Land the substrate preset + the corpus move + the doc
   deletion in a single commit so the three states stay in sync.

The corpus structural laws at
`tests/compounding/customer-backlog-corpus.laws.spec.ts` enforce
id-range discipline; a promoted case failing to renumber will
fail the ZC34.c laws.

## Authoring new needs-human cases

Add a new row to the backlog doc first; this corpus is keyed to
it. If the gap is not in the backlog doc, it shouldn't exist
here — the gap is either wrongly classified or should be
authored into the substrate rather than codified as a
permanent needs-human target.
