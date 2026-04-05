/**
 * Scene State Accumulator — pure domain module for flywheel time-lapse seek/batching.
 *
 * When the operator scrubs the timeline to a specific position during time-lapse
 * replay, the visualization must reconstruct the scene state at that moment.
 * The event journal is a forward-only append log, so reconstructing state at an
 * arbitrary position requires replaying events from the nearest checkpoint.
 *
 * At high playback speeds (≥10×), events must be batched rather than rendered
 * individually. The accumulator processes events in two modes:
 *   - **animated**: each event triggers a visual (used at normal speed)
 *   - **accumulated**: events update state without triggering visuals (seek + batch)
 *
 * Architecture:
 *   Event stream → accumulate(state, event) → SceneState
 *   Checkpoint every N events → snapshot for fast seek
 *   Seek(target) → load nearest checkpoint → replay events → SceneState
 *
 * This module is pure domain logic: no React, no Three.js, no filesystem.
 * All functions are deterministic — same events in same order produce same state.
 *
 * @see docs/first-day-flywheel-visualization.md Part X, Challenge 2-3
 */

import type { DashboardEventKind } from '../observation/dashboard';

// ─── Flywheel Act (domain-level, no frontend dependency) ───

export type FlywheelAct = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ─── Scenario Status ───

export type ScenarioStatus = 'pending' | 'compiled' | 'executing' | 'passed' | 'failed';

// ─── Scene State ───

/**
 * Immutable snapshot of the full flywheel scene state at a point in time.
 *
 * This is the state that the visualization must be able to reconstruct
 * at any point during time-lapse seek. It captures everything needed to
 * render the scene correctly: knowledge nodes, metrics, scenario statuses,
 * proposals, and cumulative counters.
 */
export interface SceneState {
  readonly iteration: number;
  readonly act: FlywheelAct;
  readonly sequenceNumber: number;
  readonly timestamp: string;

  /** Per-screen knowledge node confidence levels. */
  readonly knowledgeNodes: ReadonlyMap<string, KnowledgeNodeState>;

  /** Cumulative metrics across all iterations. */
  readonly metrics: SceneMetrics;

  /** Per-scenario compilation/execution status. */
  readonly scenarioStatuses: ReadonlyMap<string, ScenarioStatus>;

  /** Active proposals awaiting trust-policy evaluation. */
  readonly activeProposals: ReadonlyMap<string, ProposalState>;

  /** Set of (screen:element) pairs the system has encountered. */
  readonly seenElements: ReadonlySet<string>;

  /** Cumulative token estimate (null if not available). */
  readonly cumulativeTokens: number | null;

  /** Cumulative wall-clock time in ms. */
  readonly wallClockMs: number;
}

/** State of a single knowledge node in the observatory. */
export interface KnowledgeNodeState {
  readonly screen: string;
  readonly element: string | null;
  readonly confidence: number;
  readonly status: 'approved' | 'learning' | 'needs-review' | 'blocked';
  readonly aliasCount: number;
}

/** Aggregated scene metrics. */
export interface SceneMetrics {
  readonly knowledgeHitRate: number;
  readonly passRate: number;
  readonly proposalsActivated: number;
  readonly proposalsPending: number;
  readonly proposalsBlocked: number;
  readonly stepsResolved: number;
  readonly stepsDeferred: number;
  readonly stepsUnresolved: number;
  readonly scenariosPassed: number;
  readonly scenariosFailed: number;
  readonly scenariosExecuted: number;
}

/** State of a proposal in the trust-policy pipeline. */
export interface ProposalState {
  readonly proposalId: string;
  readonly artifactType: string;
  readonly confidence: number;
  readonly decision: 'pending' | 'approved' | 'review-required' | 'blocked';
}

// ─── Initial State ───

/** The empty scene state — the starting point before any events. */
export const INITIAL_SCENE_STATE: SceneState = {
  iteration: 0,
  act: 1,
  sequenceNumber: 0,
  timestamp: '',
  knowledgeNodes: new Map(),
  metrics: {
    knowledgeHitRate: 0,
    passRate: 0,
    proposalsActivated: 0,
    proposalsPending: 0,
    proposalsBlocked: 0,
    stepsResolved: 0,
    stepsDeferred: 0,
    stepsUnresolved: 0,
    scenariosPassed: 0,
    scenariosFailed: 0,
    scenariosExecuted: 0,
  },
  scenarioStatuses: new Map(),
  activeProposals: new Map(),
  seenElements: new Set(),
  cumulativeTokens: null,
  wallClockMs: 0,
};

