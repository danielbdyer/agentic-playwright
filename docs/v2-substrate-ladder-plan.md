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
adding a CommonCrawl-derived rung that probes a Platonic-form
canonical target distilled in perpetuity from harvested
OutSystems DOM evidence, commit catalog-driven generation as
the synthetic React app's invariant, and resolve the three
load-bearing doc-silences (dry-rung byte-identical-receipt
law, numeric parity-band tolerance, corpus-coverage metric)
so the substrate-invariance theorem has executable evidence
across all four rungs.**

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
- §6 — Z11f-prime: the Platonic-form distillation
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
| `spike-harness.ts` | — | Runs a probe set against the currently-composed `ProbeHarness`, emits a `SpikeReport` |
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

### 4.4 Rung 4: CommonCrawl-derived (Platonic-form target)

**Epistemic role.** The canonical center-target of the
OutSystems DOM, distilled in perpetuity from harvested
evidence, with edge cases amalgamated into the target to
harden test variety. A rung-4 receipt proves "the product's
classifier, running against the Platonic-form OutSystems DOM
for this world-shape, reaches the expected verdict."
Divergence from rung-3 is not per-page drift; it is drift
between the synthetic app's catalog-projection and the
distilled-from-evidence canonical target.

**Substrate shape.** Under Z11f-prime (§6), harvested
`SampleShape`s feed a **distillation pipeline** that produces
a **canonical DOM target** per world-shape — not a per-page
archive. The rung-4 adapter serves the canonical target
to Playwright. The pipeline is in-perpetuity: new harvests
extend the evidence base; the distillation re-runs; the
canonical target evolves as evidence accumulates.

The canonical target for a given world-shape is a DOM
generator whose output captures:

1. **The central tendency** — the most-frequent
   structural / ARIA / class-prefix pattern observed across
   harvests for that world-shape.
2. **Hardened edge-case variants** — lower-frequency-but-
   non-noise variants amalgamated as alternate renderings
   of the same world-shape, so a probe classified on the
   central tendency is also probed against the variants in
   the same rung.

**Adapter tag.** `'commoncrawl-derived'` (new; §7 widens the
enum).

**Parity obligation.** Upward to rung-3: on invariant-band
axes, `observed` matches within tolerance for the central
tendency AND for every amalgamated edge-case variant.
Divergences are the workshop's refutation signal — either
the synthetic-app rung's catalog-projection is incomplete
(a variant exists in real OS DOMs that the synthetic app
doesn't render), or the product classifier is fragile to a
variant it should be invariant under.

**No per-page retention.** Harvests contribute evidence to
the distillation; individual harvest fragments are not
retained as replayable artifacts. The Platonic-form target
is the stored substrate; its DOM is a derivative of many
harvests, not a copy of any one.

**What Z11g adds.** Everything: the adapter, the distillation
pipeline (§6 Z11f-prime extension), the world-shape → canonical-
target mapping, the corpus-coverage metric (§5.4; measures
which world-shapes have sufficient evidence to have a
canonical target), and the cross-rung parity law for
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
§7:161) because the workshop *owns* it. The "catalog" Z11g
enforces against is the **workshop-owned substrate vocabulary**
at `workshop/substrate/surface-spec.ts` — the closed
`SurfaceRole` union and its sibling closed axes. The renderer
at `workshop/synthetic-app/src/SurfaceRenderer.tsx` must be a
**total projection** of that vocabulary: every `SurfaceRole`
has a renderer strategy declared in an explicit projection
record, and every branch of the renderer corresponds to a
declared projection entry.

> **L-CatalogDriven (Total Substrate-Vocab Projection).** Every
> `SurfaceRole` in the closed union has exactly one entry in
> `workshop/synthetic-app/catalog-projection.ts`'s
> `SURFACE_ROLE_PROJECTION` record, whose strategy is one of
> `'specialized'` (the renderer has an explicit `if (spec.role
> === 'X')` handler) or `'generic'` (the renderer falls through
> to the catchall `<div role={spec.role}>` path). The record is
> typed as `Record<SurfaceRole, {strategy, rationale}>`, so
> missing entries fail the build at type-check time.

**Architecture-law enforcement.**
`tests/synthetic-app/catalog-driven.laws.spec.ts`
— three laws:

