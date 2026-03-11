import type {
  ApprovalReceipt,
  AssertionKind,
  BenchmarkContext,
  BenchmarkScorecard,
  BoundScenario,
  BoundStep,
  CompilerDiagnostic,
  Confidence,
  DatasetControl,
  DerivedGraph,
  EffectTargetKind,
  ElementSig,
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
  RerunPlan,
  RunRecord,
  RunbookControl,
  Scenario,
  ScenarioMetadata,
  ScenarioTaskPacket,
  ScenarioPostcondition,
  ScenarioPrecondition,
  ScenarioSource,
  ScenarioStep,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SharedPatterns,
  StepAction,
  StepBindingKind,
  StepExecutionReceipt,
  StepInstruction,
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
import { computeAdoContentHash } from '../hash';
import { validatePatternDocument as validatePatternDocumentRecord } from '../knowledge/patterns';
import { normalizeScreenPostures } from '../posture-contract';
import { SchemaError } from '../errors';
import { uniqueSorted } from '../collections';
import {
  createAdoId,
  createElementId,
  createFixtureId,
  createPostureId,
  createScreenId,
  createSectionId,
  createSnapshotTemplateId,
  createSurfaceId,
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
const executionProfiles = ['interactive', 'ci-batch'] as const;
const resolutionModes = ['deterministic', 'translation', 'agentic'] as const;
const valueRefKinds = ['literal', 'fixture-path', 'posture-sample', 'parameter-row', 'generated-token'] as const;
const stepInstructionKinds = ['navigate', 'enter', 'invoke', 'observe-structure', 'custom-escape-hatch'] as const;
const surfaceKinds = ['screen-root', 'form', 'action-cluster', 'validation-region', 'result-set', 'details-pane', 'modal', 'section-root'] as const;
const assertionKinds = ['state', 'structure'] as const;
const effectTargetKinds = ['self', 'element', 'surface'] as const;
const governanceStates = ['approved', 'review-required', 'blocked'] as const;
const locatorStrategyKinds = ['test-id', 'role-name', 'css'] as const;
const effectStates = ['validation-error', 'required-error', 'disabled', 'enabled', 'visible', 'hidden'] as const;
const widgetActions = ['click', 'fill', 'clear', 'get-value'] as const;
const widgetPreconditions = ['visible', 'enabled', 'editable'] as const;
const widgetEffectCategories = ['mutation', 'observation', 'focus', 'navigation'] as const;
const graphNodeKinds = ['snapshot', 'screen', 'screen-hints', 'pattern', 'confidence-overlay', 'dataset', 'resolution-control', 'runbook', 'section', 'surface', 'element', 'posture', 'capability', 'scenario', 'step', 'generated-spec', 'generated-trace', 'generated-review', 'evidence', 'policy-decision'] as const;
const graphEdgeKinds = ['derived-from', 'contains', 'references', 'uses', 'learns-from', 'affects', 'asserts', 'emits', 'observed-by', 'proposed-change-for', 'governs'] as const;
const diagnosticSeverities = ['info', 'warn', 'error'] as const;
const diagnosticConfidences = ['human', 'agent-verified', 'agent-proposed', 'compiler-derived', 'intent-only', 'unbound', 'mixed'] as const;
const workflowStages = ['preparation', 'resolution', 'execution', 'evidence', 'proposal', 'projection'] as const;
const workflowScopes = ['scenario', 'step', 'run', 'suite', 'workspace', 'control'] as const;
const workflowLanes = ['intent', 'knowledge', 'control', 'resolution', 'execution', 'governance', 'projection'] as const;
const stepWinningSources = ['scenario-explicit', 'resolution-control', 'runbook-dataset', 'default-dataset', 'knowledge-hint', 'posture-sample', 'generated-token', 'approved-knowledge', 'approved-equivalent', 'prior-evidence', 'structured-translation', 'live-dom', 'none'] as const;

function validateWorkflowEnvelopeIds(value: unknown, path: string): WorkflowEnvelopeIds {
  const ids = expectRecord(value ?? {}, path);
  return {
    adoId: expectOptionalId(ids.adoId, `${path}.adoId`, createAdoId) ?? null,
    suite: expectOptionalString(ids.suite, `${path}.suite`) ?? null,
    runId: expectOptionalString(ids.runId, `${path}.runId`) ?? null,
    stepIndex: ids.stepIndex === undefined || ids.stepIndex === null ? null : expectNumber(ids.stepIndex, `${path}.stepIndex`),
    dataset: expectOptionalString(ids.dataset, `${path}.dataset`) ?? null,
    runbook: expectOptionalString(ids.runbook, `${path}.runbook`) ?? null,
    resolutionControl: expectOptionalString(ids.resolutionControl, `${path}.resolutionControl`) ?? null,
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
  const contract = expectRecord(value, path);
  const supportedActions = uniqueSorted(
    expectArray(contract.supportedActions ?? [], `${path}.supportedActions`).map((entry, index) =>
      expectEnum(entry, `${path}.supportedActions[${index}]`, widgetActions),
    ),
  );
  const requiredPreconditions = uniqueSorted(
    expectArray(contract.requiredPreconditions ?? [], `${path}.requiredPreconditions`).map((entry, index) =>
      expectEnum(entry, `${path}.requiredPreconditions[${index}]`, widgetPreconditions),
    ),
  );
  const rawSideEffects = expectRecord(contract.sideEffects ?? {}, `${path}.sideEffects`);
  const sideEffects = Object.fromEntries(
    Object.entries(rawSideEffects).map(([action, semantics]) => {
      const validatedAction = expectEnum(action, `${path}.sideEffects.${action}`, widgetActions);
      if (!supportedActions.includes(validatedAction)) {
        throw new SchemaError(`sideEffects references unsupported action ${validatedAction}`, `${path}.sideEffects.${action}`);
      }
      const entry = expectRecord(semantics, `${path}.sideEffects.${action}`);
      return [
        validatedAction,
        {
          expectedStates: uniqueSorted(
            expectArray(entry.expectedStates ?? [], `${path}.sideEffects.${action}.expectedStates`).map((state, index) =>
              expectEnum(state, `${path}.sideEffects.${action}.expectedStates[${index}]`, effectStates),
            ),
          ),
          effectCategories: uniqueSorted(
            expectArray(entry.effectCategories ?? [], `${path}.sideEffects.${action}.effectCategories`).map((category, index) =>
              expectEnum(category, `${path}.sideEffects.${action}.effectCategories[${index}]`, widgetEffectCategories),
            ),
          ),
        },
      ];
    }),
  );

  for (const action of supportedActions) {
    if (!sideEffects[action]) {
      throw new SchemaError(`missing side-effect semantics for action ${action}`, `${path}.sideEffects`);
    }
  }

  return {
    widget: expectId(contract.widget, `${path}.widget`, createWidgetId),
    supportedActions,
    requiredPreconditions,
    sideEffects,
  };
}

export function validateAdoSnapshot(value: unknown) {
  const snapshot = expectRecord(value, 'snapshot');
  const validated = {
    id: expectId(snapshot.id, 'snapshot.id', createAdoId),
    revision: expectNumber(snapshot.revision, 'snapshot.revision'),
    title: expectString(snapshot.title, 'snapshot.title'),
    suitePath: ensureSafeRelativePathLike(expectString(snapshot.suitePath, 'snapshot.suitePath'), 'snapshot.suitePath'),
    areaPath: expectString(snapshot.areaPath, 'snapshot.areaPath'),
    iterationPath: expectString(snapshot.iterationPath ?? '', 'snapshot.iterationPath'),
    tags: expectStringArray(snapshot.tags ?? [], 'snapshot.tags'),
    priority: expectNumber(snapshot.priority, 'snapshot.priority'),
    steps: expectArray(snapshot.steps, 'snapshot.steps').map((entry, index) => {
      const step = expectRecord(entry, `snapshot.steps[${index}]`);
      return {
        index: expectNumber(step.index, `snapshot.steps[${index}].index`),
        action: expectString(step.action, `snapshot.steps[${index}].action`),
        expected: expectString(step.expected, `snapshot.steps[${index}].expected`),
        sharedStepId: step.sharedStepId === undefined ? undefined : expectString(step.sharedStepId, `snapshot.steps[${index}].sharedStepId`),
      };
    }),
    parameters: expectArray(snapshot.parameters ?? [], 'snapshot.parameters').map((entry, index) => {
      const parameter = expectRecord(entry, `snapshot.parameters[${index}]`);
      return {
        name: expectString(parameter.name, `snapshot.parameters[${index}].name`),
        values: expectStringArray(parameter.values, `snapshot.parameters[${index}].values`),
      };
    }),
    dataRows: expectArray(snapshot.dataRows ?? [], 'snapshot.dataRows').map((entry, index) =>
      expectStringRecord(entry, `snapshot.dataRows[${index}]`),
    ),
    contentHash: expectString(snapshot.contentHash, 'snapshot.contentHash'),
    syncedAt: expectString(snapshot.syncedAt, 'snapshot.syncedAt'),
  };

  const computedHash = computeAdoContentHash(validated);
  if (validated.contentHash !== computedHash) {
    throw new SchemaError(`contentHash mismatch, expected ${computedHash}`, 'snapshot.contentHash');
  }

  return validated;
}

export function validateScenario(value: unknown): Scenario {
  const scenario = expectRecord(value, 'scenario');
  return {
    source: validateScenarioSource(scenario.source),
    metadata: validateScenarioMetadata(scenario.metadata),
    preconditions: expectArray(scenario.preconditions ?? [], 'preconditions').map((entry, index) =>
      validatePrecondition(entry, `preconditions[${index}]`),
    ),
    steps: expectArray(scenario.steps ?? [], 'steps').map((entry, index) => validateStepBase(entry, `steps[${index}]`)),
    postconditions: expectArray(scenario.postconditions ?? [], 'postconditions').map((entry, index) =>
      validatePostcondition(entry, `postconditions[${index}]`),
    ),
  };
}

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
    screenAliases: expectStringArray(candidate.screenAliases ?? [], `${path}.screenAliases`),
    knowledgeRefs: expectStringArray(candidate.knowledgeRefs ?? [], `${path}.knowledgeRefs`),
    supplementRefs: expectStringArray(candidate.supplementRefs ?? [], `${path}.supplementRefs`),
    elements: expectArray(candidate.elements ?? [], `${path}.elements`).map((entry, index) =>
      validateStepTaskElementCandidate(entry, `${path}.elements[${index}]`),
    ),
    sectionSnapshots: expectIdArray(candidate.sectionSnapshots ?? [], `${path}.sectionSnapshots`, createSnapshotTemplateId),
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

function validateRuntimeKnowledgeSession(value: unknown, path: string) {
  const session = expectRecord(value, path);
  return {
    knowledgeFingerprint: expectString(session.knowledgeFingerprint, `${path}.knowledgeFingerprint`),
    confidenceFingerprint: expectOptionalString(session.confidenceFingerprint, `${path}.confidenceFingerprint`) ?? null,
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
          };
        }),
      };
    })(),
  };
}

