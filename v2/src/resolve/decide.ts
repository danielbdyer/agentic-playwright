/**
 * The heuristic decider: what the batch driver uses when no model is in
 * the loop. It takes the ranked hints at face value and commits only when
 * the best one is both good enough and clearly better than the next;
 * otherwise it says "ambiguous" or "none" so the driver raises a handoff
 * instead of guessing (the vision's rule: nothing is guessed silently).
 *
 * Also here: naming. A facet minted from a decision gets a local id from
 * the test author's words when they are better than the accessible name,
 * and a screen gets its name from the URL the way OutSystems routes read.
 */
import { slugify } from '../core/text.js';
import type { Candidate, Hint } from '../contract/schemas.js';
import { identifierWords } from './phrase.js';
import { needsTarget } from './intent.js';
import { roleLabel } from './rank.js';
import type { StepIntent } from './types.js';
import { isParamRef } from './values.js';

export interface DecideOptions {
  /** The best hint must score at least this. Default 0.55. */
  readonly minScore?: number;
  /** …and beat the runner-up by at least this. Default 0.12. */
  readonly minMargin?: number;
}

export type TargetDecision =
  | { readonly kind: 'chosen'; readonly ref: string; readonly score: number; readonly rejected: string[]; readonly reason: string }
  | { readonly kind: 'ambiguous'; readonly refs: string[]; readonly reason: string }
  | { readonly kind: 'none'; readonly reason: string };

const label = (hint: Hint, byRef: ReadonlyMap<string, Candidate>): string => {
  const c = byRef.get(hint.ref);
  if (c === undefined) return hint.ref;
  const name = c.name.length > 40 ? `${c.name.slice(0, 37)}…` : c.name;
  return `${hint.ref} (${roleLabel(c)}${name.length > 0 ? ` "${name}"` : ''})`;
};

const describe = (intent: StepIntent): string => {
  const words = [intent.targetPhrase, intent.roleHint, intent.rowCue === null ? null : `in the row with ${intent.rowCue}`].filter(
    (w): w is string => w !== null,
  );
  return words.length > 0 ? words.join(' ') : intent.actionText;
};

/**
 * Choose a target from ranked hints. Hints whose ref is not among the
 * candidates (a stale ranking) are ignored. Ties are ambiguous by
 * construction: two candidates that score the same are never chosen
 * between by document order here.
 */
export const decideTarget = (
  intent: StepIntent,
  hints: readonly Hint[],
  candidates: readonly Candidate[],
  options: DecideOptions = {},
): TargetDecision => {
  const minScore = options.minScore ?? 0.55;
  const minMargin = options.minMargin ?? 0.12;
  const byRef = new Map(candidates.map((c) => [c.ref, c] as const));
  const ranked = hints
    .map((hint, order) => ({ hint, order }))
    .filter(({ hint }) => byRef.has(hint.ref))
    .sort((a, b) => b.hint.score - a.hint.score || a.order - b.order)
    .map(({ hint }) => hint);

  const top = ranked[0];
  if (top === undefined) {
    return {
      kind: 'none',
      reason: needsTarget(intent)
        ? `no candidate on the page fits "${describe(intent)}"`
        : `the step needs no target (${intent.verb}${intent.key === null ? '' : ` ${intent.key}`})`,
    };
  }
  if (top.score < minScore) {
    return {
      kind: 'none',
      reason: `the best candidate, ${label(top, byRef)}, scores ${top.score.toFixed(2)} (below ${minScore}) for "${describe(intent)}": ${top.why}`,
    };
  }
  const close = ranked.filter((h) => h.score >= minScore && top.score - h.score < minMargin);
  if (close.length > 1) {
    return {
      kind: 'ambiguous',
      refs: close.map((h) => h.ref),
      reason: `${close.length} candidates fit "${describe(intent)}" within ${minMargin} of each other: ${close
        .slice(0, 5)
        .map((h) => `${label(h, byRef)} ${h.score.toFixed(2)}`)
        .join(', ')}`,
    };
  }
  const second = ranked[1];
  return {
    kind: 'chosen',
    ref: top.ref,
    score: top.score,
    rejected: ranked.slice(1, 6).filter((h) => h.score > 0).map((h) => h.ref),
    reason: `${label(top, byRef)} scores ${top.score.toFixed(2)}: ${top.why}${
      second === undefined ? '' : `; next best ${label(second, byRef)} at ${second.score.toFixed(2)}`
    }`,
  };
};

