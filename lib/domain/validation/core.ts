import * as schemaDecode from '../schemas/decode';
import * as schemas from '../schemas';
import type {
  AdoSnapshot,
  ApprovalReceipt,
  AssertionKind,
  BenchmarkImprovementProjection,
  BenchmarkContext,
  BenchmarkScorecard,
  BehaviorPatternDocument,
  BoundScenario,
  BoundStep,
  CompilerDiagnostic,
  Confidence,
  ConfidenceOverlayCatalog,
  DatasetControl,
  DerivedGraph,
  EffectTargetKind,
  ElementSig,
  EventSignature,
  Governance,
  LocatorStrategy,
  DogfoodRun,
  Manifest,
  MergedPatterns,
  OperatorInboxItem,
  PatternDocument,
  Posture,
  PostureEffect,
  RefPath,
  ResolutionControl,
  ResolutionGraphRecord,
  RerunPlan,
  RunRecord,
  RunbookControl,
  ScreenBehavior,
  InterpretationDriftRecord,
  Scenario,
  ScenarioInterpretationSurface,
  ScenarioMetadata,
  ScenarioTaskPacket,
  ScenarioPostcondition,
  ScenarioPrecondition,
  ScenarioSource,
  ScenarioStep,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  StateNode,
  StateTransition,
  SharedPatterns,
  StepAction,
  StepBindingKind,
  StepExecutionReceipt,
  StepInstruction,
  StepResolutionGraph,
  StepResolution,
  StepProgram,
  ProposalBundle,
  ResolutionReceipt,
  SurfaceDefinition,
  SurfaceGraph,
  SurfaceSection,
  TrustPolicy,
  TrustPolicyArtifactType,
  TrustPolicyEvaluation,
  TrustPolicyEvaluationReason,
  ValueRef,
  WorkflowEnvelopeFingerprints,
  WorkflowEnvelopeIds,
  WorkflowEnvelopeLineage,
  WorkflowLane,
  WorkflowScope,
  WorkflowStage,
  WidgetCapabilityContract,
} from '../types';
import type { RecoveryPolicy } from '../execution/recovery-policy';
import { computeAdoContentHash } from '../hash';
import { validatePatternDocument as validatePatternDocumentRecord } from '../knowledge/patterns';
import { normalizeScreenPostures } from '../posture-contract';
import { SchemaError } from '../errors';
import { uniqueSorted } from '../collections';
import {
  createAdoId,
  createCanonicalTargetRef,
  createElementId,
  createEventSignatureRef,
  createFixtureId,
  createPostureId,
  createScreenId,
  createSelectorRef,
  createSectionId,
  createSnapshotTemplateId,
  createStateNodeRef,
  createSurfaceId,
  createTransitionRef,
  createWidgetId,
  ensureSafeRelativePathLike,
} from '../identity';
import {
  expectArray,
  expectBoolean,
  expectEnum,
  expectId,
  expectIdArray,
  expectNumber,
  expectOptionalId,
  expectOptionalString,
  expectRecord,
  expectString,
  expectStringArray,
  expectStringRecord,
  type UnknownRecord,
} from './primitives';

const scenarioStatuses = ['stub', 'draft', 'active', 'needs-repair', 'blocked', 'deprecated'] as const;
const stepActions = ['navigate', 'input', 'click', 'assert-snapshot', 'custom'] as const;
const confidences = ['human', 'agent-verified', 'agent-proposed', 'compiler-derived', 'intent-only', 'unbound'] as const;
const executionProfiles = ['interactive', 'ci-batch', 'dogfood'] as const;
const resolutionModes = ['deterministic', 'translation', 'agentic'] as const;
const valueRefKinds = ['literal', 'fixture-path', 'posture-sample', 'parameter-row', 'generated-token'] as const;
const stepInstructionKinds = ['navigate', 'enter', 'invoke', 'observe-structure', 'custom-escape-hatch'] as const;
const surfaceKinds = ['screen-root', 'form', 'action-cluster', 'validation-region', 'result-set', 'details-pane', 'modal', 'section-root'] as const;
const assertionKinds = ['state', 'structure'] as const;
const effectTargetKinds = ['self', 'element', 'surface'] as const;
const governanceStates = ['approved', 'review-required', 'blocked'] as const;
const certificationStates = ['uncertified', 'certified'] as const;
const locatorStrategyKinds = ['test-id', 'role-name', 'css'] as const;
const effectStates = ['validation-error', 'required-error', 'disabled', 'enabled', 'visible', 'hidden'] as const;
const widgetActions = ['click', 'fill', 'clear', 'get-value'] as const;
const widgetPreconditions = ['visible', 'enabled', 'editable'] as const;
const widgetEffectCategories = ['mutation', 'observation', 'focus', 'navigation'] as const;
const graphNodeKinds = ['snapshot', 'screen', 'screen-hints', 'pattern', 'confidence-overlay', 'dataset', 'resolution-control', 'runbook', 'section', 'surface', 'element', 'posture', 'capability', 'scenario', 'step', 'generated-spec', 'generated-trace', 'generated-review', 'evidence', 'policy-decision', 'participant', 'intervention', 'improvement-run', 'acceptance-decision'] as const;
const graphEdgeKinds = ['derived-from', 'contains', 'references', 'uses', 'learns-from', 'affects', 'asserts', 'emits', 'observed-by', 'proposed-change-for', 'governs', 'drifts-to'] as const;
const diagnosticSeverities = ['info', 'warn', 'error'] as const;
const diagnosticConfidences = ['human', 'agent-verified', 'agent-proposed', 'compiler-derived', 'intent-only', 'unbound', 'mixed'] as const;
const workflowStages = ['preparation', 'resolution', 'execution', 'evidence', 'proposal', 'projection'] as const;
const workflowScopes = ['scenario', 'step', 'run', 'suite', 'workspace', 'control'] as const;
const workflowLanes = ['intent', 'knowledge', 'control', 'resolution', 'execution', 'governance', 'projection'] as const;
const stepWinningSources = ['scenario-explicit', 'resolution-control', 'runbook-dataset', 'default-dataset', 'knowledge-hint', 'posture-sample', 'generated-token', 'approved-knowledge', 'approved-equivalent', 'prior-evidence', 'structured-translation', 'live-dom', 'none'] as const;
const statePredicateSemantics = ['visible', 'hidden', 'enabled', 'disabled', 'valid', 'invalid', 'open', 'closed', 'expanded', 'collapsed', 'populated', 'cleared', 'active-route', 'active-modal'] as const;
const transitionEffectKinds = ['reveal', 'hide', 'enable', 'disable', 'validate', 'invalidate', 'open', 'close', 'navigate', 'return', 'expand', 'collapse', 'populate', 'clear'] as const;

function validateWorkflowEnvelopeIds(value: unknown, path: string): WorkflowEnvelopeIds {
  const ids = expectRecord(value ?? {}, path);
  return {
    adoId: expectOptionalId(ids.adoId, `${path}.adoId`, createAdoId) ?? null,
    suite: expectOptionalString(ids.suite, `${path}.suite`) ?? null,
    sessionId: expectOptionalString(ids.sessionId, `${path}.sessionId`) ?? null,
    runId: expectOptionalString(ids.runId, `${path}.runId`) ?? null,
    stepIndex: ids.stepIndex === undefined || ids.stepIndex === null ? null : expectNumber(ids.stepIndex, `${path}.stepIndex`),
    dataset: expectOptionalString(ids.dataset, `${path}.dataset`) ?? null,
    runbook: expectOptionalString(ids.runbook, `${path}.runbook`) ?? null,
    resolutionControl: expectOptionalString(ids.resolutionControl, `${path}.resolutionControl`) ?? null,
    participantIds: expectStringArray(ids.participantIds ?? [], `${path}.participantIds`),
    interventionIds: expectStringArray(ids.interventionIds ?? [], `${path}.interventionIds`),
    improvementRunId: expectOptionalString(ids.improvementRunId, `${path}.improvementRunId`) ?? null,
    iteration: ids.iteration === undefined || ids.iteration === null ? null : expectNumber(ids.iteration, `${path}.iteration`),
    parentExperimentId: expectOptionalString(ids.parentExperimentId, `${path}.parentExperimentId`) ?? null,
  };
}

function validateWorkflowEnvelopeFingerprints(value: unknown, path: string, fallbackArtifact: string): WorkflowEnvelopeFingerprints {
  const fingerprints = expectRecord(value ?? {}, path);
  return {
    artifact: expectOptionalString(fingerprints.artifact, `${path}.artifact`) ?? fallbackArtifact,
    content: expectOptionalString(fingerprints.content, `${path}.content`) ?? null,
    knowledge: expectOptionalString(fingerprints.knowledge, `${path}.knowledge`) ?? null,
    controls: expectOptionalString(fingerprints.controls, `${path}.controls`) ?? null,
    task: expectOptionalString(fingerprints.task, `${path}.task`) ?? null,
    run: expectOptionalString(fingerprints.run, `${path}.run`) ?? null,
  };
}

function validateWorkflowEnvelopeLineage(value: unknown, path: string, defaults?: Partial<WorkflowEnvelopeLineage>): WorkflowEnvelopeLineage {
  const lineage = expectRecord(value ?? {}, path);
  return {
    sources: expectStringArray(lineage.sources ?? defaults?.sources ?? [], `${path}.sources`),
    parents: expectStringArray(lineage.parents ?? defaults?.parents ?? [], `${path}.parents`),
    handshakes: expectArray(lineage.handshakes ?? defaults?.handshakes ?? [], `${path}.handshakes`).map((entry, index) =>
      expectEnum(entry, `${path}.handshakes[${index}]`, workflowStages),
    ) as WorkflowStage[],
    experimentIds: expectStringArray(lineage.experimentIds ?? defaults?.experimentIds ?? [], `${path}.experimentIds`),
  };
}

function validateWorkflowEnvelopeHeader<Stage extends WorkflowStage, Scope extends WorkflowScope>(
  value: UnknownRecord,
  path: string,
  defaults: {
    stage: Stage;
    scope: Scope;
    governance: Governance;
    artifactFingerprint: string;
    ids?: Partial<WorkflowEnvelopeIds>;
    lineage?: Partial<WorkflowEnvelopeLineage>;
  },
): {
  version: 1;
  stage: Stage;
  scope: Scope;
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  governance: Governance;
} {
  return {
    version: value.version === undefined ? 1 : expectNumber(value.version, `${path}.version`) as 1,
    stage: value.stage === undefined ? defaults.stage : expectEnum(value.stage, `${path}.stage`, workflowStages) as Stage,
    scope: value.scope === undefined ? defaults.scope : expectEnum(value.scope, `${path}.scope`, workflowScopes) as Scope,
    ids: {
      ...defaults.ids,
      ...validateWorkflowEnvelopeIds(value.ids, `${path}.ids`),
    },
    fingerprints: validateWorkflowEnvelopeFingerprints(value.fingerprints, `${path}.fingerprints`, defaults.artifactFingerprint),
    lineage: validateWorkflowEnvelopeLineage(value.lineage, `${path}.lineage`, defaults.lineage),
    governance: value.governance === undefined ? defaults.governance : expectEnum(value.governance, `${path}.governance`, governanceStates),
  };
}

function validateCanonicalLineage(value: unknown, path: string) {
  const lineage = expectRecord(value ?? {}, path);
  return {
    runIds: expectStringArray(lineage.runIds ?? [], `${path}.runIds`),
    evidenceIds: expectStringArray(lineage.evidenceIds ?? [], `${path}.evidenceIds`),
    sourceArtifactPaths: expectStringArray(lineage.sourceArtifactPaths ?? [], `${path}.sourceArtifactPaths`),
    role: expectOptionalString(lineage.role, `${path}.role`) ?? null,
    state: expectOptionalString(lineage.state, `${path}.state`) ?? null,
    driftSeed: expectOptionalString(lineage.driftSeed, `${path}.driftSeed`) ?? null,
  };
}

function validateCanonicalKnowledgeMetadata(value: unknown, path: string) {
  const metadata = expectRecord(value, path);
  return {
    certification: expectEnum(metadata.certification, `${path}.certification`, certificationStates),
    activatedAt: expectString(metadata.activatedAt, `${path}.activatedAt`),
    certifiedAt: expectOptionalString(metadata.certifiedAt, `${path}.certifiedAt`) ?? null,
    lineage: validateCanonicalLineage(metadata.lineage, `${path}.lineage`),
  };
}

function validateProposalActivation(value: unknown, path: string) {
  const activation = expectRecord(value ?? {}, path);
  return {
    status: expectEnum(activation.status ?? 'pending', `${path}.status`, ['pending', 'activated', 'blocked'] as const),
    activatedAt: expectOptionalString(activation.activatedAt, `${path}.activatedAt`) ?? null,
    certifiedAt: expectOptionalString(activation.certifiedAt, `${path}.certifiedAt`) ?? null,
    reason: expectOptionalString(activation.reason, `${path}.reason`) ?? null,
  };
}

function validateRefPath(value: unknown, path: string): RefPath {
  const refPath = expectRecord(value, path);
  return {
    segments: expectStringArray(refPath.segments, `${path}.segments`),
  };
}

function validateScenarioSource(value: unknown): ScenarioSource {
  const source = expectRecord(value, 'source');
  return {
    ado_id: expectId(source.ado_id, 'source.ado_id', createAdoId),
    revision: expectNumber(source.revision, 'source.revision'),
    content_hash: expectString(source.content_hash, 'source.content_hash'),
    synced_at: expectString(source.synced_at, 'source.synced_at'),
  };
}

function validateScenarioMetadata(value: unknown): ScenarioMetadata {
  const metadata = expectRecord(value, 'metadata');
  return {
    title: expectString(metadata.title, 'metadata.title'),
    suite: ensureSafeRelativePathLike(expectString(metadata.suite, 'metadata.suite'), 'metadata.suite'),
    tags: expectStringArray(metadata.tags ?? [], 'metadata.tags'),
    priority: expectNumber(metadata.priority, 'metadata.priority'),
    status: expectEnum(metadata.status, 'metadata.status', scenarioStatuses),
    status_detail: expectOptionalString(metadata.status_detail, 'metadata.status_detail') ?? null,
  };
}

function validatePrecondition(value: unknown, path: string): ScenarioPrecondition {
  const precondition = expectRecord(value, path);
  return {
    fixture: expectId(precondition.fixture, `${path}.fixture`, createFixtureId),
    params: precondition.params ? expectStringRecord(precondition.params, `${path}.params`) : undefined,
  };
}

function validateAction(value: unknown, path: string): StepAction {
  return expectEnum(value, path, stepActions);
}

function validateConfidence(value: unknown, path: string): Confidence {
  return expectEnum(value, path, confidences);
}

function validateStepResolution(value: unknown, path: string): StepResolution {
  const resolution = expectRecord(value, path);
  return {
    action: resolution.action === undefined ? undefined : validateAction(resolution.action, `${path}.action`),
    screen: expectOptionalId(resolution.screen, `${path}.screen`, createScreenId) ?? null,
    element: expectOptionalId(resolution.element, `${path}.element`, createElementId) ?? null,
    posture: expectOptionalId(resolution.posture, `${path}.posture`, createPostureId) ?? null,
    override: expectOptionalString(resolution.override, `${path}.override`) ?? null,
    snapshot_template: expectOptionalId(resolution.snapshot_template, `${path}.snapshot_template`, createSnapshotTemplateId) ?? null,
  };
}

function validateValueRef(value: unknown, path: string): ValueRef {
  const ref = expectRecord(value, path);
  const kind = expectEnum(ref.kind, `${path}.kind`, valueRefKinds);

  switch (kind) {
    case 'literal':
      return { kind, value: expectString(ref.value, `${path}.value`) };
    case 'fixture-path':
      return { kind, path: validateRefPath(ref.path, `${path}.path`) };
    case 'posture-sample':
      return {
        kind,
        element: expectId(ref.element, `${path}.element`, createElementId),
        posture: expectId(ref.posture, `${path}.posture`, createPostureId),
        sampleIndex: expectNumber(ref.sampleIndex, `${path}.sampleIndex`),
      };
    case 'parameter-row':
      return {
        kind,
        name: expectString(ref.name, `${path}.name`),
        rowIndex: expectNumber(ref.rowIndex, `${path}.rowIndex`),
      };
    case 'generated-token':
      return { kind, token: expectString(ref.token, `${path}.token`) };
  }
}

