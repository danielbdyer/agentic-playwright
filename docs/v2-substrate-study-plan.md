# Substrate-Study Plan (Step 11 Z11f)

> Status: planning — Step 11 Z11f. Architectural design doc; no
> code has landed yet. Companion to
> `docs/v2-compounding-engine-plan.md` and
> `docs/v2-probe-ir-spike.md`. Depends on Z11a.4a–c (the pattern
> ladder) and completes independently; sequences after verdict-11
> closes.

## 0. The verdict in one sentence

**Harvest public DOM shapes from deployed OutSystems apps, distill
their structural signatures into aggregated frequency tables, and
use the tables to inform (not author) the `outsystems-generic`
matchers in the pattern registry — without ever scraping a
customer site live.**

## 1. Purpose and Scope

### 1.1 What this slice delivers

An offline corpus-study pipeline under `workshop/substrate-study/`
that turns publicly-accessible, already-indexed HTML from
OutSystems-built sites into three durable artifacts:

1. **`SampleShape` records** — per-page structural sketches with
   all PII, text, and scripts stripped. Retained attributes are a
   closed whitelist (role, aria-*, class-prefix-stems, data-*
   test-id stems, landmark ancestry). One JSON envelope per
   successfully harvested page.

2. **`Distribution` records** — aggregated frequency tables per
   `PatternKind` (e.g., `submit-button`, `nav-link`,
   `validation-error`). Each row is a normalized attribute
   signature plus the count of samples that exhibit it.
   Deterministic; same input corpus → same output fingerprint.

3. **`MatcherProposal` records** — candidate matchers the
   distillation surfaces when a signature's support ratio clears
   a confidence floor and isn't already covered by an existing
   matcher. Proposals flow through the existing trust-policy gate
   — same discipline catalog entries already use.

### 1.2 What this slice does NOT deliver

- **Live scraping**. Zero crawler pointing at customer infra.
  Sources are exclusively (a) Common Crawl's WARC archives,
  (b) Wayback Machine snapshots, (c) OutSystems's own publicly
  linked showcase pages. All three are already-indexed /
  already-archived.
- **Runtime matcher generation**. The distillation surfaces
  *candidate signatures*; human-authored TypeScript matchers are
  still the only runtime primitive. The proposal pipeline produces
  proposals; merging them is a gated PR decision, not an automatic
  code emit.
- **Retained DOM reproductions**. We do not persist enough
  information to reconstruct a sample's visible content. Shapes
  are structurally similar to `SurfaceSpec` — not HTML snapshots.
- **Privacy-sensitive data capture**. PII scrubbing is a type-
  level invariant: `SampleShape` has exactly one constructor
  (`stripToShape`) that enforces content stripping. The raw HTML
  is consumed and discarded in the same function; it never lands
  on disk as-is.
- **Customer attribution**. Samples are keyed by content-address
  hashes, not by hostname-associated identifiers. The corpus
  manifest names source URLs for provenance, but distillation
  outputs are aggregate and decoupled from per-customer identity.
- **A daemon / scheduled crawler**. One-shot runs, refreshed at
  most quarterly. Every run is explicit and operator-triggered.

### 1.3 Guiding principles (standing rules)

These override convenience considerations.

- **Zero live customer-site scraping.** If a source isn't Common
  Crawl, Wayback, or a published OutSystems showcase, it's out.
  Violations are an anti-goal that invalidates the slice.
- **Shape-only retention.** Every `SampleShape` is produced by
  `stripToShape()` and only by `stripToShape()`. Text, scripts,
  images, and non-whitelisted attributes are destroyed in the
  same function that returns a Shape. No intermediate store of
  raw HTML.
- **Deterministic aggregation.** Same samples in → same
  distribution fingerprint out. Aggregators use sorted canonical
  forms; hashes are content-addressed; re-running doesn't drift.
- **The workshop proposes; humans and the trust-policy gate
  accept.** Distillation produces proposal artifacts. Merging
  matcher code into `product/` is an explicit PR review with
  trust-policy verification — not a job the workshop performs.
- **No `product/` imports from `workshop/substrate-study/`.** The
  compounding-engine seam discipline applies identically: seam
  laws fail the build on violation.
- **Versioned distillations.** Every distillation carries a
  quarter-stamp + input-corpus fingerprint. Matcher proposals
  reference the distillation they were derived from.
- **Every artifact is append-only.** Follows the log-sets
  discipline already in the workshop's `logs/` tree.
- **Provenance is minted at the event, not reconstructed later.**
  Sample source + retrieval timestamp + fingerprint verdict all
  stamp at ingest.

### 1.4 Success in one line

**By end-of-Z11f: `tesseract substrate-study report` prints a
quarter-scoped corpus manifest, per-kind signature distributions,
and a ranked matcher-proposal list; no customer site was scraped
live; the trust-policy gate mediates every proposed matcher's
migration into `product/`; the pattern registry's OutSystems-
generic layer is informed by real distributional evidence, not
prior guesses.**

## 2. Ubiquitous Language (DDD glossary)

Vocabulary used consistently across types, docs, and CLI. Stable
terms; renaming them is a schema break.

- **Harvest**: the act of retrieving a public page from a
  permitted source and producing a `SampleShape` envelope. A
  harvest run targets one `HarvestSource`; it produces zero or
  more samples.

- **`HarvestSource`**: one of the enumerated source kinds —
  `common-crawl`, `wayback`, `showcase`, or `fixture` (the
  last is a test-only adapter). A `HarvestSource` encapsulates
  where samples come from and the retrieval protocol; it does
  not leak implementation details to domain code.

- **Sample**: a single page's harvested evidence. Represented as
  a `SampleShape` envelope with `scope: 'substrate-study'` and
  `kind: 'sample-shape'`. Content-addressed by the canonical hash
  of its shape + source + retrievedAt.

- **Shape**: the structural sketch retained after PII scrubbing.
  Contains DOM skeleton (tag + role + landmark + class-prefix-
  stems + aria-* + whitelisted data-* stems), ancestry edges, and
  zero text content. Shape is the only form in which DOM data is
  persisted.

- **Fingerprint classifier**: the predicate `classifyOutSystems
  (html) → OSFingerprintVerdict`. Confirms, rejects, or labels
  "probable" based on OutSystems signals — class prefixes
  (`osui-*`, `ThemeGrid_*`, `OSBlockWidget_*`), generator meta
  tag, bundle naming, asset paths. A `rejected` verdict aborts
  the harvest; `confirmed` and `probable` both proceed.

- **OS signal**: a single observed token contributing to the
  fingerprint verdict. Enumerated kinds: `osui-class`,
  `theme-grid-class`, `os-widget-class`, `generator-meta`,
  `bundle-name`, `asset-path`, `response-header`. A verdict
  carries the list of signals that formed it, for audit.

- **Pattern kind**: one of the closed enumeration of pattern
  concepts the distillation targets. Mirrors (but is not
  identical to) the `Pattern` ids registered in the runtime
  pattern registry. Examples: `submit-button`, `nav-link`,
  `field-input`, `validation-error`, `date-picker`,
  `modal-dialog`, `sortable-table`, `file-upload`,
  `status-or-alert`. A pattern kind is what the aggregator
  groups signatures by.

- **Attribute signature**: a normalized, order-stable,
  human-readable representation of the subset of a DOM node's
  attributes that matter for matcher authoring. Example:
  `role=button | class-stem=osui-button | class-stem=osui-button--primary | data-testid-stem=submit-`.
  Normalization is pure and deterministic (§10.6).

- **Signature normalization**: the function `normalizeSignature
  (rawAttributes) → AttributeSignature`. Strips customer-specific
  suffixes (numeric ids, UUIDs, hashes), lowercases case-insensitive
  tokens, sorts keys, and collapses whitespace. Two attribute bags
  produce the same signature iff their normalized forms are
  byte-equal.

- **Distribution**: aggregated frequency table for a pattern kind,
  built from the whole sample corpus. A distribution has a total
  sample count, a list of `SignatureFrequency` rows (signature +
  count + sample-id references), and a content-addressed
  fingerprint of its own shape for referencing by proposals.

- **Signature frequency**: a single row in a distribution: one
  normalized signature, the count of samples exhibiting it, and
  the list of sample-ids contributing (capped at 10 for envelope
  size — full list lives in an indexed sidecar if needed).

- **Support ratio**: for a given signature in a distribution,
  `count / totalSamples`. A float in [0, 1]. The matcher-proposal
  pipeline applies a configurable floor against this ratio when
  deciding whether to propose a new matcher.

- **Matcher proposal**: a candidate new matcher for the pattern
  registry's OutSystems-generic layer. Carries: target pattern
  kind, the signature that triggered the proposal, support ratio,
  supporting sample-ids, source distribution fingerprint, and
  proposed TypeScript matcher skeleton (generated from the
  signature; operator reviews + refines before merge).

- **Corpus manifest**: the roll-up of a harvest run — sources
  consulted, sample counts per source, fingerprint-verdict
  histogram, retrievedAt range. One manifest per run; append-only.

- **Distillation run**: a single invocation of `distill-corpus`
  producing one or more distributions. A run references the
  corpus manifest it read + the quarter tag it was labeled with.

- **Quarter tag**: a string like `2026-Q2` labeling a distillation
  run. Enables year-over-year drift comparisons (§16).

- **Scraping policy**: the operator-approved document at
  `workshop/substrate-study/policy/scraping-policy.yaml`
  enumerating permitted sources, retention rules, refresh
  cadence, and PII-scrubbing contract. Declarative; the Effect
  programs read it at runtime and fail-closed on any attempt to
  harvest from a source not in the policy.

- **Proposal envelope**: the workshop's existing proposal-bundle
  shape — the substrate-study emits proposals in that shape so
  the trust-policy gate can consume them without adaptation.

### 2.1 Terms retired / not in scope

- **"Crawl"** as a verb referring to live spider-like behavior.
  Intentionally avoided to prevent drift in discussion. We
  *harvest* from *already-indexed* archives.
- **"Scrape"** singular — reserved for pejorative use. Any
  reference to "scraping" in code or docs signals a policy
  violation worth pre-commit review.
- **"Template matching"** — sometimes used colloquially for what
  we do; but "distillation" is the load-bearing term. The pipeline
  doesn't match templates; it counts normalized signatures.
- **"Scoring"** — distributions count, they don't score. Scoring
  is what the matcher-proposal pipeline does, and only inside a
  clearly-named `scoreProposal` function.

## 3. Invariants

Load-bearing rules. Each maps to a law (§19) that enforces it at
the build / test gate.

### 3.1 I-PII (PII Containment)

**No raw HTML ever lands on disk.** The flow is strictly:

    raw HTML bytes (in-memory) → stripToShape() → SampleShape
                                                       ↓
                                                  disk (JSON envelope)

`stripToShape()` is the only constructor of `SampleShape`; there is
no export of any function that writes raw HTML to disk in the
`workshop/substrate-study/` tree.

Enforcement: an architecture law walks the tree looking for
`writeFile`, `createWriteStream`, or equivalent filesystem-write
primitives and asserts that no file under `workshop/substrate-study/`
writes non-Shape-typed payloads. Raw bytes must be freed within the
`Effect` scope that fetched them.

### 3.2 I-Source (Permitted Sources Only)

**Every harvest request must be against a `HarvestSource` variant
permitted by the policy YAML.** The YAML is the authoritative
allowlist; the Effect program reads it at Layer composition time
and refuses to construct adapters for sources not listed.

Enforcement: a runtime check in the composition layer (fails the
whole program if a non-whitelisted source is wired). A law test
asserts that only the four permitted `HarvestSource` variants
(`common-crawl`, `wayback`, `showcase`, `fixture`) are exported.
Adding a new variant is a policy doc change + law edit +
composition change — three separate signals.

### 3.3 I-Determinism (Distillation is a Pure Function)

**`distillCorpus(samples) → Distribution[]` is deterministic.**
Given byte-identical input, byte-identical output. No wall-clock
reads, no random ordering, no parallel aggregation that might
reorder.

Enforcement: a law runs the distiller on a fixed fixture corpus
twice and asserts byte-equality of both outputs. Pair law asserts
fingerprint-equality.

### 3.4 I-Append (Append-Only Stores)

**Every store (sample, distillation, proposal) is append-only.**
Writes never overwrite existing files; overlapping sample-ids
(same source + URL + retrievedAt) are deduped on append, not
overwritten.

Enforcement: the filesystem adapters refuse to open files with
`w` mode; only `wx` (exclusive create) or content-addressed
directory layout. A test temp-dir law verifies by attempting an
overwrite and expecting the adapter to error.

### 3.5 I-Seam (Seam Discipline)

**`product/` imports zero files from `workshop/substrate-study/`.**
Matcher proposals flow *out* via the shared proposal-bundle
envelope already used by catalog authoring; they do not import
substrate-study types into product.

Enforcement: existing seam-enforcement architecture laws cover this
automatically — no substrate-study-specific law needed. A comment
in the seam test file notes the rule.

### 3.6 I-Provenance (Provenance at Event Time)

**Provenance is minted at the event that creates the artifact, not
reconstructed later.** A `SampleShape` carries the source, the
URL, the retrievedAt timestamp, and the fingerprint-verdict signals
all at the moment of creation. Post-hoc enrichment is an anti-goal.

Enforcement: the type `SampleShape.payload.provenance` is readonly
and required; there is no `setProvenance()` function in the
codebase.

### 3.7 I-Envelope (Four Phantom Axes Preserved)

**Every artifact carries the four phantom axes** (Stage × Source
× Verdict × Fingerprint<Tag>) per CLAUDE.md envelope discipline.
`SampleShape` extends `WorkflowMetadata<'evidence'>`;
`Distribution` extends `WorkflowMetadata<'evidence'>`;
`MatcherProposal` extends `WorkflowMetadata<'proposal'>`.

Enforcement: existing envelope-axis architecture laws catch
violations at compile time.

### 3.8 I-Idempotent (Runs Are Idempotent)

**Re-running any phase against the same inputs produces
byte-identical outputs.** Harvest on an already-harvested URL is a
no-op (content-address dedup). Distill over the same samples
produces the same distribution (I-Determinism). Propose against
the same distribution produces the same proposals.

Enforcement: an end-to-end law runs all three phases, then all
three again, asserts artifact-set equality.

### 3.9 I-Versioned (Every Run Quarter-Stamped)

**Every harvest + distillation run carries a quarter tag**
(`YYYY-Q[1-4]`). Distillations reference their quarter in the
payload. Matcher proposals reference the source distillation's
fingerprint + quarter.

Enforcement: a law asserts every produced envelope carries a
quarter-tag field; the CLI's default is "current quarter from
system clock," overridable by `--quarter` flag.

### 3.10 I-Retention (Retention is Type-Level)

**Only whitelisted attributes reach disk.** The whitelist is a
closed union in the domain layer (§10.3). Any attribute not in
the whitelist is stripped before the Shape is constructed.
Adding a new retained attribute is a union extension + law
update.

Enforcement: a unit law feeds `stripToShape` a malicious HTML
payload with `onclick`, `style`, `href`, inline text, and
confirms every non-whitelisted attribute/content element is
absent from the resulting Shape.

## 4. Domain Model

Pure types; zero Effect imports; lives in
`workshop/substrate-study/domain/`. Follows the Z1-style
folds-and-closed-unions pattern from the compounding engine.

### 4.1 IDs and brands

```typescript
// workshop/substrate-study/domain/ids.ts
import { brandString, type Brand } from '../../../product/domain/kernel/brand';

export type SampleId        = Brand<string, 'SampleId'>;
export type DistributionId  = Brand<string, 'DistributionId'>;
export type ProposalId      = Brand<string, 'ProposalId'>;
export type SignatureToken  = Brand<string, 'SignatureToken'>;
export type CorpusRunId     = Brand<string, 'CorpusRunId'>;

export const sampleId       = (s: string) => brandString<'SampleId'>(s);
export const distributionId = (s: string) => brandString<'DistributionId'>(s);
export const proposalId     = (s: string) => brandString<'ProposalId'>(s);
export const signatureToken = (s: string) => brandString<'SignatureToken'>(s);
export const corpusRunId    = (s: string) => brandString<'CorpusRunId'>(s);
```

### 4.2 Sources (closed union)

```typescript
// workshop/substrate-study/domain/source.ts

export interface CommonCrawlSource {
  readonly kind: 'common-crawl';
  readonly crawlId: string;    // e.g., "CC-MAIN-2026-14"
  readonly warcPath: string;   // within-crawl WARC segment path
  readonly recordOffset: number;  // byte offset inside WARC
}

export interface WaybackSource {
  readonly kind: 'wayback';
  readonly archiveTimestamp: string; // Wayback canonical 14-char ts
  readonly originalUrl: string;
}

export interface ShowcaseSource {
  readonly kind: 'showcase';
  readonly showcaseVersion: string;   // e.g., "2026-outsystems-showcase-v2"
  readonly pageSlug: string;
}

export interface FixtureSource {
  readonly kind: 'fixture';
  readonly fixturePath: string;       // repo-relative; TEST ONLY
}

export type HarvestSourceKind =
  | CommonCrawlSource
  | WaybackSource
  | ShowcaseSource
  | FixtureSource;

export function foldHarvestSource<R>(
  source: HarvestSourceKind,
  cases: {
    readonly commonCrawl: (s: CommonCrawlSource) => R;
    readonly wayback:     (s: WaybackSource)     => R;
    readonly showcase:    (s: ShowcaseSource)    => R;
    readonly fixture:     (s: FixtureSource)     => R;
  },
): R {
  switch (source.kind) {
    case 'common-crawl': return cases.commonCrawl(source);
    case 'wayback':      return cases.wayback(source);
    case 'showcase':     return cases.showcase(source);
    case 'fixture':      return cases.fixture(source);
  }
}

export function sourceKey(source: HarvestSourceKind): string {
  return foldHarvestSource(source, {
    commonCrawl: (s) => `common-crawl:${s.crawlId}:${s.warcPath}:${s.recordOffset}`,
    wayback:     (s) => `wayback:${s.archiveTimestamp}:${s.originalUrl}`,
    showcase:    (s) => `showcase:${s.showcaseVersion}:${s.pageSlug}`,
    fixture:     (s) => `fixture:${s.fixturePath}`,
  });
}
```

### 4.3 Retained attribute whitelist (closed union)

