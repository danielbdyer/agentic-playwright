/**
 * Governance Intelligence Orchestrator — unifies contradiction detection,
 * architecture fitness, trust-policy evaluation outcomes, and proposal
 * activation statistics into one governance health view.
 *
 * Today these concepts are isolated:
 * - ContradictionReport (conflicting knowledge)
 * - ArchitectureFitnessReport (layer purity, dependency violations)
 * - ProposalBundle activation status (pending/activated/blocked)
 * - PipelineFitnessReport failure modes (trust-policy-over-block)
 *
 * Nobody asks:
 * - Are knowledge contradictions causing fitness failures?
 * - Is the trust policy blocking high-quality proposals?
 * - What is the auto-approval success rate?
 * - Which artifact types have the most governance friction?
 *
 * All functions are pure: immutable inputs, immutable outputs, no side effects.
 */

import type {
  ContradictionReport,
  ContradictionSeverity,
  ArchitectureFitnessReport,
  PipelineFitnessReport,
  ProposalBundle,
} from '../../domain/types';

// ─── Types ───

export interface GovernanceFrictionPoint {
  readonly artifactType: string;
  readonly totalProposals: number;
  readonly blockedCount: number;
  readonly pendingCount: number;
  readonly activatedCount: number;
  readonly frictionRate: number;
}

export interface ContradictionImpact {
  readonly category: string;
  readonly count: number;
  readonly severity: ContradictionSeverity;
  readonly blocksPromotion: boolean;
  readonly affectsScreens: readonly string[];
}

export interface GovernanceIntelligenceReport {
  readonly kind: 'governance-intelligence-report';
  readonly version: 1;
  readonly generatedAt: string;

  readonly contradictionReport: ContradictionReport | null;
  readonly architectureReport: ArchitectureFitnessReport | null;

  readonly frictionPoints: readonly GovernanceFrictionPoint[];
  readonly contradictionImpacts: readonly ContradictionImpact[];

  readonly overallGovernanceHealth: number;
  readonly trustPolicyBlockRate: number;
  readonly contradictionSeverityScore: number;
  readonly architecturePurityRate: number;
  readonly proposalActivationRate: number;
}

// ─── Friction point analysis ───

/**
 * Analyze proposal bundles to identify governance friction by artifact type.
 * Friction = proportion of proposals that are blocked or pending review.
 */
function computeFrictionPoints(
  bundles: readonly ProposalBundle[],
): readonly GovernanceFrictionPoint[] {
  const byType = new Map<string, {
    total: number;
    blocked: number;
    pending: number;
    activated: number;
  }>();

  for (const bundle of bundles) {
    for (const proposal of bundle.payload.proposals) {
      const artifactType = proposal.artifactType ?? 'unknown';
      const existing = byType.get(artifactType) ?? {
        total: 0, blocked: 0, pending: 0, activated: 0,
      };

      existing.total += 1;

      const decision = proposal.trustPolicy?.decision;
      if (decision === 'deny') {
        existing.blocked += 1;
      } else if (decision === 'review') {
        existing.pending += 1;
      } else {
        existing.activated += 1;
      }

      byType.set(artifactType, existing);
    }
  }

  return [...byType.entries()]
    .map(([artifactType, data]) => ({
      artifactType,
      totalProposals: data.total,
      blockedCount: data.blocked,
      pendingCount: data.pending,
      activatedCount: data.activated,
      frictionRate: data.total > 0
        ? (data.blocked + data.pending) / data.total
        : 0,
    }))
    .sort((a, b) => b.frictionRate - a.frictionRate);
}

// ─── Contradiction impact analysis ───

/**
 * Extract screens affected by knowledge contradictions.
 */
function extractScreensFromContradiction(sources: readonly { readonly file: string }[]): readonly string[] {
  const screens = new Set<string>();
  for (const source of sources) {
    // Files like "knowledge/screens/PolicySearch.elements.yaml" → "PolicySearch"
    const match = source.file.match(/screens\/([^.]+)\./);
    if (match?.[1]) {
      screens.add(match[1]);
    }
  }
  return [...screens];
}

function computeContradictionImpacts(
  contradictionReport: ContradictionReport | null,
): readonly ContradictionImpact[] {
  if (!contradictionReport) return [];

  const byCategory = new Map<string, {
    count: number;
    severity: ContradictionSeverity;
    screens: Set<string>;
  }>();

  for (const c of contradictionReport.contradictions) {
    const existing = byCategory.get(c.category) ?? {
      count: 0,
      severity: 'info' as ContradictionSeverity,
      screens: new Set<string>(),
    };

    existing.count += 1;
    // Escalate severity: error > warning > info
    if (c.severity === 'error' || (c.severity === 'warning' && existing.severity === 'info')) {
      existing.severity = c.severity;
    }

    for (const screen of extractScreensFromContradiction(c.sources)) {
      existing.screens.add(screen);
    }

    byCategory.set(c.category, existing);
  }

  return [...byCategory.entries()]
    .map(([category, data]) => ({
      category,
      count: data.count,
      severity: data.severity,
      blocksPromotion: data.severity === 'error',
      affectsScreens: [...data.screens].sort(),
    }))
    .sort((a, b) => b.count - a.count);
}

// ─── Main orchestration ───

