/**
 * Architecture Fitness types.
 *
 * Types for measuring and tracking architectural quality metrics:
 * layer purity, dependency violations, readonly coverage, and
 * bounded workflow seam completeness.
 */

// ─── Layer Purity ───

export interface LayerPurityMetric {
  readonly layer: string;
  readonly totalFunctions: number;
  readonly letBindings: number;
  readonly purityRate: number;
}

export interface ArchitectureFitnessReport {
  readonly timestamp: string;
  readonly layers: readonly LayerPurityMetric[];
  readonly dependencyViolations: readonly DependencyViolation[];
  readonly overallPurityRate: number;
}

// ─── Dependency Violations ───

export interface DependencyViolation {
  readonly sourceFile: string;
  readonly sourceLayer: string;
  readonly targetLayer: string;
  readonly importPath: string;
}

// ─── Seam Completeness ───

export interface SeamCompletenessMetric {
  readonly package: string;
  readonly expectedFiles: readonly string[];
  readonly presentFiles: readonly string[];
  readonly missingFiles: readonly string[];
  readonly completeness: number;
}
