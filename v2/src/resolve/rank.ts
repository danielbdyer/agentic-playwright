/**
 * The heuristic pre-filter: rank a snapshot's candidates against a step's
 * intent. The ranking is a suggestion handed to the agent with the
 * snapshot (app.observe hints) and the input to the no-model decider; it
 * never acts.
 *
 * A candidate's score is a weighted mean of the signals the wording
 * gives (name similarity, role fit, landmark, row), scaled to leave room
 * for small bonuses from the pattern library and OutSystems-generic
 * shapes, then multiplied down for hidden or disabled candidates. Ties
 * break by document order, so the same snapshot always ranks the same way.
 */
import type { Candidate, Hint, Verb } from '../contract/schemas.js';
import { containsBounded, containsLoose, identifierWords, nameSimilarity, namesEqual } from './phrase.js';
import { matchPatterns, substituteParams, type PatternMatch } from './patterns.js';
import { FORM_LIKE_ROLES, TEXT_ENTRY_ROLES, indexCandidates, isAdmitted, isLandmarkNode, isMessage, type CandidateIndex, type IndexedCandidate } from './surface.js';
import type { StepIntent } from './types.js';

export interface RankOptions {
  /** Hints returned; default 10. */
  readonly limit?: number;
  /** Values for "@param" references in the target phrase and row cue. */
  readonly params?: Readonly<Record<string, string>>;
}

export interface ScoredCandidate {
  readonly ref: string;
  /** Document order. */
  readonly index: number;
  readonly score: number;
  /** Plain-words reasons for the score, strongest first. */
  readonly reasons: readonly string[];
  /** What counted against it (hidden, disabled, wrong role, weak signals) and cues the page could not honor. */
  readonly against: readonly string[];
  readonly patterns: readonly PatternMatch[];
}

const WEIGHT = { name: 0.55, role: 0.25, landmark: 0.12, row: 0.2 } as const;
/** The base score is scaled to this, leaving the rest for bonuses. */
const BASE_SCALE = 0.85;
const MAX_BONUS = 0.15;

// ─── Role fit ──────────────────────────────────────────────────────────────

const CLICK_ROLES = new Set([
  'button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'checkbox', 'radio', 'switch', 'option', 'treeitem', 'listitem',
]);
const CHECK_ROLES = new Set(['checkbox', 'switch', 'radio', 'menuitemcheckbox', 'menuitemradio']);
const NAV_ROLES = new Set(['link', 'menuitem', 'tab']);
const INFO_ROLES = new Set(['heading', 'row', 'cell', 'gridcell', 'alert', 'status', 'log', 'img', 'columnheader', 'rowheader']);

const isHandlerOwner = (c: Candidate): boolean => c.role === 'generic' && c.interactive;

/** How well a candidate's role fits what the verb does, 0..1 (spec families). */
const verbFit = (intent: StepIntent, c: Candidate): number => {
  const textEntry = TEXT_ENTRY_ROLES.includes(c.role);
  switch (intent.verb) {
    case 'click':
      if (CLICK_ROLES.has(c.role) || isHandlerOwner(c)) return 1;
      if (textEntry) return 0.35;
      return INFO_ROLES.has(c.role) ? 0.25 : 0.1;
    case 'fill':
      return textEntry ? 1 : 0;
    case 'select':
      if (c.role === 'combobox' || c.role === 'listbox') return 1;
      if (c.role === 'option') return 0.8;
      return c.role === 'button' ? 0.3 : 0.05;
    case 'check':
    case 'uncheck':
      if (CHECK_ROLES.has(c.role)) return 1;
      if (isHandlerOwner(c)) return 0.4;
      return c.role === 'button' ? 0.3 : 0.05;
    case 'press':
      return c.interactive ? 0.8 : 0.3;
    case 'hover':
      return c.interactive ? 1 : c.role === 'img' || c.role === 'generic' ? 0.8 : 0.5;
    case 'navigate':
      if (NAV_ROLES.has(c.role)) return 1;
      if (c.role === 'button') return 0.8;
      return isHandlerOwner(c) ? 0.7 : 0.1;
    case 'assert':
    case 'wait': {
      const kind = intent.assertions[0]?.kind;
      if (kind === 'value') return textEntry ? 1 : 0.3;
      if (kind === 'checked' || kind === 'unchecked') return CHECK_ROLES.has(c.role) ? 1 : 0.2;
      if (kind === 'enabled' || kind === 'disabled') return c.interactive ? 1 : 0.3;
      return INFO_ROLES.has(c.role) || isMessage(c) ? 0.9 : 0.8;
    }
    default: {
      const never: never = intent.verb;
      return never;
    }
  }
};