- **L-CatalogDriven**: `SURFACE_ROLE_PROJECTION` is keyed by
  exactly the `SurfaceRole` values (enforced by TypeScript at
  type-check, re-checked at runtime against
  `SURFACE_ROLE_VALUES`).
- **L-Projection-Total**: every role in `SURFACE_ROLE_VALUES`
  has a declared strategy.
- **L-Projection-Terminal**: every strategy is one of the
  closed union values; every `'specialized'` entry corresponds
  to an explicit handler branch in the renderer source (static
  grep of the renderer file for `spec.role === '<role>'`);
  every `'generic'` entry is absent from that grep (i.e.,
  actually falls through).

**Why not `product/catalog/`?** The plan originally named
`product/catalog/*/surface.yaml` as the source of truth.
The repo's actual vocabulary source is
`workshop/substrate/surface-spec.ts` — workshop-owned
because the substrate vocabulary is workshop's measurement
domain, not product's runtime domain. The anti-parallel-
apparatus invariant still holds: the synthetic app cannot
acknowledge a role the vocabulary doesn't declare, and the
vocabulary cannot declare a role the renderer doesn't project.
The source-of-truth arrow is workshop-internal.

**What this does NOT forbid.** Entropy-wrapper perturbations
(`EntropyWrapper.tsx`) are permitted and required — they are
chrome invariance exercises, not alternate world-shapes. The
law scopes to `SurfaceRenderer`'s role dispatch, not to
the entropy perturbations around it.

**Retroactive application.** If the audit at Z11g.c time
surfaces renderer code handling a role that is NOT in
`SurfaceRole`, the remediation is to add the role to the
closed union (if legitimate) or delete the renderer branch
(if not) — never to special-case the law.

## 6. Z11f-prime: the Platonic-form distillation

The existing Z11f plan (`docs/v2-substrate-study-plan.md`)
harvests OutSystems DOMs from Common Crawl, Wayback, and OS
showcase pages and distills them into `SampleShape` records
plus frequency tables; raw HTML "never lands on disk as-is"
(`docs/v2-substrate-study-plan.md:60–63`). That pipeline is
correct for matcher-proposal distillation. It is also
**structurally correct for the rung-4 substrate reframe** —
the workshop does not need per-page retention; it needs a
**canonical DOM target** distilled from harvested evidence.

Z11g declares **Z11f-prime** as a distillation extension on
top of Z11f's existing shape pipeline: harvested SampleShapes
feed a new pipeline stage that produces a **Platonic-form DOM
target per world-shape**, amalgamating the central-tendency
structure plus hardened edge-case variants. No per-page
retention; no retention horizon; no quarterly purge. The
canonical target evolves in perpetuity as evidence accumulates.

**What Z11g.d.0 is** (§8.4): a **design-depth gate** that
specifies the distillation algorithm — how SampleShapes map
to a canonical target, what counts as a hardened edge-case
variant vs. noise, how world-shape identity is preserved
across harvests. The gate lands concrete engineering
artifacts (algorithm spec + amalgamation policy +
architecture-law skeletons), not approval signatures.
No external dependency; no wall-clock wait.

### 6.1 What Z11f-prime adds on top of Z11f

Z11f-prime extends Z11f's output side with distillation:

- **World-shape → canonical target map.** A new
  `CanonicalTarget` record per world-shape, derived from the
  population of `SampleShape`s observed for that world-shape.
  The canonical target specifies a DOM generator that produces
  the central-tendency structure when invoked.
- **Edge-case variant amalgamation.** SampleShape variants
  that diverge from the central tendency above a noise floor
  (but below the level that would constitute a new world-shape)
  are attached to the canonical target as **hardened variants**.
  The rung-4 adapter probes the world-shape N+1 times: once
  against the central tendency, N times against each hardened
  variant.
- **Evidence aggregation provenance.** Each `CanonicalTarget`
  carries the list of contributing `SampleShape` fingerprints
  and the amalgamation decisions (which variants promoted,
  which rejected as noise). Append-only; evolution over time
  is traceable.
