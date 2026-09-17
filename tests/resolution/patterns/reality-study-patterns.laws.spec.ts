/**
 * Reality-study ladder laws — docs/v2-substrate-reality-study.md §5
 * (C1 / C2 / C3), 2026-09-16.
 *
 *   RS1  (C3) classifier emits `inLandmark` from prose cues:
 *        navigation / footer / search; none without a cue.
 *   RS2  (C3) role-and-name-in-landmark fires only with a hint AND a
 *        present landmark, and only on a unique match INSIDE it —
 *        a same-named surface outside the landmark does not count.
 *   RS3  (C3) a hint naming an absent landmark falls through to the
 *        page-wide exact rung (precision never blocks).
 *   RS4  (C1) textbox-by-placeholder resolves a placeholder-only
 *        field whose `name` is null; exact beats substring; ambiguity
 *        falls through.
 *   RS5  (C2) content-named-interactive resolves a roleless clickable
 *        by visible text; a non-interactive element with the same
 *        text is ignored; two interactive candidates → no match.
 *   RS6  (C2) the full registry reaches a roleless control that
 *        every role-indexed pattern misses, and stamps the floor
 *        pattern's id on the candidate.
 *   RS7  (C2) the floor does not pre-empt role-indexed patterns:
 *        with a real button present, locator-by-role-and-name wins.
 *   RS8  surfaceIndexFromList: `surfacesWithin` is real containment
 *        (empty ancestors → contained by nothing).
 */

import { describe, test, expect } from 'vitest';
import { Option } from 'effect';
import {
  foldPatternRungResult,
  type ClassifiedIntent,
  type IndexedSurface,
  type MatcherContext,
  type Pattern,
  type TargetShapeHint,
} from '../../../product/domain/resolution/patterns/rung-kernel';
import { classifyIntent } from '../../../product/domain/resolution/patterns/intent-classifier';
import { DEFAULT_PATTERN_REGISTRY } from '../../../product/domain/resolution/patterns/registry';
import { fieldInputByLabelPattern } from '../../../product/domain/resolution/patterns/patterns/field-input-by-label.pattern';
import { locatorByRoleAndNamePattern } from '../../../product/domain/resolution/patterns/patterns/locator-by-role-and-name.pattern';
import { contentNamedInteractivePattern } from '../../../product/domain/resolution/patterns/patterns/content-named-interactive.pattern';
import { roleAndNameInLandmarkMatcher } from '../../../product/domain/resolution/patterns/matchers/role-and-name-in-landmark';
import { textboxByPlaceholderMatcher } from '../../../product/domain/resolution/patterns/matchers/textbox-by-placeholder';
import { interactiveByContentMatcher } from '../../../product/domain/resolution/patterns/matchers/interactive-by-content';
import { surfaceIndexFromList } from '../../../product/runtime/resolution/patterns/surface-index-from-stage';
import { walkRegistry } from '../../../product/runtime/resolution/patterns/pattern-resolution-strategy';

function surface(o: Partial<IndexedSurface> & Pick<IndexedSurface, 'surfaceId' | 'role'>): IndexedSurface {
  return {
    name: null,
    landmarkRole: null,
    classes: [],
    placeholder: null,
    text: null,
    affordanceSource: 'none',
    ancestors: [],
    ...o,
  };
}

function ctx(
  verb: ClassifiedIntent['verb'],
  actionText: string,
  targetShape: TargetShapeHint,
  surfaces: readonly IndexedSurface[],
): MatcherContext {
  return {
    intent: { verb, originalActionText: actionText, targetShape },
    surfaceIndex: surfaceIndexFromList(surfaces),
  };
}

function run(pattern: Pattern, c: MatcherContext): { matched: boolean; targetSurfaceId?: string; matcherIndex?: number } {
  return foldPatternRungResult<{ matched: boolean; targetSurfaceId?: string; matcherIndex?: number }>(pattern.orchestrator(pattern, c), {
    matched: (r) => ({ matched: true, targetSurfaceId: r.candidate.targetSurfaceId, matcherIndex: r.candidate.matcherIndex }),
    noMatch: () => ({ matched: false }),
  });
}