/** Roles near a hinted role: what an author calls a "button" is often a roleless clickable on OutSystems. */
const RELATED: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  button: { generic: 0.75, link: 0.55, menuitem: 0.55, tab: 0.55, switch: 0.5 },
  link: { generic: 0.7, menuitem: 0.6, tab: 0.6, button: 0.6, listitem: 0.6 },
  menuitem: { link: 0.8, button: 0.6, tab: 0.6, generic: 0.6, listitem: 0.6 },
  tab: { link: 0.6, button: 0.6, generic: 0.6 },
  combobox: { button: 0.5, textbox: 0.4 },
  checkbox: { radio: 0.4, generic: 0.4, button: 0.3 },
  switch: { button: 0.5, generic: 0.4 },
  radio: { checkbox: 0.4, generic: 0.4 },
  row: { cell: 0.4, gridcell: 0.4 },
  alert: { status: 0.7, generic: 0.8 },
  status: { alert: 0.6, generic: 0.8 },
  table: { row: 0.4 },
  grid: { row: 0.4 },
  img: { generic: 0.3, link: 0.5, button: 0.5 },
  option: { listitem: 0.6, menuitem: 0.5 },
};

const hintFit = (hint: string, c: Candidate): number => {
  if (isAdmitted(hint, c.role)) return 1;
  const related = RELATED[hint]?.[c.role];
  if (related === undefined) return 0.1;
  // A "generic" stands in for a message only when it is not clickable, and for a control only when it is.
  if (c.role === 'generic' && c.interactive === (hint === 'alert' || hint === 'status')) return 0.1;
  return related;
};

const GATED_VERBS: ReadonlySet<Verb> = new Set<Verb>(['fill', 'select', 'check', 'uncheck']);
const ACTION_VERBS: ReadonlySet<Verb> = new Set<Verb>(['click', 'fill', 'select', 'check', 'uncheck', 'press', 'hover', 'navigate']);
const CLICKISH: ReadonlySet<Verb> = new Set<Verb>(['click', 'check', 'uncheck', 'hover', 'navigate']);

// ─── Name ──────────────────────────────────────────────────────────────────

interface NameSignal {
  readonly value: number;
  readonly source: string;
  readonly matched: string;
  /** The phrase equals the matched text (case-insensitive), not just shares its words. */
  readonly exact: boolean;
}

/**
 * Similarity capped below 1 unless the texts are equal: "Search Policy"
 * shares every word with "Policy Search" but is not the control named so.
 */
const similarity = (phrase: string, text: string): { readonly value: number; readonly exact: boolean } => {
  const exact = namesEqual(phrase, text);
  return { value: exact ? 1 : Math.min(0.95, nameSimilarity(phrase, text)), exact };
};

const DESIGNER_PREFIX = /^(?:wt|b\d+|wb|ctl\d*)[_-]?/i;

const nameSignal = (phrase: string, mention: string | null, exact: boolean, c: Candidate): NameSignal => {
  const signal = (source: string, matched: string, weight: number, against: string = phrase): NameSignal => {
    const s = similarity(against, matched);
    return { value: weight * s.value, source, matched, exact: s.exact && weight === 1 };
  };
  const options: NameSignal[] = [signal('name', c.name, 1)];
  if (c.placeholder !== undefined && c.placeholder.length > 0) options.push(signal('placeholder', c.placeholder, 0.95));
  if (c.testId !== undefined && c.testId.length > 0) options.push(signal('test id', identifierWords(c.testId), 0.85));
  if (c.id !== undefined && c.idKind === 'designer') {
    options.push(signal('designer id', identifierWords(c.id.replace(DESIGNER_PREFIX, '')), 0.8));
  }
  if (mention !== null && mention !== phrase) options.push(signal('name', c.name, 0.9, mention));
  if (c.role !== 'row' && c.rowText !== undefined && c.rowText.length > 0) options.push(signal('row text', c.rowText, 0.5));
  const best = options.reduce((a, b) => (b.value > a.value ? b : a));
  // A quoted name is meant literally: a candidate that does not even contain it is a weak match.
  const literalMiss = exact && !containsLoose(c.name, phrase) && !containsLoose(c.placeholder ?? '', phrase);
  return literalMiss ? { ...best, value: best.value * 0.7 } : best;
};

const quality = (name: NameSignal): string =>
  name.exact ? 'equals' : name.value >= 0.7 ? 'closely matches' : name.value >= 0.4 ? 'partly matches' : 'barely matches';

/** How a candidate is called in reasons. */
export const roleLabel = (c: Candidate): string =>
  c.role === 'generic' ? (c.interactive ? 'roleless clickable' : 'feedback message') : c.role;

const short = (text: string): string => (text.length > 40 ? `${text.slice(0, 37)}…` : text);

// ─── Bonuses ───────────────────────────────────────────────────────────────

