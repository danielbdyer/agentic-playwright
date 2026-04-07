import type { ScreenBundle } from '../../domain/knowledge/screen-bundle';
import type { SnapshotTemplateId } from '../../domain/kernel/identity';
import type {
  InterpretationDriftRecord,
  ProposalBundle,
  ResolutionGraphRecord,
  RunRecord,
} from '../../domain/execution/types';
import type { TrustPolicy } from '../../domain/governance/workflow-types';
import type { AgentSession } from '../../domain/handshake/session';
import type { ImprovementRun } from '../../domain/improvement/types';
import type { RouteKnowledgeManifest } from '../../domain/intent/routes';
import type { AdoSnapshot, BoundScenario, Scenario } from '../../domain/intent/types';
import type {
  BehaviorPatternDocument,
  ConfidenceOverlayCatalog,
  MergedPatterns,
  PatternDocument,
  ScreenBehavior,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SurfaceGraph,
} from '../../domain/knowledge/types';
import type { ReplayExample, TrainingCorpusManifest } from '../../domain/learning/types';
import type { BenchmarkContext } from '../../domain/projection/types';
import type {
  ApprovalReceipt,
  DatasetControl,
  EvidenceRecord,
  RerunPlan,
  ResolutionControl,
  RunbookControl,
  ScenarioInterpretationSurface,
} from '../../domain/resolution/types';
import type {
  ApplicationInterfaceGraph,
  DiscoveryRun,
  SelectorCanon,
  StateTransitionGraph,
} from '../../domain/target/interface-graph';
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
  interpretationSurfaces: ArtifactEnvelope<ScenarioInterpretationSurface>[];
  runRecords: ArtifactEnvelope<RunRecord>[];
  proposalBundles: ArtifactEnvelope<ProposalBundle>[];
  approvalReceipts: ArtifactEnvelope<ApprovalReceipt>[];
  rerunPlans: ArtifactEnvelope<RerunPlan>[];
  datasets: ArtifactEnvelope<DatasetControl>[];
  benchmarks: ArtifactEnvelope<BenchmarkContext>[];
  routeManifests: ArtifactEnvelope<RouteKnowledgeManifest>[];
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
  improvementRuns: ArtifactEnvelope<ImprovementRun>[];
  learningManifest: ArtifactEnvelope<TrainingCorpusManifest> | null;
  replayExamples: ArtifactEnvelope<ReplayExample>[];
  trustPolicy: ArtifactEnvelope<TrustPolicy>;
}
