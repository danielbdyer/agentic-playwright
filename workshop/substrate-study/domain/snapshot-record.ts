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

/** Which affordance channel marked a node interactive
 *  (docs/v2-reactive-discovery-handoff.md §3.2), ranked:
 *
 *    'native'        — button, input, select, textarea, summary, a[href]
 *    'aria-role'     — an explicit interactive ARIA role
 *    'handler'       — the element OWNS a click handler (React 16
 *                      `__reactEventHandlers$…onClick`, React 17+
 *                      `__reactProps$…onClick`, or an onclick attribute)
 *    'tabindex'      — tabindex ≥ 0
 *    'platform-attr' — an OutSystems widget attribute (data-link, data-button)
 *    'own-cursor'    — computed `cursor: pointer` on the element whose
 *                      parent does not also have it. Recorded, but
 *                      NEVER sufficient: inherited cursors over-counted
 *                      roleless controls ~10× on the 2026-09-17 pass.
 *    'none'          — no channel fired.
 *
 *  `interaction.interactive` is true iff the source is one of the
 *  first five. */
export type AffordanceSource =
  | 'native'
  | 'aria-role'
  | 'handler'
  | 'tabindex'
  | 'platform-attr'
  | 'own-cursor'
  | 'none';

/** Form-association record for inputs / selects / textareas. */
export interface FormRef {
  readonly formId: string | null;
  readonly formName: string | null;
  readonly inputName: string | null;
}

/** Which naming path produced `ariaNaming.accessibleName`. Closed
 *  union so the distillation can partition targets by how they are
 *  named — the study's first real-substrate finding was that most
 *  Reactive form controls are named by `<label for>` and most
 *  buttons by content, neither of which the v1 walker resolved. */
export type NamingSource =
  | 'aria-label'
  | 'aria-labelledby'
  | 'label-for'
  | 'label-wrap'
  | 'placeholder'
  | 'content'
  | 'none';

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
    readonly source: NamingSource;
  };
  readonly interaction: {
    readonly tabindex: number | null;
    readonly focusable: boolean;
    readonly interactive: boolean;
    readonly affordanceSource: AffordanceSource;
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

/** Counts-only summary of the browser's accessibility tree
 *  (`locator.ariaSnapshot()`), the ground truth `getByRole` resolves
 *  against (handoff §3.1). Names are never persisted; the agreement
 *  pair says how many walker-named interactive nodes carried a name
 *  the AX tree also produced. */
export interface AccessibilitySummary {
  readonly interactiveTotal: number;
  readonly unnamedInteractive: number;
  readonly interactiveRoles: Readonly<Record<string, number>>;
  readonly walkerNameAgreement: { readonly compared: number; readonly agreed: number };
}

/** Structural signature of one chrome landmark's subtree (handoff
 *  §3.4): identical across every screen of one app version, so it
 *  can be discovered once and subtracted. */
export interface ChromeSignature {
  readonly signature: Fingerprint<'snapshot-signature'>;
  readonly nodes: number;
}

export interface ChromeSignatures {
  readonly banner: ChromeSignature | null;
  readonly navigation: ChromeSignature | null;
}

/** `data-block` values partitioned by the module whose bundle
 *  `<Module>.<Folder>.<Block>.mvc.js` the app's own manifest lists
 *  (handoff §3.3). Platform blocks are the Platonic forms to
 *  distill once; app blocks are per-catalog. */
export interface BlockOwnership {
  readonly byModule: Readonly<Record<string, readonly { readonly block: string; readonly nodes: number }[]>>;
  readonly unresolved: readonly { readonly block: string; readonly nodes: number }[];
}

export const EMPTY_BLOCK_OWNERSHIP: BlockOwnership = { byModule: {}, unresolved: [] };
export const EMPTY_ACCESSIBILITY_SUMMARY: AccessibilitySummary = {
  interactiveTotal: 0,
  unnamedInteractive: 0,
  interactiveRoles: {},
  walkerNameAgreement: { compared: 0, agreed: 0 },
};

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
    /** Nodes carrying a React marker of either key family (React 16
     *  `__reactInternalInstance$` / React 17+ `__reactFiber$`). */
    readonly reactMarkerNodeCount: number;
    readonly angularDetected: boolean;
    readonly vueDetected: boolean;
    readonly webComponentCount: number;
    readonly shadowRootCount: number;
    readonly iframeCount: number;
  };
  readonly variantClassifier: VariantClassifierVerdict;
  readonly accessibility: AccessibilitySummary;
  readonly chrome: ChromeSignatures;
  readonly blockOwnership: BlockOwnership;
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

// ─── Chrome signatures ───────────────────────────────────────

const CHROME_LANDMARKS: readonly (readonly [key: keyof ChromeSignatures, role: string, tag: string])[] = [
  ['banner', 'banner', 'header'],
  ['navigation', 'navigation', 'nav'],
];

/** Signature of a landmark's subtree — the structural quotient over
 *  the landmark node and every node under its path, with paths
 *  rebased to the landmark so the same chrome at a different depth
 *  still hashes the same. The first landmark of each role wins; a
 *  page without one records null. Pure. */
export function computeChromeSignatures(nodes: readonly SnapshotNode[]): ChromeSignatures {
  const entry = (role: string, tag: string): ChromeSignature | null => {
    const landmark = nodes.find((n) => n.ariaRole === role || (n.ariaRole === null && n.tag.toLowerCase() === tag));
    if (landmark === undefined) return null;
    const prefix = `${landmark.path} > `;
    const subtree = nodes
      .filter((n) => n === landmark || n.path.startsWith(prefix))
      .map((n) => ({
        ...n,
        path: n === landmark ? '.' : `. > ${n.path.slice(prefix.length)}`,
        depth: n.depth - landmark.depth,
      }));
    return { signature: snapshotStructuralQuotient.witness(subtree), nodes: subtree.length };
  };
  return Object.fromEntries(CHROME_LANDMARKS.map(([key, role, tag]) => [key, entry(role, tag)])) as unknown as ChromeSignatures;
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
  readonly accessibility: AccessibilitySummary;
  readonly blockOwnership: BlockOwnership;
}): SnapshotRecord {
  const structuralSignature = computeStructuralSignature(input.nodes);
  const chrome = computeChromeSignatures(input.nodes);
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
    accessibility: input.accessibility,
    chrome,
    blockOwnership: input.blockOwnership,
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
