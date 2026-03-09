import type { ScreenBundle } from '../../domain/knowledge/screen-bundle';
import type { SnapshotTemplateId } from '../../domain/identity';
import type {
  AdoSnapshot,
  ApprovalReceipt,
  BenchmarkContext,
  BoundScenario,
  DatasetControl,
  EvidenceRecord,
  MergedPatterns,
  PatternDocument,
  ProposalBundle,
  ResolutionControl,
  RunRecord,
  RunbookControl,
  Scenario,
  ScenarioTaskPacket,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SurfaceGraph,
  TrustPolicy,
} from '../../domain/types';
import type { ProjectPaths } from '../paths';

export interface ArtifactEnvelope<T> {
  artifact: T;
  artifactPath: string;
  absolutePath: string;
  fingerprint: string;
}

export interface ScreenBundleEntry {
  surface: ArtifactEnvelope<SurfaceGraph>;
  elements: ArtifactEnvelope<ScreenElements>;
  hints: ArtifactEnvelope<ScreenHints> | null;
  postures: ArtifactEnvelope<ScreenPostures> | null;
  bundle: ScreenBundle;
}

export interface KnowledgeSnapshotEntry {
  relativePath: SnapshotTemplateId;
  artifactPath: string;
  absolutePath: string;
}

export interface WorkspaceCatalog {
  paths: ProjectPaths;
  snapshots: ArtifactEnvelope<AdoSnapshot>[];
  scenarios: ArtifactEnvelope<Scenario>[];
  boundScenarios: ArtifactEnvelope<BoundScenario>[];
  taskPackets: ArtifactEnvelope<ScenarioTaskPacket>[];
  runRecords: ArtifactEnvelope<RunRecord>[];
  proposalBundles: ArtifactEnvelope<ProposalBundle>[];
  approvalReceipts: ArtifactEnvelope<ApprovalReceipt>[];
  datasets: ArtifactEnvelope<DatasetControl>[];
  benchmarks: ArtifactEnvelope<BenchmarkContext>[];
  resolutionControls: ArtifactEnvelope<ResolutionControl>[];
  runbooks: ArtifactEnvelope<RunbookControl>[];
  surfaces: ArtifactEnvelope<SurfaceGraph>[];
  screenElements: ArtifactEnvelope<ScreenElements>[];
  screenHints: ArtifactEnvelope<ScreenHints>[];
  screenPostures: ArtifactEnvelope<ScreenPostures>[];
  screenBundles: Record<string, ScreenBundleEntry>;
  patternDocuments: ArtifactEnvelope<PatternDocument>[];
  mergedPatterns: MergedPatterns;
  knowledgeSnapshots: KnowledgeSnapshotEntry[];
  evidenceRecords: ArtifactEnvelope<EvidenceRecord>[];
  trustPolicy: ArtifactEnvelope<TrustPolicy>;
}
