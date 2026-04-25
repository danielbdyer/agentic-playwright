# Z11g.d.0a — Reactive Snapshot Harness Design

> Status: design — companion to
> `docs/v2-substrate-ladder-plan.md §§8.4, 10.B` and
> `docs/v2-substrate-source-survey.md §§1.5, 8.9, 11`.
> Implementation deliverable of the Z11g.d.0a phase (new,
> inserted before Z11g.d.0 in the substrate-ladder sequence
> per operator guidance 2026-04-24).
>
> ### Why this document exists
>
> The substrate-ladder plan's rung-4 distillation (Platonic-
> form canonical target) must be grounded in **real Reactive
> OutSystems DOM**, not the Traditional Web evidence harvested
> at 2172c12. A purely curl-based harvest cannot obtain real
> Reactive DOM (§1.5 of the survey) — Reactive serves a JS-
> hydrated shell. This design specifies a harness that extends
> `product/`'s existing Playwright-bridge machinery to consume
> external URLs and capture the post-hydration DOM per the
> survey's §11 observation axes.
>
> Operator directions this design encodes:
> 1. Reactive Web only — no Traditional Web scope.
> 2. Sophisticated hydration-wait heuristics (multi-phase,
>    signature-based stability, validation re-snapshot).
> 3. Observation scope far beyond ARIA — full §11 axis set.

## Table of contents

- §0 — Design verdict
- §1 — Architectural positioning
- §2 — Sophisticated hydration-detection strategy
- §3 — Observation-axis capture: in-page evaluator
- §4 — Record shape + serialization
- §5 — Failure-mode taxonomy
- §6 — User-agent + ethics posture
- §7 — CLI surface
- §8 — Laws the harness carries
- §9 — Code skeleton (types + signatures)
- §10 — Open design questions

## 0. Design verdict

**Build a Reactive-scoped external-URL extension to the existing
`PlaywrightLiveProbeHarness`, sharing its Chromium lifecycle
machinery but with distinct pipeline stages for navigation,
multi-phase hydration detection, DOM-walk capture across the
§11 observation axes, and per-page `SnapshotRecord` emission.
Hydration-detection is a four-phase compound heuristic (network
+ DOM-mutation quiescence + readyState + signature stability)
with a fifth validation re-snapshot. Never-satisfied hydration
emits a verdict-carrying record rather than throwing, so the
distillation pipeline sees refusal signals instead of missing
data.**

## 1. Architectural positioning

### 1.1 Shared machinery (reused from existing code)

The harness reuses:

- `product/instruments/tooling/playwright-bridge.ts` —
  Chromium launch + page lifecycle + CDP access.
- `workshop/probe-derivation/playwright-live-harness.ts` —
  reference architecture for scoped browser lifecycle
  management (`Effect.acquireRelease`, shared page across
  captures).
- `workshop/substrate/version.ts` — `SUBSTRATE_VERSION` for
  stamping record provenance.
- `product/domain/kernel/hash.ts` — `fingerprintFor` for
  content-addressing records.

### 1.2 Distinct from PlaywrightLive

The existing `PlaywrightLiveProbeHarness` is scoped to
**internal** URLs (the `workshop/synthetic-app/` server). The
new harness is scoped to **external** URLs, which changes:

- No `acquireServer` step (no synthetic-app lifecycle); the
  external URL is already running.
- Navigation policy is external (`page.goto(url)`), not
  query-parameter-based.
- Security posture is different (see §6).
- No probe / fixture input — the capture is self-contained
  per URL.

### 1.3 File layout

```
workshop/substrate-study/
  domain/
    snapshot-record.ts              — SnapshotRecord + SnapshotNode types (§4)
    hydration-verdict.ts            — verdict enum + record type (§5)
  application/
    external-snapshot-harness.ts    — Effect-based capture orchestration (§2)
    hydration-detector.ts           — multi-phase hydration heuristic (§2)
    dom-walk-capture.ts             — in-page evaluator per §11 axes (§3)
  infrastructure/
    snapshot-store.ts               — append-only write to logs/snapshots/
scripts/
  harvest-external-snapshot.ts      — CLI entry (§7)
tests/substrate-study/
  hydration-detector.laws.spec.ts   — hydration heuristic laws
  snapshot-record.laws.spec.ts      — record-shape laws
  external-snapshot-harness.laws.spec.ts — end-to-end laws (test against synthetic-app)
```

### 1.4 Runtime composition

CLI entry constructs the harness via `Layer.succeed` composition,
mirroring `product/composition/local-services.ts` convention.
Chromium is acquired once per CLI invocation and released on
completion (`Effect.scoped`), matching the existing
`runPlaywrightLiveSpike` lifecycle pattern.

## 2. Sophisticated hydration-detection strategy

Reactive Web hydration is non-deterministic: the runtime mounts
components asynchronously, fires network requests on mount,
re-renders as data arrives, and may animate into a stable
state. A naive "wait N seconds" heuristic over-waits on fast
pages and under-waits on slow ones. A naive "wait for
networkidle" misses pages that maintain long-polling.

