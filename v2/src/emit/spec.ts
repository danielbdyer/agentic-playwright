/**
 * tests/<area>/<adoId>-<slug>.spec.ts: one plain Playwright spec per ADO test
 * case. One test.step per ADO step, titled with the ADO wording; the body calls
 * page-object members and Playwright verbs only (no selectors); assertions are
 * web-first; ADO id, revision, content hash and step identifiers travel as
 * details-object annotations so `playwright test --list` sees them without
 * running anything.
 */
import type { AssertionSpec, Facet, Handoff, ResolvedStep, StepTarget, TestCase, TestStep } from '../contract/schemas.js';
import { ToolError } from '../core/errors.js';
import { normalizeText, stripHtml } from '../core/text.js';
import { HASH_PLACEHOLDER, stampHash } from './keep.js';
import type { MemberInfo } from './naming.js';
import {
  RESERVED_WORDS,
  assignIdentifiers,
  flowFilePath,
  flowFunctionName,
  flowParamIdentifiers,
  importSpecifier,
  memberTable,
  normalizeRelativePath,
  pageClassName,
  pageObjectPath,
  paramEnvName,
  specPath,
  specTags,
} from './naming.js';
import { routeUrl } from './page-object.js';
import type { EmitLayout, FlowUse, RenderedSpec, ScreenCatalog, SpecInput } from './types.js';
import { DEFAULT_LAYOUT } from './types.js';
import { commentText, indent, literalRegex, quote, separated, templateText, toFileText } from './writer.js';

// ─── Expressions with dependencies ──────────────────────────────────────────

interface Names {
  /** Page-object variable for a screen. */
  readonly po: (screen: string) => string;
  /** Local identifier for an ADO parameter. */
  readonly param: (name: string) => string;
}

interface Deps {
  readonly screens: readonly string[];
  readonly params: readonly string[];
  readonly facets: readonly string[];
  readonly page: boolean;
  readonly expect: boolean;
}

/** A code fragment whose identifiers are decided later, carrying what it uses. */
interface Expr {
  readonly render: (names: Names) => string;
  readonly deps: Deps;
}

const NO_DEPS: Deps = { screens: [], params: [], facets: [], page: false, expect: false };

const unique = <T>(items: readonly T[]): readonly T[] => [...new Set(items)];

const mergeDeps = (all: readonly Deps[]): Deps => ({
  screens: unique(all.flatMap((d) => d.screens)),
  params: unique(all.flatMap((d) => d.params)),
  facets: unique(all.flatMap((d) => d.facets)),
  page: all.some((d) => d.page),
  expect: all.some((d) => d.expect),
});

const isExpr = (part: Expr | string): part is Expr => typeof part !== 'string';

/** Tagged template: string parts are inserted as written, Expr parts rendered with the final names. */
const js = (strings: TemplateStringsArray, ...parts: readonly (Expr | string)[]): Expr => ({
  render: (names) =>
    strings.reduce((out, text, i) => {
      const part = parts[i - 1];
      return out + (part === undefined ? '' : isExpr(part) ? part.render(names) : part) + text;
    }),
  deps: mergeDeps(parts.filter(isExpr).map((part) => part.deps)),
});

const lit = (text: string): Expr => ({ render: () => text, deps: NO_DEPS });
const withDeps = (expr: Expr, deps: Partial<Deps>): Expr => ({ render: expr.render, deps: mergeDeps([expr.deps, { ...NO_DEPS, ...deps }]) });
const joinExprs = (exprs: readonly Expr[], separator: string): Expr => ({
  render: (names) => exprs.map((e) => e.render(names)).join(separator),
  deps: mergeDeps(exprs.map((e) => e.deps)),
});

const PAGE: Expr = withDeps(lit('page'), { page: true });
const EXPECT: Expr = withDeps(lit('expect'), { expect: true });
const poRef = (screen: string): Expr => ({ render: (names) => names.po(screen), deps: { ...NO_DEPS, screens: [screen] } });
const paramRef = (name: string): Expr => ({ render: (names) => names.param(name), deps: { ...NO_DEPS, params: [name] } });

