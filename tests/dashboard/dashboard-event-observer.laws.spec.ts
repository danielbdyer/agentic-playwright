import { expect, test } from '@playwright/test';
import { QueryClient } from '@tanstack/react-query';
import {
  DASHBOARD_EVENT_KINDS,
  createDashboardEventObserver,
  dispatchDashboardEvent,
  type DashboardEventObserverDependencies,
} from '../../dashboard/src/hooks/dashboard-event-observer';
import type { KnowledgeNode } from '../../dashboard/src/spatial/types';
import type { ScreenId } from '../../lib/domain/identity';

const noop = (): void => void 0;

const createNoopDependencies = (queryClient: QueryClient): DashboardEventObserverDependencies => ({
  queryClient,
  iterationStart: noop,
  iterationComplete: noop,
  progress: noop,
  elementProbed: noop,
  screenCaptured: noop,
  itemPending: noop,
  itemProcessing: noop,
  itemCompleted: noop,
  elementEscalated: noop,
  fiberPaused: noop,
  fiberResumed: noop,
  rungShift: noop,
  calibrationUpdate: noop,
  proposalActivated: noop,
  artifactWritten: noop,
  stageLifecycle: noop,
});

test.describe('dashboard event observer laws', () => {
  test('every dashboard event kind is covered exactly once', () => {
    expect(new Set(DASHBOARD_EVENT_KINDS).size).toBe(DASHBOARD_EVENT_KINDS.length);
    expect(DASHBOARD_EVENT_KINDS).toContain('iteration-start');
    expect(DASHBOARD_EVENT_KINDS).toContain('iteration-complete');
    expect(DASHBOARD_EVENT_KINDS).toContain('screen-group-start');
    expect(DASHBOARD_EVENT_KINDS).toContain('confidence-crossed');
    expect(DASHBOARD_EVENT_KINDS).toContain('inbox-item-arrived');
    expect(DASHBOARD_EVENT_KINDS).toContain('connected');
    expect(DASHBOARD_EVENT_KINDS).toContain('error');
  });

  test('projection events update the dashboard caches through the typed observer', () => {
    const queryClient = new QueryClient();
    const observer = createDashboardEventObserver(createNoopDependencies(queryClient));

    const workbench = {
      generatedAt: '2026-03-27T00:00:00.000Z',
      iteration: 7,
      items: [],
      completions: [],
      summary: { total: 0, pending: 0, completed: 0, byKind: {}, topPriority: null },
    };
    const scorecard = {
      highWaterMark: {
        knowledgeHitRate: 0.88,
        translationPrecision: 0.75,
        convergenceVelocity: 3,
        proposalYield: 0.5,
      },
    };

    dispatchDashboardEvent(observer, { type: 'workbench-updated', data: workbench });
    dispatchDashboardEvent(observer, { type: 'fitness-updated', data: scorecard });

    expect(queryClient.getQueryData(['workbench'])).toEqual(workbench);
    expect(queryClient.getQueryData(['fitness'])).toEqual(scorecard);
  });

  test('confidence-crossed rewrites matching knowledge nodes and records the event', () => {
    const queryClient = new QueryClient();
    const observer = createDashboardEventObserver(createNoopDependencies(queryClient));
    const nodes: readonly KnowledgeNode[] = [
      {
        screen: 'dashboard',
        element: 'saveButton',
        confidence: 0.41,
        aliases: ['save'],
        status: 'learning',
        lastActor: 'system',
        governance: 'approved',
      },
      {
        screen: 'dashboard',
        element: 'cancelButton',
        confidence: 0.93,
        aliases: ['cancel'],
        status: 'approved',
        lastActor: 'agent',
        governance: 'approved',
      },
    ];
    const event = {
      artifactId: 'artifact-123',
      screen: 'dashboard',
      element: 'saveButton',
      previousStatus: 'learning',
      newStatus: 'approved-equivalent' as const,
      score: 0.92,
      threshold: 0.8,
    };

    queryClient.setQueryData(['knowledge-nodes'], nodes);
    dispatchDashboardEvent(observer, { type: 'confidence-crossed', data: event });

    expect(queryClient.getQueryData(['confidence-crossings'])).toEqual([event]);
    expect(queryClient.getQueryData(['knowledge-nodes'])).toEqual([
      {
        ...nodes[0],
        confidence: 0.92,
        status: 'approved',
      },
      nodes[1],
    ]);
  });

  test('iteration lifecycle events are routed through the typed observer', () => {
    const events: string[] = [];
    const observer = createDashboardEventObserver({
      ...createNoopDependencies(new QueryClient()),
      iterationStart: (event) => events.push(`start:${event.iteration}/${event.maxIterations}`),
      iterationComplete: (event) => events.push(`complete:${event.iteration}:${event.converged}`),
    });

    dispatchDashboardEvent(observer, {
      type: 'iteration-start',
      data: { iteration: 3, maxIterations: 7 },
    });
    dispatchDashboardEvent(observer, {
      type: 'iteration-complete',
      data: {
        iteration: 3,
        durationMs: 42,
        knowledgeHitRate: 0.5,
        proposalsActivated: 2,
        proposalsBlocked: 1,
        converged: false,
        convergenceReason: null,
      },
    });

    expect(events).toEqual(['start:3/7', 'complete:3:false']);
  });

  test('screen-group, escalation, connection, and error events update observation caches', () => {
    const queryClient = new QueryClient();
    const observer = createDashboardEventObserver(createNoopDependencies(queryClient));
    const screenGroup = {
      screen: {
        screen: 'policy-search' as ScreenId,
        url: '/policy-search.html',
        routeVariantRefs: [],
        screenAliases: ['policy-search'],
        knowledgeRefs: [],
        supplementRefs: [],
        elements: [],
        sectionSnapshots: [],
      },
      workItems: [],
      totalOccurrences: 3,
    };
    const escalation = {
      id: 'esc-1',
      element: 'searchButton',
      screen: 'policy-search',
      fromActor: 'system' as const,
      toActor: 'operator' as const,
      reason: 'needs review',
      governance: 'review-required' as const,
      boundingBox: null,
    };
    const error = {
      message: 'WebSocket transport error',
      cause: 'close',
    };

    dispatchDashboardEvent(observer, { type: 'screen-group-start', data: screenGroup });
    dispatchDashboardEvent(observer, { type: 'element-escalated', data: escalation });
    dispatchDashboardEvent(observer, { type: 'connected', data: { connected: true } });
    dispatchDashboardEvent(observer, { type: 'error', data: error });

    expect(queryClient.getQueryData(['screen-group-start'])).toEqual(screenGroup);
    expect(queryClient.getQueryData(['element-escalations'])).toEqual([escalation]);
    expect(queryClient.getQueryData(['dashboard-connection'])).toEqual({ connected: false });
    expect(queryClient.getQueryData(['dashboard-error'])).toEqual(error);
  });
});
