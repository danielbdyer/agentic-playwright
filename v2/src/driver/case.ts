/**
 * Authoring one test case, the way the playbook tells a host to: for each
 * step, memory first; on a miss, observe (scoped by the landmark the step
 * names) and let the decider pick a target or ask a human; act so the next
 * step sees real state; mint what was used with the author's words and the
 * verified locator; check the expected result with the step's proposed
 * assertions; and after a bounded number of attempts, raise a handoff.
 * Every call goes through the runtime, so each decision is receipted.
 *
 * A case is authored from scratch every time; nothing here resumes. A step
 * whose action could not be performed leaves the page in a state the test
 * would not reach, so the steps after it are blocked by the same handoff
 * (the emitted test stops at its test.fixme anyway).
 */
import { ToolError, type ErrorFamily } from '../core/errors.js';
import type {
  AssertionKind,
  AssertionSpec,
  Candidate,
  Decision as ReceiptDecision,
  HandoffBlockage,
  LocatorSpec,
  ResolvedStep,
  ScoredFacet,
  Snapshot,
  StepTarget,
  Target,
  TestCase,
  TestStep,
  Verb,
} from '../contract/schemas.js';
import type { ToolOutput } from '../contract/tools.js';
import { resolveUrl, type Profile } from '../workspace/profiles.js';
import {
  classifyStep,
  intentForAssertion,
  nameSimilarity,
  needsTarget,
  screenNameFromUrl,
  valuesUsedBy,
  type ProposedAssertion,
  type StepIntent,
} from '../resolve/index.js';
import { BudgetExhausted, type Caller, type Outcome } from './calls.js';
import {
  bindValue,
  facetDraft,
  paramName,
  parameterizeLocator,
  relativeRoute,
  routeFromSnapshot,
  rowLocator,
  screenSegment,
} from './naming.js';
import type {
  Budgets,
  CaseSummary,
  Decider,
  DeciderInput,
  Decision,
  HandoffCandidate,
  HandoffSummary,
  HostUsage,
  StepSummary,
} from './types.js';

// ─── Configuration ─────────────────────────────────────────────────────────

export interface CaseEnv {
  readonly call: Caller;
  readonly decider: Decider;
  readonly budgets: Budgets;
  readonly profile: Profile | null;
  readonly memoryThreshold: number;
  readonly minAssertionConfidence: number;
  readonly commentOnAdo?: boolean;
  readonly log: (message: string) => void;
  /** Close a page the case opened (the pool is not a tool). */
  readonly closePage: (pageId: string) => Promise<void>;
}

/** The authored case before emission: resolved steps plus what the summary reports. */
export interface AuthoredCase {
  readonly steps: readonly ResolvedStep[];
  readonly summaries: readonly StepSummary[];
  readonly handoffs: readonly HandoffSummary[];
  readonly minted: readonly string[];
  readonly tokens: { readonly prompt: number; readonly completion: number };
}

// ─── Per-case state ────────────────────────────────────────────────────────

interface State {
  pageId: string;
  url: string;
  tokens: { prompt: number; completion: number };
  readonly minted: Set<string>;
  readonly history: string[];
  priorValues: readonly string[];
  /** The facet the previous action resolved to (a press without a target goes there). */
  lastFacet: string | null;
}

interface Ctx {
  readonly env: CaseEnv;
  readonly testCase: TestCase;
  readonly params: Readonly<Record<string, string>>;
  readonly baseURL: string | undefined;
  readonly state: State;
}

type Via = NonNullable<StepSummary['via']>;

interface Resolved {
  readonly kind: 'resolved';
  readonly step: ResolvedStep;
  readonly facets: readonly string[];
  readonly via: Via;
  readonly attempts: number;
  readonly reason: string;
}

interface Unresolved {
  readonly kind: 'unresolved';
  readonly blockage: HandoffBlockage;
  readonly reason: string;
  readonly attempted: readonly string[];
  readonly candidates: readonly HandoffCandidate[];
  readonly snapshotId?: string;
  readonly proposedAssertion?: string;
  readonly attempts: number;
  /** The step's action was performed, so the page is where the test expects it. */
  readonly stateIntact: boolean;
  readonly host?: HostUsage;
  readonly verb?: Verb;
}

type StepResult = Resolved | Unresolved;

const ACTIONS: ReadonlySet<Verb> = new Set<Verb>(['click', 'fill', 'select', 'check', 'uncheck', 'press', 'hover']);
const ELEMENT_STATE_KINDS: ReadonlySet<AssertionKind> = new Set<AssertionKind>(['value', 'checked', 'unchecked', 'enabled', 'disabled']);
const NEEDS_EXPECTED: ReadonlySet<AssertionKind> = new Set<AssertionKind>(['text', 'contains-text', 'value', 'count']);
const TEXT_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);
const PROBE_TIMEOUT_MS = 1_000;
const CHECK_ROLES = new Set(['checkbox', 'switch', 'radio', 'menuitemcheckbox', 'menuitemradio']);
const SELECT_ROLES = new Set(['combobox', 'listbox']);

const short = (text: string, max = 160): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const failureText = (outcome: { readonly family: string; readonly message: string }): string => `${outcome.family}: ${short(outcome.message, 200)}`;

/** Facet roles a verb can act on; undefined role (an older facet) is allowed. */
const facetFits = (facet: ScoredFacet, verb: Verb, assertion?: AssertionKind): boolean => {
  if (facet.status === 'retired' || facet.kind === 'route') return false;
  const role = facet.role;
  if (role === undefined) return true;
  if (assertion === 'value') return TEXT_ROLES.has(role) || role === 'listbox';
  if (assertion === 'checked' || assertion === 'unchecked') return CHECK_ROLES.has(role);
  switch (verb) {
    case 'fill':
      return TEXT_ROLES.has(role);
    case 'check':
    case 'uncheck':
      return CHECK_ROLES.has(role);
    case 'select':
      return SELECT_ROLES.has(role);
    default:
      return true;
  }
};

const addTokens = (state: State, host: HostUsage | undefined): void => {
  state.tokens = {
    prompt: state.tokens.prompt + (host?.tokens?.prompt ?? 0),
    completion: state.tokens.completion + (host?.tokens?.completion ?? 0),
  };
};

const receiptDecision = (ctx: Ctx, step: TestStep, extra: Omit<ReceiptDecision, 'testCase' | 'step'> = {}): ReceiptDecision => ({
  testCase: ctx.testCase.id,
  step: step.index,
  ...extra,
});

const hostOf = (decision: Decision): HostUsage | undefined => decision.host;

/** Host usage is receipted once, on the call that acts on the decision; the mint that follows does not repeat it. */
const withoutHost = (meta: Omit<ReceiptDecision, 'testCase' | 'step'>): Omit<ReceiptDecision, 'testCase' | 'step' | 'host'> => {
  const { host: _host, ...rest } = meta;
  return rest;
};

const NEXT_MOVES: Readonly<Record<HandoffBlockage, readonly string[]>> = {
  'ambiguous-target': [
    'Name the row, section or landmark in the step wording (e.g. "Click Edit for policy @policyNumber")',
    'Or add the words the step uses as an alias to the intended facet (memory.enrich), then re-author',
  ],
  'text-mismatch': [
    'If the page is right, change the expected result in ADO to what the page shows (or accept the proposed assertion)',
    'If the page is wrong, file a bug against the application',
  ],
  'not-found': [
    'Check that the step happens on the screen the test reaches at this point',
    'Clarify the step wording in ADO, or record the path once with flow.record so memory knows the control',
  ],
  'missing-data': ['Add the value to the test case parameters and data rows in ADO'],
  auth: ['Refresh the profile storage state or the recorded login flow'],
  environment: ['Check that the environment in the profile is reachable and healthy, then re-author'],
  unsupported: ['Author this step by hand inside a tesseract:keep region, or split it into supported steps'],
  other: ['Re-author the case with a larger budget, or author this step interactively'],
};

