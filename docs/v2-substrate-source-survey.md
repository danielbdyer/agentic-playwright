# Substrate Source Survey (Z11g.d.0 pre-research)

> Status: research — companion to
> `docs/v2-substrate-ladder-plan.md` and
> `docs/v2-substrate-study-plan.md`. Small-corpus DOM-structure
> survey of real OutSystems-platform-generated pages, performed
> to ground the Z11g.d.0 distillation-algorithm spec in actual
> evidence rather than hypothetical assumptions about OS DOM
> shape.
>
> ### 🚨 Critical scope note (post-research correction)
>
> **The corpus in this survey is OutSystems *Traditional Web*
> (ASP.NET WebForms-backed output). The target for Z11g.d's
> Platonic-form distillation is OutSystems *Reactive Web* (SPA-
> style, JS-hydrated).** These are different generators with
> different DOM conventions; findings in §§3–7 describe
> Traditional Web canonical shape and DO NOT generalize to
> Reactive without re-validation.
>
> **Two further consequences surfaced during the survey:**
>
> 1. **Curl cannot capture Reactive.** Reactive pages serve a
>    shell + JS bundles; the real DOM forms post-hydration.
>    Any Reactive harvest requires a JS-executing browser —
>    most naturally, `product/`'s existing snapshotting /
>    Playwright-bridge harness (per operator guidance on
>    2026-04-24).
> 2. **Observation scope must widen beyond ARIA.** The
>    Z11g.d.1 harvest must capture class tokens, `data-*`
>    names + values, computed styles (visibility / display /
>    color), layout geometry, text content, event-listener
>    presence, form association, framework markers, focus
>    state, and Shadow-DOM presence — not just the ARIA tree.
>    See §11 for the full observation-axis catalog.
>
> Sections §§3–7 are retained as the authoritative Traditional
> Web ground truth (a useful artifact in its own right), with
> a per-section "⚠️ Traditional Web" marker where the finding
> does not generalize. §§8, 10, 11 are the Reactive-pivot
> sections the Z11g.d.0 spec should act on.

## 0. Why this document exists

Z11g.d's Platonic-form distillation (substrate-ladder plan §6)
is only as good as the evidence that feeds it. Before writing
the Z11g.d.0 algorithm spec (central-tendency aggregation +
edge-case amalgamation policy + world-shape identity
preservation rule), the workshop needs a concrete picture of
what real OutSystems DOM actually looks like. This survey is
that picture — bounded, honest about its scope, and explicit
about what it cannot claim.

**What the survey is NOT**: a production harvest. It is not a
statistically-significant corpus; it is not a Z11f production
pipeline run. It is a bounded manual spot-check producing
enough evidence to ground the algorithm spec, with
widget-variant and per-class-prefix calibration deferred to
Z11g.d.1's real harvest.

## Table of contents

- §1 — Methodology + corpus scope
- §2 — Corpus inventory (what was fetched, from where)
- §3 — Traditional-Web observational notes (appendix — informational only; see scope note)
- §8 — Known limitations and gaps in this corpus
- §9 — Distillation-algorithm calibration inputs (Traditional Web scope — informational)
- §10 — Two-track next-step plan (Reactive-harness-first recommended)
- §11 — Beyond ARIA: observation axes for Reactive harvest

## 1. Methodology + corpus scope

### 1.1 Fetch mechanism

Raw HTML retrieved via `curl -sSL` to preserve the exact
markup, not a browser-rendered DOM. This is important because
Z11g's distillation consumes the HTML-as-served, not the
post-hydration DOM; client-side JS expansion is a separate
variant the pipeline could choose to sample later but does
not constitute the central tendency.

### 1.2 Samples on disk

All samples land under
`.tesseract/substrate-samples/` as `.html` files. The
directory is operator-owned; it is not committed to git. Samples
are raw HTML, preserved verbatim, with no stripping or
normalization. A Z11g.d.1 production run would persist
processed `SampleShape` records instead of raw HTML; this
survey retains raw HTML only because it is a bounded manual
analysis, not a production pipeline.

### 1.3 What counts as evidence in this survey

An observed structural pattern is "corpus-backed evidence"
when it appears in ≥2 of the 3 sample pages. Patterns appearing
in only 1 sample are recorded as "single-sample observations"
— useful for Z11g.d.1 fixture authoring but not yet
central-tendency candidates. Any claim in this document
without that classification is explicitly speculative (marked
⚠️ "unverified").

