import { expect, test } from '@playwright/test';
import {
  INITIAL_SCENE_STATE,
  accumulate,
  accumulateBatch,
  shouldCheckpoint,
  createCheckpoint,
  findNearestCheckpoint,
  type SceneState,
  type SceneCheckpoint,
} from '../lib/domain/projection/scene-state-accumulator';
import type { DashboardEventKind } from '../lib/domain/observation/dashboard';

// ─── Helpers ───

function makeEvent(type: DashboardEventKind, data: Record<string, unknown>, seq: number, iteration = 0, act: 1 | 2 | 3 | 4 | 5 | 6 | 7 = 1) {
  return { type, timestamp: `2026-01-01T00:00:${String(seq).padStart(2, '0')}.000Z`, sequenceNumber: seq, iteration, act, data };
}

test.describe('Scene State Accumulator laws', () => {

  test('Law 1: INITIAL_SCENE_STATE is empty — zero knowledge, zero metrics', () => {
    const s = INITIAL_SCENE_STATE;
    expect(s.iteration).toBe(0);
    expect(s.act).toBe(1);
    expect(s.sequenceNumber).toBe(0);
    expect(s.knowledgeNodes.size).toBe(0);
    expect(s.scenarioStatuses.size).toBe(0);
    expect(s.seenElements.size).toBe(0);
    expect(s.activeProposals.size).toBe(0);
    expect(s.metrics.knowledgeHitRate).toBe(0);
    expect(s.metrics.passRate).toBe(0);
    expect(s.metrics.scenariosExecuted).toBe(0);
    expect(s.cumulativeTokens).toBeNull();
    expect(s.wallClockMs).toBe(0);
  });

  test('Law 2: accumulate is pure — same input always produces same output', () => {
    const event = makeEvent('element-probed', { screen: 'home', element: 'btn', confidence: 0.8 }, 1, 0, 2);
    const result1 = accumulate(INITIAL_SCENE_STATE, event);
    const result2 = accumulate(INITIAL_SCENE_STATE, event);
    expect(result1.seenElements.size).toBe(result2.seenElements.size);
    expect(result1.knowledgeNodes.size).toBe(result2.knowledgeNodes.size);
    expect(result1.sequenceNumber).toBe(result2.sequenceNumber);
  });

  test('Law 3: accumulate updates sequence number and timestamp from event', () => {
    const event = makeEvent('progress', {}, 42, 3, 5);
    const result = accumulate(INITIAL_SCENE_STATE, event);
    expect(result.sequenceNumber).toBe(42);
    expect(result.iteration).toBe(3);
    expect(result.act).toBe(5);
    expect(result.timestamp).toBe(event.timestamp);
  });

  test('Law 4: element-probed adds to seenElements and knowledgeNodes', () => {
    const event = makeEvent('element-probed', { screen: 'login', element: 'username', confidence: 0.75 }, 1, 0, 2);
    const result = accumulate(INITIAL_SCENE_STATE, event);
    expect(result.seenElements.has('login:username')).toBe(true);
    expect(result.knowledgeNodes.has('login:username')).toBe(true);
    const node = result.knowledgeNodes.get('login:username')!;
    expect(node.confidence).toBe(0.75);
    expect(node.screen).toBe('login');
    expect(node.element).toBe('username');
    expect(node.status).toBe('learning');
  });

  test('Law 5: repeated element-probed raises confidence (max wins)', () => {
    const e1 = makeEvent('element-probed', { screen: 'home', element: 'btn', confidence: 0.5 }, 1, 0, 2);
    const e2 = makeEvent('element-probed', { screen: 'home', element: 'btn', confidence: 0.9 }, 2, 0, 2);
    const e3 = makeEvent('element-probed', { screen: 'home', element: 'btn', confidence: 0.3 }, 3, 0, 2);
    const result = accumulateBatch(INITIAL_SCENE_STATE, [e1, e2, e3]);
    expect(result.knowledgeNodes.get('home:btn')!.confidence).toBe(0.9);
  });

  test('Law 6: scenario-compiled sets status to compiled', () => {
    const event = makeEvent('scenario-compiled', { adoId: 'TC-123' }, 1, 0, 4);
    const result = accumulate(INITIAL_SCENE_STATE, event);
    expect(result.scenarioStatuses.get('TC-123')).toBe('compiled');
  });

  test('Law 7: scenario-executed sets status and updates pass metrics', () => {
    const pass = makeEvent('scenario-executed', { adoId: 'TC-1', passed: true }, 1, 0, 5);
    const fail = makeEvent('scenario-executed', { adoId: 'TC-2', passed: false }, 2, 0, 5);
    const result = accumulateBatch(INITIAL_SCENE_STATE, [pass, fail]);
    expect(result.scenarioStatuses.get('TC-1')).toBe('passed');
    expect(result.scenarioStatuses.get('TC-2')).toBe('failed');
    expect(result.metrics.scenariosExecuted).toBe(2);
    expect(result.metrics.scenariosPassed).toBe(1);
    expect(result.metrics.scenariosFailed).toBe(1);
  });

  test('Law 8: trust-policy-evaluated records proposal and updates metrics', () => {
    const approved = makeEvent('trust-policy-evaluated', { proposalId: 'P-1', decision: 'approved', artifactType: 'alias', confidence: 0.95 }, 1, 0, 6);
    const blocked = makeEvent('trust-policy-evaluated', { proposalId: 'P-2', decision: 'blocked', artifactType: 'hint', confidence: 0.3 }, 2, 0, 6);
    const result = accumulateBatch(INITIAL_SCENE_STATE, [approved, blocked]);
    expect(result.activeProposals.get('P-1')!.decision).toBe('approved');
    expect(result.activeProposals.get('P-2')!.decision).toBe('blocked');
    expect(result.metrics.proposalsActivated).toBe(1);
    expect(result.metrics.proposalsBlocked).toBe(1);
  });

  test('Law 9: knowledge-activated strengthens node to approved status', () => {
    const probe = makeEvent('element-probed', { screen: 'claims', element: 'search', confidence: 0.5 }, 1, 0, 2);
    const activate = makeEvent('knowledge-activated', { proposalId: 'P-1', screen: 'claims', element: 'search', newConfidence: 0.95, activatedAliases: ['alt1', 'alt2'] }, 2, 0, 6);
    const result = accumulateBatch(INITIAL_SCENE_STATE, [probe, activate]);
    const node = result.knowledgeNodes.get('claims:search')!;
    expect(node.status).toBe('approved');
    expect(node.confidence).toBe(0.95);
    expect(node.aliasCount).toBe(2);
  });

  test('Law 10: convergence-evaluated updates knowledge hit rate', () => {
    const event = makeEvent('convergence-evaluated', { knowledgeHitRate: 0.87 }, 1, 3, 7);
    const result = accumulate(INITIAL_SCENE_STATE, event);
    expect(result.metrics.knowledgeHitRate).toBe(0.87);
  });

  test('Law 11: iteration-summary accumulates wall clock and tokens', () => {
    const s1 = makeEvent('iteration-summary', { wallClockMs: 5000, tokenEstimate: 100 }, 1, 1, 7);
    const s2 = makeEvent('iteration-summary', { wallClockMs: 3000, tokenEstimate: 80 }, 2, 2, 7);
    const result = accumulateBatch(INITIAL_SCENE_STATE, [s1, s2]);
    expect(result.wallClockMs).toBe(8000);
    expect(result.cumulativeTokens).toBe(180);
  });

  test('Law 12: accumulateBatch is equivalent to sequential accumulate calls', () => {
    const events = [
      makeEvent('element-probed', { screen: 'a', element: 'x', confidence: 0.5 }, 1, 0, 2),
      makeEvent('scenario-compiled', { adoId: 'TC-1' }, 2, 0, 4),
      makeEvent('scenario-executed', { adoId: 'TC-1', passed: true }, 3, 0, 5),
    ];
    const batchResult = accumulateBatch(INITIAL_SCENE_STATE, events);
    const sequentialResult = events.reduce<SceneState>(accumulate, INITIAL_SCENE_STATE);
    expect(batchResult.sequenceNumber).toBe(sequentialResult.sequenceNumber);
    expect(batchResult.seenElements.size).toBe(sequentialResult.seenElements.size);
    expect(batchResult.scenarioStatuses.get('TC-1')).toBe(sequentialResult.scenarioStatuses.get('TC-1'));
  });

  test('Law 13: unknown event types pass through without modifying state (except metadata)', () => {
    const event = makeEvent('diagnostics' as DashboardEventKind, { message: 'test' }, 99, 2, 3);
    const result = accumulate(INITIAL_SCENE_STATE, event);
    expect(result.sequenceNumber).toBe(99);
    expect(result.iteration).toBe(2);
    expect(result.knowledgeNodes.size).toBe(0);
    expect(result.metrics.scenariosExecuted).toBe(0);
  });

  test('Law 14: shouldCheckpoint fires at interval boundaries', () => {
    expect(shouldCheckpoint(0, 100)).toBe(false);
    expect(shouldCheckpoint(50, 100)).toBe(false);
    expect(shouldCheckpoint(100, 100)).toBe(true);
    expect(shouldCheckpoint(200, 100)).toBe(true);
    expect(shouldCheckpoint(1000, 1000)).toBe(true);
    expect(shouldCheckpoint(999, 1000)).toBe(false);
  });

  test('Law 15: findNearestCheckpoint returns closest preceding checkpoint', () => {
    const checkpoints: readonly SceneCheckpoint[] = [
      createCheckpoint({ ...INITIAL_SCENE_STATE, sequenceNumber: 100 }),
      createCheckpoint({ ...INITIAL_SCENE_STATE, sequenceNumber: 200 }),
      createCheckpoint({ ...INITIAL_SCENE_STATE, sequenceNumber: 300 }),
    ];
    // Target at exactly a checkpoint
    expect(findNearestCheckpoint(checkpoints, 200)!.sequenceNumber).toBe(200);
    // Target between checkpoints
    expect(findNearestCheckpoint(checkpoints, 250)!.sequenceNumber).toBe(200);
    // Target past all checkpoints
    expect(findNearestCheckpoint(checkpoints, 500)!.sequenceNumber).toBe(300);
    // Target before first checkpoint
    expect(findNearestCheckpoint(checkpoints, 50)).toBeNull();
    // Empty checkpoints
    expect(findNearestCheckpoint([], 100)).toBeNull();
  });

  test('Law 16: step-executing marks scenario as executing', () => {
    const event = makeEvent('step-executing', { adoId: 'TC-5', stepIndex: 0 }, 1, 0, 5);
    const result = accumulate(INITIAL_SCENE_STATE, event);
    expect(result.scenarioStatuses.get('TC-5')).toBe('executing');
  });

  test('Law 17: step-executing does not overwrite passed/failed status', () => {
    const executed = makeEvent('scenario-executed', { adoId: 'TC-5', passed: true }, 1, 0, 5);
    const executing = makeEvent('step-executing', { adoId: 'TC-5', stepIndex: 0 }, 2, 1, 5);
    const result = accumulateBatch(INITIAL_SCENE_STATE, [executed, executing]);
    expect(result.scenarioStatuses.get('TC-5')).toBe('passed');
  });

  test('Law 18: step-resolved increments stepsResolved or stepsUnresolved', () => {
    const success = makeEvent('step-resolved', { success: true }, 1, 0, 5);
    const failure = makeEvent('step-resolved', { success: false }, 2, 0, 5);
    const result = accumulateBatch(INITIAL_SCENE_STATE, [success, failure]);
    expect(result.metrics.stepsResolved).toBe(1);
    expect(result.metrics.stepsUnresolved).toBe(1);
  });
});
