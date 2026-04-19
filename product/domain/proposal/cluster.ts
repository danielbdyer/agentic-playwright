/**
 * ProposalCluster — pure domain module for proposal clustering physics.
 *
 * In Act 6 (Trust-Policy Gating), coalesced failure fragments form
 * proposal clusters that approach the glass pane. Each cluster represents
 * one trust-policy evaluation candidate.
 *
 * Cluster properties:
 *   - Color from artifact type (knowledge=green, element=cyan, pattern=amber)
 *   - Size proportional to confidence score
 *   - Pulse rate encodes governance prediction
 *   - Approach speed varies with trust-policy outcome prediction
 *
 * Glass pane interactions (from spec Part I, Act 6):
 *   - Pass-through (approved): 0.5× speed, aurora flash, arc to observatory
 *   - Reflection (review-required): 0.7 elasticity, amber pulse, bounce back
 *   - Shatter (blocked): 5-8 fragments, red flash, 1s fade
 *
 * Pure domain logic. No React, no Three.js.
 *
 * @see docs/first-day-flywheel-visualization.md Part I (Act 6), Part VIII
 */

// ─── Cluster Types ───

/** Trust-policy decision outcome. */
export type TrustDecision = 'approved' | 'review-required' | 'blocked';

/** Artifact type determines cluster color. */
export type ArtifactType = 'knowledge' | 'element' | 'pattern' | 'screen' | 'snapshot';

/** A proposal cluster approaching the glass pane. */
export interface ProposalCluster {
  readonly id: string;
  readonly proposalId: string;
  readonly artifactType: ArtifactType;
  readonly confidence: number;         // [0, 1]
  readonly position: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly size: number;               // Proportional to confidence
  readonly pulseRate: number;          // Hz — governance prediction
  readonly opacity: number;
  readonly phase: ClusterPhase;
  readonly decision: TrustDecision | null; // Set after evaluation
}

/** Cluster lifecycle phase. */
export type ClusterPhase =
  | 'approaching'    // Moving toward glass pane
  | 'evaluating'     // At glass boundary, awaiting decision
  | 'passing'        // Approved — passing through with aurora
  | 'reflecting'     // Review-required — bouncing back
  | 'shattering'     // Blocked — breaking apart
  | 'complete';      // Animation finished, remove

/** Full cluster system state. */
export interface ClusterSystemState {
  readonly clusters: readonly ProposalCluster[];
  readonly totalApproved: number;
  readonly totalReflected: number;
  readonly totalShattered: number;
}

// ─── Constants ───

/** Color mapping by artifact type. */
export const ARTIFACT_COLORS: Readonly<Record<ArtifactType, string>> = {
  knowledge: '#22c55e',  // Green
  element:   '#06b6d4',  // Cyan
  pattern:   '#f59e0b',  // Amber
  screen:    '#8b5cf6',  // Violet
  snapshot:  '#ec4899',  // Pink
} as const;

/** Approach speed base (units/s). */
const APPROACH_SPEED = 0.3;

/** Glass pane X position. */
const GLASS_X = 0.1;

/** Evaluation zone width. */
const EVAL_ZONE = 0.2;

export const INITIAL_CLUSTER_STATE: ClusterSystemState = {
  clusters: [],
  totalApproved: 0,
  totalReflected: 0,
  totalShattered: 0,
};

// ─── Cluster Creation ───

/**
 * Create a new proposal cluster from coalesced fragments.
 *
 * @param proposalId - The proposal identifier
 * @param artifactType - Type determines color
 * @param confidence - [0,1] determines size and pulse
 * @param startPosition - Starting position (left of glass)
 * @returns New cluster in 'approaching' phase
 */
export function createCluster(
  proposalId: string,
  artifactType: ArtifactType,
  confidence: number,
  startPosition: readonly [number, number, number] = [-2, 0, 0],
): ProposalCluster {
  const clampedConfidence = Math.max(0, Math.min(1, confidence));
  return {
    id: `cluster-${proposalId}`,
    proposalId,
    artifactType,
    confidence: clampedConfidence,
    position: startPosition,
    velocity: [APPROACH_SPEED, 0, 0],
    size: 0.02 + clampedConfidence * 0.04, // [0.02, 0.06]
    pulseRate: 0.5 + clampedConfidence * 1.5, // [0.5, 2.0] Hz
    opacity: 0.8,
    phase: 'approaching',
    decision: null,
  };
}

// ─── Physics Simulation ───

/**
 * Advance all clusters by one physics step.
 */