- **In-perpetuity evolution.** The distillation re-runs when
  new harvests land. A `CanonicalTarget` version bump occurs
  when the amalgamation changes materially (new edge-case
  promoted, or central-tendency drift exceeds threshold). The
  canonical target's `SUBSTRATE_VERSION` stamp lets scorecards
  distinguish receipts across target evolutions.

### 6.2 What Z11f-prime does NOT do

Z11f-prime does not:

- **Retain per-page fragments.** No individual harvested page
  is stored as a replayable artifact. Raw HTML remains as in
  Z11f: "consumed and discarded in the same function; never
  lands on disk as-is."
- **Replay specific pages.** The substrate-under-test is the
  canonical target, not a specific page. A rung-4 probe does
  not have a "source page" — it has a canonical-target
  version, a world-shape, and an amalgamated-variant index.
- **Rely on authenticated access.** Unchanged from Z11f.
  Distillation consumes only Googlebot-visible evidence.
- **Require jurisdiction caps or retention horizons.** The
  Platonic-form framing eliminates per-page concerns. The
  distillation is the stored artifact; no purge needed.
- **Live-fetch.** Harvests are batched; distillation runs
  offline; rung-4 serves the canonical target from the
  already-distilled store.

### 6.3 Z11f-prime's relationship to Z11f

Z11f-prime **extends** Z11f's pipeline with a distillation
stage. Both sides index the same `sampleId`; Z11f's matcher-
proposal side continues unchanged, and the distillation side
reads the same `SampleShape` output:

```
harvest source (commoncrawl/wayback/showcase)
       │
       ▼
  fetch raw HTML
       │
       ▼
  stripToShape()   ──► SampleShape
                               │
                               ├──► matcher-proposal distillation (Z11f)
                               │
                               └──► canonical-target distillation (Z11f-prime)
                                            │
                                            ▼
                                   CanonicalTarget<world-shape>
                                            │
                                            ▼
                                    rung-4 adapter
```

No new retention; no new legal posture. The engineering
delta is the distillation algorithm + amalgamation policy +
canonical-target storage.

### 6.4 Design-depth gate (Z11g.d.0)

Z11g.d.0 is the design-depth checkpoint for Z11f-prime. It
authors the distillation algorithm + amalgamation policy in
enough depth to survive engineering scrutiny. The required
outputs are engineering artifacts:

1. **Distillation algorithm specification** — how a population
   of `SampleShape`s for a given world-shape produces a
   `CanonicalTarget`. What the central-tendency aggregation
   is (mode over whitelisted attributes? median over
   continuous features? typed-pattern union?). How ambiguity
   resolves.
2. **Edge-case amalgamation policy** — what threshold
   separates "hardened variant worth probing" from "noise,
   ignore." What happens when a variant's support is high
   enough to suggest a new world-shape rather than a variant
   of an existing one.
3. **World-shape identity preservation** — the rule that a
   harvested page's classification into a world-shape (via
   Z11f's `PatternKind` / classifier output) is stable
   enough for the distillation to group correctly. What
   happens when a page exhibits multiple world-shapes.
4. **Canonical-target versioning rule** — when does a
   material amalgamation change warrant a `SUBSTRATE_VERSION`
   MINOR bump vs. a MAJOR bump. Rules per §3.3.

This is a **code-plus-doc deliverable**, not an approval gate.
It lands as a concrete commit with the distillation pipeline's
algorithm encoded.

**Contingency modes** (operator-triggered):

- **Narrow-corpus mode.** If a world-shape's harvest evidence
  is below a configured floor (e.g., <5 samples), the
  distillation refuses to produce a canonical target for it;
  the `corpus-coverage` metric reports the floor-miss
  explicitly. Rung-4 probes for that world-shape are
  unavailable until more evidence accumulates.
- **Drift-detection mode.** If the central tendency for a
  world-shape shifts materially (defined per §6.4.4) between
  two distillation runs, a `SUBSTRATE_VERSION` MAJOR bump
  fires; scorecard baselines for rung-4 reset for that
  world-shape.

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

**`CanonicalTarget`** — the distilled Platonic-form substrate:

