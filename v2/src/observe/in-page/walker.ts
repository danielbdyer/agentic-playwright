/**
 * The product's eyes, inside the page.
 *
 * This module runs in the browser's main world (it must: handler ownership
 * is read from React's expando props, which only the main world can see).
 * It has no imports. scripts/build-inpage.mjs bundles it with esbuild into
 * one string (bundle.generated.ts) that runtime.ts evaluates as a string
 * expression, so no host transpiler (tsx keepNames, coverage) can inject
 * helpers into it, and the bundle's own top-level names stay local to the
 * evaluated function. The only global it leaves is `window.__tesseract`
 * (the ref registry) plus a mutation-counter key while a hydration wait is
 * in progress.
 *
 * Lifted from workshop/substrate-study/application/dom-walk-capture.ts and
 * product/instruments/tooling/discover-screen.ts, with the reality-study
 * corrections: implicit roles computed like Playwright's role engine,
 * accessible names computed in accname order (aria-labelledby before
 * aria-label, input values, img alt, title, label text minus embedded
 * controls), landmark / data-block / row context per node, fieldset and
 * aria-disabled inheritance, off-screen still visible, and a mutation
 * counter that is disconnected after each wait.
 */

// ─── Shapes shared with the Node side (imported there as types only) ──────

export type InPageNamingSource =
  | 'aria-labelledby' | 'aria-label' | 'label-for' | 'label-wrap' | 'placeholder'
  | 'title' | 'alt' | 'content' | 'value' | 'none';

export type InPageAffordance = 'native' | 'aria-role' | 'handler-owner' | 'tabindex' | 'none';

export type IdKind = 'designer' | 'structural' | 'plain';

/** Why an element became a node. Controls are interactive; the rest are kept for assertions and scoping. */
export type NodeCategory = 'control' | 'landmark' | 'heading' | 'row' | 'cell' | 'message' | 'dialog' | 'image';

export interface WalkScope {
  readonly landmark?: string;
  readonly landmarkName?: string;
  readonly dataBlock?: string;
}

export interface WalkOptions {
  readonly snapshotId: string;
  readonly scope?: WalkScope;
  /** Informational caps; controls are never capped in-page. */
  readonly maxCells?: number;
  readonly maxRows?: number;
}

export interface WalkNode {
  readonly ref: string;
  readonly role: string;
  readonly name: string;
  readonly namingSource: InPageNamingSource;
  readonly affordance: InPageAffordance;
  readonly interactive: boolean;
  readonly category: NodeCategory;
  readonly tag: string;
  readonly landmark?: string;
  readonly landmarkName?: string;
  readonly dataBlock?: string;
  readonly rowText?: string;
  readonly testId?: string;
  readonly testIdAttribute?: string;
  readonly id?: string;
  readonly idKind?: IdKind;
  readonly placeholder?: string;
  readonly inputType?: string;
  readonly level?: number;
  readonly checked?: boolean;
  readonly visible: boolean;
  readonly inViewport: boolean;
  readonly enabled: boolean;
}

export interface WalkStats {
  readonly elements: number;
  /** Elements whose only affordance is their own `cursor: pointer`: recorded, never admitted. */
  readonly ownCursorOnly: number;
  readonly cellsDropped: number;
  readonly rowsDropped: number;
}

export interface WalkResult {
  readonly snapshotId: string;
  /** location.href when the walk ran: the document the nodes belong to. */
  readonly url: string;
  readonly nodes: readonly WalkNode[];
  /** False when a scope was asked for and no matching container exists. */
  readonly scopeFound: boolean;
  readonly stats: WalkStats;
}

/** The raw (unredacted, uncapped) description of a registered element, for building locators. */
export interface RefDescription {
  readonly ref: string;
  readonly role: string;
  readonly name: string;
  readonly namingSource: InPageNamingSource;
  readonly affordance: InPageAffordance;
  readonly interactive: boolean;
  readonly category: NodeCategory;
  readonly tag: string;
  readonly labelText?: string;
  readonly placeholder?: string;
  readonly testId?: string;
  readonly testIdAttribute?: string;
  readonly id?: string;
  readonly idKind?: IdKind;
  readonly landmark?: string;
  readonly landmarkName?: string;
  readonly dataBlock?: string;
  readonly rowText?: string;
  /** Text of each cell of the enclosing row (or of the row itself), for row scoping. */
  readonly rowCells?: readonly string[];
  readonly inputType?: string;
  readonly visible: boolean;
}

export type RefStatus = 'ok' | 'no-registry' | 'stale' | 'unknown-ref' | 'detached';

export interface VariantSignals {
  readonly osuiClassCount: number;
  readonly osuiAnyTokenCount: number;
  readonly dataBlockCount: number;
  /** 'OutSystems' or 'OSFramework' when that runtime global exists. */
  readonly outSystemsRuntimeGlobal: string | null;
  readonly outSystemsScriptPresent: boolean;
  readonly osvstatePresent: boolean;
  readonly reactDetected: boolean;
  readonly angularDetected: boolean;
  readonly vueDetected: boolean;
}

export interface FingerprintInputs {
  readonly title: string;
  readonly landmarks: readonly string[];
  /** Counts per role over visible interactive elements (roleless clickables count as "generic"). */
  readonly roleCounts: Readonly<Record<string, number>>;
  readonly interactive: number;
  readonly rolelessInteractive: number;
  readonly placeholderOnlyInputs: number;
  readonly dataBlocks: number;
  readonly dataBlockNames: readonly string[];
  readonly runtimeGlobal: string | null;
}

export interface PageSignals {
  readonly title: string;
  readonly url: string;
  readonly variant: VariantSignals;
  readonly fingerprint: FingerprintInputs;
}

export interface HydrationPoll {
  /** Mutations seen since the counter was installed; -1 when the counter is gone (the page navigated). */
  readonly count: number;
  readonly readyState: string;
}

// ─── Vocabulary ────────────────────────────────────────────────────────────

const IGNORED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);

/** Marks Tesseract's own UI in the page (the flow recorder's Stop button): never part of what is observed. */
const IGNORE_ATTRIBUTE = 'data-tesseract-ignore';

/** Playwright's role list: a role attribute token outside it is ignored, exactly as getByRole ignores it. */
const VALID_ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button', 'caption', 'cell', 'checkbox',
  'code', 'columnheader', 'combobox', 'complementary', 'contentinfo', 'definition', 'deletion', 'dialog', 'directory',
  'document', 'emphasis', 'feed', 'figure', 'form', 'generic', 'grid', 'gridcell', 'group', 'heading', 'img',
  'insertion', 'link', 'list', 'listbox', 'listitem', 'log', 'main', 'mark', 'marquee', 'math', 'meter', 'menu',
  'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'navigation', 'none', 'note', 'option', 'paragraph',
  'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search',
  'searchbox', 'separator', 'slider', 'spinbutton', 'status', 'strong', 'subscript', 'superscript', 'switch', 'tab',
  'table', 'tablist', 'tabpanel', 'term', 'textbox', 'time', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid',
  'treeitem',
]);

/** Landmarks the walker reports and observation can scope by (dialog included: it scopes like one). */
const LANDMARK_ROLES = new Set([
  'banner', 'navigation', 'main', 'contentinfo', 'complementary', 'search', 'form', 'region', 'dialog',
]);

/** An explicit role from this set makes an element a control (affordance "aria-role"). */
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'searchbox', 'textbox', 'spinbutton',
  'checkbox', 'radio', 'combobox', 'option', 'switch', 'slider', 'treeitem',
]);

