import { expect, test } from '@playwright/test';
import { buildCausalChain, summarizeCausalChain } from '../lib/domain/causal-chain';
import type { CausalChainInput } from '../lib/domain/causal-chain';
import type { ResolutionReasonChain } from '../lib/domain/types/resolution';

// ─── Helpers ───

const minimalInput = (overrides: Partial<CausalChainInput> = {}): CausalChainInput => ({
  stepIndex: 0,
  actionText: 'Click submit',
  failureFamily: 'locator-degradation-failure',
  failureCode: null,
  failureMessage: null,
  reasonChain: null,
  consoleErrors: [],
  preconditionFailures: [],
  ...overrides,
});

// ─── Law: simple failure produces outcome + minimal chain ───

test('simple failure with no extras produces exactly one outcome node', () => {
  const chain = buildCausalChain(minimalInput());
  expect(chain.nodes.length).toBe(1);
  expect(chain.nodes[0]!.kind).toBe('outcome');
  expect(chain.edges.length).toBe(0);
});

test('simple failure chain is a valid CausalChain envelope', () => {
  const chain = buildCausalChain(minimalInput());
  expect(chain.kind).toBe('causal-chain');
  expect(chain.version).toBe(1);
  expect(chain.rootNodeId).toBe(chain.nodes[0]!.id);
});

// ─── Law: reason chain → rung nodes connected ───

test('reason chain rungs produce action nodes with edges', () => {
  const reasonChain: ResolutionReasonChain = [
    { rung: 'explicit', verdict: 'passed', reason: 'No explicit.', candidatesEvaluated: 0 },
    { rung: 'approved-screen-knowledge', verdict: 'passed', reason: 'Tried screen knowledge.', candidatesEvaluated: 2 },
    { rung: 'live-dom', verdict: 'failed', reason: 'DOM candidate scored too low.', candidatesEvaluated: 3 },
  ];

  const chain = buildCausalChain(minimalInput({ reasonChain }));

  const actionNodes = chain.nodes.filter((n) => n.kind === 'action');
  expect(actionNodes.length).toBe(3);
  expect(actionNodes[0]!.rung).toBe('explicit');
  expect(actionNodes[1]!.rung).toBe('approved-screen-knowledge');
  expect(actionNodes[2]!.rung).toBe('live-dom');

  // Each consecutive pair + tail edge to outcome = 3 edges
  const reasonEdges = chain.edges.filter(
    (e) => e.from.includes('-action-') || e.to.includes('-action-'),
  );
  expect(reasonEdges.length).toBe(3);
});

// ─── Law: precondition failures → blocked-by edges ───

test('precondition failures produce condition nodes with blocked-by edges', () => {
  const chain = buildCausalChain(
    minimalInput({
      preconditionFailures: ['Page not loaded', 'Element not visible'],
    }),
  );

  const conditionNodes = chain.nodes.filter((n) => n.kind === 'condition');
  expect(conditionNodes.length).toBe(2);

  const blockedEdges = chain.edges.filter((e) => e.relation === 'blocked-by');
  expect(blockedEdges.length).toBe(2);
  expect(blockedEdges.every((e) => e.to.includes('-outcome-'))).toBe(true);
});

// ─── Law: console errors → trigger nodes with caused-by edges ───

test('console errors produce trigger nodes with caused-by edges', () => {
  const chain = buildCausalChain(
    minimalInput({
      consoleErrors: ['TypeError: Cannot read property "x" of null'],
    }),
  );

  const triggerNodes = chain.nodes.filter((n) => n.kind === 'trigger');
  expect(triggerNodes.length).toBe(1);
  expect(triggerNodes[0]!.detail).toBe('TypeError: Cannot read property "x" of null');

  const causedByEdges = chain.edges.filter((e) => e.relation === 'caused-by');
  expect(causedByEdges.length).toBe(1);
});

// ─── Law: root cause identification ───

test('root cause is first trigger when console errors present', () => {
  const chain = buildCausalChain(
    minimalInput({
      consoleErrors: ['NetworkError: 500', 'TypeError: undefined'],
      preconditionFailures: ['Page not loaded'],
    }),
  );

  expect(chain.rootCause).toBe('NetworkError: 500');
  expect(chain.rootNodeId).toContain('-trigger-');
});

test('root cause is first precondition when no triggers but conditions exist', () => {
  const chain = buildCausalChain(
    minimalInput({
      preconditionFailures: ['Required state not reached'],
    }),
  );

  expect(chain.rootCause).toBe('Required state not reached');
  expect(chain.rootNodeId).toContain('-condition-');
});

