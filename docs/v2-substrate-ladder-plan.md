# Substrate Ladder Plan (Step 11 Z11g)

> Status: planning — Step 11 Z11g. Architectural design doc; no
> code has landed under this plan, though the first three rungs'
> scaffolding is already in-tree (see §3 current-state audit).
> Companion to `docs/v2-probe-ir-spike.md` (which this plan
> extends) and `docs/v2-substrate-study-plan.md` (which this plan
> re-scopes as **Z11f-prime**, see §6). Retires
> `docs/v2-executed-test-cohort-plan.md` (Z11b as written); see
> §13. Orthogonal to Z11d (live reasoning adapter); both may
> proceed in parallel.

## 0. The verdict in one sentence

**Extend the probe-harness ladder from three rungs to four by
adding a CommonCrawl-derived "ideal target" rung that replays
real OutSystems DOMs under a Z11f-prime legal re-scope, commit
catalog-driven generation as the synthetic React app's
invariant, and resolve the three load-bearing doc-silences
(dry-rung byte-identical-receipt law, numeric parity-band
tolerance, corpus-coverage metric) so the substrate-invariance
theorem has executable evidence across all four rungs.**

## Table of contents

- §0 — Verdict
- §1 — Purpose and scope
- §2 — Relationship to existing doctrine
- §3 — Current-state audit (what's actually landed)
- §4 — The four rungs' first-principles commitments
  - §4.1 Rung 1: Dry
  - §4.2 Rung 2: Fixture-replay
  - §4.3 Rung 3: Playwright-live (catalog-driven synthetic)
  - §4.4 Rung 4: CommonCrawl-derived (ideal target)
- §5 — Resolving the doc-silences
  - §5.1 Dry-rung byte-identical-receipt law
  - §5.2 Fixture `world` grammar (the "worldSetup" rename)
  - §5.3 Numeric parity-band tolerance
  - §5.4 Corpus-coverage metric
  - §5.5 Catalog-driven generation invariant
- §6 — Z11f-prime: the technical-rigor re-scope
- §7 — Domain model additions
- §8 — Phased sub-commits (Z11g.a through Z11g.d)
- §9 — Laws per phase
- §10 — Risks and mitigations
- §11 — Open questions
- §12 — Graduation and success criteria
- §13 — Retirement of the Z11b plan
- §14 — Relationship to Z11d

## 1. Purpose and scope

Z11a's three-cohort multi-prediction graduation (Verdict-11,
commit `a721cd9`) closed a real loop: the compounding engine
now measures probe-surface, customer-compilation-resolvable,
and customer-compilation-needs-human cohorts across
confirmation-rate and intervention-fidelity prediction kinds.
What it does not yet measure is whether the substrate the
probes execute against is **stable under the substrate-invariance
theorem** (`docs/v2-probe-ir-spike.md:351`), i.e., whether
probe classification is identical across the substrates the
workshop owns.

That gap has two consequences:

- **The playwright-live rung is the only workshop-owned
  substrate in scope today, and it has no parity evidence.**
  Its synthetic React app (`workshop/synthetic-app/src/`) is
  the piece most at risk of drifting into "parallel apparatus"
  (v2-substrate.md:161) because nothing in the test suite
  currently forces its world-shapes to match `product/`'s
  catalog shape.
- **The "ideal target" — what a probe classifies on a real
  OutSystems DOM — is absent entirely.** The workshop can
  measure its own synthetic substrate; it cannot measure
  whether that synthetic substrate preserves the classification
  boundaries a probe would draw on a real OutSystems page.

Z11g closes both gaps. It:

1. **Commits catalog-driven generation as the synthetic React
   app's invariant** (§4.3 + §5.5). The synthetic-app's
   rendering logic must derive its world-shapes from
   `product/catalog/` entries rather than from hand-authored
   alternate truth. An architecture-law test enforces this.
2. **Adds Rung 4 — CommonCrawl-derived ideal target** (§4.4 +
   §6). Under a Z11f-prime legal envelope (§6) that widens
   Z11f.0 to retain enough HTML for real-DOM replay, harvested
   OutSystems pages become fixture sources for a fourth
   `ProbeHarness` adapter. Probes classified on real DOMs
   become the workshop's ground truth for substrate
   invariance.
3. **Resolves three load-bearing doc-silences** (§5): the
   dry-rung byte-identical-receipt law analog (§5.1), the
   numeric parity-band tolerance (§5.3), and a corpus-coverage
   metric that names what the CommonCrawl rung *can't*
   measure — authenticated flows, customer-themed surfaces,
   non-indexable pages (§5.4).

This plan does **not** attempt customer-production access. The
fifth rung (ProductionProbeHarness, `docs/v2-probe-ir-spike.md:
292–298`) remains deferred; Z11g's ceiling is
"closest-to-production evidence accessible under a legal envelope
that does not require a customer tenant."

## 2. Relationship to existing doctrine

Z11g is the step-6+ follow-through on doctrine already committed
in four docs. Where each doc commits, this plan cites and
reinforces rather than re-deciding:

| Doc | Authority for | How Z11g extends |
|---|---|---|
| `docs/v2-substrate.md` §§2, 6, 6a, 7, 8a | The five primitives, the anti-scaffolding gate, the probe IR spike protocol, the measurement stance, the per-visitor metric audit | Reinforces §6's "no parallel apparatus"; resolves §6a's probe-IR spike protocol ambiguity on byte-identical-receipt scope; extends §8a's per-visitor audit with the corpus-coverage metric |
| `docs/v2-probe-ir-spike.md` §§1–9 | The probe's ontological role, the substrate-backed harness specs, the three-verdict graduation stack, the substrate-invariance theorem, the substrate-ladder monotonicity, the customer-incident ratchet | Adds the fourth rung; extends §6 with `CommoncrawlDerivedProbeHarness`; extends §8.2's theorem with real-DOM evidence; extends §8.6's substrate-drift detection to three cross-rung parity pairs (dry↔replay, replay↔live, live↔commoncrawl) |
| `docs/v2-synthetic-workshop-dogfood.md` §6 | The retirement ledger (what dogfood retires + what replaces it) and the substrate-plurality invariant | Reinforces the substrate-plurality invariant (`:90–92`); the CommonCrawl rung is the fourth substrate option made concrete |
| `docs/v2-substrate-study-plan.md` (Z11f) | Harvest sources, strip-to-shape discipline, legal envelope | This plan's §6 defines **Z11f-prime**: a widened legal envelope that retains enough HTML for real-DOM replay, on top of Z11f's existing shape + frequency outputs |

**What this plan decides that the doctrine left open.** Three
items, each a doc-silence surfaced by the Z11g scoping pass:

1. The dry-rung byte-identical-receipt law (probe-IR §7 commits
   the law for fixture-replay at `:316` but does not name the
   dry analog).
2. The numeric parity-band tolerance (probe-IR §8.6 at `:444`
   says "within a tolerance" in prose; §5.3 commits a number).
3. The corpus-coverage metric (absent from both probe-IR and
   Z11f; §5.4 introduces it as a new per-visitor metric).

**What this plan does NOT decide.** Customer-production
access; the fixture-retention legal envelope beyond what
Z11f-prime specifies in §6; any reshape of the three-cohort /
two-prediction-kind graduation landed at Verdict-11.

## 3. Current-state audit (what's actually landed)

Before committing to what Z11g adds, this section enumerates
what is already in the tree as of commit `c2973eb`. The
deep-dive scoping pass in the session preceding this plan
underestimated current state by a wide margin; this audit is
the authoritative baseline.

### 3.1 Port and three adapters

`workshop/probe-derivation/` contains the full probe machinery:

| File | Lines | Purpose |
|---|---|---|
| `probe-harness.ts` | ~80 | The `ProbeHarness` Context.Tag port + `ProbeHarnessService` interface + embedded `DryProbeHarness` adapter |
| `fixture-replay-harness.ts` | 162 | Rung-2 adapter using per-verb classifiers + injected snapshot/catalog/clock Layers |
| `playwright-live-harness.ts` | 233 | Rung-3 adapter composing the synthetic substrate server + Chromium browser + `Rung3ClassifierRegistry` with fallback to rung-2 |
| `spike-harness.ts` | — | Runs a probe set against the currently-composed `ProbeHarness`, emits a `SpikeVerdict` |
| `probe-receipt.ts` | 208 | `ProbeReceipt`, `ProbeOutcome`, `ProbeProvenance`, `ProbeHarnessAdapter` (currently a closed union of three tags) |
| `classifiers/` | — | Nine per-verb classifiers at rung-2; subdirectory `rung-3/` with `interact`, `observe`, `port`, `registry` |

