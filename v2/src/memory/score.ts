/**
 * memory.query scoring. score = status weight × phrase score × locator health.
 *
 * The phrase score is weighted token overlap between the step's words (minus
 * action verbs) and each of the facet's names (display name, aliases, and the
 * local id read as words), with tokens weighted by smoothed IDF within the
 * screen — log((N+1)/(df+1)) + 1, lifted from v1 `shingles.ts` — so the words
 * every facet on "Policy Search" shares ("policy", "search") stop matching
 * everything. Role cues ("button", "field", "results") and navigation verbs
 * adjust it; a landmark hint scopes it. Prototyped against the §5.3 example;
 * the numbers are pinned by test/unit/memory/score.spec.ts.
 *
 * The result is a suggestion: the host model decides.
 */
import { tokenize } from '../core/text.js';
import type { Facet, FacetKind, FacetStatus, LandmarkRole, ScoredFacet } from '../contract/schemas.js';
import { parseFacetId } from './ids.js';

export const STATUS_WEIGHT: Readonly<Record<FacetStatus, number>> = { trusted: 1, candidate: 0.85, stale: 0.4, retired: 0 };

export const DEFAULT_QUERY_LIMIT = 8;
export const SCORE_FLOOR = 0.3;

/** Tokenized with the shared tokenizer so inflections ("clicks", "entered") match their stems. */
const stemSet = (words: readonly string[]): ReadonlySet<string> => new Set(words.flatMap((word) => tokenize(word, { keepStopwords: true })));

const ACTION_VERBS = stemSet([
  'enter', 'type', 'input', 'fill', 'click', 'tap', 'press', 'select', 'choose', 'pick', 'navigate', 'go', 'open', 'visit',
  'hover', 'set', 'clear', 'submit', 'show', 'see', 'observe', 'validate', 'assert',
]);

/** Role words a step uses → the ARIA roles they name (lifted from v1 intent-classifier suffix tables, widened). */
const ROLE_CUE_WORDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['button', ['button']],
  ['field', ['textbox', 'searchbox', 'combobox', 'spinbutton']],
  ['textbox', ['textbox', 'searchbox']],
  ['box', ['textbox', 'searchbox', 'checkbox', 'combobox']],
  ['link', ['link']],
  ['checkbox', ['checkbox']],
  ['radio', ['radio']],
  ['dropdown', ['combobox', 'listbox']],
  ['combobox', ['combobox', 'listbox']],
  ['tab', ['tab']],
  ['table', ['table', 'grid']],
  ['grid', ['grid', 'table']],
  ['row', ['row']],
  ['result', ['table', 'grid', 'row', 'list']],
  ['list', ['list', 'listbox', 'table', 'grid']],
  ['menu', ['menu', 'menubar', 'menuitem', 'navigation']],
  ['dialog', ['dialog', 'alertdialog']],
  ['popup', ['dialog', 'alertdialog']],
  ['modal', ['dialog', 'alertdialog']],
  ['heading', ['heading']],
  ['switch', ['switch', 'checkbox']],
  ['option', ['option']],
];

/** Keyed by stem (tokenize("heading") is "head"); a Map, so tokens like "constructor" are not cues. */
const ROLE_CUES: ReadonlyMap<string, readonly string[]> = new Map(
  ROLE_CUE_WORDS.map(([word, roles]) => [tokenize(word, { keepStopwords: true })[0] ?? word, roles] as const),
);

const NAVIGATION = /\b(navigate|go\s+to|open|visit|land\s+on|return\s+to)\b/i;

/** Landmark cues (lifted from v1 intent-classifier LANDMARK_CUES): first match wins, specific to generic. */
const LANDMARK_CUES: ReadonlyArray<{ readonly re: RegExp; readonly landmark: LandmarkRole }> = [
  { re: /\b(?:nav(?:igation)?(?:\s+bar)?|menu|header|side\s*bar|side\s+nav|top\s+bar)\b/i, landmark: 'navigation' },
  { re: /\bfooter\b/i, landmark: 'contentinfo' },
  { re: /\bsearch\b/i, landmark: 'search' },
];

export const landmarkCue = (phrase: string): LandmarkRole | undefined => LANDMARK_CUES.find((cue) => cue.re.test(phrase))?.landmark;

/** The names a facet answers to: display name, aliases, and its local id read as words. */
export const namesOf = (facet: Pick<Facet, 'id' | 'displayName' | 'aliases'>): readonly string[] => [
  facet.displayName,
  ...facet.aliases,
  (parseFacetId(facet.id)?.local ?? facet.id).replace(/[-_]+/g, ' '),
];

