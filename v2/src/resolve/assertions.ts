/**
 * Expected results → proposed assertions.
 *
 * ADO's expected text is a sentence a person wrote, often a paraphrase of
 * what the page shows ("the count decreases by one" against "0 items
 * left"). Each clause is matched against a small set of shapes, most
 * specific first; a clause that fits none proposes nothing, because a
 * wrong proposal becomes a false text-mismatch handoff downstream. A
 * paraphrase is proposed with low confidence and a note saying so.
 */
import { escapeRegExp } from '../core/text.js';
import type { AssertionKind } from '../contract/schemas.js';
import { firstQuote, isPureFiller, maskQuotes, requote, stripLeadingFiller, tidy, unmask, wholeQuote } from './phrase.js';
import { analyzeTarget, landmarkForCue, type TargetAnalysis } from './target.js';
import type { ProposedAssertion } from './types.js';
import { COUNT_WORD, countOf, referent, type RefContext } from './values.js';

export interface StatementContext extends RefContext {
  /** The step's own target, for clauses whose subject is "it" or "the field". */
  readonly stepTarget: TargetAnalysis | null;
}

type Fields = Partial<Omit<ProposedAssertion, 'kind' | 'source'>>;

const make = (kind: AssertionKind, source: string, fields: Fields): ProposedAssertion => ({
  kind,
  expected: null,
  targetPhrase: null,
  roleHint: null,
  landmarkCue: null,
  rowCue: null,
  confidence: 0.5,
  note: null,
  source,
  ...fields,
});

const PRONOUN = /^(?:it|they|them|this|that|these|those|the\s+same)$/i;

/** A clause's subject as a target; a pronoun subject means the step's own target. */
const subjectTarget = (raw: string, ctx: StatementContext): TargetAnalysis => {
  const trimmed = stripLeadingFiller(raw.trim().replace(/^(?:only|all|each|every|both)\s+/i, ''));
  if ((PRONOUN.test(trimmed) || trimmed.length === 0) && ctx.stepTarget !== null) return ctx.stepTarget;
  return analyzeTarget(trimmed, 'assert');
};

const fromTarget = (target: TargetAnalysis, ctx: StatementContext): Fields => {
  const rowCue =
    target.rowCue !== null && target.rowCueGeneric
      ? referent(target.rowCue, ctx, true) ?? tidy(stripLeadingFiller(target.rowCue)) ?? target.rowCue
      : target.rowCue;
  // A subject that is itself a landmark noun ("The footer shows …") scopes rather than names.
  const landmark = target.phrase !== null && target.roleHint === null ? landmarkForCue(target.phrase) : null;
  return {
    targetPhrase: landmark !== null ? null : target.phrase,
    roleHint: target.roleHint,
    landmarkCue: target.landmarkCue ?? landmark,
    rowCue,
  };
};

const TEXT_ENTRY = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);

const isFieldTarget = (target: TargetAnalysis): boolean => target.roleHint !== null && TEXT_ENTRY.has(target.roleHint);

// ─── Vocabulary ────────────────────────────────────────────────────────────

const PRESENT =
  '(?:appears?|appeared|is\\s+(?:now\\s+)?(?:displayed|shown|visible|present|available|rendered|listed|returned|seen)|' +
  'are\\s+(?:now\\s+)?(?:displayed|shown|visible|present|available|rendered|listed|returned|seen)|' +
  '(?:should|must|will)\\s+(?:be\\s+)?(?:appear|displayed|shown|visible|present|listed)|displays?(?=\\s*$|\\s+(?:with|in|on|at|under|below|above)\\b)|' +
  'exists?|shows?\\s+up|pops?\\s+up|' +
  'comes?\\s+up|becomes?\\s+visible|can\\s+be\\s+seen|is\\s+there|are\\s+there)';

