/**
 * Agnostic evidence channels — laws for the handoff's N1–N7
 * (docs/v2-reactive-discovery-handoff.md §§3–4).
 *
 *   AC1 (N1) affordance vocabulary: the walker's AffordanceSource and
 *       the product's AffordanceSource agree; an element whose only
 *       signal is a cursor is not interactive on either side.
 *   AC2 (N2) React floor: the in-page constant equals the exported
 *       twin, and the in-page detector reads BOTH key families.
 *   AC3 (N3) ariaSnapshot parsing: roles + names, escaped quotes,
 *       text nodes skipped; the summary counts interactive roles,
 *       unnamed interactives, and walker-name agreement.
 *   AC4 (N4) every interactive AX role observed on the 2026-09-17
 *       pass is a member of SurfaceRole.
 *   AC5 (N4) textbox intents admit the text-entry family in the
 *       surface index (searchbox, spinbutton).
 *   AC6 (N5) bundle-path parsing and block partitioning: every
 *       `.mvc.js` bundle names a module + block; every observed block
 *       resolves to exactly one module; unknown blocks are reported.
 *   AC7 (N6) view-bundle facts: prompts, block references, counts.
 *   AC8 (N7) chrome signatures: identical subtrees at different
 *       depths hash the same; a page without the landmark → null.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stubNode } from '../__fixtures__/snapshot-node-stub';
import {
  computeChromeSignatures,
  type AffordanceSource as WalkerAffordanceSource,
  type SnapshotNode,
} from '../../workshop/substrate-study/domain/snapshot-record';
import {
  REACT_MARKER_NODE_FLOOR,
  isInteractiveAffordance as walkerIsInteractive,
} from '../../workshop/substrate-study/application/dom-walk-capture';
import {
  AX_INTERACTIVE_ROLES,
  parseAriaSnapshot,
  summarizeAccessibility,
} from '../../workshop/substrate-study/domain/aria-snapshot';
import {
  bundleOwnership,
  observedBlocks,
  parseBundlePath,
  partitionBlocksByOwner,
} from '../../workshop/substrate-study/domain/block-ownership';
import { extractViewBundleFacts, viewBundlePath } from '../../workshop/substrate-study/domain/view-bundle';
import { SURFACE_ROLE_VALUES } from '../../workshop/substrate/surface-spec';
import {
  isInteractiveAffordance as productIsInteractive,
  rolesAdmittedBy,
  type AffordanceSource as ProductAffordanceSource,
  type IndexedSurface,
} from '../../product/domain/resolution/patterns/rung-kernel';
import { surfaceIndexFromList } from '../../product/runtime/resolution/patterns/surface-index-from-stage';

const REPO_ROOT = path.resolve(__dirname, '../..');
const SOURCES: readonly WalkerAffordanceSource[] = ['native', 'aria-role', 'handler', 'tabindex', 'platform-attr', 'own-cursor', 'none'];

describe('AC1 — affordance vocabulary agrees across the seam (N1)', () => {
  test('both sides count the same channels as interactive; own-cursor and none never are', () => {
    for (const source of SOURCES) {
      const product: ProductAffordanceSource = source;
      expect(productIsInteractive(product)).toBe(walkerIsInteractive(source));
    }
    expect(walkerIsInteractive('own-cursor')).toBe(false);
    expect(walkerIsInteractive('none')).toBe(false);
    expect(walkerIsInteractive('handler')).toBe(true);
  });
});

describe('AC2 — React detection can see React 16 (N2)', () => {
  const source = readFileSync(path.join(REPO_ROOT, 'workshop/substrate-study/application/dom-walk-capture.ts'), 'utf-8');
  test('in-page floor equals the exported twin', () => {
    const m = /const REACT_MARKER_NODE_FLOOR_IN = (\d+);/.exec(source);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(REACT_MARKER_NODE_FLOOR);
    expect(REACT_MARKER_NODE_FLOOR).toBe(10);
  });
  test('the in-page detector reads both key families and does not stop at the first element', () => {
    expect(source).toContain("key.startsWith('__reactInternalInstance$')");
    expect(source).toContain("key.startsWith('__reactEventHandlers$')");
    expect(source).toContain("key.startsWith('__reactFiber$')");
    expect(source).not.toContain('break; // Only check a few');
  });
});

describe('AC3 — ariaSnapshot parsing and summary (N3)', () => {
  const SNAPSHOT = [
    '- banner:',
    '  - link "Home"',
    '  - navigation "Main":',
    '    - menuitem "Products"',
    '    - menuitem "Say \\"hi\\""',
    '- main:',
    '  - searchbox "Search products"',
    '  - button "Filter" [pressed]',
    '  - button',
    '  - text: Some visible copy',
    '  - checkbox',
  ].join('\n');

  test('parses roles and names; unescapes quotes; skips text nodes', () => {
    const entries = parseAriaSnapshot(SNAPSHOT);
    expect(entries.map((e) => e.role)).toEqual(['banner', 'link', 'navigation', 'menuitem', 'menuitem', 'main', 'searchbox', 'button', 'button', 'checkbox']);
    expect(entries[4]!.name).toBe('Say "hi"');
    expect(entries[8]!.name).toBeNull();
  });

  test('summary counts interactive roles, unnamed interactives, and agreement with the walker', () => {
    const walker: readonly SnapshotNode[] = [
      stubNode({ path: 'a', tag: 'a', interaction: { ...stubNode().interaction, interactive: true, affordanceSource: 'native' }, ariaNaming: { label: null, accessibleName: 'Home', source: 'content' } }),
      stubNode({ path: 'b', tag: 'input', interaction: { ...stubNode().interaction, interactive: true, affordanceSource: 'native' }, ariaNaming: { label: null, accessibleName: 'Search  products', source: 'placeholder' } }),
      stubNode({ path: 'c', tag: 'div', interaction: { ...stubNode().interaction, interactive: true, affordanceSource: 'handler' }, ariaNaming: { label: null, accessibleName: 'Nowhere', source: 'content' } }),
      stubNode({ path: 'd', tag: 'div', ariaNaming: { label: null, accessibleName: 'Filter', source: 'content' } }),
    ];
    const s = summarizeAccessibility(parseAriaSnapshot(SNAPSHOT), walker);
    expect(s.interactiveTotal).toBe(7);
    expect(s.unnamedInteractive).toBe(2);
    expect(s.interactiveRoles).toEqual({ link: 1, menuitem: 2, searchbox: 1, button: 2, checkbox: 1 });
    // a + b agree (whitespace collapsed); c does not; d is not interactive so not compared.
    expect(s.walkerNameAgreement).toEqual({ compared: 3, agreed: 2 });
  });
});

describe('AC4 — every observed interactive AX role is a SurfaceRole (N4)', () => {
  test('roles from the 2026-09-17 fixture ⊆ SURFACE_ROLE_VALUES', () => {
    const fixture = JSON.parse(readFileSync(path.join(REPO_ROOT, 'workshop/observations/fixtures/reactive-agnostic-observations-2026-09-17.json'), 'utf-8')) as {
      routes: Record<string, { accessibilityTree: { interactiveRoles: Record<string, number> } }>;
    };
    const observed = new Set(Object.values(fixture.routes).flatMap((r) => Object.keys(r.accessibilityTree.interactiveRoles)));
    const roles = new Set<string>(SURFACE_ROLE_VALUES);
    const missing = [...observed].filter((r) => !roles.has(r));
    expect(missing, `interactive AX roles not in SurfaceRole: ${JSON.stringify(missing)}`).toEqual([]);
    expect(observed.size).toBeGreaterThanOrEqual(10);
    for (const r of observed) expect(AX_INTERACTIVE_ROLES).toContain(r);
  });
});

describe('AC5 — textbox intents admit the text-entry family (N4)', () => {
  const surface = (o: Partial<IndexedSurface> & Pick<IndexedSurface, 'surfaceId' | 'role'>): IndexedSurface => ({
    name: null, landmarkRole: null, classes: [], placeholder: null, text: null, affordanceSource: 'native', ancestors: [], ...o,
  });
  test('rolesAdmittedBy', () => {
    expect(rolesAdmittedBy('textbox')).toEqual(['textbox', 'searchbox', 'spinbutton']);
    expect(rolesAdmittedBy('button')).toEqual(['button']);
  });
  test('findByRole / findByRoleAndName on textbox reach searchbox and spinbutton; searchbox stays narrow', () => {
    const idx = surfaceIndexFromList([
      surface({ surfaceId: 'q', role: 'searchbox', name: 'Search products' }),
      surface({ surfaceId: 'n', role: 'spinbutton', name: 'Quantity' }),
      surface({ surfaceId: 't', role: 'textbox', name: 'Notes' }),
    ]);
    expect(idx.findByRole('textbox').map((s) => s.surfaceId)).toEqual(['q', 'n', 't']);
    expect(idx.findByRoleAndName('textbox', 'Quantity').map((s) => s.surfaceId)).toEqual(['n']);
    expect(idx.findByRole('searchbox').map((s) => s.surfaceId)).toEqual(['q']);
  });
});

describe('AC6 — block ownership from the manifest (N5)', () => {
  const BUNDLES = [
    '/App/scripts/OutSystemsUI.Interaction.Search.mvc.js',
    '/App/scripts/OutSystemsUI.Navigation.Pagination.mvc.js',
    '/App/scripts/OutSystemsUIWebsite.MainFlow.ItemOverview.mvc.js',
    '/App/scripts/OutSystemsUIWebsite.ScreenTemplatesWebPreview.Productcatalog.mvc.js',
    '/App/css/OutSystemsUI.Interaction.Search.css',
    '/App/scripts/OutSystems.js',
  ];
  test('parseBundlePath names module + block for .mvc.js only', () => {
    expect(parseBundlePath(BUNDLES[0]!)).toEqual({ module: 'OutSystemsUI', block: 'Interaction.Search' });
    expect(parseBundlePath('/App/scripts/OutSystemsUI.Interaction.Search.mvc.js?abc')).toEqual({ module: 'OutSystemsUI', block: 'Interaction.Search' });
    expect(parseBundlePath(BUNDLES[4]!)).toBeNull();
    expect(parseBundlePath(BUNDLES[5]!)).toBeNull();
  });
  test('every observed block resolves to exactly one module; unknown blocks are reported', () => {
    const owners = bundleOwnership(BUNDLES);
    expect(owners.get('Interaction.Search')).toBe('OutSystemsUI');
    const nodes = [
      stubNode({ path: 'a', dataAttrValues: { 'data-block': 'Interaction.Search' } }),
      stubNode({ path: 'b', dataAttrValues: { 'data-block': 'Interaction.Search' } }),
      stubNode({ path: 'c', dataAttrValues: { 'data-block': 'MainFlow.ItemOverview' } }),
      stubNode({ path: 'd', dataAttrValues: { 'data-block': 'Custom.Thing' } }),
      stubNode({ path: 'e' }),
    ];
    const ownership = partitionBlocksByOwner(BUNDLES, observedBlocks(nodes));
    expect(ownership.byModule).toEqual({
      OutSystemsUI: [{ block: 'Interaction.Search', nodes: 2 }],
      OutSystemsUIWebsite: [{ block: 'MainFlow.ItemOverview', nodes: 1 }],
    });
    expect(ownership.unresolved).toEqual([{ block: 'Custom.Thing', nodes: 1 }]);
    const claimed = Object.values(ownership.byModule).flat().map((b) => b.block);
    expect(new Set(claimed).size).toBe(claimed.length);
  });
  test('the 2026-09-17 fixture partition is disjoint across modules', () => {
    const fixture = JSON.parse(readFileSync(path.join(REPO_ROOT, 'workshop/observations/fixtures/reactive-agnostic-observations-2026-09-17.json'), 'utf-8')) as {
      dataBlockOwnership: Record<string, { block: string }[]>;
    };
    const all = Object.values(fixture.dataBlockOwnership).flat().map((b) => b.block);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('AC7 — static view-bundle facts (N6)', () => {
  const SOURCE = `define("OutSystemsUIWebsite.ScreenTemplatesWebPreview.Productcatalog.mvc$view", [], function() {
    var Search = require("OutSystemsUI.Interaction.Search.mvc$view");
    var Pager = require("OutSystemsUI.Navigation.Pagination.mvc$view");
    return React.createElement(Search, { prompt: "Search Product", onClick: function() {} },
      React.createElement("span", { onClick: h }, "Back to Overview"),
      React.createElement(Pager, { prompt: "Say \\"go\\"" }));
  });`;
  test('extracts prompts, block references and counts', () => {
    const facts = extractViewBundleFacts(SOURCE);
    expect(facts.prompts).toEqual(['Say "go"', 'Search Product']);
    expect(facts.blockRefs).toEqual([
      'OutSystemsUI.Interaction.Search',
      'OutSystemsUI.Navigation.Pagination',
      'OutSystemsUIWebsite.ScreenTemplatesWebPreview.Productcatalog',
    ]);
    expect(facts.onClickCount).toBe(2);
    expect(facts.createElementCount).toBe(3);
    expect(facts.bytes).toBe(SOURCE.length);
  });
  test('viewBundlePath resolves from viewModuleName + urlVersions', () => {
    const p = viewBundlePath('/OutSystemsUIWebsite/', 'OutSystemsUIWebsite.ScreenTemplatesWebPreview.Productcatalog.mvc$view', {
      '/OutSystemsUIWebsite/scripts/OutSystemsUIWebsite.ScreenTemplatesWebPreview.Productcatalog.mvc.js': '?v1',
    });
    expect(p).toBe('/OutSystemsUIWebsite/scripts/OutSystemsUIWebsite.ScreenTemplatesWebPreview.Productcatalog.mvc.js?v1');
    expect(viewBundlePath('/x', 'not-a-view', {})).toBeNull();
  });
});

describe('AC8 — chrome signatures (N7)', () => {
  const chromeAt = (prefix: string, depth: number): readonly SnapshotNode[] => [
    stubNode({ path: `${prefix} > header`, depth, tag: 'header', ariaRole: 'banner' }),
    stubNode({ path: `${prefix} > header > a`, depth: depth + 1, tag: 'a' }),
    stubNode({ path: `${prefix} > nav`, depth, tag: 'nav', ariaRole: 'navigation' }),
    stubNode({ path: `${prefix} > nav > div`, depth: depth + 1, tag: 'div', ariaRole: 'menu' }),
  ];
  test('identical chrome at different depths hashes the same; different chrome differs; absent landmark → null', () => {
    const a = computeChromeSignatures(chromeAt('body', 1));
    const b = computeChromeSignatures(chromeAt('body > div > div', 3));
    expect(a.banner).toEqual(b.banner);
    expect(a.navigation).toEqual(b.navigation);
    expect(a.banner!.nodes).toBe(2);
    const c = computeChromeSignatures([...chromeAt('body', 1), stubNode({ path: 'body > nav > div > span', depth: 3, tag: 'span' })]);
    expect(c.navigation!.signature).not.toBe(a.navigation!.signature);
    expect(computeChromeSignatures([stubNode({ path: 'body > main', tag: 'main', ariaRole: 'main' })])).toEqual({ banner: null, navigation: null });
  });
});