The harness uses a **four-phase compound heuristic** with a
fifth validation step.

### 2.1 Phase A — Navigation completion (bounded: 15s hard cap)

Trigger: `page.goto(url)` with `waitUntil: 'load'`.

Success when all of:
- `page.goto` resolved.
- `document.readyState === 'complete'`.
- Playwright's built-in `networkidle` event fired (500ms no
  in-flight requests).

Failure modes:
- Navigation error (connection refused, DNS, SSL) →
  verdict: `navigation-error`.
- 15s ceiling exceeded → verdict: `load-timeout`.

### 2.2 Phase B — DOM-mutation quiescence (sliding window)

Goal: detect when the JS runtime has stopped mutating the DOM
— a stronger signal than `networkidle` alone.

Mechanism: an injected `MutationObserver` records every
mutation. The harness polls the mutation count at 200ms
intervals.

Success criterion: **N consecutive polls with zero mutations**
(default N=3 = 600ms of quiescence).

Sliding-window details:
- Initial warm-up: wait 500ms after Phase A to let initial
  hydration begin.
- Poll interval: 200ms.
- Required quiet polls: 3 consecutive (600ms total).
- Max total wait: 20s ceiling after Phase A.

Failure modes:
- 20s ceiling exceeded without quiescence → verdict:
  `mutation-storm` (page is continuously mutating; e.g.,
  animation loop, polling ticker, or framework bug).
- MutationObserver injection fails (CSP block, iframe
  boundary) → verdict: `observer-unavailable`.

### 2.3 Phase C — Structural-signature stability

Goal: catch hydration that settles AFTER Phase B declares
quiescence — e.g., a delayed-mount component that lands in
one burst then goes quiet.

Mechanism: compute a **structural signature** at two
checkpoints separated by a delay. If signatures match, the
DOM is structurally stable.

Signature definition: over every observable DOM node, collect
the closed tuple:

```
(depth, tag, role, classPrefixFamily, dataAttrNamesSorted)
```

— not values, not ids, not text. Serialize deterministically;
sha256 the result.

Poll strategy:
- Take signature S1 immediately after Phase B declares
  success.
- Wait 400ms.
- Take signature S2.
- If S1 === S2 → Phase C passes.
- If S1 !== S2 → re-enter Phase B (hydration was not actually
  quiescent).

Max re-entries: 3 (bounded; cap on oscillation).

Failure modes:
- 3 Phase B re-entries without stability → verdict:
  `signature-unstable`.

### 2.4 Phase D — Framework-readiness signal (optional; best-effort)

Goal: if the runtime exposes an OS-specific "ready" signal,
use it for fast-path confirmation.

Mechanism: in-page evaluate attempts:
- `window.outsystems?.api?.ready` (hypothetical OS hook).
- `window.OutSystemsReactive?.state === 'ready'` (hypothetical).
- Presence of `[data-os-ready="true"]` body attribute.

If any present AND truthy, mark Phase D complete.

If none present, Phase D is skipped — no verdict impact. This
phase is additive only; it can short-circuit earlier phases
but not block on their absence.

Future improvement: once a real OS ready-signal is observed
in the first real sample, promote this phase to authoritative.

### 2.5 Phase E — Validation re-snapshot

Goal: a last-line sanity check that the captured DOM is
actually stable.

Mechanism: after Phases A–D pass, the harness performs the
full DOM-walk capture (§3), waits 500ms, and performs a
second walk. Both walks' structural-signature hashes must
match.

Failure modes:
- Signatures differ between re-snapshots → verdict:
  `capture-unstable` (the capture itself witnessed mutation
  during its own traversal).

On success, only the FIRST snapshot is retained (the second
is for validation only, not persisted).

### 2.6 Phase compositions + verdict precedence

Short-circuiting:
- Phase A must complete before B.
- Phase D can complete anytime after A; if it completes,
  Phases B/C become warm confirmations rather than strict
  gates (still run, but failure only downgrades from
  `stable` to `stable-but-framework-confirmed-only`).
- Phase E always runs; its failure overrides any prior
  success.

Verdict precedence (worst-wins):
1. `navigation-error` (Phase A connection-level failure)
2. `load-timeout` (Phase A ceiling)
3. `observer-unavailable` (Phase B injection failure)
4. `mutation-storm` (Phase B ceiling)
5. `signature-unstable` (Phase C oscillation)
6. `capture-unstable` (Phase E validation mismatch)
7. `stable` (all phases pass)
8. `stable-but-framework-confirmed-only` (Phase D confirms
   but B or C waivered)

Every verdict emits a `HydrationVerdict` record with
timing per phase + the final verdict tag.

### 2.7 Why this is "sophisticated"

- **Composed signals, not single-oracle.** Four independent
  heuristics must agree.
- **Bounded with explicit ceilings per phase.** No
  unbounded-wait failure mode.
- **Verdict-carrying, never throws.** The distillation pipeline
  can reason about why a snapshot failed to capture, not just
  its absence.