const ABSENT =
  '(?:disappears?|vanish(?:es)?|goes\\s+away|closes|is\\s+closed|is\\s+dismissed|' +
  '(?:is|are)\\s+(?:no\\s+longer\\s+(?:displayed|shown|visible|present|listed)|removed|gone|hidden|not\\s+(?:displayed|shown|visible|present|listed))|' +
  '(?:should|must|will)\\s+not\\s+(?:be\\s+)?(?:appear|displayed|shown|visible|present|listed)|(?:does|do)\\s+not\\s+(?:appear|show|exist))';

const PRESENT_RE = new RegExp(`^(.+?)\\s+${PRESENT}\\b(.*)$`, 'i');
const ABSENT_RE = new RegExp(`^(.+?)\\s+${ABSENT}\\b(.*)$`, 'i');
const ROW_PRESENT_RE = new RegExp(
  `^(.+?)\\s+${PRESENT}\\s+(?:as\\s+(?:an?\\s+)?[\\w-]+\\s+)?(?:in|on|within|under|among|inside)\\s+(?:the\\s+)?(.+)$`,
  'i',
);

const RESULTS_CONTAINER = /\b(?:results?|list|table|grid|rows?|records?|items|entries|listing|inbox|queue|history)$/i;

const PAGE_SUBJECT = /^(?:the\s+)?(?:page|screen|application|app|system|site|website|form|ui|it|browser)$/i;

const GENERIC_SCREEN =
  /^(?:home|homepage|home\s+page|landing|main|new|next|previous|same|current|whole|entire|this|that|start|default|first|web|target|application|app|page|screen|site|website|it)$/i;

const urlPattern = (name: string): string | null => {
  const tokens = name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  return `/${tokens.map((t) => escapeRegExp(t)).join('(?:[-_ ]|%20)?')}/i`;
};

const SCREEN_NOTE = 'a screen load shows as its heading or its URL; keep whichever the page has';

const screenAssertions = (rawName: string, noun: string, source: string): ProposedAssertion[] => {
  const stripped = tidy(stripLeadingFiller(rawName));
  const name = stripped === null || isPureFiller(stripped) ? null : stripped;
  const kindOfNoun = noun.toLowerCase();
  const specific = name !== null && !GENERIC_SCREEN.test(name) ? name : null;
  if (/^(?:dialog|modal|pop-?up)$/.test(kindOfNoun)) {
    return [make('visible', source, { roleHint: 'dialog', targetPhrase: specific, confidence: 0.6 })];
  }
  if (kindOfNoun === 'form') {
    return [make('visible', source, {
      roleHint: 'form',
      targetPhrase: specific,
      confidence: 0.4,
      note: 'an unnamed form is not exposed as a landmark; asserting one of its fields is more robust',
    })];
  }
  if (/^(?:tab|panel|section)$/.test(kindOfNoun)) {
    return specific === null ? [] : [make('visible', source, { roleHint: kindOfNoun === 'tab' ? 'tab' : null, targetPhrase: specific, confidence: 0.45 })];
  }
  if (specific === null) return [];
  const url = urlPattern(specific);
  return [
    make('visible', source, { roleHint: 'heading', targetPhrase: specific, confidence: 0.55, note: SCREEN_NOTE }),
    ...(url === null ? [] : [make('url', source, { expected: url, confidence: 0.5, note: SCREEN_NOTE })]),
  ];
};

// ─── Shapes ────────────────────────────────────────────────────────────────

/** A clause, quotes masked, plus what it needs to resolve quotes and references. */
interface Clause {
  readonly text: string;
  readonly quotes: readonly string[];
  readonly source: string;
  readonly ctx: StatementContext;
}

type Shape = (clause: Clause) => ProposedAssertion[] | null;

const plain = (clause: Clause, text: string): string => unmask(text, clause.quotes);