function validateStepInstruction(value: unknown, path: string): StepInstruction {
  const instruction = expectRecord(value, path);
  const kind = expectEnum(instruction.kind, `${path}.kind`, stepInstructionKinds);

  switch (kind) {
    case 'navigate':
      return { kind, screen: expectId(instruction.screen, `${path}.screen`, createScreenId) };
    case 'enter':
      return {
        kind,
        screen: expectId(instruction.screen, `${path}.screen`, createScreenId),
        element: expectId(instruction.element, `${path}.element`, createElementId),
        posture: expectOptionalId(instruction.posture, `${path}.posture`, createPostureId) ?? null,
        value: instruction.value === undefined || instruction.value === null ? null : validateValueRef(instruction.value, `${path}.value`),
      };
    case 'invoke':
      return {
        kind,
        screen: expectId(instruction.screen, `${path}.screen`, createScreenId),
        element: expectId(instruction.element, `${path}.element`, createElementId),
        action: expectEnum(instruction.action, `${path}.action`, ['click'] as const),
      };
    case 'observe-structure':
      return {
        kind,
        screen: expectId(instruction.screen, `${path}.screen`, createScreenId),
        element: expectId(instruction.element, `${path}.element`, createElementId),
        snapshotTemplate: expectId(instruction.snapshotTemplate, `${path}.snapshotTemplate`, createSnapshotTemplateId),
      };
    case 'custom-escape-hatch':
      return { kind, reason: expectString(instruction.reason, `${path}.reason`) };
  }
}

function validateStepProgram(value: unknown, path: string): StepProgram {
  const program = expectRecord(value, path);
  return {
    kind: expectEnum(program.kind, `${path}.kind`, ['step-program'] as const),
    instructions: expectArray(program.instructions ?? [], `${path}.instructions`).map((entry, index) =>
      validateStepInstruction(entry, `${path}.instructions[${index}]`),
    ),
  };
}

function validateStepBase(value: unknown, path: string): ScenarioStep {
  const step = expectRecord(value, path);
  const resolution = step.resolution === undefined || step.resolution === null
    ? null
    : validateStepResolution(step.resolution, `${path}.resolution`);
  return {
    index: expectNumber(step.index, `${path}.index`),
    intent: expectString(step.intent ?? step.action_text, `${path}.intent`),
    action_text: expectString(step.action_text ?? step.intent, `${path}.action_text`),
    expected_text: expectString(step.expected_text ?? '', `${path}.expected_text`),
    action: step.action === undefined
      ? (resolution?.action ?? 'custom')
      : validateAction(step.action, `${path}.action`),
    screen: expectOptionalId(step.screen ?? resolution?.screen, `${path}.screen`, createScreenId) ?? null,
    element: expectOptionalId(step.element ?? resolution?.element, `${path}.element`, createElementId) ?? null,
    posture: expectOptionalId(step.posture ?? resolution?.posture, `${path}.posture`, createPostureId) ?? null,
    override: expectOptionalString(step.override ?? resolution?.override, `${path}.override`) ?? null,
    snapshot_template: expectOptionalId(step.snapshot_template ?? resolution?.snapshot_template, `${path}.snapshot_template`, createSnapshotTemplateId) ?? null,
    resolution,
    confidence: validateConfidence(step.confidence, `${path}.confidence`),
  };
}

function validatePostcondition(value: unknown, path: string): ScenarioPostcondition {
  const post = expectRecord(value, path);
  return {
    action: validateAction(post.action, `${path}.action`),
    screen: expectOptionalId(post.screen, `${path}.screen`, createScreenId) ?? null,
    element: expectOptionalId(post.element, `${path}.element`, createElementId) ?? null,
    posture: expectOptionalId(post.posture, `${path}.posture`, createPostureId) ?? null,
    override: expectOptionalString(post.override, `${path}.override`) ?? null,
    snapshot_template: expectOptionalId(post.snapshot_template, `${path}.snapshot_template`, createSnapshotTemplateId) ?? null,
  };
}

function validateDiagnostic(value: unknown, path: string): CompilerDiagnostic {
  const diagnostic = expectRecord(value, path);
  const provenance = diagnostic.provenance ? expectRecord(diagnostic.provenance, `${path}.provenance`) : {};
  const confidenceValue = provenance.confidence;

  return {
    code: expectString(diagnostic.code, `${path}.code`),
    severity: expectEnum(diagnostic.severity, `${path}.severity`, diagnosticSeverities),
    message: expectString(diagnostic.message, `${path}.message`),
    adoId: expectId(diagnostic.adoId, `${path}.adoId`, createAdoId),
    stepIndex: diagnostic.stepIndex === undefined ? undefined : expectNumber(diagnostic.stepIndex, `${path}.stepIndex`),
    artifactPath: diagnostic.artifactPath === undefined ? undefined : expectString(diagnostic.artifactPath, `${path}.artifactPath`),
    provenance: {
      sourceRevision: provenance.sourceRevision === undefined ? undefined : expectNumber(provenance.sourceRevision, `${path}.provenance.sourceRevision`),
      contentHash: provenance.contentHash === undefined ? undefined : expectString(provenance.contentHash, `${path}.provenance.contentHash`),
      scenarioPath: provenance.scenarioPath === undefined ? undefined : expectString(provenance.scenarioPath, `${path}.provenance.scenarioPath`),
      snapshotPath: provenance.snapshotPath === undefined ? undefined : expectString(provenance.snapshotPath, `${path}.provenance.snapshotPath`),
      knowledgePath: provenance.knowledgePath === undefined ? undefined : expectString(provenance.knowledgePath, `${path}.provenance.knowledgePath`),
      confidence:
        confidenceValue === undefined
          ? undefined
          : (expectEnum(confidenceValue, `${path}.provenance.confidence`, diagnosticConfidences) as Confidence | 'mixed'),
    },
  };
}

function validateBoundStep(value: unknown, path: string): BoundStep {
  const step = validateStepBase(value, path);
  const rawStep = expectRecord(value, path);
  const binding = expectRecord(rawStep.binding, `${path}.binding`);
  return {
    ...step,
    binding: {
      kind: expectEnum(binding.kind, `${path}.binding.kind`, ['bound', 'deferred', 'unbound'] as const) as StepBindingKind,
      reasons: expectStringArray(binding.reasons ?? [], `${path}.binding.reasons`),
      ruleId: expectOptionalString(binding.ruleId, `${path}.binding.ruleId`) ?? null,
      normalizedIntent: expectString(binding.normalizedIntent ?? '', `${path}.binding.normalizedIntent`),
      knowledgeRefs: expectStringArray(binding.knowledgeRefs ?? [], `${path}.binding.knowledgeRefs`),
      supplementRefs: expectStringArray(binding.supplementRefs ?? [], `${path}.binding.supplementRefs`),
      evidenceIds: expectStringArray(binding.evidenceIds ?? [], `${path}.binding.evidenceIds`),
      governance: expectEnum(binding.governance, `${path}.binding.governance`, governanceStates),
      reviewReasons: expectStringArray(binding.reviewReasons ?? [], `${path}.binding.reviewReasons`),
    },
    program: rawStep.program ? validateStepProgram(rawStep.program, `${path}.program`) : undefined,
  };
}

function validateSection(value: unknown, path: string): SurfaceSection {
  const section = expectRecord(value, path);
  return {
    selector: expectString(section.selector, `${path}.selector`),
    url: section.url === undefined ? undefined : expectString(section.url, `${path}.url`),
    kind: expectEnum(section.kind, `${path}.kind`, surfaceKinds),
    surfaces: expectIdArray(section.surfaces ?? [], `${path}.surfaces`, createSurfaceId),
    snapshot: expectOptionalId(section.snapshot, `${path}.snapshot`, createSnapshotTemplateId) ?? null,
  };
}

function validateSurfaceDefinition(value: unknown, path: string): SurfaceDefinition {
  const surface = expectRecord(value, path);
  return {
    kind: expectEnum(surface.kind, `${path}.kind`, surfaceKinds),
    section: expectId(surface.section, `${path}.section`, createSectionId),
    selector: expectString(surface.selector, `${path}.selector`),
    parents: expectIdArray(surface.parents ?? [], `${path}.parents`, createSurfaceId),
    children: expectIdArray(surface.children ?? [], `${path}.children`, createSurfaceId),
    elements: expectIdArray(surface.elements ?? [], `${path}.elements`, createElementId),
    assertions: expectArray(surface.assertions ?? [], `${path}.assertions`).map((entry, index) =>
      expectEnum(entry, `${path}.assertions[${index}]`, assertionKinds),
    ) as AssertionKind[],
    required: surface.required === undefined ? undefined : expectBoolean(surface.required, `${path}.required`),
  };
}

function validateLocatorStrategy(value: unknown, path: string): LocatorStrategy {
  const strategy = expectRecord(value, path);
  const kind = expectEnum(strategy.kind, `${path}.kind`, locatorStrategyKinds);

  switch (kind) {
    case 'test-id':
      return {
        kind,
        value: expectString(strategy.value, `${path}.value`),
      };
    case 'role-name':
      return {
        kind,
        role: expectString(strategy.role, `${path}.role`),
        name: expectOptionalString(strategy.name, `${path}.name`) ?? null,
      };
    case 'css':
      return {
        kind,
        value: expectString(strategy.value, `${path}.value`),
      };
  }
}

function validateElement(value: unknown, path: string): ElementSig {
  const element = expectRecord(value, path);
  const role = expectString(element.role, `${path}.role`);
  const name = expectOptionalString(element.name, `${path}.name`) ?? null;
  const testId = expectOptionalString(element.testId, `${path}.testId`) ?? null;
  const cssFallback = expectOptionalString(element.cssFallback, `${path}.cssFallback`) ?? null;
  const locator = element.locator === undefined
    ? [
        ...(testId ? [{ kind: 'test-id', value: testId } as const] : []),
        { kind: 'role-name' as const, role, name },
        ...(cssFallback ? [{ kind: 'css', value: cssFallback } as const] : []),
      ]
    : expectArray(element.locator, `${path}.locator`).map((entry, index) => validateLocatorStrategy(entry, `${path}.locator[${index}]`));

  return {
    role,
    name,
    testId,
    cssFallback,
    locator,
    surface: expectId(element.surface, `${path}.surface`, createSurfaceId),
    widget: expectId(element.widget, `${path}.widget`, createWidgetId),
    affordance: expectOptionalString(element.affordance, `${path}.affordance`) ?? null,
    required: element.required === undefined ? undefined : expectBoolean(element.required, `${path}.required`),
  };
}

function validateEffect(value: unknown, path: string): PostureEffect {
  const effect = expectRecord(value, path);
  const targetKind =
    effect.targetKind === undefined
      ? undefined
      : (expectEnum(effect.targetKind, `${path}.targetKind`, effectTargetKinds) as EffectTargetKind);

  if (effect.target === 'self' || targetKind === 'self') {
    return {
      target: 'self',
      targetKind: 'self',
      state: expectEnum(effect.state, `${path}.state`, effectStates),
      message: expectOptionalString(effect.message, `${path}.message`) ?? null,
    };
  }

  return {
    target:
      targetKind === 'surface'
        ? expectId(effect.target, `${path}.target`, createSurfaceId)
        : expectId(effect.target, `${path}.target`, createElementId),
    targetKind,
    state: expectEnum(effect.state, `${path}.state`, effectStates),
    message: expectOptionalString(effect.message, `${path}.message`) ?? null,
  };
}

function validatePosture(value: unknown, path: string): Posture {
  const posture = expectRecord(value, path);
  return {
    values: expectStringArray(posture.values ?? [], `${path}.values`),
    effects: expectArray(posture.effects ?? [], `${path}.effects`).map((entry, index) =>
      validateEffect(entry, `${path}.effects[${index}]`),
    ),
  };
}

export function validateWidgetCapabilityContract(value: unknown, path = 'widget-contract'): WidgetCapabilityContract {
  const decoded = schemaDecode.decoderFor<WidgetCapabilityContract>(schemas.WidgetCapabilityContractSchema)(value);
  // Cross-field validation: sideEffects keys must be subset of supportedActions
  for (const action of Object.keys(decoded.sideEffects)) {
    if (!decoded.supportedActions.includes(action as typeof decoded.supportedActions[number])) {
      throw new SchemaError(`sideEffects references unsupported action ${action}`, `${path}.sideEffects.${action}`);
    }
  }
  // Every supportedAction must have side-effect semantics
  for (const action of decoded.supportedActions) {
    if (!decoded.sideEffects[action]) {
      throw new SchemaError(`missing side-effect semantics for action ${action}`, `${path}.sideEffects`);
    }
  }
  return decoded;
}

export function validateAdoSnapshot(value: unknown): AdoSnapshot {
  const validated = schemaDecode.decoderFor<AdoSnapshot>(schemas.AdoSnapshotSchema)(value);
  // Post-decode: path safety check and content hash verification
  ensureSafeRelativePathLike(validated.suitePath, 'snapshot.suitePath');
  const computedHash = computeAdoContentHash(validated);
  if (validated.contentHash !== computedHash) {
    throw new SchemaError(`contentHash mismatch, expected ${computedHash}`, 'snapshot.contentHash');
  }
  return validated;
}

export const validateScenario: (value: unknown) => Scenario =
  schemaDecode.decoderFor<Scenario>(schemas.ScenarioSchema);

export function validateBoundScenario(value: unknown): BoundScenario {
  const scenario = validateScenario(value);
  const raw = expectRecord(value, 'scenario');
  const steps = expectArray(raw.steps ?? [], 'steps').map((entry, index) => validateBoundStep(entry, `steps[${index}]`));
  const diagnostics = expectArray(raw.diagnostics ?? [], 'diagnostics').map((entry, index) =>
    validateDiagnostic(entry, `diagnostics[${index}]`),
  );
  const header = validateWorkflowEnvelopeHeader(raw, 'boundScenario', {
    stage: 'preparation',
    scope: 'scenario',
    governance: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'blocked' : 'approved',
    artifactFingerprint: scenario.source.content_hash,
    ids: {
      adoId: scenario.source.ado_id,
      suite: scenario.metadata.suite,
    },
    lineage: {
      sources: [],
      parents: [],
      handshakes: ['preparation'],
    },
  });
  return {
    ...scenario,
    ...header,
    kind: expectEnum(raw.kind, 'kind', ['bound-scenario'] as const),
    payload: {
      source: scenario.source,
      metadata: scenario.metadata,
      preconditions: scenario.preconditions,
      steps,
      postconditions: scenario.postconditions,
      diagnostics,
    },
    steps,
    diagnostics,
  };
}

function validateStepTaskElementCandidate(value: unknown, path: string) {
  const candidate = expectRecord(value, path);
  return {
    element: expectId(candidate.element, `${path}.element`, createElementId),
    targetRef: candidate.targetRef === undefined || candidate.targetRef === null
      ? null
      : expectId(candidate.targetRef, `${path}.targetRef`, createCanonicalTargetRef),
    role: expectString(candidate.role, `${path}.role`),
    name: expectOptionalString(candidate.name, `${path}.name`) ?? null,
    surface: expectId(candidate.surface, `${path}.surface`, createSurfaceId),
    widget: expectId(candidate.widget, `${path}.widget`, createWidgetId),
    affordance: expectOptionalString(candidate.affordance, `${path}.affordance`) ?? null,
    aliases: expectStringArray(candidate.aliases ?? [], `${path}.aliases`),
    locator: expectArray(candidate.locator ?? [], `${path}.locator`).map((entry, index) => validateLocatorStrategy(entry, `${path}.locator[${index}]`)),
    postures: expectIdArray(candidate.postures ?? [], `${path}.postures`, createPostureId),
    defaultValueRef: expectOptionalString(candidate.defaultValueRef, `${path}.defaultValueRef`) ?? null,
    parameter: expectOptionalString(candidate.parameter, `${path}.parameter`) ?? null,
    graphNodeId: expectOptionalString(candidate.graphNodeId, `${path}.graphNodeId`) ?? null,
    selectorRefs: expectArray(candidate.selectorRefs ?? [], `${path}.selectorRefs`).map((entry, index) =>
      expectId(entry, `${path}.selectorRefs[${index}]`, createSelectorRef),
    ),
    snapshotAliases: Object.fromEntries(
      Object.entries(expectRecord(candidate.snapshotAliases ?? {}, `${path}.snapshotAliases`)).map(([snapshotId, aliases]) => [
        ensureSafeRelativePathLike(snapshotId, `${path}.snapshotAliases.${snapshotId}`),
        expectStringArray(aliases, `${path}.snapshotAliases.${snapshotId}`),
      ]),
    ),
  };
}

function validateStepTaskScreenCandidate(value: unknown, path: string) {
  const candidate = expectRecord(value, path);
  return {
    screen: expectId(candidate.screen, `${path}.screen`, createScreenId),
    url: expectString(candidate.url, `${path}.url`),
    routeVariantRefs: expectStringArray(candidate.routeVariantRefs ?? [], `${path}.routeVariantRefs`),
    screenAliases: expectStringArray(candidate.screenAliases ?? [], `${path}.screenAliases`),
    knowledgeRefs: expectStringArray(candidate.knowledgeRefs ?? [], `${path}.knowledgeRefs`),
    supplementRefs: expectStringArray(candidate.supplementRefs ?? [], `${path}.supplementRefs`),
    elements: expectArray(candidate.elements ?? [], `${path}.elements`).map((entry, index) =>
      validateStepTaskElementCandidate(entry, `${path}.elements[${index}]`),
    ),
    sectionSnapshots: expectIdArray(candidate.sectionSnapshots ?? [], `${path}.sectionSnapshots`, createSnapshotTemplateId),
    graphNodeId: expectOptionalString(candidate.graphNodeId, `${path}.graphNodeId`) ?? null,
  };
}