- **Validation re-snapshot.** Directly tests the capture
  against itself — catches mutation-during-traversal bugs
  that every other phase might miss.
- **Framework hook is additive.** Never a single-point
  dependency; upgrades incrementally as real OS-ready signals
  are observed.

## 3. Observation-axis capture: in-page evaluator

### 3.1 Execution model

The capture runs **in-page** via `page.evaluate(fn)` — the JS
executes in the browser context, has direct access to the
DOM, and returns serializable data to the Node-side harness.
This avoids round-tripping every node query through CDP
(much faster) and gives access to computed-style + layout
APIs that aren't exposed outside the browser.

The in-page function walks the DOM breadth-first from
`document.body`, building one `SnapshotNode` per element
(text nodes recorded as counts + length buckets, not as
content). The return value is a flat array of SnapshotNodes
plus a page-level envelope.

### 3.2 Walk scope

- Include: every `Element` descendant of `document.body`.
- Exclude: `<script>`, `<style>`, `<template>`, `<noscript>`
  tags (non-visual; low distillation value).
- Shadow DOM: if `element.shadowRoot` exists, walk it
  recursively, marking the descendants with a
  `shadowHostPath` reference.
- iframes: out of scope for v1 (cross-origin CSP issues); a
  node is recorded with `framework.iframeSrc` but its
  contents are not walked.

### 3.3 Per-node capture

For each `Element`, capture the §11 axis set. The evaluator
function is a pure projection over the element's properties;
no side-effects. See §9 code skeleton for the exact shape.

Key capture details beyond the survey's §11:

- **class-prefix family** is computed by matching the first
  token against a lookup map: `['osui-', 'OS', 'ThemeGrid_',
  'Menu_', 'EPATaskbox_', 'Feedback_', 'fa-', 'RichWidgets_']`
  → family tag. Unknown prefix → `'app-specific'`.
- **bounding rect** uses `getBoundingClientRect()`, bucketed:
  x → `Math.floor(x/10)*10`, y same, width → `Math.floor(w/20)*20`,
  height same. Bucket size calibratable.
- **computed visibility** uses `window.getComputedStyle(el)`
  + `el.offsetParent` + `el.getClientRects()` to determine
  the SurfaceVisibility enum value per `workshop/substrate/
  surface-spec.ts`.
- **hasClickListener** — since `addEventListener`-attached
  listeners aren't DOM-queryable, we use a heuristic:
  presence of `onclick` attribute, OR element is `<a>` /
  `<button>` / `role="button"` / has `cursor:pointer` in
  computed style, OR has `tabindex >= 0`. Result: a boolean
  `interactive` flag that combines tag + role + cursor +
  focusability. This is approximate; future upgrade could
  use CDP's `DOMDebugger.getEventListeners`.
- **accessible name** — Playwright's `accessibility.snapshot`
  API provides the computed name for a subset of nodes;
  merge with the DOM walk by path-matching.

### 3.4 Text capture discipline (PII-safe)

Per §11.5, capture text content only for elements classified
as "label-like":
- Headings (`<h1>..<h6>`).
- `<label>` elements.
- `<button>` elements.
- Elements with `role="button"` or `role="heading"`.
- Elements with `aria-label` or `aria-labelledby` attributes
  (the referenced text).

For all other elements, capture only:
- `textNodeCount` — number of direct text children.
- `textLengthBucket` — categorical length bucket (0 /
  1-10 / 11-50 / 51+ chars) without the content.

This is the harness's single most sensitive design decision
— loosening it would leak user-visible content into the
snapshot log.

### 3.5 Data-attribute value discipline

Data attribute values have mixed sensitivity. Approach:
- Always capture the attribute NAME.
- Capture the VALUE only if it's low-entropy — specifically
  if it's in a closed-token set observed across the corpus
  (e.g., `data-showskipcontent="False"`, `data-active-item="-1"`).
- High-cardinality values (IDs, tokens, timestamps) recorded
  as `<high-cardinality>` placeholder, preserving the name.

The closed-token set is empty at v1 (no corpus yet);
Z11g.d.1 observations populate it over time. Until then,
all data-attr values are recorded as `<unobserved-cardinality>`.

## 4. Record shape + serialization

### 4.1 SnapshotRecord (top level)

Every harness invocation produces one `SnapshotRecord`:

```ts
export interface SnapshotRecord extends WorkflowMetadata<'preparation'> {
  readonly kind: 'snapshot-record';
  readonly scope: 'run';
  readonly payload: {
    readonly url: string;
    readonly fetchedAt: string;           // ISO timestamp
    readonly substrateVersion: string;
    readonly userAgent: string;
    readonly viewport: { width: number; height: number };
    readonly hydration: HydrationVerdict;
    readonly captureLatencyMs: number;
    readonly nodeCount: number;
    readonly structuralSignature: Fingerprint<'snapshot-signature'>;
    readonly nodes: readonly SnapshotNode[];
    readonly framework: {
      readonly reactDetected: boolean;
      readonly angularDetected: boolean;
      readonly vueDetected: boolean;
      readonly webComponentCount: number;
      readonly shadowRootCount: number;
      readonly iframeCount: number;
    };
    readonly variantClassifier: VariantClassifierVerdict;
  };
}
```