/**
 * Roles named from their content. Playwright's list plus listitem: a
 * clickable <li> is common in OutSystems menus and the agent needs to see
 * its text even though getByRole('listitem', { name }) will not match it
 * (the locator ladder then falls through to the text rung).
 */
const NAME_FROM_CONTENT = new Set([
  'button', 'cell', 'checkbox', 'columnheader', 'gridcell', 'heading', 'link', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'option', 'radio', 'row', 'rowheader', 'switch', 'tab', 'tooltip', 'treeitem', 'listitem',
]);

/** Roles whose accessible name is always empty in accname (Playwright's list). */
const PROHIBITS_NAMING = new Set([
  'caption', 'code', 'definition', 'deletion', 'emphasis', 'generic', 'insertion', 'mark', 'paragraph',
  'presentation', 'strong', 'subscript', 'suggestion', 'superscript', 'term', 'time',
]);

const CELL_ROLES = new Set(['cell', 'gridcell', 'columnheader', 'rowheader']);
const MESSAGE_ROLES = new Set(['alert', 'status', 'log']);
const ROLELESS = new Set(['generic', 'none', 'presentation']);

const PRESENTATION_PARENTS: Readonly<Record<string, readonly string[]>> = {
  DD: ['DL', 'DIV'], DIV: ['DL'], DT: ['DL', 'DIV'], LI: ['OL', 'UL'], TBODY: ['TABLE'], TD: ['TR'],
  TFOOT: ['TABLE'], TH: ['TR'], THEAD: ['TABLE'], TR: ['THEAD', 'TBODY', 'TFOOT', 'TABLE'],
};

const NAMING_PROHIBITED_FOR: readonly string[] = [
  'caption', 'code', 'deletion', 'emphasis', 'generic', 'insertion', 'paragraph', 'presentation', 'strong', 'subscript',
  'superscript',
];
const GLOBAL_ARIA: ReadonlyArray<readonly [string, readonly string[] | null]> = [
  ['aria-atomic', null], ['aria-busy', null], ['aria-controls', null], ['aria-current', null],
  ['aria-describedby', null], ['aria-details', null], ['aria-dropeffect', null], ['aria-flowto', null],
  ['aria-grabbed', null], ['aria-hidden', null], ['aria-keyshortcuts', null],
  ['aria-label', NAMING_PROHIBITED_FOR], ['aria-labelledby', NAMING_PROHIBITED_FOR],
  ['aria-live', null], ['aria-owns', null], ['aria-relevant', null], ['aria-roledescription', ['generic']],
];

/** A roleless clickable is admitted only when its own text is short and it wraps no other control. */
const ROLELESS_TEXT_MAX = 80;
const NESTED_CONTROL = '[role], a[href], button, input, select, textarea';
const CONTROL_ANCESTOR = 'a[href], button, [role=button], [role=link], [role=menuitem], [role=tab], [role=option], [role=checkbox], [role=radio], [role=switch]';
const CELL_INTERACTIVE = 'a[href], button, input, select, textarea, [role=button], [role=link], [role=checkbox], [onclick], [tabindex], [data-link], [data-button]';

const NAME_CAP = 120;
const RAW_NAME_CAP = 1000;
const LANDMARK_NAME_CAP = 80;
const ROW_TEXT_CAP = 160;
const CELL_TEXT_CAP = 80;
const MAX_ROW_CELLS = 8;

/**
 * OutSystems compiled ids: `b3-Column`, `l1-0_0-$b2`, `l2_0-2_0-Select`
 * (lifted from workshop/substrate-study/application/reality-stats.ts),
 * plus prefix shapes for ids whose designer leaf carries an underscore
 * (`b3-Input_Search`), Traditional-Web `wt12_` chains, React useId ids and
 * GUIDs. All of them change when the screen is republished.
 */
const STRUCTURAL_ID_RE =
  /^(?:(?:b\d+|l\d+(?:_\d+)?-\d+_\d+)-)*(?:\$b\d+|(?:b\d+|l\d+(?:_\d+)?-\d+_\d+)-[A-Za-z][A-Za-z0-9]*)$/;
const STRUCTURAL_PREFIXES: readonly RegExp[] = [
  /^b\d+-/, /^l\d+(?:_\d+)?-\d+_\d+-/, /^\$b\d+/, /^[A-Za-z]+\d*_?\d+-/, /(?:^|_)wtt?\d+_/, /^:r[0-9a-z]+:$/i,
  /^[0-9a-f]{8}-[0-9a-f]{4}-/i,
];
/** A designer id is the widget's Name property: an identifier with a word in it and no long digit run. */
const DESIGNER_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const REGISTRY_KEY = '__tesseract';

// ─── Per-call caches ───────────────────────────────────────────────────────

interface Ctx {
  readonly styles: Map<Element, CSSStyleDeclaration>;
  readonly roles: Map<Element, string | null>;
  readonly hidden: Map<Element, boolean>;
  readonly rowTexts: Map<Element, string>;
  readonly landmarkNames: Map<Element, string>;
}

const newCtx = (): Ctx => ({ styles: new Map(), roles: new Map(), hidden: new Map(), rowTexts: new Map(), landmarkNames: new Map() });

// ─── DOM helpers ───────────────────────────────────────────────────────────

/** A form with a control named "tagName" shadows the property; Playwright guards the same way. */
const tagOf = (el: Element): string => (el instanceof HTMLFormElement ? 'FORM' : String(el.tagName).toUpperCase());

const parentOf = (el: Element): Element | null => {
  if (el.parentElement !== null) return el.parentElement;
  const node = el.parentNode;
  if (node !== null && node.nodeType === 11) {
    const host = (node as ShadowRoot).host;
    return host === undefined ? null : host;
  }
  return null;
};

const closestCross = (start: Element | null, test: (el: Element) => boolean): Element | null => {
  for (let cur = start; cur !== null; cur = parentOf(cur)) {
    if (test(cur)) return cur;
  }
  return null;
};

/** Depth-first, document order, entering open shadow roots; `visit` returns false to skip a subtree. */
const forEachElement = (root: Element, visit: (el: Element) => boolean): void => {
  const stack: Element[] = [root];
  while (stack.length > 0) {
    const el = stack.pop();
    if (el === undefined) break;
    if (IGNORED_TAGS.has(tagOf(el)) || el.hasAttribute(IGNORE_ATTRIBUTE)) continue;
    if (!visit(el)) continue;
    const children: Element[] = [];
    for (let child = el.firstElementChild; child !== null; child = child.nextElementSibling) children.push(child);
    const shadow = el.shadowRoot;
    if (shadow !== null) {
      for (let child = shadow.firstElementChild; child !== null; child = child.nextElementSibling) children.push(child);
    }
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (child !== undefined) stack.push(child);
    }
  }
};

const styleOf = (el: Element, ctx: Ctx): CSSStyleDeclaration => {
  const cached = ctx.styles.get(el);
  if (cached !== undefined) return cached;
  const style = window.getComputedStyle(el);
  ctx.styles.set(el, style);
  return style;
};

const flat = (text: string): string => text.replace(/[​­]/g, '').replace(/\s+/g, ' ').trim();

const cap = (text: string, max: number): string => (text.length > max ? text.slice(0, max).trimEnd() : text);

const attr = (el: Element, name: string): string | null => {
  const value = el.getAttribute(name);
  return value === null ? null : value;
};

// ─── Roles (mirrors Playwright's role engine so getByRole agrees) ─────────

const explicitRole = (el: Element): string | null => {
  const raw = el.getAttribute('role');
  if (raw === null) return null;
  for (const token of raw.split(' ')) {
    const role = token.trim();
    if (VALID_ROLES.has(role)) return role;
  }
  return null;
};

