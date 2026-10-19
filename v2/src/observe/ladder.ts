/**
 * The locator ladder: from a snapshot candidate to a Playwright locator
 * that matches exactly one visible element, and that element is the one
 * the walker registered under the candidate's ref.
 *
 * Rungs, in preference order: role and name; label; placeholder; exact
 * text (roleless clickables and content-named elements); test id; css #id
 * for designer and plain ids (never compiled structural ids). Each rung is
 * tried unscoped, then within its landmark, then landmark plus data-block,
 * then within its table row (by one cell's text), so the first accepted
 * form is the shortest unique one. Every rejected attempt is reported with
 * its match count and the reason. When nothing is unique, the best rung
 * comes back with nth and verified:false.
 *
 * Replaces product/instruments/observation/locate.ts, whose first-match
 * with count > 0 never checked uniqueness or identity.
 */
import type { Page } from '@playwright/test';
import { ToolError, isToolError } from '../core/errors.js';
import { containsPii } from '../core/pii.js';
import type { Candidate, LocatorScope, LocatorSpec, ResolvedLocator } from '../contract/schemas.js';
import { renderLocator, toPlaywrightLocator } from '../locator/locator.js';
import { inElement, inElements, inPage } from './in-page/runtime.js';
import type { RefDescription, RefStatus } from './in-page/walker.js';

export type { RefDescription } from './in-page/walker.js';

/** Roles Playwright's getByRole accepts (generic is valid but never names an element usefully). */
const ROLE_NAME_ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button', 'caption', 'cell', 'checkbox',
  'code', 'columnheader', 'combobox', 'complementary', 'contentinfo', 'definition', 'deletion', 'dialog', 'directory',
  'document', 'emphasis', 'feed', 'figure', 'form', 'grid', 'gridcell', 'group', 'heading', 'img', 'insertion', 'link',
  'list', 'listbox', 'listitem', 'log', 'main', 'mark', 'marquee', 'math', 'meter', 'menu', 'menubar', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'navigation', 'note', 'option', 'paragraph', 'progressbar', 'radio', 'radiogroup',
  'region', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox', 'separator', 'slider', 'spinbutton',
  'status', 'strong', 'subscript', 'superscript', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox',
  'time', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem',
]);

/** Roles whose visible text is their name, so an exact text match lands on them. */
const TEXT_ROLES = new Set([
  'generic', 'button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'treeitem', 'heading',
  'cell', 'gridcell', 'columnheader', 'rowheader', 'listitem', 'alert', 'status', 'log', 'checkbox', 'radio', 'switch',
]);

/** Names longer than this match by a leading fragment (exact:false) instead of the whole string. */
const EXACT_NAME_MAX = 80;
const FRAGMENT_LENGTH = 60;
/** hasText is a case-insensitive substring match, so "POL-30" also hits "POL-300"; a few more cells give a unique one a chance. */
const MAX_ROW_CELLS = 5;
const MAX_ALTERNATIVES = 24;
/** Above this many matches, finding the target's index is not worth an evaluation. */
const MAX_INDEXED_MATCHES = 50;

const PUA = /[-]/g;
const PARAM_PATTERN = /\{[A-Za-z_][A-Za-z0-9_]*\}/;

