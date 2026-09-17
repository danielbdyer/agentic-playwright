# Substrate Reality Study — first real Reactive contact

> Status: study (2026-09-16); §§9–10 record the alignment that landed
> on 2026-09-16/17 and the single held-out evaluation. First harvest
> of a genuine OutSystems Reactive substrate through the Z11g.d.0a
> harness. Companion to
> `docs/v2-substrate-source-survey.md` (which was Traditional Web and
> said so) and `docs/v2-substrate-ladder-plan.d0a-harness-design.md`
> (whose Q1 — "confirmed Reactive URL" — this study closes). The
> corpus is real; the recommendations are grounded in it, not in
> assumptions about OS DOM shape.

## 0. The verdict in one sentence

**Real OutSystems Reactive DOM disagrees with both the synthetic
substrate and the product's resolution logic in four load-bearing
ways — it is named by content and placeholder rather than by
accessible name, roughly a quarter of its interactive controls carry
no ARIA role at all, it is identified by a runtime global plus
`data-block` density rather than by React fibers or dense `osui-*`,
and it nests blocks far deeper than any synthetic topology — so the
generic-across-Reactive work is to teach the substrate to *exhibit*
those four shapes and the ladder to *resolve* them, measuring each
against the held-out routes that were never harvested.**

## 1. Corpus and method

- **AUT:** the OutSystems UI website
  (`outsystemsui.outsystems.com/OutSystemsUIWebsite/`), OutSystems'
  own public showcase of the OutSystems UI framework. Anonymous, no
  login, no consent banner, no robots.txt served. First-party
  Reactive output — the platform's own generator, so a low-variance
  central-tendency seed (the same role the Traditional Style Guide
  played for the source survey).
- **Partition (clean room):** declared before contact at
  `workshop/substrate-study/corpus/outsystems-ui-website.partition.json`.
  Seven **study** routes, fourteen **held-out** sample screens,
  thirteen **out-of-scope** documentation screens. The harvest guard
  (`workshop/substrate-study/application/study-partition.ts`) refuses
  any non-study route before navigation; a held-out route exits 30
  with no record. **No held-out route was fetched in this study.**
- **Method:** the Z11g.d.0a external-snapshot harness — four-phase
  hydration detection, in-page DOM walk, variant classification, PII
  gate. One URL per invocation, disclosed User-Agent, snapshots keyed
  by the host's own Reactive `versionToken` (`Ov_NiUhPHp8ffKKXiJmiNA`,
  sequence 5375). Snapshots are gitignored; the measurements below are
  the retained artifact.
- **Evidence discipline** (inherited from the source survey §1.3): a
  finding is **corpus-backed** when it holds on ≥5 of the 7 study
  routes, **partial** when 2–4, **single-route** otherwise.

### 1.1 What captured

| Route | nodes | hydration verdict | variant (recalibrated) |
|---|---|---|---|
| (home) | 275 | stable | reactive |
| Employeesdirectory | 1227 | sensitive-content-detected (1 redaction) | reactive |
| PatternsOverview | 1051 | stable | reactive |
| Productcatalog | 377 | stable | reactive |
| Productform | 112 | stable | reactive |
| Requestmanagement | 385 | stable | reactive |
| Transactionsdashboard | 349 | stable | reactive |

Six of seven stable on first contact; the employee directory tripped
the PII gate (one email-shaped label redacted before write, verdict
downgraded to `sensitive-content-detected`) — the gate working as
designed, not a capture failure.

## 2. Findings — what is generic across Reactive

### F1. Reactive is identified by its runtime, not by React (corpus-backed, 7/7)

OutSystems Reactive is React-based but renders through its own
`OSFramework` runtime. Across a 377-node catalog page, exactly **one**
DOM node carried a `__reactFiber*` key (the root container); the
walker's fiber probe (which `break`s after the first element) never
saw it. `__OSVSTATE` (the Traditional-Web marker) is absent on all
seven routes, correctly.

What IS present on every route, and absent from non-OutSystems pages:

- `window.OutSystems` and `window.OSFramework` runtime globals.
- The runtime bundle (`OutSystemsReactView.js`, `OutSystems.js`) in
  the script list.
- `data-block` containers — **442** across the corpus, 11–164 per
  route, 10–18 distinct block names each. This is the compiled unit
  of a Reactive screen and the strongest structural marker.