const SUCCESS_RE = /\b(?:success|successful|successfully|confirmed|saved|completed|done)\b/i;
const ERROR_RE = /\b(?:error|fail(?:ed|ure)?|invalid|warning|denied|problem|required)\b/i;
const CONFIRM_RE = /\b(?:ok|okay|yes|confirm|accept|continue|proceed|delete|remove|submit|save|close|done|dismiss)\b/i;

const onlyFieldInItsForm = (index: CandidateIndex, entry: IndexedCandidate): boolean =>
  entry.landmarks
    .filter((l) => FORM_LIKE_ROLES.includes(l.role))
    .some((l) => index.within(l).filter((e) => TEXT_ENTRY_ROLES.includes(e.candidate.role)).length === 1);

const onlyButtonInDialog = (index: CandidateIndex, entry: IndexedCandidate): boolean =>
  entry.landmarks
    .filter((l) => l.role === 'dialog')
    .some((l) => index.within(l).filter((e) => e.candidate.role === 'button').length === 1);

interface Part {
  readonly weight: number;
  readonly value: number;
  readonly reason: string;
}

interface Bonus {
  readonly value: number;
  readonly reason: string;
}

// ─── Scoring ───────────────────────────────────────────────────────────────

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Score every candidate (all of them, sorted best first). */
export const scoreCandidates = (
  intent: StepIntent,
  candidates: readonly Candidate[],
  options: RankOptions = {},
): readonly ScoredCandidate[] => {
  const index = indexCandidates(candidates);
  const phrase = substituteParams(intent.targetPhrase, options.params);
  const mention = substituteParams(intent.targetMention, options.params);
  const rowCue = substituteParams(intent.rowCue, options.params);
  const rowCueUsable = rowCue !== null && !/^@[A-Za-z_]\w*$/.test(rowCue);
  const rowCueOnPage =
    rowCueUsable && index.all.some((e) => containsLoose(e.candidate.role === 'row' ? e.candidate.name : e.candidate.rowText ?? '', rowCue));
  const cue = intent.landmarkCue;
  const cueOnPage = cue !== null && index.hasLandmark(cue);
  const matches = matchPatterns(intent, candidates, { index, ...(options.params === undefined ? {} : { params: options.params }) });
  const matchesByRef = new Map<string, PatternMatch[]>();
  for (const m of matches) matchesByRef.set(m.ref, [...(matchesByRef.get(m.ref) ?? []), m]);
  const assertionKind = intent.assertions[0]?.kind;
  const observing = intent.verb === 'assert' || intent.verb === 'wait';
  const cueText = `${intent.actionText} ${phrase ?? ''}`;

  const scored = index.all.map((entry): ScoredCandidate => {
    const c = entry.candidate;
    const parts: Part[] = [];

    if (phrase !== null) {
      const name = nameSignal(phrase, mention, intent.exactName, c);
      parts.push({
        weight: WEIGHT.name,
        value: name.value,
        reason: `${name.source} "${short(name.matched)}" ${quality(name)} "${phrase}"`,
      });
    }

    const fit = verbFit(intent, c);
    const hint = intent.roleHint;
    const roleValue = hint === null ? fit : 0.65 * hintFit(hint, c) + 0.35 * fit;
    parts.push({
      weight: WEIGHT.role,
      value: roleValue,
      reason: hint !== null && isAdmitted(hint, c.role)
        ? `${c.role} is the ${hint} the step names`
        : roleValue >= 0.6 ? `${roleLabel(c)} fits ${intent.verb}` : `${roleLabel(c)} is unlikely for ${hint ?? intent.verb}`,
    });

    if (cue !== null && cueOnPage) {
      const inside = index.inLandmark(entry, cue) || (isLandmarkNode(c) && c.role === cue);
      parts.push({ weight: WEIGHT.landmark, value: inside ? 1 : 0, reason: inside ? `inside the ${cue} landmark` : `outside the ${cue} landmark` });
    }

    if (rowCueUsable && rowCueOnPage) {
      const rowText = c.role === 'row' ? c.name : c.rowText ?? '';
      const value = rowText.length === 0 ? 0 : containsBounded(rowText, rowCue) ? 1 : containsLoose(rowText, rowCue) ? 0.7 : 0.5 * nameSimilarity(rowCue, rowText);
      parts.push({ weight: WEIGHT.row, value, reason: value >= 0.7 ? `in the row with "${rowCue}"` : `not in the row with "${rowCue}"` });
    }

    const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
    const base = parts.reduce((sum, p) => sum + p.weight * p.value, 0) / totalWeight;

    const bonuses: Bonus[] = [];
    const own = matchesByRef.get(c.ref) ?? [];
    const first = own[0];
    if (first !== undefined) {
      bonuses.push({ value: first.matcherIndex <= 1 ? 0.06 : 0.04, reason: `pattern ${first.patternId} (${first.matcherId})` });
    }
    const textEntry = TEXT_ENTRY_ROLES.includes(c.role);
    if (
      textEntry &&
      c.namingSource === 'placeholder' &&
      index.inLandmark(entry, 'search') &&
      (cue === 'search' || /search/i.test(`${phrase ?? ''} ${mention ?? ''}`)) &&
      (intent.verb === 'fill' || intent.verb === 'press' || observing)
    ) {
      bonuses.push({ value: 0.05, reason: 'placeholder-named search input in the search landmark' });
    }
    if (isHandlerOwner(c) && c.affordance === 'handler-owner' && phrase !== null && namesEqual(c.name, phrase) && CLICKISH.has(intent.verb)) {
      bonuses.push({ value: 0.05, reason: 'roleless clickable named by its own text' });
    }
    if (observing && SUCCESS_RE.test(cueText) && (c.role === 'status' || (isMessage(c) && c.role !== 'alert'))) {
      bonuses.push({ value: 0.06, reason: `${c.role === 'status' ? 'status region' : 'feedback message'} for success wording` });
    }
    if (observing && ERROR_RE.test(cueText) && (c.role === 'alert' || (isMessage(c) && c.role !== 'status'))) {
      bonuses.push({ value: 0.06, reason: `${c.role === 'alert' ? 'alert' : 'feedback message'} for error wording` });
    }
    const weakName = phrase === null || nameSignal(phrase, mention, false, c).value < 0.5;
    if (intent.verb === 'fill' && textEntry && weakName && onlyFieldInItsForm(index, entry)) {
      bonuses.push({ value: 0.05, reason: 'the only text field in its form' });
    }
    if (intent.verb === 'click' && c.role === 'button' && CONFIRM_RE.test(phrase ?? intent.actionText) && onlyButtonInDialog(index, entry)) {
      bonuses.push({ value: 0.05, reason: 'the only button in the dialog' });
    }
    if (c.inViewport) bonuses.push({ value: 0.005, reason: '' });
    const bonus = Math.min(MAX_BONUS, bonuses.reduce((sum, b) => sum + b.value, 0));

    const penalties: string[] = [];
    let factor = 1;
    if (!c.visible && !(observing && assertionKind === 'hidden')) {
      factor *= 0.45;
      penalties.push('not visible');
    }
    if (!c.enabled && ACTION_VERBS.has(intent.verb) && !(observing && assertionKind === 'disabled')) {
      factor *= 0.7;
      penalties.push('disabled');
    }
    if (GATED_VERBS.has(intent.verb) && fit < 0.3) {
      factor *= 0.4;
      penalties.push(`a ${roleLabel(c)} cannot be used to ${intent.verb}`);
    }
    if (isLandmarkNode(c) && ACTION_VERBS.has(intent.verb)) {
      factor *= 0.5;
      penalties.push('a landmark, not a control');
    }

    const score = round3(Math.min(1, base * BASE_SCALE + bonus) * factor);
    // Signals that held (value ≥ 0.5) explain the score; weak ones count against it.
    const positive = [
      ...parts.filter((p) => p.value >= 0.5).map((p) => ({ value: p.weight * p.value, reason: p.reason })),
      ...bonuses.filter((b) => b.reason.length > 0).map((b) => ({ value: b.value, reason: b.reason })),
    ]
      .sort((a, b) => b.value - a.value)
      .map((p) => p.reason);
    const weak = parts.filter((p) => p.value < 0.5).sort((a, b) => b.weight - a.weight).map((p) => p.reason);
    const notes = [
      ...(cue !== null && !cueOnPage ? [`no ${cue} landmark on the page`] : []),
      ...(rowCue !== null && !rowCueUsable ? [`row value ${rowCue} unknown`] : []),
      ...(rowCueUsable && !rowCueOnPage ? [`no row with "${rowCue}" on the page`] : []),
    ];
    return { ref: c.ref, index: entry.index, score, reasons: positive, against: [...penalties, ...notes, ...weak], patterns: own };
  });

  return [...scored].sort((a, b) => b.score - a.score || a.index - b.index);
};

/** Plain-words why: the top signals, then what counted against the candidate. */
const why = (s: ScoredCandidate): string => [...s.reasons.slice(0, 3), ...s.against.slice(0, 2)].join('; ');

/**
 * Rank candidates for an intent: the best `limit` (default 10) as contract
 * Hints, score 0..1 with a plain-words why. Candidates scoring 0 are left out.
 */
export const rankCandidates = (
  intent: StepIntent,
  candidates: readonly Candidate[],
  options: RankOptions = {},
): Hint[] => {
  const limit = Math.max(1, options.limit ?? 10);
  return scoreCandidates(intent, candidates, options)
    .filter((s) => s.score > 0)
    .slice(0, limit)
    .map((s) => ({ ref: s.ref, score: s.score, why: why(s) }));
};
