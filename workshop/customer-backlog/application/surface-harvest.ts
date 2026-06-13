/**
 * Live SurfaceIndex harvest + product pattern-registry walk
 * (Cycle 11 / G7 — unify the apparatus).
 *
 * Praxis audit §G7: the cohort runner reimplemented specific→generic
 * matching while the product's own pattern/matcher kernel
 * (`product/domain/resolution/patterns/`) never executed against a
 * real page — `surfaceIndexFromStage()` returns
 * `EMPTY_SURFACE_INDEX`. The measured pipeline was not the shipped
 * pipeline.
 *
 * This closes that seam. It harvests the live page into the
 * product's `IndexedSurface[]`, builds a `SurfaceIndex` via the
 * product's own `surfaceIndexFromList`, and walks the product's
 * `DEFAULT_PATTERN_REGISTRY` — so the product's actual matchers
 * (role-and-name-exact/substring, link-in-nav-landmark,
 * form-context-submit, dialog-button, single-textbox-in-form,
 * status-or-alert) decide the structured resolution against the
 * real DOM. The cohort's degraded-resolution kernel (phrase
 * reduction + inventory scoring) remains as the recall-extending
 * rung it always was — that is genuinely cohort-specific, not
 * duplication.
 *
 * Seam-clean: everything imported here is `product/domain/...`
 * (the shared-contract set per CLAUDE.md); the Playwright harvest
 * lives workshop-side where the runner already drives the browser.
 *
 * Safety: only VISIBLE surfaces feed the structured index — the
 * product matchers carry no visibility field, so admitting hidden
 * surfaces would let a matcher auto-accept a collapsed-menu element
 * (the cycle-9 trap). Hidden elements still inform the
 * inventory-rung evidence; they just never auto-resolve here.
 */

import type { Locator, Page } from 'playwright';
import {
  surfaceIndexFromList,
} from '../../../product/domain/resolution/patterns/surface-index';
import type {
  IndexedSurface,
  ClassifiedIntent,
  MatcherContext,
  PatternCandidate,
} from '../../../product/domain/resolution/patterns/rung-kernel';
import { DEFAULT_PATTERN_REGISTRY } from '../../../product/domain/resolution/patterns/registry';

/** Landmark roles harvested so the product's landmark-scoped
 *  matchers (link-in-nav-landmark, form-context-submit) can query
 *  `findLandmarkByRole`. */
const LANDMARK_ROLES: readonly string[] = [
  'navigation', 'form', 'main', 'search', 'banner', 'contentinfo', 'complementary', 'region',
];

interface HarvestedNode {
  readonly surfaceId: string;
  readonly role: string;
  readonly name: string | null;
  readonly landmarkRole: string | null;
  readonly classes: readonly string[];
  readonly visible: boolean;
  /** getByRole(role) ordinal, for the locator mapping. */
  readonly index: number;
}

export interface LiveSurface {
  readonly surfaceIndex: ReturnType<typeof surfaceIndexFromList>;
  /** Re-locate a matched surface as a Playwright Locator. */
  readonly locate: (surfaceId: string) => Locator | null;
  /** Every harvested node (visible + hidden) for the role, for the
   *  degraded kernel + evidence. */
  readonly all: readonly HarvestedNode[];
}

/**
 * Harvest the intent's role + the landmark roles into a product
 * SurfaceIndex (visible surfaces only) plus a locator map. One
 * in-browser pass per role/landmark set.
 */
export async function buildLiveSurface(page: Page, role: string): Promise<LiveSurface> {
  const roleNodes = await harvestRole(page, role, role);
  const landmarkNodeLists = await Promise.all(
    LANDMARK_ROLES.map((lr) => harvestRole(page, lr, `landmark:${lr}`)),
  );
  const landmarkNodes = landmarkNodeLists.flat();

  // Structured index: VISIBLE surfaces only (hidden never auto-resolves).
  const visibleRoleSurfaces: IndexedSurface[] = roleNodes
    .filter((n) => n.visible)
    .map(toIndexedSurface);
  const visibleLandmarkSurfaces: IndexedSurface[] = landmarkNodes
    .filter((n) => n.visible)
    .map((n) => ({ ...toIndexedSurface(n), landmarkRole: n.role }));

  const surfaceIndex = surfaceIndexFromList([...visibleRoleSurfaces, ...visibleLandmarkSurfaces]);

  const byId = new Map<string, HarvestedNode>();
  for (const n of [...roleNodes, ...landmarkNodes]) byId.set(n.surfaceId, n);

  const locate = (surfaceId: string): Locator | null => {
    const node = byId.get(surfaceId);
    if (!node) return null;
    return page
      .getByRole(node.role as Parameters<Page['getByRole']>[0], { includeHidden: true })
      .nth(node.index);
  };

  return { surfaceIndex, locate, all: roleNodes };
}