`variantClassifier` folds the captured signals into the OS
variant verdict: `reactive | traditional | mobile | not-os |
ambiguous`. Rule set per §4.4.

### 4.2 SnapshotNode (per-element)

See survey §11.9 for the indicative shape. Final decisions
below.

```ts
export interface SnapshotNode {
  readonly path: string;                   // CSS-selector path root→node
  readonly depth: number;
  readonly tag: string;
  readonly id: string | null;
  readonly classTokens: readonly string[];
  readonly classPrefixFamily: ClassPrefixFamily | null;
  readonly dataAttrNames: readonly string[];
  readonly dataAttrValues: Readonly<Record<string, DataAttrValue>>;
  readonly ariaRole: string | null;
  readonly ariaState: Readonly<Record<string, string>>;
  readonly ariaNaming: {
    readonly label: string | null;
    readonly accessibleName: string | null;
  };
  readonly interaction: {
    readonly tabindex: number | null;
    readonly focusable: boolean;
    readonly interactive: boolean;         // composite from §3.3
    readonly formRef: FormRef | null;
    readonly inputType: string | null;
    readonly disabled: boolean;
    readonly readonly: boolean;
    readonly required: boolean;
    readonly placeholder: string | null;
  };
  readonly visibility: SurfaceVisibility;
  readonly boundingRect: BoundingBucket;
  readonly clipped: boolean;
  readonly framework: {
    readonly hasShadowRoot: boolean;
    readonly customElementName: string | null;
    readonly iframeSrc: string | null;
  };
  readonly structural: {
    readonly parentTag: string | null;
    readonly parentRole: string | null;
    readonly parentClassFamily: ClassPrefixFamily | null;
    readonly siblingIndex: number;
    readonly siblingCount: number;
  };
  readonly labelText: string | null;       // only for label-classified (§3.4)
  readonly textLengthBucket: TextLengthBucket | null;
  readonly textNodeCount: number;
}

export type ClassPrefixFamily =
  | 'osui'          // Reactive OS marker (kebab-case)
  | 'os'            // PascalCase OS utility (likely Traditional)
  | 'theme-grid'
  | 'menu'
  | 'epa-taskbox'
  | 'feedback'
  | 'fa'            // font-awesome (not OS but common)
  | 'rich-widgets'
  | 'app-specific';

export type DataAttrValue =
  | { readonly kind: 'observed-token'; readonly value: string }
  | { readonly kind: 'unobserved-cardinality' }
  | { readonly kind: 'high-cardinality'; readonly fingerprintOnly: true };

export type SurfaceVisibility =
  | 'visible' | 'display-none' | 'visibility-hidden'
  | 'off-screen' | 'zero-size';

export type TextLengthBucket = '0' | '1-10' | '11-50' | '51+';

export interface BoundingBucket {
  readonly xBin: number;
  readonly yBin: number;
  readonly widthBin: number;
  readonly heightBin: number;
}

export interface FormRef {
  readonly formId: string | null;
  readonly formName: string | null;
  readonly inputName: string | null;
}
```

### 4.3 Structural signature (fingerprint)

Per §2.3, the structural signature is computed by:
1. Sorting all SnapshotNodes by `path`.
2. Projecting each to the 5-tuple `(depth, tag, ariaRole,
   classPrefixFamily, dataAttrNames.sort())`.
3. JSON-serializing the array deterministically.
4. sha256 → `Fingerprint<'snapshot-signature'>`.

New tag `'snapshot-signature'` registers in
`product/domain/kernel/hash.ts`.

### 4.4 Variant-classifier verdict

`VariantClassifierVerdict` is the harness's running decision
on "what OS variant is this?" Informs distillation routing.

```ts
export type VariantClassifierVerdict =
  | { readonly kind: 'reactive'; readonly osuiClassCount: number; readonly evidence: readonly string[] }
  | { readonly kind: 'traditional'; readonly osvstatePresent: boolean; readonly evidence: readonly string[] }
  | { readonly kind: 'mobile'; readonly evidence: readonly string[] }
  | { readonly kind: 'not-os'; readonly evidence: readonly string[] }
  | { readonly kind: 'ambiguous'; readonly conflictingEvidence: readonly string[] };
```

Rules:
- **Reactive**: ≥3 nodes with `classPrefixFamily === 'osui'`
  AND zero `__OSVSTATE` nodes AND React/Angular/Vue marker
  detected.
- **Traditional**: `__OSVSTATE` hidden input present AND
  ≥1 `OS*` PascalCase class.
- **Mobile**: `cordova-app`, `is-phonegap`, or OS Mobile
  framework marker present.
- **Not-OS**: none of the OS signatures + none of the
  frameworks.
- **Ambiguous**: conflicting signals (e.g., `__OSVSTATE`
  AND `osui-*`).

