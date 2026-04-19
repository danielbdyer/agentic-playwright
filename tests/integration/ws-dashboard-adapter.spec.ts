import { expect, test } from '@playwright/test';
import { Duration, Effect, Fiber } from 'effect';
import type { AdoId } from '../../product/domain/kernel/identity';
import type { AgentWorkItem } from '../../product/domain/handshake/workbench';
import type { DashboardEvent } from '../../product/domain/observation/dashboard';
import { createWsDashboardAdapter } from '../../dashboard/bridges/ws-dashboard-adapter';
import type { WsBroadcaster } from '../../dashboard/bridges/ws-dashboard-adapter';

interface MockBroadcaster extends WsBroadcaster {
  readonly broadcasts: DashboardEvent[];
  readonly onMessageHandlers: Array<(msg: Record<string, unknown>) => void>;
  readonly emitMessage: (msg: Record<string, unknown>) => void;
}

const createMockBroadcaster = (): MockBroadcaster => {
  const broadcasts: DashboardEvent[] = [];
  const onMessageHandlers: Array<(msg: Record<string, unknown>) => void> = [];

  return {
    broadcasts,
    onMessageHandlers,
    emitMessage: (msg) => {
      onMessageHandlers.forEach((handler) => handler(msg));
    },
    broadcast: (data: unknown) => {
      broadcasts.push(data as DashboardEvent);
    },
    onMessage: (handler: (msg: Record<string, unknown>) => void) => {
      onMessageHandlers.push(handler);
    },
  };
};

const workItem = (id: string): AgentWorkItem => ({
  id,
  kind: 'approve-proposal',
  priority: 0.9,
  title: `Work item ${id}`,
  rationale: 'Needs decision',
  adoId: 'ado-1' as AdoId,
  iteration: 1,
  actions: [],
  context: {
    artifactRefs: [],
  },
  evidence: {
    confidence: 0.4,
    sources: [],
  },
  linkedProposals: [],
  linkedHotspots: [],
  linkedBottlenecks: [],
});

test.describe('WS dashboard adapter decision lifecycle', () => {
  test('resolves decision before timeout and emits item-completed', async () => {
    const ws = createMockBroadcaster();
    const adapter = createWsDashboardAdapter(ws, { decisionTimeoutMs: 100 });
    const item = workItem('wi-before-timeout');

    const decisionPromise = Effect.runPromise(adapter.awaitDecision(item));

    ws.emitMessage({
      type: 'decision',
      workItemId: item.id,
      status: 'completed',
      rationale: 'Operator approved',
    });

    const decision = await decisionPromise;
    const eventTypes = ws.broadcasts.map((event) => event.type);

    expect(decision).toEqual({
      workItemId: item.id,
      status: 'completed',
      rationale: 'Operator approved',
    });
    expect(eventTypes).toEqual(['item-pending', 'item-completed']);
  });

  test('auto-skips on timeout and emits timeout completion', async () => {
    const ws = createMockBroadcaster();
    const adapter = createWsDashboardAdapter(ws, { decisionTimeoutMs: 25 });
    const item = workItem('wi-timeout');

    const decision = await Effect.runPromise(adapter.awaitDecision(item));
    const eventTypes = ws.broadcasts.map((event) => event.type);

    expect(decision.workItemId).toBe(item.id);
    expect(decision.status).toBe('skipped');
    expect(decision.rationale).toContain('Dashboard timeout');
    expect(eventTypes).toEqual(['item-pending', 'item-completed']);
  });

  test('cleans pending registry on fiber interruption', async () => {
    const ws = createMockBroadcaster();
    const adapter = createWsDashboardAdapter(ws, { decisionTimeoutMs: 1000 });
    const item = workItem('wi-interrupt');

    await Effect.runPromise(Effect.gen(function* () {
      const fiber = yield* Effect.fork(adapter.awaitDecision(item));
      yield* Effect.sleep(Duration.millis(10));
      yield* Fiber.interrupt(fiber);
    }));

    ws.emitMessage({
      type: 'decision',
      workItemId: item.id,
      status: 'completed',
      rationale: 'Too late',
    });

    const eventTypes = ws.broadcasts.map((event) => event.type);
    expect(eventTypes).toEqual(['item-pending']);
  });
});
