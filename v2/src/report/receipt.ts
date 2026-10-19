/**
 * The per-test authoring receipt: one page that explains a test the way a
 * reviewer asks about it — what was observed, which facets were used and
 * minted, every decision with its reason and the candidates it rejected,
 * the handoffs, and how the test has run since. Pure over the parsed
 * receipts (authoringReceiptFrom) plus a thin loader (authoringReceiptMarkdown).
 */
import type { TestCase } from '../contract/schemas.js';
import { loadCase } from '../ado/index.js';
import type { Workspace } from '../workspace/workspace.js';
import { loadReceipts, type ReceiptSet } from './load.js';
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  attribute,
  caseCosts,
  facetIndex,
  get,
  latestEmits,
  latestReviews,
  timeOf,
  type Attributed,
} from './model.js';

const MAX_LINES_PER_STEP = 30;

const md = (text: string): string => text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();

const clip = (text: string, max = 160): string => {
  const flat = md(text);
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const quoted = (value: unknown): string => (typeof value === 'string' ? `"${clip(value, 80)}"` : value === undefined ? '' : clip(JSON.stringify(value), 80));

const targetText = (target: unknown): string => {
  const facetId = asString(get(target, 'facetId'));
  if (facetId !== undefined) return `facet ${facetId}`;
  const ref = asString(get(target, 'ref'));
  if (ref !== undefined) return `candidate ${ref}`;
  const strategy = asString(get(target, 'locator', 'strategy'));
  if (strategy !== undefined) {
    const what = asString(get(target, 'locator', 'name')) ?? asString(get(target, 'locator', 'value')) ?? '';
    return `locator ${strategy}${what.length > 0 ? ` "${clip(what, 60)}"` : ''}`;
  }
  return 'the page';
};

const decisionText = (a: Attributed): string => {
  const d = a.line.decision;
  const host = a.line.host;
  const parts = [
    d?.chose !== undefined && d.chose.length > 0 ? `chose ${d.chose}` : null,
    d?.reason !== undefined ? `because ${clip(d.reason, 300)}` : null,
    d?.rejected !== undefined && d.rejected.length > 0 ? `rejected ${d.rejected.join(', ')}` : null,
    host?.model !== undefined || host?.tokens !== undefined
      ? `host ${host?.model ?? 'model'}${host?.tokens !== undefined ? ` (${host.tokens.prompt ?? 0} prompt / ${host.tokens.completion ?? 0} completion tokens)` : ''}`
      : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? ` — ${parts.join('; ')}` : '';
};

const failed = (a: Attributed): string => `failed (${a.line.errorFamily ?? 'unclassified'}): ${clip(a.line.message ?? '', 200)}`;

/** One bullet per tool call, in the words a reviewer uses. */
export const describeCall = (a: Attributed): string => {
  const { line } = a;
  const input = line.input;
  const output = line.output;
  const ok = line.outcome === 'succeeded';
  switch (line.tool) {
    case 'memory.query': {
      const top = asRecord(asArray(get(output, 'facets'))[0]);
      const phrase = quoted(get(input, 'phrase'));
      const screen = asString(get(input, 'screen'));
      if (!ok) return `memory.query ${phrase} ${failed(a)}`;
      return `memory.query ${phrase}${screen !== undefined ? ` on ${screen}` : ''} → ${top === null ? 'no facet' : `${asString(top.id) ?? '?'} (score ${(asNumber(top.score) ?? 0).toFixed(2)})`}`;
    }
    case 'app.observe': {
      if (!ok) return `app.observe ${failed(a)}`;
      const hint = asRecord(asArray(get(output, 'hints'))[0]);
      return `app.observe scope ${asString(get(input, 'scope')) ?? 'page'} → ${asNumber(get(output, 'totalCandidates')) ?? asArray(get(output, 'candidates')).length} candidates on ${asString(get(output, 'url')) ?? '?'} (${asString(get(output, 'snapshotId')) ?? '?'})${hint !== null ? `; best hint ${asString(hint.ref) ?? '?'} ${(asNumber(hint.score) ?? 0).toFixed(2)}` : ''}`;
    }
    case 'app.act': {
      const action = asString(get(input, 'action')) ?? 'act';
      const value = get(input, 'value');
      const head = `app.act ${action} on ${targetText(get(input, 'target'))}${value !== undefined ? ` with ${quoted(value)}` : ''}`;
      if (!ok) return `${head} ${failed(a)}${decisionText(a)}`;
      const outcome = asString(get(output, 'outcome')) ?? 'succeeded';
      const expression = asString(get(output, 'resolved', 'expression'));
      const result = outcome === 'failed' ? `failed (${asString(get(output, 'errorFamily')) ?? '?'}): ${clip(asString(get(output, 'message')) ?? '', 200)}` : `succeeded${expression !== undefined ? ` via \`${clip(expression, 120)}\`` : ''}`;
      return `${head} → ${result}${decisionText(a)}`;
    }
    case 'app.assert': {
      const kind = asString(get(input, 'assertion')) ?? 'assert';
      const expected = get(input, 'expected');
      const head = `app.assert ${kind}${expected !== undefined ? ` ${quoted(expected)}` : ''} on ${targetText(get(input, 'target'))}`;
      if (!ok) return `${head} ${failed(a)}`;
      return `${head} → ${get(output, 'passed') === true ? 'passed' : 'failed'} (observed ${quoted(get(output, 'observed'))})${decisionText(a)}`;
    }
    case 'memory.mint': {
      if (!ok) return `memory.mint ${asString(get(input, 'facet', 'displayName')) ?? ''} ${failed(a)}`;
      return `memory.mint ${asString(get(output, 'facet', 'id')) ?? '?'} "${clip(asString(get(output, 'facet', 'displayName')) ?? '', 60)}" ${get(output, 'created') === true ? '(new, candidate)' : '(already known; evidence appended)'}`;
    }
    case 'memory.enrich': {
      if (!ok) return `memory.enrich ${asString(get(input, 'facetId')) ?? ''} ${failed(a)}`;
      const changes = asArray(get(output, 'changes')).flatMap((c) => (typeof c === 'string' ? [c] : []));
      return `memory.enrich ${asString(get(input, 'facetId')) ?? '?'}: ${changes.length > 0 ? clip(changes.join('; '), 200) : 'no change'}`;
    }
    case 'handoff.raise': {
      if (!ok) return `handoff.raise ${failed(a)}`;
      return `handoff.raise ${asString(get(input, 'blockage')) ?? '?'} → ${asString(get(output, 'handoffId')) ?? '?'}: ${clip(asString(get(input, 'unresolvedIntent')) ?? '', 240)}`;
    }
    case 'app.open': {
      if (!ok) return `app.open ${failed(a)}`;
      return `app.open ${asString(get(input, 'url')) ?? asString(get(input, 'profile')) ?? ''} → ${asString(get(output, 'finalUrl')) ?? '?'} (${asString(get(output, 'variant')) ?? '?'})`;
    }
    case 'test.emit': {
      if (!ok) return `test.emit ${failed(a)}`;
      const minted = asArray(get(output, 'facetsMinted')).filter((x): x is string => typeof x === 'string');
      return `test.emit → ${asString(get(output, 'specPath')) ?? '?'}${get(output, 'written') === false ? ' (unchanged)' : ''}${minted.length > 0 ? `; minted ${minted.join(', ')}` : ''}`;
    }
    default:
      return `${line.tool} ${ok ? 'succeeded' : failed(a)}`;
  }
};

const when = (iso: string): string => iso.replace('T', ' ').replace(/\.\d+Z$/, 'Z');

/** The per-test receipt as Markdown, from parsed receipts. */
export const authoringReceiptFrom = (set: ReceiptSet, testCaseId: string, testCase: TestCase | null = null): string => {
  const attributed = attribute(set.authoring).filter((a) => a.caseId === testCaseId);
  const facets = facetIndex(set.facets);
  const emit = latestEmits(set.emits).get(testCaseId);
  const review = latestReviews(set.reviews).get(testCaseId);
  const cost = caseCosts(attributed).get(testCaseId);
  const handoffs = set.handoffs.filter((h) => h.testCaseId === testCaseId).sort((a, b) => a.stepIndex - b.stepIndex);
  const runs = set.runs.filter((r) => r.testCase === testCaseId).sort((a, b) => timeOf(b.at) - timeOf(a.at));
  const reviews = set.reviews.filter((r) => r.testCaseId === testCaseId).sort((a, b) => timeOf(a.at) - timeOf(b.at));
  const title = testCase?.title ?? emit?.testTitle?.replace(/^ADO \S+ — /, '') ?? '(title not cached)';

  if (attributed.length === 0 && emit === undefined && runs.length === 0 && reviews.length === 0) {
    return `# ADO ${testCaseId}\n\nNo receipts mention this test case yet.\n`;
  }

  // The latest authoring pass: calls since the last app.open that started the case, else all of them.
  const opens = attributed.filter((a) => a.line.tool === 'app.open' && a.line.outcome === 'succeeded' && a.line.step === undefined);
  const passStart = opens.length > 0 ? opens[opens.length - 1]!.order : (attributed[0]?.order ?? 0);
  const pass = attributed.filter((a) => a.order >= passStart);
  const minted = pass.flatMap((a) =>
    a.line.tool === 'memory.mint' && a.line.outcome === 'succeeded' && get(a.line.output, 'created') === true ? [asString(get(a.line.output, 'facet', 'id')) ?? ''] : [],
  ).filter((id) => id.length > 0);
  const raised = pass.filter((a) => a.line.tool === 'handoff.raise' && a.line.outcome === 'succeeded');
  const stepIndexes = [
    ...new Set([...(testCase?.steps.map((s) => s.index) ?? []), ...(emit?.steps.map((s) => s.index) ?? []), ...pass.flatMap((a) => (a.line.step !== undefined ? [a.line.step] : []))]),
  ].sort((a, b) => a - b);
  const models = cost?.models ?? [];

  const lines: string[] = [
    `# ADO ${testCaseId} — ${md(title)}`,
    '',
    [
      testCase !== null ? `Revision ${testCase.revision}` : emit !== undefined ? `Revision ${emit.revision}` : null,
      emit !== undefined ? `spec \`${emit.specPath}\`` : 'not emitted yet',
      emit !== undefined ? `emitted ${when(emit.at)}` : null,
    ]
      .filter((p): p is string => p !== null)
      .join(' · '),
    '',
    `- **Review:** ${review === undefined ? 'not reviewed yet' : `${review.decision} by ${review.reviewer} on ${when(review.at)}${review.countsAsAccepted ? ' (counts as accepted)' : ''}${review.note !== undefined ? ` — ${clip(review.note, 200)}` : ''}`}`,
    `- **Latest run:** ${runs[0] === undefined ? 'never run' : `${runs[0].outcome} on ${when(runs[0].at)} (${(runs[0].durationMs / 1000).toFixed(1)} s)${runs[0].error !== undefined ? ` — ${runs[0].error.failureType}: ${clip(runs[0].error.message, 200)}` : ''}`}`,
    `- **Authoring:** ${stepIndexes.length} steps, ${raised.length} handed off · ${cost === undefined ? 'no authoring receipts' : `${cost.minutes.toFixed(1)} min, ${cost.tokens.toLocaleString('en-US')} tokens`}${models.length > 0 ? ` · models ${models.join(', ')}` : ' · no model reported (heuristic or human)'} · ${pass.length} calls in the latest pass`,
    '',
    '## Steps',
    '',
  ];

  for (const index of stepIndexes) {
    const step = testCase?.steps.find((s) => s.index === index);
    const calls = pass.filter((a) => a.line.step === index);
    lines.push(`### ${index}. ${md(step?.action ?? emit?.steps.find((s) => s.index === index)?.title ?? '(step text not cached)')}`);
    if (step !== undefined && step.expected.trim().length > 0) lines.push('', `Expected: ${md(step.expected)}`);
    const stepFacets = emit?.steps.find((s) => s.index === index)?.facets ?? [];
    if (stepFacets.length > 0) lines.push('', `Facets in the spec: ${stepFacets.join(', ')}`);
    lines.push('');
    if (calls.length === 0) {
      lines.push('- (no calls recorded for this step)');
    } else {
      lines.push(...calls.slice(0, MAX_LINES_PER_STEP).map((a) => `- ${describeCall(a)}`));
      if (calls.length > MAX_LINES_PER_STEP) lines.push(`- …and ${calls.length - MAX_LINES_PER_STEP} more calls`);
    }
    lines.push('');
  }

  // The human's review has its own section; it is not an authoring call.
  const caseLevel = pass.filter((a) => a.line.step === undefined && a.line.tool !== 'review.record');
  if (caseLevel.length > 0) {
    lines.push('## Case-level calls', '', ...caseLevel.map((a) => `- ${describeCall(a)}`), '');
  }

  const used = emit?.facets ?? [];
  lines.push('## Facets', '');
  if (used.length === 0 && minted.length === 0) {
    lines.push('No facets yet.', '');
  } else {
    lines.push('| Facet | Name | Status | Best locator | Minted in this pass |', '|---|---|---|---|---|');
    for (const id of [...new Set([...used, ...minted])]) {
      const facet = facets.get(id);
      const locator = facet?.locators[0];
      const health = locator?.health !== undefined && !/^0\/0$/.test(locator.health) ? ` (${locator.health})` : '';
      const where = locator === undefined ? '' : `${locator.strategy} ${clip(locator.name ?? locator.value ?? locator.role ?? '', 50)}${health}`;
      lines.push(`| ${id} | ${md(facet?.displayName ?? '')} | ${facet?.status ?? 'unknown'} | ${md(where)} | ${minted.includes(id) ? 'yes' : ''} |`);
    }
    lines.push('');
  }

  lines.push('## Handoffs', '');
  if (handoffs.length === 0) {
    lines.push('None.', '');
  } else {
    for (const h of handoffs) {
      lines.push(`- **Step ${h.stepIndex}, ${h.blockage}** (${h.status}, ${h.handoffId}): ${clip(h.unresolvedIntent, 300)}`);
      if (h.candidates.length > 0) lines.push(`  - Candidates: ${h.candidates.map((c) => `${c.ref ?? ''}${c.role !== undefined ? ` ${c.role}` : ''} "${clip(c.name, 40)}"${c.why !== undefined ? ` (${clip(c.why, 80)})` : ''}`.trim()).join('; ')}`);
      if (h.proposedAssertion !== undefined) lines.push(`  - Proposed assertion: \`${clip(h.proposedAssertion, 200)}\``);
      if (h.nextMoves.length > 0) lines.push(`  - Next: ${h.nextMoves.map((m) => clip(m, 160)).join(' / ')}`);
      if (h.adoCommentUrl !== undefined) lines.push(`  - ADO comment: ${h.adoCommentUrl}`);
    }
    lines.push('');
  }

  lines.push('## Runs', '');
  if (runs.length === 0) {
    lines.push('Never run.', '');
  } else {
    lines.push('| When | Run | Outcome | Duration | Detail |', '|---|---|---|---|---|');
    for (const r of runs.slice(0, 20)) {
      const failedStep = r.steps.find((s) => s.outcome === 'failed');
      const detail = r.error !== undefined ? `${r.error.failureType}${r.error.facet !== undefined ? ` on ${r.error.facet}` : ''}: ${clip(r.error.message, 120)}` : failedStep !== undefined ? `step ${failedStep.index} failed` : '';
      lines.push(`| ${when(r.at)} | ${r.runId}${r.dataRow !== undefined ? ` row ${r.dataRow + 1}` : ''} | ${r.outcome} | ${(r.durationMs / 1000).toFixed(1)} s | ${md(detail)} |`);
    }
    if (runs.length > 20) lines.push('', `…and ${runs.length - 20} earlier runs.`);
    lines.push('');
  }

  if (reviews.length > 0) {
    lines.push('## Reviews', '', ...reviews.map((r) => `- ${when(r.at)}: ${r.decision} by ${r.reviewer}${r.changedLines !== undefined ? `, ${r.changedLines} lines changed` : ''}${r.facetsPromoted.length > 0 ? `; promoted ${r.facetsPromoted.join(', ')}` : ''}`), '');
  }
  return lines.join('\n');
};

/** Load the receipts (and the cached test case) and render the per-test receipt. */
export const authoringReceiptMarkdown = async (workspace: Workspace, testCaseId: string): Promise<string> => {
  const [set, testCase] = await Promise.all([loadReceipts(workspace), loadCase(workspace, testCaseId).catch(() => null)]);
  return authoringReceiptFrom(set, testCaseId, testCase);
};