const hasExplicitName = (el: Element): boolean => el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby');

const hasGlobalAria = (el: Element, forRole: string | null): boolean =>
  GLOBAL_ARIA.some(([name, prohibited]) => !(prohibited !== null && prohibited.includes(forRole ?? '')) && el.hasAttribute(name));

const hasTabIndex = (el: Element): boolean => !Number.isNaN(Number(String(el.getAttribute('tabindex'))));

const belongsToDisabledFieldset = (el: Element): boolean => {
  const fieldset = el.closest('fieldset[disabled]');
  if (fieldset === null) return false;
  const legend = fieldset.querySelector(':scope > legend');
  return legend === null || !legend.contains(el);
};

const nativelyDisabled = (el: Element): boolean => {
  const tag = tagOf(el);
  const formControl = tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'OPTION' || tag === 'OPTGROUP';
  if (!formControl) return false;
  if (el.hasAttribute('disabled')) return true;
  if (tag === 'OPTION' && el.closest('optgroup[disabled]') !== null) return true;
  return belongsToDisabledFieldset(el);
};

const nativelyFocusable = (el: Element): boolean => {
  const tag = tagOf(el);
  if (tag === 'BUTTON' || tag === 'DETAILS' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
  if (tag === 'A' || tag === 'AREA') return el.hasAttribute('href');
  if (tag === 'INPUT') return !(el as HTMLInputElement).hidden;
  return false;
};

const isFocusable = (el: Element): boolean => !nativelyDisabled(el) && (nativelyFocusable(el) || hasTabIndex(el));

const SECTIONING = 'article:not([role]), aside:not([role]), main:not([role]), nav:not([role]), section:not([role]), [role=article], [role=complementary], [role=main], [role=navigation], [role=region]';

/** header/footer are banner/contentinfo only outside sectioning content. */
const insideSectioning = (el: Element): boolean => closestCross(el, (cur) => cur.matches(SECTIONING)) !== null;

const inputRole = (el: HTMLInputElement): string | null => {
  const type = el.type.toLowerCase();
  const list = el.getAttribute('list');
  const hasDatalist = list !== null && list.length > 0 && document.getElementById(list)?.tagName === 'DATALIST';
  if (type === 'search') return el.hasAttribute('list') ? 'combobox' : 'searchbox';
  if (type === 'email' || type === 'tel' || type === 'text' || type === 'url' || type === '') return hasDatalist ? 'combobox' : 'textbox';
  if (type === 'hidden') return null;
  if (type === 'file') return 'button';
  const byType: Readonly<Record<string, string>> = {
    button: 'button', checkbox: 'checkbox', image: 'button', number: 'spinbutton', radio: 'radio', range: 'slider',
    reset: 'button', submit: 'button',
  };
  return byType[type] ?? 'textbox';
};

const inGrid = (el: Element): boolean => {
  const table = el.closest('table');
  const role = table === null ? null : explicitRole(table);
  return role === 'grid' || role === 'treegrid';
};

const implicitRoleOf = (el: Element): string | null => {
  const tag = tagOf(el);
  switch (tag) {
    case 'A':
    case 'AREA':
      return el.hasAttribute('href') ? 'link' : null;
    case 'ARTICLE': return 'article';
    case 'ASIDE': return 'complementary';
    case 'BUTTON': return 'button';
    case 'DATALIST': return 'listbox';
    case 'DD': return 'definition';
    case 'DETAILS': return 'group';
    case 'DIALOG': return 'dialog';
    case 'DFN':
    case 'DT':
      return 'term';
    case 'FIELDSET': return 'group';
    case 'FIGURE': return 'figure';
    case 'FOOTER': return insideSectioning(el) ? null : 'contentinfo';
    case 'FORM': return hasExplicitName(el) ? 'form' : null;
    case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
      return 'heading';
    case 'HEADER': return insideSectioning(el) ? null : 'banner';
    case 'HR': return 'separator';
    case 'IMG':
      return el.getAttribute('alt') === '' && !el.getAttribute('title') && !hasGlobalAria(el, null) && !hasTabIndex(el)
        ? 'presentation'
        : 'img';
    case 'INPUT': return inputRole(el as HTMLInputElement);
    case 'LI': return 'listitem';
    case 'MAIN': return 'main';
    case 'MENU':
    case 'OL':
    case 'UL':
      return 'list';
    case 'METER': return 'meter';
    case 'NAV': return 'navigation';
    case 'OPTGROUP': return 'group';
    case 'OPTION': return 'option';
    case 'OUTPUT': return 'status';
    case 'P': return 'paragraph';
    case 'PROGRESS': return 'progressbar';
    case 'SEARCH': return 'search';
    case 'SECTION': return hasExplicitName(el) ? 'region' : null;
    case 'SELECT': return el.hasAttribute('multiple') || (el as HTMLSelectElement).size > 1 ? 'listbox' : 'combobox';
    case 'SVG': return 'img';
    case 'TABLE': return 'table';
    case 'TBODY':
    case 'THEAD':
    case 'TFOOT':
      return 'rowgroup';
    case 'TD': return inGrid(el) ? 'gridcell' : 'cell';
    case 'TH': {
      const scope = el.getAttribute('scope');
      if (scope === 'col') return 'columnheader';
      if (scope === 'row') return 'rowheader';
      return inGrid(el) ? 'gridcell' : 'cell';
    }
    case 'TEXTAREA': return 'textbox';
    case 'TR': return 'row';
    default: return null;
  }
};

/** Implicit role with presentational-parent inheritance (li in ul[role=presentation] is presentation too). */
const implicitWithInheritance = (el: Element): string | null => {
  const implicit = implicitRoleOf(el);
  if (implicit === null) return null;
  let ancestor: Element = el;
  for (;;) {
    const parent = parentOf(ancestor);
    const parents = PRESENTATION_PARENTS[tagOf(ancestor)];
    if (parents === undefined || parent === null || !parents.includes(tagOf(parent))) break;
    const parentRole = explicitRole(parent);
    if ((parentRole === 'none' || parentRole === 'presentation') && !(hasGlobalAria(parent, parentRole) || isFocusable(parent))) {
      return parentRole;
    }
    ancestor = parent;
  }
  return implicit;
};

const roleOf = (el: Element, ctx: Ctx): string | null => {
  if (ctx.roles.has(el)) return ctx.roles.get(el) ?? null;
  const explicit = explicitRole(el);
  let role: string | null;
  if (explicit === null) {
    role = implicitWithInheritance(el);
  } else if (explicit === 'none' || explicit === 'presentation') {
    const implicit = implicitWithInheritance(el);
    role = hasGlobalAria(el, implicit) || isFocusable(el) ? implicit : explicit;
  } else {
    role = explicit;
  }
  ctx.roles.set(el, role);
  return role;
};

// ─── Visibility ────────────────────────────────────────────────────────────

const styleVisible = (el: Element, style: CSSStyleDeclaration): boolean => {
  if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) return false;
  return style.visibility === 'visible';
};