// ─── Tool helpers ──────────────────────────────────────────────────────────

const screenOf = (ctx: Ctx, url: string = ctx.state.url): string => screenNameFromUrl(url, ctx.baseURL);

const observe = async (ctx: Ctx, step: TestStep, scope: string | null, intentText: string): Promise<Outcome<Snapshot>> => {
  const run = (s: string | null) =>
    ctx.env.call('app.observe', {
      pageId: ctx.state.pageId,
      intent: intentText,
      ...(s !== null ? { scope: s } : {}),
      decision: receiptDecision(ctx, step),
    });
  const scoped = scope !== null ? await run(scope) : null;
  const result = scoped !== null && scoped.ok && scoped.output.candidates.length > 0 ? scoped : await run(null);
  if (result.ok) ctx.state.url = result.output.url;
  return result;
};

const queryMemory = async (ctx: Ctx, step: TestStep, screen: string | null, phrase: string): Promise<ToolOutput<'memory.query'> | null> => {
  const result = await ctx.env.call('memory.query', {
    phrase,
    ...(screen !== null ? { screen } : {}),
    decision: receiptDecision(ctx, step),
  });
  return result.ok ? result.output : null;
};

type ActOutput = ToolOutput<'app.act'>;

const act = async (
  ctx: Ctx,
  step: TestStep,
  target: Target | undefined,
  verb: Verb,
  value: string | null,
  meta: Omit<ReceiptDecision, 'testCase' | 'step'>,
): Promise<{ readonly ok: true; readonly output: ActOutput } | { readonly ok: false; readonly family: string; readonly message: string }> => {
  const result = await ctx.env.call('app.act', {
    pageId: ctx.state.pageId,
    action: verb as Exclude<Verb, 'assert' | 'wait'>,
    ...(target !== undefined ? { target } : {}),
    ...(value !== null ? { value } : {}),
    ...(Object.keys(ctx.params).length > 0 ? { params: { ...ctx.params } } : {}),
    decision: receiptDecision(ctx, step, meta),
  });
  if (!result.ok) return { ok: false, family: result.family, message: result.message };
  if (result.output.postState !== undefined) ctx.state.url = result.output.postState.url;
  if (result.output.outcome === 'failed') {
    return { ok: false, family: result.output.errorFamily ?? 'unclassified', message: result.output.message ?? 'the action failed' };
  }
  return { ok: true, output: result.output };
};

