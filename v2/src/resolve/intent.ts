/**
 * Step understanding: one ADO step (action text, expected text, the test
 * case's parameter names) → a StepIntent.
 *
 * Lifted from v1's regex classifier (intent-classifier.ts), reorganized
 * around the verb a step starts with and fixed where the reality study
 * and the public-AUT runs showed it wrong: "Press the Submit button" is a
 * click, "Check the Terms checkbox" is check (not verify), "Tap" and
 * "Select the Active tab" are clicks, "Select Ohio from the State
 * dropdown" and "Choose Ohio in the State field" are selects with a value,
 * input no longer needs a "field" suffix, values and "@param" references
 * are read, and the target phrase is cut out correctly (see target.ts).
 *
 * This is the pre-filter and the no-model fallback. It is pure: no page,
 * no I/O, no clock.
 */
import type { Verb } from '../contract/schemas.js';
import { dedupeAssertions, parseClause, proposeAssertions, type StatementContext } from './assertions.js';
import { readKey } from './keys.js';
import { maskQuotes, plainText, requote, stripLeadingFiller, stripTrailingPunctuation, tidy, unmask, wholeQuote } from './phrase.js';
import { analyzeTarget, isWidgetPhrase, landmarkForCue, splitRoleSuffix, type TargetAnalysis } from './target.js';
import type { ProposedAssertion, StepContext, StepIntent } from './types.js';
import { isParamRef, matchParameter, paramRef, readValue, referent, type ValueContext, type ValueReading } from './values.js';

// ─── Reading a verb ────────────────────────────────────────────────────────

type Family =
  | 'back' | 'double' | 'click' | 'press' | 'select' | 'uncheck' | 'check' | 'toggle' | 'checkword' | 'clear' | 'fill' | 'set'
  | 'search' | 'hover' | 'scroll' | 'navigate' | 'open' | 'close' | 'submit' | 'wait' | 'login' | 'assert';

/** Lead verbs, first match wins; each is anchored at the start of the step (after connectives and "the user should"). */
const LEADS: ReadonlyArray<readonly [RegExp, Family]> = [
  [/^(?:go(?:es)?|navigate[sd]?|return(?:s)?|step)\s+back\b(?:\s+to\b)?/i, 'back'],
  [/^(?:double[-\s]?click(?:s|ed)?|right[-\s]?click(?:s|ed)?)\b/i, 'double'],
  [/^(?:click(?:s|ed)?|tap(?:s|ped)?|single[-\s]?click(?:s)?|activate[sd]?|follow(?:s)?|expand(?:s|ed)?|collapse[sd]?)\b/i, 'click'],
  [/^(?:press(?:es|ed)?|hit(?:s)?|push(?:es|ed)?)\b/i, 'press'],
  [/^(?:select(?:s|ed)?|choose(?:s)?|chose|pick(?:s|ed)?)\b/i, 'select'],
  [/^(?:un-?check(?:s|ed)?|un-?tick(?:s|ed)?|de-?select(?:s|ed)?|un-?select(?:s|ed)?|unmark(?:s|ed)?|turn(?:s|ed)?\s+off|switch(?:es|ed)?\s+off|disable[sd]?)\b/i, 'uncheck'],
  [/^(?:tick(?:s|ed)?|mark(?:s|ed)?|turn(?:s|ed)?\s+on|switch(?:es|ed)?\s+on|enable[sd]?)\b/i, 'check'],
  [/^(?:toggle[sd]?|flip(?:s|ped)?)\b/i, 'toggle'],
  [/^check(?:s|ed)?\b/i, 'checkword'],
  [/^(?:clear(?:s|ed)?|empty|erase[sd]?)\b/i, 'clear'],
  [/^(?:enter(?:s|ed)?|type[sd]?|input(?:s)?|fill(?:s|ed)?(?:\s+(?:in|out))?|populate[sd]?|provide[sd]?|put(?:s)?|write[sd]?|insert(?:s|ed)?|supply|supplies|specify|specifies|key(?:s)?\s+in)\b/i, 'fill'],
  [/^set(?:s)?\b/i, 'set'],
  [/^(?:search(?:es)?(?:\s+for)?|look(?:s)?\s+up|lookup)\b/i, 'search'],
  [/^(?:hover(?:s|ed)?(?:\s+(?:over|on))?|mouse\s*over|mouses\s+over|move(?:s)?\s+(?:the\s+)?(?:mouse|cursor|pointer)\s+(?:over|to|onto)|point(?:s)?\s+(?:at|to))\b/i, 'hover'],
  [/^scroll(?:s|ed)?(?:\s+(?:down|up))?(?:\s+(?:to|until))?\b/i, 'scroll'],
  [/^(?:navigate[sd]?(?:\s+(?:to|into))?|go(?:es)?\s+to|goto|browse(?:s)?\s+to|visit(?:s)?|launch(?:es)?|load(?:s)?|access(?:es)?|return(?:s)?\s+to|come(?:s)?\s+back\s+to|proceed(?:s)?\s+to|head(?:s)?\s+to|switch(?:es)?\s+to)\b/i, 'navigate'],
  [/^open(?:s|ed)?\b/i, 'open'],
  [/^(?:close[sd]?|dismiss(?:es|ed)?|cancel(?:s|led)?)\b/i, 'close'],
  [/^submit(?:s|ted)?\b/i, 'submit'],
  [/^(?:wait(?:s)?(?:\s+(?:for|until|till))?|pause[sd]?)\b/i, 'wait'],
  [/^(?:log(?:s)?\s*(?:in|on)|sign(?:s)?\s*(?:in|on)|login|logon|authenticate[sd]?)\b/i, 'login'],
  [/^(?:verif(?:y|ies|ied)|validate[sd]?|observe[sd]?|confirm(?:s|ed)?|ensure[sd]?|assert(?:s|ed)?|make\s+sure|see(?:s)?|expect(?:s)?|notice(?:s)?|note\s+that|look\s+for|inspect(?:s)?|examine[sd]?)\b(?:\s+(?:that|if|whether)\b)?/i, 'assert'],
];