test('root cause falls back to failure family when no triggers or conditions', () => {
  const chain = buildCausalChain(minimalInput());
  expect(chain.rootCause).toBe('locator-degradation-failure');
});

test('root cause uses failureMessage when available and no triggers/conditions', () => {
  const chain = buildCausalChain(
    minimalInput({ failureMessage: 'Locator timed out after 5000ms' }),
  );
  expect(chain.rootCause).toBe('Locator timed out after 5000ms');
});

// ─── Law: summary generation ───

test('summary includes step index, action text, and failure family', () => {
  const chain = buildCausalChain(
    minimalInput({ stepIndex: 3, actionText: 'Fill username' }),
  );
  const summary = summarizeCausalChain(chain);
  expect(summary).toContain('Step 3');
  expect(summary).toContain('Fill username');
  expect(summary).toContain('locator-degradation-failure');
});

test('summary mentions console error count when present', () => {
  const chain = buildCausalChain(
    minimalInput({ consoleErrors: ['err1', 'err2'] }),
  );
  expect(summarizeCausalChain(chain)).toContain('2 console error(s)');
});

test('summary mentions precondition failure count when present', () => {
  const chain = buildCausalChain(
    minimalInput({ preconditionFailures: ['p1'] }),
  );
  expect(summarizeCausalChain(chain)).toContain('1 precondition failure(s)');
});

test('summary mentions rung count when reason chain present', () => {
  const chain = buildCausalChain(
    minimalInput({
      reasonChain: [
        { rung: 'explicit', verdict: 'passed', reason: 'n/a', candidatesEvaluated: 0 },
        { rung: 'live-dom', verdict: 'failed', reason: 'n/a', candidatesEvaluated: 1 },
      ],
    }),
  );
  expect(summarizeCausalChain(chain)).toContain('2 resolution rung(s) traversed');
});

// ─── Law: empty inputs → minimal valid chain ───

test('empty reason chain, no errors, no preconditions → valid minimal chain', () => {
  const chain = buildCausalChain(minimalInput({ reasonChain: [] }));
  expect(chain.nodes.length).toBe(1);
  expect(chain.nodes[0]!.kind).toBe('outcome');
  expect(chain.edges.length).toBe(0);
  expect(chain.rootNodeId).toBe(chain.nodes[0]!.id);
});

// ─── Law: node IDs are deterministic ───

test('node IDs are deterministic across repeated builds', () => {
  const input = minimalInput({
    stepIndex: 5,
    consoleErrors: ['err'],
    preconditionFailures: ['pre'],
    reasonChain: [
      { rung: 'explicit', verdict: 'passed', reason: 'r', candidatesEvaluated: 0 },
    ],
  });

  const chain1 = buildCausalChain(input);
  const chain2 = buildCausalChain(input);

  expect(chain1.nodes.map((n) => n.id)).toEqual(chain2.nodes.map((n) => n.id));
  expect(chain1.edges).toEqual(chain2.edges);
});

test('node IDs follow causal-{stepIndex}-{kind}-{index} pattern', () => {
  const chain = buildCausalChain(
    minimalInput({
      stepIndex: 7,
      consoleErrors: ['e1'],
      preconditionFailures: ['p1'],
      reasonChain: [
        { rung: 'explicit', verdict: 'passed', reason: 'r', candidatesEvaluated: 0 },
      ],
    }),
  );

  expect(chain.nodes.find((n) => n.kind === 'outcome')?.id).toBe('causal-7-outcome-0');
  expect(chain.nodes.find((n) => n.kind === 'action')?.id).toBe('causal-7-action-0');
  expect(chain.nodes.find((n) => n.kind === 'condition')?.id).toBe('causal-7-condition-0');
  expect(chain.nodes.find((n) => n.kind === 'trigger')?.id).toBe('causal-7-trigger-0');
});

// ─── Law: all edges reference valid node IDs ───

test('every edge references existing node IDs', () => {
  const chain = buildCausalChain(
    minimalInput({
      consoleErrors: ['err'],
      preconditionFailures: ['pre'],
      reasonChain: [
        { rung: 'explicit', verdict: 'passed', reason: 'r', candidatesEvaluated: 0 },
        { rung: 'live-dom', verdict: 'failed', reason: 'r', candidatesEvaluated: 1 },
      ],
    }),
  );

  const nodeIds = new Set(chain.nodes.map((n) => n.id));
  for (const edge of chain.edges) {
    expect(nodeIds.has(edge.from)).toBe(true);
    expect(nodeIds.has(edge.to)).toBe(true);
  }
});