// ─── Facet ids ─────────────────────────────────────────────────────────────

/** The local-id suffix per role, and the words that already say it ("search-field" needs no "-input"). */
const ROLE_SUFFIX: Readonly<Record<string, { readonly suffix: string; readonly synonyms: readonly string[] }>> = {
  button: { suffix: 'button', synonyms: ['button', 'btn'] },
  link: { suffix: 'link', synonyms: ['link'] },
  textbox: { suffix: 'input', synonyms: ['input', 'field', 'box', 'textbox', 'textarea'] },
  searchbox: { suffix: 'input', synonyms: ['input', 'field', 'box', 'searchbox', 'bar'] },
  spinbutton: { suffix: 'input', synonyms: ['input', 'field', 'box'] },
  combobox: { suffix: 'select', synonyms: ['select', 'dropdown', 'list', 'combobox', 'picker'] },
  listbox: { suffix: 'select', synonyms: ['select', 'dropdown', 'list', 'listbox'] },
  checkbox: { suffix: 'checkbox', synonyms: ['checkbox', 'check'] },
  radio: { suffix: 'radio', synonyms: ['radio', 'option'] },
  switch: { suffix: 'toggle', synonyms: ['toggle', 'switch'] },
  tab: { suffix: 'tab', synonyms: ['tab'] },
  menuitem: { suffix: 'menu-item', synonyms: ['item', 'menu'] },
  menuitemcheckbox: { suffix: 'menu-item', synonyms: ['item', 'menu'] },
  menuitemradio: { suffix: 'menu-item', synonyms: ['item', 'menu'] },
  heading: { suffix: 'heading', synonyms: ['heading', 'title', 'header'] },
  row: { suffix: 'row', synonyms: ['row'] },
  alert: { suffix: 'message', synonyms: ['message', 'alert', 'error', 'warning', 'banner'] },
  status: { suffix: 'message', synonyms: ['message', 'status', 'notification', 'banner'] },
  log: { suffix: 'message', synonyms: ['message', 'log'] },
  table: { suffix: 'table', synonyms: ['table', 'grid', 'results', 'list'] },
  grid: { suffix: 'table', synonyms: ['table', 'grid', 'results', 'list'] },
  img: { suffix: 'image', synonyms: ['image', 'icon', 'logo', 'img', 'picture'] },
  option: { suffix: 'option', synonyms: ['option'] },
  slider: { suffix: 'slider', synonyms: ['slider'] },
  dialog: { suffix: 'dialog', synonyms: ['dialog', 'modal', 'popup'] },
  navigation: { suffix: 'nav', synonyms: ['nav', 'navigation', 'menu'] },
  search: { suffix: 'search', synonyms: ['search'] },
  cell: { suffix: 'cell', synonyms: ['cell'] },
  columnheader: { suffix: 'column', synonyms: ['column', 'header'] },
};

const suffixFor = (candidate: Candidate): { readonly suffix: string; readonly synonyms: readonly string[] } | null => {
  if (candidate.role === 'generic') {
    // A roleless handler-owner is what the author calls a button; a non-interactive generic is a feedback message.
    return candidate.interactive ? ROLE_SUFFIX.button! : ROLE_SUFFIX.alert!;
  }
  return ROLE_SUFFIX[candidate.role] ?? null;
};

const wordCount = (text: string): number => text.split(/\s+/).filter((w) => w.length > 0).length;

const firstWords = (text: string, n: number): string => text.split(/\s+/).filter((w) => w.length > 0).slice(0, n).join(' ');

