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
- It cannot ship to a customer with `workshop/` infrastructure coupled to it. `product/` graduates as a standalone npm package when its shipping-claim curve sustains (see `docs/v2-transmogrification.md §6.2`).

## When working here

Read `docs/v2-direction.md §1` and `docs/coding-notes.md` before touching code. If your change adds a new verb, new handshake, or new level, walk the full descent protocol in `docs/v2-transmogrification.md §11`. If your change is local (bug fix, refactor, test), apply the light discipline in §11.4a.