const CONNECTIVES = /^(?:(?:then|next|now|and|finally|first|also|afterwards|after\s+that|once\s+done|step\s*\d+\s*[:.)-]?)\s*,?\s*)+/i;
const SUBJECT = /^(?:the\s+)?(?:user|tester|qa|operator|customer|agent|you|i|we)\s+/i;
const MODAL = /^(?:should|must|will|can|shall|needs?\s+to|has\s+to|have\s+to|tries\s+to|try\s+to|attempts?\s+to|is\s+able\s+to|please)\s+/i;

interface Lead {
  readonly family: Family;
  readonly word: string;
  readonly rest: string;
}

const matchLead = (text: string): Lead | null => {
  for (const [re, family] of LEADS) {
    const match = re.exec(text);
    if (match !== null) return { family, word: match[0], rest: text.slice(match[0].length).trim() };
  }
  return null;
};

const readLead = (text: string): Lead | null => {
  const base = text.replace(CONNECTIVES, '').trim();
  const direct = matchLead(base);
  if (direct !== null) return direct;
  const unsubjected = base.replace(SUBJECT, '').replace(MODAL, '').replace(MODAL, '').trim();
  return unsubjected === base ? null : matchLead(unsubjected);
};

/** "Enter X and click Search": a second action verb after "and" / "then" / ";" starts another step. */
const COMPOUND =
  /(?:\s*;\s*|,?\s+(?:and\s+then|and|then)\s+|,\s+)(?=(?:click|tap|press|hit|select|choose|pick|enter|type|fill|check|uncheck|tick|toggle|hover|navigate|go\s+to|open|wait|verify|confirm|ensure|submit|search|clear|set)\b)/i;

const splitCompound = (text: string): { readonly first: string; readonly rest: string | null } => {
  const masked = maskQuotes(text);
  const match = COMPOUND.exec(masked.text);
  if (match === null || match.index === 0) return { first: text, rest: null };
  return {
    first: unmask(masked.text.slice(0, match.index), masked.quotes).trim(),
    rest: unmask(masked.text.slice(match.index + match[0].length), masked.quotes).trim(),
  };
};

// ─── Readings ──────────────────────────────────────────────────────────────

interface Reading {
  readonly verb: Verb;
  readonly target: TargetAnalysis | null;
  readonly value: ValueReading | null;
  readonly key: string | null;
  /** Assertions read from the action text itself (verify steps). */
  readonly assertions: readonly ProposedAssertion[];
  readonly confidence: number;
  readonly notes: readonly string[];
}

interface Env {
  readonly values: ValueContext;
  readonly priorValues: readonly string[];
  readonly expected: string;
}

const reading = (verb: Verb, fields: Partial<Omit<Reading, 'verb'>>): Reading => ({
  verb,
  target: null,
  value: null,
  key: null,
  assertions: [],
  confidence: 0.9,
  notes: [],
  ...fields,
});