function validateArtifactConfidenceRecord(value: unknown, path: string) {
  const record = expectRecord(value, path);
  const lineage = expectRecord(record.lineage ?? {}, `${path}.lineage`);
  return {
    id: expectString(record.id, `${path}.id`),
    artifactType: validateTrustPolicyArtifactType(record.artifactType, `${path}.artifactType`),
    artifactPath: expectString(record.artifactPath, `${path}.artifactPath`),
    score: expectNumber(record.score, `${path}.score`),
    threshold: expectNumber(record.threshold, `${path}.threshold`),
    status: expectEnum(record.status, `${path}.status`, ['learning', 'approved-equivalent', 'needs-review'] as const),
    successCount: expectNumber(record.successCount, `${path}.successCount`),
    failureCount: expectNumber(record.failureCount, `${path}.failureCount`),
    evidenceCount: expectNumber(record.evidenceCount, `${path}.evidenceCount`),
    screen: expectOptionalId(record.screen, `${path}.screen`, createScreenId) ?? null,
    element: expectOptionalId(record.element, `${path}.element`, createElementId) ?? null,
    posture: expectOptionalId(record.posture, `${path}.posture`, createPostureId) ?? null,
    snapshotTemplate: expectOptionalId(record.snapshotTemplate, `${path}.snapshotTemplate`, createSnapshotTemplateId) ?? null,
    learnedAliases: expectStringArray(record.learnedAliases ?? [], `${path}.learnedAliases`),
    lastSuccessAt: expectOptionalString(record.lastSuccessAt, `${path}.lastSuccessAt`) ?? null,
    lastFailureAt: expectOptionalString(record.lastFailureAt, `${path}.lastFailureAt`) ?? null,
    lineage: {
      runIds: expectStringArray(lineage.runIds ?? [], `${path}.lineage.runIds`),
      evidenceIds: expectStringArray(lineage.evidenceIds ?? [], `${path}.lineage.evidenceIds`),
      sourceArtifactPaths: expectStringArray(lineage.sourceArtifactPaths ?? [], `${path}.lineage.sourceArtifactPaths`),
    },
  };
}

function validateInterfaceResolutionContext(value: unknown, path: string) {
  const session = expectRecord(value, path);
  return {
    knowledgeFingerprint: expectString(session.knowledgeFingerprint, `${path}.knowledgeFingerprint`),
    confidenceFingerprint: expectOptionalString(session.confidenceFingerprint, `${path}.confidenceFingerprint`) ?? null,
    interfaceGraphFingerprint: expectOptionalString(session.interfaceGraphFingerprint, `${path}.interfaceGraphFingerprint`) ?? null,
    selectorCanonFingerprint: expectOptionalString(session.selectorCanonFingerprint, `${path}.selectorCanonFingerprint`) ?? null,
    interfaceGraphPath: expectOptionalString(session.interfaceGraphPath, `${path}.interfaceGraphPath`) ?? null,
    selectorCanonPath: expectOptionalString(session.selectorCanonPath, `${path}.selectorCanonPath`) ?? null,
    sharedPatterns: validateSharedPatterns(session.sharedPatterns),
    screens: expectArray(session.screens ?? [], `${path}.screens`).map((entry, index) =>
      validateStepTaskScreenCandidate(entry, `${path}.screens[${index}]`),
    ),
    evidenceRefs: expectStringArray(session.evidenceRefs ?? [], `${path}.evidenceRefs`),
    confidenceOverlays: expectArray(session.confidenceOverlays ?? [], `${path}.confidenceOverlays`).map((entry, index) =>
      validateArtifactConfidenceRecord(entry, `${path}.confidenceOverlays[${index}]`),
    ),
    controls: (() => {
      const controls = expectRecord(session.controls ?? {}, `${path}.controls`);
      return {
        datasets: expectArray(controls.datasets ?? [], `${path}.controls.datasets`).map((entry, index) => {
          const dataset = expectRecord(entry, `${path}.controls.datasets[${index}]`);
          return {
            name: expectString(dataset.name, `${path}.controls.datasets[${index}].name`),
            artifactPath: expectString(dataset.artifactPath, `${path}.controls.datasets[${index}].artifactPath`),
            isDefault: expectBoolean(dataset.isDefault, `${path}.controls.datasets[${index}].isDefault`),
            fixtures: expectRecord(dataset.fixtures ?? {}, `${path}.controls.datasets[${index}].fixtures`),
            elementDefaults: Object.fromEntries(
              Object.entries(expectRecord(dataset.elementDefaults ?? {}, `${path}.controls.datasets[${index}].elementDefaults`))
                .map(([key, value]) => [key, expectString(value, `${path}.controls.datasets[${index}].elementDefaults.${key}`)]),
            ),
            generatedTokens: Object.fromEntries(
              Object.entries(expectRecord(dataset.generatedTokens ?? {}, `${path}.controls.datasets[${index}].generatedTokens`))
                .map(([key, value]) => [key, expectString(value, `${path}.controls.datasets[${index}].generatedTokens.${key}`)]),
            ),
          };
        }),
        resolutionControls: expectArray(controls.resolutionControls ?? [], `${path}.controls.resolutionControls`).map((entry, index) => {
          const control = expectRecord(entry, `${path}.controls.resolutionControls[${index}]`);
          const domPolicy = control.domExplorationPolicy === undefined
            ? undefined
            : expectRecord(control.domExplorationPolicy, `${path}.controls.resolutionControls[${index}].domExplorationPolicy`);
          return {
            name: expectString(control.name, `${path}.controls.resolutionControls[${index}].name`),
            artifactPath: expectString(control.artifactPath, `${path}.controls.resolutionControls[${index}].artifactPath`),
            stepIndex: expectNumber(control.stepIndex, `${path}.controls.resolutionControls[${index}].stepIndex`),
            resolution: validateStepResolution(control.resolution, `${path}.controls.resolutionControls[${index}].resolution`),
            domExplorationPolicy: domPolicy
              ? {
                maxCandidates: expectNumber(domPolicy.maxCandidates, `${path}.controls.resolutionControls[${index}].domExplorationPolicy.maxCandidates`),
                maxProbes: expectNumber(domPolicy.maxProbes, `${path}.controls.resolutionControls[${index}].domExplorationPolicy.maxProbes`),
                forbiddenActions: expectArray(
                  domPolicy.forbiddenActions ?? [],
                  `${path}.controls.resolutionControls[${index}].domExplorationPolicy.forbiddenActions`,
                ).map((entry, actionIndex) =>
                  expectEnum(entry, `${path}.controls.resolutionControls[${index}].domExplorationPolicy.forbiddenActions[${actionIndex}]`, ['navigate', 'input', 'click', 'assert-snapshot', 'custom'] as const),
                ),
              }
              : undefined,
          };
        }),
        runbooks: expectArray(controls.runbooks ?? [], `${path}.controls.runbooks`).map((entry, index) => {
          const runbook = expectRecord(entry, `${path}.controls.runbooks[${index}]`);
          return {
            name: expectString(runbook.name, `${path}.controls.runbooks[${index}].name`),
            artifactPath: expectString(runbook.artifactPath, `${path}.controls.runbooks[${index}].artifactPath`),
            isDefault: expectBoolean(runbook.isDefault, `${path}.controls.runbooks[${index}].isDefault`),
            selector: validateResolutionControlSelector(runbook.selector, `${path}.controls.runbooks[${index}].selector`),
            interpreterMode: runbook.interpreterMode === undefined || runbook.interpreterMode === null
              ? null
              : expectEnum(runbook.interpreterMode, `${path}.controls.runbooks[${index}].interpreterMode`, ['playwright', 'dry-run', 'diagnostic'] as const),
            dataset: expectOptionalString(runbook.dataset, `${path}.controls.runbooks[${index}].dataset`) ?? null,
            resolutionControl: expectOptionalString(runbook.resolutionControl, `${path}.controls.runbooks[${index}].resolutionControl`) ?? null,
            translationEnabled: runbook.translationEnabled === undefined ? undefined : expectBoolean(runbook.translationEnabled, `${path}.controls.runbooks[${index}].translationEnabled`),
            translationCacheEnabled: runbook.translationCacheEnabled === undefined ? undefined : expectBoolean(runbook.translationCacheEnabled, `${path}.controls.runbooks[${index}].translationCacheEnabled`),
            providerId: expectOptionalString(runbook.providerId, `${path}.controls.runbooks[${index}].providerId`) ?? null,
            recoveryPolicy: runbook.recoveryPolicy === undefined
              ? undefined
              : validateRecoveryPolicy(runbook.recoveryPolicy, `${path}.controls.runbooks[${index}].recoveryPolicy`),
          };
        }),
      };
    })(),
  };
}

function validateStepTask(value: unknown, path: string) {
  const task = expectRecord(value, path);
  const stepFingerprint = expectOptionalString(task.stepFingerprint, `${path}.stepFingerprint`)
    ?? expectString(task.taskFingerprint, `${path}.taskFingerprint`);
  return {
    index: expectNumber(task.index, `${path}.index`),
    intent: expectString(task.intent, `${path}.intent`),
    actionText: expectString(task.actionText, `${path}.actionText`),
    expectedText: expectString(task.expectedText, `${path}.expectedText`),
    normalizedIntent: expectString(task.normalizedIntent, `${path}.normalizedIntent`),
    allowedActions: expectArray(task.allowedActions ?? [], `${path}.allowedActions`).map((entry, index) =>
      validateAction(entry, `${path}.allowedActions[${index}]`),
    ),
    explicitResolution: task.explicitResolution === undefined || task.explicitResolution === null
      ? null
      : validateStepResolution(task.explicitResolution, `${path}.explicitResolution`),
    controlResolution: task.controlResolution === undefined || task.controlResolution === null
      ? null
      : validateStepResolution(task.controlResolution, `${path}.controlResolution`),
    grounding: (() => {
      const grounding = expectRecord(task.grounding, `${path}.grounding`);
      return {
        targetRefs: expectArray(grounding.targetRefs ?? [], `${path}.grounding.targetRefs`).map((entry, index) =>
          expectId(entry, `${path}.grounding.targetRefs[${index}]`, createCanonicalTargetRef),
        ),
        selectorRefs: expectArray(grounding.selectorRefs ?? [], `${path}.grounding.selectorRefs`).map((entry, index) =>
          expectId(entry, `${path}.grounding.selectorRefs[${index}]`, createSelectorRef),
        ),
        fallbackSelectorRefs: expectArray(grounding.fallbackSelectorRefs ?? [], `${path}.grounding.fallbackSelectorRefs`).map((entry, index) =>
          expectId(entry, `${path}.grounding.fallbackSelectorRefs[${index}]`, createSelectorRef),
        ),
        routeVariantRefs: expectStringArray(grounding.routeVariantRefs ?? [], `${path}.grounding.routeVariantRefs`),
        assertionAnchors: expectStringArray(grounding.assertionAnchors ?? [], `${path}.grounding.assertionAnchors`),
        effectAssertions: expectStringArray(grounding.effectAssertions ?? [], `${path}.grounding.effectAssertions`),
        requiredStateRefs: expectArray(grounding.requiredStateRefs ?? [], `${path}.grounding.requiredStateRefs`).map((entry, index) =>
          expectId(entry, `${path}.grounding.requiredStateRefs[${index}]`, createStateNodeRef),
        ),
        forbiddenStateRefs: expectArray(grounding.forbiddenStateRefs ?? [], `${path}.grounding.forbiddenStateRefs`).map((entry, index) =>
          expectId(entry, `${path}.grounding.forbiddenStateRefs[${index}]`, createStateNodeRef),
        ),
        eventSignatureRefs: expectArray(grounding.eventSignatureRefs ?? [], `${path}.grounding.eventSignatureRefs`).map((entry, index) =>
          expectId(entry, `${path}.grounding.eventSignatureRefs[${index}]`, createEventSignatureRef),
        ),
        expectedTransitionRefs: expectArray(grounding.expectedTransitionRefs ?? [], `${path}.grounding.expectedTransitionRefs`).map((entry, index) =>
          expectId(entry, `${path}.grounding.expectedTransitionRefs[${index}]`, createTransitionRef),
        ),
        resultStateRefs: expectArray(grounding.resultStateRefs ?? [], `${path}.grounding.resultStateRefs`).map((entry, index) =>
          expectId(entry, `${path}.grounding.resultStateRefs[${index}]`, createStateNodeRef),
        ),
      };
    })(),
    stepFingerprint,
    taskFingerprint: stepFingerprint,
  };
}