/** The words a facet is named by, best first: a parameter the step fills, the author's phrase, the name, an id. */
const facetWords = (intent: StepIntent, candidate: Candidate): string => {
  const param = intent.value !== null && isParamRef(intent.value) && (intent.verb === 'fill' || intent.verb === 'select')
    ? identifierWords(intent.value.slice(1))
    : null;
  if (param !== null) return param;
  const phrase = intent.targetPhrase;
  if (phrase !== null && !phrase.startsWith('@') && wordCount(phrase) <= 6) return phrase;
  if (candidate.role === 'row') {
    // A row's name is its data; a facet named after data breaks when the data changes.
    const cue = intent.rowCue;
    return cue !== null && isParamRef(cue) ? identifierWords(cue.slice(1)) : 'result';
  }
  if (candidate.name.trim().length > 0) return firstWords(candidate.name, 5);
  if (candidate.testId !== undefined && candidate.testId.length > 0) return identifierWords(candidate.testId);
  if (candidate.id !== undefined && candidate.idKind === 'designer') return identifierWords(candidate.id);
  if (intent.rowCue !== null) return 'row';
  // Only a role word was given ("the logo"): it is still the author's word for the thing.
  return intent.targetMention !== null && wordCount(intent.targetMention) <= 3 ? intent.targetMention : '';
};

/**
 * A facet id for a decision: "<screen>:<local>", both kebab-case. The
 * local name is the test author's words when the step has them (the
 * parameter a fill binds, else the target phrase), else the accessible
 * name, plus a role suffix ("policy-search:search-button",
 * "policy-search:policy-number-input").
 */
export const facetIdFor = (screen: string, intent: StepIntent, candidate: Candidate): string => {
  const screenSlug = slugify(screen);
  const role = suffixFor(candidate);
  const words = facetWords(intent, candidate);
  const base = words.length > 0 ? slugify(words, 50) : '';
  const tokens = base.length > 0 && base !== 'item' ? base.split('-') : [];
  const last = tokens[tokens.length - 1];
  const needsSuffix = role !== null && (last === undefined || !role.synonyms.includes(last));
  const local = [...tokens, ...(needsSuffix && role !== null ? role.suffix.split('-') : [])].join('-');
  return `${screenSlug}:${local.length > 0 ? local : slugify(candidate.role)}`;
};

// ─── Screen names ──────────────────────────────────────────────────────────

const ID_LIKE = /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,})$/i;
const PAGE_EXT = /\.(?:aspx|html?|jsp|php|asp|jsf)$/i;
const INDEX_PAGE = /^(?:default|index|home|homepage)$/i;

const kebab = (segment: string): string =>
  slugify(segment.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').replace(/([a-z0-9])([A-Z])/g, '$1-$2'));

const decode = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const relativePath = (url: URL, baseURL: string | undefined): string => {
  if (baseURL === undefined) return url.pathname;
  let base: URL;
  try {
    base = new URL(baseURL);
  } catch {
    return url.pathname;
  }
  if (base.origin !== url.origin) return url.pathname;
  const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  if (url.pathname === base.pathname || `${url.pathname}/` === basePath) return '/';
  return url.pathname.startsWith(basePath) ? `/${url.pathname.slice(basePath.length)}` : url.pathname;
};

/**
 * A screen name from a page URL: the last meaningful path segment,
 * kebab-cased the way OutSystems names screens ("/PolicySearch" →
 * "policy-search", "/OutSystemsUIWebsite/Productcatalog" →
 * "productcatalog"). Relative to baseURL when given, so the module root is
 * "home". Ids (numbers, GUIDs), page extensions (.aspx), and query strings
 * are ignored; a hash route ("#/policies") counts when the path is the root.
 */
export const screenNameFromUrl = (url: string, baseURL?: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(url, baseURL ?? 'http://localhost/');
  } catch {
    const segment = url.split(/[?#]/)[0]?.split('/').filter((s) => s.length > 0).pop();
    return segment === undefined ? 'home' : kebab(segment);
  }
  let path = relativePath(parsed, baseURL);
  if ((path === '/' || path.length === 0) && parsed.hash.startsWith('#/')) {
    path = parsed.hash.slice(1).split('?')[0] ?? '/';
  }
  const segments = path
    .split('/')
    .map((s) => decode(s).replace(PAGE_EXT, '').trim())
    .filter((s) => s.length > 0 && !ID_LIKE.test(s));
  const last = segments[segments.length - 1];
  if (last === undefined || INDEX_PAGE.test(last)) return 'home';
  const name = kebab(last);
  return name === 'item' ? 'home' : name;
};