```ts
// workshop/substrate-study/domain/canonical-target.ts
export interface CanonicalTarget extends WorkflowMetadata<'preparation'> {
  readonly worldShape: WorldShapeId;
  readonly targetVersion: CanonicalTargetVersion;  // monotone per world-shape
  readonly centralTendency: CanonicalDomGenerator;
  readonly hardenedVariants: readonly HardenedVariant[];
  readonly contributingSamples: readonly Fingerprint<'substrate-sample-shape'>[];
  readonly amalgamationDecisions: readonly AmalgamationDecision[];
  readonly substrateVersion: SubstrateVersion;
}

export interface CanonicalDomGenerator {
  // A pure function from (worldShape, variantIndex | null) to a DOM
  // tree. The rung-4 adapter invokes it with variantIndex=null for
  // the central tendency or an index into hardenedVariants.
  readonly generate: (variantIndex: number | null) => DomTree;
  readonly generatorFingerprint: Fingerprint<'canonical-target-generator'>;
}

export interface HardenedVariant {
  readonly variantIndex: NonNegativeInt;
  readonly support: NonNegativeInt;  // contributing-sample count
  readonly divergenceSignature: Fingerprint<'canonical-target-variant'>;
  readonly rationale: NonEmptyString;
}

export interface AmalgamationDecision {
  readonly sampleFingerprint: Fingerprint<'substrate-sample-shape'>;
  readonly outcome: 'central-tendency' | 'hardened-variant' | 'noise-rejected';
  readonly rationaleFingerprint: Fingerprint<'amalgamation-decision'>;
}
```

Storage at `workshop/substrate-study/logs/canonical-targets/
<world-shape-id>/<target-version>.json` — append-only (new
versions land as new files; prior versions retained for
scorecard back-comparison).

No per-page retention. No `HarvestedWorldFixture` type.
No `HarvestedFixtureLabel` type. The Platonic-form framing
removes both — labeling happens at world-shape identity
time in Z11f's existing classifier pipeline, not per-page.

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

- `CanonicalTarget` stamps `stage: 'preparation'` — it is
  a substrate-preparation artifact consumed by the rung-4
  adapter.
- `ParityFailureRecord` stamps `stage: 'evidence'` — a parity
  failure is evidence against the substrate-invariance
  theorem.
- `Rung4CommoncrawlScorecard` lives inside the existing
  scorecard envelope (stage `'projection'`), no new envelope
  needed.
- All new fingerprint tags register in
  `product/domain/kernel/hash.ts`'s closed tag registry:
  `'canonical-target-generator'`, `'canonical-target-variant'`,
  `'amalgamation-decision'`, `'substrate-sample-shape'`,
  `'probe-receipt-invariant'`.

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
   — Effect program that takes two `SpikeReport`s from
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

### 8.3 Z11g.c — Total substrate-vocab projection enforcement (~2 days)

**Goal.** The synthetic React app's renderer must be a total
projection of `workshop/substrate/`'s vocabulary (the closed
`SurfaceRole` union and its sibling closed axes). The rung-3
substrate stops being at-risk of parallel-apparatus drift
because a missing or stale role in either the vocabulary or
the renderer fails the build.

**Deliverables:**

1. `workshop/substrate/surface-spec.ts` extended with a
   runtime `SURFACE_ROLE_VALUES: readonly SurfaceRole[]`
   constant + a compile-time exhaustiveness witness that
   forces the array to match the type.
2. `workshop/synthetic-app/catalog-projection.ts` — new file
   exporting `SURFACE_ROLE_PROJECTION: Record<SurfaceRole,
   {strategy: 'specialized' | 'generic', rationale: string}>`.
   Missing entries fail the type check; orphan entries fail
   the type check. The rationale is human-readable; the
   strategy classification is mechanically testable against
   the renderer source.
3. `tests/synthetic-app/catalog-driven.laws.spec.ts` — new
   laws file under workshop-side test tree (not under
   `product/tests/architecture/` because workshop imports
   from workshop):
   - **L-CatalogDriven** per §5.5.
   - **L-Projection-Total** — `SURFACE_ROLE_PROJECTION`
     covers every value in `SURFACE_ROLE_VALUES`.
   - **L-Projection-Terminal** — `'specialized'` entries
     correspond to explicit `if (spec.role === '<role>')`
     branches in `SurfaceRenderer.tsx` source; `'generic'`
     entries have no such branch.