export function stepClusterPhysics(
  state: ClusterSystemState,
  deltaMs: number,
): ClusterSystemState {
  const dt = deltaMs / 1000;

  const updated = state.clusters.map((cluster) => {
    switch (cluster.phase) {
      case 'approaching':
        return stepApproaching(cluster, dt);
      case 'evaluating':
        return cluster; // Stationary, waiting for decision
      case 'passing':
        return stepPassing(cluster, dt);
      case 'reflecting':
        return stepReflecting(cluster, dt);
      case 'shattering':
        return stepShattering(cluster, dt);
      case 'complete':
        return cluster;
    }
  });

  // Remove completed clusters
  const active = updated.filter((c) => c.phase !== 'complete');

  return {
    ...state,
    clusters: active,
  };
}

function stepApproaching(cluster: ProposalCluster, dt: number): ProposalCluster {
  const newX = cluster.position[0] + cluster.velocity[0] * dt;

  // Check if reached evaluation zone
  if (newX >= GLASS_X - EVAL_ZONE) {
    return {
      ...cluster,
      position: [GLASS_X - EVAL_ZONE, cluster.position[1], cluster.position[2]],
      velocity: [0, 0, 0],
      phase: 'evaluating',
    };
  }

  return {
    ...cluster,
    position: [newX, cluster.position[1], cluster.position[2]],
  };
}

function stepPassing(cluster: ProposalCluster, dt: number): ProposalCluster {
  // Slow pass-through at 0.5× speed
  const newX = cluster.position[0] + APPROACH_SPEED * 0.5 * dt;
  const newOpacity = cluster.opacity - 0.3 * dt; // Fade as it passes

  if (newX > GLASS_X + 1.0 || newOpacity <= 0) {
    return { ...cluster, phase: 'complete', opacity: 0 };
  }

  return {
    ...cluster,
    position: [newX, cluster.position[1], cluster.position[2]],
    opacity: Math.max(0, newOpacity),
  };
}

function stepReflecting(cluster: ProposalCluster, dt: number): ProposalCluster {
  // Bounce back with 0.7 elasticity
  const bounceSpeed = APPROACH_SPEED * 0.7;
  const newX = cluster.position[0] - bounceSpeed * dt;
  const newOpacity = cluster.opacity - 0.15 * dt;

  if (newX < -3 || newOpacity <= 0) {
    return { ...cluster, phase: 'complete', opacity: 0 };
  }

  return {
    ...cluster,
    position: [newX, cluster.position[1], cluster.position[2]],
    velocity: [-bounceSpeed, 0, 0],
    opacity: Math.max(0, newOpacity),
  };
}

function stepShattering(cluster: ProposalCluster, dt: number): ProposalCluster {
  // Rapid expansion and fade
  const newSize = cluster.size * (1 + 3 * dt);
  const newOpacity = cluster.opacity - 1.0 * dt; // 1s fade

  if (newOpacity <= 0) {
    return { ...cluster, phase: 'complete', opacity: 0 };
  }

  return {
    ...cluster,
    size: newSize,
    opacity: Math.max(0, newOpacity),
  };
}

// ─── Trust Policy Application ───

/**
 * Apply a trust-policy decision to a cluster in 'evaluating' phase.
 */
export function applyDecision(
  state: ClusterSystemState,
  proposalId: string,
  decision: TrustDecision,
): ClusterSystemState {
  const newApproved = decision === 'approved' ? 1 : 0;
  const newReflected = decision === 'review-required' ? 1 : 0;
  const newShattered = decision === 'blocked' ? 1 : 0;

  const phaseMap: Record<TrustDecision, ClusterPhase> = {
    'approved': 'passing',
    'review-required': 'reflecting',
    'blocked': 'shattering',
  };

  const updated = state.clusters.map((cluster) => {
    if (cluster.proposalId !== proposalId || cluster.phase !== 'evaluating') {
      return cluster;
    }
    return {
      ...cluster,
      decision,
      phase: phaseMap[decision],
    };
  });

  return {
    clusters: updated,
    totalApproved: state.totalApproved + newApproved,
    totalReflected: state.totalReflected + newReflected,
    totalShattered: state.totalShattered + newShattered,
  };
}

/**
 * Add a new cluster to the system.
 */
export function addCluster(
  state: ClusterSystemState,
  proposalId: string,
  artifactType: ArtifactType,
  confidence: number,
  startPosition?: readonly [number, number, number],
): ClusterSystemState {
  const cluster = createCluster(proposalId, artifactType, confidence, startPosition);
  return {
    ...state,
    clusters: [...state.clusters, cluster],
  };
}

/**
 * Count clusters by phase.
 */
export function clustersByPhase(
  state: ClusterSystemState,
): Readonly<Record<ClusterPhase, number>> {
  const counts: Record<ClusterPhase, number> = {
    approaching: 0, evaluating: 0, passing: 0,
    reflecting: 0, shattering: 0, complete: 0,
  };
  for (const cluster of state.clusters) {
    counts[cluster.phase]++;
  }
  return counts;
}

/**
 * Get the color for an artifact type.
 */
export function artifactColor(type: ArtifactType): string {
  return ARTIFACT_COLORS[type];
}