The verdict is attached to the record but does not cause
the harness to fail — snapshots are captured regardless of
variant, and distillation filters.

### 4.5 Persistence

Snapshots land under:

```
workshop/substrate-study/logs/snapshots/<quarter>/<sample-id>.json
```

Sample ID: sha256 of `(url, fetchedAt-to-hour-bucket,
substrateVersion)`. Deterministic within a bucket so repeated
runs dedup.

No raw HTML persisted — the structured SnapshotRecord is the
storage primitive. This respects the Z11f-prime self-imposed
envelope per `docs/v2-substrate-ladder-plan.md §6.1`.

## 5. Failure-mode taxonomy

Every harness invocation emits a result — either a
`SnapshotRecord` with a `hydration.verdict === 'stable'`, or a
record carrying a failure verdict + whatever partial capture
was achieved. The harness NEVER throws; failures are data, not
exceptions.

### 5.1 Verdict taxonomy

| Verdict | Phase | Partial capture? | Distillation treatment |
|---|---|---|---|
| `stable` | all pass | full | include in distillation |
| `stable-but-framework-confirmed-only` | A passes; D confirms; B/C waivered | full | include but flag as lower-confidence |
| `navigation-error` | A | none | exclude; surface to operator for URL fix |
| `load-timeout` | A | none | exclude; may indicate slow origin or harness ceiling too low |
| `observer-unavailable` | B | navigation only | exclude from structural distillation; retain URL-level metadata |
| `mutation-storm` | B | partial DOM walk at ceiling | exclude from central-tendency; may still be informative as edge-case source |
| `signature-unstable` | C | multiple captures attempted, none stable | exclude |
| `capture-unstable` | E | 2 captures with differing signatures | exclude, flag for retry |

### 5.2 Operator-visible error messages

Each verdict carries a `diagnostic` string the operator can
read. Example for `mutation-storm`:

> Mutation storm: DOM mutated 247 times in 20s without 3
> consecutive quiet polls. Likely causes: animation loop,
> polling endpoint, real-time component. Retry with longer
> mutationCeilingMs if the page is expected to stabilize
> eventually; else treat as unavailable for distillation.

### 5.3 Retry policy

No automatic retries in v1 — retry is an operator decision.
The CLI (§7) accepts a `--retry <N>` flag that re-invokes the
full pipeline; partial captures from prior attempts are
discarded.

## 6. User-agent + ethics posture

### 6.1 User-agent policy

Per `docs/v2-substrate-ladder-plan.md §6.2`, the harvest must
not impersonate a real user. The harness sends an explicit,
disclosed User-Agent:

```
Mozilla/5.0 (compatible; tesseract-substrate-study/0.1; +https://github.com/danielbdyer/agentic-playwright)
```

The `compatible;` form follows the robots-exclusion-protocol
convention. The URL component lets an observant site operator
identify the research context.

### 6.2 Rate limiting

v1 is operator-driven (one URL per CLI invocation). The harness
does NOT crawl; it does NOT parallelize; it does NOT follow
links. Batching multiple URLs is a Z11g.d.1 concern.

### 6.3 robots.txt

For v1: the harness optionally fetches robots.txt before the
target URL. If the User-Agent is disallowed for the path, the
harness emits verdict `robots-disallowed` and does NOT fetch
the page. Operator can override with `--ignore-robots` flag
(strongly discouraged; retained for research-mode overrides).

### 6.4 Sensitive-content gate at capture-time

Per §3.4 / §3.5, the harness already strips user-visible text
from non-label elements. A secondary pass at capture
completion scans retained label text + data-attr values for
PII patterns (email, phone, SSN, credit-card). On match, the
snapshot emits verdict `sensitive-content-detected` and the
matched fields are redacted to `<redacted>` before write.

## 7. CLI surface

### 7.1 Invocation

```bash
npx tsx scripts/harvest-external-snapshot.ts \
  --url <required-url> \
  [--viewport 1280x800] \
  [--timeout-navigation 15000] \
  [--timeout-hydration 20000] \
  [--ignore-robots] \
  [--out <path>] \
  [--retry 0]
```

### 7.2 Output

Default: `workshop/substrate-study/logs/snapshots/<quarter>/<sample-id>.json`.
With `--out <path>`: writes to the explicit path.

Stdout: a single-line verdict summary for operator feedback:

```
✓ stable | url=https://.../Home  nodes=312  sig=sha256:abc123  variant=reactive  1843ms
✗ mutation-storm | url=https://.../ListLive  nodes=~127(partial)  20321ms
```

### 7.3 Exit codes

- `0` — snapshot persisted, verdict=stable.
- `10` — snapshot persisted, verdict=stable-but-framework-confirmed-only.
- `20` — snapshot partial or unsuccessful, record still persisted.
- `30` — hard failure (misconfiguration, harness crash); no record.

## 8. Laws the harness carries

Eight laws, covering the key contracts:

1. **L-Harness-Verdict-Total**: every invocation emits exactly
   one verdict (never throws).