**Graduation.** Architecture laws green; the synthetic app's
renderer vocabulary is the exact set of `SurfaceRole` values.
A new role added to the union without a corresponding
projection entry fails the type check; a projection entry
without a matching renderer branch fails the law.

**Dependency.** Independent of Z11g.b mechanically. No
seam-enforcement changes are needed because the projection
record is workshop→workshop (substrate→synthetic-app), not
workshop→product.

### 8.4 Z11g.d — CommonCrawl-derived rung (legal-gated)

**Goal.** Rung-4 goes online as an executable substrate.
Real OutSystems DOMs are harvested under Z11f-prime, labeled,
and served to a playwright bridge; the live↔commoncrawl
parity law runs.

**Four internal sub-phases:**

#### Z11g.d.0 — Design-depth gate (~2 days, engineering-only)

Triggered **immediately** on Z11g landing this plan. Parallel
to engineering on Z11g.a/b/c; no external dependency.

- Distillation-algorithm specification authored at
  `workshop/substrate-study/docs/canonical-target-algorithm.md`
  — central-tendency aggregation, edge-case amalgamation
  threshold, world-shape identity preservation.
- Amalgamation-policy data at
  `workshop/substrate-study/policy/amalgamation-policy.yaml`
  — support thresholds for variant promotion, noise floor,
  divergence-signature similarity bounds.
- Architecture-law skeletons for L-Canonical-Target-Derivable /
  L-Amalgamation-Deterministic / L-Variant-Support-Floor
  stubbed (fail-by-default until d.1 provides the pipeline).

Contingency modes per §6.4 are operator-triggered during d.1
or later, not pre-committed here.

#### Z11g.d.1 — Distillation pipeline (~4 days, post-d.0)

**Deliverables:**

1. `workshop/substrate-study/application/distill-canonical-
   target.ts` — consumes `SampleShape` populations per
   world-shape, applies the amalgamation policy, produces
   `CanonicalTarget` records. Append-only at
   `workshop/substrate-study/logs/canonical-targets/
   <world-shape-id>/<target-version>.json`.
2. `workshop/substrate-study/domain/canonical-target.ts`
   — new `CanonicalTarget` type + `CanonicalDomGenerator`
   + `HardenedVariant` + `AmalgamationDecision` per §7.2.
3. `workshop/substrate-study/infrastructure/canonical-
   target-store.ts` — read / write adapter for canonical-
   target records; version-monotone per world-shape.
4. Re-distillation trigger: `npx tsx scripts/speedrun.ts
   redistill --world-shape <id>` — re-runs distillation for
   a specific world-shape, typically after new harvests
   land. Always emits a new target-version file; never
   overwrites.

**Graduation.** Distillation pipeline runs end-to-end across
Z11f's existing SampleShape corpus; ≥1 `CanonicalTarget`
emitted per world-shape where sample count ≥ floor; laws
L-Canonical-Target-Derivable + L-Amalgamation-Deterministic
+ L-Variant-Support-Floor all green.

#### Z11g.d.3 — Rung-4 adapter + parity law (~3 days, post-d.1)

**Deliverables:**

1. `workshop/probe-derivation/commoncrawl-derived-harness.ts`
   — new `ProbeHarnessService` adapter invoking
   `CanonicalDomGenerator.generate(variantIndex)` per probe,
   serving the generated DOM to Playwright Chromium,
   stamping receipts with `adapter: 'commoncrawl-derived'`
   and the `targetVersion` + `variantIndex` in provenance.
2. Widen `ProbeHarnessAdapter` enum per §7.1; bump
   `SUBSTRATE_VERSION` MINOR.
3. `workshop/probe-derivation/tests/rung-parity.laws.spec.ts`
   extended with:
   - **L-LiveCommoncrawl-Parity** — for every world-shape
     that has a `CanonicalTarget`, live-rung and rung-4
     (central-tendency) `invariantContent` fingerprints
     match. Additionally, rung-4 probes each hardened
     variant; variant-divergence receipts are parity-tested
     against the live rung as well.
4. `workshop/compounding/metrics/corpus-coverage.ts` — new
   per-visitor metric per §5.4. Reports world-shapes with
   a canonical target (covered), without one (corpus-floor-
   miss), or structurally inaccessible (auth-gated).
5. `ScorecardCohorts.rung4` populated per §7.1.