const withDefaultRole = (target: TargetAnalysis, role: string): TargetAnalysis =>
  target.roleHint === null ? { ...target, roleHint: role } : target;

const literalTarget = (phrase: string, role: string | null, extra: Partial<TargetAnalysis> = {}): TargetAnalysis => ({
  phrase,
  mention: phrase,
  roleHint: role,
  landmarkCue: null,
  rowCue: null,
  rowCueGeneric: false,
  exact: false,
  notes: [],
  ...extra,
});

const click = (rest: string, confidence = 0.9, notes: readonly string[] = []): Reading =>
  reading('click', { target: analyzeTarget(rest, 'action'), confidence, notes });

const KEY_TAIL = /^(?:$|(?:to|so|in\s+order|and|then|in|on|inside|within|into|while|again|twice|once|\d+\s+times|from|at)\b)/i;
const PLACE = /^(?:in|on|inside|within|into|from|at)\s+(.+)$/i;

const press = (rest: string): Reading => {
  const key = readKey(rest);
  if (key === null || !KEY_TAIL.test(key.rest)) {
    return click(rest, 0.85, ['"press" names a control here, not a key: read as a click']);
  }
  const place = PLACE.exec(key.rest.replace(/\s+(?:to|so|in\s+order\s+to)\s+.*$/i, ''));
  const target = place === null ? null : analyzeTarget(place[1] ?? '', 'fill');
  return reading('press', { key: key.key, target });
};

const NAV_CONTAINER = /\b(?:menu|nav(?:igation)?|side\s*bar|side\s*nav|top\s*bar|tab\s+bar|toolbar|tabs|header|footer|breadcrumbs?)\b/i;
const LIST_CONTAINER = /\b(?:drop[-\s]?down|list|select|combo\s*box|picker|options|choices)\b/i;
const CHECKABLE_ROLES = new Set(['checkbox', 'radio', 'switch']);
const CLICKABLE_ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'row', 'heading', 'img', 'columnheader']);

const select = (rest: string, env: Env): Reading => {
  const masked = maskQuotes(rest);
  const split = /^(.+?)\s+(?:from|in|on|within|under|of|for)\s+(?:the\s+)?(.+)$/i.exec(masked.text);
  const container = split === null ? null : unmask(split[2] ?? '', masked.quotes);
  if (split !== null && container !== null && !/^(?:row|table|grid)\b/i.test(container) && !/\brow\s+(?:for|containing|with)\b/i.test(container)) {
    const valuePart = requote(split[1] ?? '', masked.quotes);
    const lead = splitRoleSuffix(valuePart.replace(/^(?:the\s+)?/i, ''), 'action');
    if (lead.role !== null && (CHECKABLE_ROLES.has(lead.role) || CLICKABLE_ROLES.has(lead.role))) {
      // "Select the Remember me checkbox in the login form": the role word belongs to the target, not a value.
      return CHECKABLE_ROLES.has(lead.role) ? checkReading('check', rest) : click(rest);
    }
    if (NAV_CONTAINER.test(container) && !LIST_CONTAINER.test(container)) {
      const target = analyzeTarget(valuePart, 'action');
      const cue = landmarkForCue(container.replace(/^(?:the\s+)?(?:\w+\s+)?/, '').trim()) ?? landmarkForCue(container);
      return reading('click', {
        target: { ...target, landmarkCue: target.landmarkCue ?? cue },
        notes: [`"select ... from ${container}" read as a click on a menu entry`],
      });
    }
    const target = withDefaultRole(analyzeTarget(container, 'select'), 'combobox');
    const value = readValue(valuePart, env.values);
    return reading('select', { target, value });
  }
  const bare = rest.replace(/^(?:the|a|an)\s+/i, '');
  const suffix = splitRoleSuffix(maskQuotes(bare).text, 'action');
  if (suffix.role !== null && CHECKABLE_ROLES.has(suffix.role)) return checkReading('check', rest);
  if (suffix.role === 'option') {
    const value = readValue(unmask(suffix.rest, maskQuotes(bare).quotes), env.values);
    return reading('select', {
      value,
      target: null,
      confidence: 0.6,
      notes: ['the option is named without its dropdown: choose the dropdown from the page'],
    });
  }
  // A bare value ("Select 'Gold'", "Select @state") is a select whose dropdown the page must supply.
  const wholeValue = wholeQuote(maskQuotes(bare).text, maskQuotes(bare).quotes) !== null || /^@[A-Za-z_]\w*$/.test(bare.trim());
  if (wholeValue) {
    return reading('select', { value: readValue(bare, env.values), confidence: 0.6, notes: ['no dropdown named: choose it from the page'] });
  }
  return click(rest, 0.85, suffix.role === null ? ['"select" with no list read as a click'] : []);
};