const assertOn = async (
  ctx: Ctx,
  step: TestStep,
  kind: AssertionKind,
  target: Target | undefined,
  expected: string | number | null,
  meta: Omit<ReceiptDecision, 'testCase' | 'step'> = {},
  timeoutMs?: number,
): Promise<Outcome<ToolOutput<'app.assert'>>> =>
  ctx.env.call('app.assert', {
    pageId: ctx.state.pageId,
    assertion: kind,
    ...(target !== undefined ? { target } : {}),
    ...(expected !== null ? { expected: typeof expected === 'string' ? bindValue(expected, ctx.params) : expected } : {}),
    ...(Object.keys(ctx.params).length > 0 ? { params: { ...ctx.params } } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    decision: receiptDecision(ctx, step, meta),
  });

const open = async (ctx: Ctx, step: TestStep | null, url: string): Promise<Outcome<ToolOutput<'app.open'>>> => {
  let absolute: string;
  try {
    absolute = resolveUrl(url, ctx.env.profile);
  } catch (error) {
    return { ok: false, family: error instanceof ToolError ? error.family : 'invalid-input', message: error instanceof Error ? error.message : String(error) };
  }
  const result = await ctx.env.call('app.open', {
    pageId: ctx.state.pageId,
    url: absolute,
    ...(step !== null ? { decision: receiptDecision(ctx, step) } : {}),
  });
  if (result.ok) ctx.state.url = result.output.finalUrl;
  return result;
};

/** Mint a facet for a candidate the driver verified; null when memory refused (the step then carries the locator). */
const mint = async (
  ctx: Ctx,
  step: TestStep,
  snapshot: Snapshot,
  candidate: Candidate,
  intent: StepIntent,
  locator: LocatorSpec | undefined,
  parameter: string | null,
  meta: Omit<ReceiptDecision, 'testCase' | 'step'>,
  extraAliases: readonly string[] = [],
  name?: string,
): Promise<string | null> => {
  const screen = screenOf(ctx, snapshot.url);
  const draft = facetDraft({
    screen,
    intent,
    candidate,
    ...(locator !== undefined ? { locator } : {}),
    parameter,
    extraAliases,
    ...(name !== undefined ? { name } : {}),
  });
  const result = await ctx.env.call('memory.mint', {
    screen,
    facet: draft,
    evidence: { snapshotId: snapshot.snapshotId, ref: candidate.ref },
    route: routeFromSnapshot(snapshot, ctx.baseURL),
    decision: receiptDecision(ctx, step, withoutHost(meta)),
  });
  if (!result.ok) {
    ctx.env.log(`memory.mint ${screen}:${draft.name ?? '?'} failed (${result.family}): ${result.message}`);
    return null;
  }
  if (result.output.created) ctx.state.minted.add(result.output.facet.id);
  return result.output.facet.id;
};

/** Add the step's words to a facet memory already has for the element (memory.enrich); the facet id either way. */
const reuse = async (
  ctx: Ctx,
  step: TestStep,
  facetId: string,
  snapshot: Snapshot,
  candidate: Candidate,
  intent: StepIntent,
  meta: Omit<ReceiptDecision, 'testCase' | 'step'>,
): Promise<string> => {
  const aliases = facetDraft({ screen: screenOf(ctx, snapshot.url), intent, candidate }).aliases ?? [];
  if (aliases.length === 0) return facetId;
  const enriched = await ctx.env.call('memory.enrich', {
    facetId,
    aliases,
    evidence: { snapshotId: snapshot.snapshotId, ref: candidate.ref },
    decision: receiptDecision(ctx, step, { ...withoutHost(meta), reason: `${meta.reason ?? ''} (memory already knows this element as ${facetId})`.trim() }),
  });
  if (!enriched.ok) ctx.env.log(`memory.enrich ${facetId} failed (${enriched.family}): ${enriched.message}`);
  return facetId;
};

// ─── Deciding ──────────────────────────────────────────────────────────────

const decide = async (ctx: Ctx, input: Omit<DeciderInput, 'testCase' | 'params' | 'history'>): Promise<Decision> => {
  let decision: Decision;
  try {
    decision = await ctx.env.decider.decide({
      ...input,
      // A snapshot of the driver's working lists: the decider may keep its input.
      exclude: [...input.exclude],
      testCase: { id: ctx.testCase.id, title: ctx.testCase.title },
      params: ctx.params,
      history: [...ctx.state.history],
    });
  } catch (error) {
    if (error instanceof ToolError && error.family === 'not-configured') throw error;
    const message = error instanceof Error ? error.message : String(error);
    return { kind: 'handoff', blockage: 'other', reason: `the decider failed: ${short(message, 300)}`, candidates: [] };
  }
  addTokens(ctx.state, hostOf(decision));
  const budget = ctx.env.budgets.tokensPerCase;
  if (budget !== undefined && ctx.state.tokens.prompt + ctx.state.tokens.completion > budget) {
    throw new BudgetExhausted('tokens', `the case used ${ctx.state.tokens.prompt + ctx.state.tokens.completion} tokens, over its budget of ${budget}`);
  }
  return decision;
};

/** Decide on a scoped snapshot; when the scope hides the target, look at the whole page once. */
const observeAndDecide = async (
  ctx: Ctx,
  step: TestStep,
  scope: string | null,
  intentText: string,
  input: Omit<DeciderInput, 'testCase' | 'params' | 'history' | 'snapshot' | 'hints'>,
): Promise<{ readonly snapshot: Snapshot; readonly decision: Decision } | { readonly failure: { family: string; message: string } }> => {
  const first = await observe(ctx, step, scope, intentText);
  if (!first.ok) return { failure: first };
  const decision = await decide(ctx, { ...input, snapshot: first.output, hints: first.output.hints ?? [] });
  if (decision.kind === 'handoff' && decision.blockage === 'not-found' && first.output.scope !== 'page') {
    const wide = await observe(ctx, step, null, intentText);
    if (!wide.ok) return { snapshot: first.output, decision };
    return { snapshot: wide.output, decision: await decide(ctx, { ...input, snapshot: wide.output, hints: wide.output.hints ?? [] }) };
  }
  return { snapshot: first.output, decision };
};

// ─── Expected results ──────────────────────────────────────────────────────

interface Checked {
  readonly assertions: readonly AssertionSpec[];
  readonly facets: readonly string[];
  /** Every assertion's target came from memory (no observation needed). */
  readonly fromMemory: boolean;
  readonly failure?: Unresolved;
}

type Check =
  | { readonly kind: 'passed'; readonly spec: AssertionSpec; readonly facets: readonly string[]; readonly fromMemory?: boolean }
  | {
      readonly kind: 'failed';
      readonly blockage: HandoffBlockage;
      readonly reason: string;
      readonly attempted: readonly string[];
      readonly candidates: readonly HandoffCandidate[];
      readonly snapshotId?: string;
      readonly proposed?: string;
      readonly host?: HostUsage;
    }
  | { readonly kind: 'skipped'; readonly reason: string };

const describeExpected = (expected: string | number | null): string => (expected === null ? '(the page’s value)' : JSON.stringify(expected));

const proposeAssertion = (kind: AssertionKind, expression: string, observed: unknown): string => {
  const shown = typeof observed === 'string' ? `'${observed.replace(/'/g, "\\'")}'` : String(observed);
  switch (kind) {
    case 'text':
      return `await expect(${expression}).toHaveText(${shown});`;
    case 'contains-text':
      return `await expect(${expression}).toContainText(${shown});`;
    case 'value':
      return `await expect(${expression}).toHaveValue(${shown});`;
    case 'count':
      return `await expect(${expression}).toHaveCount(${shown});`;
    default:
      return `await expect(${expression}).toBeVisible();`;
  }
};

interface Acted {
  readonly facetId: string | null;
  readonly target: StepTarget;
}

/** Check one proposed assertion: page-level kinds directly; element kinds on a target found the same way an action's is. */
const checkProposal = async (ctx: Ctx, step: TestStep, intent: StepIntent, proposal: ProposedAssertion, acted: Acted | null): Promise<Check> => {
  const { env } = ctx;
  if (proposal.kind === 'url' || proposal.kind === 'title') {
    if (proposal.expected === null) return { kind: 'skipped', reason: `${proposal.kind} assertion without an expected value` };
    const result = await assertOn(ctx, step, proposal.kind, undefined, proposal.expected, { reason: `expected result: ${proposal.source}` });
    if (!result.ok) return { kind: 'failed', blockage: 'text-mismatch', reason: failureText(result), attempted: [`app.assert ${proposal.kind}: ${failureText(result)}`], candidates: [] };
    if (!result.output.passed) {
      return {
        kind: 'failed',
        blockage: 'text-mismatch',
        reason: `the ${proposal.kind} is ${JSON.stringify(result.output.observed)}, not ${describeExpected(proposal.expected)}`,
        attempted: [`app.assert ${proposal.kind} ${describeExpected(proposal.expected)} → observed ${JSON.stringify(result.output.observed)}`],
        candidates: [],
        proposed: proposal.kind === 'url' ? `await expect(page).toHaveURL(/${String(result.output.observed).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/);` : `await expect(page).toHaveTitle('${String(result.output.observed)}');`,
      };
    }
    const spec: AssertionSpec = proposal.kind === 'url'
      ? { kind: 'url', ...(relativeRoute(ctx.state.url, ctx.baseURL).length > 0 ? { expected: relativeRoute(ctx.state.url, ctx.baseURL) } : {}) }
      : { kind: 'title', expected: proposal.expected };
    return { kind: 'passed', spec, facets: [] };
  }

  const paraphrase = proposal.expected === null && NEEDS_EXPECTED.has(proposal.kind);
  // A sentinel no page shows, so a paraphrased expectation still reports what the page does show.
  const probeExpected: string | number | null = paraphrase ? (proposal.kind === 'count' ? -1 : '\u0000tesseract-probe') : proposal.expected;
  // A probe cannot pass, so it should not wait out the full auto-wait to say what the page shows.
  const probeTimeout = paraphrase ? PROBE_TIMEOUT_MS : undefined;
  const attempted: string[] = [];
  const tried: HandoffCandidate[] = [];
  let lastMismatch: Extract<Check, { kind: 'failed' }> | null = null;

  const outcome = (passedTarget: StepTarget, facets: readonly string[], kind: AssertionKind, expected: string | number | null, rowValue: string | null): Extract<Check, { kind: 'passed' }> => ({
    kind: 'passed',
    spec: {
      kind,
      target: passedTarget,
      ...(expected !== null && !paraphrase ? { expected } : {}),
      ...(rowValue !== null ? { rowValue } : {}),
    },
    facets,
  });

  const judge = (
    result: Outcome<ToolOutput<'app.assert'>>,
    label: string,
    candidate: HandoffCandidate,
    kind: AssertionKind,
    snapshotId?: string,
  ): 'passed' | 'failed' => {
    if (!result.ok) {
      attempted.push(`app.assert ${kind} on ${label}: ${failureText(result)}`);
      tried.push({ ...candidate, why: failureText(result) });
      return 'failed';
    }
    if (result.output.passed && !paraphrase) return 'passed';
    const observed = result.output.observed;
    attempted.push(`app.assert ${kind} ${describeExpected(proposal.expected)} on ${label} → observed ${JSON.stringify(observed)}`);
    tried.push({ ...candidate, why: `observed ${JSON.stringify(observed)}` });
    lastMismatch = {
      kind: 'failed',
      blockage: 'text-mismatch',
      reason: paraphrase
        ? `"${proposal.source}" does not say what to expect; ${label} shows ${JSON.stringify(observed)}${proposal.note !== null ? ` (${proposal.note})` : ''}`
        : `expected ${describeExpected(proposal.expected)} on ${label}, the page shows ${JSON.stringify(observed)}`,
      attempted: [],
      candidates: [],
      ...(snapshotId !== undefined ? { snapshotId } : {}),
      proposed: proposeAssertion(kind, result.output.resolved?.expression ?? label, observed),
    };
    return 'failed';
  };

  // 1. The element the step just acted on, for state kinds ("accepts a valid policy" after a fill).
  if (acted !== null && ELEMENT_STATE_KINDS.has(proposal.kind) && proposal.rowCue === null) {
    const target: Target | null = 'facetId' in acted.target ? { facetId: acted.target.facetId } : 'locator' in acted.target ? { locator: acted.target.locator } : null;
    if (target !== null) {
      const result = await assertOn(ctx, step, proposal.kind, target, probeExpected, { reason: `expected result on the element the step acted on: ${proposal.source}` }, probeTimeout);
      if (judge(result, acted.facetId ?? 'the acted element', { name: acted.facetId ?? 'the acted element' }, proposal.kind) === 'passed') {
        return outcome(acted.target, acted.facetId !== null ? [acted.facetId] : [], proposal.kind, proposal.expected, null);
      }
    }
  }

  // 2. Memory.
  // The author's words for the target (with its role word), else the whole clause ("search results show policy").
  const phrase = proposal.targetPhrase !== null ? [proposal.targetPhrase, proposal.roleHint].filter((p): p is string => p !== null).join(' ') : proposal.source;
  const memory = await queryMemory(ctx, step, screenOf(ctx), phrase);
  const top = memory?.facets.find((f) => facetFits(f, 'assert', proposal.kind));
  if (top !== undefined && top.score >= env.memoryThreshold) {
    const rowValue = top.parameter !== undefined ? (proposal.rowCue ?? `@${top.parameter}`) : null;
    const result = await assertOn(ctx, step, proposal.kind, { facetId: top.id }, probeExpected, {
      chose: top.id,
      reason: `memory: ${top.id} scores ${top.score.toFixed(2)} for "${phrase}"`,
    }, probeTimeout);
    if (judge(result, top.id, { name: top.displayName, ...(top.role !== undefined ? { role: top.role } : {}) }, proposal.kind) === 'passed') {
      return { ...outcome({ facetId: top.id }, [top.id], proposal.kind, proposal.expected, rowValue), fromMemory: true };
    }
  }

  // 3. Observe and decide, excluding targets that failed.
  const assertIntent = intentForAssertion(intent, proposal);
  const exclude: string[] = [];
  let snapshotId: string | undefined;
  for (let attempt = 1; attempt <= env.budgets.attemptsPerStep; attempt += 1) {
    const seen = await observeAndDecide(ctx, step, proposal.landmarkCue, proposal.source, {
      step,
      intent: assertIntent,
      purpose: 'assertion',
      assertion: proposal,
      facets: memory?.facets ?? [],
      exclude,
      attempt,
    });
    if ('failure' in seen) {
      attempted.push(`app.observe: ${failureText(seen.failure)}`);
      continue;
    }
    const { snapshot, decision } = seen;
    snapshotId = snapshot.snapshotId;
    if (decision.kind === 'handoff') {
      attempted.push(`decider: ${decision.reason}`);
      if (lastMismatch !== null) break;
      return {
        kind: 'failed',
        blockage: decision.blockage,
        reason: `no element fits the expected result "${proposal.source}": ${decision.reason}`,
        attempted,
        candidates: decision.candidates,
        snapshotId: snapshot.snapshotId,
        ...(decision.host !== undefined ? { host: decision.host } : {}),
      };
    }
    const kind = decision.assertion?.kind ?? proposal.kind;
    const expected = decision.assertion?.expected ?? proposal.expected;
    const probe = paraphrase ? probeExpected : expected;
    const meta = { ...(decision.ref !== undefined ? { chose: decision.ref } : decision.facetId !== undefined ? { chose: decision.facetId } : {}), ...(decision.rejected !== undefined ? { rejected: [...decision.rejected] } : {}), reason: decision.reason, ...(decision.host !== undefined ? { host: decision.host } : {}) };
    if (decision.facetId !== undefined) {
      const result = await assertOn(ctx, step, kind, { facetId: decision.facetId }, probe, meta, probeTimeout);
      if (judge(result, decision.facetId, { name: decision.facetId }, kind, snapshot.snapshotId) === 'passed') {
        return outcome({ facetId: decision.facetId }, [decision.facetId], kind, expected, null);
      }
      exclude.push(decision.facetId);
      continue;
    }
    const candidate = snapshot.candidates.find((c) => c.ref === decision.ref);
    if (candidate === undefined || decision.ref === undefined) {
      attempted.push(`decider chose ${decision.ref ?? '(nothing)'}, which is not in the snapshot`);
      continue;
    }
    const row = candidate.role === 'row' ? rowLocator(candidate, assertIntent.rowCue ?? proposal.rowCue, ctx.params) : null;
    const target: Target = row !== null ? { locator: row.locator } : { snapshotId: snapshot.snapshotId, ref: candidate.ref };
    const label = `${candidate.ref} (${candidate.role} "${short(candidate.name, 60)}")`;
    const result = await assertOn(ctx, step, kind, target, probe, meta, probeTimeout);
    if (judge(result, label, { ref: candidate.ref, role: candidate.role, name: candidate.name }, kind, snapshot.snapshotId) === 'passed' && result.ok) {
      const verified = row?.locator ?? result.output.resolved?.locator;
      const bound = verified !== undefined ? parameterizeLocator(verified, ctx.params, paramName(proposal.rowCue)) : null;
      const parameter = row?.parameter ?? bound?.parameter ?? null;
      const facetId = await mint(ctx, step, snapshot, candidate, assertIntent, bound?.locator, parameter, meta, proposal.source.split(/\s+/).length <= 6 ? [proposal.source] : []);
      const rowValue = parameter !== null ? `@${parameter}` : null;
      const stepTarget: StepTarget = facetId !== null
        ? { facetId }
        : bound !== null
          ? { locator: bound.locator, snapshotId: snapshot.snapshotId, candidateRef: candidate.ref }
          : { snapshotId: snapshot.snapshotId, candidateRef: candidate.ref };
      return outcome(stepTarget, facetId !== null ? [facetId] : [], kind, expected, rowValue);
    }
    exclude.push(candidate.ref);
  }
  const mismatch = lastMismatch as Extract<Check, { kind: 'failed' }> | null;
  if (mismatch !== null) {
    return { ...mismatch, attempted, candidates: tried, ...(mismatch.snapshotId === undefined && snapshotId !== undefined ? { snapshotId } : {}) };
  }
  return {
    kind: 'failed',
    blockage: 'not-found',
    reason: `could not check the expected result "${proposal.source}"`,
    attempted,
    candidates: tried,
    ...(snapshotId !== undefined ? { snapshotId } : {}),
  };
};

/**
 * Check the step's expected result. Proposals read from the same clause are
 * alternatives (a screen load shows as its heading or its URL): the first
 * that passes is kept. Every clause must be satisfied by one of its
 * proposals; a clause none satisfies becomes the step's handoff.
 */
const checkExpected = async (
  ctx: Ctx,
  step: TestStep,
  intent: StepIntent,
  acted: Acted | null,
  proposals: readonly ProposedAssertion[],
  stateIntact: boolean,
  attempts: number,
): Promise<Checked> => {
  const groups = proposals.reduce<Map<string, ProposedAssertion[]>>((acc, p) => {
    acc.set(p.source, [...(acc.get(p.source) ?? []), p]);
    return acc;
  }, new Map());
  const assertions: AssertionSpec[] = [];
  const facets: string[] = [];
  let fromMemory = true;
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => b.confidence - a.confidence);
    const failures: Extract<Check, { kind: 'failed' }>[] = [];
    let passed = false;
    for (const proposal of ordered) {
      const check = await checkProposal(ctx, step, intent, proposal, acted);
      if (check.kind === 'passed') {
        assertions.push(check.spec);
        facets.push(...check.facets);
        fromMemory = fromMemory && check.fromMemory === true;
        passed = true;
        break;
      }
      if (check.kind === 'failed') failures.push(check);
    }
    if (passed || failures.length === 0) continue;
    const worst = failures.find((f) => f.blockage === 'text-mismatch') ?? failures[0]!;
    return {
      assertions,
      facets,
      fromMemory: false,
      failure: {
        kind: 'unresolved',
        blockage: worst.blockage,
        reason: worst.reason,
        attempted: failures.flatMap((f) => f.attempted),
        candidates: worst.candidates,
        ...(worst.snapshotId !== undefined ? { snapshotId: worst.snapshotId } : {}),
        ...(worst.proposed !== undefined ? { proposedAssertion: worst.proposed } : {}),
        attempts,
        stateIntact,
        ...(worst.host !== undefined ? { host: worst.host } : {}),
      },
    };
  }
  return { assertions, facets, fromMemory: fromMemory && assertions.length > 0 };
};