```typescript
// workshop/substrate-study/domain/retained-attribute.ts

/** Closed union of attribute families we retain. Adding a family
 *  requires an explicit edit here + a law update. */
export type RetainedAttributeKind =
  | 'role'
  | 'landmark-role'
  | 'aria-label'         // presence only, NOT value
  | 'aria-labelledby'    // structural ref only; referrent id destroyed
  | 'aria-describedby'   // same
  | 'aria-invalid'       // boolean only
  | 'aria-expanded'      // boolean only
  | 'aria-required'      // boolean only
  | 'aria-live'          // enum value retained
  | 'class-prefix-stem'  // normalized class name stems only (§10.6)
  | 'data-testid-stem'   // normalized test-id stems only
  | 'type-attribute'     // for <input>: enum value retained
  | 'tag-name';          // structural

export const RETAINED_ATTRIBUTE_KINDS: readonly RetainedAttributeKind[] = [
  'role', 'landmark-role',
  'aria-label', 'aria-labelledby', 'aria-describedby',
  'aria-invalid', 'aria-expanded', 'aria-required', 'aria-live',
  'class-prefix-stem', 'data-testid-stem', 'type-attribute',
  'tag-name',
] as const;

/** Everything not in this list is destroyed by stripToShape. */
```

### 4.4 Fingerprint verdict (closed union)

```typescript
// workshop/substrate-study/domain/fingerprint.ts

export type OSSignalKind =
  | 'osui-class'
  | 'theme-grid-class'
  | 'os-widget-class'
  | 'generator-meta'
  | 'bundle-name'
  | 'asset-path'
  | 'response-header';

export interface OSSignal {
  readonly kind: OSSignalKind;
  readonly token: string;  // normalized; e.g., 'osui-button'
}

export interface OSFingerprintConfirmed {
  readonly kind: 'confirmed';
  readonly signals: readonly OSSignal[];
  readonly confidence: 'high' | 'medium';
}

export interface OSFingerprintProbable {
  readonly kind: 'probable';
  readonly signals: readonly OSSignal[];
  readonly confidence: 'medium' | 'low';
}

export interface OSFingerprintRejected {
  readonly kind: 'rejected';
  readonly reason: string;
}

export type OSFingerprintVerdict =
  | OSFingerprintConfirmed
  | OSFingerprintProbable
  | OSFingerprintRejected;

export function foldOSFingerprintVerdict<R>(
  verdict: OSFingerprintVerdict,
  cases: {
    readonly confirmed: (v: OSFingerprintConfirmed) => R;
    readonly probable:  (v: OSFingerprintProbable)  => R;
    readonly rejected:  (v: OSFingerprintRejected)  => R;
  },
): R {
  switch (verdict.kind) {
    case 'confirmed': return cases.confirmed(verdict);
    case 'probable':  return cases.probable(verdict);
    case 'rejected':  return cases.rejected(verdict);
  }
}
```

### 4.5 DOM skeleton + attribute bag

```typescript
// workshop/substrate-study/domain/shape.ts

import type { SampleId } from './ids';
import type { HarvestSourceKind } from './source';
import type { OSFingerprintVerdict } from './fingerprint';

/** Narrow, PII-scrubbed DOM node. Attributes are retained by kind
 *  (closed union); values are either absent (presence-only), boolean,
 *  enum, or normalized stem. No raw text, no URLs, no content. */
export interface DOMNode {
  readonly id: string;                      // stable within this sample only
  readonly tagName: string;
  readonly role: string | null;
  readonly landmarkRole: string | null;
  readonly classPrefixStems: readonly string[];
  readonly testIdStems: readonly string[];
  readonly ariaAttributes: AriaAttributeBag;
  readonly typeAttribute: string | null;    // for <input>
  readonly hasAccessibleName: boolean;      // presence-only
}

export interface AriaAttributeBag {
  readonly label: boolean;         // presence
  readonly labelledBy: boolean;    // presence
  readonly describedBy: boolean;   // presence
  readonly invalid: boolean | null;
  readonly expanded: boolean | null;
  readonly required: boolean | null;
  readonly live: 'off' | 'polite' | 'assertive' | null;
}

export interface DOMEdge {
  readonly parent: string;   // DOMNode.id
  readonly child: string;    // DOMNode.id
  readonly ordinal: number;  // child index within parent (stable across runs)
}

export interface DOMSkeleton {
  readonly nodes: readonly DOMNode[];
  readonly edges: readonly DOMEdge[];
}

export interface RetentionProof {
  /** The exact list of attribute names destroyed during
   *  stripToShape, sorted. A law verifies this field's content
   *  matches the expected scrub list for a given malicious input.
   *  This is audit evidence; not load-bearing at runtime. */
  readonly strippedAttributes: readonly string[];
  /** Character count of text content destroyed. */
  readonly strippedTextChars: number;
  /** Count of script / style / image elements destroyed. */
  readonly strippedElementCount: number;
}
```

### 4.6 SampleShape envelope

```typescript
// workshop/substrate-study/domain/sample-shape.ts

import type { WorkflowMetadata } from '../../../product/domain/governance/workflow-types';
import type { Fingerprint } from '../../../product/domain/kernel/hash';
import type { SampleId } from './ids';
import type { HarvestSourceKind } from './source';
import type { OSFingerprintVerdict } from './fingerprint';
import type { DOMSkeleton, RetentionProof } from './shape';

export interface SampleShape extends WorkflowMetadata<'evidence'> {
  readonly kind: 'sample-shape';
  readonly scope: 'substrate-study';
  readonly payload: SampleShapePayload;
}

export interface SampleShapePayload {
  readonly sampleId: SampleId;
  readonly source: HarvestSourceKind;
  readonly originalUrl: string;
  readonly retrievedAt: string;              // ISO-8601
  readonly quarterTag: string;               // e.g., '2026-Q2'
  readonly fingerprintVerdict: OSFingerprintVerdict;
  readonly skeleton: DOMSkeleton;
  readonly retention: RetentionProof;
  readonly shapeFingerprint: Fingerprint<'substrate-sample-shape'>;
}
```

Fingerprint tag `'substrate-sample-shape'` is a new registry
entry (§5.1). Widens `FingerprintTag`; an existing-pattern law
adds the tag.

### 4.7 Pattern kind + signature

```typescript
// workshop/substrate-study/domain/pattern-kind.ts

export type PatternKind =
  | 'submit-button'
  | 'nav-link'
  | 'field-input'
  | 'validation-error'
  | 'date-picker'
  | 'modal-dialog'
  | 'sortable-table'
  | 'file-upload'
  | 'status-or-alert'
  | 'multi-select-picker'
  | 'wizard-step';

export const PATTERN_KINDS: readonly PatternKind[] = [
  'submit-button', 'nav-link', 'field-input', 'validation-error',
  'date-picker', 'modal-dialog', 'sortable-table', 'file-upload',
  'status-or-alert', 'multi-select-picker', 'wizard-step',
] as const;

/** The 11 pattern kinds above correspond 1:1 with the substrate
 *  backlog rows in docs/v2-synthetic-app-surface-backlog.md. As
 *  substrate work closes a gap, the kind stays; only what we do
 *  with its distribution changes (proposals migrate from Layer 2
 *  generic to runtime matchers). */
```

```typescript
// workshop/substrate-study/domain/signature.ts

import type { SignatureToken } from './ids';

/** An ordered, normalized list of signature tokens. Derivation is
 *  deterministic; two attribute bags produce the same
 *  AttributeSignature iff their normalized representations are
 *  byte-equal.
 *
 *  Canonical textual form (for logs/debug):
 *    role=button|class-stem=osui-button|class-stem=osui-button--primary|data-testid-stem=submit-
 *
 *  Tokens are pipe-separated; key=value within each token; keys
 *  sorted alphabetically; values already normalized by §10.6. */
export interface AttributeSignature {
  readonly tokens: readonly SignatureToken[];
  readonly canonicalForm: string;       // the pipe-joined string above
  readonly nodeContext: 'root' | 'inside-form' | 'inside-nav' | 'inside-dialog' | 'inside-main';
}

export function signatureKey(sig: AttributeSignature): string {
  return `${sig.nodeContext}::${sig.canonicalForm}`;
}
```

### 4.8 Distribution

```typescript
// workshop/substrate-study/domain/distribution.ts

import type { WorkflowMetadata } from '../../../product/domain/governance/workflow-types';
import type { Fingerprint } from '../../../product/domain/kernel/hash';
import type { DistributionId, SampleId } from './ids';
import type { PatternKind } from './pattern-kind';
import type { AttributeSignature } from './signature';

export interface SignatureFrequency {
  readonly signature: AttributeSignature;
  readonly count: number;
  /** Up to 10 contributing sample ids for spot-check. The
   *  full list is reconstructible from the sample store by
   *  re-aggregating the corpus; keeping 10 keeps envelopes small
   *  while giving operators a quick drill-down. */
  readonly sampleIdsSample: readonly SampleId[];
}

export interface Distribution extends WorkflowMetadata<'evidence'> {
  readonly kind: 'distribution';
  readonly scope: 'substrate-study';
  readonly payload: DistributionPayload;
}

export interface DistributionPayload {
  readonly distributionId: DistributionId;
  readonly patternKind: PatternKind;
  readonly quarterTag: string;
  readonly totalSamples: number;
  /** Sorted by count DESC then by signature canonicalForm ASC for
   *  determinism. */
  readonly frequencies: readonly SignatureFrequency[];
  readonly sourceCorpusFingerprint: Fingerprint<'substrate-corpus'>;
  readonly distributionFingerprint: Fingerprint<'substrate-distribution'>;
}
```

### 4.9 Matcher proposal

```typescript
// workshop/substrate-study/domain/matcher-proposal.ts

import type { WorkflowMetadata } from '../../../product/domain/governance/workflow-types';
import type { Fingerprint } from '../../../product/domain/kernel/hash';
import type { ProposalId, SampleId } from './ids';
import type { PatternKind } from './pattern-kind';
import type { AttributeSignature } from './signature';

export interface MatcherProposal extends WorkflowMetadata<'proposal'> {
  readonly kind: 'substrate-matcher-proposal';
  readonly scope: 'substrate-study';
  readonly payload: MatcherProposalPayload;
}

export interface MatcherProposalPayload {
  readonly proposalId: ProposalId;
  readonly patternKind: PatternKind;
  readonly signature: AttributeSignature;

  /** Supporting evidence. */
  readonly supportCount: number;
  readonly supportRatio: number;        // count / totalSamples
  readonly totalSamplesInDistribution: number;
  readonly exampleSampleIds: readonly SampleId[];

  /** Provenance. */
  readonly sourceDistributionFingerprint: Fingerprint<'substrate-distribution'>;
  readonly quarterTag: string;

  /** The operator-reviewable code skeleton. Not executable without
   *  review; an LLM or operator refines it into the final matcher.
   *  Carried as a string so the proposal envelope stays serializable;
   *  typecheck happens when the operator lands the matcher.ts. */
  readonly proposedMatcherSkeleton: string;

  /** Score computed by scoreProposal() — higher = stronger
   *  recommendation. Lands with the proposal so operators can sort. */
  readonly recommendationScore: number;
}
```

### 4.10 Harvest error (closed tagged union)

```typescript
// workshop/substrate-study/domain/harvest-error.ts

export interface FingerprintUnclearError {
  readonly _tag: 'FingerprintUnclear';
  readonly url: string;
  readonly signals: readonly string[];
}

export interface FetchFailedError {
  readonly _tag: 'FetchFailed';
  readonly url: string;
  readonly reason: string;
  readonly retryableClass: 'transient' | 'permanent';
}

export interface ParseFailedError {
  readonly _tag: 'ParseFailed';
  readonly url: string;
  readonly bytesLength: number;
  readonly parserError: string;
}

export interface RateLimitedError {
  readonly _tag: 'RateLimited';
  readonly sourceKind: string;
  readonly retryAfterMs: number | null;
}

export interface PolicyViolationError {
  readonly _tag: 'PolicyViolation';
  readonly attempted: string;
  readonly rule: string;
}

export interface ScrubFailedError {
  readonly _tag: 'ScrubFailed';
  readonly url: string;
  readonly stage: 'pre-scrub' | 'strip' | 'post-audit';
  readonly detail: string;
}

export type HarvestError =
  | FingerprintUnclearError
  | FetchFailedError
  | ParseFailedError
  | RateLimitedError
  | PolicyViolationError
  | ScrubFailedError;

export function foldHarvestError<R>(
  err: HarvestError,
  cases: {
    readonly fingerprintUnclear: (e: FingerprintUnclearError) => R;
    readonly fetchFailed:        (e: FetchFailedError)        => R;
    readonly parseFailed:        (e: ParseFailedError)        => R;
    readonly rateLimited:        (e: RateLimitedError)        => R;
    readonly policyViolation:    (e: PolicyViolationError)    => R;
    readonly scrubFailed:        (e: ScrubFailedError)        => R;
  },
): R {
  switch (err._tag) {
    case 'FingerprintUnclear': return cases.fingerprintUnclear(err);
    case 'FetchFailed':        return cases.fetchFailed(err);
    case 'ParseFailed':        return cases.parseFailed(err);
    case 'RateLimited':        return cases.rateLimited(err);
    case 'PolicyViolation':    return cases.policyViolation(err);
    case 'ScrubFailed':        return cases.scrubFailed(err);
  }
}
```

### 4.11 Distill error + propose error

```typescript
export type DistillError =
  | { readonly _tag: 'InsufficientSamples'; readonly kind: PatternKind; readonly have: number; readonly need: number }
  | { readonly _tag: 'EmptyCorpus' }
  | { readonly _tag: 'AggregatorDrift'; readonly detail: string };

export type ProposeError =
  | { readonly _tag: 'FloorUnreached'; readonly kind: PatternKind; readonly topRatio: number; readonly floor: number }
  | { readonly _tag: 'DuplicateSignature'; readonly signature: string; readonly existingMatcherId: string }
  | { readonly _tag: 'DistributionMissing'; readonly kind: PatternKind };
```

## 5. Effect Architecture

All IO + composition lives under `workshop/substrate-study/application/`
(Effect programs) and `workshop/substrate-study/harness/` (adapter
implementations). The domain layer stays Effect-free.

### 5.1 Fingerprint-tag registry additions

Four new tags in `product/domain/kernel/hash.ts`:

```typescript
  // Substrate study (Step 11 Z11f / docs/v2-substrate-study-plan.md)
  | 'substrate-sample-shape'   // per-page retained shape fingerprint
  | 'substrate-corpus'         // set of samples considered in a run
  | 'substrate-distribution'   // aggregated per-kind frequency table
  | 'substrate-proposal';      // matcher-proposal envelope
```

All additive; zero existing consumers branch on tag-string comparison.

Registry widening: `WorkflowScope` gains `'substrate-study'`
(one scope covers all three envelope kinds here — unlike verdict-09's
per-kind split for hypothesis — because the study's artifacts are
internal to the same analytical lane and reusing one scope keeps
reads simple).

### 5.2 Ports (Context.Tag services)

Four injectable services. All adapter implementations live in
`harness/`; the composition layer in `composition/live-services.ts`
wires them via `Layer.succeed`.

```typescript
// workshop/substrate-study/application/ports.ts

import { Context, Effect } from 'effect';
import type { Distribution } from '../domain/distribution';
import type { HarvestError } from '../domain/harvest-error';
import type { HarvestSourceKind } from '../domain/source';
import type { MatcherProposal } from '../domain/matcher-proposal';
import type { SampleShape } from '../domain/sample-shape';
import type { SampleId, DistributionId, ProposalId } from '../domain/ids';
import type { PatternKind } from '../domain/pattern-kind';

// ─── HarvestSource: abstraction over CommonCrawl / Wayback / Showcase / Fixture ───

export interface HarvestSourcePort {
  /** List the record-level handles addressable in this source that
   *  satisfy a seed filter (e.g., domain allowlist, crawl ID, etc.).
   *  Streams to bound memory for large crawls. */
  readonly listAddressable: (
    filter: HarvestFilter,
  ) => Effect.Effect<readonly HarvestSourceKind[], HarvestError, never>;

  /** Fetch + parse a single addressable record, returning the raw
   *  bytes + content-type for the `stripToShape` pipeline. The bytes
   *  MUST be consumed entirely within the scope of the returned
   *  Effect — they are never persisted. */
  readonly fetchBytes: (
    source: HarvestSourceKind,
  ) => Effect.Effect<
    { readonly bytes: Uint8Array; readonly contentType: string; readonly url: string },
    HarvestError,
    never
  >;
}

export interface HarvestFilter {
  readonly sourceKind: 'common-crawl' | 'wayback' | 'showcase' | 'fixture';
  readonly maxRecords?: number | undefined;
  readonly seedHostnames?: readonly string[] | undefined;  // e.g., ['showcase.outsystems.com']
  readonly quarterTag?: string | undefined;
}

export class HarvestSource extends Context.Tag('tesseract/substrate-study/HarvestSource')<
  HarvestSource,
  HarvestSourcePort
>() {}

// ─── SampleStore ────────────────────────────────────────────────

export interface SampleStorePort {
  readonly appendSample: (shape: SampleShape) => Effect.Effect<void, HarvestError, never>;
  readonly findBySampleId: (id: SampleId) => Effect.Effect<SampleShape | null, HarvestError, never>;
  readonly listAll: () => Effect.Effect<readonly SampleShape[], HarvestError, never>;
  readonly listByQuarter: (quarterTag: string) => Effect.Effect<readonly SampleShape[], HarvestError, never>;
  readonly countAll: () => Effect.Effect<number, HarvestError, never>;
}

export class SampleStore extends Context.Tag('tesseract/substrate-study/SampleStore')<
  SampleStore,
  SampleStorePort
>() {}

// ─── DistillationStore ─────────────────────────────────────────

export interface DistillationStorePort {
  readonly appendDistribution: (d: Distribution) => Effect.Effect<void, HarvestError, never>;
  readonly findByDistributionId: (id: DistributionId) => Effect.Effect<Distribution | null, HarvestError, never>;
  readonly listByQuarter: (quarterTag: string) => Effect.Effect<readonly Distribution[], HarvestError, never>;
  readonly findByQuarterAndKind: (
    quarterTag: string,
    kind: PatternKind,
  ) => Effect.Effect<Distribution | null, HarvestError, never>;
  readonly listAllQuarters: () => Effect.Effect<readonly string[], HarvestError, never>;
}

export class DistillationStore extends Context.Tag('tesseract/substrate-study/DistillationStore')<
  DistillationStore,
  DistillationStorePort
>() {}

// ─── MatcherProposalStore ──────────────────────────────────────

export interface MatcherProposalStorePort {
  readonly appendProposal: (p: MatcherProposal) => Effect.Effect<void, HarvestError, never>;
  readonly listByQuarter: (quarterTag: string) => Effect.Effect<readonly MatcherProposal[], HarvestError, never>;
  readonly findByProposalId: (id: ProposalId) => Effect.Effect<MatcherProposal | null, HarvestError, never>;
  readonly listByPatternKind: (kind: PatternKind) => Effect.Effect<readonly MatcherProposal[], HarvestError, never>;
}

export class MatcherProposalStore extends Context.Tag('tesseract/substrate-study/MatcherProposalStore')<
  MatcherProposalStore,
  MatcherProposalStorePort
>() {}
```