2. **L-Structural-Signature-Deterministic**: given identical
   DOM state, signature computation yields identical hash.
3. **L-Re-Snapshot-Matches-On-Stable**: Phase E re-snapshot on
   stable DOM produces identical structural signature.
4. **L-Mutation-Storm-Bounded**: Phase B ceiling (default 20s)
   is always respected; no unbounded-wait code paths.
5. **L-Text-PII-Redaction**: retained-text PII scan is total
   (every sensitive pattern triggers redaction before persist).
6. **L-Variant-Classifier-Exhaustive**: every SnapshotRecord
   has a `variantClassifier.kind` in the closed union (never
   `undefined` or `null`).
7. **L-No-Raw-HTML-Persisted**: the persisted record contains
   no `innerHTML` / `outerHTML` strings (structural projection
   only).
8. **L-Record-Append-Only**: the snapshot store refuses to
   overwrite an existing `<sample-id>.json`; repeated runs
   within the hour bucket return the existing record.

### 8.1 Test strategy

- Unit tests against a synthetic HTML fixture served from
  `workshop/synthetic-app/` (not live OS) — gets us determinism
  and offline test execution.
- Integration test against `workshop/synthetic-app/` in
  playwright-live mode — end-to-end pipeline exercised.
- Manual operator validation against a real Reactive OS URL
  once confirmed.

All laws runnable in the vitest unit suite via the synthetic-app
fixture. No laws require external network access.

## 9. Code skeleton

File-by-file signature sketches. Types + function shapes, no
implementation. This is what Z11g.d.0a ships as code.

### 9.1 `workshop/substrate-study/domain/snapshot-record.ts`

```ts
import type { WorkflowMetadata } from '../../../product/domain/governance/workflow-types';
import type { Fingerprint } from '../../../product/domain/kernel/hash';

export type ClassPrefixFamily =
  | 'osui' | 'os' | 'theme-grid' | 'menu' | 'epa-taskbox'
  | 'feedback' | 'fa' | 'rich-widgets' | 'app-specific';

export type SurfaceVisibility =
  | 'visible' | 'display-none' | 'visibility-hidden'
  | 'off-screen' | 'zero-size';

export type TextLengthBucket = '0' | '1-10' | '11-50' | '51+';

export type DataAttrValue =
  | { readonly kind: 'observed-token'; readonly value: string }
  | { readonly kind: 'unobserved-cardinality' }
  | { readonly kind: 'high-cardinality'; readonly fingerprintOnly: true };

export interface BoundingBucket {
  readonly xBin: number; readonly yBin: number;
  readonly widthBin: number; readonly heightBin: number;
}

export interface FormRef {
  readonly formId: string | null;
  readonly formName: string | null;
  readonly inputName: string | null;
}

export interface SnapshotNode {
  readonly path: string;
  readonly depth: number;
  readonly tag: string;
  readonly id: string | null;
  readonly classTokens: readonly string[];
  readonly classPrefixFamily: ClassPrefixFamily | null;
  readonly dataAttrNames: readonly string[];
  readonly dataAttrValues: Readonly<Record<string, DataAttrValue>>;
  readonly ariaRole: string | null;
  readonly ariaState: Readonly<Record<string, string>>;
  readonly ariaNaming: {
    readonly label: string | null;
    readonly accessibleName: string | null;
  };
  readonly interaction: {
    readonly tabindex: number | null;
    readonly focusable: boolean;
    readonly interactive: boolean;
    readonly formRef: FormRef | null;
    readonly inputType: string | null;
    readonly disabled: boolean;
    readonly readonly: boolean;
    readonly required: boolean;
    readonly placeholder: string | null;
  };
  readonly visibility: SurfaceVisibility;
  readonly boundingRect: BoundingBucket;
  readonly clipped: boolean;
  readonly framework: {
    readonly hasShadowRoot: boolean;
    readonly customElementName: string | null;
    readonly iframeSrc: string | null;
  };
  readonly structural: {
    readonly parentTag: string | null;
    readonly parentRole: string | null;
    readonly parentClassFamily: ClassPrefixFamily | null;
    readonly siblingIndex: number;
    readonly siblingCount: number;
  };
  readonly labelText: string | null;
  readonly textLengthBucket: TextLengthBucket | null;
  readonly textNodeCount: number;
}

export type VariantClassifierVerdict =
  | { readonly kind: 'reactive';
      readonly osuiClassCount: number;
      readonly evidence: readonly string[] }
  | { readonly kind: 'traditional';
      readonly osvstatePresent: boolean;
      readonly evidence: readonly string[] }
  | { readonly kind: 'mobile'; readonly evidence: readonly string[] }
  | { readonly kind: 'not-os'; readonly evidence: readonly string[] }
  | { readonly kind: 'ambiguous';
      readonly conflictingEvidence: readonly string[] };

export interface SnapshotRecord extends WorkflowMetadata<'preparation'> {
  readonly kind: 'snapshot-record';
  readonly scope: 'run';
  readonly payload: {
    readonly url: string;
    readonly fetchedAt: string;
    readonly substrateVersion: string;
    readonly userAgent: string;
    readonly viewport: { width: number; height: number };
    readonly hydration: HydrationVerdict;
    readonly captureLatencyMs: number;
    readonly nodeCount: number;
    readonly structuralSignature: Fingerprint<'snapshot-signature'>;
    readonly nodes: readonly SnapshotNode[];
    readonly framework: {
      readonly reactDetected: boolean;
      readonly angularDetected: boolean;
      readonly vueDetected: boolean;
      readonly webComponentCount: number;
      readonly shadowRootCount: number;
      readonly iframeCount: number;
    };
    readonly variantClassifier: VariantClassifierVerdict;
  };
}

// Pure constructor — builds the envelope + computes
// artifact/content fingerprints. No IO.
export function snapshotRecord(input: {
  readonly url: string;
  readonly fetchedAt: string;
  readonly userAgent: string;
  readonly viewport: { width: number; height: number };
  readonly hydration: HydrationVerdict;
  readonly captureLatencyMs: number;
  readonly nodes: readonly SnapshotNode[];
  readonly framework: SnapshotRecord['payload']['framework'];
  readonly variantClassifier: VariantClassifierVerdict;
}): SnapshotRecord;
```