const confident = (ctx: Ctx, proposals: readonly ProposedAssertion[]): readonly ProposedAssertion[] =>
  proposals.filter((p) => p.confidence >= ctx.env.minAssertionConfidence);

// ─── Steps ─────────────────────────────────────────────────────────────────

const baseStep = (step: TestStep, verb: Verb): Pick<ResolvedStep, 'index' | 'stepIdentifier' | 'actionText' | 'expectedText' | 'verb'> => ({
  index: step.index,
  stepIdentifier: step.stepIdentifier,
  actionText: step.action,
  expectedText: step.expected,
  verb,
});

const unresolved = (fields: Omit<Unresolved, 'kind'>): Unresolved => ({ kind: 'unresolved', ...fields });

const missingParam = (ctx: Ctx, intent: StepIntent): string | null => {
  const names = [paramName(intent.value), paramName(intent.rowCue)].filter((n): n is string => n !== null);
  return names.find((name) => ctx.params[name] === undefined) ?? null;
};

/** click / fill / select / check / uncheck / hover / press. */
const resolveAction = async (ctx: Ctx, step: TestStep, intent: StepIntent): Promise<StepResult> => {
  const { env } = ctx;
  const attempted: string[] = [];
  const exclude: string[] = [];
  const tried: HandoffCandidate[] = [];
  let lastFailure: { family: string; message: string } | null = null;
  let lastSnapshot: Snapshot | null = null;
  let attempts = 0;

  // A key press with no target goes to whatever has focus (where the previous step left it).
  if (intent.verb === 'press' && !needsTarget(intent)) {
    if (intent.key === null) return unresolved({ blockage: 'unsupported', reason: 'the step names no key to press', attempted, candidates: [], attempts, stateIntact: false });
    attempts += 1;
    const pressed = await act(ctx, step, undefined, 'press', intent.key, { reason: `press ${intent.key} where the previous step left focus${ctx.state.lastFacet !== null ? ` (${ctx.state.lastFacet})` : ''}` });
    if (!pressed.ok) return unresolved({ blockage: 'not-found', reason: failureText(pressed), attempted: [`app.act press ${intent.key}: ${failureText(pressed)}`], candidates: [], attempts, stateIntact: false });
    const checked = await checkExpected(ctx, step, intent, null, confident(ctx, intent.assertions), true, attempts);
    if (checked.failure !== undefined) return checked.failure;
    return { kind: 'resolved', step: { ...baseStep(step, 'press'), key: intent.key, ...(checked.assertions.length > 0 ? { assertions: [...checked.assertions] } : {}) }, facets: checked.facets, via: 'none', attempts, reason: `pressed ${intent.key}` };
  }

  const value = intent.verb === 'press' ? intent.key : intent.value;
  if ((intent.verb === 'fill' || intent.verb === 'select') && value === null) {
    return unresolved({ blockage: 'missing-data', reason: `the step does not say what to ${intent.verb === 'fill' ? 'enter' : 'select'}`, attempted, candidates: [], attempts, stateIntact: false });
  }

  const finish = async (
    target: StepTarget,
    facetId: string | null,
    verb: Verb,
    via: Via,
    reason: string,
    rowValue: string | null,
    performed: string | null = value,
  ): Promise<StepResult> => {
    ctx.state.lastFacet = facetId;
    const acted: Acted = { facetId, target };
    const checked = await checkExpected(ctx, step, intent, acted, confident(ctx, intent.assertions), true, attempts);
    if (checked.failure !== undefined) return checked.failure;
    const resolved: ResolvedStep = {
      ...baseStep(step, verb),
      target,
      ...(verb === 'press' && performed !== null
        ? { key: performed }
        : performed !== null && verb !== 'click' && verb !== 'hover' && verb !== 'check' && verb !== 'uncheck'
          ? { value: performed }
          : {}),
      ...(rowValue !== null ? { rowValue } : {}),
      ...(checked.assertions.length > 0 ? { assertions: [...checked.assertions] } : {}),
    };
    return { kind: 'resolved', step: resolved, facets: [...(facetId !== null ? [facetId] : []), ...checked.facets], via, attempts, reason };
  };

  // 1. Memory, asked in the author's words for the target ("search field"), not the whole step: a literal value would dilute the match.
  const screen = screenOf(ctx);
  const memory = await queryMemory(ctx, step, screen, intent.targetMention ?? intent.targetPhrase ?? intent.actionText);
  const top = memory?.facets.find((f) => facetFits(f, intent.verb));
  if (top !== undefined && top.score >= env.memoryThreshold) {
    attempts += 1;
    const reason = `memory: ${top.id} ("${top.displayName}", ${top.status}) scores ${top.score.toFixed(2)}`;
    const done = await act(ctx, step, { facetId: top.id }, intent.verb, value, { chose: top.id, reason });
    if (done.ok) {
      const rowValue = top.parameter !== undefined ? (intent.rowCue ?? `@${top.parameter}`) : null;
      return finish({ facetId: top.id }, top.id, intent.verb, 'memory', reason, rowValue);
    }
    attempted.push(`memory ${top.id} → app.act ${intent.verb}: ${failureText(done)}`);
    tried.push({ name: top.displayName, ...(top.role !== undefined ? { role: top.role } : {}), why: failureText(done) });
    lastFailure = done;
  }

  // 2. Observe, decide, try.
  while (attempts < env.budgets.attemptsPerStep) {
    attempts += 1;
    const seen = await observeAndDecide(ctx, step, intent.landmarkCue, intent.actionText, {
      step,
      intent,
      purpose: 'action',
      facets: memory?.facets ?? [],
      exclude,
      attempt: attempts,
    });
    if ('failure' in seen) {
      attempted.push(`app.observe: ${failureText(seen.failure)}`);
      lastFailure = seen.failure;
      continue;
    }
    const { snapshot, decision } = seen;
    lastSnapshot = snapshot;
    if (decision.kind === 'handoff') {
      return unresolved({
        blockage: decision.blockage,
        reason: decision.reason,
        attempted: [...attempted, `decider (${env.decider.name}): ${decision.reason}`],
        candidates: decision.candidates.length > 0 ? decision.candidates : tried,
        snapshotId: snapshot.snapshotId,
        attempts,
        stateIntact: false,
        ...(decision.host !== undefined ? { host: decision.host } : {}),
        verb: intent.verb,
      });
    }
    const verb = ACTIONS.has(decision.verb) ? decision.verb : intent.verb;
    const actValue = decision.value ?? value;
    const meta = {
      chose: decision.ref ?? decision.facetId ?? '',
      ...(decision.rejected !== undefined ? { rejected: [...decision.rejected] } : {}),
      reason: decision.reason,
      ...(decision.host !== undefined ? { host: decision.host } : {}),
    };
    if (decision.facetId !== undefined) {
      const done = await act(ctx, step, { facetId: decision.facetId }, verb, actValue, meta);
      if (done.ok) return finish({ facetId: decision.facetId }, decision.facetId, verb, 'memory', decision.reason, null, actValue);
      attempted.push(`${decision.facetId} → app.act ${verb}: ${failureText(done)}`);
      exclude.push(decision.facetId);
      lastFailure = done;
      continue;
    }
    const candidate = snapshot.candidates.find((c) => c.ref === decision.ref);
    if (candidate === undefined || decision.ref === undefined) {
      attempted.push(`decider chose ${decision.ref ?? '(nothing)'}, which is not in the snapshot`);
      continue;
    }
    const done = await act(ctx, step, { snapshotId: snapshot.snapshotId, ref: candidate.ref }, verb, actValue, meta);
    const label = `${candidate.ref} (${candidate.role} "${short(candidate.name, 60)}")`;
    if (!done.ok) {
      attempted.push(`${label} → app.act ${verb}: ${failureText(done)}`);
      tried.push({ ref: candidate.ref, role: candidate.role, name: candidate.name, why: failureText(done) });
      exclude.push(candidate.ref);
      lastFailure = done;
      continue;
    }
    const verified = done.output.resolved?.locator;
    const bound = verified !== undefined ? parameterizeLocator(verified, ctx.params, paramName(intent.rowCue)) : null;
    // A facet that already owns this locator gets the step's words as aliases instead of a twin.
    const facetId = done.output.facetId !== undefined
      ? await reuse(ctx, step, done.output.facetId, snapshot, candidate, intent, meta)
      : await mint(ctx, step, snapshot, candidate, intent, bound?.locator, bound?.parameter ?? null, meta);
    const target: StepTarget = facetId !== null
      ? { facetId }
      : bound !== null
        ? { locator: bound.locator, snapshotId: snapshot.snapshotId, candidateRef: candidate.ref }
        : { snapshotId: snapshot.snapshotId, candidateRef: candidate.ref };
    const rowValue = bound?.parameter != null ? `@${bound.parameter}` : null;
    return finish(target, facetId, verb, 'observe', decision.reason, rowValue, actValue);
  }

  const blockage: HandoffBlockage = lastFailure === null
    ? 'other'
    : lastFailure.family === 'ambiguous'
      ? 'ambiguous-target'
      : lastFailure.family === 'timeout' || lastFailure.family === 'unavailable'
        ? 'environment'
        : 'not-found';
  return unresolved({
    blockage,
    reason: `no target worked after ${attempts} attempt${attempts === 1 ? '' : 's'}${lastFailure !== null ? ` (last: ${failureText(lastFailure)})` : ''}`,
    attempted,
    candidates: tried,
    ...(lastSnapshot !== null ? { snapshotId: lastSnapshot.snapshotId } : {}),
    attempts,
    stateIntact: false,
    verb: intent.verb,
  });
};