const checkReading = (verb: 'check' | 'uncheck', rest: string, confidence = 0.9, notes: readonly string[] = []): Reading =>
  reading(verb, { target: withDefaultRole(analyzeTarget(rest, 'check'), 'checkbox'), confidence, notes });

const STATEMENT_PREDICATE =
  /\b(?:is|are|was|were|appears?|shows?|displays?|contains?|exists?|loads?|has|have|equals|reads|becomes?|remains?|disappears?)\b/i;

const checkWord = (rest: string, env: Env): Reading => {
  const intro = /^(?:that|if|whether|to\s+see|for)\b\s*/i.exec(rest);
  if (intro !== null) return assertReading(rest.slice(intro[0].length), env, 0.85);
  const target = analyzeTarget(rest, 'check');
  if (target.roleHint !== null && CHECKABLE_ROLES.has(target.roleHint)) return checkReading('check', rest);
  if (STATEMENT_PREDICATE.test(rest)) return assertReading(rest, env, 0.8);
  if (/\b(?:checked|ticked|selected|enabled|switched\s+on)\b/i.test(env.expected)) {
    return checkReading('check', rest, 0.7, ['"check" read as ticking a checkbox because the expected result says it becomes checked']);
  }
  return assertReading(rest, env, 0.55, ['"check" read as verify; if it names a checkbox, the verb is check']);
};

const clear = (rest: string): Reading => {
  const target = analyzeTarget(rest, 'fill');
  if (target.roleHint !== null && CHECKABLE_ROLES.has(target.roleHint)) return checkReading('uncheck', rest);
  return reading('fill', { target, value: { value: '', source: 'literal', note: null }, notes: ['clear: fill with an empty value'] });
};

const fill = (rest: string, env: Env): Reading => {
  const masked = maskQuotes(rest);
  const text = masked.text;
  const back = (s: string): string => unmask(s, masked.quotes);
  /** Values keep their quote marks so a quoted literal is never mistaken for a description. */
  const quotedBack = (s: string): string => requote(s, masked.quotes);
  const leadingQuote = /^(\uE000\d+\uE001)\s*(.*)$/.exec(text);
  const leadingParam = /^(@[A-Za-z_]\w*|\{[A-Za-z_]\w*\})\s*(.*)$/.exec(text);
  const lead = leadingQuote ?? leadingParam;
  if (lead !== null) {
    // "@username and @password": several values and no field; the value reading notes the extra ones.
    if (/^(?:and|&|,)\s/i.test(lead[2] ?? '')) return reading('fill', { value: readValue(rest, env.values), confidence: 0.6 });
    const after = (lead[2] ?? '').replace(/^(?:in|into|inside|on|onto|to|for|as|under|within)\s+/i, '');
    const target = after.trim().length > 0 ? analyzeTarget(back(after), 'fill') : null;
    return reading('fill', { value: readValue(quotedBack(lead[1] ?? ''), env.values), target });
  }
  const valueFirst = /^(.+?)\s+(?:in|into|inside|on|onto|to|under|within)\s+(?:the\s+)?(.+)$/i.exec(text);
  const asForm = /^(.+?)\s+as\s+(?:the\s+|a\s+|an\s+)?(.+)$/i.exec(text);
  const targetFirst = /^(?:the\s+)?(.+?)\s+with\s+(.+)$/i.exec(text);
  const pick = valueFirst !== null && !/^(?:the\s+)?(?:[\w-]+\s+){0,3}?(?:field|box|input|textbox)$/i.test(valueFirst[1] ?? '')
    ? { value: valueFirst[1] ?? '', target: valueFirst[2] ?? '' }
    : asForm !== null
      ? { value: asForm[1] ?? '', target: asForm[2] ?? '' }
      : targetFirst !== null
        ? { value: targetFirst[2] ?? '', target: targetFirst[1] ?? '' }
        : null;
  if (pick !== null) {
    return reading('fill', { value: readValue(quotedBack(pick.value), env.values), target: analyzeTarget(back(pick.target), 'fill') });
  }
  // One phrase: a value ("Type 'hello'", "Type @query"), a parameter by name ("Enter the policy number"), or a field with no value.
  const trimmed = rest.trim();
  const explicit = wholeQuote(text.trim(), masked.quotes) !== null || /^(?:@[A-Za-z_]\w*|\{[A-Za-z_]\w*\})$/.test(trimmed);
  const single = readValue(rest, env.values);
  if (explicit || (single.source === 'literal' && !/\s/.test(trimmed) && splitRoleSuffix(trimmed, 'fill').role === null)) {
    return reading('fill', { value: single, confidence: 0.7, notes: ['no field named: the value goes to the focused or only field'] });
  }
  const byName = matchParameter(rest, env.values.parameters);
  const target = analyzeTarget(rest, 'fill');
  return reading('fill', { value: byName === null ? null : { value: paramRef(byName), source: 'param', note: null }, target });
};

