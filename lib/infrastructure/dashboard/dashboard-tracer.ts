/**
 * Dashboard Tracer — taps Effect spans for automatic pipeline stage visualization.
 *
 * Effect.withSpan() is used throughout the pipeline (13+ spans covering bind,
 * compile, run, emit, graph, workbench). This tracer intercepts span lifecycle
 * events and emits them as 'stage-lifecycle' dashboard events — giving the
 * visualization a real-time pipeline progress meter with zero per-stage
 * instrumentation.
 *
 * Pure infrastructure adapter: Tracer → DashboardPort.
 */

import { Effect, Layer } from 'effect';
import type { DashboardPort } from '../../application/ports';
import { dashboardEvent } from '../../domain/types/dashboard';

/**
 * Create an Effect Layer that intercepts span start/end and emits
 * stage-lifecycle dashboard events. The dashboard port must already
 * be available — this layer composes on top of the service layer.
 */
export function createDashboardTracerLayer(dashboard: DashboardPort) {
  // Track span start times for duration computation
  const spanStarts = new Map<string, number>();

  return {
    onSpanStart(spanName: string, attributes?: Record<string, unknown>): void {
      spanStarts.set(spanName, Date.now());
      Effect.runPromise(
        dashboard.emit(dashboardEvent('stage-lifecycle', {
          stage: spanName,
          phase: 'start',
          adoId: attributes?.adoId as string | undefined,
        })),
      ).catch(() => { /* fire-and-forget */ });
    },

    onSpanEnd(spanName: string, attributes?: Record<string, unknown>): void {
      const startTime = spanStarts.get(spanName);
      const durationMs = startTime != null ? Date.now() - startTime : undefined;
      spanStarts.delete(spanName);
      Effect.runPromise(
        dashboard.emit(dashboardEvent('stage-lifecycle', {
          stage: spanName,
          phase: 'complete',
          durationMs,
          adoId: attributes?.adoId as string | undefined,
        })),
      ).catch(() => { /* fire-and-forget */ });
    },
  };
}