/** Does the page look like the screen the step names (title or a heading)? */
const looksLike = (snapshot: Snapshot, phrase: string): boolean =>
  nameSimilarity(phrase, snapshot.title) >= 0.6 ||
  snapshot.candidates.some((c) => c.role === 'heading' && nameSimilarity(phrase, c.name) >= 0.6);

/** The heading that names a screen, preferring level 1. */
const screenHeading = (snapshot: Snapshot): Candidate | undefined =>
  [...snapshot.candidates]
    .filter((c) => c.role === 'heading' && c.visible && c.name.trim().length > 0)
    .sort((a, b) => (a.level ?? 9) - (b.level ?? 9))[0];

/**
 * Make sure memory knows the screen's route (emission's goto() needs one):
 * memory.mint carries it, so mint the screen's heading — checked visible
 * first — when nothing on the screen has been minted yet.
 */
const ensureRoute = async (ctx: Ctx, step: TestStep, screen: string, intent: StepIntent): Promise<{ readonly facetId: string | null; readonly assertion: AssertionSpec | null }> => {
  const known = await queryMemory(ctx, step, screen, intent.targetMention ?? intent.actionText);
  const heading = known?.facets.find((f) => f.role === 'heading');
  if (known?.route !== undefined && known.route.url === relativeRoute(ctx.state.url, ctx.baseURL)) {
    return { facetId: heading?.id ?? null, assertion: null };
  }
  const seen = await observe(ctx, step, 'main', intent.actionText);
  if (!seen.ok) return { facetId: null, assertion: null };
  const candidate = screenHeading(seen.output);
  if (candidate === undefined) return { facetId: null, assertion: null };
  const checked = await assertOn(ctx, step, 'visible', { snapshotId: seen.output.snapshotId, ref: candidate.ref }, null, {
    chose: candidate.ref,
    reason: `the ${candidate.name} heading names the screen; it carries the screen's route`,
  });
  if (!checked.ok || !checked.output.passed) return { facetId: null, assertion: null };
  const headingIntent: StepIntent = { ...intent, verb: 'assert', targetPhrase: candidate.name, targetMention: `${candidate.name} heading`, roleHint: 'heading', value: null, rowCue: null };
  const facetId = await mint(
    ctx,
    step,
    seen.output,
    candidate,
    headingIntent,
    checked.output.resolved?.locator,
    null,
    { chose: candidate.ref, reason: 'screen heading: records the route for goto()' },
    [intent.targetMention ?? '', `${candidate.name} screen`],
    candidate.level === 1 ? 'heading' : undefined,
  );
  return { facetId, assertion: facetId !== null ? { kind: 'visible', target: { facetId } } : null };
};

