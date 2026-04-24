/**
 * DOM-walk capture — the in-page evaluator that walks the
 * post-hydration DOM and produces a flat array of
 * SnapshotNodes plus page-level framework detection signals.
 *
 * Per `docs/v2-substrate-ladder-plan.d0a-harness-design.md §3`,
 * the capture runs in the browser via `page.evaluate(fn)`.
 * The in-page function is self-contained — it receives no
 * outer-scope references at runtime, only the serializable
 * context it needs — and returns plain data structures that
 * Playwright marshals back to Node.
 *
 * ## What's here vs what's in `variant-classifier.ts`
 *
 * This module owns the DOM traversal + signal extraction.
 * The variant classification logic lives in
 * `variant-classifier.ts` so it can be unit-tested without
 * Playwright ceremony.
 *
 * ## Pure helpers exported for unit tests
 *
 * Several deterministic helpers are exported so unit tests
 * can exercise them without launching a browser:
 *   - bucketBoundingRect
 *   - bucketTextLength
 *   - classifyClassPrefix
 *   - isLabelClassified
 *
 * The in-page `walkDom` function is the browser-bound piece;
 * its correctness is established by integration tests against
 * the workshop synthetic-app (later phase).
 */

import type { Page } from '@playwright/test';
import type {
  ClassPrefixFamily,
  SnapshotNode,
  TextLengthBucket,
} from '../domain/snapshot-record';
import type { VariantClassifierSignals } from './variant-classifier';

// ─── Pure helpers (testable without a browser) ─────────────

/** Bucket a getBoundingClientRect into coarse bins per design
 *  §3.3. x/y bin = floor(v/10)*10; w/h bin = floor(v/20)*20.
 *  Negative / NaN inputs collapse to 0. */
export function bucketBoundingRect(rect: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}): { xBin: number; yBin: number; widthBin: number; heightBin: number } {
  const safe = (n: number): number => (Number.isFinite(n) ? n : 0);
  const bin10 = (n: number): number => Math.floor(safe(n) / 10) * 10;
  const bin20 = (n: number): number => Math.floor(safe(n) / 20) * 20;
  return {
    xBin: bin10(rect.x),
    yBin: bin10(rect.y),
    widthBin: bin20(rect.width),
    heightBin: bin20(rect.height),
  };
}

/** Categorize text length per design §11.5. */
export function bucketTextLength(length: number): TextLengthBucket {
  if (length <= 0) return '0';
  if (length <= 10) return '1-10';
  if (length <= 50) return '11-50';
  return '51+';
}

/** Closed-map lookup for class-prefix family per design §3.3.
 *  Returns `null` when the token list is empty (no classes at
 *  all); `'app-specific'` when the first token doesn't match
 *  a known prefix. */
export function classifyClassPrefix(
  classTokens: readonly string[],
): ClassPrefixFamily | null {
  if (classTokens.length === 0) return null;
  const first = classTokens[0]!;
  if (first.startsWith('osui-')) return 'osui';
  if (first.startsWith('ThemeGrid_') || first.startsWith('ThemeGrid-'))
    return 'theme-grid';
  if (first.startsWith('Menu_')) return 'menu';
  if (first.startsWith('EPATaskbox_')) return 'epa-taskbox';
  if (first.startsWith('Feedback_')) return 'feedback';
  if (first.startsWith('RichWidgets_')) return 'rich-widgets';
  if (first.startsWith('fa-') || first === 'fa') return 'fa';
  // OS PascalCase utilities — match "OS" prefix followed by an
  // uppercase letter (OSInline, OSFillParent, OSAutoMarginTop).
  // Must come AFTER osui- check since osui- also starts with "os".
  if (/^OS[A-Z]/.test(first)) return 'os';
  return 'app-specific';
}

/** True iff an element is "label-like" for text-capture
 *  purposes per design §3.4. Headings, labels, buttons,
 *  role-as-button, or elements carrying an aria-label attribute
 *  are eligible. */
export function isLabelClassified(input: {
  readonly tag: string;
  readonly ariaRole: string | null;
  readonly hasAriaLabel: boolean;
  readonly hasAriaLabelledBy: boolean;
}): boolean {
  const t = input.tag.toLowerCase();
  if (t === 'label' || t === 'button') return true;
  if (/^h[1-6]$/.test(t)) return true;
  if (input.ariaRole === 'button' || input.ariaRole === 'heading')
    return true;
  if (input.hasAriaLabel || input.hasAriaLabelledBy) return true;
  return false;
}