const ON_WORDS = /^(?:on|checked|true|yes|enabled|ticked|selected)$/i;
const OFF_WORDS = /^(?:off|unchecked|false|no|disabled|unticked|cleared)$/i;

const set = (rest: string, env: Env): Reading => {
  const masked = maskQuotes(rest);
  const split = /^(?:the\s+)?(.+?)\s+(?:to|=|as)\s+(.+)$/i.exec(masked.text);
  if (split === null) return reading('fill', { target: analyzeTarget(rest, 'fill'), confidence: 0.6 });
  const targetText = unmask(split[1] ?? '', masked.quotes);
  const valueText = requote(split[2] ?? '', masked.quotes);
  const asSelect = analyzeTarget(targetText, 'select');
  if (asSelect.roleHint === 'combobox' && /\b(?:drop[-\s]?down|select|list|combo\s*box|picker)\b/i.test(targetText)) {
    return reading('select', { target: asSelect, value: readValue(valueText, env.values) });
  }
  const target = analyzeTarget(targetText, 'fill');
  const word = valueText.trim().replace(/^['"]|['"]$/g, '');
  if ((target.roleHint === 'checkbox' || target.roleHint === 'switch') && (ON_WORDS.test(word) || OFF_WORDS.test(word))) {
    return reading(ON_WORDS.test(word) ? 'check' : 'uncheck', { target });
  }
  return reading('fill', { target, value: readValue(valueText, env.values) });
};

const search = (rest: string, env: Env): Reading => {
  const masked = maskQuotes(rest);
  const split = /^(.+?)\s+(?:in|into|on|using|with|via)\s+(?:the\s+)?(.+)$/i.exec(masked.text);
  const valueText = requote(split === null ? masked.text : split[1] ?? '', masked.quotes);
  const target = split === null
    ? literalTarget('search', 'textbox', { landmarkCue: 'search', mention: 'search box' })
    : analyzeTarget(unmask(split[2] ?? '', masked.quotes), 'fill');
  return reading('fill', {
    target,
    value: readValue(valueText, env.values),
    confidence: 0.75,
    notes: ['search: fill the search input; submitting (Search button or Enter) is a separate action'],
  });
};

const URL_LIKE = /^(?:https?:\/\/\S+|\/[^\s]*)$/i;
const GENERIC_APP = /^(?:application|app|site|website|web\s*site|system|portal|url|home\s*page|homepage|home|start\s+page|landing\s+page|login\s+page)$/i;

const navigate = (rest: string): Reading => {
  const text = stripTrailingPunctuation(rest.trim()).replace(/^(?:the\s+)?(?:url|page|address)\s+(?=\S*[/:])/i, '');
  if (URL_LIKE.test(text)) return reading('navigate', { value: { value: text, source: 'literal', note: null } });
  const target = analyzeTarget(text, 'navigate');
  // "Go to the Settings tab" names a control; the mention excludes any "with …" precondition.
  if (target.mention !== null && isWidgetPhrase(target.mention)) return click(target.mention, 0.85, ['"go to" a control read as a click']);
  if (target.phrase !== null && GENERIC_APP.test(target.phrase)) {
    const home = /home/i.test(target.phrase);
    return reading('navigate', {
      target: { ...target, phrase: home ? 'home' : null },
      notes: [...target.notes, "the application's start page (the profile baseURL)"],
    });
  }
  return reading('navigate', { target, notes: target.notes });
};

const DIALOG_WORDS = /\b(?:dialog|modal|pop[-\s]?up|lightbox|overlay|window|message|alert|banner)\b/i;

const close = (word: string, rest: string): Reading => {
  const name = (/^(\w+)/.exec(word)?.[1] ?? 'Close').toLowerCase();
  const label = name.startsWith('dismiss') ? 'Dismiss' : name.startsWith('cancel') ? 'Cancel' : 'Close';
  const scoped = DIALOG_WORDS.test(rest);
  return reading('click', {
    target: literalTarget(label, 'button', { landmarkCue: scoped ? 'dialog' : null }),
    confidence: 0.75,
    notes: rest.length > 0 ? [`${label.toLowerCase()} ${tidy(rest) ?? ''}`.trim()] : [],
  });
};

const DURATION = /^(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|m|mins?|minutes?)\b/i;

const INFINITIVE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\s+to\s+(?:finish\s+)?load(?:ing)?\b/i, ' loads'],
  [/\s+to\s+complete\b/i, ' loads'],
  [/\s+to\s+appear\b/i, ' appears'],
  [/\s+to\s+(?:show|display)\b/i, ' is displayed'],
  [/\s+to\s+disappear\b/i, ' disappears'],
  [/\s+to\s+vanish\b/i, ' vanishes'],
  [/\s+to\s+close\b/i, ' closes'],
  [/\s+to\s+be\s+/i, ' is '],
  [/\s+to\s+become\s+/i, ' becomes '],
];