const resolveNavigate = async (ctx: Ctx, step: TestStep, intent: StepIntent): Promise<StepResult> => {
  const { env } = ctx;
  const phrase = intent.targetPhrase ?? intent.targetMention;
  const attempted: string[] = [];
  let attempts = 0;
  let via: Via = 'none';
  let reason = '';
  let host: HostUsage | undefined;
  let lastSnapshot: Snapshot | null = null;
  let candidates: readonly HandoffCandidate[] = [];

  // An explicit URL or path in the step.
  const literal = intent.value !== null && /^(?:[a-z][a-z0-9+.-]*:\/\/|\/)/i.test(intent.value) ? intent.value : null;
  if (literal !== null) {
    attempts += 1;
    const opened = await open(ctx, step, literal);
    if (!opened.ok) return unresolved({ blockage: 'environment', reason: failureText(opened), attempted: [`app.open ${literal}: ${failureText(opened)}`], candidates: [], attempts, stateIntact: false });
    const checked = await checkExpected(ctx, step, intent, null, confident(ctx, intent.assertions), true, attempts);
    if (checked.failure !== undefined) return checked.failure;
    return { kind: 'resolved', step: { ...baseStep(step, 'navigate'), value: literal, ...(checked.assertions.length > 0 ? { assertions: [...checked.assertions] } : {}) }, facets: checked.facets, via: 'url', attempts, reason: `opened ${literal}` };
  }

  const wanted = phrase !== null ? screenNameFromUrl(`http://screen.invalid/${screenSegment(phrase)}`) : null;
  let reached: string | null = null;

  // 1. A route memory already knows.
  if (wanted !== null && wanted !== 'home') {
    const known = await queryMemory(ctx, step, wanted, intent.actionText);
    if (known?.route !== undefined) {
      attempts += 1;
      const opened = await open(ctx, step, known.route.url);
      if (opened.ok && screenOf(ctx) === wanted) {
        reached = wanted;
        via = 'route';
        reason = `memory knows the ${wanted} route (${known.route.url})`;
      } else {
        attempted.push(`memory route ${known.route.url}: ${opened.ok ? `landed on ${screenOf(ctx)}` : failureText(opened)}`);
      }
    }
  }

  // 2. Already there.
  if (reached === null && wanted !== null && screenOf(ctx) === wanted) {
    reached = wanted;
    reason = `the page is already on ${wanted}`;
  }

  // 3. A link or menu entry on the page.
  const exclude: string[] = [];
  while (reached === null && attempts < env.budgets.attemptsPerStep) {
    attempts += 1;
    const seen = await observeAndDecide(ctx, step, intent.landmarkCue ?? 'navigation', intent.actionText, {
      step,
      intent: { ...intent, verb: 'click' },
      purpose: 'navigation',
      facets: [],
      exclude,
      attempt: attempts,
    });
    if ('failure' in seen) {
      attempted.push(`app.observe: ${failureText(seen.failure)}`);
      continue;
    }
    lastSnapshot = seen.snapshot;
    if (seen.decision.kind === 'handoff') {
      host = seen.decision.host;
      attempted.push(`decider (${env.decider.name}): ${seen.decision.reason}`);
      candidates = seen.decision.candidates;
      break;
    }
    const decision = seen.decision;
    const target: Target | null = decision.facetId !== undefined
      ? { facetId: decision.facetId }
      : decision.ref !== undefined
        ? { snapshotId: seen.snapshot.snapshotId, ref: decision.ref }
        : null;
    if (target === null) break;
    const before = ctx.state.url;
    const done = await act(ctx, step, target, 'click', null, {
      chose: decision.ref ?? decision.facetId ?? '',
      ...(decision.rejected !== undefined ? { rejected: [...decision.rejected] } : {}),
      reason: decision.reason,
      ...(decision.host !== undefined ? { host: decision.host } : {}),
    });
    if (!done.ok) {
      attempted.push(`app.act click ${decision.ref ?? decision.facetId}: ${failureText(done)}`);
      exclude.push(decision.ref ?? decision.facetId ?? '');
      continue;
    }
    const after = await observe(ctx, step, null, intent.actionText);
    const landed = screenOf(ctx);
    if (after.ok && (wanted === null || landed === wanted || looksLike(after.output, phrase ?? '')) && ctx.state.url !== before) {
      reached = landed;
      via = 'observe';
      reason = decision.reason;
    } else {
      attempted.push(`clicked ${decision.ref ?? decision.facetId} and landed on ${landed}`);
      exclude.push(decision.ref ?? decision.facetId ?? '');
    }
  }

  // 4. The OutSystems screen URL the step's words name, verified by what the page shows.
  if (reached === null && phrase !== null && wanted !== null && wanted !== 'home') {
    const segment = screenSegment(phrase);
    attempts += 1;
    const opened = await open(ctx, step, segment);
    if (opened.ok && screenOf(ctx) === wanted) {
      const seen = await observe(ctx, step, null, intent.actionText);
      if (seen.ok && looksLike(seen.output, phrase)) {
        reached = wanted;
        via = 'url';
        reason = `no link names "${phrase}" here; ${segment} (the screen's OutSystems URL) shows it`;
      } else {
        attempted.push(`app.open ${segment}: the page does not look like "${phrase}"`);
      }
    } else {
      attempted.push(`app.open ${segment}: ${opened.ok ? `landed on ${screenOf(ctx)}` : failureText(opened)}`);
    }
  }

  if (reached === null) {
    return unresolved({
      blockage: 'not-found',
      reason: `could not reach ${phrase !== null ? `"${phrase}"` : 'the screen'} from ${screenOf(ctx)}`,
      attempted,
      candidates,
      ...(lastSnapshot !== null ? { snapshotId: lastSnapshot.snapshotId } : {}),
      attempts,
      stateIntact: false,
      ...(host !== undefined ? { host } : {}),
      verb: 'navigate',
    });
  }

  const checked = await checkExpected(ctx, step, intent, null, confident(ctx, intent.assertions), true, attempts);
  if (checked.failure !== undefined) return checked.failure;
  const route = await ensureRoute(ctx, step, reached, intent);
  const known = await queryMemory(ctx, step, reached, intent.actionText);
  if (known?.route === undefined) {
    return unresolved({
      blockage: 'unsupported',
      reason: `reached ${reached}, but the screen has no heading to record its route by`,
      attempted,
      candidates: [],
      attempts,
      stateIntact: true,
      verb: 'navigate',
    });
  }
  const assertions = checked.assertions.length > 0 ? checked.assertions : route.assertion !== null ? [route.assertion] : [];
  const facets = [...checked.facets, ...(checked.assertions.length === 0 && route.facetId !== null ? [route.facetId] : [])];
  return {
    kind: 'resolved',
    step: { ...baseStep(step, 'navigate'), screen: reached, ...(assertions.length > 0 ? { assertions: [...assertions] } : {}) },
    facets,
    via,
    attempts,
    reason,
  };
};