The `ProbeHarnessAdapter` enum as landed (`workshop/probe-
derivation/probe-receipt.ts`):

```ts
export type ProbeHarnessAdapter =
  | 'dry-harness'
  | 'fixture-replay'
  | 'playwright-live';
```

Z11g widens this to four tags (§7).

### 3.2 Synthetic React app (Rung-3 substrate)

`workshop/synthetic-app/` ships a full in-process React
substrate:

| File | Lines | Role |
|---|---|---|
| `server.ts` | 122 | In-process Node HTTP serving `/synthetic-app.js` (esbuild output) and the React shell. Lifecycle is `await start()` ↔ `await stop()`; every harness acquires a random port. |
| `src/bootstrap.tsx` | 28 | Shell entry point; reads `?shape=...` query param |
| `src/SubstrateRenderer.tsx` | 92 | Top-level renderer selecting between surface / form / empty state |
| `src/SurfaceRenderer.tsx` | 225 | Renders product/catalog surface entries |
| `src/FormRenderer.tsx` | 141 | Renders form-kind world-shapes |
| `src/EntropyWrapper.tsx` | 141 | Randomizes chrome around the rendered world so classifiers must be chrome-invariant |
| `index.html` | — | Shell document |

The React components read world-shapes from a URL-encoded
query parameter; the harness constructs a URL per probe and
navigates Playwright to it. The entropy wrapper is the mechanism
by which a single fixture exercises a classifier's chrome-
invariance.

**The catalog-driven invariant is implicit but not enforced.**
The React components already source structure from
`product/catalog/` in practice, but no architecture-law test
asserts it. §5.5 commits to enforcement.

### 3.3 Substrate version + receipt-stamping

`workshop/substrate/version.ts` exports `SUBSTRATE_VERSION`
with semver discipline per `docs/v2-probe-ir-spike.md §8.6`:

- MAJOR — a classifier could legitimately disagree across the
  bump. Non-additive; requires a receipt-baseline reset.
- MINOR — new axes added, existing axes' semantics preserved.

Every `ProbeReceipt` stamps the version in its provenance
envelope. The cross-rung parity laws in §9 rely on this: a
parity check scoped to `SUBSTRATE_VERSION = X` is the
authoritative window for the substrate-invariance theorem.

### 3.4 Fixtures colocated with verbs

Nine probe fixtures currently live under `product/` colocated
with the verbs they exercise:

```
product/instruments/observation/observe.probe.yaml
product/instruments/intent/intent-fetch.probe.yaml
product/instruments/codegen/test-compose.probe.yaml
product/runtime/navigation/navigate.probe.yaml
product/runtime/widgets/interact.probe.yaml
product/domain/memory/facet-query.probe.yaml
product/domain/memory/locator-health-track.probe.yaml
product/domain/memory/facet-mint.probe.yaml
product/domain/memory/facet-enrich.probe.yaml
```

Fixture grammar uses `world:` (not `worldSetup:` as the probe-IR
spike drafts) to declare the world-shape. §5.2 commits the
grammar formally.

### 3.5 What is NOT landed

| Missing | Needed for |
|---|---|
| Dry-rung byte-identical-receipt law | §5.1; Z11g.a |
| Dry↔fixture-replay invariance law (on invariant-band axes) | §9; Z11g.a |
| Fixture-replay↔playwright-live parity law (with numeric tolerance) | §9; Z11g.b |
| `world:` grammar JSON-schema + architecture-law enforcement | §5.2; Z11g.a |
| Catalog-driven-generation architecture law | §5.5; Z11g.b |
| Corpus-coverage metric visitor | §5.4; Z11g.d |
| Z11f-prime legal envelope + real-DOM retention | §6; Z11g.d.0 |
| `CommoncrawlDerivedProbeHarness` adapter | §4.4; Z11g.d |
| Expected-classification labeling sidecar for harvested fixtures | §4.4; Z11g.d |
| `ProbeHarnessAdapter` widening (`'commoncrawl-derived'` tag) | §7; Z11g.d |

**Implication.** Z11g.a and Z11g.b are primarily law +
architecture-test work against existing adapters. Z11g.c is
synthetic-app discipline. Z11g.d is the largest piece: legal
re-scope + retention pipeline + new adapter + new labeling
machinery + new metric visitor.

## 4. The four rungs' first-principles commitments

Each rung has an **epistemic role**, a **substrate shape**, an
**adapter tag**, and a **parity obligation to the rung above it**
(except rung-4, which is the top). This section commits each
rung's position in the ladder; §5 resolves the grammar gaps
and §9 names the executable laws.

### 4.1 Rung 1: Dry

**Epistemic role.** Seam-proof only. A dry receipt proves
"the probe IR + harness + receipt pipeline work end-to-end"; it
proves nothing about product behavior. Per probe-IR §2 I4
(`:44`): "A receipt from `dry-harness` is seam-proof, not
truth-proof."

**Substrate shape.** No world. The adapter echoes each probe's
fixture `expected` block into `observed`; `completedAsExpected`
is tautologically true for every matched fixture. An injected
deterministic `now` pins the clock.

**Adapter tag.** `'dry-harness'` (landed).

**Parity obligation.** None upward (rung-1 has no rung-0).
Downward obligation to rungs 2, 3, and 4: the dry receipt's
`observed` is the target-shape every other rung's `observed`
must match on the **invariant-band axes** (§5.3) within
tolerance.

**What Z11g adds.** §5.1's dry-rung byte-identical-receipt
law: three consecutive `runSpike` invocations against the same
fixture set at the same `SUBSTRATE_VERSION` yield identical
`ProbeReceipt.provenance.content` fingerprints across runs.

### 4.2 Rung 2: Fixture-replay

**Epistemic role.** Classifier-truth against a frozen world.
A fixture-replay receipt proves "the product's per-verb
classifier, under deterministic inputs, reaches the expected
verdict." No real browser; no real network; no real LLM.

**Substrate shape.** Per probe-IR §6.1 (`:228–258`): captured
DOM snapshot via `snapshotAsPlaywrightBridge`, catalog state
via `loadCatalog(...)`, deterministic clock. Z11g adds nothing
to this shape; it codifies the fixture-authoring workflow
(§5.2) and the byte-identical-receipt law per probe-IR §7
(`:316`).

**Adapter tag.** `'fixture-replay'` (landed).

**Parity obligation.** Upward to rung-1: on invariant-band axes,
`observed` must equal the dry rung's echoed `expected` (within
tolerance — the tolerance is zero on classification/
errorFamily/rung; see §5.3). Downward obligation to rung-3 and
rung-4.

**What Z11g adds.** §5.2's formal `world:` grammar; §9's
dry↔fixture-replay invariance law; §9's fixture-replay↔live
parity law.

### 4.3 Rung 3: Playwright-live (catalog-driven synthetic)

**Epistemic role.** Real-browser-truth against a workshop-
owned substrate whose world-shapes are **projected from
`product/catalog/`**. A playwright-live receipt proves "the
product's classifier, running against a real Chromium page
rendering a catalog-derived world-shape, reaches the expected
verdict."

**Substrate shape.** In-process Node HTTP server
(`workshop/synthetic-app/server.ts`) serving a React shell
that reads `?shape=...` and renders via `SubstrateRenderer` +
`SurfaceRenderer` + `FormRenderer`, wrapped in `EntropyWrapper`
for chrome-invariance. Playwright navigates Chromium to a
per-probe URL.

**Adapter tag.** `'playwright-live'` (landed).

**Parity obligation.** Upward to rung-2: on invariant-band
axes, `observed` matches; on variant-band axes
(latency, event timing, pixel layout) legitimate differences
are bounded by §5.3's numeric tolerance. Downward obligation
to rung-4.

**What Z11g adds.** §5.5's catalog-driven-generation
invariant — an architecture-law test asserting that every
world-shape the synthetic React app renders has a
corresponding `product/catalog/` entry and a declared
projection path from catalog-to-DOM. This is the
anti-parallel-apparatus gate (v2-substrate.md §7:161).

