# Customer-Backlog Fixtures

> Status: active — Step 11 Z11a (v2-compounding-engine, customer-compilation cohort).

Synthetic ADO test-case corpus backing the `customer-compilation`
cohort of the compounding engine. Cases are shaped as real ADO
snapshots (see `product/domain/intent/types.ts:AdoSnapshot`) and
loaded by `tesseract compile --emit-compounding-receipt`
(Z11a.4) to drive the compile pipeline end-to-end.

## Two corpuses, complementary invariants

| Corpus | ADO id range | Invariant tested | Hypothesis kind |
|---|---|---|---|
| `resolvable/` | 90001–90099 | Happy-path resolution — every referenced surface exists in the synthetic-app substrate and is resolvable-in-principle with a capable adapter or seeded catalog | `confirmation-rate` |
| `needs-human/` | 90101–90199 | Escalation correctness — every referenced surface is structurally absent from the substrate, so the compile pipeline must emit a well-formed `InterventionHandoff` | `intervention-fidelity` |

The ADO id range 10000–19999 is reserved for the retired v1
dogfood corpus (`dogfood/fixtures/ado/10001.json` etc); customer-
backlog uses 90000+ to avoid collisions and signal "synthetic-
authored, not ADO-synced."

## Why "resolvable" is aspirational under Z11a

Under the current deterministic Reasoning adapter (no live LLM,
no operator-seeded catalog), the compile pipeline's binder will
hit the 7th lookup slot (`needs-human`) for nearly any ADO text
because there's no catalog to resolve against and no reasoning
adapter to bridge. **This means the resolvable corpus's
confirmation rate under Z11a will be mostly zero** — the
hypothesis refutes, and the compounding engine reports this as
the load-bearing gap.

That is the intended signal: the receipt trajectory *measures*
how much of the resolution gap the deterministic adapter alone
can close, which is currently almost none. Two upgrade paths
raise the trajectory:

1. **Z11d** — me-as-live-adapter lands; `Reasoning.select` can
   reason about "Identifier field" → the login-form preset's
   textbox.
2. **Catalog seeding** — operator-authored canon entries under
   `product/catalog/` map the corpus's phrasing to concrete
   screen/element ids.

Either (or both) lifts the resolvable corpus's confirmation
rate. The `needs-human` corpus is *adapter-invariant*: no
adapter can make a missing surface appear, so the intervention-
fidelity trajectory isolates pipeline escalation behavior from
reasoner capability.

## Surface coverage of the resolvable corpus

Every referenced surface exists in the synthetic-app substrate
via one of the six preset topologies
(`workshop/substrate/test-topology-catalog.ts`):

| ADO id | Title | Substrate preset | Verbs exercised |
|---|---|---|---|
| 90001 | Login with valid credentials | `login-form` | navigate, interact (input × 2, click), observe |
| 90002 | Login form rejects empty submission | `login-form` | navigate, interact (click), observe (alert) |
| 90003 | Prefilled form saves without edits | `prefilled-form` | navigate, observe, interact (click) |
| 90004 | Invalid-field describedBy error | `validation-error-form` | navigate, observe (aria-invalid), observe (describedBy) |
| 90005 | Tab switching reveals tabpanels | `tabbed-interface` | navigate, observe, interact (click × 2) |
| 90006 | Paginate through multi-page grid | `paginatedGrid` | navigate, observe (rowheaders), interact (click × 2) |
| 90007 | Landmark regions + nav link | `landmark-page` | navigate, observe (landmarks, heading), interact (click) |
| 90008 | Submit-button disambiguation | `login-form` | navigate, observe (role+name), interact (click) |

All eight cases are "resolvable-in-principle": each references
surfaces the synthetic-app actually renders, each has unambiguous
role+name pairs, each has a deterministic expected outcome.

## Surface coverage of the needs-human corpus

See `needs-human/README.md` and `docs/v2-synthetic-app-surface-backlog.md`
for the list of missing substrate surfaces each case exercises.
The needs-human corpus is *designed* to outrun substrate
capability — that's what makes the intervention-fidelity
judgment meaningful.

## Authoring guidance

When adding a new case:

1. **Pick an ADO id in the reserved range** (90xxx for
   customer-backlog; `resolvable/` uses 9000x–9009x;
   `needs-human/` uses 9010x–9019x).
2. **Reference only synthetic-app surfaces** (resolvable) OR
   **reference only substrate gaps** (needs-human). Mixed cases
   go in neither corpus.
3. **Use HTML-wrapped action/expected text** (`<p>...</p>`) per
   the real ADO format convention shown in
   `dogfood/fixtures/ado/10001.json`.
4. **Keep steps to 3–5 per case.** Long cases obscure the
   per-step confirmation rate; short cases produce sharper
   signal.
5. **Author the matching hypothesis** under
   `workshop/observations/fixtures/` when you want the case's
   receipts counted toward a prediction.

## Relationship to the scenario corpus

The scenario corpus at `workshop/scenarios/corpus/*.scenario.yaml`
is structurally different: those files are test-harness
scenarios with pre-bound verb + target bindings
(`probe.verb: interact`, `probe.input.target: { role: button, name: "Submit" }`).
They skip the compile pipeline's binder entirely and feed the
scenario-verify runner directly.

Customer-backlog ADO fixtures are raw customer-input — text
descriptions that must traverse parse → bind → emit. They
exercise the full product pipeline, including the adapter + catalog
seams the scenario corpus bypasses.