// ─── Browser-bound capture ──────────────────────────────────

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
  readonly variantSignals: VariantClassifierSignals;
}

/** Walk the rendered DOM via page.evaluate(...). Returns a
 *  flat SnapshotNode array + page-level framework counts +
 *  variant-classifier signals (ready to feed
 *  classifyVariant()).
 *
 *  The in-page function is self-contained — no outer
 *  references. All logic is inlined because Playwright
 *  serializes the function, not its closure. */
export async function walkDom(page: Page): Promise<DomWalkOutput> {
  return page.evaluate(() => {
    // ─── In-page helpers (mirror classify* exports) ─────────
    const EXCLUDED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);

    function classifyClassPrefixIn(
      classTokens: readonly string[],
    ): string | null {
      if (classTokens.length === 0) return null;
      const first = classTokens[0]!;
      if (first.startsWith('osui-')) return 'osui';
      if (first.startsWith('ThemeGrid_') || first.startsWith('ThemeGrid-'))
        return 'theme-grid';
      if (first.startsWith('Menu_')) return 'menu';
      if (first.startsWith('EPATaskbox_')) return 'epa-taskbox';
      if (first.startsWith('Feedback_')) return 'feedback';
      if (first.startsWith('RichWidgets_')) return 'rich-widgets';
      if (first.startsWith('fa-') || first === 'fa') return 'fa';
      if (/^OS[A-Z]/.test(first)) return 'os';
      return 'app-specific';
    }

    function bucketTextLengthIn(n: number): string {
      if (n <= 0) return '0';
      if (n <= 10) return '1-10';
      if (n <= 50) return '11-50';
      return '51+';
    }

    function bucketRectIn(rect: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) {
      const safe = (n: number): number => (Number.isFinite(n) ? n : 0);
      return {
        xBin: Math.floor(safe(rect.x) / 10) * 10,
        yBin: Math.floor(safe(rect.y) / 10) * 10,
        widthBin: Math.floor(safe(rect.width) / 20) * 20,
        heightBin: Math.floor(safe(rect.height) / 20) * 20,
      };
    }

    function isLabelClassifiedIn(
      tag: string,
      role: string | null,
      hasAriaLabel: boolean,
      hasAriaLabelledBy: boolean,
    ): boolean {
      const t = tag.toLowerCase();
      if (t === 'label' || t === 'button') return true;
      if (/^h[1-6]$/.test(t)) return true;
      if (role === 'button' || role === 'heading') return true;
      if (hasAriaLabel || hasAriaLabelledBy) return true;
      return false;
    }

    function computeVisibility(el: Element): string {
      const style = window.getComputedStyle(el);
      if (style.display === 'none') return 'display-none';
      if (style.visibility === 'hidden') return 'visibility-hidden';
      const rects = el.getClientRects();
      if (rects.length === 0) return 'zero-size';
      const rect = rects[0]!;
      if (rect.width === 0 && rect.height === 0) return 'zero-size';
      // Off-screen heuristic: entirely beyond viewport right/bottom
      // or before left/top.
      if (
        rect.right < 0 ||
        rect.bottom < 0 ||
        rect.left > window.innerWidth ||
        rect.top > window.innerHeight
      ) {
        return 'off-screen';
      }
      return 'visible';
    }

    function computeInteractive(el: Element, role: string | null): boolean {
      const tag = el.tagName.toLowerCase();
      if (tag === 'a' || tag === 'button') return true;
      if (role === 'button') return true;
      if (el.hasAttribute('onclick')) return true;
      const tabindex = el.getAttribute('tabindex');
      if (tabindex !== null && parseInt(tabindex, 10) >= 0) return true;
      const style = window.getComputedStyle(el);
      if (style.cursor === 'pointer') return true;
      return false;
    }

    // CSS-selector-ish path. Used as stable identity per capture.
    function computePath(el: Element): string {
      const parts: string[] = [];
      let cur: Element | null = el;
      while (cur !== null && cur !== document.documentElement) {
        const parentEl: Element | null = cur.parentElement;
        if (parentEl === null) {
          parts.unshift(cur.tagName.toLowerCase());
          break;
        }
        const tagToMatch = cur.tagName;
        const siblings: Element[] = Array.from(parentEl.children).filter(
          (c: Element) => c.tagName === tagToMatch,
        );
        const idx = siblings.indexOf(cur);
        parts.unshift(`${cur.tagName.toLowerCase()}:nth-of-type(${idx + 1})`);
        cur = parentEl;
      }
      return parts.join(' > ');
    }

    function walkFrom(
      root: Element,
      shadowOffset: boolean,
      out: SnapshotNodeShape[],
      visited: Set<Element>,
    ): void {
      if (visited.has(root)) return;
      visited.add(root);
      if (EXCLUDED_TAGS.has(root.tagName)) return;

      const tag = root.tagName.toLowerCase();
      const classTokens = root.className
        ? (typeof root.className === 'string'
            ? root.className.split(/\s+/).filter((s) => s.length > 0)
            : [])
        : [];
      const classPrefixFamily = classifyClassPrefixIn(classTokens);

      const dataAttrNames: string[] = [];
      const dataAttrValues: Record<string, { kind: string; value?: string }> = {};
      for (const attr of Array.from(root.attributes)) {
        if (attr.name.startsWith('data-')) {
          dataAttrNames.push(attr.name);
          // v1: every value → unobserved-cardinality placeholder.
          // Z11g.d.1 will populate observed-token set over time.
          dataAttrValues[attr.name] = { kind: 'unobserved-cardinality' };
        }
      }

      const ariaRole = root.getAttribute('role');
      const ariaState: Record<string, string> = {};
      const STATE_ATTRS = [
        'aria-expanded',
        'aria-selected',
        'aria-checked',
        'aria-pressed',
        'aria-disabled',
        'aria-hidden',
        'aria-busy',
        'aria-invalid',
        'aria-current',
        'aria-live',
        'aria-atomic',
      ];
      for (const name of STATE_ATTRS) {
        const v = root.getAttribute(name);
        if (v !== null) ariaState[name] = v;
      }

      const ariaLabel = root.getAttribute('aria-label');
      const ariaLabelledBy = root.getAttribute('aria-labelledby');
      const hasAriaLabel = ariaLabel !== null;
      const hasAriaLabelledBy = ariaLabelledBy !== null;

      // Best-effort accessible name. Playwright's accessibility
      // API would be more accurate but requires out-of-page call;
      // in-page we use aria-label || labelledby-resolution ||
      // (for label-classified elements) textContent trimmed.
      let accessibleName: string | null = null;
      if (ariaLabel !== null && ariaLabel.length > 0) {
        accessibleName = ariaLabel;
      } else if (ariaLabelledBy !== null) {
        const ids = ariaLabelledBy.split(/\s+/);
        const texts: string[] = [];
        for (const id of ids) {
          const ref = document.getElementById(id);
          if (ref !== null) texts.push((ref.textContent ?? '').trim());
        }
        accessibleName = texts.join(' ').trim();
        if (accessibleName.length === 0) accessibleName = null;
      }

      const labelLike = isLabelClassifiedIn(
        tag,
        ariaRole,
        hasAriaLabel,
        hasAriaLabelledBy,
      );
      const rawTextContent = (root.textContent ?? '').trim();
      const labelText = labelLike
        ? rawTextContent.length > 0
          ? rawTextContent
          : null
        : null;

      // Count direct text-node children; bucket their total length.
      let textNodeCount = 0;
      let totalTextLength = 0;
      for (const child of Array.from(root.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          textNodeCount++;
          totalTextLength += (child.textContent ?? '').trim().length;
        }
      }
      const textLengthBucket =
        textNodeCount > 0 ? bucketTextLengthIn(totalTextLength) : null;

      // Bounding rect + clipping.
      const rect = root.getBoundingClientRect();
      const boundingRect = bucketRectIn({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
      // Rough clipping heuristic: element has a positioned
      // ancestor with overflow:hidden that excludes this rect.
      let clipped = false;
      let ancestor: Element | null = root.parentElement;
      while (ancestor !== null && !clipped) {
        const aStyle = window.getComputedStyle(ancestor);
        if (aStyle.overflow === 'hidden' || aStyle.overflowX === 'hidden' ||
            aStyle.overflowY === 'hidden') {
          const aRect = ancestor.getBoundingClientRect();
          if (
            rect.right < aRect.left ||
            rect.left > aRect.right ||
            rect.bottom < aRect.top ||
            rect.top > aRect.bottom
          ) {
            clipped = true;
          }
        }
        ancestor = ancestor.parentElement;
      }

      // Form association for form-inputs.
      let formRef: { formId: string | null; formName: string | null; inputName: string | null } | null = null;
      let inputType: string | null = null;
      const interactiveTags = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
      if (interactiveTags.has(root.tagName)) {
        const el = root as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const form = el.form;
        formRef = {
          formId: form?.id ?? null,
          formName: form?.getAttribute('name') ?? null,
          inputName: el.getAttribute('name'),
        };
        if (root.tagName === 'INPUT') {
          inputType = (root as HTMLInputElement).type || 'text';
        } else if (root.tagName === 'SELECT') {
          inputType = 'select';
        } else {
          inputType = 'textarea';
        }
      }

      const tabindex = root.getAttribute('tabindex');
      const parsedTabindex = tabindex !== null ? parseInt(tabindex, 10) : null;
      const focusable =
        parsedTabindex !== null &&
        Number.isFinite(parsedTabindex) &&
        parsedTabindex >= 0;

      const interactive = computeInteractive(root, ariaRole);

      // Structural parent info.
      const parent = root.parentElement;
      const parentTag = parent?.tagName?.toLowerCase() ?? null;
      const parentRole = parent?.getAttribute('role') ?? null;
      const parentClasses = parent
        ? (typeof parent.className === 'string'
            ? parent.className.split(/\s+/).filter((s) => s.length > 0)
            : [])
        : [];
      const parentClassFamily = classifyClassPrefixIn(parentClasses);
      const siblings = parent
        ? Array.from(parent.children).filter(
            (c) => !EXCLUDED_TAGS.has(c.tagName),
          )
        : [];
      const siblingIndex = parent ? siblings.indexOf(root) : 0;
      const siblingCount = parent ? siblings.length : 1;

      // Framework per-node.
      const hasShadowRoot = (root as Element & { shadowRoot?: ShadowRoot | null })
        .shadowRoot !== null && (root as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot !== undefined;
      const customElementName =
        root.tagName.includes('-') ? root.tagName.toLowerCase() : null;
      const iframeSrc =
        root.tagName === 'IFRAME'
          ? (root as HTMLIFrameElement).src || null
          : null;

      const depth = (() => {
        let d = 0;
        let c: Element | null = root;
        while (c !== null && c !== document.body) {
          d++;
          c = c.parentElement;
        }
        return d;
      })();

      out.push({
        path: computePath(root),
        depth,
        tag,
        id: root.id || null,
        classTokens,
        classPrefixFamily: classPrefixFamily as SnapshotNodeShape['classPrefixFamily'],
        dataAttrNames,
        dataAttrValues,
        ariaRole,
        ariaState,
        ariaNaming: {
          label: ariaLabel,
          accessibleName,
        },
        interaction: {
          tabindex: parsedTabindex,
          focusable,
          interactive,
          formRef,
          inputType,
          disabled: root.hasAttribute('disabled'),
          readonly: root.hasAttribute('readonly'),
          required: root.hasAttribute('required'),
          placeholder: root.getAttribute('placeholder'),
        },
        visibility: computeVisibility(root) as SnapshotNodeShape['visibility'],
        boundingRect,
        clipped,
        framework: {
          hasShadowRoot,
          customElementName,
          iframeSrc,
        },
        structural: {
          parentTag,
          parentRole,
          parentClassFamily: parentClassFamily as SnapshotNodeShape['classPrefixFamily'],
          siblingIndex,
          siblingCount,
        },
        labelText,
        textLengthBucket: textLengthBucket as SnapshotNodeShape['textLengthBucket'],
        textNodeCount,
      });

      // Recurse into children.
      for (const child of Array.from(root.children)) {
        walkFrom(child, shadowOffset, out, visited);
      }
      // Recurse into shadow DOM if present.
      const shadow = (root as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
      if (shadow !== null && shadow !== undefined) {
        for (const child of Array.from(shadow.children)) {
          walkFrom(child, true, out, visited);
        }
      }
    }

    type SnapshotNodeShape = {
      path: string; depth: number; tag: string; id: string | null;
      classTokens: readonly string[];
      classPrefixFamily: 'osui' | 'os' | 'theme-grid' | 'menu' | 'epa-taskbox' | 'feedback' | 'fa' | 'rich-widgets' | 'app-specific' | null;
      dataAttrNames: readonly string[];
      dataAttrValues: Readonly<Record<string, { kind: string; value?: string }>>;
      ariaRole: string | null;
      ariaState: Readonly<Record<string, string>>;
      ariaNaming: { label: string | null; accessibleName: string | null };
      interaction: {
        tabindex: number | null; focusable: boolean; interactive: boolean;
        formRef: { formId: string | null; formName: string | null; inputName: string | null } | null;
        inputType: string | null; disabled: boolean; readonly: boolean; required: boolean;
        placeholder: string | null;
      };
      visibility: 'visible' | 'display-none' | 'visibility-hidden' | 'off-screen' | 'zero-size';
      boundingRect: { xBin: number; yBin: number; widthBin: number; heightBin: number };
      clipped: boolean;
      framework: { hasShadowRoot: boolean; customElementName: string | null; iframeSrc: string | null };
      structural: {
        parentTag: string | null; parentRole: string | null;
        parentClassFamily: 'osui' | 'os' | 'theme-grid' | 'menu' | 'epa-taskbox' | 'feedback' | 'fa' | 'rich-widgets' | 'app-specific' | null;
        siblingIndex: number; siblingCount: number;
      };
      labelText: string | null;
      textLengthBucket: '0' | '1-10' | '11-50' | '51+' | null;
      textNodeCount: number;
    };

    const nodes: SnapshotNodeShape[] = [];
    const visited = new Set<Element>();
    if (document.body) walkFrom(document.body, false, nodes, visited);

    // ─── Page-level framework detection ────────────────────
    const reactDetected =
      document.querySelector('[data-reactroot]') !== null ||
      document.querySelector('[data-reactid]') !== null ||
      (() => {
        for (const el of Array.from(document.querySelectorAll('*'))) {
          for (const key of Object.keys(el)) {
            if (key.startsWith('__reactFiber') || key.startsWith('__reactProps'))
              return true;
          }
          break; // Only check a few; full scan is expensive.
        }
        return false;
      })();
    const angularDetected =
      document.querySelector('[ng-version]') !== null ||
      document.querySelector('[_ngcontent]') !== null ||
      document.querySelector('[_nghost]') !== null;
    const vueDetected =
      (() => {
        for (const el of Array.from(document.querySelectorAll('*'))) {
          for (const attr of Array.from(el.attributes)) {
            if (attr.name.startsWith('data-v-')) return true;
          }
        }
        return false;
      })();

    const webComponentCount = nodes.filter(
      (n) => n.framework.customElementName !== null,
    ).length;
    const shadowRootCount = nodes.filter((n) => n.framework.hasShadowRoot).length;
    const iframeCount = nodes.filter(
      (n) => n.framework.iframeSrc !== null || n.tag === 'iframe',
    ).length;

    // ─── Variant-classifier signals ────────────────────────
    let osuiClassCount = 0;
    let osPascalClassCount = 0;
    for (const n of nodes) {
      if (n.classPrefixFamily === 'osui') osuiClassCount++;
      if (n.classPrefixFamily === 'os') osPascalClassCount++;
    }
    const osvstatePresent =
      document.querySelector('input[name="__OSVSTATE"]') !== null;
    const mobileMarkerPresent =
      document.querySelector('[data-cordova-app]') !== null ||
      document.querySelector('[is-phonegap]') !== null ||
      document.body?.classList.contains('is-phonegap') === true;

    return {
      nodes,
      frameworkCounts: {
        reactDetected,
        angularDetected,
        vueDetected,
        webComponentCount,
        shadowRootCount,
        iframeCount,
      },
      variantSignals: {
        osuiClassCount,
        osPascalClassCount,
        osvstatePresent,
        mobileMarkerPresent,
        reactDetected,
        angularDetected,
        vueDetected,
      },
    };
  }) as Promise<DomWalkOutput>;
}
