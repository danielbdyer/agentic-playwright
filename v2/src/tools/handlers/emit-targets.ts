/**
 * test.emit's preparation: everything between the agent's resolved steps
 * and the emission library, which only takes facet references.
 *
 * - The case's steps are checked against the resolved steps before anything
 *   is written (a stale case is a conflict, a missing step invalid-input).
 * - Targets that are snapshot candidates or raw locators become candidate
 *   facets, named from the step's own words (classifyStep + facetIdFor) and
 *   minted with instrument 'test.emit'. A locator another facet already
 *   owns is that facet; a name another element already holds gets a
 *   numeric suffix. On a dry run the mints are planned in memory only.
 * - Catalogs are loaded for every screen the steps and flows touch.
 */
import { ToolError, isToolError } from '../../core/errors.js';
import { normalizeText, phraseSimilarity, stripHtml } from '../../core/text.js';
import type {
  AssertionSpec,
  Candidate,
  Facet,
  FacetKind,
  LocatorSpec,
  ResolvedStep,
  StepTarget,
  TestCase,
} from '../../contract/schemas.js';
import { locatorParams } from '../../locator/locator.js';
import {
  evidencePointer,
  eventFactory,
  loadScreen,
  mintFacet,
  parseFacetId,
  planMint,
  type MintInput,
  type ScreenCatalog as MemoryCatalog,
} from '../../memory/index.js';
import { loadSnapshot } from '../../observe/index.js';
import { classifyStep, facetIdFor, intentForAssertion, screenNameFromUrl, valuesUsedBy, type StepIntent } from '../../resolve/index.js';
import type { EmitRoute, FlowRecording, ScreenCatalog as EmitCatalog } from '../../emit/index.js';
import type { Workspace } from '../../workspace/workspace.js';