export interface GovernanceIntelligenceInput {
  readonly contradictionReport?: ContradictionReport | null;
  readonly architectureReport?: ArchitectureFitnessReport | null;
  readonly proposalBundles: readonly ProposalBundle[];
  readonly fitnessReport?: PipelineFitnessReport | null;
  readonly generatedAt?: string;
}

/**
 * Compose contradiction + architecture + trust-policy + proposal activation
 * into a unified governance health view.
 *
 * Pure function: all inputs → single governance intelligence report.
 */
export function buildGovernanceIntelligence(
  input: GovernanceIntelligenceInput,
): GovernanceIntelligenceReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  // 1. Friction analysis
  const frictionPoints = computeFrictionPoints(input.proposalBundles);

  // 2. Contradiction impacts
  const contradictionImpacts = computeContradictionImpacts(
    input.contradictionReport ?? null,
  );

  // 3. Trust policy block rate
  const totalProposals = frictionPoints.reduce((sum, fp) => sum + fp.totalProposals, 0);
  const totalBlocked = frictionPoints.reduce((sum, fp) => sum + fp.blockedCount, 0);
  const trustPolicyBlockRate = totalProposals > 0
    ? totalBlocked / totalProposals
    : 0;

  // 4. Proposal activation rate
  const totalActivated = frictionPoints.reduce((sum, fp) => sum + fp.activatedCount, 0);
  const proposalActivationRate = totalProposals > 0
    ? totalActivated / totalProposals
    : 1;

  // 5. Contradiction severity score (0 = no contradictions, 1 = all errors)
  const contradictionReport = input.contradictionReport ?? null;
  const totalContradictions = contradictionReport?.summary.totalContradictions ?? 0;
  const errorCount = contradictionReport?.summary.bySeverity.error ?? 0;
  const warningCount = contradictionReport?.summary.bySeverity.warning ?? 0;
  const contradictionSeverityScore = totalContradictions > 0
    ? (errorCount * 1.0 + warningCount * 0.5) / totalContradictions
    : 0;

  // 6. Architecture purity rate
  const architectureReport = input.architectureReport ?? null;
  const architecturePurityRate = architectureReport?.overallPurityRate ?? 1;

  // 7. Overall governance health
  const overallGovernanceHealth = (
    (1 - trustPolicyBlockRate) * 0.3 +
    proposalActivationRate * 0.25 +
    (1 - contradictionSeverityScore) * 0.25 +
    architecturePurityRate * 0.2
  );

  return {
    kind: 'governance-intelligence-report',
    version: 1,
    generatedAt,
    contradictionReport,
    architectureReport,
    frictionPoints,
    contradictionImpacts,
    overallGovernanceHealth,
    trustPolicyBlockRate,
    contradictionSeverityScore,
    architecturePurityRate,
    proposalActivationRate,
  };
}

/**
 * Extract artifact types with highest governance friction.
 */
export function extractHighFrictionTypes(
  report: GovernanceIntelligenceReport,
  n: number = 5,
): readonly GovernanceFrictionPoint[] {
  return report.frictionPoints.slice(0, n);
}

/**
 * Check whether governance health is below a threshold.
 */
export function isGovernanceHealthy(
  report: GovernanceIntelligenceReport,
  threshold: number = 0.7,
): boolean {
  return report.overallGovernanceHealth >= threshold;
}

// ─── ObservationCollapse instance ──────────────────────────────────────────
//
// Governance intelligence as ObservationCollapse<R,O,A,S>:
//   R = GovernanceIntelligenceInput (the full input bundle)
//   O = GovernanceFrictionPoint (extracted friction analysis)
//   A = GovernanceIntelligenceReport (the aggregate report)
//   S = number (overall governance health score)

import type { ObservationCollapse } from '../../domain/kernel/observation-collapse';

export const governanceIntelligenceCollapse: ObservationCollapse<
  GovernanceIntelligenceInput,
  GovernanceFrictionPoint,
  GovernanceIntelligenceReport,
  number
> = {
  extract: (inputs) => inputs.flatMap((input) => computeFrictionPoints(input.proposalBundles)),
  aggregate: (frictionPoints, _prior) => {
    // Build a minimal report from friction points — this is a projection
    const totalProposals = frictionPoints.reduce((sum, fp) => sum + fp.totalProposals, 0);
    const totalBlocked = frictionPoints.reduce((sum, fp) => sum + fp.blockedCount, 0);
    const totalActivated = frictionPoints.reduce((sum, fp) => sum + fp.activatedCount, 0);
    const trustPolicyBlockRate = totalProposals > 0 ? totalBlocked / totalProposals : 0;
    const proposalActivationRate = totalProposals > 0 ? totalActivated / totalProposals : 1;
    const overallGovernanceHealth = (1 - trustPolicyBlockRate) * 0.55 + proposalActivationRate * 0.45;

    return {
      kind: 'governance-intelligence-report',
      version: 1,
      generatedAt: new Date().toISOString(),
      contradictionReport: null,
      architectureReport: null,
      frictionPoints,
      contradictionImpacts: [],
      overallGovernanceHealth,
      trustPolicyBlockRate,
      contradictionSeverityScore: 0,
      architecturePurityRate: 1,
      proposalActivationRate,
    };
  },
  signal: (report) => report.overallGovernanceHealth,
};
