/**
 * SnapshotRecord — the Reactive-OS DOM snapshot, captured by
 * the external-snapshot harness (Z11g.d.0a) and consumed by
 * the distillation pipeline (Z11g.d.1).
 *
 * Per `docs/v2-substrate-ladder-plan.d0a-harness-design.md §4`,
 * a SnapshotRecord carries the page-level envelope (URL,
 * timestamp, user agent, viewport, hydration verdict) plus a
 * flat array of SnapshotNodes — one per captured DOM element —
 * plus page-level framework detection + a variant-classifier
 * verdict that routes the record through distillation.
 *
 * ## Discipline
 *
 * - **No raw HTML.** SnapshotRecord is a structural projection
 *   of the DOM; no `innerHTML` / `outerHTML` strings land in
 *   any field (L-No-Raw-HTML-Persisted, §8 L7).
 * - **PII-safe text.** Only label-classified elements retain
 *   their text content; others carry a length bucket +
 *   node count (design §3.4).
 * - **Bounded data-attr values.** High-cardinality values are
 *   recorded as a placeholder tag (design §3.5).
 * - **Closed unions.** Every enum shape is a closed union;
 *   novel values fail type-check.
 *
 * Pure domain. No Effect. No IO. The constructor computes
 * fingerprints deterministically over the input payload.
 */

import type { WorkflowMetadata } from '../../../product/domain/governance/workflow-types';
import { mintEvidenceEnvelope } from '../../../product/domain/governance/mint-envelope';
import { type Fingerprint } from '../../../product/domain/kernel/hash';
import { makeQuotient } from '../../../product/domain/algebra/quotient';
import type { HydrationVerdict } from './hydration-verdict';

// ─── Closed-union axes ───────────────────────────────────────

/** Family of the element's first class token, used by the
 *  distillation to partition platform vs. app-specific tokens.
 *  Scoped to **Reactive Web** per the 2026-04-24 Z11g.d
 *  variant clarification — `osui-*` is the Reactive-Web class
 *  prefix. Traditional-Web-specific families (OS PascalCase,
 *  ThemeGrid_*, Menu_*, EPATaskbox_*, Feedback_*, fa-*,
 *  RichWidgets_*) were removed when the v2 rung-4 target was
 *  pinned to Reactive; they belong to a different distillation
 *  pipeline the workshop does not currently build for. */
export type ClassPrefixFamily = 'osui' | 'app-specific';

/** Closed visibility enum. Re-exported from the single source
 *  of truth at `workshop/substrate/surface-spec.ts`. A prior
 *  version of this module declared its own parallel union with
 *  a comment claiming convention-equivalence; that risked
 *  drift across the two declarations and has been collapsed.
 *  See `foldSurfaceVisibility` for exhaustive dispatch. */
import type { SurfaceVisibility } from '../../substrate/surface-spec';
export type { SurfaceVisibility };

/** Length-bucket categorical for non-label text content.
 *  PII-safe: the exact length is not retained, only the
 *  bucket. */
export type TextLengthBucket = '0' | '1-10' | '11-50' | '51+';

/** Data-attr value representation. v1 retains raw string
 *  values; future cardinality partition (observed-token /
 *  unobserved / high-cardinality) is deferred to Z11g.d.1
 *  when we have a real corpus — at v1 every value lacks
 *  observed-cardinality evidence so the discriminated-union
 *  discipline was YAGNI. */
export type DataAttrValue = string;

/** Bounded bounding rect — bucketed to absorb sub-pixel drift
 *  per design §3.3. */
export interface BoundingBucket {
  readonly xBin: number;
  readonly yBin: number;
  readonly widthBin: number;
  readonly heightBin: number;
}

/** Form-association record for inputs / selects / textareas. */
export interface FormRef {
  readonly formId: string | null;
  readonly formName: string | null;
  readonly inputName: string | null;
}

// ─── SnapshotNode ────────────────────────────────────────────

export interface SnapshotNode {
  /** CSS-selector-like path from document.body to the node.
   *  Used as the stable identity for cross-capture parity. */
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
  /** Only populated for label-classified elements per design
   *  §3.4: headings, labels, buttons, role=button, aria-labeled
   *  elements. Null for every other element (discipline against
   *  PII leakage). */
  readonly labelText: string | null;
  readonly textLengthBucket: TextLengthBucket | null;
  readonly textNodeCount: number;
}

// ─── VariantClassifierVerdict ────────────────────────────────

/** Discriminated union folding the captured signals into a
 *  routing verdict. Scoped to Reactive-Web detection per the
 *  2026-04-24 Z11g.d clarification — the workshop only builds
 *  for Reactive Web; Traditional and Mobile variants are
 *  out-of-scope until a future plan revisits them. Each kind
 *  carries evidence-of-classification for post-hoc audit.
 *
 *  - `reactive`   — all Reactive-indicative signals agree.
 *  - `not-reactive` — signals are coherent but Reactive-negative.
 *  - `ambiguous`  — signals conflict; operator review surfaces. */