`osui-*` classes exist but are **sparse and component-scoped**:
2–22 first-token classes per route (`osui-search`, `osui-gallery`,
`osui-deprecated`), 1–4 distinct classes each — below the old
detector's floor on 4 of 7 routes.

> The old `classifyVariant` required **≥3 `osui-*` first-token classes
> AND a React/Angular/Vue marker**. Both premises are false on real
> Reactive; the rule classified all seven genuine pages `not-reactive`.

### F2. Elements are named by content and placeholder, not accessible name (corpus-backed, 7/7)

Of 435 elements that resolved to an accessible name across the corpus:

| naming path | count | share |
|---|---|---|
| element content (button/link/tab text) | 352 | 81% |
| `aria-label` | 60 | 14% |
| `aria-labelledby` | 12 | 3% |
| `<label for>` | 6 | 1% |
| `placeholder` (as the sole name) | 4 | 1% |
| wrapping `<label>` | 1 | <1% |

The synthetic substrate names every surface by an explicit accessible
name. Real Reactive almost never does. Two sub-findings:

- **Search inputs are placeholder-named** (partial, 5/7). Every route
  with a search box named it by `placeholder` alone — no label, no
  `aria-label`. ~~Playwright's `getByRole('textbox', { name })` does not
  match placeholder; only `getByPlaceholder` does.~~ **Refuted
  empirically on 2026-09-16 — see §9.1**: the role query resolves a
  placeholder-named input; the gap is in the surface index, not the
  locator kind.
- **True forms use `<label for>`** (single-route: Productform, 6 of 7
  inputs). The only genuine data-entry form in the study named its
  inputs by `<label for=id>`, which the v1 walker did not resolve at
  all (it read `aria-label`/`aria-labelledby` only).

### F3. ~24% of interactive controls carry no ARIA role (corpus-backed, 7/7)

On Productcatalog, a precise probe found **28 role-addressable
elements out of 37 total clickable** — the remaining nine are
`div`/`span` with `cursor: pointer` and no `role`. Among them are real
controls: a "Filter" toggle, "Back to Overview", pagination-previous,
section-expandable headers. Native `<button>` is used sparingly
(1–12 per route); most affordances are `<a>` links (12–196 per route,
almost never with an explicit role) and roleless clickable `<div>`s.
`div[role=button]` appears but is rare (0–10 per route).

The entire resolution ladder queries a role-and-name surface index.
A quarter of real interactive targets are invisible to it.

### F4. Landmarks are 100% reliable (corpus-backed, 7/7)

`banner` + `navigation` + `main` on every route; `search` on the four
list/gallery routes; `region` on two. This is the one axis where real
Reactive is *more* structured than the synthetic substrate, and the
cheapest reliable scoping signal available. The product's
`TargetShapeHint.inLandmark` exists but is never populated by the
classifier.

### F5. IDs are structural, not semantic (corpus-backed, 7/7)

Element ids are block/list-index paths (`bN-Column`, `lN-N_N-$bN`,
`lN-N_N-bN-lN-N_N-$bN`) — the compiled block/list nesting, useless for
semantic location but a strong OutSystems detector pattern in their
own right. Test ids (`data-testid`) exist but are sparse: 12 across
the whole corpus. Real pages nest blocks 3–5 levels deep; synthetic
topologies are shallow.

### F6. The platform vocabulary is `data-*`, not classes (corpus-backed, 7/7)

The most frequent attributes name the platform's own concepts:
`data-container` (975), `data-expression` (483), `data-block` (442),
`data-link` (336), `data-image` (211), `data-icon` (135),
`data-list-item` (74), `data-input` (8), `data-tab` (6). The class
vocabulary is layout utilities (`OSFillParent`, `OSInline`,
`margin-*`, `columns-*`) plus `osblockwidget` (442). A distiller that
keyed on classes would miss the platform's actual structure.

## 3. Changes already landed this session (the method, proven)

These are the corrections reality forced immediately; each is
committed with a law.