### 4.4 Rung 4: CommonCrawl-derived (ideal target)

**Epistemic role.** The closest-to-production ground truth
accessible under a legal envelope that does not require a
customer tenant. A commoncrawl-derived receipt proves "the
product's classifier, running against a real OutSystems DOM
harvested from a public source, reaches the expected verdict."
Divergence from rung-3 is substrate drift: either the
synthetic app has drifted from real-world OutSystems, or the
harvested DOM has drifted outside the catalog's declared
world-shape.

**Substrate shape.** Under Z11f-prime (§6), harvested DOMs are
retained with enough fidelity to be served by the same
synthetic-app server (or a parallel `harvested-app` server;
see §7). The adapter composes:

1. A `HarvestedWorldFixture` (§7) addressing a retained DOM by
   `(harvestSourceKey, sampleId)`.
2. An **expected-classification sidecar** (§4.4, below) that
   carries the operator-curated `{ verb, expected.classification,
   expected.errorFamily }` tuple for each harvested fixture.
3. A Playwright bridge injected against a server that serves
   the retained DOM at a stable URL.

**Adapter tag.** `'commoncrawl-derived'` (new; §7 widens the
enum).

**Parity obligation.** Upward to rung-3: on invariant-band
axes, `observed` matches within tolerance. Divergences are
the workshop's refutation signal — either the synthetic-app
rung's catalog-projection is incomplete, or the harvested page
is outside the covered world-shape set (the latter is recorded
via §5.4's corpus-coverage metric, not as a law failure).

**The expected-classification sidecar.** Harvested DOMs are
unlabeled. Z11f's existing pipeline produces site-level
(`OSFingerprintVerdict`) and pattern-level (`PatternKind`)
labels but not per-probe ground truth. Z11g introduces an
operator-curated sidecar:

```
workshop/substrate-study/logs/labels/
  <quarter>/
    <sample-id-prefix>/
      <sample-id>.labels.json     (append-only, operator-curated)
```

The `labels.json` record is a closed shape:

```ts
readonly sampleId: Fingerprint<'substrate-sample'>;
readonly source: HarvestSourceKind;    // provenance threaded
readonly labels: readonly {
  readonly verb: VerbName;
  readonly fixture: FixtureRef;        // addresses a probe fixture
  readonly expected: {
    readonly classification: ProbeClassification;
    readonly errorFamily: ProbeErrorFamily | null;
  };
  readonly curator: OperatorId;
  readonly curatedAt: IsoTimestamp;
  readonly rationale: NonEmptyString;  // why this harvest exhibits this classification
}[];
```

An unlabeled harvest is **not eligible to be a commoncrawl-
derived fixture**. The operator-curation gate is part of the
trust-policy enforcement (workshop/policy/), not a free-form
annotation.

**What Z11g adds.** Everything: the adapter, the retention
pipeline (under Z11f-prime), the labeling sidecar, the
corpus-coverage metric, and the cross-rung parity law for
live↔commoncrawl.

## 5. Resolving the doc-silences

Five items the doctrine left open. Each is a decision Z11g
makes and binds with a law.

### 5.1 Dry-rung byte-identical-receipt law

`docs/v2-probe-ir-spike.md §7:316` commits the byte-identical-
receipt law to fixture-replay: "fixture-replay harness
produces byte-identical receipts across three consecutive runs
on the same commit." The dry rung has no analog. Z11g commits
one:

> **L-Dry-BIR (Dry Byte-Identical Reproducibility).** Given a
> fixture set `F` and a pinned `SUBSTRATE_VERSION`, three
> consecutive invocations of `runSpike(F)` against
> `DryProbeHarness` with an injected deterministic `now` yield
> identical `ProbeReceipt.provenance.content` fingerprints for
> every receipt.

**Why this is non-trivial.** Dry produces its `observed` by
echoing `expected`. Without a content fingerprint constructed
deterministically from `(probe-id, fixture-ref, expected,
substrate-version, now)`, receipts would still vary (e.g., if
`now` leaked into the fingerprint via timing fields). The law
forces the content-fingerprint computation to be a pure
function of the named inputs.

**Where it lives.** `workshop/probe-derivation/tests/
probe-harness-laws.spec.ts` — a new laws file, three-run-
equality test per adapter.

### 5.2 Fixture `world:` grammar

The probe-IR spike doc (`docs/v2-probe-ir-spike.md §4.5 at
:145`) references a `worldSetup` field without schematizing it.
The in-tree fixtures use `world:` (see `product/instruments/
intent/intent-fetch.probe.yaml` lines for `world.upstream.*`).
Z11g commits the grammar formally and renames the spike doc's
forward-reference to match what the fixtures actually do.

**Grammar (schema 1).** Every fixture carries:

```yaml
verb: <verb-name>
schemaVersion: 1

fixtures:
  - name: <kebab-case-fixture-id>
    description: |
      <why this world-shape exercises the classifier>
    input:
      # per-verb input shape; validated against verb's InputCodec
    world:
      # per-verb world-shape; validated against verb's
      # WorldShapeCodec. Closed keys per verb.
    expected:
      classification: pass | matched | ambiguous | failed
      error-family: <ErrorFamilyTag> | null
    exercises:
      - rung: <rung-1|2|3|4> | null   # which rung this exercise targets
      - error-family: <ErrorFamilyTag> | null
```

**Architecture-law enforcement.**
`product/tests/architecture/fixture-schema.laws.spec.ts` —
walks every `*.probe.yaml` under `product/`, validates against
the above schema, and refuses fixtures with unknown top-level
keys.

**Anti-scaffolding check.** `world` values must only reference
facet kinds, error families, and other primitives declared in
`product/manifest/manifest.json`. A fixture declaring
`world.upstream.my-custom-error-flavor: true` where
`my-custom-error-flavor` is not a manifest-declared error
family is a **build-breaking manifest drift**.

### 5.3 Numeric parity-band tolerance

`docs/v2-probe-ir-spike.md §8.6 at :444` commits the parity-band
partition in prose — "invariant-band properties (classification,
error-family, rung) should not differ within a tolerance" — and
leaves the tolerance unnumbered. Z11g commits:

> **Invariant-band tolerance: zero.** `classification`,
> `errorFamily`, and `rung` must match exactly across any
> two rungs running the same fixture at the same
> `SUBSTRATE_VERSION`. Any divergence is a refutation.
>
> **Variant-band tolerance: per-axis.** Legitimate differences
> between rungs on variant-band axes:
>
> - `elapsedMs`: bounded by `elapsedMs_upper / elapsedMs_lower
>   ≤ 100`. (Two orders of magnitude; catches non-flaky drift
>   while allowing real-browser vs. in-process disparity.)
> - `startedAt` / `completedAt`: no constraint (legitimately
>   varies every run).
> - `adapter`: tautologically different across rungs.
> - `content`: legitimately different (elapsedMs feeds the
>   fingerprint). Parity is asserted over
>   `provenance.invariantContent`, a sub-fingerprint computed
>   from the invariant-band axes only. §7 introduces this
>   field.

The 100× bound is a first-principles guess; §11 lists it as an
open question to calibrate once the law runs across real runs.

### 5.4 Corpus-coverage metric

The commoncrawl rung's measurement honesty depends on naming
what it cannot cover. Common Crawl sees only what Googlebot
saw; Wayback inherits the same public-web ceiling.
Authenticated flows, customer-themed surfaces,
non-indexable pages are structurally invisible.

Z11g commits a new per-visitor metric:

> **`corpus-coverage`** — a visitor over harvested-fixture
> logs that projects `{ rung-4-covered-patterns,
> rung-4-uncovered-patterns }` per `PatternKind`. A
> `PatternKind` is "rung-4-covered" iff the quarter's harvest
> yielded ≥1 labeled sample exhibiting that pattern at
> classification `matched`. Uncovered patterns are reported
> explicitly, not silently skipped.

**Integration with the compounding engine.** The visitor
produces a new scorecard field
`scorecard.cohorts.rung-4.coverage: Record<PatternKind,
{ covered: boolean; supportCount: number }>`. Graduation
requires `covered === true` for every `PatternKind` in the
trust-policy-approved pattern set (current count: six seed
patterns; see the handoff doc §"What's exciting" at
`workshop/observations/handoff-post-z11a.md`).

