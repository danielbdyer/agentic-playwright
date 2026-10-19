/**
 * The pattern library: v1's 10 matchers and 8 patterns
 * (product/domain/resolution/patterns/), adapted to v2 candidate lists.
 *
 * A matcher is a pure function that names a candidate only when exactly
 * one fits; a pattern guards a matcher ladder (specific → generic) and
 * takes the first matcher that fires. The registry order is v1's. Unlike
 * v1, every pattern is walked and all hits are returned, de-duplicated by
 * ref, so ranking can use them as evidence and a host model sees them.
 *
 * Fixes over v1, each from the resolution map:
 * - role-and-name-in-landmark and single-textbox-in-form admit the role
 *   family (`rolesAdmittedBy`): a "search field" is a searchbox or a
 *   spinbutton as often as a textbox;
 * - every landmark of a role is iterated, not only the first (OutSystems
 *   pages commonly have a header nav and a side nav);
 * - dialogs are found by the scope the walker reports for them (role
 *   dialog), not assumed to be ARIA landmarks, and "form" context means a
 *   named form, the search landmark, or a dialog, because an unnamed
 *   <form> is not a landmark at all;
 * - a cue for a landmark the page does not expose (a <footer> nested in a
 *   section is not contentinfo) makes the landmark-scoped matcher decline
 *   instead of failing the step; the page-wide matchers still run.
 */
import type { Verb } from '../contract/schemas.js';
import { containsBounded, containsLoose, namesEqual } from './phrase.js';
import {
  FORM_LIKE_ROLES,
  TEXT_ENTRY_ROLES,
  indexCandidates,
  isAdmitted,
  isMessage,
  type CandidateIndex,
  type IndexedCandidate,
} from './surface.js';
import type { Candidate } from '../contract/schemas.js';
import type { StepIntent } from './types.js';

// ─── Kernel ────────────────────────────────────────────────────────────────

export interface MatcherHit {
  readonly ref: string;
  readonly matcherId: string;
  readonly rationale: string;
}

export interface PatternMatch {
  readonly ref: string;
  readonly patternId: string;
  readonly matcherId: string;
  /** Position of the matcher in its pattern's ladder: 0 is the most specific. */
  readonly matcherIndex: number;
  readonly rationale: string;
}

export interface MatchContext {
  readonly intent: StepIntent;
  readonly index: CandidateIndex;
  /** The target phrase with "@param" references substituted when values were given. */
  readonly phrase: string | null;
  /** The role hint, or the role the verb implies (fill → textbox, select → combobox, check → checkbox). */
  readonly role: string | null;
  /** The row cue with "@param" references substituted. */
  readonly rowCue: string | null;
}

export type Matcher = (ctx: MatchContext) => MatcherHit | null;

export interface Pattern {
  readonly id: string;
  readonly description: string;
  readonly guard: (ctx: MatchContext) => boolean;
  readonly matchers: readonly Matcher[];
}

const unique = (entries: readonly IndexedCandidate[]): IndexedCandidate | null => {
  const refs = new Set(entries.map((e) => e.candidate.ref));
  return refs.size === 1 ? entries[0]! : null;
};

const hit = (entry: IndexedCandidate, matcherId: string, rationale: string): MatcherHit => ({ ref: entry.candidate.ref, matcherId, rationale });

/** Exact (case-insensitive) names first; substring only when nothing is exact. */
const byName = (entries: readonly IndexedCandidate[], phrase: string, exactOnly: boolean): readonly IndexedCandidate[] => {
  const exact = entries.filter((e) => namesEqual(e.candidate.name, phrase));
  if (exact.length > 0 || exactOnly) return exact;
  return entries.filter((e) => containsLoose(e.candidate.name, phrase));
};

const CLICKISH: ReadonlySet<Verb> = new Set<Verb>(['click', 'check', 'uncheck', 'hover', 'navigate']);
const OBSERVISH: ReadonlySet<Verb> = new Set<Verb>(['assert', 'wait']);

