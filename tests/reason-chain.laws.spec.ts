import { expect, test } from '@playwright/test';
import { buildReasonChain, summarizeReasonChain } from '../lib/domain/resolution/reason-chain';
import type { ResolutionExhaustionEntry } from '../lib/domain/types/resolution';

// ─── Law: reason chain length equals exhaustion length ───

test('reason chain has one step per exhaustion entry', () => {
  const exhaustion: readonly ResolutionExhaustionEntry[] = [
    { stage: 'explicit', outcome: 'skipped', reason: 'No explicit resolution configured.' },
    { stage: 'approved-screen-knowledge', outcome: 'attempted', reason: 'Matched screen via alias "policy search".' },
    { stage: 'live-dom', outcome: 'resolved', reason: 'DOM candidate scored 0.95.' },
  ];
  const chain = buildReasonChain(exhaustion, 'live-dom');
  expect(chain.length).toBe(exhaustion.length);
});

// ─── Law: verdict mapping is exhaustive ───

test('outcome-to-verdict mapping: resolved→resolved, failed→failed, else→passed', () => {
  const outcomes: ReadonlyArray<ResolutionExhaustionEntry['outcome']> = ['attempted', 'resolved', 'skipped', 'failed'];
  const expectedVerdicts = ['passed', 'resolved', 'passed', 'failed'];

  const chain = buildReasonChain(
    outcomes.map((outcome, i) => ({
      stage: 'explicit' as const,
      outcome,
      reason: `reason-${i}`,
    })),
    'none',
  );

  expect(chain.map((s) => s.verdict)).toEqual(expectedVerdicts);
});

// ─── Law: candidate count is sum of top + rejected ───

test('candidatesEvaluated counts top + rejected candidates', () => {
  const entry: ResolutionExhaustionEntry = {
    stage: 'approved-screen-knowledge',
    outcome: 'attempted',
    reason: 'test',
    topCandidates: [
      { concern: 'screen', source: 'approved-screen-knowledge', value: 'screen-a', score: 0.9, reason: 'test' },
      { concern: 'screen', source: 'approved-screen-knowledge', value: 'screen-b', score: 0.8, reason: 'test' },
    ],
    rejectedCandidates: [
      { concern: 'screen', source: 'approved-screen-knowledge', value: 'screen-c', score: 0.2, reason: 'test' },
    ],
  };
  const chain = buildReasonChain([entry], 'approved-knowledge');
  expect(chain[0]!.candidatesEvaluated).toBe(3);
  expect(chain[0]!.topScore).toBe(0.9);
});

// ─── Law: empty exhaustion produces empty chain ───

test('empty exhaustion produces empty reason chain', () => {
  const chain = buildReasonChain([], 'none');
  expect(chain).toEqual([]);
});

// ─── Summarize: needs-human reports all-exhausted ───

test('summarize reports all rungs exhausted when no resolution', () => {
  const chain = buildReasonChain([
    { stage: 'explicit', outcome: 'failed', reason: 'No explicit.' },
    { stage: 'live-dom', outcome: 'failed', reason: 'No DOM match.' },
  ], 'none');
  const summary = summarizeReasonChain(chain);
  expect(summary).toContain('exhausted');
  expect(summary).toContain('No DOM match.');
});

// ─── Summarize: resolved chain mentions the winning rung ───

test('summarize mentions winning rung and failure reasons', () => {
  const chain = buildReasonChain([
    { stage: 'explicit', outcome: 'skipped', reason: 'Not configured.' },
    { stage: 'approved-screen-knowledge', outcome: 'resolved', reason: 'Matched via alias.' },
  ], 'approved-knowledge');
  const summary = summarizeReasonChain(chain);
  expect(summary).toContain('approved-screen-knowledge');
  expect(summary).toContain('resolved');
});