const urlShape: Shape = ({ text, quotes, source }) => {
  const match = /\b(?:url|address|location)\b.*?\b(?:contains|includes|is|ends\s+with|equals|matches|becomes|changes\s+to|shows|has)\s+(.+)$/i.exec(text);
  if (match === null) return null;
  const expected = tidy(unmask(stripLeadingFiller(match[1] ?? ''), quotes));
  return expected === null ? null : [make('url', source, { expected, confidence: 0.75 })];
};

const titleShape: Shape = ({ text, quotes, source }) => {
  const match = /\b(?:page\s+|window\s+|browser\s+|tab\s+)?title\s+(is|reads|shows|equals|becomes|says|should\s+be|contains)\s+(.+)$/i.exec(text);
  if (match === null) return null;
  const expected = tidy(unmask(match[2] ?? '', quotes));
  if (expected === null || /^(?:shown|displayed|visible|present|correct|updated|empty|hidden|changed)$/i.test(expected)) return null;
  const contains = /^contains$/i.test(match[1] ?? '');
  return [make('title', source, { expected: contains ? `/${escapeRegExp(expected)}/` : expected, confidence: 0.7 })];
};

/** "X screen loads", "The X page is displayed (with …)"; "The X page shows Y" has an object and is not a load. */
const SCREEN_RE =
  /^(?:the\s+)?(.+?)\s+(screen|page|view|window|form|dialog|modal|pop-?up|tab|panel|section)\s+(?:is\s+|gets\s+|should\s+(?:be\s+)?)?(?:successfully\s+|now\s+)?(?:loads?|loaded|opens?|opened|displays?|displayed|appears?|shown|visible|presented|rendered|renders|launche[sd]|comes\s+up|is\s+up|shows?)(?=\s*$|\s+(?:with|and|in|on|successfully|correctly|properly|as|without|for)\b)/i;

const screenShape: Shape = (clause) => {
  const match = SCREEN_RE.exec(clause.text);
  if (match === null) return null;
  return screenAssertions(plain(clause, match[1] ?? ''), match[2] ?? 'page', clause.source);
};

const REDIRECT_RES: readonly RegExp[] = [
  /\b(?:is|are|gets?|be)\s+(?:redirected|navigated|taken|returned|brought|sent)\s+(?:back\s+)?to\s+(?:the\s+)?(.+?)(?:\s+(?:screen|page|view))?$/i,
  /\b(?:is|are|remains?|stays?|lands?|be)\s+(?:on|at)\s+(?:the\s+)?(.+?)\s+(?:screen|page|view)\b/i,
  /\bnavigates?\s+to\s+(?:the\s+)?(.+?)(?:\s+(?:screen|page|view))?$/i,
];

const redirectShape: Shape = (clause) => {
  for (const re of REDIRECT_RES) {
    const match = re.exec(clause.text);
    if (match === null) continue;
    const name = plain(clause, match[1] ?? '');
    // Long destinations ("the German-language version of the homepage") are descriptions, not names.
    if (name.split(/\s+/).length > 4) return [];
    return screenAssertions(name, 'page', clause.source);
  }
  return null;
};

const ERROR_CUE = /\b(?:error|warning|validation|failure|failed|invalid)\b/i;
const SUCCESS_CUE = /\b(?:success|successful|successfully|confirmation|info|information|notification|toast|feedback)\b/i;
const MESSAGE_NOUN = /\b(?:message|banner|notification|toast|alert|pop-?up|notice)\b/i;