const isClickish = (ctx: MatchContext): boolean =>
  CLICKISH.has(ctx.intent.verb) && !(ctx.intent.verb === 'navigate' && ctx.intent.value !== null);

const SUBMIT_RE = /\b(?:submit|save|confirm|apply|continue|search|send|sign\s*in|log\s*in|login|ok|done|next|finish|update|create|register)\b/i;
const DIALOG_CUE_RE = /\b(?:modal|dialog|confirmation|pop-?up|lightbox)\b/i;
const DIALOG_BUTTON_RE = /\b(?:confirm|cancel|accept|dismiss|ok|okay|close|yes|no|delete|remove|continue|proceed)\b/i;
const SUCCESS_RE = /\b(?:success|successful|successfully|confirmed|saved|completed|ok)\b/i;
const ERROR_RE = /\b(?:error|fail(?:ed|ure)?|invalid|warning|denied|problem|issue)\b/i;

// ─── Matchers ──────────────────────────────────────────────────────────────

/** M: role + name equal (case-insensitive) on exactly one candidate of an admitted role. */
export const roleAndNameExact: Matcher = (ctx) => {
  const { role, phrase } = ctx;
  if (role === null || phrase === null) return null;
  const match = unique(ctx.index.all.filter((e) => isAdmitted(role, e.candidate.role) && namesEqual(e.candidate.name, phrase)));
  return match === null ? null : hit(match, 'role-and-name-exact', `${role} named "${phrase}" matched exactly one candidate`);
};

/** M: role + name containing the phrase on exactly one candidate. */
export const roleAndNameSubstring: Matcher = (ctx) => {
  const { role, phrase } = ctx;
  if (role === null || phrase === null) return null;
  const match = unique(ctx.index.all.filter((e) => isAdmitted(role, e.candidate.role) && containsLoose(e.candidate.name, phrase)));
  return match === null ? null : hit(match, 'role-and-name-substring', `${role} with a name containing "${phrase}" matched exactly one candidate`);
};

/**
 * M: the name inside the landmark the wording cues, across every landmark
 * of that role; fires when exactly one candidate fits over all of them.
 * Admits the role family (fix: v1 compared roles strictly and missed
 * searchboxes in the search landmark).
 */
export const roleAndNameInLandmark: Matcher = (ctx) => {
  const cue = ctx.intent.landmarkCue;
  const { role, phrase } = ctx;
  if (cue === null || phrase === null) return null;
  const hits = ctx.index.landmarksOf(cue).flatMap((inst) =>
    byName(
      ctx.index.within(inst).filter((e) => role === null || isAdmitted(role, e.candidate.role)),
      phrase,
      ctx.intent.exactName,
    ),
  );
  const match = unique(hits);
  return match === null
    ? null
    : hit(match, 'role-and-name-in-landmark', `${role ?? 'a control'} named like "${phrase}" is the only match inside the ${cue} landmark`);
};

/** M: a link (or menu item) by name inside any navigation landmark. */
export const linkInNavLandmark: Matcher = (ctx) => {
  const { role, phrase } = ctx;
  if (phrase === null) return null;
  if (role !== null && role !== 'link' && role !== 'menuitem') return null;
  const hits = ctx.index.landmarksOf('navigation').flatMap((inst) =>
    byName(ctx.index.within(inst).filter((e) => e.candidate.role === 'link' || e.candidate.role === 'menuitem'), phrase, ctx.intent.exactName),
  );
  const match = unique(hits);
  return match === null ? null : hit(match, 'link-in-nav-landmark', `link named "${phrase}" inside the navigation`);
};