### 1.4 Fetch-access posture

Outside the three successfully-retrieved pages, many
adjacent pages (`Buttons.aspx`, `Form.aspx`, `FormElements.aspx`,
`TableRecords.aspx`, `EditableTable.aspx`, plus several others)
returned HTTP 503 after repeated attempts from this session's
sandbox. Wayback Machine access is also unavailable via the
sandbox's WebFetch. This is a **real blocker** for widget-variant
characterization and is surfaced as a §8 limitation.

### 1.5 Curl captures pre-hydration only (critical limitation)

`curl` retrieves the HTML as served, not as rendered. For
Traditional Web this is mostly sufficient — ASP.NET WebForms
emits fully-populated DOM server-side; client JS adds AJAX
wiring but the DOM skeleton is already present. For Reactive
Web this is **structurally insufficient** — Reactive serves a
shell plus JS bundles, and the meaningful DOM (widget tree,
ARIA structure, form inputs, table rows) forms only after the
OS runtime hydrates the shell. A curl-based harvest of a
Reactive page captures:

- The outer HTML shell (usually `<html><head><link><script>
  ... <body><div id="root|app|osui-app"></div></body></html>`).
- The bootstrap script list.
- Any server-rendered SEO metadata.

It does NOT capture:

- The widget tree the user actually sees.
- Post-hydration class tokens (most `osui-*` classes are
  injected by the runtime, not in the shell).
- Data attribute values populated from the OS runtime state.
- ARIA structure introduced by widget components.
- Computed geometry / visibility.

**Implication**: Z11g.d.1's Reactive harvest pipeline MUST
drive a real browser. The most natural path is to extend
`product/`'s existing Playwright-bridge / snapshotting
machinery to consume external URLs (currently scoped to
`workshop/synthetic-app/` only). See §10 for the two-track
plan.

## 2. Corpus inventory

Three OS-platform-generated pages successfully fetched on
2026-04-24, all from the OutSystems-owned **Live Style Guide**
application:

| Page | URL | Bytes | Purpose |
|---|---|---|---|
| Homepage | `https://outsystemsui.outsystems.com/WebStyleGuidePreview/Homepage.aspx` | 28,439 | Landing page; exhibits canonical nav + hero + card-grid layout |
| Widgets | `https://outsystemsui.outsystems.com/WebStyleGuidePreview/Widgets.aspx` | 37,251 | Widget index listing; `pattern-overview-link` entries to sub-pages |
| UI Patterns | `https://outsystemsui.outsystems.com/WebStyleGuidePreview/UIPatterns.aspx` | 126,096 | Largest sample; inline `navigation-bar-item` patterns with content |

**Provenance**: the Style Guide is an OutSystems-owned
reference app built on the OutSystems Traditional Web platform.
It is a first-party signal of "what OS traditional-web DOM
should look like" — every marker observed here traces to the
platform's own generator. For Z11g.d's Platonic-form
distillation, this corpus is the equivalent of a pure
central-tendency seed (low variance, high-fidelity, no
customer-theme drift).

**Corpus weakness**: all three samples come from a single
application. Customer apps on `*.outsystemscloud.com` /
`*.outsystemsenterprise.com` would add real variance. See §10.

**Sample totals**: 191,786 bytes of real OS HTML; ~4500 DOM
nodes (approx); 3 distinct page templates observed; all
Traditional Web (no Reactive / Mobile variant sampled).

## 3. Traditional-Web observational notes (appendix — informational only)

> **Scope**: the three-page corpus (Homepage / Widgets /
> UIPatterns) harvested on 2026-04-24 is entirely
> OutSystems Traditional Web output. The Z11g.d rung-4
> target is Reactive Web. Findings in this appendix
> **do not generalize** to Reactive and must not feed the
> Z11g.d.0 algorithm spec; they are retained as
> informational notes + negative checks (things a Reactive
> detector should NOT see). A prior version of this doc
> presented these sections as §§3–7; they were compacted
> here after the Reactive scope correction.

### What the Traditional corpus exhibited

- **`__OSVSTATE` hidden input** (3/3) — near-unique OS
  detector on Traditional Web. Paired with `__VIEWSTATE` +
  `__VIEWSTATEGENERATOR`. A Reactive page MUST NOT emit
  `__OSVSTATE`.
