/**
 * Target phrases: what a step's words say about the thing it acts on.
 *
 * A noun phrase like `the "Save & Close" button in the dialog` carries
 * four separate signals: a name ("Save & Close", quoted so meant
 * literally), a role ("button"), a landmark ("dialog"), and possibly a row
 * ("in the row for POL-001", "next to the todo"). This module cuts them
 * apart. It fixes the v1 classifier's capture bugs: quoted names, leading
 * prepositions ("Click on Save" captured "on"), names with symbols ("Save &
 * Close" captured "Save"), "header" read as navigation, and any occurrence
 * of "search" read as the search landmark.
 */
import type { LandmarkRole } from '../contract/schemas.js';
import {
  isPureFiller,
  maskQuotes,
  stripLeadingFiller,
  tidy,
  unmask,
  wholeQuote,
  type Masked,
} from './phrase.js';

/**
 * How the surrounding verb reads role words: "box" is a checkbox to
 * "check", a combobox to "select", a textbox otherwise; "list" names a
 * dropdown only when selecting from it.
 */
export type TargetMode = 'action' | 'fill' | 'select' | 'check' | 'navigate' | 'assert';

export interface TargetAnalysis {
  readonly phrase: string | null;
  readonly mention: string | null;
  readonly roleHint: string | null;
  readonly landmarkCue: LandmarkRole | null;
  readonly rowCue: string | null;
  /** The row cue is a description ("the todo"), to be resolved against values earlier steps used. */
  readonly rowCueGeneric: boolean;
  readonly exact: boolean;
  readonly notes: readonly string[];
}

// ─── Role words ────────────────────────────────────────────────────────────

interface RoleSuffix {
  readonly pattern: string;
  readonly role: (mode: TargetMode) => string | null;
}

const always = (role: string) => (): string => role;

const fieldRole = (mode: TargetMode): string => (mode === 'select' ? 'combobox' : mode === 'check' ? 'checkbox' : 'textbox');

/** Checked longest-first against the end of the phrase. */
const ROLE_SUFFIXES: readonly RoleSuffix[] = [
  { pattern: 'radio\\s+button|option\\s+button|radio', role: always('radio') },
  { pattern: 'check\\s*box(?:\\s+field)?|tick\\s*box', role: always('checkbox') },
  { pattern: 'toggle\\s+switch|toggle|switch', role: always('switch') },
  { pattern: 'menu\\s*item|menu\\s+option|menu\\s+entry|menu\\s+link', role: always('menuitem') },
  {
    pattern: 'drop[-\\s]?down(?:\\s+(?:list|menu|box|field))?|combo\\s*box|select\\s+(?:box|list|field)|selectbox|picker|list\\s*box',
    role: always('combobox'),
  },
  { pattern: 'search\\s+bar', role: always('textbox') },
  {
    pattern: 'text\\s*field|text\\s*box|text\\s*input|text\\s*area|textarea|input\\s+(?:field|box)|entry\\s+field|field|input|box',
    role: fieldRole,
  },
  { pattern: 'icon\\s+button|button|btn', role: always('button') },
  { pattern: 'hyper\\s*link|link', role: always('link') },
  { pattern: 'tab', role: always('tab') },
  { pattern: 'column\\s+header', role: always('columnheader') },
  { pattern: 'heading', role: always('heading') },
  { pattern: 'row', role: always('row') },
  { pattern: 'error\\s+message|error\\s+banner|validation\\s+message|warning\\s+message|error|alert|warning', role: always('alert') },
  {
    pattern: 'success\\s+message|confirmation\\s+message|status\\s+message|info\\s+message|notification|toast|message',
    role: always('status'),
  },
  { pattern: 'table', role: always('table') },
  { pattern: 'grid', role: always('grid') },
  { pattern: 'image|picture|logo|icon', role: always('img') },
  { pattern: 'option', role: (mode) => (mode === 'select' ? null : 'option') },
  { pattern: 'slider', role: always('slider') },
  { pattern: 'dialog(?:\\s+box)?|modal|pop[-\\s]?up', role: always('dialog') },
  { pattern: 'menu', role: (mode) => (mode === 'action' || mode === 'navigate' ? 'menuitem' : null) },
  { pattern: 'select|list', role: (mode) => (mode === 'select' ? 'combobox' : null) },
];

const SUFFIX_RES: readonly { readonly re: RegExp; readonly suffix: RoleSuffix }[] = ROLE_SUFFIXES.map((suffix) => ({
  re: new RegExp(`(?:^|\\s)(${suffix.pattern})$`, 'i'),
  suffix,
}));