### 5.3 Effect programs (top-level runner composition)

Three top-level programs. Each runs independently; they compose
top-down (`propose` reads `distill`'s output; `distill` reads
`harvest`'s output) but can be re-run in isolation under
I-Idempotent.

```typescript
// workshop/substrate-study/application/harvest-corpus.ts

import { Effect } from 'effect';
import type { PolicyViolationError, HarvestError } from '../domain/harvest-error';
import type { HarvestSourceKind } from '../domain/source';
import { HarvestSource, SampleStore } from './ports';
import { classifyOutSystems } from './fingerprint-classifier';
import { stripToShape } from './shape-extractor';
import { loadScrapingPolicy } from './scraping-policy-loader';

export interface HarvestCorpusOptions {
  readonly sources: readonly ('common-crawl' | 'wayback' | 'showcase' | 'fixture')[];
  readonly maxSamples: number;
  readonly quarterTag: string;
  readonly seedHostnames?: readonly string[] | undefined;
}

export interface HarvestCorpusReport {
  readonly runId: string;
  readonly quarterTag: string;
  readonly samplesAppended: number;
  readonly samplesRejectedByFingerprint: number;
  readonly samplesDedupedOnIdempotency: number;
  readonly errorsByTag: Readonly<Record<string, number>>;
  readonly perSourceCounts: Readonly<Record<string, number>>;
}

export function harvestCorpus(
  options: HarvestCorpusOptions,
): Effect.Effect<HarvestCorpusReport, HarvestError, HarvestSource | SampleStore> {
  // Implementation sketch:
  //  1. loadScrapingPolicy().flatMap(policy => verify each source is permitted)
  //  2. For each source, HarvestSource.listAddressable(filter) → streams
  //     through fetch → classify → strip → append. Bounded concurrency.
  //  3. SampleStore.appendSample is idempotent on sampleId (content-addressed);
  //     collisions increment the `samplesDedupedOnIdempotency` counter.
  //  4. Errors classified via foldHarvestError; counted but do not abort the
  //     overall run (except PolicyViolation, which is fatal).
  //  5. Return the report envelope.
  return Effect.dieMessage('not yet implemented — sketched in §5.3');
}
```

```typescript
// workshop/substrate-study/application/distill-corpus.ts

import { Effect } from 'effect';
import type { DistillError } from '../domain/harvest-error'; // errors re-exported from a shared file
import type { Distribution } from '../domain/distribution';
import type { PatternKind } from '../domain/pattern-kind';
import { SampleStore, DistillationStore } from './ports';

export interface DistillCorpusOptions {
  readonly quarterTag: string;
  readonly kinds: readonly PatternKind[] | 'all';
  readonly minSamplesPerKind: number;      // default 20
}

export interface DistillCorpusReport {
  readonly quarterTag: string;
  readonly distributionsProduced: number;
  readonly kindsSkippedInsufficient: readonly PatternKind[];
  readonly totalSamplesRead: number;
}

export function distillCorpus(
  options: DistillCorpusOptions,
): Effect.Effect<DistillCorpusReport, DistillError, SampleStore | DistillationStore> {
  // Implementation sketch:
  //  1. SampleStore.listByQuarter(quarterTag).
  //  2. For each requested kind, run the per-kind aggregator
  //     (§11.2) over the sample corpus. Pure over the samples.
  //  3. If count < minSamplesPerKind → record as insufficient;
  //     skip; do NOT emit a bogus distribution.
  //  4. Build the Distribution envelope deterministically
  //     (sorted frequencies); fingerprint via
  //     distributionFingerprintOf(distribution). Append.
  //  5. Return report.
  return Effect.dieMessage('not yet implemented — sketched in §5.3');
}
```

```typescript
// workshop/substrate-study/application/propose-matchers.ts

import { Effect } from 'effect';
import type { ProposeError } from '../domain/harvest-error';
import type { MatcherProposal } from '../domain/matcher-proposal';
import { DistillationStore, MatcherProposalStore } from './ports';

export interface ProposeMatchersOptions {
  readonly quarterTag: string;
  readonly supportFloor: number;            // default 0.3
  readonly maxProposalsPerKind: number;     // default 3
  /** Signatures already covered by existing matchers — proposals
   *  with these signatures are suppressed. Injected at composition
   *  time from product/domain/resolution/patterns/ via a pure
   *  extractor; no runtime code-import. */
  readonly knownCoveredSignatures: readonly string[];
}

export interface ProposeMatchersReport {
  readonly quarterTag: string;
  readonly proposalsAppended: number;
  readonly perKindCounts: Readonly<Record<string, number>>;
  readonly suppressedAsDuplicates: number;
  readonly kindsWithNoFloorReach: readonly string[];
}

export function proposeMatchers(
  options: ProposeMatchersOptions,
): Effect.Effect<ProposeMatchersReport, ProposeError, DistillationStore | MatcherProposalStore> {
  // Implementation sketch:
  //  1. DistillationStore.listByQuarter(quarterTag).
  //  2. For each distribution:
  //       a. Pick the top-N frequencies whose supportRatio >= floor.
  //       b. Skip any whose signature is in knownCoveredSignatures.
  //       c. For each survivor, build a MatcherProposal envelope
  //          with scoreProposal() → recommendationScore.
  //       d. Append to MatcherProposalStore.
  //  3. Return report with per-kind counts + suppression counts.
  return Effect.dieMessage('not yet implemented — sketched in §5.3');
}
```

### 5.4 Parallel-safety analysis

Per `docs/v2-compounding-engine-plan.md §4.6` template.

| Operation | Concurrency | Safety |
|---|---|---|
| `harvestCorpus` per-source fetches | `Effect.all({ concurrency: 8 })` | Safe — each fetch is independent; append is content-addressed + idempotent. |
| `distillCorpus` per-kind aggregation | `Effect.all({ concurrency: 'unbounded' })` | Safe — pure aggregation over read-only sample set; no cross-kind state. |
| `proposeMatchers` per-distribution processing | `Effect.all({ concurrency: 'unbounded' })` | Safe — pure per-distribution; no shared state. |
| Sample appends under harvest | Sequential per-source, bounded parallel across sources | Filesystem-level file creation is the serialization point; content-address dedup handles races. |

### 5.5 Layer composition

```typescript
// workshop/substrate-study/composition/live-services.ts

import { Layer } from 'effect';
import { HarvestSource, SampleStore, DistillationStore, MatcherProposalStore } from '../application/ports';
import { createFilesystemSampleStore } from '../harness/filesystem-sample-store';
import { createFilesystemDistillationStore } from '../harness/filesystem-distillation-store';
import { createFilesystemProposalStore } from '../harness/filesystem-proposal-store';
import { composeHarvestSources } from '../harness/compose-harvest-sources';
import { loadScrapingPolicy } from '../application/scraping-policy-loader';

export function liveSubstrateStudyLayer(options: {
  readonly rootDir: string;
  readonly policyPath?: string;
}) {
  // Read the policy first; it determines which adapters to construct.
  // Attempting to wire a non-permitted adapter fails-closed with a
  // PolicyViolation error at the Layer composition boundary.
  const policy = loadScrapingPolicy(options.policyPath ?? defaultPolicyPath(options.rootDir));
  const harvestSource = composeHarvestSources(policy);  // throws if policy-violating

  return Layer.mergeAll(
    Layer.succeed(HarvestSource, harvestSource),
    Layer.succeed(SampleStore, createFilesystemSampleStore(options.rootDir)),
    Layer.succeed(DistillationStore, createFilesystemDistillationStore(options.rootDir)),
    Layer.succeed(MatcherProposalStore, createFilesystemProposalStore(options.rootDir)),
  );
}

export function inMemorySubstrateStudyLayer(fixtures: {
  readonly samples?: readonly SampleShape[];
  readonly distributions?: readonly Distribution[];
  readonly proposals?: readonly MatcherProposal[];
}) {
  // Test-only layer wiring in-memory adapters. Used by integration laws.
  ...
}
```

### 5.6 Effect boundary rules

Follows CLAUDE.md's Effect-forward doctrine.

- No `Effect.runPromise` outside the CLI entrypoint.
- `Effect.gen + yield*` for orchestration; `Effect.all` for parallel-
  safe operations.
- `Effect.catchTag` over manual discrimination of `HarvestError`
  variants; `foldHarvestError` is the exhaustive dispatcher.
- Adapter implementations surface only the port interface; callers
  cannot observe implementation details.
- All external-world contact (HTTP fetch, filesystem read/write,
  policy YAML parse) lives exclusively in `harness/` adapters.
  Domain + application layers are IO-free.

### 5.7 Determinism contract

- `distillCorpus` is a pure function (§3.3) over the sample
  corpus. Given byte-identical input, byte-identical output.
  Aggregators:
  - Sort signatures alphabetically by `canonicalForm` within
    each count-band.
  - Tie-break by first sample-id (string-lex).
  - Never consult the system clock beyond the envelope's
    `retrievedAt` stamp (which is already in the samples).
- `proposeMatchers` is a pure function over the distributions +
  the knownCoveredSignatures set. Score function
  `scoreProposal(freq, kind, quarterTag)` is pure and sorted-stable.
- `harvestCorpus` is NOT pure — it does IO and consults the
  policy file. Its idempotency (I-Idempotent) comes from
  content-addressing on sample-id rather than functional purity.

## 6. Harvesting Policy + Legal

The scraping-policy YAML is declarative and authoritative. The
Effect programs read it and fail-closed on any request outside its
allowlist. Changes to the policy are PR-reviewable artifacts,
same as catalog entries.

### 6.1 Policy file location and shape

```yaml
# workshop/substrate-study/policy/scraping-policy.yaml

schemaVersion: 1
owner: substrate-study-lane
reviewedAt: 2026-04-23
refreshCadence: quarterly  # never more than 4x/year

sources:

  - kind: common-crawl
    enabled: true
    rationale: |
      Common Crawl is an open, non-profit web archive. Fetches go
      against their CDN, not origin sites. Respects robots.txt at
      original crawl time.
    rateLimit:
      requestsPerMinute: 30
      maxConcurrent: 4
    crawlAllowlist:
      # Explicit list of crawl IDs we're permitted to read from.
      # Avoids accidental fetch from crawls we haven't reviewed.
      - 'CC-MAIN-2025-33'
      - 'CC-MAIN-2025-47'
      - 'CC-MAIN-2026-02'
      - 'CC-MAIN-2026-14'

  - kind: wayback
    enabled: true
    rationale: |
      Internet Archive's Wayback Machine. Fetches from their
      archive cache, not origin. Explicit domain allowlist per
      run; request rate clamped per IA's published norms.
    rateLimit:
      requestsPerMinute: 15
      maxConcurrent: 2
    domainAllowlist:
      - showcase.outsystems.com
      - www.outsystems.com/case-studies
      # Customer domains ONLY when IA has them archived AND the
      # domain appears in OutSystems's public case-studies page.
      # Allowlist additions are per-run PR artifacts; one-shot,
      # not ongoing.

  - kind: showcase
    enabled: true
    rationale: |
      OutSystems's own publicly-linked showcase + case-study
      pages. Their documented invitation to view. Still
      polite-rate-limited.
    rateLimit:
      requestsPerMinute: 10
      maxConcurrent: 1
    urlSeedFile: workshop/substrate-study/policy/showcase-seeds.yaml

  - kind: fixture
    enabled: true
    rationale: |
      Test-only. Reads from checked-in fixtures under
      tests/substrate-study/fixtures/. Never touches the network.
    # No rate limits, no allowlist — the filesystem is the boundary.

retention:
  shapeOnly: true
  stripBeforeDisk: true
  maxShapeSizeKb: 64   # per-sample ceiling; larger → reject
  piiAuditRequired: true

reporting:
  runsMustProduceManifest: true
  quarterTagRequired: true
```

### 6.2 Policy enforcement

The policy is consumed at Layer composition (`composeHarvestSources
(policy)`) and at each runtime fetch. Two layers of enforcement:

1. **Compose-time**: if a source variant is configured but not
   listed in policy `sources[]`, the Layer construction throws.
   The CLI cannot dispatch against that source.

2. **Request-time**: even when a source is permitted, every
   `fetchBytes` call re-verifies the source-kind + domain (for
   Wayback) + crawlId (for Common Crawl) against the allowlist.
   A mismatch raises `PolicyViolationError`, which is a fatal
   error (not counted, fails the run).

### 6.3 Seed files

For Wayback + Showcase, explicit seed URLs live in:

```
workshop/substrate-study/policy/
  scraping-policy.yaml              (main policy; allowlists)
  showcase-seeds.yaml               (OutSystems showcase pages — PR-reviewable)
  wayback-seeds.yaml                (per-run customer-domain seeds — PR-reviewable)
  history/
    2026-Q2-wayback-seeds.yaml      (per-quarter archive of what we fetched)
```

Each seed file carries a `reviewedAt` stamp, a source-of-truth
URL proving why each entry is in scope, and an owner. Seed
modifications require PR review.

### 6.4 What we will NOT do (anti-goal)

- **Live-spider a customer site.** Even if their domain appears
  in an OutSystems case study, we don't point an HTTP client at
  it. We go through Wayback.
- **Harvest authenticated pages.** Common Crawl only sees public
  pages Googlebot saw. Wayback same. Showcase pages are by
  definition public. If a page requires auth, we stop.
- **Retain any content that could be PII.** Text is stripped.
  URLs are retained in the per-sample envelope for provenance
  but are already public (they're Wayback / Common Crawl
  citations). We do NOT retain form values, user data, or any
  customer-linked identifier beyond the source URL.
- **Re-publish samples.** The shape corpus is an internal working
  artifact. Distillations are publishable (aggregate statistics).
  Proposals are publishable. Raw sample shapes stay in the repo.
- **Refresh more than quarterly.** Policy sets the cadence; the
  CLI enforces the `--quarter` flag; running the same quarter
  twice is a no-op per idempotency.

### 6.5 Legal framing

**This section is an explanatory note, not a legal opinion.**

- **Common Crawl**: BSD-licensed open data, explicitly intended
  for downstream analysis. Our use is standard.
- **Wayback Machine**: Archive.org operates under fair-use /
  educational-research framings. Our rate + behavior fits within
  their documented norms. We fetch aggregates, not individual
  copies for redistribution.
- **OutSystems showcase**: publicly published with the intent of
  being read. Polite rate limits apply.
- **Customer sites via Wayback**: we access only archived
  snapshots; no live traffic to the customer origin. Our
  analytical use is research + tooling improvement; no
  re-publication.

A pre-implementation review of the policy doc + this section by
legal/privacy counsel is an explicit Z11f.0 checkbox (§18) before
any code lands.

### 6.6 Audit trail

Every harvest run writes a corpus manifest JSON:

```
workshop/substrate-study/logs/corpus-manifests/
  2026-Q2/2026-04-23T00-00-00Z-<run-id>.manifest.json
```

The manifest includes:

- `runId` (content-addressed).
- `quarterTag`.
- `startedAt`, `endedAt` timestamps.
- Policy fingerprint (hash of the policy YAML at run time).
- Per-source counts (addressable discovered; fetched; rejected by
  fingerprint; deduped; errored).
- Error breakdown by `HarvestError._tag`.
- List of sample-ids appended.

The manifest is the audit artifact. If a future concern
materializes ("did we fetch X"), the manifest answers.

## 7. The Fingerprint Classifier

The predicate `classifyOutSystems(html, headers) →
OSFingerprintVerdict` decides whether a fetched page goes forward
(confirmed / probable) or is discarded (rejected). This is the
first gate after fetch; it's what keeps the corpus OutSystems-
focused rather than diluted.

### 7.1 Signals (closed catalog)

Each signal is a token observed in the raw HTML or response
headers. The classifier returns the full list of signals on every
verdict — operators audit which signals fire.

| Signal kind | Matcher | Example | Confidence weight |
|---|---|---|---|
| `osui-class` | Class token regex `\bosui(-[a-z0-9]+)+\b` | `osui-button--primary` | high |
| `theme-grid-class` | Class token regex `\bThemeGrid_[A-Za-z0-9_-]+\b` | `ThemeGrid_Container` | medium |
| `os-widget-class` | Class token regex `\bOSBlockWidget_[A-Za-z0-9_-]+\b` | `OSBlockWidget_Header` | medium |
| `generator-meta` | `<meta name="generator" content="OutSystems...">` | — | high |
| `bundle-name` | Script src matches `/OutSystems(?:Runtime|App)\.[0-9a-f]+\.js/` | — | high |
| `asset-path` | Image / CSS path matches `/ui/[A-Za-z0-9_-]+\.(png\|svg\|css)` AND coincides with another signal | — | low (alone); boosts otherwise |
| `response-header` | `server: OutSystems` or `x-outsystems-*` | — | high |

### 7.2 Verdict computation

Deterministic scoring, same input → same verdict:

```
score := 0
for signal in signals:
  score += weightOf(signal.kind)

if score >= HIGH_THRESHOLD:           verdict = Confirmed(high)
elif score >= MEDIUM_THRESHOLD:       verdict = Confirmed(medium) OR Probable(medium)
elif score >= LOW_THRESHOLD:          verdict = Probable(low)
else:                                 verdict = Rejected("insufficient signals")

where:
  HIGH_THRESHOLD  = 3.0  (e.g., osui-class + generator-meta + bundle-name)
  MEDIUM_THRESHOLD = 2.0 (e.g., osui-class + theme-grid-class)
  LOW_THRESHOLD    = 1.0 (e.g., osui-class alone)
```

Weights:
- `osui-class`:        1.0 (accumulates if ≥3 distinct tokens seen → bonus +0.5)
- `theme-grid-class`:  0.8
- `os-widget-class`:   0.8
- `generator-meta`:    2.0   (single high-signal token)
- `bundle-name`:       1.5
- `asset-path`:        0.3   (only counts if another signal present)
- `response-header`:   2.0

### 7.3 Anti-false-positive guards

- **Class prefix isolation**: `osui-` match requires word boundaries
  on both sides — we avoid matching `custom-osui-like-thing` which
  isn't OutSystems.
- **Minimum distinct signal kinds**: `Confirmed` requires at least
  two distinct signal kinds. Three `osui-class` tokens alone = one
  kind, promotes to `Probable` at most.
- **Domain heuristic**: if the hostname contains `outsystems.com` or
  `outsystems.io`, signals are trusted more (implicit +0.5). If the
  hostname is clearly not OutSystems-operated (e.g., github.com,
  wikipedia.org), raise the thresholds by 1.0 to avoid spurious
  `Probable` on pages that merely mention OutSystems.
- **Text content blacklist**: if the page is clearly an article
  ABOUT OutSystems rather than an OutSystems-built site (detected
  by a news/blog/documentation marker), reject even with signals.

### 7.4 Test fixtures

Under `tests/substrate-study/fingerprint-fixtures/`:

- `positive/` — 10+ HTML fragments confirmed as OutSystems (drawn
  from public showcase). Classifier should emit `Confirmed(high)`
  or `Confirmed(medium)`.
- `probable/` — 5+ HTML fragments that match some signals but not
  decisively. Expected: `Probable`.
- `negative/` — 20+ HTML fragments of non-OutSystems sites
  (wikipedia, github pages, common blog templates). Expected:
  `Rejected`.
- `false-positive-guards/` — edge cases: blog post about
  OutSystems; GitHub README mentioning osui-button; etc.
  Expected: `Rejected` (the guards fire).

Fingerprint fixtures are reviewed + checked-in. The classifier
is regression-tested against them at every commit.

### 7.5 Classifier evolution

The classifier's signal list is a closed union; adding a signal is
a typed edit + law update. This discipline matches the rest of the
workshop's closed-registry pattern (FingerprintTag,
OSFingerprintVerdict, etc.).

