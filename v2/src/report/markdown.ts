/**
 * The numbers as a page a QA lead reads in a minute: the three numbers on
 * top with their denominators, the diagnostics underneath. Pure.
 */
import type { CostSlice, Numbers, Rate } from './numbers.js';

const pct = (value: number | null): string => (value === null ? 'n/a' : `${Math.round(value * 1000) / 10}%`);

const minutes = (value: number | null): string => (value === null ? 'n/a' : value < 10 ? `${value.toFixed(1)} min` : `${Math.round(value)} min`);

const tokens = (value: number | null): string => (value === null ? 'n/a' : Math.round(value).toLocaleString('en-US'));

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const rateText = (r: Rate, what: string): string => `${r.count} of ${plural(r.of, what)} (${pct(r.rate)})`;

const distribution = (counts: Readonly<Record<string, number>>): string => {
  const entries = Object.entries(counts);
  return entries.length === 0 ? 'none' : entries.map(([k, v]) => `${k} ${v}`).join(', ');
};

const sliceText = (name: string, s: CostSlice): string =>
  s.cases === 0
    ? `${name}: no cases`
    : `${name}: ${plural(s.cases, 'case')}, ${s.accepted} accepted, ${minutes(s.perAcceptedTest.minutes)} and ${tokens(s.perAcceptedTest.tokens)} tokens per accepted test`;

export const renderNumbersMarkdown = (numbers: Numbers): string => {
  const { acceptance: a, survival: s, cost: c, diagnostics: d } = numbers;
  const reviewers = Object.entries(a.byReviewer);
  const lines = [
    '# Tesseract — the three numbers',
    '',
    `Computed ${numbers.generatedAt} from the receipts of ${plural(numbers.cases, 'test case')}.`,
    '',
    '| Number | Value | From |',
    '|---|---|---|',
    `| Acceptance | ${pct(a.rate)} | ${a.accepted} of ${plural(a.emitted, 'emitted test')} accepted${a.acceptedWithEdit > 0 ? ` (${a.acceptedWithEdit} with a small edit)` : ''}; ${a.rejected} rejected; ${a.awaitingReview} awaiting review |`,
    `| Survival | ${pct(s.rate)} | ${s.passingWithoutEdit} of ${plural(s.acceptedTests, 'accepted test')} still passing without edits (latest run, at least ${plural(s.minRuns, 'run')} since acceptance); flake rate ${pct(s.flakeRate)} over ${plural(s.runsConsidered, 'run')} |`,
    `| Cost | ${minutes(c.perAcceptedTest.minutes)}, ${tokens(c.perAcceptedTest.tokens)} tokens per accepted test | ${minutes(c.totalMinutes)} and ${tokens(c.totalTokens)} tokens of authoring in all |`,
    '',
    s.pending + s.failing + s.edited > 0
      ? `Not surviving yet: ${s.pending} awaiting runs, ${s.failing} failing, ${s.edited} edited since acceptance.`
      : null,
    `Cost by visit: ${sliceText('first visit to a screen', c.firstVisit)}; ${sliceText('revisits', c.revisit)}.`,
    reviewers.length > 0 ? `Reviewers: ${reviewers.map(([who, r]) => `${who} ${r.accepted}/${r.reviewed} accepted`).join(', ')}.` : null,
    '',
    '## Diagnostics',
    '',
    'Reported, never optimized directly.',
    '',
    `- **Handoff rate:** ${rateText(d.handoffRate, 'step')} emitted as test.fixme`,
    `- **Handoff reasons:** ${distribution(d.handoffReasons)}`,
    `- **Assertion substance:** ${d.assertionSubstance.substantive} of ${plural(d.assertionSubstance.withAssertions, 'step')} with assertions check text, a value, a row, a count, or the URL (${pct(d.assertionSubstance.rate)}); ${plural(d.assertionSubstance.withoutAssertions, 'step')} have no assertion`,
    `- **Facet reuse:** ${d.facetReuse.reused} of ${plural(d.facetReuse.used, 'facet use')} were already in memory (${pct(d.facetReuse.rate)}); on revisits ${rateText(d.facetReuse.onRevisits, 'use')}`,
    `- **Preflight pass rate:** ${d.preflightPassRate.runs === 0 ? 'no preflight yet' : `${pct(d.preflightPassRate.rate)} (${d.preflightPassRate.ok} ok, ${d.preflightPassRate.stale} stale, ${d.preflightPassRate.missing} missing over ${plural(d.preflightPassRate.runs, 'preflight')})`}`,
    ...Object.entries(d.preflightPassRate.perScreen).map(([screen, p]) => `  - ${screen}: ${pct(p.rate)} (${p.ok} ok, ${p.stale} stale, ${p.missing} missing)`),
    `- **Locator strategies:** ${distribution(d.locatorStrategyDistribution)}`,
    `- **Naming sources:** ${distribution(d.namingSourceDistribution)}`,
    `- **Facet origins:** ${distribution(d.facetOrigins)}`,
    `- **Locator edits among accepted tests:** ${rateText(d.locatorEditRate, 'accepted test')}`,
    '',
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
};
