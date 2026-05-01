# TodoMVC ADO Fixtures (Journal Appendix)

> Status: experimental, journal-adjacent (2026-05-01).
> These fixtures exist as evidence for `docs/v2-cold-start-todomvc-journal.md`
> and are NOT yet committed cohort infrastructure. The
> `workshop/customer-backlog/public-aut/` cohort home named in
> `docs/v2-cold-start-cohort-spike.md §7` is not built yet; when
> it is, these fixtures move there and get re-keyed under the
> cohort's reserved ID range.

## Contents

- `91001-todomvc-add-todo.ado.json` — add a todo (training-side
  sanity case)
- `91002-todomvc-mark-complete.ado.json` — mark a todo complete
- `91003-todomvc-filter-active.ado.json` — filter to active todos

## Provisional ID range

`91000–91999` is provisionally reserved for the public-AUT
cohort. The customer-backlog README (lines 18–21) reserves
`90001–90099` for resolvable, `90101–90199` for needs-human, and
`10000–19999` for the retired v1 dogfood. `91xxx` avoids all
three. The actual reservation lands when the cohort manifest
schema does.

## Target AUT

All three fixtures target the same training-side AUT:
`https://todomvc.com/examples/react/dist/`. The `targetAut`
field is **not yet part of the AdoSnapshot schema**; this
journal appendix documents the dependency. Until the schema
gains the field, the AUT URL is implicit in the fixture's
directory location.
