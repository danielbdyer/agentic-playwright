/**
 * FlywheelProvider — React context that encapsulates flywheel-specific state.
 *
 * Composes the flywheel hooks (act tracking, camera choreography, narration queue)
 * and manages all flywheel-specific event state. Exposes setters so dispatch
 * handlers can be wired at the composition root without prop drilling.
 *
 * This is a composition point, not business logic.
 */

import React, { createContext, useContext, useState } from 'react';
import type { FlywheelAct } from '../types';
import type {
  RouteNavigatedEvent,
  AriaTreeCapturedEvent,
  SuiteSliceSelectedEvent,
  ScenarioCompiledEvent,
  StepExecutingEvent,
  ScenarioExecutedEvent,
  ConvergenceEvaluatedEvent,
  IterationSummaryEvent,
} from '../../../product/domain/observation/dashboard';
import { useFlywheelAct } from '../hooks/use-flywheel-act';
import { useCameraChoreography, type CameraChoreographyState } from '../hooks/use-camera-choreography';
import { useNarrationQueue, type NarrationQueueState, type NarrationVerbosity } from '../hooks/use-narration-queue';

// ─── Context Value ───

export interface FlywheelSetters {
  readonly setCurrentRoute: (route: RouteNavigatedEvent) => void;
  readonly setAriaTree: (tree: AriaTreeCapturedEvent) => void;
  readonly setSuiteSlice: (slice: SuiteSliceSelectedEvent) => void;
  readonly setCompiledScenarios: React.Dispatch<React.SetStateAction<readonly ScenarioCompiledEvent[]>>;
  readonly setExecutingStep: (step: StepExecutingEvent | null) => void;
  readonly setExecutedScenarios: React.Dispatch<React.SetStateAction<readonly ScenarioExecutedEvent[]>>;
  readonly setConvergence: (conv: ConvergenceEvaluatedEvent | null) => void;
  readonly setIterationSummaries: React.Dispatch<React.SetStateAction<readonly IterationSummaryEvent[]>>;
}

export interface FlywheelContextValue {
  /** Whether flywheel mode is active. */
  readonly enabled: boolean;
  /** Current flywheel act. */
  readonly act: FlywheelAct;
  /** Camera choreography state. */
  readonly camera: CameraChoreographyState;
  /** Narration queue state. */
  readonly narration: NarrationQueueState;
  /** Current route the system is navigating. */
  readonly currentRoute: RouteNavigatedEvent | null;
  /** Latest ARIA tree capture. */
  readonly ariaTree: AriaTreeCapturedEvent | null;
  /** Suite slice selection result. */
  readonly suiteSlice: SuiteSliceSelectedEvent | null;
  /** All compiled scenarios. */
  readonly compiledScenarios: readonly ScenarioCompiledEvent[];
  /** Currently executing step. */
  readonly executingStep: StepExecutingEvent | null;
  /** All executed scenarios. */
  readonly executedScenarios: readonly ScenarioExecutedEvent[];
  /** Latest convergence evaluation. */
  readonly convergence: ConvergenceEvaluatedEvent | null;
  /** All iteration summaries. */
  readonly iterationSummaries: readonly IterationSummaryEvent[];
  /** State setters for dispatch handlers to connect to. */
  readonly setters: FlywheelSetters;
}

// ─── Context ───

const FlywheelContext = createContext<FlywheelContextValue | null>(null);

// ─── Provider Props ───

export interface FlywheelProviderProps {
  readonly enabled: boolean;
  readonly activeStage: string | null;
  readonly progressPhase: string | null;
  readonly narrationVerbosity?: NarrationVerbosity;
  readonly cameraSpeedMultiplier?: number;
  readonly children: React.ReactNode;
}

// ─── Provider Component ───

export function FlywheelProvider({
  enabled,
  activeStage,
  progressPhase,
  narrationVerbosity = 'normal',
  cameraSpeedMultiplier = 1,
  children,
}: FlywheelProviderProps) {
  // Flywheel act derived from stage/phase
  const act = useFlywheelAct(activeStage, progressPhase);

  // Camera choreography driven by current act
  const camera = useCameraChoreography(act, {
    enabled,
    speedMultiplier: cameraSpeedMultiplier,
  });

  // Narration queue
  const narration = useNarrationQueue({
    enabled,
    verbosity: narrationVerbosity,
  });

  // Flywheel-specific event state
  const [currentRoute, setCurrentRoute] = useState<RouteNavigatedEvent | null>(null);
  const [ariaTree, setAriaTree] = useState<AriaTreeCapturedEvent | null>(null);
  const [suiteSlice, setSuiteSlice] = useState<SuiteSliceSelectedEvent | null>(null);
  const [compiledScenarios, setCompiledScenarios] = useState<readonly ScenarioCompiledEvent[]>([]);
  const [executingStep, setExecutingStep] = useState<StepExecutingEvent | null>(null);
  const [executedScenarios, setExecutedScenarios] = useState<readonly ScenarioExecutedEvent[]>([]);
  const [convergence, setConvergence] = useState<ConvergenceEvaluatedEvent | null>(null);
  const [iterationSummaries, setIterationSummaries] = useState<readonly IterationSummaryEvent[]>([]);

  // Stable setters object — React Compiler auto-memoizes
  const setters: FlywheelSetters = {
    setCurrentRoute,
    setAriaTree,
    setSuiteSlice,
    setCompiledScenarios,
    setExecutingStep,
    setExecutedScenarios,
    setConvergence,
    setIterationSummaries,
  };

  const value: FlywheelContextValue = {
    enabled,
    act,
    camera,
    narration,
    currentRoute,
    ariaTree,
    suiteSlice,
    compiledScenarios,
    executingStep,
    executedScenarios,
    convergence,
    iterationSummaries,
    setters,
  };

  return (
    <FlywheelContext.Provider value={value}>
      {children}
    </FlywheelContext.Provider>
  );
}

// ─── Consumer Hook ───

/** Access the flywheel context. Throws if used outside FlywheelProvider. */
export function useFlywheelContext(): FlywheelContextValue {
  const ctx = useContext(FlywheelContext);
  if (ctx === null) {
    throw new Error('useFlywheelContext must be used within a FlywheelProvider');
  }
  return ctx;
}