### 5.5 Catalog-driven generation invariant

The playwright-live rung's synthetic React app is the piece
most at risk of becoming "parallel apparatus" (v2-substrate.md
§7:161) because the workshop *owns* it. Z11g commits the
catalog-driven invariant:

> **L-CatalogDriven (Catalog-Driven Generation).** Every
> world-shape rendered by `workshop/synthetic-app/src/
> SubstrateRenderer.tsx` must project from a
> `product/catalog/` entry via a declared projection path. A
> world-shape the synthetic app can render that does not
> correspond to a catalog entry is a **build error**.

**Architecture-law enforcement.**
`workshop/synthetic-app/tests/catalog-driven.laws.spec.ts`
— asserts that for every `ShapeKind` the renderer dispatches
on, there exists a `product/catalog/*/surface.yaml` entry
producing a shape of that kind. The test walks the catalog
tree and the renderer's dispatch table; divergence fails the
build.

**What this does NOT forbid.** Entropy-wrapper perturbations
(`EntropyWrapper.tsx`) are permitted and required — they are
chrome invariance exercises, not alternate world-shapes. The
law scopes to `SubstrateRenderer`'s shape dispatch, not to
the entropy perturbations around it.

**Retroactive application.** If the audit at Z11g.c time
surfaces synthetic-app code rendering a world-shape that does
not have a catalog entry, the remediation is to add a catalog
entry or delete the synthetic-app code — never to special-case
the law.

## 6. Z11f-prime: the technical-rigor re-scope

The existing Z11f plan (`docs/v2-substrate-study-plan.md`)
commits to harvesting OutSystems DOMs from Common Crawl,
Wayback, and OS showcase pages under a retention envelope that
keeps **only stripped shapes**: `stripToShape()` destroys
the raw HTML in the same function it produces the
`SampleShape`; raw HTML "never lands on disk as-is"
(`docs/v2-substrate-study-plan.md:60–63`). That envelope is
correct for Z11f's matcher-proposal goal but insufficient for
the substrate-rung use: a real-DOM replay needs real HTML.

Z11g declares **Z11f-prime** as a widened retention envelope
that keeps enough HTML to drive a Playwright page, under
additional controls appropriate to the retention. **The
envelope is a self-imposed technical-rigor bar, not an
external counsel review.** The operator's stance: implement
as if counsel were watching, apply the full discipline, own
the controls. Z11g.d.0 (§8.4) is therefore a **design-depth
gate** — the commit that authors the envelope, sensitive-
content gate, retention horizon, and jurisdiction scoping in
the depth that would survive a legal review if one were
formally commissioned — not a wall-clock-blocking external
dependency.

### 6.1 What Z11f-prime retains beyond Z11f

Z11f-prime extends the retention envelope with:

- **Rendered HTML fragment**: the `<body>` subtree of the
  harvested page, serialized. Scripts stripped (no JS execution
  on replay). External stylesheets inlined or removed. Images
  replaced with 1×1 placeholders. Forms retained structurally
  with `action` attributes neutered (no real submission).
- **Minimal inline CSS**: whatever the page's own stylesheet
  directly applied to retained elements, flattened. This
  preserves the visual affordances a classifier's ARIA tree
  might be sensitive to (e.g., `display: none`).
- **No tracking / analytics / third-party scripts or URLs.**
  Explicit stripping of `google-analytics`, `gtm`, `facebook`,
  `linkedin`, and an allowlist-based third-party domain filter.
- **No user-generated content** beyond what is structurally
  necessary. Text nodes are retained, but a "sensitive content"
  classifier — run at harvest time — triggers review if any
  retained text matches PII patterns (emails, phone numbers,
  national IDs).
- **Provenance expansion.** The `HarvestedWorldFixture` (§7)
  records the original URL, retrieval timestamp, harvest
  source (`common-crawl` / `wayback` / `showcase`), and
  fingerprint of both the original-page-digest and the
  retained-fragment-digest. The fingerprint pair lets a later
  audit verify that the retained fragment is a faithful
  subset of what was at the URL.

### 6.2 What Z11f-prime still refuses

Z11f-prime does NOT widen to:

- **Authenticated pages.** Unchanged from Z11f. Googlebot sees
  public pages only.
- **Customer-specific data.** A harvested page with visible
  PII/PHI is rejected at the sensitive-content gate, not
  retained.
- **Wholesale page snapshots.** The retained fragment is a
  processed derivative, not a raw copy. `view-source` fidelity
  is not a goal.
- **Live fetching.** Retention happens at harvest; replay
  serves from the retention store. No runtime calls to
  archive.org / commoncrawl.org.

### 6.3 Z11f-prime's relationship to Z11f

Z11f-prime **extends** Z11f; it does not replace it. The shape-
frequency pipeline (Z11f) and the retained-fragment pipeline
(Z11f-prime) run **in parallel** on the same harvest stream:

```
harvest source (commoncrawl/wayback/showcase)
       │
       ▼
  fetch raw HTML
       │
       ├──► stripToShape()   ──► SampleShape      (Z11f)
       │
       └──► retainFragment() ──► RetainedFragment (Z11f-prime)
                                        │
                                        ▼
                                HarvestedWorldFixture
```

Both sides index the same `sampleId`; a given harvest
contributes one shape (for matcher-proposal distillation) and
zero-or-one retained fragments (for substrate-rung replay),
depending on whether the sensitive-content gate passes.

### 6.4 Design-depth gate (Z11g.d.0)

Z11g.d.0 is the design-depth checkpoint for Z11f-prime. It
authors the envelope's self-imposed controls in the depth
that would survive external counsel review if one were
commissioned. The required outputs are engineering artifacts,
not approval signatures:

1. **Explicit fragment-retention specification** per the §6.1
   envelope — what is retained, what is stripped, how each
   gate is implemented.
2. **Jurisdiction-origin allowlist** — which source-domain-
   origins the retention envelope covers (e.g., US-hosted
   OS showcase pages, EU-hosted customer archives with GDPR
   implications, etc.). This constrains which
   `HarvestSourceKind`s feed the retained pipeline. Operator
   authors the list; trust-policy enforces it.
3. **Retention horizon policy** — default: 2 years per
   quarterly purge; operator may tighten per jurisdiction.
4. **Sensitive-content gate pattern list** — the PII / PHI /
   secret patterns that trigger harvest rejection. Operator
   authors; architecture-law asserts the gate runs on every
   retention.

This is a **code-plus-doc deliverable**, not a wait-for-counsel
gate. It lands as a concrete commit with the retention
pipeline's discipline encoded.

**Contingency modes** (operator-triggered, not externally-
imposed):

- **Narrower-corpus mode.** If operator judgment (or later
  external counsel) narrows the retention scope — e.g., excludes
  Wayback — the `corpus-coverage` metric reports the narrowing
  honestly. Substrate-invariance can still be tested against
  the narrower corpus.
- **Fallback-to-reifier mode.** If operator judgment determines
  real-fragment retention is not viable, the rung-4 adapter
  degrades to shape-reifier (the retired option (c) from
  scoping). The adapter tag remains `'commoncrawl-derived'`
  only if real-DOM replay is the mechanism; a reifier-backed
  rung would use `'commoncrawl-reified'`. The plan does not
  pre-commit to this fallback; the expected path is real-DOM
  replay under the self-imposed envelope.
- **Retention-horizon mode.** The default quarterly-purge
  policy applies; operator tightens per jurisdiction.

## 7. Domain model additions

Z11g widens four domain models and introduces three new ones.
All additions preserve envelope discipline per CLAUDE.md:
`extends WorkflowMetadata<'stage'>` where applicable; phantom
axes stamped at mint time.

### 7.1 Widenings

**`ProbeHarnessAdapter` — widen to four tags.**

```ts
// workshop/probe-derivation/probe-receipt.ts
export type ProbeHarnessAdapter =
  | 'dry-harness'
  | 'fixture-replay'
  | 'playwright-live'
  | 'commoncrawl-derived';   // NEW
```

Non-additive MINOR bump to `SUBSTRATE_VERSION` on the commit
that adds the tag.

**`ProbeReceipt.provenance` — add `invariantContent`
sub-fingerprint.**