const wait = (rest: string, env: Env): Reading => {
  const duration = DURATION.exec(rest.trim());
  if (duration !== null) {
    const amount = Number(duration[1]);
    const unit = (duration[2] ?? 's').toLowerCase();
    const ms = unit.startsWith('ms') || unit.startsWith('milli') ? amount : unit.startsWith('m') && !unit.startsWith('ms') ? amount * 60_000 : amount * 1000;
    return reading('wait', {
      value: { value: String(Math.round(ms)), source: 'literal', note: null },
      confidence: 0.8,
      notes: ['a fixed wait (milliseconds in value) is flaky; prefer waiting for a visible state'],
    });
  }
  const statement = INFINITIVE.reduce((text, [re, replacement]) => text.replace(re, replacement), rest);
  const assertions = parseClause(statement, statementContext(env, null, null));
  if (assertions.length > 0) return reading('wait', { assertions, target: targetOfAssertion(assertions[0]!) });
  const target = analyzeTarget(rest, 'assert');
  if (target.phrase === null && target.roleHint === null) {
    return reading('wait', { confidence: 0.6, notes: ['nothing to wait on: actions and assertions already auto-wait'] });
  }
  const visible: ProposedAssertion = {
    kind: 'visible', expected: null, targetPhrase: target.phrase, roleHint: target.roleHint, landmarkCue: target.landmarkCue,
    rowCue: target.rowCue, confidence: 0.5, note: null, source: rest,
  };
  return reading('wait', { target, assertions: [visible], confidence: 0.75 });
};

const targetOfAssertion = (a: ProposedAssertion): TargetAnalysis => ({
  phrase: a.targetPhrase,
  mention: a.targetPhrase,
  roleHint: a.roleHint,
  landmarkCue: a.landmarkCue,
  rowCue: a.rowCue,
  rowCueGeneric: false,
  exact: false,
  notes: [],
});

const statementContext = (env: Env, stepValue: string | null, stepTarget: TargetAnalysis | null): StatementContext => ({
  ...env.values,
  stepValue,
  priorValues: env.priorValues,
  stepTarget,
});

const assertReading = (body: string, env: Env, confidence: number, notes: readonly string[] = []): Reading => {
  const assertions = proposeAssertions(body, statementContext(env, null, null));
  if (assertions.length > 0) {
    return reading('assert', { assertions, target: targetOfAssertion(assertions[0]!), confidence, notes });
  }
  const target = analyzeTarget(body, 'assert');
  if (target.phrase === null && target.roleHint === null && target.rowCue === null) {
    return reading('assert', { confidence: confidence * 0.5, notes: [...notes, 'nothing to assert on was recognized in the wording'] });
  }
  const visible: ProposedAssertion = {
    kind: 'visible', expected: null, targetPhrase: target.phrase, roleHint: target.roleHint, landmarkCue: target.landmarkCue,
    rowCue: target.rowCue, confidence: 0.5, note: 'no state named: proposing visibility', source: body,
  };
  return reading('assert', { assertions: [visible], target, confidence: confidence * 0.9, notes });
};