/** M: a button by name inside a dialog. */
export const dialogButtonByName: Matcher = (ctx) => {
  const { role, phrase } = ctx;
  if (phrase === null) return null;
  if (role !== null && role !== 'button') return null;
  const hits = ctx.index.landmarksOf('dialog').flatMap((inst) =>
    byName(ctx.index.within(inst).filter((e) => e.candidate.role === 'button'), phrase, ctx.intent.exactName),
  );
  const match = unique(hits);
  return match === null ? null : hit(match, 'dialog-button-by-name', `button named "${phrase}" inside the dialog`);
};

const formLikeScopes = (ctx: MatchContext): ReturnType<CandidateIndex['landmarksOf']> => {
  const cue = ctx.intent.landmarkCue;
  const roles = cue !== null && FORM_LIKE_ROLES.includes(cue) ? [cue] : FORM_LIKE_ROLES;
  return roles.flatMap((r) => ctx.index.landmarksOf(r));
};

/** M: a submit-like click resolved to the only button of a form-like container. */
export const formContextSubmit: Matcher = (ctx) => {
  if (ctx.intent.verb !== 'click') return null;
  if (!SUBMIT_RE.test(ctx.phrase ?? '') && !SUBMIT_RE.test(ctx.intent.actionText)) return null;
  const hits = formLikeScopes(ctx).flatMap((inst) => {
    const buttons = ctx.index.within(inst).filter((e) => e.candidate.role === 'button');
    return buttons.length === 1 ? buttons : [];
  });
  const match = unique(hits);
  return match === null ? null : hit(match, 'form-context-submit', 'submit-like click: the only button in its form');
};

/** M: a fill resolved to the only text-entry control of a form-like container (role family admitted). */
export const singleTextboxInForm: Matcher = (ctx) => {
  if (ctx.intent.verb !== 'fill') return null;
  const hits = formLikeScopes(ctx).flatMap((inst) => {
    const fields = ctx.index.within(inst).filter((e) => TEXT_ENTRY_ROLES.includes(e.candidate.role));
    return fields.length === 1 ? fields : [];
  });
  const match = unique(hits);
  return match === null ? null : hit(match, 'single-textbox-in-form', 'the only text field in its form');
};

/** M: a fill resolved by placeholder text: exact (case-insensitive) first, then containment. */
export const textboxByPlaceholder: Matcher = (ctx) => {
  if (ctx.intent.verb !== 'fill' || ctx.phrase === null) return null;
  const phrase = ctx.phrase;
  const withPlaceholder = ctx.index.all.filter((e) => e.candidate.interactive && (e.candidate.placeholder ?? '').length > 0);
  const exact = unique(withPlaceholder.filter((e) => namesEqual(e.candidate.placeholder ?? '', phrase)));
  const match = exact ?? unique(withPlaceholder.filter((e) => containsLoose(e.candidate.placeholder ?? '', phrase)));
  return match === null
    ? null
    : hit(match, 'textbox-by-placeholder', `placeholder "${match.candidate.placeholder ?? ''}" ${exact !== null ? 'equals' : 'contains'} "${phrase}"`);
};

/** M: an assertion about success or failure resolved to the single status or alert (or feedback message). */
export const statusOrAlertByName: Matcher = (ctx) => {
  if (!OBSERVISH.has(ctx.intent.verb)) return null;
  const haystack = `${ctx.intent.actionText} ${ctx.phrase ?? ''}`;
  const implyStatus = SUCCESS_RE.test(haystack) || ctx.role === 'status';
  const implyAlert = ERROR_RE.test(haystack) || ctx.role === 'alert';
  if (!implyStatus && !implyAlert) return null;
  const phrase = ctx.phrase;
  // A phrase that is only the cue word ("error", "success message") names no particular message.
  const cueOnly = phrase === null || ((SUCCESS_RE.test(phrase) || ERROR_RE.test(phrase)) && phrase.split(/\s+/).length <= 2);
  const tryRole = (role: 'status' | 'alert'): MatcherHit | null => {
    const pool = ctx.index.all.filter((e) => e.candidate.role === role || (role === 'status' && e.candidate.role === 'log') || (e.candidate.role === 'generic' && isMessage(e.candidate)));
    const named = cueOnly ? pool : pool.filter((e) => containsLoose(e.candidate.name, phrase ?? ''));
    const match = unique(named);
    return match === null ? null : hit(match, 'status-or-alert-by-name', `the assertion implies a ${role} message, and exactly one is on the page`);
  };
  return (implyStatus ? tryRole('status') : null) ?? (implyAlert ? tryRole('alert') : null);
};