// ─── Event Payload Extraction ───

/** Minimal typed view into event data for accumulation. */
interface EventEnvelope {
  readonly type: DashboardEventKind;
  readonly timestamp: string;
  readonly sequenceNumber: number;
  readonly iteration: number;
  readonly act: FlywheelAct;
  readonly data: unknown;
}

// ─── Pure Accumulation Functions ───

/**
 * O(1). Accumulate a single event into the scene state.
 *
 * This is the core state-transition function. It returns a new SceneState
 * with the event's effects applied. The function is pure and deterministic:
 * accumulate(state, event) always produces the same result.
 *
 * @param state  Current scene state
 * @param event  The event to accumulate
 * @returns New scene state with the event's effects applied
 */
export function accumulate(state: SceneState, event: EventEnvelope): SceneState {
  const base: SceneState = {
    ...state,
    sequenceNumber: event.sequenceNumber,
    timestamp: event.timestamp,
    iteration: event.iteration,
    act: event.act,
  };

  const data = event.data as Record<string, unknown> | null;

  switch (event.type) {
    case 'element-probed':
      return accumulateElementProbed(base, data);

    case 'scenario-compiled':
      return accumulateScenarioCompiled(base, data);

    case 'scenario-executed':
      return accumulateScenarioExecuted(base, data);

    case 'step-resolved':
      return accumulateStepResolved(base, data);

    case 'trust-policy-evaluated':
      return accumulateTrustPolicyEvaluated(base, data);

    case 'knowledge-activated':
      return accumulateKnowledgeActivated(base, data);

    case 'convergence-evaluated':
      return accumulateConvergenceEvaluated(base, data);

    case 'iteration-summary':
      return accumulateIterationSummary(base, data);

    case 'step-executing':
      return accumulateStepExecuting(base, data);

    case 'artifact-written':
    case 'error':
    case 'iteration-start':
    case 'iteration-complete':
    case 'progress':
    case 'screen-group-start':
    case 'item-pending':
    case 'item-processing':
    case 'item-completed':
    case 'workbench-updated':
    case 'fitness-updated':
    case 'screen-captured':
    case 'element-escalated':
    case 'inbox-item-arrived':
    case 'fiber-paused':
    case 'fiber-resumed':
    case 'rung-shift':
    case 'calibration-update':
    case 'proposal-activated':
    case 'confidence-crossed':
    case 'stage-lifecycle':
    case 'surface-discovered':
    case 'route-navigated':
    case 'aria-tree-captured':
    case 'suite-slice-selected':
    case 'scenario-prioritized':
    case 'step-bound':
    case 'diagnostics':
    case 'connected':
      return base;

    default:
      return base;
  }
}

/** Mark an element as seen in the knowledge set. */
function accumulateElementProbed(state: SceneState, data: Record<string, unknown> | null): SceneState {
  if (!data) return state;
  const screen = typeof data.screen === 'string' ? data.screen : null;
  const element = typeof data.element === 'string' ? data.element : null;

  if (!screen) return state;

  const key = element ? `${screen}:${element}` : screen;
  const newSeen = new Set(state.seenElements);
  newSeen.add(key);

  // Update or create knowledge node
  const nodeKey = key;
  const existing = state.knowledgeNodes.get(nodeKey);
  const priorConfidence = existing?.confidence ?? 0;
  const incomingConfidence = typeof data.confidence === 'number' ? data.confidence : 0;
  const bestConfidence = Math.max(priorConfidence, incomingConfidence);

  const newNodes = new Map(state.knowledgeNodes);
  newNodes.set(nodeKey, {
    screen,
    element,
    confidence: bestConfidence,
    status: existing?.status ?? 'learning',
    aliasCount: existing?.aliasCount ?? 0,
  });

  return { ...state, seenElements: newSeen, knowledgeNodes: newNodes };
}

/** Record scenario compilation status. */
function accumulateScenarioCompiled(state: SceneState, data: Record<string, unknown> | null): SceneState {
  if (!data) return state;
  const adoId = typeof data.adoId === 'string' ? data.adoId : null;
  if (!adoId) return state;

  const newStatuses = new Map(state.scenarioStatuses);
  newStatuses.set(adoId, 'compiled');

  return { ...state, scenarioStatuses: newStatuses };
}

