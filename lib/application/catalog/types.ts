import type { ScreenBundle } from '../../domain/knowledge/screen-bundle';
import type { SnapshotTemplateId } from '../../domain/identity';
import type {
  AdoSnapshot,
  AgentSession,
  ApprovalReceipt,
  BenchmarkContext,
  BehaviorPatternDocument,
  BoundScenario,
  ApplicationInterfaceGraph,
  ConfidenceOverlayCatalog,
  DatasetControl,
  DiscoveryRun,
  EvidenceRecord,
  HarvestManifest,
  InterpretationDriftRecord,
  ReplayExample,
  ResolutionGraphRecord,
  MergedPatterns,
  PatternDocument,
  ProposalBundle,
  ResolutionControl,
  RerunPlan,
  RunRecord,
  RunbookControl,
  Scenario,
  SelectorCanon,
  ScenarioTaskPacket,
  ScreenBehavior,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  StateTransitionGraph,
  SurfaceGraph,
  TrainingCorpusManifest,
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
  rerunPlans: ArtifactEnvelope<RerunPlan>[];
  datasets: ArtifactEnvelope<DatasetControl>[];
  benchmarks: ArtifactEnvelope<BenchmarkContext>[];
  routeManifests: ArtifactEnvelope<HarvestManifest>[];
  resolutionControls: ArtifactEnvelope<ResolutionControl>[];
  runbooks: ArtifactEnvelope<RunbookControl>[];
  surfaces: ArtifactEnvelope<SurfaceGraph>[];
  screenElements: ArtifactEnvelope<ScreenElements>[];
  screenHints: ArtifactEnvelope<ScreenHints>[];
  screenPostures: ArtifactEnvelope<ScreenPostures>[];
  screenBehaviors: ArtifactEnvelope<ScreenBehavior>[];
  screenBundles: Record<string, ScreenBundleEntry>;
  patternDocuments: ArtifactEnvelope<PatternDocument>[];
  behaviorPatterns: ArtifactEnvelope<BehaviorPatternDocument>[];
  mergedPatterns: MergedPatterns;
  knowledgeSnapshots: KnowledgeSnapshotEntry[];
  discoveryRuns: ArtifactEnvelope<DiscoveryRun>[];
  evidenceRecords: ArtifactEnvelope<EvidenceRecord>[];
  interpretationDriftRecords: ArtifactEnvelope<InterpretationDriftRecord>[];
  resolutionGraphRecords: ArtifactEnvelope<ResolutionGraphRecord>[];
  confidenceCatalog: ArtifactEnvelope<ConfidenceOverlayCatalog> | null;
  interfaceGraph: ArtifactEnvelope<ApplicationInterfaceGraph> | null;
  selectorCanon: ArtifactEnvelope<SelectorCanon> | null;
  stateGraph: ArtifactEnvelope<StateTransitionGraph> | null;
  agentSessions: ArtifactEnvelope<AgentSession>[];
  learningManifest: ArtifactEnvelope<TrainingCorpusManifest> | null;
  replayExamples: ArtifactEnvelope<ReplayExample>[];
  trustPolicy: ArtifactEnvelope<TrustPolicy>;
}
