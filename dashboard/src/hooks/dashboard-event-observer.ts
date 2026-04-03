import type { QueryClient } from '@tanstack/react-query';
import type { WorkItemDecision } from '../../../lib/domain/types/dashboard';
import type { AgentWorkItem, ScreenGroupContext } from '../../../lib/domain/types/workbench';
import {
  DASHBOARD_EVENT_KINDS,
  isDashboardEventKind,
} from '../projections/events/dashboard-event-metadata';
export {
  DASHBOARD_EVENT_KINDS,
  isDashboardEventKind,
} from '../projections/events/dashboard-event-metadata';
import type {
  ArtifactWrittenEvent,
  CalibrationUpdateEvent,
  ConfidenceCrossedEvent,
  ElementEscalatedEvent,
  FiberPauseEvent,
  FiberResumeEvent,
  InboxItemEvent,
  ProposalActivatedEvent,
  ProbeEvent,
  RungShiftEvent,
  ScreenCapture,
  StageLifecycleEvent,
} from '../spatial/types';
import type { ProgressEvent, Scorecard, Workbench } from '../types';
import type { KnowledgeNode } from '../spatial/types';

interface IterationStartEvent {
  readonly iteration: number;
  readonly maxIterations: number;
}

interface IterationCompleteEvent {
  readonly iteration: number;
  readonly durationMs: number;
  readonly knowledgeHitRate: number;
  readonly proposalsActivated: number;
  readonly proposalsBlocked: number;
  readonly converged: boolean;
  readonly convergenceReason: string | null;
}

export type EventObserver<TEventMap extends object> = {
  readonly [K in keyof TEventMap]: (data: TEventMap[K]) => void;
};

export type EventMessage<TEventMap extends object> = {
  [K in keyof TEventMap]: { readonly type: K; readonly data: TEventMap[K] };
}[keyof TEventMap];

export type DashboardEventMessage = EventMessage<DashboardEventMap>;

const appendRecent = <T,>(
  current: readonly T[] | null | undefined,
  event: T,
  limit = 16,
): readonly T[] => [...(current ?? []), event].slice(-limit);

export interface DashboardEventMap {
  readonly 'iteration-start': IterationStartEvent;
  readonly 'iteration-complete': IterationCompleteEvent;
  readonly progress: ProgressEvent;
  readonly 'element-probed': ProbeEvent;
  readonly 'screen-captured': ScreenCapture;
  readonly 'item-pending': AgentWorkItem;
  readonly 'item-processing': Readonly<{ readonly workItemId: string }>;
  readonly 'item-completed': WorkItemDecision;
  readonly 'workbench-updated': Workbench;
  readonly 'fitness-updated': Scorecard;
  readonly 'element-escalated': ElementEscalatedEvent;
  readonly 'inbox-item-arrived': InboxItemEvent;
  readonly 'fiber-paused': FiberPauseEvent;
  readonly 'fiber-resumed': FiberResumeEvent;
  readonly 'rung-shift': RungShiftEvent;
  readonly 'calibration-update': CalibrationUpdateEvent;
  readonly 'proposal-activated': ProposalActivatedEvent;
  readonly 'confidence-crossed': ConfidenceCrossedEvent;
  readonly 'artifact-written': ArtifactWrittenEvent;
  readonly 'stage-lifecycle': StageLifecycleEvent;
  readonly 'screen-group-start': ScreenGroupContext;
  readonly connected: Readonly<{ readonly connected: boolean }>;
  readonly error: Readonly<{ readonly message: string; readonly cause?: string }>;
}

const knowledgeNodeStatusFromConfidence = (
  status: ConfidenceCrossedEvent['newStatus'],
): KnowledgeNode['status'] => (status === 'approved-equivalent' ? 'approved' : status);

export const dispatchDashboardEvent = <K extends keyof DashboardEventMap>(
  observer: EventObserver<DashboardEventMap>,
  message: { readonly type: K; readonly data: DashboardEventMap[K] },
): void => {
  observer[message.type](message.data);
};