| # | Change | File | Why reality forced it |
|---|---|---|---|
| A1 | `__name` shim in the in-page walk | `dom-walk-capture.ts` | The walker threw `ReferenceError: __name is not defined` in every browser under tsx/esbuild `keepNames`; its integration test was deferred to a phase that never ran, so it had **never once executed**. |
| A2 | Variant classifier recalibration | `variant-classifier.ts` | F1. Runtime global + bundle + `data-block` density are the Reactive-positive signals; framework markers demoted to corroborating; `osui-*` read any-position. |
| A3 | `NamingSource` axis + label-for / label-wrap / placeholder / content resolution | `snapshot-record.ts`, `dom-walk-capture.ts` | F2. The walker resolved only `aria-*`; it saw 6 named inputs where real forms have them and would have missed the placeholder- and content-named majority. |
| A4 | Route-partition clean room + harvest guard | `study-partition.ts`, `corpus/*.partition.json` | The spike's §4.4 applied at route granularity, since one host serves many independent screens. |
| A5 | Hydration detector + external harness + CLI | `hydration-detector.ts`, `external-snapshot-harness.ts`, `scripts/harvest-external-snapshot.ts` | The design doc left these as skeletons; they are now the executable harvest. |

## 4. Recommended changes — synthetic model (workshop/)

The substrate must *exhibit* the real shapes before the product's
resolution of them can be measured. Each of these widens the
substrate's axis space (`workshop/substrate/surface-spec.ts` +
`workshop/synthetic-app/`), which is an additive, law-gated move.

- **S1 — placeholder naming axis.** `SurfaceSpec` has `name`,
  `describedBy`, `invalid`, `required`, but no `placeholder`. Add it
  so a textbox can render named *only* by placeholder (F2's search
  inputs). Without this the substrate cannot pose the case that C1
  fixes. *Moves:* input-resolution rate on placeholder-named fields.
- **S2 — `<label for>` realization.** The form renderer names inputs
  by accessible name; add a `<label for=id>` realization path so the
  synthetic form matches Productform's naming (F2). *Moves:* input
  resolution on real forms.
- **S3 — roleless-interactive axis (highest realism gap).** Add a
  surface axis for an interactive element that carries **no role** —
  a `div`/`span` with a click affordance and content text (F3). This
  is the shape that defeats role+name resolution; the substrate has
  no way to render it today, so the ladder's blindness to it is
  currently unmeasurable. *Moves:* click-resolution coverage — the
  single most important number this study exposes.
- **S4 — `data-block` / `data-container` chrome vocabulary.**
  `EntropyProfile` wraps surfaces in `fuzz-shell-N` divs. Real
  Reactive wraps them in `data-block`/`data-container`/`OSInline`/
  `OSFillParent` nesting (F5, F6). Add these as a chrome vocabulary so
  the axis-invariance theorem is tested against the real wrapper shape
  — a classifier that accidentally keys on wrapper structure passes
  today and would break on real `data-block` nesting. *Moves:*
  axis-invariance robustness.
- **S5 — nesting-depth axis.** Real routes are 112–1227 nodes with
  3–5-level block-in-list nesting; synthetic topologies are shallow
  (F5). Add a depth axis to `test-topology-catalog.ts` so path-length
  and sibling-count distributions match. *Moves:* structural-signature
  realism; distillation central-tendency fidelity.

## 5. Recommended changes — product business logic (product/)

These change how the ladder resolves, and are the changes the user's
question was really asking for. Each is scoped to a real file and
gated behind the recalibrated Reactive detection so it never fires on
non-OutSystems DOM.

- **C1 — placeholder locator path.** `LocatorStrategyKind` already
  includes `'placeholder'` but no matcher emits it. The
  `field-input-by-label` pattern
  (`product/domain/resolution/patterns/patterns/`) should try a
  placeholder match when role+name misses. The classifier's `field`→
  `textbox` mapping (`intent-classifier.ts`) is correct; the missing
  half is a placeholder-backed matcher. *Fixes F2; moves input hit
  rate on Reactive from near-zero to most search fields.*
- **C2 — content-named roleless-click resolver (highest leverage).**
  Add a matcher/rung that resolves a `click X` where X is the visible
  text of an element with a click affordance but **no ARIA role** —
  the `div[cursor:pointer]` and bare-`<a>` cases (F3). Every rung
  today queries `SurfaceIndex` by role; ~24% of real controls have no
  role, so they are unreachable regardless of naming. This is the
  single change without which a quarter of a real customer's controls
  can never resolve. *Fixes F3; moves click-resolution coverage.*
- **C3 — landmark-first resolution (cheapest, high precision).**
  Populate `TargetShapeHint.inLandmark` in the classifier for nav
  links (→ `navigation`) and search inputs (→ `search`), and let the
  landmark-scoped matchers consume it. Landmarks are 100% reliable on
  Reactive (F4), so this is precision at near-zero cost. *Fixes F4;
  moves nav/search resolution.*