// ─── Context ────────────────────────────────────────────────────────────────

interface FacetEntry {
  readonly facet: Facet;
  readonly member: MemberInfo | undefined;
}

interface Ctx {
  readonly testCase: TestCase;
  readonly facets: ReadonlyMap<string, FacetEntry>;
  readonly catalogs: ReadonlyMap<string, ScreenCatalog>;
  readonly handoffs: ReadonlyMap<string, Handoff>;
}

const invalid = (message: string, detail?: Record<string, unknown>): ToolError => new ToolError('invalid-input', message, detail);

const buildCtx = (input: SpecInput): Ctx => {
  const catalogs = new Map(input.catalogs.map((catalog) => [catalog.screen, catalog]));
  const facets = new Map(
    input.catalogs.flatMap((catalog) => {
      const table = memberTable(catalog.facets);
      return catalog.facets.map((facet) => [facet.id, { facet, member: table.get(facet.id) }] as const);
    }),
  );
  return { testCase: input.testCase, facets, catalogs, handoffs: new Map((input.handoffs ?? []).map((h) => [h.handoffId, h])) };
};

/** ADO text as written, with HTML markup removed when the text carries any. */
const adoText = (text: string): string => (/<[a-z/!][^>]*>|&[a-z#0-9]+;/i.test(text) ? stripHtml(text) : text).trim();

// ─── Values ─────────────────────────────────────────────────────────────────

const findParam = (name: string, ctx: Ctx): string | undefined =>
  ctx.testCase.parameters.find((p) => p === name) ?? ctx.testCase.parameters.find((p) => p.toLowerCase() === name.toLowerCase());

type ValuePart = { readonly text: string } | { readonly param: string };

/**
 * Split a value at "@name" references to declared ADO parameters. An "@" that
 * follows a letter or digit (an email address) or names no declared parameter
 * is literal text.
 */
const valueParts = (raw: string, ctx: Ctx): readonly ValuePart[] => {
  const pattern = /(^|[^A-Za-z0-9_@.])@([A-Za-z_][A-Za-z0-9_]*)/g;
  const found = [...raw.matchAll(pattern)].flatMap((match) => {
    const param = findParam(match[2]!, ctx);
    const start = match.index + match[1]!.length;
    return param === undefined ? [] : [{ param, start, end: start + 1 + match[2]!.length }];
  });
  const pieces = found.reduce<{ readonly parts: readonly ValuePart[]; readonly at: number }>(
    (acc, ref) => ({
      parts: [...acc.parts, ...(ref.start > acc.at ? [{ text: raw.slice(acc.at, ref.start) }] : []), { param: ref.param }],
      at: ref.end,
    }),
    { parts: [], at: 0 },
  );
  return pieces.at < raw.length || pieces.parts.length === 0 ? [...pieces.parts, { text: raw.slice(pieces.at) }] : pieces.parts;
};

/** A string-valued expression: a literal, a parameter, or a template literal mixing both. */
const stringValue = (raw: string, ctx: Ctx): Expr => {
  const parts = valueParts(raw, ctx);
  const only = parts[0];
  if (parts.length === 1 && only !== undefined) return 'param' in only ? paramRef(only.param) : lit(quote(only.text));
  const pieces = parts.map((part) => ('param' in part ? js`\${${paramRef(part.param)}}` : lit(templateText(part.text))));
  return js`\`${joinExprs(pieces, '')}\``;
};

const numberValue = (raw: string | number, ctx: Ctx, where: string): Expr => {
  if (typeof raw === 'number') return lit(String(raw));
  const parts = valueParts(raw, ctx);
  const only = parts[0];
  if (parts.length === 1 && only !== undefined && 'param' in only) return js`Number(${paramRef(only.param)})`;
  if (/^\s*\d+\s*$/.test(raw)) return lit(String(Number(raw)));
  throw invalid(`${where}: expected a number or an @parameter, got ${JSON.stringify(raw)}`);
};

// ─── Targets ────────────────────────────────────────────────────────────────

type TargetRef =
  | { readonly kind: 'member'; readonly screen: string; readonly facet: Facet; readonly member: MemberInfo }
  | { readonly kind: 'route'; readonly screen: string; readonly facet: Facet };

const resolveTarget = (target: StepTarget | undefined, ctx: Ctx, where: string): TargetRef | null => {
  if (target === undefined) return null;
  if (!('facetId' in target)) {
    throw invalid(`${where} targets a raw locator or snapshot candidate; mint it as a candidate facet before emitting`, { target });
  }
  const entry = ctx.facets.get(target.facetId);
  if (entry === undefined) {
    throw new ToolError('not-found', `${where}: facet ${target.facetId} is not in the catalogs passed to emission`, { facetId: target.facetId });
  }
  const { facet, member } = entry;
  if (facet.status === 'retired') {
    throw new ToolError('not-found', `${where}: facet ${facet.id} is retired and has no page-object member; resolve the step again`, { facetId: facet.id });
  }
  if (facet.kind === 'route') return { kind: 'route', screen: facet.screen, facet };
  if (member === undefined) throw invalid(`${where}: facet ${facet.id} has no locator; observe the screen and enrich it first`, { facetId: facet.id });
  return { kind: 'member', screen: facet.screen, facet, member };
};

/** Arguments for a row facet's method: the explicit value for the first placeholder, else ADO parameters of the same name. */
const rowArgs = (ref: Extract<TargetRef, { kind: 'member' }>, explicit: string | number | undefined, ctx: Ctx, where: string): readonly Expr[] =>
  ref.member.placeholders.map((placeholder, i) => {
    if (i === 0 && explicit !== undefined) return stringValue(String(explicit), ctx);
    const declared = findParam(placeholder, ctx) ?? (i === 0 && ref.facet.parameter !== undefined ? findParam(ref.facet.parameter, ctx) : undefined);
    if (declared !== undefined) return paramRef(declared);
    throw invalid(
      `${where}: facet ${ref.facet.id} selects a row by {${placeholder}}; give the step a value (a literal or an @parameter) or declare the ADO parameter ${placeholder}`,
      { facetId: ref.facet.id },
    );
  });

const memberAccess = (ref: Extract<TargetRef, { kind: 'member' }>, explicit: string | number | undefined, ctx: Ctx, where: string): Expr => {
  const base = withDeps(js`${poRef(ref.screen)}.${ref.member.name}`, { facets: [ref.facet.id] });
  if (ref.member.params.length === 0) return base;
  return js`${base}(${joinExprs(rowArgs(ref, explicit, ctx, where), ', ')})`;
};

const requireMember = (ref: TargetRef | null, where: string, verb: string): Extract<TargetRef, { kind: 'member' }> => {
  if (ref === null) throw invalid(`${where}: ${verb} needs a target facet`);
  if (ref.kind === 'route') throw invalid(`${where}: ${verb} cannot target route facet ${ref.facet.id}; use navigate`);
  return ref;
};

const gotoScreen = (screen: string, ctx: Ctx, where: string, facetId?: string): Expr => {
  const catalog = ctx.catalogs.get(screen);
  if (catalog === undefined) throw new ToolError('not-found', `${where}: no catalog was passed for screen ${screen}`, { screen });
  if (catalog.route === null) {
    throw invalid(`${where}: screen ${screen} has no route, so its page object has no goto(); observe the screen to record its URL`, { screen });
  }
  const call = js`await ${poRef(screen)}.goto();`;
  return facetId === undefined ? call : withDeps(call, { facets: [facetId] });
};

// ─── Steps ──────────────────────────────────────────────────────────────────

const LOAD_STATES = new Set(['load', 'domcontentloaded', 'networkidle']);

/** Verbs whose `value` is not consumed by the action itself, so it can select a row. */
const VALUE_FREE_VERBS = new Set(['click', 'hover', 'check', 'uncheck', 'assert', 'navigate']);

const actionStatements = (step: ResolvedStep, ctx: Ctx, where: string): readonly Expr[] => {
  const target = resolveTarget(step.target, ctx, where);
  const rowValue = VALUE_FREE_VERBS.has(step.verb) ? step.value : undefined;
  switch (step.verb) {
    case 'navigate': {
      if (target?.kind === 'route') return [gotoScreen(target.screen, ctx, where, target.facet.id)];
      if (target?.kind === 'member') return [js`await ${memberAccess(target, rowValue, ctx, where)}.click();`];
      if (step.screen !== undefined) return [gotoScreen(step.screen, ctx, where)];
      if (step.value !== undefined) {
        const url = /^[a-z][a-z0-9+.-]*:/i.test(step.value) ? step.value : step.value.replace(/^\/+/, '');
        return [js`await ${PAGE}.goto(${stringValue(url, ctx)});`];
      }
      throw invalid(`${where}: navigate needs a route facet, a screen, or a URL value`);
    }
    case 'click':
    case 'hover':
    case 'check':
    case 'uncheck': {
      const ref = requireMember(target, where, step.verb);
      return [js`await ${memberAccess(ref, rowValue, ctx, where)}.${step.verb}();`];
    }
    case 'fill': {
      const ref = requireMember(target, where, 'fill');
      if (step.value === undefined) throw invalid(`${where}: fill needs a value (a literal or an @parameter)`);
      return [js`await ${memberAccess(ref, undefined, ctx, where)}.fill(${stringValue(step.value, ctx)});`];
    }
    case 'select': {
      const ref = requireMember(target, where, 'select');
      if (step.value === undefined) throw invalid(`${where}: select needs the option to pick as its value`);
      const value = stringValue(step.value, ctx);
      if (ref.member.selectStyle === 'native') return [js`await ${memberAccess(ref, undefined, ctx, where)}.selectOption(${value});`];
      if (ref.member.selectStyle === 'helper' && ref.member.selectHelper !== null) {
        const rowParams = ref.member.params.length === 0 ? [] : rowArgs(ref, undefined, ctx, where);
        const args = joinExprs([...rowParams, value], ', ');
        return [withDeps(js`await ${poRef(ref.screen)}.${ref.member.selectHelper}(${args});`, { facets: [ref.facet.id] })];
      }
      throw invalid(
        `${where}: facet ${ref.facet.id} is a <${ref.facet.tag ?? '?'}> with role ${ref.facet.role ?? 'none'}; select needs a native <select> or a combobox/listbox facet`,
        { facetId: ref.facet.id },
      );
    }
    case 'press': {
      const key = step.key ?? step.value;
      if (key === undefined) throw invalid(`${where}: press needs a key, e.g. "Enter"`);
      if (target === null) return [js`await ${PAGE}.keyboard.press(${quote(key)});`];
      return [js`await ${memberAccess(requireMember(target, where, 'press'), undefined, ctx, where)}.press(${quote(key)});`];
    }
    case 'wait': {
      if (target !== null) return [js`await ${memberAccess(requireMember(target, where, 'wait'), rowValue, ctx, where)}.waitFor();`];
      if (step.value !== undefined && LOAD_STATES.has(step.value)) return [js`await ${PAGE}.waitForLoadState(${quote(step.value)});`];
      if (step.value !== undefined && /^\d+$/.test(step.value)) return [js`await ${PAGE}.waitForTimeout(${String(Number(step.value))});`];
      throw invalid(`${where}: wait needs a target facet, a load state (load, domcontentloaded, networkidle) or milliseconds`);
    }
    case 'assert':
      return [];
    default: {
      const never: never = step.verb;
      throw invalid(`${where}: unknown verb ${String(never)}`);
    }
  }
};

/** Assertion kinds that do not use `expected`, so `expected` can select a row. */
const EXPECTED_FREE_KINDS = new Set(['visible', 'hidden', 'enabled', 'disabled', 'checked', 'unchecked']);

const urlMatcher = (expected: string | number | undefined, screen: string | undefined, ctx: Ctx, where: string): Expr => {
  if (expected === undefined) {
    const route = screen === undefined ? null : (ctx.catalogs.get(screen)?.route ?? null);
    if (route === null) throw invalid(`${where}: a url assertion needs an expected URL, or a screen with a known route`);
    return lit(literalRegex(routeUrl(route)));
  }
  const parts = valueParts(String(expected), ctx);
  if (parts.every((part) => 'text' in part)) return lit(literalRegex(String(expected)));
  return js`(url) => url.href.includes(${stringValue(String(expected), ctx)})`;
};

const assertionStatement = (assertion: AssertionSpec, step: ResolvedStep, ctx: Ctx, where: string): Expr => {
  const expected = assertion.expected;
  const needExpected = (): string | number => {
    if (expected === undefined) throw invalid(`${where}: a ${assertion.kind} assertion needs an expected value`);
    return expected;
  };
  if (assertion.kind === 'url') {
    const ref = resolveTarget(assertion.target, ctx, where);
    const screen = ref?.screen ?? step.screen;
    return js`await ${EXPECT}(${PAGE}).toHaveURL(${urlMatcher(expected, screen, ctx, where)});`;
  }
  if (assertion.kind === 'title') return js`await ${EXPECT}(${PAGE}).toHaveTitle(${stringValue(String(needExpected()), ctx)});`;

  const ref = resolveTarget(assertion.target ?? step.target, ctx, where);
  if (ref === null) throw invalid(`${where}: a ${assertion.kind} assertion needs a target facet`);
  if (ref.kind === 'route') {
    if (assertion.kind !== 'visible') throw invalid(`${where}: route facet ${ref.facet.id} supports only a visible (URL) assertion`);
    return withDeps(js`await ${EXPECT}(${PAGE}).toHaveURL(${urlMatcher(undefined, ref.screen, ctx, where)});`, { facets: [ref.facet.id] });
  }
  const rowValue = EXPECTED_FREE_KINDS.has(assertion.kind)
    ? (expected ?? (VALUE_FREE_VERBS.has(step.verb) ? step.value : undefined))
    : VALUE_FREE_VERBS.has(step.verb) ? step.value : undefined;
  const subject = js`${EXPECT}(${memberAccess(ref, rowValue, ctx, where)})`;
  switch (assertion.kind) {
    case 'visible':
      return js`await ${subject}.toBeVisible();`;
    case 'hidden':
      return js`await ${subject}.toBeHidden();`;
    case 'enabled':
      return js`await ${subject}.toBeEnabled();`;
    case 'disabled':
      return js`await ${subject}.toBeDisabled();`;
    case 'checked':
      return js`await ${subject}.toBeChecked();`;
    case 'unchecked':
      return js`await ${subject}.not.toBeChecked();`;
    case 'text':
      return js`await ${subject}.toHaveText(${stringValue(String(needExpected()), ctx)});`;
    case 'contains-text':
      return js`await ${subject}.toContainText(${stringValue(String(needExpected()), ctx)});`;
    case 'value':
      return js`await ${subject}.toHaveValue(${stringValue(String(needExpected()), ctx)});`;
    case 'count':
      return js`await ${subject}.toHaveCount(${numberValue(needExpected(), ctx, where)});`;
    default: {
      const never: never = assertion.kind;
      throw invalid(`${where}: unknown assertion kind ${String(never)}`);
    }
  }
};

const handoffStatement = (step: ResolvedStep, handoff: Handoff | undefined, testCase: TestCase): Expr => {
  const reason = handoff === undefined
    ? 'this step could not be resolved'
    : `${handoff.blockage.replace(/-/g, ' ')}: ${handoff.unresolvedIntent}`;
  const oneLine = commentText(reason).replace(/\s+/g, ' ');
  const short = oneLine.length > 200 ? `${oneLine.slice(0, 197)}...` : oneLine;
  const file = handoff === undefined ? `${testCase.id}-${step.index}.json` : `${handoff.testCaseId}-${handoff.stepIndex}.json`;
  return lit(`test.fixme(true, ${quote(`Needs a human (handoff ${step.handoffId ?? '?'}): ${short} — see .tesseract/handoffs/${file}`)});`);
};

interface StepPlan {
  readonly index: number;
  readonly stepIdentifier: string;
  readonly title: string;
  readonly expected: string;
  readonly statements: readonly Expr[];
  readonly deps: Deps;
}

const planStep = (ado: TestStep, step: ResolvedStep, ctx: Ctx): StepPlan => {
  const where = `step ${ado.index}`;
  const title = adoText(ado.action) || adoText(ado.expected) || `Step ${ado.index}`;
  const statements = step.handoffId !== undefined
    ? [handoffStatement(step, ctx.handoffs.get(step.handoffId), ctx.testCase)]
    : (() => {
        const actions = actionStatements(step, ctx, where);
        const assertions = step.assertions ?? [];
        const effective = step.verb === 'assert' && assertions.length === 0
          ? (step.target !== undefined ? [{ kind: 'visible' as const }] : [])
          : assertions;
        if (step.verb === 'assert' && effective.length === 0) throw invalid(`${where}: assert needs assertions or a target`);
        return [...actions, ...effective.map((assertion) => assertionStatement(assertion, step, ctx, where))];
      })();
  return {
    index: ado.index,
    stepIdentifier: ado.stepIdentifier,
    title,
    expected: adoText(ado.expected),
    statements,
    deps: mergeDeps(statements.map((s) => s.deps)),
  };
};

/** Pair each ADO step with its resolved step; wording must match the case, or the case changed under the agent. */
const alignSteps = (testCase: TestCase, steps: readonly ResolvedStep[]): readonly { readonly ado: TestStep; readonly resolved: ResolvedStep }[] => {
  const indexes = steps.map((s) => s.index);
  const duplicate = indexes.find((index, i) => indexes.indexOf(index) !== i);
  if (duplicate !== undefined) throw invalid(`step ${duplicate} is resolved more than once`);
  const known = new Set(testCase.steps.map((s) => s.index));
  const extra = steps.filter((s) => !known.has(s.index));
  if (extra.length > 0) throw invalid(`test case ${testCase.id} has no step ${extra.map((s) => s.index).join(', ')}`);
  const same = (a: string, b: string): boolean => normalizeText(adoText(a)) === normalizeText(adoText(b));
  return testCase.steps.map((ado) => {
    const resolved = steps.find((s) => s.index === ado.index);
    if (resolved === undefined) {
      throw invalid(`step ${ado.index} ("${adoText(ado.action)}") is not resolved; resolve it or raise a handoff and pass its handoffId`, { step: ado.index });
    }
    if (resolved.stepIdentifier !== ado.stepIdentifier) {
      throw new ToolError('conflict', `step ${ado.index}: stepIdentifier ${resolved.stepIdentifier} does not match ADO ${ado.stepIdentifier} (rev ${testCase.revision}); fetch the case again`, {
        step: ado.index,
      });
    }
    if (!same(resolved.actionText, ado.action)) {
      throw new ToolError('conflict', `step ${ado.index}: the action text does not match ADO rev ${testCase.revision}; fetch the case again`, {
        step: ado.index,
        resolved: resolved.actionText,
        ado: adoText(ado.action),
      });
    }
    return { ado, resolved };
  });
};

// ─── Flows in beforeEach ────────────────────────────────────────────────────

interface FlowCall {
  readonly name: string;
  readonly fn: string;
  readonly args: string;
  readonly needsEnv: boolean;
}

const planFlowCall = (use: FlowUse): FlowCall => {
  const recording = use.recording;
  const ids = flowParamIdentifiers(recording.params);
  const provided = use.params ?? {};
  const unknown = Object.keys(provided).filter((name) => !recording.params.some((p) => p.name === name));
  if (unknown.length > 0) throw invalid(`flow ${recording.name} has no parameter ${unknown.join(', ')}`);
  const entries = recording.params.map((param) => {
    const key = ids.get(param.name)!;
    const value = provided[param.name];
    if (param.secret && value !== undefined) {
      throw invalid(`flow ${recording.name} parameter ${param.name} is secret; it is read from ${paramEnvName(param.name)}, never written into a spec`);
    }
    const literal = param.secret ? undefined : (value ?? param.default);
    return literal === undefined
      ? { text: `${key}: requireEnv(${quote(paramEnvName(param.name))})`, env: true }
      : { text: `${key}: ${quote(literal)}`, env: false };
  });
  return {
    name: recording.name,
    fn: flowFunctionName(recording.name),
    args: entries.length === 0 ? '{}' : `{ ${entries.map((e) => e.text).join(', ')} }`,
    needsEnv: entries.some((e) => e.env),
  };
};

// ─── File ───────────────────────────────────────────────────────────────────

const rowTitles = (testCase: TestCase): readonly string[] => {
  const raw = testCase.dataRows.map((row, i) => {
    const values = testCase.parameters.map((p) => row[p] ?? '').filter((v) => v.length > 0);
    return values.length > 0 ? values.join(', ') : `data row ${i + 1}`;
  });
  return raw.map((title, i) => (raw.indexOf(title) !== i || raw.lastIndexOf(title) !== i ? `${title} (data row ${i + 1})` : title));
};

const validateSpecPath = (raw: string): string => {
  const normalized = normalizeRelativePath(raw, 'spec path');
  if (!normalized.endsWith('.spec.ts')) throw invalid(`spec path must end with .spec.ts: ${raw}`);
  return normalized;
};

/**
 * Render the spec for one ADO test case. Pure: the caller resolves the sticky
 * path (locateSpec) and passes it as `path` when a spec for the case already
 * exists. Throws invalid-input for unusable steps, not-found for unknown or
 * retired facets, conflict when the steps do not match the case's wording.
 */
export const renderSpec = (input: SpecInput): RenderedSpec => {
  const layout: EmitLayout = input.layout ?? DEFAULT_LAYOUT;
  const testCase = input.testCase;
  const ctx = buildCtx(input);
  const plans = alignSteps(testCase, input.steps).map(({ ado, resolved }) => planStep(ado, resolved, ctx));
  const deps = mergeDeps(plans.map((plan) => plan.deps));
  const screens = deps.screens;
  const area = input.area ?? screens[0] ?? input.steps.find((s) => s.screen !== undefined)?.screen ?? 'unsorted';
  const filePath = input.path !== undefined ? validateSpecPath(input.path) : specPath(testCase.id, testCase.title, area, layout);

  const flowCalls = (input.flows ?? []).map(planFlowCall);
  const flowNames = flowCalls.map((call) => call.fn);
  const duplicateFlow = flowNames.find((fn, i) => flowNames.indexOf(fn) !== i);
  if (duplicateFlow !== undefined) throw invalid(`flow ${duplicateFlow} is listed twice`);

  const usedParams = testCase.parameters.filter((p) => deps.params.includes(p));
  const rows = testCase.dataRows;
  if (usedParams.length > 0 && rows.length === 0) {
    throw invalid(`test case ${testCase.id} uses ${usedParams.map((p) => `@${p}`).join(', ')} but has no data rows; add the data in ADO or raise a missing-data handoff`);
  }
  const multi = rows.length > 1;

  const reservedLocals = new Set([
    ...RESERVED_WORDS, 'page', 'test', 'expect', 'dataRow', 'dataRows', 'requireEnv', 'url', ...flowNames, ...screens.map(pageClassName),
  ]);
  const paramIds = assignIdentifiers(testCase.parameters, reservedLocals, 'Value');
  const poVars = assignIdentifiers(screens, new Set([...reservedLocals, ...paramIds.values()]), 'Page', 'Page');
  const names: Names = { po: (screen) => poVars.get(screen)!, param: (name) => paramIds.get(name)! };

  const setup = multi
    ? usedParams.length > 0
      ? [`const { ${usedParams.map((p) => names.param(p)).join(', ')} } = dataRow.values; // ADO parameters of this data row`]
      : []
    : usedParams.map((p) => `const ${names.param(p)} = ${quote(rows[0]?.[p] ?? '')}; // ADO parameter ${commentText(p)}, data row 1`);
  const declarations = screens.map((screen) => `const ${names.po(screen)} = new ${pageClassName(screen)}(page);`);
  const stepBlocks = plans.map((plan) => [
    `await test.step(${quote(plan.title)}, async () => {`,
    ...(plan.expected.length > 0 ? [`  // Expected: ${commentText(plan.expected)}`] : []),
    ...plan.statements.map((statement) => `  ${statement.render(names)}`),
    '});',
  ]);
  const usesPage = deps.page || screens.length > 0;
  const body = separated([[...setup, ...declarations], ...stepBlocks]);
  const testArgs = usesPage ? '{ page }' : '';

  const tags = specTags(testCase.tags, input.tags ?? [], testCase.priority);
  const annotations: readonly (readonly [string, string])[] = [
    ['ado-id', testCase.id],
    ['ado-revision', String(testCase.revision)],
    ['content-hash', testCase.contentHash],
    ['ado-steps', JSON.stringify(plans.map((plan) => plan.stepIdentifier))],
    ...(testCase.tags.length > 0 ? [['ado-tags', testCase.tags.join('; ')] as const] : []),
  ];
  const details = [
    ...(tags.length > 0 ? [`tag: [${tags.map(quote).join(', ')}],`] : []),
    'annotation: [',
    ...annotations.map(([type, description]) => `  { type: ${quote(type)}, description: ${quote(description)} },`),
    '],',
  ];
  const beforeEach = flowCalls.length === 0
    ? []
    : ['test.beforeEach(async ({ page }) => {', ...flowCalls.map((call) => `  await ${call.fn}(page, ${call.args});`), '});'];
  const title = `ADO ${testCase.id} — ${adoText(testCase.title)}`;

  const testBlock = multi
    ? [
        `test.describe(${quote(title)}, {`,
        ...indent(1, details),
        '}, () => {',
        ...indent(
          1,
          separated([
            [
              'const dataRows = [',
              ...rows.map((row, i) => {
                const values = testCase.parameters.map((p) => `${names.param(p)}: ${quote(row[p] ?? '')}`).join(', ');
                return `  { row: ${i + 1}, title: ${quote(rowTitles(testCase)[i]!)}, values: { ${values} } },`;
              }),
              '];',
            ],
            beforeEach,
            [
              'for (const dataRow of dataRows) {',
              `  test(dataRow.title, { annotation: { type: 'ado-data-row', description: String(dataRow.row) } }, async (${testArgs}) => {`,
              ...indent(2, body),
              '  });',
              '}',
            ],
          ]),
        ),
        '});',
      ]
    : [
        ...(beforeEach.length > 0 ? [...beforeEach, ''] : []),
        `test(${quote(title)}, {`,
        ...indent(1, details),
        `}, async (${testArgs}) => {`,
        ...indent(1, body),
        '});',
      ];

  const envImporter = flowCalls.findIndex((call) => call.needsEnv);
  const imports = [
    `import { test${deps.expect ? ', expect' : ''} } from '@playwright/test';`,
    ...screens.map((screen) => `import { ${pageClassName(screen)} } from ${quote(importSpecifier(filePath, pageObjectPath(screen, layout)))};`),
    ...flowCalls.map(
      (call, i) => `import { ${call.fn}${i === envImporter ? ', requireEnv' : ''} } from ${quote(importSpecifier(filePath, flowFilePath(call.name, layout)))};`,
    ),
  ];
  const lines = [
    `// Generated by Tesseract from ADO ${commentText(testCase.id)} rev ${testCase.revision} — edit intent in ADO or facets in .tesseract/catalog/;`,
    '// regions marked tesseract:keep survive regeneration.',
    HASH_PLACEHOLDER,
    ...imports,
    '',
    ...testBlock,
  ];

  return {
    path: filePath,
    text: stampHash(toFileText(lines)),
    adoId: testCase.id,
    facetsUsed: deps.facets,
    screens,
    stepFacets: plans.map((plan) => ({ index: plan.index, stepIdentifier: plan.stepIdentifier, title: plan.title, facets: plan.deps.facets })),
    flows: flowCalls.map((call) => call.name),
  };
};