const messageShape: Shape = (clause) => {
  const { text, quotes, source } = clause;
  const isError = ERROR_CUE.test(text) || /\balert\b/i.test(text);
  const isSuccess = SUCCESS_CUE.test(text);
  if (!isError && !isSuccess) return null;
  const quoted = firstQuote(text, quotes);
  if (!MESSAGE_NOUN.test(text) && quoted === null) return null;
  const said = /\b(?:saying|reading|stating|that\s+(?:says|reads|states)|with\s+(?:the\s+)?(?:text|message|content)|:)\s+(.+?)(?:\s+(?:is|are)\s+(?:shown|displayed|visible|present)|\s+(?:appears|pops\s+up|shows\s+up|is\s+raised))?$/i.exec(text);
  const inline = /\b(?:message|banner|notification|alert)\s+(.+?)\s+(?:is|are)\s+(?:shown|displayed|visible|present)\b/i.exec(text);
  const inlineText = inline === null ? null : tidy(unmask(inline[1] ?? '', quotes));
  const expected =
    quoted ??
    (said === null ? null : tidy(unmask(said[1] ?? '', quotes))) ??
    (inlineText !== null && !/^(?:is|are|was|the|a|an)\b/i.test(inlineText) ? inlineText : null);
  if (expected === null && !new RegExp(PRESENT, 'i').test(text)) return null;
  const roleHint = isError ? 'alert' : 'status';
  return [make(expected === null ? 'visible' : 'contains-text', source, {
    roleHint,
    expected,
    targetPhrase: expected,
    confidence: expected === null ? 0.6 : 0.7,
    note: 'OutSystems shows feedback messages as role alert/status or a .feedback-message element',
  })];
};

const COUNT_NOUNS = /\b(?:count|number|total|counter|amount|tally)\b(?:\s+of)?/gi;

const relativeCountShape: Shape = (clause) => {
  const { text, source, ctx } = clause;
  const verbForm = /^(.*?)\s*\b(increases?|increased|decreases?|decreased|goes\s+(?:up|down)|go\s+(?:up|down)|drops?|dropped|reduces?|reduced|grows?|grew|is\s+incremented|is\s+decremented)\b(?:\s+by\s+(\w+))?/i.exec(text);
  const fewerForm = /^(.*?)\s*\b(?:shows?|displays?|has|lists?|reads|is|are)?\s*\b(one|\d+|two|three|a\s+few)\s+(fewer|less|more)\s+(.+)$/i.exec(text);
  if (verbForm === null && fewerForm === null) return null;
  const down = verbForm !== null ? /decrease|down|drop|reduce|decrement/i.test(verbForm[2] ?? '') : /fewer|less/i.test(fewerForm?.[3] ?? '');
  const amountWord = verbForm !== null ? verbForm[3] : fewerForm?.[2];
  const amount = amountWord === undefined ? null : countOf(amountWord);
  const subjectRaw = verbForm !== null ? verbForm[1] ?? '' : fewerForm?.[1] ?? '';
  const subject = subjectTarget(plain(clause, subjectRaw).replace(COUNT_NOUNS, ' ').replace(/\s+/g, ' '), ctx);
  const fields = fromTarget(subject, ctx);
  const noun = fewerForm !== null ? tidy(plain(clause, fewerForm[4] ?? '')) : null;
  const delta = amount === null ? (down ? 'down' : 'up') : `${down ? '-' : '+'}${amount}`;
  return [make('count', source, {
    ...fields,
    targetPhrase: noun ?? fields.targetPhrase ?? null,
    confidence: 0.3,
    note: `relative change (${delta}): the ADO text is a paraphrase; read the value before the action and assert the new count or text`,
  })];
};

const ROW_NOUNS = /^(?:results?|rows?|items?|records?|entries|entry|matches|lines?|hits?)$/i;