// A page in the shape of the study's Productcatalog route: nav with
// links, a search landmark with a placeholder-only textbox, a
// roleless "Filter" toggle, and a content-named "Filter" heading
// that is NOT interactive.
const NAV = surface({ surfaceId: 'sid:nav', role: 'navigation', landmarkRole: 'navigation' });
const NAV_PRODUCTS = surface({ surfaceId: 'sid:nav-products', role: 'link', name: 'Products', text: 'Products', affordanceSource: 'native', ancestors: ['sid:nav'] });
const MAIN = surface({ surfaceId: 'sid:main', role: 'main', landmarkRole: 'main' });
const MAIN_PRODUCTS = surface({ surfaceId: 'sid:main-products', role: 'link', name: 'Products', text: 'Products', affordanceSource: 'native', ancestors: ['sid:main'] });
const SEARCH = surface({ surfaceId: 'sid:search', role: 'search', landmarkRole: 'search', ancestors: ['sid:main'] });
const SEARCH_BOX = surface({ surfaceId: 'sid:search-box', role: 'textbox', name: 'Search products', placeholder: 'Search products', affordanceSource: 'native', ancestors: ['sid:search', 'sid:main'] });
const FILTER_TOGGLE = surface({ surfaceId: 'sid:filter', role: 'generic', name: null, text: 'Filter', affordanceSource: 'handler', ancestors: ['sid:search', 'sid:main'] });
const FILTER_HEADING = surface({ surfaceId: 'sid:filter-h', role: 'heading', name: 'Filter', text: 'Filter', affordanceSource: 'none', ancestors: ['sid:main'] });
const PAGE = [NAV, NAV_PRODUCTS, MAIN, MAIN_PRODUCTS, SEARCH, SEARCH_BOX, FILTER_TOGGLE, FILTER_HEADING];

describe('RS1 — classifier landmark cues (C3)', () => {
  test('navigation cue', () => {
    expect(classifyIntent('Click the Products link in the navigation', ['click'])!.targetShape.inLandmark).toBe('navigation');
    expect(classifyIntent('Click the Products link in the top menu', ['click'])!.targetShape.inLandmark).toBe('navigation');
  });
  test('footer + search cues', () => {
    expect(classifyIntent('Click the Privacy link in the footer', ['click'])!.targetShape.inLandmark).toBe('contentinfo');
    expect(classifyIntent('Enter headset in the Search field', ['input'])!.targetShape.inLandmark).toBe('search');
  });
  test('no cue → key absent (intents without cues are structurally unchanged)', () => {
    const shape = classifyIntent('Click the Submit button', ['click'])!.targetShape;
    expect('inLandmark' in shape).toBe(false);
  });
});

describe('RS2/RS3 — role-and-name-in-landmark (C3)', () => {
  test('RS2: unique match inside the hinted landmark wins; the same-named link outside does not count', () => {
    const c = ctx('click', 'Click the Products link in the navigation', { role: 'link', nameSubstring: 'Products', inLandmark: 'navigation' }, PAGE);
    const r = roleAndNameInLandmarkMatcher(c);
    expect(Option.isSome(r)).toBe(true);
    expect(Option.getOrThrow(r).targetSurfaceId).toBe('sid:nav-products');
    // Without the hint the page-wide rungs see two "Products" links and cannot choose.
    const noHint = ctx('click', 'Click the Products link', { role: 'link', nameSubstring: 'Products' }, PAGE);
    expect(run(locatorByRoleAndNamePattern, noHint).matched).toBe(false);
    // With it, the pattern resolves at M0.
    expect(run(locatorByRoleAndNamePattern, c)).toMatchObject({ matched: true, targetSurfaceId: 'sid:nav-products', matcherIndex: 0 });
  });

  test('RS2.search: "the Search field" scopes the input to the search landmark', () => {
    const c = ctx('input', 'Enter headset in the Search field', { role: 'textbox', nameSubstring: 'Search', inLandmark: 'search' }, PAGE);
    expect(run(fieldInputByLabelPattern, c)).toMatchObject({ matched: true, targetSurfaceId: 'sid:search-box', matcherIndex: 0 });
  });

  test('RS3: absent landmark → None; the exact rung still resolves', () => {
    const save = surface({ surfaceId: 'sid:save', role: 'button', name: 'Save', affordanceSource: 'native' });
    const c = ctx('click', 'Click Save in the footer', { role: 'button', name: 'Save', inLandmark: 'contentinfo' }, [save]);
    expect(Option.isNone(roleAndNameInLandmarkMatcher(c))).toBe(true);
    expect(run(locatorByRoleAndNamePattern, c)).toMatchObject({ matched: true, targetSurfaceId: 'sid:save', matcherIndex: 1 });
  });
});

