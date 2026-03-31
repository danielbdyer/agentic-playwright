import { Context, Effect } from 'effect';
import type { AgentWorkItem, DashboardEvent, WorkItemDecision } from '../../domain/types';

export interface DashboardPort {
  readonly emit: (event: DashboardEvent) => Effect.Effect<void, never, never>;
  readonly awaitDecision: (item: AgentWorkItem) => Effect.Effect<WorkItemDecision, never, never>;
}

export const DisabledDashboard: DashboardPort = {
  emit: () => Effect.succeed(undefined),
  awaitDecision: (item) => Effect.succeed({
    workItemId: item.id,
    status: 'skipped' as const,
    rationale: 'No dashboard connected — headless auto-skip',
  }),
};

export class Dashboard extends Context.Tag('tesseract/Dashboard')<Dashboard, DashboardPort>() {}

export interface StageTracerPort {
  readonly emitStageStart: (data: unknown) => Effect.Effect<void, never, never>;
  readonly emitStageComplete: (data: unknown) => Effect.Effect<void, never, never>;
}

export const DisabledStageTracer: StageTracerPort = {
  emitStageStart: () => Effect.succeed(undefined),
  emitStageComplete: () => Effect.succeed(undefined),
};

export class StageTracer extends Context.Tag('tesseract/StageTracer')<StageTracer, StageTracerPort>() {}