const textNodeVisible = (node: Node): boolean => {
  const range = document.createRange();
  range.selectNode(node);
  const rect = range.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

/** Playwright's visibility: a non-empty box with visibility:visible (opacity does not matter). */
const isVisible = (el: Element, ctx: Ctx): boolean => {
  const style = styleOf(el, ctx);
  if (style.display === 'contents') {
    for (let child = el.firstChild; child !== null; child = child.nextSibling) {
      if (child.nodeType === 1 && isVisible(child as Element, ctx)) return true;
      if (child.nodeType === 3 && textNodeVisible(child)) return true;
    }
    return false;
  }
  if (!styleVisible(el, style)) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const inViewport = (el: Element): boolean => {
  const rect = el.getBoundingClientRect();
  return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
};

const displayNoneOrAriaHidden = (el: Element, ctx: Ctx): boolean => {
  const cached = ctx.hidden.get(el);
  if (cached !== undefined) return cached;
  let hidden = false;
  const parent = el.parentElement;
  if (parent !== null && parent.shadowRoot !== null && el.assignedSlot === null) hidden = true;
  if (!hidden) {
    hidden = styleOf(el, ctx).display === 'none' || (el.getAttribute('aria-hidden') ?? '').toLowerCase() === 'true';
  }
  if (!hidden) {
    const up = parentOf(el);
    if (up !== null) hidden = displayNoneOrAriaHidden(up, ctx);
  }
  ctx.hidden.set(el, hidden);
  return hidden;
};

/** Hidden from the accessibility tree: such text never contributes to a name. */
const isHiddenForAria = (el: Element, ctx: Ctx): boolean => {
  const tag = tagOf(el);
  if (IGNORED_TAGS.has(tag)) return true;
  const style = styleOf(el, ctx);
  if (style.display === 'contents' && tag !== 'SLOT') {
    for (let child = el.firstChild; child !== null; child = child.nextSibling) {
      if (child.nodeType === 1 && !isHiddenForAria(child as Element, ctx)) return false;
      if (child.nodeType === 3 && textNodeVisible(child)) return false;
    }
    return true;
  }
  const optionInSelect = tag === 'OPTION' && el.closest('select') !== null;
  if (!optionInSelect && tag !== 'SLOT' && !styleVisible(el, style)) return true;
  return displayNoneOrAriaHidden(el, ctx);
};

// ─── Accessible names ──────────────────────────────────────────────────────

interface NameResult {
  readonly name: string;
  readonly source: InPageNamingSource;
}

const NO_NAME: NameResult = { name: '', source: 'none' };

interface TextOptions {
  /** The element being named: never contributes to its own name from inside a label or labelledby target. */
  readonly target: Element;
  readonly includeHidden: boolean;
}

const unescapeCss = (text: string): string =>
  text.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([\s\S])/g, (_m, hex: string | undefined, ch: string | undefined) =>
    hex !== undefined ? String.fromCodePoint(Number.parseInt(hex, 16)) : (ch ?? ''));

/** String content of ::before/::after (icon fonts contribute here exactly as they do for Playwright). */
const pseudoText = (el: Element, pseudo: '::before' | '::after'): string => {
  const style = window.getComputedStyle(el, pseudo);
  if (style.display === 'none' || style.visibility === 'hidden') return '';
  const content = style.content;
  if (content === '' || content === 'none' || content === 'normal') return '';
  const parts: string[] = [];
  const re = /"((?:[^"\\]|\\[\s\S])*)"|'((?:[^'\\]|\\[\s\S])*)'/g;
  for (let match = re.exec(content); match !== null; match = re.exec(content)) {
    parts.push(unescapeCss(match[1] ?? match[2] ?? ''));
  }
  const text = parts.join('');
  return text.length > 0 && style.display !== 'inline' ? ` ${text} ` : text;
};

const CONTROL_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

/**
 * Accumulated text of a subtree, accname-style: block boxes are separated
 * by spaces, img alt and aria-label stand in for content, hidden subtrees
 * are skipped. Embedded form controls contribute nothing (except button-
 * like inputs' captions): accname would read a textbox's value into the
 * label's text, which is how "Notes secret john@x.com" leaked in v1.
 */
const textOf = (root: Element, ctx: Ctx, options: TextOptions): string => {
  const out: string[] = [];
  const visitNode = (node: Node, skipSlotted: boolean): void => {
    if (node.nodeType === 3) {
      out.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (skipSlotted && el.assignedSlot !== null) return;
    visitElement(el, false);
  };
  const visitElement = (el: Element, isRoot: boolean): void => {
    const tag = tagOf(el);
    if (IGNORED_TAGS.has(tag)) return;
    if (!isRoot && el === options.target) return;
    if (!options.includeHidden && el !== options.target && isHiddenForAria(el, ctx)) return;
    let token: string | null = null;
    if (el !== options.target) {
      if (CONTROL_TAGS.has(tag)) {
        const type = tag === 'INPUT' ? (el as HTMLInputElement).type.toLowerCase() : '';
        token = type === 'submit' || type === 'button' || type === 'reset' ? (el as HTMLInputElement).value : '';
      } else {
        const label = el.getAttribute('aria-label');
        if (label !== null && label.trim().length > 0) token = label;
        else if (tag === 'IMG' || tag === 'AREA') token = el.getAttribute('alt') || el.getAttribute('title') || '';
      }
    }
    const block = styleOf(el, ctx).display !== 'inline' || tag === 'BR';
    if (block) out.push(' ');
    if (token !== null) {
      out.push(token);
    } else {
      out.push(pseudoText(el, '::before'));
      if (tag === 'SLOT') {
        const assigned = (el as HTMLSlotElement).assignedNodes();
        if (assigned.length > 0) assigned.forEach((child) => visitNode(child, false));
        else for (let child = el.firstChild; child !== null; child = child.nextSibling) visitNode(child, true);
      } else {
        for (let child = el.firstChild; child !== null; child = child.nextSibling) visitNode(child, true);
        const shadow = el.shadowRoot;
        if (shadow !== null) for (let child = shadow.firstChild; child !== null; child = child.nextSibling) visitNode(child, true);
      }
      out.push(pseudoText(el, '::after'));
    }
    if (block) out.push(' ');
  };
  visitElement(root, true);
  return flat(out.join(''));
};

const idRefs = (el: Element, value: string | null): Element[] => {
  if (value === null || value.trim().length === 0) return [];
  const root = el.getRootNode();
  const lookup = root as Partial<Document>;
  if (typeof lookup.getElementById !== 'function') return [];
  const refs: Element[] = [];
  for (const id of value.split(/\s+/)) {
    if (id.length === 0) continue;
    const ref = lookup.getElementById.call(root, id);
    if (ref !== null && !refs.includes(ref)) refs.push(ref);
  }
  return refs;
};

const labelsOf = (el: Element): HTMLLabelElement[] => {
  const labels = (el as HTMLInputElement).labels;
  return labels === null || labels === undefined ? [] : Array.from(labels);
};

/** Joined text of the associated labels; the source says whether the first one wraps or points at the control. */
const fromLabels = (el: Element, labels: readonly HTMLLabelElement[], ctx: Ctx): NameResult => {
  const texts = labels
    .map((label) => ({ label, text: textOf(label, ctx, { target: el, includeHidden: isHiddenForAria(label, ctx) }) }))
    .filter((entry) => entry.text.length > 0);
  const first = texts[0];
  if (first === undefined) return NO_NAME;
  return { name: flat(texts.map((entry) => entry.text).join(' ')), source: first.label.contains(el) ? 'label-wrap' : 'label-for' };
};

const titleName = (el: Element): NameResult => {
  const title = flat(el.getAttribute('title') ?? '');
  return title.length > 0 ? { name: title, source: 'title' } : NO_NAME;
};

const firstChildTagged = (el: Element, tag: string): Element | null => {
  for (let child = el.firstElementChild; child !== null; child = child.nextElementSibling) {
    if (tagOf(child) === tag) return child;
  }
  return null;
};

/**
 * The accname ladder, in Playwright's order: aria-labelledby, aria-label,
 * native text alternatives (input value, labels, title-before-placeholder,
 * legend/caption, img alt), content for content-named roles, title.
 */
const accName = (el: Element, role: string | null, ctx: Ctx): NameResult => {
  if (role !== null && PROHIBITS_NAMING.has(role)) return NO_NAME;
  const selfHidden = isHiddenForAria(el, ctx);
  const labelledBy = idRefs(el, el.getAttribute('aria-labelledby'));
  if (labelledBy.length > 0) {
    const name = flat(labelledBy.map((ref) => textOf(ref, ctx, { target: el, includeHidden: isHiddenForAria(ref, ctx) })).join(' '));
    if (name.length > 0) return { name, source: 'aria-labelledby' };
  }
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel !== null && ariaLabel.trim().length > 0) return { name: flat(ariaLabel), source: 'aria-label' };

  const tag = tagOf(el);
  const presentational = role === 'none' || role === 'presentation';
  if (!presentational) {
    if (tag === 'INPUT') {
      const input = el as HTMLInputElement;
      const type = input.type.toLowerCase();
      if (type === 'button' || type === 'submit' || type === 'reset') {
        const value = flat(input.value);
        if (value.length > 0) return { name: value, source: 'value' };
        if (type === 'submit') return { name: 'Submit', source: 'value' };
        if (type === 'reset') return { name: 'Reset', source: 'value' };
        return titleName(el);
      }
      if (type === 'image') {
        const labels = labelsOf(el);
        if (labels.length > 0) return fromLabels(el, labels, ctx);
        const alt = flat(el.getAttribute('alt') ?? '');
        if (alt.length > 0) return { name: alt, source: 'alt' };
        const title = titleName(el);
        return title.source !== 'none' ? title : { name: 'Submit', source: 'value' };
      }
      if (type === 'file') {
        const labels = labelsOf(el);
        return labels.length > 0 ? fromLabels(el, labels, ctx) : { name: 'Choose File', source: 'value' };
      }
    }
    if (tag === 'BUTTON' && labelledBy.length === 0) {
      const labels = labelsOf(el);
      if (labels.length > 0) return fromLabels(el, labels, ctx);
    }
    if ((tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'INPUT') && labelledBy.length === 0) {
      const labels = labelsOf(el);
      if (labels.length > 0) return fromLabels(el, labels, ctx);
      const type = tag === 'INPUT' ? (el as HTMLInputElement).type.toLowerCase() : '';
      const usePlaceholder = tag === 'TEXTAREA' || (tag === 'INPUT' && ['text', 'password', 'search', 'tel', 'email', 'url'].includes(type));
      const title = titleName(el);
      if (!usePlaceholder || title.source !== 'none') return title;
      const placeholder = flat(el.getAttribute('placeholder') ?? '');
      return placeholder.length > 0 ? { name: placeholder, source: 'placeholder' } : NO_NAME;
    }
    if ((tag === 'FIELDSET' || tag === 'FIGURE' || tag === 'TABLE') && labelledBy.length === 0) {
      const captionTag = tag === 'FIELDSET' ? 'LEGEND' : tag === 'FIGURE' ? 'FIGCAPTION' : 'CAPTION';
      const caption = firstChildTagged(el, captionTag);
      if (caption !== null) {
        const text = textOf(caption, ctx, { target: el, includeHidden: isHiddenForAria(caption, ctx) });
        if (text.length > 0) return { name: text, source: 'content' };
      }
      if (tag !== 'TABLE') return titleName(el);
    }
    if (tag === 'IMG' || tag === 'AREA') {
      const alt = flat(el.getAttribute('alt') ?? '');
      if (alt.length > 0) return { name: alt, source: 'alt' };
      return titleName(el);
    }
  }
  if ((role !== null && NAME_FROM_CONTENT.has(role)) || (tag === 'SUMMARY' && !presentational)) {
    const content = textOf(el, ctx, { target: el, includeHidden: selfHidden });
    if (content.length > 0) return { name: content, source: 'content' };
  }
  if (!presentational) return titleName(el);
  return NO_NAME;
};

