import type {
  AdoId,
  ElementId,
  FixtureId,
  PostureId,
  ScreenId,
  SnapshotTemplateId,
} from '../kernel/identity';
import type {
  CompilerDiagnostic,
  Confidence,
  Governance,
  ScenarioStatus,
  StepAction,
  StepBindingKind,
  WorkflowMetadata,
} from '../governance/workflow-types';

export interface RefPath {
  readonly segments: readonly string[];
}

export interface AdoStep {
  readonly index: number;
  readonly action: string;
  readonly expected: string;
  readonly sharedStepId?: string | undefined;
}

export interface AdoParameter {
  readonly name: string;
  readonly values: readonly string[];
}

export interface AdoSnapshot {
  readonly id: AdoId;
  readonly revision: number;
  readonly title: string;
  readonly suitePath: string;
  readonly areaPath: string;
  readonly iterationPath: string;
  readonly tags: readonly string[];
  readonly priority: number;
  readonly steps: readonly AdoStep[];
  readonly parameters: readonly AdoParameter[];
  readonly dataRows: readonly Readonly<Record<string, string>>[];
  readonly contentHash: string;
  readonly syncedAt: string;
}

export interface ScenarioSource {
  readonly ado_id: AdoId;
  readonly revision: number;
  readonly content_hash: string;
  readonly synced_at: string;
}

export interface ScenarioMetadata {
  readonly title: string;
  readonly suite: string;
  readonly tags: readonly string[];
  readonly priority: number;
  readonly status: ScenarioStatus;
  readonly status_detail: string | null;
}

export interface ScenarioPrecondition {
  readonly fixture: FixtureId;
  readonly params?: Readonly<Record<string, string>> | undefined;
}

export interface ValueRefLiteral {
  readonly kind: 'literal';
  readonly value: string;
}

export interface ValueRefFixturePath {
  readonly kind: 'fixture-path';
  readonly path: RefPath;
}

export interface ValueRefPostureSample {
  readonly kind: 'posture-sample';
  readonly element: ElementId;
  readonly posture: PostureId;
  readonly sampleIndex: number;
}

export interface ValueRefParameterRow {
  readonly kind: 'parameter-row';
  readonly name: string;
  readonly rowIndex: number;
}

export interface ValueRefGeneratedToken {
  readonly kind: 'generated-token';
  readonly token: string;
}

export type ValueRef =
  | ValueRefLiteral
  | ValueRefFixturePath
  | ValueRefPostureSample
  | ValueRefParameterRow
  | ValueRefGeneratedToken;

export type StepInstruction =
  | { kind: 'navigate'; screen: ScreenId }
  | { kind: 'enter'; screen: ScreenId; element: ElementId; posture: PostureId | null; value: ValueRef | null }
  | { kind: 'invoke'; screen: ScreenId; element: ElementId; action: 'click' }
  | { kind: 'observe-structure'; screen: ScreenId; element: ElementId; snapshotTemplate: SnapshotTemplateId }
  | { kind: 'custom-escape-hatch'; reason: string };

export interface StepProgram {
  readonly kind: 'step-program';
  readonly instructions: readonly StepInstruction[];
}

export interface StepResolution {
  readonly action?: StepAction | null | undefined;
  readonly screen?: ScreenId | null | undefined;
  readonly element?: ElementId | null | undefined;
  readonly posture?: PostureId | null | undefined;
  readonly override?: string | null | undefined;
  readonly snapshot_template?: SnapshotTemplateId | null | undefined;
  readonly route_state?: Readonly<Record<string, string>> | null | undefined;
}

export interface ScenarioStep {
  readonly index: number;
  readonly intent: string;
  readonly action_text: string;
  readonly expected_text: string;
  readonly action: StepAction;
  readonly screen?: ScreenId | null | undefined;
  readonly element?: ElementId | null | undefined;
  readonly posture?: PostureId | null | undefined;
  readonly override?: string | null | undefined;
  readonly snapshot_template?: SnapshotTemplateId | null | undefined;
  readonly route_state?: Readonly<Record<string, string>> | null | undefined;
  readonly resolution?: StepResolution | null | undefined;
  readonly confidence: Confidence;
}

export interface ScenarioPostcondition {
  readonly action: StepAction;
  readonly screen?: ScreenId | null | undefined;
  readonly element?: ElementId | null | undefined;
  readonly posture?: PostureId | null | undefined;
  readonly override?: string | null | undefined;
  readonly snapshot_template?: SnapshotTemplateId | null | undefined;
}

export interface Scenario {
  readonly source: ScenarioSource;
  readonly metadata: ScenarioMetadata;
  readonly preconditions: readonly ScenarioPrecondition[];
  readonly steps: readonly ScenarioStep[];
  readonly postconditions: readonly ScenarioPostcondition[];
}

export interface BoundStep extends ScenarioStep {
  readonly binding: {
    readonly kind: StepBindingKind;
    readonly reasons: readonly string[];
    readonly ruleId: string | null;
    readonly normalizedIntent: string;
    readonly knowledgeRefs: readonly string[];
    readonly supplementRefs: readonly string[];
    readonly evidenceIds: readonly string[];
    readonly governance: Governance;
    readonly reviewReasons: readonly string[];
  };
  readonly program?: StepProgram | undefined;
}

export interface GroundedFlowStep {
  readonly index: number;
  readonly intent: string;
  readonly action: StepAction;
  readonly screen: ScreenId | null;
  readonly element: ElementId | null;
  readonly posture: PostureId | null;
  readonly snapshotTemplate: SnapshotTemplateId | null;
  readonly dataValue: string | null;
  readonly dataSource: 'scenario-explicit' | 'resolution-control' | 'dataset' | 'fixture' | 'posture-sample' | 'generated-token' | 'none';
  readonly confidence: Confidence;
  readonly governance: Governance;
  readonly bindingKind: StepBindingKind;
  readonly provenanceKind: 'explicit' | 'approved-knowledge' | 'live-exploration' | 'agent-interpreted' | 'unresolved';
  readonly normalizedIntent: string;
  readonly knowledgeRefs: ReadonlyArray<string>;
  readonly supplementRefs: ReadonlyArray<string>;
}

export interface GroundedFlowMetadata {
  readonly adoId: AdoId;
  readonly revision: number;
  readonly contentHash: string;
  readonly title: string;
  readonly suite: string;
  readonly tags: ReadonlyArray<string>;
  readonly lifecycle: 'normal' | 'fixme' | 'skip' | 'fail';
  readonly confidence: Confidence | 'mixed';
  readonly governance: Governance;
  readonly fixtures: ReadonlyArray<string>;
}

export interface GroundedSpecFlow {
  readonly kind: 'grounded-spec-flow';
  readonly metadata: GroundedFlowMetadata;
  readonly steps: ReadonlyArray<GroundedFlowStep>;
}

export interface BoundScenario extends Omit<Scenario, 'steps'>, WorkflowMetadata<'preparation'> {
  readonly kind: 'bound-scenario';
  readonly scope: 'scenario';
  readonly payload: {
    readonly source: ScenarioSource;
    readonly metadata: ScenarioMetadata;
    readonly preconditions: readonly ScenarioPrecondition[];
    readonly steps: readonly BoundStep[];
    readonly postconditions: readonly ScenarioPostcondition[];
    readonly diagnostics: readonly CompilerDiagnostic[];
  };
  readonly steps: readonly BoundStep[];
  readonly diagnostics: readonly CompilerDiagnostic[];
}
