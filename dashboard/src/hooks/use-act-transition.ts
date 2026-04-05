/**
 * useActTransition — tracks act-to-act transition animation state.
 *
 * Complements useCameraChoreography (which handles camera interpolation)
 * with scene-level transition state: which elements are fading, morphing,
 * or repositioning during act changes. The FlywheelChoreographer uses
 * this to conditionally render transition-specific visuals.
 *
 * Each act transition has a defined set of scene effects (from the spec):
 *   1→2: scenario cloud compresses, screen plane fades in, seed routes brighten
 *   2→3: screen plane dims, scenarios reorganize into ranked list
 *   3→4: deferred scenarios dissolve, pipeline timeline appears
 *   4→5: step overlays clear, "Run" indicator pulses
 *   5→6: failure fragments coalesce, glass pane frosts
 *   6→7: pipeline timeline shifts, scorecard materializes
 *   7→4: iteration timeline advances, observatory nodes pulse
 *
 * State lives in refs to avoid re-renders on every frame tick.
 * Exposed state updates at display-refresh cadence via setState.
 *
 * @see docs/first-day-flywheel-visualization.md Part IV: Camera Choreography
 */

import { useState, useRef, useEffect } from 'react';
import type { FlywheelAct } from '../types';

// ─── Transition Effect Descriptors ───

/**
 * Scene element visibility/opacity targets during a transition.
 * Values are normalized [0, 1] where 0 = invisible and 1 = fully visible.
 */
export interface TransitionSceneState {
  /** Screen plane opacity. */
  readonly screenPlaneOpacity: number;
  /** Glass pane frost level (0 = transparent, 1 = fully frosted). */
  readonly glassPaneFrost: number;
  /** Scenario cloud opacity (ghosted background layer). */
  readonly scenarioCloudOpacity: number;
  /** Pipeline timeline visibility. */
  readonly pipelineTimelineOpacity: number;
  /** Scorecard panel visibility. */
  readonly scorecardOpacity: number;
  /** Whether the "Run" indicator should pulse. */
  readonly runIndicatorActive: boolean;
  /** Ambient light intensity multiplier. */
  readonly ambientIntensity: number;
}

/** Named transition between two acts. */
export interface ActTransitionDescriptor {
  readonly from: FlywheelAct;
  readonly to: FlywheelAct;
  readonly durationMs: number;
  /** Scene state at the start of the transition (from-act's settled state). */
  readonly startScene: TransitionSceneState;
  /** Scene state at the end of the transition (to-act's settled state). */
  readonly endScene: TransitionSceneState;
}

// ─── Per-Act Settled Scene States ───

/** The settled scene state for each act (when no transition is in progress). */
export const ACT_SCENE_STATES: Readonly<Record<FlywheelAct, TransitionSceneState>> = {
  1: {
    screenPlaneOpacity: 0,
    glassPaneFrost: 0,
    scenarioCloudOpacity: 1.0,
    pipelineTimelineOpacity: 0,
    scorecardOpacity: 0,
    runIndicatorActive: false,
    ambientIntensity: 0.2,
  },
  2: {
    screenPlaneOpacity: 1.0,
    glassPaneFrost: 0,
    scenarioCloudOpacity: 0.2,
    pipelineTimelineOpacity: 0,
    scorecardOpacity: 0,
    runIndicatorActive: false,
    ambientIntensity: 0.3,
  },
  3: {
    screenPlaneOpacity: 0.7,
    glassPaneFrost: 0,
    scenarioCloudOpacity: 1.0,
    pipelineTimelineOpacity: 0,
    scorecardOpacity: 0,
    runIndicatorActive: false,
    ambientIntensity: 0.3,
  },
  4: {
    screenPlaneOpacity: 1.0,
    glassPaneFrost: 0.3,
    scenarioCloudOpacity: 0,
    pipelineTimelineOpacity: 1.0,
    scorecardOpacity: 0,
    runIndicatorActive: false,
    ambientIntensity: 0.3,
  },
  5: {
    screenPlaneOpacity: 1.0,
    glassPaneFrost: 0.3,
    scenarioCloudOpacity: 0,
    pipelineTimelineOpacity: 1.0,
    scorecardOpacity: 0,
    runIndicatorActive: true,
    ambientIntensity: 0.35,
  },
  6: {
    screenPlaneOpacity: 0.6,
    glassPaneFrost: 0.7,
    scenarioCloudOpacity: 0,
    pipelineTimelineOpacity: 0.5,
    scorecardOpacity: 0,
    runIndicatorActive: false,
    ambientIntensity: 0.35,
  },
  7: {
    screenPlaneOpacity: 0.8,
    glassPaneFrost: 0.4,
    scenarioCloudOpacity: 0,
    pipelineTimelineOpacity: 1.0,
    scorecardOpacity: 1.0,
    runIndicatorActive: false,
    ambientIntensity: 0.4,
  },
} as const;

// ─── Interpolation ───