// ─── Affordance ────────────────────────────────────────────────────────────

/** onclick attribute, or a React 16 (__reactEventHandlers$) / 17+ (__reactProps$) onClick function. */
const ownsClickHandler = (el: Element): boolean => {
  if (el.hasAttribute('onclick')) return true;
  const record = el as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key.startsWith('__reactProps$') || key.startsWith('__reactEventHandlers$')) {
      const props = record[key];
      if (props !== null && typeof props === 'object' && typeof (props as Record<string, unknown>)['onClick'] === 'function') return true;
    }
  }
  return false;
};

/**
 * The affordance ladder: the first channel that fires wins. OutSystems
 * `data-link` / `data-button` count as tabindex-equivalent. An element's own
 * `cursor: pointer` is recorded in the stats but never makes it a control:
 * the cursor inherits to every descendant and over-counted roleless
 * controls tenfold in the study.
 */
const affordanceOf = (el: Element, role: string | null): InPageAffordance => {
  const tag = tagOf(el);
  if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'SUMMARY') return 'native';
  if (tag === 'INPUT') return (el as HTMLInputElement).type.toLowerCase() === 'hidden' ? 'none' : 'native';
  if ((tag === 'A' || tag === 'AREA') && el.hasAttribute('href')) return 'native';
  if (role !== null && INTERACTIVE_ROLES.has(role)) return 'aria-role';
  if (ownsClickHandler(el)) return 'handler-owner';
  const tabindex = el.getAttribute('tabindex');
  if (tabindex !== null && Number.parseInt(tabindex, 10) >= 0) return 'tabindex';
  if (el.hasAttribute('data-link') || el.hasAttribute('data-button')) return 'tabindex';
  return 'none';
};

const isRoleless = (role: string | null): boolean => role === null || ROLELESS.has(role);

const isOwnCursorOnly = (el: Element, ctx: Ctx): boolean => {
  if (styleOf(el, ctx).cursor !== 'pointer') return false;
  const parent = parentOf(el);
  return parent === null || styleOf(parent, ctx).cursor !== 'pointer';
};

const isFeedbackMessage = (el: Element): boolean => el.classList.contains('feedback-message');

// ─── Classification ────────────────────────────────────────────────────────

interface Classified {
  readonly role: string;
  readonly rawRole: string | null;
  readonly affordance: InPageAffordance;
  readonly interactive: boolean;
  readonly category: NodeCategory;
  /** Set for admitted roleless clickables: their own short text is their name. */
  readonly ownText?: string;
}