/** Split a trailing role word off a phrase. The role word stays when it is the whole phrase's only word. */
export const splitRoleSuffix = (
  phrase: string,
  mode: TargetMode,
): { readonly rest: string; readonly role: string | null; readonly word: string | null } => {
  for (const { re, suffix } of SUFFIX_RES) {
    const match = re.exec(phrase);
    if (match === null) continue;
    const role = suffix.role(mode);
    if (role === null) continue;
    const word = match[1] ?? '';
    const rest = phrase.slice(0, phrase.length - word.length).trim();
    return { rest, role, word };
  }
  return { rest: phrase, role: null, word: null };
};

// ─── Landmark cues ─────────────────────────────────────────────────────────

/** Map a cue word to a landmark role. "header" is the banner (v1 said navigation); "top bar" is navigation. */
export const landmarkForCue = (cue: string): LandmarkRole | null => {
  const word = cue.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/^search\b/.test(word)) return 'search';
  if (/\bfooter$/.test(word)) return 'contentinfo';
  if (/\b(?:header|banner|masthead)$/.test(word)) return 'banner';
  if (/^(?:main\s+(?:content|area|section|region)|content\s+area)$/.test(word)) return 'main';
  if (/(?:modal|dialog(?:\s+box)?|pop[-\s]?up(?:\s+window)?|lightbox|overlay)$/.test(word)) return 'dialog';
  if (/(?:^|\s)form$/.test(word)) return 'form';
  if (/(?:nav(?:igation)?(?:\s+(?:bar|menu|pane|panel))?|menu(?:\s+bar)?|side\s*bar|side\s*nav(?:igation)?|top\s*bar|breadcrumbs?)$/.test(word)) {
    return 'navigation';
  }
  return null;
};

/**
 * The search landmark is cued only by a search *control or region*
 * ("search box", "search field", "search bar", "search panel", "search
 * area"), never by the word "search" alone: "Click Search button" and
 * "Navigate to Policy Search screen" name things, not the landmark.
 */
const SEARCH_CUE = /\bsearch\s+(?:box|field|bar|panel|area|input|section|form)\b/i;

const CUE_NOUNS =
  'header|footer|banner|masthead|nav(?:igation)?(?:\\s+(?:bar|menu|pane|panel))?|menu(?:\\s+bar)?|side\\s*bar|side\\s*nav(?:igation)?|top\\s*bar|breadcrumbs?|' +
  'main\\s+(?:content|area|section|region)|content\\s+area|search\\s+(?:box|field|bar|panel|area|section|form|input)|' +
  'modal|dialog(?:\\s+box)?|pop[-\\s]?up(?:\\s+window)?|lightbox|overlay|form';

/**
 * "in the header", "on the left navigation", "in the confirmation dialog",
 * "within the Edit Policy modal": a preposition, up to three qualifier
 * words, and a landmark noun.
 */
const LOCATION_RE = new RegExp(
  `\\s*(?:^|\\b)(?:in|on|at|within|inside|from|under|of|via)\\s+(?:the\\s+)?((?:[\\w&'-]+\\s+){0,3}?)(${CUE_NOUNS})\\b(?:\\s+(?:area|section|region|panel|pane|window))?(?=$|[\\s,;])`,
  'i',
);