export const projectKnowledgeNodesAfterConfidenceCrossing = (
  nodes: readonly KnowledgeNode[] | null | undefined,
  event: ConfidenceCrossedEvent,
): readonly KnowledgeNode[] =>
  (nodes ?? []).map((node) => {
    const matchesScreen = event.screen !== null && node.screen === event.screen;
    const matchesElement = event.element === null || node.element === event.element;
    return matchesScreen && matchesElement
      ? {
          ...node,
          confidence: event.score,
          status: knowledgeNodeStatusFromConfidence(event.newStatus),
        }
      : node;
  });

export interface DashboardEventObserverDependencies {
  readonly queryClient: QueryClient;
  readonly iterationStart: (data: IterationStartEvent) => void;
  readonly iterationComplete: (data: IterationCompleteEvent) => void;
  readonly progress: (data: ProgressEvent) => void;
  readonly elementProbed: (data: ProbeEvent) => void;
  readonly screenCaptured: (data: ScreenCapture) => void;
  readonly itemPending: (data: AgentWorkItem) => void;
  readonly itemProcessing: (data: Readonly<{ readonly workItemId: string }>) => void;
  readonly itemCompleted: (data: WorkItemDecision) => void;
  readonly elementEscalated: (data: ElementEscalatedEvent) => void;
  readonly fiberPaused: (data: FiberPauseEvent) => void;
  readonly fiberResumed: (data: FiberResumeEvent) => void;
  readonly rungShift: (data: RungShiftEvent) => void;
  readonly calibrationUpdate: (data: CalibrationUpdateEvent) => void;
  readonly proposalActivated: (data: ProposalActivatedEvent) => void;
  readonly artifactWritten: (data: ArtifactWrittenEvent) => void;
  readonly stageLifecycle: (data: StageLifecycleEvent) => void;
}

export const createDashboardEventObserver = (
  deps: DashboardEventObserverDependencies,
): EventObserver<DashboardEventMap> => {
  const observer = {
    'iteration-start': deps.iterationStart,
    'iteration-complete': deps.iterationComplete,
    progress: deps.progress,
    'element-probed': deps.elementProbed,
    'screen-captured': deps.screenCaptured,
    'item-pending': deps.itemPending,
    'item-processing': deps.itemProcessing,
    'item-completed': deps.itemCompleted,
    'workbench-updated': (workbench) => {
      deps.queryClient.setQueryData(['workbench'], workbench);
    },
    'fitness-updated': (scorecard) => {
      deps.queryClient.setQueryData(['fitness'], scorecard);
    },
    'element-escalated': (event) => {
      deps.queryClient.setQueryData<readonly ElementEscalatedEvent[]>(['element-escalations'], (current) =>
        appendRecent(current, event),
      );
      deps.elementEscalated(event);
    },
    'inbox-item-arrived': (event) => {
      deps.queryClient.setQueryData<readonly InboxItemEvent[]>(['inbox-items'], (current) =>
        appendRecent(current, event),
      );
    },
    'fiber-paused': deps.fiberPaused,
    'fiber-resumed': deps.fiberResumed,
    'rung-shift': deps.rungShift,
    'calibration-update': deps.calibrationUpdate,
    'proposal-activated': deps.proposalActivated,
    'confidence-crossed': (event) => {
      deps.queryClient.setQueryData<readonly ConfidenceCrossedEvent[]>(['confidence-crossings'], (current) =>
        appendRecent(current, event),
      );
      deps.queryClient.setQueryData<readonly KnowledgeNode[]>(['knowledge-nodes'], (current) =>
        projectKnowledgeNodesAfterConfidenceCrossing(current ?? null, event),
      );
    },
    'artifact-written': deps.artifactWritten,
    'stage-lifecycle': deps.stageLifecycle,
    'screen-group-start': (group) => {
      deps.queryClient.setQueryData<ScreenGroupContext | null>(['screen-group-start'], group);
    },
    connected: (event) => {
      deps.queryClient.setQueryData(['dashboard-connection'], event);
      deps.queryClient.setQueryData(['dashboard-error'], null);
    },
    error: (event) => {
      deps.queryClient.setQueryData(['dashboard-connection'], { connected: false } as const);
      deps.queryClient.setQueryData(['dashboard-error'], event);
    },
  } satisfies EventObserver<DashboardEventMap>;

  return observer;
};