/** Decide whether an element becomes a node, and what kind. Null means "not a node". */
const classify = (el: Element, ctx: Ctx): Classified | null => {
  const tag = tagOf(el);
  // Options of a native select are reached through selectOption, never as targets.
  if ((tag === 'OPTION' || tag === 'OPTGROUP') && el.closest('select, datalist') !== null) return null;
  if (tag === 'INPUT' && (el as HTMLInputElement).type.toLowerCase() === 'hidden') return null;
  const rawRole = roleOf(el, ctx);
  const affordance = affordanceOf(el, rawRole);
  if (affordance !== 'none') {
    if (!isRoleless(rawRole)) {
      return { role: rawRole ?? 'generic', rawRole, affordance, interactive: true, category: 'control' };
    }
    // Roleless clickables are admitted only as short-text handler owners that wrap no other control.
    const parent = parentOf(el);
    if (parent !== null && closestCross(parent, (cur) => cur.matches(CONTROL_ANCESTOR)) !== null) return null;
    if (el.querySelector(NESTED_CONTROL) !== null) return null;
    const text = textOf(el, ctx, { target: el, includeHidden: isHiddenForAria(el, ctx) });
    if (text.length === 0 || text.length > ROLELESS_TEXT_MAX) return null;
    return { role: 'generic', rawRole, affordance, interactive: true, category: 'control', ownText: text };
  }
  if (rawRole === null || ROLELESS.has(rawRole)) {
    return isFeedbackMessage(el)
      ? { role: 'generic', rawRole, affordance, interactive: false, category: 'message' }
      : null;
  }
  const info = (category: NodeCategory): Classified => ({ role: rawRole, rawRole, affordance, interactive: false, category });
  if (rawRole === 'dialog' || rawRole === 'alertdialog') return info('dialog');
  if (LANDMARK_ROLES.has(rawRole)) return info('landmark');
  if (rawRole === 'heading') return info('heading');
  if (rawRole === 'row') return info('row');
  if (CELL_ROLES.has(rawRole)) {
    if (el.querySelector(CELL_INTERACTIVE) !== null) return null;
    if (closestCross(parentOf(el), (cur) => roleOf(cur, ctx) === 'row') === null) return null;
    return info('cell');
  }
  if (MESSAGE_ROLES.has(rawRole) || isFeedbackMessage(el)) return info('message');
  if (rawRole === 'img' && tag === 'IMG' && (el.getAttribute('alt') ?? '').trim().length > 0) {
    // An image inside a link or button is part of that control's name, not a target of its own.
    const parent = parentOf(el);
    if (parent !== null && closestCross(parent, (cur) => cur.matches(CONTROL_ANCESTOR)) !== null) return null;
    return info('image');
  }
  return null;
};

// ─── Context: landmark, block, row ─────────────────────────────────────────

interface LandmarkContext {
  readonly role: string;
  readonly name: string;
}

const landmarkOf = (el: Element, ctx: Ctx): LandmarkContext | null => {
  for (let cur = parentOf(el); cur !== null; cur = parentOf(cur)) {
    const role = roleOf(cur, ctx);
    if (role !== null && LANDMARK_ROLES.has(role)) {
      let name = ctx.landmarkNames.get(cur);
      if (name === undefined) {
        name = accName(cur, role, ctx).name;
        ctx.landmarkNames.set(cur, name);
      }
      return { role, name };
    }
  }
  return null;
};

const dataBlockOf = (el: Element): string | null => {
  const block = closestCross(el, (cur) => cur.hasAttribute('data-block'));
  const value = block === null ? null : block.getAttribute('data-block');
  return value === null || value.length === 0 ? null : value;
};

const rowOf = (el: Element, ctx: Ctx): Element | null => closestCross(parentOf(el), (cur) => roleOf(cur, ctx) === 'row');

const rowTextOf = (row: Element, ctx: Ctx): string => {
  const cached = ctx.rowTexts.get(row);
  if (cached !== undefined) return cached;
  const text = textOf(row, ctx, { target: row, includeHidden: false });
  ctx.rowTexts.set(row, text);
  return text;
};

const rowCellsOf = (row: Element, ctx: Ctx): string[] => {
  const cells: string[] = [];
  forEachElement(row, (cur) => {
    if (cur === row) return true;
    const role = roleOf(cur, ctx);
    if (role === 'row') return false;
    if (role !== null && CELL_ROLES.has(role)) {
      const text = cap(textOf(cur, ctx, { target: cur, includeHidden: false }), CELL_TEXT_CAP);
      if (text.length > 0 && cells.length < MAX_ROW_CELLS) cells.push(text);
      return false;
    }
    return true;
  });
  return cells;
};

const idKindOf = (id: string): IdKind => {
  if (STRUCTURAL_ID_RE.test(id) || STRUCTURAL_PREFIXES.some((re) => re.test(id))) return 'structural';
  if (DESIGNER_ID_RE.test(id) && /[A-Za-z]{3,}/.test(id) && !/\d{4,}/.test(id)) return 'designer';
  return 'plain';
};

const testIdOf = (el: Element): { readonly value: string; readonly attribute: string } | null => {
  for (const name of ['data-testid', 'os-test-id']) {
    const value = attr(el, name);
    if (value !== null && value.length > 0) return { value, attribute: name };
  }
  return null;
};