export function validateScenarioInterpretationSurface(value: unknown): ScenarioInterpretationSurface {
  const surface = expectRecord(value, 'scenarioInterpretationSurface');
  const payloadRecord = surface.payload === undefined
    ? null
    : expectRecord(surface.payload, 'scenarioInterpretationSurface.payload');
  const header = validateWorkflowEnvelopeHeader(surface, 'scenarioInterpretationSurface', {
    stage: 'preparation',
    scope: 'scenario',
    governance: 'approved',
    artifactFingerprint: expectOptionalString(surface.surfaceFingerprint, 'scenarioInterpretationSurface.surfaceFingerprint') ?? 'scenario-interpretation-surface',
    ids: {
      adoId: expectOptionalId(surface.ids && typeof surface.ids === 'object' ? (surface.ids as Record<string, unknown>).adoId : undefined, 'scenarioInterpretationSurface.ids.adoId', createAdoId) ?? null,
      suite: expectOptionalString(surface.ids && typeof surface.ids === 'object' ? (surface.ids as Record<string, unknown>).suite : undefined, 'scenarioInterpretationSurface.ids.suite') ?? null,
    },
    lineage: {
      sources: [],
      parents: [],
      handshakes: ['preparation'],
    },
  });

  return {
    kind: expectEnum(surface.kind, 'scenarioInterpretationSurface.kind', ['scenario-interpretation-surface'] as const),
    ...header,
    version: 1,
    payload: (() => {
      const payload = expectRecord(payloadRecord, 'scenarioInterpretationSurface.payload');
      const adoId = expectId(payload.adoId, 'scenarioInterpretationSurface.payload.adoId', createAdoId);
      const revision = expectNumber(payload.revision, 'scenarioInterpretationSurface.payload.revision');
      const title = expectString(payload.title, 'scenarioInterpretationSurface.payload.title');
      const suite = ensureSafeRelativePathLike(expectString(payload.suite, 'scenarioInterpretationSurface.payload.suite'), 'scenarioInterpretationSurface.payload.suite');
      const knowledgeFingerprint = expectString(payload.knowledgeFingerprint, 'scenarioInterpretationSurface.payload.knowledgeFingerprint');
      const resolutionContext = validateInterfaceResolutionContext(payload.resolutionContext, 'scenarioInterpretationSurface.payload.resolutionContext') as ScenarioInterpretationSurface['payload']['resolutionContext'];
      return {
        adoId,
        revision,
        title,
        suite,
        knowledgeFingerprint,
        interface: (() => {
          const interfaceRecord = expectRecord(payload.interface, 'scenarioInterpretationSurface.payload.interface');
          return {
            fingerprint: expectOptionalString(interfaceRecord.fingerprint, 'scenarioInterpretationSurface.payload.interface.fingerprint') ?? null,
            artifactPath: expectOptionalString(interfaceRecord.artifactPath, 'scenarioInterpretationSurface.payload.interface.artifactPath') ?? null,
          };
        })(),
        selectors: (() => {
          const selectorRecord = expectRecord(payload.selectors, 'scenarioInterpretationSurface.payload.selectors');
          return {
            fingerprint: expectOptionalString(selectorRecord.fingerprint, 'scenarioInterpretationSurface.payload.selectors.fingerprint') ?? null,
            artifactPath: expectOptionalString(selectorRecord.artifactPath, 'scenarioInterpretationSurface.payload.selectors.artifactPath') ?? null,
          };
        })(),
        stateGraph: (() => {
          const stateGraphRecord = expectRecord(payload.stateGraph, 'scenarioInterpretationSurface.payload.stateGraph');
          return {
            fingerprint: expectOptionalString(stateGraphRecord.fingerprint, 'scenarioInterpretationSurface.payload.stateGraph.fingerprint') ?? null,
            artifactPath: expectOptionalString(stateGraphRecord.artifactPath, 'scenarioInterpretationSurface.payload.stateGraph.artifactPath') ?? null,
          };
        })(),
        knowledgeSlice: (() => {
          const slice = expectRecord(payload.knowledgeSlice ?? {
            routeRefs: [],
            routeVariantRefs: [],
            screenRefs: [],
            targetRefs: [],
            stateRefs: [],
            eventSignatureRefs: [],
            transitionRefs: [],
            evidenceRefs: [],
            controlRefs: [],
          }, 'scenarioInterpretationSurface.payload.knowledgeSlice');
          return {
            routeRefs: expectStringArray(slice.routeRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.routeRefs'),
            routeVariantRefs: expectStringArray(slice.routeVariantRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.routeVariantRefs'),
            screenRefs: expectArray(slice.screenRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.screenRefs').map((entry, index) =>
              expectId(entry, `scenarioInterpretationSurface.payload.knowledgeSlice.screenRefs[${index}]`, createScreenId),
            ),
            targetRefs: expectArray(slice.targetRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.targetRefs').map((entry, index) =>
              expectId(entry, `scenarioInterpretationSurface.payload.knowledgeSlice.targetRefs[${index}]`, createCanonicalTargetRef),
            ),
            stateRefs: expectArray(slice.stateRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.stateRefs').map((entry, index) =>
              expectId(entry, `scenarioInterpretationSurface.payload.knowledgeSlice.stateRefs[${index}]`, createStateNodeRef),
            ),
            eventSignatureRefs: expectArray(slice.eventSignatureRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.eventSignatureRefs').map((entry, index) =>
              expectId(entry, `scenarioInterpretationSurface.payload.knowledgeSlice.eventSignatureRefs[${index}]`, createEventSignatureRef),
            ),
            transitionRefs: expectArray(slice.transitionRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.transitionRefs').map((entry, index) =>
              expectId(entry, `scenarioInterpretationSurface.payload.knowledgeSlice.transitionRefs[${index}]`, createTransitionRef),
            ),
            evidenceRefs: expectStringArray(slice.evidenceRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.evidenceRefs'),
            controlRefs: expectStringArray(slice.controlRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.controlRefs'),
          };
        })(),
        steps: expectArray(payload.steps ?? [], 'scenarioInterpretationSurface.steps').map((entry, index) =>
          validateStepTask(entry, `scenarioInterpretationSurface.steps[${index}]`),
        ),
        resolutionContext,
      };
    })(),
    surfaceFingerprint: expectString(surface.surfaceFingerprint, 'scenarioInterpretationSurface.surfaceFingerprint'),
  };
}

export function validateScenarioTaskPacket(value: unknown): ScenarioTaskPacket {
  const packet = expectRecord(value, 'scenarioTaskPacket');
  const payloadRecord = packet.payload === undefined
    ? null
    : expectRecord(packet.payload, 'scenarioTaskPacket.payload');
  const header = validateWorkflowEnvelopeHeader(packet, 'scenarioTaskPacket', {
    stage: 'preparation',
    scope: 'scenario',
    governance: 'approved',
    artifactFingerprint: expectOptionalString(packet.taskFingerprint, 'scenarioTaskPacket.taskFingerprint') ?? 'scenario-task-packet',
    ids: {
      adoId: expectOptionalId(packet.ids && typeof packet.ids === 'object' ? (packet.ids as Record<string, unknown>).adoId : undefined, 'scenarioTaskPacket.ids.adoId', createAdoId) ?? null,
      suite: expectOptionalString(packet.ids && typeof packet.ids === 'object' ? (packet.ids as Record<string, unknown>).suite : undefined, 'scenarioTaskPacket.ids.suite') ?? null,
    },
    lineage: {
      sources: [],
      parents: [],
      handshakes: ['preparation'],
    },
  });
  return {
    kind: expectEnum(packet.kind, 'scenarioTaskPacket.kind', ['scenario-task-packet'] as const),
    ...header,
    version: 5,
    payload: (() => {
      const payload = expectRecord(payloadRecord, 'scenarioTaskPacket.payload');
      const adoId = expectId(payload.adoId, 'scenarioTaskPacket.payload.adoId', createAdoId);
      const revision = expectNumber(payload.revision, 'scenarioTaskPacket.payload.revision');
      const title = expectString(payload.title, 'scenarioTaskPacket.payload.title');
      const suite = ensureSafeRelativePathLike(expectString(payload.suite, 'scenarioTaskPacket.payload.suite'), 'scenarioTaskPacket.payload.suite');
      const knowledgeFingerprint = expectString(payload.knowledgeFingerprint, 'scenarioTaskPacket.payload.knowledgeFingerprint');
      return {
        adoId,
        revision,
        title,
        suite,
        knowledgeFingerprint,
        interface: (() => {
          const interfaceRecord = expectRecord(payload.interface, 'scenarioTaskPacket.payload.interface');
          return {
            fingerprint: expectOptionalString(interfaceRecord.fingerprint, 'scenarioTaskPacket.payload.interface.fingerprint') ?? null,
            artifactPath: expectOptionalString(interfaceRecord.artifactPath, 'scenarioTaskPacket.payload.interface.artifactPath') ?? null,
          };
        })(),
        selectors: (() => {
          const selectorRecord = expectRecord(payload.selectors, 'scenarioTaskPacket.payload.selectors');
          return {
            fingerprint: expectOptionalString(selectorRecord.fingerprint, 'scenarioTaskPacket.payload.selectors.fingerprint') ?? null,
            artifactPath: expectOptionalString(selectorRecord.artifactPath, 'scenarioTaskPacket.payload.selectors.artifactPath') ?? null,
          };
        })(),
        stateGraph: (() => {
          const stateGraphRecord = expectRecord(payload.stateGraph, 'scenarioTaskPacket.payload.stateGraph');
          return {
            fingerprint: expectOptionalString(stateGraphRecord.fingerprint, 'scenarioTaskPacket.payload.stateGraph.fingerprint') ?? null,
            artifactPath: expectOptionalString(stateGraphRecord.artifactPath, 'scenarioTaskPacket.payload.stateGraph.artifactPath') ?? null,
          };
        })(),
        knowledgeSlice: (() => {
          const slice = expectRecord(payload.knowledgeSlice ?? {
            routeRefs: [],
            routeVariantRefs: [],
            screenRefs: [],
            targetRefs: [],
            stateRefs: [],
            eventSignatureRefs: [],
            transitionRefs: [],
            evidenceRefs: [],
            controlRefs: [],
          }, 'scenarioTaskPacket.payload.knowledgeSlice');
          return {
            routeRefs: expectStringArray(slice.routeRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.routeRefs'),
            routeVariantRefs: expectStringArray(slice.routeVariantRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.routeVariantRefs'),
            screenRefs: expectArray(slice.screenRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.screenRefs').map((entry, index) =>
              expectId(entry, `scenarioTaskPacket.payload.knowledgeSlice.screenRefs[${index}]`, createScreenId),
            ),
            targetRefs: expectArray(slice.targetRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.targetRefs').map((entry, index) =>
              expectId(entry, `scenarioTaskPacket.payload.knowledgeSlice.targetRefs[${index}]`, createCanonicalTargetRef),
            ),
            stateRefs: expectArray(slice.stateRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.stateRefs').map((entry, index) =>
              expectId(entry, `scenarioTaskPacket.payload.knowledgeSlice.stateRefs[${index}]`, createStateNodeRef),
            ),
            eventSignatureRefs: expectArray(slice.eventSignatureRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.eventSignatureRefs').map((entry, index) =>
              expectId(entry, `scenarioTaskPacket.payload.knowledgeSlice.eventSignatureRefs[${index}]`, createEventSignatureRef),
            ),
            transitionRefs: expectArray(slice.transitionRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.transitionRefs').map((entry, index) =>
              expectId(entry, `scenarioTaskPacket.payload.knowledgeSlice.transitionRefs[${index}]`, createTransitionRef),
            ),
            evidenceRefs: expectStringArray(slice.evidenceRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.evidenceRefs'),
            controlRefs: expectStringArray(slice.controlRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.controlRefs'),
          };
        })(),
        steps: expectArray(payload.steps ?? [], 'scenarioTaskPacket.steps').map((entry, index) =>
          validateStepTask(entry, `scenarioTaskPacket.steps[${index}]`),
        ),
      };
    })(),
    taskFingerprint: expectString(packet.taskFingerprint, 'scenarioTaskPacket.taskFingerprint'),
  };
}

function validateResolutionCandidateSummary(value: unknown, path: string) {
  const summary = expectRecord(value, path);
  return {
    concern: expectEnum(summary.concern, `${path}.concern`, ['action', 'screen', 'element', 'posture', 'snapshot'] as const),
    source: expectEnum(summary.source, `${path}.source`, ['explicit', 'control', 'approved-screen-knowledge', 'shared-patterns', 'prior-evidence', 'approved-equivalent-overlay', 'structured-translation', 'live-dom'] as const),
    value: expectString(summary.value, `${path}.value`),
    score: expectNumber(summary.score, `${path}.score`),
    reason: expectString(summary.reason, `${path}.reason`),
  };
}

function validateResolutionObservation(value: unknown, path: string) {
  const observation = expectRecord(value, path);
  return {
    source: expectEnum(observation.source, `${path}.source`, ['approved-screen-knowledge', 'shared-patterns', 'prior-evidence', 'approved-equivalent-overlay', 'structured-translation', 'live-dom', 'runtime'] as const),
    summary: expectString(observation.summary, `${path}.summary`),
    detail: observation.detail === undefined ? undefined : expectStringRecord(observation.detail, `${path}.detail`),
    topCandidates: observation.topCandidates === undefined ? undefined : expectArray(observation.topCandidates, `${path}.topCandidates`).map((entry, index) => validateResolutionCandidateSummary(entry, `${path}.topCandidates[${index}]`)),
    rejectedCandidates: observation.rejectedCandidates === undefined ? undefined : expectArray(observation.rejectedCandidates, `${path}.rejectedCandidates`).map((entry, index) => validateResolutionCandidateSummary(entry, `${path}.rejectedCandidates[${index}]`)),
  };
}

function validateResolutionExhaustionEntry(value: unknown, path: string) {
  const entry = expectRecord(value, path);
  return {
    stage: expectEnum(entry.stage, `${path}.stage`, ['explicit', 'control', 'approved-screen-knowledge', 'shared-patterns', 'prior-evidence', 'approved-equivalent-overlay', 'structured-translation', 'live-dom', 'needs-human'] as const),
    outcome: expectEnum(entry.outcome, `${path}.outcome`, ['attempted', 'resolved', 'skipped', 'failed'] as const),
    reason: expectString(entry.reason, `${path}.reason`),
    topCandidates: entry.topCandidates === undefined ? undefined : expectArray(entry.topCandidates, `${path}.topCandidates`).map((candidate, index) => validateResolutionCandidateSummary(candidate, `${path}.topCandidates[${index}]`)),
    rejectedCandidates: entry.rejectedCandidates === undefined ? undefined : expectArray(entry.rejectedCandidates, `${path}.rejectedCandidates`).map((candidate, index) => validateResolutionCandidateSummary(candidate, `${path}.rejectedCandidates[${index}]`)),
  };
}

function validateResolutionEvidenceDraft(value: unknown, path: string) {
  const draft = expectRecord(value, path);
  const proposal = expectRecord(draft.proposal, `${path}.proposal`);
  return {
    type: expectString(draft.type, `${path}.type`),
    trigger: expectString(draft.trigger, `${path}.trigger`),
    observation: expectStringRecord(draft.observation ?? {}, `${path}.observation`),
    proposal: {
      file: expectString(proposal.file, `${path}.proposal.file`),
      field: expectString(proposal.field, `${path}.proposal.field`),
      old_value: expectOptionalString(proposal.old_value, `${path}.proposal.old_value`) ?? null,
      new_value: expectOptionalString(proposal.new_value, `${path}.proposal.new_value`) ?? null,
    },
    confidence: expectNumber(draft.confidence, `${path}.confidence`),
    risk: expectEnum(draft.risk, `${path}.risk`, ['low', 'medium', 'high'] as const),
    scope: expectString(draft.scope, `${path}.scope`),
  };
}

function validateResolutionProposalDraft(value: unknown, path: string) {
  const draft = expectRecord(value, path);
  return {
    artifactType: validateTrustPolicyArtifactType(draft.artifactType, `${path}.artifactType`),
    targetPath: expectString(draft.targetPath, `${path}.targetPath`),
    title: expectString(draft.title, `${path}.title`),
    patch: expectRecord(draft.patch ?? {}, `${path}.patch`),
    rationale: expectString(draft.rationale, `${path}.rationale`),
  };
}

function validateResolutionTarget(value: unknown, path: string) {
  const target = expectRecord(value, path);
  return {
    action: validateAction(target.action, `${path}.action`),
    screen: expectId(target.screen, `${path}.screen`, createScreenId),
    element: expectOptionalId(target.element, `${path}.element`, createElementId) ?? null,
    posture: expectOptionalId(target.posture, `${path}.posture`, createPostureId) ?? null,
    override: expectOptionalString(target.override, `${path}.override`) ?? null,
    snapshot_template: expectOptionalId(target.snapshot_template, `${path}.snapshot_template`, createSnapshotTemplateId) ?? null,
  };
}

function validateTranslationReceipt(value: unknown, path: string) {
  const receipt = expectRecord(value, path);
  return {
    kind: expectEnum(receipt.kind, `${path}.kind`, ['translation-receipt'] as const),
    version: expectNumber(receipt.version, `${path}.version`) as 1,
    mode: expectEnum(receipt.mode, `${path}.mode`, ['structured-translation'] as const),
    matched: expectBoolean(receipt.matched, `${path}.matched`),
    selected: receipt.selected === undefined || receipt.selected === null
      ? null
      : (() => {
          const candidate = expectRecord(receipt.selected, `${path}.selected`);
          return {
            kind: expectEnum(candidate.kind, `${path}.selected.kind`, ['screen', 'element', 'posture', 'snapshot-template'] as const),
            target: expectString(candidate.target, `${path}.selected.target`),
            screen: expectOptionalId(candidate.screen, `${path}.selected.screen`, createScreenId) ?? null,
            element: expectOptionalId(candidate.element, `${path}.selected.element`, createElementId) ?? null,
            posture: expectOptionalId(candidate.posture, `${path}.selected.posture`, createPostureId) ?? null,
            snapshotTemplate: expectOptionalId(candidate.snapshotTemplate, `${path}.selected.snapshotTemplate`, createSnapshotTemplateId) ?? null,
            aliases: expectStringArray(candidate.aliases ?? [], `${path}.selected.aliases`),
            score: expectNumber(candidate.score, `${path}.selected.score`),
            sourceRefs: expectStringArray(candidate.sourceRefs ?? [], `${path}.selected.sourceRefs`),
          };
        })(),
    candidates: expectArray(receipt.candidates ?? [], `${path}.candidates`).map((entry, index) => {
      const candidate = expectRecord(entry, `${path}.candidates[${index}]`);
      return {
        kind: expectEnum(candidate.kind, `${path}.candidates[${index}].kind`, ['screen', 'element', 'posture', 'snapshot-template'] as const),
        target: expectString(candidate.target, `${path}.candidates[${index}].target`),
        screen: expectOptionalId(candidate.screen, `${path}.candidates[${index}].screen`, createScreenId) ?? null,
        element: expectOptionalId(candidate.element, `${path}.candidates[${index}].element`, createElementId) ?? null,
        posture: expectOptionalId(candidate.posture, `${path}.candidates[${index}].posture`, createPostureId) ?? null,
        snapshotTemplate: expectOptionalId(candidate.snapshotTemplate, `${path}.candidates[${index}].snapshotTemplate`, createSnapshotTemplateId) ?? null,
        aliases: expectStringArray(candidate.aliases ?? [], `${path}.candidates[${index}].aliases`),
        score: expectNumber(candidate.score, `${path}.candidates[${index}].score`),
        sourceRefs: expectStringArray(candidate.sourceRefs ?? [], `${path}.candidates[${index}].sourceRefs`),
      };
    }),
    rationale: expectString(receipt.rationale, `${path}.rationale`),
    cache: receipt.cache === undefined || receipt.cache === null
      ? undefined
      : (() => {
          const cache = expectRecord(receipt.cache, `${path}.cache`);
          return {
            key: expectString(cache.key, `${path}.cache.key`),
            status: expectEnum(cache.status, `${path}.cache.status`, ['hit', 'miss', 'disabled'] as const),
            reason: expectOptionalString(cache.reason, `${path}.cache.reason`) ?? null,
          };
        })(),
    failureClass: receipt.failureClass === undefined
      ? undefined
      : expectEnum(receipt.failureClass, `${path}.failureClass`, ['none', 'no-candidate', 'runtime-disabled', 'cache-disabled', 'cache-miss', 'cache-invalidated', 'translator-error'] as const),
  };
}

function validateResolutionReceipt(value: unknown, path: string): ResolutionReceipt {
  const receipt = expectRecord(value, path);
  const header = validateWorkflowEnvelopeHeader(receipt, path, {
    stage: 'resolution',
    scope: 'step',
    governance: 'approved',
    artifactFingerprint: expectOptionalString(receipt.taskFingerprint, `${path}.taskFingerprint`) ?? `${path}:resolution`,
    ids: {
      stepIndex: receipt.stepIndex === undefined ? null : expectNumber(receipt.stepIndex, `${path}.stepIndex`),
    },
    lineage: {
      sources: [],
      parents: [],
      handshakes: ['preparation', 'resolution'],
    },
  });
  const base = {
    ...header,
    taskFingerprint: expectString(receipt.taskFingerprint, `${path}.taskFingerprint`),
    knowledgeFingerprint: expectString(receipt.knowledgeFingerprint, `${path}.knowledgeFingerprint`),
    provider: expectString(receipt.provider, `${path}.provider`),
    mode: expectString(receipt.mode, `${path}.mode`),
    runAt: expectString(receipt.runAt, `${path}.runAt`),
    stepIndex: expectNumber(receipt.stepIndex, `${path}.stepIndex`),
    resolutionMode: expectEnum(receipt.resolutionMode ?? 'deterministic', `${path}.resolutionMode`, resolutionModes),
    knowledgeRefs: expectStringArray(receipt.knowledgeRefs ?? [], `${path}.knowledgeRefs`),
    supplementRefs: expectStringArray(receipt.supplementRefs ?? [], `${path}.supplementRefs`),
    controlRefs: expectStringArray(receipt.controlRefs ?? [], `${path}.controlRefs`),
    evidenceRefs: expectStringArray(receipt.evidenceRefs ?? [], `${path}.evidenceRefs`),
    overlayRefs: expectStringArray(receipt.overlayRefs ?? [], `${path}.overlayRefs`),
    observations: expectArray(receipt.observations ?? [], `${path}.observations`).map((entry, index) =>
      validateResolutionObservation(entry, `${path}.observations[${index}]`),
    ),
    exhaustion: expectArray(receipt.exhaustion ?? [], `${path}.exhaustion`).map((entry, index) =>
      validateResolutionExhaustionEntry(entry, `${path}.exhaustion[${index}]`),
    ),
    evidenceDrafts: expectArray(receipt.evidenceDrafts ?? [], `${path}.evidenceDrafts`).map((entry, index) =>
      validateResolutionEvidenceDraft(entry, `${path}.evidenceDrafts[${index}]`),
    ),
    proposalDrafts: expectArray(receipt.proposalDrafts ?? [], `${path}.proposalDrafts`).map((entry, index) =>
      validateResolutionProposalDraft(entry, `${path}.proposalDrafts[${index}]`),
    ),
    handshakes: expectArray(receipt.handshakes ?? ['preparation', 'resolution'], `${path}.handshakes`).map((entry, index) =>
      expectEnum(entry, `${path}.handshakes[${index}]`, workflowStages),
    ) as WorkflowStage[],
    winningConcern: receipt.winningConcern === undefined
      ? 'resolution'
      : expectEnum(receipt.winningConcern, `${path}.winningConcern`, workflowLanes) as WorkflowLane,
    winningSource: receipt.winningSource === undefined
      ? 'none'
      : expectEnum(receipt.winningSource, `${path}.winningSource`, stepWinningSources),
    translation: receipt.translation === undefined || receipt.translation === null
      ? null
      : validateTranslationReceipt(receipt.translation, `${path}.translation`),
  };
  const kind = expectEnum(receipt.kind, `${path}.kind`, ['resolved', 'resolved-with-proposals', 'needs-human'] as const);
  if (kind === 'needs-human') {
    return {
      ...base,
      kind,
      confidence: expectEnum(receipt.confidence, `${path}.confidence`, ['unbound'] as const),
      provenanceKind: expectEnum(receipt.provenanceKind, `${path}.provenanceKind`, ['unresolved'] as const),
      reason: expectString(receipt.reason, `${path}.reason`),
    };
  }
  if (kind === 'resolved') {
    return {
      ...base,
      kind,
      confidence: expectEnum(receipt.confidence, `${path}.confidence`, ['compiler-derived', 'agent-verified'] as const),
      provenanceKind: expectEnum(receipt.provenanceKind, `${path}.provenanceKind`, ['explicit', 'approved-knowledge', 'live-exploration'] as const),
      target: validateResolutionTarget(receipt.target, `${path}.target`),
    };
  }
  return {
    ...base,
    kind,
    confidence: expectEnum(receipt.confidence, `${path}.confidence`, ['agent-proposed', 'agent-verified'] as const),
    provenanceKind: expectEnum(receipt.provenanceKind, `${path}.provenanceKind`, ['approved-knowledge', 'live-exploration'] as const),
    target: validateResolutionTarget(receipt.target, `${path}.target`),
  };
}

function validateStepExecutionReceipt(value: unknown, path: string): StepExecutionReceipt {
  const receipt = expectRecord(value, path);
  const execution = expectRecord(receipt.execution, `${path}.execution`);
  const header = validateWorkflowEnvelopeHeader(receipt, path, {
    stage: 'execution',
    scope: 'step',
    governance: execution.status === 'failed' ? 'blocked' : 'approved',
    artifactFingerprint: expectOptionalString(receipt.taskFingerprint, `${path}.taskFingerprint`) ?? `${path}:execution`,
    ids: {
      stepIndex: receipt.stepIndex === undefined ? null : expectNumber(receipt.stepIndex, `${path}.stepIndex`),
    },
    lineage: {
      sources: [],
      parents: [],
      handshakes: ['preparation', 'resolution', 'execution'],
    },
  });
  return {
    ...header,
    stepIndex: expectNumber(receipt.stepIndex, `${path}.stepIndex`),
    taskFingerprint: expectString(receipt.taskFingerprint, `${path}.taskFingerprint`),
    knowledgeFingerprint: expectString(receipt.knowledgeFingerprint, `${path}.knowledgeFingerprint`),
    runAt: expectString(receipt.runAt, `${path}.runAt`),
    mode: expectString(receipt.mode, `${path}.mode`),
    widgetContract: expectOptionalString(receipt.widgetContract, `${path}.widgetContract`) ?? null,
    locatorStrategy: expectOptionalString(receipt.locatorStrategy, `${path}.locatorStrategy`) ?? null,
    locatorRung: receipt.locatorRung === undefined || receipt.locatorRung === null
      ? null
      : expectNumber(receipt.locatorRung, `${path}.locatorRung`),
    degraded: expectBoolean(receipt.degraded, `${path}.degraded`),
    preconditionFailures: expectStringArray(receipt.preconditionFailures ?? [], `${path}.preconditionFailures`),
    requiredStateRefs: expectArray(receipt.requiredStateRefs ?? [], `${path}.requiredStateRefs`).map((entry, index) =>
      expectId(entry, `${path}.requiredStateRefs[${index}]`, createStateNodeRef),
    ),
    forbiddenStateRefs: expectArray(receipt.forbiddenStateRefs ?? [], `${path}.forbiddenStateRefs`).map((entry, index) =>
      expectId(entry, `${path}.forbiddenStateRefs[${index}]`, createStateNodeRef),
    ),
    effectAssertions: expectStringArray(receipt.effectAssertions ?? [], `${path}.effectAssertions`),
    eventSignatureRefs: expectArray(receipt.eventSignatureRefs ?? [], `${path}.eventSignatureRefs`).map((entry, index) =>
      expectId(entry, `${path}.eventSignatureRefs[${index}]`, createEventSignatureRef),
    ),
    expectedTransitionRefs: expectArray(receipt.expectedTransitionRefs ?? [], `${path}.expectedTransitionRefs`).map((entry, index) =>
      expectId(entry, `${path}.expectedTransitionRefs[${index}]`, createTransitionRef),
    ),
    observedStateRefs: expectArray(receipt.observedStateRefs ?? [], `${path}.observedStateRefs`).map((entry, index) =>
      expectId(entry, `${path}.observedStateRefs[${index}]`, createStateNodeRef),
    ),
    transitionObservations: expectArray(receipt.transitionObservations ?? [], `${path}.transitionObservations`).map((entry, index) => {
      const observation = expectRecord(entry, `${path}.transitionObservations[${index}]`);
      return {
        observationId: expectString(observation.observationId, `${path}.transitionObservations[${index}].observationId`),
        source: expectEnum(observation.source, `${path}.transitionObservations[${index}].source`, ['harvest', 'runtime'] as const),
        actor: expectEnum(observation.actor, `${path}.transitionObservations[${index}].actor`, ['safe-active-harvest', 'runtime-execution', 'live-dom'] as const),
        screen: expectId(observation.screen, `${path}.transitionObservations[${index}].screen`, createScreenId),
        eventSignatureRef: expectOptionalId(observation.eventSignatureRef, `${path}.transitionObservations[${index}].eventSignatureRef`, createEventSignatureRef) ?? null,
        transitionRef: expectOptionalId(observation.transitionRef, `${path}.transitionObservations[${index}].transitionRef`, createTransitionRef) ?? null,
        expectedTransitionRefs: expectArray(observation.expectedTransitionRefs ?? [], `${path}.transitionObservations[${index}].expectedTransitionRefs`).map((ref, refIndex) =>
          expectId(ref, `${path}.transitionObservations[${index}].expectedTransitionRefs[${refIndex}]`, createTransitionRef),
        ),
        observedStateRefs: expectArray(observation.observedStateRefs ?? [], `${path}.transitionObservations[${index}].observedStateRefs`).map((ref, refIndex) =>
          expectId(ref, `${path}.transitionObservations[${index}].observedStateRefs[${refIndex}]`, createStateNodeRef),
        ),
        unexpectedStateRefs: expectArray(observation.unexpectedStateRefs ?? [], `${path}.transitionObservations[${index}].unexpectedStateRefs`).map((ref, refIndex) =>
          expectId(ref, `${path}.transitionObservations[${index}].unexpectedStateRefs[${refIndex}]`, createStateNodeRef),
        ),
        confidence: expectEnum(observation.confidence, `${path}.transitionObservations[${index}].confidence`, ['observed', 'inferred', 'missing'] as const),
        classification: expectEnum(observation.classification, `${path}.transitionObservations[${index}].classification`, ['matched', 'ambiguous-match', 'missing-expected', 'unexpected-effects'] as const),
        detail: observation.detail === undefined ? undefined : expectStringRecord(observation.detail, `${path}.transitionObservations[${index}].detail`),
      };
    }),
    durationMs: expectNumber(receipt.durationMs ?? 0, `${path}.durationMs`),
    timing: (() => {
      const timing = expectRecord(receipt.timing ?? {}, `${path}.timing`);
      return {
        setupMs: expectNumber(timing.setupMs ?? 0, `${path}.timing.setupMs`),
        resolutionMs: expectNumber(timing.resolutionMs ?? 0, `${path}.timing.resolutionMs`),
        actionMs: expectNumber(timing.actionMs ?? 0, `${path}.timing.actionMs`),
        assertionMs: expectNumber(timing.assertionMs ?? 0, `${path}.timing.assertionMs`),
        retriesMs: expectNumber(timing.retriesMs ?? 0, `${path}.timing.retriesMs`),
        teardownMs: expectNumber(timing.teardownMs ?? 0, `${path}.timing.teardownMs`),
        totalMs: expectNumber(timing.totalMs ?? receipt.durationMs ?? 0, `${path}.timing.totalMs`),
      };
    })(),
    cost: (() => {
      const cost = expectRecord(receipt.cost ?? { instructionCount: 0, diagnosticCount: 0 }, `${path}.cost`);
      return {
        instructionCount: expectNumber(cost.instructionCount, `${path}.cost.instructionCount`),
        diagnosticCount: expectNumber(cost.diagnosticCount, `${path}.cost.diagnosticCount`),
      };
    })(),
    budget: (() => {
      const budget = expectRecord(receipt.budget ?? {}, `${path}.budget`);
      const thresholds = expectRecord(budget.thresholds ?? {}, `${path}.budget.thresholds`);
      return {
        thresholds: {
          maxSetupMs: thresholds.maxSetupMs === undefined || thresholds.maxSetupMs === null ? undefined : expectNumber(thresholds.maxSetupMs, `${path}.budget.thresholds.maxSetupMs`),
          maxResolutionMs: thresholds.maxResolutionMs === undefined || thresholds.maxResolutionMs === null ? undefined : expectNumber(thresholds.maxResolutionMs, `${path}.budget.thresholds.maxResolutionMs`),
          maxActionMs: thresholds.maxActionMs === undefined || thresholds.maxActionMs === null ? undefined : expectNumber(thresholds.maxActionMs, `${path}.budget.thresholds.maxActionMs`),
          maxAssertionMs: thresholds.maxAssertionMs === undefined || thresholds.maxAssertionMs === null ? undefined : expectNumber(thresholds.maxAssertionMs, `${path}.budget.thresholds.maxAssertionMs`),
          maxRetriesMs: thresholds.maxRetriesMs === undefined || thresholds.maxRetriesMs === null ? undefined : expectNumber(thresholds.maxRetriesMs, `${path}.budget.thresholds.maxRetriesMs`),
          maxTeardownMs: thresholds.maxTeardownMs === undefined || thresholds.maxTeardownMs === null ? undefined : expectNumber(thresholds.maxTeardownMs, `${path}.budget.thresholds.maxTeardownMs`),
          maxTotalMs: thresholds.maxTotalMs === undefined || thresholds.maxTotalMs === null ? undefined : expectNumber(thresholds.maxTotalMs, `${path}.budget.thresholds.maxTotalMs`),
          maxInstructionCount: thresholds.maxInstructionCount === undefined || thresholds.maxInstructionCount === null ? undefined : expectNumber(thresholds.maxInstructionCount, `${path}.budget.thresholds.maxInstructionCount`),
          maxDiagnosticCount: thresholds.maxDiagnosticCount === undefined || thresholds.maxDiagnosticCount === null ? undefined : expectNumber(thresholds.maxDiagnosticCount, `${path}.budget.thresholds.maxDiagnosticCount`),
        },
        status: expectEnum(budget.status ?? 'not-configured', `${path}.budget.status`, ['within-budget', 'over-budget', 'not-configured'] as const),
        breaches: expectStringArray(budget.breaches ?? [], `${path}.budget.breaches`),
      };
    })(),
    failure: (() => {
      const failure = expectRecord(receipt.failure ?? {}, `${path}.failure`);
      return {
        family: expectEnum(failure.family ?? 'none', `${path}.failure.family`, ['none', 'precondition-failure', 'locator-degradation-failure', 'environment-runtime-failure'] as const),
        code: expectOptionalString(failure.code, `${path}.failure.code`) ?? null,
        message: expectOptionalString(failure.message, `${path}.failure.message`) ?? null,
      };
    })(),
    recovery: (() => {
      const recovery = expectRecord(receipt.recovery ?? {}, `${path}.recovery`);
      return {
        policyProfile: expectString(recovery.policyProfile ?? 'default', `${path}.recovery.policyProfile`),
        attempts: expectArray(recovery.attempts ?? [], `${path}.recovery.attempts`).map((entry, index) => {
          const attempt = expectRecord(entry, `${path}.recovery.attempts[${index}]`);
          return {
            strategyId: expectEnum(attempt.strategyId, `${path}.recovery.attempts[${index}].strategyId`, ['verify-prerequisites', 'execute-prerequisite-actions', 'force-alternate-locator-rungs', 'snapshot-guided-reresolution', 'bounded-retry-with-backoff', 'refresh-runtime'] as const),
            family: expectEnum(attempt.family, `${path}.recovery.attempts[${index}].family`, ['precondition-failure', 'locator-degradation-failure', 'environment-runtime-failure'] as const),
            attempt: expectNumber(attempt.attempt, `${path}.recovery.attempts[${index}].attempt`),
            startedAt: expectString(attempt.startedAt, `${path}.recovery.attempts[${index}].startedAt`),
            durationMs: expectNumber(attempt.durationMs, `${path}.recovery.attempts[${index}].durationMs`),
            result: expectEnum(attempt.result, `${path}.recovery.attempts[${index}].result`, ['recovered', 'failed', 'skipped'] as const),
            diagnostics: expectStringArray(attempt.diagnostics ?? [], `${path}.recovery.attempts[${index}].diagnostics`),
          };
        }),
      };
    })(),
    handshakes: expectArray(receipt.handshakes ?? ['preparation', 'resolution', 'execution'], `${path}.handshakes`).map((entry, index) =>
      expectEnum(entry, `${path}.handshakes[${index}]`, workflowStages),
    ) as WorkflowStage[],
    execution: {
      status: expectEnum(execution.status, `${path}.execution.status`, ['ok', 'failed', 'skipped'] as const),
      observedEffects: expectStringArray(execution.observedEffects ?? [], `${path}.execution.observedEffects`),
      diagnostics: expectArray(execution.diagnostics ?? [], `${path}.execution.diagnostics`).map((entry, index) => {
        const diagnostic = expectRecord(entry, `${path}.execution.diagnostics[${index}]`);
        return {
          code: expectString(diagnostic.code, `${path}.execution.diagnostics[${index}].code`),
          message: expectString(diagnostic.message, `${path}.execution.diagnostics[${index}].message`),
          context: diagnostic.context === undefined ? undefined : expectStringRecord(diagnostic.context, `${path}.execution.diagnostics[${index}].context`),
        };
      }),
    },
  };
}

export function validateRunRecord(value: unknown): RunRecord {
  const record = expectRecord(value, 'runRecord');
  const steps = expectArray(record.steps ?? [], 'runRecord.steps').map((entry, index) => {
    const step = expectRecord(entry, `runRecord.steps[${index}]`);
    return {
      stepIndex: expectNumber(step.stepIndex, `runRecord.steps[${index}].stepIndex`),
      interpretation: validateResolutionReceipt(step.interpretation, `runRecord.steps[${index}].interpretation`),
      execution: validateStepExecutionReceipt(step.execution, `runRecord.steps[${index}].execution`),
      evidenceIds: expectStringArray(step.evidenceIds ?? [], `runRecord.steps[${index}].evidenceIds`),
    };
  });
  const evidenceIds = expectStringArray(record.evidenceIds ?? [], 'runRecord.evidenceIds');
  const translationMetrics = (() => {
    const metrics = expectRecord(record.translationMetrics ?? {}, 'runRecord.translationMetrics');
    return {
      total: expectNumber(metrics.total ?? 0, 'runRecord.translationMetrics.total'),
      hits: expectNumber(metrics.hits ?? 0, 'runRecord.translationMetrics.hits'),
      misses: expectNumber(metrics.misses ?? 0, 'runRecord.translationMetrics.misses'),
      disabled: expectNumber(metrics.disabled ?? 0, 'runRecord.translationMetrics.disabled'),
      hitRate: expectNumber(metrics.hitRate ?? 0, 'runRecord.translationMetrics.hitRate'),
      missReasons: Object.fromEntries(Object.entries(expectRecord(metrics.missReasons ?? {}, 'runRecord.translationMetrics.missReasons')).map(([key, value]) => [key, expectNumber(value, `runRecord.translationMetrics.missReasons.${key}`)])),
      failureClasses: Object.fromEntries(Object.entries(expectRecord(metrics.failureClasses ?? {}, 'runRecord.translationMetrics.failureClasses')).map(([key, value]) => [key, expectNumber(value, `runRecord.translationMetrics.failureClasses.${key}`)])),
    };
  })();
  const executionMetrics = (() => {
    const metrics = expectRecord(record.executionMetrics ?? {}, 'runRecord.executionMetrics');
    const timingTotals = expectRecord(metrics.timingTotals ?? {}, 'runRecord.executionMetrics.timingTotals');
    const costTotals = expectRecord(metrics.costTotals ?? {}, 'runRecord.executionMetrics.costTotals');
    return {
      timingTotals: {
        setupMs: expectNumber(timingTotals.setupMs ?? 0, 'runRecord.executionMetrics.timingTotals.setupMs'),
        resolutionMs: expectNumber(timingTotals.resolutionMs ?? 0, 'runRecord.executionMetrics.timingTotals.resolutionMs'),
        actionMs: expectNumber(timingTotals.actionMs ?? 0, 'runRecord.executionMetrics.timingTotals.actionMs'),
        assertionMs: expectNumber(timingTotals.assertionMs ?? 0, 'runRecord.executionMetrics.timingTotals.assertionMs'),
        retriesMs: expectNumber(timingTotals.retriesMs ?? 0, 'runRecord.executionMetrics.timingTotals.retriesMs'),
        teardownMs: expectNumber(timingTotals.teardownMs ?? 0, 'runRecord.executionMetrics.timingTotals.teardownMs'),
        totalMs: expectNumber(timingTotals.totalMs ?? 0, 'runRecord.executionMetrics.timingTotals.totalMs'),
      },
      costTotals: {
        instructionCount: expectNumber(costTotals.instructionCount ?? 0, 'runRecord.executionMetrics.costTotals.instructionCount'),
        diagnosticCount: expectNumber(costTotals.diagnosticCount ?? 0, 'runRecord.executionMetrics.costTotals.diagnosticCount'),
      },
      budgetBreaches: expectNumber(metrics.budgetBreaches ?? 0, 'runRecord.executionMetrics.budgetBreaches'),
      failureFamilies: (() => {
        const families = expectRecord(metrics.failureFamilies ?? {}, 'runRecord.executionMetrics.failureFamilies');
        return {
          none: expectNumber(families.none ?? 0, 'runRecord.executionMetrics.failureFamilies.none'),
          'precondition-failure': expectNumber(families['precondition-failure'] ?? 0, 'runRecord.executionMetrics.failureFamilies.precondition-failure'),
          'locator-degradation-failure': expectNumber(families['locator-degradation-failure'] ?? 0, 'runRecord.executionMetrics.failureFamilies.locator-degradation-failure'),
          'environment-runtime-failure': expectNumber(families['environment-runtime-failure'] ?? 0, 'runRecord.executionMetrics.failureFamilies.environment-runtime-failure'),
        };
      })(),
      recoveryFamilies: (() => {
        const families = expectRecord(metrics.recoveryFamilies ?? {}, 'runRecord.executionMetrics.recoveryFamilies');
        return {
          'precondition-failure': expectNumber(families['precondition-failure'] ?? 0, 'runRecord.executionMetrics.recoveryFamilies.precondition-failure'),
          'locator-degradation-failure': expectNumber(families['locator-degradation-failure'] ?? 0, 'runRecord.executionMetrics.recoveryFamilies.locator-degradation-failure'),
          'environment-runtime-failure': expectNumber(families['environment-runtime-failure'] ?? 0, 'runRecord.executionMetrics.recoveryFamilies.environment-runtime-failure'),
        };
      })(),
      recoveryStrategies: (() => {
        const strategies = expectRecord(metrics.recoveryStrategies ?? {}, 'runRecord.executionMetrics.recoveryStrategies');
        return {
          'verify-prerequisites': expectNumber(strategies['verify-prerequisites'] ?? 0, 'runRecord.executionMetrics.recoveryStrategies.verify-prerequisites'),
          'execute-prerequisite-actions': expectNumber(strategies['execute-prerequisite-actions'] ?? 0, 'runRecord.executionMetrics.recoveryStrategies.execute-prerequisite-actions'),
          'force-alternate-locator-rungs': expectNumber(strategies['force-alternate-locator-rungs'] ?? 0, 'runRecord.executionMetrics.recoveryStrategies.force-alternate-locator-rungs'),
          'snapshot-guided-reresolution': expectNumber(strategies['snapshot-guided-reresolution'] ?? 0, 'runRecord.executionMetrics.recoveryStrategies.snapshot-guided-reresolution'),
          'bounded-retry-with-backoff': expectNumber(strategies['bounded-retry-with-backoff'] ?? 0, 'runRecord.executionMetrics.recoveryStrategies.bounded-retry-with-backoff'),
          'refresh-runtime': expectNumber(strategies['refresh-runtime'] ?? 0, 'runRecord.executionMetrics.recoveryStrategies.refresh-runtime'),
        };
      })(),
    };
  })();
  const header = validateWorkflowEnvelopeHeader(record, 'runRecord', {
    stage: 'execution',
    scope: 'run',
    governance: steps.some((step) => step.interpretation.kind === 'needs-human' || step.execution.execution.status === 'failed')
      ? 'blocked'
      : 'approved',
    artifactFingerprint: expectOptionalString(record.runId, 'runRecord.runId') ?? 'scenario-run-record',
    ids: {
      adoId: expectOptionalId(record.adoId, 'runRecord.adoId', createAdoId) ?? null,
      suite: expectOptionalString(record.suite, 'runRecord.suite') ?? null,
      runId: expectOptionalString(record.runId, 'runRecord.runId') ?? null,
    },
    lineage: {
      sources: [],
      parents: [],
      handshakes: ['preparation', 'resolution', 'execution', 'evidence'],
    },
  });
  return {
    kind: expectEnum(record.kind, 'runRecord.kind', ['scenario-run-record'] as const),
    ...header,
    payload: {
      runId: expectString(record.runId, 'runRecord.runId'),
      adoId: expectId(record.adoId, 'runRecord.adoId', createAdoId),
      revision: expectNumber(record.revision, 'runRecord.revision'),
      title: expectString(record.title, 'runRecord.title'),
      suite: ensureSafeRelativePathLike(expectString(record.suite, 'runRecord.suite'), 'runRecord.suite'),
      taskFingerprint: expectString(record.taskFingerprint, 'runRecord.taskFingerprint'),
      knowledgeFingerprint: expectString(record.knowledgeFingerprint, 'runRecord.knowledgeFingerprint'),
      provider: expectString(record.provider, 'runRecord.provider'),
      mode: expectString(record.mode, 'runRecord.mode'),
      startedAt: expectString(record.startedAt, 'runRecord.startedAt'),
      completedAt: expectString(record.completedAt, 'runRecord.completedAt'),
      steps,
      evidenceIds,
      translationMetrics,
      executionMetrics,
    },
    runId: expectString(record.runId, 'runRecord.runId'),
    adoId: expectId(record.adoId, 'runRecord.adoId', createAdoId),
    revision: expectNumber(record.revision, 'runRecord.revision'),
    title: expectString(record.title, 'runRecord.title'),
    suite: ensureSafeRelativePathLike(expectString(record.suite, 'runRecord.suite'), 'runRecord.suite'),
    taskFingerprint: expectString(record.taskFingerprint, 'runRecord.taskFingerprint'),
    knowledgeFingerprint: expectString(record.knowledgeFingerprint, 'runRecord.knowledgeFingerprint'),
    provider: expectString(record.provider, 'runRecord.provider'),
    mode: expectString(record.mode, 'runRecord.mode'),
    startedAt: expectString(record.startedAt, 'runRecord.startedAt'),
    completedAt: expectString(record.completedAt, 'runRecord.completedAt'),
    steps,
    evidenceIds,
    translationMetrics,
    executionMetrics,
  };
}

export function validateProposalBundle(value: unknown): ProposalBundle {
  const bundle = expectRecord(value, 'proposalBundle');
  const proposals = expectArray(bundle.proposals ?? [], 'proposalBundle.proposals').map((entry, index) => {
    const proposal = expectRecord(entry, `proposalBundle.proposals[${index}]`);
    return {
      proposalId: expectString(proposal.proposalId, `proposalBundle.proposals[${index}].proposalId`),
      stepIndex: expectNumber(proposal.stepIndex, `proposalBundle.proposals[${index}].stepIndex`),
      artifactType: validateTrustPolicyArtifactType(proposal.artifactType, `proposalBundle.proposals[${index}].artifactType`),
      targetPath: expectString(proposal.targetPath, `proposalBundle.proposals[${index}].targetPath`),
      title: expectString(proposal.title, `proposalBundle.proposals[${index}].title`),
      patch: expectRecord(proposal.patch ?? {}, `proposalBundle.proposals[${index}].patch`),
      evidenceIds: expectStringArray(proposal.evidenceIds ?? [], `proposalBundle.proposals[${index}].evidenceIds`),
      impactedSteps: expectArray(proposal.impactedSteps ?? [], `proposalBundle.proposals[${index}].impactedSteps`).map((stepIndex, impactedIndex) =>
        expectNumber(stepIndex, `proposalBundle.proposals[${index}].impactedSteps[${impactedIndex}]`),
      ),
      trustPolicy: validateTrustPolicyEvaluation(proposal.trustPolicy),
      certification: expectEnum(proposal.certification ?? 'uncertified', `proposalBundle.proposals[${index}].certification`, certificationStates),
      activation: validateProposalActivation(proposal.activation, `proposalBundle.proposals[${index}].activation`),
      lineage: validateCanonicalLineage(proposal.lineage, `proposalBundle.proposals[${index}].lineage`),
    };
  });
  const header = validateWorkflowEnvelopeHeader(bundle, 'proposalBundle', {
    stage: 'proposal',
    scope: 'scenario',
    governance: proposals.some((proposal) => proposal.trustPolicy.decision === 'deny')
      ? 'blocked'
      : proposals.some((proposal) => proposal.trustPolicy.decision === 'review')
        ? 'review-required'
        : 'approved',
    artifactFingerprint: expectOptionalString(bundle.runId, 'proposalBundle.runId') ?? 'proposal-bundle',
    ids: {
      adoId: expectOptionalId(bundle.adoId, 'proposalBundle.adoId', createAdoId) ?? null,
      suite: expectOptionalString(bundle.suite, 'proposalBundle.suite') ?? null,
      runId: expectOptionalString(bundle.runId, 'proposalBundle.runId') ?? null,
    },
    lineage: {
      sources: [],
      parents: [],
      handshakes: ['preparation', 'resolution', 'execution', 'evidence', 'proposal'],
    },
  });
  return {
    kind: expectEnum(bundle.kind, 'proposalBundle.kind', ['proposal-bundle'] as const),
    ...header,
    payload: {
      adoId: expectId(bundle.adoId, 'proposalBundle.adoId', createAdoId),
      runId: expectString(bundle.runId, 'proposalBundle.runId'),
      revision: expectNumber(bundle.revision, 'proposalBundle.revision'),
      title: expectString(bundle.title, 'proposalBundle.title'),
      suite: ensureSafeRelativePathLike(expectString(bundle.suite, 'proposalBundle.suite'), 'proposalBundle.suite'),
      proposals,
    },
    adoId: expectId(bundle.adoId, 'proposalBundle.adoId', createAdoId),
    runId: expectString(bundle.runId, 'proposalBundle.runId'),
    revision: expectNumber(bundle.revision, 'proposalBundle.revision'),
    title: expectString(bundle.title, 'proposalBundle.title'),
    suite: ensureSafeRelativePathLike(expectString(bundle.suite, 'proposalBundle.suite'), 'proposalBundle.suite'),
    proposals,
  };
}

export const validateSurfaceGraph: (value: unknown) => SurfaceGraph =
  schemaDecode.decoderFor<SurfaceGraph>(schemas.SurfaceGraphSchema);

export function validateScreenElements(value: unknown): ScreenElements {
  const decoded = schemaDecode.decoderFor<ScreenElements>(schemas.ScreenElementsSchema)(value);
  return {
    ...decoded,
    elements: Object.fromEntries(
      Object.entries(decoded.elements).map(([elementId, element]) => [
        elementId,
        validateElement(element, `elements.${elementId}`),
      ]),
    ),
  };
}

export function validateScreenHints(value: unknown): ScreenHints {
  const decoded = schemaDecode.decoderFor<ScreenHints>(schemas.ScreenHintsSchema)(value);
  // Post-decode normalization: uniqueSorted aliases, ensureSafeRelativePathLike on snapshot IDs
  return {
    ...decoded,
    screenAliases: uniqueSorted(decoded.screenAliases),
    elements: Object.fromEntries(
      Object.entries(decoded.elements).map(([elementId, hint]) => [
        elementId,
        {
          ...hint,
          aliases: uniqueSorted(hint.aliases),
          snapshotAliases: hint.snapshotAliases
            ? Object.fromEntries(
                Object.entries(hint.snapshotAliases).map(([snapshotId, aliases]) => [
                  ensureSafeRelativePathLike(snapshotId, `screen-hints.elements.${elementId}.snapshotAliases.${snapshotId}`),
                  uniqueSorted(aliases),
                ]),
              )
            : undefined,
        },
      ]),
    ),
  };
}

export const validateDatasetControl: (value: unknown) => DatasetControl =
  schemaDecode.decoderFor<DatasetControl>(schemas.DatasetControlSchema);

function validateResolutionControlSelector(value: unknown, path: string) {
  const selector = expectRecord(value ?? {}, path);
  return {
    adoIds: expectIdArray(selector.adoIds ?? [], `${path}.adoIds`, createAdoId),
    suites: expectStringArray(selector.suites ?? [], `${path}.suites`).map((entry, index) =>
      ensureSafeRelativePathLike(entry, `${path}.suites[${index}]`),
    ),
    tags: expectStringArray(selector.tags ?? [], `${path}.tags`),
  };
}

export function validateResolutionControl(value: unknown): ResolutionControl {
  const decoded = schemaDecode.decoderFor<ResolutionControl>(schemas.ResolutionControlSchema)(value);
  // Post-decode: path safety on suites
  for (const [index, suite] of decoded.selector.suites.entries()) {
    ensureSafeRelativePathLike(suite, `resolution-control.selector.suites[${index}]`);
  }
  return decoded;
}


function validateRecoveryPolicy(value: unknown, path: string) {
  const policy = expectRecord(value, path);
  const families = expectRecord(policy.families ?? {}, `${path}.families`);
  const familyNames = ['precondition-failure', 'locator-degradation-failure', 'environment-runtime-failure'] as const;
  return {
    version: expectNumber(policy.version ?? 1, `${path}.version`) as 1,
    profile: expectString(policy.profile ?? 'default', `${path}.profile`),
    families: Object.fromEntries(familyNames.map((family) => {
      const familyConfig = expectRecord(families[family] ?? {}, `${path}.families.${family}`);
      const budget = expectRecord(familyConfig.budget ?? {}, `${path}.families.${family}.budget`);
      return [family, {
        budget: {
          maxAttempts: expectNumber(budget.maxAttempts ?? 0, `${path}.families.${family}.budget.maxAttempts`),
          maxTotalMs: expectNumber(budget.maxTotalMs ?? 0, `${path}.families.${family}.budget.maxTotalMs`),
          backoffMs: expectNumber(budget.backoffMs ?? 0, `${path}.families.${family}.budget.backoffMs`),
        },
        strategies: expectArray(familyConfig.strategies ?? [], `${path}.families.${family}.strategies`).map((entry, index) => {
          const strategy = expectRecord(entry, `${path}.families.${family}.strategies[${index}]`);
          return {
            id: expectEnum(strategy.id, `${path}.families.${family}.strategies[${index}].id`, ['verify-prerequisites', 'execute-prerequisite-actions', 'force-alternate-locator-rungs', 'snapshot-guided-reresolution', 'bounded-retry-with-backoff', 'refresh-runtime'] as const),
            enabled: expectBoolean(strategy.enabled, `${path}.families.${family}.strategies[${index}].enabled`),
            maxAttempts: strategy.maxAttempts === undefined ? undefined : expectNumber(strategy.maxAttempts, `${path}.families.${family}.strategies[${index}].maxAttempts`),
            backoffMs: strategy.backoffMs === undefined ? undefined : expectNumber(strategy.backoffMs, `${path}.families.${family}.strategies[${index}].backoffMs`),
            diagnostics: expectStringArray(strategy.diagnostics ?? [], `${path}.families.${family}.strategies[${index}].diagnostics`),
          };
        }),
      }];
    })) as RecoveryPolicy['families'],
  } satisfies RecoveryPolicy;
}

export function validateRunbookControl(value: unknown): RunbookControl {
  const decoded = schemaDecode.decoderFor<RunbookControl>(schemas.RunbookControlSchema)(value);
  // Post-decode: path safety on suites
  for (const [index, suite] of decoded.selector.suites.entries()) {
    ensureSafeRelativePathLike(suite, `runbook-control.selector.suites[${index}]`);
  }
  return decoded;
}

export function validatePatternDocument(value: unknown): PatternDocument {
  return validatePatternDocumentRecord(value);
}

export function validateSharedPatterns(value: unknown): SharedPatterns {
  const decoded = schemaDecode.decoderFor<SharedPatterns>(schemas.MergedPatternsSchema)(value);
  // Validate all required actions are present
  const requiredActions = ['navigate', 'input', 'click', 'assert-snapshot'] as const;
  for (const action of requiredActions) {
    if (!decoded.actions[action]) {
      throw new SchemaError(`missing required action ${action}`, 'shared-patterns.actions');
    }
  }
  return decoded;
}

export function validateScreenPostures(value: unknown): ScreenPostures {
  const decoded = schemaDecode.decoderFor<ScreenPostures>(schemas.ScreenPosturesSchema)(value);
  return normalizeScreenPostures(decoded);
}

function validateObservationPredicate(value: unknown, path: string) {
  const predicate = expectRecord(value, path);
  return {
    kind: expectEnum(predicate.kind, `${path}.kind`, statePredicateSemantics),
    targetRef: expectOptionalId(predicate.targetRef, `${path}.targetRef`, createCanonicalTargetRef) ?? null,
    selectorRef: expectOptionalId(predicate.selectorRef, `${path}.selectorRef`, createSelectorRef) ?? null,
    routeVariantRef: expectOptionalString(predicate.routeVariantRef, `${path}.routeVariantRef`) ?? null,
    attribute: expectOptionalString(predicate.attribute, `${path}.attribute`) ?? null,
    value: expectOptionalString(predicate.value, `${path}.value`) ?? null,
    message: expectOptionalString(predicate.message, `${path}.message`) ?? null,
  };
}

function validateStateNode(value: unknown, path: string): StateNode {
  const node = expectRecord(value, path);
  return {
    ref: expectId(node.ref, `${path}.ref`, createStateNodeRef),
    screen: expectId(node.screen, `${path}.screen`, createScreenId),
    label: expectString(node.label, `${path}.label`),
    aliases: uniqueSorted(expectStringArray(node.aliases ?? [], `${path}.aliases`)),
    scope: expectEnum(node.scope, `${path}.scope`, ['screen', 'surface', 'target', 'route', 'modal'] as const),
    targetRef: expectOptionalId(node.targetRef, `${path}.targetRef`, createCanonicalTargetRef) ?? null,
    routeVariantRefs: uniqueSorted(expectStringArray(node.routeVariantRefs ?? [], `${path}.routeVariantRefs`)),
    predicates: expectArray(node.predicates ?? [], `${path}.predicates`).map((entry, index) =>
      validateObservationPredicate(entry, `${path}.predicates[${index}]`),
    ),
    provenance: uniqueSorted(expectStringArray(node.provenance ?? [], `${path}.provenance`)),
  };
}

function validateEventSignature(value: unknown, path: string): EventSignature {
  const event = expectRecord(value, path);
  const dispatch = expectRecord(event.dispatch ?? {}, `${path}.dispatch`);
  const effects = expectRecord(event.effects ?? {}, `${path}.effects`);
  const observationPlan = expectRecord(event.observationPlan ?? {}, `${path}.observationPlan`);
  return {
    ref: expectId(event.ref, `${path}.ref`, createEventSignatureRef),
    screen: expectId(event.screen, `${path}.screen`, createScreenId),
    targetRef: expectId(event.targetRef, `${path}.targetRef`, createCanonicalTargetRef),
    label: expectString(event.label, `${path}.label`),
    aliases: uniqueSorted(expectStringArray(event.aliases ?? [], `${path}.aliases`)),
    dispatch: {
      action: validateAction(dispatch.action, `${path}.dispatch.action`),
      sampleValue: expectOptionalString(dispatch.sampleValue, `${path}.dispatch.sampleValue`) ?? null,
    },
    requiredStateRefs: expectArray(event.requiredStateRefs ?? [], `${path}.requiredStateRefs`).map((entry, index) =>
      expectId(entry, `${path}.requiredStateRefs[${index}]`, createStateNodeRef),
    ),
    forbiddenStateRefs: expectArray(event.forbiddenStateRefs ?? [], `${path}.forbiddenStateRefs`).map((entry, index) =>
      expectId(entry, `${path}.forbiddenStateRefs[${index}]`, createStateNodeRef),
    ),
    effects: {
      transitionRefs: expectArray(effects.transitionRefs ?? [], `${path}.effects.transitionRefs`).map((entry, index) =>
        expectId(entry, `${path}.effects.transitionRefs[${index}]`, createTransitionRef),
      ),
      resultStateRefs: expectArray(effects.resultStateRefs ?? [], `${path}.effects.resultStateRefs`).map((entry, index) =>
        expectId(entry, `${path}.effects.resultStateRefs[${index}]`, createStateNodeRef),
      ),
      observableEffects: uniqueSorted(expectStringArray(effects.observableEffects ?? [], `${path}.effects.observableEffects`)),
      assertions: uniqueSorted(expectStringArray(effects.assertions ?? [], `${path}.effects.assertions`)),
    },
    observationPlan: {
      timeoutMs: observationPlan.timeoutMs === undefined ? null : expectNumber(observationPlan.timeoutMs, `${path}.observationPlan.timeoutMs`),
      settleMs: observationPlan.settleMs === undefined ? null : expectNumber(observationPlan.settleMs, `${path}.observationPlan.settleMs`),
      observeStateRefs: expectArray(observationPlan.observeStateRefs ?? [], `${path}.observationPlan.observeStateRefs`).map((entry, index) =>
        expectId(entry, `${path}.observationPlan.observeStateRefs[${index}]`, createStateNodeRef),
      ),
    },
    provenance: uniqueSorted(expectStringArray(event.provenance ?? [], `${path}.provenance`)),
  };
}

function validateStateTransition(value: unknown, path: string): StateTransition {
  const transition = expectRecord(value, path);
  return {
    ref: expectId(transition.ref, `${path}.ref`, createTransitionRef),
    screen: expectId(transition.screen, `${path}.screen`, createScreenId),
    label: expectString(transition.label, `${path}.label`),
    aliases: uniqueSorted(expectStringArray(transition.aliases ?? [], `${path}.aliases`)),
    eventSignatureRef: expectId(transition.eventSignatureRef, `${path}.eventSignatureRef`, createEventSignatureRef),
    sourceStateRefs: expectArray(transition.sourceStateRefs ?? [], `${path}.sourceStateRefs`).map((entry, index) =>
      expectId(entry, `${path}.sourceStateRefs[${index}]`, createStateNodeRef),
    ),
    targetStateRefs: expectArray(transition.targetStateRefs ?? [], `${path}.targetStateRefs`).map((entry, index) =>
      expectId(entry, `${path}.targetStateRefs[${index}]`, createStateNodeRef),
    ),
    effectKind: expectEnum(transition.effectKind, `${path}.effectKind`, transitionEffectKinds),
    observableEffects: uniqueSorted(expectStringArray(transition.observableEffects ?? [], `${path}.observableEffects`)),
    provenance: uniqueSorted(expectStringArray(transition.provenance ?? [], `${path}.provenance`)),
  };
}

function assertBehaviorTopology(input: {
  stateNodes: readonly StateNode[];
  eventSignatures: readonly EventSignature[];
  transitions: readonly StateTransition[];
  path: string;
}): void {
  const stateRefs = new Set(input.stateNodes.map((state) => state.ref));
  const eventRefs = new Set(input.eventSignatures.map((event) => event.ref));
  const transitionByRef = new Map(input.transitions.map((transition) => [transition.ref, transition] as const));

  for (const [index, state] of input.stateNodes.entries()) {
    if (state.predicates.length === 0) {
      throw new SchemaError('expected at least one observation predicate', `${input.path}.stateNodes[${index}].predicates`);
    }
  }

  for (const [index, event] of input.eventSignatures.entries()) {
    if (event.effects.transitionRefs.length === 0) {
      throw new SchemaError('expected at least one transition ref', `${input.path}.eventSignatures[${index}].effects.transitionRefs`);
    }
    if (event.effects.resultStateRefs.length === 0) {
      throw new SchemaError('expected at least one result state ref', `${input.path}.eventSignatures[${index}].effects.resultStateRefs`);
    }
    if (event.effects.assertions.length === 0) {
      throw new SchemaError('expected at least one assertion', `${input.path}.eventSignatures[${index}].effects.assertions`);
    }
    if (event.observationPlan.observeStateRefs.length === 0) {
      throw new SchemaError('expected at least one observed state ref', `${input.path}.eventSignatures[${index}].observationPlan.observeStateRefs`);
    }
    for (const [transitionIndex, transitionRef] of event.effects.transitionRefs.entries()) {
      if (!transitionByRef.has(transitionRef)) {
        throw new SchemaError('references unknown transition', `${input.path}.eventSignatures[${index}].effects.transitionRefs[${transitionIndex}]`);
      }
    }
    for (const [stateIndex, stateRef] of [...event.requiredStateRefs, ...event.forbiddenStateRefs, ...event.effects.resultStateRefs, ...event.observationPlan.observeStateRefs].entries()) {
      if (!stateRefs.has(stateRef)) {
        throw new SchemaError('references unknown state', `${input.path}.eventSignatures[${index}].stateRefs[${stateIndex}]`);
      }
    }

    const expectedResultStateRefs = uniqueSorted(event.effects.transitionRefs.flatMap((transitionRef) => transitionByRef.get(transitionRef)?.targetStateRefs ?? []));
    if (expectedResultStateRefs.join('|') !== uniqueSorted(event.effects.resultStateRefs).join('|')) {
      throw new SchemaError('effect resultStateRefs must equal the union of referenced transition target states', `${input.path}.eventSignatures[${index}].effects.resultStateRefs`);
    }
  }

  for (const [index, transition] of input.transitions.entries()) {
    if (!eventRefs.has(transition.eventSignatureRef)) {
      throw new SchemaError('references unknown event signature', `${input.path}.transitions[${index}].eventSignatureRef`);
    }
    if (transition.targetStateRefs.length === 0) {
      throw new SchemaError('expected at least one target state ref', `${input.path}.transitions[${index}].targetStateRefs`);
    }
    for (const [stateIndex, stateRef] of [...transition.sourceStateRefs, ...transition.targetStateRefs].entries()) {
      if (!stateRefs.has(stateRef)) {
        throw new SchemaError('references unknown state', `${input.path}.transitions[${index}].stateRefs[${stateIndex}]`);
      }
    }
  }
}

export function validateScreenBehavior(value: unknown): ScreenBehavior {
  const validated = schemaDecode.decoderFor<ScreenBehavior>(schemas.ScreenBehaviorSchema)(value);
  assertBehaviorTopology({ ...validated, path: 'screen-behavior' });
  return validated;
}

export function validateBehaviorPatternDocument(value: unknown): BehaviorPatternDocument {
  const validated = schemaDecode.decoderFor<BehaviorPatternDocument>(schemas.BehaviorPatternDocumentSchema)(value);
  assertBehaviorTopology({ ...validated, path: 'behavior-pattern' });
  return validated;
}

export const validateManifest: (value: unknown) => Manifest =
  schemaDecode.decoderFor<Manifest>(schemas.ManifestSchema);

function validateGraphNode(value: unknown, path: string) {
  const node = expectRecord(value, path);
  const provenance = node.provenance ? expectRecord(node.provenance, `${path}.provenance`) : {};
  return {
    id: expectString(node.id, `${path}.id`),
    kind: expectEnum(node.kind, `${path}.kind`, graphNodeKinds),
    label: expectString(node.label, `${path}.label`),
    fingerprint: expectString(node.fingerprint, `${path}.fingerprint`),
    artifactPath: expectOptionalString(node.artifactPath, `${path}.artifactPath`) ?? undefined,
    provenance: {
      sourceRevision: provenance.sourceRevision === undefined ? undefined : expectNumber(provenance.sourceRevision, `${path}.provenance.sourceRevision`),
      contentHash: provenance.contentHash === undefined ? undefined : expectString(provenance.contentHash, `${path}.provenance.contentHash`),
      scenarioPath: provenance.scenarioPath === undefined ? undefined : expectString(provenance.scenarioPath, `${path}.provenance.scenarioPath`),
      snapshotPath: provenance.snapshotPath === undefined ? undefined : expectString(provenance.snapshotPath, `${path}.provenance.snapshotPath`),
      knowledgePath: provenance.knowledgePath === undefined ? undefined : expectString(provenance.knowledgePath, `${path}.provenance.knowledgePath`),
      confidence:
        provenance.confidence === undefined
          ? undefined
          : (expectEnum(provenance.confidence, `${path}.provenance.confidence`, diagnosticConfidences) as Confidence | 'mixed'),
    },
    payload: node.payload === undefined ? undefined : expectRecord(node.payload, `${path}.payload`),
  };
}

function validateGraphEdge(value: unknown, path: string) {
  const edge = expectRecord(value, path);
  const provenance = edge.provenance ? expectRecord(edge.provenance, `${path}.provenance`) : {};
  return {
    id: expectString(edge.id, `${path}.id`),
    kind: expectEnum(edge.kind, `${path}.kind`, graphEdgeKinds),
    from: expectString(edge.from, `${path}.from`),
    to: expectString(edge.to, `${path}.to`),
    fingerprint: expectString(edge.fingerprint, `${path}.fingerprint`),
    provenance: {
      sourceRevision: provenance.sourceRevision === undefined ? undefined : expectNumber(provenance.sourceRevision, `${path}.provenance.sourceRevision`),
      contentHash: provenance.contentHash === undefined ? undefined : expectString(provenance.contentHash, `${path}.provenance.contentHash`),
      scenarioPath: provenance.scenarioPath === undefined ? undefined : expectString(provenance.scenarioPath, `${path}.provenance.scenarioPath`),
      snapshotPath: provenance.snapshotPath === undefined ? undefined : expectString(provenance.snapshotPath, `${path}.provenance.snapshotPath`),
      knowledgePath: provenance.knowledgePath === undefined ? undefined : expectString(provenance.knowledgePath, `${path}.provenance.knowledgePath`),
      confidence:
        provenance.confidence === undefined
          ? undefined
          : (expectEnum(provenance.confidence, `${path}.provenance.confidence`, diagnosticConfidences) as Confidence | 'mixed'),
    },
    payload: edge.payload === undefined ? undefined : expectRecord(edge.payload, `${path}.payload`),
  };
}

export const validateDerivedGraph: (value: unknown) => DerivedGraph =
  schemaDecode.decoderFor<DerivedGraph>(schemas.DerivedGraphSchema);


function validateTrustPolicyArtifactType(value: unknown, path: string): TrustPolicyArtifactType {
  return expectEnum(value, path, ['elements', 'postures', 'surface', 'snapshot', 'hints', 'patterns'] as const);
}

function validateTrustPolicyEvaluationReason(value: unknown, path: string): TrustPolicyEvaluationReason {
  const record = expectRecord(value, path);
  return {
    code: expectEnum(record.code, `${path}.code`, ['minimum-confidence', 'required-evidence', 'forbidden-auto-heal'] as const),
    message: expectString(record.message, `${path}.message`),
  };
}

export const validateTrustPolicy: (value: unknown) => TrustPolicy =
  schemaDecode.decoderFor<TrustPolicy>(schemas.TrustPolicySchema);

export const validateTrustPolicyEvaluation: (value: unknown) => TrustPolicyEvaluation =
  schemaDecode.decoderFor<TrustPolicyEvaluation>(schemas.TrustPolicyEvaluationSchema);

export const validateOperatorInboxItem: (value: unknown) => OperatorInboxItem =
  schemaDecode.decoderFor<OperatorInboxItem>(schemas.OperatorInboxItemSchema);

export const validateApprovalReceipt: (value: unknown) => ApprovalReceipt =
  schemaDecode.decoderFor<ApprovalReceipt>(schemas.ApprovalReceiptSchema);

export const validateRerunPlan: (value: unknown) => RerunPlan =
  schemaDecode.decoderFor<RerunPlan>(schemas.RerunPlanSchema);

export const validateConfidenceOverlayCatalog: (value: unknown) => ConfidenceOverlayCatalog =
  schemaDecode.decoderFor<ConfidenceOverlayCatalog>(schemas.ConfidenceOverlayCatalogSchema);

export function validateBenchmarkContext(value: unknown): BenchmarkContext {
  const benchmark = expectRecord(value, 'benchmarkContext');
  return {
    kind: expectEnum(benchmark.kind, 'benchmarkContext.kind', ['benchmark-context'] as const),
    version: expectNumber(benchmark.version, 'benchmarkContext.version') as 1,
    name: expectString(benchmark.name, 'benchmarkContext.name'),
    suite: ensureSafeRelativePathLike(expectString(benchmark.suite, 'benchmarkContext.suite'), 'benchmarkContext.suite'),
    appRoute: expectString(benchmark.appRoute, 'benchmarkContext.appRoute'),
    fieldCatalog: expectArray(benchmark.fieldCatalog ?? [], 'benchmarkContext.fieldCatalog').map((entry, index) => {
      const field = expectRecord(entry, `benchmarkContext.fieldCatalog[${index}]`);
      return {
        id: expectString(field.id, `benchmarkContext.fieldCatalog[${index}].id`),
        screen: expectString(field.screen, `benchmarkContext.fieldCatalog[${index}].screen`),
        element: expectString(field.element, `benchmarkContext.fieldCatalog[${index}].element`),
        label: expectString(field.label, `benchmarkContext.fieldCatalog[${index}].label`),
        category: expectString(field.category, `benchmarkContext.fieldCatalog[${index}].category`),
        required: expectBoolean(field.required, `benchmarkContext.fieldCatalog[${index}].required`),
        postures: expectStringArray(field.postures ?? [], `benchmarkContext.fieldCatalog[${index}].postures`),
      };
    }),
    flows: expectArray(benchmark.flows ?? [], 'benchmarkContext.flows').map((entry, index) => {
      const flow = expectRecord(entry, `benchmarkContext.flows[${index}]`);
      return {
        id: expectString(flow.id, `benchmarkContext.flows[${index}].id`),
        title: expectString(flow.title, `benchmarkContext.flows[${index}].title`),
        route: expectString(flow.route, `benchmarkContext.flows[${index}].route`),
        screens: expectStringArray(flow.screens ?? [], `benchmarkContext.flows[${index}].screens`),
        fieldIds: expectStringArray(flow.fieldIds ?? [], `benchmarkContext.flows[${index}].fieldIds`),
      };
    }),
    driftEvents: expectArray(benchmark.driftEvents ?? [], 'benchmarkContext.driftEvents').map((entry, index) => {
      const event = expectRecord(entry, `benchmarkContext.driftEvents[${index}]`);
      return {
        id: expectString(event.id, `benchmarkContext.driftEvents[${index}].id`),
        kind: expectEnum(event.kind, `benchmarkContext.driftEvents[${index}].kind`, ['label-change', 'locator-degradation', 'widget-swap', 'validation-copy-change', 'section-structure-drift'] as const),
        screen: expectString(event.screen, `benchmarkContext.driftEvents[${index}].screen`),
        fieldId: expectOptionalString(event.fieldId, `benchmarkContext.driftEvents[${index}].fieldId`) ?? null,
        severity: expectEnum(event.severity, `benchmarkContext.driftEvents[${index}].severity`, ['low', 'medium', 'high'] as const),
        description: expectString(event.description, `benchmarkContext.driftEvents[${index}].description`),
      };
    }),
    fieldAwarenessThresholds: (() => {
      const thresholds = expectRecord(benchmark.fieldAwarenessThresholds ?? {}, 'benchmarkContext.fieldAwarenessThresholds');
      return {
        minFieldAwarenessCount: expectNumber(thresholds.minFieldAwarenessCount, 'benchmarkContext.fieldAwarenessThresholds.minFieldAwarenessCount'),
        minFirstPassScreenResolutionRate: expectNumber(thresholds.minFirstPassScreenResolutionRate, 'benchmarkContext.fieldAwarenessThresholds.minFirstPassScreenResolutionRate'),
        minFirstPassElementResolutionRate: expectNumber(thresholds.minFirstPassElementResolutionRate, 'benchmarkContext.fieldAwarenessThresholds.minFirstPassElementResolutionRate'),
        maxDegradedLocatorRate: expectNumber(thresholds.maxDegradedLocatorRate, 'benchmarkContext.fieldAwarenessThresholds.maxDegradedLocatorRate'),
      };
    })(),
    benchmarkRunbooks: expectArray(benchmark.benchmarkRunbooks ?? [], 'benchmarkContext.benchmarkRunbooks').map((entry, index) => {
      const runbook = expectRecord(entry, `benchmarkContext.benchmarkRunbooks[${index}]`);
      return {
        name: expectString(runbook.name, `benchmarkContext.benchmarkRunbooks[${index}].name`),
        runbook: expectString(runbook.runbook, `benchmarkContext.benchmarkRunbooks[${index}].runbook`),
        tag: expectOptionalString(runbook.tag, `benchmarkContext.benchmarkRunbooks[${index}].tag`) ?? null,
      };
    }),
    expansionRules: expectArray(benchmark.expansionRules ?? [], 'benchmarkContext.expansionRules').map((entry, index) => {
      const rule = expectRecord(entry, `benchmarkContext.expansionRules[${index}]`);
      return {
        fieldIds: expectStringArray(rule.fieldIds ?? [], `benchmarkContext.expansionRules[${index}].fieldIds`),
        postures: expectStringArray(rule.postures ?? [], `benchmarkContext.expansionRules[${index}].postures`),
        variantsPerField: expectNumber(rule.variantsPerField, `benchmarkContext.expansionRules[${index}].variantsPerField`),
      };
    }),
  };
}

export function validateResolutionGraphRecord(value: unknown): ResolutionGraphRecord {
  const record = expectRecord(value, 'resolutionGraphRecord');
  const header = validateWorkflowEnvelopeHeader(record, 'resolutionGraphRecord', {
    stage: 'resolution',
    scope: 'run',
    governance: expectEnum(record.governance ?? 'approved', 'resolutionGraphRecord.governance', governanceStates),
    artifactFingerprint: expectOptionalString(record.runId, 'resolutionGraphRecord.runId') ?? 'resolution-graph-record',
    ids: { runId: expectOptionalString(record.runId, 'resolutionGraphRecord.runId') ?? null, stepIndex: null },
    lineage: { sources: [], parents: [], handshakes: ['preparation', 'resolution'] },
  });
  const steps = expectArray(record.steps, 'resolutionGraphRecord.steps').map((entry, index) => {
    const step = expectRecord(entry, `resolutionGraphRecord.steps[${index}]`);
    return {
      stepIndex: expectNumber(step.stepIndex, `resolutionGraphRecord.steps[${index}].stepIndex`),
      graph: step.graph as StepResolutionGraph,
    };
  });
  return {
    ...header,
    kind: expectEnum(record.kind, 'resolutionGraphRecord.kind', ['resolution-graph-record'] as const),
    version: expectNumber(record.version, 'resolutionGraphRecord.version') as 1,
    stage: 'resolution',
    scope: 'run',
    governance: expectEnum(record.governance ?? 'approved', 'resolutionGraphRecord.governance', governanceStates),
    adoId: expectString(record.adoId, 'resolutionGraphRecord.adoId') as ResolutionGraphRecord['adoId'],
    runId: expectString(record.runId, 'resolutionGraphRecord.runId'),
    providerId: expectString(record.providerId, 'resolutionGraphRecord.providerId'),
    mode: expectString(record.mode, 'resolutionGraphRecord.mode'),
    generatedAt: expectString(record.generatedAt, 'resolutionGraphRecord.generatedAt'),
    steps,
  };
}

export function validateInterpretationDriftRecord(value: unknown): InterpretationDriftRecord {
  const record = expectRecord(value, 'interpretationDriftRecord');
  const steps = expectArray(record.steps ?? [], 'interpretationDriftRecord.steps').map((entry, index) => {
    const step = expectRecord(entry, `interpretationDriftRecord.steps[${index}]`);
    const changes = expectArray(step.changes ?? [], `interpretationDriftRecord.steps[${index}].changes`).map((changeEntry, changeIndex) => {
      const change = expectRecord(changeEntry, `interpretationDriftRecord.steps[${index}].changes[${changeIndex}]`);
      return {
        field: expectEnum(change.field, `interpretationDriftRecord.steps[${index}].changes[${changeIndex}].field`, ['winningSource', 'target', 'governance', 'confidence', 'exhaustion-path', 'resolution-graph'] as const),
        before: change.before,
        after: change.after,
      };
    });
    const before = expectRecord(step.before ?? {}, `interpretationDriftRecord.steps[${index}].before`);
    const after = expectRecord(step.after ?? {}, `interpretationDriftRecord.steps[${index}].after`);
    return {
      stepIndex: expectNumber(step.stepIndex, `interpretationDriftRecord.steps[${index}].stepIndex`),
      changed: expectBoolean(step.changed, `interpretationDriftRecord.steps[${index}].changed`),
      changes,
      before: {
        winningSource: expectString(before.winningSource ?? 'none', `interpretationDriftRecord.steps[${index}].before.winningSource`),
        target: expectString(before.target ?? 'none', `interpretationDriftRecord.steps[${index}].before.target`),
        governance: expectEnum(before.governance ?? 'approved', `interpretationDriftRecord.steps[${index}].before.governance`, governanceStates),
        confidence: expectString(before.confidence ?? 'unbound', `interpretationDriftRecord.steps[${index}].before.confidence`),
        exhaustionPath: expectStringArray(before.exhaustionPath ?? [], `interpretationDriftRecord.steps[${index}].before.exhaustionPath`),
        resolutionGraphDigest: expectString(before.resolutionGraphDigest ?? 'none', `interpretationDriftRecord.steps[${index}].before.resolutionGraphDigest`),
      },
      after: {
        winningSource: expectString(after.winningSource ?? 'none', `interpretationDriftRecord.steps[${index}].after.winningSource`),
        target: expectString(after.target ?? 'none', `interpretationDriftRecord.steps[${index}].after.target`),
        governance: expectEnum(after.governance ?? 'approved', `interpretationDriftRecord.steps[${index}].after.governance`, governanceStates),
        confidence: expectString(after.confidence ?? 'unbound', `interpretationDriftRecord.steps[${index}].after.confidence`),
        exhaustionPath: expectStringArray(after.exhaustionPath ?? [], `interpretationDriftRecord.steps[${index}].after.exhaustionPath`),
        resolutionGraphDigest: expectString(after.resolutionGraphDigest ?? 'none', `interpretationDriftRecord.steps[${index}].after.resolutionGraphDigest`),
      },
      resolutionGraphDrift: {
        traversalPathChanged: expectBoolean(expectRecord(step.resolutionGraphDrift ?? {}, `interpretationDriftRecord.steps[${index}].resolutionGraphDrift`).traversalPathChanged ?? false, `interpretationDriftRecord.steps[${index}].resolutionGraphDrift.traversalPathChanged`),
        winnerRungChanged: expectBoolean(expectRecord(step.resolutionGraphDrift ?? {}, `interpretationDriftRecord.steps[${index}].resolutionGraphDrift`).winnerRungChanged ?? false, `interpretationDriftRecord.steps[${index}].resolutionGraphDrift.winnerRungChanged`),
        winnerRationaleChanged: expectBoolean(expectRecord(step.resolutionGraphDrift ?? {}, `interpretationDriftRecord.steps[${index}].resolutionGraphDrift`).winnerRationaleChanged ?? false, `interpretationDriftRecord.steps[${index}].resolutionGraphDrift.winnerRationaleChanged`),
      },
    };
  });
  const header = validateWorkflowEnvelopeHeader(record, 'interpretationDriftRecord', {
    stage: 'resolution',
    scope: 'run',
    governance: expectEnum(record.governance ?? 'approved', 'interpretationDriftRecord.governance', governanceStates),
    artifactFingerprint: expectOptionalString(record.runId, 'interpretationDriftRecord.runId') ?? 'interpretation-drift-record',
    ids: {
      adoId: expectOptionalId(record.adoId, 'interpretationDriftRecord.adoId', createAdoId) ?? null,
      runId: expectOptionalString(record.runId, 'interpretationDriftRecord.runId') ?? null,
      suite: null,
    },
    lineage: {
      sources: expectStringArray(expectRecord(record.lineage ?? {}, 'interpretationDriftRecord.lineage').sources ?? [], 'interpretationDriftRecord.lineage.sources'),
      parents: expectStringArray(expectRecord(record.lineage ?? {}, 'interpretationDriftRecord.lineage').parents ?? [], 'interpretationDriftRecord.lineage.parents'),
      handshakes: ['preparation', 'resolution'],
    },
  });
  const provenance = expectRecord(record.provenance ?? {}, 'interpretationDriftRecord.provenance');
  return {
    kind: expectEnum(record.kind, 'interpretationDriftRecord.kind', ['interpretation-drift-record'] as const),
    ...header,
    adoId: expectId(record.adoId, 'interpretationDriftRecord.adoId', createAdoId),
    runId: expectString(record.runId, 'interpretationDriftRecord.runId'),
    comparedRunId: expectOptionalString(record.comparedRunId, 'interpretationDriftRecord.comparedRunId') ?? null,
    providerId: expectString(record.providerId, 'interpretationDriftRecord.providerId'),
    mode: expectString(record.mode, 'interpretationDriftRecord.mode'),
    comparedAt: expectString(record.comparedAt, 'interpretationDriftRecord.comparedAt'),
    changedStepCount: expectNumber(record.changedStepCount, 'interpretationDriftRecord.changedStepCount'),
    unchangedStepCount: expectNumber(record.unchangedStepCount, 'interpretationDriftRecord.unchangedStepCount'),
    totalStepCount: expectNumber(record.totalStepCount, 'interpretationDriftRecord.totalStepCount'),
    hasDrift: expectBoolean(record.hasDrift, 'interpretationDriftRecord.hasDrift'),
    provenance: {
      taskFingerprint: expectString(provenance.taskFingerprint, 'interpretationDriftRecord.provenance.taskFingerprint'),
      knowledgeFingerprint: expectString(provenance.knowledgeFingerprint, 'interpretationDriftRecord.provenance.knowledgeFingerprint'),
      controlsFingerprint: expectOptionalString(provenance.controlsFingerprint, 'interpretationDriftRecord.provenance.controlsFingerprint') ?? null,
      comparedTaskFingerprint: expectOptionalString(provenance.comparedTaskFingerprint, 'interpretationDriftRecord.provenance.comparedTaskFingerprint') ?? null,
      comparedKnowledgeFingerprint: expectOptionalString(provenance.comparedKnowledgeFingerprint, 'interpretationDriftRecord.provenance.comparedKnowledgeFingerprint') ?? null,
      comparedControlsFingerprint: expectOptionalString(provenance.comparedControlsFingerprint, 'interpretationDriftRecord.provenance.comparedControlsFingerprint') ?? null,
    },
    explainableByFingerprintDelta: expectBoolean(record.explainableByFingerprintDelta, 'interpretationDriftRecord.explainableByFingerprintDelta'),
    steps,
  };
}

export const validateBenchmarkScorecard: (value: unknown) => BenchmarkScorecard =
  schemaDecode.decoderFor<BenchmarkScorecard>(schemas.BenchmarkScorecardSchema);

export const validateBenchmarkImprovementProjection: (value: unknown) => BenchmarkImprovementProjection =
  schemaDecode.decoderFor<BenchmarkImprovementProjection>(schemas.BenchmarkImprovementProjectionSchema);

export const validateDogfoodRun: (value: unknown) => DogfoodRun =
  schemaDecode.decoderFor<DogfoodRun>(schemas.DogfoodRunSchema);
