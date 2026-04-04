/**
 * Flywheel dispatch handler factories — pure higher-order functions for flywheel event routing.
 *
 * Each factory captures React state setters and returns a typed handler.
 * All use the ref pattern (.current) for closure stability — the dispatch table
 * captures these at build time and never needs to be rebuilt.
 *
 * These complement dispatch-handlers.ts with the 14 flywheel-specific event kinds.
 */

import type React from 'react';
import type { EventHandler } from '../types/events';
import type {
  SurfaceDiscoveredEvent,
  RouteNavigatedEvent,
  AriaTreeCapturedEvent,
  SuiteSliceSelectedEvent,
  ScenarioPrioritizedEvent,
  StepBoundEvent,
  ScenarioCompiledEvent,
  StepExecutingEvent,
  StepResolvedEvent,
  ScenarioExecutedEvent,
  TrustPolicyEvaluatedEvent,
  KnowledgeActivatedEvent,
  ConvergenceEvaluatedEvent,
  IterationSummaryEvent,
} from '../../../lib/domain/observation/dashboard';

/** O(1). Routes surface-discovered events to ingestion queue via stable ref. */
export const dispatchSurfaceDiscovered = (
  enqueueRef: React.RefObject<(id: string, data: SurfaceDiscoveredEvent) => void>,
): EventHandler<'surface-discovered'> =>
  (data) => enqueueRef.current?.(`${data.screen}:${data.region}`, data);

/** O(1). Routes route-navigated events to state setter. */
export const dispatchRouteNavigated = (
  setCurrentRoute: (route: RouteNavigatedEvent) => void,
): EventHandler<'route-navigated'> =>
  (data) => setCurrentRoute(data);

/** O(1). Routes aria-tree-captured events to state setter. */
export const dispatchAriaTreeCaptured = (
  setAriaTree: (tree: AriaTreeCapturedEvent) => void,
): EventHandler<'aria-tree-captured'> =>
  (data) => setAriaTree(data);

/** O(1). Routes suite-slice-selected events to state setter. */
export const dispatchSuiteSliceSelected = (
  setSlice: (slice: SuiteSliceSelectedEvent) => void,
): EventHandler<'suite-slice-selected'> =>
  (data) => setSlice(data);

/** O(1). Routes scenario-prioritized events to ingestion queue via stable ref. */
export const dispatchScenarioPrioritized = (
  enqueueRef: React.RefObject<(id: string, data: ScenarioPrioritizedEvent) => void>,
): EventHandler<'scenario-prioritized'> =>
  (data) => enqueueRef.current?.(data.adoId, data);

/** O(1). Routes step-bound events to ingestion queue via stable ref. */
export const dispatchStepBound = (
  enqueueRef: React.RefObject<(id: string, data: StepBoundEvent) => void>,
): EventHandler<'step-bound'> =>
  (data) => enqueueRef.current?.(`${data.adoId}:${data.stepIndex}`, data);

/** O(1). Routes scenario-compiled events to state setter. */
export const dispatchScenarioCompiled = (
  setCompiled: React.Dispatch<React.SetStateAction<readonly ScenarioCompiledEvent[]>>,
): EventHandler<'scenario-compiled'> =>
  (data) => setCompiled((prev) => [...prev, data]);

/** O(1). Routes step-executing events to state setter. */
export const dispatchStepExecuting = (
  setExecuting: (step: StepExecutingEvent | null) => void,
): EventHandler<'step-executing'> =>
  (data) => setExecuting(data);

/** O(1). Routes step-resolved events to ingestion queue via stable ref. */
export const dispatchStepResolved = (
  enqueueRef: React.RefObject<(id: string, data: StepResolvedEvent) => void>,
): EventHandler<'step-resolved'> =>
  (data) => enqueueRef.current?.(`${data.adoId}:${data.stepIndex}`, data);

/** O(1). Routes scenario-executed events to state setter. */
export const dispatchScenarioExecuted = (
  setExecuted: React.Dispatch<React.SetStateAction<readonly ScenarioExecutedEvent[]>>,
): EventHandler<'scenario-executed'> =>
  (data) => setExecuted((prev) => [...prev, data]);

/** O(1). Routes trust-policy-evaluated events to ingestion queue via stable ref. */
export const dispatchTrustPolicyEvaluated = (
  enqueueRef: React.RefObject<(id: string, data: TrustPolicyEvaluatedEvent) => void>,
): EventHandler<'trust-policy-evaluated'> =>
  (data) => enqueueRef.current?.(data.proposalId, data);

/** O(1). Routes knowledge-activated events to ingestion queue via stable ref. */
export const dispatchKnowledgeActivated = (
  enqueueRef: React.RefObject<(id: string, data: KnowledgeActivatedEvent) => void>,
): EventHandler<'knowledge-activated'> =>
  (data) => enqueueRef.current?.(data.proposalId, data);

/** O(1). Routes convergence-evaluated events to state setter. */
export const dispatchConvergenceEvaluated = (
  setConvergence: (conv: ConvergenceEvaluatedEvent | null) => void,
): EventHandler<'convergence-evaluated'> =>
  (data) => setConvergence(data);

/** O(1). Routes iteration-summary events to state setter. */
export const dispatchIterationSummary = (
  setSummary: React.Dispatch<React.SetStateAction<readonly IterationSummaryEvent[]>>,
): EventHandler<'iteration-summary'> =>
  (data) => setSummary((prev) => [...prev, data]);