Evolution path:
1. New signal observed in a real sample (e.g., OutSystems ships a
   new DOM convention).
2. A sample falls into `Probable` or `Rejected` where it should be
   `Confirmed`.
3. PR adds the signal kind, weight, and threshold adjustment.
4. Fixtures are added + old fixtures re-run to confirm no
   regressions.

Versioning: the classifier's logic is quarterly-snapshot-able by
capturing `classifierFingerprint` on the corpus manifest. Future
distillations reference the classifier version that produced
their samples; drift-detection across quarters accounts for
classifier changes.

## 8. The Shape Extractor (`stripToShape`)

The single constructor of `SampleShape`. It is the PII-containment
boundary (I-PII) and the retention-whitelist enforcement (I-
Retention) rolled into one function. Every byte of raw HTML is
consumed inside this function's scope; nothing raw escapes.

### 8.1 Function signature

```typescript
// workshop/substrate-study/application/shape-extractor.ts

import type { SampleShape } from '../domain/sample-shape';
import type { HarvestSourceKind } from '../domain/source';
import type { OSFingerprintVerdict } from '../domain/fingerprint';
import type { ScrubFailedError } from '../domain/harvest-error';

export interface StripToShapeInput {
  readonly bytes: Uint8Array;
  readonly contentType: string;       // must start with 'text/html' or 'application/xhtml+xml'
  readonly url: string;
  readonly source: HarvestSourceKind;
  readonly retrievedAt: string;
  readonly quarterTag: string;
  readonly fingerprintVerdict: OSFingerprintVerdict;
}

/** The only constructor of SampleShape. Takes raw HTML bytes +
 *  metadata; returns a scrubbed Shape with content-addressed
 *  fingerprint + audit-ready retention proof. Never persists the
 *  raw bytes; never returns anything that allows reconstruction of
 *  text content. */
export function stripToShape(
  input: StripToShapeInput,
): Result<SampleShape, ScrubFailedError>;

// Result = { ok: true, value: T } | { ok: false, error: E }
```

### 8.2 Pipeline (deterministic, left-to-right)

1. **Content-type guard**: if not `text/html` or `application/xhtml+xml`,
   return `ScrubFailed({ stage: 'pre-scrub', detail: 'unsupported content-type' })`.
   Keeps PDF / JSON / image bytes out.

2. **Size guard**: if `bytes.length > policy.maxShapeSizeKb * 1024 * 4`
   (4× is a generous raw-to-shape compression ratio heuristic),
   reject. Extremely large pages get truncated upstream or skipped.

3. **Parse**: invoke a trusted HTML5 parser (e.g., `parse5`) to
   produce a DOM tree. Parse errors → `ScrubFailed({ stage: 'strip',
   detail: parseErr })`.

4. **Walk the tree, emitting skeleton**:
   - For each element, emit a `DOMNode` with ONLY whitelisted
     attributes (§4.3) — every other attribute is dropped.
   - Retained ARIA attribute VALUES: only booleans (`true`/`false`
     for `aria-invalid`, etc.) and closed-enum values (`aria-live:
     polite|assertive|off`) survive. All other values (e.g.,
     `aria-label="Enter your SSN"`) are replaced with a presence-
     only boolean (`label: true`).
   - `class` attribute is tokenized, each token normalized via
     §10.6 (stem extraction), and only retained if it matches a
     framework-signature prefix (`osui-`, `ThemeGrid_`,
     `OSBlockWidget_`, etc.) OR a test-id-stem pattern. Customer-
     specific classes (e.g., `MyCompany_Widget_42`) are
     destroyed.
   - `data-*` attributes: only `data-testid` and `data-cy` are
     inspected; their values are normalized to stems; all other
     `data-*` attributes are destroyed.
   - Text content: stripped, character count retained for
     `RetentionProof.strippedTextChars`.
   - `<script>`, `<style>`, `<img>`, `<iframe>`, `<svg>`,
     `<object>`, `<embed>` elements: destroyed entirely; count
     retained for `RetentionProof.strippedElementCount`.
   - URLs in `href`, `src`, `action`, `formaction`: destroyed.
   - Inline event handlers (`onclick`, etc.): destroyed; name
     retained in `RetentionProof.strippedAttributes`.

5. **Build edges**: parent/child ordinals, per-parent stable
   (tree-walk order).

6. **Compute landmark ancestry**: for each node, the nearest
   ancestor with a landmark role (`main`, `navigation`, `form`,
   `dialog`, etc.) is cached as `landmarkRole` on the node.
   Enables per-node context at distillation time without
   re-walking the tree.

7. **Assemble `RetentionProof`**: sorted list of destroyed
   attribute names, character counts, element counts.

8. **Fingerprint**: `shapeFingerprint = hash(canonicalJson({
   source, originalUrl, retrievedAt, skeleton }))`. The same page
   fetched via the same source path at two different times
   produces two different fingerprints (different retrievedAt);
   the same source path fetched twice in the same run produces
   the same fingerprint → dedup at append time.

9. **Assemble envelope**: `SampleShape { stage: 'evidence', scope:
   'substrate-study', kind: 'sample-shape', payload: { ... },
   fingerprints: { artifact: shapeFingerprint, content:
   contentHashOf(skeleton) }, lineage: { sources:
   [sourceKey(source)], parents: [], handshakes: ['evidence'] },
   governance: 'approved' }`.

10. **Return** `{ ok: true, value: shape }`. Raw bytes are out of
    scope at this point and garbage-collected with the function
    frame.

### 8.3 What specifically gets destroyed — explicit catalog

A law test feeds this list as a "malicious input audit":

| Destroyed | Example |
|---|---|
| Text content (CDATA, text nodes) | `<p>Enter your SSN here</p>` → `<p>` |
| Inline scripts | `<script>...</script>` |
| Style blocks + inline styles | `<style>`, `style="color: red"` |
| Images | `<img src="...">` |
| URLs | `href="..."`, `src="..."`, `action="..."` |
| Non-whitelisted attributes | `onclick`, `title`, `alt`, `placeholder`, `value`, `draggable` |
| Custom data-* | everything except `data-testid`, `data-cy` |
| Comments | `<!-- operator wrote this -->` |
| Iframes, embeds, objects, audio/video | entire element destroyed |
| Form values | `<input value="...">` — value attr destroyed |
| ARIA-label values (string) | `aria-label="Enter SSN"` → presence-only boolean |

### 8.4 Audit harness

`tests/substrate-study/malicious-input/` fixtures deliberately
contain:

- Form fields with prefilled PII-looking values.
- ARIA-label values containing long identifiable strings.
- Inline scripts with secrets.
- Large comment blocks with operator-authored notes.
- Embedded iframes with sensitive-looking source URLs.
- `data-*` attributes with customer-specific tokens.

The law: running `stripToShape` on each fixture produces a Shape
in which NONE of the sensitive content remains (confirmed by
substring-not-in assertion). The `RetentionProof` accurately
describes what was stripped.

### 8.5 Non-functional concerns

- **Memory**: `stripToShape` must handle HTML up to ~2MB. A
  well-tuned parser + single-pass tree walk keeps this O(n).
- **No streaming**: the scrubber requires whole-page parse to
  compute landmark ancestry. Streaming partial shape emission is
  possible but unnecessary — max 64KB of Shape per 2MB of HTML
  means we can hold everything in memory.
- **Failure modes are explicit**: parse errors → `ScrubFailed`
  tagged; caller's responsibility to log + skip. The pipeline
  never succeeds with partial scrubbing.

### 8.6 "Can I get the text back?" — no

After `stripToShape`, the output contains:
- Element tag names (public schema).
- ARIA attribute presence booleans.
- Normalized class-stems (framework tokens, not customer text).
- Landmark role strings (standardized vocabulary).
- Structural ordinals.

There is **no** retained attribute value that carries arbitrary
customer text. There is no text content. URLs are destroyed. The
worst-case reconstruction is "there was a button with
`osui-button--primary` class inside a form" — which is not
reconstruction of the original page.

## 9. Attribute Signature Normalization

The heart of the distillation. Turns a per-node bag of retained
attributes into a canonical, order-stable, whitespace-normalized,
identifier-stripped `AttributeSignature`. Two nodes produce the
same signature iff their normalized forms are byte-equal — this
is the equivalence relation the aggregator counts over.

Without normalization, the signature space is sparse (every
numeric id or UUID becomes its own signature) and the
distillation carries no signal. Normalization does the
disambiguation work.

### 9.1 The normalization function

```typescript
// workshop/substrate-study/domain/signature-normalization.ts

import type { DOMNode } from './shape';
import type { AttributeSignature } from './signature';
import { signatureToken } from './ids';

export function normalizeSignature(
  node: DOMNode,
  context: AttributeSignature['nodeContext'],
): AttributeSignature {
  const tokens: string[] = [];

  // 1. Tag name.
  tokens.push(`tag=${node.tagName.toLowerCase()}`);

  // 2. Role (if present).
  if (node.role !== null) {
    tokens.push(`role=${node.role.toLowerCase()}`);
  }

  // 3. Type attribute (for <input>).
  if (node.typeAttribute !== null) {
    tokens.push(`type=${node.typeAttribute.toLowerCase()}`);
  }

  // 4. Each class-prefix-stem (sorted).
  const stems = [...node.classPrefixStems].sort();
  for (const stem of stems) {
    tokens.push(`class-stem=${stem}`);
  }

  // 5. Each test-id-stem (sorted).
  const testIds = [...node.testIdStems].sort();
  for (const tid of testIds) {
    tokens.push(`data-testid-stem=${tid}`);
  }

  // 6. ARIA presence (sorted by key name).
  if (node.ariaAttributes.label)        tokens.push('aria-label');
  if (node.ariaAttributes.labelledBy)   tokens.push('aria-labelledby');
  if (node.ariaAttributes.describedBy)  tokens.push('aria-describedby');

  // 7. ARIA booleans (only emit when non-null + true).
  if (node.ariaAttributes.invalid === true)  tokens.push('aria-invalid=true');
  if (node.ariaAttributes.expanded === true) tokens.push('aria-expanded=true');
  if (node.ariaAttributes.required === true) tokens.push('aria-required=true');

  // 8. ARIA live enum.
  if (node.ariaAttributes.live !== null) {
    tokens.push(`aria-live=${node.ariaAttributes.live}`);
  }

  // Tokens are already in deterministic order by construction:
  //   tag → role → type → class-stems (sorted) → data-testid-stems
  //   (sorted) → aria-presence → aria-booleans → aria-live.

  const canonicalForm = tokens.join('|');

  return {
    tokens: tokens.map(signatureToken),
    canonicalForm,
    nodeContext: context,
  };
}
```

### 9.2 Class prefix stem extraction (`§10.6` in the plan outline — lands here)

```typescript
// Destructive, deterministic class → stem reduction.
// Examples:
//   'osui-button--primary'               → 'osui-button--primary'
//   'osui-button--primary-widget_12345'  → 'osui-button--primary-widget'
//   'ThemeGrid_Container_Row_7'          → 'ThemeGrid_Container_Row'
//   'MyCompany_Widget_42'                → null  (non-framework, discarded)
//   'osui-button'                        → 'osui-button'

const FRAMEWORK_CLASS_PREFIXES = ['osui-', 'ThemeGrid_', 'OSBlockWidget_', 'OSPortal_'];

// Strip trailing numeric or hash-like suffixes (after the last
// separator). Preserves the semantic stem.
const TRAILING_ID_RE = /([_-])(\d{1,12}|[0-9a-f]{6,32})$/;

export function extractClassStem(rawClass: string): string | null {
  const cls = rawClass.trim();
  if (!FRAMEWORK_CLASS_PREFIXES.some((p) => cls.startsWith(p))) {
    return null; // not a framework class; destroy it
  }

  // Strip trailing numeric/hex id up to twice (for patterns like
  // 'Foo_Bar_42_abc123'). Don't strip if stripping would eliminate
  // the whole name.
  let stem = cls;
  for (let i = 0; i < 2; i += 1) {
    const next = stem.replace(TRAILING_ID_RE, '');
    if (next === stem || next.length === 0) break;
    stem = next;
  }

  return stem;
}
```

### 9.3 Test-id stem extraction

```typescript
// 'btn-submit-form'          → 'btn-submit-form'
// 'btn-submit-form-42'       → 'btn-submit-form-'
// 'save-row-uuid-abc123'     → 'save-row-uuid-'
// 'submit-button'            → 'submit-button'
// 'user_12345_action'        → 'user_-action'   — BUT this often
//                              collapses too aggressively; the
//                              alternate rule below applies.

// We treat test-ids as dash/underscore-separated words. Replace
// any segment that's purely numeric or hex-id-looking with the
// empty-before-separator token (preserving separator structure).

export function extractTestIdStem(rawId: string): string {
  const segments = rawId.split(/([-_])/);  // preserve separators
  const normalized = segments.map((seg, i) => {
    const isSep = i % 2 === 1;
    if (isSep) return seg;
    if (/^\d+$/.test(seg) || /^[0-9a-f]{6,}$/i.test(seg)) return '';
    return seg;
  });
  return normalized.join('');
}
```

### 9.4 ARIA value handling (presence vs enum vs boolean)

Choice: per-attribute per §4.5's `AriaAttributeBag`.

- `aria-label`, `aria-labelledby`, `aria-describedby` → **presence
  boolean**. Values can contain arbitrary text including PII.
- `aria-invalid`, `aria-expanded`, `aria-required` → **boolean**.
  Values are closed-enum true/false.
- `aria-live` → **enum**. Closed values: `off`, `polite`,
  `assertive`, `null`. Retained.

This split is the privacy-vs-signal trade-off: labels carry
identifiable text, so presence-only; booleans are safe.

### 9.5 Node context

`AttributeSignature.nodeContext` records the nearest enclosing
landmark the node lives inside:

- `root` — no landmark ancestor.
- `inside-form` — ancestor has `role=form` or `<form>`.
- `inside-nav` — ancestor has `role=navigation` or `<nav>`.
- `inside-dialog` — ancestor has `role=dialog` or `alertdialog`.
- `inside-main` — ancestor has `role=main` or `<main>`.

Two same-signature nodes in different landmarks are counted
separately — the context changes the meaning of "a role=button
with class osui-button--primary inside the form landmark" vs
"inside the dialog landmark."

### 9.6 Determinism contract

- Token generation order is fixed (§9.1 steps 1–8).
- Alphabetical ordering of class-stems + test-id-stems is
  deterministic.
- The `canonicalForm` string is stable across runs / platforms /
  Node versions.
- A law `laws/signature-determinism` serializes ~20 DOMNode
  examples and asserts the normalized signatures are byte-equal
  across two independent invocations + across JSON-round-trip.

### 9.7 What NOT to normalize

**Tag names**: we do NOT collapse `button` and `div[role="button"]`
into one signature even though both render as buttons. The
`role=` vs structural-tag distinction is load-bearing for accessibility
matchers — conflating would hide real signal.

**Role name**: we do NOT normalize `role=Button` to `role=button`
on the HTML side — but HTML is case-insensitive for role values,
so lowercase is canonical.

**Landmark ancestry**: we do NOT flatten nested landmarks
(e.g., form-inside-dialog becomes `inside-dialog`). The nearest
landmark wins; that's the signal that matters for matcher
authoring.

## 10. Aggregation and Distillation

The step that turns a corpus of samples into per-kind frequency
tables. Pure, deterministic, re-runnable.

### 10.1 Per-kind node selectors

Each `PatternKind` comes with a predicate over `(DOMNode, context)`
deciding whether the node is a candidate for this kind's
distribution. This is how we partition a page's nodes across kinds.

```typescript
// workshop/substrate-study/domain/kind-selectors.ts

import type { DOMNode } from './shape';
import type { AttributeSignature } from './signature';
import type { PatternKind } from './pattern-kind';

export type KindSelector = (
  node: DOMNode,
  context: AttributeSignature['nodeContext'],
  shape: { readonly skeleton: DOMSkeleton },
) => boolean;

export const KIND_SELECTORS: ReadonlyMap<PatternKind, KindSelector> = new Map([
  ['submit-button', (node, ctx) =>
    node.role === 'button' &&
    ctx === 'inside-form' &&
    node.classPrefixStems.some((s) => s.includes('primary') || s.includes('submit'))
  ],
  ['nav-link', (node, ctx) =>
    node.role === 'link' && ctx === 'inside-nav'
  ],
  ['field-input', (node, ctx) =>
    (node.role === 'textbox' || (node.tagName === 'input' && node.typeAttribute !== 'submit'))
      && (ctx === 'inside-form' || ctx === 'root')
  ],
  ['validation-error', (node, _ctx) =>
    node.ariaAttributes.live !== null ||
    (node.role === 'alert') ||
    (node.ariaAttributes.describedBy && node.ariaAttributes.invalid === true)
  ],
  ['modal-dialog', (node, _ctx, shape) =>
    // Node is the root of a dialog landmark.
    node.landmarkRole === 'dialog' || node.landmarkRole === 'alertdialog'
  ],
  ['sortable-table', (node, _ctx) =>
    node.role === 'columnheader' ||
    (node.role === 'button' && node.classPrefixStems.some((s) => s.includes('sort')))
  ],
  ['file-upload', (node, _ctx) =>
    node.tagName === 'input' && node.typeAttribute === 'file'
  ],
  ['status-or-alert', (node, _ctx) =>
    node.role === 'status' || node.role === 'alert'
  ],
  ['multi-select-picker', (node, _ctx) =>
    node.role === 'listbox' ||
    node.classPrefixStems.some((s) => s.includes('multiselect'))
  ],
  ['wizard-step', (node, _ctx) =>
    node.role === 'progressbar' ||
    node.classPrefixStems.some((s) => s.includes('wizard'))
  ],
  ['date-picker', (node, _ctx) =>
    (node.tagName === 'input' && node.typeAttribute === 'date') ||
    node.classPrefixStems.some((s) => s.includes('date-picker') || s.includes('datepicker'))
  ],
]);
```

