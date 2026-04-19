import type { AdoId } from '../kernel/identity';
import type { Confidence, StepAction } from '../governance/workflow-types';

export type LearningRuntime = 'decomposition' | 'repair-recovery' | 'workflow';

export interface GroundedSpecFragment {
  id: string;
  runtime: LearningRuntime;
  adoId: AdoId;
  title: string;
  stepIndexes: number[];
  action: StepAction | 'composite';
  intent: string;
  graphNodeIds: string[];
  selectorRefs: readonly string[];
  assertionAnchors: readonly string[];
  artifactRefs: string[];
  confidence: Extract<Confidence, 'compiler-derived' | 'agent-verified' | 'agent-proposed'>;
}

export interface ReplayExample {
  kind: 'replay-example';
  version: 1;
  runtime: LearningRuntime;
  adoId: AdoId;
  runId: string;
  sessionId?: string | null | undefined;
  createdAt: string;
  taskFingerprint: string;
  knowledgeFingerprint: string;
  fragmentIds: string[];
  receiptRefs: string[];
  graphNodeIds: string[];
  selectorRefs: string[];
}

export interface TrainingCorpusRuntimeManifest {
  runtime: LearningRuntime;
  exampleCount: number;
  artifactPaths: string[];
  lastGeneratedAt?: string | null | undefined;
}

export interface TrainingCorpusManifest {
  kind: 'training-corpus-manifest';
  version: 1;
  generatedAt: string;
  corpora: TrainingCorpusRuntimeManifest[];
  replayExamples: number;
  scenarioIds: AdoId[];
  runIds: string[];
}

// ─── Phase 6: Corpus Health ───

export interface RuntimeCoverageEntry {
  readonly runtime: LearningRuntime;
  readonly fragmentCount: number;
  readonly scenarioCount: number;
  readonly uniqueScreenCount: number;
  readonly uniqueActionCount: number;
  readonly avgConfidenceDistribution: Readonly<Record<GroundedSpecFragment['confidence'], number>>;
}

export interface ScreenCoverageEntry {
  readonly screen: string;
  readonly fragmentCount: number;
  readonly runtimes: readonly LearningRuntime[];
  readonly actionFamilies: readonly string[];
  readonly thin: boolean;
}

export interface ActionFamilyCoverageEntry {
  readonly action: string;
  readonly fragmentCount: number;
  readonly screenCount: number;
  readonly avgConfidence: number;
  readonly thin: boolean;
}

export interface CorpusHealthReport {
  readonly kind: 'corpus-health-report';
  readonly version: 1;
  readonly generatedAt: string;
  readonly manifestFingerprint: string;
  readonly runtimeCoverage: readonly RuntimeCoverageEntry[];
  readonly screenCoverage: readonly ScreenCoverageEntry[];
  readonly actionFamilyCoverage: readonly ActionFamilyCoverageEntry[];
  readonly thinScreens: readonly string[];
  readonly thinActionFamilies: readonly string[];
  readonly fragmentProvenanceCompleteness: number;
}

// ─── Phase 6: Replay Evaluation ───

export interface ReplayStepResult {
  readonly stepIndex: number;
  readonly originalWinningSource: string;
  readonly replayWinningSource: string;
  readonly originalTarget: string;
  readonly replayTarget: string;
  readonly matched: boolean;
  readonly driftFields: readonly string[];
}

export interface ReplayEvaluationResult {
  readonly kind: 'replay-evaluation-result';
  readonly version: 1;
  readonly adoId: string;
  readonly runId: string;
  readonly originalRunId: string;
  readonly taskFingerprint: string;
  readonly knowledgeFingerprint: string;
  readonly originalKnowledgeFingerprint: string;
  readonly knowledgeChanged: boolean;
  readonly stepCount: number;
  readonly matchedStepCount: number;
  readonly driftedStepCount: number;
  readonly reproducibilityScore: number;
  readonly stepResults: readonly ReplayStepResult[];
  readonly evaluatedAt: string;
}

export interface ReplayEvaluationSummary {
  readonly kind: 'replay-evaluation-summary';
  readonly version: 1;
  readonly generatedAt: string;
  readonly totalExamples: number;
  readonly evaluatedExamples: number;
  readonly avgReproducibilityScore: number;
  readonly knowledgeChangedCount: number;
  readonly perfectReplayCount: number;
  readonly driftedReplayCount: number;
  readonly byRuntime: readonly {
    readonly runtime: LearningRuntime;
    readonly count: number;
    readonly avgReproducibility: number;
  }[];
}

// ─── Phase 6: Knowledge Bottleneck Detection ───

export type BottleneckSignal =
  | 'thin-screen-coverage'
  | 'repair-recovery-hotspot'
  | 'low-provenance-completeness'
  | 'high-unresolved-rate'
  | 'translation-fallback-dominant';

export interface KnowledgeBottleneck {
  readonly rank: number;
  readonly screen: string;
  readonly element: string | null;
  readonly actionFamily: string;
  readonly signal: BottleneckSignal;
  readonly impactScore: number;
  readonly recommendedArtifacts: readonly string[];
}

export interface KnowledgeBottleneckReport {
  readonly kind: 'knowledge-bottleneck-report';
  readonly version: 1;
  readonly generatedAt: string;
  readonly bottlenecks: readonly KnowledgeBottleneck[];
  readonly topScreens: readonly string[];
  readonly topActionFamilies: readonly string[];
}

// ─── Phase 6: Proposal Ranking ───

export interface ProposalImpactEstimate {
  readonly affectedScenarioCount: number;
  readonly affectedScreens: readonly string[];
  readonly bottleneckReduction: number;
  readonly expectedReproducibilityDelta: number;
  readonly trustPolicyDecision: string;
}

export interface RankedProposal {
  readonly rank: number;
  readonly proposalId: string;
  readonly adoId: string;
  readonly artifactType: string;
  readonly expectedImpact: ProposalImpactEstimate;
  readonly overallScore: number;
  readonly rationale: readonly string[];
}

export interface ProposalRankingReport {
  readonly kind: 'proposal-ranking-report';
  readonly version: 1;
  readonly generatedAt: string;
  readonly rankings: readonly RankedProposal[];
  readonly totalPending: number;
  readonly totalRanked: number;
}

// ─── Phase 6: Learning Scorecard Extension ───

export interface LearningScorecard {
  readonly corpusFragmentCount: number;
  readonly replayExampleCount: number;
  readonly avgReproducibilityScore: number;
  readonly fragmentProvenanceCompleteness: number;
  readonly thinScreenCount: number;
  readonly thinActionFamilyCount: number;
  readonly topBottleneckScreen: string | null;
  readonly topBottleneckImpact: number;
  readonly rankedProposalCount: number;
  readonly topProposalId: string | null;
  readonly topProposalScore: number;
}
