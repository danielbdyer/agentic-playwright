import type {
  AdoId,
  ElementId,
  FixtureId,
  PostureId,
  ScreenId,
  SnapshotTemplateId,
} from '../identity';
import type {
  CompilerDiagnostic,
  Confidence,
  Governance,
  StepAction,
  StepBindingKind,
  WorkflowEnvelopeFingerprints,
  WorkflowEnvelopeIds,
  WorkflowEnvelopeLineage,
} from './workflow';

export interface RefPath {
  segments: string[];
}

export interface AdoStep {
  index: number;
  action: string;
  expected: string;
  sharedStepId?: string | undefined;
}

export interface AdoParameter {
  name: string;
  values: string[];
}

export interface AdoSnapshot {
  id: AdoId;
  revision: number;
  title: string;
  suitePath: string;
  areaPath: string;
  iterationPath: string;
  tags: string[];
  priority: number;
  steps: AdoStep[];
  parameters: AdoParameter[];
  dataRows: Record<string, string>[];
  contentHash: string;
  syncedAt: string;
}

export interface ScenarioSource {
  ado_id: AdoId;
  revision: number;
  content_hash: string;
  synced_at: string;
}

export interface ScenarioMetadata {
  title: string;
  suite: string;
  tags: string[];
  priority: number;
  status: import('./workflow').ScenarioStatus;
  status_detail: string | null;
}

export interface ScenarioPrecondition {
  fixture: FixtureId;
  params?: Record<string, string> | undefined;
}

export interface ValueRefLiteral {
  kind: 'literal';
  value: string;
}

export interface ValueRefFixturePath {
  kind: 'fixture-path';
  path: RefPath;
}

export interface ValueRefPostureSample {
  kind: 'posture-sample';
  element: ElementId;
  posture: PostureId;
  sampleIndex: number;
}

export interface ValueRefParameterRow {
  kind: 'parameter-row';
  name: string;
  rowIndex: number;
}

export interface ValueRefGeneratedToken {
  kind: 'generated-token';
  token: string;
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
  kind: 'step-program';
  instructions: StepInstruction[];
}

export interface StepResolution {
  action?: StepAction | null | undefined;
  screen?: ScreenId | null | undefined;
  element?: ElementId | null | undefined;
  posture?: PostureId | null | undefined;
  override?: string | null | undefined;
  snapshot_template?: SnapshotTemplateId | null | undefined;
}

export interface ScenarioStep {
  index: number;
  intent: string;
  action_text: string;
  expected_text: string;
  action: StepAction;
  screen?: ScreenId | null | undefined;
  element?: ElementId | null | undefined;
  posture?: PostureId | null | undefined;
  override?: string | null | undefined;
  snapshot_template?: SnapshotTemplateId | null | undefined;
  resolution?: StepResolution | null | undefined;
  confidence: Confidence;
}

export interface ScenarioPostcondition {
  action: StepAction;
  screen?: ScreenId | null | undefined;
  element?: ElementId | null | undefined;
  posture?: PostureId | null | undefined;
  override?: string | null | undefined;
  snapshot_template?: SnapshotTemplateId | null | undefined;
}

export interface Scenario {
  source: ScenarioSource;
  metadata: ScenarioMetadata;
  preconditions: ScenarioPrecondition[];
  steps: ScenarioStep[];
  postconditions: ScenarioPostcondition[];
}

export interface BoundStep extends ScenarioStep {
  binding: {
    kind: StepBindingKind;
    reasons: string[];
    ruleId: string | null;
    normalizedIntent: string;
    knowledgeRefs: string[];
    supplementRefs: string[];
    evidenceIds: string[];
    governance: Governance;
    reviewReasons: string[];
  };
  program?: StepProgram | undefined;
}

export interface BoundScenario extends Omit<Scenario, 'steps'> {
  kind: 'bound-scenario';
  version: 1;
  stage: 'preparation';
  scope: 'scenario';
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  governance: Governance;
  payload: {
    source: ScenarioSource;
    metadata: ScenarioMetadata;
    preconditions: ScenarioPrecondition[];
    steps: BoundStep[];
    postconditions: ScenarioPostcondition[];
    diagnostics: CompilerDiagnostic[];
  };
  steps: BoundStep[];
  diagnostics: CompilerDiagnostic[];
}