**Graduation.** Live↔commoncrawl parity law green across
world-shapes with canonical targets + all hardened variants;
corpus-coverage metric reports both covered and
floor-miss world-shapes; rung-4 scorecard generated.

### 8.5 Sequencing summary

```
Z11g.a (dry)   ──► Z11g.b (parity)   ──► Z11g.c (catalog-discipline)
                                      \
                                       ──► (independent)
Z11g.d.0 (algorithm spec) ──► Z11g.d.1 (distillation) ──► Z11g.d.3 (rung-4 + parity)
```

Total engineering effort ~14 days end-to-end (no d.2 — the
Platonic-form reframe eliminates per-page labeling; d.0 is
~2d, d.1 ~4d, d.3 ~3d). All phases are engineering-paced.

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
| **L-Fixture-Schema** | `tests/probe-derivation/fixture-schema.laws.spec.ts` | Every `*.probe.yaml` under `product/` validates against §5.2's schema 1. Unknown top-level keys fail the build. Parser exceptions fail the build. The test lives on workshop's side of the seam (workshop reads product fixtures; the law guards workshop's contract against product). |
| **L-Fixture-World-Manifest-Aligned** | same | Every fixture's declared `expected.error-family` (when non-null) is a member of `manifest.verbs[verb].errorFamilies`. Manifest drift fails the build. |

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
| **L-CatalogDriven** | `tests/synthetic-app/catalog-driven.laws.spec.ts` | `SURFACE_ROLE_PROJECTION` is keyed by exactly the `SurfaceRole` values in `SURFACE_ROLE_VALUES`; missing roles and orphan keys both fail. TypeScript exhaustiveness provides the first gate; runtime symmetric-difference check provides the second. |
| **L-Projection-Total** | same | Every role in `SURFACE_ROLE_VALUES` has a declared strategy in the projection record. |
| **L-Projection-Terminal** | same | `'specialized'` entries correspond to explicit `if (spec.role === '<role>')` branches in `SurfaceRenderer.tsx` source (static grep); `'generic'` entries are absent from that grep (actually fall through to the catchall `<div role={spec.role}>`). |

### 9.4 Z11g.d laws

| Law | File | Asserts |
|---|---|---|
| **L-Canonical-Target-Derivable** | `workshop/substrate-study/tests/canonical-target.laws.spec.ts` | Given a `SampleShape` population for a world-shape at support ≥ floor, the distillation produces exactly one `CanonicalTarget`; the generator's output is a valid DOM tree per the project's DomTree schema. |
| **L-Amalgamation-Deterministic** | same | The distillation is a pure function of its `SampleShape` input set + the amalgamation policy. Running it twice on the same inputs yields byte-identical `CanonicalTarget` records (including `amalgamationDecisions`). |
| **L-Variant-Support-Floor** | same | Every `HardenedVariant.support` meets the amalgamation policy's noise floor. Variants below the floor are classified `noise-rejected` in `amalgamationDecisions`, never promoted. |
| **L-Canonical-Target-Version-Monotone** | same | For any world-shape, `CanonicalTarget.targetVersion` strictly increases across distillation runs; no two records at the same `(worldShape, targetVersion)` exist. |
| **L-Contributing-Samples-Audited** | same | Every `CanonicalTarget.contributingSamples` entry has a corresponding `AmalgamationDecision` entry; the two sets match exactly. |
| **L-LiveCommoncrawl-Parity** | `workshop/probe-derivation/tests/rung-parity.laws.spec.ts` (extended) | For every world-shape with a `CanonicalTarget`, rung-3 and rung-4 (central tendency) `invariantContent` fingerprints match exactly; rung-4 hardened-variant receipts also match rung-3's classification on invariant-band axes. Variant-band `elapsedMs` within §5.3 tolerance. |
| **L-Corpus-Coverage-Complete** | `workshop/compounding/tests/corpus-coverage.laws.spec.ts` | For every `PatternKind` in the trust-policy-approved pattern set, `scorecard.cohorts.rung4.coverage[patternKind]` exists with one of: `covered` (canonical target exists), `corpus-floor-miss` (evidence below floor), or `structurally-inaccessible` (auth-gated). No silent omissions. |
| **L-Rung4-Scorecard-Substrate-Version** | same | Every `Rung4CommoncrawlScorecard` carries the `SUBSTRATE_VERSION` of the canonical-target epoch; scorecards across `SUBSTRATE_VERSION` MAJOR bumps are not cross-compared. |

**Law count**: 21 total (5 in a, 4 in b, 3 in c, 9 in d),
enforced at either unit, architecture, or laws test level.
None are convention-only.

## 10. Risks and mitigations

Six risks, ranked by likelihood × impact. Each classified by
the deep-dive's tripartite: design-fragile (plan as-written
might not survive contact), execution-fragile (depends on
tooling / shapes outside the repo), measurement-fragile (could
pass laws while not actually helping).