/** Smoothed IDF over a set of facets (one screen). */
export const idfWeights = (facets: readonly Pick<Facet, 'id' | 'displayName' | 'aliases'>[]): ((token: string) => number) => {
  const df = new Map<string, number>();
  for (const facet of facets) {
    for (const token of new Set(namesOf(facet).flatMap((name) => tokenize(name)))) df.set(token, (df.get(token) ?? 0) + 1);
  }
  const n = facets.length;
  return (token: string) => Math.log((n + 1) / ((df.get(token) ?? 0) + 1)) + 1;
};

/**
 * Weighted overlap: mostly how much of the query the name covers, tempered by
 * how much of the name the query covers and by the weighted Jaccard; an exact
 * token match adds 0.2. Capped at 1.
 */
export const weightedSimilarity = (query: readonly string[], name: readonly string[], weight: (token: string) => number): number => {
  const q = new Set(query);
  const t = new Set(name);
  if (q.size === 0 || t.size === 0) return 0;
  const sum = (tokens: Iterable<string>): number => [...tokens].reduce((acc, token) => acc + weight(token), 0);
  const shared = sum([...q].filter((token) => t.has(token)));
  const union = sum(new Set([...q, ...t]));
  const exact = query.join(' ') === name.join(' ') ? 0.2 : 0;
  return Math.min(1, (0.55 * shared) / sum(q) + (0.25 * shared) / sum(t) + (0.2 * shared) / union + exact);
};

export interface QueryOptions {
  readonly phrase: string;
  readonly kind?: FacetKind;
  /** An explicit landmark hint: matching facets ×1.1, facets in another landmark ×0.7. */
  readonly landmark?: LandmarkRole;
  readonly limit?: number;
}

const compareScored = (a: ScoredFacet, b: ScoredFacet): number =>
  b.score - a.score || STATUS_WEIGHT[b.status] - STATUS_WEIGHT[a.status] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Score every live facet of one screen (IDF is computed within the screen). Unfiltered, unsorted. */
export const scoreFacets = (options: QueryOptions, facets: readonly Facet[], healthOf: (facet: Facet) => number): ScoredFacet[] => {
  const live = facets.filter((facet) => facet.status !== 'retired' && (options.kind === undefined || facet.kind === options.kind));
  const weight = idfWeights(live);
  const all = tokenize(options.phrase);
  const query = all.filter((token) => !ACTION_VERBS.has(token));
  const cues = all.flatMap((token) => ROLE_CUES.get(token) ?? []);
  const hasCues = all.some((token) => ROLE_CUES.has(token));
  const navigation = NAVIGATION.test(options.phrase);
  // A landmark the phrase merely mentions ("search field") boosts facets in it but
  // does not penalize others: on a screen named "Policy Search" the word is everywhere.
  const derivedLandmark = options.landmark === undefined ? landmarkCue(options.phrase) : undefined;
  return live.map((facet) => {
    const raw = Math.max(...namesOf(facet).map((name) => weightedSimilarity(query, tokenize(name), weight)));
    const role = facet.role === undefined || facet.role.length === 0 || !hasCues ? 1 : cues.includes(facet.role) ? 1.1 : 0.75;
    const kind = facet.kind === 'route' ? (navigation ? 1.1 : 0.6) : navigation ? 0.85 : 1;
    const landmark = facet.scope?.landmark;
    const scope =
      landmark === undefined
        ? 1
        : options.landmark !== undefined
          ? landmark === options.landmark ? 1.1 : 0.7
          : derivedLandmark !== undefined && landmark === derivedLandmark ? 1.1 : 1;
    const phraseScore = Math.min(1, raw * role * kind * scope);
    const locatorHealth = healthOf(facet);
    return { ...facet, phraseScore, locatorHealth, score: STATUS_WEIGHT[facet.status] * phraseScore * locatorHealth };
  });
};

/** Keep results above the floor, best first (trusted before candidate at equal score, then id), at most `limit`. */
export const rankScored = (scored: readonly ScoredFacet[], limit: number = DEFAULT_QUERY_LIMIT): ScoredFacet[] =>
  scored.filter((facet) => facet.score > SCORE_FLOOR).sort(compareScored).slice(0, Math.max(0, limit));

/** Pure query over one screen's facets. */
export const queryFacets = (options: QueryOptions, facets: readonly Facet[], healthOf: (facet: Facet) => number): ScoredFacet[] =>
  rankScored(scoreFacets(options, facets, healthOf), options.limit ?? DEFAULT_QUERY_LIMIT);