function validateStepTask(value: unknown, path: string) {
  const task = expectRecord(value, path);
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
    runtimeKnowledge: validateRuntimeKnowledgeSession(task.runtimeKnowledge, `${path}.runtimeKnowledge`),
    taskFingerprint: expectString(task.taskFingerprint, `${path}.taskFingerprint`),
  };
}

export function validateScenarioTaskPacket(value: unknown): ScenarioTaskPacket {
  const packet = expectRecord(value, 'scenarioTaskPacket');
  const header = validateWorkflowEnvelopeHeader(packet, 'scenarioTaskPacket', {
    stage: 'preparation',
    scope: 'scenario',
    governance: 'approved',
    artifactFingerprint: expectOptionalString(packet.taskFingerprint, 'scenarioTaskPacket.taskFingerprint') ?? 'scenario-task-packet',
    ids: {
      adoId: expectOptionalId(packet.adoId, 'scenarioTaskPacket.adoId', createAdoId) ?? null,
      suite: expectOptionalString(packet.suite, 'scenarioTaskPacket.suite') ?? null,
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
    payload: {
      adoId: expectId(packet.adoId, 'scenarioTaskPacket.adoId', createAdoId),
      revision: expectNumber(packet.revision, 'scenarioTaskPacket.revision'),
      title: expectString(packet.title, 'scenarioTaskPacket.title'),
      suite: ensureSafeRelativePathLike(expectString(packet.suite, 'scenarioTaskPacket.suite'), 'scenarioTaskPacket.suite'),
      knowledgeFingerprint: expectString(packet.knowledgeFingerprint, 'scenarioTaskPacket.knowledgeFingerprint'),
      steps: expectArray(packet.steps ?? [], 'scenarioTaskPacket.steps').map((entry, index) =>
        validateStepTask(entry, `scenarioTaskPacket.steps[${index}]`),
      ),
    },
    adoId: expectId(packet.adoId, 'scenarioTaskPacket.adoId', createAdoId),
    revision: expectNumber(packet.revision, 'scenarioTaskPacket.revision'),
    title: expectString(packet.title, 'scenarioTaskPacket.title'),
    suite: ensureSafeRelativePathLike(expectString(packet.suite, 'scenarioTaskPacket.suite'), 'scenarioTaskPacket.suite'),
    taskFingerprint: expectString(packet.taskFingerprint, 'scenarioTaskPacket.taskFingerprint'),
    knowledgeFingerprint: expectString(packet.knowledgeFingerprint, 'scenarioTaskPacket.knowledgeFingerprint'),
    steps: expectArray(packet.steps ?? [], 'scenarioTaskPacket.steps').map((entry, index) =>
      validateStepTask(entry, `scenarioTaskPacket.steps[${index}]`),
    ),
  };
}

function validateResolutionCandidateSummary(value: unknown, path: string) {
  const summary = expectRecord(value, path);
  return {
    concern: expectEnum(summary.concern, `${path}.concern`, ['action', 'screen', 'element', 'posture', 'snapshot'] as const),
    source: expectEnum(summary.source, `${path}.source`, ['explicit', 'control', 'approved-knowledge', 'overlay', 'translation', 'live-dom'] as const),
    value: expectString(summary.value, `${path}.value`),
    score: expectNumber(summary.score, `${path}.score`),
    reason: expectString(summary.reason, `${path}.reason`),
  };
}

function validateResolutionObservation(value: unknown, path: string) {
  const observation = expectRecord(value, path);
  return {
    source: expectEnum(observation.source, `${path}.source`, ['knowledge', 'evidence', 'overlay', 'translation', 'dom', 'runtime'] as const),
    summary: expectString(observation.summary, `${path}.summary`),
    detail: observation.detail === undefined ? undefined : expectStringRecord(observation.detail, `${path}.detail`),
    topCandidates: observation.topCandidates === undefined ? undefined : expectArray(observation.topCandidates, `${path}.topCandidates`).map((entry, index) => validateResolutionCandidateSummary(entry, `${path}.topCandidates[${index}]`)),
    rejectedCandidates: observation.rejectedCandidates === undefined ? undefined : expectArray(observation.rejectedCandidates, `${path}.rejectedCandidates`).map((entry, index) => validateResolutionCandidateSummary(entry, `${path}.rejectedCandidates[${index}]`)),
  };
}

function validateResolutionExhaustionEntry(value: unknown, path: string) {
  const entry = expectRecord(value, path);
  return {
    stage: expectEnum(entry.stage, `${path}.stage`, ['explicit', 'approved-screen-bundle', 'local-hints', 'shared-patterns', 'prior-evidence', 'confidence-overlay', 'structured-translation', 'live-dom', 'safe-degraded-resolution'] as const),
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
    };
  })();
  const header = validateWorkflowEnvelopeHeader(record, 'runRecord', {
    stage: 'execution',
    scope: 'run',
    governance: steps.some((step) => step.interpretation.kind === 'needs-human' || step.execution.execution.status === 'failed')
      ? 'blocked'
      : steps.some((step) => step.interpretation.kind === 'resolved-with-proposals')
        ? 'review-required'
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

export function validateSurfaceGraph(value: unknown): SurfaceGraph {
  const graph = expectRecord(value, 'surface-graph');
  const sections = expectRecord(graph.sections ?? {}, 'surface-graph.sections');
  const surfaces = expectRecord(graph.surfaces ?? {}, 'surface-graph.surfaces');
  return {
    screen: expectId(graph.screen, 'surface-graph.screen', createScreenId),
    url: expectString(graph.url, 'surface-graph.url'),
    sections: Object.fromEntries(
      Object.entries(sections).map(([key, entry]) => [key, validateSection(entry, `surface-graph.sections.${key}`)]),
    ),
    surfaces: Object.fromEntries(
      Object.entries(surfaces).map(([key, entry]) => [key, validateSurfaceDefinition(entry, `surface-graph.surfaces.${key}`)]),
    ),
  };
}

export function validateScreenElements(value: unknown): ScreenElements {
  const screen = expectRecord(value, 'screen-elements');
  const elements = expectRecord(screen.elements, 'screen-elements.elements');
  return {
    screen: expectId(screen.screen, 'screen-elements.screen', createScreenId),
    url: expectString(screen.url, 'screen-elements.url'),
    elements: Object.fromEntries(
      Object.entries(elements).map(([key, entry]) => [key, validateElement(entry, `screen-elements.elements.${key}`)]),
    ),
  };
}

export function validateScreenHints(value: unknown): ScreenHints {
  const hints = expectRecord(value, 'screen-hints');
  const elements = expectRecord(hints.elements ?? {}, 'screen-hints.elements');
  return {
    screen: expectId(hints.screen, 'screen-hints.screen', createScreenId),
    screenAliases: uniqueSorted(expectStringArray(hints.screenAliases ?? [], 'screen-hints.screenAliases')),
    elements: Object.fromEntries(
      Object.entries(elements).map(([elementId, entry]) => {
        const hint = expectRecord(entry, `screen-hints.elements.${elementId}`);
        return [
          elementId,
          {
            aliases: uniqueSorted(expectStringArray(hint.aliases ?? [], `screen-hints.elements.${elementId}.aliases`)),
            defaultValueRef: expectOptionalString(hint.defaultValueRef, `screen-hints.elements.${elementId}.defaultValueRef`) ?? null,
            parameter: expectOptionalString(hint.parameter, `screen-hints.elements.${elementId}.parameter`) ?? null,
            snapshotAliases: Object.fromEntries(
              Object.entries(expectRecord(hint.snapshotAliases ?? {}, `screen-hints.elements.${elementId}.snapshotAliases`)).map(([snapshotId, aliases]) => [
                ensureSafeRelativePathLike(snapshotId, `screen-hints.elements.${elementId}.snapshotAliases.${snapshotId}`),
                uniqueSorted(expectStringArray(aliases, `screen-hints.elements.${elementId}.snapshotAliases.${snapshotId}`)),
              ]),
            ),
            affordance: expectOptionalString(hint.affordance, `screen-hints.elements.${elementId}.affordance`) ?? null,
          },
        ];
      }),
    ),
  };
}

export function validateDatasetControl(value: unknown): DatasetControl {
  const dataset = expectRecord(value, 'dataset-control');
  const defaults = expectRecord(dataset.defaults ?? {}, 'dataset-control.defaults');
  return {
    kind: expectEnum(dataset.kind, 'dataset-control.kind', ['dataset-control'] as const),
    version: expectNumber(dataset.version, 'dataset-control.version') as 1,
    name: expectString(dataset.name, 'dataset-control.name'),
    default: dataset.default === undefined ? undefined : expectBoolean(dataset.default, 'dataset-control.default'),
    fixtures: expectRecord(dataset.fixtures ?? {}, 'dataset-control.fixtures'),
    defaults: {
      elements: Object.fromEntries(
        Object.entries(expectRecord(defaults.elements ?? {}, 'dataset-control.defaults.elements'))
          .map(([key, entry]) => [key, expectString(entry, `dataset-control.defaults.elements.${key}`)]),
      ),
      generatedTokens: Object.fromEntries(
        Object.entries(expectRecord(defaults.generatedTokens ?? {}, 'dataset-control.defaults.generatedTokens'))
          .map(([key, entry]) => [key, expectString(entry, `dataset-control.defaults.generatedTokens.${key}`)]),
      ),
    },
  };
}

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
  const control = expectRecord(value, 'resolution-control');
  const domPolicy = control.domExplorationPolicy === undefined
    ? undefined
    : expectRecord(control.domExplorationPolicy, 'resolution-control.domExplorationPolicy');
  return {
    kind: expectEnum(control.kind, 'resolution-control.kind', ['resolution-control'] as const),
    version: expectNumber(control.version, 'resolution-control.version') as 1,
    name: expectString(control.name, 'resolution-control.name'),
    selector: validateResolutionControlSelector(control.selector, 'resolution-control.selector'),
    domExplorationPolicy: domPolicy
      ? {
        maxCandidates: expectNumber(domPolicy.maxCandidates, 'resolution-control.domExplorationPolicy.maxCandidates'),
        maxProbes: expectNumber(domPolicy.maxProbes, 'resolution-control.domExplorationPolicy.maxProbes'),
        forbiddenActions: expectArray(
          domPolicy.forbiddenActions ?? [],
          'resolution-control.domExplorationPolicy.forbiddenActions',
        ).map((entry, index) =>
          expectEnum(entry, `resolution-control.domExplorationPolicy.forbiddenActions[${index}]`, ['navigate', 'input', 'click', 'assert-snapshot', 'custom'] as const),
        ),
      }
      : undefined,
    steps: expectArray(control.steps ?? [], 'resolution-control.steps').map((entry, index) => {
      const step = expectRecord(entry, `resolution-control.steps[${index}]`);
      return {
        stepIndex: expectNumber(step.stepIndex, `resolution-control.steps[${index}].stepIndex`),
        resolution: validateStepResolution(step.resolution, `resolution-control.steps[${index}].resolution`),
      };
    }),
  };
}

export function validateRunbookControl(value: unknown): RunbookControl {
  const runbook = expectRecord(value, 'runbook-control');
  return {
    kind: expectEnum(runbook.kind, 'runbook-control.kind', ['runbook-control'] as const),
    version: expectNumber(runbook.version, 'runbook-control.version') as 1,
    name: expectString(runbook.name, 'runbook-control.name'),
    default: runbook.default === undefined ? undefined : expectBoolean(runbook.default, 'runbook-control.default'),
    selector: validateResolutionControlSelector(runbook.selector, 'runbook-control.selector'),
    interpreterMode: runbook.interpreterMode === undefined || runbook.interpreterMode === null
      ? null
      : expectEnum(runbook.interpreterMode, 'runbook-control.interpreterMode', ['playwright', 'dry-run', 'diagnostic'] as const),
    dataset: expectOptionalString(runbook.dataset, 'runbook-control.dataset') ?? null,
    resolutionControl: expectOptionalString(runbook.resolutionControl, 'runbook-control.resolutionControl') ?? null,
    translationEnabled: runbook.translationEnabled === undefined ? undefined : expectBoolean(runbook.translationEnabled, 'runbook-control.translationEnabled'),
    translationCacheEnabled: runbook.translationCacheEnabled === undefined ? undefined : expectBoolean(runbook.translationCacheEnabled, 'runbook-control.translationCacheEnabled'),
    providerId: expectOptionalString(runbook.providerId, 'runbook-control.providerId') ?? null,
  };
}

export function validatePatternDocument(value: unknown): PatternDocument {
  return validatePatternDocumentRecord(value);
}

export function validateSharedPatterns(value: unknown): SharedPatterns {
  const patterns = expectRecord(value, 'shared-patterns');
  const actions = expectRecord(patterns.actions, 'shared-patterns.actions');
  const postures = expectRecord(patterns.postures ?? {}, 'shared-patterns.postures');
  const sources = expectRecord(patterns.sources, 'shared-patterns.sources');
  const actionSources = expectRecord(sources.actions, 'shared-patterns.sources.actions');
  const postureSources = expectRecord(sources.postures ?? {}, 'shared-patterns.sources.postures');
  const requiredActions = ['navigate', 'input', 'click', 'assert-snapshot'] as const;

  const validatedActions = Object.fromEntries(requiredActions.map((action) => {
    const record = expectRecord(actions[action], `shared-patterns.actions.${action}`);
    return [action, {
      id: expectString(record.id, `shared-patterns.actions.${action}.id`),
      aliases: uniqueSorted(expectStringArray(record.aliases ?? [], `shared-patterns.actions.${action}.aliases`)),
    }];
  })) as MergedPatterns['actions'];

  return {
    version: expectNumber(patterns.version, 'shared-patterns.version') as 1,
    actions: validatedActions,
    postures: Object.fromEntries(
      Object.entries(postures).map(([postureId, entry]) => {
        const record = expectRecord(entry, `shared-patterns.postures.${postureId}`);
        return [postureId, {
          id: expectString(record.id, `shared-patterns.postures.${postureId}.id`),
          aliases: uniqueSorted(expectStringArray(record.aliases ?? [], `shared-patterns.postures.${postureId}.aliases`)),
        }];
      }),
    ),
    documents: uniqueSorted(expectStringArray(patterns.documents ?? [], 'shared-patterns.documents')),
    sources: {
      actions: Object.fromEntries(requiredActions.map((action) => [
        action,
        expectString(actionSources[action], `shared-patterns.sources.actions.${action}`),
      ])) as MergedPatterns['sources']['actions'],
      postures: Object.fromEntries(
        Object.entries(postureSources).map(([postureId, sourcePath]) => [
          postureId,
          expectString(sourcePath, `shared-patterns.sources.postures.${postureId}`),
        ]),
      ),
    },
  };
}

export function validateScreenPostures(value: unknown): ScreenPostures {
  const screen = expectRecord(value, 'screen-postures');
  const postures = expectRecord(screen.postures ?? {}, 'screen-postures.postures');
  return normalizeScreenPostures({
    screen: expectId(screen.screen, 'screen-postures.screen', createScreenId),
    postures: Object.fromEntries(
      Object.entries(postures).map(([elementId, entry]) => {
        const postureSet = expectRecord(entry, `screen-postures.postures.${elementId}`);
        return [
          elementId,
          Object.fromEntries(
            Object.entries(postureSet).map(([postureId, postureValue]) => [
              postureId,
              validatePosture(postureValue, `screen-postures.postures.${elementId}.${postureId}`),
            ]),
          ),
        ];
      }),
    ),
  });
}

export function validateManifest(value: unknown): Manifest {
  const manifest = expectRecord(value, 'manifest');
  const entries = expectRecord(manifest.entries ?? {}, 'manifest.entries');
  return {
    entries: Object.fromEntries(
      Object.entries(entries).map(([adoId, entry]) => {
        const item = expectRecord(entry, `manifest.entries.${adoId}`);
        return [
          adoId,
          {
            adoId: expectId(item.adoId, `manifest.entries.${adoId}.adoId`, createAdoId),
            revision: expectNumber(item.revision, `manifest.entries.${adoId}.revision`),
            contentHash: expectString(item.contentHash, `manifest.entries.${adoId}.contentHash`),
            syncedAt: expectString(item.syncedAt, `manifest.entries.${adoId}.syncedAt`),
            sourcePath: expectString(item.sourcePath, `manifest.entries.${adoId}.sourcePath`),
          },
        ];
      }),
    ),
  };
}

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

export function validateDerivedGraph(value: unknown): DerivedGraph {
  const graph = expectRecord(value, 'derived-graph');
  return {
    version: expectEnum(graph.version, 'derived-graph.version', ['v1'] as const),
    fingerprint: expectString(graph.fingerprint, 'derived-graph.fingerprint'),
    nodes: expectArray(graph.nodes ?? [], 'derived-graph.nodes').map((entry, index) =>
      validateGraphNode(entry, `derived-graph.nodes[${index}]`),
    ),
    edges: expectArray(graph.edges ?? [], 'derived-graph.edges').map((entry, index) =>
      validateGraphEdge(entry, `derived-graph.edges[${index}]`),
    ),
    resources: expectArray(graph.resources ?? [], 'derived-graph.resources').map((entry, index) => {
      const resource = expectRecord(entry, `derived-graph.resources[${index}]`);
      return {
        uri: expectString(resource.uri, `derived-graph.resources[${index}].uri`),
        description: expectString(resource.description, `derived-graph.resources[${index}].description`),
      };
    }),
    resourceTemplates: expectArray(graph.resourceTemplates ?? [], 'derived-graph.resourceTemplates').map((entry, index) => {
      const template = expectRecord(entry, `derived-graph.resourceTemplates[${index}]`);
      return {
        uriTemplate: expectString(template.uriTemplate, `derived-graph.resourceTemplates[${index}].uriTemplate`),
        description: expectString(template.description, `derived-graph.resourceTemplates[${index}].description`),
      };
    }),
  };
}


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

export function validateTrustPolicy(value: unknown): TrustPolicy {
  const policy = expectRecord(value, 'trustPolicy');
  const artifactTypesRecord = expectRecord(policy.artifactTypes, 'trustPolicy.artifactTypes');
  const parsedEntries = Object.entries(artifactTypesRecord).map(([artifactType, ruleValue]) => {
    const typedArtifact = validateTrustPolicyArtifactType(artifactType, `trustPolicy.artifactTypes.${artifactType}`);
    const ruleRecord = expectRecord(ruleValue, `trustPolicy.artifactTypes.${artifactType}`);
    const evidenceRecord = expectRecord(ruleRecord.requiredEvidence, `trustPolicy.artifactTypes.${artifactType}.requiredEvidence`);
    return [typedArtifact, {
      minimumConfidence: expectNumber(ruleRecord.minimumConfidence, `trustPolicy.artifactTypes.${artifactType}.minimumConfidence`),
      requiredEvidence: {
        minCount: expectNumber(evidenceRecord.minCount, `trustPolicy.artifactTypes.${artifactType}.requiredEvidence.minCount`),
        kinds: expectStringArray(evidenceRecord.kinds, `trustPolicy.artifactTypes.${artifactType}.requiredEvidence.kinds`),
      },
    }] as const;
  });

  const artifactTypes = Object.fromEntries(parsedEntries) as TrustPolicy['artifactTypes'];

  for (const requiredType of ['elements', 'postures', 'surface', 'snapshot', 'hints', 'patterns'] as const) {
    if (!artifactTypes[requiredType]) {
      throw new SchemaError(`missing trust policy rule for ${requiredType}`, 'trustPolicy.artifactTypes');
    }
  }

  const version = expectNumber(policy.version, 'trustPolicy.version');
  if (version !== 1) {
    throw new SchemaError('expected version 1', 'trustPolicy.version');
  }

  return {
    version,
    artifactTypes,
    forbiddenAutoHealClasses: expectStringArray(policy.forbiddenAutoHealClasses ?? [], 'trustPolicy.forbiddenAutoHealClasses'),
  };
}

export function validateTrustPolicyEvaluation(value: unknown): TrustPolicyEvaluation {
  const record = expectRecord(value, 'trustPolicyEvaluation');
  return {
    decision: expectEnum(record.decision, 'trustPolicyEvaluation.decision', ['allow', 'review', 'deny'] as const),
    reasons: expectArray(record.reasons ?? [], 'trustPolicyEvaluation.reasons').map((entry, index) => validateTrustPolicyEvaluationReason(entry, `trustPolicyEvaluation.reasons[${index}]`)),
  };
}

export function validateOperatorInboxItem(value: unknown): OperatorInboxItem {
  const item = expectRecord(value, 'operatorInboxItem');
  return {
    id: expectString(item.id, 'operatorInboxItem.id'),
    kind: expectEnum(item.kind, 'operatorInboxItem.kind', ['proposal', 'degraded-locator', 'needs-human', 'blocked-policy', 'approved-equivalent'] as const),
    status: expectEnum(item.status, 'operatorInboxItem.status', ['actionable', 'approved', 'blocked', 'informational'] as const),
    title: expectString(item.title, 'operatorInboxItem.title'),
    summary: expectString(item.summary, 'operatorInboxItem.summary'),
    adoId: expectOptionalId(item.adoId, 'operatorInboxItem.adoId', createAdoId) ?? null,
    suite: expectOptionalString(item.suite, 'operatorInboxItem.suite') ?? null,
    runId: expectOptionalString(item.runId, 'operatorInboxItem.runId') ?? null,
    stepIndex: item.stepIndex === undefined || item.stepIndex === null ? null : expectNumber(item.stepIndex, 'operatorInboxItem.stepIndex'),
    proposalId: expectOptionalString(item.proposalId, 'operatorInboxItem.proposalId') ?? null,
    artifactPath: expectOptionalString(item.artifactPath, 'operatorInboxItem.artifactPath') ?? null,
    targetPath: expectOptionalString(item.targetPath, 'operatorInboxItem.targetPath') ?? null,
    winningConcern: item.winningConcern === undefined || item.winningConcern === null
      ? null
      : expectEnum(item.winningConcern, 'operatorInboxItem.winningConcern', ['intent', 'knowledge', 'control', 'resolution', 'execution', 'governance', 'projection'] as const),
    winningSource: item.winningSource === undefined || item.winningSource === null
      ? null
      : expectEnum(item.winningSource, 'operatorInboxItem.winningSource', [
        'scenario-explicit',
        'resolution-control',
        'runbook-dataset',
        'default-dataset',
        'knowledge-hint',
        'posture-sample',
        'generated-token',
        'approved-knowledge',
        'approved-equivalent',
        'prior-evidence',
        'structured-translation',
        'live-dom',
        'none',
      ] as const),
    resolutionMode: item.resolutionMode === undefined || item.resolutionMode === null
      ? null
      : expectEnum(item.resolutionMode, 'operatorInboxItem.resolutionMode', resolutionModes),
    nextCommands: expectStringArray(item.nextCommands ?? [], 'operatorInboxItem.nextCommands'),
  };
}

export function validateApprovalReceipt(value: unknown): ApprovalReceipt {
  const receipt = expectRecord(value, 'approvalReceipt');
  return {
    kind: expectEnum(receipt.kind, 'approvalReceipt.kind', ['approval-receipt'] as const),
    version: expectNumber(receipt.version, 'approvalReceipt.version') as 1,
    proposalId: expectString(receipt.proposalId, 'approvalReceipt.proposalId'),
    inboxItemId: expectString(receipt.inboxItemId, 'approvalReceipt.inboxItemId'),
    approvedAt: expectString(receipt.approvedAt, 'approvalReceipt.approvedAt'),
    artifactType: validateTrustPolicyArtifactType(receipt.artifactType, 'approvalReceipt.artifactType'),
    targetPath: expectString(receipt.targetPath, 'approvalReceipt.targetPath'),
    receiptPath: expectString(receipt.receiptPath, 'approvalReceipt.receiptPath'),
    rerunPlanId: expectString(receipt.rerunPlanId, 'approvalReceipt.rerunPlanId'),
  };
}

export function validateRerunPlan(value: unknown): RerunPlan {
  const plan = expectRecord(value, 'rerunPlan');
  return {
    kind: expectEnum(plan.kind, 'rerunPlan.kind', ['rerun-plan'] as const),
    version: expectNumber(plan.version, 'rerunPlan.version') as 1,
    planId: expectString(plan.planId, 'rerunPlan.planId'),
    createdAt: expectString(plan.createdAt, 'rerunPlan.createdAt'),
    reason: expectString(plan.reason, 'rerunPlan.reason'),
    sourceProposalId: expectOptionalString(plan.sourceProposalId, 'rerunPlan.sourceProposalId') ?? null,
    sourceNodeIds: expectStringArray(plan.sourceNodeIds ?? [], 'rerunPlan.sourceNodeIds'),
    impactedScenarioIds: expectIdArray(plan.impactedScenarioIds ?? [], 'rerunPlan.impactedScenarioIds', createAdoId),
    impactedRunbooks: expectStringArray(plan.impactedRunbooks ?? [], 'rerunPlan.impactedRunbooks'),
    impactedProjections: expectArray(plan.impactedProjections ?? [], 'rerunPlan.impactedProjections').map((entry, index) =>
      expectEnum(entry, `rerunPlan.impactedProjections[${index}]`, ['emit', 'graph', 'types', 'run'] as const),
    ),
    impactedConfidenceRecords: expectStringArray(plan.impactedConfidenceRecords ?? [], 'rerunPlan.impactedConfidenceRecords'),
    reasons: expectStringArray(plan.reasons ?? [], 'rerunPlan.reasons'),
    explanationFingerprint: expectString(plan.explanationFingerprint, 'rerunPlan.explanationFingerprint'),
    selection: (() => {
      const selection = expectRecord(plan.selection ?? {}, 'rerunPlan.selection');
      return {
        scenarios: expectArray(selection.scenarios ?? [], 'rerunPlan.selection.scenarios').map((entry, index) => {
          const scenario = expectRecord(entry, `rerunPlan.selection.scenarios[${index}]`);
          return {
            id: createAdoId(expectString(scenario.id, `rerunPlan.selection.scenarios[${index}].id`)),
            why: expectStringArray(scenario.why ?? [], `rerunPlan.selection.scenarios[${index}].why`),
            explanations: expectArray(scenario.explanations ?? [], `rerunPlan.selection.scenarios[${index}].explanations`).map((explanation, explanationIndex) => {
              const explanationRecord = expectRecord(explanation, `rerunPlan.selection.scenarios[${index}].explanations[${explanationIndex}]`);
              return {
                triggeringChange: expectString(explanationRecord.triggeringChange, `rerunPlan.selection.scenarios[${index}].explanations[${explanationIndex}].triggeringChange`),
                dependencyPath: expectStringArray(explanationRecord.dependencyPath ?? [], `rerunPlan.selection.scenarios[${index}].explanations[${explanationIndex}].dependencyPath`),
                requiredBecause: expectString(explanationRecord.requiredBecause, `rerunPlan.selection.scenarios[${index}].explanations[${explanationIndex}].requiredBecause`),
                fingerprint: expectString(explanationRecord.fingerprint, `rerunPlan.selection.scenarios[${index}].explanations[${explanationIndex}].fingerprint`),
              };
            }),
          };
        }),
        runbooks: expectArray(selection.runbooks ?? [], 'rerunPlan.selection.runbooks').map((entry, index) => {
          const runbook = expectRecord(entry, `rerunPlan.selection.runbooks[${index}]`);
          return {
            name: expectString(runbook.name, `rerunPlan.selection.runbooks[${index}].name`),
            why: expectStringArray(runbook.why ?? [], `rerunPlan.selection.runbooks[${index}].why`),
            explanations: expectArray(runbook.explanations ?? [], `rerunPlan.selection.runbooks[${index}].explanations`).map((explanation, explanationIndex) => {
              const explanationRecord = expectRecord(explanation, `rerunPlan.selection.runbooks[${index}].explanations[${explanationIndex}]`);
              return {
                triggeringChange: expectString(explanationRecord.triggeringChange, `rerunPlan.selection.runbooks[${index}].explanations[${explanationIndex}].triggeringChange`),
                dependencyPath: expectStringArray(explanationRecord.dependencyPath ?? [], `rerunPlan.selection.runbooks[${index}].explanations[${explanationIndex}].dependencyPath`),
                requiredBecause: expectString(explanationRecord.requiredBecause, `rerunPlan.selection.runbooks[${index}].explanations[${explanationIndex}].requiredBecause`),
                fingerprint: expectString(explanationRecord.fingerprint, `rerunPlan.selection.runbooks[${index}].explanations[${explanationIndex}].fingerprint`),
              };
            }),
          };
        }),
        projections: expectArray(selection.projections ?? [], 'rerunPlan.selection.projections').map((entry, index) => {
          const projection = expectRecord(entry, `rerunPlan.selection.projections[${index}]`);
          return {
            name: expectEnum(projection.name, `rerunPlan.selection.projections[${index}].name`, ['emit', 'graph', 'types', 'run'] as const),
            why: expectStringArray(projection.why ?? [], `rerunPlan.selection.projections[${index}].why`),
          };
        }),
        confidenceRecords: expectArray(selection.confidenceRecords ?? [], 'rerunPlan.selection.confidenceRecords').map((entry, index) => {
          const record = expectRecord(entry, `rerunPlan.selection.confidenceRecords[${index}]`);
          return {
            id: expectString(record.id, `rerunPlan.selection.confidenceRecords[${index}].id`),
            why: expectStringArray(record.why ?? [], `rerunPlan.selection.confidenceRecords[${index}].why`),
          };
        }),
      };
    })(),
  };
}

export function validateConfidenceOverlayCatalog(value: unknown) {
  const catalog = expectRecord(value, 'confidenceOverlayCatalog');
  const summary = expectRecord(catalog.summary ?? {}, 'confidenceOverlayCatalog.summary');
  return {
    kind: expectEnum(catalog.kind, 'confidenceOverlayCatalog.kind', ['confidence-overlay-catalog'] as const),
    version: expectNumber(catalog.version, 'confidenceOverlayCatalog.version') as 1,
    generatedAt: expectString(catalog.generatedAt, 'confidenceOverlayCatalog.generatedAt'),
    records: expectArray(catalog.records ?? [], 'confidenceOverlayCatalog.records').map((entry, index) =>
      validateArtifactConfidenceRecord(entry, `confidenceOverlayCatalog.records[${index}]`),
    ),
    summary: {
      total: expectNumber(summary.total, 'confidenceOverlayCatalog.summary.total'),
      approvedEquivalentCount: expectNumber(summary.approvedEquivalentCount, 'confidenceOverlayCatalog.summary.approvedEquivalentCount'),
      needsReviewCount: expectNumber(summary.needsReviewCount, 'confidenceOverlayCatalog.summary.needsReviewCount'),
    },
  };
}

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

export function validateBenchmarkScorecard(value: unknown): BenchmarkScorecard {
  const scorecard = expectRecord(value, 'benchmarkScorecard');
  return {
    kind: expectEnum(scorecard.kind, 'benchmarkScorecard.kind', ['benchmark-scorecard'] as const),
    version: expectNumber(scorecard.version, 'benchmarkScorecard.version') as 1,
    benchmark: expectString(scorecard.benchmark, 'benchmarkScorecard.benchmark'),
    generatedAt: expectString(scorecard.generatedAt, 'benchmarkScorecard.generatedAt'),
    uniqueFieldAwarenessCount: expectNumber(scorecard.uniqueFieldAwarenessCount, 'benchmarkScorecard.uniqueFieldAwarenessCount'),
    firstPassScreenResolutionRate: expectNumber(scorecard.firstPassScreenResolutionRate, 'benchmarkScorecard.firstPassScreenResolutionRate'),
    firstPassElementResolutionRate: expectNumber(scorecard.firstPassElementResolutionRate, 'benchmarkScorecard.firstPassElementResolutionRate'),
    degradedLocatorRate: expectNumber(scorecard.degradedLocatorRate, 'benchmarkScorecard.degradedLocatorRate'),
    reviewRequiredCount: expectNumber(scorecard.reviewRequiredCount, 'benchmarkScorecard.reviewRequiredCount'),
    repairLoopCount: expectNumber(scorecard.repairLoopCount, 'benchmarkScorecard.repairLoopCount'),
    operatorTouchCount: expectNumber(scorecard.operatorTouchCount, 'benchmarkScorecard.operatorTouchCount'),
    knowledgeChurn: Object.fromEntries(
      Object.entries(expectRecord(scorecard.knowledgeChurn ?? {}, 'benchmarkScorecard.knowledgeChurn'))
        .map(([key, entry]) => [key, expectNumber(entry, `benchmarkScorecard.knowledgeChurn.${key}`)]),
    ),
    generatedVariantCount: expectNumber(scorecard.generatedVariantCount, 'benchmarkScorecard.generatedVariantCount'),
    translationHitRate: expectNumber(scorecard.translationHitRate ?? 0, 'benchmarkScorecard.translationHitRate'),
    agenticHitRate: expectNumber(scorecard.agenticHitRate ?? 0, 'benchmarkScorecard.agenticHitRate'),
    approvedEquivalentCount: expectNumber(scorecard.approvedEquivalentCount ?? 0, 'benchmarkScorecard.approvedEquivalentCount'),
    thinKnowledgeScreenCount: expectNumber(scorecard.thinKnowledgeScreenCount ?? 0, 'benchmarkScorecard.thinKnowledgeScreenCount'),
    degradedLocatorHotspotCount: expectNumber(scorecard.degradedLocatorHotspotCount ?? 0, 'benchmarkScorecard.degradedLocatorHotspotCount'),
    overlayChurn: expectNumber(scorecard.overlayChurn ?? 0, 'benchmarkScorecard.overlayChurn'),
    executionTimingTotalsMs: (() => {
      const timing = expectRecord(scorecard.executionTimingTotalsMs ?? {}, 'benchmarkScorecard.executionTimingTotalsMs');
      return {
        setup: expectNumber(timing.setup ?? 0, 'benchmarkScorecard.executionTimingTotalsMs.setup'),
        resolution: expectNumber(timing.resolution ?? 0, 'benchmarkScorecard.executionTimingTotalsMs.resolution'),
        action: expectNumber(timing.action ?? 0, 'benchmarkScorecard.executionTimingTotalsMs.action'),
        assertion: expectNumber(timing.assertion ?? 0, 'benchmarkScorecard.executionTimingTotalsMs.assertion'),
        retries: expectNumber(timing.retries ?? 0, 'benchmarkScorecard.executionTimingTotalsMs.retries'),
        teardown: expectNumber(timing.teardown ?? 0, 'benchmarkScorecard.executionTimingTotalsMs.teardown'),
        total: expectNumber(timing.total ?? 0, 'benchmarkScorecard.executionTimingTotalsMs.total'),
      };
    })(),
    executionCostTotals: (() => {
      const cost = expectRecord(scorecard.executionCostTotals ?? {}, 'benchmarkScorecard.executionCostTotals');
      return {
        instructionCount: expectNumber(cost.instructionCount ?? 0, 'benchmarkScorecard.executionCostTotals.instructionCount'),
        diagnosticCount: expectNumber(cost.diagnosticCount ?? 0, 'benchmarkScorecard.executionCostTotals.diagnosticCount'),
      };
    })(),
    executionFailureFamilies: Object.fromEntries(
      Object.entries(expectRecord(scorecard.executionFailureFamilies ?? {}, 'benchmarkScorecard.executionFailureFamilies'))
        .map(([key, entry]) => [key, expectNumber(entry, `benchmarkScorecard.executionFailureFamilies.${key}`)]),
    ),
    budgetBreachCount: expectNumber(scorecard.budgetBreachCount ?? 0, 'benchmarkScorecard.budgetBreachCount'),
    thresholdStatus: expectEnum(scorecard.thresholdStatus, 'benchmarkScorecard.thresholdStatus', ['pass', 'warn', 'fail'] as const),
  };
}

export function validateDogfoodRun(value: unknown): DogfoodRun {
  const run = expectRecord(value, 'dogfoodRun');
  return {
    kind: expectEnum(run.kind, 'dogfoodRun.kind', ['dogfood-run'] as const),
    version: expectNumber(run.version, 'dogfoodRun.version') as 1,
    benchmark: expectString(run.benchmark, 'dogfoodRun.benchmark'),
    runId: expectString(run.runId, 'dogfoodRun.runId'),
    executedAt: expectString(run.executedAt, 'dogfoodRun.executedAt'),
    posture: (() => {
      const posture = expectRecord(run.posture ?? {}, 'dogfoodRun.posture');
      return {
        interpreterMode: expectEnum(posture.interpreterMode, 'dogfoodRun.posture.interpreterMode', ['playwright', 'dry-run', 'diagnostic'] as const),
        writeMode: expectEnum(posture.writeMode, 'dogfoodRun.posture.writeMode', ['persist', 'no-write'] as const),
        headed: expectBoolean(posture.headed, 'dogfoodRun.posture.headed'),
        executionProfile: expectEnum(posture.executionProfile ?? 'interactive', 'dogfoodRun.posture.executionProfile', executionProfiles),
      };
    })(),
    runbooks: expectStringArray(run.runbooks ?? [], 'dogfoodRun.runbooks'),
    scenarioIds: expectIdArray(run.scenarioIds ?? [], 'dogfoodRun.scenarioIds', createAdoId),
    driftEventIds: expectStringArray(run.driftEventIds ?? [], 'dogfoodRun.driftEventIds'),
    scorecard: validateBenchmarkScorecard(run.scorecard),
    nextCommands: expectStringArray(run.nextCommands ?? [], 'dogfoodRun.nextCommands'),
  };
}




