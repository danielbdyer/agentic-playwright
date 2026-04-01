/**
 * Knowledge Dependency Graph — builds a reverse index from knowledge
 * artifacts to the scenarios that depend on them.
 *
 * Today, BoundStep.binding.knowledgeRefs references knowledge artifacts,
 * but knowledge types have no back-reference to which scenarios use them.
 * You cannot ask:
 * - Which scenarios use this screen hint?
 * - What scenarios would break if this knowledge changed?
 * - Which knowledge artifacts are unused by any scenario?
 * - What is the blast radius of a knowledge change?
 *
 * All functions are pure: immutable inputs, immutable outputs, no side effects.
 */

import type { AdoId } from '../domain/kernel/identity';

// ─── Types ───

export interface ScenarioRef {
  readonly adoId: string;
  readonly title: string;
  readonly stepCount: number;
}

export interface KnowledgeUsage {
  readonly knowledgeRef: string;
  readonly dependentScenarios: readonly ScenarioRef[];
  readonly dependentStepCount: number;
  readonly isOrphan: boolean;
}

export interface KnowledgeBlastRadius {
  readonly knowledgeRef: string;
  readonly scenarioCount: number;
  readonly stepCount: number;
  readonly riskLevel: 'low' | 'medium' | 'high';
}

export interface KnowledgeDependencyReport {
  readonly kind: 'knowledge-dependency-report';
  readonly version: 1;
  readonly generatedAt: string;

  readonly usages: readonly KnowledgeUsage[];
  readonly orphanedKnowledge: readonly string[];
  readonly blastRadii: readonly KnowledgeBlastRadius[];

  readonly totalKnowledgeRefs: number;
  readonly orphanRate: number;
  readonly averageBlastRadius: number;
}

// ─── Bound scenario abstraction ───

export interface BoundScenarioSummary {
  readonly adoId: string;
  readonly title: string;
  readonly steps: readonly {
    readonly knowledgeRefs: readonly string[];
  }[];
}

// ─── Dependency computation ───

/**
 * Build a reverse index from knowledge refs to scenarios.
 */
function buildReverseIndex(
  scenarios: readonly BoundScenarioSummary[],
): Map<string, { scenarios: Map<string, ScenarioRef>; stepCount: number }> {
  const index = new Map<string, { scenarios: Map<string, ScenarioRef>; stepCount: number }>();

  for (const scenario of scenarios) {
    const ref: ScenarioRef = {
      adoId: scenario.adoId,
      title: scenario.title,
      stepCount: scenario.steps.length,
    };

    for (const step of scenario.steps) {
      for (const knowledgeRef of step.knowledgeRefs) {
        const existing = index.get(knowledgeRef);
        if (existing) {
          existing.scenarios.set(scenario.adoId, ref);
          existing.stepCount += 1;
        } else {
          const scenarios = new Map<string, ScenarioRef>();
          scenarios.set(scenario.adoId, ref);
          index.set(knowledgeRef, { scenarios, stepCount: 1 });
        }
      }
    }
  }

  return index;
}

/**
 * Determine risk level based on scenario and step counts.
 */
function riskLevel(scenarioCount: number, stepCount: number): 'low' | 'medium' | 'high' {
  if (scenarioCount >= 5 || stepCount >= 20) return 'high';
  if (scenarioCount >= 2 || stepCount >= 5) return 'medium';
  return 'low';
}

// ─── Main orchestration ───

export interface KnowledgeDependencyInput {
  readonly scenarios: readonly BoundScenarioSummary[];
  readonly allKnowledgeRefs?: readonly string[];
  readonly generatedAt?: string;
}

/**
 * Build a knowledge dependency report from bound scenarios.
 * Optionally accepts allKnowledgeRefs to detect orphaned knowledge.
 *
 * Pure function: scenarios + knowledge refs → dependency report.
 */
export function buildKnowledgeDependencies(
  input: KnowledgeDependencyInput,
): KnowledgeDependencyReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  // 1. Build reverse index
  const reverseIndex = buildReverseIndex(input.scenarios);

  // 2. Compute usages
  const referencedRefs = new Set(reverseIndex.keys());
  const allRefs = input.allKnowledgeRefs
    ? new Set(input.allKnowledgeRefs)
    : referencedRefs;

  const usages: KnowledgeUsage[] = [...allRefs].map((knowledgeRef) => {
    const entry = reverseIndex.get(knowledgeRef);
    const dependentScenarios = entry
      ? [...entry.scenarios.values()]
      : [];

    return {
      knowledgeRef,
      dependentScenarios,
      dependentStepCount: entry?.stepCount ?? 0,
      isOrphan: !entry || entry.scenarios.size === 0,
    };
  });

  // 3. Identify orphans
  const orphanedKnowledge = usages
    .filter((u) => u.isOrphan)
    .map((u) => u.knowledgeRef)
    .sort();

  // 4. Compute blast radii
  const blastRadii: KnowledgeBlastRadius[] = usages
    .filter((u) => !u.isOrphan)
    .map((u) => ({
      knowledgeRef: u.knowledgeRef,
      scenarioCount: u.dependentScenarios.length,
      stepCount: u.dependentStepCount,
      riskLevel: riskLevel(u.dependentScenarios.length, u.dependentStepCount),
    }))
    .sort((a, b) => b.stepCount - a.stepCount);

  // 5. Aggregate
  const totalKnowledgeRefs = allRefs.size;
  const orphanRate = totalKnowledgeRefs > 0
    ? orphanedKnowledge.length / totalKnowledgeRefs
    : 0;
  const averageBlastRadius = blastRadii.length > 0
    ? blastRadii.reduce((sum, br) => sum + br.scenarioCount, 0) / blastRadii.length
    : 0;

  return {
    kind: 'knowledge-dependency-report',
    version: 1,
    generatedAt,
    usages,
    orphanedKnowledge,
    blastRadii,
    totalKnowledgeRefs,
    orphanRate,
    averageBlastRadius,
  };
}

/**
 * Find knowledge artifacts with the largest blast radius.
 */
export function extractHighRiskKnowledge(
  report: KnowledgeDependencyReport,
  n: number = 5,
): readonly KnowledgeBlastRadius[] {
  return report.blastRadii.slice(0, n);
}

/**
 * Find scenarios that would be affected by a knowledge change.
 */
export function scenariosAffectedBy(
  report: KnowledgeDependencyReport,
  knowledgeRef: string,
): readonly ScenarioRef[] {
  const usage = report.usages.find((u) => u.knowledgeRef === knowledgeRef);
  return usage?.dependentScenarios ?? [];
}