/**
 * M: the control inside the one row whose text contains the cue (v1's C7,
 * bulk checkboxes with no name). A row hint resolves to the row itself.
 */
export const controlInRowByCellText: Matcher = (ctx) => {
  const cue = ctx.rowCue;
  if (cue === null) return null;
  const groups = ctx.index.rows();
  const bounded = groups.filter((g) => containsBounded(g.text, cue));
  const rows = bounded.length > 0 ? bounded : groups.filter((g) => containsLoose(g.text, cue));
  if (rows.length !== 1) return null;
  const row = rows[0]!;
  const { role, phrase } = ctx;
  if (role === 'row' || (role === null && phrase === null && OBSERVISH.has(ctx.intent.verb))) {
    if (row.row === null || row.rowCount !== 1) return null;
    return hit(row.row, 'control-in-row-by-cell-text', `the row whose text contains "${cue}"`);
  }
  const members = row.members.filter((e) => (role === null || isAdmitted(role, e.candidate.role)) && (e.candidate.interactive || role !== null));
  const named = phrase === null ? members : byName(members, phrase, ctx.intent.exactName);
  const match = unique(named);
  return match === null
    ? null
    : hit(match, 'control-in-row-by-cell-text', `${role ?? 'the only matching control'} inside the row whose text contains "${cue}"`);
};

/** M: any interactive candidate by its visible name, roleless handler-owners included; ignores the role hint. */
export const interactiveByContent: Matcher = (ctx) => {
  if (!isClickish(ctx) || ctx.phrase === null) return null;
  const phrase = ctx.phrase;
  const interactive = ctx.index.all.filter((e) => e.candidate.interactive && e.candidate.name.length > 0);
  const exact = unique(interactive.filter((e) => namesEqual(e.candidate.name, phrase)));
  const match = exact ?? unique(interactive.filter((e) => containsLoose(e.candidate.name, phrase)));
  return match === null
    ? null
    : hit(match, 'interactive-by-content', `interactive ${match.candidate.role} with visible text ${exact !== null ? 'equal to' : 'containing'} "${phrase}", exactly one`);
};

// ─── Patterns and registry ─────────────────────────────────────────────────