### 9.2 `workshop/substrate-study/domain/hydration-verdict.ts`

```ts
export type HydrationVerdictKind =
  | 'stable'
  | 'stable-but-framework-confirmed-only'
  | 'navigation-error'
  | 'load-timeout'
  | 'observer-unavailable'
  | 'mutation-storm'
  | 'signature-unstable'
  | 'capture-unstable'
  | 'robots-disallowed'
  | 'sensitive-content-detected';

export interface HydrationVerdict {
  readonly kind: HydrationVerdictKind;
  readonly diagnostic: string;
  readonly phaseTimings: {
    readonly phaseAms: number;
    readonly phaseBms: number;
    readonly phaseCms: number;
    readonly phaseDms: number;
    readonly phaseEms: number;
  };
  readonly phaseBRetries: number;
  readonly mutationCount: number;
}
```

### 9.3 `workshop/substrate-study/application/hydration-detector.ts`

```ts
import { Effect } from 'effect';
import type { Page } from 'playwright';
import type { HydrationVerdict } from '../domain/hydration-verdict';

export interface HydrationDetectorOptions {
  readonly navigationTimeoutMs?: number;  // default 15_000
  readonly hydrationTimeoutMs?: number;   // default 20_000
  readonly mutationQuietPolls?: number;   // default 3
  readonly mutationPollIntervalMs?: number; // default 200
  readonly signatureSettleDelayMs?: number; // default 400
  readonly phaseBRetryCap?: number;       // default 3
  readonly now?: () => Date;
}

export function detectHydration(
  page: Page,
  url: string,
  options: HydrationDetectorOptions,
): Effect.Effect<HydrationVerdict, never, never>;
```

### 9.4 `workshop/substrate-study/application/dom-walk-capture.ts`

```ts
import { Effect } from 'effect';
import type { Page } from 'playwright';
import type { SnapshotNode } from '../domain/snapshot-record';

export interface DomWalkOutput {
  readonly nodes: readonly SnapshotNode[];
  readonly frameworkCounts: {
    readonly reactDetected: boolean;
    readonly angularDetected: boolean;
    readonly vueDetected: boolean;
    readonly webComponentCount: number;
    readonly shadowRootCount: number;
    readonly iframeCount: number;
  };
}

export function walkDom(page: Page): Effect.Effect<DomWalkOutput, Error, never>;
```

### 9.5 `workshop/substrate-study/application/external-snapshot-harness.ts`

```ts
import { Effect, Layer, Context } from 'effect';
import type { PlaywrightBridge } from '../../../product/instruments/tooling/playwright-bridge';
import type { SnapshotRecord } from '../domain/snapshot-record';
import type { HydrationDetectorOptions } from './hydration-detector';

export interface ExternalSnapshotRequest {
  readonly url: string;
  readonly viewport?: { width: number; height: number };
  readonly userAgent?: string;
  readonly hydration?: HydrationDetectorOptions;
  readonly ignoreRobots?: boolean;
}

export interface ExternalSnapshotHarnessService {
  readonly capture: (
    req: ExternalSnapshotRequest,
  ) => Effect.Effect<SnapshotRecord, never, never>;  // never fails; verdicts carry errors
}

export class ExternalSnapshotHarness extends Context.Tag(
  'workshop/substrate-study/ExternalSnapshotHarness',
)<ExternalSnapshotHarness, ExternalSnapshotHarnessService>() {}

export function createExternalSnapshotHarness(
  bridge: PlaywrightBridge,
): ExternalSnapshotHarnessService;
```

### 9.6 `workshop/substrate-study/infrastructure/snapshot-store.ts`