const absoluteCountShape: Shape = (clause) => {
  const { text, source, ctx } = clause;
  const leading = new RegExp(
    `^(?:exactly\\s+|only\\s+)?(${COUNT_WORD})\\s+(.+?)\\s+(?:(?:is|are|were|was|should\\s+be)\\s+)?(?:shown|displayed|listed|returned|found|visible|present|appears?|remains?|exists?|left|available)\\b(.*)$`,
    'i',
  ).exec(text);
  const trailing = new RegExp(
    `^(.+?)\\s+(?:shows?|displays?|lists|returns|contains?|has|have|includes?)\\s+(?:exactly\\s+|only\\s+)?(${COUNT_WORD})\\s+(.+)$`,
    'i',
  ).exec(text);
  const n = leading !== null ? countOf(leading[1] ?? '') : trailing !== null ? countOf(trailing[2] ?? '') : null;
  if (n === null) return null;
  const nounRaw = leading !== null ? `${leading[2] ?? ''} ${leading[3] ?? ''}` : trailing?.[3] ?? '';
  const noun = tidy(plain(clause, nounRaw));
  if (noun === null) return null;
  const nounWord = noun.split(/\s+/)[0] ?? '';
  if (ROW_NOUNS.test(noun) || (ROW_NOUNS.test(nounWord) && noun.split(/\s+/).length === 1)) {
    const container = trailing !== null ? tidy(plain(clause, trailing[1] ?? '')) : null;
    return [make('count', source, {
      expected: n,
      roleHint: 'row',
      confidence: 0.55,
      note: `count the rows${container === null ? '' : ` of ${stripLeadingFiller(container)}`}`,
    })];
  }
  const target = subjectTarget(noun, ctx);
  return [make('count', source, { ...fromTarget(target, ctx), expected: n, confidence: n === 0 ? 0.5 : 0.55 })];
};

const acceptsShape: Shape = (clause) => {
  const { text, source, ctx } = clause;
  const match = /^(.+?)\s+(?:accepts?|takes|receives|keeps|retains|holds)\s+(?:the\s+)?(.+)$/i.exec(text);
  if (match === null) return null;
  const target = subjectTarget(plain(clause, match[1] ?? ''), ctx);
  const expected = ctx.stepValue ?? referent(plain(clause, match[2] ?? ''), ctx, true);
  const fields = fromTarget(target, ctx);
  if (expected === null) {
    return [make('visible', source, { ...fields, confidence: 0.35, note: 'the field is described as accepting a value the step does not give' })];
  }
  return [make('value', source, { ...fields, roleHint: fields.roleHint ?? 'textbox', expected, confidence: 0.65 })];
};

const visibleInFieldShape: Shape = (clause) => {
  const { text, source, ctx } = clause;
  const match = /^(.+?)\s+(?:is|are)\s+(?:visible|displayed|shown|present)\s+in\s+(?:the\s+)?(.+?\b(?:field|box|input|textbox))$/i.exec(text);
  if (match === null) return null;
  const field = subjectTarget(plain(clause, match[2] ?? ''), ctx);
  const expected = referent(plain(clause, match[1] ?? ''), ctx, true) ?? ctx.stepValue;
  if (expected === null) return null;
  return [make('value', source, { ...fromTarget(field, ctx), roleHint: field.roleHint ?? 'textbox', expected, confidence: 0.6 })];
};

const fieldShowsShape: Shape = (clause) => {
  const { text, source, ctx } = clause;
  const match = /^(.+?)\s+(?:shows?|displays?|contains?|has|holds|is\s+(?:populated|filled|pre-?filled|set)\s+(?:with|to)|equals|reads)\s+(?:the\s+)?(.+)$/i.exec(text);
  if (match === null) return null;
  const target = subjectTarget(plain(clause, match[1] ?? ''), ctx);
  if (!isFieldTarget(target)) return null;
  const objectText = plain(clause, match[2] ?? '');
  const expected = referent(objectText, ctx, true) ?? ctx.stepValue;
  if (expected === null) return null;
  return [make('value', source, { ...fromTarget(target, ctx), expected, confidence: 0.6 })];
};

const LITERAL_OBJECT = '(\\uE000\\d+\\uE001|@[A-Za-z_]\\w*|\\{[A-Za-z_]\\w*\\}|[-+$€£]?\\d[\\d.,:/]*%?)';