/** "Verify …" steps: the proposals are the step. */
const resolveAssert = async (ctx: Ctx, step: TestStep, intent: StepIntent): Promise<StepResult> => {
  const strong = confident(ctx, intent.assertions);
  const proposals = strong.length > 0 ? strong : intent.assertions;
  if (proposals.length === 0) {
    return unresolved({
      blockage: 'unsupported',
      reason: 'no checkable expectation could be read from the step; say what the page should show',
      attempted: [],
      candidates: [],
      attempts: 0,
      stateIntact: true,
      verb: 'assert',
    });
  }
  const checked = await checkExpected(ctx, step, intent, null, proposals, true, 1);
  if (checked.failure !== undefined) return checked.failure;
  return {
    kind: 'resolved',
    step: { ...baseStep(step, 'assert'), assertions: [...checked.assertions] },
    facets: checked.facets,
    via: checked.fromMemory ? 'memory' : 'observe',
    attempts: 1,
    reason: `checked ${checked.assertions.length} assertion${checked.assertions.length === 1 ? '' : 's'}`,
  };
};

/** "Wait for …": with a target, wait until it is visible; otherwise a load state or milliseconds. */
const resolveWait = async (ctx: Ctx, step: TestStep, intent: StepIntent): Promise<StepResult> => {
  if (!needsTarget(intent)) {
    const value = intent.value !== null && /^\d+$/.test(intent.value) ? intent.value : 'load';
    return { kind: 'resolved', step: { ...baseStep(step, 'wait'), value }, facets: [], via: 'none', attempts: 0, reason: `wait for ${value}` };
  }
  const proposal: ProposedAssertion = {
    kind: 'visible',
    expected: null,
    targetPhrase: intent.targetPhrase,
    roleHint: intent.roleHint,
    landmarkCue: intent.landmarkCue,
    rowCue: intent.rowCue,
    confidence: 1,
    note: null,
    source: intent.actionText,
  };
  const checked = await checkExpected(ctx, step, intent, null, [proposal], true, 1);
  if (checked.failure !== undefined) return { ...checked.failure, stateIntact: false };
  const target = checked.assertions[0]?.target;
  const rest = await checkExpected(ctx, step, intent, null, confident(ctx, intent.assertions), true, 1);
  if (rest.failure !== undefined) return rest.failure;
  return {
    kind: 'resolved',
    step: { ...baseStep(step, 'wait'), ...(target !== undefined ? { target } : {}), ...(rest.assertions.length > 0 ? { assertions: [...rest.assertions] } : {}) },
    facets: [...checked.facets, ...rest.facets],
    via: 'observe',
    attempts: 1,
    reason: 'waited for the target to be visible',
  };
};