- **`OsAjax(...)` inline onclick handlers** (3/3) — OS AJAX
  framework signature. Reactive routes events through
  `addEventListener` (invisible to static HTML).
- **Script bootstrap** `outsystems.internal.$.get("/<App>/_status.aspx")` (3/3).
- **ID convention** `wt<N>_<Module>_wt<N>_block_wt<Component>...` (3/3).
- **Script paths** `/<App>/Blocks/<Module>/<Category>/<Name>.<locale>.js?<build>` (3/3).
- **Class-prefix families observed**: `OS*` PascalCase
  utilities (OSInline, OSFillParent, OSAutoMarginTop),
  `ThemeGrid_*`, `Menu_*`, `EPATaskbox_*`, `Feedback_*`,
  `NotifyWidget`, `Application_Menu`, `RichWidgets_*` in IDs.
  **No `osui-*` observed** — `osui-*` is the Reactive-Web
  prefix.
- **Chrome skeleton**: one `<form method="post">` wrapping
  the entire page + landmark shell (`header[role=banner]`
  → `nav[role=menubar]` → `main[role=main]` →
  `footer[role=contentinfo]`).
- **Post-back pattern**: one `<form>` per page + three
  hidden state fields; interactive elements render as `<a>`
  or `<div role="button">` (no `<button type="submit">`).
- **Widget anatomy captured in full for the menu dropdown**
  (nested-div chain with `role="menuitem"` → `role="button"`
  → `<a href>` leaf). See git history prior to 2026-04-24
  for the expanded per-widget walkthrough.

### Why these findings do NOT port to Reactive

Traditional Web is ASP.NET-WebForms-backed; DOM is rendered
server-side with post-back state. Reactive Web is
SPA-style: shell + JS bundles that hydrate client-side. The
generators are entirely distinct. A Reactive-directed
classifier must:

- Ignore `__OSVSTATE` as a signal (may be absent from
  Reactive entirely).
- Focus on `osui-*` class-prefix recognition.
- Expect React-fiber / Angular / Vue framework markers.
- Expect post-hydration DOM that only a JS-executing
  harness can capture (§1.5).

The variant-classifier in
`workshop/substrate-study/application/variant-classifier.ts`
implements Reactive-only detection per this guidance.

## 8. Known limitations and gaps

This survey is a small corpus; claims it cannot make are as
important as the ones it can.

### 8.1 Single-app corpus

All three samples come from the OutSystems-owned Style Guide
app. Customer apps — which vary widely in theme, widget
density, localization, and domain vocabulary — are absent.
The observed chrome is likely the **floor** of variance, not
the mean. Per-customer theme drift (color, font, custom
class prefixes layered on top) has not been characterized.

### 8.2 Traditional Web only — AND TARGET IS REACTIVE

