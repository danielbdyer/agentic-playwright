# Reactive Discovery Handoff — after first contact and PR #181

> Status: handoff (2026-09-17). Instruction set for the session that
> continues PR #181. Reads on top of `docs/v2-substrate-reality-study.md`
> (including its §§9–10, which PR #181 adds) and on a second
> observation pass over the seven study routes made on 2026-09-17.
> Every number here is reproducible from
> `workshop/observations/fixtures/reactive-agnostic-observations-2026-09-17.json`
> (counts only; no text, no names, no PII). The thirteen held-out
> routes were not touched.

## 0. The verdict in one sentence

**PR #181 is right, and the next step is not more matchers: it is to
move discovery onto three evidence channels that are true of every
OutSystems Reactive application — the browser's own accessibility
tree for roles and names, the framework's handler registry for click
affordance, and the app's own module manifest for structure — while
correcting two mechanisms in the study that the second pass refuted.**

## 1. Two corrections to the study, both mine

### 1.1 F1: React is present on almost every node; the walker looked for the wrong key names

The study said "React fiber is nearly invisible (one node per page)."
False in mechanism. OutSystems Reactive runs **React 16**, whose
per-node markers are `__reactInternalInstance$…` and
`__reactEventHandlers$…`. Counts per route: 110 (Productform) to
1218 (Employeesdirectory) — essentially every element. The walker's
detector checks only the React 17+ names (`__reactFiber`,
`__reactProps`), and only on the first element (`break`). So the
classifier's old React requirement was not wrong because React is
absent; it was wrong because the detector could not see it. The
policy conclusion in §9 of the study still stands (framework markers
are version-fragile and must not gate Reactive detection), but the
factual claim needs the correction above, and the marker is far more
useful than a detector: see §3.2.

### 1.2 F3: `cursor: pointer` over-counts roleless controls by an order of magnitude

The study measured "~24% of interactive controls carry no role" with a
precise probe, but the walker's `interactive` bit — and therefore the
`findInteractive()` index PR #181's C2 matcher relies on — uses
`computeInteractive`, which treats computed `cursor: pointer` as an
affordance. Pointer cursors are **inherited by every descendant** of a
clickable ancestor: icons, spans, wrappers.

| route | roleless with `cursor:pointer` | of which own an `onClick` handler | inherited cursor only (decorative) |
|---|---|---|---|
| (home) | — | 0 | — |
| Employeesdirectory | 603 | 50 | 553 |
| Productcatalog | 13 | 0 | 13 |
| Requestmanagement | 53 | 11 | 42 |
| Productform | 7 | 1 | 6 |
| Transactionsdashboard | 12 | 5 | 7 |
| PatternsOverview | 468 | 0 | 468 |

The roleless *controls* are real (50 on the directory, 11 on request
management, 5 on the dashboard — list items, sortable `<th>`, a
dropdown display) but they are the elements that **own** the handler.
On Productcatalog the "Filter" and "Back to Overview" spans the study
called roleless clickables are descendants of the handler-owning
container; they inherit the cursor. Clicking them works only because
the event bubbles. The index must mark the owner, name it by
descendant text, and never mark an inherited-cursor descendant as
interactive (§4 N1, N8).

## 2. What can be assumed about a Reactive surface

Evidence classes: **8/8** = the seven study routes plus the one
held-out route PR #181 promoted and spent; **7/7** = the study routes
on the 2026-09-17 pass.

| # | Assumption | Evidence | Assume? |
|---|---|---|---|
| A1 | `window.OutSystems` / `window.OSFramework`, the runtime bundle in `<script>`, and `data-block` containers are present; `__OSVSTATE` is absent | 8/8 | **Yes.** The Reactive identity test. |
| A2 | Every rendered element carries React 16 markers; `__reactEventHandlers$…` on an element exposes its own `onClick` | 7/7 | **Yes for this platform generation.** Detect both 16 and 17+ key families; treat as corroborating, never gating. |
| A3 | `data-block` values are `Folder.Block`; the owning module is recoverable from the manifest because the bundle `<Module>.<Folder>.<Block>.mvc.js` is listed in `urlVersions` | 7/7: 29 platform blocks (`OutSystemsUI`, 302 nodes), 10 app blocks (`OutSystemsUIWebsite`, 136), 2 charts, 1 map; 90 platform bundles available | **Yes.** The platform/app partition is derivable from the app's own manifest, no crawl. |
| A4 | Page chrome (banner, navigation) is byte-stable across screens; `main` is the screen | 7/7 identical hashes (banner 40 nodes, nav 11) | **Yes.** Discover chrome once per app; subtract. |
| A5 | Landmarks `banner` + `navigation` + `main` on every screen; `search` on list screens; the top menu is a real ARIA `menu` (`menuitem` ×6) | 8/8 | **Yes.** |
| A6 | Names come from content first, `aria-label` second, `placeholder` for search boxes (role `searchbox`), `<label for>` on true forms; the browser names nearly every interactive element (AX unnamed 0–1 per route) | 8/8 | **Yes** — and take the name from the browser (§3.1). |
| A7 | Roleless controls exist and are handler owners without an AX interactive role; they are far fewer than pointer cursors suggest | 7/7 | **Yes**, with the §1.2 detector. |
| A8 | Hydration settles on the first attempt with zero post-`networkidle` mutations; Phase A (navigation) dominates at 4.6–9.2 s through a proxy; walks cost ~0.7 ms per node | 7/7 | **Yes for OutSystems Reactive.** Keep the compound heuristic as insurance; raise the navigation budget. |
| A9 | Element ids are structural block/list paths (`bN-…`, `lN-N_N-…`); some designer ids appear on hand-built screens; `data-testid` is sparse | 8/8 (designer ids: #181 §10) | **Yes**, and do not resolve by id. |
| A10 | The screen's compiled view bundle is public, named from the manifest (`<Module>.<Flow>.<Screen>.mvc.js`), and carries the widget composition and literal prompts (`prompt:` is OutSystems' word for placeholder) | Productcatalog: 118 KB, names the blocks it composes, `prompt: "Search Product"`, `"Back to Overview"` present, 10 `onClick`, 89 `createElement` | **Yes.** A structural discovery channel that needs no rendering. |

Do **not** assume: dense `osui-*` classes; React 17+ key names;
semantic ids; test ids; that `cursor: pointer` marks a control; that
the showcase's block mix (heavy on `DEPRECATED_*` patterns) matches a
customer app.

## 3. Agnostic discovery — the architecture to build toward

The current pipeline discovers per-app by walking DOM with hand-rolled
heuristics, then hand-encodes findings as matchers. That overfits to
the one showcase. Replace the heuristics with **three independent
evidence channels** that hold across apps and themes, admit a surface
when at least two agree, and let per-app facts live in the catalog.

### 3.1 Names and roles: the browser is the ground truth

Playwright's `getByRole` resolves against the browser's accessibility
tree. The walker's hand-rolled accname is an approximation of the same
computation, and the F2 error in the study was exactly the gap between
the two. Capture `locator.ariaSnapshot()` (or CDP
`Accessibility.getFullAXTree`) alongside the walk and take **role and
name from it**; keep the walker's `namingSource` as the *explanation*
of why the browser produced that name. Rung 2 then predicts rung 3 by
construction.

### 3.2 Affordance: the framework's handler registry, not the cursor

Rank affordance channels and record which fired:

1. native control (`button`, `a[href]`, `input`, `select`, `textarea`);
2. the element **owns** a click handler — React 16
   `__reactEventHandlers$…onClick`, React 17+ `__reactProps$…onClick`;
3. `tabindex ≥ 0`, or a platform widget attribute (`data-link`,
   `data-button`);
4. computed `cursor: pointer` **on the element's own style only when
   its parent does not also have it** — the weakest channel, never
   sufficient alone.

Roleless control ≡ owns a handler (2) and has no AX interactive role
(3.1). Descendants that merely inherit the cursor are decorative.

### 3.3 Structure: the platform's self-description

Every OutSystems Reactive app serves
`/<Module>/moduleservices/moduleinfo`: its screens (`screenUrl`,
`viewModuleName`), its modules, and `urlVersions` (every bundle).
From it, without crawling:

- **Routes** — the screen list is the route knowledge; the
  `versionToken` is the drift key for snapshot-once/replay-forever.
- **Block ownership** — a `data-block` value belongs to the module
  whose bundle `<Module>.<Folder>.<Block>.mvc.js` exists. Platform
  blocks (`OutSystemsUI.*`) are shared by every customer app that uses
  OutSystems UI; their internal DOM is the Platonic form to distill
  once (Z11f-prime) and reuse everywhere. App blocks are per-catalog.
- **Static widget composition** — the screen's view bundle names the
  blocks it composes and carries literal `prompt:` / label strings.
  Reading it is page-source-level inspection: zero hydration risk,
  zero PII exposure (sample data comes from the database at runtime).

### 3.4 Chrome subtraction and landmark scoping

Compute the banner/navigation structural signature once per app; tag
those surfaces `app-chrome`; discover each screen inside `main`. This
removes the nav-link-versus-content-link ambiguity that C3's landmark
scoping otherwise has to fight per intent.

### 3.5 Per-app name-source fingerprint

Record the naming-source distribution per screen (§2 A6 numbers). Use
it as the prior for locator-strategy emission (placeholder-heavy apps
emit `getByPlaceholder` fallbacks; label-for-heavy apps emit label
strategies) instead of hard-coding one order for all apps.

## 4. Next work for the PR #181 author, prioritized

Each item names the anchor and the law that pins it.

- **N1 — Affordance by handler ownership.** Replace
  `computeInteractive` (`workshop/substrate-study/application/dom-walk-capture.ts`)
  with the §3.2 ladder; add `affordanceSource` to `SnapshotNode` and to
  `IndexedSurface`; the product's discovery
  (`product/instruments/tooling/discover-screen.ts`) uses the same
  ladder. Law: an element whose only signal is an inherited cursor is
  not interactive. Expected re-measure of F3: the "own handler" column
  of §1.2.
- **N2 — React detection that can see React.** Check both key
  families, sampled across nodes, never only the first; keep it
  corroborating in `classifyVariant`; correct study §2 F1 in place.
  Law: a page with ≥ 10 `__reactInternalInstance$`/`__reactFiber$`
  nodes reports `reactDetected: true`.
- **N3 — Browser accname as ground truth.** Capture the aria snapshot
  in the harness and in product discovery; index `role` and `name`
  from it. Law: for every interactive node in the AX tree, the index
  carries the same name. This removes the F2 error class at the root
  and makes C1's placeholder matcher what #181 already calls it: an
  emission fallback.
- **N4 — Vocabulary from the AX tree.** Add `menuitem`, `option`,
  `spinbutton` to `SurfaceRole` (`workshop/substrate/surface-spec.ts`)
  and to the classifier's suffix tables; map `field` to `textbox |
  searchbox | spinbutton` by input type. Law: every interactive AX
  role observed on the study routes is a member of `SurfaceRole`.
- **N5 — Block ownership and the platform catalog.** Implement
  `partitionBlocksByOwner(manifest, dataBlockValues)` in
  `workshop/substrate-study/`; persist per-app platform/app block
  sets; seed the OutSystems-generic pattern tier from the platform
  set. Law: every observed `data-block` resolves to exactly one
  module. Distill the first Platonic form from `Interaction.Search`
  (`<input type="search">` + `prompt`), then `Navigation.Pagination`,
  `Content.Card`.
- **N6 — Static view-bundle channel.** `scripts/harvest-screen-bundle.ts`:
  manifest → screen → `<view>.mvc.js` → composed blocks + `prompt` /
  label literals. Law: literals found statically are a subset of the
  names found by rendering the same study route.
- **N7 — Chrome subtraction in discovery** (§3.4). Law: banner and
  navigation signatures are identical across all screens of one app
  version.
- **N8 — C2 identity.** `interactive-by-content` resolves to the
  nearest handler-owning ancestor and names it by descendant text.
  Law: the resolved surface owns the handler that fires on click.
- **N9 — Hydration budgets.** Navigation default 20 s (9.2 s observed
  through a proxy); adaptive warm-up (poll immediately, exit after
  three quiet polls); document that `mutationCount` counts only
  post-`networkidle` mutations.
- **N10 — C7, the row-scoped rung** (#181 §10): "the checkbox in the
  row whose cell says X" via `ancestors` and `row`/`gridcell`
  containment — the shape the promoted route exposed and the
  record-list topology does not yet wear.
- **N11 — A second substrate you own.** For cross-app generalization,
  the operator can create a free OutSystems personal environment and
  publish a Forge sample application: first-party, owned, arbitrary
  shapes, no IP question. Declare its partition before contact. Keep
  the thirteen held-out routes sealed until N1–N5 land; then spend
  **one** on the fixture-based evaluation the clean room's C5 asks
  for, authored by a human from screenshots.

## 4.1 Status (2026-09-17, PR #181 round two)

N1–N10 landed on PR #181 with laws; the re-measurements and file
anchors are in `docs/v2-substrate-reality-study.md §9.5`. Two
observations from landing them:

- §1.2 held on re-harvest: by handler ownership Productcatalog has
  **zero** visible roleless controls (the "Filter" / "Back to
  Overview" spans inherit their cursor), the directory six, request
  management two. The C2 floor now resolves only owners.
- §3.1's gap is now a number: the walker's hand-rolled accname
  agrees with the browser on 21/26, 22/27 and 29/36 named
  interactive nodes on the three re-harvested routes. Product
  discovery still names in-page; moving it onto `ariaSnapshot()` is
  the remaining half of N3.

N11 is the operator's.

## 5. Observation protocol — how to look without contaminating

1. Study routes only. The guard at
   `workshop/substrate-study/application/study-partition.ts` refuses
   the rest; do not work around it.
2. Read the manifest first: `/<Module>/moduleservices/moduleinfo`.
   Screens, modules, bundles, and the version token come from there.
3. Any `page.evaluate` callback with nested function declarations, run
   under `tsx`, must begin with the shim
   `(globalThis as any).__name ??= (f) => f;` — esbuild's `keepNames`
   injects a helper the page context lacks. The walker died on this
   for its entire life; a scratch script died on it again on
   2026-09-17.
4. Roles and names from `locator('body').ariaSnapshot()`; affordance
   from handler ownership (§3.2); an inherited cursor is not evidence.
5. Static channel: fetch `<Module>.<Flow>.<Screen>.mvc.js` from
   `urlVersions`; grep `prompt:`, labels, `OutSystemsUI.*` block
   references. It is page source.
6. Disclosed User-Agent; one URL per invocation; the TLS 1.2 launcher
   wrapper is a property of this sandbox's proxy, not of the harness.
   Where the proxy fails Chromium subresource fetches
   (`ERR_TOO_MANY_RETRIES`), `--relay-subresources` on the harvest
   script fulfils them through Playwright's request context.
7. Record counts, hashes, and block names — never text. The PII gate
   stays on. Reproduce with the fixture named at the top and
   `scripts/substrate-reality-stats.ts` (#181).

## 6. The 2026-09-17 pass, per study route

| route | DOM | `main` | onClick owners | AX interactive | roleless owning handler | native naming (content / aria-label / placeholder / label / none) |
|---|---|---|---|---|---|---|
| (home) | 275 | 225 | 36 | 25 | 0 | — |
| Employeesdirectory | 1228 | 1177 | 101 | 17 | 50 | 19 / 2 / 1 / 0 / 4 |
| Productcatalog | 378 | 327 | 29 | 24 | 0 | 18 / 7 / 1 / 0 / 3 |
| Requestmanagement | 387 | 336 | 49 | 28 | 11 | 22 / 9 / 1 / 0 / 5 |
| Productform | 113 | 62 | 26 | 19 | 1 | 18 / 3 / 0 / 7 / 1 |
| Transactionsdashboard | 352 | 301 | 27 | 15 | 5 | 17 / 6 / 0 / 0 / 1 |
| PatternsOverview | 1070 | 1019 | 214 | 124 | 0 | 200 / 2 / 1 / 0 / 1 |

Chrome: banner signature identical on all seven (40 nodes), navigation
identical (11 nodes). Hydration: all seven stable on the first
attempt, 0 post-idle mutations, 0 retries; Phase A 4.6–9.2 s, Phase B
1.1 s, Phases C + E 1.1–3.4 s scaling with node count. AX interactive
roles seen: `link`, `button`, `menuitem`, `tab`, `searchbox`,
`textbox`, `spinbutton`, `checkbox`, `radio`, `combobox`, `option`.
