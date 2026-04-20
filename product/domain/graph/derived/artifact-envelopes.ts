/**
 * Graph build input artifact envelopes — carved out of
 * `product/domain/graph/derived-graph.ts` at Step 4a per
 * `docs/v2-direction.md §6 Step 4a` and §3.7's named split.
 *
 * Pure type definitions; no runtime logic. The envelopes describe
 * the shape of each artifact handed to the graph builder, grouped
 * here so consumers importing the input shape don't have to drag
 * in the 1500-LOC builder module.
 */

import type { SnapshotTemplateId } from '../../kernel/identity';
import type { InterpretationDriftRecord, RunRecord } from '../../execution/types';
import type { ImprovementRun } from '../../improvement/types';
import type { AdoSnapshot, BoundScenario, Scenario } from '../../intent/types';
import type {
  ConfidenceOverlayCatalog,
  PatternDocument,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SurfaceGraph,
} from '../../knowledge/types';
import type {
  DatasetControl,
  ResolutionControl,
  RunbookControl,
  ScenarioInterpretationSurface,
} from '../../resolution/types';

export interface ArtifactEnvelope<T> {
  readonly artifact: T;
  readonly artifactPath: string;
}

export interface ScenarioGraphArtifact extends ArtifactEnvelope<Scenario> {
  readonly generatedSpecPath: string;
  readonly generatedSpecExists: boolean;
  readonly generatedTracePath: string;
  readonly generatedTraceExists: boolean;
  readonly generatedReviewPath: string;
  readonly generatedReviewExists: boolean;
}

export interface BoundScenarioGraphArtifact extends ArtifactEnvelope<BoundScenario> {}

export interface InterpretationSurfaceGraphArtifact extends ArtifactEnvelope<ScenarioInterpretationSurface> {}
export interface ImprovementRunGraphArtifact extends ArtifactEnvelope<ImprovementRun> {}

export interface KnowledgeSnapshotArtifact {
  readonly relativePath: SnapshotTemplateId;
  readonly artifactPath: string;
}

export interface ScreenHintsArtifact extends ArtifactEnvelope<ScreenHints> {}

export interface SharedPatternsArtifact extends ArtifactEnvelope<PatternDocument> {}
export interface DatasetControlArtifact extends ArtifactEnvelope<DatasetControl> {}
export interface ResolutionControlArtifact extends ArtifactEnvelope<ResolutionControl> {}
export interface RunbookControlArtifact extends ArtifactEnvelope<RunbookControl> {}
export interface ConfidenceOverlayArtifact extends ArtifactEnvelope<ConfidenceOverlayCatalog> {}

export interface EvidenceArtifact {
  readonly artifactPath: string;
  readonly targetNodeId?: string;
}

export interface PolicyDecisionArtifact {
  readonly id: string;
  readonly decision: 'allow' | 'review' | 'deny';
  readonly artifactPath: string;
  readonly targetNodeId: string;
  readonly reasons: readonly string[];
}

export interface GraphBuildInput {
  readonly snapshots: readonly ArtifactEnvelope<AdoSnapshot>[];
  readonly surfaceGraphs: readonly ArtifactEnvelope<SurfaceGraph>[];
  readonly knowledgeSnapshots: readonly KnowledgeSnapshotArtifact[];
  readonly screenElements: readonly ArtifactEnvelope<ScreenElements>[];
  readonly screenPostures: readonly ArtifactEnvelope<ScreenPostures>[];
  readonly screenHints?: readonly ScreenHintsArtifact[];
  readonly sharedPatterns?: readonly SharedPatternsArtifact[];
  readonly datasets?: readonly DatasetControlArtifact[];
  readonly resolutionControls?: readonly ResolutionControlArtifact[];
  readonly runbooks?: readonly RunbookControlArtifact[];
  readonly confidenceOverlays?: readonly ConfidenceOverlayArtifact[];
  readonly scenarios: readonly ScenarioGraphArtifact[];
  readonly boundScenarios?: readonly BoundScenarioGraphArtifact[];
  readonly interpretationSurfaces?: readonly InterpretationSurfaceGraphArtifact[];
  readonly runRecords?: readonly ArtifactEnvelope<RunRecord>[];
  readonly improvementRuns?: readonly ImprovementRunGraphArtifact[];
  readonly interpretationDriftRecords?: readonly ArtifactEnvelope<InterpretationDriftRecord>[];
  readonly evidence: readonly EvidenceArtifact[];
  readonly policyDecisions?: readonly PolicyDecisionArtifact[];
}
