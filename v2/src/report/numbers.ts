/**
 * The three numbers (vision §6.1) and their diagnostics, computed from the
 * receipts and the catalogs. Pure: computeNumbersFrom takes the parsed
 * receipts; computeNumbers is the thin loader around it.
 *
 *  - Acceptance: tests a human accepted (as written, or with a small edit)
 *    over tests emitted — from review.record receipts.
 *  - Survival: accepted tests still passing without edits since they were
 *    accepted, with the flake rate as a companion — from run receipts.
 *  - Cost: wall-clock minutes and host-reported tokens per accepted test,
 *    split into first visits to a screen and revisits — from authoring
 *    receipts.
 *
 * Diagnostics are reported, never optimized directly.
 */
import type { AssertionKind, RunReceipt } from '../contract/schemas.js';
import type { Workspace } from '../workspace/workspace.js';
import { loadReceipts, type ReceiptSet } from './load.js';
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  attribute,
  caseCosts,
  caseIds,
  facetIndex,
  get,
  isWrittenEmit,
  latestEmitLines,
  latestEmits,
  latestReviews,
  ratio,
  screenFirstSeen,
  screenOfFacet,
  timeOf,
  truncatedCount,
  type Attributed,
} from './model.js';

export interface Rate {
  readonly count: number;
  readonly of: number;
  readonly rate: number | null;
}

export interface CostSlice {
  readonly cases: number;
  readonly accepted: number;
  readonly minutes: number;
  readonly tokens: number;
  readonly perAcceptedTest: { readonly minutes: number | null; readonly tokens: number | null };
}

export interface PreflightRate {
  readonly ok: number;
  readonly stale: number;
  readonly missing: number;
  readonly rate: number | null;
}

export interface Numbers {
  readonly generatedAt: string;
  readonly cases: number;
  readonly acceptance: {
    readonly accepted: number;
    readonly emitted: number;
    readonly rate: number | null;
    readonly acceptedWithEdit: number;
    readonly rejected: number;
    readonly awaitingReview: number;
    readonly byReviewer: Readonly<Record<string, { readonly reviewed: number; readonly accepted: number }>>;
  };
  readonly survival: {
    readonly acceptedTests: number;
    readonly passingWithoutEdit: number;
    readonly rate: number | null;
    readonly flakeRate: number | null;
    readonly runsConsidered: number;
    /** Accepted tests with fewer runs than minRuns since acceptance (not yet counted as surviving). */
    readonly pending: number;
    /** Accepted tests whose latest run failed. */
    readonly failing: number;
    /** Accepted tests re-emitted with changes since acceptance. */
    readonly edited: number;
    readonly minRuns: number;
  };
  readonly cost: {
    readonly perAcceptedTest: { readonly minutes: number | null; readonly tokens: number | null };
    readonly totalMinutes: number;
    readonly totalTokens: number;
    readonly firstVisit: CostSlice;
    readonly revisit: CostSlice;
  };
  readonly diagnostics: {
    readonly handoffRate: Rate;
    readonly handoffReasons: Readonly<Record<string, number>>;
    readonly locatorStrategyDistribution: Readonly<Record<string, number>>;
    readonly namingSourceDistribution: Readonly<Record<string, number>>;
    /** Share of steps with assertions whose assertion checks text, a value, a row, a count, or the URL, not bare visibility. */
    readonly assertionSubstance: { readonly substantive: number; readonly withAssertions: number; readonly withoutAssertions: number; readonly rate: number | null };
    /** Share of the facets emitted tests use that were already in memory when the case was authored. */
    readonly facetReuse: { readonly used: number; readonly reused: number; readonly rate: number | null; readonly onRevisits: Rate };
    readonly preflightPassRate: PreflightRate & { readonly runs: number; readonly perScreen: Readonly<Record<string, PreflightRate>> };
    /** Facets by the instrument that minted them (app.act/app.observe: authoring; flow.record: recordings). */
    readonly facetOrigins: Readonly<Record<string, number>>;
    /** Accepted tests whose acceptance involved a locator edit (resolution was weak). */
    readonly locatorEditRate: Rate;
  };
}

export interface NumbersOptions {
  /** Runs since acceptance before an accepted test counts as surviving. Default 1. */
  readonly minRuns?: number;
  readonly now?: () => Date;
}

const SUBSTANTIVE: ReadonlySet<AssertionKind> = new Set<AssertionKind>(['text', 'contains-text', 'value', 'count', 'url', 'title']);
const VISIBILITY: ReadonlySet<string> = new Set(['visible', 'hidden', 'enabled', 'disabled', 'checked', 'unchecked']);