/** Record scenario execution result. */
function accumulateScenarioExecuted(state: SceneState, data: Record<string, unknown> | null): SceneState {
  if (!data) return state;
  const adoId = typeof data.adoId === 'string' ? data.adoId : null;
  const passed = typeof data.passed === 'boolean' ? data.passed : false;
  if (!adoId) return state;

  const newStatuses = new Map(state.scenarioStatuses);
  newStatuses.set(adoId, passed ? 'passed' : 'failed');

  const newMetrics: SceneMetrics = {
    ...state.metrics,
    scenariosExecuted: state.metrics.scenariosExecuted + 1,
    scenariosPassed: state.metrics.scenariosPassed + (passed ? 1 : 0),
    scenariosFailed: state.metrics.scenariosFailed + (passed ? 0 : 1),
    passRate: state.metrics.scenariosExecuted > 0
      ? (state.metrics.scenariosPassed + (passed ? 1 : 0)) / (state.metrics.scenariosExecuted + 1)
      : passed ? 1 : 0,
  };

  return { ...state, scenarioStatuses: newStatuses, metrics: newMetrics };
}

/** Record step resolution outcome. */
function accumulateStepResolved(state: SceneState, data: Record<string, unknown> | null): SceneState {
  if (!data) return state;
  const success = typeof data.success === 'boolean' ? data.success : false;

  const newMetrics: SceneMetrics = {
    ...state.metrics,
    stepsResolved: state.metrics.stepsResolved + (success ? 1 : 0),
    stepsUnresolved: state.metrics.stepsUnresolved + (success ? 0 : 1),
  };

  return { ...state, metrics: newMetrics };
}

/** Record scenario as executing. */
function accumulateStepExecuting(state: SceneState, data: Record<string, unknown> | null): SceneState {
  if (!data) return state;
  const adoId = typeof data.adoId === 'string' ? data.adoId : null;
  if (!adoId) return state;

  const current = state.scenarioStatuses.get(adoId);
  if (current === 'passed' || current === 'failed') return state;

  const newStatuses = new Map(state.scenarioStatuses);
  newStatuses.set(adoId, 'executing');

  return { ...state, scenarioStatuses: newStatuses };
}

/** Record trust policy evaluation for a proposal. */
function accumulateTrustPolicyEvaluated(state: SceneState, data: Record<string, unknown> | null): SceneState {
  if (!data) return state;
  const proposalId = typeof data.proposalId === 'string' ? data.proposalId : null;
  if (!proposalId) return state;

  const decision = typeof data.decision === 'string'
    ? data.decision as 'approved' | 'review-required' | 'blocked'
    : 'pending';
  const artifactType = typeof data.artifactType === 'string' ? data.artifactType : 'unknown';
  const confidence = typeof data.confidence === 'number' ? data.confidence : 0;

  const newProposals = new Map(state.activeProposals);
  newProposals.set(proposalId, { proposalId, artifactType, confidence, decision });

  const approved = decision === 'approved' ? 1 : 0;
  const blocked = decision === 'blocked' ? 1 : 0;
  const pending = decision === 'review-required' ? 1 : 0;

  const newMetrics: SceneMetrics = {
    ...state.metrics,
    proposalsActivated: state.metrics.proposalsActivated + approved,
    proposalsPending: state.metrics.proposalsPending + pending,
    proposalsBlocked: state.metrics.proposalsBlocked + blocked,
  };

  return { ...state, activeProposals: newProposals, metrics: newMetrics };
}

/** Strengthen knowledge node from activated proposal. */
function accumulateKnowledgeActivated(state: SceneState, data: Record<string, unknown> | null): SceneState {
  if (!data) return state;
  const screen = typeof data.screen === 'string' ? data.screen : null;
  const element = typeof data.element === 'string' ? data.element : null;
  const newConfidence = typeof data.newConfidence === 'number' ? data.newConfidence : 0;
  const aliases = Array.isArray(data.activatedAliases) ? data.activatedAliases as readonly string[] : [];

  if (!screen) return state;

  const key = element ? `${screen}:${element}` : screen;
  const existing = state.knowledgeNodes.get(key);

  const newNodes = new Map(state.knowledgeNodes);
  newNodes.set(key, {
    screen,
    element,
    confidence: newConfidence,
    status: 'approved',
    aliasCount: (existing?.aliasCount ?? 0) + aliases.length,
  });

  return { ...state, knowledgeNodes: newNodes };
}