const textShape: Shape = (clause) => {
  const { text, quotes, source, ctx } = clause;
  const match = new RegExp(
    `^(.+?)\\s+(reads|says|shows|displays|contains|includes|has\\s+(?:the\\s+)?text|is\\s+labell?ed|equals|is|=|should\\s+(?:read|say|show|display|contain|be))\\s+(exactly\\s+)?${LITERAL_OBJECT}\\s*(.*)$`,
    'i',
  ).exec(text);
  if (match === null) return null;
  const literalRaw = match[4] ?? '';
  const literal = wholeQuote(literalRaw, quotes) ?? literalRaw.replace(/^\{(\w+)\}$/, '@$1');
  // "equals" and "exactly" mean the whole text; anything else is a containment check (labels carry extra words).
  const exact = match[3] !== undefined || /^(?:equals|=)$/i.test(match[2] ?? '');
  const subjectRaw = plain(clause, match[1] ?? '');
  if (PAGE_SUBJECT.test(subjectRaw.trim())) {
    return [make('visible', source, { targetPhrase: literal, confidence: 0.5, note: 'text on the page; scope it to the region that shows it when there is one' })];
  }
  const target = subjectTarget(`${subjectRaw} ${plain(clause, match[5] ?? '')}`, ctx);
  return [make(exact ? 'text' : 'contains-text', source, { ...fromTarget(target, ctx), expected: literal, confidence: 0.65 })];
};

const rowAssertions = (value: string, container: string | null, source: string): ProposedAssertion[] => [
  make('visible', source, {
    roleHint: 'row',
    rowCue: value,
    confidence: 0.7,
    note: `the row holding ${value}${container === null ? '' : ` in ${container}`}`,
  }),
  ...(container === null
    ? []
    : [make('contains-text', source, { targetPhrase: container, expected: value, confidence: 0.45 })]),
];

const rowPresenceShape: Shape = (clause) => {
  const { text, source, ctx } = clause;
  const match = ROW_PRESENT_RE.exec(text);
  if (match === null) return null;
  const container = tidy(stripLeadingFiller(plain(clause, (match[2] ?? '').split(/,/)[0] ?? '')));
  if (container === null || !RESULTS_CONTAINER.test(container)) return null;
  const subjectText = plain(clause, match[1] ?? '');
  const value = referent(subjectText, ctx, true);
  if (value !== null) return rowAssertions(value, container, source);
  const subject = subjectTarget(subjectText, ctx);
  return [make('visible', source, { ...fromTarget(subject, ctx), confidence: 0.4, note: `in ${container}` })];
};

const displaysObjectShape: Shape = (clause) => {
  const { text, source, ctx } = clause;
  const match = /^(.+?)\s+(?:displays?|shows?|presents?|renders?)\s+(.+)$/i.exec(text);
  if (match === null || !PAGE_SUBJECT.test((match[1] ?? '').trim())) return null;
  const object = subjectTarget(plain(clause, match[2] ?? ''), ctx);
  if (object.phrase === null && object.roleHint === null) return null;
  return [make('visible', source, { ...fromTarget(object, ctx), confidence: 0.45 })];
};

const resultsShowShape: Shape = (clause) => {
  const { text, source, ctx } = clause;
  // "lists", not "list": "The todo list displays …" must not read "list" as the verb.
  const match = /^(.+?)\s+(?:shows?|displays?|lists|contains?|includes?|returns|has|have)\s+(?:the\s+)?(.+)$/i.exec(text);
  if (match === null) return null;
  const subjectText = tidy(stripLeadingFiller(plain(clause, match[1] ?? '')));
  if (subjectText === null || !RESULTS_CONTAINER.test(subjectText)) return null;
  const value = referent(plain(clause, match[2] ?? ''), ctx, true);
  if (value !== null) return rowAssertions(value, subjectText, source);
  const subject = subjectTarget(subjectText, ctx);
  return [make('visible', source, { ...fromTarget(subject, ctx), confidence: 0.4 })];
};