/** ADO step text as the emitter reads it: HTML stripped when present. */
export const adoText = (text: string): string => (/<[a-z/!][^>]*>|&[a-z#0-9]+;/i.test(text) ? stripHtml(text) : text).trim();

const sameText = (a: string, b: string): boolean => normalizeText(adoText(a)) === normalizeText(adoText(b));

/**
 * The resolved steps must be the case's steps, one each: an index the case
 * does not have or a step left out is invalid-input; a stepIdentifier or
 * action text that differs from the case is a conflict (the case changed
 * since the agent read it).
 */
export const validateSteps = (testCase: TestCase, steps: readonly ResolvedStep[]): void => {
  const seen = new Set<number>();
  for (const step of steps) {
    if (seen.has(step.index)) throw new ToolError('invalid-input', `step ${step.index} is resolved more than once`);
    seen.add(step.index);
    const ado = testCase.steps.find((s) => s.index === step.index);
    if (ado === undefined) throw new ToolError('invalid-input', `test case ${testCase.id} has no step ${step.index}`, { step: step.index });
    if (ado.stepIdentifier !== step.stepIdentifier) {
      throw new ToolError('conflict', `step ${step.index}: stepIdentifier ${step.stepIdentifier} does not match ADO ${ado.stepIdentifier} (rev ${testCase.revision}); fetch the case again`, {
        step: step.index,
      });
    }
    if (!sameText(step.actionText, ado.action)) {
      throw new ToolError('conflict', `step ${step.index}: the action text does not match ADO rev ${testCase.revision}; fetch the case again`, {
        step: step.index,
        resolved: step.actionText,
        ado: adoText(ado.action),
      });
    }
  }
  const missing = testCase.steps.filter((s) => !seen.has(s.index));
  if (missing.length > 0) {
    throw new ToolError(
      'invalid-input',
      `step${missing.length === 1 ? '' : 's'} ${missing.map((s) => s.index).join(', ')} of test case ${testCase.id} ${missing.length === 1 ? 'is' : 'are'} not resolved; resolve each step or raise a handoff and pass its handoffId`,
      { steps: missing.map((s) => s.index) },
    );
  }
};

// ─── Minting targets ───────────────────────────────────────────────────────

export interface TargetContext {
  readonly workspace: Workspace;
  readonly testCase: TestCase;
  readonly session: string;
  readonly now: () => Date;
  readonly dryRun: boolean;
  readonly model?: string;
  /** The profile's baseURL, for naming a screen from a snapshot URL. */
  readonly baseURL?: string;
}

export interface NormalizedSteps {
  readonly steps: readonly ResolvedStep[];
  /** Facets created by this call (not ones a mint folded into). */
  readonly minted: readonly string[];
  /** On a dry run: the catalogs with the planned mints applied, by screen. */
  readonly planned: ReadonlyMap<string, MemoryCatalog>;
}

type LooseTarget = Exclude<StepTarget, { readonly facetId: string }>;

const isFacetRef = (target: StepTarget): target is { readonly facetId: string } => 'facetId' in target;

const PARAM_REF = /^@([A-Za-z_][A-Za-z0-9_]*)$/;

/** A candidate standing in for an element known only by a locator (no snapshot was cited). */
const candidateFromLocator = (locator: LocatorSpec, interactive: boolean): Candidate => ({
  ref: 'locator',
  role: locator.role ?? (locator.strategy === 'row-text' ? 'row' : 'generic'),
  name: locator.name ?? locator.value ?? '',
  namingSource: locator.strategy === 'placeholder' ? 'placeholder' : locator.strategy === 'label' ? 'label-for' : locator.strategy === 'text' ? 'content' : 'none',
  affordance: 'none',
  interactive,
  tag: '',
  ...(locator.scope?.landmark !== undefined ? { landmark: locator.scope.landmark } : {}),
  ...(locator.scope?.landmarkName !== undefined ? { landmarkName: locator.scope.landmarkName } : {}),
  ...(locator.scope?.dataBlock !== undefined ? { dataBlock: locator.scope.dataBlock } : {}),
  ...(locator.strategy === 'test-id' && locator.value !== undefined ? { testId: locator.value, testIdAttribute: locator.attribute ?? 'data-testid' } : {}),
  visible: true,
  enabled: true,
  inViewport: true,
});

interface Evidence {
  readonly candidate: Candidate;
  readonly snapshotId: string;
  readonly url?: string;
  readonly locator?: LocatorSpec;
}

const evidenceOf = async (workspace: Workspace, target: LooseTarget, interactive: boolean): Promise<Evidence> => {
  const snapshotId = 'snapshotId' in target ? target.snapshotId : undefined;
  const candidateRef = 'candidateRef' in target ? target.candidateRef : undefined;
  const locator = 'locator' in target ? stripExpression(target.locator) : undefined;
  if (snapshotId !== undefined && candidateRef !== undefined) {
    const record = await loadSnapshot(workspace, snapshotId).catch((error: unknown) => {
      if (isToolError(error) && error.family === 'stale-snapshot') {
        throw new ToolError('not-found', `${error.message} (test.emit needs the snapshot the candidate came from to mint it)`, { snapshotId });
      }
      throw error;
    });
    const candidate = record.candidates.find((c) => c.ref === candidateRef);
    if (candidate === undefined) throw new ToolError('not-found', `snapshot ${snapshotId} has no candidate ${candidateRef}`, { snapshotId, candidateRef });
    return { candidate, snapshotId, url: record.url, ...(locator !== undefined ? { locator } : {}) };
  }
  if (locator === undefined) throw new ToolError('invalid-input', 'a step target needs a facetId, a locator, or a snapshotId with a candidateRef');
  return { candidate: candidateFromLocator(locator, interactive), snapshotId: 'none', locator };
};

const stripExpression = (locator: LocatorSpec): LocatorSpec => {
  const { expression: _expression, ...rest } = locator;
  return rest;
};

const localOf = (facetId: string): string => facetId.slice(facetId.indexOf(':') + 1);

/** How closely a proposed assertion's words must match the element's name to name its facet. */
const PROPOSAL_MATCH = 0.5;

/**
 * The step's words for an assertion's target: those of an assertion the step
 * proposed with the same kind whose words fit this element's name, else
 * none (the element's own name then names the facet), so a second assertion
 * of the same kind does not borrow the first one's words.
 */
const assertionIntent = (intent: StepIntent, assertion: AssertionSpec, candidate: Candidate): StepIntent => {
  const proposal = intent.assertions.find(
    (p) => p.kind === assertion.kind && p.targetPhrase !== null && (candidate.name.length === 0 || phraseSimilarity(p.targetPhrase, candidate.name) >= PROPOSAL_MATCH),
  );
  return proposal !== undefined
    ? intentForAssertion(intent, proposal)
    : { ...intent, targetPhrase: null, targetMention: null, value: null, rowCue: null, verb: 'assert' };
};

const rowParameter = (rowValue: string | undefined, locator: LocatorSpec | undefined): string | undefined => {
  const fromValue = rowValue === undefined ? null : PARAM_REF.exec(rowValue);
  if (fromValue !== null) return fromValue[1];
  return locator === undefined ? undefined : locatorParams(locator)[0];
};

export interface Minter {
  readonly mint: (input: MintInput) => Promise<{ readonly facet: Facet; readonly created: boolean }>;
  readonly planned: ReadonlyMap<string, MemoryCatalog>;
}

/** Real mints (locked, written), or planned ones against an in-memory copy of each catalog for a dry run. */
export const createMinter = (workspace: Workspace, now: () => Date, dryRun: boolean): Minter => {
  const planned = new Map<string, MemoryCatalog>();
  if (!dryRun) return { mint: async (input) => mintFacet(workspace, input, { now }), planned };
  const makeEvent = eventFactory(now);
  return {
    planned,
    mint: async (input) => {
      const catalog = planned.get(input.screen) ?? (await loadScreen(workspace, input.screen, { now })).catalog;
      const plan = planMint(catalog, input, {
        pii: workspace.config.pii,
        now: now().toISOString(),
        makeEvent,
        pointer: (eventId) => evidencePointer(workspace, input.screen, eventId),
      });
      planned.set(input.screen, plan.catalog);
      return { facet: plan.facet, created: plan.created };
    },
  };
};

const MAX_NAME_ATTEMPTS = 6;

/**
 * Mint one loose target and return its facet id. A conflict because another
 * facet already owns the locator means the element is already in memory:
 * that facet is used. A conflict because the name belongs to a different
 * element retries under "<name>-2", "<name>-3", ….
 */
const mintTarget = async (
  minter: Minter,
  ctx: TargetContext,
  target: LooseTarget,
  intentFor: (candidate: Candidate) => StepIntent,
  step: ResolvedStep,
  rowValue: string | undefined,
  interactive: boolean,
  minted: string[],
): Promise<string> => {
  const evidence = await evidenceOf(ctx.workspace, target, interactive);
  const intent = intentFor(evidence.candidate);
  // A navigate step's screen is where it goes; the element it clicks to get there is on the page the snapshot saw.
  const observed = evidence.url !== undefined ? screenNameFromUrl(evidence.url, ctx.baseURL) : undefined;
  const screen = step.verb === 'navigate' && step.target === target ? (observed ?? step.screen) : (step.screen ?? observed);
  if (screen === undefined) {
    throw new ToolError('invalid-input', `step ${step.index}: a raw locator target needs the step's screen (set "screen" on the step) to be minted as a facet`, { step: step.index });
  }
  const kind: FacetKind = evidence.candidate.role === 'row' || evidence.locator?.strategy === 'row-text' ? 'row' : 'element';
  const parameter = kind === 'row' ? rowParameter(rowValue, evidence.locator) : undefined;
  const local = localOf(facetIdFor(screen, intent, evidence.candidate));
  const mention = intent.targetMention ?? intent.targetPhrase;
  const displayName = [mention, evidence.candidate.name, local.replace(/-/g, ' ')].find((name) => name !== null && name !== undefined && name.trim().length > 0 && !name.startsWith('@'))!;
  const aliases = [...new Set([intent.targetMention, intent.targetPhrase].filter((a): a is string => a !== null && a.trim().length > 0 && !a.startsWith('@')))];
  const attempt = async (n: number): Promise<string> => {
    const name = n === 1 ? local : `${local}-${n}`;
    const input: MintInput = {
      screen,
      draft: {
        name,
        kind,
        displayName,
        aliases,
        ...(evidence.locator !== undefined ? { locator: evidence.locator } : {}),
        ...(parameter !== undefined ? { parameter } : {}),
      },
      candidate: evidence.candidate,
      snapshotId: evidence.snapshotId,
      provenance: {
        instrument: 'test.emit',
        session: ctx.session,
        testCase: ctx.testCase.id,
        ...(ctx.model !== undefined ? { model: ctx.model } : {}),
      },
    };
    try {
      const result = await minter.mint(input);
      if (result.created) minted.push(result.facet.id);
      return result.facet.id;
    } catch (error) {
      if (!isToolError(error) || error.family !== 'conflict') throw error;
      const existing = typeof error.detail?.existingId === 'string' ? error.detail.existingId : undefined;
      if (existing !== undefined && error.detail?.hint === 'memory.enrich') return existing;
      // The name belongs to another element (or to a retired facet): try the next free name.
      if (existing !== undefined && n < MAX_NAME_ATTEMPTS) return attempt(n + 1);
      throw error;
    }
  };
  return attempt(1);
};

const ACTION_VERBS = new Set(['click', 'fill', 'select', 'check', 'uncheck', 'press', 'hover']);

/** Replace every loose target (and assertion target) by a facet reference, minting as needed. */
export const normalizeSteps = async (ctx: TargetContext, steps: readonly ResolvedStep[]): Promise<NormalizedSteps> => {
  const minter = createMinter(ctx.workspace, ctx.now, ctx.dryRun);
  const minted: string[] = [];
  const ordered = [...steps].sort((a, b) => a.index - b.index);
  const intents = ordered.reduce<{ readonly prior: readonly string[]; readonly byIndex: ReadonlyMap<number, StepIntent> }>(
    (acc, step) => {
      const intent = classifyStep(step.actionText, step.expectedText, ctx.testCase.parameters, {
        priorValues: acc.prior,
        ...(ctx.testCase.dataRows[0] !== undefined ? { dataRow: ctx.testCase.dataRows[0] } : {}),
      });
      return { prior: [...acc.prior, ...valuesUsedBy(intent)], byIndex: new Map([...acc.byIndex, [step.index, intent]]) };
    },
    { prior: [], byIndex: new Map() },
  ).byIndex;

  const normalized: ResolvedStep[] = [];
  for (const step of steps) {
    if (step.handoffId !== undefined) {
      normalized.push(step);
      continue;
    }
    const intent = intents.get(step.index)!;
    const target =
      step.target === undefined || isFacetRef(step.target)
        ? step.target
        : { facetId: await mintTarget(minter, ctx, step.target, () => intent, step, step.rowValue, ACTION_VERBS.has(step.verb), minted) };
    const assertions: AssertionSpec[] = [];
    for (const assertion of step.assertions ?? []) {
      assertions.push(
        assertion.target === undefined || isFacetRef(assertion.target)
          ? assertion
          : {
              ...assertion,
              target: { facetId: await mintTarget(minter, ctx, assertion.target, (candidate) => assertionIntent(intent, assertion, candidate), step, assertion.rowValue, false, minted) },
            },
      );
    }
    normalized.push({
      ...step,
      ...(target !== undefined ? { target } : {}),
      ...(step.assertions !== undefined ? { assertions } : {}),
    });
  }
  return { steps: normalized, minted: [...new Set(minted)], planned: minter.planned };
};

// ─── Catalogs ──────────────────────────────────────────────────────────────

const screenOfFacet = (facetId: string): string => {
  const parsed = parseFacetId(facetId);
  if (parsed === null) throw new ToolError('not-found', `no facet ${facetId}: facet ids are "<screen>:<name>"`, { facetId });
  return parsed.screen;
};

/** Screens whose catalogs the spec and its flows need, in first-use order. */
export const screensUsed = (steps: readonly ResolvedStep[], flows: readonly FlowRecording[]): readonly string[] => {
  const fromSteps = steps.flatMap((step) => [
    ...(step.screen !== undefined ? [step.screen] : []),
    ...(step.target !== undefined && isFacetRef(step.target) ? [screenOfFacet(step.target.facetId)] : []),
    ...(step.assertions ?? []).flatMap((a) => (a.target !== undefined && isFacetRef(a.target) ? [screenOfFacet(a.target.facetId)] : [])),
  ]);
  const fromFlows = flows.flatMap((flow) => flow.steps.flatMap((s) => [s.screen, ...(s.facetId !== undefined ? [screenOfFacet(s.facetId)] : [])]));
  return [...new Set([...fromSteps, ...fromFlows])];
};

const emitRoute = (catalog: MemoryCatalog): EmitRoute | null => {
  const route = catalog.route;
  if (route === undefined) return null;
  const landmarks = route.landmarks ?? route.summary?.landmarks;
  return {
    url: route.url,
    ...(route.variant !== undefined ? { variant: route.variant } : {}),
    ...(route.fingerprint !== undefined ? { fingerprint: route.fingerprint } : {}),
    ...(route.title !== undefined ? { title: route.title } : {}),
    ...(landmarks !== undefined ? { landmarks: [...landmarks] } : {}),
  };
};

/** The emission library's view of each screen: route and every facet (planned dry-run mints included). */
export const loadEmitCatalogs = async (
  workspace: Workspace,
  screens: readonly string[],
  planned: ReadonlyMap<string, MemoryCatalog>,
  now: () => Date,
): Promise<readonly EmitCatalog[]> =>
  Promise.all(
    screens.map(async (screen) => {
      const catalog = planned.get(screen) ?? (await loadScreen(workspace, screen, { now })).catalog;
      return { screen, route: emitRoute(catalog), facets: catalog.facets };
    }),
  );
