/**
 * FlywheelProvider — React context that composes flywheel-specific hooks.
 *
 * Encapsulates flywheel visualization state (act tracking, camera choreography,
 * narration queue, act transitions, degradation, playback controller) into a
 * single context. The App component gains one `<FlywheelProvider>` wrapper
 * and one `<FlywheelChoreographer>` child — no other changes needed.
 *
 * Architecture (from docs/first-day-flywheel-visualization.md Part X, Challenge 7):
 *
 *   <FlywheelProvider enabled={flywheelMode} journalUrl={journalUrl}>
 *     <FlywheelChoreographer>
 *       <SpatialCanvas {...existingProps} />
 *     </FlywheelChoreographer>
 *     <PlaybackControls />
 *   </FlywheelProvider>
 *
 * The provider is a composition shell — it owns no state directly but
 * composes the output of six hooks into a single context value. Consumers
 * access specific slices via `useFlywheelContext()`.
 *
 * When disabled, the context returns DISABLED_STATE for all slices.
 * This preserves the architectural invariant: flywheel is a layer that
 * can be toggled without affecting the underlying dashboard.
 *
 * @see docs/first-day-flywheel-visualization.md Part X, Challenge 7
 */

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { FlywheelAct } from './types';
import { useFlywheelAct } from './hooks/use-flywheel-act';
import { useCameraChoreography, type CameraChoreographyState, CAMERA_STATES } from './hooks/use-camera-choreography';
import { useNarrationQueue, type NarrationQueueState } from './hooks/use-narration-queue';
import { useActTransition, type ActTransitionState, ACT_SCENE_STATES } from './hooks/use-act-transition';
import { useDegradation, type DegradationState } from './hooks/use-degradation';

// ─── Context Value ───

export interface FlywheelContextValue {
  /** Whether the flywheel visualization is active. */
  readonly enabled: boolean;
  /** Current flywheel act (1-7). */
  readonly currentAct: FlywheelAct;
  /** Camera choreography state and controls. */
  readonly camera: CameraChoreographyState;
  /** Narration queue state and controls. */
  readonly narration: NarrationQueueState;
  /** Act transition animation state. */
  readonly transition: ActTransitionState;
  /** Degradation controller state and controls. */
  readonly degradation: DegradationState;
  /** Current iteration number. */
  readonly iteration: number;
}

// ─── Disabled State ───

const DISABLED_CAMERA: CameraChoreographyState = {
  position: CAMERA_STATES[1].position,
  fov: CAMERA_STATES[1].fov,
  target: CAMERA_STATES[1].target,
  overrideActive: false,
  currentAct: 1,
  transitioning: false,
  transitionProgress: 0,
  releaseOverride: () => {},
  setOverride: () => {},
  jumpToAct: () => {},
};

const DISABLED_NARRATION: NarrationQueueState = {
  activeCaptions: [],
  queueCaption: () => {},
  narrate: () => {},
  clearAll: () => {},
  enabled: false,
  toggleEnabled: () => {},
};

const DISABLED_TRANSITION: ActTransitionState = {
  transitioning: false,
  fromAct: null,
  toAct: null,
  progress: 0,
  sceneState: ACT_SCENE_STATES[1],
  currentAct: 1,
  iterationAmbientBoost: 0,
};

const DISABLED_DEGRADATION: DegradationState = {
  tier: 0,
  bloomEnabled: true,
  particleDensity: 1.0,
  glassTransmissionEnabled: true,
  scene3dEnabled: true,
  staggerMultiplier: 1.0,
  currentFps: 60,
  autoEnabled: false,
  forceTier: () => {},
  toggleAuto: () => {},
};

const DISABLED_CONTEXT: FlywheelContextValue = {
  enabled: false,
  currentAct: 1,
  camera: DISABLED_CAMERA,
  narration: DISABLED_NARRATION,
  transition: DISABLED_TRANSITION,
  degradation: DISABLED_DEGRADATION,
  iteration: 0,
};

// ─── React Context ───

const FlywheelContext = createContext<FlywheelContextValue>(DISABLED_CONTEXT);

/** Access the flywheel context from any child component. */
export function useFlywheelContext(): FlywheelContextValue {
  return useContext(FlywheelContext);
}

// ─── Provider Props ───

export interface FlywheelProviderProps {
  /** Enable flywheel visualization mode. */
  readonly enabled: boolean;
  /** Current pipeline stage (from stage-lifecycle events). */
  readonly activeStage: string | null;
  /** Current progress phase (from progress events). */
  readonly progressPhase: string | null;
  /** Current iteration number. */
  readonly iteration: number;
  /** Playback speed multiplier (for camera and transition speed scaling). */
  readonly speedMultiplier?: number;
  /** Children to render within the flywheel context. */
  readonly children: ReactNode;
}

// ─── Provider Component ───

/**
 * FlywheelProvider composes flywheel hooks and provides their state
 * via React context. When disabled, all consumers receive the disabled state.
 *
 * This is the single integration point between the existing dashboard App
 * and the flywheel visualization layer.
 */
export function FlywheelProvider({
  enabled,
  activeStage,
  progressPhase,
  iteration,
  speedMultiplier = 1,
  children,
}: FlywheelProviderProps): React.JSX.Element {
  // ── Flywheel Hooks (conditional on enabled) ──

  const currentAct = useFlywheelAct(
    enabled ? activeStage : null,
    enabled ? progressPhase : null,
  );

  const camera = useCameraChoreography(currentAct, {
    enabled,
    speedMultiplier,
  });

  const narration = useNarrationQueue({
    enabled,
  });

  const transition = useActTransition(currentAct, iteration, {
    enabled,
    speedMultiplier,
  });

  const degradation = useDegradation({
    enabled,
  });

  // ── Compose context value ──

  const value = useMemo<FlywheelContextValue>(() => {
    if (!enabled) return DISABLED_CONTEXT;

    return {
      enabled,
      currentAct,
      camera,
      narration,
      transition,
      degradation,
      iteration,
    };
  }, [enabled, currentAct, camera, narration, transition, degradation, iteration]);

  return React.createElement(FlywheelContext.Provider, { value }, children);
}