const resolveStep = async (ctx: Ctx, step: TestStep, intent: StepIntent): Promise<StepResult> => {
  const missing = missingParam(ctx, intent);
  if (missing !== null) {
    return unresolved({
      blockage: 'missing-data',
      reason: `the step uses @${missing}, but the test case has no data row with a value for it`,
      attempted: [],
      candidates: [],
      attempts: 0,
      stateIntact: false,
      verb: intent.verb,
    });
  }
  switch (intent.verb) {
    case 'navigate':
      return resolveNavigate(ctx, step, intent);
    case 'assert':
      return resolveAssert(ctx, step, intent);
    case 'wait':
      return resolveWait(ctx, step, intent);
    default:
      return resolveAction(ctx, step, intent);
  }
};

// ─── Handoffs ──────────────────────────────────────────────────────────────

const raiseHandoff = async (ctx: Ctx, step: TestStep, result: Unresolved, intentText: string): Promise<string> => {
  const { env } = ctx;
  const input = {
    testCaseId: ctx.testCase.id,
    stepIndex: step.index,
    stepIdentifier: step.stepIdentifier,
    blockage: result.blockage,
    unresolvedIntent: short(`${intentText} — ${result.reason}`, 500),
    attempted: result.attempted.length > 0 ? result.attempted.map((a) => short(a, 300)) : ['(nothing could be tried)'],
    evidence: { pageId: ctx.state.pageId, ...(result.snapshotId !== undefined ? { snapshotId: result.snapshotId } : {}) },
    candidates: result.candidates.slice(0, 10).map((c) => ({
      name: c.name,
      ...(c.ref !== undefined ? { ref: c.ref } : {}),
      ...(c.role !== undefined ? { role: c.role } : {}),
      ...(c.why !== undefined ? { why: short(c.why, 200) } : {}),
    })),
    nextMoves: [...NEXT_MOVES[result.blockage]],
    ...(result.proposedAssertion !== undefined ? { proposedAssertion: result.proposedAssertion } : {}),
    ...(env.commentOnAdo !== undefined ? { commentOnAdo: env.commentOnAdo } : {}),
    decision: receiptDecision(ctx, step, { reason: short(result.reason, 400), ...(result.host !== undefined ? { host: result.host } : {}) }),
  };
  const raised = await env.call('handoff.raise', input);
  if (raised.ok) return raised.output.handoffId;
  // Azure DevOps may be what failed; the handoff file and the fixme matter more than the comment.
  env.log(`handoff.raise for step ${step.index} failed (${raised.family}): ${raised.message}; retrying without the ADO comment`);
  const again = await env.call('handoff.raise', { ...input, commentOnAdo: false });
  if (again.ok) return again.output.handoffId;
  throw new ToolError(again.family as ErrorFamily, `could not raise a handoff for step ${step.index}: ${again.message}`);
};

// ─── The case ──────────────────────────────────────────────────────────────

const historyLine = (step: TestStep, summary: StepSummary): string =>
  `Step ${step.index} "${short(step.action, 80)}": ${summary.status === 'resolved' ? `resolved via ${summary.via ?? 'none'}${summary.facets.length > 0 ? ` (${summary.facets.join(', ')})` : ''}` : `handoff ${summary.blockage ?? ''}: ${short(summary.reason, 100)}`}`;

/** Author the steps of one case on an open page. Throws only for a broken environment (no page, no handoff possible). */
export const authorSteps = async (env: CaseEnv, testCase: TestCase, pageId: string, url: string): Promise<AuthoredCase> => {
  const params = testCase.dataRows[0] ?? {};
  const state: State = {
    pageId,
    url,
    tokens: { prompt: 0, completion: 0 },
    minted: new Set(),
    history: [],
    priorValues: [],
    lastFacet: null,
  };
  const ctx: Ctx = { env, testCase, params, baseURL: env.profile?.baseURL, state };
  const steps: ResolvedStep[] = [];
  const summaries: StepSummary[] = [];
  const handoffs: HandoffSummary[] = [];
  let blockedBy: HandoffSummary | null = null;

  for (const step of testCase.steps) {
    const intent = classifyStep(step.action, step.expected, testCase.parameters, { priorValues: state.priorValues, dataRow: params });
    state.priorValues = [...state.priorValues, ...valuesUsedBy(intent)];
    if (blockedBy !== null) {
      const reason = `blocked: step ${blockedBy.stepIndex} could not be performed, so the page is not where this step starts`;
      steps.push({ ...baseStep(step, intent.verb), handoffId: blockedBy.handoffId });
      const summary: StepSummary = { index: step.index, stepIdentifier: step.stepIdentifier, action: step.action, status: 'handoff', verb: intent.verb, facets: [], assertions: 0, attempts: 0, handoffId: blockedBy.handoffId, blockage: blockedBy.blockage, reason };
      summaries.push(summary);
      state.history.push(historyLine(step, summary));
      continue;
    }

    let result: StepResult;
    try {
      result = await resolveStep(ctx, step, intent);
    } catch (error) {
      if (!(error instanceof BudgetExhausted)) throw error;
      result = unresolved({ blockage: 'other', reason: `${error.budget} budget exhausted: ${error.message}`, attempted: [error.message], candidates: [], attempts: 0, stateIntact: false, verb: intent.verb });
    }

    if (result.kind === 'resolved') {
      steps.push(result.step);
      const summary: StepSummary = {
        index: step.index,
        stepIdentifier: step.stepIdentifier,
        action: step.action,
        status: 'resolved',
        verb: result.step.verb,
        facets: [...new Set(result.facets)],
        assertions: result.step.assertions?.length ?? 0,
        via: result.via,
        attempts: result.attempts,
        reason: result.reason,
      };
      summaries.push(summary);
      state.history.push(historyLine(step, summary));
      env.log(`  step ${step.index} resolved via ${result.via}: ${short(result.reason, 140)}`);
      continue;
    }

    const handoffId = await raiseHandoff(ctx, step, result, step.action);
    const handoff: HandoffSummary = { handoffId, stepIndex: step.index, blockage: result.blockage, reason: result.reason };
    handoffs.push(handoff);
    steps.push({ ...baseStep(step, result.verb ?? intent.verb), handoffId });
    const summary: StepSummary = {
      index: step.index,
      stepIdentifier: step.stepIdentifier,
      action: step.action,
      status: 'handoff',
      verb: result.verb ?? intent.verb,
      facets: [],
      assertions: 0,
      attempts: result.attempts,
      handoffId,
      blockage: result.blockage,
      reason: result.reason,
    };
    summaries.push(summary);
    state.history.push(historyLine(step, summary));
    env.log(`  step ${step.index} handed off (${result.blockage}): ${short(result.reason, 140)}`);
    if (!result.stateIntact) blockedBy = handoff;
  }
  return { steps, summaries, handoffs, minted: [...state.minted], tokens: state.tokens };
};

export type { CaseSummary };
