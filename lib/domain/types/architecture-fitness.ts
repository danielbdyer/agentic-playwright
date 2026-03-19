/**
 * Architecture Fitness Report types.
 *
 * Measures the structural health of the Tesseract codebase itself — not runtime
 * pipeline metrics (which live in fitness.ts), but code-structural properties that
 * predict how amenable the codebase is to future improvement.
 *
 * This is the fifth tuning surface: the information-theoretic efficiency of the
 * code, its type surfaces, and its algorithms. See docs/recursive-self-improvement.md
 * § Five Tuning Surfaces for the formal model.
 */

// ─── Layer Integrity ───

export interface LayerViolation {
  readonly sourceFile: string;
  readonly sourceLayer: CodebaseLayer;
  readonly importedFile: string;
  readonly importedLayer: CodebaseLayer;
  readonly importStatement: string;
}

export type CodebaseLayer =
  | 'domain'
  | 'application'
  | 'runtime'
  | 'infrastructure'
  | 'composition'
  | 'playwright'
  | 'scripts'
  | 'tests';

// ─── Visitor Coverage ───

export interface VisitorCoverageEntry {
  readonly unionType: string;
  readonly file: string;
  readonly line: number;
  readonly pattern: 'fold' | 'switch' | 'if-chain' | 'effect-match';
  readonly exhaustive: boolean;
}

export interface VisitorCoverageSummary {
  readonly totalConsumers: number;
  readonly foldConsumers: number;
  readonly switchConsumers: number;
  readonly ifChainConsumers: number;
  readonly effectMatchConsumers: number;
  readonly coverageRate: number;
}

// ─── Provenance Completeness ───

export interface ProvenanceGap {
  readonly artifactType: string;
  readonly file: string;
  readonly line: number;
  readonly missingFields: readonly ('lineage' | 'fingerprints' | 'provenance' | 'governance')[];
}

// ─── Knowledge Compression ───

export interface KnowledgeCompressionMetrics {
  readonly screenCount: number;
  readonly patternCount: number;
  readonly scenarioCount: number;
  readonly knowledgeToScenarioRatio: number;
  readonly averageScenariosPerScreen: number;
  readonly averageElementsPerScreen: number;
  readonly hintReuseRate: number;
}

// ─── Information Efficiency ───

export interface InformationEfficiencyMetrics {
  readonly translationLossRate: number;
  readonly supplementReuseRate: number;
  readonly resolutionPathEntropy: number;
  readonly aliasRedundancyRate: number;
}

// ─── Purity Metrics ───

export interface PurityMetrics {
  readonly domainFunctions: number;
  readonly domainPureFunctions: number;
  readonly domainPurityRate: number;
  readonly domainLetBindings: number;
  readonly domainMutablePatterns: number;
}

// ─── Envelope Discipline ───

export interface EnvelopeDisciplineMetrics {
  readonly envelopeTypes: number;
  readonly rawArtifactTypes: number;
  readonly envelopeCoverageRate: number;
}

// ─── Parameter Exposure ───

export interface UnexposedParameter {
  readonly file: string;
  readonly line: number;
  readonly value: string;
  readonly context: string;
}

export interface ParameterExposureMetrics {
  readonly totalTunableConstants: number;
  readonly exposedInConfig: number;
  readonly exposureRate: number;
  readonly unexposed: readonly UnexposedParameter[];
}

// ─── Algorithm Tuning Surface ───

export interface AlgorithmProfile {
  readonly name: string;
  readonly file: string;
  readonly parameterCount: number;
  readonly hasExposedConfig: boolean;
  readonly compressionRatio: number | null;
  readonly notes: string;
}

// ─── Architecture Fitness Report ───

export interface ArchitectureFitnessReport {
  readonly kind: 'architecture-fitness-report';
  readonly version: 1;
  readonly measuredAt: string;
  readonly pipelineVersion: string;
  readonly layerIntegrity: {
    readonly violations: readonly LayerViolation[];
    readonly violationCount: number;
    readonly clean: boolean;
  };
  readonly visitorCoverage: VisitorCoverageSummary;
  readonly provenanceCompleteness: {
    readonly gaps: readonly ProvenanceGap[];
    readonly gapCount: number;
    readonly completenessRate: number;
  };
  readonly knowledgeCompression: KnowledgeCompressionMetrics;
  readonly informationEfficiency: InformationEfficiencyMetrics;
  readonly purity: PurityMetrics;
  readonly envelopeDiscipline: EnvelopeDisciplineMetrics;
  readonly parameterExposure: ParameterExposureMetrics;
  readonly algorithms: readonly AlgorithmProfile[];
}