/** Cubic ease-in-out — matches camera choreography easing. */
const cubicEaseInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const lerpScalar = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Interpolate between two scene states. Pure. */
export function interpolateSceneState(
  from: TransitionSceneState,
  to: TransitionSceneState,
  rawT: number,
): TransitionSceneState {
  const t = cubicEaseInOut(Math.max(0, Math.min(1, rawT)));
  return {
    screenPlaneOpacity: lerpScalar(from.screenPlaneOpacity, to.screenPlaneOpacity, t),
    glassPaneFrost: lerpScalar(from.glassPaneFrost, to.glassPaneFrost, t),
    scenarioCloudOpacity: lerpScalar(from.scenarioCloudOpacity, to.scenarioCloudOpacity, t),
    pipelineTimelineOpacity: lerpScalar(from.pipelineTimelineOpacity, to.pipelineTimelineOpacity, t),
    scorecardOpacity: lerpScalar(from.scorecardOpacity, to.scorecardOpacity, t),
    runIndicatorActive: t >= 0.5 ? to.runIndicatorActive : from.runIndicatorActive,
    ambientIntensity: lerpScalar(from.ambientIntensity, to.ambientIntensity, t),
  };
}

// ─── Hook Interface ───

export interface ActTransitionState {
  /** Whether a transition is currently in progress. */
  readonly transitioning: boolean;
  /** Source act of the current transition (null when settled). */
  readonly fromAct: FlywheelAct | null;
  /** Target act of the current transition (null when settled). */
  readonly toAct: FlywheelAct | null;
  /** Transition progress [0, 1] (0 when settled). */
  readonly progress: number;
  /** Current interpolated scene state (settled or mid-transition). */
  readonly sceneState: TransitionSceneState;
  /** The current settled act. */
  readonly currentAct: FlywheelAct;
  /** Cumulative ambient intensity boost from iteration progression. */
  readonly iterationAmbientBoost: number;
}

export interface ActTransitionOptions {
  readonly enabled?: boolean;
  readonly speedMultiplier?: number;
}

// ─── Transition Durations ───

export const ACT_TRANSITION_DURATIONS: Readonly<Record<string, number>> = {
  '1->2': 2500,
  '2->3': 1500,
  '3->4': 2000,
  '4->5': 1500,
  '5->6': 2000,
  '6->7': 2000,
  '7->4': 2500,
} as const;

const DEFAULT_DURATION = 2000;

// ─── Internal Refs ───

interface InternalTransition {
  readonly from: FlywheelAct;
  readonly to: FlywheelAct;
  readonly startScene: TransitionSceneState;
  readonly endScene: TransitionSceneState;
  readonly duration: number;
  readonly startTime: number;
}

// ─── Hook ───

export function useActTransition(
  currentAct: FlywheelAct,
  iteration: number,
  options?: ActTransitionOptions,
): ActTransitionState {
  const enabled = options?.enabled ?? true;
  const speedMultiplier = options?.speedMultiplier ?? 1;

  const initialScene = ACT_SCENE_STATES[currentAct];
  const [state, setState] = useState<ActTransitionState>({
    transitioning: false,
    fromAct: null,
    toAct: null,
    progress: 0,
    sceneState: initialScene,
    currentAct,
    iterationAmbientBoost: 0,
  });

  const transitionRef = useRef<InternalTransition | null>(null);
  const prevActRef = useRef<FlywheelAct>(currentAct);
  const prevIterationRef = useRef<number>(iteration);
  const rafRef = useRef<number>(0);
  const settledActRef = useRef<FlywheelAct>(currentAct);

  // Track iteration changes for ambient boost
  const iterationBoost = useRef(0);
  useEffect(() => {
    if (iteration > prevIterationRef.current) {
      // 5% ambient boost per iteration (per spec: "Ambient light intensity increases by 5%")
      iterationBoost.current = Math.min(iterationBoost.current + 0.05, 0.5);
    }
    prevIterationRef.current = iteration;
  }, [iteration]);

  // Detect act changes and start transitions
  useEffect(() => {
    if (!enabled) return;
    if (currentAct === prevActRef.current) return;

    const fromAct = prevActRef.current;
    const key = `${fromAct}->${currentAct}`;
    const baseDuration = ACT_TRANSITION_DURATIONS[key] ?? DEFAULT_DURATION;
    const duration = baseDuration / speedMultiplier;

    transitionRef.current = {
      from: fromAct,
      to: currentAct,
      startScene: ACT_SCENE_STATES[fromAct],
      endScene: ACT_SCENE_STATES[currentAct],
      duration,
      startTime: performance.now(),
    };

    prevActRef.current = currentAct;
    settledActRef.current = currentAct;
  }, [currentAct, enabled, speedMultiplier]);

  // Animation loop
  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      const transition = transitionRef.current;
      const boost = iterationBoost.current;

      if (transition) {
        const elapsed = performance.now() - transition.startTime;
        const rawT = Math.min(1, elapsed / transition.duration);
        const interpolated = interpolateSceneState(transition.startScene, transition.endScene, rawT);
        const done = rawT >= 1;

        if (done) {
          transitionRef.current = null;
        }

        setState({
          transitioning: !done,
          fromAct: done ? null : transition.from,
          toAct: done ? null : transition.to,
          progress: done ? 0 : rawT,
          sceneState: {
            ...interpolated,
            ambientIntensity: interpolated.ambientIntensity + boost,
          },
          currentAct: settledActRef.current,
          iterationAmbientBoost: boost,
        });
      } else {
        const settled = ACT_SCENE_STATES[settledActRef.current];
        setState((prev) => {
          if (
            !prev.transitioning &&
            prev.currentAct === settledActRef.current &&
            prev.iterationAmbientBoost === boost
          ) return prev;

          return {
            transitioning: false,
            fromAct: null,
            toAct: null,
            progress: 0,
            sceneState: {
              ...settled,
              ambientIntensity: settled.ambientIntensity + boost,
            },
            currentAct: settledActRef.current,
            iterationAmbientBoost: boost,
          };
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled]);

  return state;
}