### 10.2 The per-kind aggregator

Pure function over `SampleShape[]` and a `PatternKind`:

```typescript
// workshop/substrate-study/domain/aggregator.ts

import type { SampleShape } from './sample-shape';
import type { Distribution, SignatureFrequency } from './distribution';
import type { PatternKind } from './pattern-kind';
import { normalizeSignature } from './signature-normalization';
import { signatureKey } from './signature';
import { KIND_SELECTORS } from './kind-selectors';

export function aggregateDistribution(
  samples: readonly SampleShape[],
  patternKind: PatternKind,
  quarterTag: string,
): Distribution {
  const selector = KIND_SELECTORS.get(patternKind);
  if (!selector) throw new Error(`no selector for ${patternKind}`);

  // signature-key → { signature, contributing sample-ids (set), count }
  const bucket = new Map<string, {
    signature: AttributeSignature;
    sampleIds: Set<SampleId>;
    count: number;
  }>();

  for (const sample of samples) {
    const { skeleton } = sample.payload;

    // Compute node-to-context mapping (O(n) walk).
    const contextByNodeId = computeLandmarkContexts(skeleton);

    // Iterate nodes; for each matching node, add to bucket.
    // A sample can contribute multiple nodes to the same kind (e.g.,
    // two submit buttons); we count PER-NODE, not per-sample.
    for (const node of skeleton.nodes) {
      const ctx = contextByNodeId.get(node.id) ?? 'root';
      if (!selector(node, ctx, { skeleton })) continue;

      const signature = normalizeSignature(node, ctx);
      const key = signatureKey(signature);
      const existing = bucket.get(key);
      if (existing) {
        existing.count += 1;
        existing.sampleIds.add(sample.payload.sampleId);
      } else {
        bucket.set(key, {
          signature,
          sampleIds: new Set([sample.payload.sampleId]),
          count: 1,
        });
      }
    }
  }

  // Deterministic sort: count DESC, then signature-canonical ASC.
  const frequencies: SignatureFrequency[] = [...bucket.values()]
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return a.signature.canonicalForm.localeCompare(b.signature.canonicalForm);
    })
    .map((entry) => ({
      signature: entry.signature,
      count: entry.count,
      sampleIdsSample: [...entry.sampleIds].sort().slice(0, 10),
    }));

  const distribution: Distribution = {
    version: 1,
    stage: 'evidence',
    scope: 'substrate-study',
    kind: 'distribution',
    ids: {},
    fingerprints: {
      artifact: distributionFingerprintOf(/* ... */) as Fingerprint<'artifact'>,
    },
    lineage: { sources: samples.map((s) => s.payload.sampleId), parents: [], handshakes: ['evidence'] },
    governance: 'approved',
    payload: {
      distributionId: distributionId(generateUlid()),
      patternKind,
      quarterTag,
      totalSamples: samples.length,
      frequencies,
      sourceCorpusFingerprint: corpusFingerprintOf(samples),
      distributionFingerprint: distributionFingerprintOf({ kind: patternKind, frequencies, quarterTag }),
    },
  };

  return distribution;
}
```

### 10.3 "Sample" vs. "node" counts

Important disambiguation:

- **Sample count** — number of pages in the corpus. Denominator
  for support ratio in proposals.
- **Node count** — number of DOM nodes matching a given signature
  across all samples. What the aggregator sums.

When we report "form submit button signature X occurs in 73% of
samples," we mean: of the N samples, some subset S have at least
one node with that signature; |S|/N = 0.73. The `count` field
in `SignatureFrequency` is the per-node count; `supportRatio` is
computed separately from the per-sample-count.

Wait — more precisely, we need TWO counts to be useful:

- `count`: total nodes with this signature (primary — tells us
  how common the DOM pattern is overall).
- `distinctSampleCount`: number of samples exhibiting at least
  one such node (secondary — tells us how broadly the pattern
  appears).

Both should land on `SignatureFrequency`. I'll add the second
field:

```typescript
export interface SignatureFrequency {
  readonly signature: AttributeSignature;
  readonly count: number;                 // total nodes
  readonly distinctSampleCount: number;   // samples exhibiting ≥1
  readonly sampleIdsSample: readonly SampleId[];
}
```

`supportRatio = distinctSampleCount / totalSamples` for proposal
scoring.

### 10.4 Insufficient sample guard

If `samples.length < options.minSamplesPerKind` (default 20),
`aggregateDistribution` returns `Left(InsufficientSamples)` —
we refuse to emit a distribution over too few samples. Arbitrary
floor; tune per quarter based on how much data we actually have.

### 10.5 Long-tail management

`frequencies` is sorted by count; an optional cap
`maxFrequenciesRetained` (default 200) truncates the long tail.
Tail signatures each appearing in one sample are not useful for
proposing matchers. The truncated-tail count is recorded on the
distribution as `longTailSignaturesOmitted`.

### 10.6 Example

Input: 100 samples of OutSystems apps; patternKind =
'submit-button'; context = inside-form.

Top of output (hypothetical, illustrative):

| # | Signature | count | distinctSamples | support |
|---|---|---|---|---|
| 1 | `tag=button\|role=button\|class-stem=osui-button\|class-stem=osui-button--primary` | 287 | 83 | 0.83 |
| 2 | `tag=button\|role=button\|class-stem=osui-button` | 134 | 54 | 0.54 |
| 3 | `tag=input\|type=submit\|class-stem=ThemeGrid_Button_Primary` | 91 | 27 | 0.27 |
| 4 | `tag=button\|role=button\|data-testid-stem=submit-` | 44 | 18 | 0.18 |
| 5 | `tag=button\|role=button\|class-stem=osui-button\|class-stem=osui-button--large` | 22 | 9 | 0.09 |

This is the artifact an operator + the matcher-proposal pipeline
looks at. Rows 1–2 are clear Layer-2 matcher candidates (high
support across samples). Rows 3–5 are "customer-specific
variants we'd only propose if the floor is lower."

## 11. Matcher Proposal Pipeline

Converts distillation outputs into `MatcherProposal` envelopes that
flow through the existing trust-policy gate.

### 11.1 The proposal decision

For each `Distribution`, walk the sorted frequencies. For each
`SignatureFrequency`:

1. Compute `supportRatio = distinctSampleCount / totalSamples`.
2. If `supportRatio < floor` → skip (too weak).
3. If the signature is in `knownCoveredSignatures` → skip (already
   handled by an existing matcher).
4. Otherwise → propose, with `recommendationScore` computed per
   §11.3.

Stop after `maxProposalsPerKind` proposals emitted per kind.

### 11.2 `knownCoveredSignatures` extraction

Today's matchers in `product/domain/resolution/patterns/matchers/`
encode their match logic in TypeScript. To know whether a
signature is "already covered" we need to extract a representation
from each matcher.

Two options:

- **Manual annotation**: each matcher exports a
  `coveredSignaturePatterns: readonly AttributeSignaturePattern[]`
  constant. The proposer reads these. Simple; operators maintain
  the annotations as part of matcher authoring.
- **Static analysis**: parse matcher source and infer patterns.
  Error-prone; skip.

**Z11f ships the manual annotation approach.** Each existing
matcher gains a static export; new matchers include it by
convention.

```typescript
// product/domain/resolution/patterns/matchers/role-and-name-exact.ts
import type { AttributeSignaturePattern } from '../../../../workshop/substrate-study/domain/signature-pattern';

export const roleAndNameExactMatcher: Matcher = (ctx) => { ... };
export const coveredSignaturePatterns: readonly AttributeSignaturePattern[] = [
  // Matches ANY role + exact name; doesn't bind to specific class-stems.
  { role: 'any', requiresExactName: true, classStemAtLeast: [] },
];
```

The extractor is a tiny pure domain function:
`isSignatureCovered(signature, patterns): boolean`.

### 11.3 Score computation (`scoreProposal`)

```typescript
// workshop/substrate-study/domain/score-proposal.ts

import type { PatternKind } from './pattern-kind';
import type { SignatureFrequency } from './distribution';

/** Pure deterministic score. Higher is stronger recommendation. */
export function scoreProposal(
  frequency: SignatureFrequency,
  totalSamples: number,
  patternKind: PatternKind,
): number {
  const supportRatio = frequency.distinctSampleCount / totalSamples;
  // Prefer broad support + high absolute count + tightly-scoped
  // signatures (more specific → higher signal).
  const tokenCountBonus = Math.min(frequency.signature.tokens.length / 10, 0.3);
  const contextBonus = frequency.signature.nodeContext === 'root' ? 0 : 0.15;
  const base = supportRatio;   // [0, 1]

  return base + tokenCountBonus + contextBonus;
}
```

Scores are unitless, monotone; used only for intra-distribution
ranking. Not a confidence; operators read the underlying
supportRatio and read the score as a sort key.

### 11.4 Matcher skeleton generation

Each proposal carries a `proposedMatcherSkeleton: string` — a
TypeScript-ish template the operator refines into the final
matcher. Produced deterministically from the signature:

```typescript
// workshop/substrate-study/domain/matcher-skeleton.ts

import type { AttributeSignature } from './signature';
import type { PatternKind } from './pattern-kind';

export function proposedMatcherSkeleton(
  kind: PatternKind,
  signature: AttributeSignature,
  matcherName: string,
): string {
  // Produces:
  //
  // import { Option } from 'effect';
  // import type { Matcher, MatcherResult } from '../rung-kernel';
  // import { matcherId } from '../rung-kernel';
  //
  // const MATCHER_ID = matcherId('<matcherName>');
  //
  // export const <camelCaseName>Matcher: Matcher = (ctx) => {
  //   // <kind> signature: <canonicalForm>
  //   // contextHint: <nodeContext>
  //   if (ctx.intent.verb !== '<inferred verb from kind>') return Option.none();
  //
  //   const candidates = ctx.surfaceIndex
  //     .findByRole('<role from signature>')
  //     .filter((s) =>
  //       <classStem filters, if any>
  //     );
  //   if (candidates.length !== 1) return Option.none();
  //
  //   return Option.some<MatcherResult>({
  //     targetSurfaceId: candidates[0]!.surfaceId,
  //     matcherId: MATCHER_ID,
  //     rationale: 'distilled signature <canonicalForm> — refine before merging',
  //   });
  // };
  //
  // The operator reviews, adjusts, and files a PR. The trust-policy
  // gate enforces that no auto-generated matcher merges without
  // human review.

  return `... generated skeleton ...`;
}
```

The skeleton is intentionally incomplete — operators must (a)
choose the right `role` filter, (b) decide whether class-stem
filters should be intersection or union, (c) add a guard for
context, (d) add a rationale that references the source
distribution. The skeleton provides structure, not finality.

### 11.5 Integration with the existing trust-policy gate

`MatcherProposal` extends `WorkflowMetadata<'proposal'>`. The
existing proposal-bundle machinery under
`product/domain/proposal/` consumes proposals from any scope; the
substrate-study scope is additive.

The trust-policy YAML at `workshop/policy/trust-policy.yaml` gets
a new entry:

```yaml
proposalKinds:
  - kind: substrate-matcher-proposal
    minSupportRatio: 0.4              # below which gate rejects
    minRecommendationScore: 0.5
    requiresOperatorReview: true      # always; never auto-merge
    requiresCiGreen: true             # the skeleton → merged matcher's
                                      # laws must pass + type-check
```

These thresholds are tunable per quarter; loosening requires a
policy-PR same as any other threshold change.

### 11.6 Approval workflow (human-in-the-loop)

1. Operator runs `tesseract substrate-study propose
   --quarter 2026-Q2 --floor 0.3`.
2. Proposals land as JSON envelopes at
   `workshop/substrate-study/logs/proposals/2026-Q2/`.
3. Operator reviews each; picks highest-scored; opens a PR that:
   - Creates the matcher `.ts` file (refining the skeleton).
   - Adds the matcher to the appropriate pattern's `matchers[]`
     array in the pattern file.
   - Adds laws exercising the new matcher.
   - Cites the proposal envelope in the PR description for
     provenance.
4. CI runs the existing seam laws + new matcher laws; trust-
   policy gate confirms the proposal's thresholds were met at
   time of proposal-emit; reviewers approve; merge.
5. The proposal envelope gets annotated (by a downstream
   workflow step in the trust-policy gate, not by the workshop
   directly) with its merged-matcher reference.

### 11.7 Promotion path to the runtime registry

A merged matcher is live in `DEFAULT_PATTERN_REGISTRY` the moment
the next deployment goes out. The `coveredSignaturePatterns`
export prevents re-proposing the same signature in future runs.

### 11.8 Rejection / non-action path

Proposals below thresholds OR against already-covered signatures
are NOT appended to the MatcherProposalStore. The CLI reports
their counts in `ProposeMatchersReport` so operators can see
what WOULD have been proposed at a lower floor — useful for
tuning.

### 11.9 Per-quarter proposal turnover

The aim is not to propose dozens of matchers per quarter. A
typical quarter should emit 3–10 high-value proposals. If a
quarter emits 50+, the floor is too low and most proposals will
reject at review.