### R1 — Amalgamation policy fails to converge on stable canonical targets (design-fragile)

**Likelihood**: Medium. The distillation's amalgamation policy
is operator-authored; picking thresholds that are too loose
(every variant becomes a hardened variant) or too tight (real
variants get rejected as noise) degrades rung-4's value.
**Impact**: High. An unstable canonical target means rung-4
parity results are noise; Verdict-12's multi-rung-grounded
classification loses its teeth.

**Mitigations**:
- Treat Z11g.d.0 as a **rigor-first deliverable**. The
  amalgamation policy's support thresholds, divergence-
  signature similarity bounds, and world-shape identity
  preservation rule land with explicit rationale.
- L-Amalgamation-Deterministic forces the pipeline to be a
  pure function; parameter sweeps across policy values become
  possible without side effects.
- L-Canonical-Target-Version-Monotone means policy tuning
  appends new targets, never rewrites old ones; scorecards
  can back-compare to detect destabilization empirically.

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

### R3 — Rung-4 parity failures reflect catalog gaps, not product drift (measurement-fragile)

**Likelihood**: Medium. Real OutSystems DOMs in aggregate
reveal world-shape variants the synthetic app's catalog
projection does not model. Some parity failures will flag
world-shapes whose hardened variants exceed the catalog's
rendering capacity, not product-classifier drift.
**Impact**: Medium. False positives erode rung-4's credibility
as the Platonic-form target.

**Mitigations**:
- §5.4's `corpus-coverage` metric explicitly distinguishes
  canonical-target-covered world-shapes from floor-missed and
  structurally-inaccessible ones. Parity failures route only
  over covered world-shapes; the other two categories are
  reported as coverage gaps, not refutations.
- Hardened-variant amalgamation follows from evidence, not
  operator judgment. If a variant consistently fails rung-3
  parity, the investigation points at either the synthetic
  app's catalog projection (add a variant rendering) or the
  product classifier (genuine fragility under a variant it
  should be invariant under). Both are actionable.
- Periodic operator review of recurring `ParityFailureRecord`s:
  catalog extensions flow through `workshop/policy/`; product
  classifier fixes flow through normal product channels.

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

### R5 — Canonical-target drift under accumulating evidence (measurement-fragile)

**Likelihood**: Medium. The in-perpetuity distillation means
the canonical target evolves as new harvests land. A target
that drifts faster than scorecards can baseline fragments the
comparison window.
**Impact**: Medium. If rung-4 scorecard baselines reset every
quarter because the target version bumps, cross-quarter
trajectory measurements lose continuity.

**Mitigations**:
- `SUBSTRATE_VERSION` MAJOR/MINOR discipline governs when
  cross-comparison resets vs. when scorecards continue
  additively. Central-tendency drift without hardened-variant
  changes is MINOR; material re-classification of existing
  hardened variants is MAJOR.
- L-Canonical-Target-Version-Monotone keeps all prior
  target-versions retained; a scorecard can explicitly
  specify which `targetVersion` it baselines against.
- An open question (§11 Q2) calibrates the material-drift
  threshold empirically after the first distillation runs.

## 11. Open questions

Nine questions the plan does not pre-decide. Each flagged
with the phase that blocks on its answer.