- **C4 — content as an accessible-name source in product discovery.**
  The study walker now resolves content-naming; the product's own
  discovery / interface-graph (`product/domain/target/`,
  `product/domain/knowledge/discovery.ts`) must resolve accessible
  name the same way (content for buttons/links/tabs), or the catalog
  it builds from a real SUT will be under-named exactly where F2 says
  the names live. *Fixes F2 on the product side; moves catalog
  coverage.*
- **C5 — native-role-first widget posture for Reactive.**
  `PRIMARY_WIDGET_FOR_ROLE` maps roles to `os-*` widgets and
  `LEGACY_WIDGET_ROLE_BRIDGE` maps `os-button`→`button`. Real Reactive
  controls are native `<button>`/`<a>`/`<input>` with `osui-*`
  *styling*, not `os-*` custom elements. The widget layer should treat
  Reactive controls as native-role-first and `osui-*` as advisory, not
  as the widget identity. *Lower priority; moves widget-contract
  accuracy.*
- **C6 — `data-block` as a scoping unit in the OutSystems-generic
  tier.** With Reactive detection now reliable (A2), the
  OutSystems-generic pattern tier can scope resolution by `data-block`
  boundary ("the search field in the results block"), the way the
  synthetic tier scopes by landmark. New generic-matcher opportunity
  once S4 lets the substrate exhibit `data-block`. *Moves:
  disambiguation precision on dense pages.*

## 6. Instrumentation gap (carried from the prior session)

The public-AUT cohort receipt records no page title, final URL, or
accessibility-tree excerpt, so a held-out `not-found` cannot
distinguish a classifier gap from site drift (see the cycle-9
evaluation memo). The `SnapshotRecord` this study produces *does*
capture that structure. Bridge them: the cohort runner should attach a
structural fingerprint (or a `SnapshotRecord` reference) to each
receipt, so the next held-out evaluation is self-explaining. *Moves:
diagnosability of every future foreign-DOM run.*

## 7. Prioritization

1. **C2 + S3** (roleless interactives). The largest reachability gap;
   the substrate change and the product change are a pair — neither is
   measurable alone.
2. **C1 + S1** (placeholder naming). Unlocks real search inputs, the
   most common Reactive first-interaction.
3. **C3** (landmark-first). Cheap, high precision, no substrate change
   needed beyond what already exists.
4. **A2 is the gate** — already landed — that keeps 1–3 from firing on
   non-OutSystems DOM.
5. **S4/S5, C4, C6, §6** follow as the distillation pipeline (Z11g.d.1)
   comes online and needs real central-tendency fidelity.

## 8. Generalization caveat and the held-out reserve

This corpus is **one app**, first-party, low-variance — the floor of
variance, not the mean (the same weakness the source survey named at
its §8.1). Customer apps add theme drift, custom class prefixes, and
denser localization. The fourteen **held-out** routes named in the
partition are the honest test of whether the F1–F6 changes generalize:
after S1–S5 and C1–C6 land, a single-use evaluation against a held-out
route (authored blind, per the clean-room C5) measures whether the
substrate and ladder now match Reactive reality on screens the
canon-graduation pipeline never saw. Spending them before those
changes land would measure nothing. They stay untouched.

## 9. What landed (2026-09-16/17) — synthetic alignment to the findings

Every item below is in code with a law; the substrate is at
**1.1.0** (MINOR: new axes, old semantics preserved — every
pre-existing fixture renders byte-identical DOM). Gates on the final
tree: `npm run build` clean; unit suite 4142 passing; rung-3 parity
**29/29** in a real Chromium; axis-invariance **19/19** including the
new chrome vocabulary.

### 9.1 A correction the work forced: F2 is an *indexing* gap, not a locator gap

§2 F2 claimed "Playwright's `getByRole('textbox', { name })` does not
match placeholder; only `getByPlaceholder` does." Checked against
Chromium + Playwright before any code moved: **false**. The role
query resolves a placeholder-only input, a `<label for>`-named input
and a `<label>`-wrapped input by accessible name (accname step 2D
takes the placeholder when nothing else names the control). Verified
in the same run: `getByRole('generic', { name })` matches nothing, a
bare `<a>` without `href` has no link role, and `getByText` is
role-agnostic (it matched a `div`, a `span` and a `<button>` with the
same text).