```ts
export interface ProbeProvenance {
  // existing:
  readonly adapter: ProbeHarnessAdapter;
  readonly substrateVersion: SubstrateVersion;
  readonly startedAt: IsoTimestamp;
  readonly completedAt: IsoTimestamp;
  readonly elapsedMs: NonNegativeInt;
  readonly content: Fingerprint<'probe-receipt'>;
  // new:
  readonly invariantContent: Fingerprint<'probe-receipt-invariant'>;
}
```

`invariantContent` is computed from `(probe-id, observed.
classification, observed.errorFamily, exercises[].rung,
fixtureFingerprint, substrateVersion)` — the invariant-band
axes only. Cross-rung parity laws (§9) assert equality over
`invariantContent`, not `content`.

**`HarvestSourceKind` — unchanged.** Z11f's closed union of
`common-crawl | wayback | showcase | fixture` carries through
to Z11f-prime without modification.

**`ScorecardCohorts` — add rung-4 entry.**

```ts
export interface ScorecardCohorts {
  readonly probeSurface: ProbeSurfaceCohortScorecard;
  readonly customerCompilationResolvable: CustomerCompilationResolvableScorecard;
  readonly customerCompilationNeedsHuman: CustomerCompilationNeedsHumanScorecard;
  readonly rung4: Rung4CommoncrawlScorecard;   // NEW
}

export interface Rung4CommoncrawlScorecard {
  readonly coverage: Record<PatternKind, {
    readonly covered: boolean;
    readonly supportCount: NonNegativeInt;
  }>;
  readonly parityFailures: readonly ParityFailureRecord[];
  readonly substrateVersion: SubstrateVersion;
}
```

### 7.2 New types

**`HarvestedWorldFixture`** — the retained-fragment fixture:

```ts
// workshop/substrate-study/domain/harvested-world-fixture.ts
export interface HarvestedWorldFixture extends WorkflowMetadata<'preparation'> {
  readonly sampleId: Fingerprint<'substrate-sample'>;
  readonly source: HarvestSourceKind;
  readonly originalUrl: Url;
  readonly retrievedAt: IsoTimestamp;
  readonly originalDigest: Fingerprint<'harvested-original'>;
  readonly retainedFragment: RetainedFragment;
  readonly retainedDigest: Fingerprint<'harvested-retained'>;
  readonly sensitiveContentGate: SensitiveContentGateResult;
  readonly jurisdictionCap: JurisdictionCapKind;
  readonly retentionHorizonQuarters: PositiveInt;
}

export interface RetainedFragment {
  readonly bodyHtml: NonEmptyString;
  readonly inlineStyles: readonly InlineStyleRule[];
  readonly strippedScriptCount: NonNegativeInt;
  readonly strippedThirdPartyDomains: readonly Domain[];
}
```

**`HarvestedFixtureLabel`** — the operator-curated
expected-classification sidecar (see §4.4):

```ts
// workshop/substrate-study/domain/harvested-fixture-label.ts
export interface HarvestedFixtureLabel extends WorkflowMetadata<'preparation'> {
  readonly sampleId: Fingerprint<'substrate-sample'>;
  readonly labels: readonly {
    readonly verb: VerbName;
    readonly fixture: FixtureRef;
    readonly expected: {
      readonly classification: ProbeClassification;
      readonly errorFamily: ProbeErrorFamily | null;
    };
    readonly curator: OperatorId;
    readonly curatedAt: IsoTimestamp;
    readonly rationale: NonEmptyString;
  }[];
}
```

**`ParityFailureRecord`** — cross-rung parity refutation:

```ts
// workshop/probe-derivation/domain/parity-failure.ts
export interface ParityFailureRecord extends WorkflowMetadata<'evidence'> {
  readonly rungPair: readonly [ProbeHarnessAdapter, ProbeHarnessAdapter];
  readonly fixtureRef: FixtureRef;
  readonly substrateVersion: SubstrateVersion;
  readonly divergence: {
    readonly axis: 'classification' | 'error-family' | 'rung';
    readonly lowerRungValue: string;
    readonly higherRungValue: string;
  };
  readonly detectedAt: IsoTimestamp;
  readonly observedFingerprints: readonly [
    Fingerprint<'probe-receipt-invariant'>,
    Fingerprint<'probe-receipt-invariant'>,
  ];
}
```

### 7.3 Relationship to existing envelopes

- `HarvestedWorldFixture` and `HarvestedFixtureLabel` stamp
  `stage: 'preparation'` — they are fixture-preparation
  artifacts consumed by the rung-4 adapter.
- `ParityFailureRecord` stamps `stage: 'evidence'` — a parity
  failure is evidence against the substrate-invariance
  theorem.
- `Rung4CommoncrawlScorecard` lives inside the existing
  scorecard envelope (stage `'projection'`), no new envelope
  needed.
- All new fingerprint tags register in
  `product/domain/kernel/hash.ts`'s closed tag registry.

## 8. Phased sub-commits (Z11g.a through Z11g.d)

Four phases, each its own commit(-set) with its own laws and
its own graduation condition. Phases a and b are sequential;
c may proceed in parallel with b once a lands; d proceeds in
parallel from the start because its legal-review track is
engineering-independent.

### 8.1 Z11g.a — Dry rung completion (~2 days)

**Goal.** Resolve the dry-rung doc-silences and commit
executable laws. No new adapters; no fixture authoring beyond
what's already in-tree.

**Deliverables:**

1. `probe-receipt.ts` — add `invariantContent` sub-fingerprint
   field; widen the `content` computation to include
   `invariantContent` as an input (so the full content digest
   transitively covers the invariant axes).
2. `workshop/probe-derivation/tests/probe-harness-laws.spec.ts`
   — new laws file.
   - **L-Dry-BIR** — dry byte-identical-receipt over 3 runs
     with injected deterministic `now` (§5.1).
   - **L-Invariant-Content-Pure** — `invariantContent` is a
     pure function of `(probe-id, observed.classification,
     observed.errorFamily, exercises[].rung, fixtureFingerprint,
     substrateVersion)`; unrelated field mutations do not
     change it.
3. `product/tests/architecture/fixture-schema.laws.spec.ts`
   — new laws file enforcing §5.2's schema 1 against every
   `*.probe.yaml` under `product/`.
4. Rename any residual `worldSetup` references in
   `docs/v2-probe-ir-spike.md` to `world` for consistency with
   the fixture grammar; pin the rename commit in the doc's
   status line.

**Graduation.** All existing tests green; new laws green;
`SUBSTRATE_VERSION` MINOR bumped (additive).

### 8.2 Z11g.b — Cross-rung parity laws (~3 days)

**Goal.** Execute the substrate-invariance theorem against
the three existing rungs. Dry↔fixture-replay and
fixture-replay↔playwright-live parity laws go green.

**Deliverables:**

1. `workshop/probe-derivation/domain/parity-failure.ts` — new
   `ParityFailureRecord` type per §7.2.
2. `workshop/probe-derivation/application/check-rung-parity.ts`
   — Effect program that takes two `SpikeVerdict`s from
   different rungs and produces a list of parity failures.
3. `workshop/probe-derivation/tests/rung-parity.laws.spec.ts`
   — new laws file:
   - **L-DryReplay-Parity** — for every fixture where both
     rungs emit a receipt, `invariantContent` matches; variant-
     band `elapsedMs` within the §5.3 tolerance.
   - **L-ReplayLive-Parity** — same structure across
     fixture-replay and playwright-live; uses the synthetic
     substrate server for rung-3.
   - **L-Tolerance-Bound** — `elapsedMs_upper / elapsedMs_lower
     ≤ 100` per §5.3.
4. CLI wiring: `npx tsx scripts/speedrun.ts rung-parity` —
   runs the current fixture set across three rungs, emits
   `workshop/scorecard/rung-parity.json` with any
   `ParityFailureRecord`s.