const tally = (values: readonly string[]): Readonly<Record<string, number>> =>
  Object.fromEntries(
    [...values.reduce((acc, v) => acc.set(v, (acc.get(v) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );

const rate = (count: number, of: number): Rate => ({ count, of, rate: ratio(count, of) });

const PASSING: ReadonlySet<RunReceipt['outcome']> = new Set(['passed', 'flaky']);

/** The runs of one test since a time, grouped by run id, oldest first. */
const runsSince = (runs: readonly RunReceipt[], testCaseId: string, since: number): readonly (readonly RunReceipt[])[] => {
  const mine = runs.filter((r) => r.testCase === testCaseId && timeOf(r.at) >= since);
  const groups = new Map<string, RunReceipt[]>();
  for (const r of mine) groups.set(r.runId, [...(groups.get(r.runId) ?? []), r]);
  return [...groups.values()].sort((a, b) => timeOf(a[0]!.at) - timeOf(b[0]!.at));
};

const emittedCases = (set: ReceiptSet, attributed: readonly Attributed[]): ReadonlySet<string> =>
  new Set([...set.emits.map((e) => e.testCaseId), ...attributed.flatMap((a) => (a.caseId !== undefined && isWrittenEmit(a) ? [a.caseId] : []))]);

/** Accepted tests re-emitted with a non-empty diff after they were accepted. */
const editedSince = (attributed: readonly Attributed[], caseId: string, since: number): boolean =>
  attributed.some((a) => a.caseId === caseId && a.time > since && isWrittenEmit(a) && (asString(get(a.line.output, 'diff')) ?? '').length > 0);

interface StepView {
  readonly index: number;
  readonly handoff: boolean;
  readonly assertions: readonly { readonly kind: string; readonly rowValue: boolean }[];
}

/** The steps of a test.emit call as its (summarized) receipt input shows them. */
const emittedSteps = (line: Attributed): { readonly visible: readonly StepView[]; readonly hidden: number } => {
  const steps = asArray(get(line.line.input, 'steps'));
  const visible = steps.flatMap((item): StepView[] => {
    const step = asRecord(item);
    const index = asNumber(step?.index);
    if (step === null || index === undefined) return [];
    return [
      {
        index,
        handoff: asString(step.handoffId) !== undefined,
        assertions: asArray(step.assertions).flatMap((a) => {
          const kind = asString(get(a, 'kind'));
          return kind === undefined ? [] : [{ kind, rowValue: asString(get(a, 'rowValue')) !== undefined }];
        }),
      },
    ];
  });
  return { visible, hidden: truncatedCount(steps) };
};

const preflightOf = (attributed: readonly Attributed[], set: ReceiptSet): Numbers['diagnostics']['preflightPassRate'] => {
  const lines = attributed.filter((a) => a.line.tool === 'memory.preflight' && a.line.outcome === 'succeeded');
  const perScreen = new Map<string, { ok: number; stale: number; missing: number }>();
  const add = (screen: string, status: string): void => {
    const current = perScreen.get(screen) ?? { ok: 0, stale: 0, missing: 0 };
    if (status === 'ok' || status === 'stale' || status === 'missing') perScreen.set(screen, { ...current, [status]: current[status] + 1 });
  };
  let ok = 0;
  let stale = 0;
  let missing = 0;
  let runs = 0;
  if (lines.length > 0) {
    for (const a of lines) {
      runs += 1;
      ok += asNumber(get(a.line.output, 'summary', 'ok')) ?? 0;
      stale += asNumber(get(a.line.output, 'summary', 'stale')) ?? 0;
      missing += asNumber(get(a.line.output, 'summary', 'missing')) ?? 0;
      for (const screen of asArray(get(a.line.output, 'screens'))) {
        const name = asString(get(screen, 'screen'));
        if (name === undefined) continue;
        for (const facet of asArray(get(screen, 'facets'))) {
          const status = asString(get(facet, 'status'));
          if (status !== undefined) add(name, status);
        }
      }
    }
  } else {
    for (const p of set.preflights) {
      runs += 1;
      ok += p.summary.ok;
      stale += p.summary.stale;
      missing += p.summary.missing;
    }
  }
  return {
    ok,
    stale,
    missing,
    rate: ratio(ok, ok + stale + missing),
    runs,
    perScreen: Object.fromEntries([...perScreen].sort(([a], [b]) => a.localeCompare(b)).map(([screen, c]) => [screen, { ...c, rate: ratio(c.ok, c.ok + c.stale + c.missing) }])),
  };
};

/** The three numbers and the diagnostics, from parsed receipts. */
export const computeNumbersFrom = (set: ReceiptSet, options: NumbersOptions = {}): Numbers => {
  const minRuns = Math.max(1, options.minRuns ?? 1);
  const attributed = attribute(set.authoring);
  const facets = facetIndex(set.facets);
  const reviews = latestReviews(set.reviews);
  const emitRecords = latestEmits(set.emits);
  const emitLines = latestEmitLines(attributed);
  const costs = caseCosts(attributed);

  // Acceptance.
  const emitted = new Set([...emittedCases(set, attributed), ...reviews.keys()]);
  const accepted = [...reviews.values()].filter((r) => r.countsAsAccepted);
  const acceptedIds = new Set(accepted.map((r) => r.testCaseId));
  const byReviewer = [...reviews.values()].reduce<Record<string, { reviewed: number; accepted: number }>>((acc, r) => {
    const current = acc[r.reviewer] ?? { reviewed: 0, accepted: 0 };
    return { ...acc, [r.reviewer]: { reviewed: current.reviewed + 1, accepted: current.accepted + (r.countsAsAccepted ? 1 : 0) } };
  }, {});

  // Survival.
  let passing = 0;
  let pending = 0;
  let failing = 0;
  let edited = 0;
  let runsConsidered = 0;
  let flaky = 0;
  for (const review of accepted) {
    const since = timeOf(review.at);
    const runs = runsSince(set.runs, review.testCaseId, since);
    runsConsidered += runs.reduce((sum, group) => sum + group.length, 0);
    flaky += runs.reduce((sum, group) => sum + group.filter((r) => r.outcome === 'flaky').length, 0);
    if (editedSince(attributed, review.testCaseId, since)) {
      edited += 1;
    } else if (runs.length < minRuns) {
      pending += 1;
    } else if (runs[runs.length - 1]!.every((r) => PASSING.has(r.outcome))) {
      passing += 1;
    } else {
      failing += 1;
    }
  }

  // Cost.
  const firstSeen = screenFirstSeen(set.facets);
  const touched = (caseId: string): readonly string[] => {
    const record = emitRecords.get(caseId);
    const minted = attributed.flatMap((a) =>
      a.caseId === caseId && a.line.tool === 'memory.mint' && a.line.outcome === 'succeeded' ? [asString(get(a.line.output, 'facet', 'id'))].filter((id): id is string => id !== undefined) : [],
    );
    return [...new Set([...(record?.facets ?? []), ...minted].map(screenOfFacet).filter((s) => s.length > 0))];
  };
  const isFirstVisit = (caseId: string, start: number): boolean => {
    const screens = touched(caseId);
    return screens.length === 0 || screens.some((screen) => (firstSeen.get(screen) ?? Number.MAX_SAFE_INTEGER) >= start);
  };
  const slice = (pick: (caseId: string, start: number) => boolean): CostSlice => {
    const chosen = [...costs.values()].filter((c) => pick(c.caseId, c.start));
    const minutes = chosen.reduce((sum, c) => sum + c.minutes, 0);
    const tokens = chosen.reduce((sum, c) => sum + c.tokens, 0);
    const acceptedHere = chosen.filter((c) => acceptedIds.has(c.caseId)).length;
    return { cases: chosen.length, accepted: acceptedHere, minutes, tokens, perAcceptedTest: { minutes: ratio(minutes, acceptedHere), tokens: ratio(tokens, acceptedHere) } };
  };
  const totalMinutes = [...costs.values()].reduce((sum, c) => sum + c.minutes, 0);
  const totalTokens = [...costs.values()].reduce((sum, c) => sum + c.tokens, 0);

  // Diagnostics: steps of each case's latest emitted test.
  let steps = 0;
  let handoffSteps = 0;
  let substantive = 0;
  let withAssertions = 0;
  let withoutAssertions = 0;
  for (const [caseId, line] of emitLines) {
    const { visible, hidden } = emittedSteps(line);
    const record = emitRecords.get(caseId);
    steps += record?.steps.length ?? visible.length + hidden;
    const maxVisible = Math.max(0, ...visible.map((s) => s.index));
    const previousEmit = Math.max(0, ...attributed.filter((a) => a.caseId === caseId && isWrittenEmit(a) && a.time < line.time).map((a) => a.time));
    const hiddenHandoffs = hidden === 0
      ? 0
      : new Set(
          attributed
            .filter((a) => a.caseId === caseId && a.line.tool === 'handoff.raise' && a.line.outcome === 'succeeded' && a.time > previousEmit && a.time <= line.time)
            .flatMap((a) => {
              const index = asNumber(get(a.line.input, 'stepIndex'));
              return index !== undefined && index > maxVisible ? [index] : [];
            }),
        ).size;
    handoffSteps += visible.filter((s) => s.handoff).length + hiddenHandoffs;
    for (const step of visible) {
      if (step.handoff) continue;
      if (step.assertions.length === 0) {
        withoutAssertions += 1;
        continue;
      }
      withAssertions += 1;
      const stepFacets = record?.steps.find((s) => s.index === step.index)?.facets ?? [];
      const onRow = stepFacets.some((id) => facets.get(id)?.kind === 'row');
      const content = step.assertions.some(
        (a) => SUBSTANTIVE.has(a.kind as AssertionKind) || (VISIBILITY.has(a.kind) && (a.rowValue || onRow)),
      );
      if (content) substantive += 1;
    }
  }

  const handoffLines = attributed.filter((a) => a.line.tool === 'handoff.raise' && a.line.outcome === 'succeeded');
  const handoffReasons = handoffLines.length > 0
    ? tally(
        [...new Map(handoffLines.map((a) => [asString(get(a.line.output, 'handoffId')) ?? `#${a.order}`, asString(get(a.line.input, 'blockage')) ?? 'other'] as const)).values()],
      )
    : tally(set.handoffs.map((h) => h.blockage));

  // Facet reuse: facets an emitted test uses that existed before its case was authored.
  let used = 0;
  let reused = 0;
  let revisitUsed = 0;
  let revisitReused = 0;
  for (const [caseId, record] of emitRecords) {
    const cost = costs.get(caseId);
    if (cost === undefined) continue;
    const revisit = !isFirstVisit(caseId, cost.start);
    for (const id of new Set(record.facets)) {
      const facet = facets.get(id);
      if (facet === undefined) continue;
      const old = timeOf(facet.provenance.mintedAt) < cost.start;
      used += 1;
      reused += old ? 1 : 0;
      if (revisit) {
        revisitUsed += 1;
        revisitReused += old ? 1 : 0;
      }
    }
  }

  const live = set.facets.filter((f) => f.status !== 'retired');
  return {
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    cases: caseIds(set, attributed).length,
    acceptance: {
      accepted: accepted.length,
      emitted: emitted.size,
      rate: ratio(accepted.length, emitted.size),
      acceptedWithEdit: accepted.filter((r) => r.decision === 'accept-with-edit').length,
      rejected: [...reviews.values()].filter((r) => r.decision === 'reject').length,
      awaitingReview: [...emitted].filter((id) => !reviews.has(id)).length,
      byReviewer,
    },
    survival: {
      acceptedTests: accepted.length,
      passingWithoutEdit: passing,
      rate: ratio(passing, accepted.length),
      flakeRate: ratio(flaky, runsConsidered),
      runsConsidered,
      pending,
      failing,
      edited,
      minRuns,
    },
    cost: {
      perAcceptedTest: { minutes: ratio(totalMinutes, accepted.length), tokens: ratio(totalTokens, accepted.length) },
      totalMinutes,
      totalTokens,
      firstVisit: slice((caseId, start) => isFirstVisit(caseId, start)),
      revisit: slice((caseId, start) => !isFirstVisit(caseId, start)),
    },
    diagnostics: {
      handoffRate: rate(handoffSteps, steps),
      handoffReasons,
      locatorStrategyDistribution: tally(live.flatMap((f) => (f.locators[0] !== undefined ? [f.locators[0].strategy] : []))),
      namingSourceDistribution: tally(live.map((f) => f.namingSource ?? 'unknown')),
      assertionSubstance: { substantive, withAssertions, withoutAssertions, rate: ratio(substantive, withAssertions) },
      facetReuse: { used, reused, rate: ratio(reused, used), onRevisits: rate(revisitReused, revisitUsed) },
      preflightPassRate: preflightOf(attributed, set),
      facetOrigins: tally(live.map((f) => f.provenance.instrument)),
      locatorEditRate: rate(accepted.filter((r) => r.locatorEdited === true).length, accepted.length),
    },
  };
};

/** Load the workspace's receipts and catalogs, and compute the numbers. */
export const computeNumbers = async (workspace: Workspace, options: NumbersOptions = {}): Promise<Numbers> =>
  computeNumbersFrom(await loadReceipts(workspace), options);