const ariaDisabled = (el: Element): boolean => {
  for (let cur: Element | null = el; cur !== null; cur = parentOf(cur)) {
    const value = (cur.getAttribute('aria-disabled') ?? '').toLowerCase();
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return false;
};

const checkedOf = (el: Element, role: string): boolean | undefined => {
  if (tagOf(el) === 'INPUT') {
    const type = (el as HTMLInputElement).type.toLowerCase();
    if (type === 'checkbox' || type === 'radio') return (el as HTMLInputElement).checked;
  }
  if (['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio'].includes(role)) {
    return el.getAttribute('aria-checked') === 'true';
  }
  return undefined;
};

const levelOf = (el: Element, role: string): number | undefined => {
  const match = /^H([1-6])$/.exec(tagOf(el));
  if (match !== null && match[1] !== undefined) return Number(match[1]);
  if (role !== 'heading') return undefined;
  const level = Number(el.getAttribute('aria-level'));
  return Number.isInteger(level) && level >= 1 ? level : undefined;
};

// ─── Node construction ─────────────────────────────────────────────────────

interface Facts {
  readonly role: string;
  readonly name: string;
  readonly namingSource: InPageNamingSource;
  readonly affordance: InPageAffordance;
  readonly interactive: boolean;
  readonly category: NodeCategory;
  readonly tag: string;
  readonly landmark: LandmarkContext | null;
  readonly dataBlock: string | null;
  readonly row: Element | null;
  readonly testId: { readonly value: string; readonly attribute: string } | null;
  readonly id: string | null;
  readonly placeholder: string | null;
  readonly inputType: string | null;
  readonly visible: boolean;
}

const factsOf = (el: Element, classified: Classified, ctx: Ctx): Facts => {
  const tag = tagOf(el);
  let naming: NameResult;
  if (classified.ownText !== undefined) {
    naming = { name: classified.ownText, source: 'content' };
  } else {
    naming = accName(el, classified.rawRole, ctx);
    // Messages and rows are asserted on by their text even where accname gives them no name.
    if (naming.name.length === 0 && (classified.category === 'message' || classified.category === 'row' || classified.category === 'cell')) {
      const text = textOf(el, ctx, { target: el, includeHidden: false });
      if (text.length > 0) naming = { name: text, source: 'content' };
    }
  }
  const id = el.getAttribute('id');
  const placeholder = tag === 'INPUT' || tag === 'TEXTAREA' ? flat(el.getAttribute('placeholder') ?? '') : '';
  return {
    role: classified.role,
    name: naming.name,
    namingSource: naming.source,
    affordance: classified.affordance,
    interactive: classified.interactive,
    category: classified.category,
    tag: tag.toLowerCase(),
    landmark: landmarkOf(el, ctx),
    dataBlock: dataBlockOf(el),
    row: classified.category === 'row' ? null : rowOf(el, ctx),
    testId: testIdOf(el),
    id: id !== null && id.length > 0 ? id : null,
    placeholder: placeholder.length > 0 ? placeholder : null,
    inputType: tag === 'INPUT' ? (el as HTMLInputElement).type.toLowerCase() : null,
    visible: isVisible(el, ctx),
  };
};

const toWalkNode = (el: Element, ref: string, facts: Facts, ctx: Ctx): WalkNode => {
  const node: Record<string, unknown> = {
    ref,
    role: facts.role,
    name: cap(facts.name, NAME_CAP),
    namingSource: facts.namingSource,
    affordance: facts.affordance,
    interactive: facts.interactive,
    category: facts.category,
    tag: facts.tag,
    visible: facts.visible,
    inViewport: facts.visible && inViewport(el),
    enabled: !(nativelyDisabled(el) || ariaDisabled(el)),
  };
  if (facts.landmark !== null) {
    node['landmark'] = facts.landmark.role;
    if (facts.landmark.name.length > 0) node['landmarkName'] = cap(facts.landmark.name, LANDMARK_NAME_CAP);
  }
  if (facts.dataBlock !== null) node['dataBlock'] = facts.dataBlock;
  if (facts.row !== null) {
    const rowText = cap(rowTextOf(facts.row, ctx), ROW_TEXT_CAP);
    if (rowText.length > 0) node['rowText'] = rowText;
  }
  if (facts.testId !== null) {
    node['testId'] = facts.testId.value;
    node['testIdAttribute'] = facts.testId.attribute;
  }
  if (facts.id !== null) {
    node['id'] = facts.id;
    node['idKind'] = idKindOf(facts.id);
  }
  if (facts.placeholder !== null) node['placeholder'] = facts.placeholder;
  if (facts.inputType !== null) node['inputType'] = facts.inputType;
  const level = levelOf(el, facts.role);
  if (level !== undefined) node['level'] = level;
  const checked = checkedOf(el, facts.role);
  if (checked !== undefined) node['checked'] = checked;
  return node as unknown as WalkNode;
};

const toDescription = (el: Element, ref: string, facts: Facts, ctx: Ctx): RefDescription => {
  const description: Record<string, unknown> = {
    ref,
    role: facts.role,
    name: cap(facts.name, RAW_NAME_CAP),
    namingSource: facts.namingSource,
    affordance: facts.affordance,
    interactive: facts.interactive,
    category: facts.category,
    tag: facts.tag,
    visible: facts.visible,
  };
  if (facts.namingSource === 'label-for' || facts.namingSource === 'label-wrap') description['labelText'] = facts.name;
  if (facts.placeholder !== null) description['placeholder'] = facts.placeholder;
  if (facts.testId !== null) {
    description['testId'] = facts.testId.value;
    description['testIdAttribute'] = facts.testId.attribute;
  }
  if (facts.id !== null) {
    description['id'] = facts.id;
    description['idKind'] = idKindOf(facts.id);
  }
  if (facts.landmark !== null) {
    description['landmark'] = facts.landmark.role;
    if (facts.landmark.name.length > 0) description['landmarkName'] = facts.landmark.name;
  }
  if (facts.dataBlock !== null) description['dataBlock'] = facts.dataBlock;
  const row = facts.category === 'row' ? el : facts.row;
  if (row !== null) {
    description['rowText'] = cap(rowTextOf(row, ctx), RAW_NAME_CAP);
    description['rowCells'] = rowCellsOf(row, ctx);
  }
  if (facts.inputType !== null) description['inputType'] = facts.inputType;
  return description as unknown as RefDescription;
};

// ─── Registry ──────────────────────────────────────────────────────────────

interface Registry {
  readonly snapshotId: string;
  readonly refs: Map<string, Element>;
}

const setRegistry = (snapshotId: string, refs: Map<string, Element>): void => {
  // Non-enumerable so page scripts that enumerate window do not trip over it.
  Object.defineProperty(window, REGISTRY_KEY, { value: { snapshotId, refs }, configurable: true, writable: true, enumerable: false });
};

const getRegistry = (): Registry | null => {
  const value = (window as unknown as Record<string, unknown>)[REGISTRY_KEY];
  if (value === null || typeof value !== 'object') return null;
  const registry = value as Partial<Registry>;
  return typeof registry.snapshotId === 'string' && registry.refs instanceof Map ? (registry as Registry) : null;
};

// ─── Scope ─────────────────────────────────────────────────────────────────

const scopeRoots = (scope: WalkScope | undefined, ctx: Ctx): Element[] => {
  const body = document.body;
  if (body === null) return [];
  let roots: Element[] = [body];
  if (scope?.landmark !== undefined) {
    const wanted = scope.landmark;
    const wantedName = scope.landmarkName === undefined ? null : flat(scope.landmarkName);
    const found: Element[] = [];
    roots.forEach((root) => forEachElement(root, (el) => {
      const role = roleOf(el, ctx);
      if (role === wanted && (wantedName === null || accName(el, role, ctx).name === wantedName)) {
        found.push(el);
        return false;
      }
      return true;
    }));
    roots = found;
  }
  if (scope?.dataBlock !== undefined) {
    const wanted = scope.dataBlock;
    const found: Element[] = [];
    roots.forEach((root) => forEachElement(root, (el) => {
      if (el.getAttribute('data-block') === wanted) {
        found.push(el);
        return false;
      }
      return true;
    }));
    roots = found;
  }
  return roots;
};

// ─── Public in-page API ────────────────────────────────────────────────────

/**
 * One pass over the DOM (or the scoped containers): every control, every
 * admitted roleless clickable, and the informational nodes assertions and
 * scoping need. Registers each node's element under its ref so later calls
 * can verify that a locator hits exactly that element.
 */
export const walk = (options: WalkOptions): WalkResult => {
  const ctx = newCtx();
  const maxCells = options.maxCells ?? 200;
  const maxRows = options.maxRows ?? 400;
  const roots = scopeRoots(options.scope, ctx);
  const nodes: WalkNode[] = [];
  const refs = new Map<string, Element>();
  const seen = new Set<Element>();
  let elements = 0;
  let ownCursorOnly = 0;
  let cells = 0;
  let rows = 0;
  let cellsDropped = 0;
  let rowsDropped = 0;
  for (const root of roots) {
    forEachElement(root, (el) => {
      if (seen.has(el)) return false;
      seen.add(el);
      elements += 1;
      let classified: Classified | null = null;
      try {
        classified = classify(el, ctx);
        if (classified === null) {
          if (isRoleless(roleOf(el, ctx)) && isOwnCursorOnly(el, ctx)) ownCursorOnly += 1;
          return true;
        }
        // Informational nodes only matter when a user could see them.
        if (!classified.interactive && !isVisible(el, ctx)) return true;
        if (classified.category === 'cell' && cells >= maxCells) {
          cellsDropped += 1;
          return true;
        }
        if (classified.category === 'row' && rows >= maxRows) {
          rowsDropped += 1;
          return true;
        }
        const facts = factsOf(el, classified, ctx);
        if (!facts.interactive && facts.category !== 'landmark' && facts.category !== 'dialog' && facts.name.length === 0) return true;
        if (facts.category === 'cell') cells += 1;
        if (facts.category === 'row') rows += 1;
        const ref = `c${nodes.length + 1}`;
        nodes.push(toWalkNode(el, ref, facts, ctx));
        refs.set(ref, el);
      } catch {
        // One odd element must not cost the whole observation.
      }
      return true;
    });
  }
  setRegistry(options.snapshotId, refs);
  return {
    snapshotId: options.snapshotId,
    url: location.href,
    nodes,
    scopeFound: roots.length > 0,
    stats: { elements, ownCursorOnly, cellsDropped, rowsDropped },
  };
};

/** Variant signals and fingerprint inputs, from one pass over the whole page. */
export const signals = (): PageSignals => {
  const ctx = newCtx();
  let osuiClassCount = 0;
  let osuiAnyTokenCount = 0;
  let dataBlockCount = 0;
  let reactMarkerNodes = 0;
  let vueDetected = false;
  let interactive = 0;
  let rolelessInteractive = 0;
  let placeholderOnlyInputs = 0;
  const blockNames = new Set<string>();
  const landmarks = new Set<string>();
  const roleCounts: Record<string, number> = {};
  const body = document.body;
  if (body !== null) {
    forEachElement(body, (el) => {
      try {
        const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter((token) => token.length > 0);
        if (classes[0]?.startsWith('osui-') === true) osuiClassCount += 1;
        if (classes.some((token) => token.startsWith('osui-'))) osuiAnyTokenCount += 1;
        const block = el.getAttribute('data-block');
        if (block !== null) {
          dataBlockCount += 1;
          if (block.length > 0 && blockNames.size < 500) blockNames.add(block);
        }
        if (reactMarkerNodes < 10) {
          const keys = Object.keys(el);
          if (keys.some((key) => key.startsWith('__reactFiber$') || key.startsWith('__reactProps$') || key.startsWith('__reactInternalInstance$') || key.startsWith('__reactEventHandlers$') || key.startsWith('__reactContainer'))) {
            reactMarkerNodes += 1;
          }
        }
        if (!vueDetected) {
          for (const attribute of Array.from(el.attributes)) {
            if (attribute.name.startsWith('data-v-')) {
              vueDetected = true;
              break;
            }
          }
        }
        const role = roleOf(el, ctx);
        if (role !== null && LANDMARK_ROLES.has(role)) landmarks.add(role);
        const affordance = affordanceOf(el, role);
        if (affordance !== 'none' && isVisible(el, ctx)) {
          interactive += 1;
          const key = isRoleless(role) ? 'generic' : (role ?? 'generic');
          roleCounts[key] = (roleCounts[key] ?? 0) + 1;
          if (isRoleless(role)) rolelessInteractive += 1;
        }
        const tag = tagOf(el);
        if ((tag === 'INPUT' || tag === 'TEXTAREA') && isVisible(el, ctx) && accName(el, role, ctx).source === 'placeholder') {
          placeholderOnlyInputs += 1;
        }
      } catch {
        // Keep counting.
      }
      return true;
    });
  }
  const w = window as unknown as Record<string, unknown>;
  const runtimeGlobal = w['OutSystems'] !== undefined ? 'OutSystems' : w['OSFramework'] !== undefined ? 'OSFramework' : null;
  const outSystemsScriptPresent = Array.from(document.scripts).some((script) =>
    /OutSystemsReactView|\/scripts\/OutSystems\.js|OutSystemsReactWidgets/i.test(script.src));
  const reactDetected = reactMarkerNodes >= 10 || document.querySelector('[data-reactroot], [data-reactid]') !== null;
  const angularDetected = document.querySelector('[ng-version], [_ngcontent], [_nghost]') !== null;
  const variant: VariantSignals = {
    osuiClassCount,
    osuiAnyTokenCount,
    dataBlockCount,
    outSystemsRuntimeGlobal: runtimeGlobal,
    outSystemsScriptPresent,
    osvstatePresent: document.querySelector('input[name="__OSVSTATE"]') !== null,
    reactDetected,
    angularDetected,
    vueDetected,
  };
  return {
    title: document.title,
    url: location.href,
    variant,
    fingerprint: {
      title: document.title,
      landmarks: [...landmarks].sort(),
      roleCounts,
      interactive,
      rolelessInteractive,
      placeholderOnlyInputs,
      dataBlocks: dataBlockCount,
      dataBlockNames: [...blockNames].sort(),
      runtimeGlobal,
    },
  };
};

/**
 * A cheap structure hash for stability checks: tag, role attribute and
 * data-block of every element, in order. Text is excluded on purpose so a
 * ticking clock does not read as structural churn.
 */
export const structuralSignature = (): string => {
  const body = document.body;
  if (body === null) return 'no-body';
  let hash = 0x811c9dc5;
  let count = 0;
  const mix = (text: string): void => {
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  };
  forEachElement(body, (el) => {
    count += 1;
    mix(el.tagName);
    mix('|');
    mix(el.getAttribute('role') ?? '');
    mix('|');
    mix(el.getAttribute('data-block') ?? '');
    mix(';');
    return true;
  });
  return `${count}:${hash.toString(16)}`;
};

interface MutationCounter {
  count: number;
  readonly observer: MutationObserver;
}

const counterAt = (key: string): MutationCounter | null => {
  const value = (window as unknown as Record<string, unknown>)[key];
  if (value === null || typeof value !== 'object') return null;
  const counter = value as Partial<MutationCounter>;
  return typeof counter.count === 'number' && counter.observer instanceof MutationObserver ? (counter as MutationCounter) : null;
};

/** Install (or reinstall) a mutation counter under `key`. Returns false when the page cannot host one. */
export const installMutationCounter = (key: string): boolean => {
  const existing = counterAt(key);
  if (existing !== null) existing.observer.disconnect();
  if (typeof MutationObserver === 'undefined' || document.documentElement === null) return false;
  const counter: MutationCounter = {
    count: 0,
    observer: new MutationObserver((records) => {
      counter.count += records.length;
    }),
  };
  counter.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  Object.defineProperty(window, key, { value: counter, configurable: true, writable: true, enumerable: false });
  return true;
};

/** Mutations since install, or -1 when the counter is gone (a navigation replaced the document). */
export const readMutationCount = (key: string): number => counterAt(key)?.count ?? -1;

/** Disconnect and remove the counter so nothing is left observing the customer's page. */
export const disconnectMutationCounter = (key: string): boolean => {
  const counter = counterAt(key);
  if (counter !== null) counter.observer.disconnect();
  return delete (window as unknown as Record<string, unknown>)[key];
};

export const pollHydration = (key: string): HydrationPoll => ({ count: readMutationCount(key), readyState: document.readyState });

/** Whether `ref` from `snapshotId` still names a live element, and if not, why. */
export const refStatus = (snapshotId: string, ref: string): RefStatus => {
  const registry = getRegistry();
  if (registry === null) return 'no-registry';
  if (registry.snapshotId !== snapshotId) return 'stale';
  const el = registry.refs.get(ref);
  if (el === undefined) return 'unknown-ref';
  return el.isConnected ? 'ok' : 'detached';
};

/** The raw description of a registered element; null when the snapshot is stale or the element is gone. */
export const describeRef = (snapshotId: string, ref: string): RefDescription | null => {
  const registry = getRegistry();
  if (registry === null || registry.snapshotId !== snapshotId) return null;
  const el = registry.refs.get(ref);
  if (el === undefined || !el.isConnected) return null;
  return describeElement(el, ref);
};

/**
 * The raw description of any element, registered or not, under the given
 * ref. The flow recorder describes the element a user touched with it, so a
 * recorded step reads the page exactly the way an observation would.
 */
export const describeElement = (el: Element, ref: string): RefDescription => {
  const ctx = newCtx();
  const rawRole = roleOf(el, ctx);
  const affordance = affordanceOf(el, rawRole);
  // The element may have changed since the walk (lost its handler, became a plain div); describe it anyway.
  const classified = classify(el, ctx) ?? {
    role: rawRole ?? 'generic',
    rawRole,
    affordance,
    interactive: affordance !== 'none',
    category: 'control' as const,
  };
  return toDescription(el, ref, factsOf(el, classified, ctx), ctx);
};

/**
 * True when `element` is the registered element for `ref`, or, with
 * `within`, a descendant of it (a text match lands on the innermost
 * element carrying the text; a click there reaches the same control).
 */
export const isRef = (element: Element, snapshotId: string, ref: string, within: boolean): boolean => {
  const registry = getRegistry();
  if (registry === null || registry.snapshotId !== snapshotId) return false;
  const target = registry.refs.get(ref);
  if (target === undefined) return false;
  return element === target || (within && target.contains(element));
};

/** Index of the registered element among `elements` (as returned by a locator), or -1. */
export const indexOfRef = (elements: readonly Element[], snapshotId: string, ref: string, within: boolean): number =>
  elements.findIndex((element) => isRef(element, snapshotId, ref, within));