/** A name usable in a locator: icon-font glyphs stripped, long names cut to a word-bounded fragment. */
export const nameForLocator = (name: string): { readonly value: string; readonly exact: boolean } | null => {
  const cleaned = name.replace(PUA, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return null;
  const glyphs = cleaned.length !== name.replace(/\s+/g, ' ').trim().length;
  if (cleaned.length <= EXACT_NAME_MAX) return { value: cleaned, exact: !glyphs };
  const cut = cleaned.slice(0, FRAGMENT_LENGTH);
  const atWord = cut.replace(/\s+\S*$/, '');
  return { value: atWord.length >= 20 ? atWord : cut, exact: false };
};

/** CSS for an id: `#Id` when it is a plain identifier, an attribute selector otherwise. */
export const cssForId = (id: string): string => (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(id) ? `#${id}` : `[id=${JSON.stringify(id)}]`);

/**
 * The unscoped rungs for a described element, in ladder order. Pure: the
 * same description always yields the same rungs.
 */
export const generateRungs = (desc: RefDescription): readonly LocatorSpec[] => {
  const rungs: LocatorSpec[] = [];
  const named = nameForLocator(desc.name);
  if (desc.role === 'row' && desc.rowCells !== undefined) {
    // A row is selected by the text it contains, the way a test author names it ("the POL-001 row").
    desc.rowCells
      .filter((cell) => !containsPii(cell))
      .slice(0, MAX_ROW_CELLS)
      .forEach((cell) => rungs.push({ strategy: 'row-text', role: 'row', value: cell }));
  }
  if (desc.role !== 'generic' && ROLE_NAME_ROLES.has(desc.role) && named !== null) {
    rungs.push({ strategy: 'role-name', role: desc.role, name: named.value, exact: named.exact });
  }
  if ((desc.namingSource === 'label-for' || desc.namingSource === 'label-wrap') && desc.labelText !== undefined) {
    const label = nameForLocator(desc.labelText);
    if (label !== null) rungs.push({ strategy: 'label', value: label.value, exact: label.exact });
  }
  if (desc.placeholder !== undefined) {
    const placeholder = nameForLocator(desc.placeholder);
    if (placeholder !== null) rungs.push({ strategy: 'placeholder', value: placeholder.value, exact: placeholder.exact });
  }
  if (named !== null && desc.namingSource === 'content' && (TEXT_ROLES.has(desc.role) || desc.category === 'message')) {
    rungs.push({ strategy: 'text', value: named.value, exact: named.exact });
  }
  if (desc.testId !== undefined) {
    rungs.push({ strategy: 'test-id', value: desc.testId, attribute: desc.testIdAttribute ?? 'data-testid' });
  }
  if (desc.id !== undefined && desc.idKind !== undefined && desc.idKind !== 'structural') {
    rungs.push({ strategy: 'css', value: cssForId(desc.id) });
  }
  return rungs;
};

/**
 * Last rungs: the role alone (an unnamed landmark, an unlabelled control
 * that its scope makes unique), else the tag. Unique and on target, they
 * verify like any other rung; otherwise they supply the nth fallback.
 */
const fallbackRungs = (desc: RefDescription): readonly LocatorSpec[] => {
  if (desc.role !== 'generic' && ROLE_NAME_ROLES.has(desc.role)) return [{ strategy: 'role-name', role: desc.role }];
  return [{ strategy: 'css', value: desc.tag }];
};

/**
 * Scopes to try for a description, shortest first: none, landmark,
 * landmark + data-block (or data-block alone without a landmark), then
 * row scopes by up to three non-PII cell texts, alone and inside the
 * landmark/block.
 */
export const scopeVariants = (desc: RefDescription): readonly (LocatorScope | undefined)[] => {
  const landmark: LocatorScope | undefined =
    desc.landmark !== undefined
      ? { landmark: desc.landmark as NonNullable<LocatorScope['landmark']>, ...(desc.landmarkName !== undefined ? { landmarkName: desc.landmarkName } : {}) }
      : undefined;
  const block: LocatorScope | undefined =
    desc.dataBlock !== undefined ? { ...(landmark ?? {}), dataBlock: desc.dataBlock } : undefined;
  const variants: (LocatorScope | undefined)[] = [undefined];
  if (landmark !== undefined) variants.push(landmark);
  if (block !== undefined) variants.push(block);
  if (desc.role !== 'row' && desc.rowCells !== undefined) {
    const cells = [...new Set(desc.rowCells)].filter((cell) => !containsPii(cell) && cell !== desc.name).slice(0, MAX_ROW_CELLS);
    cells.forEach((cell) => variants.push({ rowText: cell }));
    const outer = block ?? landmark;
    const firstCell = cells[0];
    if (outer !== undefined && firstCell !== undefined) variants.push({ ...outer, rowText: firstCell });
  }
  return variants;
};

const withScope = (spec: LocatorSpec, scope: LocatorScope | undefined): LocatorSpec =>
  scope === undefined ? spec : { ...spec, scope };

const usesParamSyntax = (spec: LocatorSpec): boolean =>
  [spec.value, spec.name, spec.scope?.rowText].some((text) => text !== undefined && PARAM_PATTERN.test(text));

export interface MatchCount {
  readonly total: number;
  readonly visible: number;
}

/** How many elements a spec matches, and how many of those are visible. */
export const countMatches = async (page: Page, spec: LocatorSpec, params?: Readonly<Record<string, string>>): Promise<MatchCount> => {
  const locator = toPlaywrightLocator(page, spec, params);
  const total = await locator.count();
  const visible = total === 0 ? 0 : await locator.filter({ visible: true }).count();
  return { total, visible };
};

type StaleStatus = Exclude<RefStatus, 'unknown-ref'>;

const staleSnapshot = (snapshotId: string, ref: string, status: StaleStatus): ToolError => {
  const why =
    status === 'detached'
      ? `candidate ${ref} is no longer in the page`
      : status === 'no-registry'
        ? 'the page has navigated or reloaded since that snapshot'
        : 'the page was observed again since that snapshot';
  return new ToolError('stale-snapshot', `snapshot ${snapshotId} is stale: ${why}. Observe the page again and use the new refs.`, {
    snapshotId,
    ref,
    status,
  });
};

/** The raw description of a candidate on the live page. Stale or detached → ToolError('stale-snapshot'). */
export const describeCandidate = async (page: Page, snapshotId: string, ref: string): Promise<RefDescription> => {
  const desc = await inPage(page, 'describeRef', snapshotId, ref);
  if (desc !== null) return desc;
  const status = await inPage(page, 'refStatus', snapshotId, ref);
  if (status === 'unknown-ref') {
    throw new ToolError('not-found', `snapshot ${snapshotId} has no candidate ${ref}`, { snapshotId, ref });
  }
  throw staleSnapshot(snapshotId, ref, status);
};

/**
 * Throws stale-snapshot when the snapshot no longer describes the page: it
 * navigated, reloaded or was observed again while the ladder ran (every rung
 * was then counted on another document, where the candidate's ref cannot
 * match). A page torn down mid-navigation counts as navigated.
 */
const assertStillCurrent = async (page: Page, snapshotId: string, ref: string): Promise<void> => {
  if (page.isClosed()) throw new ToolError('unavailable', 'the page closed while resolving the locator');
  const status = await inPage(page, 'refStatus', snapshotId, ref).catch(() => 'no-registry' as const);
  if (status === 'ok' || status === 'unknown-ref') return;
  throw staleSnapshot(snapshotId, ref, status);
};

interface Attempt {
  readonly spec: LocatorSpec;
  readonly total: number;
  readonly visible: number;
  readonly isTarget: boolean;
  /** Index of the target among all matches, when known (-1 when absent). */
  readonly index: number | null;
  readonly reason: string | null;
}

const reasonFor = (total: number, visible: number, isTarget: boolean): string | null => {
  if (total === 0) return 'no match';
  if (visible === 0) return `${total} match(es), none visible`;
  if (visible > 1) return `${visible} visible matches`;
  if (total > 1) return `1 visible match but ${total} in total (strict mode would fail)`;
  if (!isTarget) return 'the only match is a different element';
  return null;
};

const tryAttempt = async (page: Page, spec: LocatorSpec, snapshotId: string, ref: string): Promise<Attempt> => {
  // A text match lands on the innermost element carrying the text; inside the target, it is the target.
  const within = spec.strategy === 'text';
  const locator = toPlaywrightLocator(page, spec);
  const total = await locator.count();
  if (total === 0) return { spec, total, visible: 0, isTarget: false, index: -1, reason: 'no match' };
  const visible = await locator.filter({ visible: true }).count();
  let isTarget = false;
  let index: number | null = null;
  if (total === 1) {
    isTarget = await inElement(locator.first(), 'isRef', [snapshotId, ref, within]).catch(() => false);
    index = isTarget ? 0 : -1;
  } else if (total <= MAX_INDEXED_MATCHES) {
    index = await inElements(locator, 'indexOfRef', [snapshotId, ref, within]).catch(() => null);
  }
  return { spec, total, visible, isTarget, index, reason: reasonFor(total, visible, isTarget) };
};

const resolved = (spec: LocatorSpec, verified: boolean, rejected: readonly Attempt[]): ResolvedLocator => {
  const expression = renderLocator(spec);
  return {
    locator: { ...spec, expression },
    expression,
    verified,
    alternatives: rejected.slice(0, MAX_ALTERNATIVES).map((attempt) => {
      const altExpression = renderLocator(attempt.spec);
      return {
        locator: { ...attempt.spec, expression: altExpression },
        expression: altExpression,
        matches: attempt.visible,
        rejectedBecause: attempt.reason ?? 'not unique',
      };
    }),
  };
};

/**
 * Resolve a snapshot candidate to a verified locator. Throws
 * ToolError('stale-snapshot') when the snapshot no longer matches the page,
 * ToolError('not-found') when the ref is unknown or no rung matches the
 * element at all.
 */
export const resolveCandidateLocator = async (page: Page, snapshotId: string, ref: string): Promise<ResolvedLocator> => {
  const desc = await describeCandidate(page, snapshotId, ref);
  const scopes = scopeVariants(desc);
  const rejected: Attempt[] = [];
  const firstUnique = async (rungs: readonly LocatorSpec[]): Promise<LocatorSpec | null> => {
    for (const rung of rungs) {
      for (const scope of scopes) {
        const spec = withScope(rung, scope);
        if (usesParamSyntax(spec)) {
          rejected.push({ spec, total: 0, visible: 0, isTarget: false, index: null, reason: 'text looks like a {parameter} placeholder' });
          continue;
        }
        let attempt: Attempt;
        try {
          attempt = await tryAttempt(page, spec, snapshotId, ref);
        } catch (error) {
          if (page.isClosed()) throw new ToolError('unavailable', 'the page closed while resolving the locator');
          const message = isToolError(error) ? error.message : (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
          rejected.push({ spec, total: 0, visible: 0, isTarget: false, index: null, reason: `locator error: ${message}` });
          continue;
        }
        if (attempt.reason === null) return spec;
        rejected.push(attempt);
      }
    }
    return null;
  };
  const chosen = (await firstUnique(generateRungs(desc))) ?? (await firstUnique(fallbackRungs(desc)));
  if (chosen !== null) return resolved(chosen, true, rejected);
  // Nothing unique. If the page moved on meanwhile, the counts describe another document: say so.
  await assertStillCurrent(page, snapshotId, ref);
  // The attempt where the target is among the fewest matches, addressed by position.
  const best = rejected
    .filter((attempt) => attempt.index !== null && attempt.index >= 0)
    .sort((a, b) => a.total - b.total)[0];
  if (best === undefined || best.index === null) {
    throw new ToolError('not-found', `no locator matches candidate ${ref} of snapshot ${snapshotId}`, {
      snapshotId,
      ref,
      tried: rejected.slice(0, MAX_ALTERNATIVES).map((attempt) => `${renderLocator(attempt.spec)}: ${attempt.reason ?? ''}`),
    });
  }
  const spec = best.total > 1 ? { ...best.spec, nth: best.index } : best.spec;
  return resolved(spec, false, rejected);
};

/** A description rebuilt from a stored (PII-gated) candidate, for proposing locators when the page has moved on. */
export const descriptionFromCandidate = (candidate: Candidate): RefDescription => ({
  ref: candidate.ref,
  role: candidate.role,
  name: candidate.name,
  namingSource: candidate.namingSource,
  affordance: candidate.affordance,
  interactive: candidate.interactive,
  category: 'control',
  tag: candidate.tag,
  visible: candidate.visible,
  ...(candidate.namingSource === 'label-for' || candidate.namingSource === 'label-wrap' ? { labelText: candidate.name } : {}),
  ...(candidate.placeholder !== undefined ? { placeholder: candidate.placeholder } : {}),
  ...(candidate.testId !== undefined ? { testId: candidate.testId } : {}),
  ...(candidate.id !== undefined ? { id: candidate.id } : {}),
  ...(candidate.idKind !== undefined ? { idKind: candidate.idKind } : {}),
  ...(candidate.landmark !== undefined ? { landmark: candidate.landmark } : {}),
  ...(candidate.landmarkName !== undefined ? { landmarkName: candidate.landmarkName } : {}),
  ...(candidate.dataBlock !== undefined ? { dataBlock: candidate.dataBlock } : {}),
  ...(candidate.rowText !== undefined ? { rowText: candidate.rowText } : {}),
  ...(candidate.inputType !== undefined ? { inputType: candidate.inputType } : {}),
});

/**
 * An unverified locator for a stored candidate: the first rung, scoped by
 * its landmark (or, without one, its data-block). Rungs whose text was
 * redacted ("<email>" placeholders) are skipped. Prefer
 * resolveCandidateLocator on a live page; this is for when the page has
 * moved on and only the saved snapshot remains.
 */
export const proposeLocator = (candidate: Candidate): LocatorSpec | null => {
  const desc = descriptionFromCandidate(candidate);
  const rung = generateRungs(desc).find((spec) => ![spec.name, spec.value].some((text) => text !== undefined && /<(email|ssn|card|phone|number)>/.test(text)));
  if (rung === undefined) return null;
  const landmark = scopeVariants(desc)[1];
  return landmark !== undefined && landmark.rowText === undefined ? { ...rung, scope: landmark } : rung;
};