Consequence: the search-input problem lives in the **surface index**
— the product must record the accessible name the way accname
computes it (content, placeholder, `<label>`), and the catalog it
builds from a real SUT must too — not in the locator kind. C1 (a
placeholder matcher) still landed, but as an emission/fallback rung
(`getByPlaceholder` provenance; indexes whose naming resolution
recorded the placeholder separately), not as the fix. The substrate's
`accessibleNameOf` states these semantics explicitly and rung-2
predicts rung-3 through it.

### 9.2 Substrate (workshop/) — S1–S5

| # | Change | Where | Law |
|---|---|---|---|
| S1 | `placeholder` axis on form-control roles; `naming: 'none'` yields a placeholder-only control | `workshop/substrate/surface-spec.ts`, `SurfaceRenderer.tsx` | SS4, PT2, I8/I9 |
| S2 | `naming` axis: `aria-label` (default) / `label-for` (sibling `<label for=id>`) / `label-wrap` / `none` | same | SS4; fixtures `fill-label-for-named-field`, `fill-label-wrap-named-field`, `label-for-named-field-visible` |
| S3 | `generic` role (bare `<div>`, no `role` attribute) + `clickable` axis (cursor:pointer + handler) — the roleless interactive | `surface-spec.ts`, `SurfaceRenderer.tsx`, `catalog-projection.ts` | SS5/SS6, PT3/PT4, I10–I13; fixtures `click-roleless-filter-by-text`, `click-roleless-hidden-fails-not-visible`, `fill-roleless-target-fails-assertion`, `roleless-clickable-by-text` |
| S4 | `chromeVocabulary: 'reactive-block'` on EntropyProfile: wrapper layers become `data-block` + `data-container` / `OSInline` / `OSFillParent` with structural ids (`b3-Column`, `l1-0_0-$b2`) | `entropy-profile.ts`, `EntropyWrapper.tsx` | axis-invariance gate (19/19 under two seeds) |
| S5 | `reactive-record-list` topology (banner + nav + main + search landmark, placeholder-only search, roleless "Filter" and "Back to Overview", list-in-blocks 3–5 deep) and `reactive-entry-form` (label-for / label-wrap inputs) | `test-topology-catalog.ts` | fixtures above via `preset:` |
| — | `searchbox` now renders `<input type="search">` | `SurfaceRenderer.tsx` | L-Projection-Terminal |
| — | Probe target grammar shared by rung 2 and rung 3: `{ role, name? }`, `{ placeholder }`, `{ text }` | `workshop/probe-derivation/probe-target.ts`, `classifiers/rung-3/locate-target.ts` | PT1–PT6, parity 29/29 |

Fixture count: interact 9 → 17, observe 7 → 12.

### 9.3 Product (product/) — C1–C5

| # | Change | Where | Law |
|---|---|---|---|
| C1 | `textbox-by-placeholder` matcher; `field-input-by-label` ladder is now in-landmark / exact / substring / placeholder / single-in-form | `patterns/matchers/textbox-by-placeholder.ts` | RS4 |
| C2 | `IndexedSurface` gains `placeholder`, `text`, `interactive`, `ancestors`; `SurfaceIndex` gains `findByPlaceholder`, `findInteractive`; `interactive-by-content` matcher inside a new `content-named-interactive` pattern registered **last** — the role-agnostic click floor | `rung-kernel.ts`, `surface-index-from-stage.ts`, `matchers/interactive-by-content.ts`, `patterns/content-named-interactive.pattern.ts`, `registry.ts` | RS5–RS7; ZC39.f (7 patterns) |
| C3 | Classifier emits `inLandmark` from prose cues (navigation / menu / header / sidebar → `navigation`; footer → `contentinfo`; search → `search`); `role-and-name-in-landmark` matcher is M0 of `locator-by-role-and-name` and `field-input-by-label`; `surfacesWithin` is now real containment via `ancestors` | `intent-classifier.ts`, `matchers/role-and-name-in-landmark.ts` | RS1–RS3, RS8 |
| C4 | Discovery admits roleless clickables (visible, click affordance, short own text, no nested control) as role `generic` with an **exact text** locator and no role candidate; `discover-screen` already resolved names via `<label>`, placeholder and content | `product/instruments/tooling/discover-screen.ts`, `product/domain/knowledge/discovery.ts` | `tests/target/discovery.spec.ts` (roleless case) |
| C5 | Verified rather than changed: the widget layer keys on role (`deriveRoleFromSignature`: explicit role → input type → tag); `os-*` ids are contract names, nothing in the runtime matches an `os-*` class or tag against the DOM. `generic` maps to the button-shaped contract with a click affordance | `role-affordances.ts` | — |
| §6 | Public-AUT cohort receipts (schema 5) carry a `pageFingerprint`: title, final URL, landmarks, role counts, interactive / roleless-interactive counts, placeholder-only inputs, `data-block` count, runtime global | `workshop/customer-backlog/application/page-fingerprint.ts`, `public-aut-runner.ts` | — |