export type VariantClassifierVerdict =
  | {
      readonly kind: 'reactive';
      readonly osuiClassCount: number;
      readonly evidence: readonly string[];
    }
  | {
      readonly kind: 'not-reactive';
      readonly evidence: readonly string[];
    }
  | {
      readonly kind: 'ambiguous';
      readonly conflictingEvidence: readonly string[];
    };

/** Exhaustive fold over variant classifier. */
export function foldVariantClassifier<R>(
  verdict: VariantClassifierVerdict,
  cases: {
    readonly reactive: (
      v: Extract<VariantClassifierVerdict, { kind: 'reactive' }>,
    ) => R;
    readonly notReactive: (
      v: Extract<VariantClassifierVerdict, { kind: 'not-reactive' }>,
    ) => R;
    readonly ambiguous: (
      v: Extract<VariantClassifierVerdict, { kind: 'ambiguous' }>,
    ) => R;
  },
): R {
  switch (verdict.kind) {
    case 'reactive':
      return cases.reactive(verdict);
    case 'not-reactive':
      return cases.notReactive(verdict);
    case 'ambiguous':
      return cases.ambiguous(verdict);
  }
}

// ─── SnapshotRecord (top-level envelope) ─────────────────────

export interface SnapshotRecordPayload {
  readonly url: string;
  readonly fetchedAt: string;
  readonly substrateVersion: string;
  readonly userAgent: string;
  readonly viewport: { readonly width: number; readonly height: number };
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
}

export interface SnapshotRecord extends WorkflowMetadata<'preparation'> {
  readonly kind: 'snapshot-record';
  readonly scope: 'run';
  readonly payload: SnapshotRecordPayload;
}

// ─── Structural-signature computation ────────────────────────

/** The tuple-per-node projection the signature digests. Sorted
 *  by path before serialization so signature-equality
 *  corresponds to structural-equality independent of
 *  traversal order. */
interface SignatureTuple {
  readonly path: string;
  readonly depth: number;
  readonly tag: string;
  readonly ariaRole: string | null;
  readonly classPrefixFamily: ClassPrefixFamily | null;
  readonly dataAttrNamesSorted: readonly string[];
}

/** The snapshot-record structural quotient: equivalence-by-
 *  projection onto the structural axes of the captured DOM.
 *  Two node lists that agree on (path, depth, tag, ariaRole,
 *  classPrefixFamily, dataAttrNamesSorted) tuple-per-node land
 *  in the same class — the cross-capture parity key used by
 *  the hydration detector's Phase C + E stability checks. */
export const snapshotStructuralQuotient = makeQuotient<
  readonly SnapshotNode[],
  'snapshot-signature'
>({
  tag: 'snapshot-signature',
  project: (nodes) =>
    nodes
      .map(
        (n): SignatureTuple => ({
          path: n.path,
          depth: n.depth,
          tag: n.tag,
          ariaRole: n.ariaRole,
          classPrefixFamily: n.classPrefixFamily,
          dataAttrNamesSorted: [...n.dataAttrNames].sort(),
        }),
      )
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
});

/** Compute the structural signature over a node list. Thin
 *  alias over `snapshotStructuralQuotient.witness` preserved
 *  for backwards compatibility — callers should migrate to the
 *  quotient directly. */
export function computeStructuralSignature(
  nodes: readonly SnapshotNode[],
): Fingerprint<'snapshot-signature'> {
  return snapshotStructuralQuotient.witness(nodes);
}

// ─── Constructor ─────────────────────────────────────────────

/** Pure constructor. Stamps stage/scope/kind constants;
 *  computes structural signature from nodes; computes
 *  artifact + content fingerprints over the payload. */
export function snapshotRecord(input: {
  readonly url: string;
  readonly fetchedAt: string;
  readonly substrateVersion: string;
  readonly userAgent: string;
  readonly viewport: SnapshotRecordPayload['viewport'];
  readonly hydration: HydrationVerdict;
  readonly captureLatencyMs: number;
  readonly nodes: readonly SnapshotNode[];
  readonly framework: SnapshotRecordPayload['framework'];
  readonly variantClassifier: VariantClassifierVerdict;
}): SnapshotRecord {
  const structuralSignature = computeStructuralSignature(input.nodes);
  const payload: SnapshotRecordPayload = {
    url: input.url,
    fetchedAt: input.fetchedAt,
    substrateVersion: input.substrateVersion,
    userAgent: input.userAgent,
    viewport: input.viewport,
    hydration: input.hydration,
    captureLatencyMs: input.captureLatencyMs,
    nodeCount: input.nodes.length,
    structuralSignature,
    nodes: input.nodes,
    framework: input.framework,
    variantClassifier: input.variantClassifier,
  };
  return mintEvidenceEnvelope({
    stage: 'preparation',
    kind: 'snapshot-record',
    payload,
    lineage: {
      sources: [`external-snapshot:${input.url}`],
    },
  });
}