The corpus is exclusively Traditional Web (ASP.NET WebForms-
backed) output. OutSystems Reactive Web and OutSystems Mobile
use different generators and different DOM conventions (the
`osui-*` prefix lives in Reactive/Mobile per Z11f plan
assumption; see §3.6's correction).

**This is not merely "three variants to sample" — Reactive is
THE target.** Per operator guidance on 2026-04-24, the Z11g.d
distillation's Platonic-form target is Reactive Web. Traditional
is in the field (many existing customer apps) but the Z11g
substrate-ladder rung-4 target is Reactive because that's
where the modern OS platform is headed and where customer
app development now lives (OutSystems Developer Cloud is
Reactive-only).

**Consequences for Z11g.d.0**:

- The §§3–7 canonical shape is informative for Traditional
  Web classifier tuning but is NOT the canonical target.
- §§3.1 (`__OSVSTATE`) and 3.2 (`OsAjax`) do NOT apply to
  Reactive — Reactive uses a different state machine.
- §§4 chrome and §5 menu-dropdown widget anatomy are
  Traditional-specific. Reactive's chrome is React-component-
  based, hydrated client-side.
- §7's post-back-with-hidden-state pattern is Traditional-
  only. Reactive does not use WebForms state.

**What IS likely preserved across variants** (to be validated
at Z11g.d.1):

- Class-prefix families (with naming-convention variance —
  `OS*` PascalCase in Traditional, `osui-*` kebab-case in
  Reactive; both refer to the same conceptual utilities).
- `ThemeGrid_*` grid system (the OS design system's layout
  vocabulary, shared).
- Typography + spacing utilities (probably retained with
  renamed prefixes).
- ARIA role vocabulary (standards-based, shared).

Treat §§3.6, 6.1–6.8 class-family taxonomy as
variant-correspondence hypotheses, not confirmed invariants.

### 8.9 Curl captured pre-hydration; Reactive requires JS-executing harness

Per §1.5, curl captures the shell only. Reactive harvest
requires either:

1. **A Playwright-driven harness** — most naturally an
   extension of `product/`'s existing Playwright-bridge
   machinery (`product/instruments/tooling/playwright-bridge.ts`,
   `workshop/probe-derivation/playwright-live-harness.ts`) to
   point at external URLs, wait for hydration, and capture
   the post-render DOM.
2. **A WARC-based approach** — Common Crawl and similar
   web-archives sometimes include rendered snapshots, but
   this is not reliable for SPA content.

(1) is the natural architectural fit: the workshop already
has the machinery, it's just never been pointed at an external
URL. The survey did NOT attempt (1) because it's a non-trivial
code addition (CORS handling, wait-for-hydration heuristics,
snapshot serialization) — see §10.2 below.

### 8.3 Interactive widget pages unreachable

Buttons.aspx, Form.aspx, FormElements.aspx, TableRecords.aspx,
EditableTable.aspx, Popup.aspx, Tabs.aspx — all 503-blocked
from this session's sandbox. These are the pages that would
exhibit real `<input>` / `<button>` / `<table>` / `<dialog>`
widget anatomy. Without them, the distillation's widget-level
central tendency (e.g., "what does an OS input look like?")
cannot be grounded here.

### 8.4 Wayback Machine inaccessible

WebFetch cannot reach `web.archive.org`. The primary
historical-variance harvest source from Z11f's plan is
unavailable under the current session's sandbox; any
time-variance characterization (how did OS DOM change between
2018 and 2026?) is deferred.

### 8.5 Common Crawl out-of-scope

Common Crawl's CDX index + WARC files require specialized
tooling (S3 range reads, WARC parsers) and bandwidth that
this session cannot support. Z11f's primary at-scale harvest
source is offline for this survey.

### 8.6 Session-bearing pages absent

Authenticated application states (taskbox populated with real
tasks, form mid-edit, modal dialog open, alert active) are
structurally invisible to unauthenticated fetches. The corpus
shows the "logged-out public landing" slice of each page.

### 8.7 Rendered-DOM variance absent

The raw HTML served is the pre-hydration shape. After the
OS JS bundle executes, the DOM may mutate significantly —
menu dropdowns expand, widgets initialize, lazy-loaded content
appears. The distillation must decide whether to classify the
pre-hydration or post-hydration shape (or both, as distinct
rungs of the target). This survey captures pre-hydration only.

### 8.8 Implication for Z11g.d.0 algorithm scope

Given the above, Z11g.d.0's algorithm spec can **confidently**
commit to:
- The platform-fingerprint classifier (§3 is solid evidence)
- The chrome central tendency (§4 is solid evidence)
- Class-prefix taxonomies at the family level (§6 is solid)

And must **defer to Z11g.d.1** for:
- Widget-level central tendency (needs widget pages)
- Variant amalgamation thresholds (needs >3 pages)
- Cross-variant support (Reactive + Mobile + Traditional)
- Post-hydration shape handling
- Customer-theme variance

## 9. Distillation-algorithm calibration inputs

This section translates the corpus observations into concrete
numeric parameters + structural commitments the Z11g.d.0 spec
can adopt as a starting point. Each parameter carries a
calibration-origin note so later tuning has provenance.

### 9.1 Support thresholds (§§Q2, Q3 of substrate-ladder plan)

| Parameter | Starting value | Calibration origin |
|---|---|---|
| Central-tendency floor (min samples per world-shape) | 5 | Z11f plan §16.7 uses a 50-sample first-run corpus with 0.3 support-ratio floor (`docs/v2-substrate-study-plan.md:3036`); survey observes that chrome-invariance holds at 3 samples so 5 is a defensible floor for non-chrome world-shapes. ⚠️ Recalibrate at Z11g.d.1 when real corpus depth arrives. |
| Hardened-variant minimum support | 2 (per shape) | Any pattern observed on 2+ independently-sourced pages is above noise; single-sample observations stay marked as such. |
| Central-tendency promotion ratio | ≥ 0.6 | A variant promotes to central tendency when ≥60% of samples for a given world-shape exhibit it. Matches the Z11f frequency-gate convention. |
| Noise-rejection ratio | < 0.1 | A variant observed in <10% of samples is rejected as noise. Leaves the 0.1..0.6 band as "hardened variant" candidates. |

### 9.2 World-shape identity preservation

A harvested page's classification into a world-shape is
stable iff:
- The platform fingerprint (§3.1, `__OSVSTATE` present) is
  present. Pages without `__OSVSTATE` are not OS Traditional
  Web and are filtered out before distillation.
- The chrome skeleton (§4.2) matches the known-OS shape
  (header + nav + main + footer + class-family signatures).
- The page's generated-ID prefix (`wt<N>`) is consistent
  within a single page sample.

If the chrome matches but content varies, the page
classifies as an OS-page-with-unknown-world-shape — a
candidate for a new world-shape proposal, not a refutation.

### 9.3 Class-prefix partition

Z11g.d.0's distillation divides observed class tokens into
four kinds:

1. **Platform invariants** (promoted to every canonical
   target): `OS*` utilities, `ThemeGrid_*`, `Menu_*`,
   `EPATaskbox_*`, `Feedback_*`, `NotifyWidget`,
   `Application_Menu`, `RichWidgets_*` (in IDs).
2. **Structural utilities** (included in the central
   tendency): `columns`, `columns<N>`, `columns-item`,
   `gutter-*`, `margin-*`, `padding-*`, `heading<N>`,
   `font-*`, `text-*`, `display-*`, `align-*`, `is--*`.
3. **Responsive breakpoint tokens** (central tendency but
   conditioned on variant): `tablet-break-*`, `phone-break-*`.
4. **App-specific names** (excluded from central tendency,
   promoted to per-variant evidence): anything not matching
   the above families. Examples: `home-card`, `app-logo`,
   `navigation-bar-item`, `pattern-overview-link`.

The partition is a closed decision tree the algorithm can
execute deterministically (L-Amalgamation-Deterministic).

### 9.4 Widget-anatomy seeds (for Z11g.d.1 to validate)

The corpus yields one full widget (menu dropdown, §5.1) and
several shells. The algorithm's initial widget vocabulary
seeds from:

- Menu dropdown: 5-element nested div chain, `role="menuitem"` /
  `role="button"`, `<a href>` leaf.
- Card: `.columns-item > .card > (heading + body + cta)`
- Landing hero: `.website-section.home-banner > .ThemeGrid_Container > h1 + subtitle`

⚠️ These are starting seeds; Z11g.d.1 must observe real
widgets on the widget-specific pages to calibrate.

### 9.5 ARIA role vocabulary

Central-tendency role set (corpus-backed): `banner`, `button`,
`contentinfo`, `main`, `menubar`, `menuitem`, `status`.

Expected-variant role set (plausible on widget pages but
unverified in this corpus): `form`, `alert`, `dialog`,
`listitem`, `region`, `tab`, `tabpanel`, `grid`, `gridcell`,
`row`, `rowheader`, `searchbox`, `checkbox`, `radio`,
`combobox`, `textbox`, `heading`.

The full `SurfaceRole` union in
`workshop/substrate/surface-spec.ts` (28 roles) matches the
expected-variant set. Z11g.d.1 corpus expansion should
confirm each role appears in ≥1 real OS page to validate the
vocabulary-is-not-over-specified claim.

### 9.6 Post-back invariants

Every canonical target for OS Traditional Web includes the
single-form-with-hidden-state pattern (§7.1):
- Root `<form method="post" action>` wrapping the page
- Three hidden inputs: `__OSVSTATE`, `__VIEWSTATE`,
  `__VIEWSTATEGENERATOR`
- Interactive elements outside `<button>` / `<input
  type="submit">` — the OsAjax-driven `<a>` / `<div
  role="button">` pattern

Probes on OS Traditional Web must assume this post-back
backbone.

## 10. Two-track next-step plan

Given the §8.2 variant-mismatch (Traditional captured,
Reactive target) and §8.9 / §1.5 curl limitation, Z11g.d.0
has two paths. Operator chooses which track.

### 10.A — Land Z11g.d.0 with Traditional-grounded evidence now; defer Reactive to Z11g.d.1

**What Z11g.d.0 ships**:

- Algorithm spec + amalgamation policy based on §9 Traditional
  Web calibration inputs.
- Platform-fingerprint classifier (Traditional-Web-only
  variant) with §3.6's corrections.
- Explicit "Reactive-pending" flag on every class-family
  claim + widget-anatomy seed.
- Architecture-law skeletons that fail-by-default until
  Z11g.d.1 produces either a Reactive harvest pipeline or
  Reactive-validated fixtures.

**Pros**: cheap, keeps Z11g.d momentum, leverages three-page
corpus that is genuinely informative. Traditional Web remains
a real OS variant in production, so the spec is useful even
if it is not the primary target.

**Cons**: the primary-target algorithm sits unvalidated; the
"multi-rung-grounded" graduation classification Z11g targets
does not actually have Reactive evidence until Z11g.d.1. Risk
of building the wrong spec and having to rework at Z11g.d.1.

### 10.B — Build the Reactive-harness capability first; then Z11g.d.0

**What ships first (a new Z11g.d.0a phase)**:

- `workshop/probe-derivation/external-snapshot-harness.ts` —
  extends the existing Playwright-live machinery to accept
  external URLs. Serves the OS app in a real Chromium
  context, waits for hydration, captures the observable DOM.
- `workshop/substrate-study/application/snapshot-harvest.ts`
  — consumes a seed URL list, drives the external-snapshot
  harness, persists per-page `SnapshotRecord`s (not just
  HTML — the §11 observation axes).
- A bounded seed URL list of Reactive OS apps (5-10 URLs).
- Legal / rigor envelope (Z11f-prime §6.4) authored in
  parallel for retention of what the harness captures.

**Then Z11g.d.0 proper**: algorithm spec authored against
the Reactive corpus the new harness harvests.

**Pros**: aligns with the operator's direction (2026-04-24);
grounds Z11g.d.0 in its true target variant; unblocks
Z11g.d.1 at scale by giving it a working harness to
generalize; exercises existing product machinery (the
Playwright bridge, the snapshot writer) in a new mode.

**Cons**: significantly more engineering in the critical path
(est. +3-5 days for 10.B.harness work before Z11g.d.0 can
start); risk of harness scope creep; requires resolving the
"what does success look like for snapshotting external URLs"
design question (Reactive hydration is non-deterministic —
wait for stable DOM? wait for network idle? wait fixed ms?).

### 10.C — Recommendation and compromise

**Recommendation: 10.B**, with a lean harness scoped to
"minimum viable external snapshot capture." Specifically:

- Single-URL capture (no crawler logic).
- Fixed 3-second post-load wait + network-idle heuristic.
- Record all §11 observation axes.
- No crawl scheduling, no retry logic, no WARC integration.
- Operator-driven — human picks URLs, runs the CLI, reviews
  samples.

This is ~2-3 days of engineering, not 5. The harness is a
research tool, not a production pipeline. Z11g.d.0 can then
author the algorithm spec against a real Reactive corpus
within the same week. Z11g.d.1 later generalizes the harness
to a production pipeline with scheduling + retention.

### 10.4 Sandbox egress requirements

Z11g.d.0a's harness runtime must allow:

- Outbound HTTPS to `*.outsystems.com`, `*.outsystemscloud.com`,
  `*.outsystemsenterprise.com`, and a seed list of known
  Reactive OS customer demos.
- Chromium launch inside the sandbox (already available for
  `playwright-live-harness.ts` against the synthetic-app;
  generalize to external URLs).
- User-agent strings that declare the research intent (the
  current session's `curl/` default UA is almost certainly
  what triggered 503s on adjacent pages — an ethical,
  disclosed Playwright UA is a prerequisite).

### 10.5 Priority-A seed URL candidates

Once a harness exists, prioritize harvesting:

1. **OutSystems UI framework showcase** — the Reactive
   counterpart of the Traditional Style Guide.
2. **Public Forge demo apps** — real customer-style app
   compositions.
3. **OutSystems's own marketing site** — confirmed Reactive
   per the 2026-04-24 curl probe returning content.
4. **5-10 public `*.outsystemscloud.com` customer apps** —
   real per-app theme variance.
5. **Mobile variant** — a separate harness mode (device
   emulation) sampling OS Mobile pages.

### 10.6 Priority-B seed URL candidates (deferred to Z11g.d.1)

6. **Wayback Machine historical snapshots** for time-variance
   characterization.
7. **Common Crawl CDX-indexed samples** for at-scale corpus
   size.
8. **Authenticated-state snapshots** for populated widget
   states. Requires a cooperating test account; operator
   decision needed.

## 11. Beyond ARIA: observation axes for Reactive harvest

Per operator guidance (2026-04-24), the Reactive harvest
(Z11g.d.0a in track 10.B) must capture more than just the
ARIA tree. This section catalogs the observation axes the
harness should record per DOM node, grouped by what each
contributes to the distillation.

### 11.1 Identity axes (always capture)

- **Tag name** — native HTML element (button, input, select,
  textarea, a, div, span, heading tags). Interaction-relevant.
- **ID** — DOM id attribute. Low entropy in the general case
  (OS generates long stable IDs) but high value for widget
  reference.
- **Class tokens** — all space-separated class names, ordered
  as declared.
- **Data attributes** — closed-map of data-* name → value.
  Distill name-frequency from the corpus; value-frequency
  separately for low-cardinality values.

### 11.2 Semantic axes (always capture)

- **ARIA role** — explicit `role=` attribute.
- **ARIA state** — `aria-expanded`, `aria-selected`,
  `aria-checked`, `aria-pressed`, `aria-disabled`,
  `aria-hidden`, `aria-busy`, `aria-invalid`, `aria-current`,
  `aria-live`, `aria-atomic`.
- **ARIA naming** — `aria-label`, `aria-labelledby`,
  `aria-describedby` (resolve labelledby/describedby targets).
- **Accessible name** — Playwright's computed accessible name
  (distinct from aria-label since it may resolve from content).
- **Accessible description** — Playwright's computed a11y
  description.

### 11.3 Interaction axes (always capture)

- **Event-listener presence** — click, input, change, submit,
  focus, blur, keydown. Even if listeners are attached via
  addEventListener (invisible to static HTML), Playwright's
  CDP can expose some via DOM.getEventListeners. Worst-case,
  detect interactive surface heuristically by tag + role +
  `tabindex`.
- **Tab-index** — `tabindex` attribute value (or -1 default
  for non-interactive).
- **Focusable** — whether Playwright reports the element as
  focusable.
- **Form association** — for `<input>`/`<select>`/`<textarea>`,
  the closest `<form>` + the name/id of the input + its type.
- **Input type** — `type="text|email|password|checkbox|radio|
  search|number|date|hidden|submit|button|file"`.
- **Disabled / readonly** — `disabled`, `readonly` attributes.
- **Required** — `required` attribute.
- **Placeholder** — `placeholder` attribute.

### 11.4 Visual / layout axes (capture conditionally)

- **Computed visibility**: `display`, `visibility`, `opacity`
  > 0. Collapse to a single `visible | display-none |
  visibility-hidden | zero-opacity | zero-sized | off-screen`
  enum matching `workshop/substrate/surface-spec.ts`'s
  `SurfaceVisibility` closed union.
- **Bounding rect**: x, y, width, height from `getBoundingClientRect`.
  Used for layout-position classification (above-fold,
  below-fold, sidebar, main-column). Optional at coarse
  precision (bucket into ~10px bins) to avoid pixel-drift
  noise.
- **Clipped**: whether the element is clipped by an ancestor's
  overflow.
- **Computed color / background** (optional): useful for
  theme-variant classification but high-cardinality; likely
  only sampled for named-widget roots (cards, buttons).
- **z-index / stacking context** (optional): useful for
  modal-dialog detection.

### 11.5 Content axes (capture with care)

- **Direct text content** — the `textContent` of the node.
  This is sensitive: raw user text can leak PII.
  **Discipline**: for the Reactive harvest, capture text of
  elements classified as "label-like" (heading, label, button
  text, aria-label content) — these are layout/signage text.
  Skip text of `<td>`, `<li>`, input values — those are
  data content.
- **Text-content length bucket** — for elements whose text is
  data-classified, record the length bucket (0 / 1-10 / 11-50
  / 51+ chars) without the content itself.
- **Number of text nodes** — structural signal without leaking
  data.

### 11.6 Framework markers (capture for variant classification)

- **Shadow DOM presence** — `attachShadow` / `shadowRoot`
  attribute. OS Mobile sometimes uses shadow DOM.
- **Web components** — `is=` attribute, custom element names
  (`osui-button`, `osui-input`).
- **React fiber**: `__reactFiber$<hash>` / `__reactProps$<hash>`
  property presence (introspected via evaluate in Playwright).
- **Angular**: `ng-version`, `_ngcontent-*`, `_nghost-*`
  attribute presence.
- **Vue**: `data-v-*` attribute presence.

(Most Reactive OS apps are React-based; the framework-marker
axes help detect variant drift across platform updates.)

### 11.7 Structural position (capture via walk)

- **Depth in tree** — `0` for root descendants, incrementing.
- **Parent tag + role + class-prefix family** — the immediate
  parent's identity axes, for "button inside form inside
  navigation" context.
- **Sibling index / count** — ordinal position among siblings.

### 11.8 What the harness does NOT capture

- **Inline event-handler implementations** — the string
  value of `onclick="..."` is captured (for Traditional Web's
  `OsAjax(...)` pattern); for Reactive, onclick strings are
  typically absent (listeners are `.addEventListener`).
- **JavaScript state** — the OS runtime's internal state is
  not surfaced; only what's in the DOM.
- **User input** — forms mid-edit or logged-in user data are
  out of scope for unauthenticated harvest.
- **Network activity** — XHR / fetch responses during
  hydration are not retained (the rendered DOM is).

### 11.9 Record shape (indicative)

A `SnapshotNode` record, per DOM node the harness observes:

```ts
interface SnapshotNode {
  readonly path: string; // CSS-selector-path from document root
  readonly depth: number;
  readonly tag: string;
  readonly id: string | null;
  readonly classTokens: readonly string[];
  readonly dataAttrs: Readonly<Record<string, string>>;
  readonly ariaRole: string | null;
  readonly ariaState: Readonly<Record<string, string>>;
  readonly ariaNaming: {
    readonly label: string | null;
    readonly labelledByText: string | null;
    readonly describedByText: string | null;
    readonly accessibleName: string | null;
  };
  readonly interaction: {
    readonly tabindex: number | null;
    readonly focusable: boolean;
    readonly formRef: { formId: string | null; name: string; type: string } | null;
    readonly disabled: boolean;
    readonly readonly: boolean;
    readonly required: boolean;
    readonly placeholder: string | null;
    readonly hasClickListener: boolean;
    readonly hasInputListener: boolean;
    // ... other event kinds
  };
  readonly visibility: 'visible' | 'display-none' | 'visibility-hidden' | 'zero-opacity' | 'zero-sized' | 'off-screen';
  readonly boundingRect: { xBin: number; yBin: number; wBin: number; hBin: number };
  readonly clipped: boolean;
  readonly framework: {
    readonly hasShadowRoot: boolean;
    readonly customElementName: string | null;
    readonly reactFiber: boolean;
    readonly angular: boolean;
    readonly vue: boolean;
  };
  readonly structural: {
    readonly parentTag: string | null;
    readonly parentRole: string | null;
    readonly parentClassFamily: string | null;
    readonly siblingIndex: number;
    readonly siblingCount: number;
  };
  readonly labelText: string | null; // only for label-classified elements
  readonly textLengthBucket: '0' | '1-10' | '11-50' | '51+' | null;
  readonly textNodeCount: number;
}
```

A `SnapshotRecord` is a list of `SnapshotNode` plus a page-
level envelope (url, timestamp, userAgent, pageSize,
hydration-wait-strategy, substrate-version-of-harness).

The distillation algorithm at Z11g.d.1 consumes these
records (not raw HTML) to produce canonical targets.

---

**Survey patch summary (2026-04-24)**: added §0 scope-
correction banner, §1.5 curl pre-hydration limitation,
§8.2/8.9 Reactive-is-target clarifications, §10 rewritten
as two-track plan (10.A = ship with Traditional grounding /
10.B = build Reactive harness first / 10.C = recommend
lean 10.B), §11 added covering 7 observation-axis groups +
record shape. Original §§3–7 Traditional-Web findings
retained as authoritative for that variant.

---

**Survey summary**: 3 pages, 192 KB HTML, 2026-04-24. Strong
evidence for the platform-fingerprint classifier + chrome
central tendency + layout-utility taxonomy. Weak-to-absent
evidence for widget-level variants, cross-customer theme
drift, Reactive/Mobile variants, and authenticated states —
all explicitly deferred to Z11g.d.1 corpus expansion.