| # | Question | Blocks |
|---|---|---|
| Q1 | `elapsedMs` tolerance bound: is 100× right, or should it be tighter / wider? Calibrate after Z11g.b first runs. | Z11g.b calibration pass |
| Q2 | Canonical-target-version MAJOR-bump threshold: how much central-tendency drift between distillation runs warrants a baseline reset vs. a MINOR additive bump? | Z11g.d.1 distillation parameter tuning |
| Q3 | Amalgamation support threshold: what's the minimum sample count for a variant to be promoted from `noise-rejected` to `hardened-variant`? Calibrate once real harvests run. | Z11g.d.0 algorithm spec |
| Q4 | Does the `ParityFailureRecord` log append-only indefinitely or purge at `SUBSTRATE_VERSION` MAJOR bumps? | Z11g.b retention design |
| Q5 | Corpus-coverage state taxonomy: three states (`covered` / `corpus-floor-miss` / `structurally-inaccessible`) vs. finer-grained? Does a world-shape observed but not yet distilled warrant its own state? | Z11g.d.3 metric design |
| Q6 | World-shape identity stability: when Z11f's classifier re-labels a previously-categorized page (e.g., after a classifier improvement), do existing `CanonicalTarget`s for the affected world-shape rebuild, or do we version-bump and keep history? | Z11g.d.1 re-classification policy |
| Q7 | Hardened-variant count cap: is there a maximum number of variants per canonical target, and if so, how are overflow variants resolved? | Z11g.d.0 algorithm spec |
| Q8 | Distillation re-run trigger cadence: does distillation re-run on every harvest batch, on a fixed schedule, or on a material-evidence-delta threshold? | Z11g.d.1 operational design |
| Q9 | For rung-4 receipts on world-shapes outside canonical-target coverage, does the receipt carry `classification: 'ambiguous'` with a coverage-gap tag, or route to the coverage metric entirely (no receipt)? | Z11g.d.3 adapter semantics |

## 12. Graduation and success criteria

Z11g graduates when all four of the following hold:

### 12.1 Phase-level graduations

Each phase's own graduation (§§8.1–8.4) independently met.

### 12.2 Substrate-ladder law set green

All 21 laws (§9) green on a single commit. Particularly:
- L-Dry-BIR, L-DryReplay-Parity, L-ReplayLive-Parity green →
  the three existing rungs are mutually consistent.
- L-CatalogDriven green → the synthetic app is not parallel
  apparatus.
- L-Canonical-Target-Derivable + L-Amalgamation-Deterministic
  green → the Platonic-form distillation is a pure, stable
  projection of harvested evidence.
- L-LiveCommoncrawl-Parity green → the substrate-invariance
  theorem has distilled-real-DOM evidence.

### 12.3 Corpus-coverage honesty

`scorecard.cohorts.rung4.coverage` reports every
trust-policy-approved `PatternKind` as `covered` (a canonical
target exists with `supportCount ≥ amalgamation-policy-floor`)
or explicitly uncategorized (`corpus-floor-miss` or
`structurally-inaccessible`). No `undefined` states; no
silent gaps.

### 12.4 Verdict-12 candidate

With all four rungs live, Z11g enables a **verdict-12
classification** along two honesty axes:

1. **Substrate-fidelity axis**: the cross-rung parity results
   (rung-parity.json) demonstrate the substrate-invariance
   theorem holds across all three adjacent rung pairs.
2. **Real-world grounding axis**: the rung-4 corpus-coverage
   metric demonstrates which world-shapes the Platonic-form
   target covers and which remain floor-missed.

Verdict-12's classification rubric advances from multi-
cohort-synthetic (Verdict-11) to **multi-rung-grounded**.

### 12.5 What graduation does NOT require

- **Customer-production access.** Deferred to a future plan.
- **100% world-shape coverage.** Only the trust-policy-
  approved pattern set must have canonical targets; overall
  harvest coverage calibrates via Q2/Q3/Q8.
- **Zero parity failures across all world-shapes.** Failures
  on floor-missed world-shapes route to the coverage metric,
  not to graduation gating. Failures on covered world-shapes
  do block graduation.

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

**Plan summary**: 4 phases, 21 laws, 5 risks, 9 open
questions, ~12 engineering days end-to-end (Z11g.c simplified
from 4d to 2d by reframing to workshop-internal projection).
Rung-4 is a Platonic-form distillation of harvested OutSystems
DOM evidence, not per-page retention. Retires Z11b. Orthogonal
to Z11d. Enables Verdict-12's multi-rung-grounded classification.