const interpret = (lead: Lead, env: Env): Reading => {
  const { family, rest, word } = lead;
  switch (family) {
    case 'back': {
      const target = rest.length > 0 ? analyzeTarget(rest, 'navigate') : null;
      return reading('navigate', { target, confidence: 0.8, notes: ['go back: the previous page (page.goBack) unless a link back is named'] });
    }
    case 'double':
      return click(rest, 0.8, [`${word.toLowerCase().replace(/\s+/g, '-')} requested: emit it as a ${/right/i.test(word) ? "click({ button: 'right' })" : 'dblclick()'}`]);
    case 'click':
      return click(rest);
    case 'press':
      return press(rest);
    case 'select':
      return select(rest, env);
    case 'check':
      return checkReading('check', rest);
    case 'uncheck':
      return checkReading('uncheck', rest);
    case 'toggle':
      return reading('click', { target: withDefaultRole(analyzeTarget(rest, 'action'), 'switch'), notes: ['toggle: a click flips the state'] });
    case 'checkword':
      return checkWord(rest, env);
    case 'clear':
      return clear(rest);
    case 'fill':
      return fill(rest, env);
    case 'set':
      return set(rest, env);
    case 'search':
      return search(rest, env);
    case 'hover':
      return reading('hover', { target: analyzeTarget(rest, 'action') });
    case 'scroll': {
      const target = analyzeTarget(rest, 'action');
      return target.phrase === null && target.roleHint === null
        ? reading('wait', { confidence: 0.3, notes: ['scrolling with no target: Playwright scrolls targets into view when it acts'] })
        : reading('hover', { target, confidence: 0.45, notes: ['scroll read as hover, which scrolls the target into view'] });
    }
    case 'navigate':
      return navigate(rest);
    case 'open':
      return isWidgetPhrase(rest) ? click(rest, 0.85) : navigate(rest);
    case 'close':
      return close(word, rest);
    case 'submit':
      return reading('click', {
        target: { ...literalTarget('Submit', 'button'), landmarkCue: analyzeTarget(rest, 'action').landmarkCue },
        confidence: 0.7,
        notes: ['submit: click the form\'s submit button (its name may differ)'],
      });
    case 'wait':
      return wait(rest, env);
    case 'login':
      return reading('click', {
        target: literalTarget('Log in', 'button'),
        confidence: 0.3,
        notes: ["login step: prefer the profile's login flow (flow.run) or saved storage state; credentials are never literals"],
      });
    case 'assert':
      return assertReading(rest, env, 0.85);
    default: {
      const never: never = family;
      return never;
    }
  }
};

/** A step with no recognized lead verb: a statement ("The Save button should be disabled") or a bare control name. */
const interpretStatement = (text: string, env: Env): Reading => {
  if (STATEMENT_PREDICATE.test(text) || /\bshould\b/i.test(text)) {
    const assertion = assertReading(text.replace(/^(?:the\s+)?(?:user|tester)\s+(?:should\s+)?(?:see|sees)\s+/i, ''), env, 0.6);
    if (assertion.assertions.length > 0) return assertion;
  }
  const target = analyzeTarget(text, 'action');
  if (target.roleHint !== null && ['button', 'link', 'tab', 'menuitem'].includes(target.roleHint)) {
    return reading('click', { target, confidence: 0.35, notes: ['no action verb: read as a click on the named control'] });
  }
  return { ...assertReading(text, env, 0.2), notes: ['no action verb recognized'] };
};

// ─── Assembly ──────────────────────────────────────────────────────────────

const TARGET_VERBS: ReadonlySet<Verb> = new Set<Verb>(['click', 'fill', 'select', 'check', 'uncheck', 'hover']);

/**
 * Whether acting on the intent needs a target on the page. press acts on
 * the focused element; navigate with a URL (or to the start page) and a
 * fixed wait need none; url/title assertions are page-level.
 */
export const needsTarget = (intent: StepIntent): boolean => {
  const named = intent.targetPhrase !== null || intent.roleHint !== null || intent.rowCue !== null;
  switch (intent.verb) {
    case 'press':
      return named;
    case 'navigate':
      return intent.value === null && intent.targetPhrase !== null;
    case 'wait':
    case 'assert': {
      const first = intent.assertions[0];
      if (first === undefined) return named;
      return first.kind !== 'url' && first.kind !== 'title';
    }
    case 'fill':
    case 'click':
    case 'select':
    case 'check':
    case 'uncheck':
    case 'hover':
    default:
      return TARGET_VERBS.has(intent.verb);
  }
};