export const PATTERNS: readonly Pattern[] = [
  {
    id: 'row-scoped-control',
    description: "A control inside the row identified by a cell's text",
    guard: (ctx) => ctx.rowCue !== null,
    matchers: [controlInRowByCellText],
  },
  {
    id: 'dialog-confirmation',
    description: 'A button inside a dialog, for confirm/cancel-like clicks or wording that names a dialog',
    guard: (ctx) =>
      isClickish(ctx) &&
      (ctx.intent.landmarkCue === 'dialog' || DIALOG_CUE_RE.test(ctx.intent.actionText) || DIALOG_BUTTON_RE.test(ctx.phrase ?? '')),
    matchers: [dialogButtonByName],
  },
  {
    id: 'navigation-link-by-name',
    description: 'A link by name inside the navigation landmark',
    guard: (ctx) =>
      (ctx.intent.verb === 'click' || (ctx.intent.verb === 'navigate' && ctx.intent.value === null)) &&
      ctx.phrase !== null &&
      (ctx.role === null || ctx.role === 'link' || ctx.role === 'menuitem'),
    matchers: [linkInNavLandmark],
  },
  {
    id: 'form-submission',
    description: 'A submit-like click on a form button, specific first',
    guard: (ctx) => ctx.intent.verb === 'click' && (SUBMIT_RE.test(ctx.phrase ?? '') || SUBMIT_RE.test(ctx.intent.actionText)),
    matchers: [roleAndNameExact, roleAndNameSubstring, formContextSubmit],
  },
  {
    id: 'field-input-by-label',
    description: 'A fill on a text field: in-landmark, exact, substring, placeholder, single field in a form',
    guard: (ctx) => ctx.intent.verb === 'fill',
    matchers: [roleAndNameInLandmark, roleAndNameExact, roleAndNameSubstring, textboxByPlaceholder, singleTextboxInForm],
  },
  {
    id: 'observation-by-assertion-phrase',
    description: 'An assertion target by role and name, or a status/alert from success/error wording',
    guard: (ctx) => OBSERVISH.has(ctx.intent.verb),
    matchers: [roleAndNameExact, roleAndNameSubstring, statusOrAlertByName],
  },
  {
    id: 'locator-by-role-and-name',
    description: 'Any intent with a role and a name: in-landmark, exact, substring',
    guard: (ctx) => ctx.role !== null && ctx.phrase !== null,
    matchers: [roleAndNameInLandmark, roleAndNameExact, roleAndNameSubstring],
  },
  {
    id: 'content-named-interactive',
    description: 'The floor: a click on any interactive element by visible text, roleless handler-owners included',
    guard: (ctx) => isClickish(ctx) && ctx.phrase !== null,
    matchers: [interactiveByContent],
  },
];

const VERB_ROLE: Partial<Record<Verb, string>> = { fill: 'textbox', select: 'combobox', check: 'checkbox', uncheck: 'checkbox' };

/** Replace "@name" with its value; unknown names stay as written (and so match nothing). */
export const substituteParams = (text: string | null, params: Readonly<Record<string, string>> | undefined): string | null => {
  if (text === null || params === undefined) return text;
  return text.replace(/@([A-Za-z_]\w*)/g, (whole: string, name: string) => {
    const key = Object.keys(params).find((k) => k.toLowerCase() === name.toLowerCase());
    return key === undefined ? whole : params[key] ?? whole;
  });
};

export interface MatchOptions {
  /** Values for "@param" references in the target phrase and row cue. */
  readonly params?: Readonly<Record<string, string>>;
  /** A prebuilt index, when the caller already has one for these candidates. */
  readonly index?: CandidateIndex;
}

export const matchContext = (intent: StepIntent, candidates: readonly Candidate[], options: MatchOptions = {}): MatchContext => ({
  intent,
  index: options.index ?? indexCandidates(candidates),
  phrase: substituteParams(intent.targetPhrase, options.params),
  role: intent.roleHint ?? VERB_ROLE[intent.verb] ?? null,
  rowCue: substituteParams(intent.rowCue, options.params),
});

/** One pattern, first matcher that fires (v1's first-match-wins orchestrator). */
export const runPattern = (pattern: Pattern, ctx: MatchContext): PatternMatch | null => {
  if (!pattern.guard(ctx)) return null;
  for (let matcherIndex = 0; matcherIndex < pattern.matchers.length; matcherIndex += 1) {
    const result = pattern.matchers[matcherIndex]!(ctx);
    if (result !== null) return { ...result, patternId: pattern.id, matcherIndex };
  }
  return null;
};

/**
 * Every pattern's match for the intent, in registry order, de-duplicated by
 * ref (the first, most specific pattern to name a candidate keeps it).
 */
export const matchPatterns = (
  intent: StepIntent,
  candidates: readonly Candidate[],
  options: MatchOptions = {},
): readonly PatternMatch[] => {
  const ctx = matchContext(intent, candidates, options);
  const seen = new Set<string>();
  const out: PatternMatch[] = [];
  for (const pattern of PATTERNS) {
    const match = runPattern(pattern, ctx);
    if (match === null || seen.has(match.ref)) continue;
    seen.add(match.ref);
    out.push(match);
  }
  return out;
};