Not landed, deliberately: **C6** (`data-block` as a scoping unit in
the OutSystems-generic tier) waits for the distillation pipeline;
**namingSource** is not yet threaded into the product's discovery
report (the walker has it; the report schema does not); the
substrate's depth axis is expressed as topologies, not as a
distribution knob.

### 9.4 Harness — subresource relay

The remote session's egress proxy served the HTML but failed every
larger subresource from Chromium with `net::ERR_TOO_MANY_RETRIES`, so
the Reactive runtime never mounted and a harvest captured the
21-node pre-hydration shell as "stable". `captureExternalSnapshot`
now takes `relaySubresources` (`--relay-subresources` on the CLI):
every non-document request is fulfilled through Playwright's request
context (`request.fetch(Request)` — method, headers, body preserved),
which the same proxy serves correctly. With it, Productcatalog
re-harvested to **377 nodes** — the study's own count exactly.
`scripts/substrate-reality-stats.ts` prints F1–F6 for any
SnapshotRecord so the numbers in §2 and §10 are reproducible.

## 10. Held-out evaluation — one route, spent

Per §8 the held-out routes are the honest test. One was promoted
(C4: one-time, irreversible, recorded under `promotions` in the
partition file): **Bulkactionswithfilters**, chosen blind by name for
the shapes it was expected to exhibit. Harvested once after §9
landed, through the guard, with the relay. Thirteen held-out routes
remain untouched.

| axis | study routes (§2) | Productcatalog re-harvest | **Bulkactionswithfilters** (never seen) |
|---|---|---|---|
| nodes / hydration / variant | 112–1227 / stable / reactive | 377 / stable / reactive | 285 / stable / reactive |
| F1 `data-block` (distinct) · `osui-*` any | 11–164 · sparse | 48 (13) · 5 | **17 (9) · 4** |
| F2 naming shares (named elements) | content 81%, aria-label 14%, placeholder 1% | content 64%, aria-label 32%, placeholder 4% (28) | **content 61%, aria-label 35%, placeholder 3% (31)** |
| F2 placeholder-only search input | 5/7 routes | 1 of 2 form controls | **1 of 11** (the search box; the other ten are unnamed) |
| F3 roleless share of visible interactives | ~24% (precise probe) | 8 of 22 (36%) | **14 of 36 (39%)** |
| F4 landmarks | banner+navigation+main; search on list routes | banner+main+navigation+search | **banner+main+navigation+search** |
| F5 structural ids : other · `data-testid` | structural, sparse test ids | 140 : 25 · 6 | **73 : 11 · 6** |
| F6 top `data-*` | container, expression, block, link, image | container 103, expression 54, block 48, icon, link | **expression 48, header 48, container 42, link 18, block 17** |

**Verdict: F1, F2, F3, F4 and F6 generalize to the unseen screen; F5
generalizes with a caveat.** Two things the held-out screen adds
that the study routes did not show:

- **Unnamed controls.** Nine bulk-select checkboxes and the sort
  `<select>` carry no accessible name at all (naming source `none`);
  their only handles are structural ids (`SelectAll`,
  `l2_0-2_0-Select`) and row context. The substrate can already
  pose this (`role: checkbox` with `naming: 'none'` and no
  placeholder); the ladder has no rung for "the checkbox in the row
  whose cell says X" — a candidate C7.
- **Designer-given semantic ids** alongside the structural ones
  (`Filters`, `FilterBy`, `Search`, `Table`, `SelectAll`, `Remove`,
  `Add`) — 11 of 84 ids. F5's "ids are never semantic" is too strong;
  on a hand-built screen some are, and they are a locator source the
  study under-weighted.

The roleless interactives on this screen are mostly sortable table
headers (`<th class="sortable">` with a `sortable-icon` div), a
pagination chevron (`<i class="fa-chevron-left">`) and an image —
the F3 shape, in a table dress the record-list topology does not yet
wear.

The route is spent for this canon fingerprint and version token
(`Ov_NiUhPHp8ffKKXiJmiNA`, C3). The fixture-based evaluation (C5,
human-authored from screenshots) has not been run; it needs one of
the thirteen remaining routes.