const round2 = (n: number): number => Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;

const scoreConfidence = (r: Reading, compound: boolean, intentTarget: TargetAnalysis | null): number => {
  let c = r.confidence;
  const named = intentTarget !== null && (intentTarget.phrase !== null || intentTarget.rowCue !== null);
  const roleOnly = intentTarget !== null && intentTarget.roleHint !== null;
  if (TARGET_VERBS.has(r.verb)) c *= named ? 1 : roleOnly ? 0.8 : 0.5;
  if ((r.verb === 'fill' || r.verb === 'select') && (r.value === null || r.value.value === null)) c *= 0.8;
  if (r.value !== null && r.value.note !== null) c *= 0.9;
  if (compound) c *= 0.85;
  return round2(c);
};

/**
 * Read one step. `parameters` are the test case's parameter names (used to
 * recognize "@name" and bare-name references); `context` carries the
 * values earlier steps used, so "the entered name" and "next to the todo"
 * can refer back to them.
 */
export const classifyStep = (
  actionText: string,
  expectedText: string,
  parameters: readonly string[],
  context: StepContext = {},
): StepIntent => {
  const action = plainText(actionText);
  const expected = plainText(expectedText);
  const values: ValueContext = context.dataRow === undefined ? { parameters } : { parameters, dataRow: context.dataRow };
  const priorValues = context.priorValues ?? [];
  const env: Env = { values, priorValues, expected };

  const { first, rest } = splitCompound(stripTrailingPunctuation(action));
  const lead = readLead(first);
  const r = lead === null ? interpretStatement(first, env) : interpret(lead, env);

  // A row named by description ("next to the todo") is the value an earlier step used, when there is one.
  const refs = { ...values, stepValue: null, priorValues };
  const target: TargetAnalysis | null =
    r.target !== null && r.target.rowCue !== null && r.target.rowCueGeneric
      ? { ...r.target, rowCue: referent(r.target.rowCue, refs, true) ?? (tidy(stripLeadingFiller(r.target.rowCue)) ?? r.target.rowCue) }
      : r.target;
  const rowNote =
    r.target !== null && r.target.rowCueGeneric && target !== null && target.rowCue !== r.target.rowCue
      ? [`"${r.target.rowCue}" read as the row holding ${target.rowCue ?? ''}`]
      : [];

  const stepValue = r.value?.value ?? null;
  const expectedAssertions = expected.length > 0 ? proposeAssertions(expected, statementContext(env, stepValue, target)) : [];
  const assertions = dedupeAssertions([...r.assertions, ...expectedAssertions]);

  const notes = [
    ...r.notes,
    ...(target?.notes ?? []),
    ...rowNote,
    ...(r.value?.note === null || r.value?.note === undefined ? [] : [r.value.note]),
    ...(rest === null ? [] : [`compound step: "${rest}" is a separate action; author it as its own step`]),
    ...(r.verb === 'fill' && stepValue === null ? ['no value given for the field: supply one as test data'] : []),
  ];

  return {
    verb: r.verb,
    targetPhrase: target?.phrase ?? null,
    targetMention: target?.mention ?? null,
    exactName: target?.exact ?? false,
    roleHint: target?.roleHint ?? null,
    value: stepValue,
    key: r.key,
    landmarkCue: target?.landmarkCue ?? null,
    rowCue: target?.rowCue ?? null,
    assertions,
    confidence: scoreConfidence(r, rest !== null, target),
    notes: [...new Set(notes)],
    actionText: action,
    expectedText: expected,
  };
};

/**
 * An assert intent for one proposed assertion, so it can be ranked against
 * a snapshot exactly like an action's target.
 */
export const intentForAssertion = (intent: StepIntent, assertion: ProposedAssertion): StepIntent => ({
  ...intent,
  verb: 'assert',
  targetPhrase: assertion.targetPhrase,
  targetMention: assertion.targetPhrase,
  exactName: false,
  roleHint: assertion.roleHint,
  value: null,
  key: null,
  landmarkCue: assertion.landmarkCue,
  rowCue: assertion.rowCue,
  assertions: [assertion],
  confidence: assertion.confidence,
  notes: assertion.note === null ? [] : [assertion.note],
  actionText: assertion.source,
});

/** The values a step contributes to later steps' context (its own value, if any). */
export const valuesUsedBy = (intent: StepIntent): readonly string[] =>
  intent.value !== null && intent.value.length > 0 ? [intent.value] : [];

export { isParamRef };