describe('RS4 — textbox-by-placeholder (C1)', () => {
  const unnamed = surface({ surfaceId: 'sid:q', role: 'textbox', name: null, placeholder: 'Search products', affordanceSource: 'native' });
  test('resolves a field whose only name is its placeholder (name null in the index)', () => {
    const c = ctx('input', 'Enter headset in the search products field', { role: 'textbox', nameSubstring: 'search products' }, [unnamed]);
    const r = textboxByPlaceholderMatcher(c);
    expect(Option.getOrThrow(r).targetSurfaceId).toBe('sid:q');
    expect(run(fieldInputByLabelPattern, c)).toMatchObject({ matched: true, targetSurfaceId: 'sid:q', matcherIndex: 3 });
  });
  test('exact beats substring; ambiguity falls through', () => {
    const a = surface({ surfaceId: 'sid:a', role: 'textbox', placeholder: 'Search', affordanceSource: 'native' });
    const b = surface({ surfaceId: 'sid:b', role: 'textbox', placeholder: 'Search products', affordanceSource: 'native' });
    expect(Option.getOrThrow(textboxByPlaceholderMatcher(ctx('input', '', { nameSubstring: 'search' }, [a, b]))).targetSurfaceId).toBe('sid:a');
    const c2 = surface({ surfaceId: 'sid:c', role: 'textbox', placeholder: 'Search orders', affordanceSource: 'native' });
    expect(Option.isNone(textboxByPlaceholderMatcher(ctx('input', '', { nameSubstring: 'search o' }, [b, c2, surface({ surfaceId: 'sid:d', role: 'textbox', placeholder: 'Search offers', affordanceSource: 'native' })])))).toBe(true);
  });
  test('non-input verbs never fire', () => {
    expect(Option.isNone(textboxByPlaceholderMatcher(ctx('click', '', { nameSubstring: 'Search products' }, [unnamed])))).toBe(true);
  });
});

describe('RS5 — interactive-by-content (C2)', () => {
  test('resolves the roleless clickable by visible text; the non-interactive heading with the same text is ignored', () => {
    const c = ctx('click', 'Click Filter', { role: 'button', nameSubstring: 'Filter' }, PAGE);
    expect(Option.getOrThrow(interactiveByContentMatcher(c)).targetSurfaceId).toBe('sid:filter');
  });
  test('two interactive candidates → no match', () => {
    const twin = surface({ surfaceId: 'sid:filter-2', role: 'generic', text: 'Filter', affordanceSource: 'handler' });
    const c = ctx('click', 'Click Filter', { nameSubstring: 'Filter' }, [...PAGE, twin]);
    expect(Option.isNone(interactiveByContentMatcher(c))).toBe(true);
  });
  test('substring rescues a longer label when unique', () => {
    const back = surface({ surfaceId: 'sid:back', role: 'generic', text: 'Back to Overview', affordanceSource: 'handler' });
    const c = ctx('click', 'Click Back', { role: 'button', nameSubstring: 'Back' }, [...PAGE, back]);
    expect(Option.getOrThrow(interactiveByContentMatcher(c)).targetSurfaceId).toBe('sid:back');
  });
});

describe('RS6/RS7 — registry-level behaviour of the floor (C2)', () => {
  test('RS6: the full registry reaches the roleless control and stamps the floor pattern', () => {
    const intent = classifyIntent('Click Filter', ['click'])!;
    const candidate = walkRegistry(DEFAULT_PATTERN_REGISTRY, { intent, surfaceIndex: surfaceIndexFromList(PAGE) });
    expect(candidate).not.toBeNull();
    expect(candidate!.targetSurfaceId).toBe('sid:filter');
    expect(candidate!.patternId).toBe(contentNamedInteractivePattern.id);
  });
  test('RS7: with a real button present the role-indexed pattern wins first', () => {
    const button = surface({ surfaceId: 'sid:filter-btn', role: 'button', name: 'Filter', text: 'Filter', affordanceSource: 'native' });
    const intent = classifyIntent('Click the Filter button', ['click'])!;
    const candidate = walkRegistry(DEFAULT_PATTERN_REGISTRY, { intent, surfaceIndex: surfaceIndexFromList([...PAGE, button]) });
    expect(candidate!.targetSurfaceId).toBe('sid:filter-btn');
    expect(candidate!.patternId).toBe(locatorByRoleAndNamePattern.id);
  });
  test('registry order: the floor is last', () => {
    const ids = DEFAULT_PATTERN_REGISTRY.patterns.map((p) => p.id);
    expect(ids[ids.length - 1]).toBe(contentNamedInteractivePattern.id);
    expect(ids).toHaveLength(8);
  });
});

describe('RS8 — surfaceIndexFromList containment', () => {
  test('surfacesWithin is real containment', () => {
    const index = surfaceIndexFromList(PAGE);
    expect(index.surfacesWithin(NAV).map((s) => s.surfaceId)).toEqual(['sid:nav-products']);
    expect(index.surfacesWithin(SEARCH).map((s) => s.surfaceId)).toEqual(['sid:search-box', 'sid:filter']);
    expect(index.surfacesWithin(NAV_PRODUCTS)).toEqual([]);
    expect(index.findInteractive().map((s) => s.surfaceId)).toEqual(['sid:nav-products', 'sid:main-products', 'sid:search-box', 'sid:filter']);
    expect(index.findByPlaceholder('Search products').map((s) => s.surfaceId)).toEqual(['sid:search-box']);
  });
});

import { rowScopedControlPattern } from '../../../product/domain/resolution/patterns/patterns/row-scoped-control.pattern';
import { controlInRowByCellTextMatcher } from '../../../product/domain/resolution/patterns/matchers/control-in-row-by-cell-text';