```ts
import { Effect } from 'effect';
import type { SnapshotRecord } from '../domain/snapshot-record';

export interface SnapshotStoreService {
  readonly write: (r: SnapshotRecord) => Effect.Effect<string, Error>;
  readonly read: (sampleId: string) => Effect.Effect<SnapshotRecord | null, Error>;
}

export function createLocalSnapshotStore(options: {
  readonly rootDir: string;  // default workshop/substrate-study/logs/snapshots
  readonly now?: () => Date;
}): SnapshotStoreService;

export function computeSampleId(input: {
  readonly url: string;
  readonly fetchedAt: string;
  readonly substrateVersion: string;
}): string;
```

### 9.7 `scripts/harvest-external-snapshot.ts`

```ts
#!/usr/bin/env tsx
// CLI glue. Effect.runPromise lives here (one of the two
// allowed runPromise sites per coding-notes discipline).

import { Effect, Layer } from 'effect';
import { createExternalSnapshotHarness } from '.../external-snapshot-harness';
import { createLocalSnapshotStore } from '.../snapshot-store';
import { launchHeadedHarness } from '.../playwright-bridge';

async function main(argv: readonly string[]): Promise<void> {
  // parse args
  // launch browser (Effect.scoped)
  // compose harness
  // call capture()
  // write via store
  // print verdict summary
  // exit with code per §7.3
}

main(process.argv.slice(2)).catch(/* hard failure → exit 30 */);
```

## 10. Open design questions

Five items the operator should resolve before implementation
begins. Each item blocks a specific piece; sequenced by
blocking-priority.

### Q1 — Confirmed Reactive URL for first operator validation

**Blocks**: manual-validation checkpoint after implementation.
**Status**: pending operator confirmation. My sandbox is
IP-flagged on outsystems.com domains (all 503/404 from curl
and WebFetch), so the URL confirmation cannot be done from
this session. Operator confirmation from a browser is
required before the harness is run against real OS content.
Candidate: `https://outsystemsui.outsystems.com/OutSystemsUIWebsite/`
(redirected 302 earlier; destination unknown).

### Q2 — Should the harness emit multiple snapshots per URL?

**Blocks**: Phase E validation design.
**Tradeoff**: always capturing twice (once at E validation,
once as the persisted record) doubles in-page evaluator
runtime. Alternative: only capture once on confirmed stability,
accepting that mutation-during-traversal is a detected-by-
next-run failure mode rather than a same-run failure mode.
**Current design**: two captures, second discarded — favor
correctness.

### Q3 — Shadow DOM recursion depth cap?

**Blocks**: DOM-walk implementation.
**Tradeoff**: some OS Mobile widgets use deeply-nested shadow
DOM; walking all levels can explode snapshot size. Cap at
depth-5? unlimited?
**Current design**: unlimited (no cap). Calibrate per
Z11g.d.1 observations.

### Q4 — High-cardinality data-attr fingerprinting strategy

**Blocks**: SnapshotNode data-attr-value shape.
**Tradeoff**: hashing full high-cardinality values adds
entropy but loses semantic analyzability; keeping a prefix
(first 8 chars) may leak. Pure omission loses information.
**Current design**: pure omission with `fingerprintOnly: true`
marker — Z11g.d.1 can revisit if distillation needs the
value-level signal.

### Q5 — `accessibility.snapshot` vs. DOM walk interleaving

**Blocks**: capture implementation.
**Tradeoff**: Playwright's `accessibility.snapshot` API only
surfaces a subset of nodes (those in the a11y tree) and uses
different node identity than the DOM walk. Reconciling them
per-node requires careful path-matching.
**Current design**: do the DOM walk first; query accessibility
API for each interactive-or-labeled element by
`element.evaluate(el => el.getAttribute('aria-label'))` plus
Playwright's own locator-based accessible name resolution.
Accept that some a11y-tree-only signals won't reach
SnapshotNodes.

---

**Design summary**: four-phase hydration heuristic + validation
re-snapshot; in-page DOM evaluator capturing 7 observation-axis
groups per §11; variant-classifier distinguishing Reactive /
Traditional / Mobile / Not-OS / Ambiguous; closed-verdict
failure taxonomy; explicit UA + robots + PII-redaction
discipline; 8 laws; ~5-6 files + 1 CLI. Implementation scope:
~2-3 days of engineering once URL is confirmed.

**Implementation order** (sequencing after URL confirmation):
1. `snapshot-record.ts` + `hydration-verdict.ts` domain types
   (pure; testable against hand-authored records).
2. `snapshot-store.ts` (pure except for fs writes; sample-id
   computation testable).
3. `dom-walk-capture.ts` — tested against synthetic-app
   (deterministic).
4. `hydration-detector.ts` — tested against synthetic-app
   with intentionally-slow and intentionally-fast fixtures.
5. `external-snapshot-harness.ts` — composition layer.
6. `scripts/harvest-external-snapshot.ts` — CLI + manual
   operator validation.
7. Laws tests consolidated in `tests/substrate-study/`.

Unit test suite should pass end-to-end against the existing
synthetic-app BEFORE any external URL is hit. This gives the
harness deterministic tests while the Reactive URL
confirmation proceeds in parallel.