const STATE_RE =
  /^(.+?)\s+(?:is|are|should\s+be|must\s+be|will\s+be|becomes?|remains?|stays?|gets?|appears?(?:\s+to\s+be)?|looks?)\s+(?:now\s+|still\s+|also\s+|then\s+)?(not\s+)?(visible|displayed|shown|present|hidden|invisible|enabled|disabled|greyed\s+out|grayed\s+out|clickable|checked|unchecked|ticked|unticked|selected|deselected|unselected|marked\s+(?:as\s+)?(?:complete|completed|done|checked)|completed?|done|empty|cleared|blank)\b(.*)$/i;

const CHECKABLE = new Set(['checkbox', 'radio', 'switch', 'option', 'menuitemcheckbox', 'menuitemradio']);

const stateKind = (word: string, negated: boolean): AssertionKind | 'value-empty' | null => {
  const w = word.toLowerCase().replace(/\s+/g, ' ');
  const flip = (kind: AssertionKind, opposite: AssertionKind): AssertionKind => (negated ? opposite : kind);
  if (/^(?:visible|displayed|shown|present)$/.test(w)) return flip('visible', 'hidden');
  if (/^(?:hidden|invisible)$/.test(w)) return flip('hidden', 'visible');
  if (/^(?:enabled|clickable)$/.test(w)) return flip('enabled', 'disabled');
  if (/^(?:disabled|greyed out|grayed out)$/.test(w)) return flip('disabled', 'enabled');
  if (/^(?:checked|ticked|selected|completed?|done)$/.test(w) || w.startsWith('marked')) return flip('checked', 'unchecked');
  if (/^(?:unchecked|unticked|deselected|unselected)$/.test(w)) return flip('unchecked', 'checked');
  if (/^(?:empty|cleared|blank)$/.test(w)) return negated ? null : 'value-empty';
  return null;
};

const stateShape: Shape = (clause) => {
  const { text, source, ctx } = clause;
  const match = STATE_RE.exec(text);
  if (match === null) return null;
  const word = match[3] ?? '';
  const kind = stateKind(word, match[2] !== undefined);
  if (kind === null) return [];
  const target = subjectTarget(`${plain(clause, match[1] ?? '')} ${plain(clause, match[4] ?? '')}`, ctx);
  const fields = fromTarget(target, ctx);
  if (kind === 'value-empty') {
    return [make('value', source, { ...fields, roleHint: fields.roleHint ?? 'textbox', expected: '', confidence: 0.6 })];
  }
  if (kind === 'checked' || kind === 'unchecked') {
    // "selected" is aria-selected on tabs and links, not a checked state; only checkable controls qualify.
    if (/selected/i.test(word) && (fields.roleHint === null || fields.roleHint === undefined || !CHECKABLE.has(fields.roleHint))) return [];
    const role = fields.roleHint ?? 'checkbox';
    // "The todo is marked as complete": the checkbox in the row of the value earlier steps used.
    const subjectText = plain(clause, match[1] ?? '');
    const rowValue = fields.rowCue ?? (fields.roleHint === null || fields.roleHint === undefined ? referent(subjectText, ctx, true) : null);
    if (rowValue !== null && rowValue !== undefined && fields.rowCue === null) {
      return [make(kind, source, { ...fields, roleHint: role, targetPhrase: null, rowCue: rowValue, confidence: 0.45, note: `the ${role} in the row holding ${rowValue}` })];
    }
    return [make(kind, source, { ...fields, roleHint: role, confidence: 0.55 })];
  }
  return [make(kind, source, { ...fields, confidence: fields.targetPhrase === null && fields.roleHint === null ? 0.35 : 0.6 })];
};

const presenceShape: Shape = (clause) => {
  const { text, source, ctx } = clause;
  const absent = ABSENT_RE.exec(text);
  const present = absent === null ? PRESENT_RE.exec(text) : null;
  const match = absent ?? present;
  if (match === null) return null;
  const subjectText = plain(clause, match[1] ?? '');
  if (PAGE_SUBJECT.test(subjectText.trim())) return null;
  const target = subjectTarget(`${subjectText} ${plain(clause, match[2] ?? '')}`, ctx);
  const fields = fromTarget(target, ctx);
  if (fields.targetPhrase === null && fields.roleHint === null && fields.rowCue === null) return [];
  return [make(absent !== null ? 'hidden' : 'visible', source, { ...fields, confidence: 0.55 })];
};