/**
 * RS9 (C7 / N10) — the row-scoped rung.
 *   a. classifier emits `inRowWith` from "in the row for X" and "in the X row".
 *   b. an unnamed checkbox resolves through the row whose cell says X;
 *      two rows matching the cell text → no match; no such row → no match.
 *   c. the pattern is first in the registry and wins for a row intent.
 *   d. an own-cursor descendant with matching text is never an
 *      interactive candidate (N8): the handler owner is.
 */
describe('RS9 — row-scoped control (C7) and handler-owner identity (N8)', () => {
  const GRID = surface({ surfaceId: 'sid:grid', role: 'grid' });
  const ROW1 = surface({ surfaceId: 'sid:row1', role: 'row', ancestors: ['sid:grid'] });
  const ROW1_CB = surface({ surfaceId: 'sid:cb1', role: 'checkbox', name: null, affordanceSource: 'native', ancestors: ['sid:row1', 'sid:grid'] });
  const ROW1_CELL = surface({ surfaceId: 'sid:cell1', role: 'gridcell', text: 'Aurora headset', ancestors: ['sid:row1', 'sid:grid'] });
  const ROW2 = surface({ surfaceId: 'sid:row2', role: 'row', ancestors: ['sid:grid'] });
  const ROW2_CB = surface({ surfaceId: 'sid:cb2', role: 'checkbox', name: null, affordanceSource: 'native', ancestors: ['sid:row2', 'sid:grid'] });
  const ROW2_CELL = surface({ surfaceId: 'sid:cell2', role: 'gridcell', text: 'Borealis keyboard', ancestors: ['sid:row2', 'sid:grid'] });
  const TABLE = [GRID, ROW1, ROW1_CB, ROW1_CELL, ROW2, ROW2_CB, ROW2_CELL];

  test('RS9.a: classifier row cues', () => {
    expect(classifyIntent('Click the checkbox in the row for Aurora headset', ['click'])!.targetShape).toEqual({ role: 'checkbox', inRowWith: 'Aurora headset' });
    expect(classifyIntent('Click the checkbox in the Borealis keyboard row', ['click'])!.targetShape.inRowWith).toBe('Borealis keyboard');
    expect('inRowWith' in classifyIntent('Click the Save button', ['click'])!.targetShape).toBe(false);
  });

  test('RS9.b: unnamed checkbox resolves through its row; ambiguity and absence fall through', () => {
    const hit = ctx('click', 'Click the checkbox in the row for Aurora headset', { role: 'checkbox', inRowWith: 'Aurora headset' }, TABLE);
    expect(Option.getOrThrow(controlInRowByCellTextMatcher(hit)).targetSurfaceId).toBe('sid:cb1');
    const twin = surface({ surfaceId: 'sid:cell2b', role: 'gridcell', text: 'Aurora headset (refurb)', ancestors: ['sid:row2', 'sid:grid'] });
    expect(Option.isNone(controlInRowByCellTextMatcher(ctx('click', '', { role: 'checkbox', inRowWith: 'Aurora headset' }, [...TABLE, twin])))).toBe(true);
    expect(Option.isNone(controlInRowByCellTextMatcher(ctx('click', '', { role: 'checkbox', inRowWith: 'Cascade monitor' }, TABLE)))).toBe(true);
  });

  test('RS9.c: the row-scoped pattern is first and wins at the registry', () => {
    expect(DEFAULT_PATTERN_REGISTRY.patterns[0]!.id).toBe(rowScopedControlPattern.id);
    const intent = classifyIntent('Click the checkbox in the row for Borealis keyboard', ['click'])!;
    const candidate = walkRegistry(DEFAULT_PATTERN_REGISTRY, { intent, surfaceIndex: surfaceIndexFromList(TABLE) });
    expect(candidate).toMatchObject({ targetSurfaceId: 'sid:cb2', patternId: rowScopedControlPattern.id });
  });

  test('RS9.d: an inherited-cursor descendant is never the resolved control; its handler-owning ancestor is', () => {
    const owner = surface({ surfaceId: 'sid:owner', role: 'generic', text: 'Filter', affordanceSource: 'handler' });
    const decorative = surface({ surfaceId: 'sid:span', role: 'generic', text: 'Filter', affordanceSource: 'own-cursor', ancestors: ['sid:owner'] });
    const c = ctx('click', 'Click Filter', { role: 'button', nameSubstring: 'Filter' }, [owner, decorative]);
    expect(Option.getOrThrow(interactiveByContentMatcher(c)).targetSurfaceId).toBe('sid:owner');
    expect(surfaceIndexFromList([owner, decorative]).findInteractive().map((s) => s.surfaceId)).toEqual(['sid:owner']);
  });
});