Healthy steady-state: 1–3 Layer-2 matchers added per quarter;
the rest of the time distillations show stability (no new
signatures reach the floor that weren't already covered).
Stability is a feature — it means OutSystems conventions are
well-characterized and our Layer 2 is adequate.

## 12. Directory Layout

```
workshop/substrate-study/
  domain/                                          — pure types + folds
    ids.ts
    source.ts
    fingerprint.ts                                  — OSSignal, OSFingerprintVerdict
    shape.ts                                        — DOMNode, DOMEdge, DOMSkeleton, RetentionProof, AriaAttributeBag
    sample-shape.ts                                 — SampleShape envelope
    pattern-kind.ts
    signature.ts
    signature-normalization.ts                      — normalizeSignature + stem extractors
    signature-pattern.ts                            — AttributeSignaturePattern (for coverage checks)
    kind-selectors.ts                               — per-PatternKind predicates
    aggregator.ts                                   — aggregateDistribution (pure)
    distribution.ts                                 — Distribution envelope
    matcher-proposal.ts                             — MatcherProposal envelope
    matcher-skeleton.ts                             — proposedMatcherSkeleton generator
    score-proposal.ts                               — scoreProposal (pure)
    harvest-error.ts                                — tagged union + foldHarvestError
    retained-attribute.ts                           — closed union of retained attrs
    fingerprints.ts                                 — canonicalJson + fingerprint helpers

  application/                                     — Effect programs
    ports.ts                                        — HarvestSource, SampleStore, DistillationStore, MatcherProposalStore
    fingerprint-classifier.ts                       — classifyOutSystems (pure-ish — no IO)
    shape-extractor.ts                              — stripToShape
    scraping-policy-loader.ts                       — YAML parse + validation
    covered-signatures-extractor.ts                 — reads matchers' coveredSignaturePatterns
    harvest-corpus.ts                               — top-level harvest program
    distill-corpus.ts                               — top-level distill program
    propose-matchers.ts                             — top-level propose program

  harness/                                         — adapter implementations
    common-crawl-source.ts                          — fetches from CC index + WARC
    wayback-source.ts                               — fetches from web.archive.org
    showcase-source.ts                              — reads seed URLs; polite fetch
    fixture-source.ts                               — reads tests/substrate-study/fixtures/
    compose-harvest-sources.ts                      — multi-source dispatch
    filesystem-sample-store.ts                      — append-only JSON dir
    filesystem-distillation-store.ts                — append-only JSON dir
    filesystem-proposal-store.ts                    — append-only JSON dir
    html-parser.ts                                  — parse5 wrapper
    scraping-policy-yaml.ts                         — yaml library wrapper

  composition/                                     — Layer roots
    live-services.ts                                — liveSubstrateStudyLayer
    in-memory-services.ts                           — inMemorySubstrateStudyLayer (test)

  cli/                                             — workshop-lane CLI commands
    substrate-study-harvest.ts
    substrate-study-distill.ts
    substrate-study-propose.ts
    substrate-study-report.ts

  policy/                                          — operator-authored declarations
    scraping-policy.yaml
    showcase-seeds.yaml
    wayback-seeds.yaml
    history/                                        — per-quarter seed archives
      2026-Q2-wayback-seeds.yaml
      ...

  logs/                                            — runtime artifacts (gitignored)
    corpus-manifests/
      <quarter>/
        <ts>-<run-id>.manifest.json
    samples/
      <quarter>/
        <sample-id-prefix>/
          <sample-id>.shape.json
    distributions/
      <quarter>/
        <distribution-id>.distribution.json
    proposals/
      <quarter>/
        <proposal-id>.proposal.json

product/domain/resolution/patterns/matchers/
  outsystems-generic/                              — (NEW sub-directory, per-Z11f)
    <merged-matcher-*.ts>                          — proposals that have graduated to runtime
    README.md                                      — "merged-from-substrate-study proposals live here"

tests/substrate-study/
  fingerprint.laws.spec.ts
  shape-extractor.laws.spec.ts
  signature-normalization.laws.spec.ts
  aggregator.laws.spec.ts
  score-proposal.laws.spec.ts
  propose-matchers.laws.spec.ts
  harvest-corpus.integration.spec.ts              — against fixture source
  distill-corpus.integration.spec.ts
  end-to-end-idempotency.spec.ts
  fingerprint-fixtures/
    positive/
    probable/
    negative/
    false-positive-guards/
  malicious-input/                                  — PII-scrub audit fixtures
    prefilled-form.html
    aria-label-with-pii.html
    inline-script-with-secret.html
    ...
  fixtures/                                         — small realistic HTML samples
    minimal-login.html
    landmark-page.html
    paginated-grid.html
```

### 12.1 Folders not listed

No `product/` additions beyond the four registry tags (§5.1) and
the `outsystems-generic/` merged-matcher directory (created on
first merge, empty until then). The substrate-study lane is
100% workshop-side.

### 12.2 Seam map

| From → To | Allowed? | Reason |
|---|---|---|
| `workshop/substrate-study/` → `product/domain/kernel/*` | ✅ | kernel types (Brand, Fingerprint, WorkflowMetadata) are shared contract |
| `workshop/substrate-study/` → `product/domain/governance/*` | ✅ | envelope types + governance brand |
| `workshop/substrate-study/` → `product/domain/resolution/patterns/matchers/*` | ✅ (read-only, for coveredSignaturePatterns) | informs proposal filter |
| `workshop/substrate-study/` → `product/runtime/**` | ❌ | no runtime imports |
| `workshop/substrate-study/` → `product/application/**` | ❌ | no application imports |
| `product/**` → `workshop/substrate-study/**` | ❌ | seam laws enforce |

## 13. CLI Surface

Four new commands under `tesseract substrate-study *`. Registered
in `bin/cli-registry.ts` via the workshop-lane CLI split (already
established at step-4c.cli-split).

### 13.1 `tesseract substrate-study harvest`

Run a harvest against one or more sources.

```
Usage:
  tesseract substrate-study harvest [OPTIONS]

Options:
  --sources <list>         Comma-separated; any of: common-crawl, wayback, showcase, fixture, all
                           Default: showcase
  --max-samples <n>        Hard ceiling on samples per source. Default 500.
  --quarter <YYYY-Q[1-4]>  Label the samples with this quarter tag.
                           Default: computed from system clock.
  --seed-hostnames <list>  Additional hostname allowlist (for Wayback).
                           Subject to policy allowlist.
  --policy-file <path>     Override default policy path (tests only).
  --dry-run                Classify + count addressable samples; do not
                           fetch, scrub, or persist.

Outputs:
  workshop/substrate-study/logs/corpus-manifests/<quarter>/<ts>-<run-id>.manifest.json
  workshop/substrate-study/logs/samples/<quarter>/<...>.shape.json   (per sample)

Exit codes:
  0 — run succeeded; manifest written.
  1 — policy violation (fatal).
  2 — source unreachable (all retries exhausted); partial manifest written.
```

### 13.2 `tesseract substrate-study distill`

Run aggregation over samples in the store.

```
Usage:
  tesseract substrate-study distill [OPTIONS]

Options:
  --quarter <YYYY-Q[1-4]>  Distill samples tagged with this quarter.
                           Default: current quarter.
  --kinds <list>           Comma-separated; any of the 11 PatternKinds
                           or 'all'. Default: all.
  --min-samples <n>        Minimum samples required per kind before
                           emitting a distribution. Default 20.
  --max-frequencies <n>    Retain the top-N signatures per kind.
                           Default 200.

Outputs:
  workshop/substrate-study/logs/distributions/<quarter>/<distribution-id>.distribution.json

Exit codes:
  0 — all requested kinds produced a distribution (or were skipped as insufficient).
  1 — no samples found for the quarter.
```

### 13.3 `tesseract substrate-study propose`

Walk distributions and emit matcher proposals.

```
Usage:
  tesseract substrate-study propose [OPTIONS]

Options:
  --quarter <YYYY-Q[1-4]>  Propose from distributions in this quarter.
  --floor <0.0..1.0>       Support-ratio floor. Default 0.3.
  --max-per-kind <n>       Max proposals per pattern kind. Default 3.
  --kind <pattern-kind>    Restrict to one kind (useful for iteration).

Outputs:
  workshop/substrate-study/logs/proposals/<quarter>/<proposal-id>.proposal.json

Exit codes:
  0 — propose run completed; report emitted on stdout.
  1 — no distributions for the quarter; nothing to propose.
```

### 13.4 `tesseract substrate-study report`

Aggregate summary across the latest corpus state.

```
Usage:
  tesseract substrate-study report [OPTIONS]

Options:
  --quarter <YYYY-Q[1-4]>  Report on this quarter. Default: latest.
  --format <md|json>       Default: md.
  --include <list>         manifest,distributions,proposals,drift
                           Default: all.

Outputs (to stdout):
  Markdown or JSON report covering:
  - Corpus manifest (sources + counts + fingerprint verdict histogram).
  - Per-kind distributions (top-5 signatures with support ratios).
  - Proposal queue (ranked by recommendationScore).
  - Drift summary if prior quarter exists (§16).

Exit codes:
  0 — report written.
  1 — no data found for quarter.
```

### 13.5 CLI integration with existing workshop CLI

The four commands register at `workshop/cli/substrate-study-*.ts`
and slot into the merged registry at `bin/cli-registry.ts` under
the workshop-lane section (same pattern as
`compounding-scoreboard`, `compounding-hypothesize`, etc).

A fifth helper — `tesseract substrate-study init` — runs once
per repo to create empty policy files with safe defaults, write
the scraping-policy YAML skeleton, and echo the PR-review
checklist for legal sign-off.

## 14. Concrete On-Disk Artifacts

Every artifact is a JSON envelope. Schemas stabilize here.

### 14.1 `SampleShape` on disk

Path: `workshop/substrate-study/logs/samples/<quarter>/<sampleid-prefix>/<sampleId>.shape.json`

```json
{
  "version": 1,
  "stage": "evidence",
  "scope": "substrate-study",
  "kind": "sample-shape",
  "ids": {},
  "fingerprints": {
    "artifact": "sha256:a1b2...",
    "content": "sha256:c3d4..."
  },
  "lineage": {
    "sources": ["wayback:20260304123456:https://showcase.outsystems.com/login"],
    "parents": [],
    "handshakes": ["evidence"],
    "experimentIds": []
  },
  "governance": "approved",
  "payload": {
    "sampleId": "sid:2026-Q2:a1b2c3d4",
    "source": {
      "kind": "wayback",
      "archiveTimestamp": "20260304123456",
      "originalUrl": "https://showcase.outsystems.com/login"
    },
    "originalUrl": "https://showcase.outsystems.com/login",
    "retrievedAt": "2026-04-23T00:00:00.000Z",
    "quarterTag": "2026-Q2",
    "fingerprintVerdict": {
      "kind": "confirmed",
      "confidence": "high",
      "signals": [
        { "kind": "osui-class", "token": "osui-button" },
        { "kind": "osui-class", "token": "osui-form" },
        { "kind": "generator-meta", "token": "OutSystems Reactive Web" },
        { "kind": "bundle-name", "token": "OutSystemsApp" }
      ]
    },
    "skeleton": {
      "nodes": [
        {
          "id": "n0",
          "tagName": "main",
          "role": "main",
          "landmarkRole": "main",
          "classPrefixStems": ["osui-layout"],
          "testIdStems": [],
          "ariaAttributes": {
            "label": false, "labelledBy": false, "describedBy": false,
            "invalid": null, "expanded": null, "required": null, "live": null
          },
          "typeAttribute": null,
          "hasAccessibleName": false
        },
        {
          "id": "n1",
          "tagName": "form",
          "role": "form",
          "landmarkRole": "form",
          "classPrefixStems": ["osui-form"],
          "testIdStems": [],
          "ariaAttributes": { "label": true, "labelledBy": false, "describedBy": false, "invalid": null, "expanded": null, "required": null, "live": null },
          "typeAttribute": null,
          "hasAccessibleName": true
        },
        {
          "id": "n2",
          "tagName": "input",
          "role": "textbox",
          "landmarkRole": "form",
          "classPrefixStems": ["osui-input"],
          "testIdStems": ["identifier-"],
          "ariaAttributes": { "label": true, "labelledBy": false, "describedBy": false, "invalid": null, "expanded": null, "required": true, "live": null },
          "typeAttribute": "text",
          "hasAccessibleName": true
        },
        {
          "id": "n3",
          "tagName": "input",
          "role": "textbox",
          "landmarkRole": "form",
          "classPrefixStems": ["osui-input"],
          "testIdStems": ["password-"],
          "ariaAttributes": { "label": true, "labelledBy": false, "describedBy": false, "invalid": null, "expanded": null, "required": true, "live": null },
          "typeAttribute": "password",
          "hasAccessibleName": true
        },
        {
          "id": "n4",
          "tagName": "button",
          "role": "button",
          "landmarkRole": "form",
          "classPrefixStems": ["osui-button", "osui-button--primary"],
          "testIdStems": ["submit-"],
          "ariaAttributes": { "label": false, "labelledBy": false, "describedBy": false, "invalid": null, "expanded": null, "required": null, "live": null },
          "typeAttribute": "submit",
          "hasAccessibleName": true
        }
      ],
      "edges": [
        { "parent": "n0", "child": "n1", "ordinal": 0 },
        { "parent": "n1", "child": "n2", "ordinal": 0 },
        { "parent": "n1", "child": "n3", "ordinal": 1 },
        { "parent": "n1", "child": "n4", "ordinal": 2 }
      ]
    },
    "retention": {
      "strippedAttributes": ["href", "onclick", "placeholder", "src", "style", "title"],
      "strippedTextChars": 427,
      "strippedElementCount": 3
    },
    "shapeFingerprint": "sha256:a1b2..."
  }
}
```

### 14.2 `Distribution` on disk

Path: `workshop/substrate-study/logs/distributions/<quarter>/<distribution-id>.distribution.json`

```json
{
  "version": 1,
  "stage": "evidence",
  "scope": "substrate-study",
  "kind": "distribution",
  "ids": {},
  "fingerprints": {
    "artifact": "sha256:dist-01..."
  },
  "lineage": {
    "sources": ["sid:2026-Q2:a1b2c3d4", "sid:2026-Q2:e5f6a7b8", "..."],
    "parents": [],
    "handshakes": ["evidence"]
  },
  "governance": "approved",
  "payload": {
    "distributionId": "dist:2026-Q2:submit-button:01abc",
    "patternKind": "submit-button",
    "quarterTag": "2026-Q2",
    "totalSamples": 100,
    "frequencies": [
      {
        "signature": {
          "tokens": [
            "tag=button", "role=button",
            "class-stem=osui-button", "class-stem=osui-button--primary",
            "aria-label"
          ],
          "canonicalForm": "tag=button|role=button|class-stem=osui-button|class-stem=osui-button--primary|aria-label",
          "nodeContext": "inside-form"
        },
        "count": 287,
        "distinctSampleCount": 83,
        "sampleIdsSample": [
          "sid:2026-Q2:a1b2c3d4", "sid:2026-Q2:e5f6a7b8", "..."
        ]
      },
      {
        "signature": {
          "tokens": ["tag=button", "role=button", "class-stem=osui-button"],
          "canonicalForm": "tag=button|role=button|class-stem=osui-button",
          "nodeContext": "inside-form"
        },
        "count": 134,
        "distinctSampleCount": 54,
        "sampleIdsSample": ["..."]
      }
    ],
    "sourceCorpusFingerprint": "sha256:corpus...",
    "distributionFingerprint": "sha256:dist-01..."
  }
}
```

### 14.3 `MatcherProposal` on disk

Path: `workshop/substrate-study/logs/proposals/<quarter>/<proposal-id>.proposal.json`

```json
{
  "version": 1,
  "stage": "proposal",
  "scope": "substrate-study",
  "kind": "substrate-matcher-proposal",
  "ids": {},
  "fingerprints": {
    "artifact": "sha256:prop-01..."
  },
  "lineage": {
    "sources": ["dist:2026-Q2:submit-button:01abc"],
    "parents": ["sha256:dist-01..."],
    "handshakes": ["proposal"]
  },
  "governance": "review-required",
  "payload": {
    "proposalId": "prop:2026-Q2:submit-button:01abc",
    "patternKind": "submit-button",
    "signature": { "... as in distribution ..." },
    "supportCount": 287,
    "supportRatio": 0.83,
    "totalSamplesInDistribution": 100,
    "exampleSampleIds": ["sid:2026-Q2:a1b2c3d4", "..."],
    "sourceDistributionFingerprint": "sha256:dist-01...",
    "quarterTag": "2026-Q2",
    "proposedMatcherSkeleton": "import { Option } from 'effect';\nimport type { Matcher, MatcherResult } from '../rung-kernel';\nimport { matcherId } from '../rung-kernel';\n\nconst MATCHER_ID = matcherId('osui-button-primary-submit');\n\nexport const osuiButtonPrimarySubmitMatcher: Matcher = (ctx) => {\n  // submit-button signature: tag=button|role=button|class-stem=osui-button|class-stem=osui-button--primary|aria-label\n  // contextHint: inside-form\n  if (ctx.intent.verb !== 'click') return Option.none();\n  // TODO operator: confirm this guard narrows correctly; consider\n  //   combining with isSubmitLikeClick from form-submission.pattern.ts.\n  const candidates = ctx.surfaceIndex\n    .findByRole('button')\n    .filter((s) =>\n      s.classes.includes('osui-button') &&\n      s.classes.includes('osui-button--primary')\n    );\n  if (candidates.length !== 1) return Option.none();\n  return Option.some<MatcherResult>({\n    targetSurfaceId: candidates[0]!.surfaceId,\n    matcherId: MATCHER_ID,\n    rationale: 'osui-button--primary inside form (from substrate-study dist:2026-Q2:submit-button:01abc)',\n  });\n};",
    "recommendationScore": 1.13
  }
}
```

### 14.4 Corpus manifest on disk

Path: `workshop/substrate-study/logs/corpus-manifests/<quarter>/<ts>-<run-id>.manifest.json`

```json
{
  "version": 1,
  "runId": "run:2026-Q2:01abc",
  "quarterTag": "2026-Q2",
  "startedAt": "2026-04-23T00:00:00.000Z",
  "endedAt":   "2026-04-23T00:14:32.198Z",
  "policyFingerprint": "sha256:policy...",
  "classifierVersion": "2026-Q2-v1",
  "perSourceCounts": {
    "wayback":   { "addressable": 412, "fetched": 398, "rejectedByFingerprint": 203, "deduped": 14, "appended": 181, "errored": 0 },
    "showcase":  { "addressable": 72,  "fetched": 72,  "rejectedByFingerprint": 2,   "deduped": 0,  "appended": 70,  "errored": 0 },
    "common-crawl": { "addressable": 1532, "fetched": 1520, "rejectedByFingerprint": 1440, "deduped": 22, "appended": 58, "errored": 0 }
  },
  "errorsByTag": {
    "FetchFailed": 0,
    "RateLimited": 0,
    "ParseFailed": 0
  },
  "sampleIdsAppended": ["sid:...", "sid:...", "..."]
}
```

### 14.5 Policy file on disk (already shown §6.1)

Referenced here for completeness — the YAML shape in §6.1 is the
source of truth.

## 15. Versioning and Drift Detection

Every artifact carries a `quarterTag`. This enables three kinds
of comparisons across time.

### 15.1 Distribution drift (quarter-over-quarter)

`tesseract substrate-study report --include drift` compares the
current quarter's distributions against the immediately-prior
quarter's distributions, per pattern kind.

For each signature in the current quarter's distribution:

- **Stable**: prior quarter had same signature with similar
  support ratio (|Δ supportRatio| < 0.1). Report as stable.
- **Grew**: prior quarter had lower support. Possibly emerging
  pattern.
- **Shrank**: prior quarter had higher support. Possibly fading
  convention.
- **New**: signature not in prior quarter. Either novel or
  reclassified.
- **Disappeared**: present in prior quarter, absent in current.
  OutSystems UI may have evolved.

Drift is itself distributional — we don't flag individual
signatures as anomalies, we report the distribution-of-deltas.

### 15.2 Classifier drift

When the fingerprint classifier changes (signal weights, new
signal kind), the `classifierVersion` field on the corpus
manifest shifts. Drift reports warn when comparing across
classifier versions — the denominator isn't comparable.

Rule: if classifierVersion differs between compared quarters,
the drift report disables support-ratio comparison but still
reports signature set membership changes (which are invariant to
scoring weights).

### 15.3 Proposal drift

Proposals emitted two quarters apart for the same signature
should (a) score similarly, (b) point to the same pattern kind,
(c) carry the same covered-signature-pattern check result. If
any of these diverge, the aggregator has drifted. Drift law
asserts fingerprint-stability for a fixed-fixture corpus.

### 15.4 When to refresh

Policy cadence: quarterly. Operator-triggered; not scheduled. A
quarterly refresh is a manual decision — "is OutSystems enough
different that we need to re-harvest?" If the UI is stable, a
single refresh can span two quarters.

A reporting hook surfaces "last refresh was N quarters ago;
consider refreshing" when the latest `quarterTag` lags current
by more than two quarters.

## 16. Phasing (Landing Order)

Z11f lands as seven named sub-commits. Each is independently
reviewable, keeps the build + test suite green, and preserves
the existing seam discipline. Sequencing is deliberate: domain
types → pure derivations → adapters → composition → CLI →
corpus → verdict.

### 16.1 Z11f.0 — Pre-landing policy + legal review

**Deliverable**: draft `policy/scraping-policy.yaml`, brief legal
note in §6.5 extended with counsel-reviewed addendum, approval
checklist complete. **No code lands in Z11f.0.**

- PR body carries the checklist; approval requires explicit OK.
- Output: a commit to this plan doc adding a `legalReview.md`
  sibling file with dated sign-off.

### 16.2 Z11f.a — Domain types + folds + laws

**Deliverable**: every file under
`workshop/substrate-study/domain/`. Pure, zero Effect imports.

- Brands (SampleId, DistributionId, ProposalId, SignatureToken,
  CorpusRunId).
- Closed unions: HarvestSourceKind, OSFingerprintVerdict,
  PatternKind, HarvestError, DistillError, ProposeError.
- Folds: foldHarvestSource, foldOSFingerprintVerdict,
  foldHarvestError, foldDistillError, foldProposeError.
- Pure functions: normalizeSignature, extractClassStem,
  extractTestIdStem, aggregateDistribution, scoreProposal,
  proposedMatcherSkeleton.
- FingerprintTag + WorkflowScope registry additions
  (§5.1) land in this commit.

**Laws** (ZF1.*):

- ZF1.a — foldHarvestSource exhaustiveness.
- ZF1.b — foldOSFingerprintVerdict exhaustiveness.
- ZF1.c — normalizeSignature determinism (same input → same output, 2×).
- ZF1.d — normalizeSignature: equivalent-modulo-id DOMNodes produce same signature.
- ZF1.e — normalizeSignature: distinct semantic DOMNodes produce distinct signatures.
- ZF1.f — extractClassStem: framework classes retained; customer classes destroyed.
- ZF1.g — extractTestIdStem: numeric suffixes stripped to stem.
- ZF1.h — aggregateDistribution determinism (pure fixture → byte-equal output, 2×).
- ZF1.i — aggregateDistribution insufficient-samples guard.
- ZF1.j — aggregateDistribution sort stability.
- ZF1.k — scoreProposal monotonic in supportRatio.
- ZF1.l — proposedMatcherSkeleton deterministic on same signature.
- ZF1.m — foldHarvestError + foldDistillError + foldProposeError exhaustiveness.
- ZF1.n — Sample envelope round-trip (JSON serialize → parse → equal).
- ZF1.o — Distribution envelope round-trip.
- ZF1.p — MatcherProposal envelope round-trip.

### 16.3 Z11f.b — `stripToShape` + fingerprint classifier

**Deliverable**: `shape-extractor.ts` and
`fingerprint-classifier.ts` under `application/`, plus the parse5
wrapper under `harness/html-parser.ts`.

- `stripToShape(input) → Result<SampleShape, ScrubFailedError>`.
- `classifyOutSystems(html, headers) → OSFingerprintVerdict`.
- PII-audit fixtures under `tests/substrate-study/malicious-input/`.
- Fingerprint fixtures under `tests/substrate-study/fingerprint-fixtures/`.

**Laws** (ZF2.*):

- ZF2.a — stripToShape round-trip structural: parse → strip → serialize → parse yields same skeleton.
- ZF2.b — stripToShape PII scrubbing: every malicious-input fixture's sensitive content absent from output.
- ZF2.c — stripToShape RetentionProof: destroyed-attr list matches expected for each fixture.
- ZF2.d — stripToShape rejects non-HTML content-types.
- ZF2.e — stripToShape rejects over-size HTML.
- ZF2.f — classifyOutSystems: positive fixtures → Confirmed.
- ZF2.g — classifyOutSystems: probable fixtures → Probable.
- ZF2.h — classifyOutSystems: negative fixtures → Rejected.
- ZF2.i — classifyOutSystems: false-positive-guard fixtures → Rejected even with partial signals.
- ZF2.j — classifyOutSystems determinism on same input.
- ZF2.k — stripToShape output size bounded (≤ maxShapeSizeKb × 1.2).

### 16.4 Z11f.c — Ports + in-memory harness + scraping-policy loader

**Deliverable**: `application/ports.ts`,
`application/scraping-policy-loader.ts`,
`harness/fixture-source.ts`, and in-memory variants of the three
stores. Enough to exercise the full harvest → distill → propose
pipeline against filesystem fixtures, without ever touching the
network.

- HarvestSource, SampleStore, DistillationStore,
  MatcherProposalStore Context.Tag declarations.
- Scraping-policy loader + validation + fingerprint computation.
- FixtureHarvestSource adapter (reads from
  `tests/substrate-study/fixtures/`).
- In-memory stores for test usage.
- `inMemorySubstrateStudyLayer` composition root.

**Laws** (ZF3.*):

- ZF3.a — scraping-policy loader accepts well-formed YAML.
- ZF3.b — scraping-policy loader rejects non-whitelisted source kinds.
- ZF3.c — scraping-policy loader fingerprint determinism.
- ZF3.d — FixtureHarvestSource listAddressable iterates fixture dir.
- ZF3.e — FixtureHarvestSource fetchBytes returns file bytes + inferred content-type.
- ZF3.f — in-memory stores append + listAll round-trip.
- ZF3.g — in-memory stores idempotency on duplicate append.

### 16.5 Z11f.d — Top-level Effect programs

**Deliverable**: `harvestCorpus`, `distillCorpus`, `proposeMatchers`
as Effect programs, exercised end-to-end against the in-memory
harness.

- Reads a fixture corpus; classifies; scrubs; appends; aggregates;
  proposes. Fully closed loop on test substrate.

**Laws** (ZF4.*):

- ZF4.a — harvestCorpus end-to-end against fixture source produces a CorpusReport with expected counts.
- ZF4.b — harvestCorpus policy violation raises fatal error.
- ZF4.c — distillCorpus end-to-end over appended samples produces per-kind Distributions.
- ZF4.d — distillCorpus skips kinds with insufficient samples.
- ZF4.e — proposeMatchers end-to-end over distributions produces proposals.
- ZF4.f — proposeMatchers skips already-covered signatures.
- ZF4.g — proposeMatchers applies floor correctly.
- ZF4.h — Full pipeline idempotency: run twice, byte-equal artifacts.

### 16.6 Z11f.e — Real adapter implementations

**Deliverable**: `common-crawl-source.ts`, `wayback-source.ts`,
`showcase-source.ts`, plus filesystem store implementations. Live
HTTP clients with rate limiting, retry, and timeout. Integration
tests are opt-in (they hit real endpoints) and run in a CI lane
gated by explicit `RUN_SUBSTRATE_STUDY_LIVE=1`.

- Respects rate-limit config per-source.
- Respects allowlist checks at request time (I-Source).
- Filesystem adapters refuse overwrites (I-Append).

**Laws** (ZF5.*):

- ZF5.a — each adapter constructs with policy; refuses without.
- ZF5.b — rate-limit enforcement via token-bucket.
- ZF5.c — allowlist re-check at request-time fires PolicyViolationError on off-list request.
- ZF5.d — filesystem SampleStore refuses overwrite.
- ZF5.e — filesystem SampleStore content-address dedup on retry.

**Integration laws** (gated, opt-in):

- ZF5.live.a — Common Crawl: fetch one known WARC record; scrub; assert Shape.
- ZF5.live.b — Wayback: fetch one known snapshot; scrub; assert Shape.
- ZF5.live.c — Showcase: fetch one known page; scrub; assert Shape.

### 16.7 Z11f.f — CLI + composition + first real quarter

**Deliverable**: the four CLI commands wired through
`bin/cli-registry.ts`, the `liveSubstrateStudyLayer` composition
root, and the first real corpus run (2026-Q2, small — ~50
samples) against the checked-in showcase seeds.

- `tesseract substrate-study harvest --sources showcase --quarter 2026-Q2 --max-samples 50`
- `tesseract substrate-study distill --quarter 2026-Q2 --all`
- `tesseract substrate-study propose --quarter 2026-Q2 --floor 0.3`
- `tesseract substrate-study report --quarter 2026-Q2`

The artifacts produced by this first real run go into
`workshop/substrate-study/logs/` (gitignored) — but the summary
tables from `report` land in a verdict-style doc at
`workshop/observations/substrate-study-quarter-2026-Q2.md` so
the first distillation's findings are reviewable.

**Laws** (ZF6.*):

- ZF6.a — CLI parses flags, dispatches the right program.
- ZF6.b — CLI exit codes match §13.
- ZF6.c — CLI output format matches the `--format` flag.

### 16.8 Z11f.g — Verdict + proposal queue + backlog doc update

**Deliverable**: the first-quarter verdict at
`workshop/observations/substrate-study-quarter-2026-Q2.md`
(template mirrors verdict-10's honesty-rubric structure). The
proposal queue as a reviewable artifact. `docs/v2-synthetic-app-
surface-backlog.md` updated with priorities informed by actual
OutSystems-distribution data.

- Verdict includes: corpus size, per-kind distribution
  summaries, top proposals, operator notes, honesty-rubric
  placement (which epistemic rung does this corpus reach?),
  forward queue (which matchers will we refine next; which
  substrate gaps will we close first).
- Proposal-merge PRs (if any) reference the verdict and the
  source distribution + proposal envelope.

**Laws** (ZF7.*):

- ZF7.a — verdict doc exists and is reachable from CLAUDE.md's
  "New-session orientation" if the quarter has a verdict.
- ZF7.b — each merged proposal's referenced distribution
  fingerprint resolves in the distribution store.

### 16.9 Sequencing diagram

```
Z11f.0 (policy review)
    ↓
Z11f.a (domain types + folds + laws)  ────────────────────┐
    ↓                                                      │
Z11f.b (stripToShape + classifier)  ─ parallel-eligible ──┤
    ↓                                                      │
Z11f.c (ports + in-memory harness + policy loader)  ──────┤
    ↓                                                      │
Z11f.d (Effect programs, end-to-end via in-mem)  ─────────┤
    ↓                                                      │
Z11f.e (real adapters — CC / Wayback / Showcase)          │
    ↓                                                      │
Z11f.f (CLI + composition + first real run)               │
    ↓                                                      │
Z11f.g (verdict + proposal queue + backlog update)  ──────┘
```

Z11f.a and Z11f.b can ship in parallel (no file overlap); the
rest must sequence because each depends on the prior.

### 16.10 Parallelization

Per `docs/v2-transmogrification.md §4.6` lighting-up matrix:

- Z11f.a can land as one PR; reviewers focus on type shape.
- Z11f.b parallelizable with Z11f.a (different directory).
- Z11f.c onward is linearized.
- Z11f.e's live integration tests run in an opt-in CI lane; the
  main lane never hits the network.

### 16.11 Total effort estimate

Honest: ~8–12 engineering days across Z11f.a–g. A similar-sized
commit trail to what the compounding engine's Z4–Z9 slices took.
Breakdown:

- Z11f.0: 2 days (policy drafting + legal review turnaround).
- Z11f.a: 1.5 days (~30 small files; ~15 laws).
- Z11f.b: 1 day (parser + classifier + fixtures).
- Z11f.c: 0.5 days (ports + loader + in-mem).
- Z11f.d: 1 day (Effect programs + laws).
- Z11f.e: 2 days (real adapters + rate-limiting + integration).
- Z11f.f: 1 day (CLI + composition + first run).
- Z11f.g: 1 day (verdict + proposal review + backlog update).

## 17. Risk Register

Each risk has a mitigation + the Z11f phase that addresses it.

### R1 — PII leakage through retention widening

**Risk**: future edits to `RetainedAttributeKind` quietly widen
the whitelist without audit; PII reaches disk.

**Mitigation**: Z11f.a law ZF1.b asserts the whitelist count is
exactly 13 (the initial list); any change requires updating the
law. A separate audit law runs stripToShape on a PII-loaded fixture
and asserts zero matches on a curated "PII probe set"
(emails, phone-number-like strings, long identifiers). Both
laws fire on CI; skipping them is a PR-blocking signal.

**Phase**: Z11f.a + Z11f.b.

### R2 — Live-fetch policy drift

**Risk**: someone adds a new `HarvestSource` variant without
updating the scraping-policy YAML; fails-open to unintended
fetches.

**Mitigation**: compose-time policy check (I-Source) refuses to
construct an adapter for a source-kind not in the policy. Law
ZF3.b asserts this. A separate seam test asserts exactly four
`HarvestSource` variants are exported.

**Phase**: Z11f.c.

### R3 — Fingerprint-classifier false-positives from non-OutSystems sites

**Risk**: the classifier labels a non-OS site as `Probable`,
polluting the corpus with non-target data.

**Mitigation**: false-positive guard fixtures (§7.4) + domain
heuristic (§7.3) + minimum-distinct-kinds rule. Quarterly
classifier-review is a manual operator step. If the classifier's
`Probable` hit-rate dominates `Confirmed`, that's signal that
the signal weights need tuning.

**Phase**: Z11f.b + quarterly review.

### R4 — Aggregator over-fits to one crawl's DOM

**Risk**: if we harvest heavily from one crawl's snapshot-date
(e.g., CC-MAIN-2026-14 alone), the distribution reflects OS
circa that week — not a general pattern.

**Mitigation**: policy caps `maxSamplesPerSource` and encourages
multi-source harvests. Manifest records per-source counts; a
distribution with >70% of samples from one source flags a
warning in the report. Operator judgment decides whether to
broaden the harvest.

**Phase**: Z11f.f (report diagnostics).

### R5 — Stem extraction collapses meaningful differences

**Risk**: `extractClassStem` strips suffixes too aggressively;
`osui-button--primary-42` and `osui-button--primary-43` collapse
correctly, but `osui-button--primary-large` might collapse to
`osui-button--primary-`.

**Mitigation**: stem regex `TRAILING_ID_RE` matches only digit
or hex tokens; alphabetic suffixes are preserved. Law ZF1.f
asserts a curated set of (raw → expected-stem) pairs; any change
to the regex breaks the law.

**Phase**: Z11f.a.

### R6 — Proposal flood

**Risk**: floor too low or corpus too large → thousands of
proposals; operator swamped.

**Mitigation**: `maxProposalsPerKind` defaults to 3. CLI report
surfaces "would-have-proposed counts" at lower floors so
operators see the scale before lowering. Post-merge rejection
rate metric tells us if `0.3` is too low for the current
corpus.

**Phase**: Z11f.d + operator judgment.

### R7 — Rate-limit violation against Common Crawl or Wayback

**Risk**: adapter misconfigured; exceeds documented rate; gets
IP-banned.

**Mitigation**: token-bucket rate limiter in each adapter;
policy specifies per-source ceilings; adapters retry on
RateLimited with exponential backoff (max 3 retries); on repeat
RateLimited, abort the run with a loud error. A monitor tool
could alert on consecutive RateLimited events across a run.

**Phase**: Z11f.e.

### R8 — Classifier + distillation version skew

**Risk**: a distillation computed with old classifier weights
gets compared against one computed with new weights; drift
report misreads signal-set changes as pattern-set changes.

**Mitigation**: `classifierVersion` on manifest; drift report
disables cross-version comparison; operator's explicit decision
to run a re-harvest after a classifier bump.

**Phase**: Z11f.g.

### R9 — PII scrub silently skips an attribute kind

**Risk**: a bug in `stripToShape` passes through an attribute
that should be destroyed (e.g., `onclick`); silent leakage.

**Mitigation**: `RetentionProof.strippedAttributes` records
what WAS destroyed; law ZF2.c asserts this list equals the
expected-destroyed list for each malicious-input fixture. A
mismatch fails the law; the leakage is visible.

**Phase**: Z11f.b.

### R10 — Matcher proposals reintroduce a pattern retired by the
operator

**Risk**: a previously-rejected proposal resurfaces next quarter
because the operator's rejection wasn't recorded; churn.

**Mitigation**: a `rejected-proposals.jsonl` log alongside the
proposals directory; operators append to it when dismissing a
proposal; the proposal pipeline suppresses signatures already
in the reject log. Z11f.f wires this.

**Phase**: Z11f.f.

## 18. Open Questions

These resolve at first real use; each has a safe default.

### Q1 — How do we tag customer-specific samples?

We don't. The harvest lane is explicitly non-customer-attributed;
the corpus is OutSystems-generic. If a future operator need for
per-customer distillation emerges (e.g., "distill the matchers
likely to work on this specific customer's app"), it's an epic
of its own — requires explicit customer consent and wholly
different source plumbing.

**Default**: customer-agnostic. Customer-specific never.

### Q2 — Should we collect multi-page samples (navigation flows)?

Sample today = one page. Multi-page flows (login → dashboard →
search result) carry richer pattern context. But single-page is
cheaper and sufficient for the 11 pattern kinds.

**Default**: single-page. Revisit if a future PatternKind
requires cross-page context (e.g., a navigation-flow-by-role
pattern).

### Q3 — Retain the original URL or not?

Currently yes — `SampleShape.payload.originalUrl`. Enables audit
("where did this sample come from?"). Doesn't leak PII (URLs are
public, in Wayback/Common Crawl).

**Default**: retain; revisit only if legal review says otherwise.

### Q4 — How long do we keep samples on disk?

Retention is a policy question. Default: keep all quarters
indefinitely (they're small; structural-sketch-only). If
storage becomes a concern, rotate out quarters older than 2
years.

**Default**: indefinite. Revisit at 500+ MB.

### Q5 — Should the distillation run auto-propose matchers?

No — the pipeline is intentionally three-step (harvest → distill
→ propose) so operators can review distributions before triggering
proposals. Auto-propose is a convenience risk; we err on the side
of explicit operator action.

**Default**: three-step, explicit; never auto-propose.

### Q6 — Should the substrate-study lane emit ReasoningReceipts?

No. The classifier + scrubber are deterministic. No LLM; no
ReasoningReceipt. If a future version of the classifier
consults `Reasoning.select` for ambiguous pages, that's a
dedicated addition with its own receipt emission.

**Default**: deterministic-only; no ReasoningReceipts emitted.

### Q7 — Cross-quarter proposal deduplication

If quarter-N and quarter-N+1 both exceed the floor for the same
signature, should N+1's proposal be emitted?

**Default**: yes, with a `supersedesProposal` reference to the
prior. Operator can close the chain at merge time.

### Q8 — Integration with the compounding engine

Should matcher proposals count as evidence in the compounding
engine's hypothesis ledger?

**Default**: no. Proposals are product-improvement artifacts,
not cohort evidence. The compounding engine's cohorts are
probe/scenario/customer-compilation; matcher proposals are
meta-evidence about the product's resolution capability, not
its downstream outcomes.

Revisit: when proposals start graduating into merged matchers at
rate > 0, we could correlate "proposed-at-quarter-N → active-
at-quarter-N+1 → compounding-scoreboard lift" as a product
efficacy signal. That's a future analysis, not Z11f work.

### Q9 — HTML parser choice

`parse5` is mature + deterministic + zero-native-deps. That's
the default. Alternatives (`htmlparser2`, `cheerio`) are less
strict about standards compliance, which could cause signature
drift.

**Default**: parse5. Revisit only on performance findings.

### Q10 — Sample-count ceiling per run

Policy caps at `maxSamples`. Higher count → more signal; more
fetch time; more storage. Default 500 per source; operator
override per run.

**Default**: 500.

### Q11 — Drift threshold for "grew" vs "stable"

§15.1 uses |Δ supportRatio| < 0.1 as "stable." Tight or loose?

**Default**: 0.1. Revisit after the first cross-quarter
comparison — if too many signatures flag as "grew"/"shrank"
on minor noise, tighten to 0.05.

## 19. Seam Discipline (Ratified)

Explicit statement of what crosses, what doesn't.

### 19.1 Allowed imports: workshop → product

- `product/domain/kernel/brand.ts` (Brand type).
- `product/domain/kernel/hash.ts` (Fingerprint, asFingerprint).
- `product/domain/governance/workflow-types.ts`
  (WorkflowMetadata, WorkflowEnvelope, governance brands, mint*).
- `product/domain/resolution/patterns/matchers/*/covered-signature-patterns.ts`
  **read-only** — the substrate-study extractor reads this
  constant from each matcher file via the static `import` path
  to populate `knownCoveredSignatures`.

### 19.2 Forbidden imports

- No imports from `product/runtime/` (no runtime state).
- No imports from `product/application/` (no orchestration code).
- No imports from `workshop/compounding/` (different analytical
  lane; sharing would couple them).
- No imports from `workshop/scenarios/` (ditto).

### 19.3 Allowed exports: workshop → product

- `MatcherProposal` envelopes flow out through the existing
  proposal-bundle machinery (not as TypeScript imports).
- The trust-policy gate (under `workshop/policy/`) reads
  substrate-study proposals as data, not as code.
- Merged matcher .ts files land under
  `product/domain/resolution/patterns/matchers/outsystems-generic/`
  via operator-reviewed PRs. These are pure product-side files;
  substrate-study is not their author, it's only their
  informant.

### 19.4 Seam law additions

The existing `seam-enforcement.laws.spec.ts` already enforces
the layered discipline. A new law block covers the
substrate-study specifics:

- **RULE_F1**: `workshop/substrate-study/` imports only from
  allowed paths (§19.1).
- **RULE_F2**: no file outside `workshop/substrate-study/`
  imports from `workshop/substrate-study/`.
- **RULE_F3**: files under
  `product/domain/resolution/patterns/matchers/outsystems-generic/`
  must export a `coveredSignaturePatterns` constant.

### 19.5 Allowlist entries

Zero new `ALWAYS_ALLOWED_PRODUCT_PATHS` entries expected. The
substrate-study is purely workshop-side. Any reshape that appears
to need a new allowlist entry is a signal to revisit the design.

## 20. Relationship to Other Slices

Z11f is a peer to the other Step-11 slices, not a dependency of
them. It sequences after verdict-11 (Z11a.7) closes so the
pattern-ladder foundation is stable before we start informing
it with real data.

### 20.1 With Z11a (pattern ladder)

- Z11a defines `Pattern`, `Matcher`, `PatternRegistry`,
  `DEFAULT_PATTERN_REGISTRY`, and the six seed patterns.
  Z11a.4c landed Dec-23-2026.
- Z11f consumes Z11a's `coveredSignaturePatterns` annotations
  via the extractor; produces `MatcherProposal` envelopes; new
  matchers land under
  `product/domain/resolution/patterns/matchers/outsystems-generic/`
  via trust-policy-gated PRs and get registered in the
  appropriate pattern's `matchers[]` array.

No circular dependency. Z11f reads product; product never reads
workshop.

### 20.2 With Z11b (executed-test cohort)

Z11b's executed-test receipts are an orthogonal evidence stream.
Nothing in Z11f consumes or produces those receipts. A future
integration could correlate "matcher introduced at quarter N"
with "executed-test flake rate at quarter N+1," but that's a
dedicated analytical slice, not Z11f.

### 20.3 With Z11d (claude-as-live-adapter)

Z11d provides LLM-backed reasoning for intent classification
and may also be used inside a matcher for complex disambiguation.
Z11f's distillations inform which matcher signatures to hand-
author; Z11d is about runtime reasoning inside matchers.
Complementary, not overlapping.

If Z11d's claude-code-session adapter uses Reasoning.select to
PICK among candidates returned by a pattern, Z11f's distillations
tell the matcher which candidate signatures to PRODUCE in the
first place. Distillation is upstream of reasoning.

### 20.4 With the compounding engine (Z10)

The compounding engine measures product efficacy across probe +
scenario + customer-compilation cohorts. Z11f improves one
dimension of product efficacy (resolution capability) by
informing matcher authoring. The cohort impact is indirect:
better matchers → higher resolvable-corpus confirmation →
improved scoreboard.

The compounding engine's graduation gate is unaffected by
Z11f's output. Z11f is a *cause* of improved scoreboard
metrics, not a condition of them.

### 20.5 With the synthetic-app substrate

Z11f's distributions reveal OutSystems conventions not modeled
by our substrate. Those gaps flow back into
`docs/v2-synthetic-app-surface-backlog.md` as prioritized
substrate work. The priority is now data-informed rather than
guess-informed.

Specifically: if 85% of harvested OutSystems samples have modal
dialogs but our substrate doesn't render them, the "modal
dialog" backlog row's priority rises to `high` automatically
via the Z11f.g verdict process. This closes a loop that was open
in verdict-10.

### 20.6 With the scenario corpus (S* slices)

Scenario corpus stays scenario-YAML-authored. Substrate-study
doesn't generate scenarios; it generates matcher proposals. The
two evidence kinds are structurally different (Scenario runs
against the substrate; Sample shapes are harvested from public
sites) and live in non-overlapping lanes.

## 21. Success Criteria (Done Definition)

Z11f is complete when:

1. **Legal review signed off** (Z11f.0) on the scraping-policy
   YAML + this plan doc's §6.5 extension.
2. **Domain types + laws land** (Z11f.a): ~16 files, ~16 laws
   (ZF1.*), all green.
3. **Scrubber + classifier land** (Z11f.b): PII-audit fixtures
   prove zero leakage; fingerprint fixtures prove classifier
   discrimination.
4. **Ports + in-memory harness + policy loader land** (Z11f.c):
   full pipeline runs against fixtures without network.
5. **Effect programs land** (Z11f.d): harvestCorpus /
   distillCorpus / proposeMatchers are Effect-typed + pure-
   functional at the program level; idempotency law passes.
6. **Real adapters land** (Z11f.e): CC / Wayback / Showcase
   adapters with rate limiting; live integration lane green on
   opt-in.
7. **CLI + first real quarter land** (Z11f.f): `tesseract
   substrate-study harvest|distill|propose|report` work
   end-to-end; 2026-Q2 corpus populated.
8. **Verdict + backlog update land** (Z11f.g):
   `workshop/observations/substrate-study-quarter-2026-Q2.md`
   summarizes the first distillation; the synthetic-app
   backlog's priorities are updated; at least one matcher
   proposal has been reviewed (accepted OR rejected, but
   reviewed).
9. **Full test suite stays green** at every commit. Seam laws
   hold. No new ALWAYS_ALLOWED_PRODUCT_PATHS entries.
10. **The compounding-engine gate still holds** (`npm run
    graduate` passes). Z11f doesn't regress prior slices.

### 21.1 Anti-goals (if we hit these, we went off-path)

- **Live scraping**. Any code path that fetches from a customer
  origin or a non-permitted source. Policy + compose-time check
  prevents it; a code review that allows it bypass is a signal
  to revisit.
- **Raw HTML on disk**. Any file under
  `workshop/substrate-study/logs/` containing raw HTML.
- **`product/` importing `workshop/substrate-study/`**. Seam
  law catches.
- **Automatic matcher-merging**. Proposals are reviewed;
  operators open PRs; merge is a human act.
- **Daemon / scheduled scraping**. Every harvest is explicit.
- **PII retention**. Any attribute value or text content
  reaching disk.
- **Runtime cost**. Z11f has zero runtime cost — it's offline
  analysis. If matcher proposals introduce runtime cost (e.g.,
  expensive predicates), that's the matcher author's concern,
  not Z11f's.

## 22. Example End-to-End Walkthrough

Concrete flow. 2026-Q2 refresh by operator Alice.

### 22.1 Legal review (Z11f.0) — already done

Policy approved April 2026; legal note on file. Alice skips
directly to refresh.

### 22.2 Harvest run

```bash
$ tesseract substrate-study harvest \
    --sources showcase,wayback \
    --quarter 2026-Q2 \
    --max-samples 150
```

Output:

```
Starting harvest run run:2026-Q2:01abc...
Loading scraping policy (fingerprint sha256:policy...)
Composed harvest sources: [showcase, wayback]
Classifier version: 2026-Q2-v1

Showcase:
  Addressable: 72
  Fetched: 72
  Classifier verdicts: confirmed=70, probable=0, rejected=2
  Appended: 70
Wayback:
  Addressable: 412
  Fetched: 398
  Classifier verdicts: confirmed=175, probable=6, rejected=217
  Appended: 181

Run complete.
Manifest: workshop/substrate-study/logs/corpus-manifests/2026-Q2/2026-04-23T00-00-00Z-run:2026-Q2:01abc.manifest.json
Total samples appended: 251
```

Disk state: 251 `.shape.json` files under
`workshop/substrate-study/logs/samples/2026-Q2/` + one
manifest JSON.

### 22.3 Distill run

```bash
$ tesseract substrate-study distill --quarter 2026-Q2 --all
```

Output:

```
Reading 251 samples for quarter 2026-Q2...
Distilling 11 pattern kinds...

submit-button:     142 contributing samples; top support 0.73 (osui-button--primary).
nav-link:          89 contributing samples; top support 0.61 (osui-nav-link).
field-input:       203 contributing samples; top support 0.89 (osui-input, inside-form).
validation-error:  67 contributing samples; top support 0.41 (osui-form-field__error).
date-picker:       18 contributing samples (INSUFFICIENT — need 20).
modal-dialog:      32 contributing samples; top support 0.28 (osui-modal__dialog).
sortable-table:    14 contributing samples (INSUFFICIENT).
file-upload:       24 contributing samples; top support 0.35 (osui-file-upload).
status-or-alert:   91 contributing samples; top support 0.52 (osui-toast).
multi-select-picker: 8 contributing samples (INSUFFICIENT).
wizard-step:       12 contributing samples (INSUFFICIENT).

Distillations produced: 8 of 11.
Kinds skipped (insufficient): date-picker, sortable-table, multi-select-picker, wizard-step.
Distributions written to workshop/substrate-study/logs/distributions/2026-Q2/.
```

### 22.4 Propose run

```bash
$ tesseract substrate-study propose --quarter 2026-Q2 --floor 0.3
```

Output:

```
Reading 8 distributions for quarter 2026-Q2...
Loading coveredSignaturePatterns from 9 existing matchers...

submit-button:
  1. sig: tag=button|role=button|class-stem=osui-button|class-stem=osui-button--primary (support 0.73, score 1.13) — PROPOSE
  2. sig: tag=button|role=button|data-testid-stem=submit- (support 0.44, score 0.83) — PROPOSE
  3. (already covered by formContextSubmitMatcher — SUPPRESSED)
nav-link:
  1. sig: tag=a|role=link|class-stem=osui-nav-link (support 0.61, score 0.91) — PROPOSE
field-input:
  (all signatures covered by roleAndNameExactMatcher; SUPPRESSED)
validation-error:
  1. sig: tag=div|class-stem=osui-form-field__error|aria-live=polite (support 0.41, score 0.81) — PROPOSE
status-or-alert:
  1. sig: tag=div|role=alert|class-stem=osui-toast (support 0.52, score 0.91) — PROPOSE
...

Proposals appended: 5.
Suppressed as duplicates: 14.
No-floor-reach: [file-upload, modal-dialog].

Proposals: workshop/substrate-study/logs/proposals/2026-Q2/*.proposal.json
```

### 22.5 Report

```bash
$ tesseract substrate-study report --quarter 2026-Q2 --format md
```

Prints a Markdown summary to stdout (copied by Alice into the
verdict doc).

### 22.6 Review + merge

Alice:

1. Reads the 5 proposals.
2. Opens a PR creating
   `product/domain/resolution/patterns/matchers/outsystems-generic/
   osui-button-primary-submit.ts` — refined from the skeleton.
3. Adds it to `formSubmissionPattern.matchers[]` at index 0 (most
   specific).
4. Adds laws.
5. Adds the matcher's `coveredSignaturePatterns` export.
6. Cites the proposal envelope in the PR body for provenance.
7. CI passes; trust-policy gate verifies thresholds met;
   reviewer approves; merge.

Next quarter's `propose` run won't re-propose the same
signature (it's covered).

### 22.7 Backlog update

Alice runs `tesseract substrate-study report --quarter 2026-Q2
--include drift` and sees that `modal-dialog` has 32 samples —
below floor but non-trivial. She moves "Modal dialog" to the
top of `docs/v2-synthetic-app-surface-backlog.md`'s high-
priority list, cited by the 32 observed samples.

### 22.8 Elapsed time

~45 minutes for the whole flow, including the PR.

## 23. Comparison with Sibling Plans

| Axis | Compounding Engine (Z1-10) | Scenario Corpus (S1-9) | Substrate Study (Z11f) |
|---|---|---|---|
| Lane | workshop/compounding/ | workshop/scenarios/ | workshop/substrate-study/ |
| Evidence source | Probe + scenario + compilation receipts | YAML-authored scenarios | Harvested public OS DOMs |
| Produces | HypothesisReceipts, Scoreboard | ScenarioReceipts | Distribution, MatcherProposal |
| Consumes | Product manifest + receipt streams | Synthetic-app substrate | Common Crawl, Wayback, Showcase |
| Effect surface | 2 ports (ledger + store) | 1 port (harness) | 4 ports (source + 3 stores) |
| Determinism | Pure domain; in-memory tests pin | Pure domain; scenario runs deterministic | Pure distillation + scrubber; live adapters have IO |
| Output to product | None (reads product manifest) | None | MatcherProposals → PR-gated matchers |
| Graduation criterion | 4-condition gate holds | Corpus 100% passing | 1+ matcher merged per quarter in steady state |
| Refresh cadence | Per-cycle | Per-commit | Quarterly |

### 23.1 Shape similarities

All three follow the same architectural skeleton:

- Pure domain types + folds.
- Context.Tag service ports.
- Filesystem harness + in-memory harness.
- CLI verbs for each program.
- Append-only log structure.
- Content-addressed fingerprints.
- Laws pinning invariants at every slice.

This is intentional — Z11f should feel like a sibling, not a
foreign slice.

### 23.2 Shape differences

- **Z11f has live external IO** — the other two lanes don't.
  This is why the policy-check discipline is stronger here
  (compose-time + request-time verification of permitted
  sources).
- **Z11f's output is advisory, not enforcing**. Compounding
  engine computes a gate; scenario corpus is consumed by a
  runner; substrate study proposes matchers that humans
  optionally accept.
- **Z11f carries a legal/privacy component**. The other two
  operate on internal-only data.

## Appendix A — The Full Cognitive Stack

Putting Z11f in context. The product resolves ADO intent text to
DOM surfaces via a stack of reasoners. Z11f informs the middle
layer.

```
   ADO intent text: "Click the Submit button"
               │
               ▼
   ┌─────────────────────────────────────────┐
   │  [Parser] — classified intent:         │
   │    verb=click, role=button,            │
   │    nameSubstring=Submit, name=Submit   │
   │  (today: regex; under Z11d: LLM)       │
   └────────────────┬────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────┐
   │  [Pattern Ladder: slot 4               │
   │    'shared-patterns']                  │
   │                                         │
   │    formSubmissionPattern → matchers:   │
   │      M0: role-and-name-exact           │
   │      M1: role-and-name-substring       │
   │      M2: form-context-submit           │
   │                                         │
   │    [new from Z11f, post-merge]:        │
   │      M-1: osui-button-primary-submit   │
   │            (prepended, most specific)  │
   │                                         │
   │    Walker: firstMatchWins               │
   └────────────────┬────────────────────────┘
                    │
                    ▼
   SurfaceIndex lookup — produces PatternCandidate or None
                    │
                    ▼
   Resolution strategy returns ResolutionReceipt:
     - If matched: resolved, carrying rungId + matcherId +
       patternId in provenance
     - If no-match: falls through to next rung (slot 5+)
```

### A.1 What Z11f changes about this stack

Z11f adds the M-1 row above: **distribution-informed, operator-
curated, trust-policy-gated matchers that encode real
OutSystems conventions at the top of each pattern's ladder.**

Before Z11f: the pattern ladder's OutSystems-specific tier is
hand-guessed. Matchers like `outsystems-class-prefix` (§10.6 of
the pattern plan) would encode "any class starting with osui-".
Z11f replaces those guesses with distilled evidence: "across 251
public OS apps, 73% of form-scoped primary submit buttons have
`osui-button--primary`; this matcher fires at M-1 of
formSubmissionPattern for matches."

### A.2 The per-quarter feedback loop

```
Q1 — first harvest + distillation + 5 matchers merged
    │
    ▼
Q2 — harvest with improved classifier (v2)
     + distill
     + propose (most signatures already covered → 2 new proposals)
     + drift report: "2 signatures fading (OS v12 retiring),
       1 emerging (OS v14 new pattern)"
     + 2 matchers merged; 1 matcher updated based on drift
    │
    ▼
Q3 — mostly stable (steady state reached)
    │
    ▼
Q4+ — continues at ~1-3 matchers/quarter, dominated by drift
      adjustments rather than novel discoveries.
```

This is the **saturation curve** the compounding engine itself
predicts: early runs have high lift; steady state has low
turnover; the pipeline's value shifts from "net new matchers"
to "drift detection."

### A.3 The substrate-backlog feedback loop

Distillation also informs substrate work:

```
Harvest shows modal-dialog signatures in 32/251 samples (13%).
  │
  ▼
Below 30% floor; no matcher proposed.
  │
  ▼
Verdict logs: "modal-dialog underrepresented in substrate,
  observed in field." Alice updates substrate backlog; modal
  becomes next substrate work item.
  │
  ▼
Substrate gains modal-dialog preset.
  │
  ▼
Next quarter's scenarios + corpus exercise modal-dialog;
  customer-backlog corpus can promote CB-90101 from
  needs-human to resolvable.
  │
  ▼
Compounding engine's resolvable trajectory rises.
```

This is the **substrate-backlog-informed-by-reality loop** —
v2 doctrine made concrete.

## Appendix B — Implementation Hand-Off Playbook

Thirty-minute orientation for the next agent picking up Z11f.

### B.1 Before any code

Read in this order:

1. `CLAUDE.md` (10 min).
2. `docs/v2-probe-ir-spike.md` §5 (spike protocol — the template).
3. `docs/v2-compounding-engine-plan.md` §§3–5 (domain + effect
   architecture — the template).
4. `docs/v2-substrate-study-plan.md` (this doc) §§1–5, 10, 16.

### B.2 Start with Z11f.0 (policy + legal)

Draft the `scraping-policy.yaml` from §6.1 as-is. Open a PR titled
`step-11.Z11f.0-policy-draft: scraping-policy.yaml + legal
checklist`. Tag the appropriate reviewers. Wait for sign-off.
Do not proceed to code until this PR merges.

### B.3 Z11f.a: domain types

Per §4. Author every file in
`workshop/substrate-study/domain/`. Start with ids.ts + source.ts,
work outward. Write ZF1.* laws alongside. Each law file is
small; write + test in one sitting per group.

### B.4 Z11f.b: scrubber + classifier

Per §7 + §8. The parse5 wrapper is where live risk enters. Use
a mature parse5 version; pin its version in package.json. Write
a benchmark that asserts stripToShape handles 2MB HTML in under
500ms. Extensive fixture-based testing; err toward more
negative fixtures.

### B.5 Z11f.c–g: per the phasing (§16)

Follow in order. Don't skip ahead. Each sub-slice has a tight
scope; keep it tight.

### B.6 When to ask

- Before widening the `RetainedAttributeKind` union → ask legal.
- Before lowering the default floor below 0.3 → discuss with
  operator.
- Before adding a new `HarvestSource` variant → policy PR first.
- Before running a harvest against a quarter that already has
  samples → verify idempotent dedup is working before
  proceeding.

### B.7 When NOT to ask

- Adding new fixture HTML to `tests/` is free; do it.
- Adding new negative-fingerprint fixtures is free.
- Adjusting the classifier's weights based on observed false
  positives is allowed (law will catch regressions).

### B.8 Graduation criterion for this plan doc

This doc itself graduates (retires from "planning" status) when
Z11f.g ships. The doc becomes reference material; future edits
are narrower (drift reports, new PatternKinds added, etc).

## Closing note

The substrate study closes a circuit that's been open since
verdict-10:

> Today's evidence base is synthetic. Real-customer-backlog is
> the substantive rung. Between them is an epistemic rung
> ("grounded in real deployed OutSystems apps") that costs much
> less than real-customer-backlog and buys meaningfully more
> signal than synthetic-only.

Z11f populates that rung. Its output — distilled distributions
plus operator-gated matcher proposals — informs the pattern
ladder's Layer 2 with real evidence, replacing the guesses we'd
otherwise be stuck with. The compounding engine's gate still
holds or doesn't hold based on real evidence; the measurement
surface stays honest; the cognitive cache between ADO text and
DOM locator is built from what OutSystems apps actually do.

That's the whole value of Z11f. No scraping, no PII, no
runtime cost, no automatic mutation of product code. Just
evidence — curated, audit-ready, operator-gated, and quarterly-
refreshable — feeding the one part of the pattern ladder where
evidence most tangibly improves product efficacy.