function toIndexedSurface(n: HarvestedNode): IndexedSurface {
  return {
    surfaceId: n.surfaceId,
    role: n.role,
    name: n.name,
    landmarkRole: n.landmarkRole,
    classes: n.classes,
  };
}

/**
 * Harvest every element exposing `role` (visible + hidden) with its
 * accessible-ish name, visibility, classes, and nearest landmark
 * ancestor. Names are in-page approximations (aria-label →
 * labelledby → label → text → title); acceptable because the
 * structured match maps back to a getByRole locator and downstream
 * verification (cycle 8) guards correctness.
 */
async function harvestRole(page: Page, role: string, idPrefix: string): Promise<HarvestedNode[]> {
  const locator = page.getByRole(role as Parameters<Page['getByRole']>[0], { includeHidden: true });
  const raw: ReadonlyArray<{ name: string | null; landmarkRole: string | null; classes: string[]; visible: boolean }> =
    await locator.evaluateAll((nodes) =>
      nodes.map((el) => {
        const attr = (n: Element, a: string): string => (n.getAttribute(a) ?? '').trim();
        let name = attr(el, 'aria-label');
        if (!name) {
          const labelledby = attr(el, 'aria-labelledby');
          if (labelledby) {
            name = labelledby
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent ?? '')
              .join(' ')
              .trim();
          }
        }
        if (!name && el instanceof HTMLInputElement) {
          if (el.labels && el.labels.length > 0) {
            name = Array.from(el.labels).map((l) => l.textContent ?? '').join(' ').trim();
          } else if (el.type === 'submit' || el.type === 'button') {
            name = el.value.trim();
          } else {
            name = attr(el, 'placeholder');
          }
        }
        if (!name) name = (el.textContent ?? '').trim();
        if (!name) name = attr(el, 'title') || attr(el, 'alt');
        name = name.replace(/\s+/g, ' ').slice(0, 80);

        const LANDMARKS = new Set([
          'navigation', 'form', 'main', 'search', 'banner', 'contentinfo', 'complementary', 'region',
        ]);
        const TAG_LANDMARK: Record<string, string> = {
          NAV: 'navigation', FORM: 'form', MAIN: 'main', HEADER: 'banner',
          FOOTER: 'contentinfo', ASIDE: 'complementary', SECTION: 'region',
        };
        let landmarkRole: string | null = null;
        let cur: Element | null = el;
        for (let i = 0; cur && i < 12; i += 1) {
          const explicit = (cur.getAttribute('role') ?? '').trim();
          if (LANDMARKS.has(explicit)) { landmarkRole = explicit; break; }
          const tagged = TAG_LANDMARK[cur.tagName];
          if (tagged) { landmarkRole = tagged; break; }
          cur = cur.parentElement;
        }

        const classes = (el.getAttribute('class') ?? '')
          .split(/\s+/)
          .filter((c) => c.length > 0)
          .slice(0, 12);

        const visible =
          typeof (el as HTMLElement & { checkVisibility?: () => boolean }).checkVisibility === 'function'
            ? (el as HTMLElement & { checkVisibility: () => boolean }).checkVisibility()
            : el instanceof HTMLElement && el.offsetParent !== null;

        return { name: name.length > 0 ? name : null, landmarkRole, classes, visible };
      }),
    );

  return raw.map((r, index) => ({
    surfaceId: `${idPrefix}#${index}`,
    role,
    name: r.name,
    landmarkRole: r.landmarkRole,
    classes: r.classes,
    visible: r.visible,
    index,
  }));
}

/**
 * Walk the product's DEFAULT_PATTERN_REGISTRY against a live
 * SurfaceIndex. Pure (the registry + matchers + orchestrators are
 * all product/domain). Returns the first matched candidate, or null.
 * This is the cohort's "structured-pattern" rung — the product's
 * own resolution kernel, now executing against a real page.
 */
export function resolveViaPatternRegistry(
  intent: ClassifiedIntent,
  surfaceIndex: LiveSurface['surfaceIndex'],
): PatternCandidate | null {
  const ctx: MatcherContext = { intent, surfaceIndex };
  for (const pattern of DEFAULT_PATTERN_REGISTRY.patterns) {
    const result = pattern.orchestrator(pattern, ctx);
    if (result.kind === 'matched') return result.candidate;
  }
  return null;
}