/** Update metrics from convergence evaluation. */
function accumulateConvergenceEvaluated(state: SceneState, data: Record<string, unknown> | null): SceneState {
  if (!data) return state;
  const hitRate = typeof data.knowledgeHitRate === 'number' ? data.knowledgeHitRate : state.metrics.knowledgeHitRate;

  const newMetrics: SceneMetrics = {
    ...state.metrics,
    knowledgeHitRate: hitRate,
  };

  return { ...state, metrics: newMetrics };
}

/** Update cumulative metrics from iteration summary. */
function accumulateIterationSummary(state: SceneState, data: Record<string, unknown> | null): SceneState {
  if (!data) return state;

  const wallClockMs = typeof data.wallClockMs === 'number' ? data.wallClockMs : 0;
  const tokenEstimate = typeof data.tokenEstimate === 'number' ? data.tokenEstimate : null;

  return {
    ...state,
    wallClockMs: state.wallClockMs + wallClockMs,
    cumulativeTokens: tokenEstimate !== null
      ? (state.cumulativeTokens ?? 0) + tokenEstimate
      : state.cumulativeTokens,
  };
}

// ─── Batch Accumulation ───

/**
 * O(n). Accumulate a batch of events into the scene state.
 *
 * Used for seek operations: replay a range of events from a checkpoint
 * to reconstruct the scene state at a target position.
 *
 * @param state   Starting scene state (from checkpoint or INITIAL)
 * @param events  Events to replay in order
 * @returns Final scene state after all events
 */
export function accumulateBatch(state: SceneState, events: readonly EventEnvelope[]): SceneState {
  return events.reduce<SceneState>(accumulate, state);
}

// ─── Checkpoint System ───

/**
 * A checkpoint is a snapshot of SceneState plus the sequence number
 * at which it was taken. Used for fast seek during time-lapse replay.
 */
export interface SceneCheckpoint {
  readonly sequenceNumber: number;
  readonly state: SceneState;
}

/**
 * Determine whether a checkpoint should be taken at this sequence number.
 *
 * Checkpoints are taken at regular intervals (every `interval` events)
 * to bound the replay cost during seek operations.
 *
 * @param sequenceNumber  Current event sequence number
 * @param interval        Checkpoint interval (default: 1000)
 * @returns true if a checkpoint should be taken
 */
export function shouldCheckpoint(sequenceNumber: number, interval = 1000): boolean {
  return sequenceNumber > 0 && sequenceNumber % interval === 0;
}

/**
 * Create a checkpoint from the current scene state.
 * Pure — creates an immutable snapshot.
 */
export function createCheckpoint(state: SceneState): SceneCheckpoint {
  return {
    sequenceNumber: state.sequenceNumber,
    state,
  };
}

/**
 * Find the nearest checkpoint at or before the target sequence number.
 *
 * @param checkpoints  Sorted array of checkpoints (by sequenceNumber)
 * @param target       Target sequence number to seek to
 * @returns The nearest checkpoint, or null if no checkpoint precedes the target
 */
export function findNearestCheckpoint(
  checkpoints: readonly SceneCheckpoint[],
  target: number,
): SceneCheckpoint | null {
  if (checkpoints.length === 0) return null;

  // Binary search for the largest sequenceNumber ≤ target
  const idx = binarySearchFloor(checkpoints, target);
  return idx >= 0 ? checkpoints[idx]! : null;
}

/** Binary search: find index of largest element with sequenceNumber ≤ target. */
function binarySearchFloor(checkpoints: readonly SceneCheckpoint[], target: number): number {
  const n = checkpoints.length;
  if (n === 0) return -1;

  const first = checkpoints[0]!;
  if (first.sequenceNumber > target) return -1;

  const last = checkpoints[n - 1]!;
  if (last.sequenceNumber <= target) return n - 1;

  // Standard binary search
  const search = (lo: number, hi: number): number => {
    if (lo > hi) return lo - 1;
    const mid = Math.floor((lo + hi) / 2);
    const midVal = checkpoints[mid]!.sequenceNumber;
    if (midVal === target) return mid;
    return midVal < target ? search(mid + 1, hi) : search(lo, mid - 1);
  };

  return search(0, n - 1);
}