/** "on the Policy Search screen": where the step happens, not what it targets. */
const SCREEN_LOCATION_RE = /\s*\b(?:on|in|from|within)\s+(?:the\s+)?((?:[\w&'-]+\s+){0,4}?)(?:screen|page|view|window)\b/i;

/** A landmark noun used as an adjective at the front of a phrase: "footer Active" → contentinfo, "Active". */
const LEADING_CUE_RE = /^(header|footer|nav(?:igation)?|menu|side\s*bar|side\s*nav|top\s*bar|modal|dialog|pop[-\s]?up)\s+(.+)$/i;

// ─── Row cues ──────────────────────────────────────────────────────────────

const ROW_CUES: readonly RegExp[] = [
  /\s*(?:^|\b)(?:(?:in|on|from|within|inside|of|for)\s+)?(?:the\s+)?(?:table\s+|grid\s+|results?\s+)?row\s+(?:for|containing|with|of|labell?ed|named|where|that\s+(?:contains|has|shows|says)|showing|matching)\s+(.+)$/i,
  /\s*\b(?:in|on|from|within|inside)\s+the\s+(.+?)\s+row\b/i,
  /\s*\b(?:next\s+to|beside|alongside|adjacent\s+to)\s+(.+)$/i,
];

/** "Click View for @policyNumber", "Edit for POL-001": a row named by a value with digits, a parameter, or a quote. */
const FOR_VALUE_RE = /\s+for\s+(?:the\s+)?(?:[a-z]+\s+)?(@[A-Za-z_]\w*|\{[A-Za-z_]\w*\}|\uE000\d+\uE001|[A-Za-z]*\d[\w-]*)$/;

const ORDINAL = /^(?:first|second|third|fourth|fifth|last|top|bottom|next|previous|\d+(?:st|nd|rd|th))$/i;

const GENERIC_ROW = /^(?:the|this|that|its|their|it|them|each|every)\b/i;

// ─── Purpose clauses ───────────────────────────────────────────────────────

const PURPOSE_VERBS =
  'submit|save|cancel|confirm|add|open|close|continue|proceed|search|apply|complete|start|begin|see|view|display|show|reveal|expand|collapse|' +
  'navigate|return|select|filter|sort|clear|reset|create|delete|remove|update|edit|log|sign|load|refresh|trigger|run|execute|finish|accept|' +
  'dismiss|go|get|move|mark|toggle|check|uncheck|enter|type|choose|pick|access|initiate|perform|launch|activate|be|make|ensure|verify|' +
  'trigger|send|post|print|download|upload|export|import|find|look|retrieve|fetch|display|focus|leave|exit|switch|change|set|choose';

/**
 * Case-sensitive on purpose: a purpose clause is lower case ("to search
 * the list"), while "Return to Search" is a control's name.
 */
const PURPOSE_RE = new RegExp(`\\s+(?:(?:in\\s+order\\s+to|so\\s+that|so\\s+as\\s+to)\\s+.*|to\\s+(?:${PURPOSE_VERBS})\\b.*)$`);

/** Strip a trailing "to submit the form" / "so that …" clause. */
export const stripPurpose = (text: string): string => text.replace(PURPOSE_RE, '').trim();

// ─── Navigation targets ────────────────────────────────────────────────────

const PAGE_SUFFIX = /\s+(?:screen|page|view|window|application|app|site|website|portal|module)$/i;
const WITH_CLAUSE = /\s+(?:with|having|where|containing|that\s+has|which\s+has)\s+.*$/i;

// ─── Analysis ──────────────────────────────────────────────────────────────

interface Working {
  readonly text: string;
  readonly landmarkCue: LandmarkRole | null;
  readonly rowCue: string | null;
  readonly rowCueGeneric: boolean;
  /** The phrase was nothing but "the row for X": the row itself is the target. */
  readonly rowIsTarget: boolean;
  readonly notes: readonly string[];
}

const extractRowCue = (w: Working, masked: Masked): Working => {
  for (const re of ROW_CUES) {
    const match = re.exec(w.text);
    if (match === null) continue;
    const raw = (match[1] ?? '').trim();
    const cueText = tidy(unmask(raw, masked.quotes));
    const remaining = w.text.slice(0, match.index).trim();
    if (cueText === null) continue;
    if (ORDINAL.test(stripLeadingFiller(cueText))) {
      return { ...w, text: remaining, notes: [...w.notes, `the row is named by position ("${cueText}"): prefer a row value from the test data`] };
    }
    const quoted = wholeQuote(raw, masked.quotes);
    const generic = quoted === null && (GENERIC_ROW.test(cueText) || isPureFiller(cueText));
    const rowIsTarget = re === ROW_CUES[0] && stripLeadingFiller(remaining).length === 0;
    // A generic cue keeps its article ("the todo") so it can still be read as a reference to an earlier value.
    return { ...w, text: remaining, rowCue: quoted ?? cueText, rowCueGeneric: generic, rowIsTarget };
  }
  const forValue = FOR_VALUE_RE.exec(w.text);
  if (forValue !== null) {
    const cue = tidy(unmask(forValue[1] ?? '', masked.quotes));
    if (cue !== null) return { ...w, text: w.text.slice(0, forValue.index).trim(), rowCue: cue, rowCueGeneric: false };
  }
  return w;
};

const extractLocation = (w: Working): Working => {
  const match = LOCATION_RE.exec(w.text);
  if (match !== null) {
    const cue = landmarkForCue(match[2] ?? '');
    const remaining = `${w.text.slice(0, match.index)} ${w.text.slice(match.index + match[0].length)}`.trim();
    if (cue !== null && remaining.length > 0) {
      return { ...w, text: remaining, landmarkCue: w.landmarkCue ?? cue };
    }
  }
  return w;
};

const extractScreenLocation = (w: Working, mode: TargetMode): Working => {
  if (mode === 'navigate') return w;
  const match = SCREEN_LOCATION_RE.exec(w.text);
  if (match === null) return w;
  const remaining = `${w.text.slice(0, match.index)} ${w.text.slice(match.index + match[0].length)}`.trim();
  if (remaining.length === 0) return w;
  const screen = tidy(stripLeadingFiller(match[1] ?? ''));
  return { ...w, text: remaining, notes: screen === null ? w.notes : [...w.notes, `on screen "${screen}"`] };
};

/**
 * Read a target noun phrase. `raw` is the part of the step after the verb
 * (and after the value, for fill and select).
 */
export const analyzeTarget = (raw: string, mode: TargetMode): TargetAnalysis => {
  const masked = maskQuotes(raw.trim());
  let w: Working = { text: masked.text, landmarkCue: null, rowCue: null, rowCueGeneric: false, rowIsTarget: false, notes: [] };

  if (mode === 'navigate') {
    const withClause = WITH_CLAUSE.exec(w.text);
    if (withClause !== null && withClause.index > 0) {
      const condition = tidy(unmask(withClause[0], masked.quotes));
      w = { ...w, text: w.text.slice(0, withClause.index), notes: condition === null ? w.notes : [...w.notes, `precondition: ${condition}`] };
    }
  }

  w = { ...w, text: stripPurpose(w.text) };
  w = extractRowCue(w, masked);
  w = extractLocation(w);
  w = extractScreenLocation(w, mode);
  // A search control named inside the phrase ("search field") cues the landmark but keeps its words.
  if (w.landmarkCue === null && SEARCH_CUE.test(w.text)) w = { ...w, landmarkCue: 'search' };

  let text = stripLeadingFiller(w.text.replace(/[,;]+$/, '').trim());
  // Trailing "on the page" / "in the list": a container, not part of the name.
  text = text.replace(/\s+(?:on|in|from|within)\s+(?:the\s+)?(?:[\w-]+\s+){0,2}?(?:page|screen|form|list|grid|table)$/i, '').trim();

  const mention = tidy(unmask(text, masked.quotes));

  // The name: a quoted segment wins outright; the role word is read from what follows it.
  const quoteMatch = /\uE000(\d+)\uE001/.exec(text);
  let exact = false;
  let roleHint: string | null = null;
  let phrase: string | null;
  if (quoteMatch !== null) {
    exact = true;
    phrase = tidy(masked.quotes[Number(quoteMatch[1])] ?? '');
    const after = text.slice(quoteMatch.index + quoteMatch[0].length).trim();
    const before = text.slice(0, quoteMatch.index).trim();
    roleHint = splitRoleSuffix(after.length > 0 ? after : before, mode).role;
  } else {
    const split = splitRoleSuffix(text, mode);
    roleHint = split.role;
    let rest = stripLeadingFiller(split.rest);
    if (split.role !== null && rest.length === 0) {
      phrase = null;
    } else {
      const leading = LEADING_CUE_RE.exec(rest);
      if (leading !== null && split.role !== null) {
        const cue = landmarkForCue(leading[1] ?? '');
        if (cue !== null) {
          w = { ...w, landmarkCue: w.landmarkCue ?? cue };
          rest = leading[2] ?? rest;
        }
      }
      if (mode === 'navigate') rest = rest.replace(PAGE_SUFFIX, '').trim();
      phrase = tidy(unmask(rest, masked.quotes));
    }
  }
  if (phrase !== null && isPureFiller(phrase)) phrase = null;
  if (roleHint === null && phrase === null && w.rowIsTarget) roleHint = 'row';

  return {
    phrase,
    mention: mention !== null && isPureFiller(mention) ? null : mention,
    roleHint,
    landmarkCue: w.landmarkCue,
    rowCue: w.rowCue,
    rowCueGeneric: w.rowCueGeneric,
    exact,
    notes: w.notes,
  };
};

/** True when a phrase ends with a word that names a page-like destination rather than a control. */
export const isWidgetPhrase = (raw: string): boolean =>
  /\b(?:menu|drop[-\s]?down|list|accordion|panel|section|details|tab|link|button|btn|modal|dialog|pop[-\s]?up|combo\s*box|picker|calendar|side\s*bar|toggle|checkbox|expander)$/i.test(
    raw.trim().replace(/[.,;:!?]+$/, ''),
  );
