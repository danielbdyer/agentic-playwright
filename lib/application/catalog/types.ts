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
import type { Atom } from '../../domain/pipeline/atom';
import type { Composition } from '../../domain/pipeline/composition';
import type { Projection } from '../../domain/pipeline/projection';
import type { AtomClass } from '../../domain/pipeline/atom-address';
import type { CompositionSubType } from '../../domain/pipeline/composition-address';
import type { ProjectionSubType } from '../../domain/pipeline/projection-address';
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
  /** Tier 1 — atoms (per-SUT-primitive facts). Loaded from
   *  `{suiteRoot}/.canonical-artifacts/atoms/{agentic|deterministic}/`.
   *  Per docs/canon-and-derivation.md § 3.6. Empty until Phase 2
   *  decomposition lands. */
  tier1Atoms: ArtifactEnvelope<Atom<AtomClass, unknown>>[];
  /** Tier 2 — compositions (higher-order patterns over atoms).
   *  Loaded from `{suiteRoot}/.canonical-artifacts/compositions/{agentic|deterministic}/`.
   *  Per docs/canon-and-derivation.md § 3.7. Empty until Phase 2
   *  decomposition lands. */
  tier2Compositions: ArtifactEnvelope<Composition<CompositionSubType, unknown>>[];
  /** Tier 3 — projections (constraints over the atom set).
   *  Loaded from `{suiteRoot}/.canonical-artifacts/projections/{agentic|deterministic}/`.
   *  Per docs/canon-and-derivation.md § 3.8. Empty until projection
   *  discovery engines come online. */
  tier3Projections: ArtifactEnvelope<Projection<ProjectionSubType>>[];
}

/** Empty pipeline-tier fields, for catalog construction sites that
 *  haven't been wired through the tier-aware loaders yet. Spread
 *  this into a partial catalog object to satisfy the required
 *  tier1Atoms/tier2Compositions/tier3Projections fields. The
 *  spread pattern is preferred over inline `tierN: []` so the
 *  intent is visible at every callsite — adding a tier here
 *  surfaces in every consumer that uses the constant. */
export const EMPTY_PIPELINE_TIERS = {
  tier1Atoms: [] as ArtifactEnvelope<Atom<AtomClass, unknown>>[],
  tier2Compositions: [] as ArtifactEnvelope<Composition<CompositionSubType, unknown>>[],
  tier3Projections: [] as ArtifactEnvelope<Projection<ProjectionSubType>>[],
} as const;