/** "X loads" with no page noun: X may be a screen or a region ("the results"), so only its visibility is proposed. */
const loadsShape: Shape = (clause) => {
  const match = /^(?:the\s+)?(.+?)\s+(?:loads?|is\s+loaded|opens|is\s+opened|is\s+launched|launches|starts|is\s+displayed)\b/i.exec(clause.text);
  if (match === null) return null;
  const name = tidy(stripLeadingFiller(plain(clause, match[1] ?? '')));
  if (name === null || GENERIC_SCREEN.test(name)) return [];
  const target = subjectTarget(name, clause.ctx);
  return [make('visible', clause.source, { ...fromTarget(target, clause.ctx), confidence: 0.45 })];
};

const quotedShape: Shape = (clause) => {
  const quoted = firstQuote(clause.text, clause.quotes);
  if (quoted === null || quoted.length === 0) return null;
  if (!/\b(?:shown|displayed|visible|appears?|present|see|seen|reads?|says?)\b/i.test(clause.text)) return null;
  return [make('visible', clause.source, { targetPhrase: quoted, confidence: 0.45, note: 'text on the page' })];
};

const SHAPES: readonly Shape[] = [
  urlShape,
  titleShape,
  screenShape,
  redirectShape,
  messageShape,
  relativeCountShape,
  absoluteCountShape,
  acceptsShape,
  visibleInFieldShape,
  fieldShowsShape,
  textShape,
  rowPresenceShape,
  displaysObjectShape,
  resultsShowShape,
  stateShape,
  presenceShape,
  loadsShape,
  quotedShape,
];

// ─── Entry points ──────────────────────────────────────────────────────────

/** Split an expected-result text into clauses: sentences, then "… and <new subject> …". */
export const splitClauses = (text: string): readonly string[] => {
  const masked = maskQuotes(text);
  return masked.text
    .split(/[.;!?]+(?:\s+|$)|,?\s+and\s+(?=(?:the|a|an|it|its|they|no|only|all|each|every|then)\b|[A-Z0-9@\uE000])|,?\s+then\s+/)
    .map((part) => tidy(requote(part, masked.quotes)))
    .filter((part): part is string => part !== null);
};

/** Read one clause. Returns [] when it fits no known shape. */
export const parseClause = (clauseText: string, ctx: StatementContext): readonly ProposedAssertion[] => {
  const cleaned = clauseText.trim().replace(/^(?:that|then|also|and|so)\s+/i, '');
  const masked = maskQuotes(cleaned);
  const clause: Clause = { text: masked.text, quotes: masked.quotes, source: cleaned, ctx };
  if (isPureFiller(cleaned)) return [];
  for (const shape of SHAPES) {
    const result = shape(clause);
    if (result !== null) return result;
  }
  return [];
};

/** Two proposals are the same check when kind, target words, role, row, and expected value agree (the landmark only narrows). */
const keyOf = (a: ProposedAssertion): string =>
  JSON.stringify([a.kind, (a.targetPhrase ?? '').toLowerCase(), a.roleHint, a.rowCue, a.expected]);

/** Every assertion an expected-result text proposes, in reading order, duplicates dropped. */
export const proposeAssertions = (text: string, ctx: StatementContext): readonly ProposedAssertion[] =>
  dedupeAssertions(splitClauses(text).flatMap((clause) => parseClause(clause, ctx)));

export const dedupeAssertions = (list: readonly ProposedAssertion[]): readonly ProposedAssertion[] => {
  const seen = new Set<string>();
  return list.filter((a) => {
    const key = keyOf(a);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