**Graduation.** Parity laws green; `rung-parity.json`
generated and readable by the dashboard. If any real parity
failures surface, they either classify as a substrate bug
(fix) or as a legitimate variant-band case (schema extension
to §5.3's tolerance).

**Dependency.** Z11g.a must land first — `invariantContent`
is the key parity laws compare on.

### 8.3 Z11g.c — Catalog-driven generation enforcement (~4 days)

**Goal.** The synthetic React app's world-shapes must project
from `product/catalog/` entries with architecture-law
enforcement. The rung-3 substrate stops being at-risk of
parallel-apparatus drift.

**Deliverables:**

1. Audit `workshop/synthetic-app/src/{SubstrateRenderer,
   SurfaceRenderer, FormRenderer}.tsx` against `product/
   catalog/`. Enumerate every `ShapeKind` the renderer
   dispatches on; for each, identify the catalog entry it
   projects from. Outcome: a projection table (new file at
   `workshop/synthetic-app/catalog-projection.ts`).
2. Any synthetic-app rendering code lacking a catalog
   projection is remediated — either by adding a catalog
   entry (if the shape is legitimately part of the product
   surface) or by deleting the synthetic-app code (if it's
   orphan scaffolding). No special cases in the law.
3. `workshop/synthetic-app/tests/catalog-driven.laws.spec.ts`
   — new laws file:
   - **L-CatalogDriven** per §5.5.
   - **L-Projection-Total** — the projection table covers
     every `ShapeKind` the renderer's dispatch table references.
4. `product/tests/architecture/seam-enforcement.laws.spec.ts`
   widens — workshop reads from `product/catalog/` is
   permitted only for the projection mapping, not for
   runtime re-derivation.

**Graduation.** Architecture laws green; the synthetic app's
shape vocabulary is a subset of the catalog's declared
surfaces.

**Dependency.** Independent of Z11g.b mechanically, but
calling out: if Z11g.b surfaces a parity failure that traces
to catalog-divergence, Z11g.c's audit must handle it.

### 8.4 Z11g.d — CommonCrawl-derived rung (legal-gated)

**Goal.** Rung-4 goes online as an executable substrate.
Real OutSystems DOMs are harvested under Z11f-prime, labeled,
and served to a playwright bridge; the live↔commoncrawl
parity law runs.

**Four internal sub-phases:**

#### Z11g.d.0 — Design-depth gate (~2 days, engineering-only)

Triggered **immediately** on Z11g landing this plan. Parallel
to engineering on Z11g.a/b/c; no external dependency.

- Retention-envelope specification authored per §6.1 as a
  concrete technical doc at `workshop/substrate-study/docs/
  retention-envelope.md`.
- Jurisdiction-origin allowlist + retention-horizon policy +
  sensitive-content gate pattern list encoded as data in
  `workshop/substrate-study/policy/retention-envelope.yaml`
  with a trust-policy read.
- Architecture-law skeleton for L-Fragment-Script-Stripped /
  L-Fragment-Third-Party-Stripped / L-Fragment-Sensitive-
  Content-Gate stubbed (tests that fail-by-default until d.1
  provides the pipeline they assert against).

Contingency modes per §6.4 are operator-triggered during d.1
or later, not pre-committed here.

#### Z11g.d.1 — Retention pipeline (~3 days, post-d.0)

**Deliverables:**

1. `workshop/substrate-study/infrastructure/retain-fragment.ts`
   — processes raw HTML from Z11f's fetch step into a
   `RetainedFragment`: script stripping, third-party filter,
   sensitive-content gate, inline-style flattening.
2. `workshop/substrate-study/domain/harvested-world-fixture.ts`
   — new `HarvestedWorldFixture` type per §7.2.
3. Parallel branch in the harvest pipeline: Z11f's
   `stripToShape` and Z11g.d's `retainFragment` both run on
   the same fetched HTML; outputs land in sibling log
   directories under `workshop/substrate-study/logs/{samples,
   retained}/`.
4. Quarterly purge cron-equivalent: `npx tsx scripts/
   substrate-purge.ts --as-of <date>` — deletes
   `RetainedFragment`s past the retention horizon. Laws
   assert no purge of unlabeled-but-within-horizon fragments.

**Graduation.** Retention pipeline runs; ≥1 quarter of
harvest produces ≥N labeled fragments (N = trust-policy-
seed, starts at 5; calibrates per §11's open question).

#### Z11g.d.2 — Labeling sidecar + workflow (~2 days, parallel to d.1)

**Deliverables:**

1. `workshop/substrate-study/domain/harvested-fixture-label.ts`
   — new `HarvestedFixtureLabel` type per §7.2.
2. `workshop/substrate-study/application/label-fixture.ts`
   — Effect program accepting an operator's labeling input,
   validating against the harvested fixture's retained
   fragment, emitting the append-only label record.
3. CLI: `npx tsx scripts/mcp-call.ts label_harvested_fixture
   '{"sampleId":"...","labels":[...]}'` — the labeling
   entrypoint; trust-policy gate enforces curator-id is a
   known operator.
4. Dashboard extension: `dashboard/mcp/` exposes
   `list_unlabeled_harvests` as a read-only view of samples
   awaiting curation.

**Graduation.** ≥5 labeled fixtures covering ≥3 distinct
verbs. Labeled fixtures pass the sensitive-content gate check
on curation (double-check).

#### Z11g.d.3 — Rung-4 adapter + parity law (~3 days, post-d.1 + d.2)

**Deliverables:**

1. `workshop/probe-derivation/commoncrawl-derived-harness.ts`
   — new `ProbeHarnessService` adapter serving the retained
   fragment to Playwright Chromium, stamping receipts with
   `adapter: 'commoncrawl-derived'`.
2. Widen `ProbeHarnessAdapter` enum per §7.1; bump
   `SUBSTRATE_VERSION` MINOR.
3. `workshop/probe-derivation/tests/rung-parity.laws.spec.ts`
   extended with:
   - **L-LiveCommoncrawl-Parity** — for every labeled
     harvested fixture, live-rung `invariantContent` matches
     commoncrawl-rung `invariantContent` within §5.3's
     tolerance. Fixtures without sufficient catalog coverage
     route to the corpus-coverage metric rather than causing
     parity failure.
4. `workshop/compounding/metrics/corpus-coverage.ts` — new
   per-visitor metric per §5.4.
5. `ScorecardCohorts.rung4` populated per §7.1.

**Graduation.** Live↔commoncrawl parity law green across the
labeled fixture set; corpus-coverage metric reports both
covered and uncovered `PatternKind`s; rung-4 scorecard
generated.

### 8.5 Sequencing summary

```
Z11g.a (dry)   ──► Z11g.b (parity)   ──► Z11g.c (catalog-discipline)
                                      \
                                       ──► (independent)
Z11g.d.0 (legal review) ──► Z11g.d.1 (retention)   ┐
                         \─► Z11g.d.2 (labeling)    ├──► Z11g.d.3 (rung-4 + parity)
                                                    ┘
```

Total engineering effort ~17 days end-to-end (d.0 is ~2d
design-depth, not an external wait). All phases are
engineering-paced.

## 9. Laws per phase

Consolidated law list — the full set Z11g commits to landing.
Each law names where it lives, what it asserts, and which
phase ships it.

### 9.1 Z11g.a laws

| Law | File | Asserts |
|---|---|---|
| **L-Dry-BIR** | `workshop/probe-derivation/tests/probe-harness-laws.spec.ts` | Three consecutive `runSpike` invocations against `DryProbeHarness` with pinned `now` yield identical `ProbeReceipt.provenance.content` fingerprints for every receipt. |
| **L-Invariant-Content-Pure** | same | `invariantContent` is a pure function of `(probe-id, observed.classification, observed.errorFamily, exercises[].rung, fixtureFingerprint, substrateVersion)`. Varying other fields (startedAt, adapter) does not change `invariantContent`. |
| **L-Invariant-Content-Total** | same | Every `ProbeReceipt` carries a non-empty `invariantContent` — the field is never optional. |
| **L-Fixture-Schema** | `product/tests/architecture/fixture-schema.laws.spec.ts` | Every `*.probe.yaml` under `product/` validates against §5.2's schema 1. Unknown top-level keys fail the build. |
| **L-Fixture-World-Manifest-Aligned** | same | `world.*` leaf values that reference facet-kinds / error-families are declared in `product/manifest/manifest.json`. Manifest drift fails the build. |

### 9.2 Z11g.b laws

| Law | File | Asserts |
|---|---|---|
| **L-DryReplay-Parity** | `workshop/probe-derivation/tests/rung-parity.laws.spec.ts` | For every fixture exercised at both dry and fixture-replay rungs at the same `SUBSTRATE_VERSION`, `invariantContent` matches exactly. |
| **L-ReplayLive-Parity** | same | Same across fixture-replay and playwright-live. |
| **L-Tolerance-Bound** | same | `elapsedMs_upper / elapsedMs_lower ≤ 100` per §5.3 across variant-band comparisons. |
| **L-Parity-Failure-Provenance** | same | Any `ParityFailureRecord` emitted carries both rungs' `invariantContent` fingerprints for post-hoc audit. |

### 9.3 Z11g.c laws

| Law | File | Asserts |
|---|---|---|
| **L-CatalogDriven** | `workshop/synthetic-app/tests/catalog-driven.laws.spec.ts` | Every `ShapeKind` dispatched by `SubstrateRenderer` / `SurfaceRenderer` / `FormRenderer` has a projection entry in `workshop/synthetic-app/catalog-projection.ts` pointing at a `product/catalog/*/surface.yaml` declaration. |
| **L-Projection-Total** | same | The projection table covers every `ShapeKind` the renderer dispatch table references. Missing entries fail the build. |
| **L-Projection-Terminal** | same | Projection entries point at real catalog files; a pointer to a non-existent or deleted catalog entry fails the build. |
| **L-Seam-Catalog-Read-Only** | `product/tests/architecture/seam-enforcement.laws.spec.ts` (extended) | Workshop's read from `product/catalog/` is restricted to the projection-mapping path; runtime re-derivation of catalog entries from workshop is forbidden. |

### 9.4 Z11g.d laws

| Law | File | Asserts |
|---|---|---|
| **L-Fragment-Script-Stripped** | `workshop/substrate-study/tests/retain-fragment.laws.spec.ts` | Every `RetainedFragment.bodyHtml` contains zero executable `<script>` elements and zero `on*=` inline-handler attributes. |
| **L-Fragment-Third-Party-Stripped** | same | `retainedDigest` fingerprints a fragment whose external-resource references are exclusively within the approved domain allowlist. |
| **L-Fragment-Sensitive-Content-Gate** | same | Every `HarvestedWorldFixture` either records `sensitiveContentGate.passed: true` or is not stored (no partial artifacts). |
| **L-Fragment-Horizon-Purge** | same | `substrate-purge` deletes no fragment whose `retainedAt + retentionHorizonQuarters` exceeds `asOf`. |
| **L-Label-Curator-Known** | `workshop/substrate-study/tests/label-fixture.laws.spec.ts` | Every `HarvestedFixtureLabel` carries a `curator` that passes `workshop/policy/trust-policy.yaml`'s operator allowlist. |
| **L-Label-Append-Only** | same | Labels are append-only; a second label for the same `(sampleId, verb, fixture)` triple is allowed only if it records a different curator (multi-curator endorsement). In-place mutation fails. |
| **L-Label-Covers-Harvest** | same | Every label's `expected.errorFamily` is drawn from the error-families declared in the probe's fixture for the referenced `(verb, fixture)` triple. |
| **L-LiveCommoncrawl-Parity** | `workshop/probe-derivation/tests/rung-parity.laws.spec.ts` (extended) | For every labeled harvested fixture, playwright-live and commoncrawl-derived `invariantContent` fingerprints match exactly. Variant-band `elapsedMs` within §5.3 tolerance. |
| **L-Corpus-Coverage-Complete** | `workshop/compounding/tests/corpus-coverage.laws.spec.ts` | For every `PatternKind` in the trust-policy-approved pattern set, `scorecard.cohorts.rung4.coverage[patternKind]` exists (either covered or uncovered); no silent omissions. |
| **L-Rung4-Scorecard-Substrate-Version** | same | Every `Rung4CommoncrawlScorecard` carries the `SUBSTRATE_VERSION` of the harvest + labeling epoch; scorecards across versions are not comparable. |

**Law count**: 24 total (5 in a, 4 in b, 4 in c, 11 in d),
enforced at either unit, architecture, or laws test level.
None are convention-only.

## 10. Risks and mitigations

Six risks, ranked by likelihood × impact. Each classified by
the deep-dive's tripartite: design-fragile (plan as-written
might not survive contact), execution-fragile (depends on
tooling / shapes outside the repo), measurement-fragile (could
pass laws while not actually helping).

### R1 — Self-imposed envelope under-specifies retention controls (design-fragile)

**Likelihood**: Medium. The envelope is operator-authored, not
externally reviewed; a control we forgot is a control that
doesn't exist. Without the friction of counsel review, the
design-depth gate is the only forcing function.
**Impact**: High. An under-specified envelope that ships means
retained fragments carry risks the operator didn't anticipate.

**Mitigations**:
- Treat Z11g.d.0 as a **rigor-first deliverable**, not a
  rubber-stamp. Author retention-envelope.md as if counsel
  were going to review it; apply the external bar as a
  self-imposed bar.
- Architecture laws land in d.0 as fail-by-default tests
  (script-stripped, third-party-stripped, sensitive-content-
  gated). d.1's retention pipeline must light them up; d.0's
  skeleton forces the shape of what d.1 has to satisfy.
- Contingency modes are pre-designed (§6.4). Narrower-corpus
  mode uses `scorecard.cohorts.rung4.coverage` to report
  scope honestly; fallback-to-reifier mode is a distinct
  adapter tag (`'commoncrawl-reified'`), never a silent
  degradation of `'commoncrawl-derived'`.

### R2 — Catalog-driven law surfaces irremediable drift (design-fragile)

**Likelihood**: Medium. The synthetic app has ~700 lines of
React. Audit will likely surface at least a few shape-kinds
without catalog backing.
**Impact**: Medium. Remediation could be large if
synthetic-app renderers encode implicit world-shapes the
catalog doesn't model.

**Mitigations**:
- Z11g.c starts with an **audit pass** (not code changes) —
  enumerate the drift, classify each case. Decisions: add
  catalog entry, delete renderer code, or split into a
  catalog-addition commit before the law lands.
- Never special-case the law. If a `ShapeKind` cannot be
  catalog-backed, it does not belong in the synthetic app
  and must be deleted. The substrate-plurality invariant
  (v2-synthetic-workshop-dogfood.md:90–92) treats this as
  the correct resolution.

### R3 — Rung-4 parity failures are false positives (measurement-fragile)

**Likelihood**: Medium. Real OutSystems DOMs carry
version drift, A/B test variants, customer-theme CSS that the
synthetic app's catalog projection will not model. Some
parity failures will flag world-shapes outside the catalog's
coverage, not product-behavior drift.
**Impact**: Medium. False positives erode the rung's
credibility as the "ideal target."

**Mitigations**:
- §5.4's `corpus-coverage` metric is the explicit sink for
  un-coverable world-shapes. Harvested fixtures not labeled
  against catalog-backed world-shapes route to the coverage
  metric, not to `ParityFailureRecord`.
- The `HarvestedFixtureLabel.rationale` field carries the
  operator's judgment about whether a harvest exhibits a
  catalog-modeled world-shape. Unlabeled harvests are not
  eligible for parity checks.
- Quarterly operator review of `ParityFailureRecord`s with a
  trust-policy gate: recurring failures that trace to
  catalog-coverage gaps trigger a catalog extension proposal
  through the existing `workshop/policy/` pipeline.

### R4 — SUBSTRATE_VERSION bump cadence exceeds operator throughput (measurement-fragile)

**Likelihood**: Low-medium. Each enum widening or catalog
schema change bumps the version; baselines reset; operator
re-curation needed for anything scorecard-compared across the
bump.
**Impact**: Medium. Frequent bumps fragment the comparison
window and make graduation harder to detect.

**Mitigations**:
- Batch version bumps at phase boundaries (one bump per
  Z11g.a/b/c/d.1/d.3, not per commit).
- The MINOR/MAJOR distinction (v2-probe-ir-spike.md §8.6)
  already supports additive changes without baseline reset;
  the plan leans on MINOR wherever possible.
- Scorecard comparison windows are scoped to a single
  `SUBSTRATE_VERSION`. Cross-version comparison is an
  opt-in, not the default.

### R5 — Labeling bottleneck (execution-fragile)

**Likelihood**: High. Rung-4 parity needs labeled fixtures;
labeling is operator-gated and human-rate-limited.
**Impact**: Medium-high. Rung-4's graduation depends on
label count × coverage breadth.

**Mitigations**:
- The Z11f pipeline already produces `PatternKind` hits; the
  labeling workflow can bootstrap by surfacing high-
  confidence pattern-matches as **proposed** labels for
  curator review, not blank slates.
- The corpus-coverage metric explicitly reports label count
  so operator throughput is visible in the scorecard.
- An explicit throughput target — e.g., 10 labeled fixtures /
  quarter per operator — is an open question (§11) but the
  plan does not block on it.

### R6 — Reifier fallback path silently activates (design-fragile)

**Likelihood**: Low-medium. If Z11g.d.0 partially approves
(e.g., commoncrawl only, no Wayback), the scope-narrowed
rung-4 might degrade toward the reifier path without a
deliberate operator decision.
**Impact**: High. A silent degradation means the scorecard's
rung-4 field no longer measures what its name implies.

**Mitigations**:
- The reifier path is NOT part of Z11g.d as written. It is
  the worst-case fallback if counsel refuses outright. No
  partial-reifier hybrid.
- If counsel narrows scope, the corpus-coverage metric
  reports the narrower corpus; the adapter remains "real-DOM
  replay" against the narrower set, not a shape-reifier.
- The adapter tag `'commoncrawl-derived'` stays tied to
  real-DOM replay. A future plan that introduces the reifier
  path (if ever) must use a distinct tag
  (`'commoncrawl-reified'` or similar).

## 11. Open questions

Ten questions the plan does not pre-decide. Each flagged with
the phase that blocks on its answer.

| # | Question | Blocks |
|---|---|---|
| Q1 | `elapsedMs` tolerance bound: is 100× right, or should it be tighter / wider? Calibrate after Z11g.b first runs. | Z11g.b calibration pass |
| Q2 | Minimum label count for rung-4 graduation: is ≥5 sufficient, or should the gate scale with `PatternKind` count? | Z11g.d.3 graduation |
| Q3 | Per-curator operator throughput target for labeling. | Z11g.d.2 long-term planning (not blocking first commit) |
| Q4 | Does the `ParityFailureRecord` log append-only indefinitely or purge at `SUBSTRATE_VERSION` MAJOR bumps? | Z11g.b retention design |
| Q5 | Should the corpus-coverage metric distinguish "absent from corpus" (harvest hasn't yet seen it) from "structurally inaccessible" (behind auth)? | Z11g.d.3 metric design |
| Q6 | Do multi-curator endorsements (same `(sampleId, verb, fixture)` triple labeled by multiple curators) factor into a label-confidence score, or does the first label bind? | Z11g.d.2 label semantics |
| Q7 | Jurisdiction-cap enforcement: does the harvest pipeline filter at fetch time, retain time, or both? | Z11g.d.1 retention design |
| Q8 | Quarterly purge: hard delete or soft delete with audit trail? | Z11g.d.1 retention design |
| Q9 | For rung-4 receipts on world-shapes outside catalog coverage, does the receipt carry `classification: 'ambiguous'` or route to the coverage metric entirely (no receipt)? | Z11g.d.3 adapter semantics |
| Q10 | If a `HarvestedFixtureLabel` is later revoked (curator error), what happens to receipts emitted against fixtures using that label before revocation? | Z11g.d.2 long-term (not blocking first commit) |

## 12. Graduation and success criteria

Z11g graduates when all four of the following hold:

### 12.1 Phase-level graduations

Each phase's own graduation (§§8.1–8.4) independently met.

### 12.2 Substrate-ladder law set green

All 24 laws (§9) green on a single commit. Particularly:
- L-Dry-BIR, L-DryReplay-Parity, L-ReplayLive-Parity green →
  the three existing rungs are mutually consistent.
- L-CatalogDriven green → the synthetic app is not parallel
  apparatus.
- L-LiveCommoncrawl-Parity green → the substrate-invariance
  theorem has real-DOM evidence.

### 12.3 Corpus-coverage honesty

`scorecard.cohorts.rung4.coverage` reports every
trust-policy-approved `PatternKind` as either covered (with
`supportCount ≥ 3`) or explicitly uncovered (with a reason:
`absent-from-corpus` / `structurally-inaccessible` /
`pending-labeling`). No `undefined` states; no silent gaps.

### 12.4 Verdict-12 candidate

With all four rungs live, Z11g enables a **verdict-12
classification** along two honesty axes:

1. **Substrate-fidelity axis**: the cross-rung parity results
   (rung-parity.json) demonstrate the substrate-invariance
   theorem holds across all three adjacent rung pairs.
2. **Real-world grounding axis**: the rung-4 corpus-coverage
   metric demonstrates the workshop's ceiling is honestly
   named.

Verdict-12's classification rubric advances from multi-
cohort-synthetic (Verdict-11) to **multi-rung-grounded**.

### 12.5 What graduation does NOT require

- **Customer-production access.** Deferred to a future plan.
- **100% corpus coverage.** Only the trust-policy-approved
  pattern set must be covered; the overall harvest-corpus
  coverage floor is calibrated in Q2.
- **Zero parity failures across all fixtures.** Failures that
  route to the corpus-coverage metric (i.e., outside catalog
  coverage) do not block graduation. Failures on catalog-
  covered fixtures do.

## 13. Retirement of the Z11b plan

`docs/v2-executed-test-cohort-plan.md` (Z11b) is retired by
this plan. Z11b as written:

- Named the metric as "stability-rate over N-repeat Playwright
  runs." v2-probe-ir-spike.md §7:316 commits the sharper
  byte-identical-receipt reproducibility; Z11g uses the
  sharper metric.
- Assumed a single executed-test cohort. Z11g's four-rung
  ladder supersedes this with a per-rung scorecard cohort
  (`rung4`) plus cross-rung parity laws that are not a
  cohort.
- Framed the work as a mechanical Z11a template reuse
  (new cohort kind + new prediction kind + CLI verb). The
  substrate-ladder work is not mechanical; §§6–9 show why.

**Retirement action.** Z11b plan file moves to
`docs/archive/v2-executed-test-cohort-plan.md` on Z11g.a
landing, with a forward-pointer note at the top of the
archived file directing readers here. CLAUDE.md's "three
forward paths" block updates to name Z11g in place of Z11b
at the same landing commit.

**What survives from Z11b.** One idea: the per-spec retry
aggregation (Z11b's `pass | flake | fail` enum) retains some
diagnostic value even under byte-identical-receipt
reproducibility — a non-byte-identical run that is
nevertheless catalog-covered is a legitimate investigation
target. Z11g does NOT land this as a cohort; a future plan
may re-introduce per-spec retry diagnostics as an operator
tool (not a graduation gate).

## 14. Relationship to Z11d

Z11d (live reasoning adapter) and Z11g (substrate ladder) are
**orthogonal**. Z11d modifies the agent-cognition seam (the
`Reasoning` port's adapter); Z11g modifies the world-shape
seam (the `ProbeHarness` port's adapters). They may proceed
in parallel without engineering conflict.

**Three concrete interaction points.**

1. **Provider tag separation.** Z11d's first-commit
   recommendation (see session deep-dive): closed
   `ReasoningProvider` enum with `'claude-code-session-
   autotelic' | 'claude-code-session-prompted' | 'operator-
   authored' | 'composite' | 'deterministic'`. Z11g does NOT
   widen this enum. If Z11d lands first, Z11g's rung-4
   adapter can optionally stamp receipts with the provider
   tag without additional schema work.
2. **Fill-quality drift (Z11d R2)** and **rung-4 parity
   failures (Z11g R3)** are both measurement-fragile in
   similar ways. Z11d's L-Fill-Distinctness law (ZD2.i) and
   Z11g's L-Corpus-Coverage-Complete law together let
   Verdict-12 disentangle "the agent reasoned well" from
   "the substrate classified consistently."
3. **Compounding-engine cohort mix.** Verdict-12's
   classification rubric folds both dimensions (substrate
   fidelity from Z11g + reasoning fidelity from Z11d). A
   verdict that holds on one but not the other is still
   worth emitting; the classification string distinguishes
   them.

**Z11d is the recommended start-first path** because its
R2 risk (fill-quality drift) has a first-commit mitigation
(the Q1 decision) that is cheaper now than later. Z11g may
start in parallel; its first phase (Z11g.a) is mechanically
independent.

---

**Plan summary**: 4 phases, 24 laws, 6 risks, 10 open
questions, ~17 engineering days end-to-end (no external
dependencies). Retires Z11b. Orthogonal to Z11d. Enables
Verdict-12's multi-rung-grounded classification.
